"use server";

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export type ContractorProfile = {
  fullName:          string;
  firstName:         string;
  avatar:            string;
  role:              string;
  contractorId:      string;
  department:        string;
  subDepartment:     string;
  location:          string;
  officeLocation:    string;
  hireDate:          string;
  manager:           string;
  email:             string;
  dob:               string;
  gender:            string;
  shiftHours:        string;
  restDay:           string;
  equipmentProvided: boolean;
  worksnapId:        string;
  currency:          string;
  monthlyRate:       string;
  weeklyRate:        string;
  hourlyRate:        string;
  payCategory:       string;
  payPeriod:         string;
  shiftType:         string;
  status:            string;
};

export async function fetchContractorProfileByEmail(email: string): Promise<ContractorProfile | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("contractor_profiles")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !data) return null;
  return data as ContractorProfile;
}
