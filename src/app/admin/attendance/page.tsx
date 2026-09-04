"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminTheme } from "@/components/AdminThemeContext";
import { LuCircleCheck, LuCircleAlert, LuClock, LuFileText, LuRefreshCw, LuEye, LuMessageSquare, LuPencil, LuX, LuCalendar, LuSearch, LuListChecks, LuFingerprint, LuTimer, LuCalendarDays, LuBanknote } from "react-icons/lu";
import { toast } from "sonner";
import { CONTRACTORS, TIME_OFF, type AttendanceRecord } from "@/lib/data";
import { parseIsoDate, datesBetween, addDaysIso, sundayOf, recentWeeks, weekLabel, arizonaTodayIso } from "@/lib/weekUtils";
import { utcInstantForLocalTime, ARIZONA_TIME_ZONE } from "@/lib/countryTimeZones";
import { WeekJumpDropdown } from "@/components/WeekJumpDropdown";
import { FilterSelect } from "@/components/FilterSelect";
import { fetchAllLeaveRequestsAdmin, fetchAllContractors, type AdminLeaveRequest } from "../contractors/actions";
import { fetchFixedTimeForWeek, saveFixedTime } from "./actions";
import { fetchWithRetry } from "@/lib/fetchWithRetry";
import type { Contractor } from "../contractors/types";


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
  weeks: string[];
  week: string;
  onSelectWeek: (week: string) => void;
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
  hireDate?: string | null;
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

