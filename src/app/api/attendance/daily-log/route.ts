import { prisma } from "@/lib/prisma";

/**
 * Per-employee first-clock-in / last-clock-out from `worksnap_daily_log`,
 * for either one calendar day or a date range.
 *
 *   GET /api/attendance/daily-log?date=2026-07-08
 *   GET /api/attendance/daily-log?from=2026-07-05&to=2026-07-11&userId=1029836
 *
 * Feeds the Dashboard's "Late Today" check (bulk, no userId) and the
 * Attendance Review modal's "Local HO Time" calculation (single user, week
 * range) — the latter needs raw instants (not the Arizona-formatted strings
 * `/api/attendance/user-breakdown` returns) to do its own time zone math.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const from = searchParams.get("from") ?? date;
  const to = searchParams.get("to") ?? date;
  const userId = searchParams.get("userId");
  const email = searchParams.get("email");

  if (!from || !to) {
    return Response.json({ error: "Missing date (or from/to)." }, { status: 400 });
  }

  const where: {
    entryDate: { gte: Date; lte: Date };
    worksnapUserId?: number;
    email?: { equals: string; mode: "insensitive" };
  } = {
    entryDate: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
  };
  // Scope by worksnapUserId when known; otherwise by email — contractor_profiles
  // .worksnapId is frequently blank, but worksnap_daily_log.email is populated
  // (and indexed on [email, entryDate]), so email is the reliable key for the
  // contractor-facing view.
  if (userId) where.worksnapUserId = Number(userId);
  else if (email) where.email = { equals: email, mode: "insensitive" };

  const logs = await prisma.worksnapDailyLog.findMany({
    where,
    select: { worksnapUserId: true, email: true, entryDate: true, firstIn: true, lastOut: true, totalMins: true },
  });

  return Response.json({ from, to, logs });
}
