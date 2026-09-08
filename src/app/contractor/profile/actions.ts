"use server";

import { createClient } from "@supabase/supabase-js";
import { canViewSalaryOf } from "@/lib/salaryAccess";
import { decryptSalary } from "@/lib/salaryCrypto";

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

// Requires a signed-in (2FA) session. Contract rates are stored encrypted and
// are decrypted only for the profile's own contractor, or for an admin holding
// a live salary unlock; any other signed-in caller gets the profile with the
// three rate fields blanked, so non-salary pages (attendance, dashboard) keep
// working while nothing about pay leaks.
export async function fetchContractorProfileByEmail(email: string): Promise<ContractorProfile | null> {
  const { allowed, identity } = await canViewSalaryOf(email);
  if (!identity) return null;

  const sb = getSupabase();
  const { data, error } = await sb
    .from("contractor_profiles")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !data) return null;
  const profile = data as ContractorProfile;
  return {
    ...profile,
    monthlyRate: allowed ? decryptSalary(profile.monthlyRate) : "",
    weeklyRate:  allowed ? decryptSalary(profile.weeklyRate)  : "",
    hourlyRate:  allowed ? decryptSalary(profile.hourlyRate)  : "",
  };
}
