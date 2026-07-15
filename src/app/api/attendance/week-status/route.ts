import { prisma } from "@/lib/prisma";

/**
 * Bulk per-employee weekly attendance status for one Sun→Sat week — feeds the
 * Attendance Management table so saved completion times / request status
 * survive a reload instead of living only in React state.
 *
 *   GET /api/attendance/week-status?from=2026-06-21&to=2026-06-27
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");

  if (!from) {
    return Response.json({ error: "Missing from date." }, { status: 400 });
  }

  const weekStart = new Date(`${from}T00:00:00.000Z`);

  const rows = await prisma.attendanceWeekStatus.findMany({
    where: { weekStart },
    select: {
      worksnapUserId: true, email: true, requestStatus: true, completionMinutes: true, totalLocalHolidayMinutes: true,
      totalEvaluatedRegularMinutes: true, totalEvaluatedMinutes: true, totalUsHoMinutes: true, totalRegularOtMinutes: true, totalRdOtMinutes: true, totalHoOtMinutes: true,
    },
  });

  return Response.json({ weekStatuses: rows });
}
