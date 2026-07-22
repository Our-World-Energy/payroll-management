"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useState, useEffect, useMemo } from "react";
import { LuCircleCheck, LuCircleAlert, LuClock, LuFileText, LuRefreshCw, LuEye, LuMessageSquare, LuPencil, LuX, LuCalendar, LuSearch, LuChartColumn } from "react-icons/lu";
import { CONTRACTORS, TIME_OFF, type AttendanceRecord } from "@/lib/data";
import { parseIsoDate, datesBetween, addDaysIso, sundayOf, recentWeeks, weekLabel, arizonaTodayIso } from "@/lib/weekUtils";
import { utcInstantForLocalTime, ARIZONA_TIME_ZONE } from "@/lib/countryTimeZones";
import { WeekJumpDropdown } from "@/components/WeekJumpDropdown";
import { FilterSelect } from "@/components/FilterSelect";
import { fetchAllLeaveRequestsAdmin, type AdminLeaveRequest } from "../contractors/actions";


// Transparently retries a fetch on network failure or a 5xx/429 response —
// covers the transient blips (cold starts, brief DB connection hiccups) that
// were otherwise surfacing as "no data" until the user manually refreshed.
// 4xx responses are returned as-is since retrying won't fix a bad request.
async function fetchWithRetry(input: string, init?: RequestInit, retries = 2): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(input, init);
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`Request failed with status ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

function formatDayLabel(date: string) {
  return parseIsoDate(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatElapsedSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function showDailyDecisionActions(worksnapTime: string) {
  return worksnapTime !== "-";
}

type ReviewModalProps = {
  record: AttendanceRow;
  weekDates: string[];
  onClose: () => void;
  appliedOffsetCredit?: number;
  onSave: (contractorId: string, offsetCreditApplied?: number) => void;
  usaHolidays: HolidayEntry[];
  allHolidays: HolidayEntry[];
  allLeaveRequests: AdminLeaveRequest[];
  isWeekEnded: boolean;
};

type WorksnapEntry = {
  worksnapUserId?: number | null;
  userName: string | null;
  email: string | null;
  durationMins: number | string | null;
  entryDate?: string | null;
  department?: string | null;
  restDay?: string | null;
  location?: string | null;
  shiftType?: string | null;
  payCategory?: string | null;
  dailyWorksnapMinutes?: Record<string, number>;
  hasContractorProfile?: boolean;
};

const EMPTY_DAILY_WORKSNAP_MINUTES: Record<string, number> = {};

const DECISION_API_BY_UI: Record<string, string> = { "No Status": "NOT_SET", "Approved": "APPROVED", "Rejected": "REJECTED" };
const DECISION_UI_BY_API: Record<string, string> = { NOT_SET: "No Status", APPROVED: "Approved", REJECTED: "Rejected", OPEN: "No Status" };
function decisionStatusToApi(uiStatus: string) {
  return DECISION_API_BY_UI[uiStatus] ?? "NOT_SET";
}
function decisionStatusFromApi(apiStatus: string) {
  return DECISION_UI_BY_API[apiStatus] ?? "No Status";
}

function dashIfEmpty(value: string) {
  return value && value !== "â€”" ? value : "-";
}

function timeOffStatusFor(record: AttendanceRecord) {
  const request = TIME_OFF.find((item) =>
    item.name === record.name &&
    record.date >= item.from &&
    record.date <= item.to
  );

  if (request) return `${request.type} - ${request.status}`;
  return record.status === "On Leave" ? "On Leave" : "No Time Off";
}

function attendanceTimeValue(value: string) {
  return value && !value.includes("â") && !value.includes("—") ? value : "-";
}

function formatMinutesAsHours(minutes: number) {
  if (!minutes) return "0h 00m";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${String(remainingMinutes).padStart(2, "0")}m`;
}

function formatMinutesAsMins(minutes: number) {
  return `${minutes} mins`;
}

function timeValueToMinutes(value: string) {
  const normalized = attendanceTimeValue(dashIfEmpty(value));
  if (normalized === "-") return 0;

  const minuteOnlyMatch = normalized.match(/^(\d+)$/);
  if (minuteOnlyMatch) return Number(minuteOnlyMatch[1]);

  const hourMatch = normalized.match(/(\d+)\s*h/i);
  const minuteMatch = normalized.match(/(\d+)\s*m/i);
  if (hourMatch || minuteMatch) {
    return Number(hourMatch?.[1] ?? 0) * 60 + Number(minuteMatch?.[1] ?? 0);
  }

  const clockMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (clockMatch) return Number(clockMatch[1]) * 60 + Number(clockMatch[2]);

  return 0;
}

function formatAdjustedInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d+$/.test(trimmed)) return `${trimmed} mins`;
  return trimmed;
}

function isRestDayDate(date: string, restDaysStr: string) {
  if (!restDaysStr || restDaysStr === "-") return false;
  const dayName = parseIsoDate(date).toLocaleDateString("en-US", { weekday: "long" });
  return restDaysStr.split(",").map((d) => d.trim()).includes(dayName);
}

function isFlexibleShift(shiftType?: string) {
  return shiftType?.trim().toLowerCase() === "flexible";
}

function evaluatedTimeFor(worksnapTime: string, attendanceStatus = "No Status", restDay = false, shiftType?: string, isFullTimeOffDay = false) {
  const worksnapMinutes = timeValueToMinutes(worksnapTime);
  if (!worksnapMinutes) return "-";
  // Rest-day worked time is tracked separately via RD OT Time, not Evaluated Time.
  if (restDay) return "-";
  // Worked time on a full-day PTO/Sick Leave day is tracked separately via
  // Regular OT Time, not Evaluated Time — see isFullTimeOffStatus.
  if (isFullTimeOffDay) return "-";

  const approved = attendanceStatus === "Approved";

  if (isFlexibleShift(shiftType)) {
    if (worksnapMinutes > 540) return approved ? formatMinutesAsMins(worksnapMinutes) : formatMinutesAsMins(540);
    return formatMinutesAsMins(worksnapMinutes);
  }

  if (worksnapMinutes < 480) return formatMinutesAsMins(worksnapMinutes);
  if (worksnapMinutes > 540) return approved ? formatMinutesAsMins(worksnapMinutes) : formatMinutesAsMins(540);
  return formatMinutesAsMins(worksnapMinutes);
}

function worksnapTimeFor(date: string) {
  if (date === "2026-05-11") return "470 mins";
  if (date === "2026-05-12") return "540 mins";
  if (date === "2026-05-13") return "560 mins";
  if (date === "2026-05-15") return "240 mins";
  return date >= "2026-05-11" && date <= "2026-05-15" ? "480 mins" : "-";
}

function worksnapTimeForDate(dailyWorksnapMinutes: Record<string, number>, date: string) {
  const minutes = dailyWorksnapMinutes[date] ?? 0;
  return minutes > 0 ? formatMinutesAsMins(minutes) : "-";
}

// Regular Time = Worksnap Time capped at the 480-min (8h) standard shift —
// below 480 it passes through as-is, at or above 480 it's capped to 480.
// Rest days never carry Regular Time — that worked time is RD OT Time instead.
// Full-day PTO/Sick Leave days don't carry Regular Time either — that worked
// time is Regular OT Time instead (see isFullTimeOffStatus). Same for a US
// Holiday worked under 240 min — that time is HO OT Time instead (see
// otMinutesFor and weeklyEvaluatedRegularAllocation's isHoOtDayByDate skip).
function regularTimeMinutesFor(worksnapMinutes: number, isRestDay: boolean, isFullTimeOffDay = false, isHolidayDay = false) {
  if (isRestDay || isFullTimeOffDay) return 0;
  if (isHolidayDay && worksnapMinutes < 240) return 0;
  return worksnapMinutes >= 480 ? 480 : worksnapMinutes;
}

function defaultAdjustedTimesFor(weekDates: string[], attendanceStatus = "No Status") {
  return weekDates.reduce<Record<string, string>>((times, date) => {
    times[date] = "";
    return times;
  }, {});
}

function defaultDailyDecisionStatuses(weekDates: string[]) {
  return weekDates.reduce<Record<string, string>>((statuses, date) => {
    statuses[date] = "No Status";
    return statuses;
  }, {});
}

function timeOffTimeFor(timeOffStatus: string) {
  if (timeOffStatus === "PTO" || timeOffStatus === "Sick Leave") return "480 mins";
  if (timeOffStatus === "Sick Leave Half Day" || timeOffStatus === "PTO Half Day") return "240 mins";
  if (timeOffStatus === "Unpaid Leave") return "0 mins";
  return "-";
}

// A full-day PTO/Sick Leave (480-min credit, as opposed to a half-day) already
// credits the whole day — any Worksnap time logged on top of that is tracked
// entirely as Regular OT Time rather than being double-counted as regular
// worked time on top of the leave credit.
function isFullTimeOffStatus(timeOffStatus: string) {
  return timeOffStatus === "PTO" || timeOffStatus === "Sick Leave";
}

// Portal leave request (if any) covering this date — "PTO" | "PTO Half Day" |
// "Sick Leave" | "Sick Leave Half Day", from contractor_leave_requests.type.
function timeOffRequestTypeFor(date: string, leaveRequests: AdminLeaveRequest[]) {
  const match = leaveRequests.find((r) => date >= r.startDate && date <= r.endDate);
  return match?.type ?? "-";
}

// Hours stamped on a leave request for its own type's bucket — PTO types read
// ptoUsedHours, Special Leave reads specialLeaveUsedHours, everything else
// (Sick Leave, Unpaid Leave) reads sickLeaveUsedHours.
function hoursForLeaveRequest(r: AdminLeaveRequest): number {
  if (r.type.startsWith("PTO")) return r.ptoUsedHours;
  if (r.type.startsWith("Special Leave")) return r.specialLeaveUsedHours;
  return r.sickLeaveUsedHours;
}

// Minutes for the request covering this date, converted hours → minutes —
// e.g. a full-day Special Leave request reads its stamped 8h as 480 mins,
// same as a full-day PTO/Sick Leave request.
function timeOffRequestMinutesFor(date: string, leaveRequests: AdminLeaveRequest[]) {
  const match = leaveRequests.find((r) => date >= r.startDate && date <= r.endDate);
  if (!match) return "-";
  return `${Math.round(hoursForLeaveRequest(match) * 60)} mins`;
}

// Minutes for the APPROVED request covering this date only — unlike
// timeOffRequestMinutesFor (which shows whatever was requested regardless of
// status, for the read-only Time Off Request columns), this is what actually
// drives Completion Time / OT suppression in Attendance Review, so a merely
// Pending or Rejected request can't grant time-off credit.
function approvedTimeOffRequestMinutesFor(date: string, leaveRequests: AdminLeaveRequest[]) {
  const match = leaveRequests.find((r) => r.status === "Approved" && date >= r.startDate && date <= r.endDate);
  if (!match) return "-";
  return `${Math.round(hoursForLeaveRequest(match) * 60)} mins`;
}

// Whether an APPROVED portal request covering `date` is worth a full day
// (480 min) — the sole signal driving Attendance Review's "is this day
// already fully credited via time off" check (Attendance Review has no
// admin-set daily status of its own; that's read straight from the
// contractor's submitted requests instead).
function isApprovedFullTimeOffRequestDay(date: string, leaveRequests: AdminLeaveRequest[]) {
  return timeValueToMinutes(approvedTimeOffRequestMinutesFor(date, leaveRequests)) === 480;
}

const APPROVED_LEAVE_CONFLICT_TYPES = ["PTO", "PTO Half Day", "Sick Leave", "Sick Leave Half Day"];

// Whether an approved PTO/Sick Leave (full or half day) portal request covers
// `date` — used to flag a day the contractor filed one of these for but also
// logged Worksnap Time on, so the admin can spot the conflict at a glance.
function hasApprovedLeaveRequestFor(date: string, leaveRequests: AdminLeaveRequest[]) {
  return leaveRequests.some((r) =>
    APPROVED_LEAVE_CONFLICT_TYPES.includes(r.type) && r.status === "Approved" && date >= r.startDate && date <= r.endDate
  );
}

// Week total — sums each DISTINCT request that overlaps the week once (not
// once per day it covers), since a request's hours are a flat per-request
// amount, not scaled by how many days it spans.
function totalTimeOffRequestMinutesFor(weekDates: string[], leaveRequests: AdminLeaveRequest[]) {
  const weekStart = weekDates[0];
  const weekEnd = weekDates[weekDates.length - 1];
  if (!weekStart || !weekEnd) return 0;
  return leaveRequests
    .filter((r) => r.startDate <= weekEnd && r.endDate >= weekStart)
    .reduce((sum, r) => sum + hoursForLeaveRequest(r) * 60, 0);
}

function completionTimeFor(evaluatedTime: string, timeOffTime: string, holidayTime = "-", rdOtTime = "-") {
  const evaluatedMinutes = timeValueToMinutes(evaluatedTime);
  const timeOffMinutes = timeValueToMinutes(timeOffTime);
  const holidayMinutes = timeValueToMinutes(holidayTime);
  const rdOtMinutes = timeValueToMinutes(rdOtTime);
  // Adjusted Time is no longer special-cased here — when present, it already
  // replaced Worksnap Time upstream (see effectiveDailyMinutes) and flows into
  // evaluatedTime like any other source, so the same formula applies either way.
  // Evaluated Time is always blank on rest days (that work is tracked separately as
  // RD OT Time), so rest-day worked minutes are folded back in here explicitly.
  return formatMinutesAsMins(evaluatedMinutes + timeOffMinutes + holidayMinutes + rdOtMinutes);
}

type HolidayEntry = { date: string; country: string; name: string; arizonaDate?: string | null };

// The Arizona-equivalent calendar date for a holiday — falls back to the raw
// (country-local) date for older rows that predate the arizonaDate column.
function arizonaDateOf(holiday: HolidayEntry): string {
  return (holiday.arizonaDate ?? holiday.date).slice(0, 10);
}

function holidayTimeFor(
  date: string,
  usaHolidays: HolidayEntry[],
  dailyWorksnapMinutes: Record<string, number> = {},
  restDaysStr = "",
  weekDates: string[] = []
) {
  if (!usaHolidays.some((h) => h.date.slice(0, 10) === date)) return "-";
  if (isRestDayDate(date, restDaysStr)) return "-";
  // All other working days in the week must have login time
  const otherWorkingDays = weekDates.filter(
    (d) => d !== date && !isRestDayDate(d, restDaysStr) && !usaHolidays.some((h) => h.date.slice(0, 10) === d)
  );
  if (otherWorkingDays.some((d) => (dailyWorksnapMinutes[d] ?? 0) === 0)) return "-";
  return "480 mins";
}

// The contractor's own-country holiday name for a given date, or "" if none —
// looked up from the full holidays table (not just the US subset). Matched by
// the holiday's ARIZONA-equivalent date, since `date` here is itself an
// Arizona-bucketed calendar date (same bucketing as Worksnap Time/entryDate),
// not the country's own local date.
function localHolidayNameFor(date: string, country: string, holidays: HolidayEntry[]): string {
  return holidays.find((h) => h.country === country && arizonaDateOf(h) === date)?.name ?? "";
}

type DailyLogEntry = { entryDate: string; firstIn: string; lastOut: string; worksnapUserId?: number; totalMins?: number };

// Minutes of ALL the contractor's shifts (firstIn→lastOut, real UTC instants)
// that overlap the holiday's Arizona calendar day — [date 00:00, date+1 00:00)
// in America/Phoenix. `date` is already an Arizona-bucketed date (matching
// entryDate/Worksnap Time's own bucketing), so the window itself must be
// built in Arizona time too, not the country's own timezone — building it in
// the country's timezone would misalign the window against these Arizona-real
// timestamps and badly over- or under-count.
// Every shift in `dailyLogs` is checked (not just the one whose own entryDate
// is `date`) because a shift can straddle the Arizona midnight boundary: its
// own bucketed day might be the day before or after, while a portion of it
// still falls inside this holiday's window. Summing per-shift overlap against
// this single, non-overlapping 24h window is safe — a shift that doesn't
// genuinely fall inside it always contributes exactly 0.
// Each shift's contribution is capped at its own totalMins — firstIn→lastOut
// is only the outer span of the day's activity and can contain large gaps
// (breaks/idle time), so raw span-overlap alone can wildly overstate actual
// worked minutes; totalMins is the real accumulated work for that day.
// Returns null when `date` isn't a local holiday for `country` at all.
function localHolidayMinutesFor(
  date: string,
  dailyLogs: DailyLogEntry[],
  country: string,
  holidays: HolidayEntry[]
): number | null {
  const isLocalHoliday = holidays.some((h) => h.country === country && arizonaDateOf(h) === date);
  if (!isLocalHoliday) return null;

  const dayStart = utcInstantForLocalTime(date, 0, 0, ARIZONA_TIME_ZONE).getTime();
  const dayEnd = utcInstantForLocalTime(addDaysIso(date, 1), 0, 0, ARIZONA_TIME_ZONE).getTime();

  return dailyLogs.reduce((sum, log) => {
    const start = new Date(log.firstIn).getTime();
    const end = new Date(log.lastOut).getTime();
    const overlapStart = Math.max(start, dayStart);
    const overlapEnd = Math.min(end, dayEnd);
    const overlapMinutes = overlapEnd > overlapStart ? Math.round((overlapEnd - overlapStart) / 60000) : 0;
    const cappedMinutes = log.totalMins != null ? Math.min(overlapMinutes, log.totalMins) : overlapMinutes;
    return sum + cappedMinutes;
  }, 0);
}

