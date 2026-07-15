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
