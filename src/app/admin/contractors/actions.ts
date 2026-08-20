"use server";

import { createClient } from "@supabase/supabase-js";
import type { Contractor, FilterRule } from "./types";
import { COLUMNS } from "./types";
import { provisionContractorUser } from "@/lib/provisionContractor";
import { calculatePtoBalance, calculateSickLeaveBalance, advanceLeaveResetDueAt, leaveTypeHours, leaveBucketFor, LEAVE_BUCKET_FIELDS, cutoffFromSaved, planSpecialLeaveGrantDeduction, roundBalance, type SpecialLeaveGrantDeduction } from "@/lib/timeOffBalances";
import { fetchCutOffTime } from "../settings/actions";

const TABLE = "contractor_profiles";
const LOG_TABLE = "time_off_request_logs";

// Append-only audit trail — one row per decision (Approved/Rejected) a leave
// request lands on, separate from contractor_leave_requests (which the
// Current/Historical Request Data tables still read from — this table is
// purely additive and never read by that UI). Never throws: a logging
// failure must not block the actual leave decision it's recording.
async function logTimeOffRequestHistory(
  sb: ReturnType<typeof getSupabase>,
  entry: {
    requestId: string;
    email: string;
    type: string;
    startDate: string;
    endDate: string;
    durationDays: number;
    reason: string;
    status: string;
    ptoUsedHours: number;
    sickLeaveUsedHours: number;
    specialLeaveUsedHours: number;
  }
): Promise<void> {
  const now = new Date().toISOString();
  await sb.from(LOG_TABLE).insert({
    id: crypto.randomUUID(),
    ...entry,
    decidedAt: now,
    createdAt: now,
  });
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

function toContractor(row: Record<string, unknown>): Contractor {
  return {
    uid:               String(row.uid               ?? ""),
    firstName:         String(row.firstName         ?? ""),
    middleName:        String(row.middleName        ?? ""),
    surname:           String(row.surname           ?? ""),
    fullName:          String(row.fullName          ?? ""),
    avatar:            String(row.avatar            ?? ""),
    dob:               String(row.dob               ?? ""),
    gender:            String(row.gender            ?? ""),
    contractorId:      String(row.contractorId      ?? ""),
    department:        String(row.department        ?? ""),
    subDepartment:     String(row.subDepartment     ?? ""),
    role:              String(row.role              ?? ""),
    location:          String(row.location          ?? ""),
    status:            (row.status === "Dismissed" ? "Dismissed" : "Active"),
    hireDate:          String(row.hireDate          ?? ""),
    officeLocation:    String(row.officeLocation    ?? ""),
    currency:          String(row.currency          ?? ""),
    monthlyRate:       String(row.monthlyRate       ?? ""),
    weeklyRate:        String(row.weeklyRate        ?? ""),
    hourlyRate:        String(row.hourlyRate        ?? ""),
    email:             String(row.email             ?? ""),
    payCategory:       String(row.payCategory       ?? ""),
    shiftHours:        String(row.shiftHours        ?? ""),
    restDay:           String(row.restDay           ?? ""),
    manager:           String(row.manager           ?? ""),
    payPeriod:         String(row.payPeriod         ?? "Sunday – Saturday"),
    shiftType:         String(row.shiftType         ?? "Fixed"),
    createdOn:         String(row.createdOn         ?? ""),
    dismissalDate:     String(row.dismissalDate     ?? ""),
    dismissalReason:   String(row.dismissalReason   ?? ""),
    equipmentProvided: Boolean(row.equipmentProvided),
    worksnapId:        String(row.worksnapId        ?? ""),
    ptoBalance:       Number(row.ptoBalance        ?? 0),
    ptoUsed:          Number(row.ptoUsed           ?? 0),
    ptoUsedImport:    Number(row.pto_used_import   ?? 0),
    sickLeaveBalance: Number(row.sickLeaveBalance  ?? 0),
    sickLeaveUsed:    Number(row.sickLeaveUsed     ?? 0),
    sickUsedImport:   Number(row.sick_used_import  ?? 0),
    birthdayLeave:    Number(row.birthdayLeave     ?? 0),
    birthdayLeaveUsed: Number(row.birthdayLeaveUsed ?? 0),
    advanceSickLeave: Number(row.advanceSickLeave  ?? 0),
    advanceSickLeaveUsed: Number(row.advanceSickLeaveUsed ?? 0),
    specialLeaveCredits: Number(row.specialLeaveCredits ?? 0),
    specialLeaveUsed:    Number(row.specialLeaveUsed    ?? 0),
    specialLeaveGrantedAt: row.specialLeaveGrantedAt == null ? null : String(row.specialLeaveGrantedAt),
    outstandingLeaveBalance:   Number(row.outstandingLeaveBalance   ?? 0),
    outstandingMedicalBalance: Number(row.outstandingMedicalBalance ?? 0),
  };
}

export type FetchParams = {
  page: number;
  pageSize: number;
  country: string;
  status: string;
  rules: FilterRule[];
  search?: string;
  payCategory?: string;
};

// Apply quick-filter + advanced rules to a Supabase query builder
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, country: string, status: string, rules: FilterRule[], search = "", payCategory = "All Categories") {
  if (country !== "All Countries") {
    // locations are stored as "City, Country" — just ilike "%Country" covers both
    // "Gujarat, India" and "India" without the comma parsing issue in .or()
    query = query.ilike("location", `%${country}`);
  }

  if (status !== "All Statuses") {
    query = query.eq("status", status);
  }

  if (payCategory !== "All Categories") {
    query = query.eq("payCategory", payCategory);
  }

  // Name search — fullName can be blank in the DB with the display name only
  // derived client-side from firstName/surname (see contractorFullName), so
  // all three are checked to avoid missing rows with an empty fullName.
  const term = search.trim();
  if (term) {
    query = query.or(`fullName.ilike.%${term}%,firstName.ilike.%${term}%,surname.ilike.%${term}%`);
  }

  for (const rule of rules) {
    const colDef = COLUMNS.find((c) => c.key === rule.column);
    if (!colDef) continue;
    const field = rule.column as string;

    if (colDef.type === "string") {
      const noVal = rule.operator === "is_empty" || rule.operator === "is_not_empty";
      if (!noVal && !rule.value.trim()) continue;
      switch (rule.operator) {
        case "contains":      query = query.ilike(field, `%${rule.value}%`);  break;
        case "not_contains":  query = query.not(field, "ilike", `%${rule.value}%`); break;
        case "starts_with":   query = query.ilike(field, `${rule.value}%`);   break;
        case "ends_with":     query = query.ilike(field, `%${rule.value}`);   break;
        case "equals":        query = query.ilike(field, rule.value);          break;
        case "not_equals":    query = query.not(field, "ilike", rule.value);   break;
        case "is_empty":      query = query.eq(field, "");                     break;
        case "is_not_empty":  query = query.neq(field, "");                    break;
      }
    }

    if (colDef.type === "date") {
      if (!rule.value.trim()) continue;
      switch (rule.operator) {
        case "date_eq":     query = query.eq(field, rule.value);              break;
        case "date_before": query = query.lt(field, rule.value);              break;
        case "date_after":  query = query.gt(field, rule.value);              break;
        case "date_between":
          if (rule.value2?.trim()) {
            query = query.gte(field, rule.value).lte(field, rule.value2);
          }
          break;
      }
    }
    // number columns: handled client-side via postFilterNumbers (rates stored as text)
  }

  return query;
}

