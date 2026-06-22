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
  const data = [];
  let page = 0;

  while (true) {
    const start = page * pageSize;
    const end = start + pageSize - 1;
    const { data: pageData, error } = await supabase
      .from("worksnap_entries")
      .select("userName,email,durationMins,entryDate")
      .gte("entryDate", from)
      .lte("entryDate", to)
      .range(start, end);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    data.push(...(pageData ?? []));

    if (!pageData || pageData.length < pageSize) break;
    page += 1;
  }

  const emails = Array.from(new Set(data
    .map((entry) => String(entry.email ?? "").trim().toLowerCase())
    .filter(Boolean)));

  const { data: contractorProfiles, error: contractorError } = emails.length
    ? await supabase
      .from("contractor_profiles")
      .select("email,department,restDay")
      .in("email", emails)
    : { data: [], error: null };

  if (contractorError) {
    return NextResponse.json({ error: contractorError.message }, { status: 500 });
  }

  const profilesByEmail = new Map((contractorProfiles ?? []).map((profile) => [
    String(profile.email ?? "").trim().toLowerCase(),
    { department: String(profile.department ?? ""), restDay: String(profile.restDay ?? "") },
  ]));

  const entries = data.map((entry) => {
    const profile = profilesByEmail.get(String(entry.email ?? "").trim().toLowerCase());
    return {
      ...entry,
      department: profile?.department ?? "",
      restDay: profile?.restDay ?? "",
    };
  });

  return NextResponse.json({ entries });
}