// A day counts as a holiday for OT purposes if it already carries either kind
// of holiday credit shown in the row — US HO Time or Local HO Time.
function isHolidayDayFor(holidayTime: string, localHolidayMinutes: number | null) {
  return timeValueToMinutes(holidayTime) > 0 || (localHolidayMinutes ?? 0) > 0;
}

// Regular OT / RD OT / HO OT are mutually exclusive per day, so a day's
// worked minutes are only ever counted in one of the three buckets:
//   - Rest day: the whole day's RAW Worksnap Time is RD OT Time, but only once
//     the day's decision status is Approved — rest-day work isn't a scheduled
//     shift, so nothing counts until it's explicitly approved. This takes
//     priority over Holiday: a rest day that's ALSO a US holiday is still
//     bucketed as a rest day here (see boostedUsHoMinutes for how that day's
//     US HO Time gets credited too).
//   - Full-day PTO/Sick Leave (see isFullTimeOffStatus): the whole day is
//     already credited via Time Off Time, so any worked minutes logged anyway
//     are entirely Regular OT Time (not folded into regular/evaluated time),
//     again gated on the day's decision status being Approved.
//   - Holiday (non-rest-day): minutes beyond the 480-min (8h) standard shift
//     count as Regular OT Time (not HO OT Time), driven by Evaluated Time so
//     an unapproved OT request stays capped the same way Evaluated Time
//     already caps it.
//   - Regular day: only minutes beyond the 480-min (8h) standard shift count,
//     driven by Evaluated Time for the same approval-gating reason as above.
function otMinutesFor(
  evaluatedMinutes: number,
  worksnapMinutes: number,
  isHolidayDay: boolean,
  isRestDay: boolean,
  isApproved: boolean,
  isFullTimeOffDay = false
) {
  if (isRestDay) {
    return { regularOtMinutes: 0, rdOtMinutes: isApproved && worksnapMinutes > 0 ? worksnapMinutes : 0, hoOtMinutes: 0 };
  }
  if (isFullTimeOffDay) {
    return { regularOtMinutes: isApproved && worksnapMinutes > 0 ? worksnapMinutes : 0, rdOtMinutes: 0, hoOtMinutes: 0 };
  }
  if (isHolidayDay) {
    // Worked under 240 min on a US Holiday is credited entirely as HO OT
    // Time — not folded into Regular/Evaluated Regular Time (see
    // regularTimeMinutesFor). US HO Time itself (the flat 480-min holiday
    // credit) is unaffected and still assigned by holidayTimeFor.
    if (worksnapMinutes < 240) {
      return { regularOtMinutes: 0, rdOtMinutes: 0, hoOtMinutes: worksnapMinutes };
    }
    return { regularOtMinutes: evaluatedMinutes > 480 ? evaluatedMinutes - 480 : 0, rdOtMinutes: 0, hoOtMinutes: 0 };
  }
  return { regularOtMinutes: evaluatedMinutes > 480 ? evaluatedMinutes - 480 : 0, rdOtMinutes: 0, hoOtMinutes: 0 };
}

// holidayTimeFor always returns "-" (0) on a rest day — no flat credit for a
// day the contractor wasn't scheduled to work anyway — so `isUsHolidayDate`
// must be checked independently of it (ignoring that rest-day suppression)
// to know whether this rest day happens to fall on a recognized US holiday.
function isUsHolidayDate(date: string, usaHolidays: HolidayEntry[]): boolean {
  return usaHolidays.some((h) => h.date.slice(0, 10) === date);
}

// When a contractor works on a Rest Day that ALSO falls on a US Holiday, and
// that day is Approved, the approved Worksnaps Time (= RD OT Time, from
// otMinutesFor above) is credited to US HO Time. holidayTimeFor's own flat
// credit is always 0 on a rest day (see above), so this IS the US HO Time
// for that day, not an add-on to an existing flat credit. Both conditions —
// Rest Day AND US Holiday — must hold; either alone doesn't trigger this.
function boostedUsHoMinutes(holidayTime: string, isRestDay: boolean, isUsHoliday: boolean, isApproved: boolean, rdOtMinutes: number): number {
  const base = timeValueToMinutes(holidayTime);
  return isRestDay && isUsHoliday && isApproved ? base + rdOtMinutes : base;
}

// Once a day is Approved and its Regular Time falls short of the 480-min (8h)
// standard, the shortfall is covered from the WEEK's pool of Regular OT Time
// first, then — if that pool still isn't enough — from the WEEK's pool of RD
// OT Time, working through the week's days in order and depleting each pool
// as it's borrowed from. If neither pool can fully cover a day's shortfall,
// only what's actually available gets added (Evaluated Regular Time is never
// forced up to 480 — it's Regular Time + whatever OT was actually borrowed).
// Rest days never carry Evaluated Regular Time and never trigger borrowing —
// that's not a scheduled shift.
function weeklyEvaluatedRegularAllocation(
  weekDates: string[],
  regularTimeByDate: Record<string, number>,
  regularOtByDate: Record<string, number>,
  rdOtByDate: Record<string, number>,
  approvedByDate: Record<string, boolean>,
  isRestDayByDate: Record<string, boolean>,
  isFullTimeOffDayByDate: Record<string, boolean> = {},
  isHoOtDayByDate: Record<string, boolean> = {}
): Record<string, { evaluatedRegularTime: number; regularOtMinutes: number; rdOtMinutes: number }> {
  const remainingRegularOt: Record<string, number> = {};
  const remainingRdOt: Record<string, number> = {};
  weekDates.forEach((d) => {
    remainingRegularOt[d] = regularOtByDate[d] ?? 0;
    remainingRdOt[d] = rdOtByDate[d] ?? 0;
  });

  const borrowedByDate: Record<string, number> = {};
  weekDates.forEach((date) => {
    borrowedByDate[date] = 0;
    const regularTime = regularTimeByDate[date] ?? 0;
    // A full-time-off day's Regular Time is intentionally 0 (it's already
    // credited via Time Off Time) — it must never borrow OT from other days
    // to inflate its own Evaluated Regular Time back up to 480. Same for a
    // US Holiday worked under 240 min (isHoOtDayByDate) — that time is HO OT
    // Time, not Regular/Evaluated Regular Time.
    if (isRestDayByDate[date] || isFullTimeOffDayByDate[date] || isHoOtDayByDate[date] || regularTime >= 480 || !approvedByDate[date]) return;

    let missing = 480 - regularTime;

    for (const otDate of weekDates) {
      if (missing <= 0) break;
      const available = remainingRegularOt[otDate];
      if (available <= 0) continue;
      const take = Math.min(missing, available);
      remainingRegularOt[otDate] -= take;
      missing -= take;
      borrowedByDate[date] += take;
    }

    for (const otDate of weekDates) {
      if (missing <= 0) break;
      const available = remainingRdOt[otDate];
      if (available <= 0) continue;
      const take = Math.min(missing, available);
      remainingRdOt[otDate] -= take;
      missing -= take;
      borrowedByDate[date] += take;
    }
  });

  const result: Record<string, { evaluatedRegularTime: number; regularOtMinutes: number; rdOtMinutes: number }> = {};
  weekDates.forEach((date) => {
    result[date] = {
      evaluatedRegularTime: (regularTimeByDate[date] ?? 0) + borrowedByDate[date],
      regularOtMinutes: remainingRegularOt[date],
      rdOtMinutes: remainingRdOt[date],
    };
  });
  return result;
}




function worksnapTotalMinutesFor(weekDates: string[], dailyWorksnapMinutes: Record<string, number>) {
  return weekDates.reduce((total, date) => total + timeValueToMinutes(worksnapTimeForDate(dailyWorksnapMinutes, date)), 0);
}

// Adjusted Time overrides Worksnap Time for that date when a caller (Bulk
// Approve) has it available — same effective-minutes rule Attendance Review
// applies. Callers with no adjusted data (e.g. the main table's live
// fallback) omit the override and behave exactly as before.
function effectiveDailyMinutesFor(row: AttendanceRow, adjustedDaily?: Record<string, number>) {
  const raw = row.dailyWorksnapMinutes ?? {};
  if (!adjustedDaily || Object.keys(adjustedDaily).length === 0) return raw;
  const merged: Record<string, number> = { ...raw };
  for (const [date, minutes] of Object.entries(adjustedDaily)) {
    if (minutes > 0) merged[date] = minutes;
  }
  return merged;
}

function computeWeeklyCompletionMinutes(row: AttendanceRow, weekDates: string[], adjustedDaily?: Record<string, number>) {
  const dailyWorksnapMinutes = effectiveDailyMinutesFor(row, adjustedDaily);

  if (isFixedContractor(row.payCategory)) {
    const total = weekDates.reduce((sum, date) => sum + (dailyWorksnapMinutes[date] ?? 0), 0);
    return Math.min(total, 2400);
  }

  const restDaysStr = restDaysForAttendanceRow(row);
  const shiftType = shiftTypeForAttendanceRow(row);
  return weekDates.reduce((total, date) => {
    const worksnapTime = worksnapTimeForDate(dailyWorksnapMinutes, date);
    const isRestDay = isRestDayDate(date, restDaysStr);

    const timeOffRequest = TIME_OFF.find((item) =>
      item.name === row.name && date >= item.from && date <= item.to
    );
    let timeOffStatus = "No Time Off";
    if (timeOffRequest) {
      if (timeOffRequest.type === "Sick Leave") timeOffStatus = "Sick Leave";
      else if (timeOffRequest.type === "Unpaid Leave") timeOffStatus = "Unpaid Leave";
      else timeOffStatus = "PTO";
    }
    const isFullTimeOffDay = isFullTimeOffStatus(timeOffStatus);
    const evaluatedTime = evaluatedTimeFor(worksnapTime, "No Status", isRestDay, shiftType, isFullTimeOffDay);

    const timeOffTime = timeOffTimeFor(timeOffStatus);
    return total + timeValueToMinutes(completionTimeFor(evaluatedTime, timeOffTime));
  }, 0);
}

// Per-day attendance_day_status snapshot for a Bulk Approve save: every logged
// day is Approved (no per-day reject/override in this flow), time off comes
// from the row's default status, mirroring what the Review modal would save.
// Adjusted Time (adjustedDaily, keyed by date) overrides Worksnap Time for
// every calculation below, same as an individual Attendance Review save.
function buildBulkApproveDaySnapshots(
  row: AttendanceRow,
  weekDates: string[],
  usaHolidays: HolidayEntry[],
  dailyLogs: DailyLogEntry[],
  allHolidays: HolidayEntry[],
  adjustedDaily?: Record<string, number>,
  leaveRequests: AdminLeaveRequest[] = []
) {
  const dailyWorksnapMinutes = effectiveDailyMinutesFor(row, adjustedDaily);
  const restDaysStr = restDaysForAttendanceRow(row);
  // Same India/Fixed-contractor suppression Attendance Review applies (see
  // evaluationShiftType in ReviewModal) — currently a no-op here since Fixed
  // contractors are already excluded from Bulk Approve's candidate rows, but
  // kept so this function stays correct if that filter ever changes.
  const shiftType = isFixedContractor(row.payCategory) ? undefined : shiftTypeForAttendanceRow(row);
  const userLogs = dailyLogs.filter((l) => l.worksnapUserId === row.worksnapUserId);

  // Evaluated Regular Time draws on the WEEK's whole pool of Regular OT Time,
  // so it's built once across all weekDates together, same as the Review modal.
  const regularTimeByDate: Record<string, number> = {};
  const regularOtByDate: Record<string, number> = {};
  const rdOtByDate: Record<string, number> = {};
  const approvedByDate: Record<string, boolean> = {};
  const isRestDayByDate: Record<string, boolean> = {};
  const isFullTimeOffDayByDate: Record<string, boolean> = {};
  const isHoOtDayByDate: Record<string, boolean> = {};

  weekDates.forEach((date) => {
    const worksnapTime = worksnapTimeForDate(dailyWorksnapMinutes, date);
    const isRestDay = isRestDayDate(date, restDaysStr);
    const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
    const dailyDecisionStatus = showDailyDecisionActions(worksnapTime) ? "Approved" : "No Status";
    const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, shiftType, isFullTimeOffDay);
    const holidayTime = holidayTimeFor(date, usaHolidays, dailyWorksnapMinutes, restDaysStr, weekDates);
    const localHolMinutes = localHolidayMinutesFor(date, userLogs, row.region, allHolidays);
    const isHolidayDay = isHolidayDayFor(holidayTime, localHolMinutes);
    const { regularOtMinutes, rdOtMinutes } = otMinutesFor(timeValueToMinutes(evaluatedTime), timeValueToMinutes(worksnapTime), isHolidayDay, isRestDay, dailyDecisionStatus === "Approved", isFullTimeOffDay);

    regularTimeByDate[date] = regularTimeMinutesFor(timeValueToMinutes(worksnapTime), isRestDay, isFullTimeOffDay, isHolidayDay);
    regularOtByDate[date] = regularOtMinutes;
    rdOtByDate[date] = rdOtMinutes;
    approvedByDate[date] = dailyDecisionStatus === "Approved";
    isRestDayByDate[date] = isRestDay;
    isFullTimeOffDayByDate[date] = isFullTimeOffDay;
    isHoOtDayByDate[date] = isHolidayDay && timeValueToMinutes(worksnapTime) < 240;
  });

  const regularAllocationByDate = weeklyEvaluatedRegularAllocation(weekDates, regularTimeByDate, regularOtByDate, rdOtByDate, approvedByDate, isRestDayByDate, isFullTimeOffDayByDate, isHoOtDayByDate);

  return weekDates.map((date) => {
    const worksnapTime = worksnapTimeForDate(dailyWorksnapMinutes, date);
    const dailyDecisionStatus = showDailyDecisionActions(worksnapTime) ? "Approved" : "No Status";
    const isRestDay = isRestDayDate(date, restDaysStr);
    const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
    const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, shiftType, isFullTimeOffDay);
    const holidayTime = holidayTimeFor(date, usaHolidays, dailyWorksnapMinutes, restDaysStr, weekDates);
    const localHoliday = localHolidayNameFor(date, row.region, allHolidays);
    const localHolidayMinutes = localHolidayMinutesFor(date, userLogs, row.region, allHolidays);
    const isHolidayDay = isHolidayDayFor(holidayTime, localHolidayMinutes);
    const { regularOtMinutes: rawRegularOtMinutes, rdOtMinutes: rawRdOtMinutes, hoOtMinutes } = otMinutesFor(
      timeValueToMinutes(evaluatedTime), timeValueToMinutes(worksnapTime), isHolidayDay, isRestDay,
      dailyDecisionStatus === "Approved", isFullTimeOffDay
    );
    const allocation = regularAllocationByDate[date] ?? { evaluatedRegularTime: 0, regularOtMinutes: 0, rdOtMinutes: 0 };
    // Same week-total formula Attendance Review actually saves as
    // completionMinutes (see completionTotalMinutes in ReviewModal) — not the
    // weekly-reallocated allocation above, which only feeds the day snapshot's
    // own evaluatedRegular/regularOt/rdOt breakdown fields.
    const timeOffTime = approvedTimeOffRequestMinutesFor(date, leaveRequests);
    const otMinutesToFold = rawRdOtMinutes + (isFullTimeOffDay ? rawRegularOtMinutes : 0);
    const completionMinutes = timeValueToMinutes(completionTimeFor(evaluatedTime, timeOffTime, holidayTime, formatMinutesAsMins(otMinutesToFold)));

    return {
      date,
      decisionStatus: decisionStatusToApi(dailyDecisionStatus),
      evaluatedMinutes: timeValueToMinutes(evaluatedTime),
      adjustedMinutes: adjustedDaily?.[date] ?? null,
      holidayMinutes: boostedUsHoMinutes(holidayTime, isRestDay, isUsHolidayDate(date, usaHolidays), dailyDecisionStatus === "Approved", rawRdOtMinutes),
      localHoliday: localHoliday || null,
      localHolidayMinutes,
      evaluatedRegularMinutes: allocation.evaluatedRegularTime,
      regularOtMinutes: allocation.regularOtMinutes,
      rdOtMinutes: allocation.rdOtMinutes,
      hoOtMinutes,
      completionMinutes,
    };
  });
}

