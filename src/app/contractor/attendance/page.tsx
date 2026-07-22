"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchContractorProfileByEmail, type ContractorProfile } from "../profile/actions";
import { parseIsoDate, toIsoDate, sundayOf, addDaysIso, datesBetween, arizonaTodayIso } from "@/lib/weekUtils";
import { ARIZONA_TIME_ZONE, countryFromLocation, timeZoneForCountry } from "@/lib/countryTimeZones";
import {
  LuLoader, LuChevronLeft, LuChevronRight, LuCalendar, LuTimer,
  LuCircleCheck, LuBadgeCheck, LuClock, LuActivity,
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

// contractor_profiles.restDay is stored as full weekday names ("Saturday,
// Sunday") — same convention Attendance Review parses against.
function isRestDayDate(dateIso: string, restDaysStr: string) {
  if (!restDaysStr || restDaysStr === "-") return false;
  const dayName = parseIsoDate(dateIso).toLocaleDateString("en-US", { weekday: "long" });
  return restDaysStr.split(",").map((d) => d.trim()).includes(dayName);
}

function fmtTime(iso: string, timeZone: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone,
  });
}

function fmtHours(mins: number) {
  return `${(mins / 60).toFixed(1)} hrs`;
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
  const size = 76, stroke = 7;
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
  // Contractor's own local time zone (from profile.location), used to display
  // clock-in / clock-out. Falls back to Arizona (HO time) when unknown.
  const [tz, setTz] = useState<string>(ARIZONA_TIME_ZONE);

  // calendar month being viewed (first day of that month, ISO)
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const t = arizonaTodayIso();
    return t.slice(0, 8) + "01";
  });
  const [monthData, setMonthData] = useState<Record<string, DayData>>({});
  const [monthLoading, setMonthLoading] = useState(false);

  // current week / today / month summary figures (always "now", independent of
  // the month the calendar is scrolled to)
  const [summary, setSummary] = useState({ weekMins: 0, expectedWeekMins: 0, todayMins: 0, monthMins: 0 });

  const today = arizonaTodayIso();

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
      setTz(timeZoneForCountry(countryFromLocation(prof.location || "")) ?? ARIZONA_TIME_ZONE);
      setLogQuery(query);

      // Summary window covers this week and the current month up to today.
      const weekStart  = sundayOf(today);
      const monthStart = today.slice(0, 8) + "01";
      const from = weekStart < monthStart ? weekStart : monthStart;
      try {
        const res  = await fetch(`/api/attendance/daily-log?from=${from}&to=${today}&${query}`);
        const json = res.ok ? await res.json() : { logs: [] };
        const byDate = new Map<string, number>();
        for (const log of (json.logs ?? []) as DailyLog[]) {
          byDate.set(log.entryDate.slice(0, 10), log.totalMins ?? 0);
        }

        const weekDates  = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
        const restStr    = prof.restDay ?? "";
        const weekMins   = weekDates.reduce((sum, d) => sum + (byDate.get(d) ?? 0), 0);
        const expectedWeekMins = weekDates.filter((d) => !isRestDayDate(d, restStr)).length * STANDARD_SHIFT_MINUTES;
        const monthEnd   = today;
        const monthMins  = datesBetween(monthStart, monthEnd).reduce((sum, d) => sum + (byDate.get(d) ?? 0), 0);

        setSummary({ weekMins, expectedWeekMins, todayMins: byDate.get(today) ?? 0, monthMins });
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
    if (logQuery != null) loadMonth(logQuery, monthAnchor, tz);
  }, [logQuery, monthAnchor, tz, loadMonth]);

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

  // ── calendar grid cells ──
  const anchorDate  = parseIsoDate(monthAnchor);
  const monthIndex  = anchorDate.getMonth();
  const monthYear   = anchorDate.getFullYear();
  const gridStart   = sundayOf(monthAnchor);
  const lastOfMonth = toIsoDate(new Date(monthYear, monthIndex + 1, 0));
  const gridEnd     = addDaysIso(sundayOf(lastOfMonth), 6);
  const gridDays    = datesBetween(gridStart, gridEnd);

  // ── daily logs feed: days in the viewed month that have logged time, newest first ──
  const feedDays = datesBetween(monthAnchor, lastOfMonth)
    .filter((d) => (monthData[d]?.mins ?? 0) > 0)
    .sort((a, b) => (a < b ? 1 : -1));

  const goPrevMonth = () => setMonthAnchor(toIsoDate(new Date(monthYear, monthIndex - 1, 1)));
  const goNextMonth = () => setMonthAnchor(toIsoDate(new Date(monthYear, monthIndex + 1, 1)));

  const weekPct = summary.expectedWeekMins > 0
    ? Math.min(Math.round((summary.weekMins / summary.expectedWeekMins) * 100), 100)
    : 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* ── Page header ── */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className="h-px w-8 bg-emerald-600/50" />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700">Contractor Portal</span>
          </div>
          <h2 className="text-4xl md:text-[2.7rem] font-bold text-[#003527] leading-none" style={{ letterSpacing: "-0.025em" }}>
            Attendance Logs
          </h2>
          <p className="text-slate-500 mt-3">Track your hours and efficiency for the current pay period.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-white border border-slate-200/80 rounded-full pl-3.5 pr-4 py-2 shadow-sm self-start md:self-auto">
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
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-5">
            {/* Weekly total + progress ring */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
              <div className="relative grid place-items-center">
                <ProgressRing pct={weekPct} />
                <span className="absolute text-sm font-bold text-[#003527] tabular-nums">{weekPct}%</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.14em]">This Week</p>
                <p className="text-2xl font-bold text-[#003527] mt-1.5 leading-none tabular-nums">{fmtHours(summary.weekMins)}</p>
                <p className="text-xs text-slate-400 mt-1.5 tabular-nums">of {fmtHours(summary.expectedWeekMins)} target</p>
              </div>
            </div>

            {/* Today */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.14em] mt-1">Today</p>
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600">
                  <LuTimer size={17} strokeWidth={2} />
                </span>
              </div>
              <p className="text-3xl font-bold text-[#003527] mt-3 leading-none tabular-nums">{fmtHours(summary.todayMins)}</p>
              <p className="text-xs text-slate-400 mt-2 tabular-nums">{summary.todayMins.toLocaleString()} minutes logged</p>
            </div>

            {/* This month */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.14em] mt-1">This Month</p>
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-teal-50 text-teal-600">
                  <LuActivity size={17} strokeWidth={2} />
                </span>
              </div>
              <p className="text-3xl font-bold text-teal-700 mt-3 leading-none tabular-nums">{fmtHours(summary.monthMins)}</p>
              <p className="text-xs text-slate-400 mt-2 tabular-nums">{summary.monthMins.toLocaleString()} minutes total</p>
            </div>

            {/* Rest days — deep brand-gradient accent */}
            <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-sm bg-brand-gradient">
              <div className="absolute inset-0 bg-grid-soft opacity-70 pointer-events-none" />
              <div className="relative flex flex-col h-full">
                <div className="flex items-start justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200/80 mt-1">Rest Days</p>
                  <span className="grid place-items-center w-9 h-9 rounded-xl bg-white/10 text-emerald-300">
                    <LuBadgeCheck size={17} strokeWidth={2} />
                  </span>
                </div>
                <p className="text-xl font-bold mt-3 leading-tight">{restStr && restStr !== "-" ? restStr : "None set"}</p>
                <p className="text-xs text-emerald-200/70 mt-auto pt-2">{profile?.shiftType || "Fixed"} shift</p>
              </div>
            </div>
          </section>

          {/* ── Calendar + daily logs ── */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
            {/* Calendar */}
            <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-[#003527] flex items-center gap-2.5">
                  <span className="grid place-items-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700">
                    <LuCalendar size={16} strokeWidth={2} />
                  </span>
                  {MONTHS[monthIndex]} {monthYear}
                </h3>
                <div className="flex items-center gap-1">
                  {monthLoading && <LuLoader size={15} className="text-slate-300 animate-spin mr-1" />}
                  <button onClick={goPrevMonth} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
                    <LuChevronLeft size={17} strokeWidth={2} />
                  </button>
                  <button onClick={goNextMonth} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
                    <LuChevronRight size={17} strokeWidth={2} />
                  </button>
                </div>
              </div>

              <div className="p-4 md:p-5">
                {/* Weekday header */}
                <div className="grid grid-cols-7 mb-2">
                  {WEEKDAYS.map((d) => (
                    <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] py-1">{d}</div>
                  ))}
                </div>
                {/* Day grid */}
                <div className="grid grid-cols-7 gap-1.5">
                  {gridDays.map((d) => {
                    const inMonth = parseIsoDate(d).getMonth() === monthIndex;
                    const isToday = d === today;
                    const rest    = isRestDayDate(d, restStr);
                    const mins    = monthData[d]?.mins ?? 0;
                    const dayNum  = parseIsoDate(d).getDate();

                    let cellClass = "bg-white border-slate-100 text-slate-600 hover:border-slate-200";
                    if (!inMonth)      cellClass = "border-transparent text-slate-300";
                    else if (isToday)  cellClass = "bg-[#003527] border-[#003527] text-white shadow-md shadow-emerald-900/20";
                    else if (mins > 0) cellClass = "bg-emerald-50 border-emerald-100 text-emerald-900";
                    else if (rest)     cellClass = "bg-slate-50 border-slate-100 text-slate-400";

                    return (
                      <div key={d} className={`aspect-square rounded-xl p-2 flex flex-col justify-between border transition-all ${cellClass}`}>
                        <span className={`text-xs tabular-nums ${isToday ? "font-bold" : "font-semibold"}`}>{dayNum}</span>
                        {inMonth && mins > 0 ? (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${isToday ? "text-emerald-200" : "text-emerald-700"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isToday ? "bg-emerald-300" : "bg-emerald-500"}`} />
                            {mins}m
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

            {/* Daily logs feed */}
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-6 py-5 border-b border-slate-100">
                <h3 className="text-lg font-bold text-[#003527]">Daily Logs</h3>
                <p className="text-xs text-slate-400 mt-0.5">{MONTHS[monthIndex]} {monthYear}</p>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5 max-h-[540px]">
                {feedDays.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-16">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 grid place-items-center mb-3">
                      <LuCalendar size={20} className="text-slate-300" strokeWidth={1.75} />
                    </div>
                    <p className="text-sm text-slate-400">No time logged this month.</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {feedDays.map((d, i) => {
                      const data    = monthData[d];
                      const mins    = data?.mins ?? 0;
                      const full    = mins >= STANDARD_SHIFT_MINUTES;
                      const dateObj = parseIsoDate(d);
                      return (
                        <div key={d} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className={`w-10 h-10 rounded-xl grid place-items-center font-bold text-xs shrink-0 tabular-nums ${
                              full ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                            }`}>
                              {String(dateObj.getDate()).padStart(2, "0")}
                            </div>
                            {i < feedDays.length - 1 && <div className="w-px flex-1 bg-slate-100 mt-2" />}
                          </div>
                          <div className="flex-1 pb-1">
                            <div className="flex justify-between items-center gap-2">
                              <h4 className="text-sm font-bold text-[#191c1e]">
                                {dateObj.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                              </h4>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${
                                full ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
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
                              full ? "text-emerald-700 bg-emerald-50" : "text-amber-700 bg-amber-50"
                            }`}>
                              <LuTimer size={13} strokeWidth={2} /> {fmtHours(mins)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── Legend ── */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400 bg-white border border-slate-200/80 rounded-2xl px-5 py-3.5 shadow-sm">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" /> Logged time</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-50 border border-slate-200" /> Rest day</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#003527]" /> Today</span>
            <span className="sm:ml-auto flex items-center gap-1.5"><LuCircleCheck size={13} className="text-emerald-600" /> Standard shift = {STANDARD_SHIFT_MINUTES / 60}h ({STANDARD_SHIFT_MINUTES} min)</span>
          </div>
        </>
      )}
    </div>
  );
}
