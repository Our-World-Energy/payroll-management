"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { LuArrowLeft, LuClock, LuCoffee, LuPhoneOff, LuRefreshCw, LuSearch, LuTriangleAlert, LuUserCheck, LuUsers, LuUserX, LuX } from "react-icons/lu";
import { FilterSelect } from "@/components/FilterSelect";
import { addDaysIso, arizonaTodayIso, parseIsoDate, recentWeeks, sundayOf, weekLabel } from "@/lib/weekUtils";
import { countryFromLocation } from "@/lib/countryTimeZones";
import { LATE_GRACE_MINUTES } from "@/app/admin/contractors/shiftScheduleShared";
import { saveNcns, clearNcns } from "../ncnsActions";
import { toast } from "sonner";

type TrackerTask = {
  projectName: string;
  taskName: string;
  category: string;
  minutes: number;
  minutesByDate: Record<string, number>;
};

// One entry per date in the selected range — what the Week Range view lists
// down each of the schedule and clock columns.
type TrackerDay = {
  date: string;
  shiftStart: string;
  shiftEnd: string;
  timeIn: string | null;
  timeOut: string | null;
  mins: number;
  isLate: boolean;
  lateByMins: number | null;
  isRestDay: boolean;
  isAbsent: boolean;
  absenceCode: AbsenceCode;
  isHalfDay: boolean;
  ncnsDefault: boolean;
  ncnsOverride: boolean | null;
  ncnsReason: string;
  ptoType: string;
  silType: string;
  breakMins: number;
  expectedMins: number;
};

// An admin's override wins over the derived verdict.
function ncnsValue(day: TrackerDay) {
  return day.ncnsOverride ?? day.ncnsDefault;
}

// NCNS reads as what actually happened rather than Yes/No. Defined once so the
// cell, the dialog toggle and the toast all agree.
const NCNS_YES_LABEL = "Unnotified";
const NCNS_NO_LABEL = "Notified";

function ncnsLabel(value: boolean) {
  return value ? NCNS_YES_LABEL : NCNS_NO_LABEL;
}

/**
 * What the Absent column reports. Computed server-side so the rule lives in one
 * place: no time logged on a working day is an absence, and the code says why —
 * a US holiday ("HO"), approved PTO/Sick Leave ("PTO/SIL"), a Typical
 * Non-Working Day ("Rest day"), or none of those ("Absent"). Any logged time
 * reads "No".
 */
type AbsenceCode = "No" | "Absent" | "PTO/SIL" | "HO" | "Rest day";

const ABSENCE_CODE_STYLE: Record<AbsenceCode, string> = {
  Absent: "text-red-600 font-bold",
  "PTO/SIL": "text-blue-700 font-bold",
  HO: "text-violet-700 font-bold",
  "Rest day": "text-slate-400 font-semibold",
  No: "text-slate-400 font-bold",
};

type TrackerRow = {
  worksnapUserId: number;
  userName: string;
  email: string;
  department: string;
  shiftType: string;
  payCategory: string;
  location: string;
  timeIn: string | null;
  timeOut: string | null;
  totalMins: number;
  tasks: TrackerTask[];
  isLate: boolean;
  lateByMins: number | null;
  isActiveContractor: boolean;
  shiftStart: string;
  shiftEnd: string;
  expectedMins: number | null;
  timeInDate: string | null;
  timeOutDate: string | null;
  perDay: TrackerDay[];
  restDay: string;
  isAbsentInRange: boolean;
  // Range aggregates. In Daily mode days === 1 and these collapse to 0/1.
  days: number;
  daysLogged: number;
  lateDays: number;
  overBreakDays: number;
  undertimeDays: number;
  absentDays: number;
};

type RangeMode = "daily" | "weekly";

// Status values the Status column can report, reused as the filter's options.
// A day can carry more than one (late *and* undertime *and* over break), so
// the column renders every status that applies.
const STATUS_LATE = "Late";
const STATUS_OVER_BREAK = "Over Break";
const STATUS_UNDERTIME = "Undertime";
const STATUS_ABSENT = "Absent";
const STATUS_WITHIN_BREAK = "Within Break";

// Per-attempt ceiling. Without one, a request that never settles (dev-server
// recompile, exhausted DB pool, cold serverless function) leaves the page on
// its loading state indefinitely with nothing to retry from — so every attempt
// is bounded and a stall becomes a visible, retryable error instead.
const REQUEST_TIMEOUT_MS = 15_000;