function fmtHireDate(d?: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return m && day ? `${m}-${day}-${y}` : d;
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

/** The standard 8-hour day, in minutes. */
const STANDARD_SHIFT_MINUTES = 480;

function formatMinutesAsMins(minutes: number) {
  return `${minutes} mins`;
}

// Attendance Review's Total Time row carries the hour reading alongside the raw
// minutes — "8h / 480 mins" — because a week is judged in hours (the 2,700-min
// standard is 45h) while every stored figure is minutes. Only whole hours drop
// the minute part, so 500 reads "8h 20m / 500 mins" rather than a bare "8h".
function formatMinutesWithHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${rest === 0 ? `${hours}h` : `${hours}h ${rest}m`} / ${formatMinutesAsMins(minutes)}`;
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

// Whether `date` falls before a mid-week new hire's own hire date — such a
// day was never a scheduled shift for them (they weren't employed yet), so
// it's excluded from the week's Regular/OT model the same way a rest day is
// (see weeklyEvaluatedRegularAllocation's isBeforeHireByDate skip and
// holidayTimeFor's hireDate param) — this is what prorates a mid-week hire's
// weekly Required Regular Time down from the full-week total.
function isBeforeHireDate(date: string, hireDate?: string) {
  return !!hireDate && date < hireDate;
}

// Hourly contractors are evaluated the same way regardless of Shift Type
// (Fixed or Flexible) — there is no Flexible-specific rule, so this is the
// one shared computation for both.
function evaluatedTimeFor(
  worksnapTime: string,
  attendanceStatus = "No Status",
  restDay = false,
  isFullTimeOffDay = false,
  isFixedInd = false,
) {
  const worksnapMinutes = timeValueToMinutes(worksnapTime);
  if (!worksnapMinutes) return "-";

  // Fixed-Ind takes the Worksnap Time as-is, on every day of the week — rest
  // days and full-day-leave days included. The three rules below all divert
  // worked time into columns (RD OT, Regular OT) whose own logic only releases
  // them once the day's Decision is "Approved", and the Decision column is
  // deliberately hidden for Fixed-Ind (see weeklyDayHeadings) — so for this pay
  // category alone the time went nowhere and was silently discarded. Fixed-Ind
  // is a fixed-rate category judged on the week's total against the 2,400-min
  // target, so a worked Saturday is simply worked time.
  if (isFixedInd) return formatMinutesAsMins(worksnapMinutes);

  // Rest-day worked time is tracked separately via RD OT Time, not Evaluated Time.
  if (restDay) return "-";
  // Worked time on a full-day PTO/Sick Leave day is tracked separately via
  // Regular OT Time, not Evaluated Time — see isFullTimeOffStatus.
  if (isFullTimeOffDay) return "-";

  const approved = attendanceStatus === "Approved";

  if (worksnapMinutes <= 480) return formatMinutesAsMins(worksnapMinutes);
  return approved ? formatMinutesAsMins(worksnapMinutes) : formatMinutesAsMins(480);
}


function worksnapTimeForDate(dailyWorksnapMinutes: Record<string, number>, date: string) {
  const minutes = dailyWorksnapMinutes[date] ?? 0;
  return minutes > 0 ? formatMinutesAsMins(minutes) : "-";
}

// Regular Time = Worksnap Time capped at the 480-min (8h) standard shift —
// below 480 it passes through as-is, at or above 480 it's capped to 480.
// Rest days never carry Regular Time — that worked time is RD OT Time instead.
// Full-day PTO/Sick Leave days don't carry Regular Time either — that worked
// time is Regular OT Time instead (see isFullTimeOffStatus).
// A US Holiday is treated the same as a regular day here — worked time up to
// 480 min is Regular Time as-is; only time beyond 480 min is HO OT Time
// instead of Regular OT Time (see otMinutesFor).
function regularTimeMinutesFor(worksnapMinutes: number, isRestDay: boolean, isFullTimeOffDay = false, _isHolidayDay = false, isFixedInd = false) {
  // Fixed-Ind treats every worked day alike — see evaluatedTimeFor for why rest
  // days and full-leave days can't be diverted for this pay category.
  if (!isFixedInd && (isRestDay || isFullTimeOffDay)) return 0;
  return worksnapMinutes >= 480 ? 480 : worksnapMinutes;
}

// Once an approved half-day PTO/Sick Leave day borrows Regular OT to
// complete the day (see weeklyEvaluatedRegularAllocation), that borrowed
// amount is credited to Evaluated Time too, not just Evaluated Regular
// Time — the delta between the day's allocated Evaluated Regular Time and
// its own raw Regular Time is exactly what was borrowed (0 on any day that
// didn't borrow), so the two columns stay consistent with each other.
function evaluatedMinutesWithBorrow(evaluatedTime: string, regularTimeMinutes: number, evaluatedRegularTime: number): number {
  return timeValueToMinutes(evaluatedTime) + Math.max(evaluatedRegularTime - regularTimeMinutes, 0);
}

function defaultAdjustedTimesFor(weekDates: string[], _attendanceStatus = "No Status") {
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
// (Sick Leave, Unpaid Leave, and both Advance PTO/Birthday Leave and Advance
// Sick Leave overrides — see createAdvanceLeaveOverride) reads sickLeaveUsedHours.
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
// status, for the read-only Time Away Request columns), this is what actually
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

const HALF_DAY_LEAVE_TYPES = [
  "PTO Half Day", "Sick Leave Half Day",
  "Advance PTO/Birthday Leave Half Day", "Advance Sick Leave Half Day",
];

// Whether an approved half-day-equivalent leave request (240 min) covers
// `date` — the one case where Regular OT can still be borrowed to complete
// the day (see weeklyEvaluatedRegularAllocation), capped at exactly the 240
// min still needed. No other shortfall day borrows OT at all.
function isApprovedHalfDayLeaveDate(date: string, leaveRequests: AdminLeaveRequest[]) {
  return leaveRequests.some((r) =>
    HALF_DAY_LEAVE_TYPES.includes(r.type) && r.status === "Approved" && date >= r.startDate && date <= r.endDate
  );
}

const APPROVED_LEAVE_CONFLICT_TYPES = [
  "PTO", "PTO Half Day", "Sick Leave", "Sick Leave Half Day",
  "Advance PTO/Birthday Leave", "Advance Sick Leave", "Special Leave",
];

// Whether an approved PTO/Sick Leave (full or half day, including the
// full-day Advance PTO/Birthday Leave, Advance Sick Leave, and Special Leave
// overrides — their own Half Day variants are excluded here the same way
// PTO Half Day/Sick Leave Half Day are, since half the day is still expected
// to be worked) portal request covers `date` — used to flag a day the
// contractor filed one of these for but also logged Worksnap Time on, so the
// admin can spot the conflict at a glance.
function hasApprovedLeaveRequestFor(date: string, leaveRequests: AdminLeaveRequest[]) {
  return leaveRequests.some((r) =>
    APPROVED_LEAVE_CONFLICT_TYPES.includes(r.type) && r.status === "Approved" && date >= r.startDate && date <= r.endDate
  );
}

// A "Reviewed" row on the main table (and its own row-level "Need Attention"
// downgrade) is flagged when any day that week has an approved PTO/Sick
// Leave on file AND more than 240 min (4h) also logged (Adjusted Time when
// set, else raw Worksnap Time) — the exact same genuine-conflict definition
// Attendance Review's own footer status uses, so the two can never disagree.
// Leave requests must already be filtered to this row's own email before
// calling; adjustedDaily is this row's own contractor's Adjusted Time map
// (keyed by date), if any.
function rowHasLeaveOverworkConflict(row: AttendanceRow, weekDates: string[], rowLeaveRequests: AdminLeaveRequest[], adjustedDaily?: Record<string, number>) {
  return weekDates.some((date) => {
    if (!hasApprovedLeaveRequestFor(date, rowLeaveRequests)) return false;
    const hasAdjustedTime = adjustedDaily?.[date] !== undefined;
    const loggedMinutes = hasAdjustedTime ? adjustedDaily![date] : (row.dailyWorksnapMinutes?.[date] ?? 0);
    return loggedMinutes > 240;
  });
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

function completionTimeFor(evaluatedTime: string, timeOffTime: string, holidayTime = "-", rdOtTime = "-", localHolidayTime = "-") {
  const evaluatedMinutes = timeValueToMinutes(evaluatedTime);
  const timeOffMinutes = timeValueToMinutes(timeOffTime);
  // holidayTime is the US HO credit; localHolidayTime is the contractor's own
  // country's. Only Fixed-Ind passes the latter — for hourly contractors local
  // holiday minutes belong to Total Completion Time rather than Ind Time, which
  // is the existing distinction between those two columns.
  const holidayMinutes = timeValueToMinutes(holidayTime) + timeValueToMinutes(localHolidayTime);
  const rdOtMinutes = timeValueToMinutes(rdOtTime);
  // Adjusted Time is no longer special-cased here — when present, it already
  // replaced Worksnap Time upstream (see effectiveDailyMinutes) and flows into
  // evaluatedTime like any other source, so the same formula applies either way.
  // Evaluated Time is always blank on rest days (that work is tracked separately as
  // RD OT Time), so rest-day worked minutes are folded back in here explicitly.
  return formatMinutesAsMins(evaluatedMinutes + timeOffMinutes + holidayMinutes + rdOtMinutes);
}

type HolidayEntry = { date: string; country: string; name: string; arizonaDate?: string | null; timeZone?: string | null };

// The Arizona-equivalent calendar date for a holiday — falls back to the raw
// (country-local) date for older rows that predate the arizonaDate column.
function arizonaDateOf(holiday: HolidayEntry): string {
  return (holiday.arizonaDate ?? holiday.date).slice(0, 10);
}

// The holiday's own true 24h window (midnight-to-midnight in ITS OWN
// country's timezone), as real UTC instants — not collapsed into a single
// Arizona calendar date first. Needed because a large offset from Arizona
// (e.g. the Philippines, 15h ahead) means one local calendar day can
// straddle two different Arizona calendar days; collapsing to one loses
// whichever portion of a contractor's shift falls on the other side. Falls
// back to null for legacy rows saved before the timeZone column existed.
function localHolidayUtcWindow(holiday: HolidayEntry): [number, number] | null {
  if (!holiday.timeZone) return null;
  const localDate = holiday.date.slice(0, 10);
  const start = utcInstantForLocalTime(localDate, 0, 0, holiday.timeZone).getTime();
  const end = utcInstantForLocalTime(addDaysIso(localDate, 1), 0, 0, holiday.timeZone).getTime();
  return [start, end];
}

function arizonaDayUtcWindow(date: string): [number, number] {
  const start = utcInstantForLocalTime(date, 0, 0, ARIZONA_TIME_ZONE).getTime();
  const end = utcInstantForLocalTime(addDaysIso(date, 1), 0, 0, ARIZONA_TIME_ZONE).getTime();
  return [start, end];
}

// The holiday (if any) whose own true local-country window overlaps this
// Arizona-bucketed day at all — not just the single Arizona date it's
// nominally assigned to (arizonaDateOf), since that assignment only
// captures where the holiday's local midnight falls, not its full 24h span.
function matchingLocalHoliday(date: string, country: string, holidays: HolidayEntry[]): HolidayEntry | undefined {
  const [arizonaDayStart, arizonaDayEnd] = arizonaDayUtcWindow(date);
  return holidays.find((h) => {
    if (h.country !== country) return false;
    const window = localHolidayUtcWindow(h);
    if (!window) return arizonaDateOf(h) === date;
    const [holidayStart, holidayEnd] = window;
    return holidayEnd > arizonaDayStart && holidayStart < arizonaDayEnd;
  });
}

function holidayTimeFor(
  date: string,
  usaHolidays: HolidayEntry[],
  dailyWorksnapMinutes: Record<string, number> = {},
  restDaysStr = "",
  weekDates: string[] = [],
  hireDate = "",
  country = "",
  allHolidays: HolidayEntry[] = []
) {
  if (!usaHolidays.some((h) => h.date.slice(0, 10) === date)) return "-";
  if (isRestDayDate(date, restDaysStr)) return "-";
  // No Holiday pay for a day before the contractor was even hired.
  if (isBeforeHireDate(date, hireDate)) return "-";
  // All other working days in the week must have login time — a mid-week
  // new hire's pre-hire days are excluded from this fairness check too, or
  // their (correctly) empty login time would wrongly deny this Holiday's
  // credit for the days they actually were employed that week. A day that's
  // the contractor's own-country (Local) Holiday is excluded the same way —
  // legitimately not worked for a reason unrelated to this US Holiday, so it
  // shouldn't count against them here either.
  const otherWorkingDays = weekDates.filter(
    (d) => d !== date
      && !isRestDayDate(d, restDaysStr)
      && !isBeforeHireDate(d, hireDate)
      && !usaHolidays.some((h) => h.date.slice(0, 10) === d)
      && !localHolidayNameFor(d, country, allHolidays)
  );
  if (otherWorkingDays.some((d) => (dailyWorksnapMinutes[d] ?? 0) === 0)) return "-";
  return "480 mins";
}

// The contractor's own-country holiday name for a given date, or "" if none —
// looked up from the full holidays table (not just the US subset). `date` is
// an Arizona-bucketed calendar date (same bucketing as Worksnap Time/
// entryDate); matching goes through matchingLocalHoliday so a holiday whose
// true local-country window straddles two Arizona days is named on both,
// consistent with where localHolidayMinutesFor below can actually grant credit.
function localHolidayNameFor(date: string, country: string, holidays: HolidayEntry[]): string {
  return matchingLocalHoliday(date, country, holidays)?.name ?? "";
}

type DailyLogEntry = { entryDate: string; firstIn: string; lastOut: string; worksnapUserId?: number; totalMins?: number };

// Minutes of ALL the contractor's shifts (firstIn→lastOut, real UTC instants)
// that overlap the holiday's OWN true local-country window, restricted to
// whatever part of that window also falls on this Arizona-bucketed day (so a
// holiday spanning two Arizona days — see localHolidayUtcWindow — doesn't get
// double-credited across both when this is called once per weekDate).
// Every shift in `dailyLogs` is checked (not just the one whose own entryDate
// is `date`) because a shift can straddle the Arizona midnight boundary: its
// own bucketed day might be the day before or after, while a portion of it
// still falls inside this holiday's window. Summing per-shift overlap against
// this single, non-overlapping window is safe — a shift that doesn't
// genuinely fall inside it always contributes exactly 0.
// Each shift's contribution is capped at its own totalMins — firstIn→lastOut
// is only the outer span of the day's activity and can contain large gaps
// (breaks/idle time), so raw span-overlap alone can wildly overstate actual
// worked minutes; totalMins is the real accumulated work for that day.
// Returns null when `date` isn't (any part of) a local holiday for `country`.
function localHolidayMinutesFor(
  date: string,
  dailyLogs: DailyLogEntry[],
  country: string,
  holidays: HolidayEntry[],
  isFixedInd = false
): number | null {
  const holiday = matchingLocalHoliday(date, country, holidays);
  if (!holiday) return null;

  // Fixed-Ind gets the full standard day for a local holiday, worked or not.
  // The overlap sum below credits only time actually logged inside the holiday's
  // window, which suits an hourly contractor being paid for hours worked on a
  // holiday — but Fixed-Ind is a fixed-rate category for whom the holiday is a
  // paid day in its own right, so it's a flat credit.
  if (isFixedInd) return STANDARD_SHIFT_MINUTES;

  const [arizonaDayStart, arizonaDayEnd] = arizonaDayUtcWindow(date);
  const [holidayStart, holidayEnd] = localHolidayUtcWindow(holiday) ?? [arizonaDayStart, arizonaDayEnd];
  const windowStart = Math.max(holidayStart, arizonaDayStart);
  const windowEnd = Math.min(holidayEnd, arizonaDayEnd);

  return dailyLogs.reduce((sum, log) => {
    const start = new Date(log.firstIn).getTime();
    const end = new Date(log.lastOut).getTime();
    const overlapStart = Math.max(start, windowStart);
    const overlapEnd = Math.min(end, windowEnd);
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
  isFullTimeOffDay = false,
  isFixedInd = false
) {
  // Fixed-Ind: no diversion to RD OT or the full-leave OT pool — those only
  // release on an "Approved" Decision, which Fixed-Ind has no control for, so
  // the time would vanish. It falls through to the ordinary rule below, where
  // anything past 8h becomes Regular OT and the rest is Regular Time.
  if (isFixedInd) {
    return { regularOtMinutes: evaluatedMinutes > 480 ? evaluatedMinutes - 480 : 0, rdOtMinutes: 0, hoOtMinutes: 0 };
  }
  if (isRestDay) {
    return { regularOtMinutes: 0, rdOtMinutes: isApproved && worksnapMinutes > 0 ? worksnapMinutes : 0, hoOtMinutes: 0 };
  }
  if (isFullTimeOffDay) {
    return { regularOtMinutes: isApproved && worksnapMinutes > 0 ? worksnapMinutes : 0, rdOtMinutes: 0, hoOtMinutes: 0 };
  }
  if (isHolidayDay) {
    // Time worked beyond the 480-min (8h) standard shift on a Holiday is OT
    // credited as HO OT Time, not Regular OT Time — a Holiday's overtime
    // doesn't feed the week's Regular OT pool. Worked time up to 480 min is
    // plain Regular Time (see regularTimeMinutesFor), same as a normal day.
    return { regularOtMinutes: 0, rdOtMinutes: 0, hoOtMinutes: evaluatedMinutes > 480 ? evaluatedMinutes - 480 : 0 };
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

// OT is never redistributed between days, with one exception, drawing from
// the same WEEK's Regular OT pool first, then — if that pool alone isn't
// enough — the week's RD OT pool, then the week's HO OT pool as a final
// fallback:
//   A day that is itself Approved (approvedByDate — Attendance Review's own
//   daily decision, not the leave request's approval), has no leave request
//   of any kind covering it (halfDayOffByDate <= 0), and isn't a rest day,
//   full-day PTO/Sick Leave, a Holiday (US or local), or before a mid-week
//   hire's start (shortfallEligibleByDate) may borrow whatever's still
//   needed to reach the full 480-min day — this covers a day with no
//   Worksnap Time logged at all, or logged time still short of 480.
// A day already covered by an approved PTO Half Day / Sick Leave Half Day
// (halfDayOffByDate > 0) only needs 240 min worked, not 480 — that Work
// Status already accounts for the other half of the day (credited
// separately as Time Off Time). If less than 240 min was actually worked,
// the shortfall (240 − worked) is borrowed from the week's Regular OT pool
// only — never RD OT, never the HO OT pool, and never more than what's
// needed to reach 240 — so any Regular OT beyond that stays Regular OT
// rather than being pulled in to "complete" a full 480-min day that was
// never required here.
// If the day itself isn't Approved yet, nothing is borrowed and it stays
// blank/unfilled, same as any other not-yet-approved day. Any OT a lending
// day doesn't actually give up stays credited to that same day. This
// guarantees a later re-save of an already-approved week can never
// retroactively shift OT away from the day it was earned, beyond this one
// bounded exception.
function weeklyEvaluatedRegularAllocation(
  weekDates: string[],
  regularTimeByDate: Record<string, number>,
  regularOtByDate: Record<string, number>,
  rdOtByDate: Record<string, number>,
  approvedByDate: Record<string, boolean> = {},
  halfDayOffByDate: Record<string, number> = {},
  shortfallEligibleByDate: Record<string, boolean> = {},
  hoOtByDate: Record<string, number> = {}
): Record<string, { evaluatedRegularTime: number; regularOtMinutes: number; rdOtMinutes: number; hoOtMinutes: number }> {
  const remainingRegularOt: Record<string, number> = {};
  const remainingHoOt: Record<string, number> = {};
  const remainingRdOt: Record<string, number> = {};
  weekDates.forEach((d) => {
    remainingRegularOt[d] = regularOtByDate[d] ?? 0;
    remainingHoOt[d] = hoOtByDate[d] ?? 0;
    remainingRdOt[d] = rdOtByDate[d] ?? 0;
  });

  const borrowedByDate: Record<string, number> = {};
  weekDates.forEach((date) => {
    borrowedByDate[date] = 0;
    if (!approvedByDate[date]) return; // not-yet-approved days never borrow

    const regularTime = regularTimeByDate[date] ?? 0;
    const halfDayCredit = halfDayOffByDate[date] ?? 0;
    // A half-day leave only requires 240 min worked — borrow just enough
    // Regular OT (never HO OT) to reach that reduced requirement, capped at
    // exactly what's missing, then stop.
    if (halfDayCredit > 0) {
      if (regularTime >= 240) return;
      let missingHalfDay = 240 - regularTime;
      for (const otDate of weekDates) {
        if (missingHalfDay <= 0) break;
        const available = remainingRegularOt[otDate];
        if (available <= 0) continue;
        const take = Math.min(missingHalfDay, available);
        remainingRegularOt[otDate] -= take;
        missingHalfDay -= take;
        borrowedByDate[date] += take;
      }
      return;
    }

    if (!shortfallEligibleByDate[date] || regularTime >= 480) return;
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

    // Regular OT alone wasn't enough — fall back to the week's RD OT pool,
    // then the week's HO OT pool, for whatever's still missing.
    for (const otDate of weekDates) {
      if (missing <= 0) break;
      const available = remainingRdOt[otDate];
      if (available <= 0) continue;
      const take = Math.min(missing, available);
      remainingRdOt[otDate] -= take;
      missing -= take;
      borrowedByDate[date] += take;
    }

    for (const otDate of weekDates) {
      if (missing <= 0) break;
      const available = remainingHoOt[otDate];
      if (available <= 0) continue;
      const take = Math.min(missing, available);
      remainingHoOt[otDate] -= take;
      missing -= take;
      borrowedByDate[date] += take;
    }
  });

  const result: Record<string, { evaluatedRegularTime: number; regularOtMinutes: number; rdOtMinutes: number; hoOtMinutes: number }> = {};
  weekDates.forEach((date) => {
    const regularTime = regularTimeByDate[date] ?? 0;
    const halfDayCredit = halfDayOffByDate[date] ?? 0;
    // Mirror image of the 240-min borrow above: on a half-day-leave day,
    // Evaluated Regular Time is capped at the reduced 240-min requirement —
    // anything worked beyond that is this day's own Regular OT instead of
    // Regular Time (never borrowed away, and never blended into the 480-min
    // full-day math below).
    const halfDayExcess = halfDayCredit > 0 && regularTime > 240 ? regularTime - 240 : 0;
    const evaluatedRegularTime = halfDayCredit > 0
      ? Math.min(regularTime, 240) + borrowedByDate[date]
      : regularTime + borrowedByDate[date];
    result[date] = {
      evaluatedRegularTime,
      regularOtMinutes: remainingRegularOt[date] + halfDayExcess,
      rdOtMinutes: remainingRdOt[date],
      hoOtMinutes: remainingHoOt[date],
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
  // Every key present in adjustedDaily was an explicit Adjusted Time entry —
  // including an explicit 0 ("no time worked") — so it always overrides,
  // same as the ReviewModal's own effectiveDailyMinutes.
  const merged: Record<string, number> = { ...raw };
  for (const [date, minutes] of Object.entries(adjustedDaily)) {
    merged[date] = minutes;
  }
  return merged;
}

function computeWeeklyCompletionMinutes(row: AttendanceRow, weekDates: string[], adjustedDaily?: Record<string, number>) {
  const dailyWorksnapMinutes = effectiveDailyMinutesFor(row, adjustedDaily);

  if (isFixedContractor(row.payCategory)) {
    // Fixed-Ind Ind Time comes straight from Worksnap: the raw Worksnap time for
    // the week, every day of it — rest days included, since Fixed-Ind carries no
    // separate RD OT column for that work to land in. Adjusted Time is
    // deliberately not applied, so this reads the same as Worksnap Actual Time.
    //
    // Deliberately uncapped too: truncating at the 2,400-min (40h) target
    // discarded real worked time, and rest-day time was usually the part that
    // vanished, sitting as it does on top of an already-full week. 2,400 stays
    // the *target* — it still drives the Standard Met band and the Time Credit
    // offer — but it no longer rewrites what was worked.
    const rawWorksnapMinutes = row.dailyWorksnapMinutes ?? {};
    return weekDates.reduce((sum, date) => sum + (rawWorksnapMinutes[date] ?? 0), 0);
  }

  const restDaysStr = restDaysForAttendanceRow(row);
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
    const evaluatedTime = evaluatedTimeFor(worksnapTime, "No Status", isRestDay, isFullTimeOffDay);

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
  const userLogs = dailyLogs.filter((l) => l.worksnapUserId === row.worksnapUserId);

  // Evaluated Regular Time draws on the WEEK's whole pool of Regular OT Time,
  // so it's built once across all weekDates together, same as the Review modal.
  const regularTimeByDate: Record<string, number> = {};
  const regularOtByDate: Record<string, number> = {};
  const rdOtByDate: Record<string, number> = {};
  const hoOtByDate: Record<string, number> = {};
  const approvedByDate: Record<string, boolean> = {};
  const halfDayOffByDate: Record<string, number> = {};
  const shortfallEligibleByDate: Record<string, boolean> = {};

  weekDates.forEach((date) => {
    const worksnapTime = worksnapTimeForDate(dailyWorksnapMinutes, date);
    const isRestDay = isRestDayDate(date, restDaysStr);
    const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
    // Matches exactly which days Attendance Review's own "Approve All" targets
    // (every non-rest day, plus any rest day with logged time) — so a Bulk
    // Approve save leaves the same per-day decisions "Approve All" would.
    const dailyDecisionStatus = (!isRestDay || worksnapTime !== "-") ? "Approved" : "No Status";
    const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, isFullTimeOffDay);
    const holidayTime = holidayTimeFor(date, usaHolidays, dailyWorksnapMinutes, restDaysStr, weekDates, row.hireDate, row.region, allHolidays);
    const localHolMinutes = localHolidayMinutesFor(date, userLogs, row.region, allHolidays, isFixedContractor(row.payCategory));
    const isHolidayDay = isHolidayDayFor(holidayTime, localHolMinutes);
    const { regularOtMinutes, rdOtMinutes, hoOtMinutes } = otMinutesFor(timeValueToMinutes(evaluatedTime), timeValueToMinutes(worksnapTime), isHolidayDay, isRestDay, dailyDecisionStatus === "Approved", isFullTimeOffDay);

    regularTimeByDate[date] = regularTimeMinutesFor(timeValueToMinutes(worksnapTime), isRestDay, isFullTimeOffDay, isHolidayDay);
    regularOtByDate[date] = regularOtMinutes;
    rdOtByDate[date] = rdOtMinutes;
    hoOtByDate[date] = hoOtMinutes;
    approvedByDate[date] = dailyDecisionStatus === "Approved";
    halfDayOffByDate[date] = isApprovedHalfDayLeaveDate(date, leaveRequests) ? 240 : 0;
    // isHolidayDay (US or local), not just the US-specific holidayTime check
    // — a local holiday already accounts for the day too, so it shouldn't be
    // topped up with borrowed OT/HO OT any more than a US holiday should.
    shortfallEligibleByDate[date] = !isRestDay && !isFullTimeOffDay && !isBeforeHireDate(date, row.hireDate) && !isHolidayDay;
  });

  const regularAllocationByDate = weeklyEvaluatedRegularAllocation(weekDates, regularTimeByDate, regularOtByDate, rdOtByDate, approvedByDate, halfDayOffByDate, shortfallEligibleByDate, hoOtByDate);

  return weekDates.map((date) => {
    const worksnapTime = worksnapTimeForDate(dailyWorksnapMinutes, date);
    const isRestDay = isRestDayDate(date, restDaysStr);
    // Same "Approve All"-equivalent rule as above.
    const dailyDecisionStatus = (!isRestDay || worksnapTime !== "-") ? "Approved" : "No Status";
    const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
    const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, isFullTimeOffDay);
    const holidayTime = holidayTimeFor(date, usaHolidays, dailyWorksnapMinutes, restDaysStr, weekDates, row.hireDate, row.region, allHolidays);
    const localHoliday = localHolidayNameFor(date, row.region, allHolidays);
    const localHolidayMinutes = localHolidayMinutesFor(date, userLogs, row.region, allHolidays, isFixedContractor(row.payCategory));
    const isHolidayDay = isHolidayDayFor(holidayTime, localHolidayMinutes);
    const { regularOtMinutes: rawRegularOtMinutes, rdOtMinutes: rawRdOtMinutes } = otMinutesFor(
      timeValueToMinutes(evaluatedTime), timeValueToMinutes(worksnapTime), isHolidayDay, isRestDay,
      dailyDecisionStatus === "Approved", isFullTimeOffDay
    );
    const allocation = regularAllocationByDate[date] ?? { evaluatedRegularTime: 0, regularOtMinutes: 0, rdOtMinutes: 0, hoOtMinutes: 0 };
    const regularTimeMinutes = regularTimeMinutesFor(timeValueToMinutes(worksnapTime), isRestDay, isFullTimeOffDay, isHolidayDay);
    // Same week-total formula Attendance Review actually saves as
    // completionMinutes (see completionTotalMinutes in ReviewModal) — not the
    // weekly-reallocated allocation above, which only feeds the day snapshot's
    // own evaluatedRegular/regularOt/rdOt/hoOt breakdown fields.
    const timeOffTime = approvedTimeOffRequestMinutesFor(date, leaveRequests);
    const otMinutesToFold = rawRdOtMinutes + (isFullTimeOffDay ? rawRegularOtMinutes : 0);
    const completionMinutes = timeValueToMinutes(completionTimeFor(
      evaluatedTime, timeOffTime, holidayTime, formatMinutesAsMins(otMinutesToFold),
      // Matches the Review modal: Fixed-Ind's Ind Time carries the local holiday
      // credit, so a Bulk Approve save records the same figure a manual one would.
      isFixedContractor(row.payCategory) ? formatMinutesAsMins(localHolidayMinutes ?? 0) : "-",
    ));

    return {
      date,
      decisionStatus: decisionStatusToApi(dailyDecisionStatus),
      evaluatedMinutes: evaluatedMinutesWithBorrow(evaluatedTime, regularTimeMinutes, allocation.evaluatedRegularTime),
      adjustedMinutes: adjustedDaily?.[date] ?? null,
      holidayMinutes: boostedUsHoMinutes(holidayTime, isRestDay, isUsHolidayDate(date, usaHolidays), dailyDecisionStatus === "Approved", rawRdOtMinutes),
      localHoliday: localHoliday || null,
      localHolidayMinutes,
      evaluatedRegularMinutes: allocation.evaluatedRegularTime,
      regularOtMinutes: allocation.regularOtMinutes,
      rdOtMinutes: allocation.rdOtMinutes,
      hoOtMinutes: allocation.hoOtMinutes,
      completionMinutes,
      timeOffMinutes: timeValueToMinutes(timeOffRequestMinutesFor(date, leaveRequests)),
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
  if (minutes && minutes !== 480) return "text-red-600 font-semibold";
  if (minutes === 480) return "text-emerald-600 font-semibold";
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
  hireDate?: string;
  dailyWorksnapMinutes?: Record<string, number>;
  completionMinutes?: number;
  /** Fixed-Ind Time Credit granted on this week (0 when none) — see AttendanceWeekStatus.offsetCreditMinutes. */
  offsetCreditMinutes?: number;
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

/** The 2,400-min (40h) week. A *maximum* for Fixed-Ind Net Time, never a floor. */
const FIXED_IND_NET_CAP_MINUTES = 2400;

/**
 * Fixed-Ind Net Time: the payable figure derived from Ind Time.
 *
 * Order matters. Any outstanding Offset Credit is repaid out of the total first,
 * and only then does the 2,400-min cap apply — so a week that lands under the
 * target *because of* a repayment keeps its actual figure and is not topped back
 * up. Ind Time 2,500 less a 200 repayment is 2,300, and 2,300 is the Net Time.
 *
 * Capping before the deduction would instead give 2,400 − 200 = 2,200, and
 * capping without deducting would hide the repayment altogether.
 *
 * `totalMinutes` is the whole pool being capped — Ind Time plus any US holiday
 * credit — so 2,400 is the ceiling on Net Time itself rather than on the worked
 * part of it alone.
 */
function fixedIndNetMinutes(totalMinutes: number, repaymentMinutes = 0) {
  return Math.min(Math.max(0, totalMinutes - repaymentMinutes), FIXED_IND_NET_CAP_MINUTES);
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
    if (mins > 0 && mins !== 480) return "For Review";
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
    hireDate: entry.hireDate?.trim() || "",
    dailyWorksnapMinutes: entry.dailyWorksnapMinutes ?? {},
    hasContractorProfile: entry.hasContractorProfile ?? false,
  };
}

function worksnapEntriesToAttendanceRecords(entries: WorksnapEntry[], weekDates: string[]) {
  const rowsByUser = new Map<string, { worksnapUserId: number | null; userName: string | null; email: string | null; durationMins: number; department: string | null; restDay: string | null; location: string | null; shiftType: string | null; payCategory: string | null; hireDate: string | null; dailyWorksnapMinutes: Record<string, number>; hasContractorProfile: boolean }>();

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
      hireDate: current?.hireDate || entry.hireDate || null,
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

function ReviewModal({ record, weekDates, onClose, appliedOffsetCredit = 0, onSave, usaHolidays, allHolidays, allLeaveRequests, isWeekEnded, weeks, week, onSelectWeek }: ReviewModalProps) {
  const router = useRouter();
  const [showWeekJump, setShowWeekJump] = useState(false);
  const weekJumpButtonRef = useRef<HTMLButtonElement>(null);
  const name = record.name;
  const role = record.role;
  const contractorEmail = role.includes("@") ? role : "";
  // Jumps straight to this same contractor in Time Away Management / Payroll
  // (carrying the currently-reviewed week over to Payroll, since its voucher
  // is week-scoped) — a shortcut instead of re-searching for them there.
  function goToTimeAway() {
    if (!contractorEmail) return;
    router.push(`/admin/time-off?openEmail=${encodeURIComponent(contractorEmail)}`);
  }
  function goToPayroll() {
    if (!contractorEmail) return;
    const weekStart = weekDates[0] ?? "";
    router.push(`/admin/payroll?openEmail=${encodeURIComponent(contractorEmail)}${weekStart ? `&week=${weekStart}` : ""}`);
  }
  const [dailyDecisionStatuses, setDailyDecisionStatuses] = useState<Record<string, string>>({});
  const [adjustedTimes, setAdjustedTimes] = useState<Record<string, string>>({});
  const [editingAdjustedDate, setEditingAdjustedDate] = useState<string | null>(null);
  const [dailyLogs, setDailyLogs] = useState<DailyLogEntry[]>([]);

  // Leave requests submitted through the contractor portal, matched to this
  // week's days by date range, so "Time Away Request" can show what type of
  // leave (if any) was requested for that day. Filtered from the parent's
  // already-fetched list rather than re-querying the whole table again here.
  const leaveRequests = useMemo(() => {
    const email = record.role.includes("@") ? record.role : "";
    return email ? allLeaveRequests.filter((r) => r.email === email) : [];
  }, [allLeaveRequests, record]);

  const contractor = CONTRACTORS.find((item) => item.id === record.contractorId || item.name === record.name);
  const location = contractor?.site ?? record.region;
  const dailyWorksnapMinutes = record.dailyWorksnapMinutes ?? EMPTY_DAILY_WORKSNAP_MINUTES;
  // Same conflict check the table highlights red per-day — an approved
  // PTO/Sick Leave on file for a date where more than 240 min (4h) was also
  // logged (Adjusted Time when set, else Worksnap Time); 240 min or less is
  // the expected half-day-leave pattern, not a real conflict. If any day in
  // the week has a genuine conflict, a "Reviewed" week is downgraded to
  // "Need Attention" in the footer status below, since Approve All would
  // otherwise silently wave through a week with an unresolved conflict on it.
  const weekHasLeaveWorkConflict = weekDates.some((date) => {
    if (!hasApprovedLeaveRequestFor(date, leaveRequests)) return false;
    const hasAdjustedTime = (adjustedTimes[date] ?? "").trim() !== "";
    const loggedMinutes = hasAdjustedTime ? timeValueToMinutes(adjustedTimes[date]) : (dailyWorksnapMinutes[date] ?? 0);
    return loggedMinutes > 240;
  });
  // Adjusted Time is the secondary time source: once a value is entered for a
  // date — including an explicit 0, meaning "no time worked" — it overrides
  // Worksnap Time entirely for every calculation (evaluated time, regular/OT
  // allocation, holiday eligibility, completion time, totals). Only a truly
  // empty (untouched) Adjusted Time falls back to Worksnap Time. Worksnap
  // Time itself is left untouched and still shown for reference in its own
  // column — only this derived map feeds calculations.
  const effectiveDailyMinutes = weekDates.reduce<Record<string, number>>((acc, d) => {
    const hasAdjustedTime = (adjustedTimes[d] ?? "").trim() !== "";
    acc[d] = hasAdjustedTime ? timeValueToMinutes(adjustedTimes[d]) : (dailyWorksnapMinutes[d] ?? 0);
    return acc;
  }, {});
  const restDaysStr = restDaysForAttendanceRow(record as AttendanceRow);
  const isIndia = isFixedContractor((record as AttendanceRow).payCategory);
  const hireDate = (record as AttendanceRow).hireDate;
  const shiftType = shiftTypeForAttendanceRow(record as AttendanceRow);
  // Seeded from the credit already saved on this week, so reopening a reviewed
  // week shows the Time Credit that was granted rather than dropping back to the
  // raw short total.
  const [offsetCredit, setOffsetCredit] = useState((record as AttendanceRow).offsetCreditMinutes ?? 0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const worksnapTotalMinutes = worksnapTotalMinutesFor(weekDates, dailyWorksnapMinutes);
  // Fixed-Ind Ind Time is the Worksnap time itself: taken straight from
  // Worksnap across all seven days, rest days included, and uncapped — so it
  // reads the same as the Worksnap Actual Time figure beside it. Adjusted Time
  // is deliberately not folded in here, and the 2,400-min target no longer
  // truncates it (see computeWeeklyCompletionMinutes).
  const indiaTotalMinutes = worksnapTotalMinutes;
const totalHolidayMins = weekDates.reduce(
    (sum, date) => sum + timeValueToMinutes(holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates, hireDate, record.region, allHolidays)),
    0
  );
  // Declared here rather than further down because the Fixed-Ind pool below
  // needs it, and that pool feeds completionTotalMinutes.
  const totalLocalHolidayMinutes = weekDates.reduce(
    (sum, d) => sum + (localHolidayMinutesFor(d, dailyLogs, record.region, allHolidays, isIndia) ?? 0),
    0
  );
  // Everything Fixed-Ind Net Time is derived from: worked time (Ind Time) plus
  // both holiday credits, US and local. Named once so the Completion Time cell,
  // the Net Time row and the Time Credit offer can't drift apart.
  const indiaPoolMinutes = indiaTotalMinutes + totalHolidayMins + totalLocalHolidayMinutes;
  // Repayment first, then the 2,400-min cap over the whole figure — both holiday
  // credits included, so 2,400 is the ceiling on Net Time itself and not just on
  // the worked part of it. See fixedIndNetMinutes.
  const indiaNetCompletionMinutes = fixedIndNetMinutes(indiaPoolMinutes, appliedOffsetCredit);
  // A Time Credit touched this week either way round: granted here, or repaid
  // here out of Ind Time. Drives the "Applied Credits" status badge below, the
  // same rule the main table's Status column uses.
  const isAppliedCredits = isIndia
    && record.weeklyStatus !== "Processed"
    && (offsetCredit > 0 || appliedOffsetCredit > 0);
  // Displayed US HO Time total — unlike totalHolidayMins (used for Completion
  // Time), this includes the rest-day-holiday RD OT Time boost so the footer
  // matches what each day's US HO Time cell actually shows.
  const totalDisplayedUsHoMinutes = weekDates.reduce((sum, date) => {
    const worksnapTime = worksnapTimeForDate(effectiveDailyMinutes, date);
    const isRestDay = isRestDayDate(date, restDaysStr);
    const dailyDecisionStatus = dailyDecisionStatuses[date] ?? "No Status";
    const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
    const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, isFullTimeOffDay, isIndia);
    const holidayTime = holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates, hireDate, record.region, allHolidays);
    const localHolMinutes = localHolidayMinutesFor(date, dailyLogs, record.region, allHolidays, isIndia);
    const isHolidayDay = isHolidayDayFor(holidayTime, localHolMinutes);
    const { rdOtMinutes } = otMinutesFor(timeValueToMinutes(evaluatedTime), timeValueToMinutes(worksnapTime), isHolidayDay, isRestDay, dailyDecisionStatus === "Approved", isFullTimeOffDay, isIndia);
    return sum + boostedUsHoMinutes(holidayTime, isRestDay, isUsHolidayDate(date, usaHolidays), dailyDecisionStatus === "Approved", rdOtMinutes);
  }, 0);
  const totalRegularMinutes = weekDates.reduce(
    (sum, date) => sum + regularTimeMinutesFor(
      timeValueToMinutes(worksnapTimeForDate(effectiveDailyMinutes, date)),
      isRestDayDate(date, restDaysStr),
      isApprovedFullTimeOffRequestDay(date, leaveRequests),
      isHolidayDayFor(
        holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates, hireDate, record.region, allHolidays),
        localHolidayMinutesFor(date, dailyLogs, record.region, allHolidays, isIndia)
      ),
      isIndia
    ),
    0
  );
const completionTotalMinutes = isFixedContractor((record as AttendanceRow).payCategory)
    // Already the capped Net Time, holiday credit included.
    ? indiaNetCompletionMinutes
    : weekDates.reduce((total, date) => {
        const worksnapTime = worksnapTimeForDate(effectiveDailyMinutes, date);
        const isRestDay = isRestDayDate(date, restDaysStr);
        const dailyDecisionStatus = dailyDecisionStatuses[date] ?? "No Status";
        const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
        const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, isFullTimeOffDay, isIndia);
        const timeOffTime = approvedTimeOffRequestMinutesFor(date, leaveRequests);
        const holidayTime = holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates, hireDate, record.region, allHolidays);
        const localHolMinutes = localHolidayMinutesFor(date, dailyLogs, record.region, allHolidays, isIndia);
        const isHolidayDay = isHolidayDayFor(holidayTime, localHolMinutes);
        const { regularOtMinutes, rdOtMinutes } = otMinutesFor(timeValueToMinutes(evaluatedTime), timeValueToMinutes(worksnapTime), isHolidayDay, isRestDay, dailyDecisionStatus === "Approved", isFullTimeOffDay, isIndia);
        const otMinutesToFold = rdOtMinutes + (isFullTimeOffDay ? regularOtMinutes : 0);
        return total + timeValueToMinutes(completionTimeFor(evaluatedTime, timeOffTime, holidayTime, formatMinutesAsMins(otMinutesToFold)));
      }, 0);
  const weeklyDayHeadings = ["Days", "Decision", "Worksnap Time", "Adjusted Time", "Regular Time", "Evaluated Regular Time", "Regular OT Time", "RD OT Time", "Evaluated Time", "US HO Time", "HO OT Time", "Local HO", "Local HO Time", "Time Away Request", "Time Away Request Time", "Ind Time", "Total Completion Time", "Approval Status"]
    .filter((heading) => !(isIndia && (heading === "Decision" || heading === "Time Away Request" || heading === "Time Away Request Time")));
  const totalTimeOffRequestMinutes = totalTimeOffRequestMinutesFor(weekDates, leaveRequests);

  // Evaluated Regular Time draws on the WEEK's whole pool of Regular OT Time
  // (not just each day's own), so it's computed once across all weekDates
  // together rather than per day in isolation.
  const regularAllocationByDate = (() => {
    const regularTimeByDate: Record<string, number> = {};
    const regularOtByDate: Record<string, number> = {};
    const rdOtByDate: Record<string, number> = {};
    const hoOtByDate: Record<string, number> = {};
    const approvedByDate: Record<string, boolean> = {};
    const halfDayOffByDate: Record<string, number> = {};
    const shortfallEligibleByDate: Record<string, boolean> = {};

    weekDates.forEach((date) => {
      const worksnapTime = worksnapTimeForDate(effectiveDailyMinutes, date);
      const isRestDay = isRestDayDate(date, restDaysStr);
      const dailyDecisionStatus = dailyDecisionStatuses[date] ?? "No Status";
      const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
      const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, isFullTimeOffDay, isIndia);
      const holidayTime = holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates, hireDate, record.region, allHolidays);
      const localHolMinutes = localHolidayMinutesFor(date, dailyLogs, record.region, allHolidays, isIndia);
      const isHolidayDay = isHolidayDayFor(holidayTime, localHolMinutes);
      const { regularOtMinutes, rdOtMinutes, hoOtMinutes } = otMinutesFor(timeValueToMinutes(evaluatedTime), timeValueToMinutes(worksnapTime), isHolidayDay, isRestDay, dailyDecisionStatus === "Approved", isFullTimeOffDay, isIndia);

      regularTimeByDate[date] = regularTimeMinutesFor(timeValueToMinutes(worksnapTime), isRestDay, isFullTimeOffDay, isHolidayDay, isIndia);
      regularOtByDate[date] = regularOtMinutes;
      rdOtByDate[date] = rdOtMinutes;
      hoOtByDate[date] = hoOtMinutes;
      approvedByDate[date] = dailyDecisionStatus === "Approved";
      halfDayOffByDate[date] = isApprovedHalfDayLeaveDate(date, leaveRequests) ? 240 : 0;
      // isHolidayDay (US or local), not just the US-specific holidayTime check
      // — a local holiday already accounts for the day too, so it shouldn't be
      // topped up with borrowed OT/HO OT any more than a US holiday should.
      shortfallEligibleByDate[date] = !isRestDay && !isFullTimeOffDay && !isBeforeHireDate(date, hireDate) && !isHolidayDay;
    });

    return weeklyEvaluatedRegularAllocation(weekDates, regularTimeByDate, regularOtByDate, rdOtByDate, approvedByDate, halfDayOffByDate, shortfallEligibleByDate, hoOtByDate);
  })();
  const totalEvaluatedRegularMinutes = weekDates.reduce((sum, d) => sum + (regularAllocationByDate[d]?.evaluatedRegularTime ?? 0), 0);
  const totalRegularOtMinutes = weekDates.reduce((sum, d) => sum + (regularAllocationByDate[d]?.regularOtMinutes ?? 0), 0);
  const totalAdjustedRdOtMinutes = weekDates.reduce((sum, d) => sum + (regularAllocationByDate[d]?.rdOtMinutes ?? 0), 0);
  const totalHoOtMinutes = weekDates.reduce((sum, d) => sum + (regularAllocationByDate[d]?.hoOtMinutes ?? 0), 0);
  // Evaluated Time includes whatever Regular OT a half-day leave day
  // borrowed to complete itself (see evaluatedMinutesWithBorrow), so this
  // total stays consistent with the per-day Evaluated Time column.
  const totalEvaluatedMinutes = weekDates.reduce((sum, date) => {
    const worksnapTime = worksnapTimeForDate(effectiveDailyMinutes, date);
    const isRestDay = isRestDayDate(date, restDaysStr);
    const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
    const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatuses[date] ?? "No Status", isRestDay, isFullTimeOffDay, isIndia);
    const isHolidayDay = isHolidayDayFor(
      holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates, hireDate, record.region, allHolidays),
      localHolidayMinutesFor(date, dailyLogs, record.region, allHolidays, isIndia)
    );
    const regularTimeMinutes = regularTimeMinutesFor(timeValueToMinutes(worksnapTime), isRestDay, isFullTimeOffDay, isHolidayDay, isIndia);
    const evaluatedRegularTime = regularAllocationByDate[date]?.evaluatedRegularTime ?? 0;
    return sum + evaluatedMinutesWithBorrow(evaluatedTime, regularTimeMinutes, evaluatedRegularTime);
  }, 0);
  // "Total Completion Time" — Evaluated Regular + Regular OT + RD OT + US HO +
  // Local HO + Time Away Request Time — same formula as the table's Total
  // Completion Time column/footer, now shown in the scorecard too.
  const totalCompletionTimeMinutes = totalEvaluatedRegularMinutes + totalRegularOtMinutes + totalAdjustedRdOtMinutes
    + totalDisplayedUsHoMinutes + totalLocalHolidayMinutes + totalTimeOffRequestMinutes;
  const details = [
    ["Shift Type", shiftType],
    ["Typical Non-Working Days", restDaysForAttendanceRow(record as AttendanceRow)],
    ["Worksnap Actual Time", formatMinutesAsMins(worksnapTotalMinutes)],
    // Fixed-Ind is judged on Ind Time — worked time plus both holiday credits,
    // the figure Net Time is derived from. Total Completion Time is built from
    // the Evaluated components instead, and the two differ for this pay
    // category, so the scorecard shows the one that actually drives the week.
    isIndia
      ? ["Ind Time", formatMinutesAsMins(indiaPoolMinutes)]
      : ["Total Completion Time", totalCompletionTimeMinutes > 0 ? formatMinutesAsMins(totalCompletionTimeMinutes) : attendanceTimeValue(dashIfEmpty(record.checkOut))],
    ["Regular Hours", formatMinutesAsHours(totalEvaluatedRegularMinutes)],
  ];

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
    // Back to what's persisted for this week, not to zero — otherwise switching
    // week or contractor would discard a saved credit on re-render.
    setOffsetCredit((record as AttendanceRow).offsetCreditMinutes ?? 0);
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

  function finishAdjustedEdit(date: string, _fallbackValue: string) {
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

  // Matches exactly which days show the per-day Decision check/x icons —
  // every non-rest day, plus any rest day that still has Worksnap Time logged.
  // Shared between "Approve All" and the save logic below, which uses it to
  // decide whether the week actually counts as fully reviewed.
  const applicableDecisionDates = weekDates.filter((date) =>
    !isRestDayDate(date, restDaysStr) || worksnapTimeForDate(dailyWorksnapMinutes, date) !== "-"
  );

  function approveAllDays() {
    const allApproved = applicableDecisionDates.every((date) => dailyDecisionStatuses[date] === "Approved");
    setDailyDecisionStatuses((current) => {
      const next = { ...current };
      applicableDecisionDates.forEach((date) => { next[date] = allApproved ? "No Status" : "Approved"; });
      return next;
    });
  }

  function applyTimeCredit() {
    // Floored at 0: now that Ind Time is uncapped, completionTotalMinutes can
    // exceed the target, and a negative "credit" would quietly subtract real
    // worked time. The button is only offered below the target anyway.
    const credit = Math.max(0, 2400 - completionTotalMinutes);
    setOffsetCredit(credit);
  }

  async function handleSaveClick() {
    const finalCompletionMinutes = isIndia ? completionTotalMinutes + offsetCredit : completionTotalMinutes;
    const finalOffsetCredit = isIndia ? offsetCredit : 0;

    // Fixed-Ind has no per-day Decision, so its "reviewed" outcome instead
    // hinges on whether the actual saved completion (worked minutes, plus any
    // Time Credit just applied) falls in the same 2,400–2,700 min "Standard
    // Met" band that computeWeeklyStatus itself uses — not just the lower
    // bound, since exceeding 2,700 also needs review, and there's no "Apply
    // Time Credit"-style fix for excess hours, so it stays "For Review" until
    // resolved some other way. Hourly contractors always save as "APPROVED"
    // (original behavior) regardless of per-day decisions.
    const requestStatus = isIndia
      ? (finalCompletionMinutes >= 2400 && finalCompletionMinutes <= 2700 ? "APPROVED" : "OPEN")
      : "APPROVED";

    if (record.worksnapUserId != null) {
      setIsSaving(true);
      setSaveError("");
      try {
        const days = weekDates.map((date) => {
          const worksnapTime = worksnapTimeForDate(effectiveDailyMinutes, date);
          const isRestDay = isRestDayDate(date, restDaysStr);
          const dailyDecisionStatus = dailyDecisionStatuses[date] ?? "No Status";
          const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
          const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, isFullTimeOffDay, isIndia);
          const adjustedTime = adjustedTimes[date] ?? "";
          const holidayTime = holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates, hireDate, record.region, allHolidays);
          const adjustedMinutesParsed = timeValueToMinutes(adjustedTime);
          const localHoliday = localHolidayNameFor(date, record.region, allHolidays);
          const localHolidayMinutes = localHolidayMinutesFor(date, dailyLogs, record.region, allHolidays, isIndia);
          const isHolidayDay = isHolidayDayFor(holidayTime, localHolidayMinutes);
          const { rdOtMinutes: rawRdOtMinutes } = otMinutesFor(
            timeValueToMinutes(evaluatedTime), timeValueToMinutes(worksnapTime), isHolidayDay, isRestDay,
            dailyDecisionStatus === "Approved", isFullTimeOffDay, isIndia
          );
          const allocation = regularAllocationByDate[date] ?? { evaluatedRegularTime: 0, regularOtMinutes: 0, rdOtMinutes: 0, hoOtMinutes: 0 };
          const regularTimeMinutes = regularTimeMinutesFor(timeValueToMinutes(worksnapTime), isRestDay, isFullTimeOffDay, isHolidayDay, isIndia);

          return {
            date,
            decisionStatus: decisionStatusToApi(dailyDecisionStatus),
            evaluatedMinutes: evaluatedMinutesWithBorrow(evaluatedTime, regularTimeMinutes, allocation.evaluatedRegularTime),
            adjustedMinutes: adjustedTime.trim() !== "" ? adjustedMinutesParsed : null,
            holidayMinutes: boostedUsHoMinutes(holidayTime, isRestDay, isUsHolidayDate(date, usaHolidays), dailyDecisionStatus === "Approved", rawRdOtMinutes),
            localHoliday: localHoliday || null,
            localHolidayMinutes,
            evaluatedRegularMinutes: allocation.evaluatedRegularTime,
            regularOtMinutes: allocation.regularOtMinutes,
            rdOtMinutes: allocation.rdOtMinutes,
            hoOtMinutes: allocation.hoOtMinutes,
            timeOffMinutes: timeValueToMinutes(timeOffRequestMinutesFor(date, leaveRequests)),
          };
        });

        const response = await fetch("/api/attendance/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            worksnapUserId: record.worksnapUserId,
            email: record.role.includes("@") ? record.role : "",
            week: weekDates[0],
            requestStatus,
            completionMinutes: finalCompletionMinutes,
            // Persisted so reopening this week still shows the credit, and so
            // next week knows what it owes back without relying on React state.
            offsetCreditMinutes: finalOffsetCredit,
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
        <div className="flex items-center justify-between gap-4 px-4 py-2 sm:px-5 sm:py-2.5 border-b border-[#003527] bg-[#003527]">
          <div>
            <h3 className="text-xs font-bold text-white">Attendance Review</h3>
            <p className="mt-0.5 text-base font-bold text-white">{name}</p>
            <p className="text-xs text-green-200">{role}</p>
            <p className="text-xs text-green-200">
              {location}
              {(record as AttendanceRow).payCategory ? ` / ${(record as AttendanceRow).payCategory}` : ""}
              {(record as AttendanceRow).hireDate ? ` / ${fmtHireDate((record as AttendanceRow).hireDate)}` : ""}
            </p>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
            <div className="flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 p-1 shadow-sm overflow-x-auto">
              <div className="flex gap-1">
                {weeks.slice(0, 4).map((w) => (
                  <button
                    key={w}
                    onClick={() => onSelectWeek(w)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg whitespace-nowrap transition-all ${week === w ? "bg-white text-[#003527] shadow-sm" : "text-green-200 hover:text-white hover:bg-white/10"}`}
                  >
                    {weekLabel(w)}
                  </button>
                ))}
              </div>
              <div className="h-5 w-px mx-0.5 shrink-0 bg-white/20" />
              <div className="relative shrink-0">
                <button
                  ref={weekJumpButtonRef}
                  onClick={() => setShowWeekJump((v) => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors ${showWeekJump ? "text-white bg-white/15" : "text-green-200 hover:text-white hover:bg-white/10"}`}
                >
                  <LuCalendar size={13} strokeWidth={2} />
                  <span className="text-[11px] font-bold">Jump to Week</span>
                </button>
                {showWeekJump && (
                  <WeekJumpDropdown
                    anchorRef={weekJumpButtonRef}
                    onApply={(d) => onSelectWeek(sundayOf(d))}
                    onClose={() => setShowWeekJump(false)}
                  />
                )}
              </div>
              <div className="h-5 w-px mx-0.5 shrink-0 bg-white/20" />
              <select
                value={week}
                onChange={(e) => onSelectWeek(e.target.value)}
                title="Select any week from the last few months, including previous months"
                className="h-7 shrink-0 rounded-lg border border-white/15 bg-white/5 px-2 text-[11px] font-bold text-green-100 outline-none focus:ring-2 focus:ring-teal-400"
              >
                {weeks.map((w) => (
                  <option key={w} value={w} className="text-slate-900">{weekLabel(w)}</option>
                ))}
              </select>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {contractorEmail && (
                <>
                  <button
                    onClick={goToTimeAway}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-green-200 transition-colors hover:bg-[#064E3B] hover:text-white"
                    aria-label="Open in Time Away Management"
                    title="Open in Time Away Management"
                  >
                    <LuCalendarDays size={15} strokeWidth={2} />
                  </button>
                  <button
                    onClick={goToPayroll}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-green-200 transition-colors hover:bg-[#064E3B] hover:text-white"
                    aria-label="Open in Payroll"
                    title="Open in Payroll"
                  >
                    <LuBanknote size={15} strokeWidth={2} />
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-green-200 transition-colors hover:bg-[#064E3B] hover:text-white"
                aria-label="Close attendance review"
                title="Close"
              >
                <LuX size={15} strokeWidth={2} />
              </button>
            </div>
          </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              {/* "Ind Time" is the Fixed-Ind label for the same slot as "Total
                  Completion Time", so it takes the same narrow span. */}
              {details.map(([label, value]) => (
                <div key={label} className={`rounded-xl border border-slate-200 p-2 bg-slate-50 ${label === "Total Completion Time" || label === "Ind Time" || label === "Regular Hours" ? "sm:col-span-1" : "sm:col-span-2"}`}>
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
                        className={`px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-r border-b border-slate-100 last:border-r-0 whitespace-nowrap ${
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
                    const dailyDecisionStatus = dailyDecisionStatuses[date] ?? "No Status";
                    // Raw Worksnap Time — reference display only, never fed into calculations.
                    const rawWorksnapTime = worksnapTimeForDate(dailyWorksnapMinutes, date);
                    // Effective time — Adjusted Time when present, else Worksnap Time. Every
                    // calculation below reads this instead of the raw value.
                    const worksnapTime = worksnapTimeForDate(effectiveDailyMinutes, date);
                    const isRestDay = isRestDayDate(date, restDaysStr);
                    const isFullTimeOffDay = isApprovedFullTimeOffRequestDay(date, leaveRequests);
                    const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, isFullTimeOffDay, isIndia);
                    const adjustedTime = adjustedTimes[date] ?? "";
                    // A day with an approved PTO/Sick Leave (full or half day) request is
                    // flagged one of two ways depending on how much time (Adjusted Time
                    // when set, else Worksnap Time) was also logged that day:
                    //   - 240 min (4h/half-day) or less — the expected half-day-leave
                    //     pattern (worked half, on leave the other half) — yellow, not a
                    //     real conflict.
                    //   - More than 240 min — they filed leave but reported to work well
                    //     beyond a half day anyway — red, a genuine conflict needing review.
                    // No approved leave that day means neither highlight applies.
                    const hasApprovedLeave = hasApprovedLeaveRequestFor(date, leaveRequests);
                    const rawWorksnapMinutes = timeValueToMinutes(rawWorksnapTime);
                    const hasAdjustedTime = adjustedTime.trim() !== "";
                    const loggedMinutes = hasAdjustedTime ? timeValueToMinutes(adjustedTime) : rawWorksnapMinutes;
                    const isShortDay = hasApprovedLeave && loggedMinutes > 0 && loggedMinutes <= 240;
                    const hasLeaveWorkConflict = rawWorksnapTime !== "-" && hasApprovedLeave && !isShortDay;
                    const conflictCellClass = hasLeaveWorkConflict ? "bg-red-100 text-red-700" : isShortDay ? "bg-yellow-100 text-yellow-800" : "text-slate-600";
                    const conflictHighlightCellClass = hasLeaveWorkConflict ? "bg-red-100 text-red-700" : isShortDay ? "bg-yellow-100 text-yellow-800" : "bg-red-50 text-slate-600";
                    const holidayTime = holidayTimeFor(date, usaHolidays, effectiveDailyMinutes, restDaysStr, weekDates, hireDate, record.region, allHolidays);
                    const localHoliday = localHolidayNameFor(date, record.region, allHolidays);
                    const localHolidayMinutes = localHolidayMinutesFor(date, dailyLogs, record.region, allHolidays, isIndia);
                    const timeOffTime = approvedTimeOffRequestMinutesFor(date, leaveRequests);
                    const isEditingAdjustedTime = editingAdjustedDate === date;
                    const isHolidayDay = isHolidayDayFor(holidayTime, localHolidayMinutes);
                    const regularTimeMinutes = regularTimeMinutesFor(timeValueToMinutes(worksnapTime), isRestDay, isFullTimeOffDay, isHolidayDay, isIndia);
                    const { regularOtMinutes: rawRegularOtMinutes, rdOtMinutes } = otMinutesFor(timeValueToMinutes(evaluatedTime), timeValueToMinutes(worksnapTime), isHolidayDay, isRestDay, dailyDecisionStatus === "Approved", isFullTimeOffDay, isIndia);
                    const otMinutesToFold = rdOtMinutes + (isFullTimeOffDay ? rawRegularOtMinutes : 0);
                    const completionTime = completionTimeFor(
                      evaluatedTime, timeOffTime, holidayTime, formatMinutesAsMins(otMinutesToFold),
                      // Fixed-Ind's Ind Time carries the local holiday credit too,
                      // matching the week's Net Time pool (see indiaPoolMinutes).
                      isIndia ? formatMinutesAsMins(localHolidayMinutes ?? 0) : "-",
                    );
                    const displayedUsHoMinutes = boostedUsHoMinutes(holidayTime, isRestDay, isUsHolidayDate(date, usaHolidays), dailyDecisionStatus === "Approved", rdOtMinutes);
                    const regularAllocation = regularAllocationByDate[date] ?? { evaluatedRegularTime: 0, regularOtMinutes: 0, rdOtMinutes: 0, hoOtMinutes: 0 };
                    // Includes whatever Regular OT a half-day leave day borrowed to
                    // complete itself, so Evaluated Time stays consistent with
                    // Evaluated Regular Time (see evaluatedMinutesWithBorrow).
                    const displayedEvaluatedMinutes = evaluatedMinutesWithBorrow(evaluatedTime, regularTimeMinutes, regularAllocation.evaluatedRegularTime);

                    return (
                      <tr key={date}>
                        <td
                          className={`sticky left-0 z-10 w-[156px] min-w-[156px] px-4 py-2 font-medium border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0] ${
                            hasLeaveWorkConflict ? "bg-red-100 text-red-700" : isShortDay ? "bg-yellow-100 text-yellow-800" : "bg-white text-slate-800"
                          }`}
                          title={hasLeaveWorkConflict ? "Approved PTO/Medical Unavailability on file for this date, and more than 240 min (4h) was also logged." : isShortDay ? "Approved PTO/Medical Unavailability on file for this date — 240 min (4h) or less was also logged, the expected half-day pattern." : undefined}
                        >
                          {formatDayLabel(date)}
                        </td>
                        {!isIndia && (
                          <td className={`sticky left-[156px] z-10 w-[112px] min-w-[112px] px-4 py-2 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0] ${
                            hasLeaveWorkConflict ? "bg-red-100 text-red-700" : isShortDay ? "bg-yellow-100 text-yellow-800" : "bg-white text-slate-600"
                          }`}>
                            {!isRestDay || rawWorksnapTime !== "-" ? (
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
                          hasLeaveWorkConflict ? "bg-red-100 text-red-700" : isShortDay ? "bg-yellow-100 text-yellow-800" : `bg-white ${worksnapTimeClassName(rawWorksnapTime)}`
                        }`}>
                          {rawWorksnapTime}
                        </td>
                        <td className={`sticky ${isIndia ? "left-[296px]" : "left-[408px]"} z-10 w-[160px] min-w-[160px] px-4 py-2 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0] ${
                          hasLeaveWorkConflict ? "bg-red-100 text-red-700" : isShortDay ? "bg-yellow-100 text-yellow-800" : "bg-white text-slate-600"
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
                          {displayedEvaluatedMinutes > 0 ? formatMinutesAsMins(displayedEvaluatedMinutes) : "-"}
                        </td>
                        <td className={`px-4 py-2 border-r border-slate-100 ${conflictCellClass}`}>
                          {displayedUsHoMinutes > 0 ? formatMinutesAsMins(displayedUsHoMinutes) : "-"}
                        </td>
                        <td className={`px-4 py-2 border-r border-slate-100 whitespace-nowrap ${conflictCellClass}`} style={{ minWidth: 150 }}>
                          {regularAllocation.hoOtMinutes > 0 ? formatMinutesAsMins(regularAllocation.hoOtMinutes) : "-"}
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
                        <td className={`px-4 py-2 font-semibold border-l border-slate-100 ${conflictCellClass}`}>
                          {(() => {
                            const totalCompletionMinutes = regularAllocation.evaluatedRegularTime + regularAllocation.regularOtMinutes + regularAllocation.rdOtMinutes
                              + displayedUsHoMinutes + (localHolidayMinutes ?? 0) + timeValueToMinutes(timeOffRequestMinutesFor(date, leaveRequests));
                            return totalCompletionMinutes > 0 ? formatMinutesAsMins(totalCompletionMinutes) : "-";
                          })()}
                        </td>
                        <td className={`sticky right-0 z-10 w-[140px] min-w-[140px] px-4 py-2 shadow-[-1px_0_0_0_#e2e8f0] ${
                          hasLeaveWorkConflict ? "bg-red-100 text-red-700" : isShortDay ? "bg-yellow-100 text-yellow-800" : `bg-white ${approvalStatusClassName(dailyDecisionStatus)}`
                        }`}>
                          {dailyDecisionStatus}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 [&_tr]:border-t [&_tr]:border-slate-100">
                  {/* "8h / 480 mins" is wider than the bare minute figure it
                      replaced, so every cell on this row is kept on one line
                      rather than wrapping mid-value. */}
                  <tr className="[&_td]:whitespace-nowrap">
                    <td className="sticky left-0 z-20 w-[156px] min-w-[156px] bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                      Total Time
                    </td>
                    {!isIndia && (
                      <td className="sticky left-[156px] z-20 w-[112px] min-w-[112px] bg-slate-50 px-4 py-2 text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                        -
                      </td>
                    )}
                    <td className={`sticky ${isIndia ? "left-[156px]" : "left-[268px]"} z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-2 font-bold text-slate-900 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]`}>
                      {formatMinutesWithHours(worksnapTotalMinutes)}
                    </td>
                    <td className={`sticky ${isIndia ? "left-[296px]" : "left-[408px]"} z-20 w-[160px] min-w-[160px] bg-slate-50 px-4 py-2 text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]`}>
                      -
                    </td>
                    <td className="px-4 py-2 font-bold text-slate-900 border-r border-slate-100 bg-red-50">
                      {formatMinutesWithHours(totalRegularMinutes)}
                    </td>
                    <td className="px-4 py-2 font-bold text-slate-900 border-r border-slate-100">
                      {totalEvaluatedRegularMinutes > 0 ? formatMinutesWithHours(totalEvaluatedRegularMinutes) : "-"}
                    </td>
                    <td className="px-4 py-2 font-bold text-slate-900 border-r border-slate-100">
                      {totalRegularOtMinutes > 0 ? formatMinutesWithHours(totalRegularOtMinutes) : "-"}
                    </td>
                    <td className="px-4 py-2 font-bold text-slate-900 border-r border-slate-100 whitespace-nowrap" style={{ minWidth: 150 }}>
                      {totalAdjustedRdOtMinutes > 0 ? formatMinutesWithHours(totalAdjustedRdOtMinutes) : "-"}
                    </td>
                    <td className="px-4 py-2 font-bold text-slate-900 border-r border-slate-100 bg-red-50">
                      {totalEvaluatedMinutes > 0 ? formatMinutesWithHours(totalEvaluatedMinutes) : "-"}
                    </td>
                    <td className="px-4 py-2 border-r border-slate-100">
                      {totalDisplayedUsHoMinutes > 0
                        ? <span className="flex items-center gap-1 font-semibold text-blue-600"><LuCalendar size={12} strokeWidth={2} />{formatMinutesWithHours(totalDisplayedUsHoMinutes)}</span>
                        : <span className="text-slate-500">-</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-500 border-r border-slate-100 whitespace-nowrap" style={{ minWidth: 150 }}>
                      {totalHoOtMinutes > 0 ? formatMinutesWithHours(totalHoOtMinutes) : "-"}
                    </td>
                    <td className="px-4 py-2 text-slate-500 border-r border-slate-100">
                      -
                    </td>
                    <td className="px-4 py-2 text-slate-500 border-r border-slate-100 whitespace-nowrap" style={{ minWidth: 150 }}>
                      {totalLocalHolidayMinutes > 0 ? formatMinutesWithHours(totalLocalHolidayMinutes) : "-"}
                    </td>
                    {!isIndia && (
                      <td className="px-4 py-2 text-slate-500 border-r border-slate-100">
                        -
                      </td>
                    )}
                    {!isIndia && (
                      <td className="px-4 py-2 text-slate-500 border-r border-slate-100">
                        {totalTimeOffRequestMinutes > 0 ? formatMinutesWithHours(totalTimeOffRequestMinutes) : "-"}
                      </td>
                    )}
                    <td className="px-4 py-2 font-bold text-slate-900">
                      {formatMinutesWithHours(isIndia ? indiaPoolMinutes : completionTotalMinutes)}
                    </td>
                    <td className="px-4 py-2 font-bold text-slate-900 border-l border-slate-100">
                      {(() => {
                        const totalCompletionMinutes = totalEvaluatedRegularMinutes + totalRegularOtMinutes + totalAdjustedRdOtMinutes
                          + totalDisplayedUsHoMinutes + totalLocalHolidayMinutes + totalTimeOffRequestMinutes;
                        return totalCompletionMinutes > 0 ? formatMinutesWithHours(totalCompletionMinutes) : "-";
                      })()}
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
                        {/* Regular Time, Evaluated Regular Time, Regular OT Time, RD OT Time,
                            Evaluated Time, US HO Time, HO OT Time, Local HO, Local HO Time —
                            9 placeholder cells, matching weeklyDayHeadings 1:1 for isIndia. */}
                        <td className="px-4 py-2 text-slate-500 border-r border-slate-100">-</td>
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
                        <td className="px-4 py-2 text-slate-500 border-l border-slate-100">-</td>
                        <td className="sticky right-0 z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-2 text-slate-500 shadow-[-1px_0_0_0_#e2e8f0]">-</td>
                      </tr>
                      <tr>
                        <td className="sticky left-0 z-20 w-[156px] min-w-[156px] bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#003527] border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                          Net Time
                        </td>
                        <td className={`sticky left-[156px] z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-2 text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]`}>-</td>
                        <td className="sticky left-[296px] z-20 w-[160px] min-w-[160px] bg-slate-50 px-4 py-2 text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">-</td>
                        {/* Same 9 placeholder cells as the Offset Credit row above. */}
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
                          {/* Two directions: `offsetCredit` is a top-up just
                              applied to reach the target, `appliedOffsetCredit`
                              is a repayment carried in from an earlier week.
                              Both land under the same 2,400-min ceiling. */}
                          {formatMinutesAsMins(
                            offsetCredit > 0
                              ? Math.min(indiaPoolMinutes + offsetCredit, FIXED_IND_NET_CAP_MINUTES)
                              : indiaNetCompletionMinutes
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-500 border-l border-slate-100">-</td>
                        <td className="sticky right-0 z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-2 text-slate-500 shadow-[-1px_0_0_0_#e2e8f0]">-</td>
                      </tr>
                    </>
                  )}
                </tfoot>
              </table>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 sm:px-6 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50">
          <div className="mr-auto flex items-center gap-3">
            {/* A Time Credit moved this week's figures — either it was granted
                here, or it's being repaid out of this week's Ind Time. Takes
                precedence over the stored weeklyStatus, matching the main
                table's Status column. */}
            {isAppliedCredits ? (
              <span
                title={offsetCredit > 0
                  ? `${offsetCredit} min of Time Credit applied to this week — repaid out of the following week's Ind Time`
                  : `${appliedOffsetCredit} min of Time Credit from the previous week repaid out of this week's Ind Time`}
                className="px-2 py-1 bg-red-100 text-red-700 rounded-md text-[11px] font-bold uppercase"
              >
                Applied Credits
              </span>
            ) : (
              <>
            {record.weeklyStatus === "Standard Met" && <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-[11px] font-bold uppercase">Standard Met</span>}
            {record.weeklyStatus === "For Review" && (
              <span className="flex items-center gap-1 text-red-600">
                <LuCircleAlert size={13} strokeWidth={2} />
                <span className="text-[11px] font-bold uppercase">For Review</span>
              </span>
            )}
            {record.weeklyStatus === "On Leave" && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-[11px] font-bold uppercase">On Leave</span>}
            {record.weeklyStatus === "Reviewed" && (
              weekHasLeaveWorkConflict ? (
                <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-md text-[11px] font-bold uppercase">
                  <LuCircleAlert size={12} strokeWidth={2} />
                  Need Attention
                </span>
              ) : (
                <span className="px-2 py-1 bg-orange-100 text-orange-600 rounded-md text-[11px] font-bold uppercase">Reviewed</span>
              )
            )}
            {record.weeklyStatus === "Processed" && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-[11px] font-bold uppercase">Processed</span>}
              </>
            )}
            {saveError && <p className="text-sm font-medium text-red-600">{saveError}</p>}
          </div>
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

function BulkApproveModal({ worksnapRows, allLeaveRequests, onClose, onApprove, usaHolidays, allHolidays, week, isWeekEnded, repaymentFor }: {
  worksnapRows: AttendanceRow[];
  allLeaveRequests: AdminLeaveRequest[];
  onClose: () => void;
  onApprove: () => void;
  usaHolidays: HolidayEntry[];
  allHolidays: HolidayEntry[];
  week: string;
  isWeekEnded: boolean;
  /** Fixed-Ind: the Time Credit this week owes back, granted on the week before. */
  repaymentFor: (row: AttendanceRow) => number;
}) {
  const [countryFilter, setCountryFilter] = useState("All");
  const [deptFilter, setDeptFilter] = useState("All");
  const [shiftTypeFilter, setShiftTypeFilter] = useState("All");
  const [dailyLogs, setDailyLogs] = useState<DailyLogEntry[]>([]);
  const [dayStatusDays, setDayStatusDays] = useState<Array<{ email?: string; date?: string; adjustedMinutes?: number | null }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processedApprovals, setProcessedApprovals] = useState<Map<string, number>>(new Map());
  const [isSavingBulk, setIsSavingBulk] = useState(false);
  const [bulkSaveError, setBulkSaveError] = useState("");
  const [failedContractorIds, setFailedContractorIds] = useState<Map<string, string>>(new Map());
  const [loadError, setLoadError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [savingElapsedSeconds, setSavingElapsedSeconds] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

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
  // via the `week` prop) rather than its own independent week picker, and the
  // exact same rows already loaded/computed there (worksnapRows) rather than
  // re-fetching and re-deriving weeklyStatus independently — otherwise this
  // modal could drift out of sync with what the main table shows (e.g. the
  // live "all days No Status" → "For Review" override).
  const modalWeekDates = week ? datesBetween(week, addDaysIso(week, 6)) : [];
  const countryOptions = Array.from(new Set(worksnapRows.map((r) => r.region).filter(Boolean))).sort();
  const deptOptions = Array.from(new Set(worksnapRows.map(departmentForAttendanceRow))).sort();
  const shiftTypeOptions = Array.from(new Set(worksnapRows.map((row) => row.shiftType ?? "").filter(Boolean))).sort();

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
        const [dailyLogResult, dayStatusResult] = await Promise.all([
          fetchWithRetry(`/api/attendance/daily-log?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then((r) => (r.ok ? r.json() : { logs: [] })),
          fetchWithRetry(`/api/attendance/day-status?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then((r) => (r.ok ? r.json() : { days: [] })),
        ]);
        if (isCancelled) return;

        setDailyLogs((dailyLogResult.logs ?? []) as DailyLogEntry[]);
        setDayStatusDays((dayStatusResult.days ?? []) as Array<{ email?: string; date?: string; adjustedMinutes?: number | null }>);
      } catch {
        if (isCancelled) return;
        setLoadError("Unable to load contractors for bulk approval. Please try again.");
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    load();
    return () => { isCancelled = true; };
  }, [week, retryNonce]);

  // Candidate rows come straight from Weekly Time Tracking's own rows (the
  // `worksnapRows` prop) instead of a separate fetch, so this modal can never
  // drift out of sync with what the main table shows for the same week.
  const candidateRows = useMemo(() => worksnapRows.filter((r) =>
    r.weeklyStatus === "For Review" && r.payCategory?.trim().toLowerCase() === "hourly" && (r.shiftType === "Fixed" || r.shiftType === "Flexible") && r.worksnapUserId != null
  ), [worksnapRows]);

  // Adjusted Time overrides Worksnap Time the same way an individual
  // Attendance Review does — one bulk request covers every contractor's saved
  // per-day adjustment instead of firing one request per candidate row.
  const adjustedByContractor = useMemo(() => {
    const adjustedByEmail = new Map<string, Record<string, number>>();
    for (const d of dayStatusDays) {
      const email = String(d.email ?? "").trim().toLowerCase();
      if (!email || d.adjustedMinutes == null) continue;
      const map = adjustedByEmail.get(email) ?? {};
      map[String(d.date ?? "")] = d.adjustedMinutes;
      adjustedByEmail.set(email, map);
    }
    return new Map(candidateRows.map((r) => {
      const email = r.role.includes("@") ? r.role.trim().toLowerCase() : "";
      return [r.contractorId, adjustedByEmail.get(email) ?? {}];
    }));
  }, [dayStatusDays, candidateRows]);

  const filteredRows = useMemo(() => worksnapRows
    .filter((r) =>
      r.weeklyStatus === "For Review" &&
      r.payCategory?.trim().toLowerCase() === "hourly" &&
      (r.shiftType === "Fixed" || r.shiftType === "Flexible") &&
      (countryFilter === "All" || r.region === countryFilter) &&
      (deptFilter === "All" || departmentForAttendanceRow(r) === deptFilter) &&
      (shiftTypeFilter === "All" || r.shiftType === shiftTypeFilter)
    )
    .sort((a, b) => a.name.localeCompare(b.name)),
    [worksnapRows, countryFilter, deptFilter, shiftTypeFilter]
  );

  // Pre-compute all per-row totals once per data change so the render loop
  // doesn't call buildBulkApproveDaySnapshots (expensive) for every row on
  // every re-render (e.g. checkbox toggles, filter changes).
  const rowTotalsCache = useMemo(() => {
    const cache = new Map<string, {
      weeklyTotals: ReturnType<typeof rowWeeklyTotals>;
      holidayBonusMins: number;
      localHolidayMins: number;
      timeOffRequestMins: number;
    }>();
    for (const r of filteredRows) {
      const email = r.role.includes("@") ? r.role : "";
      const rowLeave = leaveRequests.filter((req) => req.email === email);
      const rowDailyMins = effectiveDailyMinutesFor(r, adjustedByContractor.get(r.contractorId));
      const rowRestDays = restDaysForAttendanceRow(r);
      const userLogs = dailyLogs.filter((l) => l.worksnapUserId === r.worksnapUserId);
      cache.set(r.contractorId, {
        weeklyTotals: rowWeeklyTotals(r, modalWeekDates, usaHolidays, dailyLogs, allHolidays, adjustedByContractor.get(r.contractorId), rowLeave),
        holidayBonusMins: modalWeekDates.reduce((sum, date) => sum + timeValueToMinutes(holidayTimeFor(date, usaHolidays, rowDailyMins, rowRestDays, modalWeekDates, r.hireDate, r.region, allHolidays)), 0),
        localHolidayMins: modalWeekDates.reduce((sum, date) => sum + (localHolidayMinutesFor(date, userLogs, r.region, allHolidays, isFixedContractor(r.payCategory)) ?? 0), 0),
        timeOffRequestMins: email ? totalTimeOffRequestMinutesFor(modalWeekDates, rowLeave) : 0,
      });
    }
    return cache;
  }, [filteredRows, leaveRequests, dailyLogs, adjustedByContractor, modalWeekDates, usaHolidays, allHolidays]);

  const allSelected = filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.contractorId));

  function toggle(id: string) {
    setSelectedIds((ids) => { const next = new Set(ids); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredRows.map((r) => r.contractorId)));
  }

  function handleBulkApprovePreview() {
    const map = new Map<string, number>();
    filteredRows.filter((r) => selectedIds.has(r.contractorId)).forEach((r) => {
      map.set(r.contractorId, rowTotalsCache.get(r.contractorId)?.weeklyTotals.totalCompletionMinutes ?? 0);
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
          .map((r) => [r.contractorId, rowTotalsCache.get(r.contractorId)?.weeklyTotals.totalCompletionMinutes ?? 0])
        );

    const rowsToSave = filteredRows.filter((r) => selectedIds.has(r.contractorId) && r.worksnapUserId != null);
    setIsSavingBulk(true);
    setCancelling(false);
    setBulkSaveError("");
    setFailedContractorIds(new Map());
    setProcessedCount(0);
    setTotalToProcess(rowsToSave.length);

    const items = rowsToSave.map((r) => {
      const email = r.role.includes("@") ? r.role : "";
      // Same Net Time rule and credit pass-through as Attendance Review and
      // Process Attendance, so all three record the identical figure.
      const rawCompletion = approvedMinutesById.get(r.contractorId) ?? 0;
      const grantedCredit = isFixedContractor(r.payCategory) ? (r.offsetCreditMinutes ?? 0) : 0;
      return {
        contractorId: r.contractorId,
        worksnapUserId: r.worksnapUserId,
        email,
        week: modalWeekDates[0],
        requestStatus: "APPROVED",
        completionMinutes: isFixedContractor(r.payCategory)
          ? fixedIndNetMinutes(rawCompletion, repaymentFor(r)) + grantedCredit
          : rawCompletion,
        offsetCreditMinutes: grantedCredit,
        days: buildBulkApproveDaySnapshots(r, modalWeekDates, usaHolidays, dailyLogs, allHolidays, adjustedByContractor.get(r.contractorId), leaveRequests.filter((req) => req.email === email)),
      };
    });

    // One request per contractor, awaited sequentially — never more than one
    // save in flight, same DB-connection pressure as the previous single
    // batched request, but this way the client actually knows how far it's
    // gotten. That's what makes a real "N of M" counter possible (the old
    // batched request was one opaque round trip with no progress inside it),
    // and it also lets Cancel stop cleanly between contractors instead of
    // aborting mid-write with no idea what the server already finished.
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const failedMap = new Map<string, string>();
    let processed = 0;
    let savedCount = 0;
    let wasAborted = false;

    for (const item of items) {
      if (controller.signal.aborted) { wasAborted = true; break; }
      try {
        const res = await fetch("/api/attendance/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
          signal: controller.signal,
        });
        if (res.ok) {
          savedCount++;
        } else {
          const result = await res.json().catch(() => ({}));
          failedMap.set(item.contractorId, result.error ?? "Failed to save");
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") { wasAborted = true; break; }
        failedMap.set(item.contractorId, "Failed to save");
      }
      processed++;
      setProcessedCount(processed);
    }

    abortControllerRef.current = null;
    setIsSavingBulk(false);
    setCancelling(false);

    if (wasAborted) {
      setFailedContractorIds(failedMap);
      setBulkSaveError(`Cancelled after ${processed} of ${items.length} — contractors already saved before cancelling stay saved. Retry the rest, or refresh to check.`);
      if (processed > 0) onApprove();
      return;
    }

    if (failedMap.size > 0) {
      setFailedContractorIds(failedMap);
      setBulkSaveError(`${failedMap.size} of ${items.length} approval${items.length !== 1 ? "s" : ""} failed to save — highlighted below. Please retry.`);
      // Some contractors may have saved successfully even though others
      // failed — refresh the main table so those aren't left stale.
      if (savedCount > 0) onApprove();
      return;
    }

    onApprove();
    onClose();
  }

  function handleCancelSave() {
    setCancelling(true);
    abortControllerRef.current?.abort();
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
            <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-white/10 text-green-100">
              Pay Category: Hourly
            </span>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-green-200 transition-colors hover:bg-[#064E3B] hover:text-white">
            <LuX size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-teal-500">
            <option value="All">All Assigned Teams</option>
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
                <th className="sticky left-[272px] z-20 bg-slate-50 px-4 py-3 w-[160px] min-w-[160px] text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">Assigned Team</th>
                {["Actual Time",
                  "Total Evaluated Regular Time", "Total Regular OT Time", "Total RD OT Time", "Total Evaluated Time", "Total US HO Time", "Total HO OT Time",
                  "Local HO Time", "Total Time Away Request Time", "Ind Time",
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
                const cached = rowTotalsCache.get(row.contractorId);
                const weeklyTotals = cached?.weeklyTotals;
                const rowHolidayBonusMins = cached?.holidayBonusMins ?? 0;
                const completionMins = processedMins ?? row.completionMinutes ?? weeklyTotals?.totalCompletionMinutes ?? 0;
                const isProcessed = processedMins !== undefined;
                const localHolidayMins = cached?.localHolidayMins ?? 0;
                const timeOffRequestMins = cached?.timeOffRequestMins ?? 0;
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
                    {(weeklyTotals?.totalEvaluatedRegularMinutes ?? 0) > 0 ? formatMinutesAsMins(weeklyTotals!.totalEvaluatedRegularMinutes) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 border-r border-slate-100">
                    {(weeklyTotals?.totalRegularOtMinutes ?? 0) > 0 ? formatMinutesAsMins(weeklyTotals!.totalRegularOtMinutes) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 border-r border-slate-100">
                    {(weeklyTotals?.totalRdOtMinutes ?? 0) > 0 ? formatMinutesAsMins(weeklyTotals!.totalRdOtMinutes) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 border-r border-slate-100">
                    {(weeklyTotals?.totalEvaluatedMinutes ?? 0) > 0 ? formatMinutesAsMins(weeklyTotals!.totalEvaluatedMinutes) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 border-r border-slate-100">
                    {(weeklyTotals?.totalUsHoMinutes ?? 0) > 0 ? formatMinutesAsMins(weeklyTotals!.totalUsHoMinutes) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 border-r border-slate-100">
                    {(weeklyTotals?.totalHoOtMinutes ?? 0) > 0 ? formatMinutesAsMins(weeklyTotals!.totalHoOtMinutes) : "—"}
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
                    {row.weeklyStatus === "Processed" && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-[11px] font-bold uppercase">Processed</span>}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-4 sm:px-6 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50">
          {bulkSaveError && <p className="mr-auto text-sm font-medium text-red-600">{bulkSaveError}</p>}
          {!bulkSaveError && selectedIds.size > 0 && (
            <p className="mr-auto text-sm text-slate-500">
              <span className="font-bold text-slate-700">{selectedIds.size}</span> contractor{selectedIds.size !== 1 ? "s" : ""} selected
            </p>
          )}
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
            <p className="text-sm font-semibold text-slate-700">{cancelling ? "Cancelling…" : "Saving approvals…"}</p>
            <p className="text-xs font-semibold text-emerald-700 tabular-nums">
              {processedCount} of {totalToProcess} contractor{totalToProcess !== 1 ? "s" : ""} processed
            </p>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{ width: `${totalToProcess > 0 ? Math.round((processedCount / totalToProcess) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 tabular-nums">{formatElapsedSeconds(savingElapsedSeconds)}</p>
            <button
              type="button"
              onClick={handleCancelSave}
              disabled={cancelling}
              title="Contractors already saved before cancelling will stay saved — this only stops waiting on the rest"
              className="mt-1 px-4 py-1.5 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
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
                  <td className="px-3 py-1.5 text-xs font-semibold text-amber-600">Time Away</td>
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

// Bulk-finalizes every row that doesn't need manual review ("Standard Met" —
// never reviewed but already compliant — and "Reviewed" — re-saved/refreshed
// too) in one shot, skipping "For Review" rows entirely. Reuses the exact
// same per-day snapshot builder and bulk-save endpoint Bulk Approve does, so
// the persisted numbers are computed identically either way.
function ProcessAttendanceModal({ rows, allLeaveRequests, usaHolidays, allHolidays, week, repaymentFor, onClose, onProcessed }: {
  rows: AttendanceRow[];
  allLeaveRequests: AdminLeaveRequest[];
  usaHolidays: HolidayEntry[];
  allHolidays: HolidayEntry[];
  week: string;
  /** Fixed-Ind: the Time Credit this week owes back, granted on the week before. */
  repaymentFor: (row: AttendanceRow) => number;
  onClose: () => void;
  onProcessed: () => void;
}) {
  const [dailyLogs, setDailyLogs] = useState<DailyLogEntry[]>([]);
  const [adjustedByContractor, setAdjustedByContractor] = useState<Map<string, Record<string, number>>>(new Map());
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState("");
  // Live total of every contractor profile row in the database — not derived
  // from this week's attendance data at all, so it stays accurate whenever a
  // profile is added or removed regardless of whether they logged any time.
  const [contractorRecordsCount, setContractorRecordsCount] = useState<number | null>(null);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [processingElapsedSeconds, setProcessingElapsedSeconds] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isProcessing) return;
    setProcessingElapsedSeconds(0);
    const id = setInterval(() => setProcessingElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isProcessing]);

  const weekDates = week ? datesBetween(week, addDaysIso(week, 6)) : [];
  const leaveRequests = useMemo(() => allLeaveRequests.filter((r) => r.status === "Approved"), [allLeaveRequests]);

  // Only contractors that actually exist in Contractor Details are counted or
  // processed at all — same flag the "Contractors Records" count below uses.
  // Anyone logging Worksnap time with no matching contractor profile is
  // excluded from every count and never gets saved to the database.
  const profiledRows = useMemo(() => rows.filter((r) => r.hasContractorProfile !== false), [rows]);

  const needsReviewCount = profiledRows.filter((r) => r.weeklyStatus === "For Review").length;
  const reviewedCount = profiledRows.filter((r) => r.weeklyStatus === "Reviewed").length;
  const standardMetCount = profiledRows.filter((r) => r.weeklyStatus === "Standard Met").length;

  // Everything except "For Review" — "Standard Met" rows get saved for the
  // first time, already-"Reviewed" rows get refreshed/re-saved alongside them.
  const eligibleRows = useMemo(() => profiledRows.filter((r) =>
    (r.weeklyStatus === "Standard Met" || r.weeklyStatus === "Reviewed") && r.worksnapUserId != null
  ), [profiledRows]);

  useEffect(() => {
    if (!week) return;
    let isCancelled = false;
    const dates = datesBetween(week, addDaysIso(week, 6));
    const from = dates[0];
    const to = dates[dates.length - 1];
    setIsLoadingData(true);
    setLoadError("");

    async function load() {
      try {
        const [dailyLogResult, dayStatusResult] = await Promise.all([
          fetchWithRetry(`/api/attendance/daily-log?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then((r) => (r.ok ? r.json() : { logs: [] })),
          fetchWithRetry(`/api/attendance/day-status?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then((r) => (r.ok ? r.json() : { days: [] })),
        ]);
        if (isCancelled) return;
        setDailyLogs((dailyLogResult.logs ?? []) as DailyLogEntry[]);

        const adjustedByEmail = new Map<string, Record<string, number>>();
        for (const d of (dayStatusResult.days ?? []) as Array<{ email?: string; date?: string; adjustedMinutes?: number | null }>) {
          const email = String(d.email ?? "").trim().toLowerCase();
          if (!email || d.adjustedMinutes == null) continue;
          const map = adjustedByEmail.get(email) ?? {};
          map[String(d.date ?? "")] = d.adjustedMinutes;
          adjustedByEmail.set(email, map);
        }
        const entries: [string, Record<string, number>][] = eligibleRows.map((r) => {
          const email = r.role.includes("@") ? r.role.trim().toLowerCase() : "";
          return [r.contractorId, adjustedByEmail.get(email) ?? {}];
        });
        setAdjustedByContractor(new Map(entries));
      } catch {
        if (isCancelled) return;
        setLoadError("Unable to load supporting data for processing. Please try again.");
      } finally {
        if (!isCancelled) setIsLoadingData(false);
      }
    }

    load();
    return () => { isCancelled = true; };
  }, [week]);

  // Total contractor profile count — independent of the selected week, so it
  // always reflects the current Contractor Details roster whenever this
  // modal is opened, regardless of who logged attendance this particular week.
  useEffect(() => {
    let isCancelled = false;
    fetchAllContractors({ country: "All Countries", status: "All Statuses", rules: [] })
      .then((contractors) => { if (!isCancelled) setContractorRecordsCount(contractors.length); })
      .catch(() => { if (!isCancelled) setContractorRecordsCount(null); });
    return () => { isCancelled = true; };
  }, []);

  async function handleProcess() {
    setIsProcessing(true);
    setCancelling(false);
    setProcessError("");
    setProcessedCount(0);
    setTotalToProcess(eligibleRows.length);

    const items = eligibleRows.map((r) => {
      const email = r.role.includes("@") ? r.role : "";
      const rowLeaveRequests = leaveRequests.filter((req) => req.email === email);
      const adjustedDaily = adjustedByContractor.get(r.contractorId);
      const totals = rowWeeklyTotals(r, weekDates, usaHolidays, dailyLogs, allHolidays, adjustedDaily, rowLeaveRequests);
      // Fixed-Ind follows the same Net Time rule Attendance Review saves —
      // repay first, cap at 2,400, then add the credit granted on this week —
      // so processing a week can't record a different figure than reviewing it
      // did. totalCompletionMinutes is the per-day Ind Time summed, which is
      // exactly the pool the modal caps (see indiaPoolMinutes).
      const grantedCredit = isFixedContractor(r.payCategory) ? (r.offsetCreditMinutes ?? 0) : 0;
      const completionMinutes = isFixedContractor(r.payCategory)
        ? fixedIndNetMinutes(totals.totalCompletionMinutes, repaymentFor(r)) + grantedCredit
        : totals.totalCompletionMinutes;
      return {
        worksnapUserId: r.worksnapUserId,
        email,
        week: weekDates[0],
        requestStatus: "APPROVED",
        completionMinutes,
        // Carried through explicitly: the ops builder writes whatever it is
        // given, so omitting it would zero a credit that had been applied.
        offsetCreditMinutes: grantedCredit,
        days: buildBulkApproveDaySnapshots(r, weekDates, usaHolidays, dailyLogs, allHolidays, adjustedDaily, rowLeaveRequests),
        processed: true,
      };
    });

    // One request per contractor, awaited sequentially — same DB-connection
    // pressure as a single batched request (never more than one save in
    // flight), but this way the client can show real "N of M" progress and
    // Cancel cleanly between contractors, same as Bulk Approve.
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let processed = 0;
    let failedCount = 0;
    let wasAborted = false;

    for (const item of items) {
      if (controller.signal.aborted) { wasAborted = true; break; }
      try {
        const res = await fetch("/api/attendance/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
          signal: controller.signal,
        });
        if (!res.ok) failedCount++;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") { wasAborted = true; break; }
        failedCount++;
      }
      processed++;
      setProcessedCount(processed);
    }

    abortControllerRef.current = null;
    setIsProcessing(false);
    setCancelling(false);

    if (wasAborted) {
      setProcessError(`Cancelled after ${processed} of ${items.length} — contractors already processed before cancelling stay saved. Retry the rest, or refresh to check.`);
      if (processed > 0) onProcessed();
      return;
    }

    if (failedCount > 0) {
      setProcessError(`${failedCount} of ${items.length} record${items.length !== 1 ? "s" : ""} failed to process. Please try again.`);
      if (processed > failedCount) onProcessed();
      return;
    }

    onProcessed();
    onClose();
  }

  function handleCancelProcess() {
    setCancelling(true);
    abortControllerRef.current?.abort();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isProcessing && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-[#003527]">Process Attendance</h3>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <LuX size={18} strokeWidth={2} />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          {week ? weekLabel(week) : "This week"} — rows that need review are skipped.
        </p>

        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-red-50 border border-red-100">
            <span className="text-sm font-medium text-red-700">Needs Review</span>
            <span className="text-sm font-bold text-red-700">{needsReviewCount}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-orange-50 border border-orange-100">
            <span className="text-sm font-medium text-orange-700">Reviewed</span>
            <span className="text-sm font-bold text-orange-700">{reviewedCount}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
            <span className="text-sm font-medium text-emerald-700">Standard Met</span>
            <span className="text-sm font-bold text-emerald-700">{standardMetCount}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-sm font-medium text-slate-600">Contractor Records</span>
            <span className="text-sm font-bold text-slate-600">{contractorRecordsCount ?? "—"}</span>
          </div>
        </div>

        {loadError && <p className="text-xs text-red-600 mb-3">{loadError}</p>}
        {processError && <p className="text-xs text-red-600 mb-3">{processError}</p>}

        <p className="text-xs text-slate-400 mb-5">
          {eligibleRows.length} record{eligibleRows.length !== 1 ? "s" : ""} will be saved to attendance_week_status / attendance_day_status.
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleProcess}
            disabled={isProcessing || isLoadingData || eligibleRows.length === 0}
            className="px-5 py-2 bg-[#003527] hover:bg-[#064E3B] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2"
          >
            {isProcessing ? "Processing…" : isLoadingData ? "Loading…" : "Process"}
          </button>
        </div>
      </div>

      {/* Processing overlay — blocks interaction and shows live progress
          while a process is in flight (a large batch can take a while). */}
      {isProcessing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 flex flex-col items-center gap-3 min-w-[240px]">
            <LuRefreshCw size={28} className="text-emerald-600 animate-spin" />
            <p className="text-sm font-semibold text-slate-700">{cancelling ? "Cancelling…" : "Processing attendance…"}</p>
            <p className="text-xs font-semibold text-emerald-700 tabular-nums">
              {processedCount} of {totalToProcess} contractor{totalToProcess !== 1 ? "s" : ""} processed
            </p>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{ width: `${totalToProcess > 0 ? Math.round((processedCount / totalToProcess) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 tabular-nums">{formatElapsedSeconds(processingElapsedSeconds)}</p>
            <button
              type="button"
              onClick={handleCancelProcess}
              disabled={cancelling}
              title="Contractors already processed before cancelling will stay saved — this only stops waiting on the rest"
              className="mt-1 px-4 py-1.5 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Fixed-Mex only — lets an admin enter each contractor's standard weekly
// Regular Time (minutes) for the selected week, saved to the fixed_time
// table (Name, email, regular_time, date — date is this week's Sunday).
// Loads the full Fixed-Mex roster rather than just this week's Worksnap
// rows, since a contractor with zero logged time this week still needs
// this settable.
function FixedTimeModal({ week, onClose }: { week: string; onClose: () => void }) {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  // A row with an already-saved value is locked (read-only, button reads
  // "Edit") until explicitly unlocked — prevents accidentally overwriting a
  // saved value by leaving the field always editable.
  const [savedUids, setSavedUids] = useState<Set<string>>(new Set());
  const [unlockedUids, setUnlockedUids] = useState<Set<string>>(new Set());

  useEffect(() => {
    let isCancelled = false;
    Promise.all([
      fetchAllContractors({ country: "All Countries", status: "Active", rules: [] }),
      fetchFixedTimeForWeek(week),
    ])
      .then(([all, savedByEmail]) => {
        if (isCancelled) return;
        const fixedMex = all
          .filter((c) => c.payCategory.trim().toLowerCase() === "fixed-mex")
          .sort((a, b) => (a.fullName || a.firstName).localeCompare(b.fullName || b.firstName));
        setContractors(fixedMex);
        setEditValues(Object.fromEntries(
          fixedMex.map((c) => {
            const saved = savedByEmail[c.email.trim().toLowerCase()];
            return [c.uid, saved != null ? String(saved) : ""];
          })
        ));
        setSavedUids(new Set(
          fixedMex.filter((c) => savedByEmail[c.email.trim().toLowerCase()] != null).map((c) => c.uid)
        ));
        setUnlockedUids(new Set());
      })
      .catch(() => { if (!isCancelled) setLoadError("Unable to load Fixed-Mex contractors. Please try again."); })
      .finally(() => { if (!isCancelled) setLoading(false); });
    return () => { isCancelled = true; };
  }, [week]);

  function isLocked(uid: string) {
    return savedUids.has(uid) && !unlockedUids.has(uid);
  }

  async function handleSave(c: Contractor) {
    const raw = (editValues[c.uid] ?? "").trim();
    const minutes = raw === "" ? null : Math.max(0, Math.round(parseFloat(raw) || 0));
    setSavingEmail(c.email);
    try {
      const name = c.fullName || [c.firstName, c.surname].filter(Boolean).join(" ");
      await saveFixedTime(week, { name, email: c.email, regularTime: minutes });
      setSavedUids((prev) => {
        const next = new Set(prev);
        if (minutes == null) next.delete(c.uid); else next.add(c.uid);
        return next;
      });
      setUnlockedUids((prev) => { const next = new Set(prev); next.delete(c.uid); return next; });
      toast.success(`${name}'s fixed weekly time ${minutes == null ? "cleared" : "saved"} successfully.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSavingEmail(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-[#003527]">Fixed Time</h3>
            <p className="text-xs text-slate-400 mt-0.5">Set each Fixed-Mex contractor&apos;s Regular Time (minutes) for {weekLabel(week)}.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <LuX size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <LuRefreshCw size={16} className="animate-spin" /> Loading…
            </div>
          ) : loadError ? (
            <p className="py-10 text-center text-sm text-red-500">{loadError}</p>
          ) : contractors.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No Fixed-Mex contractors found.</p>
          ) : (
            <div className="space-y-2">
              {contractors.map((c) => (
                <div key={c.uid} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{c.fullName || [c.firstName, c.surname].filter(Boolean).join(" ")}</p>
                    <p className="truncate text-xs text-slate-400">{c.email}</p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 2400"
                    value={editValues[c.uid] ?? ""}
                    onChange={(e) => setEditValues((prev) => ({ ...prev, [c.uid]: e.target.value }))}
                    disabled={isLocked(c.uid)}
                    className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  <button
                    onClick={() => isLocked(c.uid)
                      ? setUnlockedUids((prev) => new Set(prev).add(c.uid))
                      : handleSave(c)}
                    disabled={savingEmail === c.email}
                    className="w-20 rounded-lg bg-[#003527] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#064E3B] disabled:opacity-50"
                  >
                    {savingEmail === c.email ? "Saving…" : isLocked(c.uid) ? "Edit" : "Save"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const { dark } = useAdminTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [weeks, setWeeks] = useState<string[]>([]);
  const [week, setWeek] = useState("");
  const [showRangePicker, setShowRangePicker] = useState(false);
  const weekJumpButtonRef = useRef<HTMLButtonElement>(null);
  const [reviewTarget, setReviewTarget] = useState<{ record: AttendanceRecord; source: "view" | "review" } | null>(null);
  const [worksnapRows, setWorksnapRows] = useState<AttendanceRow[]>([]);
  const [isLoadingWorksnap, setIsLoadingWorksnap] = useState(true);
  const [worksnapError, setWorksnapError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [breakdownTarget, setBreakdownTarget] = useState<AttendanceRow | null>(null);
  const [nameSearch, setNameSearch] = useState("");

  // Deep link from the Notification bell's Absent/Late Today items (see
  // NotificationBell.tsx) — pre-fills the name search so landing here shows
  // just that contractor, then clears the param so it doesn't stick around
  // on refresh/back-navigation.
  useEffect(() => {
    const search = searchParams.get("search");
    if (search) {
      setNameSearch(search);
      router.replace("/admin/attendance");
    }
  }, [searchParams, router]);

  const [payCategoryFilter, setPayCategoryFilter] = useState("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [shiftTypeFilter, setShiftTypeFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showBulkApproveModal, setShowBulkApproveModal] = useState(false);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [showFixedTimeModal, setShowFixedTimeModal] = useState(false);
  const [offsetCreditsByWeek, setOffsetCreditsByWeek] = useState<Record<string, Record<string, number>>>({});
  const [usaHolidays, setUsaHolidays] = useState<HolidayEntry[]>([]);
  const [allHolidays, setAllHolidays] = useState<HolidayEntry[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<AdminLeaveRequest[]>([]);
  const [adjustedByEmail, setAdjustedByEmail] = useState<Map<string, Record<string, number>>>(new Map());

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

  // Adjusted Time per contractor for the selected week — so the main
  // table's "Need Attention" conflict check (rowHasLeaveOverworkConflict)
  // can prefer Adjusted Time over raw Worksnap Time exactly like Attendance
  // Review's own footer status does, instead of only ever seeing raw time
  // and disagreeing with what Attendance Review shows for the same week.
  useEffect(() => {
    if (!rangeFrom || !rangeTo) return;
    let isCancelled = false;
    fetchWithRetry(`/api/attendance/day-status?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`)
      .then((r) => (r.ok ? r.json() : { days: [] }))
      .then((dayStatusResult: { days?: Array<{ email?: string; date?: string; adjustedMinutes?: number | null }> }) => {
        if (isCancelled) return;
        const map = new Map<string, Record<string, number>>();
        for (const d of (dayStatusResult.days ?? [])) {
          const email = String(d.email ?? "").trim().toLowerCase();
          if (!email || d.adjustedMinutes == null) continue;
          const record = map.get(email) ?? {};
          record[String(d.date ?? "")] = d.adjustedMinutes;
          map.set(email, record);
        }
        setAdjustedByEmail(map);
      })
      .catch(() => { if (!isCancelled) setAdjustedByEmail(new Map()); });
    return () => { isCancelled = true; };
  }, [rangeFrom, rangeTo]);

  // Week selector = recent Sun→Sat weeks in Arizona time, anchored to the
  // current week (e.g. Jun 28 – Jul 4). Computed on the client to use the
  // browser's clock without an SSR/hydration mismatch.
  useEffect(() => {
    const list = recentWeeks();
    setWeeks(list);
    setWeek((current) => current || list[0]);
  }, []);

  // Deep link from Time Away Management / Payroll's "Open in Attendance"
  // shortcuts — carries over the week being viewed there, overriding the
  // current-week anchor above once the param is present.
  useEffect(() => {
    const weekParam = searchParams.get("week");
    if (weekParam) setWeek(weekParam);
  }, [searchParams]);

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
          const weekStatusResult = weekStatusResponse.ok ? await weekStatusResponse.json() : { weekStatuses: [], priorOffsetCredits: [] };
          type SavedWeekStatus = {
            worksnapUserId: number; requestStatus: string; completionMinutes: number | null; totalLocalHolidayMinutes: number | null;
            totalEvaluatedRegularMinutes: number | null; totalEvaluatedMinutes: number | null; totalUsHoMinutes: number | null;
            totalRegularOtMinutes: number | null; totalRdOtMinutes: number | null; totalHoOtMinutes: number | null;
            offsetCreditMinutes?: number | null;
            processed?: boolean;
          };
          const savedByUserId = new Map<number, SavedWeekStatus>(
            (weekStatusResult.weekStatuses ?? []).map((s: SavedWeekStatus) => [s.worksnapUserId, s])
          );
          // What each contractor owes back this week: the Time Credit granted on
          // the PRECEDING week, read from the database rather than whatever
          // happened to be left in React state. Keyed by contractorId to match
          // appliedOffsetCreditFor.
          const priorCredits = (weekStatusResult.priorOffsetCredits ?? []) as { worksnapUserId: number; offsetCreditMinutes: number }[];
          if (priorCredits.length) {
            const creditByUserId = new Map(priorCredits.map((c) => [c.worksnapUserId, c.offsetCreditMinutes]));
            const forThisWeek: Record<string, number> = {};
            for (const row of rows) {
              const due = row.worksnapUserId != null ? creditByUserId.get(row.worksnapUserId) : undefined;
              if (due && due > 0) forThisWeek[row.contractorId] = due;
            }
            setOffsetCreditsByWeek((current) => ({ ...current, [weekDates[0]]: forThisWeek }));
          }
          setWorksnapRows(rows.map((row) => {
            const saved = row.worksnapUserId != null ? savedByUserId.get(row.worksnapUserId) : undefined;
            if (!saved) return row;
            // "Processed" (via the Process Attendance action) takes priority
            // over a plain "Reviewed" save — it's cleared back to false by any
            // normal individual/Bulk Approve save, so it only ever reflects
            // whether Process Attendance is the most recent thing to touch it.
            const weeklyStatus: AttendanceRecord["weeklyStatus"] = saved.processed
              ? "Processed"
              : saved.requestStatus === "APPROVED" ? "Reviewed" : row.weeklyStatus;
            return {
              ...row,
              completionMinutes: saved.completionMinutes ?? row.completionMinutes,
              // The Time Credit granted on THIS week, so reopening the review
              // shows it instead of falling back to the raw short total.
              offsetCreditMinutes: saved.offsetCreditMinutes ?? 0,
              totalLocalHolidayMinutes: saved.totalLocalHolidayMinutes,
              totalEvaluatedRegularMinutes: saved.totalEvaluatedRegularMinutes,
              totalEvaluatedMinutes: saved.totalEvaluatedMinutes,
              totalUsHoMinutes: saved.totalUsHoMinutes,
              totalRegularOtMinutes: saved.totalRegularOtMinutes,
              totalRdOtMinutes: saved.totalRdOtMinutes,
              totalHoOtMinutes: saved.totalHoOtMinutes,
              weeklyStatus,
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
    // syncedAt is a Postgres TIMESTAMP *without* time zone holding a UTC wall
    // clock, so PostgREST returns it with no zone designator ("…T15:55:12.345").
    // new Date() would read that as browser-local and the Phoenix conversion
    // would be a no-op, showing the UTC clock. Pin it to UTC before parsing;
    // values that already carry a zone (the sync route's toISOString) pass through.
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso);
    return new Date(hasZone ? iso : `${iso}Z`).toLocaleString("en-US", {
      timeZone: "America/Phoenix", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    }) + " Arizona Time";
  }

  // No mock-data fallback on error: showing fabricated numbers in a payroll
  // table when the live fetch fails would look like real data and could
  // silently drive incorrect approvals. Errors surface via worksnapError
  // instead (banner + Retry), and the table stays empty until a real load
  // succeeds.
  const attendanceRows: AttendanceRow[] = worksnapRows;

  // Deep link from Time Away Management / Payroll's "Open in Attendance"
  // shortcuts — resolves by email (row.role holds it for real contractor
  // rows) since neither of those pages knows this page's own row identity.
  // Waits for attendanceRows (for the requested week, see the week-param
  // effect above) to load before it can find a match.
  useEffect(() => {
    const openEmail = searchParams.get("openEmail");
    if (openEmail && attendanceRows.length > 0 && !reviewTarget) {
      const match = attendanceRows.find((r) => r.role.toLowerCase() === openEmail.toLowerCase());
      if (match) setReviewTarget({ record: match, source: "view" });
      router.replace("/admin/attendance");
    }
  }, [searchParams, attendanceRows, reviewTarget, router]);

  // Keeps the open Attendance Review modal in sync with its week selector:
  // switching weeks from inside the modal changes this page's own `week`
  // state, which reloads attendanceRows for that week — once the new data
  // lands, swap in the matching row so the modal reflects the newly
  // selected week instead of staying frozen on the week it was opened for.
  useEffect(() => {
    if (!reviewTarget) return;
    const match = attendanceRows.find((r) => r.contractorId === reviewTarget.record.contractorId);
    if (match && match !== reviewTarget.record) {
      setReviewTarget((current) => (current ? { ...current, record: match } : current));
    }
  }, [attendanceRows, reviewTarget]);

  const filteredAttendanceRows = attendanceRows.filter((row) => {
    const query = nameSearch.trim().toLowerCase();
    const department = departmentForAttendanceRow(row);
    const payCategory = payCategoryForAttendanceRow(row);
    const matchesName = !query || row.name.toLowerCase().includes(query) || (row.role ?? "").toLowerCase().includes(query);
    const matchesPayCategory = payCategoryFilter === "All" || payCategory === payCategoryFilter;
    const matchesCountry = countryFilter === "All" || row.region === countryFilter;
    const matchesShiftType = shiftTypeFilter === "All" || row.shiftType === shiftTypeFilter;
    const matchesDepartment = departmentFilter === "All" || department === departmentFilter;
    // "Need Attention" isn't a stored weeklyStatus — it's a "Reviewed" row
    // with a genuine leave/overwork conflict (same check as the stats card
    // and the row's own badge). Filtering by "Reviewed" excludes those rows,
    // so the two options stay mutually exclusive, matching the stats cards.
    const rowNeedsAttentionForStatus = row.weeklyStatus === "Reviewed" && rowHasLeaveOverworkConflict(
      row, weekDates, leaveRequests.filter((r) => r.email === (row.role.includes("@") ? row.role : "")),
      adjustedByEmail.get((row.role.includes("@") ? row.role : "").trim().toLowerCase())
    );
    const matchesStatus = statusFilter === "All"
      ? true
      : statusFilter === "Need Attention"
      ? rowNeedsAttentionForStatus
      : statusFilter === "Reviewed"
      ? row.weeklyStatus === "Reviewed" && !rowNeedsAttentionForStatus
      : row.weeklyStatus === statusFilter;

    return matchesName && matchesPayCategory && matchesCountry && matchesShiftType && matchesDepartment && matchesStatus;
  }).sort((a, b) => a.name.localeCompare(b.name));
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
  // A "Reviewed" row is split into "Need Attention" (same genuine leave/
  // overwork conflict Attendance Review itself flags) vs a clean "Reviewed"
  // — mutually exclusive, so neither count double-counts the other.
  const reviewedRows        = filteredAttendanceRows.filter((r) => r.weeklyStatus === "Reviewed");
  const needsAttentionCount = reviewedRows.filter((r) => {
    const email = r.role.includes("@") ? r.role : "";
    return rowHasLeaveOverworkConflict(r, weekDates, leaveRequests.filter((req) => req.email === email), adjustedByEmail.get(email.trim().toLowerCase()));
  }).length;
  const reviewedCount    = reviewedRows.length - needsAttentionCount;
  const processedCount   = filteredAttendanceRows.filter((r) => r.weeklyStatus === "Processed").length;

  const STATS = [
    { label: "Standard Met",      value: perfectStandard, color: "text-emerald-600", iconBg: "bg-teal-50",   iconColor: "text-teal-600",   Icon: LuCircleCheck },
    { label: "For Review",        value: forReviewCount,  color: "text-red-600",    iconBg: "bg-red-50",    iconColor: "text-red-600",    Icon: LuCircleAlert },
    { label: "Need Attention",    value: needsAttentionCount, color: "text-rose-600", iconBg: "bg-rose-50", iconColor: "text-rose-600", Icon: LuCircleAlert },
    { label: "Reviewed", value: reviewedCount,   color: "text-orange-600", iconBg: "bg-orange-50", iconColor: "text-orange-600", Icon: LuClock       },
    { label: "Processed", value: processedCount, color: "text-blue-600",   iconBg: "bg-blue-50",   iconColor: "text-blue-600",   Icon: LuListChecks  },
  ];

  function appliedOffsetCreditFor(row: AttendanceRow) {
    return offsetCreditsByWeek[week]?.[row.contractorId] ?? 0;
  }

  // Single source of truth for the weekly table's derived per-row values. Both
  // the table body and Export read from here, so an exported file can't drift
  // out of agreement with what's on screen.
  function attendanceRowValues(row: AttendanceRow) {
    const isOnLeave = row.weeklyStatus === "On Leave";
    const isStandard = row.weeklyStatus === "Standard Met";
    const isForReview = row.weeklyStatus === "For Review";
    const isReviewed = row.weeklyStatus === "Reviewed";
    const isProcessed = row.weeklyStatus === "Processed";

    const email = row.role.includes("@") ? row.role : "";
    const rowLeaveRequests = leaveRequests.filter((r) => r.email === email);
    // Same conflict check Attendance Review flags per-day and in its own footer
    // status (see ReviewModal) — an approved PTO/Sick Leave on file for a date
    // where more than 240 min (4h) was also logged (Adjusted Time when set,
    // else raw Worksnap Time) — a "Reviewed" row is downgraded to "Need
    // Attention" so the weekly table always agrees with Attendance Review.
    const needsAttention = isReviewed && rowHasLeaveOverworkConflict(
      row, weekDates, rowLeaveRequests, adjustedByEmail.get(email.trim().toLowerCase())
    );

    const appliedOffsetCredit = appliedOffsetCreditFor(row);
    // Both ends of a Time Credit carry the badge: the week it was granted on
    // (persisted as AttendanceWeekStatus.offsetCreditMinutes) and the following
    // week that repays it out of its own Ind Time (appliedOffsetCredit). Either
    // week's figures were moved by the credit, so both say so.
    const grantedCreditMins = row.offsetCreditMinutes ?? 0;
    // Processed outranks it: once a week has been through Process Attendance
    // that is the state worth reporting, same as every other pay category.
    // The credit is still visible in the Review modal's Offset Credit row.
    const isAppliedTimeCredit = isFixedContractor(row.payCategory)
      && !isProcessed
      && (grantedCreditMins > 0 || appliedOffsetCredit > 0);

    const rowDailyMins = row.dailyWorksnapMinutes ?? {};
    const rowRestDays = restDaysForAttendanceRow(row);
    const holidayBonusMins = weekDates.reduce(
      (sum, date) => sum + timeValueToMinutes(holidayTimeFor(date, usaHolidays, rowDailyMins, rowRestDays, weekDates, row.hireDate, row.region, allHolidays)),
      0
    );
    const computedCompletionMins = computeWeeklyCompletionMinutes(row, weekDates);
    // Fixed-Ind's local-holiday credit is a flat standard day per matching
    // holiday (see localHolidayMinutesFor), so it needs no daily logs — which is
    // why this table can compute it without the per-contractor log fetch the
    // Review modal does. Hourly contractors' local-holiday minutes depend on
    // logged overlap and stay with the modal.
    const localHolidayBonusMins = isFixedContractor(row.payCategory)
      ? weekDates.reduce((sum, date) => sum + (localHolidayMinutesFor(date, [], row.region, allHolidays, true) ?? 0), 0)
      : 0;
    const completionMins = row.completionMinutes ?? (
      isFixedContractor(row.payCategory)
        // computeWeeklyCompletionMinutes returns the raw Ind Time; the Net Time
        // rule (repay, then cap at 2,400 over the whole figure, both holiday
        // credits included) is applied here — see fixedIndNetMinutes.
        ? fixedIndNetMinutes(computedCompletionMins + holidayBonusMins + localHolidayBonusMins, appliedOffsetCredit)
        : computedCompletionMins + holidayBonusMins
    );

    // Only one weeklyStatus is ever set, so this ordering just picks whichever
    // badge the Status cell would render.
    const statusLabel = isAppliedTimeCredit ? "Applied Credits"
      : isStandard ? "Standard Met"
      : isForReview ? "For Review"
      : isOnLeave ? "On Leave"
      : isReviewed ? (needsAttention ? "Need Attention" : "Reviewed")
      : isProcessed ? "Processed"
      : "";

    return {
      email,
      variance: row.actualMinutes - row.standardMinutes,
      isOnLeave, isStandard, isForReview, isReviewed, isProcessed,
      needsAttention, appliedOffsetCredit, isAppliedTimeCredit,
      holidayBonusMins, completionMins, statusLabel,
      timeAwayMinutes: email ? totalTimeOffRequestMinutesFor(weekDates, rowLeaveRequests) : 0,
      missingContractorProfile: row.hasContractorProfile === false,
    };
  }

  // Exports the weekly table as CSV: the same visible columns and the same
  // rows the table is currently showing, so search/filter selections carry
  // through. Cells the table renders as a dash export blank rather than 0, so
  // "nothing logged" stays distinguishable from a real zero in a spreadsheet.
  function handleExport() {
    if (filteredAttendanceRows.length === 0) return;

    const headers = [
      "Week", "Contractor", "Email", "Assigned Team", "Actual Time (mins)",
      "Total Evaluated Regular Time (mins)", "Total Regular OT Time (mins)", "Total RD OT Time (mins)",
      "Total Evaluated Time (mins)", "Total US HO Time (mins)", "Total HO OT Time (mins)",
      "Total Local HO Time (mins)", "Total Time Away Request Time (mins)", "Ind Time (mins)",
      "Variance (mins)", "Status",
    ];

    const weekRange = `${rangeFrom} to ${rangeTo}`;
    const dashed = (minutes: number | null | undefined, blank: boolean) =>
      blank || !minutes ? "" : String(minutes);

    const dataRows = filteredAttendanceRows.map((row) => {
      const v = attendanceRowValues(row);
      return [
        weekRange,
        row.name,
        v.email,
        departmentForAttendanceRow(row),
        v.isOnLeave ? "" : String(row.actualMinutes),
        dashed(row.totalEvaluatedRegularMinutes, v.isOnLeave),
        dashed(row.totalRegularOtMinutes, v.isOnLeave),
        dashed(row.totalRdOtMinutes, v.isOnLeave),
        dashed(row.totalEvaluatedMinutes, v.isOnLeave),
        dashed(row.totalUsHoMinutes, v.isOnLeave),
        dashed(row.totalHoOtMinutes, v.isOnLeave),
        dashed(row.totalLocalHolidayMinutes, v.isOnLeave),
        dashed(v.timeAwayMinutes, v.isOnLeave),
        dashed(v.completionMins, v.isOnLeave),
        // The table blanks Variance for every status except For Review.
        v.isOnLeave || v.isStandard || v.isReviewed || v.isProcessed ? ""
          : v.variance > 0 ? `+${v.variance}` : String(v.variance),
        v.statusLabel,
      ];
    });

    const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    // Leading BOM — without it, Excel misreads the UTF-8 file as its default
    // codepage and garbles anything beyond plain ASCII (accented names, etc.).
    const csv = String.fromCharCode(0xFEFF) +
      [headers, ...dataRows].map((cells) => cells.map((c) => csvCell(String(c))).join(",")).join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-${rangeFrom}-to-${rangeTo}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    toast.success(`Exported ${dataRows.length} row${dataRows.length === 1 ? "" : "s"} for ${formatRangeLabel(rangeFrom, rangeTo)}.`);
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
    <div className="p-4 sm:p-6 md:p-8 max-w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 mb-3 md:mb-4">
        <div className="flex items-center gap-3">
          <div className="hidden sm:grid size-9 shrink-0 place-items-center rounded-xl bg-[#003527] text-white shadow-sm">
            <LuFingerprint size={18} strokeWidth={2} />
          </div>
          <div>
            <h2 className={`text-lg md:text-xl font-bold tracking-tight ${dark ? "text-white" : "text-[#003527]"}`}>Attendance Management</h2>
            <p className={`text-xs md:text-sm mt-0.5 ${dark ? "text-white/60" : "text-slate-600"}`}>
              Weekly Time Tracking Review (Standard: 2,700 min/week)
              <span className={dark ? "text-red-400/70" : "text-red-500/70"}> · Sync at: </span>
              <span className={`font-semibold tabular-nums ${dark ? "text-red-400" : "text-red-600"}`}>{syncing ? "syncing…" : formatArizona(lastSyncedAt)}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              onClick={() => setShowFixedTimeModal(true)}
              className="flex items-center justify-center gap-1.5 w-28 sm:w-36 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-all shadow-sm"
            >
              <LuTimer size={14} strokeWidth={2} />
              Fixed Time
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center justify-center gap-1.5 w-28 sm:w-36 py-1.5 bg-[#003527] hover:bg-[#064E3B] text-white rounded-lg text-xs font-semibold transition-all shadow-md disabled:opacity-50"
            >
              <LuRefreshCw size={14} strokeWidth={2} className={syncing ? "animate-spin" : ""} />
              <span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync All Data"}</span>
              <span className="sm:hidden">{syncing ? "…" : "Sync"}</span>
            </button>
            <button
              onClick={() => setShowBulkApproveModal(true)}
              disabled={!isSelectedWeekEnded}
              title={!isSelectedWeekEnded ? "Bulk Approve is only available once the selected week has ended" : undefined}
              className="flex items-center justify-center gap-1.5 w-28 sm:w-36 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-600"
            >
              <LuCircleCheck size={14} strokeWidth={2} />
              <span className="hidden sm:inline">Bulk Approve</span>
              <span className="sm:hidden">Approve</span>
            </button>
            <button
              onClick={() => setShowProcessModal(true)}
              disabled={!isSelectedWeekEnded}
              title={!isSelectedWeekEnded ? "Process Attendance is only available once the selected week has ended" : undefined}
              className="flex items-center justify-center gap-1.5 w-28 sm:w-36 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
            >
              <LuListChecks size={14} strokeWidth={2} />
              Process
            </button>
            <button
              onClick={handleExport}
              disabled={filteredAttendanceRows.length === 0}
              title={filteredAttendanceRows.length === 0 ? "Nothing to export for the selected week and filters" : `Export the ${filteredAttendanceRows.length} row(s) currently shown to CSV`}
              className={`flex items-center justify-center gap-1.5 w-28 sm:w-36 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${dark ? "bg-white/8 border-white/15 text-white/80 hover:bg-white/15 disabled:hover:bg-white/8" : "bg-white border-slate-200 text-[#003527] hover:bg-slate-50 disabled:hover:bg-white"}`}
            >
              <LuFileText size={14} />Export
            </button>
          </div>
          <p className={`text-xs ${dark ? "text-white/30" : "text-slate-400"}`}>Last updated: <span className={`font-semibold ${dark ? "text-white/50" : "text-slate-500"}`}>{syncing ? "syncing…" : formatArizona(lastSyncedAt)}</span></p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 md:gap-4 mb-3 md:mb-4">
        {STATS.map(({ label, value, color, iconBg, iconColor, Icon }) => (
          <div key={label} className={`p-2.5 rounded-xl border shadow-sm hover:shadow-md transition-all flex items-center gap-2.5 ${dark ? "bg-[#1c2320] border-white/10 hover:border-white/20" : "bg-white border-slate-200 hover:border-slate-300"}`}>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${dark ? "bg-white/8 text-white/60" : `${iconBg} ${iconColor}`}`}><Icon size={14} strokeWidth={1.75} /></div>
            <div><p className={`text-[10px] font-bold uppercase tracking-wider ${dark ? "text-white/40" : "text-slate-500"}`}>{label}</p><p className={`text-xl font-bold leading-tight tabular-nums ${dark ? "text-white/90" : color}`}>{value}</p></div>
          </div>
        ))}
      </div>

      <div className={`rounded-xl border overflow-hidden ${dark ? "bg-[#1c2320] border-white/10" : "bg-white border-slate-200"}`}>
        {/* Table header toolbar */}
        <div className={`px-4 md:px-6 py-3 border-b flex flex-col gap-3 ${dark ? "bg-[#1c2320] border-white/10" : "bg-linear-to-b from-slate-50/80 to-white border-slate-100"}`}>
          {/* Row 1: title + week selector */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h3 className={`text-lg md:text-xl font-bold tracking-tight ${dark ? "text-white" : "text-[#003527]"}`}>Weekly Time Tracking</h3>
              <p className={`mt-0.5 text-xs font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>
                Summed from Worksnap entries · <span className={`font-semibold ${dark ? "text-white/60" : "text-slate-600"}`}>{formatRangeLabel(rangeFrom, rangeTo)}</span>
              </p>
              {isLoadingWorksnap && (
                <p className={`mt-1 inline-flex items-center gap-1.5 text-xs font-medium ${dark ? "text-teal-400" : "text-teal-600"}`}>
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
            <div className={`flex items-center gap-1.5 rounded-xl border p-1.5 shadow-sm w-full md:w-auto overflow-x-auto ${dark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
              <div className="flex gap-1">
                {weeks.slice(0, 4).map((w) => (
                  <button key={w} onClick={() => setWeek(w)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-all ${week === w ? "bg-[#003527] text-white shadow-sm" : dark ? "text-white/50 hover:text-white hover:bg-white/10" : "text-slate-500 hover:text-[#003527] hover:bg-slate-100"}`}>{weekLabel(w)}</button>
                ))}
              </div>
              <div className={`h-6 w-px mx-0.5 shrink-0 ${dark ? "bg-white/15" : "bg-slate-200"}`} />
              <div className="relative shrink-0">
                <button ref={weekJumpButtonRef} onClick={() => setShowRangePicker((v) => !v)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${showRangePicker ? (dark ? "text-teal-300 bg-white/10" : "text-teal-700 bg-teal-50") : dark ? "text-white/60 hover:text-white hover:bg-white/10" : "text-slate-600 hover:text-teal-700 hover:bg-teal-50"}`}>
                  <LuCalendar size={15} strokeWidth={2} /><span className="text-xs font-bold">Jump to Week</span>
                </button>
                {showRangePicker && <WeekJumpDropdown anchorRef={weekJumpButtonRef} onApply={(d) => setWeek(sundayOf(d))} onClose={() => setShowRangePicker(false)} />}
              </div>
              <div className={`h-6 w-px mx-0.5 shrink-0 ${dark ? "bg-white/15" : "bg-slate-200"}`} />
              <select
                value={week}
                onChange={(e) => setWeek(e.target.value)}
                title="Select any week from the last few months, including previous months"
                className={`h-8 shrink-0 rounded-lg border px-2 text-xs font-bold outline-none focus:ring-2 focus:ring-teal-500 ${dark ? "bg-white/5 border-white/10 text-white/70" : "bg-white border-slate-200 text-slate-600"}`}
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
                className={`h-10 w-full rounded-lg border pl-9 pr-8 text-sm outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 ${dark ? "bg-white/5 border-white/10 text-white placeholder:text-white/30 hover:border-white/20" : "bg-white border-slate-200 text-slate-800 hover:border-slate-300"}`}
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

            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-48" value={payCategoryFilter} onChange={setPayCategoryFilter} label="Filter by pay category">
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
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-40" value={departmentFilter} onChange={setDepartmentFilter} label="Filter by assigned team">
              <option value="All">All Assigned Teams</option>
              {departmentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </FilterSelect>
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-40" value={statusFilter} onChange={setStatusFilter} label="Filter by status">
              <option value="All">All Statuses</option>
              <option value="For Review">For Review</option>
              <option value="Need Attention">Need Attention</option>
              <option value="Reviewed">Reviewed</option>
              <option value="Standard Met">Standard Met</option>
              <option value="Processed">Processed</option>
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
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${dark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-600"}`}>
                <span className={`font-bold ${dark ? "text-white" : "text-[#003527]"}`}>{filteredAttendanceRows.length}</span> shown
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
                  "Contractor", "Assigned Team", "Actual Time",
                  "Total Evaluated Regular Time", "Total Regular OT Time", "Total RD OT Time", "Total Evaluated Time", "Total US HO Time", "Total HO OT Time",
                  "Total Local HO Time", "Total Time Away Request Time", "Ind Time",
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
                  <td colSpan={15} className={`px-6 py-10 text-center text-sm font-medium ${dark ? "text-white/35" : "text-slate-500"}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <LuRefreshCw size={14} className="animate-spin" /> Loading attendance data…
                    </span>
                  </td>
                </tr>
              )}
              {!isLoadingWorksnap && filteredAttendanceRows.length === 0 && (
                <tr>
                  <td colSpan={15} className={`px-6 py-10 text-center text-sm font-medium ${dark ? "text-white/35" : "text-slate-500"}`}>
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
                // Shared with Export (see attendanceRowValues) so the CSV and
                // the table can never disagree.
                const {
                  variance, isOnLeave, isStandard, isForReview, isReviewed, isProcessed,
                  needsAttention, isAppliedTimeCredit, appliedOffsetCredit, holidayBonusMins, completionMins,
                  timeAwayMinutes, missingContractorProfile,
                } = attendanceRowValues(row);
                return (
                  <tr
                    key={row.contractorId}
                    className={`transition-colors group ${missingContractorProfile ? "bg-red-50 hover:bg-red-100" : dark ? "hover:bg-white/5" : "hover:bg-slate-50/80"}`}
                  >
                    {/* Contractor */}
                    <td
                      title={missingContractorProfile ? "Not yet added in Contractor Details" : undefined}
                      className={`px-4 md:px-6 py-3 md:py-4 sticky left-0 z-10 border-r border-b overflow-hidden ${
                        missingContractorProfile ? "bg-red-50 group-hover:bg-red-100 border-red-200" : dark ? "bg-[#1c2320] group-hover:bg-[#222e27] border-white/10" : "bg-white group-hover:bg-slate-50 border-slate-200"
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
                            className={`text-sm font-semibold whitespace-nowrap hover:underline text-left ${dark ? "text-white/90 hover:text-emerald-300" : "text-slate-900 hover:text-emerald-700"}`}
                          >
                            {row.name}
                          </button>
                          <p className={`text-xs whitespace-nowrap ${dark ? "text-white/40" : "text-slate-500"}`}>{row.role}</p>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className={`px-4 md:px-6 py-3 md:py-4 text-sm font-medium whitespace-nowrap border-r border-b ${dark ? "text-white/55 border-white/8" : "text-slate-600 border-slate-100"}`}>
                      {departmentForAttendanceRow(row)}
                    </td>

                    {/* Actual */}
                    <td className={`px-4 md:px-6 py-3 md:py-4 border-r border-b ${dark ? "border-white/8" : "border-slate-100"}`}>
                      {isOnLeave ? (
                        <span className={`text-sm ${dark ? "text-white/30" : "text-slate-400"}`}>—</span>
                      ) : (
                        <span className={`text-sm font-bold ${isForReview ? "text-red-500" : dark ? "text-white/85" : "text-slate-900"}`}>
                          {row.actualMinutes.toLocaleString()}
                        </span>
                      )}
                    </td>

                    {/* Total Evaluated Regular Time */}
                    <td className={`px-4 md:px-6 py-3 md:py-4 border-r border-b ${dark ? "border-white/8" : "border-slate-100"}`}>
                      {isOnLeave || !row.totalEvaluatedRegularMinutes ? (
                        <span className={`text-sm ${dark ? "text-white/30" : "text-slate-400"}`}>—</span>
                      ) : (
                        <span className={`text-sm font-semibold ${dark ? "text-white/80" : "text-slate-900"}`}>{formatMinutesAsMins(row.totalEvaluatedRegularMinutes)}</span>
                      )}
                    </td>

                    {/* Total Regular OT Time */}
                    <td className={`px-4 md:px-6 py-3 md:py-4 border-r border-b ${dark ? "border-white/8" : "border-slate-100"}`}>
                      {isOnLeave || !row.totalRegularOtMinutes ? (
                        <span className={`text-sm ${dark ? "text-white/30" : "text-slate-400"}`}>—</span>
                      ) : (
                        <span className={`text-sm font-semibold ${dark ? "text-white/80" : "text-slate-900"}`}>{formatMinutesAsMins(row.totalRegularOtMinutes)}</span>
                      )}
                    </td>

                    {/* Total RD OT Time */}
                    <td className={`px-4 md:px-6 py-3 md:py-4 border-r border-b ${dark ? "border-white/8" : "border-slate-100"}`}>
                      {isOnLeave || !row.totalRdOtMinutes ? (
                        <span className={`text-sm ${dark ? "text-white/30" : "text-slate-400"}`}>—</span>
                      ) : (
                        <span className={`text-sm font-semibold ${dark ? "text-white/80" : "text-slate-900"}`}>{formatMinutesAsMins(row.totalRdOtMinutes)}</span>
                      )}
                    </td>

                    {/* Total Evaluated Time */}
                    <td className={`px-4 md:px-6 py-3 md:py-4 border-r border-b ${dark ? "border-white/8" : "border-slate-100"}`}>
                      {isOnLeave || !row.totalEvaluatedMinutes ? (
                        <span className={`text-sm ${dark ? "text-white/30" : "text-slate-400"}`}>—</span>
                      ) : (
                        <span className={`text-sm font-semibold ${dark ? "text-white/80" : "text-slate-900"}`}>{formatMinutesAsMins(row.totalEvaluatedMinutes)}</span>
                      )}
                    </td>

                    {/* Total US HO Time */}
                    <td className={`px-4 md:px-6 py-3 md:py-4 border-r border-b ${dark ? "border-white/8" : "border-slate-100"}`}>
                      {isOnLeave || !row.totalUsHoMinutes ? (
                        <span className={`text-sm ${dark ? "text-white/30" : "text-slate-400"}`}>—</span>
                      ) : (
                        <span className={`text-sm font-semibold ${dark ? "text-white/80" : "text-slate-900"}`}>{formatMinutesAsMins(row.totalUsHoMinutes)}</span>
                      )}
                    </td>

                    {/* Total HO OT Time */}
                    <td className={`px-4 md:px-6 py-3 md:py-4 border-r border-b ${dark ? "border-white/8" : "border-slate-100"}`}>
                      {isOnLeave || !row.totalHoOtMinutes ? (
                        <span className={`text-sm ${dark ? "text-white/30" : "text-slate-400"}`}>—</span>
                      ) : (
                        <span className={`text-sm font-semibold ${dark ? "text-white/80" : "text-slate-900"}`}>{formatMinutesAsMins(row.totalHoOtMinutes)}</span>
                      )}
                    </td>

                    {/* Total Local HO Time */}
                    <td className={`px-4 md:px-6 py-3 md:py-4 border-r border-b ${dark ? "border-white/8" : "border-slate-100"}`}>
                      {isOnLeave || !row.totalLocalHolidayMinutes ? (
                        <span className={`text-sm ${dark ? "text-white/30" : "text-slate-400"}`}>—</span>
                      ) : (
                        <span className={`text-sm font-semibold ${dark ? "text-white/80" : "text-slate-900"}`}>{formatMinutesAsMins(row.totalLocalHolidayMinutes)}</span>
                      )}
                    </td>

                    {/* Total Time Away Request Time */}
                    <td className={`px-4 md:px-6 py-3 md:py-4 border-r border-b ${dark ? "border-white/8" : "border-slate-100"}`}>
                      {isOnLeave || timeAwayMinutes === 0 ? (
                        <span className={`text-sm ${dark ? "text-white/30" : "text-slate-400"}`}>—</span>
                      ) : (
                        <span className={`text-sm font-semibold ${dark ? "text-white/80" : "text-slate-900"}`}>{formatMinutesAsMins(timeAwayMinutes)}</span>
                      )}
                    </td>

                    {/* Ind Time */}
                    <td className={`px-4 md:px-6 py-3 md:py-4 border-r border-b ${dark ? "border-white/8" : "border-slate-100"}`}>
                      {isOnLeave ? (
                        <span className={`text-sm ${dark ? "text-white/30" : "text-slate-400"}`}>—</span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <span className={`text-sm font-semibold ${completionMins > 0 && completionMins < 2400 ? "text-red-500" : dark ? "text-white/80" : "text-slate-900"}`}>
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
                    <td className={`px-4 md:px-6 py-3 md:py-4 border-r border-b ${dark ? "border-white/8" : "border-slate-100"}`}>
                      {isOnLeave || isStandard || isReviewed || isProcessed ? (
                        <span className={`text-sm ${dark ? "text-white/25" : "text-slate-400"}`}>--</span>
                      ) : (
                        <span className="text-sm font-medium text-red-500">
                          {variance > 0 ? `+${variance}` : variance}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td
                      className={`px-4 md:px-6 py-3 md:py-4 text-center sticky right-[175px] z-10 border-l border-b overflow-hidden ${
                        missingContractorProfile ? "bg-red-50 group-hover:bg-red-100 border-red-200" : dark ? "bg-[#1c2320] group-hover:bg-[#222e27] border-white/10" : "bg-white group-hover:bg-slate-50 border-slate-200"
                      }`}
                      style={{ minWidth: 170, width: 170, maxWidth: 170 }}
                    >
                      {isAppliedTimeCredit ? (
                        <span
                          title={(row.offsetCreditMinutes ?? 0) > 0
                            ? `${row.offsetCreditMinutes} min of Time Credit applied to this week — repaid out of the following week's Ind Time`
                            : `${appliedOffsetCredit} min of Time Credit from the previous week repaid out of this week's Ind Time`}
                          className="px-2 py-1 bg-red-100 text-red-700 rounded-md text-[11px] font-bold uppercase"
                        >
                          Applied Credits
                        </span>
                      ) : (
                        <>
                          {isStandard && (
                            <span className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase ${dark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700"}`}>
                              Standard Met
                            </span>
                          )}
                          {isForReview && (
                            <span className="flex items-center justify-center gap-1 text-red-500">
                              <LuCircleAlert size={15} strokeWidth={2} className={dark ? "" : "fill-red-100"} />
                              <span className="text-[11px] font-bold uppercase">For Review</span>
                            </span>
                          )}
                          {isOnLeave && (
                            <span className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase ${dark ? "bg-blue-500/20 text-blue-300" : "bg-blue-100 text-blue-700"}`}>
                              On Leave
                            </span>
                          )}
                          {isReviewed && (
                            needsAttention ? (
                              <span className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold uppercase ${dark ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-700"}`}>
                                <LuCircleAlert size={12} strokeWidth={2} />
                                Need Attention
                              </span>
                            ) : (
                              <span className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase ${dark ? "bg-orange-500/20 text-orange-300" : "bg-orange-100 text-orange-600"}`}>
                                Reviewed
                              </span>
                            )
                          )}
                          {isProcessed && (
                            <span className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase ${dark ? "bg-blue-500/20 text-blue-300" : "bg-blue-100 text-blue-700"}`}>
                              Processed
                            </span>
                          )}
                        </>
                      )}
                    </td>

                    {/* Actions */}
                    <td
                      className={`px-4 md:px-6 py-3 md:py-4 text-center sticky right-0 z-10 border-l border-b overflow-hidden ${
                        missingContractorProfile ? "bg-red-50 group-hover:bg-red-100 border-red-200" : dark ? "bg-[#1c2320] group-hover:bg-[#222e27] border-white/10" : "bg-white group-hover:bg-slate-50 border-slate-200"
                      }`}
                      style={{ minWidth: 175, width: 175, maxWidth: 175 }}
                    >
                      {(isStandard || isReviewed || isProcessed) && (
                        <button
                          onClick={() => setReviewTarget({ record: row, source: "view" })}
                          className={`transition-all ${dark ? "text-white/30 hover:text-white" : "text-slate-400 hover:text-[#003527]"}`}
                          title="View attendance review"
                        >
                          <LuEye size={20} strokeWidth={1.75} />
                        </button>
                      )}
                      {isOnLeave && (
                        <button
                          onClick={() => setReviewTarget({ record: row, source: "view" })}
                          className={`transition-all ${dark ? "text-white/30 hover:text-white" : "text-slate-400 hover:text-[#003527]"}`}
                          title="View attendance review"
                        >
                          <LuEye size={20} strokeWidth={1.75} />
                        </button>
                      )}
                      {isForReview && (
                        <div className="flex justify-center gap-2">
                          <button className={`p-1.5 rounded-lg transition-all ${dark ? "text-white/30 hover:text-white hover:bg-white/10" : "text-slate-400 hover:text-[#003527] hover:bg-slate-100"}`} title="Message Contractor">
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

        <div className={`p-4 flex justify-center border-t ${dark ? "bg-white/3 border-white/10" : "bg-slate-50 border-slate-100"}`}>
          <button className={`text-xs font-bold hover:underline ${dark ? "text-white/50" : "text-[#003527]"}`}>
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
          weeks={weeks}
          week={week}
          onSelectWeek={setWeek}
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
          repaymentFor={appliedOffsetCreditFor}
        />
      )}

      {/* Process Attendance Modal */}
      {showProcessModal && (
        <ProcessAttendanceModal
          rows={filteredAttendanceRows}
          allLeaveRequests={leaveRequests}
          usaHolidays={usaHolidays}
          allHolidays={allHolidays}
          week={week}
          repaymentFor={appliedOffsetCreditFor}
          onClose={() => setShowProcessModal(false)}
          onProcessed={handleBulkApprove}
        />
      )}

      {/* Fixed Time Modal */}
      {showFixedTimeModal && (
        <FixedTimeModal week={rangeFrom} onClose={() => setShowFixedTimeModal(false)} />
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
