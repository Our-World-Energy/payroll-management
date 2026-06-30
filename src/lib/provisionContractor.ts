"use server";

import { createClient } from "@supabase/supabase-js";
import type { Contractor } from "@/app/admin/contractors/types";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function provisionContractorUser(contractor: Contractor): Promise<void> {
  if (!contractor.email) return;

  const sb = getSupabase();

  // Check if user already exists in auth
  const { data: existing } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const alreadyExists = existing?.users?.some((u) => u.email === contractor.email);
  if (alreadyExists) return;

  const { error } = await sb.auth.admin.createUser({
    email:         contractor.email,
    password:      "123456",
    email_confirm: true,
    user_metadata: { role: "user", fullName: contractor.fullName },
  });

  if (error) {
    console.error("Failed to create auth user for contractor:", error.message);
  }
}