// Transparently retries on network failure or a 5xx/429 — the same wrapper
// Attendance Management uses, so a cold start doesn't read as an empty day.
async function fetchWithRetry(input: string, retries = 1): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(input, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`Request failed with status ${response.status}`);
    } catch (err) {
      lastError = err instanceof DOMException && err.name === "TimeoutError"
        ? new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`)
        : err;
    }
    if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

// The last 12 months ending with the current Arizona month, as
// [{ value: "2026-08", label: "August 2026" }, …] — newest first.
function recentMonths(todayIso: string, count = 12) {
  const [year, month] = todayIso.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(year, month - 1 - i, 1);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    };
  });
}

function daysInMonth(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

// Task chips are coloured by what kind of time they are: breaks orange,
// meetings/training pink, all actual work green. Driven off `category`
// (Worksnap sends "Break" / "Meeting/Training" / "Work"), with the task name
// as a backstop so an unseen category spelling still lands in the right bucket.
const TASK_COLOR_BREAK = "bg-orange-50 text-orange-800 border-orange-200";
const TASK_COLOR_MEETING = "bg-pink-50 text-pink-800 border-pink-200";
const TASK_COLOR_WORK = "bg-emerald-50 text-emerald-800 border-emerald-200";

function isBreakTask(task: TrackerTask) {
  return `${task.category} ${task.taskName}`.toLowerCase().includes("break");
}

type TaskKind = "work" | "meeting" | "break";

// One classification for the chip colour, the group ordering and the per-kind
// subtotals, so the three can't disagree about what a task is.
function taskKind(task: TrackerTask): TaskKind {
  if (isBreakTask(task)) return "break";
  const label = `${task.category} ${task.taskName}`.toLowerCase();
  if (label.includes("meeting") || label.includes("training")) return "meeting";
  return "work";
}

const TASK_KIND_LABEL: Record<TaskKind, string> = { work: "Work", meeting: "Meeting / Training", break: "Break" };
const TASK_KIND_TEXT: Record<TaskKind, string> = {
  work: "text-emerald-700",
  meeting: "text-pink-700",
  break: "text-orange-700",
};

function taskChipColor(task: TrackerTask) {
  const kind = taskKind(task);
  if (kind === "break") return TASK_COLOR_BREAK;
  if (kind === "meeting") return TASK_COLOR_MEETING;
  return TASK_COLOR_WORK;
}

// Minutes per kind, for the breakdown under a contractor's total.
function minutesByKind(tasks: TrackerTask[]) {
  const totals: Record<TaskKind, number> = { work: 0, meeting: 0, break: 0 };
  for (const task of tasks) totals[taskKind(task)] += task.minutes;
  return totals;
}

// Daily paid-break allowance. A day totalling more than this across every
// break task is flagged "Over Break" in the Status column.
const BREAK_ALLOWANCE_MINUTES = 30;

function breakMinutesFor(tasks: TrackerTask[]) {
  return tasks.reduce((sum, task) => (isBreakTask(task) ? sum + task.minutes : sum), 0);
}

// Fallback full day, used only when the contractor has no shift window for the
// date (Flexible, or a Shifting Schedule day that was never assigned hours).
const FULL_DAY_MINUTES = 480;

// What the contractor was actually scheduled to work on this date — their
// Shifting Schedule row or Fixed shift length when there is one, otherwise a
// standard day. This is what Undertime measures against, so a shifting
// contractor on a 6-hour day isn't flagged for working 6 hours.
function expectedMinutesFor(row: TrackerRow) {
  return row.expectedMins && row.expectedMins > 0 ? row.expectedMins : FULL_DAY_MINUTES;
}

// The same four rules applied to a single day — what the Week Range layout
// shows against each day, rather than one verdict for the whole range.
function statusesForDay(day: TrackerDay) {
  const statuses: string[] = [];
  if (day.isLate) statuses.push(STATUS_LATE);
  if (day.breakMins > BREAK_ALLOWANCE_MINUTES) statuses.push(STATUS_OVER_BREAK);
  // isAbsent already excludes rest days, so a Saturday with no time is simply
  // a rest day rather than an absence.
  if (day.isAbsent) statuses.push(STATUS_ABSENT);
  else if (day.mins > 0 && day.mins < day.expectedMins) statuses.push(STATUS_UNDERTIME);
  return statuses;
}

// Single source of truth for the Status column, the Status filter and the stat
// tiles, so none of the three can disagree about what a row's status is.
function statusesFor(row: TrackerRow) {
  const statuses: string[] = [];

  // Over a range the per-day verdicts are counted server-side, so a week's
  // statuses are exactly what the daily view would have shown on those days —
  // the thresholds are never re-derived against a week's worth of minutes.
  if (row.days > 1) {
    if (row.lateDays > 0) statuses.push(STATUS_LATE);
    if (row.overBreakDays > 0) statuses.push(STATUS_OVER_BREAK);
    if (row.isAbsentInRange) statuses.push(STATUS_ABSENT);
    else if (row.undertimeDays > 0) statuses.push(STATUS_UNDERTIME);
    return statuses;
  }

  if (row.isLate) statuses.push(STATUS_LATE);
  if (breakMinutesFor(row.tasks) > BREAK_ALLOWANCE_MINUTES) statuses.push(STATUS_OVER_BREAK);
  // Absent means a working day with nothing logged — a rest day with no time is
  // not an absence, and is not Undertime either.
  if (row.isAbsentInRange) statuses.push(STATUS_ABSENT);
  else if (row.totalMins > 0 && row.totalMins < expectedMinutesFor(row)) statuses.push(STATUS_UNDERTIME);
  return statuses;
}

// One rendered row per (day, task) for the Week Range layout: every day in the
// range appears, in order, with the tasks worked on it beneath. A day with no
// tasks still gets one row so the gap is visible rather than skipped.
type WeekRenderRow = {
  day: TrackerDay;
  task: TrackerTask | null;
  minutes: number;
  isFirstOfDay: boolean;
  dayRowSpan: number;
};

function weekRenderRows(row: TrackerRow): WeekRenderRow[] {
  const out: WeekRenderRow[] = [];

  for (const day of row.perDay) {
    // row.tasks is already ordered work → meeting → break, and filtering keeps
    // that order, so each day's tasks read in the same sequence.
    const worked = row.tasks.filter((t) => (t.minutesByDate[day.date] ?? 0) > 0);

    if (worked.length === 0) {
      out.push({ day, task: null, minutes: day.mins, isFirstOfDay: true, dayRowSpan: 1 });
      continue;
    }

    worked.forEach((task, i) => {
      out.push({
        day,
        task,
        minutes: task.minutesByDate[day.date] ?? 0,
        isFirstOfDay: i === 0,
        dayRowSpan: worked.length,
      });
    });
  }

  return out;
}

// One day's verdicts, in the same colours the Daily view uses. Values are the
// day's own figures, so "-2h 30m" is how far short that day fell, not the week.
function DayStatusBadges({ day }: { day: TrackerDay }) {
  const statuses = statusesForDay(day);
  if (statuses.length === 0) return <span className="text-slate-300">—</span>;

  return (
    <span className="inline-flex flex-col items-center gap-1">
      {statuses.includes(STATUS_LATE) && (
        <span
          title={`Clocked in at ${day.timeIn} — ${day.lateByMins} min after the ${day.shiftStart} shift start (${LATE_GRACE_MINUTES} min grace applied)`}
          className="inline-flex flex-col items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-800 whitespace-nowrap"
        >
          {STATUS_LATE}
          {day.lateByMins != null && (
            <span className="text-[10px] font-semibold text-orange-600 tabular-nums">+{formatMinutes(day.lateByMins)}</span>
          )}
        </span>
      )}
      {statuses.includes(STATUS_ABSENT) && (
        <span
          title="No Worksnap time logged on this day"
          className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 whitespace-nowrap"
        >
          {STATUS_ABSENT}
        </span>
      )}
      {statuses.includes(STATUS_OVER_BREAK) && (
        <span
          title={`${day.breakMins} min of break — ${day.breakMins - BREAK_ALLOWANCE_MINUTES} min over the ${BREAK_ALLOWANCE_MINUTES} min allowance`}
          className="inline-flex flex-col items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 whitespace-nowrap"
        >
          {STATUS_OVER_BREAK}
          <span className="text-[10px] font-semibold text-red-500 tabular-nums">{formatMinutes(day.breakMins)}</span>
        </span>
      )}
      {statuses.includes(STATUS_UNDERTIME) && (
        <span
          title={`${day.mins} min logged — ${day.expectedMins - day.mins} min short of the ${formatMinutes(day.expectedMins)} scheduled`}
          className="inline-flex flex-col items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 whitespace-nowrap"
        >
          {STATUS_UNDERTIME}
          <span className="text-[10px] font-semibold text-amber-600 tabular-nums">-{formatMinutes(day.expectedMins - day.mins)}</span>
        </span>
      )}
    </span>
  );
}

// Plain Yes / No for the Late column. Yes carries the minutes past shift start
// so the answer is checkable without opening the Status badge.
function LateFlag({ isLate, byMins }: { isLate: boolean; byMins?: number | null }) {
  if (!isLate) return <span className="text-xs font-bold text-slate-400">No</span>;
  return (
    <span className="inline-flex flex-col items-center">
      <span className="text-xs font-bold text-orange-700">Yes</span>
      {byMins != null && (
        <span className="text-[10px] font-semibold text-orange-500 tabular-nums">+{formatMinutes(byMins)}</span>
      )}
    </span>
  );
}

function AbsentFlag({ code, mins }: { code: AbsenceCode; mins: number }) {
  const title = code === "No"
    ? `${formatMinutes(mins)} logged`
    : code === "Absent"
      ? "No time logged, with no holiday or approved leave on this date"
      : code === "HO"
        ? "A United States holiday falls on this date"
        : code === "PTO/SIL"
          ? "An approved PTO or Sick Leave request covers this date"
          : "One of the contractor's Typical Non-Working Days";

  return (
    <span title={title} className={`text-xs whitespace-nowrap ${ABSENCE_CODE_STYLE[code]}`}>
      {code === "Rest day" ? <span className="text-[10px] uppercase tracking-wide">Rest day</span> : code}
    </span>
  );
}

// Half Day needs time to have been logged: a day with nothing is an absence,
// which the Absent column already reports.
function HalfDayFlag({ isHalfDay, mins }: { isHalfDay: boolean; mins: number }) {
  if (!isHalfDay) return <span className="text-xs font-bold text-slate-400">No</span>;
  return (
    <span title={`${formatMinutes(mins)} logged — under half a day`} className="text-xs font-bold text-amber-700 whitespace-nowrap">
      Half Day
    </span>
  );
}

// Clickable: the derived verdict can be overridden either way, with a reason.
//
// Only a value worth reading is printed. Unnotified shows red; an admin's
// explicit Notified shows green; a day that simply derives Notified — the
// ordinary case for anyone who worked — is left blank, so the column carries
// only exceptions and decisions. The cell stays clickable when blank, with a
// hover tint and tooltip as the affordance.
function NcnsFlag({ day, onClick }: { day: TrackerDay; onClick: () => void }) {
  const value = ncnsValue(day);
  const overridden = day.ncnsOverride !== null;
  const blank = !value && !overridden;

  return (
    <button
      type="button"
      onClick={onClick}
      title={overridden
        ? `Set to ${ncnsLabel(value)} by an admin — ${day.ncnsReason || "no reason recorded"}. Click to change.`
        : blank
          ? "Nothing to flag. Click to record an NCNS."
          : "Derived from the day's attendance. Click to override."}
      className={`min-w-12 text-xs font-bold whitespace-nowrap rounded px-1.5 py-0.5 transition-colors hover:bg-slate-100 cursor-pointer ${
        value ? "text-red-600" : "text-emerald-700"
      } ${overridden ? "underline decoration-dotted decoration-slate-400 underline-offset-2" : ""}`}
    >
      {blank ? " " : ncnsLabel(value)}
    </button>
  );
}

// Blank unless an approved request of that kind covers the date, so each column
// reads as a list of leave days rather than a wall of "No". The exact request
// type — including whether it was a half day — is in the tooltip.
function LeaveFlag({ type, label, className }: { type: string; label: string; className: string }) {
  if (!type) return null;
  return (
    <span title={`Approved ${type} covers this date`} className={`text-xs font-bold whitespace-nowrap ${className}`}>
      {label}
      {/* Half days are worth distinguishing: the day is only partly covered. */}
      {type.toLowerCase().includes("half day") && (
        <span className="block text-[10px] font-semibold opacity-70">Half Day</span>
      )}
    </span>
  );
}

function shortDate(iso: string) {
  return parseIsoDate(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function dayInitial(iso: string) {
  return parseIsoDate(iso).toLocaleDateString("en-US", { weekday: "short" });
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

type NcnsTarget = { email: string; name: string; date: string; day: TrackerDay };

// Small dialog for overriding one contractor-date's NCNS verdict. A reason is
// required on save, so an override always carries its justification; "Use
// derived value" drops the override instead of recording a fake one.
function NcnsDialog({ target, onClose, onSaved }: {
  target: NcnsTarget;
  onClose: () => void;
  onSaved: (email: string, date: string, isNcns: boolean | null, reason: string) => void;
}) {
  const derived = target.day.ncnsDefault;
  const [value, setValue] = useState<boolean>(ncnsValue(target.day));
  const [reason, setReason] = useState(target.day.ncnsReason);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSaving(true);
    setError("");
    const result = await saveNcns(target.email, target.date, value, reason);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save the change.");
      return;
    }
    onSaved(target.email, target.date, value, reason.trim());
    toast.success(`NCNS set to ${ncnsLabel(value)}`, { description: `${target.name} · ${shortDate(target.date)}` });
    onClose();
  }

  async function reset() {
    setSaving(true);
    setError("");
    const result = await clearNcns(target.email, target.date);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Could not reset the value.");
      return;
    }
    onSaved(target.email, target.date, null, "");
    toast.success("NCNS reset to the derived value", { description: `${target.name} · ${shortDate(target.date)}` });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && onClose()} />

      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 py-4 bg-[#003527]">
          <div>
            <h3 className="text-base font-bold text-white">No Call No Show</h3>
            <p className="text-xs text-white/60 mt-0.5">{target.name} · {shortDate(target.date)}</p>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Close"
            className="grid size-7 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50">
            <LuX size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">NCNS</p>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              {[true, false].map((option) => (
                <button
                  key={String(option)}
                  type="button"
                  onClick={() => setValue(option)}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-colors ${
                    value === option
                      ? option ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
                      : option ? "text-slate-500 hover:bg-slate-100" : "text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  {ncnsLabel(option)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Derived from attendance: <span className="font-semibold text-slate-600">{ncnsLabel(derived)}</span>
              {target.day.ncnsOverride !== null && <span> · currently overridden</span>}
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Reason</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being set this way?"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition-all hover:border-slate-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 resize-none"
            />
          </div>

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
          <button type="button" onClick={reset} disabled={saving || target.day.ncnsOverride === null}
            className="text-xs font-semibold text-slate-500 hover:text-red-600 disabled:opacity-40 disabled:hover:text-slate-500">
            Use derived value
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={saving}
              className="px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={saving || !reason.trim()}
              title={!reason.trim() ? "A reason is required" : undefined}
              className="px-4 py-2 rounded-lg bg-[#003527] text-sm font-semibold text-white shadow-sm hover:bg-[#064E3B] disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AttendanceTrackerPage() {
  const todayIso = useMemo(() => arizonaTodayIso(), []);
  const months = useMemo(() => recentMonths(todayIso), [todayIso]);

  const [mode, setMode] = useState<RangeMode>("daily");
  const [month, setMonth] = useState(todayIso.slice(0, 7));
  const [day, setDay] = useState(todayIso.slice(8, 10));
  // Sun→Sat weeks, most recent first — the same week list Attendance uses.
  const weeks = useMemo(() => recentWeeks(), []);
  const [week, setWeek] = useState(() => sundayOf(todayIso));
  const [nameSearch, setNameSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("All");
  const [payCategoryFilter, setPayCategoryFilter] = useState("All");
  const [shiftTypeFilter, setShiftTypeFilter] = useState("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [ncnsTarget, setNcnsTarget] = useState<NcnsTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const dayOptions = useMemo(
    () => Array.from({ length: daysInMonth(month) }, (_, i) => String(i + 1).padStart(2, "0")),
    [month]
  );

  // Clamp the day when switching to a shorter month (e.g. the 31st → February).
  useEffect(() => {
    const lastDay = daysInMonth(month);
    if (Number(day) > lastDay) setDay(String(lastDay).padStart(2, "0"));
  }, [month, day]);

  const date = `${month}-${day}`;
  const isWeekly = mode === "weekly";
  const rangeFrom = isWeekly ? week : date;
  const rangeTo = isWeekly ? addDaysIso(week, 6) : date;

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        // Trailing slash matches next.config's trailingSlash: true, so this
        // hits the route directly instead of taking a 308 on every change.
        const response = await fetchWithRetry(
          `/api/attendance/tracker/?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`
        );
        const result = await response.json();
        if (!isMounted) return;

        if (!response.ok) {
          setRows([]);
          setError(result.error ?? "Unable to load attendance for this day.");
        } else {
          setRows((result.rows ?? []) as TrackerRow[]);
        }
      } catch (err) {
        if (!isMounted) return;
        setRows([]);
        // Surface the real reason rather than a generic message — a stalled or
        // failing request is otherwise indistinguishable from an empty day.
        const reason = err instanceof Error ? err.message : "Unknown error";
        console.error("Attendance Tracker load failed:", err);
        setError(`Unable to load attendance for ${rangeFrom === rangeTo ? rangeFrom : `${rangeFrom} – ${rangeTo}`}. ${reason}`);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [rangeFrom, rangeTo, reloadKey]);

  // Patches the saved override into local state rather than refetching, so the
  // cell updates without rebuilding a 4,000-row week view.
  function applyNcnsChange(email: string, date: string, isNcns: boolean | null, reason: string) {
    setRows((current) => current.map((row) => {
      if (row.email.trim().toLowerCase() !== email.trim().toLowerCase()) return row;
      return {
        ...row,
        perDay: row.perDay.map((day) =>
          day.date === date ? { ...day, ncnsOverride: isNcns, ncnsReason: isNcns === null ? "" : reason } : day
        ),
      };
    }));
  }

  const teamOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.department).filter(Boolean))).sort(),
    [rows]
  );

  const payCategoryOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.payCategory).filter(Boolean))).sort(),
    [rows]
  );

  const shiftTypeOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.shiftType).filter(Boolean))).sort(),
    [rows]
  );

  const countryOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => countryFromLocation(r.location)).filter((c) => c && c !== "-"))).sort(),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const search = nameSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (search && !row.userName.toLowerCase().includes(search) && !row.email.toLowerCase().includes(search)) return false;
      if (teamFilter !== "All" && row.department !== teamFilter) return false;
      if (payCategoryFilter !== "All" && row.payCategory !== payCategoryFilter) return false;
      if (shiftTypeFilter !== "All" && row.shiftType !== shiftTypeFilter) return false;
      if (countryFilter !== "All" && countryFromLocation(row.location) !== countryFilter) return false;
      if (statusFilter !== "All") {
        const statuses = statusesFor(row);
        // "Within Break" is the inverse of Over Break rather than a status a
        // row carries, so it's matched by absence.
        if (statusFilter === STATUS_WITHIN_BREAK) {
          if (statuses.includes(STATUS_OVER_BREAK)) return false;
        } else if (!statuses.includes(statusFilter)) {
          return false;
        }
      }
      return true;
    });
  }, [rows, nameSearch, teamFilter, payCategoryFilter, shiftTypeFilter, countryFilter, statusFilter]);

  const totals = useMemo(() => {
    // Counted from statusesFor so the tiles always agree with the Status column.
    let late = 0;
    let undertime = 0;
    let overBreak = 0;
    let absent = 0;
    // Headcounts are restricted to Active contractors, so Active = Present +
    // Absent holds exactly; Worksnap-only and dismissed rows are excluded.
    let activeContractors = 0;
    let present = 0;
    // NCNS is a per-day verdict, so a contractor counts once if any day in the
    // selection is Unnotified — the same way Late and Undertime are counted.
    let unnotified = 0;
    for (const row of filteredRows) {
      if (row.perDay.some((day) => ncnsValue(day))) unnotified++;
      const statuses = statusesFor(row);
      if (statuses.includes(STATUS_LATE)) late++;
      if (statuses.includes(STATUS_UNDERTIME)) undertime++;
      if (statuses.includes(STATUS_OVER_BREAK)) overBreak++;
      if (row.isActiveContractor) {
        activeContractors++;
        if (row.totalMins > 0) present++;
        // Rest-day-aware: someone whose whole range is rest days is neither
        // present nor absent, so Active is no longer exactly Present + Absent.
        else if (row.isAbsentInRange) absent++;
      }
    }
    return { late, undertime, overBreak, absent, activeContractors, present, unnotified };
  }, [filteredRows]);

  const filtersActive = Boolean(nameSearch) || teamFilter !== "All" || payCategoryFilter !== "All"
    || shiftTypeFilter !== "All" || countryFilter !== "All" || statusFilter !== "All";

  function clearFilters() {
    setNameSearch("");
    setTeamFilter("All");
    setPayCategoryFilter("All");
    setShiftTypeFilter("All");
    setCountryFilter("All");
    setStatusFilter("All");
  }

  // What the selection currently covers — one day, or the week's Sun→Sat span.
  const dayLabel = useMemo(() => {
    if (isWeekly) {
      const start = parseIsoDate(rangeFrom).toLocaleDateString("en-US", { month: "long", day: "numeric" });
      const end = parseIsoDate(rangeTo).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      return `${start} – ${end}`;
    }
    try {
      return parseIsoDate(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    } catch {
      return date;
    }
  }, [isWeekly, rangeFrom, rangeTo, date]);

  // Exception counts only — each tile is tinted to match its pill in the
  // Status column, and each counts the rows currently passing the filters.
  const STATS = [
    { label: STATUS_LATE, value: totals.late.toLocaleString(), Icon: LuClock, tint: "bg-orange-50 text-orange-700", valueTint: "text-orange-700" },
    { label: STATUS_UNDERTIME, value: totals.undertime.toLocaleString(), Icon: LuTriangleAlert, tint: "bg-amber-50 text-amber-700", valueTint: "text-amber-700" },
    { label: STATUS_OVER_BREAK, value: totals.overBreak.toLocaleString(), Icon: LuCoffee, tint: "bg-red-50 text-red-700", valueTint: "text-red-700" },
    { label: "Active Contractors", value: totals.activeContractors.toLocaleString(), Icon: LuUsers, tint: "bg-teal-50 text-teal-700", valueTint: "text-[#003527]" },
    { label: isWeekly ? "Present In Week" : "Present Today", value: totals.present.toLocaleString(), Icon: LuUserCheck, tint: "bg-emerald-50 text-emerald-700", valueTint: "text-emerald-700" },
    { label: STATUS_ABSENT, value: totals.absent.toLocaleString(), Icon: LuUserX, tint: "bg-slate-100 text-slate-600", valueTint: "text-slate-700" },
    // NCNS — counts contractors with at least one Unnotified day, matching the
    // effective value in the column (an admin's override included).
    { label: NCNS_YES_LABEL, value: totals.unnotified.toLocaleString(), Icon: LuPhoneOff, tint: "bg-rose-50 text-rose-700", valueTint: "text-rose-700" },
  ];

  const headerCell = "px-3 md:px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white whitespace-nowrap border-r border-b border-white/20 last:border-r-0";

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-full overflow-x-hidden">
      <Link href="/admin/reports" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-700 transition-colors mb-3">
        <LuArrowLeft size={14} strokeWidth={2.5} /> Back to Reports
      </Link>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 mb-3 md:mb-4">
        <div className="flex items-center gap-3">
          <div className="hidden sm:grid size-9 shrink-0 place-items-center rounded-xl bg-[#003527] text-white shadow-sm">
            <LuClock size={18} strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-bold text-[#003527] tracking-tight">Attendance Tracker</h2>
            <p className="text-xs md:text-sm text-slate-600 mt-0.5">
              Clock-in / clock-out and task time · <span className="font-semibold text-slate-700">{dayLabel}</span>
            </p>
          </div>
        </div>

        {/* Period selection — Daily (Month + Day) or Weekly (Sun→Sat range) */}
        <div className="flex flex-wrap items-end gap-2 w-full sm:w-auto">
          <div className="flex-1 sm:flex-none">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">View</label>
            <div className="inline-flex h-10 rounded-lg border border-slate-200 bg-white p-1">
              {(["daily", "weekly"] as RangeMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`px-3 rounded-md text-xs font-bold capitalize transition-colors ${
                    mode === m ? "bg-[#003527] text-white shadow-sm" : "text-slate-500 hover:text-[#003527] hover:bg-slate-100"
                  }`}
                >
                  {m === "weekly" ? "Week Range" : "Daily"}
                </button>
              ))}
            </div>
          </div>

          {isWeekly ? (
            <div className="flex-1 sm:flex-none">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Week</label>
              <FilterSelect className="w-full sm:w-52" value={week} onChange={setWeek} label="Select week range">
                {weeks.map((w) => (
                  <option key={w} value={w}>{weekLabel(w)} ({w.slice(0, 4)})</option>
                ))}
              </FilterSelect>
            </div>
          ) : (
            <>
              <div className="flex-1 sm:flex-none">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Month</label>
                <FilterSelect className="w-full sm:w-44" value={month} onChange={setMonth} label="Select month">
                  {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </FilterSelect>
              </div>
              <div className="flex-1 sm:flex-none">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Day</label>
                <FilterSelect className="w-full sm:w-24" value={day} onChange={setDay} label="Select day">
                  {dayOptions.map((d) => <option key={d} value={d}>{Number(d)}</option>)}
                </FilterSelect>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 md:gap-4 mb-3 md:mb-4">
        {STATS.map(({ label, value, Icon, tint, valueTint }) => (
          <div key={label} className="p-2.5 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-slate-300 transition-all flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tint ?? "bg-teal-50 text-teal-700"}`}><Icon size={14} strokeWidth={1.75} /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className={`text-xl font-bold leading-tight tabular-nums ${valueTint ?? "text-[#003527]"}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="px-3 md:px-4 py-2 border-b border-slate-100 bg-linear-to-b from-slate-50/80 to-white flex flex-col gap-3">
          <div>
            <h4 className="text-lg font-semibold text-[#003527]">Daily Attendance &amp; Task Time</h4>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              Clock times shown in Arizona time · one row per project / task
            </p>
            {loading && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-teal-600">
                <LuRefreshCw size={12} className="animate-spin" /> Loading {dayLabel}…
              </p>
            )}
            {!loading && error && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
                {error}
                <button onClick={() => setReloadKey((k) => k + 1)} className="font-bold underline hover:no-underline">Retry</button>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <LuSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={nameSearch} onChange={(e) => setNameSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-800 outline-none transition-all hover:border-slate-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" />
              {nameSearch && (
                <button onClick={() => setNameSearch("")} aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 grid size-5 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <LuX size={13} />
                </button>
              )}
            </div>
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-44" value={payCategoryFilter} onChange={setPayCategoryFilter} label="Filter by pay category">
              <option value="All">All Pay Categories</option>
              {payCategoryOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </FilterSelect>
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-40" value={shiftTypeFilter} onChange={setShiftTypeFilter} label="Filter by shift type">
              <option value="All">All Shift Types</option>
              {shiftTypeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </FilterSelect>
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-40" value={countryFilter} onChange={setCountryFilter} label="Filter by country">
              <option value="All">All Countries</option>
              {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </FilterSelect>
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-48" value={teamFilter} onChange={setTeamFilter} label="Filter by assigned team">
              <option value="All">All Assigned Teams</option>
              {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </FilterSelect>
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-44" value={statusFilter} onChange={setStatusFilter} label="Filter by status">
              <option value="All">All Statuses</option>
              <option value={STATUS_LATE}>{STATUS_LATE}</option>
              <option value={STATUS_UNDERTIME}>{STATUS_UNDERTIME}</option>
              <option value={STATUS_OVER_BREAK}>{STATUS_OVER_BREAK}</option>
              <option value={STATUS_ABSENT}>{STATUS_ABSENT}</option>
              <option value={STATUS_WITHIN_BREAK}>{STATUS_WITHIN_BREAK}</option>
            </FilterSelect>

            <div className="flex items-center gap-2 ml-auto">
              {filtersActive && (
                <button onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors">
                  <LuX size={14} strokeWidth={2.5} /> Clear
                </button>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 whitespace-nowrap">
                <span className="font-bold text-[#003527]">{filteredRows.length}</span> shown
              </span>
            </div>
          </div>
        </div>

        {/* Table */}
        {/* Fills the window like a spreadsheet rather than a fixed slice of it:
            the offset leaves room for the header, tiles and toolbar above, and
            the floor keeps it usable on a short screen. */}
        <div className="overflow-auto" style={{ maxHeight: "max(520px, calc(100vh - 300px))" }}>
          <table className="w-full text-left" style={{ minWidth: 1280, borderCollapse: "separate", borderSpacing: 0 }}>
            <thead className="sticky top-0 z-20">
              <tr>
                <th className={headerCell} style={{ minWidth: 260, background: "#003527" }}>Contractor</th>
                <th className={headerCell} style={{ background: "#003527" }}>Assigned Team</th>
                <th className={headerCell} style={{ minWidth: 170, background: "#003527" }}>
                  {isWeekly ? "Day / Scheduled" : "Scheduled Time"}
                </th>
                <th className={headerCell} style={{ background: "#003527" }}>{isWeekly ? "Time In" : "Actual Time In"}</th>
                <th className={headerCell} style={{ background: "#003527" }}>{isWeekly ? "Time Out" : "Actual Time Out"}</th>
                <th className={headerCell} style={{ background: "#003527" }}>Project</th>
                <th className={headerCell} style={{ background: "#003527" }}>Task</th>
                <th className={`${headerCell} text-right`} style={{ background: "#003527" }}>Task Total Time</th>
                <th className={`${headerCell} text-center`} style={{ minWidth: 150, background: "#003527" }}>Status</th>
                <th className={`${headerCell} text-center`} style={{ background: "#003527" }}>Late</th>
                <th className={`${headerCell} text-center`} style={{ background: "#003527" }}>Half Day</th>
                <th className={`${headerCell} text-center`} style={{ background: "#003527" }}>Absent</th>
                <th className={`${headerCell} text-center`} style={{ background: "#003527" }}>NCNS</th>
                <th className={`${headerCell} text-center`} style={{ background: "#003527" }}>PTO</th>
                <th className={`${headerCell} text-center`} style={{ background: "#003527" }}>Sick Leave</th>
              </tr>
            </thead>
            <tbody>
              {loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-6 py-10 text-center text-sm font-medium text-slate-500">
                    <span className="inline-flex items-center gap-1.5"><LuRefreshCw size={14} className="animate-spin" /> Loading {dayLabel}…</span>
                  </td>
                </tr>
              )}
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-6 py-10 text-center text-sm font-medium text-slate-500">
                    {error ? (
                      <span className="inline-flex items-center gap-2 text-red-600">
                        {error}
                        <button onClick={() => setReloadKey((k) => k + 1)}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-200 rounded-md text-xs font-bold text-red-700 hover:bg-red-100">
                          <LuRefreshCw size={12} /> Retry
                        </button>
                      </span>
                    ) : `No attendance logged on ${dayLabel}.`}
                  </td>
                </tr>
              )}

              {/* Two layouts. Daily: one row per task, with the contractor and
                  clock columns spanning them. Week Range: one block per day —
                  the day's schedule and punches span that day's task rows, so
                  work and break line up under the day they belong to. Rendered
                  during a reload too, so switching period keeps the previous
                  view visible instead of blanking the table. */}
              {filteredRows.map((row) => {
                const cell = "px-3 md:px-4 py-2 text-sm text-slate-600 border-r border-b border-slate-100 align-top";
                const clockCell = "px-3 md:px-4 py-2 text-sm tabular-nums whitespace-nowrap border-r border-b border-slate-100 align-top";
                const breakMins = breakMinutesFor(row.tasks);
                const statuses = statusesFor(row);
                const kindTotals = minutesByKind(row.tasks);
                const rowKey = `${row.worksnapUserId || row.email}`;

                const contractorCell = (span: number) => (
                  <>
                    <td rowSpan={span} className={`${cell} overflow-hidden`} style={{ minWidth: 260 }}>
                      <p className="text-sm font-semibold text-slate-900">{row.userName}</p>
                      <p className="text-xs text-slate-500 truncate">{row.email || "No email"}</p>
                      <p className="text-xs font-semibold text-teal-700 mt-1 tabular-nums">
                        {isWeekly ? "Week total" : "Day total"}: {formatMinutes(row.totalMins)}
                        {isWeekly && <span className="text-slate-400 font-medium"> · {row.daysLogged}/{row.days} days</span>}
                      </p>
                      {/* Range-level exception summary. The Status column itself
                          is per day in Week Range, so the week's counts — which
                          the tiles and the Status filter both use — live here. */}
                      {isWeekly && statuses.length > 0 && (
                        <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-bold uppercase tracking-wide">
                          {statuses.includes(STATUS_LATE) && <span className="text-orange-700">Late {row.lateDays}d</span>}
                          {statuses.includes(STATUS_OVER_BREAK) && <span className="text-red-700">Over Break {row.overBreakDays}d</span>}
                          {statuses.includes(STATUS_UNDERTIME) && <span className="text-amber-700">Undertime {row.undertimeDays}d</span>}
                          {statuses.includes(STATUS_ABSENT) && <span className="text-slate-500">Absent all week</span>}
                        </p>
                      )}
                      {/* Split by kind, so work time is legible separately from
                          the breaks and meetings inside the total. */}
                      {row.tasks.length > 0 && (
                        <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-semibold tabular-nums">
                          {(["work", "meeting", "break"] as TaskKind[])
                            .filter((k) => kindTotals[k] > 0)
                            .map((k) => (
                              <span key={k} className={TASK_KIND_TEXT[k]}>
                                {TASK_KIND_LABEL[k]} {formatMinutes(kindTotals[k])}
                              </span>
                            ))}
                        </p>
                      )}
                    </td>
                    <td rowSpan={span} className={cell}>{row.department || <span className="text-slate-300">—</span>}</td>
                  </>
                );

                const statusCell = (span: number) => (
                  <td rowSpan={span} className="px-3 md:px-4 py-2 text-center border-r border-b border-slate-100 align-top" style={{ minWidth: 150 }}>
                    {statuses.length === 0 ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <span className="inline-flex flex-col items-center gap-1">
                        {statuses.includes(STATUS_LATE) && (
                          <span
                            title={isWeekly
                              ? `Late on ${row.lateDays} of ${row.days} days`
                              : `Clocked in at ${row.timeIn} — ${row.lateByMins} min after the ${row.shiftStart} shift start for this date (${LATE_GRACE_MINUTES} min grace applied)`}
                            className="inline-flex flex-col items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-bold text-orange-800 whitespace-nowrap"
                          >
                            {STATUS_LATE}
                            {isWeekly ? (
                              <span className="text-[10px] font-semibold text-orange-600 tabular-nums">{row.lateDays} {row.lateDays === 1 ? "day" : "days"}</span>
                            ) : row.lateByMins != null && (
                              <span className="text-[10px] font-semibold text-orange-600 tabular-nums">+{formatMinutes(row.lateByMins)}</span>
                            )}
                          </span>
                        )}
                        {statuses.includes(STATUS_ABSENT) && (
                          <span
                            title={isWeekly ? "No Worksnap time logged on any day in this range" : "No Worksnap time logged on this day"}
                            className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 whitespace-nowrap"
                          >
                            {STATUS_ABSENT}
                          </span>
                        )}
                        {statuses.includes(STATUS_OVER_BREAK) && (
                          <span
                            title={isWeekly
                              ? `Over the ${BREAK_ALLOWANCE_MINUTES} min break allowance on ${row.overBreakDays} of ${row.days} days`
                              : `${breakMins} min of break logged — ${breakMins - BREAK_ALLOWANCE_MINUTES} min over the ${BREAK_ALLOWANCE_MINUTES} min allowance`}
                            className="inline-flex flex-col items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700 whitespace-nowrap"
                          >
                            {STATUS_OVER_BREAK}
                            <span className="text-[10px] font-semibold text-red-500 tabular-nums">
                              {isWeekly ? `${row.overBreakDays} ${row.overBreakDays === 1 ? "day" : "days"}` : formatMinutes(breakMins)}
                            </span>
                          </span>
                        )}
                        {statuses.includes(STATUS_UNDERTIME) && (
                          <span
                            title={isWeekly
                              ? `Short of the scheduled day on ${row.undertimeDays} of ${row.days} days`
                              : `${row.totalMins} min logged — ${expectedMinutesFor(row) - row.totalMins} min short of the ${formatMinutes(expectedMinutesFor(row))} scheduled${row.shiftStart ? ` (${row.shiftStart} – ${row.shiftEnd})` : ""}`}
                            className="inline-flex flex-col items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 whitespace-nowrap"
                          >
                            {STATUS_UNDERTIME}
                            <span className="text-[10px] font-semibold text-amber-600 tabular-nums">
                              {isWeekly
                                ? `${row.undertimeDays} ${row.undertimeDays === 1 ? "day" : "days"}`
                                : `-${formatMinutes(expectedMinutesFor(row) - row.totalMins)}`}
                            </span>
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                );

                const taskCells = (task: TrackerTask | null, minutes: number, groupRule: string, startsGroup: boolean, kind: TaskKind | null) => (
                  <>
                    <td className={`px-3 md:px-4 py-2 text-sm text-slate-700 border-r border-b border-slate-100 ${groupRule}`}>
                      {startsGroup && kind && (
                        <span className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${TASK_KIND_TEXT[kind]}`}>
                          {TASK_KIND_LABEL[kind]}
                        </span>
                      )}
                      {task?.projectName || <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`px-3 md:px-4 py-2 text-sm text-slate-600 border-r border-b border-slate-100 ${groupRule}`}>
                      {task ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${taskChipColor(task)}`}>
                            {task.taskName || "Untitled task"}
                          </span>
                          {task.category && task.category !== "Work" && (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{task.category}</span>
                          )}
                        </span>
                      ) : <span className="text-slate-300">No task entries</span>}
                    </td>
                    <td className={`px-3 md:px-4 py-2 text-sm font-semibold text-slate-800 text-right tabular-nums whitespace-nowrap border-r border-b border-slate-100 ${groupRule}`}>
                      {task ? formatMinutes(minutes) : <span className="font-normal text-slate-300">—</span>}
                    </td>
                  </>
                );

                // ── Week Range: one block per day ──────────────────────────
                if (isWeekly) {
                  const plan = weekRenderRows(row);
                  const totalSpan = Math.max(1, plan.length);

                  return plan.map((entry, index) => {
                    const kind = entry.task ? taskKind(entry.task) : null;
                    // Group rules only apply within a day — a new day already
                    // has its own heavier rule across the row.
                    const prev = !entry.isFirstOfDay ? plan[index - 1] : null;
                    const prevKind = prev?.task ? taskKind(prev.task) : null;
                    const startsGroup = Boolean(kind) && kind !== prevKind;
                    const groupRule = startsGroup && !entry.isFirstOfDay ? "border-t-2 border-t-slate-200" : "";
                    const dayRule = entry.isFirstOfDay ? "border-t-2 border-t-slate-200" : "";

                    return (
                      <tr key={`${rowKey}-${entry.day.date}-${index}`} className="hover:bg-slate-50/80 transition-colors">
                        {index === 0 && contractorCell(totalSpan)}
                        {entry.isFirstOfDay && (
                          <>
                            {/* Day, its scheduled window and its punches, spanning
                                that day's task rows. */}
                            <td rowSpan={entry.dayRowSpan} className={`${clockCell} ${dayRule}`} style={{ minWidth: 150 }}>
                              <span className="block text-xs font-bold uppercase tracking-wider text-[#003527]">
                                {dayInitial(entry.day.date)} {parseIsoDate(entry.day.date).getDate()}
                              </span>
                              <span className="block text-[11px] font-semibold text-slate-500">
                                {entry.day.shiftStart && entry.day.shiftEnd ? `${entry.day.shiftStart} – ${entry.day.shiftEnd}` : "—"}
                              </span>
                              {entry.day.mins > 0 && (
                                <span className="block text-[11px] font-bold text-teal-700 mt-0.5">{formatMinutes(entry.day.mins)}</span>
                              )}
                            </td>
                            <td rowSpan={entry.dayRowSpan} className={`${clockCell} ${dayRule}`}>
                              {entry.day.timeIn
                                ? <span className={`font-semibold ${entry.day.isLate ? "text-orange-700" : "text-slate-800"}`}>{entry.day.timeIn}</span>
                                : <span className="text-slate-300">—</span>}
                              {entry.day.isLate && entry.day.lateByMins != null && (
                                <span className="block text-[10px] font-semibold text-orange-600">+{formatMinutes(entry.day.lateByMins)} late</span>
                              )}
                            </td>
                            <td rowSpan={entry.dayRowSpan} className={`${clockCell} ${dayRule}`}>
                              {entry.day.timeOut
                                ? <span className="font-semibold text-slate-800">{entry.day.timeOut}</span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                          </>
                        )}
                        {taskCells(entry.task, entry.minutes, entry.isFirstOfDay ? dayRule : groupRule, startsGroup, kind)}
                        {/* Status is per day here, spanning that day's task rows,
                            so a verdict sits against the day that earned it. The
                            week's counts are summarised in the contractor cell. */}
                        {entry.isFirstOfDay && (
                          <>
                            <td rowSpan={entry.dayRowSpan} className={`px-3 md:px-4 py-2 text-center border-r border-b border-slate-100 align-top ${dayRule}`} style={{ minWidth: 150 }}>
                              <DayStatusBadges day={entry.day} />
                            </td>
                            {/* Late and Absent are per day, like the rest of the block. */}
                            <td rowSpan={entry.dayRowSpan} className={`px-3 md:px-4 py-2 text-center border-r border-b border-slate-100 align-top ${dayRule}`}>
                              <LateFlag isLate={entry.day.isLate} byMins={entry.day.lateByMins} />
                            </td>
                            <td rowSpan={entry.dayRowSpan} className={`px-3 md:px-4 py-2 text-center border-r border-b border-slate-100 align-top ${dayRule}`}>
                              <HalfDayFlag isHalfDay={entry.day.isHalfDay} mins={entry.day.mins} />
                            </td>
                            <td rowSpan={entry.dayRowSpan} className={`px-3 md:px-4 py-2 text-center border-r border-b border-slate-100 align-top ${dayRule}`}>
                              <AbsentFlag code={entry.day.absenceCode} mins={entry.day.mins} />
                            </td>
                            <td rowSpan={entry.dayRowSpan} className={`px-3 md:px-4 py-2 text-center border-r border-b border-slate-100 align-top ${dayRule}`}>
                              <NcnsFlag
                                day={entry.day}
                                onClick={() => setNcnsTarget({ email: row.email, name: row.userName, date: entry.day.date, day: entry.day })}
                              />
                            </td>
                            <td rowSpan={entry.dayRowSpan} className={`px-3 md:px-4 py-2 text-center border-r border-b border-slate-100 align-top ${dayRule}`}>
                              <LeaveFlag type={entry.day.ptoType} label="PTO" className="text-blue-700" />
                            </td>
                            <td rowSpan={entry.dayRowSpan} className={`px-3 md:px-4 py-2 text-center border-b border-slate-100 align-top ${dayRule}`}>
                              <LeaveFlag type={entry.day.silType} label="SIL" className="text-teal-700" />
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  });
                }

                // ── Daily: one row per task ────────────────────────────────
                const span = Math.max(1, row.tasks.length);
                return (row.tasks.length > 0 ? row.tasks : [null]).map((task, taskIndex) => {
                  const kind = task ? taskKind(task) : null;
                  const prevKind = taskIndex > 0 ? taskKind(row.tasks[taskIndex - 1]) : null;
                  const startsGroup = Boolean(kind) && kind !== prevKind;
                  const groupRule = startsGroup && taskIndex > 0 ? "border-t-2 border-t-slate-200" : "";

                  return (
                    <tr key={`${rowKey}-${taskIndex}`} className="hover:bg-slate-50/80 transition-colors">
                      {taskIndex === 0 && (
                        <>
                          {contractorCell(span)}
                          <td rowSpan={span} className={clockCell} style={{ minWidth: 170 }}>
                            {row.shiftStart && row.shiftEnd ? (
                              <>
                                <span className="font-semibold text-slate-800">{row.shiftStart} – {row.shiftEnd}</span>
                                {row.expectedMins != null && row.expectedMins > 0 && (
                                  <span className="block text-[10px] font-semibold text-slate-400">{formatMinutes(row.expectedMins)} scheduled</span>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td rowSpan={span} className={`${clockCell} font-semibold text-slate-800`}>
                            {row.timeIn ?? <span className="font-normal text-slate-300">—</span>}
                          </td>
                          <td rowSpan={span} className={`${clockCell} font-semibold text-slate-800`}>
                            {row.timeOut ?? <span className="font-normal text-slate-300">—</span>}
                          </td>
                        </>
                      )}
                      {taskCells(task, task?.minutes ?? 0, groupRule, startsGroup, kind)}
                      {taskIndex === 0 && (
                        <>
                          {statusCell(span)}
                          <td rowSpan={span} className="px-3 md:px-4 py-2 text-center border-r border-b border-slate-100 align-top">
                            <LateFlag isLate={row.isLate} byMins={row.lateByMins} />
                          </td>
                          {/* Daily mode is a single date, so the day's own verdicts are the row's. */}
                          <td rowSpan={span} className="px-3 md:px-4 py-2 text-center border-r border-b border-slate-100 align-top">
                            <HalfDayFlag
                              isHalfDay={row.perDay[0]?.isHalfDay ?? false}
                              mins={row.perDay[0]?.mins ?? row.totalMins}
                            />
                          </td>
                          <td rowSpan={span} className="px-3 md:px-4 py-2 text-center border-r border-b border-slate-100 align-top">
                            <AbsentFlag
                              code={row.perDay[0]?.absenceCode ?? "No"}
                              mins={row.perDay[0]?.mins ?? row.totalMins}
                            />
                          </td>
                          <td rowSpan={span} className="px-3 md:px-4 py-2 text-center border-r border-b border-slate-100 align-top">
                            {row.perDay[0] && (
                              <NcnsFlag
                                day={row.perDay[0]}
                                onClick={() => setNcnsTarget({ email: row.email, name: row.userName, date: row.perDay[0].date, day: row.perDay[0] })}
                              />
                            )}
                          </td>
                          <td rowSpan={span} className="px-3 md:px-4 py-2 text-center border-r border-b border-slate-100 align-top">
                            <LeaveFlag type={row.perDay[0]?.ptoType ?? ""} label="PTO" className="text-blue-700" />
                          </td>
                          <td rowSpan={span} className="px-3 md:px-4 py-2 text-center border-b border-slate-100 align-top">
                            <LeaveFlag type={row.perDay[0]?.silType ?? ""} label="SIL" className="text-teal-700" />
                          </td>
                        </>
                      )}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>

        <div className="px-3 md:px-4 py-2 border-t border-slate-100 text-xs text-slate-500">
          Actual Time In / Out are the real clock instants from Worksnap (not the rounded 10-minute buckets), shown in
          Arizona time. Assigned Team comes from Contractor Details and reads <span className="text-slate-300">—</span> for anyone
          not yet added there. <span className="font-semibold">NCNS</span> reads {NCNS_YES_LABEL} on an unexplained absence and is
          blank otherwise; click any cell to record {NCNS_NO_LABEL} or {NCNS_YES_LABEL} with a reason. An override is
          underlined and carries its reason in the tooltip.
        </div>
      </div>

      {ncnsTarget && (
        <NcnsDialog
          target={ncnsTarget}
          onClose={() => setNcnsTarget(null)}
          onSaved={applyNcnsChange}
        />
      )}
    </div>
  );
}
