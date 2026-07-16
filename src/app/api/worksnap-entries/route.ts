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

  const { data: contractorProfiles, error: contractorError } = emails.length
    ? await supabase
      .from("contractor_profiles")
      .select("email,department,restDay,location,shiftType,payCategory")
      .in("email", emails)
    : { data: [], error: null };

  if (contractorError) {
    return NextResponse.json({ error: contractorError.message }, { status: 500 });
  }

  const profilesByEmail = new Map((contractorProfiles ?? []).map((profile) => [
    String(profile.email ?? "").trim().toLowerCase(),
    { department: String(profile.department ?? ""), restDay: String(profile.restDay ?? ""), location: String(profile.location ?? ""), shiftType: String(profile.shiftType ?? ""), payCategory: String(profile.payCategory ?? "") },
  ]));

  const entries = data.map((entry) => {
    const profile = profilesByEmail.get(String(entry.email ?? "").trim().toLowerCase());
    return {
      ...entry,
      department: profile?.department ?? "",
      restDay: profile?.restDay ?? "",
      location: profile?.location ?? "",
      shiftType: profile?.shiftType ?? "",
      payCategory: profile?.payCategory ?? "",
    };
  });

  return NextResponse.json({ entries, lastSyncedAt: latestSyncResult.data?.syncedAt ?? null });
}
