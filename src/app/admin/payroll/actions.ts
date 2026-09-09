"use server";

import { createClient } from "@supabase/supabase-js";
import { canViewSalary, SALARY_ACCESS_ERROR } from "@/lib/salaryAccess";
import { decryptSalaryNumber, encryptNumberFields, encryptSalaryNumber } from "@/lib/salaryCrypto";

// Salary gate: every money column in both tables is stored encrypted (see
// src/lib/salaryCrypto.ts) and is only decrypted for a caller with a live
// salary unlock (src/lib/salaryAccess.ts). Anyone else gets 0 for money and a
// rejected write — the check runs here, not in the UI, because these actions
// use the service-role key and can be called directly.

const ADJUSTMENT_MONEY = ["bonus", "misc", "retroPay", "reim", "cashAdvance", "hmo", "tax"] as const;
const PROCESSED_MONEY = [
  "hourlyRate", "monthlyRate", "weeklyRate", "gross", "deductions", "net",
  "bonus", "misc", "retroPay", "reim", "cashAdvance", "hmo", "tax", "indHoursPay",
  "sickPay", "specialPay", "advancePay", "ptoPay",
  "regPay", "regOtPay", "rdOtPay", "usHolidayPay", "hoOtPay", "localHolidayPay",
] as const;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

const TABLE = "payroll_adjustments";
const PROCESS_TABLE = "process_weekly_payroll";

export type PayrollAdjustment = {
  email: string;
  weekStart: string;
  bonus: number;
  misc: number;
  retroPay: number;
  reim: number;
  cashAdvance: number;
  hmo: number;
  tax: number;
  /** Fixed-Ind only: hours entered at a percentage rate. Total hours =
   *  indHours × indPercentage/100; that × Rate/hr is added to Gross. */
  indHours: number;
  indPercentage: number;
};

export async function fetchPayrollAdjustments(weekStart: string): Promise<PayrollAdjustment[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select("email, weekStart, bonus, misc, retroPay, reim, cashAdvance, hmo, tax, indHours, indPercentage")
    .eq("weekStart", weekStart);

  if (error || !data) return [];
  const canView = await canViewSalary();
  const money = (v: unknown) => (canView ? decryptSalaryNumber(v) : 0);
  return data.map((r) => ({
    email: String(r.email),
    weekStart: String(r.weekStart),
    bonus: money(r.bonus),
    misc: money(r.misc),
    retroPay: money(r.retroPay),
    reim: money(r.reim),
    cashAdvance: money(r.cashAdvance),
    hmo: money(r.hmo),
    tax: money(r.tax),
    // Hours, not money — always visible.
    indHours: Number(r.indHours ?? 0),
    indPercentage: Number(r.indPercentage ?? 0),
  }));
}

export async function savePayrollAdjustment(params: {
  email: string;
  weekStart: string;
  bonus: number;
  misc: number;
  retroPay: number;
  reim: number;
  cashAdvance: number;
  hmo: number;
  tax: number;
  indHours: number;
  indPercentage: number;
}): Promise<{ ok: boolean; error?: string }> {
  if (!(await canViewSalary())) return { ok: false, error: SALARY_ACCESS_ERROR };
  const sb = getSupabase();
  const email = params.email.trim().toLowerCase();

  const { data: existing, error: lookupErr } = await sb
    .from(TABLE)
    .select("id")
    .eq("email", email)
    .eq("weekStart", params.weekStart)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };

  const payload = {
    email,
    weekStart: params.weekStart,
    ...encryptNumberFields(params, ADJUSTMENT_MONEY),
    indHours: params.indHours,
    indPercentage: params.indPercentage,
    updatedAt: new Date().toISOString(),
  };

  const { error } = existing
    ? await sb.from(TABLE).update(payload).eq("id", existing.id)
    : await sb.from(TABLE).insert({ id: crypto.randomUUID(), ...payload });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Bulk import (CSV) ─────────────────────────────────────────────────────
