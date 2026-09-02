import { prisma } from "@/lib/prisma";
import { datesBetween } from "@/lib/weekUtils";
import { effectiveShiftOn, sortSchedulesNewestFirst, type ShiftScheduleDay } from "@/app/admin/contractors/shiftScheduleShared";

/**
 * Shift windows in effect for Shifting Schedule contractors, for one day or a
 * date range.
 *
 *   GET /api/attendance/shift-schedule?date=2026-09-02
 *   GET /api/attendance/shift-schedule?from=2026-08-30&to=2026-09-05
 *
 * Saved rows are effective-from markers, not single-day overrides: a window
 * carries forward until a later row supersedes it. This route resolves that and
 * returns one entry per (contractor, date) actually covered, so callers can keep
 * doing a plain lookup by date.
 *
 * Feeds the client-side late checks (Dashboard "Late Today", NotificationBell),
 * which read contractors through fetchAllContractors and so can't reach
 * contractor_shift_schedule directly.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Guards the fan-out: contractors × dates entries are produced, and the callers
// ask for a single day or a week.
const MAX_RANGE_DAYS = 31;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const from = searchParams.get("from") ?? date;
  const to = searchParams.get("to") ?? date;

  if (!from || !to) {
    return Response.json({ error: "Missing date (or from/to)." }, { status: 400 });
  }
  if (from > to) {
    return Response.json({ error: "`from` must be on or before `to`." }, { status: 400 });
  }

  const dates = datesBetween(from, to);
  if (dates.length > MAX_RANGE_DAYS) {
    return Response.json({ error: `Range too long — ${MAX_RANGE_DAYS} days maximum.` }, { status: 400 });
  }

  // Deliberately not bounded below by `from`: the row in force inside the range
  // may have been saved long before it. One row per change keeps this small.
  const rows = await prisma.contractorShiftSchedule.findMany({
    where: { date: { lte: new Date(`${to}T00:00:00.000Z`) } },
    select: { email: true, date: true, shiftStart: true, shiftEnd: true },
  });

  const byEmail = new Map<string, ShiftScheduleDay[]>();
  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    if (!email) continue;
    const list = byEmail.get(email) ?? [];
    list.push({ date: row.date.toISOString().slice(0, 10), shiftStart: row.shiftStart, shiftEnd: row.shiftEnd });
    byEmail.set(email, list);
  }

  const schedules: { email: string; date: string; shiftStart: string; shiftEnd: string }[] = [];
  for (const [email, list] of byEmail) {
    const newestFirst = sortSchedulesNewestFirst(list);
    for (const dateIso of dates) {
      const effective = effectiveShiftOn(newestFirst, dateIso);
      // No row on or before this date means the contractor had no window yet,
      // which is not the same as having one — so the date is simply omitted.
      if (!effective) continue;
      schedules.push({ email, date: dateIso, shiftStart: effective.shiftStart, shiftEnd: effective.shiftEnd });
    }
  }

  return Response.json({ from, to, schedules });
}
