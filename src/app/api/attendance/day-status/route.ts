import { prisma } from "@/lib/prisma";

/**
 * Per-day editor data for one employee's Sun→Sat week: for each of the 7 days,
 * the actual logged minutes plus the saved time-off status / manual adjustment.
 * Feeds the Action popup's per-day editor.
 *
 *   GET /api/attendance/day-status?userId=1051389&week=2026-05-31
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = Number(url.searchParams.get("userId"));
  const week = url.searchParams.get("week");
  if (!userId || !week) {
    return Response.json({ error: "userId and week are required" }, { status: 400 });
  }

  const weekStart = new Date(`${week}T00:00:00.000Z`);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(toISODate(d));
  }

  const [entries, statuses, weekStatus] = await Promise.all([
    prisma.worksnapEntry.findMany({
      where: { worksnapUserId: userId, entryDate: { gte: weekStart, lte: weekEnd } },
      select: { entryDate: true, durationMins: true },
    }),
    prisma.attendanceDayStatus.findMany({
      where: { worksnapUserId: userId, date: { gte: weekStart, lte: weekEnd } },
      select: {
        date: true,
        decisionStatus: true,
        evaluatedMinutes: true,
        adjustedMinutes: true,
        holidayMinutes: true,
        timeOffStatus: true,
        timeOffMinutes: true,
        manualAdjustmentTime: true,
        note: true,
      },
    }),
    prisma.attendanceWeekStatus.findUnique({
      where: { attendance_week_key: { worksnapUserId: userId, weekStart } },
      select: { requestStatus: true },
    }),
  ]);

  const actualByDate = new Map<string, number>();
  for (const e of entries) {
    const d = toISODate(e.entryDate);
    actualByDate.set(d, (actualByDate.get(d) ?? 0) + e.durationMins);
  }
  const statusByDate = new Map(statuses.map((s) => [toISODate(s.date), s]));

  // decisionStatus/timeOffStatus are `null` (not "NOT_SET") when no row exists yet
  // for that date, so the caller can tell "never reviewed" apart from "explicitly
  // set back to No Status / No Time Off" and keep its own smart defaults for the former.
  const days = dates.map((d) => {
    const st = statusByDate.get(d);
    return {
      date: d,
      actualMins: actualByDate.get(d) ?? 0,
      decisionStatus: st?.decisionStatus ?? null,
      evaluatedMinutes: st?.evaluatedMinutes ?? 0,
      adjustedMinutes: st?.adjustedMinutes ?? null,
      holidayMinutes: st?.holidayMinutes ?? 0,
      timeOffStatus: st?.timeOffStatus ?? null,
      timeOffMinutes: st?.timeOffMinutes ?? 0,
      manualAdjustmentTime: st?.manualAdjustmentTime ?? 0,
      note: st?.note ?? "",
    };
  });

  return Response.json({ userId, week, requestStatus: weekStatus?.requestStatus ?? "NOT_SET", days });
}