// Number-column client-side post-filter (rates stored as text)
function postFilterNumbers(rows: Contractor[], rules: FilterRule[]): Contractor[] {
  const numRules = rules.filter((r) => {
    const col = COLUMNS.find((c) => c.key === r.column);
    return col?.type === "number" && r.operator !== "contains";
  });
  if (!numRules.length) return rows;
  return rows.filter((row) =>
    numRules.every((rule) => {
      const raw = parseFloat(String(row[rule.column as keyof Contractor] ?? "").replace(/[^0-9.-]/g, ""));
      const v1 = parseFloat(rule.value);
      const v2 = parseFloat(rule.value2 ?? "");
      if (isNaN(raw)) return false;
      switch (rule.operator) {
        case "eq":      return raw === v1;
        case "neq":     return raw !== v1;
        case "gt":      return raw > v1;
        case "gte":     return raw >= v1;
        case "lt":      return raw < v1;
        case "lte":     return raw <= v1;
        case "between": return raw >= v1 && raw <= v2;
        default: return true;
      }
    })
  );
}

export async function fetchContractorsPage(params: FetchParams): Promise<{
  rows: Contractor[];
  total: number;
}> {
  const sb = getSupabase();
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  let query = sb.from(TABLE).select("*", { count: "exact" });
  query = applyFilters(query, params.country, params.status, params.rules, params.search, params.payCategory);
  query = query.order("fullName", { ascending: true }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const rows = postFilterNumbers((data ?? []).map(toContractor), params.rules);
  return { rows, total: count ?? 0 };
}

export async function fetchAllContractors(
  params: Omit<FetchParams, "page" | "pageSize">
): Promise<Contractor[]> {
  const sb = getSupabase();
  let query = sb.from(TABLE).select("*");
  query = applyFilters(query, params.country, params.status, params.rules, params.search, params.payCategory);
  query = query.order("id", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return postFilterNumbers((data ?? []).map(toContractor), params.rules);
}

export async function createContractor(c: Contractor): Promise<void> {
  const sb = getSupabase();
  const { data: dupe } = await sb.from(TABLE).select("uid").eq("contractorId", c.contractorId).maybeSingle();
  if (dupe) throw new Error(`Contractor ID "${c.contractorId}" is already in use.`);
  const cutoff = cutoffFromSaved(await fetchCutOffTime());
  const ptoBalance      = calculatePtoBalance(c.hireDate, cutoff);
  const sickLeaveBalance = calculateSickLeaveBalance(c.hireDate, cutoff);
  const { error } = await sb.from(TABLE).insert({
    id:                crypto.randomUUID(),
    uid:               c.uid,
    firstName:         c.firstName,
    middleName:        c.middleName,
    surname:           c.surname,
    fullName:          c.fullName,
    avatar:            c.avatar,
    dob:               c.dob,
    gender:            c.gender,
    contractorId:      c.contractorId,
    department:        c.department,
    subDepartment:     c.subDepartment,
    role:              c.role,
    location:          c.location,
    status:            c.status,
    hireDate:          c.hireDate,
    officeLocation:    c.officeLocation,
    currency:          c.currency,
    monthlyRate:       c.monthlyRate,
    weeklyRate:        c.weeklyRate,
    hourlyRate:        c.hourlyRate,
    email:             c.email,
    payCategory:       c.payCategory,
    shiftHours:        c.shiftHours,
    restDay:           c.restDay,
    manager:           c.manager,
    payPeriod:         c.payPeriod,
    shiftType:         c.shiftType,
    createdOn:         c.createdOn,
    dismissalDate:     c.dismissalDate,
    dismissalReason:   c.dismissalReason,
    equipmentProvided: c.equipmentProvided,
    worksnapId:        c.worksnapId,
    ptoBalance,
    ptoUsed:           c.ptoUsed          ?? 0,
    sickLeaveBalance,
    sickLeaveUsed:     c.sickLeaveUsed    ?? 0,
    birthdayLeave:     c.birthdayLeave    ?? 0,
    birthdayLeaveUsed: c.birthdayLeaveUsed ?? 0,
    advanceSickLeave:  c.advanceSickLeave ?? 0,
    advanceSickLeaveUsed: c.advanceSickLeaveUsed ?? 0,
    specialLeaveCredits: c.specialLeaveCredits ?? 0,
    specialLeaveUsed:    c.specialLeaveUsed    ?? 0,
  });
  if (error) throw new Error(error.message);

  // Auto-provision portal login + send welcome email
  await provisionContractorUser(c);
}

export async function updateContractor(c: Contractor): Promise<void> {
  const sb = getSupabase();
  const { data: dupe } = await sb.from(TABLE).select("uid").eq("contractorId", c.contractorId).neq("uid", c.uid).maybeSingle();
  if (dupe) throw new Error(`Contractor ID "${c.contractorId}" is already in use.`);
  const cutoff = cutoffFromSaved(await fetchCutOffTime());
  const ptoBalance       = calculatePtoBalance(c.hireDate, cutoff);
  const sickLeaveBalance = calculateSickLeaveBalance(c.hireDate, cutoff);

  // Advance PTO/Birthday Leave and Advance Sick Leave are no longer
  // auto-repaid from newly-accrued balance — they're only ever adjusted
  // explicitly via Leave Override/Grant now. Compared against the
  // currently-stored balance/used/advance, not whatever the client happens
  // to have in memory.
  const { data: existing } = await sb.from(TABLE)
    .select("sickLeaveBalance, sickLeaveUsed, advanceSickLeave, advanceSickLeaveUsed, ptoBalance, ptoUsed, birthdayLeave, birthdayLeaveUsed")
    .eq("uid", c.uid)
    .maybeSingle();
  const sickLeaveUsed        = existing?.sickLeaveUsed        ?? (c.sickLeaveUsed        ?? 0);
  const advanceSickLeave     = existing?.advanceSickLeave     ?? (c.advanceSickLeave     ?? 0);
  const advanceSickLeaveUsed = existing?.advanceSickLeaveUsed ?? (c.advanceSickLeaveUsed ?? 0);
  const ptoUsed           = existing?.ptoUsed           ?? (c.ptoUsed           ?? 0);
  const birthdayLeave     = existing?.birthdayLeave     ?? (c.birthdayLeave     ?? 0);
  const birthdayLeaveUsed = existing?.birthdayLeaveUsed ?? (c.birthdayLeaveUsed ?? 0);

  const { error } = await sb.from(TABLE).update({
    firstName:         c.firstName,
    middleName:        c.middleName,
    surname:           c.surname,
    fullName:          c.fullName,
    avatar:            c.avatar,
    dob:               c.dob,
    gender:            c.gender,
    contractorId:      c.contractorId,
    department:        c.department,
    subDepartment:     c.subDepartment,
    role:              c.role,
    location:          c.location,
    status:            c.status,
    hireDate:          c.hireDate,
    officeLocation:    c.officeLocation,
    currency:          c.currency,
    monthlyRate:       c.monthlyRate,
    weeklyRate:        c.weeklyRate,
    hourlyRate:        c.hourlyRate,
    email:             c.email,
    payCategory:       c.payCategory,
    shiftHours:        c.shiftHours,
    restDay:           c.restDay,
    manager:           c.manager,
    payPeriod:         c.payPeriod,
    shiftType:         c.shiftType,
    createdOn:         c.createdOn,
    dismissalDate:     c.dismissalDate,
    dismissalReason:   c.dismissalReason,
    equipmentProvided: c.equipmentProvided,
    worksnapId:        c.worksnapId,
    ptoBalance,
    ptoUsed,
    sickLeaveBalance,
    sickLeaveUsed,
    birthdayLeave,
    birthdayLeaveUsed,
    advanceSickLeave,
    advanceSickLeaveUsed,
    specialLeaveCredits: c.specialLeaveCredits ?? 0,
    specialLeaveUsed:    c.specialLeaveUsed    ?? 0,
  }).eq("uid", c.uid);
  if (error) throw new Error(error.message);
}

export async function deleteContractor(uid: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).delete().eq("uid", uid);
  if (error) throw new Error(error.message);
}

export async function updateTimeOffUsage(
  uid: string,
  fields: Partial<{
    ptoUsed: number; sickLeaveUsed: number; birthdayLeave: number; birthdayLeaveUsed: number;
    advanceSickLeave: number; advanceSickLeaveUsed: number;
    specialLeaveCredits: number; specialLeaveUsed: number; specialLeaveGrantedAt: string | null;
  }>
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).update(fields).eq("uid", uid);
  if (error) throw new Error(error.message);
}

