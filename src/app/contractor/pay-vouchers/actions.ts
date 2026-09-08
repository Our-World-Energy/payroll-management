"use server";

import { createClient } from "@supabase/supabase-js";
import { fetchContractorProfileByEmail } from "../profile/actions";
import { addDaysIso, arizonaTodayIso } from "@/lib/weekUtils";
import { canViewSalaryOf } from "@/lib/salaryAccess";
import { decryptSalaryNumber } from "@/lib/salaryCrypto";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export type VoucherAdjustment = {
  bonus: number; misc: number; retroPay: number; reim: number;
  cashAdvance: number; hmo: number; tax: number;
};

export type ContractorVoucher = {
  weekStart: string;   // ISO Sunday (also the key)
  rangeFrom: string;   // Sunday
  rangeTo: string;     // Saturday
  checkDate: string;   // Friday following the pay cycle end
  status: "Paid" | "Processing";
  currency: string;
  hourlyRate: number;
  monthlyRate: number;
  weeklyRate: number;
  // Every figure below is read straight off the frozen process_weekly_payroll
  // row — nothing here is recomputed from attendance/leave-request tables, so
  // an already-Processed voucher can never drift from what was finalized.
  gross: number;
  deductions: number;
  net: number;
  evaluatedDailyMinutes: Record<string, number>;
  regHours: number;
  regOtHours: number;
  rdOtHours: number;
  usHolidayHours: number;
  hoOtHours: number;
  localHolidayHours: number;
  ptoHours: number;
  regPay: number;
  regOtPay: number;
  rdOtPay: number;
  usHolidayPay: number;
  hoOtPay: number;
  localHolidayPay: number;
  ptoPay: number;
  adjustment: VoucherAdjustment;
};

export type ContractorVoucherProfile = {
  name: string; role: string; contractorId: string; department: string;
  country: string; restDay: string;
};

export type ContractorVoucherResult = {
  profile: ContractorVoucherProfile;
  vouchers: ContractorVoucher[];
} | null;

// The contractor's Pay Vouchers, driven ENTIRELY by the processed
// `process_weekly_payroll` table — the finalized, frozen snapshot of a pay
// cycle. Only rows literally stamped status = "Processed" (a contractor's
// payroll has been through the admin's Re-Process action, not just its
// first Process pass, which stamps "Reviewed") are ever shown here; a
// "Reviewed"-only row never surfaces in the portal. contractorId is the one
// field this table doesn't carry, so that alone still comes from Contractor
// Details (contractor_profiles).
//
// Salary gate: the pay figures are the contractor's own, so they're decrypted
// for the contractor themself (session email must match) or for an admin
// holding a live salary unlock. Anyone else gets null — the same as "no
// vouchers", revealing nothing.
export async function fetchContractorVouchers(email: string): Promise<ContractorVoucherResult> {
  const { allowed } = await canViewSalaryOf(email);
  if (!allowed) return null;

  const sb = getSupabase();

  const [pwpRes, profileRaw] = await Promise.all([
    sb.from("process_weekly_payroll").select("*").ilike("email", email).order("weekStart", { ascending: false }),
    fetchContractorProfileByEmail(email),
  ]);

  const pwpRows = pwpRes.data ?? [];
  if (pwpRows.length === 0 && !profileRaw) return null;

  const today = arizonaTodayIso();
  const money = decryptSalaryNumber;

  const vouchers: ContractorVoucher[] = pwpRows
    .filter((r) => String(r.status) === "Processed" && r.net != null)
    .map((r): ContractorVoucher => {
      const rangeFrom = String(r.weekStart).slice(0, 10);
      const rangeTo = r.weekEnd ? String(r.weekEnd).slice(0, 10) : addDaysIso(rangeFrom, 6);
      const checkDate = addDaysIso(rangeTo, 6);

      return {
        weekStart: rangeFrom,
        rangeFrom,
        rangeTo,
        checkDate,
        status: checkDate <= today ? "Paid" : "Processing",
        currency: String(r.currency ?? "USD"),
        hourlyRate: money(r.hourlyRate),
        monthlyRate: money(r.monthlyRate),
        weeklyRate: money(r.weeklyRate),
        gross: money(r.gross),
        deductions: money(r.deductions),
        net: money(r.net),
        evaluatedDailyMinutes: (r.evaluatedDailyMinutes ?? {}) as Record<string, number>,
        regHours: Number(r.regHours ?? 0),
        regOtHours: Number(r.regOtHours ?? 0),
        rdOtHours: Number(r.rdOtHours ?? 0),
        usHolidayHours: Number(r.usHolidayHours ?? 0),
        hoOtHours: Number(r.hoOtHours ?? 0),
        localHolidayHours: Number(r.localHolidayHours ?? 0),
        ptoHours: Number(r.ptoHours ?? 0),
        regPay: money(r.regPay),
        regOtPay: money(r.regOtPay),
        rdOtPay: money(r.rdOtPay),
        usHolidayPay: money(r.usHolidayPay),
        hoOtPay: money(r.hoOtPay),
        localHolidayPay: money(r.localHolidayPay),
        ptoPay: money(r.ptoPay),
        adjustment: {
          bonus: money(r.bonus), misc: money(r.misc), retroPay: money(r.retroPay), reim: money(r.reim),
          cashAdvance: money(r.cashAdvance), hmo: money(r.hmo), tax: money(r.tax),
        },
      };
    });

  // Descriptive fields come from the latest frozen snapshot first — the
  // voucher record itself — falling back to Contractor Details only when a
  // contractor has no processed row yet. contractorId has no home in
  // process_weekly_payroll at all, so it's always from Contractor Details.
  const latest = pwpRows[0];
  return {
    profile: {
      name: String(latest?.name ?? "") || profileRaw?.fullName || email,
      role: String(latest?.role ?? "") || profileRaw?.role || "-",
      contractorId: profileRaw?.contractorId || "-",
      department: String(latest?.department ?? "") || profileRaw?.department || "-",
      country: String(latest?.country ?? ""),
      restDay: String(latest?.restDay ?? "") || profileRaw?.restDay || "",
    },
    vouchers,
  };
}
