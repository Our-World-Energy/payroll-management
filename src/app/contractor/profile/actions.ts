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

export type BirthdayEntry = { fullName: string; dob: string; email: string };

export async function fetchCurrentMonthBirthdays(): Promise<BirthdayEntry[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("contractor_profiles")
    .select("fullName, firstName, surname, dob, email")
    .eq("status", "Active")
    .neq("dob", "");

  if (error || !data) return [];

  const month = new Date().getMonth() + 1; // 1-based
  const pad = (n: number) => String(n).padStart(2, "0");
  const mm = pad(month);

  return (data as { fullName: string; firstName: string; surname: string; dob: string; email: string }[])
    .filter((c) => c.dob && c.dob.slice(5, 7) === mm)
    .map((c) => ({
      fullName: c.fullName || [c.firstName, c.surname].filter(Boolean).join(" ") || "Unnamed",
      dob: c.dob,
      email: String(c.email ?? ""),
    }));
}

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
