import { createClient } from "@/lib/supabase/server";

/**
 * Server-side admin gate for Route Handlers. Mirrors the client AuthGuard used
 * by /admin: requires a valid Supabase session AND an aal2 (2FA-verified)
 * session. Returns a Response to send back when access is denied, or null when
 * the caller is an authorized admin.
 *
 *   const denied = await requireAdmin();
 *   if (denied) return denied;
 */
export async function requireAdmin(): Promise<Response | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    return Response.json({ error: "Two-factor authentication required" }, { status: 403 });
  }

  return null; // authorized
}
