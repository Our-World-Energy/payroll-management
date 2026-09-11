"use server";

import { createClient } from "@supabase/supabase-js";
import { normalizeAccountPages, defaultAccountPages, accountPagesAreDefault } from "@/lib/accountPages";
import { type AppRole, normalizeRole } from "@/lib/roles";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type AppUser = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  createdAt: string;
  lastSignIn: string | null;
  confirmed: boolean;
  /** Menus this account may open. Empty + pagesAreDefault means "role default". */
  pages: string[];
  /** False once an admin has set this account's menus explicitly. */
  pagesAreDefault: boolean;
  /** Disabled accounts cannot sign in. Backed by GoTrue's ban, not metadata. */
  enabled: boolean;
  /**
   * The engagement status from Contractor Details, or null for an account with
   * no contractor record at all (admin-only logins) — which is not the same as
   * a contractor who is on file and dismissed.
   */
  contractorStatus: ContractorStatus | null;
};

export type ContractorStatus = "Active" | "Dismissed";

function toAppUser(
  u: Record<string, unknown>,
  profile?: { fullName: string; status: string },
): AppUser {
  const metadata = u.user_metadata as Record<string, unknown> | undefined;
  const fullName = profile?.fullName ?? "";
  return {
    id:          String(u.id          ?? ""),
    email:       String(u.email       ?? ""),
    fullName:    fullName || String(metadata?.fullName ?? ""),
    role:        normalizeRole(metadata?.role),
    createdAt:   String(u.created_at  ?? ""),
    lastSignIn:  u.last_sign_in_at ? String(u.last_sign_in_at) : null,
    confirmed:   Boolean(u.email_confirmed_at),
    pages:       accountPagesAreDefault(metadata?.pages)
                   ? defaultAccountPages(normalizeRole(metadata?.role))
                   : normalizeAccountPages(metadata?.pages),
    pagesAreDefault: accountPagesAreDefault(metadata?.pages),
    // banned_until is absent on a normal account, and a past date counts as
    // expired — so only a future ban means disabled.
    enabled:     !(u.banned_until && new Date(String(u.banned_until)) > new Date()),
    // Mirrors Contractor Details, which treats anything that isn't the literal
    // "Dismissed" as Active.
    contractorStatus: profile == null
      ? null
      : profile.status === "Dismissed" ? "Dismissed" : "Active",
  };
}

const AUTH_PAGE_SIZE = 200;
// Enough for 20,000 accounts; a backstop against an endpoint that never returns
// a short page rather than a real limit.
const AUTH_MAX_PAGES = 100;

// listUsers returns a single page, so asking for one page of 200 silently drops
// every account past it — and it orders newest first, so what goes missing is
// the *oldest* accounts, which are the admin ones set up before the contractor
// backfill. Pages through until a short page comes back.
async function listAllAuthUsers(sb: ReturnType<typeof getSupabase>) {
  const all: Record<string, unknown>[] = [];
  for (let page = 1; page <= AUTH_MAX_PAGES; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
    if (error) throw new Error(error.message);
    const batch = (data.users ?? []) as unknown as Record<string, unknown>[];
    all.push(...batch);
    if (batch.length < AUTH_PAGE_SIZE) break;
  }
  return all;
}

export async function fetchUsers(): Promise<AppUser[]> {
  const sb = getSupabase();
  const [authUsers, contractorsRes] = await Promise.all([
    listAllAuthUsers(sb),
    sb.from("contractor_profiles").select("email, status, fullName"),
  ]);

  // Every account is listed, dismissed contractors included — the Contractor
  // Status column reports the engagement, so hiding the dismissed ones would
  // leave that column able to say only "Active". Accounts with no contractor
  // record (admin-only logins) carry no status at all. Full name is sourced
  // from here when available, falling back to the auth account's metadata.
  const profileByEmail = new Map(
    (contractorsRes.data ?? []).map((c) => [
      String(c.email ?? "").trim().toLowerCase(),
      { status: String(c.status ?? ""), fullName: String(c.fullName ?? "") },
    ])
  );

  return authUsers.map((raw) =>
    toAppUser(raw, profileByEmail.get(String(raw.email ?? "").trim().toLowerCase())),
  );
}

