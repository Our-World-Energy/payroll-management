"use server";

import { createClient } from "@supabase/supabase-js";
import { ANNOUNCEMENT_IMAGE } from "@/lib/announcementImage";

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
  /** Uploaded image shown in place of the Dashboard's emoji tile. "" = none. */
  imageUrl: string;
  date: string; // YYYY-MM-DD
};

function toAnnouncement(row: Record<string, unknown>): Announcement {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    location: String(row.location ?? ""),
    imageUrl: String(row.imageUrl ?? ""),
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
      imageUrl: a.imageUrl || null,
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
    .update({ title: a.title, body: a.body, location: a.location, imageUrl: a.imageUrl || null, date: a.date, updatedAt: new Date().toISOString() })
    .eq("id", a.id);
  if (error) throw new Error(error.message);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Stores an announcement image and returns its public URL. Type and size are
 * re-checked here rather than trusted from the browser — the bucket enforces
 * them too, but a clear message beats a raw storage error.
 */
export async function uploadAnnouncementImage(
  form: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No file was selected." };
  if (!(ANNOUNCEMENT_IMAGE.formats as readonly string[]).includes(file.type)) {
    return { ok: false, error: `Unsupported format. Use ${ANNOUNCEMENT_IMAGE.formatLabel}.` };
  }
  if (file.size > ANNOUNCEMENT_IMAGE.maxBytes) {
    return { ok: false, error: `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${ANNOUNCEMENT_IMAGE.maxLabel}.` };
  }

  const sb = getSupabase();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage
    .from(ANNOUNCEMENT_IMAGE.bucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { ok: false, error: error.message };

  const { data } = sb.storage.from(ANNOUNCEMENT_IMAGE.bucket).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

/** Deletes a stored image by its public URL. Silent on anything unparseable. */
export async function removeAnnouncementImage(url: string): Promise<void> {
  const marker = `/${ANNOUNCEMENT_IMAGE.bucket}/`;
  const at = url.indexOf(marker);
  if (at === -1) return;
  const path = url.slice(at + marker.length);
  if (!path) return;
  await getSupabase().storage.from(ANNOUNCEMENT_IMAGE.bucket).remove([path]);
}
