import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { timeZoneForCountry, arizonaDateForCountryDate } from "@/lib/countryTimeZones";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("holidays")
    .select("id, name, country, date, timeZone, arizonaDate")
    .order("date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ holidays: data ?? [] });
}

export async function POST(request: Request) {
  // Same exposure as DELETE on [id]: service-role writes with no caller check.
  const denied = await requireAdmin();
  if (denied) return denied;

  const { name, country, date } = await request.json();
  if (!name || !country || !date) {
    return NextResponse.json({ error: "name, country and date are required." }, { status: 400 });
  }

  const sb = getSupabase();
  const timeZone = timeZoneForCountry(country);
  const arizonaDate = arizonaDateForCountryDate(date, country);
  const { data, error } = await sb
    .from("holidays")
    .insert({ id: crypto.randomUUID(), name, country, date, timeZone, arizonaDate })
    .select("id, name, country, date, timeZone, arizonaDate")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ holiday: data });
}
