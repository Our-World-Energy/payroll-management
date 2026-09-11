"use server";

import { createClient } from "@supabase/supabase-js";
import {
  leaveTypeHours, isPtoLeaveType, calculatePtoBalance, calculateSickLeaveBalance, cutoffFromSaved,
  bookedLeaveByDate, canAddLeaveOnDate, datesCoveredByRange, leaveHoursPerCoveredDate,
  isHalfDayLeaveType, MAX_LEAVE_HOURS_PER_DAY,
} from "@/lib/timeOffBalances";
import { fetchCutOffTime, fetchTimeAwayRequestsEnabled } from "../../admin/settings/actions";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const LEAVE_TABLE = "contractor_leave_requests";

export type ContractorTimeOff = {
  fullName:         string;
  hireDate:         string;
  location:         string;
  ptoBalance:       number;
  ptoUsed:          number;
  sickLeaveBalance: number;
  sickLeaveUsed:    number;
  birthdayLeave:    number;
  advanceSickLeave: number;
};

export type LeaveRequest = {
  id:           string;
  email:        string;
  type:         string;
  startDate:    string;
  endDate:      string;
  durationDays: number;
  reason:       string;
  status:       string;
  createdAt:    string;
};

export async function fetchContractorTimeOff(email: string): Promise<ContractorTimeOff | null> {
  const sb = getSupabase();
  const [{ data, error }, savedCutoff] = await Promise.all([
    sb
      .from("contractor_profiles")
      .select("fullName, hireDate, location, ptoBalance, ptoUsed, sickLeaveBalance, sickLeaveUsed, birthdayLeave, advanceSickLeave")
      .eq("email", email)
      .single(),
    fetchCutOffTime(),
  ]);

  if (error || !data) return null;
  const hireDate = String(data.hireDate ?? "");
  const cutoff = cutoffFromSaved(savedCutoff);
  return {
    fullName:         String(data.fullName ?? ""),
    hireDate,
    location:         String(data.location ?? ""),
    // Live-computed from Engagement Start Date + the current Cut Off Time,
    // rather than trusting the stored snapshot — so a Cut Off Time change is
    // reflected immediately without waiting for this contractor to be saved again.
    ptoBalance:       calculatePtoBalance(hireDate, cutoff),
    ptoUsed:          Number(data.ptoUsed          ?? 0),
    sickLeaveBalance: calculateSickLeaveBalance(hireDate, cutoff),
    sickLeaveUsed:    Number(data.sickLeaveUsed    ?? 0),
    birthdayLeave:    Number(data.birthdayLeave    ?? 0),
    advanceSickLeave: Number(data.advanceSickLeave ?? 0),
  };
}

/**
 * Leave requests that have been decided (Approved or Rejected), newest decision
 * first — feeds the Contractor Portal notification bell.
 *
 * `updatedAt` stands in for a decision timestamp: the row is only written again
 * when an admin acts on it, so it is when the outcome landed. There is no
 * dedicated decidedAt column. Requests still Pending, or Cancelled/Archived by
 * an admin, are not decisions the contractor needs telling about.
 */
export type LeaveDecision = {
  id:        string;
  type:      string;
  status:    string;   // "Approved" | "Rejected"
  startDate: string;
  endDate:   string;
  decidedAt: string;   // ISO instant
};

export async function fetchLeaveDecisions(email: string, sinceDays = 30): Promise<LeaveDecision[]> {
  const sb = getSupabase();
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const { data, error } = await sb
    .from(LEAVE_TABLE)
    .select("id, type, status, startDate, endDate, updatedAt")
    .eq("email", email)
    .in("status", ["Approved", "Rejected"])
    .gte("updatedAt", since.toISOString())
    .order("updatedAt", { ascending: false })
    .limit(15);

  if (error || !data) return [];
  return data.map((r) => ({
    id:        String(r.id),
    type:      String(r.type),
    status:    String(r.status),
    startDate: String(r.startDate),
    endDate:   String(r.endDate),
    decidedAt: String(r.updatedAt),
  }));
}

export async function fetchLeaveRequests(email: string): Promise<LeaveRequest[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(LEAVE_TABLE)
    .select("id, email, type, startDate, endDate, durationDays, reason, status, createdAt")
    .eq("email", email)
    // Cancelled requests (admin-only, from Request History) never appear in
    // Recent Requests — everything else the contractor filed still does.
    .neq("status", "Cancelled")
    .order("startDate", { ascending: false })
    .order("createdAt", { ascending: false })
    .limit(20);

  if (error || !data) return [];
  return data.map((r) => ({
    id:           String(r.id),
    email:        String(r.email),
    type:         String(r.type),
    startDate:    String(r.startDate),
    endDate:      String(r.endDate),
    durationDays: Number(r.durationDays),
    reason:       String(r.reason ?? ""),
    status:       String(r.status ?? "Pending"),
    createdAt:    String(r.createdAt),
  }));
}

