"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useState, useEffect, useRef } from "react";
import { LuCircleCheck, LuCircleAlert, LuClock, LuFileText, LuRefreshCw, LuEye, LuMessageSquare, LuPencil, LuX, LuCalendar, LuSearch, LuChevronDown, LuChartColumn } from "react-icons/lu";
import { ATTENDANCE, CONTRACTORS, TIME_OFF, type AttendanceRecord } from "@/lib/data";

const WEEKS = [
  { label: "Week 26 (Jun 21 - 27)", key: "w26", from: "2026-06-21", to: "2026-06-27" },
  { label: "Week 25 (Jun 14 - 20)", key: "w25", from: "2026-06-14", to: "2026-06-20" },
  { label: "Week 24 (Jun 7 - 13)",  key: "w24", from: "2026-06-07", to: "2026-06-13" },
  { label: "Week 23 (May 31 - Jun 6)", key: "w23", from: "2026-05-31", to: "2026-06-06" },
  { label: "Week 22 (May 24 - 30)", key: "w22", from: "2026-05-24", to: "2026-05-30" },
  { label: "Week 21 (May 17 - 23)", key: "w21", from: "2026-05-17", to: "2026-05-23" },
  { label: "Week 20 (May 10 - 16)", key: "w20", from: "2026-05-10", to: "2026-05-16" },
  { label: "Week 19 (May 3 - 9)",   key: "w19", from: "2026-05-03", to: "2026-05-09" },
];


function parseIsoDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  const current = parseIsoDate(from);
  const end = parseIsoDate(to);

  while (current <= end) {
    dates.push(toIsoDate(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function addDaysIso(iso: string, days: number) {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

// Snap any date to the Sunday that starts its week.
function sundayOf(iso: string) {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() - d.getDay());
  return toIsoDate(d);
}

// Today's calendar date in Arizona (America/Phoenix, no DST), as YYYY-MM-DD.
function arizonaTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

// The most recent N weeks (Sun→Sat), most-recent first, anchored to the
// current Arizona week. e.g. on 2026-07-01 → ["2026-06-28", "2026-06-21", …].
function recentWeeks(count = 12): string[] {
  const currentSunday = sundayOf(arizonaTodayIso());
  return Array.from({ length: count }, (_, i) => addDaysIso(currentSunday, -7 * i));
}


function formatDayLabel(date: string) {
  return parseIsoDate(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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
};

const TIME_OFF_STATUS_OPTIONS = [
  "No Time Off",
  "PTO",
  "Sick Leave",
  "PTO Half Day",
  "Sick Leave Half Day",
  "Unpaid Leave",
];

const EMPTY_DAILY_WORKSNAP_MINUTES: Record<string, number> = {};

// UI status strings ↔ the enum values stored on attendance_day_status / attendance_week_status.
const TIME_OFF_API_BY_UI: Record<string, string> = {
  "No Time Off": "NOT_SET",
  "PTO": "PTO",
  "Sick Leave": "SICK_LEAVE",
  "PTO Half Day": "PTO_HALF_DAY",
  "Sick Leave Half Day": "SICK_LEAVE_HALF_DAY",
  "Unpaid Leave": "UNPAID_LEAVE",
};
const TIME_OFF_UI_BY_API: Record<string, string> = Object.fromEntries(
  Object.entries(TIME_OFF_API_BY_UI).map(([ui, api]) => [api, ui])
);
function timeOffStatusToApi(uiStatus: string) {
  return TIME_OFF_API_BY_UI[uiStatus] ?? "NOT_SET";
}
function timeOffStatusFromApi(apiStatus: string) {
  return TIME_OFF_UI_BY_API[apiStatus] ?? "No Time Off";
}

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

function defaultTimeOffStatusFor(record: AttendanceRecord) {
  const request = TIME_OFF.find((item) =>
    item.name === record.name &&
    record.date >= item.from &&
    record.date <= item.to
  );

  if (!request) return record.status === "On Leave" ? "PTO" : "No Time Off";
  if (request.type === "Sick Leave") return "Sick Leave";
  if (request.type === "Unpaid Leave") return "Unpaid Leave";
  return "PTO";
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

function evaluatedTimeFor(worksnapTime: string, attendanceStatus = "No Status", restDay = false, shiftType?: string) {
  const worksnapMinutes = timeValueToMinutes(worksnapTime);
  if (!worksnapMinutes) return "-";

  if (restDay) return attendanceStatus === "Approved" ? formatMinutesAsMins(worksnapMinutes) : "-";

  const approved = attendanceStatus === "Approved";

  if (isFlexibleShift(shiftType)) {
    if (worksnapMinutes > 540) return approved ? formatMinutesAsMins(worksnapMinutes) : formatMinutesAsMins(540);
    return formatMinutesAsMins(worksnapMinutes);
  }

  if (worksnapMinutes < 480) return approved ? formatMinutesAsMins(480) : formatMinutesAsMins(worksnapMinutes);
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

function defaultDailyTimeOffStatuses(weekDates: string[], status: string) {
  return weekDates.reduce<Record<string, string>>((statuses, date) => {
    statuses[date] = status;
    return statuses;
  }, {});
}

function timeOffTimeFor(timeOffStatus: string) {
  if (timeOffStatus === "PTO" || timeOffStatus === "Sick Leave") return "480 mins";
  if (timeOffStatus === "Sick Leave Half Day" || timeOffStatus === "PTO Half Day") return "240 mins";
  if (timeOffStatus === "Unpaid Leave") return "0 mins";
  return "-";
}

function completionTimeFor(evaluatedTime: string, adjustedTime: string, timeOffTime: string, holidayTime = "-") {
  const evaluatedMinutes = timeValueToMinutes(evaluatedTime);
  const timeOffMinutes = timeValueToMinutes(timeOffTime);
  const holidayMinutes = timeValueToMinutes(holidayTime);
  const adjustedMinutes = timeValueToMinutes(adjustedTime);
  // Only treat adjustedTime as a manual override when it resolves to a positive value.
  // A value of "" or "-" means no override has been set (the latter is the auto-populated
  // default for days with no Worksnap time), so the formula is used in those cases.
  if (adjustedMinutes > 0) return formatMinutesAsMins(adjustedMinutes);
  return formatMinutesAsMins(evaluatedMinutes + timeOffMinutes + holidayMinutes);
}

type HolidayEntry = { date: string; country: string; name: string };

function holidayTimeFor(
  date: string,
  usaHolidays: HolidayEntry[],
  dailyWorksnapMinutes: Record<string, number> = {},
  restDaysStr = "",
  weekDates: string[] = []
) {
  if (!usaHolidays.some((h) => h.date === date)) return "-";
  if (isRestDayDate(date, restDaysStr)) return "-";
  // All other working days in the week must have login time
  const otherWorkingDays = weekDates.filter(
    (d) => d !== date && !isRestDayDate(d, restDaysStr) && !usaHolidays.some((h) => h.date === d)
  );
  if (otherWorkingDays.some((d) => (dailyWorksnapMinutes[d] ?? 0) === 0)) return "-";
  return "480 mins";
}




function worksnapTotalMinutesFor(weekDates: string[], dailyWorksnapMinutes: Record<string, number>) {
  return weekDates.reduce((total, date) => total + timeValueToMinutes(worksnapTimeForDate(dailyWorksnapMinutes, date)), 0);
}

function computeWeeklyCompletionMinutes(row: AttendanceRow, weekDates: string[]) {
  const dailyWorksnapMinutes = row.dailyWorksnapMinutes ?? {};

  if (isFixedContractor(row.payCategory)) {
    const total = weekDates.reduce((sum, date) => sum + (dailyWorksnapMinutes[date] ?? 0), 0);
    return Math.min(total, 2400);
  }

  const restDaysStr = restDaysForAttendanceRow(row);
  const shiftType = shiftTypeForAttendanceRow(row);
  return weekDates.reduce((total, date) => {
    const worksnapTime = worksnapTimeForDate(dailyWorksnapMinutes, date);
    const isRestDay = isRestDayDate(date, restDaysStr);
    const evaluatedTime = evaluatedTimeFor(worksnapTime, "No Status", isRestDay, shiftType);

    const timeOffRequest = TIME_OFF.find((item) =>
      item.name === row.name && date >= item.from && date <= item.to
    );
    let timeOffStatus = "No Time Off";
    if (timeOffRequest) {
      if (timeOffRequest.type === "Sick Leave") timeOffStatus = "Sick Leave";
      else if (timeOffRequest.type === "Unpaid Leave") timeOffStatus = "Unpaid Leave";
      else timeOffStatus = "PTO";
    }

    const timeOffTime = timeOffTimeFor(timeOffStatus);
    return total + timeValueToMinutes(completionTimeFor(evaluatedTime, "", timeOffTime));
  }, 0);
}

function computeApprovedCompletionMinutes(row: AttendanceRow, weekDates: string[]) {
  const dailyWorksnapMinutes = row.dailyWorksnapMinutes ?? {};

  if (isFixedContractor(row.payCategory)) {
    const total = weekDates.reduce((sum, date) => sum + (dailyWorksnapMinutes[date] ?? 0), 0);
    return Math.min(total, 2400);
  }

  const restDaysStr = restDaysForAttendanceRow(row);
  const shiftType = shiftTypeForAttendanceRow(row);
  return weekDates.reduce((total, date) => {
    const worksnapTime = worksnapTimeForDate(dailyWorksnapMinutes, date);
    if (worksnapTime === "-") return total;

    const isRestDay = isRestDayDate(date, restDaysStr);
    const evaluatedTime = evaluatedTimeFor(worksnapTime, "Approved", isRestDay, shiftType);

    const timeOffRequest = TIME_OFF.find((item) =>
      item.name === row.name && date >= item.from && date <= item.to
    );
    let timeOffStatus = "No Time Off";
    if (timeOffRequest) {
      if (timeOffRequest.type === "Sick Leave") timeOffStatus = "Sick Leave";
      else if (timeOffRequest.type === "Unpaid Leave") timeOffStatus = "Unpaid Leave";
      else timeOffStatus = "PTO";
    }

    const timeOffTime = timeOffTimeFor(timeOffStatus);
    return total + timeValueToMinutes(completionTimeFor(evaluatedTime, "", timeOffTime));
  }, 0);
}

// Per-day attendance_day_status snapshot for a Bulk Approve save: every logged
// day is Approved (no per-day reject/override in this flow), time off comes
// from the row's default status, mirroring what the Review modal would save.
function buildBulkApproveDaySnapshots(row: AttendanceRow, weekDates: string[], usaHolidays: HolidayEntry[]) {
  const dailyWorksnapMinutes = row.dailyWorksnapMinutes ?? {};
  const restDaysStr = restDaysForAttendanceRow(row);
  const shiftType = shiftTypeForAttendanceRow(row);
  const timeOffStatusUi = defaultTimeOffStatusFor(row);
  const timeOffMinutes = timeValueToMinutes(timeOffTimeFor(timeOffStatusUi));

  return weekDates.map((date) => {
    const worksnapTime = worksnapTimeForDate(dailyWorksnapMinutes, date);
    const dailyDecisionStatus = showDailyDecisionActions(worksnapTime) ? "Approved" : "No Status";
    const isRestDay = isRestDayDate(date, restDaysStr);
    const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, shiftType);
    const holidayTime = holidayTimeFor(date, usaHolidays, dailyWorksnapMinutes, restDaysStr, weekDates);

    return {
      date,
      decisionStatus: decisionStatusToApi(dailyDecisionStatus),
      evaluatedMinutes: timeValueToMinutes(evaluatedTime),
      adjustedMinutes: null as number | null,
      holidayMinutes: timeValueToMinutes(holidayTime),
      timeOffStatus: timeOffStatusToApi(timeOffStatusUi),
      timeOffMinutes,
    };
  });
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
  savedDailyDecisionStatuses?: Record<string, string>;
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
  };
}

function worksnapEntriesToAttendanceRecords(entries: WorksnapEntry[], weekDates: string[]) {
  const rowsByUser = new Map<string, { worksnapUserId: number | null; userName: string | null; email: string | null; durationMins: number; department: string | null; restDay: string | null; location: string | null; shiftType: string | null; payCategory: string | null; dailyWorksnapMinutes: Record<string, number> }>();

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

function ReviewModal({ record, weekDates, onClose, appliedOffsetCredit = 0, onSave, usaHolidays }: ReviewModalProps) {
  const name = record.name;
  const role = record.role;
  const actual = record.actualMinutes;
  const variance = record.actualMinutes - record.standardMinutes;
  const type = record.actualMinutes > record.standardMinutes ? "overtime" : "undertime";
  const [note, setNote] = useState("");
  const [dailyDecisionStatuses, setDailyDecisionStatuses] = useState<Record<string, string>>({});
  const [dailyTimeOffStatuses, setDailyTimeOffStatuses] = useState<Record<string, string>>({});
  const [adjustedTimes, setAdjustedTimes] = useState<Record<string, string>>({});
  const [editingAdjustedDate, setEditingAdjustedDate] = useState<string | null>(null);
  const contractor = CONTRACTORS.find((item) => item.id === record.contractorId || item.name === record.name);
  const location = contractor?.site ?? record.region;
  const dailyWorksnapMinutes = record.dailyWorksnapMinutes ?? EMPTY_DAILY_WORKSNAP_MINUTES;
  const restDaysStr = restDaysForAttendanceRow(record as AttendanceRow);
  const isIndia = isFixedContractor((record as AttendanceRow).payCategory);
  const shiftType = shiftTypeForAttendanceRow(record as AttendanceRow);
  const evaluationShiftType = isIndia ? undefined : shiftType;
  const [offsetCredit, setOffsetCredit] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const worksnapTotalMinutes = worksnapTotalMinutesFor(weekDates, dailyWorksnapMinutes);
  const indiaTotalMinutes = Math.min(worksnapTotalMinutes, 2400);
  const indiaNetCompletionMinutes = Math.max(0, indiaTotalMinutes - appliedOffsetCredit);
const totalHolidayMins = weekDates.reduce(
    (sum, date) => sum + timeValueToMinutes(holidayTimeFor(date, usaHolidays, dailyWorksnapMinutes, restDaysStr, weekDates)),
    0
  );
const completionTotalMinutes = isFixedContractor((record as AttendanceRow).payCategory)
    ? indiaNetCompletionMinutes + totalHolidayMins
    : weekDates.reduce((total, date) => {
        const worksnapTime = worksnapTimeForDate(dailyWorksnapMinutes, date);
        const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatuses[date] ?? "No Status", isRestDayDate(date, restDaysStr), evaluationShiftType);
        const adjustedTime = adjustedTimes[date] ?? "";
        const dailyTimeOffStatus = dailyTimeOffStatuses[date] ?? defaultTimeOffStatusFor(record);
        const timeOffTime = timeOffTimeFor(dailyTimeOffStatus);
        const holidayTime = holidayTimeFor(date, usaHolidays, dailyWorksnapMinutes, restDaysStr, weekDates);
        return total + timeValueToMinutes(completionTimeFor(evaluatedTime, adjustedTime, timeOffTime, holidayTime));
      }, 0);
  const details = [
    ["Shift Type", shiftType],
    ["Rest Day", restDaysForAttendanceRow(record as AttendanceRow)],
    ["Worksnap Actual Time", formatMinutesAsMins(worksnapTotalMinutes)],
    ["Completion Time", completionTotalMinutes > 0 ? formatMinutesAsMins(completionTotalMinutes) : attendanceTimeValue(dashIfEmpty(record.checkOut))],
  ];
  const weeklyDayHeadings = ["Days", "Decision", "Worksnap Time", "Evaluated Time", "Adjusted Time", "Holiday Time", "Time Off Status", "Time Off Time", "Completion Time", "Approval Status"]
    .filter((heading) => !(isIndia && (heading === "Decision" || heading === "Time Off Time")));

  useEffect(() => {
    const savedStatuses = (record as AttendanceRow).savedDailyDecisionStatuses;
    const defaultStatuses = savedStatuses
      ? { ...defaultDailyDecisionStatuses(weekDates), ...savedStatuses }
      : defaultDailyDecisionStatuses(weekDates);
    setDailyDecisionStatuses(defaultStatuses);
    setDailyTimeOffStatuses(defaultDailyTimeOffStatuses(weekDates, defaultTimeOffStatusFor(record)));
    setAdjustedTimes(defaultAdjustedTimesFor(weekDates));
    setEditingAdjustedDate(null);
    setOffsetCredit(0);

    // Overlay whatever was actually last saved for this contractor/week, so the
    // modal always reopens showing the latest saved review instead of resetting.
    const worksnapUserId = (record as AttendanceRow).worksnapUserId;
    const week = weekDates[0];
    if (worksnapUserId == null || !week) return;

    let isCancelled = false;
    fetch(`/api/attendance/day-status?userId=${worksnapUserId}&week=${week}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { days?: Array<{ date: string; decisionStatus: string | null; timeOffStatus: string | null; adjustedMinutes: number | null }> } | null) => {
        if (isCancelled || !data?.days) return;
        const decisionByDate: Record<string, string> = {};
        const timeOffByDate: Record<string, string> = {};
        const adjustedByDate: Record<string, string> = {};
        data.days.forEach((d) => {
          if (d.decisionStatus) decisionByDate[d.date] = decisionStatusFromApi(d.decisionStatus);
          if (d.timeOffStatus) timeOffByDate[d.date] = timeOffStatusFromApi(d.timeOffStatus);
          if (d.adjustedMinutes != null) adjustedByDate[d.date] = formatMinutesAsMins(d.adjustedMinutes);
        });
        if (Object.keys(decisionByDate).length) setDailyDecisionStatuses((current) => ({ ...current, ...decisionByDate }));
        if (Object.keys(timeOffByDate).length) setDailyTimeOffStatuses((current) => ({ ...current, ...timeOffByDate }));
        if (Object.keys(adjustedByDate).length) setAdjustedTimes((current) => ({ ...current, ...adjustedByDate }));
      })
      .catch(() => {});

    return () => { isCancelled = true; };
  }, [record, weekDates, appliedOffsetCredit]);

  useEffect(() => {
    setAdjustedTimes((current) => weekDates.reduce<Record<string, string>>((times, date) => {
      times[date] = current[date] ?? evaluatedTimeFor(worksnapTimeForDate(dailyWorksnapMinutes, date), dailyDecisionStatuses[date] ?? "No Status", isRestDayDate(date, restDaysStr), evaluationShiftType);
      return times;
    }, {}));
  }, [weekDates, dailyDecisionStatuses, dailyWorksnapMinutes, evaluationShiftType]);

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
    const applicableDates = weekDates.filter((date) =>
      showDailyDecisionActions(worksnapTimeForDate(dailyWorksnapMinutes, date))
    );
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
          const worksnapTime = worksnapTimeForDate(dailyWorksnapMinutes, date);
          const isRestDay = isRestDayDate(date, restDaysStr);
          const dailyDecisionStatus = dailyDecisionStatuses[date] ?? "No Status";
          const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDay, evaluationShiftType);
          const adjustedTime = adjustedTimes[date] ?? "";
          const dailyTimeOffStatus = dailyTimeOffStatuses[date] ?? defaultTimeOffStatusFor(record);
          const timeOffTime = timeOffTimeFor(dailyTimeOffStatus);
          const holidayTime = holidayTimeFor(date, usaHolidays, dailyWorksnapMinutes, restDaysStr, weekDates);
          const adjustedMinutesParsed = timeValueToMinutes(adjustedTime);

          return {
            date,
            decisionStatus: decisionStatusToApi(dailyDecisionStatus),
            evaluatedMinutes: timeValueToMinutes(evaluatedTime),
            adjustedMinutes: adjustedMinutesParsed > 0 ? adjustedMinutesParsed : null,
            holidayMinutes: timeValueToMinutes(holidayTime),
            timeOffStatus: timeOffStatusToApi(dailyTimeOffStatus),
            timeOffMinutes: timeValueToMinutes(timeOffTime),
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
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6 sm:py-5 border-b border-[#003527] bg-[#003527]">
          <div>
            <h3 className="text-lg font-bold text-white">Attendance Review</h3>
            <p className="mt-1 text-xl font-bold text-white">{name}</p>
            <p className="text-sm text-green-200">{role}</p>
            <p className="text-sm text-green-200">{location}{(record as AttendanceRow).payCategory ? ` / ${(record as AttendanceRow).payCategory}` : ""}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-green-200 transition-colors hover:bg-[#064E3B] hover:text-white"
            aria-label="Close attendance review"
            title="Close"
          >
            <LuX size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {details.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
                <p className={`text-sm font-medium mt-1 break-words ${detailValueClassName(label, value)}`}>{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <div className="flex items-center mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Weekly Days</p>
            </div>
            <div className="overflow-x-scroll rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm" style={{ minWidth: "1580px", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead className="bg-slate-50 sticky top-0 z-30">
                  <tr>
                    {weeklyDayHeadings.map((heading) => (
                      <th
                        key={heading}
                        className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-r border-slate-100 last:border-r-0 ${
                          heading === "Days" ? "sticky left-0 z-20 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0]" : ""
                        } ${
                          heading === "Decision" ? "sticky left-[156px] z-20 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0]" : ""
                        } ${
                          heading === "Worksnap Time" ? `sticky ${isIndia ? "left-[156px]" : "left-[268px]"} z-20 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0]` : ""
                        }`}
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
                    const worksnapTime = worksnapTimeForDate(dailyWorksnapMinutes, date);
                    const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDayDate(date, restDaysStr), evaluationShiftType);
                    const adjustedTime = adjustedTimes[date] ?? "";
                    const holidayTime = holidayTimeFor(date, usaHolidays, dailyWorksnapMinutes, restDaysStr, weekDates);
                    const dailyTimeOffStatus = dailyTimeOffStatuses[date] ?? defaultTimeOffStatusFor(record);
                    const timeOffTime = timeOffTimeFor(dailyTimeOffStatus);
                    const completionTime = completionTimeFor(evaluatedTime, adjustedTime, timeOffTime, holidayTime);
                    const isEditingAdjustedTime = editingAdjustedDate === date;

                    return (
                      <tr key={date}>
                        <td className="sticky left-0 z-10 w-[156px] min-w-[156px] bg-white px-4 py-3 font-medium text-slate-800 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                          {formatDayLabel(date)}
                        </td>
                        {!isIndia && (
                          <td className="sticky left-[156px] z-10 w-[112px] min-w-[112px] bg-white px-4 py-3 text-slate-600 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                            {showDailyDecisionActions(worksnapTime) ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleDailyDecision(date, "Approved")}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-50"
                                  aria-label={`Approve attendance for ${formatDayLabel(date)}`}
                                  title="Approve"
                                >
                                  <LuCircleCheck size={15} strokeWidth={2} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleDailyDecision(date, "Rejected")}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-red-600 transition-colors hover:bg-red-50"
                                  aria-label={`Reject attendance for ${formatDayLabel(date)}`}
                                  title="Reject"
                                >
                                  <LuX size={15} strokeWidth={2} />
                                </button>
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                        )}
                        <td className={`sticky ${isIndia ? "left-[156px]" : "left-[268px]"} z-10 w-[140px] min-w-[140px] bg-white px-4 py-3 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0] ${worksnapTimeClassName(worksnapTime)}`}>
                          {worksnapTime}
                        </td>
                        <td className="px-4 py-3 text-slate-600 border-r border-slate-100">
                          {evaluatedTime}
                        </td>
                        <td className="px-4 py-3 text-slate-600 border-r border-slate-100">
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
                        <td className="px-4 py-3 text-slate-600 border-r border-slate-100">
                          {holidayTime}
                        </td>
                        <td className="px-4 py-3 text-slate-600 border-r border-slate-100">
                          <select
                            value={dailyTimeOffStatus}
                            onChange={(event) => {
                              const nextStatus = event.target.value;
                              setDailyTimeOffStatuses((current) => ({
                                ...current,
                                [date]: nextStatus,
                              }));
                            }}
                            className="h-8 w-40 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-teal-500"
                          >
                            {TIME_OFF_STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </td>
                        {!isIndia && (
                          <td className="px-4 py-3 text-slate-600 border-r border-slate-100">
                            {timeOffTime}
                          </td>
                        )}
                        <td className="px-4 py-3 text-slate-600">
                          {completionTime}
                        </td>
                        <td className={`px-4 py-3 ${approvalStatusClassName(dailyDecisionStatus)}`}>
                          {dailyDecisionStatus}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td className="sticky left-0 z-20 w-[156px] min-w-[156px] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                      Total Time
                    </td>
                    {!isIndia && (
                      <td className="sticky left-[156px] z-20 w-[112px] min-w-[112px] bg-slate-50 px-4 py-3 text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                        -
                      </td>
                    )}
                    <td className={`sticky ${isIndia ? "left-[156px]" : "left-[268px]"} z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-3 font-bold text-slate-900 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]`}>
                      {formatMinutesAsMins(worksnapTotalMinutes)}
                    </td>
                    {!isIndia && (
                      <td className="px-4 py-3 text-slate-500 border-r border-slate-100">
                        -
                      </td>
                    )}
                    <td className="px-4 py-3 text-slate-500 border-r border-slate-100">
                      -
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100">
                      {totalHolidayMins > 0
                        ? <span className="flex items-center gap-1 font-semibold text-blue-600"><LuCalendar size={12} strokeWidth={2} />{formatMinutesAsMins(totalHolidayMins)}</span>
                        : <span className="text-slate-500">-</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 border-r border-slate-100">
                      -
                    </td>
                    <td className="px-4 py-3 text-slate-500 border-r border-slate-100">
                      -
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {formatMinutesAsMins(isIndia ? indiaTotalMinutes + totalHolidayMins : completionTotalMinutes)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      -
                    </td>
                  </tr>
                  {isIndia && (
                    <>
                      <tr>
                        <td className="sticky left-0 z-20 w-[156px] min-w-[156px] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                          Offset Credit
                        </td>
                        <td className={`sticky left-[156px] z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-3 text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]`}>-</td>
                        <td className="px-4 py-3 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-3 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-3 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-3 text-slate-500 border-r border-slate-100">-</td>
                        <td className={`px-4 py-3 font-bold ${appliedOffsetCredit > 0 ? "text-red-600" : "text-slate-900"}`}>
                          {formatMinutesAsMins(offsetCredit || appliedOffsetCredit)}
                        </td>
                        <td className="px-4 py-3 text-slate-500">-</td>
                      </tr>
                      <tr>
                        <td className="sticky left-0 z-20 w-[156px] min-w-[156px] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#003527] border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                          Net Time
                        </td>
                        <td className={`sticky left-[156px] z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-3 text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]`}>-</td>
                        <td className="px-4 py-3 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-3 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-3 text-slate-500 border-r border-slate-100">-</td>
                        <td className="px-4 py-3 text-slate-500 border-r border-slate-100">-</td>
                        <td className={`px-4 py-3 font-bold ${appliedOffsetCredit > 0 && offsetCredit === 0 ? "text-red-600" : "text-[#003527]"}`}>
                          {formatMinutesAsMins(offsetCredit > 0 ? indiaTotalMinutes + offsetCredit + totalHolidayMins : indiaNetCompletionMinutes + totalHolidayMins)}
                        </td>
                        <td className="px-4 py-3 text-slate-500">-</td>
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
        <div className="px-5 py-4 sm:px-6 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50">
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
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <LuCircleCheck size={15} strokeWidth={2} />
              Apply Time Credit
            </button>
          )}
          {!isIndia && (
            <button
              type="button"
              onClick={approveAllDays}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
            >
              <LuCircleCheck size={15} strokeWidth={2} />
              Approve All
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#003527] rounded-lg hover:bg-[#064E3B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkApproveModal({ worksnapRows, onClose, onApprove, usaHolidays }: {
  worksnapRows: AttendanceRow[];
  onClose: () => void;
  onApprove: () => void;
  usaHolidays: HolidayEntry[];
}) {
  const [modalWeek, setModalWeek] = useState("w26");
  const [payCategoryFilter, setPayCategoryFilter] = useState("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [deptFilter, setDeptFilter] = useState("All");
  const [shiftTypeFilter, setShiftTypeFilter] = useState("All");
  const [modalRows, setModalRows] = useState<AttendanceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processedApprovals, setProcessedApprovals] = useState<Map<string, number>>(new Map());
  const [isSavingBulk, setIsSavingBulk] = useState(false);
  const [bulkSaveError, setBulkSaveError] = useState("");

  const modalWeekObj = WEEKS.find((w) => w.key === modalWeek) ?? WEEKS[0];
  const modalWeekDates = datesBetween(modalWeekObj.from, modalWeekObj.to);
  const payCategoryOptions = Array.from(new Set(modalRows.map(payCategoryForAttendanceRow).filter((c) => c !== "-"))).sort();
  const countryOptions = Array.from(new Set(modalRows.map((r) => r.region).filter(Boolean))).sort();
  const deptOptions = Array.from(new Set(modalRows.map(departmentForAttendanceRow))).sort();
  const shiftTypeOptions = Array.from(new Set(modalRows.map((row) => row.shiftType ?? "").filter(Boolean))).sort();

  useEffect(() => {
    const week = WEEKS.find((w) => w.key === modalWeek) ?? WEEKS[0];
    const dates = datesBetween(week.from, week.to);
    const from = dates[0] ?? week.from;
    const to = dates[dates.length - 1] ?? week.to;
    setIsLoading(true);
    fetch(`/api/worksnap-entries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((r) => r.json())
      .then((result) => setModalRows(worksnapEntriesToAttendanceRecords((result.entries ?? []) as WorksnapEntry[], dates)))
      .finally(() => setIsLoading(false));
  }, [modalWeek]);

  const filteredRows = modalRows.filter((r) =>
    r.weeklyStatus === "For Review" &&
    !isFixedContractor(r.payCategory) &&
    (payCategoryFilter === "All" || payCategoryForAttendanceRow(r) === payCategoryFilter) &&
    (countryFilter === "All" || r.region === countryFilter) &&
    (deptFilter === "All" || departmentForAttendanceRow(r) === deptFilter) &&
    (shiftTypeFilter === "All" || r.shiftType === shiftTypeFilter)
  );

  const allSelected = filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.contractorId));

  function toggle(id: string) {
    setSelectedIds((ids) => { const next = new Set(ids); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredRows.map((r) => r.contractorId)));
  }

  function rowHolidayBonus(r: AttendanceRow) {
    const rowDailyMins = r.dailyWorksnapMinutes ?? {};
    const rowRestDays = restDaysForAttendanceRow(r);
    return modalWeekDates.reduce(
      (sum, date) => sum + timeValueToMinutes(holidayTimeFor(date, usaHolidays, rowDailyMins, rowRestDays, modalWeekDates)),
      0
    );
  }

  function handleBulkApprovePreview() {
    const map = new Map<string, number>();
    filteredRows.filter((r) => selectedIds.has(r.contractorId)).forEach((r) => {
      map.set(r.contractorId, computeApprovedCompletionMinutes(r, modalWeekDates) + rowHolidayBonus(r));
    });
    setProcessedApprovals(map);
  }

  async function handleSave() {
    const approvedMinutesById = processedApprovals.size > 0
      ? processedApprovals
      : new Map<string, number>(filteredRows
          .filter((r) => selectedIds.has(r.contractorId))
          .map((r) => [r.contractorId, computeApprovedCompletionMinutes(r, modalWeekDates) + rowHolidayBonus(r)])
        );

    const rowsToSave = filteredRows.filter((r) => selectedIds.has(r.contractorId) && r.worksnapUserId != null);
    setIsSavingBulk(true);
    setBulkSaveError("");
    const results = await Promise.all(rowsToSave.map((r) =>
      fetch("/api/attendance/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worksnapUserId: r.worksnapUserId,
          email: r.role.includes("@") ? r.role : "",
          week: modalWeekDates[0],
          requestStatus: "APPROVED",
          completionMinutes: approvedMinutesById.get(r.contractorId) ?? 0,
          days: buildBulkApproveDaySnapshots(r, modalWeekDates, usaHolidays),
        }),
      }).then((res) => res.ok).catch(() => false)
    ));
    setIsSavingBulk(false);

    if (results.some((ok) => !ok)) {
      setBulkSaveError("Some approvals failed to save. Please try again.");
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
            <p className="text-sm text-green-200 mt-0.5">Approve all selected contractors for the week</p>
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
          <select value={modalWeek} onChange={(e) => setModalWeek(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-teal-500">
            {WEEKS.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select>
        </div>
        {/* Table */}
        <div className="min-h-0 overflow-x-auto overflow-y-auto">
          <table className="w-full text-left text-sm" style={{ minWidth: "860px", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead className="bg-slate-50 sticky top-0 z-30 border-b border-slate-200">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 w-[52px] min-w-[52px] border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300 accent-[#003527] cursor-pointer" aria-label="Select all" />
                </th>
                <th className="sticky left-[52px] z-20 bg-slate-50 px-4 py-3 w-[220px] min-w-[220px] text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">Contractor</th>
                <th className="sticky left-[272px] z-20 bg-slate-50 px-4 py-3 w-[160px] min-w-[160px] text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">Department</th>
                {["Actual Time", "Completion Time", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap border-r border-slate-100 last:border-r-0">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">Loading...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">No contractors match the selected filters.</td></tr>
              ) : filteredRows.map((row) => {
                const processedMins = processedApprovals.get(row.contractorId);
                const rowHolidayBonusMins = rowHolidayBonus(row);
                const completionMins = processedMins ?? (computeWeeklyCompletionMinutes(row, modalWeekDates) + rowHolidayBonusMins);
                const isProcessed = processedMins !== undefined;
                return (
                <tr key={row.contractorId} className="hover:bg-slate-50 transition-colors">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3 w-[52px] min-w-[52px] border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                    <input type="checkbox" checked={selectedIds.has(row.contractorId)} onChange={() => toggle(row.contractorId)} className="h-4 w-4 rounded border-slate-300 accent-[#003527] cursor-pointer" aria-label={`Select ${row.name}`} />
                  </td>
                  <td className="sticky left-[52px] z-10 bg-white px-4 py-3 w-[220px] min-w-[220px] border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#003527] text-white flex items-center justify-center text-xs font-bold shrink-0">{row.avatar}</div>
                      <div>
                        <p className="font-semibold text-slate-900 whitespace-nowrap">{row.name}</p>
                        <p className="text-xs text-slate-500 whitespace-nowrap">{row.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="sticky left-[272px] z-10 bg-white px-4 py-3 w-[160px] min-w-[160px] text-sm text-slate-600 whitespace-nowrap border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">{departmentForAttendanceRow(row)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-900 border-r border-slate-100">{row.actualMinutes.toLocaleString()}</td>
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
              disabled={selectedIds.size === 0}
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
    </div>
  );
}

function FilterSelect({ value, onChange, label, className = "", children }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="peer h-10 w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-sm font-medium text-slate-700 outline-none transition-all hover:border-slate-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
      >
        {children}
      </select>
      <LuChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors peer-focus:text-teal-600"
      />
    </div>
  );
}

function WeekJumpDropdown({ onApply, onClose }: { onApply: (iso: string) => void; onClose: () => void }) {
  const [date, setDate] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-72">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-[#003527]">Jump to Week</p>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded"><LuX size={14} /></button>
      </div>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pick any date in the week</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
        className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500" />
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
        <button onClick={() => { if (date) { onApply(date); onClose(); } }} disabled={!date}
          className="flex-1 py-2 text-sm font-semibold bg-[#003527] text-white rounded-lg hover:bg-[#064E3B] disabled:opacity-40">Go</button>
      </div>
    </div>
  );
}

// ── per-user task × date breakdown modal ────────────────────────────────────
type BreakdownTask = { projectName: string; taskName: string; category: string; perDay: Record<string, number>; total: number };
type BreakdownResponse = { userName: string; email: string; week: string; days: string[]; tasks: BreakdownTask[]; dailyTotals: Record<string, number>; grandTotal: number; adjustments: Record<string, number>; timeOff: Record<string, number>; firstIn: Record<string, string>; lastOut: Record<string, string> };

const CAT_CHIP: Record<string, string> = { Work: "bg-emerald-50 text-emerald-700", Break: "bg-amber-50 text-amber-700", "Meeting/Training": "bg-sky-50 text-sky-700" };

const signed = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());

function weekLabel(iso: string): string {
  const start = new Date(`${iso}T00:00:00.000Z`);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
  const mo = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const day = (d: Date) => d.getUTCDate();
  return mo(start) === mo(end) ? `${mo(start)} ${day(start)} – ${day(end)}` : `${mo(start)} ${day(start)} – ${mo(end)} ${day(end)}`;
}

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

  const rangeFrom = week;                 // Sunday (week start)
  const rangeTo = addDaysIso(week, 6);    // Saturday (week end)
  const weekDates = datesBetween(rangeFrom, rangeTo);

  useEffect(() => {
    fetch("/api/holidays")
      .then((r) => r.json())
      .then((data) => {
        const usa = (data.holidays ?? []).filter(
          (h: HolidayEntry) => h.country === "United States"
        );
        setUsaHolidays(usa);
      })
      .catch(() => {});
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

      const [response, weekStatusResponse] = await Promise.all([
        fetch(`/api/worksnap-entries?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`),
        fetch(`/api/attendance/week-status?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`),
      ]);
      const result = await response.json();

      if (!isMounted) return;

      if (!response.ok) {
        setWorksnapRows([]);
        setWorksnapError(result.error ?? "Unable to load Worksnap entries.");
      } else {
        const rows = worksnapEntriesToAttendanceRecords((result.entries ?? []) as WorksnapEntry[], weekDates);
        const weekStatusResult = weekStatusResponse.ok ? await weekStatusResponse.json() : { weekStatuses: [] };
        const savedByUserId = new Map<number, { requestStatus: string; completionMinutes: number | null }>(
          (weekStatusResult.weekStatuses ?? []).map((s: { worksnapUserId: number; requestStatus: string; completionMinutes: number | null }) => [s.worksnapUserId, s])
        );
        setWorksnapRows(rows.map((row) => {
          const saved = row.worksnapUserId != null ? savedByUserId.get(row.worksnapUserId) : undefined;
          if (!saved) return row;
          return {
            ...row,
            completionMinutes: saved.completionMinutes ?? row.completionMinutes,
            weeklyStatus: saved.requestStatus === "APPROVED" ? "Reviewed" : row.weeklyStatus,
          };
        }));
        setLastSyncedAt(result.lastSyncedAt ?? null);
      }

      setIsLoadingWorksnap(false);
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

  const attendanceRows: AttendanceRow[] = worksnapError ? ATTENDANCE as AttendanceRow[] : worksnapRows;
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
    <div className="p-4 sm:p-6 md:p-8 max-w-400 mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">Attendance Management</h2>
          <p className="text-sm md:text-base text-slate-600 mt-1">Weekly Time Tracking Review (Standard: 2,700 min/week)</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              onClick={() => setShowBulkApproveModal(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6 mb-6 md:mb-8">
        {STATS.map(({ label, value, color, iconBg, iconColor, Icon }) => (
          <div key={label} className="bg-white p-4 md:p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex items-center gap-3 md:gap-4">
            <div className={`w-11 h-11 md:w-12 md:h-12 rounded-xl ${iconBg} flex items-center justify-center ${iconColor} shrink-0`}><Icon size={20} strokeWidth={1.75} /></div>
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className={`text-2xl md:text-3xl font-bold mt-0.5 tabular-nums ${color}`}>{value}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Table header toolbar */}
        <div className="px-4 md:px-6 py-5 border-b border-slate-100 flex flex-col gap-5 bg-linear-to-b from-slate-50/80 to-white">
          {/* Row 1: title + week selector */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="hidden sm:grid size-11 shrink-0 place-items-center rounded-xl bg-[#003527] text-white shadow-sm">
                <LuChartColumn size={20} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-bold tracking-tight text-[#003527]">Weekly Time Tracking</h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  Summed from Worksnap entries · <span className="font-semibold text-slate-600">{formatRangeLabel(rangeFrom, rangeTo)}</span>
                </p>
                {isLoadingWorksnap && (
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-teal-600">
                    <LuRefreshCw size={12} className="animate-spin" /> Loading Worksnap entries…
                  </p>
                )}
                {!isLoadingWorksnap && worksnapError && (
                  <p className="mt-1 text-xs font-medium text-red-600">Using fallback attendance data. {worksnapError}</p>
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
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: "720px" }}>
            <thead className="bg-[#003527] border-b border-white/20">
              <tr>
                {["Contractor", "Department", "Actual Time", "Completion Time", "Variance", "Status", "Actions"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold uppercase tracking-widest text-white whitespace-nowrap ${i === 5 ? "w-48 text-center" : ""} ${i === 6 ? "text-right" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAttendanceRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm font-medium text-slate-500">
                    {attendanceRows.length === 0 ? "No Worksnap entries found for weekly tracking." : "No weekly tracking rows match your search."}
                  </td>
                </tr>
              )}
              {filteredAttendanceRows.map((row) => {
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

                return (
                  <tr key={row.contractorId} className="hover:bg-slate-50/80 transition-colors group">
                    {/* Contractor */}
                    <td className="px-4 md:px-6 py-3 md:py-4">
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
                    <td className="px-4 md:px-6 py-3 md:py-4 text-sm font-medium text-slate-600 whitespace-nowrap">
                      {departmentForAttendanceRow(row)}
                    </td>

                    {/* Actual */}
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      {isOnLeave ? (
                        <span className="text-sm text-slate-400">—</span>
                      ) : (
                        <span className={`text-sm font-bold ${isForReview ? "text-red-600" : "text-slate-900"}`}>
                          {row.actualMinutes.toLocaleString()}
                        </span>
                      )}
                    </td>

                    {/* Completion Time */}
                    <td className="px-4 md:px-6 py-3 md:py-4">
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
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      {isOnLeave || isStandard || isReviewed ? (
                        <span className="text-sm text-slate-400">--</span>
                      ) : (
                        <span className="text-sm font-medium text-red-600">
                          {variance > 0 ? `+${variance}` : variance}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 md:px-6 py-3 md:py-4 text-center">
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
                    <td className="px-4 md:px-6 py-3 md:py-4 text-right">
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
                        <div className="flex justify-end gap-2">
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
        />
      )}

      {/* Bulk Approve Modal */}
      {showBulkApproveModal && (
        <BulkApproveModal
          worksnapRows={worksnapRows}
          onClose={() => setShowBulkApproveModal(false)}
          onApprove={handleBulkApprove}
          usaHolidays={usaHolidays}
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
