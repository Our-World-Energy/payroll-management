import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("holidays")
    .select("id, name, country, date")
    .order("date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ holidays: data ?? [] });
}

export async function POST(request: Request) {
  const { name, country, date } = await request.json();
  if (!name || !country || !date) {
    return NextResponse.json({ error: "name, country and date are required." }, { status: 400 });
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from("holidays")
    .insert({ name, country, date })
    .select("id, name, country, date")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ holiday: data });
}