// Bulk-sets the imported/legacy PTO Used or Medical Unavailability Used baseline (pto_used_import /
// sick_used_import) from an admin-uploaded CSV, matching contractors by email.
// One update per row so a typo'd/missing email fails just that row instead of
// aborting the whole batch.
export async function bulkImportUsedImport(
  type: "pto" | "sick",
  entries: { email: string; hours: number }[],
): Promise<{ results: { email: string; ok: boolean; error?: string }[] }> {
  const sb = getSupabase();
  const column = type === "pto" ? "pto_used_import" : "sick_used_import";
  const results: { email: string; ok: boolean; error?: string }[] = [];
  for (const { email, hours } of entries) {
    const { data, error } = await sb.from(TABLE).update({ [column]: hours }).eq("email", email).select("uid");
    if (error) { results.push({ email, ok: false, error: error.message }); continue; }
    if (!data || data.length === 0) { results.push({ email, ok: false, error: "No contractor found with this email" }); continue; }
    results.push({ email, ok: true });
  }
  return { results };
}

export async function backfillLeaveBalances(): Promise<{ updated: number }> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE)
    .select("uid, email, hireDate, sickLeaveBalance, sickLeaveUsed, advanceSickLeave, advanceSickLeaveUsed, ptoBalance, ptoUsed, birthdayLeave, birthdayLeaveUsed");
  if (error) throw new Error(error.message);

  const cutoff = cutoffFromSaved(await fetchCutOffTime());
  let updated = 0;
  for (const row of data ?? []) {
    if (!row.hireDate) continue;
    const ptoBalance       = calculatePtoBalance(row.hireDate, cutoff);
    const sickLeaveBalance = calculateSickLeaveBalance(row.hireDate, cutoff);
    // Advance PTO/Birthday Leave and Advance Sick Leave are no longer
    // auto-repaid — the used/advance/advanceUsed fields are carried through
    // unchanged; only the underlying accrued balance is refreshed.
    const sickLeaveUsed        = row.sickLeaveUsed        ?? 0;
    const advanceSickLeave     = row.advanceSickLeave     ?? 0;
    const advanceSickLeaveUsed = row.advanceSickLeaveUsed ?? 0;
    const ptoUsed           = row.ptoUsed           ?? 0;
    const birthdayLeave     = row.birthdayLeave     ?? 0;
    const birthdayLeaveUsed = row.birthdayLeaveUsed ?? 0;
    await sb.from(TABLE).update({
      ptoBalance, ptoUsed, sickLeaveBalance, sickLeaveUsed,
      birthdayLeave,
      birthdayLeaveUsed,
      advanceSickLeave,
      advanceSickLeaveUsed,
    }).eq("uid", row.uid);
    updated++;
  }
  return { updated };
}

