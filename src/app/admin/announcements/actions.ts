"use server";

import { createClient } from "@supabase/supabase-js";

const TABLE = "announcements";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type Announcement = {
  id: string;
  title: string;
  body: string;
  location: string;
  date: string; // YYYY-MM-DD
};

function toAnnouncement(row: Record<string, unknown>): Announcement {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    location: String(row.location ?? ""),
    date: String(row.date ?? "").slice(0, 10),
  };
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toAnnouncement);
}

export async function createAnnouncement(a: Omit<Announcement, "id">): Promise<Announcement> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .insert({
      id: crypto.randomUUID(),
      title: a.title,
      body: a.body,
      location: a.location,
      date: a.date,
      updatedAt: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toAnnouncement(data);
}

export async function updateAnnouncement(a: Announcement): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from(TABLE)
    .update({ title: a.title, body: a.body, location: a.location, date: a.date, updatedAt: new Date().toISOString() })
    .eq("id", a.id);
  if (error) throw new Error(error.message);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
