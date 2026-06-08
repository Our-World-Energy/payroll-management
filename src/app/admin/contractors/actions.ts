"use server";

import { prisma } from "@/lib/prisma";
import type { Contractor, FilterRule } from "./types";
import { COLUMNS } from "./types";

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
  };
}

export type FetchParams = {
  page: number;
  pageSize: number;
  country: string;
  status: string;
  rules: FilterRule[];
};

// Build Prisma where clause from quick filters + advanced rules
function buildWhere(country: string, status: string, rules: FilterRule[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AND: any[] = [];

  if (country !== "All Countries") {
    AND.push({
      OR: [
        { location: { endsWith: `, ${country}` } },
        { location: { equals: country } },
      ],
    });
  }

  if (status !== "All Statuses") {
    AND.push({ status: { equals: status } });
  }

  for (const rule of rules) {
    const colDef = COLUMNS.find((c) => c.key === rule.column);
    if (!colDef) continue;
    const field = rule.column as string;

    if (colDef.type === "string") {
      const noVal = rule.operator === "is_empty" || rule.operator === "is_not_empty";
      if (!noVal && !rule.value.trim()) continue;
      switch (rule.operator) {
        case "contains":      AND.push({ [field]: { contains: rule.value, mode: "insensitive" } }); break;
        case "not_contains":  AND.push({ NOT: { [field]: { contains: rule.value, mode: "insensitive" } } }); break;
        case "starts_with":   AND.push({ [field]: { startsWith: rule.value, mode: "insensitive" } }); break;
        case "ends_with":     AND.push({ [field]: { endsWith: rule.value, mode: "insensitive" } }); break;
        case "equals":        AND.push({ [field]: { equals: rule.value, mode: "insensitive" } }); break;
        case "not_equals":    AND.push({ NOT: { [field]: { equals: rule.value, mode: "insensitive" } } }); break;
        case "is_empty":      AND.push({ [field]: { equals: "" } }); break;
        case "is_not_empty":  AND.push({ NOT: { [field]: { equals: "" } } }); break;
      }
    }

    if (colDef.type === "number") {
      if (!rule.value.trim()) continue;
      const v1 = parseFloat(rule.value);
      const v2 = parseFloat(rule.value2 ?? "");
      if (isNaN(v1)) continue;
      // rates are stored as text so filter client-side after fetch for number columns
      // We store as text, so use string comparison as best effort; real filtering below
      switch (rule.operator) {
        case "contains": AND.push({ [field]: { contains: rule.value } }); break;
        default: break;
      }
    }

    if (colDef.type === "date") {
      if (!rule.value.trim()) continue;
      // dates stored as text YYYY-MM-DD, use string comparison which works for ISO dates
      switch (rule.operator) {
        case "date_eq":      AND.push({ [field]: { equals: rule.value } }); break;
        case "date_before":  AND.push({ [field]: { lt: rule.value } }); break;
        case "date_after":   AND.push({ [field]: { gt: rule.value } }); break;
        case "date_between":
          if (rule.value2?.trim()) {
            AND.push({ [field]: { gte: rule.value, lte: rule.value2 } });
          }
          break;
      }
    }
  }

  return AND.length > 0 ? { AND } : {};
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
  const where = buildWhere(params.country, params.status, params.rules);

  const [rawRows, total] = await Promise.all([
    prisma.contractorProfile.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.contractorProfile.count({ where }),
  ]);

  const rows = postFilterNumbers(rawRows.map(toContractor), params.rules);
  return { rows, total };
}

// Fetch ALL rows matching filters (for export)
export async function fetchAllContractors(params: Omit<FetchParams, "page" | "pageSize">): Promise<Contractor[]> {
  const where = buildWhere(params.country, params.status, params.rules);
  const rawRows = await prisma.contractorProfile.findMany({
    where,
    orderBy: { id: "desc" },
  });
  return postFilterNumbers(rawRows.map(toContractor), params.rules);
}

export async function createContractor(c: Contractor): Promise<void> {
  await prisma.contractorProfile.create({
    data: {
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
    },
  });
}

export async function updateContractor(c: Contractor): Promise<void> {
  await prisma.contractorProfile.update({
    where: { uid: c.uid },
    data: {
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
    },
  });
}

export async function deleteContractor(uid: string): Promise<void> {
  await prisma.contractorProfile.delete({ where: { uid } });
}