// Zeroes Advance PTO/Birthday Leave and Advance Sick Leave once per Cut Off
// Time cycle — the same annual boundary PTO/Sick Leave Accrual resets on
// (Settings → Time Away Settings, defaulting to March 1st/end of February).
// Unlike the accrual formulas, these are manually-granted amounts with no
// time-based formula, so advanceLeaveResetAt marks the cutoff cycle each
// contractor was last reset for — a contractor already reset this cycle is
// left untouched, so Advance Leave granted after the cutoff survives this
// running again before the next one. Called daily by api/cron/leave-balance-reset.
export async function resetAdvanceLeaveIfDue(): Promise<{ updated: number }> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE)
    .select("uid, birthdayLeave, birthdayLeaveUsed, advanceSickLeave, advanceSickLeaveUsed, advanceLeaveResetAt");
  if (error) throw new Error(error.message);

  const cutoff = cutoffFromSaved(await fetchCutOffTime());
  let updated = 0;
  for (const row of data ?? []) {
    const resetDueIso = advanceLeaveResetDueAt(row.advanceLeaveResetAt ?? null, cutoff);
    if (!resetDueIso) continue;
    const { error: updateError } = await sb.from(TABLE).update({
      birthdayLeave: 0,
      birthdayLeaveUsed: 0,
      advanceSickLeave: 0,
      advanceSickLeaveUsed: 0,
      advanceLeaveResetAt: resetDueIso,
    }).eq("uid", row.uid);
    if (updateError) throw new Error(updateError.message);
    updated++;
  }
  return { updated };
}

// Snapshot of a currently-negative PTO/Medical Unavailability Available onto
// contractor_profiles, run on demand from the Time Away "Process" action
// (not live-computed like the balances themselves) so the deficit an admin
// saw at process time is preserved even if later usage brings Available back
// to zero or positive. Only ever written while negative — a row whose
// Available is non-negative is left untouched entirely, never reset to 0.
// Stored as a positive magnitude (e.g. -8 saves as 8) since these are
// "outstanding" deduction amounts, not signed balances.
export async function processOutstandingBalances(
  entries: { uid: string; ptoAvailable: number; sickLeaveAvailable: number }[]
): Promise<{ updated: number }> {
  const sb = getSupabase();
  let updated = 0;
  for (const entry of entries) {
    const fields: Record<string, number> = {};
    if (entry.ptoAvailable < 0) fields.outstandingLeaveBalance = Math.abs(entry.ptoAvailable);
    if (entry.sickLeaveAvailable < 0) fields.outstandingMedicalBalance = Math.abs(entry.sickLeaveAvailable);
    if (Object.keys(fields).length === 0) continue;
    const { error } = await sb.from(TABLE).update(fields).eq("uid", entry.uid);
    if (error) throw new Error(error.message);
    updated++;
  }
  return { updated };
}

// Clears the outstandingLeaveBalance/outstandingMedicalBalance snapshot back
// to 0 for every contractor that has one on file — the Time Away "Reset"
// action, only enabled once no contractor's PTO/Medical Unavailability
// Available is currently negative (see negativeCount in ProcessTimeOffModal),
// so this never wipes a deficit that's still outstanding.
export async function resetOutstandingBalances(): Promise<{ updated: number }> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE)
    .select("uid, outstandingLeaveBalance, outstandingMedicalBalance")
    .or("outstandingLeaveBalance.neq.0,outstandingMedicalBalance.neq.0");
  if (error) throw new Error(error.message);

  let updated = 0;
  for (const row of data ?? []) {
    const { error: updateError } = await sb.from(TABLE).update({
      outstandingLeaveBalance: 0,
      outstandingMedicalBalance: 0,
    }).eq("uid", row.uid);
    if (updateError) throw new Error(updateError.message);
    updated++;
  }
  return { updated };
}

// Zeroes ptoUsed/birthdayLeave/birthdayLeaveUsed (the PTO side) and
// sickLeaveUsed/advanceSickLeave/advanceSickLeaveUsed (the Medical side) for
// every contractor — the Time Away "Reset PTO Used / Sick Leave Used" action.
//
// Before zeroing each side, it captures that side's CURRENT deficit into
// outstandingLeaveBalance/outstandingMedicalBalance — the same "negative
// Available → positive magnitude" logic processOutstandingBalances uses for
// the "Process" action, just run inline here instead of requiring Process to
// have already been clicked. If Available on that side isn't negative,
// Outstanding Balance is set to 0 (there's nothing owed). This replaces the
// old behavior of skipping a side entirely while its Outstanding Balance was
// still nonzero — that existed only because stale Used data could double
// count against a stale Outstanding Balance; recomputing Outstanding Balance
// fresh from live data here removes the need for that precondition.
//
// Archives that contractor's "Approved" requests of the matching leave
// type(s) on each side — their hours were just zeroed out of the profile, so
// leaving them sitting as "Approved" in Request History would be stale/
// misleading. Pending requests are left alone (still awaiting a decision),
// and Special Leave is untouched (its own separate bucket, not part of
// PTO/Sick Leave Used at all). Does not touch ptoUsedImport/sickUsedImport.
const PTO_SIDE_TYPES = ["PTO", "PTO Half Day", "Advance PTO/Birthday Leave", "Advance PTO/Birthday Leave Half Day"];
const MEDICAL_SIDE_TYPES = ["Sick Leave", "Sick Leave Half Day", "Unpaid Leave", "Advance Sick Leave", "Advance Sick Leave Half Day"];

