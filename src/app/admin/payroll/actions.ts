"use server";

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

const TABLE = "payroll_adjustments";

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
