import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { hasSalaryKey } from "@/lib/salaryCrypto";

// Who may see salary / payment figures, and whether they've proven it recently.
//
// Two layers, both enforced server-side inside every salary-touching server
// action (server actions run with the service-role key, so a layout or proxy
// check would be bypassable with one direct call):
//
//   1. Allowlist — the emails permitted to unlock salary at all. Union of the
//      SALARY_VIEWER_EMAILS env var (bootstrap, can't be removed from the UI)
//      and the JSON list under app_settings."salary_viewer_emails" (managed in
//      Settings → Salary Visibility by someone who is already unlocked).
//   2. Grant — a row in salary_access_grants proving the user completed the
//      email OTP within the last SALARY_GRANT_DAYS. Expired = locked again.
//
// Everyone else gets salary fields masked (blank / 0) from the server and any
// write of a money field rejected.

export const SALARY_GRANT_DAYS = 30;
export const SALARY_VIEWERS_SETTING_KEY = "salary_viewer_emails";
export const SALARY_ACCESS_ERROR = "Salary access required — verify your identity to view or edit salary data.";

export type SalaryAccess = {
  /** Lowercased email of the signed-in (aal2) user, or null when not signed in. */
  email: string | null;
  /** Signed in as an admin (role !== "user"). */
  isAdmin: boolean;
  /** Email is on the allowlist. */
  eligible: boolean;
  /** Has an unexpired OTP grant. */
  verified: boolean;
  /** ISO timestamp the current grant expires, when verified. */
  verifiedUntil: string | null;
  /** eligible && verified — the one flag callers should branch on. */
  canView: boolean;
  /** Set when the access tables aren't reachable (migration not run yet). */
  setupError?: string;
  /**
   * True when SALARY_MASTER_KEY isn't configured on this server (e.g. a
   * developer's machine). Salary is then locked for everyone regardless of the
   * allowlist or any grant — nothing could be decrypted anyway — and no popup
   * is offered.
   */
  keyMissing?: boolean;
};

export function serviceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Parses a timestamp read back from Supabase as a UTC instant. The columns are
 * timestamptz so values normally carry an offset, but a bare
 * "2026-09-09T10:15:00" (no zone) must still be read as UTC — `new Date()`
 * alone would treat it as local time and misjudge expiry off-UTC.
 */
export function parseDbInstant(value: unknown): Date | null {
  if (value == null) return null;
  const s = String(value);
  const hasZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(s);
  const d = new Date(hasZone ? s : `${s.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The signed-in user's email + admin flag, requiring a 2FA (aal2) session. */
export async function getSessionIdentity(): Promise<{ email: string; isAdmin: boolean } | null> {
  try {
    const sb = await createSessionClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user?.email) return null;
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") return null;
    const role = (user.user_metadata as { role?: string } | undefined)?.role;
    return { email: normalizeEmail(user.email), isAdmin: role !== "user" };
  } catch {
    return null;
  }
}

export function envSalaryViewers(): string[] {
  return (process.env.SALARY_VIEWER_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
}

export async function dbSalaryViewers(): Promise<string[]> {
  const { data, error } = await serviceClient()
    .from("app_settings")
    .select("value")
    .eq("key", SALARY_VIEWERS_SETTING_KEY)
    .maybeSingle();
  if (error || !data?.value) return [];
  try {
    const parsed = JSON.parse(data.value);
    return Array.isArray(parsed) ? parsed.map((e) => normalizeEmail(String(e))).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function isSalaryViewerEmail(email: string): Promise<boolean> {
  const target = normalizeEmail(email);
  if (envSalaryViewers().includes(target)) return true;
  return (await dbSalaryViewers()).includes(target);
}

export async function getSalaryAccess(): Promise<SalaryAccess> {
  const identity = await getSessionIdentity();
  const locked: SalaryAccess = { email: null, isAdmin: false, eligible: false, verified: false, verifiedUntil: null, canView: false };
  if (!identity) return locked;

  const base: SalaryAccess = { ...locked, email: identity.email, isAdmin: identity.isAdmin };
  // Contractors (role "user") only ever see their own figures via the
  // ownership check in the portal actions — never the org-wide unlock.
  if (!identity.isAdmin) return base;

  // No key on this server: nobody is eligible, so the popup never appears and
  // every read path takes the masked branch. Checked before the allowlist and
  // grants because those live in the shared database — an admin who verified
  // on production would otherwise look "unlocked" on a keyless dev machine.
  if (!hasSalaryKey()) return { ...base, keyMissing: true };

  let eligible = false;
  try {
    eligible = await isSalaryViewerEmail(identity.email);
  } catch (err) {
    return { ...base, setupError: err instanceof Error ? err.message : String(err) };
  }
  if (!eligible) return base;

  const { data, error } = await serviceClient()
    .from("salary_access_grants")
    .select("expiresAt")
    .eq("email", identity.email)
    .maybeSingle();
  if (error) return { ...base, eligible, setupError: error.message };

  const expiresAt = parseDbInstant(data?.expiresAt);
  const verified = !!expiresAt && expiresAt.getTime() > Date.now();
  return {
    ...base,
    eligible,
    verified,
    verifiedUntil: verified ? expiresAt!.toISOString() : null,
    canView: eligible && verified,
  };
}

/** Convenience for read paths: mask when false. */
export async function canViewSalary(): Promise<boolean> {
  return (await getSalaryAccess()).canView;
}

/** Convenience for write paths: throw when the caller may not touch money. */
export async function requireSalaryAccess(): Promise<void> {
  if (!(await canViewSalary())) throw new Error(SALARY_ACCESS_ERROR);
}

/**
 * Whether the caller may see figures belonging to `ownerEmail`: their own
 * data is always visible; anyone else's requires the salary unlock.
 */
export async function canViewSalaryOf(ownerEmail: string): Promise<{ allowed: boolean; identity: { email: string; isAdmin: boolean } | null }> {
  const identity = await getSessionIdentity();
  if (!identity) return { allowed: false, identity: null };
  if (identity.email === normalizeEmail(ownerEmail)) return { allowed: true, identity };
  return { allowed: identity.isAdmin && (await canViewSalary()), identity };
}