export async function resetUsedHours(): Promise<{ updated: number }> {
  const sb = getSupabase();
  const cutoff = cutoffFromSaved(await fetchCutOffTime());
  const { data, error } = await sb.from(TABLE)
    .select("uid, email, hireDate, ptoUsed, pto_used_import, sickLeaveUsed, sick_used_import, birthdayLeave, birthdayLeaveUsed, advanceSickLeave, advanceSickLeaveUsed, outstandingLeaveBalance, outstandingMedicalBalance");
  if (error) throw new Error(error.message);

  const now = new Date().toISOString();
  let updated = 0;
  for (const row of data ?? []) {
    const hireDate = String(row.hireDate ?? "");
    if (!hireDate) continue;

    const ptoUsedImport = Number(row.pto_used_import ?? 0);
    const sickUsedImport = Number(row.sick_used_import ?? 0);
    const birthdayLeaveUsed = Number(row.birthdayLeaveUsed ?? 0);
    const advanceSickLeaveUsed = Number(row.advanceSickLeaveUsed ?? 0);

    const ptoBalance = calculatePtoBalance(hireDate, cutoff);
    const sickLeaveBalance = calculateSickLeaveBalance(hireDate, cutoff);
    const effectivePtoUsed = (ptoUsedImport > 0 ? ptoUsedImport : Number(row.ptoUsed ?? 0)) + birthdayLeaveUsed;
    const effectiveSickUsed = (sickUsedImport > 0 ? sickUsedImport : Number(row.sickLeaveUsed ?? 0)) + advanceSickLeaveUsed;
    const ptoAvailableRaw = ptoBalance - effectivePtoUsed;
    const sickAvailableRaw = sickLeaveBalance - effectiveSickUsed;

    const newOutstandingLeaveBalance = ptoAvailableRaw < 0 ? Math.abs(ptoAvailableRaw) : 0;
    const newOutstandingMedicalBalance = sickAvailableRaw < 0 ? Math.abs(sickAvailableRaw) : 0;
    const currentOutstandingLeaveBalance = row.outstandingLeaveBalance ?? 0;
    const currentOutstandingMedicalBalance = row.outstandingMedicalBalance ?? 0;

    const fields: Record<string, number> = {};
    let ptoSideTouched = false;
    let medicalSideTouched = false;

    if (row.ptoUsed) { fields.ptoUsed = 0; ptoSideTouched = true; }
    if (row.birthdayLeave) { fields.birthdayLeave = 0; ptoSideTouched = true; }
    if (row.birthdayLeaveUsed) { fields.birthdayLeaveUsed = 0; ptoSideTouched = true; }
    if (newOutstandingLeaveBalance !== currentOutstandingLeaveBalance) { fields.outstandingLeaveBalance = newOutstandingLeaveBalance; ptoSideTouched = true; }

    if (row.sickLeaveUsed) { fields.sickLeaveUsed = 0; medicalSideTouched = true; }
    if (row.advanceSickLeave) { fields.advanceSickLeave = 0; medicalSideTouched = true; }
    if (row.advanceSickLeaveUsed) { fields.advanceSickLeaveUsed = 0; medicalSideTouched = true; }
    if (newOutstandingMedicalBalance !== currentOutstandingMedicalBalance) { fields.outstandingMedicalBalance = newOutstandingMedicalBalance; medicalSideTouched = true; }

    if (Object.keys(fields).length === 0) continue;
    const { error: updateError } = await sb.from(TABLE).update(fields).eq("uid", row.uid);
    if (updateError) throw new Error(updateError.message);
    updated++;

    const email = String(row.email ?? "");
    if (email && ptoSideTouched) {
      await sb.from(LEAVE_TABLE).update({ status: "Archived", updatedAt: now })
        .eq("email", email).eq("status", "Approved").in("type", PTO_SIDE_TYPES);
    }
    if (email && medicalSideTouched) {
      await sb.from(LEAVE_TABLE).update({ status: "Archived", updatedAt: now })
        .eq("email", email).eq("status", "Approved").in("type", MEDICAL_SIDE_TYPES);
    }
  }
  return { updated };
}

const LEAVE_TABLE = "contractor_leave_requests";

export type AdminLeaveRequest = {
  id:                 string;
  email:              string;
  type:               string;
  startDate:          string;
  endDate:            string;
  durationDays:       number;
  reason:             string;
  status:             string;
  ptoUsedHours:       number;
  sickLeaveUsedHours: number;
  specialLeaveUsedHours: number;
  createdAt:          string;
};

export async function fetchAllLeaveRequestsAdmin(): Promise<AdminLeaveRequest[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(LEAVE_TABLE)
    .select("id, email, type, startDate, endDate, durationDays, reason, status, ptoUsedHours, sickLeaveUsedHours, specialLeaveUsedHours, createdAt")
    .order("createdAt", { ascending: false });

  if (error || !data) return [];
  return data.map((r) => ({
    id:                 String(r.id),
    email:              String(r.email),
    type:               String(r.type),
    startDate:          String(r.startDate),
    endDate:            String(r.endDate),
    durationDays:       Number(r.durationDays),
    reason:             String(r.reason ?? ""),
    status:             String(r.status ?? "Pending"),
    ptoUsedHours:       Number(r.ptoUsedHours ?? 0),
    sickLeaveUsedHours: Number(r.sickLeaveUsedHours ?? 0),
    specialLeaveUsedHours: Number(r.specialLeaveUsedHours ?? 0),
    createdAt:          String(r.createdAt),
  }));
}

const GRANTS_TABLE = "special_leave_grants";

export type SpecialLeaveGrant = {
  id: string;
  email: string;
  hours: number;
  hoursUsed: number;
  grantDate: string;
  note: string | null;
  expirationDays: number | null;
  createdAt: string;
};

// Bulk-fetch-then-client-filter, same pattern as fetchAllLeaveRequestsAdmin —
// Hourly-only (see time-off/page.tsx), but fetched for every contractor at
// once rather than per-row.
export async function fetchAllSpecialLeaveGrantsAdmin(): Promise<SpecialLeaveGrant[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(GRANTS_TABLE)
    .select("id, email, hours, hoursUsed, grantDate, note, expirationDays, createdAt")
    .order("createdAt", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: String(r.id),
    email: String(r.email),
    hours: Number(r.hours ?? 0),
    hoursUsed: Number(r.hoursUsed ?? 0),
    grantDate: String(r.grantDate ?? ""),
    note: r.note != null ? String(r.note) : null,
    expirationDays: r.expirationDays != null ? Number(r.expirationDays) : null,
    createdAt: String(r.createdAt),
  }));
}

export async function addSpecialLeaveGrant(params: {
  email: string;
  hours: number;
  grantDate: string;
  note: string;
  expirationDays: number | null;
}): Promise<{ ok: boolean; error?: string; grant?: SpecialLeaveGrant }> {
  if (params.hours <= 0) return { ok: false, error: "Hours must be greater than 0." };
  const sb = getSupabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const grant: SpecialLeaveGrant = {
    id,
    email: params.email,
    hours: params.hours,
    hoursUsed: 0,
    grantDate: params.grantDate,
    note: params.note.trim() || null,
    expirationDays: params.expirationDays,
    createdAt: now,
  };
  const { error } = await sb.from(GRANTS_TABLE).insert(grant);
  if (error) return { ok: false, error: error.message };
  return { ok: true, grant };
}

