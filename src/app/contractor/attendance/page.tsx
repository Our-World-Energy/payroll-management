"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchContractorProfileByEmail, type ContractorProfile } from "../profile/actions";
import { fetchAllLeaveRequests, type LeaveRequest } from "../time-off/actions";
import { fetchHolidays, type Holiday } from "@/app/admin/holidays/actions";
import { parseIsoDate, toIsoDate, sundayOf, addDaysIso, datesBetween, arizonaTodayIso } from "@/lib/weekUtils";
import { ARIZONA_TIME_ZONE, countryFromLocation } from "@/lib/countryTimeZones";
import {
  LuLoader, LuChevronLeft, LuChevronRight, LuCalendar, LuTimer,
  LuCircleCheck, LuBadgeCheck, LuClock,
} from "react-icons/lu";

// Standard shift = 8 hours (matches Attendance Review / Payroll's 480-min shift).
const STANDARD_SHIFT_MINUTES = 480;

// Raw per-day log from /api/attendance/daily-log — firstIn/lastOut are ISO
// instants (formatted in Arizona time here), totalMins is the Worksnap actual
// daily total (sum of durations), same value shown on the admin side.
type DailyLog = {
  entryDate: string;
  firstIn:   string;
  lastOut:   string;
  totalMins: number;
};

type DayData = { mins: number; firstIn?: string; lastOut?: string };

// One project/task row from /api/attendance/user-breakdown, narrowed down to
// a single day's minutes (that endpoint returns a whole Sun→Sat week's worth
// of tasks, each carrying a perDay breakdown — see dayTasksFor below).
type DayTask = { projectName: string; taskName: string; category: string; mins: number };

// contractor_profiles.restDay is stored as full weekday names ("Saturday,
// Sunday") — same convention Attendance Review parses against.
function isRestDayDate(dateIso: string, restDaysStr: string) {
  if (!restDaysStr || restDaysStr === "-") return false;
  const dayName = parseIsoDate(dateIso).toLocaleDateString("en-US", { weekday: "long" });
  return restDaysStr.split(",").map((d) => d.trim()).includes(dayName);
}

// Short badge initial for a date covered by the contractor's own APPROVED
// leave request — "PTO" for PTO (full or half day), "ML" (Medical Leave) for
// Sick Leave (full or half day). Pending/Rejected requests don't count.
function leaveInitialFor(date: string, requests: LeaveRequest[]): string | null {
  const match = requests.find((r) => r.status === "Approved" && date >= r.startDate && date <= r.endDate);
  if (!match) return null;
  return match.type.startsWith("PTO") ? "PTO" : "ML";
}

// Short badge initial for a date that's a recognized Holiday — "USO" for a US
// Holiday, "LHO" for a Holiday in the contractor's own country (skipped when
// that's also "United States", so a US contractor never gets both labels).
function holidayInitialFor(date: string, holidays: Holiday[], country: string): string | null {
  if (holidays.some((h) => h.date === date && h.country === "United States")) return "USO";
  if (country && country !== "United States" && holidays.some((h) => h.date === date && h.country === country)) return "LHO";
  return null;
}

function fmtTime(iso: string, timeZone: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone,
  });
}

function fmtHours(mins: number) {
  return `${(mins / 60).toFixed(1)} hrs`;
}

// Combined hours/minutes for per-day displays (Calendar cells, Daily Logs),
// e.g. 480 -> "8h/480m" — whole hours (floored) alongside the exact total
// minutes, rather than either figure alone.
function fmtHoursMinutes(mins: number) {
  return `${Math.floor(mins / 60)}h/${mins}m`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Compact radial progress indicator for the weekly-total stat card. The svg is
// rotated so the arc begins at 12 o'clock; the % label is rendered separately
// (unrotated) by the caller.
function ProgressRing({ pct }: { pct: number }) {
  const size = 58, stroke = 6;
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(pct, 100)) / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <defs>
        <linearGradient id="attn-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#10b981" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f0" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#attn-ring)"
        strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
      />
    </svg>
  );
}

