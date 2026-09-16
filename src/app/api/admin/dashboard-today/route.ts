import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import { sortSchedulesNewestFirst, effectiveShiftOn, type ShiftScheduleDay } from "@/app/admin/contractors/shiftScheduleShared";

/**
 * Everything the admin Dashboard's tiles and its Absent / Late / Time Away
 * lists need for one day, in a single request.
 *
 *   GET /api/admin/dashboard-today?date=2026-09-16
 *
 * `date` is supplied by the caller rather than derived here: the Dashboard
 * works in the browser's local day, and a server-side "today" would disagree
 * with it either side of midnight.
 *
 * Why one route with concurrent Supabase REST reads, rather than the five
 * requests this replaces or one big SQL query — all measured against the live
 * database:
 *
 *   - Prisma's pooled connection costs ~500ms per query here, Supabase REST
 *     ~175ms. The old path's slowest legs were Prisma routes, so transport was
 *     most of the cost, not the work.
 *   - Concurrent Prisma queries barely overlap on that pooled connection
 *     (5 queries: 2,110ms concurrent vs 2,578ms sequential), so folding these
 *     into one Prisma route would have been SLOWER than five parallel
 *     requests. The same six reads over REST take 225ms concurrently against
 *     980ms sequentially — REST calls don't contend, so here one route wins.
 *
 * Untracked contractors ("No Worksnap") are deliberately NOT here: that needs
 * every distinct email in worksnap_daily_log, and REST caps a response at
 * 1,000 rows against the table's 22,758. It stays its own
 * /api/worksnap-coverage request, which answers it with one NOT EXISTS, and it
 * feeds an overlay on a tile rather than the tile itself — so it is fine for it
 * to land after this does.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "Missing or malformed `date` (YYYY-MM-DD)." }, { status: 400 });
  }

  const sb = getSupabase();

  // The admin gate runs alongside the reads rather than before them, so its two
  // auth round trips don't land on top of the query time. A denied caller has
  // cost the server some reads it throws away, and gets nothing back.
  const [denied, entriesRes, logRes, scheduleRes, leaveRes, contractorRes] = await Promise.all([
    requireAdmin(),
    sb.from("worksnap_entries").select("email,durationMins").eq("entryDate", date),
    sb.from("worksnap_daily_log").select("email,firstIn,firstInLogged").eq("entryDate", date),
    // Effective-from markers: a window carries forward until a later row
    // supersedes it, so rows are NOT bounded below by `date`. Resolved with the
    // same shared helpers the standalone route uses, rather than re-expressing
    // that rule here where it could drift.
    sb.from("contractor_shift_schedule").select("email,date,shiftStart,shiftEnd").lte("date", date),
    // Already narrowed to what the Dashboard asks of it — approved, and
    // covering this day. Newest first, matching the order the previous
    // fetch-everything action returned, so the request a contractor with two
    // on one day resolves to is unchanged.
    sb.from("contractor_leave_requests")
      .select("email,type,startDate,endDate,createdAt")
      .eq("status", "Approved").lte("startDate", date).gte("endDate", date)
      .order("createdAt", { ascending: false }),
    sb.from("contractor_profiles")
      .select("email,fullName,department,location,status,shiftType,shiftHours")
      .eq("status", "Active"),
  ]);
  if (denied) return denied;

  const minutesByEmail: Record<string, number> = {};
  for (const e of entriesRes.data ?? []) {
    const email = norm(e.email);
    if (email) minutesByEmail[email] = (minutesByEmail[email] ?? 0) + Number(e.durationMins ?? 0);
  }

  // firstInLogged is the real clock-in instant; firstIn is the rounded Worksnap
  // bucket boundary and reads a few minutes early, so it is only a fallback for
  // the tail of rows that carry no logged instant. Same rule as before.
  const firstInByEmail: Record<string, string> = {};
  for (const l of logRes.data ?? []) {
    const email = norm(l.email);
    const logged = l.firstInLogged ?? l.firstIn;
    if (email && logged) firstInByEmail[email] = new Date(logged as string).toISOString();
  }

  const scheduleByEmail = new Map<string, ShiftScheduleDay[]>();
  for (const row of scheduleRes.data ?? []) {
    const email = norm(row.email);
    if (!email) continue;
    const list = scheduleByEmail.get(email) ?? [];
    list.push({
      date: String(row.date).slice(0, 10),
      shiftStart: String(row.shiftStart ?? ""),
      shiftEnd: String(row.shiftEnd ?? ""),
    });
    scheduleByEmail.set(email, list);
  }
  const shiftStartByEmail: Record<string, string> = {};
  for (const [email, rows] of scheduleByEmail) {
    const inEffect = effectiveShiftOn(sortSchedulesNewestFirst(rows), date);
    if (inEffect?.shiftStart) shiftStartByEmail[email] = inEffect.shiftStart;
  }

  return Response.json({
    contractors: (contractorRes.data ?? []).map((c) => ({
      email:      String(c.email ?? ""),
      fullName:   String(c.fullName ?? ""),
      department: String(c.department ?? ""),
      location:   String(c.location ?? ""),
      status:     String(c.status ?? ""),
      shiftType:  String(c.shiftType ?? ""),
      shiftHours: String(c.shiftHours ?? ""),
    })),
    minutesByEmail,
    firstInByEmail,
    shiftStartByEmail,
    leaveToday: (leaveRes.data ?? []).map((r) => ({ email: norm(r.email), type: String(r.type ?? "") })),
  });
}
