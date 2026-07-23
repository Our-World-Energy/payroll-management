"use server";

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type AppUser = {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "user";
  createdAt: string;
  lastSignIn: string | null;
  confirmed: boolean;
};

function toAppUser(u: Record<string, unknown>, fullName = ""): AppUser {
  const metadata = u.user_metadata as Record<string, unknown> | undefined;
  return {
    id:          String(u.id          ?? ""),
    email:       String(u.email       ?? ""),
    fullName:    fullName || String(metadata?.fullName ?? ""),
    role:        metadata?.role === "user" ? "user" : "admin",
    createdAt:   String(u.created_at  ?? ""),
    lastSignIn:  u.last_sign_in_at ? String(u.last_sign_in_at) : null,
    confirmed:   Boolean(u.email_confirmed_at),
  };
}

export async function fetchUsers(): Promise<AppUser[]> {
  const sb = getSupabase();
  const [{ data, error }, contractorsRes] = await Promise.all([
    sb.auth.admin.listUsers({ perPage: 200 }),
    sb.from("contractor_profiles").select("email, status, fullName"),
  ]);
  if (error) throw new Error(error.message);

  // Only show Active contractors — accounts with no matching contractor
  // record (e.g. admin-only accounts) always show, since there's no status
  // to check for them. Full name is also sourced from here when available,
  // falling back to whatever's in the auth account's own metadata.
  const profileByEmail = new Map(
    (contractorsRes.data ?? []).map((c) => [
      String(c.email ?? "").trim().toLowerCase(),
      { status: String(c.status ?? ""), fullName: String(c.fullName ?? "") },
    ])
  );

  return (data.users ?? [])
    .map((u) => {
      const raw = u as unknown as Record<string, unknown>;
      const profile = profileByEmail.get(String(raw.email ?? "").trim().toLowerCase());
      return toAppUser(raw, profile?.fullName);
    })
    .filter((u) => {
      const status = profileByEmail.get(u.email.trim().toLowerCase())?.status;
      return status == null || status === "Active";
    });
}

export async function createUser(email: string, password: string, role: "admin" | "user"): Promise<AppUser> {
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

export async function updateUserRole(id: string, role: "admin" | "user"): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.auth.admin.updateUserById(id, {
    user_metadata: { role },
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
