"use server";

import { createClient } from "@supabase/supabase-js";
import { addDaysIso } from "@/lib/weekUtils";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const TABLE = "fixed_time";

export type FixedTimeEntry = { name: string; email: string; regularTime: number | null };

// Fixed-Mex only — an admin-entered standard weekly time (Regular Time, in
// minutes) for a contractor + week, set via the "Fixed Time" button on
// Attendance Management. Keyed by email + week_start (the week's Sunday,
// "YYYY-MM-DD"); week_end (Saturday) is stored alongside it for reference.
// This table predates this app's Prisma-managed tables and has no primary
// key or unique constraint, so it's queried directly via Supabase (not
// Prisma Client) and upserts are done by hand — select, then update or insert.
export async function fetchFixedTimeForWeek(weekStart: string): Promise<Record<string, number>> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select("email, regular_time").eq("week_start", weekStart);
  if (error) throw new Error(error.message);

  const byEmail: Record<string, number> = {};
  for (const row of data ?? []) {
    const email = String(row.email ?? "").trim().toLowerCase();
    if (email && row.regular_time != null) byEmail[email] = Number(row.regular_time);
  }
  return byEmail;
}

// A blank/null regularTime deletes the row for that contractor/week instead
// of storing a null — clearing the field means "no fixed time set", not
// "fixed time is 0".
export async function saveFixedTime(weekStart: string, entry: FixedTimeEntry): Promise<void> {
  const sb = getSupabase();
  const email = entry.email.trim().toLowerCase();
  const weekEnd = addDaysIso(weekStart, 6);

  if (entry.regularTime == null) {
    const { error } = await sb.from(TABLE).delete().eq("email", email).eq("week_start", weekStart);
    if (error) throw new Error(error.message);
    return;
  }

  const { data: existing, error: lookupErr } = await sb
    .from(TABLE)
    .select("email")
    .eq("email", email)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (lookupErr) throw new Error(lookupErr.message);

  const { error } = existing
    ? await sb.from(TABLE).update({ Name: entry.name, regular_time: entry.regularTime, week_end: weekEnd }).eq("email", email).eq("week_start", weekStart)
    : await sb.from(TABLE).insert({ Name: entry.name, email, regular_time: entry.regularTime, week_start: weekStart, week_end: weekEnd });
  if (error) throw new Error(error.message);
}