// Week totals for Bulk Approve's summary table — derived from the exact same
// per-day snapshots the save uses, so what's displayed always matches what
// gets persisted (same fields Attendance Review shows/saves per contractor).
function rowWeeklyTotals(
  row: AttendanceRow,
  weekDates: string[],
  usaHolidays: HolidayEntry[],
  dailyLogs: DailyLogEntry[],
  allHolidays: HolidayEntry[],
  adjustedDaily?: Record<string, number>,
  leaveRequests: AdminLeaveRequest[] = []
) {
  const days = buildBulkApproveDaySnapshots(row, weekDates, usaHolidays, dailyLogs, allHolidays, adjustedDaily, leaveRequests);
  return days.reduce(
    (totals, d) => ({
      totalEvaluatedRegularMinutes: totals.totalEvaluatedRegularMinutes + d.evaluatedRegularMinutes,
      totalRegularOtMinutes: totals.totalRegularOtMinutes + d.regularOtMinutes,
      totalRdOtMinutes: totals.totalRdOtMinutes + d.rdOtMinutes,
      totalEvaluatedMinutes: totals.totalEvaluatedMinutes + d.evaluatedMinutes,
      totalUsHoMinutes: totals.totalUsHoMinutes + d.holidayMinutes,
      totalHoOtMinutes: totals.totalHoOtMinutes + d.hoOtMinutes,
      totalCompletionMinutes: totals.totalCompletionMinutes + d.completionMinutes,
    }),
    { totalEvaluatedRegularMinutes: 0, totalRegularOtMinutes: 0, totalRdOtMinutes: 0, totalEvaluatedMinutes: 0, totalUsHoMinutes: 0, totalHoOtMinutes: 0, totalCompletionMinutes: 0 }
  );
}

function approvalStatusClassName(status: string) {
  if (status === "Approved") return "text-emerald-600 font-semibold";
  if (status === "Rejected") return "text-red-600 font-semibold";
  return "text-slate-600";
}

function worksnapTimeClassName(value: string) {
  const minutes = timeValueToMinutes(value);
  if (minutes && (minutes < 480 || minutes > 540)) return "text-red-600 font-semibold";
  if (minutes >= 480 && minutes <= 540) return "text-emerald-600 font-semibold";
  return "text-slate-600";
}


function detailValueClassName(label: string, value: string) {
  if (label === "Worksnap Actual Time") {
    const mins = timeValueToMinutes(value);
    return mins > 0 && (mins < 2400 || mins > 2700) ? "text-red-600 font-semibold" : "text-slate-800";
  }
  return "text-slate-800";
}

function initialsFor(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "WE";
}

type AttendanceRow = AttendanceRecord & {
  worksnapUserId?: number | null;
  department?: string;
  restDay?: string;
  shiftType?: string;
  payCategory?: string;
  dailyWorksnapMinutes?: Record<string, number>;
  completionMinutes?: number;
  totalLocalHolidayMinutes?: number | null;
  totalEvaluatedRegularMinutes?: number | null;
  totalEvaluatedMinutes?: number | null;
  totalUsHoMinutes?: number | null;
  totalRegularOtMinutes?: number | null;
  totalRdOtMinutes?: number | null;
  totalHoOtMinutes?: number | null;
  savedDailyDecisionStatuses?: Record<string, string>;
  hasContractorProfile?: boolean;
};

function isFixedContractor(payCategory?: string) {
  return payCategory?.trim().toLowerCase() === "fixed-ind";
}

function computeWeeklyStatus(dailyWorksnapMinutes: Record<string, number>, weekDates: string[], restDaysStr: string, payCategory: string): AttendanceRecord["weeklyStatus"] {
  if (isFixedContractor(payCategory)) {
    const total = weekDates.reduce((sum, date) => sum + (dailyWorksnapMinutes[date] ?? 0), 0);
    if (total < 2400 || total > 2700) return "For Review";
    return "Standard Met";
  }
  for (const date of weekDates) {
    if (isRestDayDate(date, restDaysStr)) continue;
    const mins = dailyWorksnapMinutes[date] ?? 0;
    if (mins > 0 && (mins < 480 || mins > 540)) return "For Review";
  }
  return "Standard Met";
}

function worksnapEntryToAttendanceRecord(entry: WorksnapEntry, index: number, weekDates: string[]): AttendanceRow {
  const name = entry.userName?.trim() || entry.email?.trim() || `Worksnap User ${index + 1}`;
  const actualMinutes = Number(entry.durationMins ?? 0) || 0;
  const restDaysStr = entry.restDay?.trim() || "";
  const region = entry.location?.trim().split(",").at(-1)?.trim() || "Worksnap";
  const shiftType = entry.shiftType?.trim() || "";
  const payCategory = entry.payCategory?.trim() || "";
  const weeklyStatus = computeWeeklyStatus(entry.dailyWorksnapMinutes ?? {}, weekDates, restDaysStr, payCategory);

  return {
    worksnapUserId: entry.worksnapUserId ?? null,
    contractorId: entry.email?.trim() || `worksnap-${index}`,
    name,
    role: entry.email?.trim() || "No email",
    avatar: initialsFor(name),
    region,
    date: "2026-05-15",
    checkIn: "-",
    checkOut: "-",
    hours: formatMinutesAsMins(actualMinutes),
    status: actualMinutes > 0 ? "Present" : "Absent",
    standardMinutes: 2700,
    actualMinutes,
    weeklyStatus,
    department: entry.department?.trim() || "",
    restDay: entry.restDay?.trim() || "",
    shiftType,
    payCategory,
    dailyWorksnapMinutes: entry.dailyWorksnapMinutes ?? {},
    hasContractorProfile: entry.hasContractorProfile ?? false,
  };
}

function worksnapEntriesToAttendanceRecords(entries: WorksnapEntry[], weekDates: string[]) {
  const rowsByUser = new Map<string, { worksnapUserId: number | null; userName: string | null; email: string | null; durationMins: number; department: string | null; restDay: string | null; location: string | null; shiftType: string | null; payCategory: string | null; dailyWorksnapMinutes: Record<string, number>; hasContractorProfile: boolean }>();

  entries.forEach((entry, index) => {
    const key = entry.email?.trim().toLowerCase() || entry.userName?.trim().toLowerCase() || `worksnap-${index}`;
    const current = rowsByUser.get(key);

    const entryDate = entry.entryDate ?? "";
    const durationMins = Number(entry.durationMins ?? 0) || 0;
    const dailyWorksnapMinutes = { ...(current?.dailyWorksnapMinutes ?? {}) };
    if (entryDate) dailyWorksnapMinutes[entryDate] = (dailyWorksnapMinutes[entryDate] ?? 0) + durationMins;

    rowsByUser.set(key, {
      worksnapUserId: current?.worksnapUserId ?? entry.worksnapUserId ?? null,
      userName: current?.userName ?? entry.userName,
      email: current?.email ?? entry.email,
      durationMins: (current?.durationMins ?? 0) + durationMins,
      department: current?.department || entry.department || null,
      restDay: current?.restDay || entry.restDay || null,
      location: current?.location || entry.location || null,
      shiftType: current?.shiftType || entry.shiftType || null,
      payCategory: current?.payCategory || entry.payCategory || null,
      dailyWorksnapMinutes,
      hasContractorProfile: current?.hasContractorProfile || entry.hasContractorProfile || false,
    });
  });

  return Array.from(rowsByUser.values()).map((entry, index) => worksnapEntryToAttendanceRecord(entry, index, weekDates));
}

function departmentForAttendanceRow(row: AttendanceRow) {
  if (row.department) return row.department;

  const contractor = CONTRACTORS.find((item) =>
    item.id === row.contractorId ||
    item.name === row.name ||
    item.email.toLowerCase() === row.role.toLowerCase()
  );

  return contractor?.department ?? "-";
}

function restDaysForAttendanceRow(row: AttendanceRow) {
  if (row.restDay) return row.restDay;

  const contractor = CONTRACTORS.find((item) =>
    item.id === row.contractorId ||
    item.name === row.name ||
    item.email.toLowerCase() === row.role.toLowerCase()
  );

  const days = contractor?.restDays ?? [];
  return days.length > 0 ? days.join(", ") : "-";
}

function shiftTypeForAttendanceRow(row: AttendanceRow) {
  if (row.shiftType) return row.shiftType;
  return "-";
}

function payCategoryForAttendanceRow(row: AttendanceRow) {
  if (row.payCategory) return row.payCategory;
  return "-";
}

function ReviewModal({ record, weekDates, onClose, appliedOffsetCredit = 0, onSave, usaHolidays, allHolidays, allLeaveRequests, isWeekEnded }: ReviewModalProps) {
  const name = record.name;
  const role = record.role;
  const actual = record.actualMinutes;
  const variance = record.actualMinutes - record.standardMinutes;
  const type = record.actualMinutes > record.standardMinutes ? "overtime" : "undertime";
  const [note, setNote] = useState("");
  const [dailyDecisionStatuses, setDailyDecisionStatuses] = useState<Record<string, string>>({});
  const [adjustedTimes, setAdjustedTimes] = useState<Record<string, string>>({});
  const [editingAdjustedDate, setEditingAdjustedDate] = useState<string | null>(null);
  const [dailyLogs, setDailyLogs] = useState<DailyLogEntry[]>([]);

  // Leave requests submitted through the contractor portal, matched to this
  // week's days by date range, so "Time Off Request" can show what type of
  // leave (if any) was requested for that day. Filtered from the parent's
  // already-fetched list rather than re-querying the whole table again here.
  const leaveRequests = useMemo(() => {
    const email = record.role.includes("@") ? record.role : "";
    return email ? allLeaveRequests.filter((r) => r.email === email) : [];
  }, [allLeaveRequests, record]);

  const contractor = CONTRACTORS.find((item) => item.id === record.contractorId || item.name === record.name);
  const location = contractor?.site ?? record.region;
  const dailyWorksnapMinutes = record.dailyWorksnapMinutes ?? EMPTY_DAILY_WORKSNAP_MINUTES;
  // Adjusted Time is the secondary time source: once a valid value is entered
  // for a date, it overrides Worksnap Time entirely for every calculation
  // (evaluated time, regular/OT allocation, holiday eligibility, completion
  // time, totals). Worksnap Time itself is left untouched and still shown for
  // reference in its own column — only this derived map feeds calculations.
  const effectiveDailyMinutes = weekDates.reduce<Record<string, number>>((acc, d) => {
    const adjustedMinutes = timeValueToMinutes(adjustedTimes[d] ?? "");
    acc[d] = adjustedMinutes > 0 ? adjustedMinutes : (dailyWorksnapMinutes[d] ?? 0);
    return acc;
  }, {});
  const restDaysStr = restDaysForAttendanceRow(record as AttendanceRow);
  const isIndia = isFixedContractor((record as AttendanceRow).payCategory);
  const shiftType = shiftTypeForAttendanceRow(record as AttendanceRow);
  const evaluationShiftType = isIndia ? undefined : shiftType;
  const [offsetCredit, setOffsetCredit] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const worksnapTotalMinutes = worksnapTotalMinutesFor(weekDates, dailyWorksnapMinutes);
  const effectiveTotalMinutes = worksnapTotalMinutesFor(weekDates, effectiveDailyMinutes);
  const indiaTotalMinutes = Math.min(effectiveTotalMinutes, 2400);
  const indiaNetCompletionMinutes = Math.max(0, indiaTotalMinutes - appliedOffsetCredit);
const totalHolidayMins = weekDates.reduce(
    (sum, date) => sum + timeValueToMinutes(holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates)),
    0
  );
  // Displayed US HO Time total — unlike totalHolidayMins (used for Completion
  // Time), this includes the rest-day-holiday RD OT Time boost so the footer
  // matches what each day's US HO Time cell actually shows.
  const totalDisplayedUsHoMinutes = weekDates.reduce((sum, date) => {
    const worksnapTime = worksnapTimeForDate(effectiveDailyMinutes, date);
    const isRestDay = isRestDayDate(date, restDaysStr);
    const dailyDecisionStatus = dailyDecisionStatuses[date] ?? "No Status";
    const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
    const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, evaluationShiftType, isFullTimeOffDay);
    const holidayTime = holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates);
    const localHolMinutes = localHolidayMinutesFor(date, dailyLogs, record.region, allHolidays);
    const isHolidayDay = isHolidayDayFor(holidayTime, localHolMinutes);
    const { rdOtMinutes } = otMinutesFor(timeValueToMinutes(evaluatedTime), timeValueToMinutes(worksnapTime), isHolidayDay, isRestDay, dailyDecisionStatus === "Approved", isFullTimeOffDay);
    return sum + boostedUsHoMinutes(holidayTime, isRestDay, isUsHolidayDate(date, usaHolidays), dailyDecisionStatus === "Approved", rdOtMinutes);
  }, 0);
  const totalEvaluatedMinutes = weekDates.reduce((sum, date) => {
    const worksnapTime = worksnapTimeForDate(effectiveDailyMinutes, date);
    const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatuses[date] ?? "No Status", isRestDayDate(date, restDaysStr), evaluationShiftType, isApprovedFullTimeOffRequestDay(date, leaveRequests));
    return sum + timeValueToMinutes(evaluatedTime);
  }, 0);
  const totalRegularMinutes = weekDates.reduce(
    (sum, date) => sum + regularTimeMinutesFor(
      timeValueToMinutes(worksnapTimeForDate(effectiveDailyMinutes, date)),
      isRestDayDate(date, restDaysStr),
      isApprovedFullTimeOffRequestDay(date, leaveRequests),
      isHolidayDayFor(
        holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates),
        localHolidayMinutesFor(date, dailyLogs, record.region, allHolidays)
      )
    ),
    0
  );
