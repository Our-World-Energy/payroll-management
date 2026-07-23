import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { buildAttendanceStatusOps, type AttendanceStatusInput } from "@/lib/attendanceStatusOps";

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
 *               localHoliday?, localHolidayMinutes?,
 *               timeOffStatus?, timeOffMinutes?, manualAdjustmentTime?, note? } ]
 *   }
 *
 * See /api/attendance/status/bulk for saving many contractors' weeks in one request.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: AttendanceStatusInput;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }

  const result = buildAttendanceStatusOps(prisma, body);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  await Promise.all(result.ops);

  const days = Array.isArray(body.days) ? body.days : [];
  return Response.json({ ok: true, savedDays: days.length });
}
