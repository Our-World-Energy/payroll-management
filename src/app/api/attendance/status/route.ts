// @ts-nocheck
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/**
 * Save an employee's attendance edits for a week (admin-only, session + 2FA):
 *   - per-DAY time-off status + manual adjustment (+ note)
 *   - per-WEEK attendance request status
 *
 *   POST /api/attendance/status
 *   body: {
 *     worksnapUserId, email?, week: "YYYY-MM-DD",
 *     requestStatus?, completionMinutes?,
 *     days: [ { date, decisionStatus?, evaluatedMinutes?, adjustedMinutes?, holidayMinutes?,
 *               timeOffStatus?, timeOffMinutes?, manualAdjustmentTime?, note? } ]
 *   }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIME_OFF = ["HO_HOLIDAY", "PTO", "SICK_LEAVE", "SICK_LEAVE_HALF_DAY", "PTO_HALF_DAY", "UNPAID_LEAVE", "OPEN", "NOT_SET"] as const;
const REQUEST = ["APPROVED", "REJECTED", "OPEN", "NOT_SET"] as const;
type TimeOff = (typeof TIME_OFF)[number];
type Req = (typeof REQUEST)[number];
const asTimeOff = (v: unknown): TimeOff => (TIME_OFF.includes(v as TimeOff) ? (v as TimeOff) : "NOT_SET");
const asReq = (v: unknown): Req => (REQUEST.includes(v as Req) ? (v as Req) : "NOT_SET");
const asInt = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : fallback);
const asNullableInt = (v: unknown) => (v == null ? null : Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);

type DayInput = {
  date?: unknown;
  decisionStatus?: unknown;
  evaluatedMinutes?: unknown;
  adjustedMinutes?: unknown;
  holidayMinutes?: unknown;
  timeOffStatus?: unknown;
  timeOffMinutes?: unknown;
  manualAdjustmentTime?: unknown;
  note?: unknown;
};

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }

  const worksnapUserId = Number(body.worksnapUserId);
  const week = typeof body.week === "string" ? body.week : "";
  if (!worksnapUserId || !week) {
    return Response.json({ error: "worksnapUserId and week are required" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email : "";
  const weekStart = new Date(`${week}T00:00:00.000Z`);
  const requestStatus = asReq(body.requestStatus);
  const completionMinutes = Number.isFinite(Number(body.completionMinutes)) ? Math.trunc(Number(body.completionMinutes)) : null;
  const days = Array.isArray(body.days) ? (body.days as DayInput[]) : [];

  await prisma.$transaction([
    // week-level request status + saved completion time
    prisma.attendanceWeekStatus.upsert({
      where: { attendance_week_key: { worksnapUserId, weekStart } },
      create: { worksnapUserId, email, weekStart, requestStatus, completionMinutes },
      update: { email, requestStatus, completionMinutes },
    }),
    // per-day attendance review snapshot
    ...days
      .filter((d) => typeof d.date === "string")
      .map((d) => {
        const date = new Date(`${d.date as string}T00:00:00.000Z`);
        const decisionStatus = asReq(d.decisionStatus);
        const evaluatedMinutes = asInt(d.evaluatedMinutes);
        const adjustedMinutes = asNullableInt(d.adjustedMinutes);
        const holidayMinutes = asInt(d.holidayMinutes);
        const timeOffStatus = asTimeOff(d.timeOffStatus);
        const timeOffMinutes = asInt(d.timeOffMinutes);
        const manualAdjustmentTime = asInt(d.manualAdjustmentTime);
        const note = typeof d.note === "string" && d.note.trim() ? d.note.trim() : null;
        const fields = { email, decisionStatus, evaluatedMinutes, adjustedMinutes, holidayMinutes, timeOffStatus, timeOffMinutes, manualAdjustmentTime, note };
        return prisma.attendanceDayStatus.upsert({
          where: { attendance_day_key: { worksnapUserId, date } },
          create: { worksnapUserId, date, ...fields },
          update: fields,
        });
      }),
  ]);

  return Response.json({ ok: true, savedDays: days.length });
}
