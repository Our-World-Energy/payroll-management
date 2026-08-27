"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { LuArrowLeft, LuClock, LuCoffee, LuRefreshCw, LuSearch, LuTriangleAlert, LuUserCheck, LuUsers, LuUserX, LuX } from "react-icons/lu";
import { FilterSelect } from "@/components/FilterSelect";
import { arizonaTodayIso, parseIsoDate } from "@/lib/weekUtils";
import { countryFromLocation } from "@/lib/countryTimeZones";

type TrackerTask = { projectName: string; taskName: string; category: string; minutes: number };

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
};

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

function taskChipColor(task: TrackerTask) {
  const label = `${task.category} ${task.taskName}`.toLowerCase();
  if (isBreakTask(task)) return TASK_COLOR_BREAK;
  if (label.includes("meeting") || label.includes("training")) return TASK_COLOR_MEETING;
  return TASK_COLOR_WORK;
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

// Single source of truth for the Status column, the Status filter and the stat
// tiles, so none of the three can disagree about what a row's status is.
function statusesFor(row: TrackerRow) {
  const statuses: string[] = [];
  if (row.isLate) statuses.push(STATUS_LATE);
  if (breakMinutesFor(row.tasks) > BREAK_ALLOWANCE_MINUTES) statuses.push(STATUS_OVER_BREAK);
  // No time logged at all is Absent, not Undertime — otherwise every absence
  // would be counted twice across the two tiles.
  if (row.totalMins === 0) statuses.push(STATUS_ABSENT);
  else if (row.totalMins < expectedMinutesFor(row)) statuses.push(STATUS_UNDERTIME);
  return statuses;
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export default function AttendanceTrackerPage() {
  const todayIso = useMemo(() => arizonaTodayIso(), []);
  const months = useMemo(() => recentMonths(todayIso), [todayIso]);

  const [month, setMonth] = useState(todayIso.slice(0, 7));
  const [day, setDay] = useState(todayIso.slice(8, 10));
  const [nameSearch, setNameSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("All");
  const [payCategoryFilter, setPayCategoryFilter] = useState("All");
  const [shiftTypeFilter, setShiftTypeFilter] = useState("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const [rows, setRows] = useState<TrackerRow[]>([]);
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

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        // Trailing slash matches next.config's trailingSlash: true, so this
        // hits the route directly instead of taking a 308 on every day change.
        const response = await fetchWithRetry(`/api/attendance/tracker/?date=${encodeURIComponent(date)}`);
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
        setError(`Unable to load attendance for ${date}. ${reason}`);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [date, reloadKey]);

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
    for (const row of filteredRows) {
      const statuses = statusesFor(row);
      if (statuses.includes(STATUS_LATE)) late++;
      if (statuses.includes(STATUS_UNDERTIME)) undertime++;
      if (statuses.includes(STATUS_OVER_BREAK)) overBreak++;
      if (row.isActiveContractor) {
        activeContractors++;
        if (row.totalMins > 0) present++;
        else absent++;
      }
    }
    return { late, undertime, overBreak, absent, activeContractors, present };
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

  const dayLabel = useMemo(() => {
    try {
      return parseIsoDate(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    } catch {
      return date;
    }
  }, [date]);

  // Exception counts only — each tile is tinted to match its pill in the
  // Status column, and each counts the rows currently passing the filters.
  const STATS = [
    { label: STATUS_LATE, value: totals.late.toLocaleString(), Icon: LuClock, tint: "bg-orange-50 text-orange-700", valueTint: "text-orange-700" },
    { label: STATUS_UNDERTIME, value: totals.undertime.toLocaleString(), Icon: LuTriangleAlert, tint: "bg-amber-50 text-amber-700", valueTint: "text-amber-700" },
    { label: STATUS_OVER_BREAK, value: totals.overBreak.toLocaleString(), Icon: LuCoffee, tint: "bg-red-50 text-red-700", valueTint: "text-red-700" },
    { label: "Active Contractors", value: totals.activeContractors.toLocaleString(), Icon: LuUsers, tint: "bg-teal-50 text-teal-700", valueTint: "text-[#003527]" },
    { label: "Present Today", value: totals.present.toLocaleString(), Icon: LuUserCheck, tint: "bg-emerald-50 text-emerald-700", valueTint: "text-emerald-700" },
    { label: STATUS_ABSENT, value: totals.absent.toLocaleString(), Icon: LuUserX, tint: "bg-slate-100 text-slate-600", valueTint: "text-slate-700" },
  ];

  const headerCell = "px-4 md:px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-white whitespace-nowrap border-r border-b border-white/20 last:border-r-0";

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-full overflow-x-hidden">
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
              Daily clock-in / clock-out and task time · <span className="font-semibold text-slate-700">{dayLabel}</span>
            </p>
          </div>
        </div>

        {/* Day selection — Month then Day */}
        <div className="flex items-end gap-2 w-full sm:w-auto">
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
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 mb-3 md:mb-4">
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
        <div className="px-4 md:px-6 py-3 border-b border-slate-100 bg-linear-to-b from-slate-50/80 to-white flex flex-col gap-3">
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
        <div className="overflow-auto" style={{ maxHeight: "65vh" }}>
          <table className="w-full text-left" style={{ minWidth: 1280, borderCollapse: "separate", borderSpacing: 0 }}>
            <thead className="sticky top-0 z-20">
              <tr>
                <th className={headerCell} style={{ minWidth: 260, background: "#003527" }}>Contractor</th>
                <th className={headerCell} style={{ background: "#003527" }}>Assigned Team</th>
                <th className={headerCell} style={{ minWidth: 170, background: "#003527" }}>Scheduled Time</th>
                <th className={headerCell} style={{ background: "#003527" }}>Actual Time In</th>
                <th className={headerCell} style={{ background: "#003527" }}>Actual Time Out</th>
                <th className={headerCell} style={{ background: "#003527" }}>Project</th>
                <th className={headerCell} style={{ background: "#003527" }}>Task</th>
                <th className={`${headerCell} text-right`} style={{ background: "#003527" }}>Task Total Time</th>
                <th className={`${headerCell} text-center`} style={{ minWidth: 150, background: "#003527" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-sm font-medium text-slate-500">
                    <span className="inline-flex items-center gap-1.5"><LuRefreshCw size={14} className="animate-spin" /> Loading {dayLabel}…</span>
                  </td>
                </tr>
              )}
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-sm font-medium text-slate-500">
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

              {/* One <tbody>-like group per contractor: the identity and clock
                  columns span that contractor's task rows so they read once.
                  Rendered during a reload too, so switching days keeps the
                  previous day visible instead of blanking the table. */}
              {filteredRows.map((row) => {
                const span = Math.max(1, row.tasks.length);
                const cell = "px-4 md:px-6 py-3 text-sm text-slate-600 border-r border-b border-slate-100 align-top";
                const clockCell = "px-4 md:px-6 py-3 text-sm tabular-nums whitespace-nowrap border-r border-b border-slate-100 align-top";
                const breakMins = breakMinutesFor(row.tasks);
                const statuses = statusesFor(row);

                return (row.tasks.length > 0 ? row.tasks : [null]).map((task, taskIndex) => (
                  // Absent rows come from the roster and share worksnapUserId 0,
                  // so the email keeps their keys distinct.
                  <tr key={`${row.worksnapUserId || row.email}-${taskIndex}`} className="hover:bg-slate-50/80 transition-colors">
                    {taskIndex === 0 && (
                      <>
                        <td rowSpan={span} className={`${cell} overflow-hidden`} style={{ minWidth: 260 }}>
                          <p className="text-sm font-semibold text-slate-900">{row.userName}</p>
                          <p className="text-xs text-slate-500 truncate">{row.email || "No email"}</p>
                          <p className="text-xs font-semibold text-teal-700 mt-1 tabular-nums">Day total: {formatMinutes(row.totalMins)}</p>
                        </td>
                        <td rowSpan={span} className={cell}>{row.department || <span className="text-slate-300">—</span>}</td>
                        {/* Scheduled Time — the shift window in force on this
                            date, which for a Shifting Schedule contractor comes
                            from that date's own row and changes day to day. It's
                            what Late and Undertime are judged against. */}
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
                    <td className="px-4 md:px-6 py-3 text-sm text-slate-700 border-r border-b border-slate-100">
                      {task?.projectName || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 md:px-6 py-3 text-sm text-slate-600 border-r border-b border-slate-100">
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
                    <td className="px-4 md:px-6 py-3 text-sm font-semibold text-slate-800 text-right tabular-nums whitespace-nowrap border-r border-b border-slate-100">
                      {task ? formatMinutes(task.minutes) : <span className="font-normal text-slate-300">—</span>}
                    </td>
                    {taskIndex === 0 && (
                      <td rowSpan={span} className="px-4 md:px-6 py-3 text-center border-b border-slate-100 align-top" style={{ minWidth: 150 }}>
                        {statuses.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span className="inline-flex flex-col items-center gap-1">
                            {statuses.includes(STATUS_LATE) && (
                              <span
                                title={`Clocked in at ${row.timeIn} — ${row.lateByMins} min after the ${row.shiftStart} shift start for this date (15 min grace applied)`}
                                className="inline-flex flex-col items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-bold text-orange-800 whitespace-nowrap"
                              >
                                {STATUS_LATE}
                                {row.lateByMins != null && (
                                  <span className="text-[10px] font-semibold text-orange-600 tabular-nums">+{formatMinutes(row.lateByMins)}</span>
                                )}
                              </span>
                            )}
                            {statuses.includes(STATUS_ABSENT) && (
                              <span
                                title="No Worksnap time logged on this day"
                                className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 whitespace-nowrap"
                              >
                                {STATUS_ABSENT}
                              </span>
                            )}
                            {statuses.includes(STATUS_OVER_BREAK) && (
                              <span
                                title={`${breakMins} min of break logged — ${breakMins - BREAK_ALLOWANCE_MINUTES} min over the ${BREAK_ALLOWANCE_MINUTES} min allowance`}
                                className="inline-flex flex-col items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700 whitespace-nowrap"
                              >
                                {STATUS_OVER_BREAK}
                                <span className="text-[10px] font-semibold text-red-500 tabular-nums">{formatMinutes(breakMins)}</span>
                              </span>
                            )}
                            {statuses.includes(STATUS_UNDERTIME) && (
                              <span
                                title={`${row.totalMins} min logged — ${expectedMinutesFor(row) - row.totalMins} min short of the ${formatMinutes(expectedMinutesFor(row))} scheduled${row.shiftStart ? ` (${row.shiftStart} – ${row.shiftEnd})` : ""}`}
                                className="inline-flex flex-col items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 whitespace-nowrap"
                              >
                                {STATUS_UNDERTIME}
                                <span className="text-[10px] font-semibold text-amber-600 tabular-nums">
                                  -{formatMinutes(expectedMinutesFor(row) - row.totalMins)}
                                </span>
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 md:px-6 py-3 border-t border-slate-100 text-xs text-slate-500">
          Actual Time In / Out are the real clock instants from Worksnap (not the rounded 10-minute buckets), shown in
          Arizona time. Assigned Team comes from Contractor Details and reads <span className="text-slate-300">—</span> for anyone
          not yet added there.
        </div>
      </div>
    </div>
  );
}
