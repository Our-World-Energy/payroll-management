"use client";
/* eslint-disable react-hooks/set-state-in-effect -- data-fetching effects set loading/result state on mount */

import { useState, useEffect } from "react";
import { LuCircleCheck, LuCircleAlert, LuClock, LuFileText, LuRefreshCw, LuEye, LuMessageSquare, LuPencil, LuX } from "react-icons/lu";
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
};

type WorksnapEntry = {
  userName: string | null;
  email: string | null;
  durationMins: number | string | null;
  entryDate?: string | null;
  department?: string | null;
  restDay?: string | null;
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

function evaluatedTimeFor(worksnapTime: string, attendanceStatus = "No Status", restDay = false) {
  if (restDay && attendanceStatus !== "Approved") return "-";

  const worksnapMinutes = timeValueToMinutes(worksnapTime);
  if (!worksnapMinutes) return "-";

  const targetMinutes = 480;

  if (attendanceStatus === "Approved") {
    return formatMinutesAsMins(worksnapMinutes);
  }

  if (worksnapMinutes > 540) return formatMinutesAsMins(540);
  if (attendanceStatus === "No Status" || attendanceStatus === "") return formatMinutesAsMins(worksnapMinutes);
  if (worksnapMinutes < 180) return formatMinutesAsMins(worksnapMinutes);
  if (worksnapMinutes > targetMinutes && worksnapMinutes <= 540) return formatMinutesAsMins(worksnapMinutes);

  return formatMinutesAsMins(Math.min(targetMinutes, worksnapMinutes));
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

function completionTimeFor(evaluatedTime: string, adjustedTime: string, timeOffTime: string) {
  const evaluatedMinutes = timeValueToMinutes(evaluatedTime);
  const timeOffMinutes = timeValueToMinutes(timeOffTime);

  if (adjustedTime === "") return formatMinutesAsMins(evaluatedMinutes + timeOffMinutes);
  return formatMinutesAsMins(timeValueToMinutes(adjustedTime));
}

const HOLIDAYS = [
  { name: "Memorial Day", country: "US", date: "2026-05-25" },
  { name: "Bakrid", country: "India", date: "2026-06-07" },
  { name: "Father's Day", country: "Mexico", date: "2026-06-21" },
  { name: "Independence Day", country: "Philippines", date: "2026-06-12" },
];

function holidayTimeFor(record: AttendanceRecord, date: string) {
  const holiday = HOLIDAYS.find((item) =>
    item.country === record.region &&
    item.date === date
  );

  return holiday ? "8h 00m" : "-";
}




function worksnapTotalMinutesFor(weekDates: string[], dailyWorksnapMinutes: Record<string, number>) {
  return weekDates.reduce((total, date) => total + timeValueToMinutes(worksnapTimeForDate(dailyWorksnapMinutes, date)), 0);
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
  department?: string;
  restDay?: string;
  dailyWorksnapMinutes?: Record<string, number>;
};

function worksnapEntryToAttendanceRecord(entry: WorksnapEntry, index: number): AttendanceRow {
  const name = entry.userName?.trim() || entry.email?.trim() || `Worksnap User ${index + 1}`;
  const actualMinutes = Number(entry.durationMins ?? 0) || 0;
  const weeklyStatus: AttendanceRecord["weeklyStatus"] =
    (actualMinutes >= 2400 && actualMinutes <= 2700) ? "Standard Met" : "For Review";

  return {
    contractorId: entry.email?.trim() || `worksnap-${index}`,
    name,
    role: entry.email?.trim() || "No email",
    avatar: initialsFor(name),
    region: "Worksnap",
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
    dailyWorksnapMinutes: entry.dailyWorksnapMinutes ?? {},
  };
}

function worksnapEntriesToAttendanceRecords(entries: WorksnapEntry[]) {
  const rowsByUser = new Map<string, { userName: string | null; email: string | null; durationMins: number; department: string | null; restDay: string | null; dailyWorksnapMinutes: Record<string, number> }>();

  entries.forEach((entry, index) => {
    const key = entry.email?.trim().toLowerCase() || entry.userName?.trim().toLowerCase() || `worksnap-${index}`;
    const current = rowsByUser.get(key);

    const entryDate = entry.entryDate ?? "";
    const durationMins = Number(entry.durationMins ?? 0) || 0;
    const dailyWorksnapMinutes = { ...(current?.dailyWorksnapMinutes ?? {}) };
    if (entryDate) dailyWorksnapMinutes[entryDate] = (dailyWorksnapMinutes[entryDate] ?? 0) + durationMins;

    rowsByUser.set(key, {
      userName: current?.userName ?? entry.userName,
      email: current?.email ?? entry.email,
      durationMins: (current?.durationMins ?? 0) + durationMins,
      department: current?.department || entry.department || null,
      restDay: current?.restDay || entry.restDay || null,
      dailyWorksnapMinutes,
    });
  });

  return Array.from(rowsByUser.values()).map((entry, index) => worksnapEntryToAttendanceRecord(entry, index));
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

function ReviewModal({ record, weekDates, onClose }: ReviewModalProps) {
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
  const worksnapTotalMinutes = worksnapTotalMinutesFor(weekDates, dailyWorksnapMinutes);
const completionTotalMinutes = weekDates.reduce((total, date) => {
    const worksnapTime = worksnapTimeForDate(dailyWorksnapMinutes, date);
    const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatuses[date] ?? "No Status", isRestDayDate(date, restDaysStr));
    const adjustedTime = adjustedTimes[date] ?? "";
    const dailyTimeOffStatus = dailyTimeOffStatuses[date] ?? defaultTimeOffStatusFor(record);
    const timeOffTime = timeOffTimeFor(dailyTimeOffStatus);
    return total + timeValueToMinutes(completionTimeFor(evaluatedTime, adjustedTime, timeOffTime));
  }, 0);
  const details = [
    ["Shift Type", "Fixed"],
    ["Rest Day", restDaysForAttendanceRow(record as AttendanceRow)],
    ["Worksnap Actual Time", formatMinutesAsMins(worksnapTotalMinutes)],
    ["Completion Time", completionTotalMinutes > 0 ? formatMinutesAsMins(completionTotalMinutes) : attendanceTimeValue(dashIfEmpty(record.checkOut))],
  ];

  useEffect(() => {
    const defaultStatuses = defaultDailyDecisionStatuses(weekDates);
    setDailyDecisionStatuses(defaultStatuses);
    setDailyTimeOffStatuses(defaultDailyTimeOffStatuses(weekDates, defaultTimeOffStatusFor(record)));
    setAdjustedTimes(defaultAdjustedTimesFor(weekDates));
    setEditingAdjustedDate(null);
  }, [record, weekDates]);

  useEffect(() => {
    setAdjustedTimes((current) => weekDates.reduce<Record<string, string>>((times, date) => {
      times[date] = current[date] ?? evaluatedTimeFor(worksnapTimeForDate(dailyWorksnapMinutes, date), dailyDecisionStatuses[date] ?? "No Status", isRestDayDate(date, restDaysStr));
      return times;
    }, {}));
  }, [weekDates, dailyDecisionStatuses, dailyWorksnapMinutes]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6 sm:py-5 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-[#003527]">Attendance Review</h3>
            <p className="mt-1 text-xl font-bold text-slate-900">{name}</p>
            <p className="text-sm text-slate-500">{role}</p>
            <p className="text-sm text-slate-500">{location}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
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
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Weekly Days</p>
            <div className="overflow-x-scroll rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm" style={{ minWidth: "1580px", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead className="bg-slate-50 sticky top-0 z-30">
                  <tr>
                    {["Days", "Decision", "Worksnap Time", "Evaluated Time", "Adjusted Time", "Holiday Time", "Time Off Status", "Time Off Time", "Completion Time", "Approval Status"].map((heading) => (
                      <th
                        key={heading}
                        className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-r border-slate-100 last:border-r-0 ${
                          heading === "Days" ? "sticky left-0 z-20 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0]" : ""
                        } ${
                          heading === "Decision" ? "sticky left-[156px] z-20 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0]" : ""
                        } ${
                          heading === "Worksnap Time" ? "sticky left-[268px] z-20 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0]" : ""
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
                    const evaluatedTime = evaluatedTimeFor(worksnapTime, dailyDecisionStatus, isRestDayDate(date, restDaysStr));
                    const adjustedTime = adjustedTimes[date] ?? "";
                    const holidayTime = holidayTimeFor(record, date);
                    const dailyTimeOffStatus = dailyTimeOffStatuses[date] ?? defaultTimeOffStatusFor(record);
                    const timeOffTime = timeOffTimeFor(dailyTimeOffStatus);
                    const completionTime = completionTimeFor(evaluatedTime, adjustedTime, timeOffTime);
                    const isEditingAdjustedTime = editingAdjustedDate === date;

                    return (
                      <tr key={date}>
                        <td className="sticky left-0 z-10 w-[156px] min-w-[156px] bg-white px-4 py-3 font-medium text-slate-800 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                          {formatDayLabel(date)}
                        </td>
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
                        <td className={`sticky left-[268px] z-10 w-[140px] min-w-[140px] bg-white px-4 py-3 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0] ${worksnapTimeClassName(worksnapTime)}`}>
                          {worksnapTime}
                        </td>
                        <td className="px-4 py-3 text-slate-600 border-r border-slate-100">
                          {evaluatedTime}
                        </td>
                        <td className="px-4 py-3 text-slate-600 border-r border-slate-100">
                          {isEditingAdjustedTime ? (
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
                        <td className="px-4 py-3 text-slate-600 border-r border-slate-100">
                          {timeOffTime}
                        </td>
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
                    <td className="sticky left-[156px] z-20 w-[112px] min-w-[112px] bg-slate-50 px-4 py-3 text-slate-500 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                      -
                    </td>
                    <td className="sticky left-[268px] z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-3 font-bold text-slate-900 border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                      {formatMinutesAsMins(worksnapTotalMinutes)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 border-r border-slate-100">
                      -
                    </td>
                    <td className="px-4 py-3 text-slate-500 border-r border-slate-100">
                      -
                    </td>
                    <td className="px-4 py-3 text-slate-500 border-r border-slate-100">
                      -
                    </td>
                    <td className="px-4 py-3 text-slate-500 border-r border-slate-100">
                      -
                    </td>
                    <td className="px-4 py-3 text-slate-500 border-r border-slate-100">
                      -
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {formatMinutesAsMins(completionTotalMinutes)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      -
                    </td>
                  </tr>
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
                  Actual: {record.actualMinutes.toLocaleString()} min Â· Standard: {record.standardMinutes.toLocaleString()} min
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="hidden">
          <div className={`flex items-center gap-3 p-3 rounded-xl ${type === "overtime" ? "bg-red-50 border border-red-100" : "bg-amber-50 border border-amber-100"}`}>
            <LuCircleAlert size={18} className={type === "overtime" ? "text-red-500" : "text-amber-500"} />
            <div>
              <p className={`text-sm font-bold ${type === "overtime" ? "text-red-700" : "text-amber-700"}`}>
                {type === "overtime" ? "Overtime Detected" : "Undertime Detected"}
              </p>
              <p className="text-xs text-slate-500">
                Actual: {actual.toLocaleString()} min · Variance: {variance > 0 ? "+" : ""}{variance} min
              </p>
            </div>
          </div>

          {/* Per-day editor: pick the date, set time off + manual adjustment */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Per-Day Time Off &amp; Manual Adjustment</p>
            {loading ? <p className="text-sm text-slate-400 py-4 text-center">Loading…</p> : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm" style={{ minWidth: "640px" }}>
                  <thead className="bg-slate-50">
                    <tr>
                      {["Date", "Actual", "Time Off Status", "Manual Adj (±min)", "Note"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {days.map((d, i) => {
                      const h = dayHeader(d.date);
                      return (
                        <tr key={d.date}>
                          <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-700">{h.dow} {h.day} {h.mon}</td>
                          <td className={`px-3 py-2 tabular-nums ${d.actualMins ? "text-slate-700" : "text-slate-300"}`}>{d.actualMins || "·"}</td>
                          <td className="px-3 py-2">
                            <select value={d.timeOffStatus} onChange={(e) => updateDay(i, { timeOffStatus: e.target.value })}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                              {TIME_OFF_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={d.manualAdjustmentTime} onChange={(e) => updateDay(i, { manualAdjustmentTime: Number(e.target.value) || 0 })}
                              className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="text" value={d.note} onChange={(e) => updateDay(i, { note: e.target.value })} placeholder="reason…"
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="sm:max-w-xs">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attendance Request Status (week)</label>
            <select value={requestStatus} onChange={(e) => setRequestStatus(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              {REQUEST_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="px-5 py-4 sm:px-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            Close
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#003527] rounded-lg hover:bg-[#064E3B] transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const COLS = [
  "Name", "Location", "Shift Type", "Target Time", "Worksnap Actual Time", "Fixed Evaluated Time", "Flexible Evaluated Time",
  "Manual Adjustment Time", "Time Off Time", "Completion Time", "Status", "Time Off Status", "Request Status", "Manual Adjustment Note", "Action",
];

export default function AttendancePage() {
  const [activeWeek, setActiveWeek] = useState("w26");
  const [reviewTarget, setReviewTarget] = useState<{ record: AttendanceRecord; source: "view" | "review" } | null>(null);
  const [worksnapRows, setWorksnapRows] = useState<AttendanceRow[]>([]);
  const [isLoadingWorksnap, setIsLoadingWorksnap] = useState(true);
  const [worksnapError, setWorksnapError] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const selectedWeek = WEEKS.find((week) => week.key === activeWeek) ?? WEEKS[0];
  const weekDates = datesBetween(selectedWeek.from, selectedWeek.to);
  const rangeFrom = weekDates[0] ?? selectedWeek.from;
  const rangeTo = weekDates[weekDates.length - 1] ?? selectedWeek.to;

  useEffect(() => {
    let isMounted = true;

    async function loadWorksnapEntries() {
      setIsLoadingWorksnap(true);
      setWorksnapError("");

      const response = await fetch(`/api/worksnap-entries?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`);
      const result = await response.json();

      if (!isMounted) return;

      if (!response.ok) {
        setWorksnapRows([]);
        setWorksnapError(result.error ?? "Unable to load Worksnap entries.");
      } else {
        setWorksnapRows(worksnapEntriesToAttendanceRecords((result.entries ?? []) as WorksnapEntry[]));
      }

      setIsLoadingWorksnap(false);
    }

    loadWorksnapEntries();

    return () => {
      isMounted = false;
    };
  }, [rangeFrom, rangeTo]);


  function formatRangeLabel(from: string, to: string) {
    const fmt = (d: string) => parseIsoDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(from)} – ${fmt(to)}`;
  }

  const attendanceRows = worksnapError ? ATTENDANCE : worksnapRows;
  const filteredAttendanceRows = attendanceRows.filter((row) => {
    const query = nameSearch.trim().toLowerCase();
    const department = departmentForAttendanceRow(row);
    const matchesName = !query || row.name.toLowerCase().includes(query);
    const matchesDepartment = departmentFilter === "All" || department === departmentFilter;
    const matchesStatus = statusFilter === "All" || row.weeklyStatus === statusFilter;

    return matchesName && matchesDepartment && matchesStatus;
  });
  const departmentOptions = Array.from(new Set(attendanceRows.map(departmentForAttendanceRow))).sort();
  const statusOptions = Array.from(new Set(attendanceRows.map((row) => row.weeklyStatus))).sort();
  const perfectStandard  = filteredAttendanceRows.filter((r) => r.weeklyStatus === "Standard Met").length;
  const varianceFlags    = filteredAttendanceRows.filter((r) => r.weeklyStatus === "For Review").length;
  const pendingReviews   = filteredAttendanceRows.filter((r) => r.weeklyStatus === "For Review").length;

  const STATS = [
    { label: "Perfect Standard", value: perfectStandard, color: "text-slate-900",  iconBg: "bg-teal-50",   iconColor: "text-teal-600",  Icon: LuCircleCheck   },
    { label: "Variance Flags",   value: varianceFlags,   color: "text-red-600",    iconBg: "bg-red-50",    iconColor: "text-red-600",   Icon: LuCircleAlert   },
    { label: "Pending Reviews",  value: pendingReviews,  color: "text-slate-900",  iconBg: "bg-amber-50",  iconColor: "text-amber-600", Icon: LuClock         },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-400 mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">Attendance Management</h2>
          <p className="text-sm md:text-base text-slate-600 mt-1">Weekly Time Tracking Review (Standard: 2,700 min/week)</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white border border-slate-200 text-[#003527] rounded-lg text-sm font-semibold hover:bg-slate-50">
              <LuFileText size={16} /><span className="hidden sm:inline">Export Timesheet</span><span className="sm:hidden">Export</span>
            </button>
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-2 px-3 sm:px-5 py-2 bg-[#003527] hover:bg-[#064E3B] text-white rounded-lg text-sm font-semibold shadow-md disabled:opacity-50">
              <LuRefreshCw size={16} className={syncing ? "animate-spin" : ""} /><span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync All Data"}</span><span className="sm:hidden">{syncing ? "…" : "Sync"}</span>
            </button>
          </div>
          <p className="text-xs text-slate-400">Last updated: <span className="font-semibold text-slate-500">{syncing ? "syncing…" : formatArizona(lastSyncedAt)}</span></p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6 mb-6 md:mb-8">
        {STATS.map(({ label, value, color, iconBg, iconColor, Icon }) => (
          <div key={label} className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 flex items-center gap-3 md:gap-4">
            <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg ${iconBg} flex items-center justify-center ${iconColor} shrink-0`}><Icon size={20} strokeWidth={1.75} /></div>
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className={`text-xl md:text-2xl font-bold mt-0.5 ${color}`}>{value}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Table header toolbar */}
        <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-xl md:text-2xl font-semibold text-[#003527]">Weekly Time Tracking</h3>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Actual minutes are summed from Worksnap entries dated {formatRangeLabel(rangeFrom, rangeTo)}.
            </p>
            {isLoadingWorksnap && (
              <p className="mt-1 text-xs font-medium text-slate-500">Loading Worksnap entries...</p>
            )}
            {!isLoadingWorksnap && worksnapError && (
              <p className="mt-1 text-xs font-medium text-red-600">Using fallback attendance data. {worksnapError}</p>
            )}
            {!isLoadingWorksnap && !worksnapError && attendanceRows.length === 0 && (
              <p className="mt-1 text-xs font-medium text-slate-500">No Worksnap entries found.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={nameSearch}
              onChange={(event) => setNameSearch(event.target.value)}
              placeholder="Search name"
              className="h-10 w-full sm:w-52 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all focus:ring-2 focus:ring-teal-500"
            />
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              className="h-10 w-full sm:w-48 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all focus:ring-2 focus:ring-teal-500"
              aria-label="Filter by department"
            >
              <option value="All">All Departments</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 w-full sm:w-44 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all focus:ring-2 focus:ring-teal-500"
              aria-label="Filter by status"
            >
              <option value="All">All Statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <select
              value={activeWeek}
              onChange={(event) => setActiveWeek(event.target.value)}
              className="h-10 w-full sm:w-56 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all focus:ring-2 focus:ring-teal-500"
              aria-label="Select week"
            >
              {WEEKS.map((w) => (
                <option key={w.key} value={w.key}>{w.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: "720px" }}>
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Contractor", "Department", "Weekly Actual (Min)", "Variance", "Status", "Actions"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap ${i === 5 ? "text-right" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAttendanceRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm font-medium text-slate-500">
                    {attendanceRows.length === 0 ? "No Worksnap entries found for weekly tracking." : "No weekly tracking rows match your search."}
                  </td>
                </tr>
              )}
              {filteredAttendanceRows.map((row) => {
                const variance = row.actualMinutes - row.standardMinutes;
                const isOnLeave = row.weeklyStatus === "On Leave";
                const isStandard = row.weeklyStatus === "Standard Met";
                const isForReview = row.weeklyStatus === "For Review";

                return (
                  <tr key={row.contractorId} className="hover:bg-slate-50/80 transition-colors group">
                    {/* Contractor */}
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      <div className="flex items-center gap-2 md:gap-3">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#003527] text-white flex items-center justify-center text-xs md:text-sm font-bold shrink-0">
                          {row.avatar}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 whitespace-nowrap">{row.name}</p>
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

                    {/* Variance */}
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      {isOnLeave || isStandard ? (
                        <span className="text-sm text-slate-400">--</span>
                      ) : (
                        <span className="text-sm font-medium text-red-600">
                          {variance > 0 ? `+${variance}` : variance}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      {isStandard && (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-[11px] font-bold uppercase">
                          Standard Met
                        </span>
                      )}
                      {isForReview && (
                        <span className="flex items-center gap-1 text-red-600">
                          <LuCircleAlert size={15} strokeWidth={2} className="fill-red-100" />
                          <span className="text-[11px] font-bold uppercase">For Review</span>
                        </span>
                      )}
                      {isOnLeave && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-[11px] font-bold uppercase">
                          On Leave
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 md:px-6 py-3 md:py-4 text-right">
                      {isStandard && (
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
        />
      )}
    </div>
  );
}