export async function createUser(email: string, password: string, role: AppRole): Promise<AppUser> {
  const sb = getSupabase();
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role },
  });
  if (error) throw new Error(error.message);
  return toAppUser(data.user as unknown as Record<string, unknown>);
}

export async function deleteUser(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.auth.admin.deleteUser(id);
  if (error) throw new Error(error.message);
}

export async function updateUserRole(id: string, role: AppRole): Promise<void> {
  const sb = getSupabase();
  // Merge rather than replace: updateUserById overwrites user_metadata whole,
  // so writing { role } alone dropped fullName and (now) the granted pages.
  const { data: existing, error: readErr } = await sb.auth.admin.getUserById(id);
  if (readErr) throw new Error(readErr.message);
  const metadata = (existing?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const { error } = await sb.auth.admin.updateUserById(id, {
    user_metadata: { ...metadata, role },
  });
  if (error) throw new Error(error.message);
}

export async function resetUserPassword(id: string, newPassword: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.auth.admin.updateUserById(id, { password: newPassword });
  if (error) throw new Error(error.message);
}

export async function backfillContractorAccounts(): Promise<{ created: number; skipped: number }> {
  const sb = getSupabase();

  // Fetch all contractors from contractor_profiles
  const { data: contractors, error: dbError } = await sb
    .from("contractor_profiles")
    .select("email, fullName, firstName")
    .neq("email", "");
  if (dbError) throw new Error(dbError.message);

  // Fetch existing auth users
  const { data: authData, error: authError } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (authError) throw new Error(authError.message);

  const existingEmails = new Set(authData.users.map((u) => u.email?.toLowerCase()));

  let created = 0;
  let skipped = 0;

  for (const c of contractors ?? []) {
    if (!c.email) { skipped++; continue; }
    if (existingEmails.has(c.email.toLowerCase())) { skipped++; continue; }

    const { error } = await sb.auth.admin.createUser({
      email:         c.email,
      password:      "123456",
      email_confirm: true,
      user_metadata: { role: "user", fullName: c.fullName },
    });

    if (error) {
      console.error(`Failed to create account for ${c.email}:`, error.message);
      skipped++;
    } else {
      created++;
    }
  }

  return { created, skipped };
}

/**
 * Replaces the account's granted pages.
 *
 * updateUserById replaces user_metadata wholesale, so the existing metadata is
 * read first and merged — writing { pages } alone would drop the role and
 * silently demote the account (normalizeRole reads a missing role as admin).
 */
export async function updateUserPages(id: string, pages: string[] | null): Promise<void> {
  const sb = getSupabase();
  const { data: existing, error: readErr } = await sb.auth.admin.getUserById(id);
  if (readErr) throw new Error(readErr.message);
  const metadata = (existing?.user?.user_metadata ?? {}) as Record<string, unknown>;
  // null clears the override: the key is removed rather than set to [], so
  // the account reads as "never set" and follows its role's defaults again.
  // An empty array would instead mean "no menus at all".
  const next = { ...metadata };
  if (pages === null) delete next.pages;
  else next.pages = normalizeAccountPages(pages);

  const { error } = await sb.auth.admin.updateUserById(id, { user_metadata: next });
  if (error) throw new Error(error.message);
}

/**
 * Enables or disables an account.
 *
 * Uses GoTrue's ban rather than a metadata flag, so a disabled account is
 * refused at the auth layer — it cannot sign in, and an existing session's
 * token stops being honoured. A metadata flag would only be as good as the
 * checks that remembered to read it.
 *
 * Absent/expired ban = enabled, which is every account today. Nothing is
 * disabled unless an admin turns it off here.
 */
export async function setUserEnabled(id: string, enabled: boolean): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.auth.admin.updateUserById(id, {
    ban_duration: enabled ? "none" : "876000h", // ~100 years
  });
  if (error) throw new Error(error.message);
}
