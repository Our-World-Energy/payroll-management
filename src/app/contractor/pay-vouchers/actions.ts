"use server";

import { createClient } from "@supabase/supabase-js";
import { fetchContractorProfileByEmail } from "../profile/actions";
import { addDaysIso, arizonaTodayIso } from "@/lib/weekUtils";

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
export async function fetchContractorVouchers(email: string): Promise<ContractorVoucherResult> {
  const sb = getSupabase();

  const [pwpRes, profileRaw] = await Promise.all([
    sb.from("process_weekly_payroll").select("*").ilike("email", email).order("weekStart", { ascending: false }),
    fetchContractorProfileByEmail(email),
  ]);

  const pwpRows = pwpRes.data ?? [];
  if (pwpRows.length === 0 && !profileRaw) return null;

  const today = arizonaTodayIso();

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
        hourlyRate: Number(r.hourlyRate ?? 0),
        monthlyRate: Number(r.monthlyRate ?? 0),
        weeklyRate: Number(r.weeklyRate ?? 0),
        gross: Number(r.gross ?? 0),
        deductions: Number(r.deductions ?? 0),
        net: Number(r.net ?? 0),
        evaluatedDailyMinutes: (r.evaluatedDailyMinutes ?? {}) as Record<string, number>,
        regHours: Number(r.regHours ?? 0),
        regOtHours: Number(r.regOtHours ?? 0),
        rdOtHours: Number(r.rdOtHours ?? 0),
        usHolidayHours: Number(r.usHolidayHours ?? 0),
        hoOtHours: Number(r.hoOtHours ?? 0),
        localHolidayHours: Number(r.localHolidayHours ?? 0),
        ptoHours: Number(r.ptoHours ?? 0),
        regPay: Number(r.regPay ?? 0),
        regOtPay: Number(r.regOtPay ?? 0),
        rdOtPay: Number(r.rdOtPay ?? 0),
        usHolidayPay: Number(r.usHolidayPay ?? 0),
        hoOtPay: Number(r.hoOtPay ?? 0),
        localHolidayPay: Number(r.localHolidayPay ?? 0),
        ptoPay: Number(r.ptoPay ?? 0),
        adjustment: {
          bonus: Number(r.bonus ?? 0), misc: Number(r.misc ?? 0), retroPay: Number(r.retroPay ?? 0), reim: Number(r.reim ?? 0),
          cashAdvance: Number(r.cashAdvance ?? 0), hmo: Number(r.hmo ?? 0), tax: Number(r.tax ?? 0),
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
