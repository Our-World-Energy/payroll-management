"use server";

import { createClient } from "@supabase/supabase-js";

const TABLE = "holidays";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type Holiday = {
  id: string;
  name: string;
  country: string;
  date: string; // YYYY-MM-DD
};

function toHoliday(row: Record<string, unknown>): Holiday {
  return {
    id:      String(row.id      ?? ""),
    name:    String(row.name    ?? ""),
    country: String(row.country ?? ""),
    date:    String(row.date    ?? "").slice(0, 10),
  };
}

export async function fetchHolidays(): Promise<Holiday[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .order("date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toHoliday);
}

export async function createHoliday(holiday: Omit<Holiday, "id">): Promise<Holiday> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .insert({ id: crypto.randomUUID(), name: holiday.name, country: holiday.country, date: holiday.date })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toHoliday(data);
}

export async function deleteHoliday(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateHoliday(holiday: Holiday): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from(TABLE)
    .update({ name: holiday.name, country: holiday.country, date: holiday.date })
    .eq("id", holiday.id);
  if (error) throw new Error(error.message);
}
