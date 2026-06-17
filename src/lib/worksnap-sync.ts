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

  return {
    ok: true as const,
    window: { fromDate, toDate },
    rows: rows.length,
    users: new Set(rows.map((r) => r.worksnapUserId)).size,
    totalMinutes: rows.reduce((s, r) => s + r.durationMins, 0),
    syncedAt: new Date().toISOString(),
  };
}