// Imports a single Earnings/Deduction field for many contractors at once —
// only the targeted field is touched per row; every other field on an
// existing payroll_adjustments row (or the other 6 fields on a newly-created
// one) is left as-is / defaulted to 0, exactly like the single-contractor
// Manual Payroll Adjustment save.

// Not exported — a "use server" file may only export async functions (plus
// type-only exports, which are erased at compile time and don't count).
const ADJUSTMENT_FIELDS = ["bonus", "misc", "retroPay", "reim", "cashAdvance", "hmo"] as const;
export type AdjustmentField = (typeof ADJUSTMENT_FIELDS)[number];

type ImportRowResult = { email: string; ok: true } | { email: string; ok: false; error: string };

export async function bulkImportPayrollAdjustments(
  weekStart: string,
  field: AdjustmentField,
  rows: Array<{ email: string; value: number }>
): Promise<{ ok: boolean; updated: number; failed: Array<{ email: string; error: string }> }> {
  // field ends up as a dynamic Supabase column key below — re-validated here
  // (not just relying on the TS type) since this is a server action any
  // caller could technically hit directly with an arbitrary string.
  if (!ADJUSTMENT_FIELDS.includes(field)) {
    return { ok: false, updated: 0, failed: [{ email: "", error: "Invalid field" }] };
  }
  if (!(await canViewSalary())) {
    return { ok: false, updated: 0, failed: [{ email: "", error: SALARY_ACCESS_ERROR }] };
  }

  const sb = getSupabase();
  const zero = () => encryptSalaryNumber(0);

  const results: ImportRowResult[] = await Promise.all(rows.map(async (row): Promise<ImportRowResult> => {
    const email = row.email.trim().toLowerCase();
    if (!email) return { email: row.email, ok: false, error: "Missing email" };

    const { data: existing, error: lookupErr } = await sb
      .from(TABLE)
      .select("id")
      .eq("email", email)
      .eq("weekStart", weekStart)
      .maybeSingle();
    if (lookupErr) return { email, ok: false, error: lookupErr.message };

    const now = new Date().toISOString();
    const { error } = existing
      ? await sb.from(TABLE).update({ [field]: encryptSalaryNumber(row.value), updatedAt: now }).eq("id", existing.id)
      : await sb.from(TABLE).insert({
          id: crypto.randomUUID(), email, weekStart,
          bonus: zero(), misc: zero(), retroPay: zero(), reim: zero(), cashAdvance: zero(), hmo: zero(), tax: zero(),
          [field]: encryptSalaryNumber(row.value), updatedAt: now,
        });

    if (error) return { email, ok: false, error: error.message };
    return { email, ok: true };
  }));

  const failed = results
    .filter((r): r is { email: string; ok: false; error: string } => !r.ok)
    .map((r) => ({ email: r.email, error: r.error }));

  return { ok: failed.length === 0, updated: results.length - failed.length, failed };
}

// ── Process Weekly Payroll ───────────────────────────────────────────────────
// Finalizes a snapshot of each already-Reviewed contractor's computed payroll
// for the week into its own table — separate from payroll_adjustments (the
// manual earnings/deductions inputs), this is the resulting full payroll
// record. Re-processing the same contractor/week overwrites the prior
// snapshot (upsert on email+weekStart), same pattern as savePayrollAdjustment.

