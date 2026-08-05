"use server";

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const TABLE = "birthday_wishes";

export type ReceivedWish = { fromName: string; fromEmail: string };

// One click → one wish. Idempotent on (fromEmail, toEmail, wishDate) so a
// contractor can't spam the same colleague twice on the same birthday.
export async function sendBirthdayWish(params: {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  wishDate: string; // YYYY-MM-DD (the birthday date being celebrated)
  message?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const fromEmail = params.fromEmail.trim().toLowerCase();
  const toEmail = params.toEmail.trim().toLowerCase();
  if (!fromEmail || !toEmail) return { ok: false, error: "Missing sender or recipient." };
  if (fromEmail === toEmail) return { ok: false, error: "You can't wish yourself." };

  const sb = getSupabase();
  const { error } = await sb
    .from(TABLE)
    .upsert(
      {
        fromEmail,
        fromName: params.fromName,
        toEmail,
        wishDate: params.wishDate,
        message: params.message ?? "",
      },
      { onConflict: "fromEmail,toEmail,wishDate", ignoreDuplicates: true }
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Wishes I've already sent today (to grey out those buttons) + wishes I've
// received today (for the celebratory banner when it's my birthday).
export async function fetchWishState(
  myEmail: string,
  wishDate: string
): Promise<{ sentTo: string[]; received: ReceivedWish[] }> {
  const email = myEmail.trim().toLowerCase();
  if (!email) return { sentTo: [], received: [] };

  const sb = getSupabase();
  const [sentRes, recvRes] = await Promise.all([
    sb.from(TABLE).select("toEmail").eq("wishDate", wishDate).ilike("fromEmail", email),
    sb.from(TABLE).select("fromName, fromEmail").eq("wishDate", wishDate).ilike("toEmail", email),
  ]);

  const sentTo = (sentRes.data ?? []).map((r) => String(r.toEmail).toLowerCase());
  const received = (recvRes.data ?? []).map((r) => ({
    fromName: String(r.fromName ?? "A colleague"),
    fromEmail: String(r.fromEmail ?? ""),
  }));
  return { sentTo, received };
}
