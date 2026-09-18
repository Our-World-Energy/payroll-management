"use server";

import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/mailer";
import { passwordResetEmail } from "@/lib/passwordResetEmail";

// Password recovery now runs through our own SendGrid template rather than
// Supabase's built-in email. The recovery link is minted server-side with the
// admin API and points at /auth/callback, which verifies the token_hash and
// forwards to /reset-password — the same route Supabase's own link used, so the
// downstream TOTP + set-password steps are unchanged.

const APP_URL = (process.env.APP_URL || "https://team.ourworldenergy.com").replace(/\/+$/, "");
const NEXT_PATH = "/reset-password/";
const LINK_EXPIRES = "1 hour"; // GoTrue recovery-OTP default (3600s)

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function firstNameFor(sb: ReturnType<typeof admin>, email: string): Promise<string> {
  const { data } = await sb.from("profiles").select("fullName").eq("email", email).maybeSingle();
  const full = (data?.fullName ?? "").trim();
  return full ? full.split(/\s+/)[0] : "there";
}

export type SendResetResult = { ok: boolean; error?: string };

/**
 * Always resolves the same way whether or not the address has an account, so a
 * caller cannot use it to discover which emails are registered — the one thing
 * it reveals is a malformed input, which the form already validates. Real
 * delivery failures are logged server-side rather than surfaced, for the same
 * reason (surfacing them only for real accounts would leak existence).
 */
export async function sendPasswordReset(rawEmail: string): Promise<SendResetResult> {
  const email = (rawEmail ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "Enter a valid email address." };

  const sb = admin();
  try {
    const { data, error } = await sb.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${APP_URL}/auth/callback/?next=${encodeURIComponent(NEXT_PATH)}` },
    });

    const hashed = data?.properties?.hashed_token;
    if (error || !hashed) {
      // No such account (or generateLink refused). Stay silent.
      if (error) console.warn(`sendPasswordReset(${email}): ${error.message}`);
      return { ok: true };
    }

    const resetUrl = `${APP_URL}/auth/callback/?token_hash=${encodeURIComponent(hashed)}&type=recovery&next=${encodeURIComponent(NEXT_PATH)}`;
    const firstName = await firstNameFor(sb, email);

    const sent = await sendEmail({
      to: email,
      ...passwordResetEmail({ resetUrl, firstName, expires: LINK_EXPIRES, recipientEmail: email }),
    });
    if (!sent.ok) console.error(`sendPasswordReset(${email}): send failed — ${sent.error}`);

    return { ok: true };
  } catch (err) {
    console.error(`sendPasswordReset(${email}): ${err instanceof Error ? err.message : String(err)}`);
    return { ok: true };
  }
}
