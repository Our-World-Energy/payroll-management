"use server";

import { createClient } from "@supabase/supabase-js";
import type { Contractor, FilterRule } from "./types";
import { COLUMNS } from "./types";

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
  };
}

export type FetchParams = {
  page: number;
  pageSize: number;
  country: string;
  status: string;
  rules: FilterRule[];
};

// Apply quick-filter + advanced rules to a Supabase query builder
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, country: string, status: string, rules: FilterRule[]) {
  if (country !== "All Countries") {
    // locations are stored as "City, Country" — just ilike "%Country" covers both
    // "Gujarat, India" and "India" without the comma parsing issue in .or()
    query = query.ilike("location", `%${country}`);
  }

  if (status !== "All Statuses") {
    query = query.eq("status", status);
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
  query = applyFilters(query, params.country, params.status, params.rules);
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
  query = applyFilters(query, params.country, params.status, params.rules);
  query = query.order("id", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return postFilterNumbers((data ?? []).map(toContractor), params.rules);
}

export async function createContractor(c: Contractor): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).insert({
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
  });
  if (error) throw new Error(error.message);
}

export async function updateContractor(c: Contractor): Promise<void> {
  const sb = getSupabase();
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
  }).eq("uid", c.uid);
  if (error) throw new Error(error.message);
}

export async function deleteContractor(uid: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).delete().eq("uid", uid);
  if (error) throw new Error(error.message);
}
