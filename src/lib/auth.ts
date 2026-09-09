import { createClient } from "@/lib/supabase/server";
import { type AppRole, normalizeRole } from "@/lib/roles";

/**
 * Server-side role gate for Route Handlers. Mirrors the client AuthGuard used
 * by /admin: requires a valid Supabase session, an aal2 (2FA-verified)
 * session, and one of the roles passed in. Returns a Response to send back
 * when access is denied, or null when the caller is authorized.
 *
 *   const denied = await requireRole("admin", "hr");
 *   if (denied) return denied;
 */
export async function requireRole(...allowed: AppRole[]): Promise<Response | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    return Response.json({ error: "Two-factor authentication required" }, { status: 403 });
  }

  const role = normalizeRole(user.user_metadata?.role);
  if (!allowed.includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return null; // authorized
}

/** Admin-only endpoints. */
export async function requireAdmin(): Promise<Response | null> {
  return requireRole("admin");
}