export type ProcessedPayrollRow = {
  email: string;
  weekStart: string;
  weekEnd: string;
  name: string;
  role: string;
  restDay: string;
  department: string;
  country: string;
  payCategory: string;
  shiftType: string;
  currency: string;
  hourlyRate: number;
  monthlyRate: number;
  weeklyRate: number;
  actualMinutes: number;
  completionMinutes: number | null;
  hours: number | null;
  gross: number;
  deductions: number;
  net: number;
  status: string;
  bonus: number;
  misc: number;
  retroPay: number;
  reim: number;
  cashAdvance: number;
  hmo: number;
  tax: number;
  /** Fixed-Ind hours-at-percentage amount, part of Gross. */
  indHoursPay: number;
  // Per-bucket hours/pay breakdown and the Sun→Sat daily grid — stored so a
  // "Processed" voucher can render fully frozen, with nothing computed live.
  ptoHours: number;
  /** Paid leave by kind — each its own voucher line and part of Gross. */
  sickHours: number;
  sickPay: number;
  specialHours: number;
  specialPay: number;
  advanceHours: number;
  advancePay: number;
  regHours: number;
  regOtHours: number;
  rdOtHours: number;
  usHolidayHours: number;
  hoOtHours: number;
  localHolidayHours: number;
  ptoPay: number;
  regPay: number;
  regOtPay: number;
  rdOtPay: number;
  usHolidayPay: number;
  hoOtPay: number;
  localHolidayPay: number;
  evaluatedDailyMinutes: Record<string, number>;
  /** Saved per-day Regular OT Time — voucher Day View display only; the paid
   *  OT total is regOtHours, which this never feeds into. */
  regularOtDailyMinutes: Record<string, number>;
};

type ProcessRowResult = { email: string; ok: true } | { email: string; ok: false; error: string };

export async function processWeeklyPayroll(
  rows: ProcessedPayrollRow[]
): Promise<{ ok: boolean; processed: number; failed: Array<{ email: string; error: string }> }> {
  // The figures arrive computed client-side from rates the caller could only
  // have seen while unlocked — a locked caller would freeze zeros.
  if (!(await canViewSalary())) {
    return { ok: false, processed: 0, failed: rows.map((r) => ({ email: r.email, error: SALARY_ACCESS_ERROR })) };
  }
  const sb = getSupabase();

  const results: ProcessRowResult[] = await Promise.all(rows.map(async (row): Promise<ProcessRowResult> => {
    const email = row.email.trim().toLowerCase();

    const { data: existing, error: lookupErr } = await sb
      .from(PROCESS_TABLE)
      .select("id")
      .eq("email", email)
      .eq("weekStart", row.weekStart)
      .maybeSingle();
    if (lookupErr) return { email, ok: false, error: lookupErr.message };

    const payload = { ...row, ...encryptNumberFields(row, PROCESSED_MONEY), email, processedAt: new Date().toISOString() };
    const { error } = existing
      ? await sb.from(PROCESS_TABLE).update(payload).eq("id", existing.id)
      : await sb.from(PROCESS_TABLE).insert({ id: crypto.randomUUID(), ...payload });

    if (error) return { email, ok: false, error: error.message };
    return { email, ok: true };
  }));

  const failed = results
    .filter((r): r is { email: string; ok: false; error: string } => !r.ok)
    .map((r) => ({ email: r.email, error: r.error }));

  return { ok: failed.length === 0, processed: results.length - failed.length, failed };
}

// Everything the Voucher needs to render fully frozen (no live computation)
// once a contractor is "Processed", plus everything the "changed since
// processed" check in the main table compares against — gross/deductions/net
// alone already cover Contractor Details/Time Away/Attendance drift, the rest
// here is purely for the frozen voucher display.
export type ProcessedSnapshot = {
  processedAt: string;
  name: string;
  department: string;
  role: string;
  restDay: string;
  country: string;
  payCategory: string;
  shiftType: string;
  currency: string;
  hourlyRate: number;
  monthlyRate: number;
  weeklyRate: number;
  actualMinutes: number;
  completionMinutes: number | null;
  gross: number;
  deductions: number;
  net: number;
  bonus: number;
  misc: number;
  retroPay: number;
  reim: number;
  cashAdvance: number;
  hmo: number;
  tax: number;
  /** Fixed-Ind hours-at-percentage amount, part of Gross. */
  indHoursPay: number;
  ptoHours: number;
  /** Paid leave by kind — each its own voucher line and part of Gross. */
  sickHours: number;
  sickPay: number;
  specialHours: number;
  specialPay: number;
  advanceHours: number;
  advancePay: number;
  regHours: number;
  regOtHours: number;
  rdOtHours: number;
  usHolidayHours: number;
  hoOtHours: number;
  localHolidayHours: number;
  ptoPay: number;
  regPay: number;
  regOtPay: number;
  rdOtPay: number;
  usHolidayPay: number;
  hoOtPay: number;
  localHolidayPay: number;
  evaluatedDailyMinutes: Record<string, number>;
  /** Saved per-day Regular OT Time — voucher Day View display only; the paid
   *  OT total is regOtHours, which this never feeds into. */
  regularOtDailyMinutes: Record<string, number>;
};

