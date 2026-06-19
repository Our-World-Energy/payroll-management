// @ts-nocheck
import { prisma } from "@/lib/prisma";

/**
 * Weekly attendance feed (one row per employee for a Sun→Sat week) with the
 * full evaluation model:
 *
 *   worksnap_actual_time    = all logged minutes that week
 *   fixed_evaluated_time    = Σ over days of min(day_actual, 480)   (Fixed: 8h/day cap)
 *   flexible_evaluated_time = min(weekly_actual, target)            (Flexible: weekly pool)
 *   time_off_time           = HO/PTO 480, PTO½/Sick½ 240, else 0
 *   manual_adjustment_time  = admin ± minutes
 *   completion_time         = evaluated(by shift) + time_off + manual_adjustment
 *   status                  = completion vs target → Met / Short / Over
 *
 * Profile fields (location, shiftType, target, credits) come from `contractors`
 * (joined by email); workflow + adjustment from `attendance_week_status`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXED_DAILY_CAP = 480; // minutes/day for Fixed shifts
const DEFAULT_TARGET = 2400; // weekly target fallback

const TIME_OFF_MINUTES: Record<string, number> = {
  HO_HOLIDAY: 480, PTO: 480, PTO_HALF_DAY: 240, SICK_LEAVE_HALF_DAY: 240, OPEN: 0, NOT_SET: 0,
};

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
  const url = new URL(request.url);
  const weekParam = url.searchParams.get("week");

  const weekRows = await prisma.worksnapWeeklyTask.findMany({
    distinct: ["weekStart"], select: { weekStart: true }, orderBy: { weekStart: "desc" },
  });
  const weeks = weekRows.map((w) => toISODate(w.weekStart));
  if (weeks.length === 0) {
    return Response.json({ weeks: [], week: null, rows: [], departments: [], lastSyncedAt: null });
  }

  const week = weekParam && weeks.includes(weekParam) ? weekParam : weeks[0];
  const weekStart = new Date(`${week}T00:00:00.000Z`);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  const [entries, contractors, statuses, deptRows, agg] = await Promise.all([
    prisma.worksnapEntry.findMany({
      where: { entryDate: { gte: weekStart, lte: weekEnd } },
      select: { worksnapUserId: true, email: true, userName: true, entryDate: true, durationMins: true },
    }),
    prisma.contractor.findMany({
      select: {
        email: true, department: true, location: true, shiftType: true, employmentStatus: true,
        offsetCredits: true, ptoCredits: true, sickLeaveCredits: true, targetMinutes: true,
      },
    }),
    prisma.attendanceWeekStatus.findMany({
      where: { weekStart },
      select: { worksnapUserId: true, requestStatus: true },
    }),
    prisma.contractor.findMany({
      where: { department: { not: null } }, distinct: ["department"],
      select: { department: true }, orderBy: { department: "asc" },
    }),
    prisma.worksnapWeeklyTask.aggregate({ _max: { syncedAt: true } }),
  ]);

  // per-day time-off + manual adjustments for this week, grouped by user
  const dayStatuses = await prisma.attendanceDayStatus.findMany({
    where: { date: { gte: weekStart, lte: weekEnd } },
    select: { worksnapUserId: true, timeOffStatus: true, manualAdjustmentTime: true, note: true },
  });

  const byEmail = new Map(contractors.map((c) => [c.email.toLowerCase(), c]));
  const byUser = new Map(statuses.map((s) => [s.worksnapUserId, s]));
  type DayAgg = { timeOffTime: number; manualAdjustmentTime: number; labels: Set<string>; notes: string[] };
  const dayByUser = new Map<number, DayAgg>();
  for (const ds of dayStatuses) {
    let g = dayByUser.get(ds.worksnapUserId);
    if (!g) { g = { timeOffTime: 0, manualAdjustmentTime: 0, labels: new Set(), notes: [] }; dayByUser.set(ds.worksnapUserId, g); }
    g.timeOffTime += TIME_OFF_MINUTES[ds.timeOffStatus] ?? 0;
    g.manualAdjustmentTime += ds.manualAdjustmentTime;
    if (ds.timeOffStatus !== "NOT_SET" && ds.timeOffStatus !== "OPEN") g.labels.add(ds.timeOffStatus);
    if (ds.note) g.notes.push(ds.note);
  }

  // aggregate detail → weekly total + per-day total per user
  type Acc = { email: string; userName: string; weekly: number; perDay: Map<string, number> };
  const acc = new Map<number, Acc>();
  for (const e of entries) {
    let a = acc.get(e.worksnapUserId);
    if (!a) { a = { email: e.email, userName: e.userName, weekly: 0, perDay: new Map() }; acc.set(e.worksnapUserId, a); }
    a.weekly += e.durationMins;
    const d = toISODate(e.entryDate);
    a.perDay.set(d, (a.perDay.get(d) ?? 0) + e.durationMins);
  }

  const rows = [...acc.entries()].map(([worksnapUserId, a]) => {
    const c = byEmail.get(a.email.toLowerCase());
    const st = byUser.get(worksnapUserId);
    const shiftType = c?.shiftType ?? null;
    const targetTime = c?.targetMinutes ?? DEFAULT_TARGET;

    const dayValues = [...a.perDay.values()];
    const fixedEvaluated = dayValues.reduce((s, m) => s + Math.min(m, FIXED_DAILY_CAP), 0);
    const flexibleEvaluated = Math.min(a.weekly, targetTime);
    const isFixed = (shiftType ?? "").toLowerCase().startsWith("fix");
    const evaluatedTime = isFixed ? fixedEvaluated : flexibleEvaluated;

    // per-day compliance (for Fixed shifts: each logged day must reach 480)
    const daysLogged = dayValues.filter((v) => v > 0).length;
    const daysMet = dayValues.filter((v) => v >= FIXED_DAILY_CAP).length;

    const day = dayByUser.get(worksnapUserId);
    const requestStatus = st?.requestStatus ?? "NOT_SET";
    const timeOffTime = day?.timeOffTime ?? 0;
    const manualAdjustmentTime = day?.manualAdjustmentTime ?? 0;
    const timeOffSummary = day && day.labels.size ? [...day.labels].join(", ") : "";
    const manualAdjustmentNote = day && day.notes.length ? day.notes.join("; ") : "";
    const completionTime = evaluatedTime + timeOffTime + manualAdjustmentTime;

    // Fixed → daily rule (every logged day ≥ 480). Flexible → weekly rule (≥ target).
    const status = isFixed
      ? (daysLogged > 0 && daysMet === daysLogged ? "Met" : "Short")
      : (completionTime > targetTime ? "Over" : completionTime < targetTime ? "Short" : "Met");

    return {
      worksnapUserId,
      email: a.email,
      userName: a.userName,
      location: c?.location ?? null,
      shiftType,
      department: c?.department ?? null,
      employmentStatus: c?.employmentStatus ?? null,
      offsetCredits: c ? Number(c.offsetCredits) : 0,
      ptoCredits: c ? Number(c.ptoCredits) : 0,
      sickLeaveCredits: c ? Number(c.sickLeaveCredits) : 0,
      targetTime,
      isFixed,
      daysLogged,
      daysMet,
      worksnapActual: a.weekly,
      fixedEvaluated,
      flexibleEvaluated,
      manualAdjustmentTime,
      timeOffTime,
      completionTime,
      status,
      timeOffSummary,
      requestStatus,
      manualAdjustmentNote,
    };
  }).sort((x, y) => y.completionTime - x.completionTime);

  const departments = deptRows.map((d) => d.department).filter((d): d is string => !!d);
  const lastSyncedAt = agg._max.syncedAt ? agg._max.syncedAt.toISOString() : null;

  return Response.json({ weeks, week, rows, departments, lastSyncedAt });
  } catch (err) {
    console.error("attendance/weekly failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
