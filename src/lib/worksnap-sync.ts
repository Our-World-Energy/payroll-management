// @ts-nocheck
import { prisma } from "@/lib/prisma";

const BASE = "https://api.worksnaps.com/api";
const TZ_OFFSET = -7;
const WINDOW_DAYS = 14;

const PRUNE_WEEKLY_TASK = `
DELETE FROM worksnap_weekly_task
WHERE "weekStart" >= ($1::date - (extract(dow from $1::date)::int) * interval '1 day')::date;
`;

const REFRESH_WEEKLY_TASK = `
INSERT INTO worksnap_weekly_task
  ("id","worksnapUserId","email","userName","weekStart","projectId","projectName",
   "taskId","taskName","category","totalMins","daysLogged","syncedAt")
SELECT gen_random_uuid(),
       "worksnapUserId",
       max(email),
       max("userName"),
       ("entryDate" - (extract(dow from "entryDate")::int) * interval '1 day')::date,
       "projectId",
       max("projectName"),
       "taskId",
       max("taskName"),
       max(category),
       coalesce(sum("durationMins"), 0),
       count(DISTINCT "entryDate"),
       now()
FROM worksnap_entries
WHERE "entryDate" >= ($1::date - (extract(dow from $1::date)::int) * interval '1 day')::date
GROUP BY "worksnapUserId",
         ("entryDate" - (extract(dow from "entryDate")::int) * interval '1 day')::date,
         "projectId", "taskId";
`;

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
function field(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1].trim()) : "";
}
function blocks(xml: string, name: string): string[] {
  return xml.match(new RegExp(`<${name}>[\\s\\S]*?</${name}>`, "g")) ?? [];
}

function authHeader(): string {
  const token = process.env.WORKSNAP_API_TOKEN;
  if (!token) throw new Error("WORKSNAP_API_TOKEN is not set");
  return "Basic " + Buffer.from(`${token}:x`).toString("base64");
}

