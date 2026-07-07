// @ts-nocheck
import { prisma } from "@/lib/prisma";

/**
 * Per-user task × date breakdown for one Sun→Sat week, from `worksnap_entries`.
 * Shows how each day's minutes are composed (which tasks / breaks / meetings).
 *
 *   GET /api/attendance/user-breakdown?userId=1051389&week=2026-05-31
 *
 * `week` is the week start (Sunday). Keyed on worksnapUserId so users without a
 * mapped email still resolve.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type TaskRow = {
  projectName: string;
  taskName: string;
  category: string;
  perDay: Record<string, number>;
  total: number;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = Number(url.searchParams.get("userId"));
  const week = url.searchParams.get("week");

  if (!userId || !week) {
    return Response.json({ error: "userId and week are required" }, { status: 400 });
  }

  const weekStart = new Date(`${week}T00:00:00.000Z`);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6); // Saturday

  // the 7 day columns, Sun → Sat
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    days.push(toISODate(d));
  }

  const entries = await prisma.worksnapEntry.findMany({
    where: { worksnapUserId: userId, entryDate: { gte: weekStart, lte: weekEnd } },
    select: {
      userName: true,
      email: true,
      projectName: true,
      taskName: true,
      category: true,
      entryDate: true,
      durationMins: true,
    },
  });

  let userName = "";
  let email = "";
  const taskMap = new Map<string, TaskRow>();
  const dailyTotals: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
  let grandTotal = 0;

  for (const e of entries) {
    userName = e.userName || userName;
    email = e.email || email;
    const date = toISODate(e.entryDate);
    const key = `${e.projectName}||${e.taskName}||${e.category}`;
    let row = taskMap.get(key);
    if (!row) {
      row = { projectName: e.projectName, taskName: e.taskName, category: e.category, perDay: {}, total: 0 };
      taskMap.set(key, row);
    }
    row.perDay[date] = (row.perDay[date] ?? 0) + e.durationMins;
    row.total += e.durationMins;
    if (date in dailyTotals) dailyTotals[date] += e.durationMins;
    grandTotal += e.durationMins;
  }

  const tasks = [...taskMap.values()].sort((a, b) => b.total - a.total);

  // per-day manual adjustment + time off (from the per-day status rows)
  const TIME_OFF_MINUTES: Record<string, number> = {
    HO_HOLIDAY: 480, PTO: 480, PTO_HALF_DAY: 240, SICK_LEAVE_HALF_DAY: 240, OPEN: 0, NOT_SET: 0,
  };
  const dayStatuses = await prisma.attendanceDayStatus.findMany({
    where: { worksnapUserId: userId, date: { gte: weekStart, lte: weekEnd } },
    select: { date: true, timeOffStatus: true, manualAdjustmentTime: true },
  });
  const adjustments: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
  const timeOff: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
  const timeOffStatusByDate: Record<string, string> = {};
  for (const s of dayStatuses) {
    const d = toISODate(s.date);
    if (d in adjustments) adjustments[d] += s.manualAdjustmentTime;
    if (d in timeOff) timeOff[d] += TIME_OFF_MINUTES[s.timeOffStatus] ?? 0;
    if (s.timeOffStatus !== "NOT_SET") timeOffStatusByDate[d] = s.timeOffStatus;
  }

  // per-day first clock-in / last clock-out (AZ time), from worksnap_daily_log
  const dailyLogs = await prisma.worksnapDailyLog.findMany({
    where: { worksnapUserId: userId, entryDate: { gte: weekStart, lte: weekEnd } },
    select: { entryDate: true, firstIn: true, lastOut: true },
  });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Phoenix",
    });
  const firstIn: Record<string, string> = {};
  const lastOut: Record<string, string> = {};
  for (const l of dailyLogs) {
    const d = toISODate(l.entryDate);
    firstIn[d] = fmtTime(l.firstIn);
    lastOut[d] = fmtTime(l.lastOut);
  }

  return Response.json({ userId, userName, email, week, days, tasks, dailyTotals, grandTotal, adjustments, timeOff, timeOffStatusByDate, firstIn, lastOut });
}
