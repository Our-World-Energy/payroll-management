import { prisma } from "@/lib/prisma";

/**
 * Per-date shift windows for Shifting Schedule contractors, for one day or a
 * date range.
 *
 *   GET /api/attendance/shift-schedule?date=2026-08-26
 *   GET /api/attendance/shift-schedule?from=2026-08-23&to=2026-08-29
 *
 * Feeds the client-side late checks (Dashboard "Late Today", NotificationBell),
 * which read contractors through fetchAllContractors and so can't reach
 * contractor_shift_schedule directly.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const from = searchParams.get("from") ?? date;
  const to = searchParams.get("to") ?? date;

  if (!from || !to) {
    return Response.json({ error: "Missing date (or from/to)." }, { status: 400 });
  }

  const schedules = await prisma.contractorShiftSchedule.findMany({
    where: {
      date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
    },
    select: { email: true, date: true, shiftStart: true, shiftEnd: true },
  });

  return Response.json({
    from,
    to,
    schedules: schedules.map((s) => ({
      email: s.email,
      date: s.date.toISOString().slice(0, 10),
      shiftStart: s.shiftStart,
      shiftEnd: s.shiftEnd,
    })),
  });
}
