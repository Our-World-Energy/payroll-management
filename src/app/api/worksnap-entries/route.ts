import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from or to date." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server credentials are not configured." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const pageSize = 1000;

  function fetchPage(start: number, end: number) {
    return supabase
      .from("worksnap_entries")
      .select("worksnapUserId,userName,email,durationMins,entryDate")
      .gte("entryDate", from)
      .lte("entryDate", to)
      .range(start, end);
  }

  // syncedAt is independent of the entries themselves, so it's kicked off
  // alongside the first page instead of waiting for all entries to load first.
  const [firstPage, latestSyncResult] = await Promise.all([
    supabase
      .from("worksnap_entries")
      .select("worksnapUserId,userName,email,durationMins,entryDate", { count: "exact" })
      .gte("entryDate", from)
      .lte("entryDate", to)
      .range(0, pageSize - 1),
    supabase
      .from("worksnap_entries")
      .select("syncedAt")
      .order("syncedAt", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (firstPage.error) {
    return NextResponse.json({ error: firstPage.error.message }, { status: 500 });
  }

  const data = [...(firstPage.data ?? [])];
  const total = firstPage.count ?? data.length;

  // Remaining pages (if any) are all independent range reads, so they're
  // fetched concurrently instead of one round trip at a time.
  if (total > pageSize) {
    const remainingPageStarts: number[] = [];
    for (let start = pageSize; start < total; start += pageSize) remainingPageStarts.push(start);

    const remainingPages = await Promise.all(
      remainingPageStarts.map((start) => fetchPage(start, start + pageSize - 1))
    );
    for (const page of remainingPages) {
      if (page.error) return NextResponse.json({ error: page.error.message }, { status: 500 });
      data.push(...(page.data ?? []));
    }
  }

  const emails = Array.from(new Set(data
    .map((entry) => String(entry.email ?? "").trim().toLowerCase())
    .filter(Boolean)));

  // Every Active contractor, not just the ones with entries in this range.
  // Selecting by the entry emails meant a contractor who logged nothing all
  // week had no profile to attach and so produced no row at all — they simply
  // vanished from Attendance for that week, which is exactly the week someone
  // needs to see them.
  const { data: contractorProfiles, error: contractorError } = await supabase
    .from("contractor_profiles")
    .select("email,fullName,status,department,restDay,location,shiftType,shiftHours,payCategory,hireDate");

  if (contractorError) {
    return NextResponse.json({ error: contractorError.message }, { status: 500 });
  }

  const profilesByEmail = new Map((contractorProfiles ?? []).map((profile) => [
    String(profile.email ?? "").trim().toLowerCase(),
    { fullName: String(profile.fullName ?? ""), status: String(profile.status ?? ""), department: String(profile.department ?? ""), restDay: String(profile.restDay ?? ""), location: String(profile.location ?? ""), shiftType: String(profile.shiftType ?? ""), shiftHours: String(profile.shiftHours ?? ""), payCategory: String(profile.payCategory ?? ""), hireDate: String(profile.hireDate ?? "") },
  ]));

  const entries = data.map((entry) => {
    const profile = profilesByEmail.get(String(entry.email ?? "").trim().toLowerCase());
    return {
      ...entry,
      department: profile?.department ?? "",
      restDay: profile?.restDay ?? "",
      location: profile?.location ?? "",
      shiftType: profile?.shiftType ?? "",
      shiftHours: profile?.shiftHours ?? "",
      payCategory: profile?.payCategory ?? "",
      hireDate: profile?.hireDate ?? "",
      hasContractorProfile: profile != null,
    };
  });

  // Contractors with nothing logged in this range, as zero-minute rows so
  // they appear in Attendance alongside everyone else.
  // Active only: a dismissed contractor who logged nothing has no week to
  // show. One who DID log time still appears, because their entries are in the
  // list already and every profile is loaded above for the field lookup.
  const loggedEmails = new Set(emails);
  const missing = Array.from(profilesByEmail.entries())
    .filter(([email, profile]) => !loggedEmails.has(email) && profile.status !== "Dismissed");

  // Their Worksnap id comes from whatever they logged previously, so the row
  // can still be reviewed and processed. Someone who has never logged any time
  // (a Fixed-Mex contractor, say, whose hours come from the Fixed Time button)
  // has none, and the row is display-only — which is correct, as there is no
  // Worksnap week to review.
  const idByEmail = new Map<string, number>();
  if (missing.length) {
    const { data: priorEntries } = await supabase
      .from("worksnap_entries")
      .select("email,worksnapUserId")
      .in("email", missing.map(([email]) => email));
    for (const row of priorEntries ?? []) {
      const email = String(row.email ?? "").trim().toLowerCase();
      if (email && row.worksnapUserId != null && !idByEmail.has(email)) {
        idByEmail.set(email, Number(row.worksnapUserId));
      }
    }
  }

  // entryDate is left null on purpose: a date would add a 0 to that day's
  // minutes, where the intent is a contractor with no logged days at all.
  const zeroRows = missing.map(([email, profile]) => ({
    worksnapUserId: idByEmail.get(email) ?? null,
    userName: profile.fullName || email,
    email,
    durationMins: 0,
    entryDate: null,
    department: profile.department,
    restDay: profile.restDay,
    location: profile.location,
    shiftType: profile.shiftType,
    shiftHours: profile.shiftHours,
    payCategory: profile.payCategory,
    hireDate: profile.hireDate,
    hasContractorProfile: true,
  }));

  return NextResponse.json({
    entries: [...entries, ...zeroRows],
    lastSyncedAt: latestSyncResult.data?.syncedAt ?? null,
  });
}