export async function updateLeaveRequestStatus(
  id: string,
  status: "Approved" | "Rejected"
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();

  // Fetch the request so we know email, type, its stored hours, and prior status
  const { data: req, error: fetchErr } = await sb
    .from(LEAVE_TABLE)
    .select("email, type, status, ptoUsedHours, sickLeaveUsedHours, specialLeaveUsedHours, startDate, endDate, durationDays, reason")
    .eq("id", id)
    .single();
  if (fetchErr || !req) return { ok: false, error: fetchErr?.message ?? "Request not found" };

  const prevStatus    = String(req.status);
  const email         = String(req.email);
  const type          = String(req.type);           // "PTO" | "PTO Half Day" | "Sick Leave" | "Sick Leave Half Day" | "Special Leave" | ...
  const bucket        = leaveBucketFor(type);
  const { usedField, balanceField, hoursColumn, label: leaveLabel } = LEAVE_BUCKET_FIELDS[bucket];
  // Use the hours stamped on the request itself (set at submission time) so
  // this stays consistent with what's shown in the admin tables, and so a
  // future change to LEAVE_TYPE_HOURS never rewrites already-submitted requests.
  const hours         = Number(req[hoursColumn]) || leaveTypeHours(type);

  // Fetch current contractor leave balance
  const { data: profile, error: profileErr } = await sb
    .from(TABLE)
    .select("ptoUsed, sickLeaveUsed, specialLeaveUsed, ptoBalance, sickLeaveBalance, specialLeaveCredits")
    .eq("email", email)
    .single();
  if (profileErr || !profile) return { ok: false, error: profileErr?.message ?? "Contractor not found" };

  const currentUsed = Number(profile[usedField] ?? 0);
  const balance     = Number(profile[balanceField] ?? 0);
  const available   = balance - currentUsed;

  let newUsed = currentUsed;

  if (status === "Approved" && prevStatus !== "Approved") {
    // Block approval outright if the employee doesn't have enough available
    // balance for this request's leave type — no partial/overdrawn approvals.
    if (available < hours) {
      return {
        ok: false,
        error: `This contractor does not have enough available ${leaveLabel} balance to approve this request. Available: ${available}h, Required: ${hours}h.`,
      };
    }
    // Only Approved requests count toward Used — add this request's fixed hours.
    newUsed = currentUsed + hours;
  } else if (status !== "Approved" && prevStatus === "Approved") {
    // Un-approving (Declined/Rejected) reverses the previously-deducted hours.
    newUsed = Math.max(currentUsed - hours, 0);
  }
  // If status unchanged or no balance impact, newUsed stays the same

  // Update both tables — also re-stamp the request's own hours field so it
  // never diverges from what was actually deducted (e.g. a stale 0 from a
  // request submitted before this column existed self-heals here).
  const [{ error: reqErr }, { error: profileUpdateErr }] = await Promise.all([
    sb.from(LEAVE_TABLE).update({ status, [hoursColumn]: hours, updatedAt: new Date().toISOString() }).eq("id", id),
    sb.from(TABLE).update({ [usedField]: newUsed }).eq("email", email),
  ]);

  if (reqErr)           return { ok: false, error: reqErr.message };
  if (profileUpdateErr) return { ok: false, error: profileUpdateErr.message };

  await logTimeOffRequestHistory(sb, {
    requestId: id,
    email,
    type,
    startDate: String(req.startDate),
    endDate: String(req.endDate),
    durationDays: Number(req.durationDays),
    reason: String(req.reason ?? ""),
    status,
    ptoUsedHours: hoursColumn === "ptoUsedHours" ? hours : Number(req.ptoUsedHours ?? 0),
    sickLeaveUsedHours: hoursColumn === "sickLeaveUsedHours" ? hours : Number(req.sickLeaveUsedHours ?? 0),
    specialLeaveUsedHours: hoursColumn === "specialLeaveUsedHours" ? hours : Number(req.specialLeaveUsedHours ?? 0),
  });

  return { ok: true };
}

// Hourly-only Special Leave drawdown — spends the oldest non-expired
// grant(s) first (see planSpecialLeaveGrantDeduction), spanning into the
// next-oldest grant if one alone doesn't cover hoursNeeded. Returns the
// exact per-grant breakdown so the caller can stamp it on the leave request
// for precise reversal later.
async function deductSpecialLeaveGrantHours(
  sb: ReturnType<typeof getSupabase>,
  email: string,
  hoursNeeded: number
): Promise<{ ok: true; deductions: SpecialLeaveGrantDeduction[] } | { ok: false; error: string }> {
  const { data: grants, error } = await sb
    .from(GRANTS_TABLE)
    .select("id, hours, hoursUsed, grantDate, expirationDays")
    .eq("email", email);
  if (error) return { ok: false, error: error.message };

  const plan = planSpecialLeaveGrantDeduction(
    (grants ?? []).map((g) => ({
      id: String(g.id),
      hours: Number(g.hours ?? 0),
      hoursUsed: Number(g.hoursUsed ?? 0),
      grantDate: String(g.grantDate ?? ""),
      expirationDays: g.expirationDays != null ? Number(g.expirationDays) : null,
    })),
    hoursNeeded
  );
  if (!plan.ok) return plan;

  for (const d of plan.deductions) {
    const grant = grants!.find((g) => String(g.id) === d.grantId)!;
    const { error: updErr } = await sb
      .from(GRANTS_TABLE)
      .update({ hoursUsed: roundBalance(Number(grant.hoursUsed ?? 0) + d.hours) })
      .eq("id", d.grantId);
    if (updErr) return { ok: false, error: updErr.message };
  }
  return { ok: true, deductions: plan.deductions };
}

