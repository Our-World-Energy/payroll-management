"use server";

import { createClient } from "@supabase/supabase-js";
import type { Contractor, FilterRule } from "./types";
import { COLUMNS } from "./types";
import { provisionContractorUser } from "@/lib/provisionContractor";
import { calculatePtoBalance, calculateSickLeaveBalance, applyAdvanceSickLeaveRepayment, applyAdvancePtoRepayment, leaveTypeHours, leaveBucketFor, LEAVE_BUCKET_FIELDS } from "@/lib/timeOffBalances";

const TABLE = "contractor_profiles";

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
    sickLeaveBalance: Number(row.sickLeaveBalance  ?? 0),
    sickLeaveUsed:    Number(row.sickLeaveUsed     ?? 0),
    birthdayLeave:    Number(row.birthdayLeave     ?? 0),
    birthdayLeaveUsed: Number(row.birthdayLeaveUsed ?? 0),
    advanceSickLeave: Number(row.advanceSickLeave  ?? 0),
    advanceSickLeaveUsed: Number(row.advanceSickLeaveUsed ?? 0),
    specialLeaveCredits: Number(row.specialLeaveCredits ?? 0),
    specialLeaveUsed:    Number(row.specialLeaveUsed    ?? 0),
  };
}

export type FetchParams = {
  page: number;
  pageSize: number;
  country: string;
  status: string;
  rules: FilterRule[];
  search?: string;
};

// Apply quick-filter + advanced rules to a Supabase query builder
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, country: string, status: string, rules: FilterRule[], search = "") {
  if (country !== "All Countries") {
    // locations are stored as "City, Country" — just ilike "%Country" covers both
    // "Gujarat, India" and "India" without the comma parsing issue in .or()
    query = query.ilike("location", `%${country}`);
  }

  if (status !== "All Statuses") {
    query = query.eq("status", status);
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
  query = applyFilters(query, params.country, params.status, params.rules, params.search);
  query = query.order("id", { ascending: false }).range(from, to);

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
  query = applyFilters(query, params.country, params.status, params.rules, params.search);
  query = query.order("id", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return postFilterNumbers((data ?? []).map(toContractor), params.rules);
}

export async function createContractor(c: Contractor): Promise<void> {
  const sb = getSupabase();
  const ptoBalance      = calculatePtoBalance(c.hireDate);
  const sickLeaveBalance = calculateSickLeaveBalance(c.hireDate);
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
  const ptoBalance       = calculatePtoBalance(c.hireDate);
  const sickLeaveBalance = calculateSickLeaveBalance(c.hireDate);

  // Any outstanding Advance Sick Leave / Advance PTO-Birthday Leave is repaid
  // out of newly-accrued Sick Leave / PTO before it's allowed to raise the
  // corresponding Available balance — compared against the currently-stored
  // balance/used/advance, not whatever the client happens to have in memory.
  const { data: existing } = await sb.from(TABLE)
    .select("sickLeaveBalance, sickLeaveUsed, advanceSickLeave, advanceSickLeaveUsed, ptoBalance, ptoUsed, birthdayLeave, birthdayLeaveUsed")
    .eq("uid", c.uid)
    .maybeSingle();
  const { sickLeaveUsed, advanceSickLeave, advanceSickLeaveUsed } = applyAdvanceSickLeaveRepayment(
    existing?.sickLeaveBalance ?? 0,
    sickLeaveBalance,
    existing?.sickLeaveUsed ?? (c.sickLeaveUsed ?? 0),
    existing?.advanceSickLeave ?? (c.advanceSickLeave ?? 0),
    existing?.advanceSickLeaveUsed ?? (c.advanceSickLeaveUsed ?? 0)
  );
  const { ptoUsed, birthdayLeave, birthdayLeaveUsed } = applyAdvancePtoRepayment(
    existing?.ptoBalance ?? 0,
    ptoBalance,
    existing?.ptoUsed ?? (c.ptoUsed ?? 0),
    existing?.birthdayLeave ?? (c.birthdayLeave ?? 0),
    existing?.birthdayLeaveUsed ?? (c.birthdayLeaveUsed ?? 0)
  );

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
    specialLeaveCredits: number; specialLeaveUsed: number;
  }>
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).update(fields).eq("uid", uid);
  if (error) throw new Error(error.message);
}

export async function backfillLeaveBalances(): Promise<{ updated: number }> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE)
    .select("uid, hireDate, sickLeaveBalance, sickLeaveUsed, advanceSickLeave, advanceSickLeaveUsed, ptoBalance, ptoUsed, birthdayLeave, birthdayLeaveUsed");
  if (error) throw new Error(error.message);

  let updated = 0;
  for (const row of data ?? []) {
    if (!row.hireDate) continue;
    const ptoBalance       = calculatePtoBalance(row.hireDate);
    const sickLeaveBalance = calculateSickLeaveBalance(row.hireDate);
    const { sickLeaveUsed, advanceSickLeave, advanceSickLeaveUsed } = applyAdvanceSickLeaveRepayment(
      row.sickLeaveBalance ?? 0,
      sickLeaveBalance,
      row.sickLeaveUsed ?? 0,
      row.advanceSickLeave ?? 0,
      row.advanceSickLeaveUsed ?? 0
    );
    const { ptoUsed, birthdayLeave, birthdayLeaveUsed } = applyAdvancePtoRepayment(
      row.ptoBalance ?? 0,
      ptoBalance,
      row.ptoUsed ?? 0,
      row.birthdayLeave ?? 0,
      row.birthdayLeaveUsed ?? 0
    );
    await sb.from(TABLE).update({ ptoBalance, ptoUsed, sickLeaveBalance, sickLeaveUsed, birthdayLeave, birthdayLeaveUsed, advanceSickLeave, advanceSickLeaveUsed }).eq("uid", row.uid);
    updated++;
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

export async function updateLeaveRequestStatus(
  id: string,
  status: "Approved" | "Rejected"
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();

  // Fetch the request so we know email, type, its stored hours, and prior status
  const { data: req, error: fetchErr } = await sb
    .from(LEAVE_TABLE)
    .select("email, type, status, ptoUsedHours, sickLeaveUsedHours, specialLeaveUsedHours")
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

  return { ok: true };
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

// Deletes a leave request outright (used from Historical Request Data). If
// the request was Approved, its balance deduction is reversed first so
// deleting it never leaves ptoUsed/sickLeaveUsed permanently inflated with
// no record left to explain the number.
export async function deleteLeaveRequestAdmin(id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();

  const { data: req, error: fetchErr } = await sb
    .from(LEAVE_TABLE)
    .select("email, type, status, ptoUsedHours, sickLeaveUsedHours, specialLeaveUsedHours")
    .eq("id", id)
    .single();
  if (fetchErr || !req) return { ok: false, error: fetchErr?.message ?? "Request not found" };

  if (String(req.status) === "Approved") {
    const bucket = leaveBucketFor(String(req.type));
    const { usedField, hoursColumn } = LEAVE_BUCKET_FIELDS[bucket];
    const hours = Number(req[hoursColumn]) || 0;

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

  const { error: deleteErr } = await sb.from(LEAVE_TABLE).delete().eq("id", id);
  if (deleteErr) return { ok: false, error: deleteErr.message };

  return { ok: true };
}
