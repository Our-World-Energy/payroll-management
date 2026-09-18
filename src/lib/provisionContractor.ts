"use server";

import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Contractor } from "@/app/admin/contractors/types";

export type ProvisionResult =
  | { ok: true; created: boolean }
  | { ok: false; error: string };

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Looks an account up by email across every page.
 *
 * The previous single listUsers({ perPage: 1000 }) call silently stopped
 * looking after the first thousand accounts, so once the directory passed that
 * mark an existing contractor would read as new and be provisioned twice.
 */
async function findUserByEmail(sb: SupabaseClient, email: string): Promise<User | null> {
  const target = email.trim().toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit;
    if (users.length < perPage) return null; // last page
  }
  return null;
}

export async function provisionContractorUser(contractor: Contractor): Promise<ProvisionResult> {
  if (!contractor.email) return { ok: false, error: "Contractor has no email address." };

  const sb = getSupabase();

  let existing: User | null;
  try {
    existing = await findUserByEmail(sb, contractor.email);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (existing) return { ok: true, created: false };

  // A random secret that is deliberately never recorded or sent anywhere. The
  // contractor gets in by using "Forgot password" on the sign-in page, which
  // issues them a link directly — nothing needs to know this value.
  //
  // It used to be the literal string "123456" on every account created here,
  // so anyone who knew a contractor's email address could sign in as them.
  const password = randomBytes(32).toString("base64url");

  const { error: createError } = await sb.auth.admin.createUser({
    email: contractor.email,
    password,
    email_confirm: true,
    user_metadata: { role: "user", fullName: contractor.fullName },
  });
  if (createError) {
    return { ok: false, error: `Could not create the account: ${createError.message}` };
  }

  return { ok: true, created: true };
}