// Admin-driven override — creates a leave request already Approved and
// applies its balance deduction immediately, bypassing the normal
// Pending -> Approve/Decline flow and the insufficient-balance check
// (an override is an explicit admin action, not a contractor-submitted
// request awaiting review).
export async function createLeaveOverride(params: {
  email: string;
  type: "PTO" | "PTO Half Day" | "Sick Leave" | "Sick Leave Half Day" | "Unpaid Leave" | "Special Leave";
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<{ ok: boolean; error?: string; request?: AdminLeaveRequest }> {
  const sb = getSupabase();

  const hours = leaveTypeHours(params.type);
  const bucket = leaveBucketFor(params.type);
  const { usedField } = LEAVE_BUCKET_FIELDS[bucket];
  const ptoUsedHours = bucket === "pto" ? hours : 0;
  const sickLeaveUsedHours = bucket === "sickLeave" ? hours : 0;
  const specialLeaveUsedHours = bucket === "specialLeave" ? hours : 0;

  const durationDays = Math.max(
    1,
    Math.round((new Date(params.endDate).getTime() - new Date(params.startDate).getTime()) / 86400000) + 1
  );

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: insertErr } = await sb.from(LEAVE_TABLE).insert({
    id,
    email: params.email,
    type: params.type,
    startDate: params.startDate,
    endDate: params.endDate,
    durationDays,
    reason: params.reason,
    status: "Approved",
    ptoUsedHours,
    sickLeaveUsedHours,
    specialLeaveUsedHours,
    createdAt: now,
    updatedAt: now,
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  const hoursToAdd = hours;
  if (hoursToAdd > 0) {
    if (bucket === "specialLeave") {
      const { data: profile, error: profileErr } = await sb
        .from(TABLE)
        .select("payCategory, specialLeaveUsed")
        .eq("email", params.email)
        .single();
      if (profileErr || !profile) return { ok: false, error: profileErr?.message ?? "Contractor not found" };

      // Hourly and Fixed-Ind both use the multi-grant system; every other pay
      // category (currently just Fixed-Mex) keeps the single scalar balance.
      const payCategoryLower = String(profile.payCategory ?? "").trim().toLowerCase();
      const usesGrants = payCategoryLower === "hourly" || payCategoryLower === "fixed-ind";
      if (usesGrants) {
        const result = await deductSpecialLeaveGrantHours(sb, params.email, hoursToAdd);
        if (!result.ok) return { ok: false, error: result.error };
        const { error: attachErr } = await sb
          .from(LEAVE_TABLE)
          .update({ specialLeaveGrantDeductions: result.deductions })
          .eq("id", id);
        if (attachErr) return { ok: false, error: attachErr.message };
      } else {
        const currentUsed = Number(profile.specialLeaveUsed ?? 0);
        const { error: profileUpdateErr } = await sb
          .from(TABLE)
          .update({ specialLeaveUsed: currentUsed + hoursToAdd })
          .eq("email", params.email);
        if (profileUpdateErr) return { ok: false, error: profileUpdateErr.message };
      }
    } else {
      const { data: profile, error: profileErr } = await sb
        .from(TABLE)
        .select("ptoUsed, sickLeaveUsed, specialLeaveUsed")
        .eq("email", params.email)
        .single();
      if (profileErr || !profile) return { ok: false, error: profileErr?.message ?? "Contractor not found" };

      const currentUsed = Number(profile[usedField] ?? 0);
      const { error: profileUpdateErr } = await sb
        .from(TABLE)
        .update({ [usedField]: currentUsed + hoursToAdd })
        .eq("email", params.email);
      if (profileUpdateErr) return { ok: false, error: profileUpdateErr.message };
    }
  }

  await logTimeOffRequestHistory(sb, {
    requestId: id,
    email: params.email,
    type: params.type,
    startDate: params.startDate,
    endDate: params.endDate,
    durationDays,
    reason: params.reason,
    status: "Approved",
    ptoUsedHours,
    sickLeaveUsedHours,
    specialLeaveUsedHours,
  });

  return {
    ok: true,
    request: {
      id,
      email: params.email,
      type: params.type,
      startDate: params.startDate,
      endDate: params.endDate,
      durationDays,
      reason: params.reason,
      status: "Approved",
      ptoUsedHours,
      sickLeaveUsedHours,
      specialLeaveUsedHours,
      createdAt: now,
    },
  };
}

// Same admin-driven override pattern as createLeaveOverride above, but for
// consuming the Advance PTO/Birthday Leave or Advance Sick Leave allotment
// instead of the normal PTO/Sick Leave balance — checked against
// birthdayLeave/advanceSickLeave and deducted from
// birthdayLeaveUsed/advanceSickLeaveUsed, never touching normal ptoUsed/
// sickLeaveUsed. contractor_leave_requests has no dedicated hours column for
// this, so — like Unpaid Leave — its hours are stamped on sickLeaveUsedHours
// purely for the historical-request display, not for any balance math.
export async function createAdvanceLeaveOverride(params: {
  email: string;
  type: "Advance PTO/Birthday Leave" | "Advance Sick Leave" | "Advance PTO/Birthday Leave Half Day" | "Advance Sick Leave Half Day";
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<{ ok: boolean; error?: string; request?: AdminLeaveRequest }> {
  const sb = getSupabase();

  const isPto = params.type.startsWith("Advance PTO/Birthday Leave");
  const standardHours = leaveTypeHours(params.type);

  const { data: profile, error: profileErr } = await sb
    .from(TABLE)
    .select("birthdayLeave, birthdayLeaveUsed, advanceSickLeave, advanceSickLeaveUsed")
    .eq("email", params.email)
    .single();
  if (profileErr || !profile) return { ok: false, error: profileErr?.message ?? "Contractor not found" };

  // balance (Time) is the granted pool and never shrinks on its own — only
  // Used grows as it's consumed — so the cap must be against Available
  // (balance - already used), not the raw balance itself, or every override
  // after the first would see the same unchanged balance and deduct a full
  // 8h again instead of whatever's actually left.
  const balance = isPto ? Number(profile.birthdayLeave ?? 0) : Number(profile.advanceSickLeave ?? 0);
  const alreadyUsed = isPto ? Number(profile.birthdayLeaveUsed ?? 0) : Number(profile.advanceSickLeaveUsed ?? 0);
  const available = Math.max(balance - alreadyUsed, 0);
  if (available <= 0) {
    const label = isPto ? "Advance PTO/Birthday Leave" : "Advance Medical Unavailability";
    return { ok: false, error: `${label} has no balance remaining for this override.` };
  }
  // Deduction is capped to whatever's actually available — e.g. 12h available
  // takes a full 8h first filing, leaving 4h; the next filing then only
  // takes that remaining 4h instead of being blocked for falling short of 8h.
  const hours = Math.min(standardHours, available);

  const durationDays = Math.max(
    1,
    Math.round((new Date(params.endDate).getTime() - new Date(params.startDate).getTime()) / 86400000) + 1
  );

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: insertErr } = await sb.from(LEAVE_TABLE).insert({
    id,
    email: params.email,
    type: params.type,
    startDate: params.startDate,
    endDate: params.endDate,
    durationDays,
    reason: params.reason,
    status: "Approved",
    ptoUsedHours: 0,
    sickLeaveUsedHours: hours,
    specialLeaveUsedHours: 0,
    createdAt: now,
    updatedAt: now,
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  const { error: profileUpdateErr } = isPto
    ? await sb.from(TABLE).update({ birthdayLeaveUsed: alreadyUsed + hours }).eq("email", params.email)
    : await sb.from(TABLE).update({ advanceSickLeaveUsed: alreadyUsed + hours }).eq("email", params.email);
  if (profileUpdateErr) return { ok: false, error: profileUpdateErr.message };

  await logTimeOffRequestHistory(sb, {
    requestId: id,
    email: params.email,
    type: params.type,
    startDate: params.startDate,
    endDate: params.endDate,
    durationDays,
    reason: params.reason,
    status: "Approved",
    ptoUsedHours: 0,
    sickLeaveUsedHours: hours,
    specialLeaveUsedHours: 0,
  });

  return {
    ok: true,
    request: {
      id,
      email: params.email,
      type: params.type,
      startDate: params.startDate,
      endDate: params.endDate,
      durationDays,
      reason: params.reason,
      status: "Approved",
      ptoUsedHours: 0,
      sickLeaveUsedHours: hours,
      specialLeaveUsedHours: 0,
      createdAt: now,
    },
  };
}

// Deletes a leave request outright (used from Historical Request Data). If
// the request was Approved, its balance deduction is reversed first so
// deleting it never leaves ptoUsed/sickLeaveUsed permanently inflated with
// no record left to explain the number.
// Shared by delete and archive below — if the request being removed from view
// was "Approved", its balance deduction needs reversing exactly once,
// regardless of which of the two actually happens to the row afterward.
async function reverseApprovedBalanceIfNeeded(
  sb: ReturnType<typeof getSupabase>,
  req: { email: unknown; type: unknown; status: unknown; ptoUsedHours: unknown; sickLeaveUsedHours: unknown; specialLeaveUsedHours: unknown; specialLeaveGrantDeductions: unknown }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (String(req.status) !== "Approved") return { ok: true };
  const type = String(req.type);

  // Advance PTO/Birthday Leave and Advance Sick Leave don't run through the
  // normal PTO/Sick/Special buckets (see createAdvanceLeaveOverride) — they
  // need their own reversal against birthdayLeaveUsed/advanceSickLeaveUsed
  // instead, or leaveBucketFor would misroute them into the normal
  // sickLeaveUsed field and corrupt it.
  if (type.startsWith("Advance PTO/Birthday Leave") || type.startsWith("Advance Sick Leave")) {
    const isPto = type.startsWith("Advance PTO/Birthday Leave");
    const hours = Number(req.sickLeaveUsedHours) || 0;

    if (hours > 0) {
      const { data: profile, error: profileErr } = await sb
        .from(TABLE)
        .select("birthdayLeaveUsed, advanceSickLeaveUsed")
        .eq("email", String(req.email))
        .single();
      if (profileErr || !profile) return { ok: false, error: profileErr?.message ?? "Contractor not found" };

      const currentUsed = isPto ? Number(profile.birthdayLeaveUsed ?? 0) : Number(profile.advanceSickLeaveUsed ?? 0);
      const { error: profileUpdateErr } = isPto
        ? await sb.from(TABLE).update({ birthdayLeaveUsed: Math.max(currentUsed - hours, 0) }).eq("email", String(req.email))
        : await sb.from(TABLE).update({ advanceSickLeaveUsed: Math.max(currentUsed - hours, 0) }).eq("email", String(req.email));
      if (profileUpdateErr) return { ok: false, error: profileUpdateErr.message };
    }
  } else if (type.startsWith("Special Leave") && Array.isArray(req.specialLeaveGrantDeductions) && req.specialLeaveGrantDeductions.length > 0) {
    // Hourly grant-based reversal — the presence of a non-empty
    // specialLeaveGrantDeductions array is itself the Hourly discriminator
    // (only createLeaveOverride's Hourly branch ever populates it), so no
    // separate payCategory lookup is needed. Reverses the EXACT amount taken
    // from each grant at deduction time, which stays correct even if grants
    // have since been edited/added, unlike guessing a reversal order.
    for (const d of req.specialLeaveGrantDeductions as { grantId: string; hours: number }[]) {
      const { data: grant, error: grantErr } = await sb.from(GRANTS_TABLE).select("hoursUsed").eq("id", d.grantId).single();
      if (grantErr || !grant) continue; // grant row no longer exists — skip rather than fail the whole reversal
      const { error: updErr } = await sb
        .from(GRANTS_TABLE)
        .update({ hoursUsed: Math.max(0, Number(grant.hoursUsed ?? 0) - d.hours) })
        .eq("id", d.grantId);
      if (updErr) return { ok: false, error: updErr.message };
    }
  } else {
    const bucket = leaveBucketFor(type);
    const { usedField, hoursColumn } = LEAVE_BUCKET_FIELDS[bucket];
    const hours = Number(req[hoursColumn as "ptoUsedHours" | "sickLeaveUsedHours" | "specialLeaveUsedHours"]) || 0;

    if (hours > 0) {
      const { data: profile, error: profileErr } = await sb
        .from(TABLE)
        .select("ptoUsed, sickLeaveUsed, specialLeaveUsed")
        .eq("email", String(req.email))
        .single();
      if (profileErr || !profile) return { ok: false, error: profileErr?.message ?? "Contractor not found" };

      const currentUsed = Number(profile[usedField] ?? 0);
      const { error: profileUpdateErr } = await sb
        .from(TABLE)
        .update({ [usedField]: Math.max(currentUsed - hours, 0) })
        .eq("email", String(req.email));
      if (profileUpdateErr) return { ok: false, error: profileUpdateErr.message };
    }
  }

  return { ok: true };
}

export async function deleteLeaveRequestAdmin(id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();

  const { data: req, error: fetchErr } = await sb
    .from(LEAVE_TABLE)
    .select("email, type, status, ptoUsedHours, sickLeaveUsedHours, specialLeaveUsedHours, specialLeaveGrantDeductions")
    .eq("id", id)
    .single();
  if (fetchErr || !req) return { ok: false, error: fetchErr?.message ?? "Request not found" };

  const reversal = await reverseApprovedBalanceIfNeeded(sb, req);
  if (!reversal.ok) return reversal;

  const { error: deleteErr } = await sb.from(LEAVE_TABLE).delete().eq("id", id);
  if (deleteErr) return { ok: false, error: deleteErr.message };

  return { ok: true };
}

// Same balance reversal as delete above — an archived request is treated
// exactly like a deleted one for balance purposes, clearing whatever it had
// deducted — but the row itself is kept and just re-stamped with status
// "Archived" instead of being removed from contractor_leave_requests.
export async function archiveLeaveRequestAdmin(id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();

  const { data: req, error: fetchErr } = await sb
    .from(LEAVE_TABLE)
    .select("email, type, status, ptoUsedHours, sickLeaveUsedHours, specialLeaveUsedHours, specialLeaveGrantDeductions")
    .eq("id", id)
    .single();
  if (fetchErr || !req) return { ok: false, error: fetchErr?.message ?? "Request not found" };

  const reversal = await reverseApprovedBalanceIfNeeded(sb, req);
  if (!reversal.ok) return reversal;

  const { error: updateErr } = await sb.from(LEAVE_TABLE).update({ status: "Archived", updatedAt: new Date().toISOString() }).eq("id", id);
  if (updateErr) return { ok: false, error: updateErr.message };

  return { ok: true };
}