async function ws(path: string): Promise<string> {
  const res = await fetch(BASE + path, {
    headers: { Authorization: authHeader(), Accept: "application/xml" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Worksnaps ${res.status} on ${path}`);
  return res.text();
}

function categorize(taskName: string): string {
  const n = (taskName || "").toLowerCase();
  if (n.includes("break") || n.includes("lunch")) return "Break";
  if (n.includes("meeting") || n.includes("training")) return "Meeting/Training";
  return "Work";
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Local (TZ_OFFSET) midnight of a YYYY-MM-DD date, expressed as UTC unix seconds.
function unixOfLocalDateStart(dateStr: string): number {
  return Date.parse(`${dateStr}T00:00:00.000Z`) / 1000 - TZ_OFFSET * 3600;
}
// Local (TZ_OFFSET) calendar date of a UTC unix-second timestamp.
function localDateOf(ts: number): string {
  return new Date((ts + TZ_OFFSET * 3600) * 1000).toISOString().slice(0, 10);
}

type Row = {
  worksnapUserId: number;
  email: string;
  userName: string;
  projectId: number;
  projectName: string;
  taskId: number;
  taskName: string;
  category: string;
  type: string;
  entryDate: Date;
  durationMins: number;
};

async function buildRows(fromDate: string, toDate: string): Promise<Row[]> {
  const usersXml = await ws("/users.xml");
  const emailById = new Map<string, string>();
  for (const u of blocks(usersXml, "user")) {
    const id = field(u, "id");
    if (id) emailById.set(id, field(u, "email").toLowerCase());
  }

  const report = await ws(
    `/summary_reports.xml?name=manager_report&from_date=${fromDate}` +
      `&to_date=${toDate}&timezone_offset=${TZ_OFFSET}`,
  );
  const items = blocks(report, "line_item");

  const pids = [...new Set(items.map((li) => field(li, "project_id")))];
  const taskNameByKey = new Map<string, string>();
  await Promise.all(
    pids.map(async (pid) => {
      try {
        const tx = await ws(`/projects/${pid}/tasks.xml`);
        for (const t of blocks(tx, "task")) {
          taskNameByKey.set(`${pid}:${field(t, "id")}`, field(t, "name"));
        }
      } catch {
        /* leave names blank if tasks can't be read */
      }
    }),
  );

  const agg = new Map<string, Row>();
  for (const li of items) {
    const uid = field(li, "project_id") ? field(li, "user_id") : "";
    if (!uid) continue;
    const pid = field(li, "project_id");
    const tid = field(li, "task_id") || "0";
    const type = field(li, "type") || "online";
    const date = field(li, "date");
    const mins = Math.round(parseFloat(field(li, "duration_in_minutes") || "0"));
    const tname = taskNameByKey.get(`${pid}:${tid}`) || field(li, "task_name");
    const key = `${uid}|${pid}|${tid}|${date}|${type}`;
    const existing = agg.get(key);
    if (existing) {
      existing.durationMins += mins;
    } else {
      agg.set(key, {
        worksnapUserId: Number(uid),
        email: emailById.get(uid) ?? "",
        userName: field(li, "user_name"),
        projectId: Number(pid),
        projectName: field(li, "project_name"),
        taskId: Number(tid),
        taskName: tname,
        category: categorize(tname),
        type,
        entryDate: new Date(`${date}T00:00:00.000Z`),
        durationMins: mins,
      });
    }
  }
  return [...agg.values()];
}

type DailyLog = {
  worksnapUserId: number;
  email: string;
  userName: string;
  entryDate: Date;
  firstIn: Date;
  lastOut: Date;
  totalMins: number;
  entries: number;
};

// Per-user per-local-day first clock-in / last clock-out, from raw time entries.
// The manager_report only carries date-level durations, so we read the granular
// /projects/{id}/time_entries.xml endpoint (each entry has a from_timestamp).
async function buildDailyLogs(
  projectIds: number[],
  userMeta: Map<number, { email: string; userName: string }>,
  fromTs: number,
  toTs: number,
): Promise<DailyLog[]> {
  const userIds = [...userMeta.keys()].join(",");
  if (!userIds || projectIds.length === 0) return [];

  type Acc = { start: number; end: number; mins: number; count: number };
  const agg = new Map<string, Acc>();

  await Promise.all(
    projectIds.map(async (pid) => {
      let xml: string;
      try {
        xml = await ws(
          `/projects/${pid}/time_entries.xml?user_ids=${userIds}` +
            `&from_timestamp=${fromTs}&to_timestamp=${toTs}`,
        );
      } catch {
        return; // skip projects whose entries can't be read
      }
      for (const te of blocks(xml, "time_entry")) {
        const uid = field(te, "user_id");
        const startTs = Number(field(te, "from_timestamp"));
        if (!uid || !startTs) continue;
        const mins = Math.round(
          parseFloat(field(te, "duration_in_minutes") || "0"),
        );
        const endTs = startTs + mins * 60;
        const key = `${uid}|${localDateOf(startTs)}`;
        const cur = agg.get(key);
        if (cur) {
          if (startTs < cur.start) cur.start = startTs;
          if (endTs > cur.end) cur.end = endTs;
          cur.mins += mins;
          cur.count += 1;
        } else {
          agg.set(key, { start: startTs, end: endTs, mins, count: 1 });
        }
      }
    }),
  );

  const out: DailyLog[] = [];
  for (const [key, a] of agg) {
    const [uidStr, dateStr] = key.split("|");
    const uid = Number(uidStr);
    const meta = userMeta.get(uid) ?? { email: "", userName: "" };
    out.push({
      worksnapUserId: uid,
      email: meta.email,
      userName: meta.userName,
      entryDate: new Date(`${dateStr}T00:00:00.000Z`),
      firstIn: new Date(a.start * 1000),
      lastOut: new Date(a.end * 1000),
      totalMins: a.mins,
      entries: a.count,
    });
  }
  return out;
}

export async function runWorksnapSync() {
  const fromDate = isoDaysAgo(WINDOW_DAYS - 1);
  const toDate = isoDaysAgo(0);

  const rows = await buildRows(fromDate, toDate);

  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  await prisma.worksnapEntry.deleteMany({
    where: { entryDate: { gte: from, lte: to } },
  });

  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.worksnapEntry.createMany({
      data: rows.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
  }

  await prisma.$executeRawUnsafe(PRUNE_WEEKLY_TASK, fromDate);
  await prisma.$executeRawUnsafe(REFRESH_WEEKLY_TASK, fromDate);

  // Daily first-in / last-out, derived from granular time entries.
  const projectIds = [...new Set(rows.map((r) => r.projectId))];
  const userMeta = new Map<number, { email: string; userName: string }>();
  for (const r of rows) {
    if (!userMeta.has(r.worksnapUserId)) {
      userMeta.set(r.worksnapUserId, { email: r.email, userName: r.userName });
    }
  }
  const dailyLogs = await buildDailyLogs(
    projectIds,
    userMeta,
    unixOfLocalDateStart(fromDate),
    unixOfLocalDateStart(toDate) + 86400, // through end of the last local day
  );

  await prisma.worksnapDailyLog.deleteMany({
    where: { entryDate: { gte: from, lte: to } },
  });
  for (let i = 0; i < dailyLogs.length; i += CHUNK) {
    await prisma.worksnapDailyLog.createMany({
      data: dailyLogs.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
  }

  return {
    ok: true as const,
    window: { fromDate, toDate },
    rows: rows.length,
    dailyLogs: dailyLogs.length,
    users: new Set(rows.map((r) => r.worksnapUserId)).size,
    totalMinutes: rows.reduce((s, r) => s + r.durationMins, 0),
    syncedAt: new Date().toISOString(),
  };
}
