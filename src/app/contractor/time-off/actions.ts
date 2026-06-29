"use server";

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export type ContractorTimeOff = {
  fullName:        string;
  hireDate:        string;
  ptoUsed:         number;
  sickLeaveUsed:   number;
  birthdayLeave:   number;
  advanceSickLeave:number;
};

export async function fetchContractorTimeOff(email: string): Promise<ContractorTimeOff | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("contractor_profiles")
    .select("fullName, hireDate, ptoUsed, sickLeaveUsed, birthdayLeave, advanceSickLeave")
    .eq("email", email)
    .single();

  if (error || !data) return null;
  return {
    fullName:         String(data.fullName         ?? ""),
    hireDate:         String(data.hireDate         ?? ""),
    ptoUsed:          Number(data.ptoUsed          ?? 0),
    sickLeaveUsed:    Number(data.sickLeaveUsed    ?? 0),
    birthdayLeave:    Number(data.birthdayLeave    ?? 0),
    advanceSickLeave: Number(data.advanceSickLeave ?? 0),
  };
}