const completionTotalMinutes = isFixedContractor((record as AttendanceRow).payCategory)
    ? indiaNetCompletionMinutes + totalHolidayMins
    : weekDates.reduce((total, date) => {
        const worksnapTime = worksnapTimeForDate(effectiveDailyMinutes, date);
        const isRestDay = isRestDayDate(date, restDaysStr);
        const dailyDecisionStatus = dailyDecisionStatuses[date] ?? "No Status";
        const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
        const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, evaluationShiftType, isFullTimeOffDay);
        const timeOffTime = approvedTimeOffRequestMinutesFor(date, leaveRequests);
        const holidayTime = holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates);
        const localHolMinutes = localHolidayMinutesFor(date, dailyLogs, record.region, allHolidays);
        const isHolidayDay = isHolidayDayFor(holidayTime, localHolMinutes);
        const { regularOtMinutes, rdOtMinutes } = otMinutesFor(timeValueToMinutes(evaluatedTime), timeValueToMinutes(worksnapTime), isHolidayDay, isRestDay, dailyDecisionStatus === "Approved", isFullTimeOffDay);
        const otMinutesToFold = rdOtMinutes + (isFullTimeOffDay ? regularOtMinutes : 0);
        return total + timeValueToMinutes(completionTimeFor(evaluatedTime, timeOffTime, holidayTime, formatMinutesAsMins(otMinutesToFold)));
      }, 0);
  const details = [
    ["Shift Type", shiftType],
    ["Rest Day", restDaysForAttendanceRow(record as AttendanceRow)],
    ["Worksnap Actual Time", formatMinutesAsMins(worksnapTotalMinutes)],
    ["Ind Time", completionTotalMinutes > 0 ? formatMinutesAsMins(completionTotalMinutes) : attendanceTimeValue(dashIfEmpty(record.checkOut))],
  ];
  const weeklyDayHeadings = ["Days", "Decision", "Worksnap Time", "Adjusted Time", "Regular Time", "Evaluated Regular Time", "Regular OT Time", "RD OT Time", "Evaluated Time", "US HO Time", "HO OT Time", "Local HO", "Local HO Time", "Time Off Request", "Time Off Request Time", "Ind Time", "Approval Status"]
    .filter((heading) => !(isIndia && (heading === "Decision" || heading === "Time Off Request" || heading === "Time Off Request Time")));
  const totalLocalHolidayMinutes = weekDates.reduce(
    (sum, d) => sum + (localHolidayMinutesFor(d, dailyLogs, record.region, allHolidays) ?? 0),
    0
  );
  const totalTimeOffRequestMinutes = totalTimeOffRequestMinutesFor(weekDates, leaveRequests);
  const otTotals = weekDates.reduce(
    (totals, date) => {
      const worksnapTime = worksnapTimeForDate(effectiveDailyMinutes, date);
      const holidayTime = holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates);
      const localHolMinutes = localHolidayMinutesFor(date, dailyLogs, record.region, allHolidays);
      const isHolidayDay = isHolidayDayFor(holidayTime, localHolMinutes);
      const isRestDay = isRestDayDate(date, restDaysStr);
      const dailyDecisionStatus = dailyDecisionStatuses[date] ?? "No Status";
      const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
      const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, evaluationShiftType, isFullTimeOffDay);
      const { hoOtMinutes } = otMinutesFor(timeValueToMinutes(evaluatedTime), timeValueToMinutes(worksnapTime), isHolidayDay, isRestDay, dailyDecisionStatus === "Approved", isFullTimeOffDay);
      return {
        ho: totals.ho + hoOtMinutes,
      };
    },
    { ho: 0 }
  );

  // Evaluated Regular Time draws on the WEEK's whole pool of Regular OT Time
  // (not just each day's own), so it's computed once across all weekDates
  // together rather than per day in isolation.
  const regularAllocationByDate = (() => {
    const regularTimeByDate: Record<string, number> = {};
    const regularOtByDate: Record<string, number> = {};
    const rdOtByDate: Record<string, number> = {};
    const approvedByDate: Record<string, boolean> = {};
    const isRestDayByDate: Record<string, boolean> = {};
    const isFullTimeOffDayByDate: Record<string, boolean> = {};
    const isHoOtDayByDate: Record<string, boolean> = {};

    weekDates.forEach((date) => {
      const worksnapTime = worksnapTimeForDate(effectiveDailyMinutes, date);
      const isRestDay = isRestDayDate(date, restDaysStr);
      const dailyDecisionStatus = dailyDecisionStatuses[date] ?? "No Status";
      const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
      const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, evaluationShiftType, isFullTimeOffDay);
      const holidayTime = holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates);
      const localHolMinutes = localHolidayMinutesFor(date, dailyLogs, record.region, allHolidays);
      const isHolidayDay = isHolidayDayFor(holidayTime, localHolMinutes);
      const { regularOtMinutes, rdOtMinutes } = otMinutesFor(timeValueToMinutes(evaluatedTime), timeValueToMinutes(worksnapTime), isHolidayDay, isRestDay, dailyDecisionStatus === "Approved", isFullTimeOffDay);

      regularTimeByDate[date] = regularTimeMinutesFor(timeValueToMinutes(worksnapTime), isRestDay, isFullTimeOffDay, isHolidayDay);
      regularOtByDate[date] = regularOtMinutes;
      rdOtByDate[date] = rdOtMinutes;
      approvedByDate[date] = dailyDecisionStatus === "Approved";
      isRestDayByDate[date] = isRestDay;
      isFullTimeOffDayByDate[date] = isFullTimeOffDay;
      isHoOtDayByDate[date] = isHolidayDay && timeValueToMinutes(worksnapTime) < 240;
    });

    return weeklyEvaluatedRegularAllocation(weekDates, regularTimeByDate, regularOtByDate, rdOtByDate, approvedByDate, isRestDayByDate, isFullTimeOffDayByDate, isHoOtDayByDate);
  })();
  const totalEvaluatedRegularMinutes = weekDates.reduce((sum, d) => sum + (regularAllocationByDate[d]?.evaluatedRegularTime ?? 0), 0);
  const totalRegularOtMinutes = weekDates.reduce((sum, d) => sum + (regularAllocationByDate[d]?.regularOtMinutes ?? 0), 0);
  const totalAdjustedRdOtMinutes = weekDates.reduce((sum, d) => sum + (regularAllocationByDate[d]?.rdOtMinutes ?? 0), 0);

  // Resets the locally-edited review fields whenever a different
  // contractor/week is opened (or the carried-over offset credit changes).
  // Kept separate from the data-loading effect below so clicking "Retry"
  // after a failed load doesn't wipe out edits the admin already made.
  useEffect(() => {
    const savedStatuses = (record as AttendanceRow).savedDailyDecisionStatuses;
    const defaultStatuses = savedStatuses
      ? { ...defaultDailyDecisionStatuses(weekDates), ...savedStatuses }
      : defaultDailyDecisionStatuses(weekDates);
    setDailyDecisionStatuses(defaultStatuses);
    setAdjustedTimes(defaultAdjustedTimesFor(weekDates));
    setEditingAdjustedDate(null);
    setOffsetCredit(0);
  }, [record, weekDates, appliedOffsetCredit]);

  // Loads the saved per-day review overlay (day-status) and the raw
  // firstIn/lastOut instants (daily-log, for Local HO Time) together. Both
  // requests retry transient failures automatically; `retryNonce` lets the
  // user force another attempt via the error banner's Retry button without
  // resetting any of the local edits above.
  const [isLoadingReviewData, setIsLoadingReviewData] = useState(true);
  const [reviewDataError, setReviewDataError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const worksnapUserId = (record as AttendanceRow).worksnapUserId;
    const week = weekDates[0];
    if (worksnapUserId == null || !week) {
      setDailyLogs([]);
      setIsLoadingReviewData(false);
      return;
    }

    let isCancelled = false;
    setIsLoadingReviewData(true);
    setReviewDataError("");
    const from = week;
    const to = weekDates[weekDates.length - 1];

    Promise.all([
      fetchWithRetry(`/api/attendance/day-status?userId=${worksnapUserId}&week=${week}`).then((r) => (r.ok ? r.json() : null)),
      fetchWithRetry(`/api/attendance/daily-log?from=${from}&to=${to}&userId=${worksnapUserId}`).then((r) => (r.ok ? r.json() : { logs: [] })),
    ])
      .then(([dayStatusData, dailyLogData]: [
        { days?: Array<{ date: string; decisionStatus: string | null; timeOffStatus: string | null; adjustedMinutes: number | null }> } | null,
        { logs?: DailyLogEntry[] }
      ]) => {
        if (isCancelled) return;

        if (dayStatusData?.days) {
          const decisionByDate: Record<string, string> = {};
          const adjustedByDate: Record<string, string> = {};
          dayStatusData.days.forEach((d) => {
            if (d.decisionStatus) decisionByDate[d.date] = decisionStatusFromApi(d.decisionStatus);
            if (d.adjustedMinutes != null) adjustedByDate[d.date] = formatMinutesAsMins(d.adjustedMinutes);
          });
          if (Object.keys(decisionByDate).length) setDailyDecisionStatuses((current) => ({ ...current, ...decisionByDate }));
          if (Object.keys(adjustedByDate).length) setAdjustedTimes((current) => ({ ...current, ...adjustedByDate }));
        }
        setDailyLogs(dailyLogData.logs ?? []);
      })
      .catch(() => {
        if (isCancelled) return;
        setDailyLogs([]);
        setReviewDataError("Couldn't load this contractor's saved review data. Some fields below may be incomplete.");
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingReviewData(false);
      });

    return () => { isCancelled = true; };
  }, [record, weekDates, retryNonce]);

  function finishAdjustedEdit(date: string, fallbackValue: string) {
    setAdjustedTimes((current) => ({
      ...current,
      [date]: formatAdjustedInput(current[date] ?? ""),
    }));
    setEditingAdjustedDate(null);
  }

  function toggleDailyDecision(date: string, status: "Approved" | "Rejected") {
    setDailyDecisionStatuses((current) => ({
      ...current,
      [date]: current[date] === status ? "No Status" : status,
    }));
  }

  function approveAllDays() {
    const applicableDates = weekDates.filter((date) => !isRestDayDate(date, restDaysStr));
    const allApproved = applicableDates.every((date) => dailyDecisionStatuses[date] === "Approved");
    setDailyDecisionStatuses((current) => {
      const next = { ...current };
      applicableDates.forEach((date) => { next[date] = allApproved ? "No Status" : "Approved"; });
      return next;
    });
  }

  function applyTimeCredit() {
    const credit = 2400 - completionTotalMinutes;
    setOffsetCredit(credit);
  }

  async function handleSaveClick() {
    const finalCompletionMinutes = isIndia ? completionTotalMinutes + offsetCredit : completionTotalMinutes;
    const finalOffsetCredit = isIndia ? offsetCredit : 0;

    if (record.worksnapUserId != null) {
      setIsSaving(true);
      setSaveError("");
      try {
        const days = weekDates.map((date) => {
          const worksnapTime = worksnapTimeForDate(effectiveDailyMinutes, date);
          const isRestDay = isRestDayDate(date, restDaysStr);
          const dailyDecisionStatus = dailyDecisionStatuses[date] ?? "No Status";
          const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
          const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, evaluationShiftType, isFullTimeOffDay);
          const adjustedTime = adjustedTimes[date] ?? "";
          const holidayTime = holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates);
          const adjustedMinutesParsed = timeValueToMinutes(adjustedTime);
          const localHoliday = localHolidayNameFor(date, record.region, allHolidays);
          const localHolidayMinutes = localHolidayMinutesFor(date, dailyLogs, record.region, allHolidays);
          const isHolidayDay = isHolidayDayFor(holidayTime, localHolidayMinutes);
          const { rdOtMinutes: rawRdOtMinutes, hoOtMinutes } = otMinutesFor(
            timeValueToMinutes(evaluatedTime), timeValueToMinutes(worksnapTime), isHolidayDay, isRestDay,
            dailyDecisionStatus === "Approved", isFullTimeOffDay
          );
          const allocation = regularAllocationByDate[date] ?? { evaluatedRegularTime: 0, regularOtMinutes: 0, rdOtMinutes: 0 };

          return {
            date,
            decisionStatus: decisionStatusToApi(dailyDecisionStatus),
            evaluatedMinutes: timeValueToMinutes(evaluatedTime),
            adjustedMinutes: adjustedMinutesParsed > 0 ? adjustedMinutesParsed : null,
            holidayMinutes: boostedUsHoMinutes(holidayTime, isRestDay, isUsHolidayDate(date, usaHolidays), dailyDecisionStatus === "Approved", rawRdOtMinutes),
            localHoliday: localHoliday || null,
            localHolidayMinutes,
            evaluatedRegularMinutes: allocation.evaluatedRegularTime,
            regularOtMinutes: allocation.regularOtMinutes,
            rdOtMinutes: allocation.rdOtMinutes,
            hoOtMinutes,
          };
        });

        const response = await fetch("/api/attendance/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            worksnapUserId: record.worksnapUserId,
            email: record.role.includes("@") ? record.role : "",
            week: weekDates[0],
            requestStatus: "APPROVED",
            completionMinutes: finalCompletionMinutes,
            days,
          }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          setSaveError(result.error ?? "Failed to save. Please try again.");
          setIsSaving(false);
          return;
        }
      } catch {
        setSaveError("Failed to save. Please try again.");
        setIsSaving(false);
        return;
      }
      setIsSaving(false);
    }

    onSave(record.contractorId, finalOffsetCredit);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[97vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 px-4 py-2 sm:px-5 sm:py-2.5 border-b border-[#003527] bg-[#003527]">
          <div>
            <h3 className="text-xs font-bold text-white">Attendance Review</h3>
            <p className="mt-0.5 text-base font-bold text-white">{name}</p>
            <p className="text-xs text-green-200">{role}</p>
            <p className="text-xs text-green-200">{location}{(record as AttendanceRow).payCategory ? ` / ${(record as AttendanceRow).payCategory}` : ""}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-green-200 transition-colors hover:bg-[#064E3B] hover:text-white"
            aria-label="Close attendance review"
            title="Close"
          >
            <LuX size={15} strokeWidth={2} />
          </button>
        </div>
        {isLoadingReviewData && (
          <p className="flex items-center gap-1.5 px-5 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 border-b border-teal-100 sm:px-6">
            <LuRefreshCw size={12} className="animate-spin" /> Loading saved review data…
          </p>
        )}
        {!isLoadingReviewData && reviewDataError && (
          <p className="flex items-center justify-between gap-3 px-5 py-1.5 text-xs font-medium text-red-700 bg-red-50 border-b border-red-100 sm:px-6">
            <span>{reviewDataError}</span>
            <button
              onClick={() => setRetryNonce((n) => n + 1)}
              className="inline-flex shrink-0 items-center gap-1 px-2 py-1 bg-white border border-red-200 rounded-md text-[11px] font-bold text-red-700 hover:bg-red-100"
            >
              <LuRefreshCw size={11} /> Retry
            </button>
          </p>
        )}
        <div className="min-h-0 overflow-y-auto px-5 py-2.5 sm:px-6 sm:py-3">
          <div className="sticky top-0 z-40 bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {details.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 p-2 bg-slate-50">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
                  <p className={`text-xs font-medium mt-0.5 break-words ${detailValueClassName(label, value)}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center mt-3 pb-1.5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Weekly Days</p>
            </div>
          </div>
          <div>
            <div className="overflow-x-scroll rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm" style={{ minWidth: "1580px", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead className="bg-slate-50 sticky top-0 z-30">
                  <tr>
                    {weeklyDayHeadings.map((heading) => (
                      <th
                        key={heading}
                        className={`px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-r border-slate-100 last:border-r-0 whitespace-nowrap ${
                          heading === "Days" ? "sticky left-0 z-20 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0]" : ""
                        } ${
                          heading === "Decision" ? "sticky left-[156px] z-20 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0]" : ""
                        } ${
                          heading === "Worksnap Time" ? `sticky ${isIndia ? "left-[156px]" : "left-[268px]"} z-20 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0]` : ""
                        } ${
                          heading === "Adjusted Time" ? `sticky ${isIndia ? "left-[296px]" : "left-[408px]"} z-20 w-[160px] min-w-[160px] bg-slate-50 shadow-[1px_0_0_0_#e2e8f0]` : ""
                        } ${
                          heading === "Approval Status" ? "sticky right-0 z-20 w-[140px] min-w-[140px] bg-slate-50 shadow-[-1px_0_0_0_#e2e8f0]" : ""
                        } ${
                          heading === "Regular Time" || heading === "Evaluated Time" ? "bg-red-50" : ""
                        }`}
                        style={
                          heading === "Local HO Time" || heading === "RD OT Time" || heading === "HO OT Time"
                            ? { minWidth: 150 }
                            : undefined
                        }
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {weekDates.map((date) => {
                    const hasRecord = record.date === date;
                    const dailyDecisionStatus = dailyDecisionStatuses[date] ?? "No Status";
                    // Raw Worksnap Time — reference display only, never fed into calculations.
                    const rawWorksnapTime = worksnapTimeForDate(dailyWorksnapMinutes, date);
                    // Flags a day the contractor has an approved PTO/Sick Leave (full or
                    // half day) request for, but also logged actual Worksnap Time —
                    // i.e. they filed leave but reported to work anyway.
                    const hasLeaveWorkConflict = rawWorksnapTime !== "-" && hasApprovedLeaveRequestFor(date, leaveRequests);
                    const conflictCellClass = hasLeaveWorkConflict ? "bg-red-100 text-red-700" : "text-slate-600";
                    const conflictHighlightCellClass = hasLeaveWorkConflict ? "bg-red-100 text-red-700" : "bg-red-50 text-slate-600";
                    // Effective time — Adjusted Time when present, else Worksnap Time. Every
                    // calculation below reads this instead of the raw value.
                    const worksnapTime = worksnapTimeForDate(effectiveDailyMinutes, date);
                    const isRestDay = isRestDayDate(date, restDaysStr);
                    const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
                    const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, evaluationShiftType, isFullTimeOffDay);
                    const adjustedTime = adjustedTimes[date] ?? "";
                    const holidayTime = holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates);
                    const localHoliday = localHolidayNameFor(date, record.region, allHolidays);
                    const localHolidayMinutes = localHolidayMinutesFor(date, dailyLogs, record.region, allHolidays);
                    const timeOffTime = approvedTimeOffRequestMinutesFor(date, leaveRequests);
                    const isEditingAdjustedTime = editingAdjustedDate === date;
                    const isHolidayDay = isHolidayDayFor(holidayTime, localHolidayMinutes);
                    const regularTimeMinutes = regularTimeMinutesFor(timeValueToMinutes(worksnapTime), isRestDay, isFullTimeOffDay, isHolidayDay);
                    const { regularOtMinutes: rawRegularOtMinutes, rdOtMinutes, hoOtMinutes } = otMinutesFor(timeValueToMinutes(evaluatedTime), timeValueToMinutes(worksnapTime), isHolidayDay, isRestDay, dailyDecisionStatus === "Approved", isFullTimeOffDay);
                    const otMinutesToFold = rdOtMinutes + (isFullTimeOffDay ? rawRegularOtMinutes : 0);
                    const completionTime = completionTimeFor(evaluatedTime, timeOffTime, holidayTime, formatMinutesAsMins(otMinutesToFold));
                    const displayedUsHoMinutes = boostedUsHoMinutes(holidayTime, isRestDay, isUsHolidayDate(date, usaHolidays), dailyDecisionStatus === "Approved", rdOtMinutes);
                    const regularAllocation = regularAllocationByDate[date] ?? { evaluatedRegularTime: 0, regularOtMinutes: 0, rdOtMinutes: 0 };

                    return (
                      <tr key={date}>
                        <td
                          className={`sticky left-0 z-10 w-[156px] min-w-[156px] px-4 py-2 font-medium border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0] ${
                            hasLeaveWorkConflict ? "bg-red-100 text-red-700" : "bg-white text-slate-800"
                          }`}
                          title={hasLeaveWorkConflict ? "Approved PTO/Sick Leave on file for this date, but Worksnap Time was also logged." : undefined}
                        >
                          {formatDayLabel(date)}
                        </td>
                        {!isIndia && (
                          <td className={`sticky left-[156px] z-10 w-[112px] min-w-[112px] px-4 py-2 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0] ${
                            hasLeaveWorkConflict ? "bg-red-100 text-red-700" : "bg-white text-slate-600"
                          }`}>
                            {!isRestDay ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleDailyDecision(date, "Approved")}
                                  disabled={!isWeekEnded}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                  aria-label={`Approve attendance for ${formatDayLabel(date)}`}
                                  title={isWeekEnded ? "Approve" : "Only available once the selected week has ended"}
                                >
                                  <LuCircleCheck size={15} strokeWidth={2} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleDailyDecision(date, "Rejected")}
                                  disabled={!isWeekEnded}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                  aria-label={`Reject attendance for ${formatDayLabel(date)}`}
                                  title={isWeekEnded ? "Reject" : "Only available once the selected week has ended"}
                                >
                                  <LuX size={15} strokeWidth={2} />
                                </button>
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                        )}
                        <td className={`sticky ${isIndia ? "left-[156px]" : "left-[268px]"} z-10 w-[140px] min-w-[140px] px-4 py-2 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0] ${
                          hasLeaveWorkConflict ? "bg-red-100 text-red-700" : `bg-white ${worksnapTimeClassName(rawWorksnapTime)}`
                        }`}>
                          {rawWorksnapTime}
                        </td>
                        <td className={`sticky ${isIndia ? "left-[296px]" : "left-[408px]"} z-10 w-[160px] min-w-[160px] px-4 py-2 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0] ${
                          hasLeaveWorkConflict ? "bg-red-100 text-red-700" : "bg-white text-slate-600"
                        }`}>
                          {isIndia ? "-" : isEditingAdjustedTime ? (
                            <input
                              autoFocus
                              type="text"
                              value={adjustedTime}
                              onChange={(event) => {
                                setAdjustedTimes((current) => ({
                                  ...current,
                                  [date]: event.target.value,
                                }));
                              }}
                              onBlur={() => finishAdjustedEdit(date, evaluatedTime)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") finishAdjustedEdit(date, evaluatedTime);
                                if (event.key === "Escape") {
                                  setAdjustedTimes((current) => ({
                                    ...current,
                                    [date]: "",
                                  }));
                                  setEditingAdjustedDate(null);
                                }
                              }}
                              placeholder="Minutes"
                              className="h-8 w-28 rounded-md border border-teal-200 px-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <span>{adjustedTime || "-"}</span>
                              <button
                                type="button"
                                onClick={() => setEditingAdjustedDate(date)}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#003527]"
                                aria-label={`Edit adjusted time for ${formatDayLabel(date)}`}
                                title="Edit adjusted time"
                              >
                                <LuPencil size={14} strokeWidth={2} />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className={`px-4 py-2 border-r border-slate-100 ${conflictHighlightCellClass}`}>
                          {regularTimeMinutes > 0 ? formatMinutesAsMins(regularTimeMinutes) : "-"}
                        </td>
                        <td className={`px-4 py-2 border-r border-slate-100 ${conflictCellClass}`}>
                          {regularAllocation.evaluatedRegularTime > 0 ? formatMinutesAsMins(regularAllocation.evaluatedRegularTime) : "-"}
                        </td>
                        <td className={`px-4 py-2 border-r border-slate-100 ${conflictCellClass}`}>
                          {regularAllocation.regularOtMinutes > 0 ? formatMinutesAsMins(regularAllocation.regularOtMinutes) : "-"}
                        </td>
                        <td className={`px-4 py-2 border-r border-slate-100 whitespace-nowrap ${conflictCellClass}`} style={{ minWidth: 150 }}>
                          {regularAllocation.rdOtMinutes > 0 ? formatMinutesAsMins(regularAllocation.rdOtMinutes) : "-"}
                        </td>
                        <td className={`px-4 py-2 border-r border-slate-100 ${conflictHighlightCellClass}`}>
                          {evaluatedTime}
                        </td>
                        <td className={`px-4 py-2 border-r border-slate-100 ${conflictCellClass}`}>
                          {displayedUsHoMinutes > 0 ? formatMinutesAsMins(displayedUsHoMinutes) : "-"}
                        </td>
                        <td className={`px-4 py-2 border-r border-slate-100 whitespace-nowrap ${conflictCellClass}`} style={{ minWidth: 150 }}>
                          {hoOtMinutes > 0 ? formatMinutesAsMins(hoOtMinutes) : "-"}
                        </td>
                        <td className={`px-4 py-2 border-r border-slate-100 ${conflictCellClass}`}>
                          {localHoliday}
                        </td>
                        <td className={`px-4 py-2 border-r border-slate-100 whitespace-nowrap ${conflictCellClass}`} style={{ minWidth: 150 }}>
                          {localHolidayMinutes != null ? formatMinutesAsMins(localHolidayMinutes) : ""}
                        </td>
                        {!isIndia && (
                          <td className={`px-4 py-2 border-r border-slate-100 whitespace-nowrap ${conflictCellClass}`}>
                            {timeOffRequestTypeFor(date, leaveRequests)}
                          </td>
                        )}
                        {!isIndia && (
                          <td className={`px-4 py-2 border-r border-slate-100 whitespace-nowrap ${conflictCellClass}`}>
                            {timeOffRequestMinutesFor(date, leaveRequests)}
                          </td>
                        )}
                        <td className={`px-4 py-2 ${conflictCellClass}`}>
                          {completionTime}
                        </td>
                        <td className={`sticky right-0 z-10 w-[140px] min-w-[140px] px-4 py-2 shadow-[-1px_0_0_0_#e2e8f0] ${
                          hasLeaveWorkConflict ? "bg-red-100 text-red-700" : `bg-white ${approvalStatusClassName(dailyDecisionStatus)}`
                        }`}>
                          {dailyDecisionStatus}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td className="sticky left-0 z-20 w-[156px] min-w-[156px] bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                      Total Time
                    </td>
                    {!isIndia && (
                      <td className="sticky left-[156px] z-20 w-[112px] min-w-[112px] bg-slate-50 px-4 py-2 text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                        -
                      </td>
                    )}
                    <td className={`sticky ${isIndia ? "left-[156px]" : "left-[268px]"} z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-2 font-bold text-slate-900 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]`}>
                      {formatMinutesAsMins(worksnapTotalMinutes)}
                    </td>
                    <td className={`sticky ${isIndia ? "left-[296px]" : "left-[408px]"} z-20 w-[160px] min-w-[160px] bg-slate-50 px-4 py-2 text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]`}>
                      -
                    </td>
                    <td className="px-4 py-2 font-bold text-slate-900 border-r border-slate-100 bg-red-50">
                      {formatMinutesAsMins(totalRegularMinutes)}
                    </td>
                    <td className="px-4 py-2 font-bold text-slate-900 border-r border-slate-100">
                      {totalEvaluatedRegularMinutes > 0 ? formatMinutesAsMins(totalEvaluatedRegularMinutes) : "-"}
                    </td>
                    <td className="px-4 py-2 font-bold text-slate-900 border-r border-slate-100">
                      {totalRegularOtMinutes > 0 ? formatMinutesAsMins(totalRegularOtMinutes) : "-"}
                    </td>
                    <td className="px-4 py-2 font-bold text-slate-900 border-r border-slate-100 whitespace-nowrap" style={{ minWidth: 150 }}>
                      {totalAdjustedRdOtMinutes > 0 ? formatMinutesAsMins(totalAdjustedRdOtMinutes) : "-"}
                    </td>
                    <td className="px-4 py-2 font-bold text-slate-900 border-r border-slate-100 bg-red-50">
                      {totalEvaluatedMinutes > 0 ? formatMinutesAsMins(totalEvaluatedMinutes) : "-"}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-100">
                      {totalDisplayedUsHoMinutes > 0
                        ? <span className="flex items-center gap-1 font-semibold text-blue-600"><LuCalendar size={12} strokeWidth={2} />{formatMinutesAsMins(totalDisplayedUsHoMinutes)}</span>
                        : <span className="text-slate-500">-</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-500 border-r border-slate-100 whitespace-nowrap" style={{ minWidth: 150 }}>
                      {otTotals.ho > 0 ? formatMinutesAsMins(otTotals.ho) : "-"}
                    </td>
                    <td className="px-4 py-2 text-slate-500 border-r border-slate-100">
                      -
                    </td>
                    <td className="px-4 py-2 text-slate-500 border-r border-slate-100 whitespace-nowrap" style={{ minWidth: 150 }}>
                      {totalLocalHolidayMinutes > 0 ? formatMinutesAsMins(totalLocalHolidayMinutes) : "-"}
                    </td>
                    {!isIndia && (
                      <td className="px-4 py-2 text-slate-500 border-r border-slate-100">
                        -
                      </td>
                    )}
                    {!isIndia && (
                      <td className="px-4 py-2 text-slate-500 border-r border-slate-100">
                        {totalTimeOffRequestMinutes > 0 ? formatMinutesAsMins(totalTimeOffRequestMinutes) : "-"}
                      </td>
                    )}
                    <td className="px-4 py-2 font-bold text-slate-900">
                      {formatMinutesAsMins(isIndia ? indiaTotalMinutes + totalHolidayMins : completionTotalMinutes)}
                    </td>
                    <td className="sticky right-0 z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-2 text-slate-500 shadow-[-1px_0_0_0_#e2e8f0]">
                      -
                    </td>
                  </tr>
                  {isIndia && (
                    <>
                      <tr>
                        <td className="sticky left-0 z-20 w-[156px] min-w-[156px] bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                          Offset Credit
                        </td>
                        <td className={`sticky left-[156px] z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-2 text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]`}>-</td>
                        <td className="sticky left-[296px] z-20 w-[160px] min-w-[160px] bg-slate-50 px-4 py-2 text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className={`px-4 py-2 font-bold ${appliedOffsetCredit > 0 ? "text-red-600" : "text-slate-900"}`}>
                          {formatMinutesAsMins(offsetCredit || appliedOffsetCredit)}
                        </td>
                        <td className="sticky right-0 z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-2 text-slate-500 shadow-[-1px_0_0_0_#e2e8f0]">-</td>
                      </tr>
                      <tr>
                        <td className="sticky left-0 z-20 w-[156px] min-w-[156px] bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#003527] border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                          Net Time
                        </td>
                        <td className={`sticky left-[156px] z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-2 text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]`}>-</td>
                        <td className="sticky left-[296px] z-20 w-[160px] min-w-[160px] bg-slate-50 px-4 py-2 text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
                        <td className={`px-4 py-2 font-bold ${appliedOffsetCredit > 0 && offsetCredit === 0 ? "text-red-600" : "text-[#003527]"}`}>
                          {formatMinutesAsMins(offsetCredit > 0 ? indiaTotalMinutes + offsetCredit + totalHolidayMins : indiaNetCompletionMinutes + totalHolidayMins)}
                        </td>
                        <td className="sticky right-0 z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-2 text-slate-500 shadow-[-1px_0_0_0_#e2e8f0]">-</td>
                      </tr>
                    </>
                  )}
                </tfoot>
              </table>
            </div>
          </div>
          {record.weeklyStatus === "For Review" && (
            <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
              <LuCircleAlert size={18} className="text-amber-500" />
              <div>
                <p className="text-sm font-bold text-amber-700">{record.weeklyStatus}</p>
                <p className="text-xs text-slate-500">
                  Actual: {record.actualMinutes.toLocaleString()} min &middot; Standard: {(isIndia ? 2400 : record.standardMinutes).toLocaleString()} min
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 sm:px-6 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50">
          {saveError && <p className="mr-auto text-sm font-medium text-red-600">{saveError}</p>}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Close
          </button>
          {isIndia && appliedOffsetCredit === 0 && offsetCredit === 0 && completionTotalMinutes < 2400 && (
            <button
              type="button"
              onClick={applyTimeCredit}
              disabled={!isWeekEnded}
              title={!isWeekEnded ? "Apply Time Credit is only available once the selected week has ended" : undefined}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-50"
            >
              <LuCircleCheck size={15} strokeWidth={2} />
              Apply Time Credit
            </button>
          )}
          {!isIndia && (
            <button
              type="button"
              onClick={approveAllDays}
              disabled={!isWeekEnded}
              title={!isWeekEnded ? "Approve All is only available once the selected week has ended" : undefined}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-50"
            >
              <LuCircleCheck size={15} strokeWidth={2} />
              Approve All
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={isSaving || isLoadingReviewData}
            title={isLoadingReviewData ? "Waiting for saved review data to finish loading…" : undefined}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#003527] rounded-lg hover:bg-[#064E3B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkApproveModal({ worksnapRows, allLeaveRequests, onClose, onApprove, usaHolidays, allHolidays, week, isWeekEnded }: {
  worksnapRows: AttendanceRow[];
  allLeaveRequests: AdminLeaveRequest[];
  onClose: () => void;
  onApprove: () => void;
  usaHolidays: HolidayEntry[];
  allHolidays: HolidayEntry[];
  week: string;
  isWeekEnded: boolean;
}) {
  const [payCategoryFilter, setPayCategoryFilter] = useState("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [deptFilter, setDeptFilter] = useState("All");
  const [shiftTypeFilter, setShiftTypeFilter] = useState("All");
  const [modalRows, setModalRows] = useState<AttendanceRow[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processedApprovals, setProcessedApprovals] = useState<Map<string, number>>(new Map());
  const [isSavingBulk, setIsSavingBulk] = useState(false);
  const [bulkSaveError, setBulkSaveError] = useState("");
  const [failedContractorIds, setFailedContractorIds] = useState<Map<string, string>>(new Map());
  const [loadError, setLoadError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [adjustedByContractor, setAdjustedByContractor] = useState<Map<string, Record<string, number>>>(new Map());
  const [savingElapsedSeconds, setSavingElapsedSeconds] = useState(0);

  // Ticks once a second while a save is in flight, purely to show elapsed
  // time in the "Saving…" overlay — resets whenever a save starts/stops.
  useEffect(() => {
    if (!isSavingBulk) return;
    setSavingElapsedSeconds(0);
    const id = setInterval(() => setSavingElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isSavingBulk]);

  // Approved leave requests, filtered from the parent's already-fetched list
  // rather than re-querying the whole leave_requests table again here.
  const leaveRequests = useMemo(
    () => allLeaveRequests.filter((r) => r.status === "Approved"),
    [allLeaveRequests]
  );

  // Uses the same week currently selected in Weekly Time Tracking (passed in
  // via the `week` prop) rather than its own independent week picker.
  const modalWeekDates = week ? datesBetween(week, addDaysIso(week, 6)) : [];
  const payCategoryOptions = Array.from(new Set(modalRows.map(payCategoryForAttendanceRow).filter((c) => c !== "-"))).sort();
  const countryOptions = Array.from(new Set(modalRows.map((r) => r.region).filter(Boolean))).sort();
  const deptOptions = Array.from(new Set(modalRows.map(departmentForAttendanceRow))).sort();
  const shiftTypeOptions = Array.from(new Set(modalRows.map((row) => row.shiftType ?? "").filter(Boolean))).sort();

  useEffect(() => {
    if (!week) return;
    let isCancelled = false;
    const dates = datesBetween(week, addDaysIso(week, 6));
    const from = dates[0];
    const to = dates[dates.length - 1];
    setIsLoading(true);
    setLoadError("");

    async function load() {
      try {
        const [entriesResult, weekStatusResult, dailyLogResult, dayStatusResult] = await Promise.all([
          fetchWithRetry(`/api/worksnap-entries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then((r) => r.json()),
          fetchWithRetry(`/api/attendance/week-status?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then((r) => (r.ok ? r.json() : { weekStatuses: [] })),
          fetchWithRetry(`/api/attendance/daily-log?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then((r) => (r.ok ? r.json() : { logs: [] })),
          fetchWithRetry(`/api/attendance/day-status?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then((r) => (r.ok ? r.json() : { days: [] })),
        ]);
        if (isCancelled) return;

        const rows = worksnapEntriesToAttendanceRecords((entriesResult.entries ?? []) as WorksnapEntry[], dates);
        const savedByUserId = new Map<number, { requestStatus: string; completionMinutes: number | null }>(
          (weekStatusResult.weekStatuses ?? []).map((s: { worksnapUserId: number; requestStatus: string; completionMinutes: number | null }) => [s.worksnapUserId, s])
        );
        const mergedRows = rows.map((row) => {
          const saved = row.worksnapUserId != null ? savedByUserId.get(row.worksnapUserId) : undefined;
          if (!saved) return row;
          return {
            ...row,
            completionMinutes: saved.completionMinutes ?? row.completionMinutes,
            weeklyStatus: saved.requestStatus === "APPROVED" ? "Reviewed" : row.weeklyStatus,
          };
        });
        setModalRows(mergedRows);
        setDailyLogs((dailyLogResult.logs ?? []) as DailyLogEntry[]);

        // Adjusted Time overrides Worksnap Time the same way an individual
        // Attendance Review does — one bulk request covers every contractor's
        // saved per-day adjustment instead of firing one request per candidate
        // row (was the slow part of loading this modal).
        const candidateRows = mergedRows.filter((r) =>
          r.weeklyStatus === "For Review" && !isFixedContractor(r.payCategory) && r.worksnapUserId != null
        );
        const adjustedByEmail = new Map<string, Record<string, number>>();
        for (const d of (dayStatusResult.days ?? []) as Array<{ email?: string; date?: string; adjustedMinutes?: number | null }>) {
          const email = String(d.email ?? "").trim().toLowerCase();
          if (!email || d.adjustedMinutes == null || d.adjustedMinutes <= 0) continue;
          const map = adjustedByEmail.get(email) ?? {};
          map[String(d.date ?? "")] = d.adjustedMinutes;
          adjustedByEmail.set(email, map);
        }
        const adjustedEntries: [string, Record<string, number>][] = candidateRows.map((r) => {
          const email = r.role.includes("@") ? r.role.trim().toLowerCase() : "";
          return [r.contractorId, adjustedByEmail.get(email) ?? {}];
        });
        if (isCancelled) return;
        setAdjustedByContractor(new Map(adjustedEntries));
      } catch {
        if (isCancelled) return;
        setModalRows([]);
        setLoadError("Unable to load contractors for bulk approval. Please try again.");
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    load();
    return () => { isCancelled = true; };
  }, [week, retryNonce]);

  const filteredRows = modalRows
    .filter((r) =>
      r.weeklyStatus === "For Review" &&
      !isFixedContractor(r.payCategory) &&
      (payCategoryFilter === "All" || payCategoryForAttendanceRow(r) === payCategoryFilter) &&
      (countryFilter === "All" || r.region === countryFilter) &&
      (deptFilter === "All" || departmentForAttendanceRow(r) === deptFilter) &&
      (shiftTypeFilter === "All" || r.shiftType === shiftTypeFilter)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const allSelected = filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.contractorId));

  function toggle(id: string) {
    setSelectedIds((ids) => { const next = new Set(ids); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredRows.map((r) => r.contractorId)));
  }

  function rowHolidayBonus(r: AttendanceRow) {
    const rowDailyMins = effectiveDailyMinutesFor(r, adjustedByContractor.get(r.contractorId));
    const rowRestDays = restDaysForAttendanceRow(r);
    return modalWeekDates.reduce(
      (sum, date) => sum + timeValueToMinutes(holidayTimeFor(date, usaHolidays, rowDailyMins, rowRestDays, modalWeekDates)),
      0
    );
  }

  function rowLocalHolidayMinutes(r: AttendanceRow) {
    const userLogs = dailyLogs.filter((l) => l.worksnapUserId === r.worksnapUserId);
    return modalWeekDates.reduce(
      (sum, date) => sum + (localHolidayMinutesFor(date, userLogs, r.region, allHolidays) ?? 0),
      0
    );
  }

  function rowTimeOffRequestMinutes(r: AttendanceRow) {
    const email = r.role.includes("@") ? r.role : "";
    if (!email) return 0;
    return totalTimeOffRequestMinutesFor(modalWeekDates, leaveRequests.filter((req) => req.email === email));
  }

  // Same week-total formula Attendance Review actually saves (see
  // rowWeeklyTotals/buildBulkApproveDaySnapshots), not the legacy
  // computeApprovedCompletionMinutes (which never saw real leave requests
  // or HO OT Time).
  function bulkApproveCompletionMinutes(r: AttendanceRow) {
    const email = r.role.includes("@") ? r.role : "";
    return rowWeeklyTotals(
      r, modalWeekDates, usaHolidays, dailyLogs, allHolidays,
      adjustedByContractor.get(r.contractorId), leaveRequests.filter((req) => req.email === email)
    ).totalCompletionMinutes;
  }

  function handleBulkApprovePreview() {
    const map = new Map<string, number>();
    filteredRows.filter((r) => selectedIds.has(r.contractorId)).forEach((r) => {
      map.set(r.contractorId, bulkApproveCompletionMinutes(r));
    });
    setProcessedApprovals(map);
    setFailedContractorIds(new Map());
    setBulkSaveError("");
  }

  async function handleSave() {
    const approvedMinutesById = processedApprovals.size > 0
      ? processedApprovals
      : new Map<string, number>(filteredRows
          .filter((r) => selectedIds.has(r.contractorId))
          .map((r) => [r.contractorId, bulkApproveCompletionMinutes(r)])
        );

    const rowsToSave = filteredRows.filter((r) => selectedIds.has(r.contractorId) && r.worksnapUserId != null);
    setIsSavingBulk(true);
    setBulkSaveError("");
    setFailedContractorIds(new Map());
    // One request for every selected contractor, instead of one request per
    // contractor racing for the same DB connection pool — each contractor
    // still gets its own transaction server-side, so one failing doesn't
    // block the rest, and the response says exactly which ones failed.
    const contractorIdByWorksnapUserId = new Map(rowsToSave.map((r) => [r.worksnapUserId as number, r.contractorId]));
    const items = rowsToSave.map((r) => {
      const email = r.role.includes("@") ? r.role : "";
      return {
        worksnapUserId: r.worksnapUserId,
        email,
        week: modalWeekDates[0],
        requestStatus: "APPROVED",
        completionMinutes: approvedMinutesById.get(r.contractorId) ?? 0,
        days: buildBulkApproveDaySnapshots(r, modalWeekDates, usaHolidays, dailyLogs, allHolidays, adjustedByContractor.get(r.contractorId), leaveRequests.filter((req) => req.email === email)),
      };
    });
    type BulkSaveResult = { worksnapUserId: number | null; ok: boolean; error?: string };
    const response = await fetch("/api/attendance/status/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
      .then(async (res) => (res.ok ? ((await res.json()) as { results: BulkSaveResult[] }) : null))
      .catch(() => null);

    setIsSavingBulk(false);

    const results = response?.results ?? [];
    const failedMap = new Map<string, string>();
    for (const r of results) {
      if (r.ok || r.worksnapUserId == null) continue;
      const contractorId = contractorIdByWorksnapUserId.get(r.worksnapUserId);
      if (contractorId) failedMap.set(contractorId, r.error ?? "Failed to save");
    }

    if (!response || failedMap.size > 0) {
      setFailedContractorIds(failedMap);
      setBulkSaveError(
        failedMap.size > 0
          ? `${failedMap.size} of ${results.length} approval${results.length !== 1 ? "s" : ""} failed to save — highlighted below. Please retry.`
          : "Some approvals failed to save. Please try again."
      );
      // Some contractors may have saved successfully even though others
      // failed — refresh the main table so those aren't left stale.
      if (results.some((r) => r.ok)) onApprove();
      return;
    }

    onApprove();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-[#003527] bg-[#003527] flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Bulk Approve</h3>
            <p className="text-sm text-green-200 mt-0.5">
              Approve all selected contractors for {week ? weekLabel(week) : "the selected week"} (same week as Weekly Time Tracking)
            </p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-green-200 transition-colors hover:bg-[#064E3B] hover:text-white">
            <LuX size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <select value={payCategoryFilter} onChange={(e) => setPayCategoryFilter(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-teal-500">
            <option value="All">All Pay Categories</option>
            {payCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-teal-500">
            <option value="All">All Departments</option>
            {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-teal-500">
            <option value="All">All Countries</option>
            {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={shiftTypeFilter} onChange={(e) => setShiftTypeFilter(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-teal-500">
            <option value="All">All Shift Types</option>
            {shiftTypeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {/* Table */}
        <div className="min-h-0 overflow-x-auto overflow-y-auto">
          <table className="w-full text-left text-sm" style={{ minWidth: "1560px", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead className="bg-slate-50 sticky top-0 z-30 border-b border-slate-200">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 w-[52px] min-w-[52px] border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300 accent-[#003527] cursor-pointer" aria-label="Select all" />
                </th>
                <th className="sticky left-[52px] z-20 bg-slate-50 px-4 py-3 w-[220px] min-w-[220px] text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">Contractor</th>
                <th className="sticky left-[272px] z-20 bg-slate-50 px-4 py-3 w-[160px] min-w-[160px] text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">Department</th>
                {["Actual Time",
                  "Total Evaluated Regular Time", "Total Regular OT Time", "Total RD OT Time", "Total Evaluated Time", "Total US HO Time", "Total HO OT Time",
                  "Local HO Time", "Total Time Off Request Time", "Ind Time",
                  "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap border-r border-slate-100 last:border-r-0">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={14} className="px-5 py-10 text-center text-sm text-slate-400">
                  <span className="inline-flex items-center gap-1.5"><LuRefreshCw size={14} className="animate-spin" /> Loading…</span>
                </td></tr>
              ) : loadError ? (
                <tr><td colSpan={14} className="px-5 py-10 text-center text-sm">
                  <span className="inline-flex items-center gap-2 text-red-600">
                    {loadError}
                    <button
                      onClick={() => setRetryNonce((n) => n + 1)}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-200 rounded-md text-xs font-bold text-red-700 hover:bg-red-100"
                    >
                      <LuRefreshCw size={12} /> Retry
                    </button>
                  </span>
                </td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={14} className="px-5 py-10 text-center text-sm text-slate-400">No contractors match the selected filters.</td></tr>
              ) : filteredRows.map((row) => {
                const processedMins = processedApprovals.get(row.contractorId);
                const rowHolidayBonusMins = rowHolidayBonus(row);
                const rowEmailForLeave = row.role.includes("@") ? row.role : "";
                const weeklyTotals = rowWeeklyTotals(row, modalWeekDates, usaHolidays, dailyLogs, allHolidays, adjustedByContractor.get(row.contractorId), leaveRequests.filter((req) => req.email === rowEmailForLeave));
                const completionMins = processedMins ?? row.completionMinutes ?? weeklyTotals.totalCompletionMinutes;
                const isProcessed = processedMins !== undefined;
                const localHolidayMins = rowLocalHolidayMinutes(row);
                const timeOffRequestMins = rowTimeOffRequestMinutes(row);
                const failedError = failedContractorIds.get(row.contractorId);
                const hasFailed = failedError !== undefined;
                return (
                <tr key={row.contractorId} className={`transition-colors ${hasFailed ? "bg-red-50" : "hover:bg-slate-50"}`}>
                  <td className={`sticky left-0 z-10 px-4 py-3 w-[52px] min-w-[52px] border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0] ${hasFailed ? "bg-red-50" : "bg-white"}`}>
                    <input type="checkbox" checked={selectedIds.has(row.contractorId)} onChange={() => toggle(row.contractorId)} className="h-4 w-4 rounded border-slate-300 accent-[#003527] cursor-pointer" aria-label={`Select ${row.name}`} />
                  </td>
                  <td
                    title={hasFailed ? `Failed to save: ${failedError}` : undefined}
                    className={`sticky left-[52px] z-10 px-4 py-3 w-[220px] min-w-[220px] border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0] ${hasFailed ? "bg-red-50" : "bg-white"}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#003527] text-white flex items-center justify-center text-xs font-bold shrink-0">{row.avatar}</div>
                      <div>
                        <p className={`font-semibold whitespace-nowrap ${hasFailed ? "text-red-700" : "text-slate-900"}`}>{row.name}</p>
                        <p className={`text-xs whitespace-nowrap ${hasFailed ? "text-red-500" : "text-slate-500"}`}>
                          {hasFailed ? `Failed to save — ${failedError}` : row.role}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className={`sticky left-[272px] z-10 px-4 py-3 w-[160px] min-w-[160px] text-sm whitespace-nowrap border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0] ${hasFailed ? "bg-red-50 text-red-700" : "bg-white text-slate-600"}`}>{departmentForAttendanceRow(row)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-900 border-r border-slate-100">{row.actualMinutes.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 border-r border-slate-100">
                    {weeklyTotals.totalEvaluatedRegularMinutes > 0 ? formatMinutesAsMins(weeklyTotals.totalEvaluatedRegularMinutes) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 border-r border-slate-100">
                    {weeklyTotals.totalRegularOtMinutes > 0 ? formatMinutesAsMins(weeklyTotals.totalRegularOtMinutes) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 border-r border-slate-100">
                    {weeklyTotals.totalRdOtMinutes > 0 ? formatMinutesAsMins(weeklyTotals.totalRdOtMinutes) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 border-r border-slate-100">
                    {weeklyTotals.totalEvaluatedMinutes > 0 ? formatMinutesAsMins(weeklyTotals.totalEvaluatedMinutes) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 border-r border-slate-100">
                    {weeklyTotals.totalUsHoMinutes > 0 ? formatMinutesAsMins(weeklyTotals.totalUsHoMinutes) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 border-r border-slate-100">
                    {weeklyTotals.totalHoOtMinutes > 0 ? formatMinutesAsMins(weeklyTotals.totalHoOtMinutes) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 border-r border-slate-100">
                    {localHolidayMins > 0 ? formatMinutesAsMins(localHolidayMins) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 border-r border-slate-100">
                    {timeOffRequestMins > 0 ? formatMinutesAsMins(timeOffRequestMins) : "—"}
                  </td>
                  <td className={`px-4 py-3 text-sm font-semibold border-r border-slate-100 ${isProcessed ? "text-emerald-700 bg-emerald-50" : "text-slate-900"}`}>
                    <span className="flex items-center gap-1.5">
                      <span>{completionMins > 0 ? formatMinutesAsMins(completionMins) : "—"}</span>
                      {rowHolidayBonusMins > 0 && (
                        <span title="Includes US holiday time" className="inline-flex items-center justify-center rounded-full bg-blue-100 p-0.5">
                          <LuCalendar size={11} strokeWidth={2} className="text-blue-500" />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.weeklyStatus === "Standard Met" && <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-[11px] font-bold uppercase">Standard Met</span>}
                    {row.weeklyStatus === "For Review" && (
                      <span className="flex items-center gap-1 text-red-600">
                        <LuCircleAlert size={13} strokeWidth={2} />
                        <span className="text-[11px] font-bold uppercase">For Review</span>
                      </span>
                    )}
                    {row.weeklyStatus === "On Leave" && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-[11px] font-bold uppercase">On Leave</span>}
                    {row.weeklyStatus === "Reviewed" && <span className="px-2 py-1 bg-orange-100 text-orange-600 rounded-md text-[11px] font-bold uppercase">Reviewed</span>}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-4 sm:px-6 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50">
          {bulkSaveError && <p className="mr-auto text-sm font-medium text-red-600">{bulkSaveError}</p>}
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            Close
          </button>
          {processedApprovals.size === 0 ? (
            <button
              type="button"
              onClick={handleBulkApprovePreview}
              disabled={selectedIds.size === 0 || !isWeekEnded}
              title={!isWeekEnded ? "Bulk Approve is only available once the selected week has ended" : undefined}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <LuCircleCheck size={15} strokeWidth={2} />
              Bulk Approve
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSavingBulk}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#003527] rounded-lg hover:bg-[#064E3B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LuCircleCheck size={15} strokeWidth={2} />
              {isSavingBulk ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      {/* Saving overlay — blocks interaction and shows elapsed time while a
          save is in flight (a large batch can take a little while). */}
      {isSavingBulk && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 flex flex-col items-center gap-3 min-w-[240px]">
            <LuRefreshCw size={28} className="text-emerald-600 animate-spin" />
            <p className="text-sm font-semibold text-slate-700">Saving approvals…</p>
            <p className="text-xs text-slate-400 tabular-nums">{formatElapsedSeconds(savingElapsedSeconds)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── per-user task × date breakdown modal ────────────────────────────────────
type BreakdownTask = { projectName: string; taskName: string; category: string; perDay: Record<string, number>; total: number };
type BreakdownResponse = { userName: string; email: string; week: string; days: string[]; tasks: BreakdownTask[]; dailyTotals: Record<string, number>; grandTotal: number; adjustments: Record<string, number>; timeOff: Record<string, number>; firstIn: Record<string, string>; lastOut: Record<string, string> };

const CAT_CHIP: Record<string, string> = { Work: "bg-emerald-50 text-emerald-700", Break: "bg-amber-50 text-amber-700", "Meeting/Training": "bg-sky-50 text-sky-700" };

const signed = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());

function breakdownDayHeader(iso: string) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return { dow: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }), day: d.getUTCDate(), mon: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) };
}

function BreakdownModal({ userId, userName, email, week, onClose }: { userId: number; userName: string; email: string; week: string; onClose: () => void }) {
  const [data, setData] = useState<BreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true; setLoading(true);
    fetch(`/api/attendance/user-breakdown/?userId=${userId}&week=${week}`, { cache: "no-store" })
      .then((r) => r.json()).then((d: BreakdownResponse) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, week]);
  const days = data?.days ?? [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#003527]">{userName} — Task Breakdown</h3>
            <p className="text-sm text-slate-500 mt-0.5">{email || "no platform email"} · week of {weekLabel(week)}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded"><LuX size={18} /></button>
        </div>
        <div className="overflow-auto p-2 sm:p-4">
          {loading && <p className="px-4 py-10 text-center text-sm text-slate-400">Loading…</p>}
          {!loading && data && data.tasks.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-400">No logged time this week.</p>}
          {!loading && data && data.tasks.length > 0 && (
            <table className="w-full text-left text-sm" style={{ minWidth: "640px" }}>
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Project / Task</th>
                  {days.map((d) => { const h = breakdownDayHeader(d); return (
                    <th key={d} className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                      {h.dow}<br /><span className="text-slate-400 font-semibold">{h.day} {h.mon}</span></th>); })}
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.tasks.map((t, i) => (
                  <tr key={i} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2"><div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${CAT_CHIP[t.category] ?? "bg-slate-100 text-slate-600"}`}>{t.taskName || t.category}</span>
                      <span className="text-xs text-slate-400">{t.projectName}</span></div></td>
                    {days.map((d) => <td key={d} className={`px-2 py-2 text-center tabular-nums ${t.perDay[d] ? "text-slate-800" : "text-slate-300"}`}>{t.perDay[d] ?? "·"}</td>)}
                    <td className="px-3 py-2 text-right font-bold text-slate-900 tabular-nums">{t.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/60">
                  <td className="px-3 py-1.5 text-xs font-semibold text-teal-700">First In</td>
                  {days.map((d) => { const v = data.firstIn?.[d]; return <td key={d} className={`px-2 py-1.5 text-center tabular-nums whitespace-nowrap ${v ? "text-teal-700 font-semibold" : "text-slate-300"}`}>{v || "·"}</td>; })}
                  <td className="px-3 py-1.5 text-right text-slate-300">—</td>
                </tr>
                <tr className="bg-slate-50/60">
                  <td className="px-3 py-1.5 text-xs font-semibold text-rose-600">Last Out</td>
                  {days.map((d) => { const v = data.lastOut?.[d]; return <td key={d} className={`px-2 py-1.5 text-center tabular-nums whitespace-nowrap ${v ? "text-rose-600 font-semibold" : "text-slate-300"}`}>{v || "·"}</td>; })}
                  <td className="px-3 py-1.5 text-right text-slate-300">—</td>
                </tr>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-600">Worked (min)</td>
                  {days.map((d) => <td key={d} className="px-2 py-2 text-center font-bold text-[#003527] tabular-nums">{data.dailyTotals[d] || 0}</td>)}
                  <td className="px-3 py-2 text-right font-extrabold text-[#003527] tabular-nums">{data.grandTotal}</td>
                </tr>
                <tr className="bg-slate-50/60">
                  <td className="px-3 py-1.5 text-xs font-semibold text-indigo-600">Manual Adjustment</td>
                  {days.map((d) => { const v = data.adjustments?.[d] ?? 0; return <td key={d} className={`px-2 py-1.5 text-center tabular-nums ${v ? "text-indigo-600 font-semibold" : "text-slate-300"}`}>{v ? signed(v) : "·"}</td>; })}
                  <td className="px-3 py-1.5 text-right font-bold text-indigo-600 tabular-nums">{signed(days.reduce((s, d) => s + (data.adjustments?.[d] ?? 0), 0))}</td>
                </tr>
                <tr className="bg-slate-50/60">
                  <td className="px-3 py-1.5 text-xs font-semibold text-amber-600">Time Off</td>
                  {days.map((d) => { const v = data.timeOff?.[d] ?? 0; return <td key={d} className={`px-2 py-1.5 text-center tabular-nums ${v ? "text-amber-600 font-semibold" : "text-slate-300"}`}>{v || "·"}</td>; })}
                  <td className="px-3 py-1.5 text-right font-bold text-amber-600 tabular-nums">{days.reduce((s, d) => s + (data.timeOff?.[d] ?? 0), 0)}</td>
                </tr>
                <tr className="border-t-2 border-slate-200 bg-emerald-50/60">
                  <td className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#003527]">Total (min)</td>
                  {days.map((d) => { const v = (data.dailyTotals[d] ?? 0) + (data.adjustments?.[d] ?? 0) + (data.timeOff?.[d] ?? 0); return <td key={d} className={`px-2 py-2 text-center font-bold tabular-nums ${v ? "text-[#003527]" : "text-slate-300"}`}>{v || "·"}</td>; })}
                  <td className="px-3 py-2 text-right font-extrabold text-[#003527] tabular-nums">{days.reduce((s, d) => s + (data.dailyTotals[d] ?? 0) + (data.adjustments?.[d] ?? 0) + (data.timeOff?.[d] ?? 0), 0)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const [weeks, setWeeks] = useState<string[]>([]);
  const [week, setWeek] = useState("");
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{ record: AttendanceRecord; source: "view" | "review" } | null>(null);
  const [worksnapRows, setWorksnapRows] = useState<AttendanceRow[]>([]);
  const [isLoadingWorksnap, setIsLoadingWorksnap] = useState(true);
  const [worksnapError, setWorksnapError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [breakdownTarget, setBreakdownTarget] = useState<AttendanceRow | null>(null);
  const [nameSearch, setNameSearch] = useState("");
  const [payCategoryFilter, setPayCategoryFilter] = useState("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [shiftTypeFilter, setShiftTypeFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showBulkApproveModal, setShowBulkApproveModal] = useState(false);
  const [offsetCreditsByWeek, setOffsetCreditsByWeek] = useState<Record<string, Record<string, number>>>({});
  const [usaHolidays, setUsaHolidays] = useState<HolidayEntry[]>([]);
  const [allHolidays, setAllHolidays] = useState<HolidayEntry[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<AdminLeaveRequest[]>([]);

  const rangeFrom = week;                 // Sunday (week start)
  const rangeTo = addDaysIso(week, 6);    // Saturday (week end)
  // Memoized so it keeps the same array reference across unrelated re-renders
  // (typing in a filter, holidays/leave-requests resolving, etc.) — ReviewModal
  // and BulkApproveModal key their data-loading effects on this array, and a
  // fresh reference on every render was re-triggering those fetches and
  // resetting in-progress review edits back to defaults.
  const weekDates = useMemo(() => datesBetween(rangeFrom, rangeTo), [rangeFrom, rangeTo]);
  // Bulk Approve / Approve All / Apply Time Credit only make sense once the
  // selected week has fully finished — an ongoing (or future) week's daily
  // totals are still incomplete, so bulk-approving it would lock in partial data.
  const isSelectedWeekEnded = arizonaTodayIso() > rangeTo;

  useEffect(() => {
    fetch("/api/holidays")
      .then((r) => r.json())
      .then((data) => {
        const holidays: HolidayEntry[] = data.holidays ?? [];
        setAllHolidays(holidays);
        setUsaHolidays(holidays.filter((h) => h.country === "United States"));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchAllLeaveRequestsAdmin()
      .then(setLeaveRequests)
      .catch(() => setLeaveRequests([]));
  }, []);

  // Week selector = recent Sun→Sat weeks in Arizona time, anchored to the
  // current week (e.g. Jun 28 – Jul 4). Computed on the client to use the
  // browser's clock without an SSR/hydration mismatch.
  useEffect(() => {
    const list = recentWeeks();
    setWeeks(list);
    setWeek((current) => current || list[0]);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadWorksnapEntries() {
      if (!rangeFrom) return; // wait until the week list resolves
      setIsLoadingWorksnap(true);
      setWorksnapError("");

      try {
        const [response, weekStatusResponse] = await Promise.all([
          fetchWithRetry(`/api/worksnap-entries?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`),
          fetchWithRetry(`/api/attendance/week-status?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`),
        ]);
        const result = await response.json();

        if (!isMounted) return;

        if (!response.ok) {
          setWorksnapRows([]);
          setWorksnapError(result.error ?? "Unable to load Worksnap entries.");
        } else {
          const rows = worksnapEntriesToAttendanceRecords((result.entries ?? []) as WorksnapEntry[], weekDates);
          const weekStatusResult = weekStatusResponse.ok ? await weekStatusResponse.json() : { weekStatuses: [] };
          type SavedWeekStatus = {
            worksnapUserId: number; requestStatus: string; completionMinutes: number | null; totalLocalHolidayMinutes: number | null;
            totalEvaluatedRegularMinutes: number | null; totalEvaluatedMinutes: number | null; totalUsHoMinutes: number | null;
            totalRegularOtMinutes: number | null; totalRdOtMinutes: number | null; totalHoOtMinutes: number | null;
          };
          const savedByUserId = new Map<number, SavedWeekStatus>(
            (weekStatusResult.weekStatuses ?? []).map((s: SavedWeekStatus) => [s.worksnapUserId, s])
          );
          setWorksnapRows(rows.map((row) => {
            const saved = row.worksnapUserId != null ? savedByUserId.get(row.worksnapUserId) : undefined;
            if (!saved) return row;
            return {
              ...row,
              completionMinutes: saved.completionMinutes ?? row.completionMinutes,
              totalLocalHolidayMinutes: saved.totalLocalHolidayMinutes,
              totalEvaluatedRegularMinutes: saved.totalEvaluatedRegularMinutes,
              totalEvaluatedMinutes: saved.totalEvaluatedMinutes,
              totalUsHoMinutes: saved.totalUsHoMinutes,
              totalRegularOtMinutes: saved.totalRegularOtMinutes,
              totalRdOtMinutes: saved.totalRdOtMinutes,
              totalHoOtMinutes: saved.totalHoOtMinutes,
              weeklyStatus: saved.requestStatus === "APPROVED" ? "Reviewed" : row.weeklyStatus,
            };
          }));
          setLastSyncedAt(result.lastSyncedAt ?? null);
        }
      } catch {
        if (!isMounted) return;
        setWorksnapRows([]);
        setWorksnapError("Unable to load Worksnap entries. Please check your connection and try again.");
      } finally {
        if (isMounted) setIsLoadingWorksnap(false);
      }
    }

    loadWorksnapEntries();

    return () => {
      isMounted = false;
    };
  }, [rangeFrom, rangeTo, reloadKey]);

  async function handleSync() {
    setSyncing(true);
    setWorksnapError("");
    try {
      const response = await fetch("/api/attendance/sync/", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setWorksnapError(result.error ?? "Sync failed. Please try again.");
        return;
      }
      if (result.syncedAt) setLastSyncedAt(result.syncedAt);
      // Re-run the loader effect to pull the freshly synced entries.
      setReloadKey((key) => key + 1);
    } catch {
      setWorksnapError("Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  }


  function formatRangeLabel(from: string, to: string) {
    if (!from || !to) return "—";
    const fmt = (d: string) => parseIsoDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(from)} – ${fmt(to)}`;
  }

  function formatArizona(iso: string | null): string {
    if (!iso) return "never";
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Phoenix", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    }) + " MST";
  }

  // No mock-data fallback on error: showing fabricated numbers in a payroll
  // table when the live fetch fails would look like real data and could
  // silently drive incorrect approvals. Errors surface via worksnapError
  // instead (banner + Retry), and the table stays empty until a real load
  // succeeds.
  const attendanceRows: AttendanceRow[] = worksnapRows;
  const filteredAttendanceRows = attendanceRows.filter((row) => {
    const query = nameSearch.trim().toLowerCase();
    const department = departmentForAttendanceRow(row);
    const payCategory = payCategoryForAttendanceRow(row);
    const matchesName = !query || row.name.toLowerCase().includes(query) || (row.role ?? "").toLowerCase().includes(query);
    const matchesPayCategory = payCategoryFilter === "All" || payCategory === payCategoryFilter;
    const matchesCountry = countryFilter === "All" || row.region === countryFilter;
    const matchesShiftType = shiftTypeFilter === "All" || row.shiftType === shiftTypeFilter;
    const matchesDepartment = departmentFilter === "All" || department === departmentFilter;
    const matchesStatus = statusFilter === "All" || row.weeklyStatus === statusFilter;

    return matchesName && matchesPayCategory && matchesCountry && matchesShiftType && matchesDepartment && matchesStatus;
  });
  const departmentOptions = Array.from(new Set(attendanceRows.map(departmentForAttendanceRow))).sort();
  const countryOptions = Array.from(new Set(attendanceRows.map((r) => r.region).filter(Boolean))).sort();
  const shiftTypeOptions = Array.from(new Set(attendanceRows.map((r) => r.shiftType ?? "").filter(Boolean))).sort();
  const payCategoryOptions = Array.from(new Set(attendanceRows.map(payCategoryForAttendanceRow).filter((c) => c !== "-"))).sort();

  const filtersActive =
    nameSearch.trim() !== "" ||
    payCategoryFilter !== "All" ||
    countryFilter !== "All" ||
    shiftTypeFilter !== "All" ||
    departmentFilter !== "All" ||
    statusFilter !== "All";

  function clearFilters() {
    setNameSearch("");
    setPayCategoryFilter("All");
    setCountryFilter("All");
    setShiftTypeFilter("All");
    setDepartmentFilter("All");
    setStatusFilter("All");
  }

  const perfectStandard  = filteredAttendanceRows.filter((r) => r.weeklyStatus === "Standard Met").length;
  const forReviewCount   = filteredAttendanceRows.filter((r) => r.weeklyStatus === "For Review").length;
  const reviewedCount    = filteredAttendanceRows.filter((r) => r.weeklyStatus === "Reviewed").length;

  const STATS = [
    { label: "Standard Met",      value: perfectStandard, color: "text-emerald-600", iconBg: "bg-teal-50",   iconColor: "text-teal-600",   Icon: LuCircleCheck },
    { label: "For Review",        value: forReviewCount,  color: "text-red-600",    iconBg: "bg-red-50",    iconColor: "text-red-600",    Icon: LuCircleAlert },
    { label: "Reviewed", value: reviewedCount,   color: "text-orange-600", iconBg: "bg-orange-50", iconColor: "text-orange-600", Icon: LuClock       },
  ];

  function appliedOffsetCreditFor(row: AttendanceRow) {
    return offsetCreditsByWeek[week]?.[row.contractorId] ?? 0;
  }

  function handleReviewSave(contractorId: string, offsetCreditApplied = 0) {
    // Re-fetch from Supabase rather than trust a local mutation, so the table
    // always ends up showing exactly what was persisted.
    setReloadKey((key) => key + 1);

    if (offsetCreditApplied <= 0) return;
    const nextWeekKey = addDaysIso(week, 7); // carry the credit into the following week

    setOffsetCreditsByWeek((current) => ({
      ...current,
      [nextWeekKey]: {
        ...(current[nextWeekKey] ?? {}),
        [contractorId]: offsetCreditApplied,
      },
    }));
  }

  function handleBulkApprove() {
    // Re-fetch from Supabase rather than trust a local mutation, so the table
    // always ends up showing exactly what was persisted.
    setReloadKey((key) => key + 1);
  }

  return (
    <div className="p-4 sm:p-5 md:p-6 max-w-400 mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 mb-3 md:mb-4">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-[#003527] tracking-tight">Attendance Management</h2>
          <p className="text-xs md:text-sm text-slate-600 mt-0.5">Weekly Time Tracking Review (Standard: 2,700 min/week)</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              onClick={() => setShowBulkApproveModal(true)}
              disabled={!isSelectedWeekEnded}
              title={!isSelectedWeekEnded ? "Bulk Approve is only available once the selected week has ended" : undefined}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-600"
            >
              <LuCircleCheck size={16} strokeWidth={2} />
              <span className="hidden sm:inline">Bulk Approve</span>
              <span className="sm:hidden">Approve</span>
            </button>
            <button className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white border border-slate-200 text-[#003527] rounded-lg text-sm font-semibold hover:bg-slate-50">
              <LuFileText size={16} /><span className="hidden sm:inline">Export Timesheet</span><span className="sm:hidden">Export</span>
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-3 sm:px-5 py-2 bg-[#003527] hover:bg-[#064E3B] text-white rounded-lg text-sm font-semibold transition-all shadow-md disabled:opacity-50"
            >
              <LuRefreshCw size={16} strokeWidth={2} className={syncing ? "animate-spin" : ""} />
              <span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync All Data"}</span>
              <span className="sm:hidden">{syncing ? "…" : "Sync"}</span>
            </button>
          </div>
          <p className="text-xs text-slate-400">Last updated: <span className="font-semibold text-slate-500">{syncing ? "syncing…" : formatArizona(lastSyncedAt)}</span></p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-3 md:mb-4">
        {STATS.map(({ label, value, color, iconBg, iconColor, Icon }) => (
          <div key={label} className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center ${iconColor} shrink-0`}><Icon size={14} strokeWidth={1.75} /></div>
            <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className={`text-xl font-bold leading-tight tabular-nums ${color}`}>{value}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Table header toolbar */}
        <div className="px-4 md:px-6 py-3 border-b border-slate-100 flex flex-col gap-3 bg-linear-to-b from-slate-50/80 to-white">
          {/* Row 1: title + week selector */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="hidden sm:grid size-9 shrink-0 place-items-center rounded-xl bg-[#003527] text-white shadow-sm">
                <LuChartColumn size={18} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-lg md:text-xl font-bold tracking-tight text-[#003527]">Weekly Time Tracking</h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  Summed from Worksnap entries · <span className="font-semibold text-slate-600">{formatRangeLabel(rangeFrom, rangeTo)}</span>
                </p>
                {isLoadingWorksnap && (
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-teal-600">
                    <LuRefreshCw size={12} className="animate-spin" /> Loading Worksnap entries…
                  </p>
                )}
                {!isLoadingWorksnap && worksnapError && (
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
                    Unable to load attendance data. {worksnapError}
                    <button
                      onClick={() => setReloadKey((key) => key + 1)}
                      className="font-bold underline hover:no-underline"
                    >
                      Retry
                    </button>
                  </p>
                )}
                {!isLoadingWorksnap && !worksnapError && attendanceRows.length === 0 && (
                  <p className="mt-1 text-xs font-medium text-slate-500">No Worksnap entries found.</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm w-full md:w-auto overflow-x-auto">
              <div className="flex gap-1">
                {weeks.slice(0, 4).map((w) => (
                  <button key={w} onClick={() => setWeek(w)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-all ${week === w ? "bg-[#003527] text-white shadow-sm" : "text-slate-500 hover:text-[#003527] hover:bg-slate-100"}`}>{weekLabel(w)}</button>
                ))}
              </div>
              <div className="h-6 w-px bg-slate-200 mx-0.5 shrink-0" />
              <div className="relative shrink-0">
                <button onClick={() => setShowRangePicker((v) => !v)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${showRangePicker ? "text-teal-700 bg-teal-50" : "text-slate-600 hover:text-teal-700 hover:bg-teal-50"}`}>
                  <LuCalendar size={15} strokeWidth={2} /><span className="text-xs font-bold">Jump to Week</span>
                </button>
                {showRangePicker && <WeekJumpDropdown onApply={(d) => setWeek(sundayOf(d))} onClose={() => setShowRangePicker(false)} />}
              </div>
              <div className="h-6 w-px bg-slate-200 mx-0.5 shrink-0" />
              <select
                value={week}
                onChange={(e) => setWeek(e.target.value)}
                title="Select any week from the last few months, including previous months"
                className="h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-teal-500"
              >
                {weeks.map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: search + filters (single wrapping row) */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <LuSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={nameSearch}
                onChange={(event) => setNameSearch(event.target.value)}
                placeholder="Search by name or email…"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-800 outline-none transition-all hover:border-slate-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
              />
              {nameSearch && (
                <button
                  onClick={() => setNameSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 grid size-5 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <LuX size={13} />
                </button>
              )}
            </div>

            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-40" value={payCategoryFilter} onChange={setPayCategoryFilter} label="Filter by pay category">
              <option value="All">All Pay Categories</option>
              {payCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </FilterSelect>
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-40" value={countryFilter} onChange={setCountryFilter} label="Filter by country">
              <option value="All">All Countries</option>
              {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </FilterSelect>
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-40" value={shiftTypeFilter} onChange={setShiftTypeFilter} label="Filter by shift type">
              <option value="All">All Shift Types</option>
              {shiftTypeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </FilterSelect>
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-40" value={departmentFilter} onChange={setDepartmentFilter} label="Filter by department">
              <option value="All">All Departments</option>
              {departmentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </FilterSelect>
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-40" value={statusFilter} onChange={setStatusFilter} label="Filter by status">
              <option value="All">All Statuses</option>
              <option value="For Review">For Review</option>
              <option value="Reviewed">Reviewed</option>
              <option value="Standard Met">Standard Met</option>
            </FilterSelect>

            <div className="flex items-center gap-2 ml-auto">
              {filtersActive && (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LuX size={14} strokeWidth={2.5} /> Clear
                </button>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 whitespace-nowrap">
                <span className="font-bold text-[#003527]">{filteredAttendanceRows.length}</span> shown
              </span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto" style={{ maxHeight: "60vh" }}>
          <table className="w-full text-left" style={{ minWidth: "720px", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead className="sticky top-0 z-30" style={{ background: "#003527" }}>
              <tr>
                {[
                  "Contractor", "Department", "Actual Time",
                  "Total Evaluated Regular Time", "Total Regular OT Time", "Total RD OT Time", "Total Evaluated Time", "Total US HO Time", "Total HO OT Time",
                  "Total Local HO Time", "Total Time Off Request Time", "Ind Time",
                  "Variance", "Status", "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className={`px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold uppercase tracking-widest text-white whitespace-nowrap overflow-hidden border-r border-b border-white/20 last:border-r-0 ${
                      h === "Status" || h === "Actions" ? "text-center" : ""
                    } ${
                      h === "Contractor" ? "sticky left-0 z-20" : ""
                    } ${h === "Status" ? "sticky right-[175px] z-20 border-l border-white/20" : ""} ${
                      h === "Actions" ? "sticky right-0 z-20 border-l border-white/20" : ""
                    }`}
                    style={
                      h === "Contractor" ? { minWidth: 280, width: 280, maxWidth: 280, background: "#003527" }
                      : h === "Status" ? { minWidth: 170, width: 170, maxWidth: 170, background: "#003527" }
                      : h === "Actions" ? { minWidth: 175, width: 175, maxWidth: 175, background: "#003527" }
                      : undefined
                    }
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoadingWorksnap && attendanceRows.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-6 py-10 text-center text-sm font-medium text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <LuRefreshCw size={14} className="animate-spin" /> Loading attendance data…
                    </span>
                  </td>
                </tr>
              )}
              {!isLoadingWorksnap && filteredAttendanceRows.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-6 py-10 text-center text-sm font-medium text-slate-500">
                    {worksnapError ? (
                      <span className="inline-flex items-center gap-2 text-red-600">
                        Unable to load attendance data. {worksnapError}
                        <button
                          onClick={() => setReloadKey((key) => key + 1)}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-200 rounded-md text-xs font-bold text-red-700 hover:bg-red-100"
                        >
                          <LuRefreshCw size={12} /> Retry
                        </button>
                      </span>
                    ) : attendanceRows.length === 0 ? (
                      "No Worksnap entries found for weekly tracking."
                    ) : (
                      "No weekly tracking rows match your search."
                    )}
                  </td>
                </tr>
              )}
              {!isLoadingWorksnap && filteredAttendanceRows.map((row) => {
                const variance = row.actualMinutes - row.standardMinutes;
                const isOnLeave = row.weeklyStatus === "On Leave";
                const isStandard = row.weeklyStatus === "Standard Met";
                const isForReview = row.weeklyStatus === "For Review";
                const isReviewed = row.weeklyStatus === "Reviewed";
                const appliedOffsetCredit = appliedOffsetCreditFor(row);
                const isAppliedTimeCredit = isFixedContractor(row.payCategory) && appliedOffsetCredit > 0;
                const computedCompletionMins = computeWeeklyCompletionMinutes(row, weekDates);
                const rowDailyMins = row.dailyWorksnapMinutes ?? {};
                const rowRestDays = restDaysForAttendanceRow(row);
                const holidayBonusMins = weekDates.reduce(
                  (sum, date) => sum + timeValueToMinutes(holidayTimeFor(date, usaHolidays, rowDailyMins, rowRestDays, weekDates)),
                  0
                );
                const completionMins = row.completionMinutes ?? (
                  isFixedContractor(row.payCategory)
                    ? Math.max(0, computedCompletionMins - appliedOffsetCredit) + holidayBonusMins
                    : computedCompletionMins + holidayBonusMins
                );

                const missingContractorProfile = row.hasContractorProfile === false;
                return (
                  <tr
                    key={row.contractorId}
                    className={`transition-colors group ${missingContractorProfile ? "bg-red-50 hover:bg-red-100" : "hover:bg-slate-50/80"}`}
                  >
                    {/* Contractor */}
                    <td
                      title={missingContractorProfile ? "Not yet added in Contractor Details" : undefined}
                      className={`px-4 md:px-6 py-3 md:py-4 sticky left-0 z-10 border-r border-b border-slate-200 overflow-hidden ${
                        missingContractorProfile ? "bg-red-50 group-hover:bg-red-100" : "bg-white group-hover:bg-slate-50"
                      }`}
                      style={{ minWidth: 280, width: 280, maxWidth: 280 }}
                    >
                      <div className="flex items-center gap-2 md:gap-3">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#003527] text-white flex items-center justify-center text-xs md:text-sm font-bold shrink-0">
                          {row.avatar}
                        </div>
                        <div>
                          <button
                            onClick={() => setBreakdownTarget(row)}
                            title="Task breakdown"
                            className="text-sm font-semibold text-slate-900 whitespace-nowrap hover:text-emerald-700 hover:underline text-left"
                          >
                            {row.name}
                          </button>
                          <p className="text-xs text-slate-500 whitespace-nowrap">{row.role}</p>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-4 md:px-6 py-3 md:py-4 text-sm font-medium text-slate-600 whitespace-nowrap border-r border-b border-slate-100">
                      {departmentForAttendanceRow(row)}
                    </td>

                    {/* Actual */}
                    <td className="px-4 md:px-6 py-3 md:py-4 border-r border-b border-slate-100">
                      {isOnLeave ? (
                        <span className="text-sm text-slate-400">—</span>
                      ) : (
                        <span className={`text-sm font-bold ${isForReview ? "text-red-600" : "text-slate-900"}`}>
                          {row.actualMinutes.toLocaleString()}
                        </span>
                      )}
                    </td>

                    {/* Total Evaluated Regular Time */}
                    <td className="px-4 md:px-6 py-3 md:py-4 border-r border-b border-slate-100">
                      {isOnLeave || !row.totalEvaluatedRegularMinutes ? (
                        <span className="text-sm text-slate-400">—</span>
                      ) : (
                        <span className="text-sm font-semibold text-slate-900">{formatMinutesAsMins(row.totalEvaluatedRegularMinutes)}</span>
                      )}
                    </td>

                    {/* Total Regular OT Time */}
                    <td className="px-4 md:px-6 py-3 md:py-4 border-r border-b border-slate-100">
                      {isOnLeave || !row.totalRegularOtMinutes ? (
                        <span className="text-sm text-slate-400">—</span>
                      ) : (
                        <span className="text-sm font-semibold text-slate-900">{formatMinutesAsMins(row.totalRegularOtMinutes)}</span>
                      )}
                    </td>

                    {/* Total RD OT Time */}
                    <td className="px-4 md:px-6 py-3 md:py-4 border-r border-b border-slate-100">
                      {isOnLeave || !row.totalRdOtMinutes ? (
                        <span className="text-sm text-slate-400">—</span>
                      ) : (
                        <span className="text-sm font-semibold text-slate-900">{formatMinutesAsMins(row.totalRdOtMinutes)}</span>
                      )}
                    </td>

                    {/* Total Evaluated Time */}
                    <td className="px-4 md:px-6 py-3 md:py-4 border-r border-b border-slate-100">
                      {isOnLeave || !row.totalEvaluatedMinutes ? (
                        <span className="text-sm text-slate-400">—</span>
                      ) : (
                        <span className="text-sm font-semibold text-slate-900">{formatMinutesAsMins(row.totalEvaluatedMinutes)}</span>
                      )}
                    </td>

                    {/* Total US HO Time */}
                    <td className="px-4 md:px-6 py-3 md:py-4 border-r border-b border-slate-100">
                      {isOnLeave || !row.totalUsHoMinutes ? (
                        <span className="text-sm text-slate-400">—</span>
                      ) : (
                        <span className="text-sm font-semibold text-slate-900">{formatMinutesAsMins(row.totalUsHoMinutes)}</span>
                      )}
                    </td>

                    {/* Total HO OT Time */}
                    <td className="px-4 md:px-6 py-3 md:py-4 border-r border-b border-slate-100">
                      {isOnLeave || !row.totalHoOtMinutes ? (
                        <span className="text-sm text-slate-400">—</span>
                      ) : (
                        <span className="text-sm font-semibold text-slate-900">{formatMinutesAsMins(row.totalHoOtMinutes)}</span>
                      )}
                    </td>

                    {/* Total Local HO Time */}
                    <td className="px-4 md:px-6 py-3 md:py-4 border-r border-b border-slate-100">
                      {isOnLeave || !row.totalLocalHolidayMinutes ? (
                        <span className="text-sm text-slate-400">—</span>
                      ) : (
                        <span className="text-sm font-semibold text-slate-900">{formatMinutesAsMins(row.totalLocalHolidayMinutes)}</span>
                      )}
                    </td>

                    {/* Total Time Off Request Time */}
                    <td className="px-4 md:px-6 py-3 md:py-4 border-r border-b border-slate-100">
                      {(() => {
                        const rowEmail = row.role.includes("@") ? row.role : "";
                        const minutes = rowEmail
                          ? totalTimeOffRequestMinutesFor(weekDates, leaveRequests.filter((r) => r.email === rowEmail))
                          : 0;
                        return isOnLeave || minutes === 0 ? (
                          <span className="text-sm text-slate-400">—</span>
                        ) : (
                          <span className="text-sm font-semibold text-slate-900">{formatMinutesAsMins(minutes)}</span>
                        );
                      })()}
                    </td>

                    {/* Ind Time */}
                    <td className="px-4 md:px-6 py-3 md:py-4 border-r border-b border-slate-100">
                      {isOnLeave ? (
                        <span className="text-sm text-slate-400">—</span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <span className={`text-sm font-semibold ${completionMins > 0 && completionMins < 2400 ? "text-red-600" : "text-slate-900"}`}>
                            {completionMins > 0 ? formatMinutesAsMins(completionMins) : "—"}
                          </span>
                          {holidayBonusMins > 0 && (
                            <span title="Includes US holiday time" className="inline-flex items-center justify-center rounded-full bg-blue-100 p-0.5">
                              <LuCalendar size={11} strokeWidth={2} className="text-blue-500" />
                            </span>
                          )}
                        </span>
                      )}
                    </td>

                    {/* Variance */}
                    <td className="px-4 md:px-6 py-3 md:py-4 border-r border-b border-slate-100">
                      {isOnLeave || isStandard || isReviewed ? (
                        <span className="text-sm text-slate-400">--</span>
                      ) : (
                        <span className="text-sm font-medium text-red-600">
                          {variance > 0 ? `+${variance}` : variance}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td
                      className={`px-4 md:px-6 py-3 md:py-4 text-center sticky right-[175px] z-10 border-l border-b border-slate-200 overflow-hidden ${
                        missingContractorProfile ? "bg-red-50 group-hover:bg-red-100" : "bg-white group-hover:bg-slate-50"
                      }`}
                      style={{ minWidth: 170, width: 170, maxWidth: 170 }}
                    >
                      {isAppliedTimeCredit ? (
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded-md text-[11px] font-bold uppercase">
                          Applied Time Credit
                        </span>
                      ) : (
                        <>
                          {isStandard && (
                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-[11px] font-bold uppercase">
                              Standard Met
                            </span>
                          )}
                          {isForReview && (
                            <span className="flex items-center justify-center gap-1 text-red-600">
                              <LuCircleAlert size={15} strokeWidth={2} className="fill-red-100" />
                              <span className="text-[11px] font-bold uppercase">For Review</span>
                            </span>
                          )}
                          {isOnLeave && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-[11px] font-bold uppercase">
                              On Leave
                            </span>
                          )}
                          {isReviewed && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-600 rounded-md text-[11px] font-bold uppercase">
                              Reviewed
                            </span>
                          )}
                        </>
                      )}
                    </td>

                    {/* Actions */}
                    <td
                      className={`px-4 md:px-6 py-3 md:py-4 text-center sticky right-0 z-10 border-l border-b border-slate-200 overflow-hidden ${
                        missingContractorProfile ? "bg-red-50 group-hover:bg-red-100" : "bg-white group-hover:bg-slate-50"
                      }`}
                      style={{ minWidth: 175, width: 175, maxWidth: 175 }}
                    >
                      {(isStandard || isReviewed) && (
                        <button
                          onClick={() => setReviewTarget({ record: row, source: "view" })}
                          className="text-slate-400 hover:text-[#003527] transition-all"
                          title="View attendance review"
                        >
                          <LuEye size={20} strokeWidth={1.75} />
                        </button>
                      )}
                      {isOnLeave && (
                        <button
                          onClick={() => setReviewTarget({ record: row, source: "view" })}
                          className="text-slate-400 hover:text-[#003527] transition-all"
                          title="View attendance review"
                        >
                          <LuEye size={20} strokeWidth={1.75} />
                        </button>
                      )}
                      {isForReview && (
                        <div className="flex justify-center gap-2">
                          <button className="p-1.5 text-slate-400 hover:text-[#003527] hover:bg-slate-100 rounded-lg transition-all" title="Message Contractor">
                            <LuMessageSquare size={18} strokeWidth={1.75} />
                          </button>
                          <button
                            onClick={() => setReviewTarget({ record: row, source: "review" })}
                            className="px-3 py-1 bg-[#003527] text-white rounded text-[11px] font-bold hover:bg-[#064E3B] transition-all"
                          >
                            REVIEW
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-slate-50 flex justify-center border-t border-slate-100">
          <button className="text-xs font-bold text-[#003527] hover:underline">
            Load {Math.max(0, 150 - attendanceRows.length)} more contractors...
          </button>
        </div>
      </div>

      {/* Review Modal */}
      {reviewTarget && (
        <ReviewModal
          record={reviewTarget.record}
          weekDates={weekDates}
          onClose={() => setReviewTarget(null)}
          appliedOffsetCredit={appliedOffsetCreditFor(reviewTarget.record as AttendanceRow)}
          onSave={handleReviewSave}
          usaHolidays={usaHolidays}
          allHolidays={allHolidays}
          allLeaveRequests={leaveRequests}
          isWeekEnded={isSelectedWeekEnded}
        />
      )}

      {/* Bulk Approve Modal */}
      {showBulkApproveModal && (
        <BulkApproveModal
          worksnapRows={worksnapRows}
          allLeaveRequests={leaveRequests}
          onClose={() => setShowBulkApproveModal(false)}
          onApprove={handleBulkApprove}
          usaHolidays={usaHolidays}
          allHolidays={allHolidays}
          week={week}
          isWeekEnded={isSelectedWeekEnded}
        />
      )}

      {breakdownTarget && breakdownTarget.worksnapUserId != null && (
        <BreakdownModal
          userId={breakdownTarget.worksnapUserId}
          userName={breakdownTarget.name}
          email={breakdownTarget.role}
          week={rangeFrom}
          onClose={() => setBreakdownTarget(null)}
        />
      )}
    </div>
  );
}
