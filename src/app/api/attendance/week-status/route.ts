import { prisma } from "@/lib/prisma";

/**
 * Bulk per-employee weekly attendance status for one Sun→Sat week — feeds the
 * Attendance Management table so saved completion times / request status
 * survive a reload instead of living only in React state.
 *
 *   GET /api/attendance/week-status?from=2026-06-21&to=2026-06-27
 *
 * Also returns `priorOffsetCredits`: the Fixed-Ind Time Credits granted on the
 * PRECEDING week. A credit tops a short week up to the 2,400-min target and is
 * repaid out of the next week's Ind Time, so the week being viewed needs the
 * previous week's figure to know what it owes. Returned here rather than in a
 * second request so one round trip covers both.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");

  if (!from) {
    return Response.json({ error: "Missing from date." }, { status: 400 });
  }

  const weekStart = new Date(`${from}T00:00:00.000Z`);
  const priorWeekStart = new Date(weekStart.getTime() - WEEK_MS);

  const [rows, priorRows] = await Promise.all([
    prisma.attendanceWeekStatus.findMany({
      where: { weekStart },
      select: {
        worksnapUserId: true, email: true, requestStatus: true, completionMinutes: true, totalLocalHolidayMinutes: true,
        totalEvaluatedRegularMinutes: true, totalEvaluatedMinutes: true, totalUsHoMinutes: true, totalRegularOtMinutes: true, totalRdOtMinutes: true, totalHoOtMinutes: true,
        totalCompletionTimeMinutes: true,
        offsetCreditMinutes: true,
        processed: true,
      },
    }),
    prisma.attendanceWeekStatus.findMany({
      where: { weekStart: priorWeekStart, offsetCreditMinutes: { gt: 0 } },
      select: { worksnapUserId: true, offsetCreditMinutes: true },
    }),
  ]);

  return Response.json({ weekStatuses: rows, priorOffsetCredits: priorRows });
}