export async function submitLeaveRequest(params: {
  email:       string;
  type:        "PTO" | "PTO Half Day" | "Sick Leave" | "Sick Leave Half Day";
  startDate:   string;
  endDate:     string;
  durationDays: number;
  reason:      string;
}): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();

  // The real enforcement of Settings → Time Away Settings → Enable Time Away
  // Request. The Contractor Portal also disables the form, but a disabled
  // control is a hint, not a guarantee — this is what actually holds.
  if (!(await fetchTimeAwayRequestsEnabled())) {
    return { ok: false, error: "Time Away requests are currently disabled by your administrator." };
  }

  // Only half days may share a date, and only while the day total stays within
  // 8 hours — see canAddLeaveOnDate. This is the real enforcement; the portal
  // greys the dates out, but a disabled control is a hint, not a guarantee.
  {
    const { data: existing } = await sb
      .from(LEAVE_TABLE)
      .select("type, startDate, endDate, status")
      .eq("email", params.email);
    const booked = bookedLeaveByDate(
      (existing ?? []).map((r) => ({
        type: String(r.type), startDate: String(r.startDate),
        endDate: String(r.endDate), status: String(r.status ?? "Pending"),
      })),
    );
    // A half-day only ever occupies its start date, whatever range was sent.
    const lastDate = isHalfDayLeaveType(params.type) ? params.startDate : params.endDate;
    const refused = datesCoveredByRange(params.startDate, lastDate)
      .filter((d) => !canAddLeaveOnDate(booked.get(d), params.type));
    if (refused.length > 0) {
      const held = booked.get(refused[0]);
      const reason = !isHalfDayLeaveType(params.type)
        ? "only half-day leave can share a date that already has leave on it"
        : held && !held.allHalfDay
        ? "a full-day leave already covers it"
        : `it already holds ${held?.hours ?? 0}h, and adding ${leaveHoursPerCoveredDate(params.type)}h would pass the ${MAX_LEAVE_HOURS_PER_DAY}h daily limit`;
      return {
        ok: false,
        error: refused.length === 1
          ? `Cannot add leave on ${refused[0]} - ${reason}.`
          : `${refused.length} dates in this range already have leave that cannot be shared.`,
      };
    }
  }

  const now = new Date().toISOString();
  const hours = leaveTypeHours(params.type);
  const isPto = isPtoLeaveType(params.type);

  // One row per day, not one row spanning the range: picking 22nd–23rd files
  // two single-day requests. Each is then approved, declined, cancelled and
  // deducted on its own, and the per-date views no longer have to unpack a
  // range to know what a given day holds.
  //
  // A half-day only ever occupies its start date, so it stays a single row
  // however the range was submitted.
  const lastDate = isHalfDayLeaveType(params.type) ? params.startDate : params.endDate;
  const dates = datesCoveredByRange(params.startDate, lastDate);
  if (dates.length === 0) return { ok: false, error: "Select a start date." };

  const rows = dates.map((date) => ({
    id:                 crypto.randomUUID(),
    email:              params.email,
    type:               params.type,
    startDate:          date,
    endDate:            date,
    // Each row is one day. The column is an integer and a half day is stored
    // as 1 by existing convention — the "* Half Day" type is what encodes the
    // half, and leaveTypeHours already reads 4h from it.
    durationDays:       1,
    reason:             params.reason,
    status:             "Pending",
    ptoUsedHours:       isPto ? hours : 0,
    sickLeaveUsedHours: isPto ? 0 : hours,
    createdAt:          now,
    updatedAt:          now,
  }));

  const { error } = await sb.from(LEAVE_TABLE).insert(rows);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchAllLeaveRequests(email: string): Promise<LeaveRequest[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(LEAVE_TABLE)
    .select("id, email, type, startDate, endDate, durationDays, reason, status, createdAt")
    .eq("email", email)
    .order("createdAt", { ascending: false });

  if (error || !data) return [];
  return data.map((r) => ({
    id:           String(r.id),
    email:        String(r.email),
    type:         String(r.type),
    startDate:    String(r.startDate),
    endDate:      String(r.endDate),
    durationDays: Number(r.durationDays),
    reason:       String(r.reason ?? ""),
    status:       String(r.status ?? "Pending"),
    createdAt:    String(r.createdAt),
  }));
}

export async function cancelLeaveRequest(id: string, email: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  // only allow cancelling own pending requests
  const { error } = await sb
    .from(LEAVE_TABLE)
    .delete()
    .eq("id", id)
    .eq("email", email)
    .eq("status", "Pending");

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