export async function fetchProcessedWeeklyPayroll(weekStart: string): Promise<Record<string, ProcessedSnapshot>> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(PROCESS_TABLE)
    .select("email, processedAt, name, department, role, restDay, country, payCategory, shiftType, currency, hourlyRate, monthlyRate, weeklyRate, actualMinutes, completionMinutes, gross, deductions, net, bonus, misc, retroPay, reim, cashAdvance, hmo, tax, indHoursPay, ptoHours, sickHours, sickPay, specialHours, specialPay, advanceHours, advancePay, regHours, regOtHours, rdOtHours, usHolidayHours, hoOtHours, localHolidayHours, ptoPay, regPay, regOtPay, rdOtPay, usHolidayPay, hoOtPay, localHolidayPay, evaluatedDailyMinutes, regularOtDailyMinutes")
    .eq("weekStart", weekStart);
  if (error || !data) return {};
  const canView = await canViewSalary();
  const money = (v: unknown) => (canView ? decryptSalaryNumber(v) : 0);
  return Object.fromEntries(data.map((r) => [String(r.email), {
    processedAt: String(r.processedAt),
    name: String(r.name),
    department: String(r.department),
    role: String(r.role),
    restDay: String(r.restDay ?? ""),
    country: String(r.country),
    payCategory: String(r.payCategory),
    shiftType: String(r.shiftType),
    currency: String(r.currency),
    hourlyRate: money(r.hourlyRate),
    monthlyRate: money(r.monthlyRate),
    weeklyRate: money(r.weeklyRate),
    actualMinutes: Number(r.actualMinutes),
    completionMinutes: r.completionMinutes == null ? null : Number(r.completionMinutes),
    gross: money(r.gross),
    deductions: money(r.deductions),
    net: money(r.net),
    bonus: money(r.bonus),
    misc: money(r.misc),
    retroPay: money(r.retroPay),
    reim: money(r.reim),
    cashAdvance: money(r.cashAdvance),
    hmo: money(r.hmo),
    tax: money(r.tax),
    indHoursPay: money(r.indHoursPay),
    ptoHours: Number(r.ptoHours ?? 0),
    sickHours: Number(r.sickHours ?? 0),
    sickPay: money(r.sickPay),
    specialHours: Number(r.specialHours ?? 0),
    specialPay: money(r.specialPay),
    advanceHours: Number(r.advanceHours ?? 0),
    advancePay: money(r.advancePay),
    regHours: Number(r.regHours ?? 0),
    regOtHours: Number(r.regOtHours ?? 0),
    rdOtHours: Number(r.rdOtHours ?? 0),
    usHolidayHours: Number(r.usHolidayHours ?? 0),
    hoOtHours: Number(r.hoOtHours ?? 0),
    localHolidayHours: Number(r.localHolidayHours ?? 0),
    ptoPay: money(r.ptoPay),
    regPay: money(r.regPay),
    regOtPay: money(r.regOtPay),
    rdOtPay: money(r.rdOtPay),
    usHolidayPay: money(r.usHolidayPay),
    hoOtPay: money(r.hoOtPay),
    localHolidayPay: money(r.localHolidayPay),
    evaluatedDailyMinutes: (r.evaluatedDailyMinutes ?? {}) as Record<string, number>,
    regularOtDailyMinutes: (r.regularOtDailyMinutes ?? {}) as Record<string, number>,
  }]));
}
