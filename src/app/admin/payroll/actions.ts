"use server";

import { createClient } from "@supabase/supabase-js";

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
};

export async function fetchPayrollAdjustments(weekStart: string): Promise<PayrollAdjustment[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select("email, weekStart, bonus, misc, retroPay, reim, cashAdvance, hmo, tax")
    .eq("weekStart", weekStart);

  if (error || !data) return [];
  return data.map((r) => ({
    email: String(r.email),
    weekStart: String(r.weekStart),
    bonus: Number(r.bonus ?? 0),
    misc: Number(r.misc ?? 0),
    retroPay: Number(r.retroPay ?? 0),
    reim: Number(r.reim ?? 0),
    cashAdvance: Number(r.cashAdvance ?? 0),
    hmo: Number(r.hmo ?? 0),
    tax: Number(r.tax ?? 0),
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
}): Promise<{ ok: boolean; error?: string }> {
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
    bonus: params.bonus,
    misc: params.misc,
    retroPay: params.retroPay,
    reim: params.reim,
    cashAdvance: params.cashAdvance,
    hmo: params.hmo,
    tax: params.tax,
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

  const sb = getSupabase();

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
      ? await sb.from(TABLE).update({ [field]: row.value, updatedAt: now }).eq("id", existing.id)
      : await sb.from(TABLE).insert({
          id: crypto.randomUUID(), email, weekStart,
          bonus: 0, misc: 0, retroPay: 0, reim: 0, cashAdvance: 0, hmo: 0, tax: 0,
          [field]: row.value, updatedAt: now,
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
  // Per-bucket hours/pay breakdown and the Sun→Sat daily grid — stored so a
  // "Processed" voucher can render fully frozen, with nothing computed live.
  ptoHours: number;
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
};

type ProcessRowResult = { email: string; ok: true } | { email: string; ok: false; error: string };

export async function processWeeklyPayroll(
  rows: ProcessedPayrollRow[]
): Promise<{ ok: boolean; processed: number; failed: Array<{ email: string; error: string }> }> {
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

    const payload = { ...row, email, processedAt: new Date().toISOString() };
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
  ptoHours: number;
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
};

export async function fetchProcessedWeeklyPayroll(weekStart: string): Promise<Record<string, ProcessedSnapshot>> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(PROCESS_TABLE)
    .select("email, processedAt, name, department, role, restDay, country, payCategory, shiftType, currency, hourlyRate, monthlyRate, weeklyRate, actualMinutes, completionMinutes, gross, deductions, net, bonus, misc, retroPay, reim, cashAdvance, hmo, tax, ptoHours, regHours, regOtHours, rdOtHours, usHolidayHours, hoOtHours, localHolidayHours, ptoPay, regPay, regOtPay, rdOtPay, usHolidayPay, hoOtPay, localHolidayPay, evaluatedDailyMinutes")
    .eq("weekStart", weekStart);
  if (error || !data) return {};
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
    hourlyRate: Number(r.hourlyRate),
    monthlyRate: Number(r.monthlyRate),
    weeklyRate: Number(r.weeklyRate),
    actualMinutes: Number(r.actualMinutes),
    completionMinutes: r.completionMinutes == null ? null : Number(r.completionMinutes),
    gross: Number(r.gross),
    deductions: Number(r.deductions),
    net: Number(r.net),
    bonus: Number(r.bonus ?? 0),
    misc: Number(r.misc ?? 0),
    retroPay: Number(r.retroPay ?? 0),
    reim: Number(r.reim ?? 0),
    cashAdvance: Number(r.cashAdvance ?? 0),
    hmo: Number(r.hmo ?? 0),
    tax: Number(r.tax ?? 0),
    ptoHours: Number(r.ptoHours ?? 0),
    regHours: Number(r.regHours ?? 0),
    regOtHours: Number(r.regOtHours ?? 0),
    rdOtHours: Number(r.rdOtHours ?? 0),
    usHolidayHours: Number(r.usHolidayHours ?? 0),
    hoOtHours: Number(r.hoOtHours ?? 0),
    localHolidayHours: Number(r.localHolidayHours ?? 0),
    ptoPay: Number(r.ptoPay ?? 0),
    regPay: Number(r.regPay ?? 0),
    regOtPay: Number(r.regOtPay ?? 0),
    rdOtPay: Number(r.rdOtPay ?? 0),
    usHolidayPay: Number(r.usHolidayPay ?? 0),
    hoOtPay: Number(r.hoOtPay ?? 0),
    localHolidayPay: Number(r.localHolidayPay ?? 0),
    evaluatedDailyMinutes: (r.evaluatedDailyMinutes ?? {}) as Record<string, number>,
  }]));
}
