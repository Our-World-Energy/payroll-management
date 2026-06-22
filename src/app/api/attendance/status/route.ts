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
 *     requestStatus?,
 *     days: [ { date: "YYYY-MM-DD", timeOffStatus?, manualAdjustmentTime?, note? } ]
 *   }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIME_OFF = ["HO_HOLIDAY", "PTO", "SICK_LEAVE_HALF_DAY", "PTO_HALF_DAY", "OPEN", "NOT_SET"] as const;
const REQUEST = ["APPROVED", "REJECTED", "OPEN", "NOT_SET"] as const;
type TimeOff = (typeof TIME_OFF)[number];
type Req = (typeof REQUEST)[number];
const asTimeOff = (v: unknown): TimeOff => (TIME_OFF.includes(v as TimeOff) ? (v as TimeOff) : "NOT_SET");
const asReq = (v: unknown): Req => (REQUEST.includes(v as Req) ? (v as Req) : "NOT_SET");

type DayInput = { date?: unknown; timeOffStatus?: unknown; manualAdjustmentTime?: unknown; note?: unknown };

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
  const days = Array.isArray(body.days) ? (body.days as DayInput[]) : [];

  await prisma.$transaction([
    // week-level request status
    prisma.attendanceWeekStatus.upsert({
      where: { attendance_week_key: { worksnapUserId, weekStart } },
      create: { worksnapUserId, email, weekStart, requestStatus },
      update: { email, requestStatus },
    }),
    // per-day time-off + manual adjustment
    ...days
      .filter((d) => typeof d.date === "string")
      .map((d) => {
        const date = new Date(`${d.date as string}T00:00:00.000Z`);
        const timeOffStatus = asTimeOff(d.timeOffStatus);
        const manualAdjustmentTime = Number.isFinite(Number(d.manualAdjustmentTime)) ? Math.trunc(Number(d.manualAdjustmentTime)) : 0;
        const note = typeof d.note === "string" && d.note.trim() ? d.note.trim() : null;
        return prisma.attendanceDayStatus.upsert({
          where: { attendance_day_key: { worksnapUserId, date } },
          create: { worksnapUserId, email, date, timeOffStatus, manualAdjustmentTime, note },
          update: { email, timeOffStatus, manualAdjustmentTime, note },
        });
      }),
  ]);

  return Response.json({ ok: true, savedDays: days.length });
}
