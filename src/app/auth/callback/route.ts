import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Lands the one-time links Supabase Auth emails (password recovery today;
// the same handler works for invite / magic-link / email-change links). It
// turns the link into a session cookie and forwards to `next`.
//
// Two link shapes are handled, since which one Supabase sends depends on the
// email template in the project:
//   • PKCE:   ?code=…                 → exchangeCodeForSession (verifier is in
//                                       the cookie the browser client set when
//                                       it requested the reset)
//   • Legacy: ?token_hash=…&type=…    → verifyOtp
// Anything else, or a failed exchange, goes back to the request page with an
// error so the user can ask for a fresh link.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeNext(raw: string | null): string {
  // Only same-origin paths — never an absolute URL from the query string.
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/reset-password/";
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"));

  const supabase = await createClient();

  let failed = true;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = !!error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    failed = !!error;
  }

  if (failed) {
    return NextResponse.redirect(new URL("/forgot-password/?error=link_expired", url.origin), { status: 303 });
  }
  return NextResponse.redirect(new URL(next, url.origin), { status: 303 });
}
