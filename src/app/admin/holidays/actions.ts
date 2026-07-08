"use server";

import { createClient } from "@supabase/supabase-js";
import { timeZoneForCountry, arizonaDateForCountryDate } from "@/lib/countryTimeZones";

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
  timeZone: string | null; // IANA zone for `country`
  arizonaDate: string | null; // ISO local date+time in Arizona for midnight of `date` in `timeZone`
};

function toHoliday(row: Record<string, unknown>): Holiday {
  return {
    id:          String(row.id      ?? ""),
    name:        String(row.name    ?? ""),
    country:     String(row.country ?? ""),
    date:        String(row.date    ?? "").slice(0, 10),
    timeZone:    row.timeZone ? String(row.timeZone) : null,
    arizonaDate: row.arizonaDate ? String(row.arizonaDate) : null,
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

export async function createHoliday(holiday: Omit<Holiday, "id" | "timeZone" | "arizonaDate">): Promise<Holiday> {
  const sb = getSupabase();
  const timeZone = timeZoneForCountry(holiday.country);
  const arizonaDate = arizonaDateForCountryDate(holiday.date, holiday.country);
  const { data, error } = await sb
    .from(TABLE)
    .insert({ id: crypto.randomUUID(), name: holiday.name, country: holiday.country, date: holiday.date, timeZone, arizonaDate })
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

export async function updateHoliday(holiday: Omit<Holiday, "timeZone" | "arizonaDate">): Promise<void> {
  const sb = getSupabase();
  const timeZone = timeZoneForCountry(holiday.country);
  const arizonaDate = arizonaDateForCountryDate(holiday.date, holiday.country);
  const { error } = await sb
    .from(TABLE)
    .update({ name: holiday.name, country: holiday.country, date: holiday.date, timeZone, arizonaDate })
    .eq("id", holiday.id);
  if (error) throw new Error(error.message);
}