export default function ContractorAttendancePage() {
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState("");
  const [profile, setProfile]   = useState<ContractorProfile | null>(null);
  // Query fragment used to scope the daily-log lookups: "userId=<id>" when the
  // profile has a Worksnap ID, otherwise "email=<email>" (worksnapId is often
  // blank, but worksnap_daily_log is populated by email). null = no source.
  const [logQuery, setLogQuery] = useState<string | null>(null);

  // calendar month being viewed (first day of that month, ISO)
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const t = arizonaTodayIso();
    return t.slice(0, 8) + "01";
  });
  const [monthData, setMonthData] = useState<Record<string, DayData>>({});
  const [monthLoading, setMonthLoading] = useState(false);

  // current week / today / month summary figures (always "now", independent of
  // the month the calendar is scrolled to)
  const [summary, setSummary] = useState({ weekMins: 0, expectedWeekMins: 0, lastWeekMins: 0, expectedLastWeekMins: 0, todayMins: 0, monthMins: 0 });

  // This contractor's own leave requests and every Holiday on file — fetched
  // once (not per-month), used to badge PTO/Medical Leave/Holiday days on the
  // calendar regardless of which month is being viewed.
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  // The date the Daily Logs panel is showing — defaults to today until a
  // calendar day is clicked, then narrows to exactly that one day.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayTasks, setDayTasks] = useState<DayTask[]>([]);
  const [dayTasksLoading, setDayTasksLoading] = useState(false);

  const today = arizonaTodayIso();
  const activeDate = selectedDate ?? today;

  // ── initial load: profile (worksnapId, restDay) + current-period summary ──
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) { router.replace("/login"); return; }
      const sessionEmail = session.user.email;

      const prof = await fetchContractorProfileByEmail(sessionEmail);
      if (!prof) { setError("Profile not found."); setLoading(false); return; }
      setProfile(prof);

      // Prefer the mapped Worksnap ID; fall back to email (the reliable key,
      // since worksnapId is frequently blank on the profile).
      const wid = Number(prof.worksnapId);
      const query = prof.worksnapId && !Number.isNaN(wid)
        ? `userId=${wid}`
        : `email=${encodeURIComponent(sessionEmail)}`;
      setLogQuery(query);

      fetchAllLeaveRequests(sessionEmail).then(setLeaveRequests).catch(() => setLeaveRequests([]));
      fetchHolidays().then(setHolidays).catch(() => setHolidays([]));

      // Summary window covers last week, this week, and the current month up to today.
      const weekStart     = sundayOf(today);
      const lastWeekStart = addDaysIso(weekStart, -7);
      const monthStart    = today.slice(0, 8) + "01";
      const from = lastWeekStart < monthStart ? lastWeekStart : monthStart;
      try {
        const res  = await fetch(`/api/attendance/daily-log?from=${from}&to=${today}&${query}`);
        const json = res.ok ? await res.json() : { logs: [] };
        const byDate = new Map<string, number>();
        for (const log of (json.logs ?? []) as DailyLog[]) {
          byDate.set(log.entryDate.slice(0, 10), log.totalMins ?? 0);
        }

        const weekDates     = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
        const lastWeekDates = Array.from({ length: 7 }, (_, i) => addDaysIso(lastWeekStart, i));
        const restStr    = prof.restDay ?? "";
        const weekMins   = weekDates.reduce((sum, d) => sum + (byDate.get(d) ?? 0), 0);
        const expectedWeekMins = weekDates.filter((d) => !isRestDayDate(d, restStr)).length * STANDARD_SHIFT_MINUTES;
        const lastWeekMins = lastWeekDates.reduce((sum, d) => sum + (byDate.get(d) ?? 0), 0);
        const expectedLastWeekMins = lastWeekDates.filter((d) => !isRestDayDate(d, restStr)).length * STANDARD_SHIFT_MINUTES;
        const monthEnd   = today;
        const monthMins  = datesBetween(monthStart, monthEnd).reduce((sum, d) => sum + (byDate.get(d) ?? 0), 0);

        setSummary({ weekMins, expectedWeekMins, lastWeekMins, expectedLastWeekMins, todayMins: byDate.get(today) ?? 0, monthMins });
      } catch { /* leave zeros */ }

      setLoading(false);
    })();
  }, [router, today]);

  // ── load the calendar grid for the viewed month ──
  const loadMonth = useCallback(async (query: string, anchor: string, zone: string) => {
    setMonthLoading(true);
    const gridStart = sundayOf(anchor);                     // Sunday on/before the 1st
    const lastOfMonth = toIsoDate(new Date(parseIsoDate(anchor).getFullYear(), parseIsoDate(anchor).getMonth() + 1, 0));
    const gridEnd   = addDaysIso(sundayOf(lastOfMonth), 6); // Saturday on/after the last day
    try {
      const res  = await fetch(`/api/attendance/daily-log?from=${gridStart}&to=${gridEnd}&${query}`);
      const json = res.ok ? await res.json() : { logs: [] };
      const map: Record<string, DayData> = {};
      for (const log of (json.logs ?? []) as DailyLog[]) {
        map[log.entryDate.slice(0, 10)] = {
          mins:    log.totalMins ?? 0,
          firstIn: log.firstIn ? fmtTime(log.firstIn, zone) : undefined,
          lastOut: log.lastOut ? fmtTime(log.lastOut, zone) : undefined,
        };
      }
      setMonthData(map);
    } catch {
      setMonthData({});
    }
    setMonthLoading(false);
  }, []);

  useEffect(() => {
    if (logQuery != null) loadMonth(logQuery, monthAnchor, ARIZONA_TIME_ZONE);
  }, [logQuery, monthAnchor, loadMonth]);

  // ── project/task breakdown for the Daily Logs panel's active date ──
  // /api/attendance/user-breakdown only accepts a Worksnap userId (not
  // email) and returns a whole Sun→Sat week at once — fetched for the
  // week containing activeDate, then narrowed down to just that date.
  useEffect(() => {
    const wid = Number(profile?.worksnapId);
    if (!profile?.worksnapId || Number.isNaN(wid)) { setDayTasks([]); return; }

    let isCancelled = false;
    setDayTasksLoading(true);
    const weekStart = sundayOf(activeDate);
    fetch(`/api/attendance/user-breakdown?userId=${wid}&week=${weekStart}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { tasks?: { projectName: string; taskName: string; category: string; perDay?: Record<string, number> }[] } | null) => {
        if (isCancelled) return;
        const rows: DayTask[] = (json?.tasks ?? [])
          .map((t) => ({ projectName: t.projectName, taskName: t.taskName, category: t.category, mins: t.perDay?.[activeDate] ?? 0 }))
          .filter((t) => t.mins > 0)
          .sort((a, b) => b.mins - a.mins);
        setDayTasks(rows);
      })
      .catch(() => { if (!isCancelled) setDayTasks([]); })
      .finally(() => { if (!isCancelled) setDayTasksLoading(false); });

    return () => { isCancelled = true; };
  }, [activeDate, profile?.worksnapId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LuLoader size={28} className="text-slate-300 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-sm">{error}</div>
    );
  }

  const restStr = profile?.restDay ?? "";
  const contractorCountry = countryFromLocation(profile?.location || "");

  // ── calendar grid cells ──
  const anchorDate  = parseIsoDate(monthAnchor);
  const monthIndex  = anchorDate.getMonth();
  const monthYear   = anchorDate.getFullYear();
  const gridStart   = sundayOf(monthAnchor);
  const lastOfMonth = toIsoDate(new Date(monthYear, monthIndex + 1, 0));
  const gridEnd     = addDaysIso(sundayOf(lastOfMonth), 6);
  const gridDays    = datesBetween(gridStart, gridEnd);

  // Switching months resets the Daily Logs selection back to the default
  // (today) rather than keeping a selected date whose data no longer belongs
  // to the month just loaded.
  const goPrevMonth = () => { setMonthAnchor(toIsoDate(new Date(monthYear, monthIndex - 1, 1))); setSelectedDate(null); };
  const goNextMonth = () => { setMonthAnchor(toIsoDate(new Date(monthYear, monthIndex + 1, 1))); setSelectedDate(null); };

  const weekPct = summary.expectedWeekMins > 0
    ? Math.min(Math.round((summary.weekMins / summary.expectedWeekMins) * 100), 100)
    : 0;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* ── Page header ── */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="h-px w-8 bg-emerald-600/50" />
            <span className="text-[8.8px] font-bold uppercase tracking-[0.22em] text-emerald-700">Contractor Portal</span>
          </div>
          <h2 className="text-[1.8rem] md:text-[2.16rem] font-bold text-[#003527] leading-none" style={{ letterSpacing: "-0.025em" }}>
            Attendance Logs
          </h2>
          <p className="text-slate-500 mt-1.5 text-[0.8rem]">Track your hours and efficiency for the current pay cycle.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-white border border-slate-200/80 rounded-full pl-3.5 pr-4 py-1.5 shadow-sm self-start md:self-auto">
          <LuClock size={13} strokeWidth={2} className="text-emerald-600" />
          {new Date(today + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
        </div>
      </header>

      {logQuery == null ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 grid place-items-center mx-auto mb-4">
            <LuTimer size={24} className="text-slate-300" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-semibold text-slate-600">No time tracking linked yet</p>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
            Attendance logs will appear here once Worksnap time tracking is set up on your profile.
          </p>
        </div>
      ) : (
        <>
          {/* ── Summary stats ── */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Weekly total + progress ring */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow flex items-center gap-3.5">
              <div className="relative grid place-items-center">
                <ProgressRing pct={weekPct} />
                <span className="absolute text-xs font-bold text-[#003527] tabular-nums">{weekPct}%</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.14em]">This Week</p>
                <p className="text-xl font-bold text-[#003527] mt-1 leading-none tabular-nums">{fmtHours(summary.weekMins)}</p>
                <p className="text-[11px] text-slate-400 mt-1 tabular-nums">of {fmtHours(summary.expectedWeekMins)} target</p>
                <p className="text-[11px] text-slate-400 mt-1.5 pt-1.5 border-t border-slate-100 tabular-nums">
                  Last Week: <span className="font-semibold text-slate-600">{fmtHours(summary.lastWeekMins)}</span>
                  <span className="text-slate-300"> / {fmtHours(summary.expectedLastWeekMins)}</span>
                </p>
              </div>
            </div>

            {/* Today */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.14em] mt-0.5">Today</p>
                <span className="grid place-items-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600">
                  <LuTimer size={16} strokeWidth={2} />
                </span>
              </div>
              <p className="text-2xl font-bold text-[#003527] mt-2 leading-none tabular-nums">{fmtHours(summary.todayMins)}</p>
              <p className="text-[11px] text-slate-400 mt-1.5 tabular-nums">{summary.todayMins.toLocaleString()} minutes logged</p>
            </div>

            {/* Typical Non-Working Days — deep brand-gradient accent */}
            <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-sm bg-brand-gradient">
              <div className="absolute inset-0 bg-grid-soft opacity-70 pointer-events-none" />
              <div className="relative flex flex-col h-full">
                <div className="flex items-start justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200/80 mt-0.5">Typical Non-Working Days</p>
                  <span className="grid place-items-center w-8 h-8 rounded-lg bg-white/10 text-emerald-300">
                    <LuBadgeCheck size={16} strokeWidth={2} />
                  </span>
                </div>
                <p className="text-base font-bold mt-2 leading-tight">{restStr && restStr !== "-" ? restStr : "None set"}</p>
                <p className="text-[11px] text-emerald-200/70 mt-auto pt-1.5">{profile?.shiftType || "Fixed"} shift</p>
              </div>
            </div>
          </section>

          {/* ── Calendar + daily logs ── */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Calendar */}
            <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-base font-bold text-[#003527] flex items-center gap-2">
                  <span className="grid place-items-center w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700">
                    <LuCalendar size={15} strokeWidth={2} />
                  </span>
                  {MONTHS[monthIndex]} {monthYear}
                </h3>
                <div className="flex items-center gap-1">
                  {monthLoading && <LuLoader size={15} className="text-slate-300 animate-spin mr-1" />}
                  <button onClick={goPrevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
                    <LuChevronLeft size={17} strokeWidth={2} />
                  </button>
                  <button onClick={goNextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
                    <LuChevronRight size={17} strokeWidth={2} />
                  </button>
                </div>
              </div>

              <div className="p-3 md:p-4">
                {/* Weekday header */}
                <div className="grid grid-cols-7 mb-1.5">
                  {WEEKDAYS.map((d) => (
                    <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">{d}</div>
                  ))}
                </div>
                {/* Day grid */}
                <div className="grid grid-cols-7 gap-1">
                  {gridDays.map((d) => {
                    const inMonth = parseIsoDate(d).getMonth() === monthIndex;
                    const isToday = d === today;
                    const rest    = isRestDayDate(d, restStr);
                    const mins    = monthData[d]?.mins ?? 0;
                    // Above the 480-min standard shift is flagged yellow (overtime),
                    // exactly 480 stays green (meets it exactly), under 480 is red (short).
                    const isOver  = mins > STANDARD_SHIFT_MINUTES;
                    const isExact = mins === STANDARD_SHIFT_MINUTES;
                    const dayNum  = parseIsoDate(d).getDate();
                    // PTO/Medical Leave (this contractor's own approved requests) takes
                    // priority for display over a Holiday, since the two are rarely both
                    // true for the same date — see leaveInitialFor/holidayInitialFor.
                    const dayBadge = inMonth
                      ? leaveInitialFor(d, leaveRequests) ?? holidayInitialFor(d, holidays, contractorCountry)
                      : null;
                    // Animated emoji instead of a text label — same "delight" treatment
                    // as the Dashboard's birthday cake badge (see animate-bday-wiggle).
                    const dayBadgeEmoji = dayBadge === "PTO" ? "🏖️" : dayBadge === "ML" ? "🤒" : dayBadge ? "🎉" : null;
                    const dayBadgeAnim  = dayBadge === "PTO" ? "animate-vacation-float" : dayBadge === "ML" ? "animate-sick-wobble" : "animate-holiday-bounce";
                    const dayBadgeTitle = dayBadge === "PTO" ? "PTO" : dayBadge === "ML" ? "Medical Leave" : dayBadge === "USO" ? "US Holiday" : "Local Holiday";

                    let cellClass = "bg-white border-slate-100 text-slate-600 hover:border-slate-200";
                    if (!inMonth)      cellClass = "border-transparent text-slate-300";
                    else if (isToday)  cellClass = "bg-[#003527] border-[#003527] text-white shadow-md shadow-emerald-900/20";
                    else if (mins > 0) cellClass = isOver ? "bg-yellow-50 border-yellow-100 text-yellow-900" : isExact ? "bg-emerald-50 border-emerald-100 text-emerald-900" : "bg-red-50 border-red-100 text-red-900";
                    else if (rest)     cellClass = "bg-slate-50 border-slate-100 text-slate-400";

                    const isSelected = d === activeDate;

                    return (
                      <div
                        key={d}
                        role={inMonth ? "button" : undefined}
                        tabIndex={inMonth ? 0 : undefined}
                        onClick={() => inMonth && setSelectedDate(d)}
                        onKeyDown={(e) => { if (inMonth && (e.key === "Enter" || e.key === " ")) setSelectedDate(d); }}
                        className={`h-12 md:h-14 rounded-lg p-1.5 flex flex-col justify-between border transition-all ${cellClass} ${inMonth ? "cursor-pointer" : ""} ${isSelected ? "ring-2 ring-teal-500 ring-offset-1" : ""}`}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span className={`text-xs tabular-nums ${isToday ? "font-bold" : "font-semibold"}`}>{dayNum}</span>
                          {dayBadgeEmoji && (
                            <span className={`text-xs leading-none select-none ${dayBadgeAnim}`} title={dayBadgeTitle} aria-label={dayBadgeTitle}>
                              {dayBadgeEmoji}
                            </span>
                          )}
                        </span>
                        {inMonth && mins > 0 ? (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${isToday ? (isOver ? "text-yellow-200" : isExact ? "text-emerald-200" : "text-red-200") : (isOver ? "text-yellow-700" : isExact ? "text-emerald-700" : "text-red-700")}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isToday ? (isOver ? "bg-yellow-300" : isExact ? "bg-emerald-300" : "bg-red-300") : (isOver ? "bg-yellow-500" : isExact ? "bg-emerald-500" : "bg-red-500")}`} />
                            {fmtHoursMinutes(mins)}
                          </span>
                        ) : inMonth && rest ? (
                          <span className="text-[8px] font-bold uppercase tracking-wide text-slate-400">Rest</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Daily Logs — shows exactly the date clicked on the calendar
                (defaults to today until a day is clicked). */}
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-[#003527]">Daily Logs</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {parseIsoDate(activeDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 max-h-90">
                {(() => {
                  const data    = monthData[activeDate];
                  const mins    = data?.mins ?? 0;
                  const full    = mins >= STANDARD_SHIFT_MINUTES;
                  const isOver  = mins > STANDARD_SHIFT_MINUTES;
                  const isExact = mins === STANDARD_SHIFT_MINUTES;

                  if (mins <= 0) {
                    return (
                      <div className="flex flex-col items-center justify-center text-center py-16">
                        <div className="w-12 h-12 rounded-2xl bg-slate-50 grid place-items-center mb-3">
                          <LuCalendar size={20} className="text-slate-300" strokeWidth={1.75} />
                        </div>
                        <p className="text-sm text-slate-400">No time logged this day.</p>
                      </div>
                    );
                  }

                  return (
                    <>
                      <div className="flex justify-between items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${
                          isOver ? "bg-yellow-50 text-yellow-700" : isExact ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}>
                          {full ? "Full Day" : "Short"}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex-1 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">In</p>
                          <p className="text-xs font-semibold text-[#191c1e] mt-0.5 tabular-nums">{data?.firstIn ?? "—"}</p>
                        </div>
                        <div className="flex-1 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Out</p>
                          <p className="text-xs font-semibold text-[#191c1e] mt-0.5 tabular-nums">{data?.lastOut ?? "—"}</p>
                        </div>
                      </div>
                      <div className={`mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full tabular-nums ${
                        isOver ? "text-yellow-700 bg-yellow-50" : isExact ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"
                      }`}>
                        <LuTimer size={13} strokeWidth={2} /> {fmtHoursMinutes(mins)}
                      </div>

                      {/* Project / task breakdown */}
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Project / Task</p>
                        {dayTasksLoading ? (
                          <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                            <LuLoader size={13} className="animate-spin" /> Loading…
                          </div>
                        ) : dayTasks.length === 0 ? (
                          <p className="text-xs text-slate-400">No task breakdown available for this day.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {dayTasks.map((t, i) => (
                              <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-[#191c1e] truncate">{t.projectName}</p>
                                  <p className="text-[10px] text-slate-400 truncate">{t.taskName || t.category}</p>
                                </div>
                                <span className="text-xs font-bold text-slate-600 tabular-nums shrink-0">{fmtHoursMinutes(t.mins)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </section>

          {/* ── Legend ── */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400 bg-white border border-slate-200/80 rounded-2xl px-5 py-3 shadow-sm">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-50 border border-yellow-200" /> Over {STANDARD_SHIFT_MINUTES}m</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" /> Exactly {STANDARD_SHIFT_MINUTES}m</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200" /> Under {STANDARD_SHIFT_MINUTES}m</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-50 border border-slate-200" /> Rest day</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#003527]" /> Today</span>
            <span className="flex items-center gap-1.5"><span className="text-xs" aria-hidden>🏖️</span> PTO</span>
            <span className="flex items-center gap-1.5"><span className="text-xs" aria-hidden>🤒</span> Medical Leave</span>
            <span className="flex items-center gap-1.5"><span className="text-xs" aria-hidden>🎉</span> Holiday (US or Local)</span>
            <span className="sm:ml-auto flex items-center gap-1.5"><LuCircleCheck size={13} className="text-emerald-600" /> Standard shift = {STANDARD_SHIFT_MINUTES / 60}h ({STANDARD_SHIFT_MINUTES} min)</span>
          </div>
        </>
      )}
    </div>
  );
}
