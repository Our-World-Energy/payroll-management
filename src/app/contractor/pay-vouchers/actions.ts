"use server";

import { createClient } from "@supabase/supabase-js";
import { fetchContractorProfileByEmail } from "../profile/actions";
import { fetchHolidays } from "@/app/admin/holidays/actions";
import { addDaysIso, arizonaTodayIso } from "@/lib/weekUtils";
import { countryFromLocation } from "@/lib/countryTimeZones";
import type { VoucherTimeTotals } from "@/lib/payrollVoucher";

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
  checkDate: string;   // Friday following the pay period end
  status: "Paid" | "Processing";
  currency: string;
  hourlyRate: number;
  monthlyRate: number;
  weeklyRate: number;
  // Authoritative money figures straight from the processed payroll run.
  gross: number;
  deductions: number;
  net: number;
  // Explanatory breakdown detail (from the attendance tables) — the grid and
  // the REG/OT/Holiday/PTO split behind the processed gross.
  totals: VoucherTimeTotals;
  evaluatedDailyMinutes: Record<string, number>;
  ptoHours: number;
  localHoliday: string;
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

// The contractor's Pay Vouchers, driven by the processed `process_weekly_payroll`
// table (the finalised payroll run) and scoped to a single email so no other
// contractor's pay is ever sent to the client. The per-day attendance grid and
// the REG/OT/Holiday/PTO split — which the processed table doesn't store — are
// pulled from the attendance tables to fill out the breakdown sections.
export async function fetchContractorVouchers(email: string): Promise<ContractorVoucherResult> {
  const sb = getSupabase();

  const [pwpRes, profileRaw, dayRes, weekRes, leaveRes, holidays] = await Promise.all([
    sb.from("process_weekly_payroll").select("*").ilike("email", email).order("weekStart", { ascending: false }),
    fetchContractorProfileByEmail(email),
    sb.from("attendance_day_status").select("date, evaluatedMinutes").ilike("email", email),
    sb.from("attendance_week_status")
      .select("weekStart, totalLocalHolidayMinutes, totalEvaluatedRegularMinutes, totalUsHoMinutes, totalRegularOtMinutes, totalRdOtMinutes, totalHoOtMinutes")
      .ilike("email", email),
    sb.from("contractor_leave_requests").select("type, startDate, endDate, ptoUsedHours").ilike("email", email).eq("status", "Approved"),
    fetchHolidays().catch(() => []),
  ]);

  const pwpRows = pwpRes.data ?? [];
  if (pwpRows.length === 0 && !profileRaw) return null;

  // Per-day evaluated minutes → the Sun→Sat grid.
  const dayMinutesByDate = new Map<string, number>();
  for (const d of (dayRes.data ?? [])) {
    const iso = String(d.date).slice(0, 10);
    dayMinutesByDate.set(iso, (dayMinutesByDate.get(iso) ?? 0) + Number(d.evaluatedMinutes ?? 0));
  }

  // Per-week REG/OT/Holiday minute split → the earnings breakdown lines.
  const totalsByWeek = new Map<string, VoucherTimeTotals>();
  for (const w of (weekRes.data ?? [])) {
    totalsByWeek.set(String(w.weekStart).slice(0, 10), {
      totalEvaluatedRegularMinutes: w.totalEvaluatedRegularMinutes ?? null,
      totalRegularOtMinutes: w.totalRegularOtMinutes ?? null,
      totalRdOtMinutes: w.totalRdOtMinutes ?? null,
      totalUsHoMinutes: w.totalUsHoMinutes ?? null,
      totalHoOtMinutes: w.totalHoOtMinutes ?? null,
      localHolidayMinutes: w.totalLocalHolidayMinutes ?? null,
    });
  }

  const leaveRows = (leaveRes.data ?? []).map((r) => ({
    type: String(r.type ?? ""),
    startDate: String(r.startDate ?? ""),
    endDate: String(r.endDate ?? ""),
    ptoUsedHours: Number(r.ptoUsedHours ?? 0),
  }));

  const country = countryFromLocation(profileRaw?.location || String(pwpRows[0]?.country ?? ""));

  // Descriptive / rate fields come from Contractor Details (contractor_profiles)
  // first — the master record — falling back to the processed row only when the
  // profile is missing a value.
  const detailCurrency = profileRaw?.currency || "";
  const detailHourly = parseFloat(profileRaw?.hourlyRate ?? "") || 0;
  const detailMonthly = parseFloat(profileRaw?.monthlyRate ?? "") || 0;
  const detailWeekly = parseFloat(profileRaw?.weeklyRate ?? "") || 0;

  const today = arizonaTodayIso();
  const emptyTotals: VoucherTimeTotals = {
    totalEvaluatedRegularMinutes: null, totalRegularOtMinutes: null, totalRdOtMinutes: null,
    totalUsHoMinutes: null, totalHoOtMinutes: null, localHolidayMinutes: null,
  };

  const vouchers: ContractorVoucher[] = pwpRows
    .filter((r) => String(r.status) === "Reviewed" && r.net != null)
    .map((r): ContractorVoucher => {
      const rangeFrom = String(r.weekStart).slice(0, 10);
      const rangeTo = r.weekEnd ? String(r.weekEnd).slice(0, 10) : addDaysIso(rangeFrom, 6);
      const checkDate = addDaysIso(rangeTo, 6);

      const evaluatedDailyMinutes: Record<string, number> = {};
      for (let i = 0; i < 7; i++) {
        const date = addDaysIso(rangeFrom, i);
        const m = dayMinutesByDate.get(date);
        if (m != null) evaluatedDailyMinutes[date] = m;
      }

      const ptoHours = leaveRows
        .filter((lr) => lr.type.startsWith("PTO") && lr.startDate <= rangeTo && lr.endDate >= rangeFrom)
        .reduce((sum, lr) => sum + lr.ptoUsedHours, 0);

      const holsInWeek = holidays.filter((h) => {
        const hd = h.date.slice(0, 10);
        return hd >= rangeFrom && hd <= rangeTo && h.country === country;
      });
      const localHoliday = holsInWeek.length ? holsInWeek.map((h) => h.name).join("; ") : "-";

      return {
        weekStart: rangeFrom,
        rangeFrom,
        rangeTo,
        checkDate,
        status: checkDate <= today ? "Paid" : "Processing",
        currency: detailCurrency || String(r.currency ?? "USD"),
        hourlyRate: detailHourly || Number(r.hourlyRate ?? 0),
        monthlyRate: detailMonthly || Number(r.monthlyRate ?? 0),
        weeklyRate: detailWeekly || Number(r.weeklyRate ?? 0),
        gross: Number(r.gross ?? 0),
        deductions: Number(r.deductions ?? 0),
        net: Number(r.net ?? 0),
        totals: totalsByWeek.get(rangeFrom) ?? emptyTotals,
        evaluatedDailyMinutes,
        ptoHours,
        localHoliday,
        adjustment: {
          bonus: Number(r.bonus ?? 0), misc: Number(r.misc ?? 0), retroPay: Number(r.retroPay ?? 0), reim: Number(r.reim ?? 0),
          cashAdvance: Number(r.cashAdvance ?? 0), hmo: Number(r.hmo ?? 0), tax: Number(r.tax ?? 0),
        },
      };
    });

  const latest = pwpRows[0];
  return {
    profile: {
      name: profileRaw?.fullName || String(latest?.name ?? "") || email,
      role: profileRaw?.role || String(latest?.role ?? "") || "-",
      contractorId: profileRaw?.contractorId || "-",
      department: profileRaw?.department || String(latest?.department ?? "") || "-",
      country,
      restDay: profileRaw?.restDay || "",
    },
    vouchers,
  };
}
