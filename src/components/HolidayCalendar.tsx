"use client";

import { useState, useEffect, useTransition } from "react";
import { createPortal } from "react-dom";
import { LuCalendar, LuChevronLeft, LuChevronRight, LuPlus, LuX, LuFlag, LuTrash2, LuLoader } from "react-icons/lu";
import { fetchHolidays, createHoliday, deleteHoliday, type Holiday } from "@/app/admin/holidays/actions";
import { COUNTRY_TIME_ZONES, hourOffsetDifference } from "@/lib/countryTimeZones";

const COUNTRY_COLORS: Record<string, string> = {
  "United States": "bg-blue-500",
  "India":         "bg-orange-500",
  "Mexico":        "bg-emerald-500",
  "Philippines":   "bg-teal-500",
  "Global":        "bg-purple-500",
};
const FLAG_COLORS: Record<string, string> = {
  "United States": "text-blue-500",
  "India":         "text-orange-500",
  "Mexico":        "text-emerald-500",
  "Philippines":   "text-teal-500",
  "Global":        "text-purple-500",
};
const COUNTRIES = Object.keys(COUNTRY_COLORS);

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const INPUT  = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all";
const SELECT = INPUT + " cursor-pointer";

function buildCalendar(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function pad(n: number) { return String(n).padStart(2, "0"); }

// `date`/`arizonaDate` come back as naive "YYYY-MM-DDTHH:mm:ss" strings (no
// zone) — force UTC interpretation so the literal stored numbers are
// displayed as-is, not re-shifted by the viewer's own browser time zone.
function formatNaiveDateTime(iso: string): string {
  const withZone = iso.endsWith("Z") ? iso : `${iso}Z`;
  return new Date(withZone).toLocaleString("en-US", {
    timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function formatHourDiff(hours: number): string {
  const rounded = Number.isInteger(hours) ? hours : Math.round(hours * 10) / 10;
  if (rounded === 0) return "Same time";
  return `${rounded > 0 ? "+" : ""}${rounded}h`;
}

// Regional mini-calendars: each reads "today" in its own IANA time zone rather
// than the viewer's local time, so e.g. India's calendar can already show
// tomorrow while it's still today in the US.
const REGIONAL_CALENDAR_COUNTRIES = ["Philippines", "India", "Mexico", "United States"];
const REGIONAL_CALENDARS = REGIONAL_CALENDAR_COUNTRIES.map((country) => ({
  country,
  timeZone: COUNTRY_TIME_ZONES[country],
}));

function todayPartsInTz(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

function MiniCountryCalendar({ country, timeZone, now, holidays, loading, todayParts, isActive, onSelect }: {
  country: string;
  timeZone: string;
  now: Date | null;
  holidays: Holiday[];
  loading: boolean;
  todayParts?: { year: number; month: number; day: number };
  isActive?: boolean;
  onSelect?: () => void;
}) {
  if (!todayParts) return null;
  const { year, month, day } = todayParts;
  const timeLabel = now?.toLocaleTimeString("en-US", {
    timeZone, hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  const cells = buildCalendar(year, month);
  const monthPrefix = `${year}-${pad(month + 1)}`;
  const monthHolidays = holidays
    .filter(h => h.country === country && h.date.startsWith(monthPrefix))
    .sort((a, b) => a.date.localeCompare(b.date));
  const holidayByDay = new Map(monthHolidays.map(h => [parseInt(h.date.split("-")[2]), h]));

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex-1 min-w-[160px] text-left rounded-lg border p-3 transition-colors cursor-pointer ${
        isActive ? "border-[#003527] ring-2 ring-[#003527]/20 bg-teal-50/40" : "border-slate-100 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      {timeLabel && (
        <p className="text-[10px] font-mono font-bold text-slate-500 mb-1.5 tabular-nums">{timeLabel}</p>
      )}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${COUNTRY_COLORS[country] ?? "bg-slate-400"}`} />
          <span className="text-xs font-bold text-slate-700">{country}</span>
        </div>
        <span className="text-[10px] text-slate-400 font-medium">{MONTHS[month].slice(0, 3)} {year}</span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAYS_OF_WEEK.map(d => (
          <div key={d} className="text-center text-[9px] font-semibold text-slate-300">{d[0]}</div>
        ))}
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <LuLoader size={16} className="text-slate-300 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="h-5" />;
            const isToday = d === day;
            const holiday = holidayByDay.get(d);
            return (
              <div
                key={i}
                title={holiday?.name}
                className={`h-5 flex items-center justify-center rounded text-[9px] font-medium ${
                  isToday ? "bg-[#003527] text-white"
                  : holiday ? `${COUNTRY_COLORS[country] ?? "bg-slate-400"} text-white`
                  : "text-slate-500"
                }`}
              >
                {d}
              </div>
            );
          })}
        </div>
      )}
      {monthHolidays.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
          {monthHolidays.slice(0, 2).map(h => (
            <p key={h.id} className="text-[10px] text-slate-500 truncate">
              <span className="font-semibold text-slate-600">{parseInt(h.date.split("-")[2])}</span> · {h.name}
            </p>
          ))}
        </div>
      )}
    </button>
  );
}

export function HolidayCalendar() {
  const [mounted,       setMounted]       = useState(false);
  const [holidays,      setHolidays]      = useState<Holiday[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showModal,     setShowModal]     = useState(false);
  const [showAdd,       setShowAdd]       = useState(false);
  const [calYear,       setCalYear]       = useState(new Date().getFullYear());
  const [calMonth,      setCalMonth]      = useState(new Date().getMonth());
  const [filterCountry, setFilterCountry] = useState("All");
  const [todayStr,      setTodayStr]      = useState("");
  const [isPending,     startTransition]  = useTransition();
  const [regionalToday, setRegionalToday] = useState<Record<string, { year: number; month: number; day: number }>>({});
  const [now, setNow] = useState<Date | null>(null);
  const [mainCalendarCountry, setMainCalendarCountry] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<{ date: string; holidays: Holiday[] } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);

  // Add form state
  const [newName,    setNewName]    = useState("");
  const [newCountry, setNewCountry] = useState(COUNTRIES[0]);
  const [newDate,    setNewDate]    = useState("");
  const [addError,   setAddError]   = useState("");

  useEffect(() => {
    setMounted(true);
    const now = new Date();
    setTodayStr(`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`);
    setRegionalToday(Object.fromEntries(REGIONAL_CALENDARS.map(r => [r.country, todayPartsInTz(r.timeZone)])));
    loadHolidays();

    setNow(new Date());
    const clockId = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockId);
  }, []);

  async function loadHolidays() {
    setLoading(true);
    try {
      const data = await fetchHolidays();
      setHolidays(data);
    } catch (e) {
      console.error("Failed to load holidays:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setSelectedDay(null); }, [calYear, calMonth]);

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }

  function handleAdd() {
    const n = newName.trim();
    if (!n) { setAddError("Holiday name is required."); return; }
    if (!newDate) { setAddError("Date is required."); return; }
    setAddError("");
    startTransition(async () => {
      try {
        const created = await createHoliday({ name: n, country: newCountry, date: newDate });
        setHolidays(prev => [...prev, created].sort((a, b) => a.date.localeCompare(b.date)));
        setNewName(""); setNewDate(""); setNewCountry(COUNTRIES[0]);
        setShowAdd(false);
      } catch (e) {
        setAddError(e instanceof Error ? e.message : "Failed to add holiday.");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteHoliday(id);
        setHolidays(prev => prev.filter(h => h.id !== id));
      } catch (e) {
        console.error("Failed to delete holiday:", e);
      } finally {
        setDeleteTarget(null);
      }
    });
  }

  function closeAll() { setShowModal(false); setShowAdd(false); setAddError(""); setSelectedDay(null); }

  // Clicking a regional mini-calendar swaps the main calendar to that
  // country's own month/today and filters it to just that country — clicking
  // the same one again (or "Show All") goes back to every country combined.
  function selectRegionalCountry(country: string) {
    setMainCalendarCountry(prev => {
      const next = prev === country ? null : country;
      const parts = regionalToday[country];
      if (next && parts) {
        setCalYear(parts.year);
        setCalMonth(parts.month);
      }
      return next;
    });
  }

  const cells = buildCalendar(calYear, calMonth);
  const activeCountryToday = mainCalendarCountry ? regionalToday[mainCalendarCountry] : undefined;

  const monthHolidays = holidays.filter(h => {
    const [y, m] = h.date.split("-").map(Number);
    return y === calYear && m - 1 === calMonth && (!mainCalendarCountry || h.country === mainCalendarCountry);
  });

  const dotsByDay: Record<number, Holiday[]> = {};
  monthHolidays.forEach(h => {
    const day = parseInt(h.date.split("-")[2]);
    if (!dotsByDay[day]) dotsByDay[day] = [];
    dotsByDay[day].push(h);
  });

  const sidebarHolidays = filterCountry === "All"
    ? holidays
    : holidays.filter(h => h.country === filterCountry);

  // Widget card shows every holiday in the CURRENT calendar month (not just
  // upcoming ones), sorted chronologically.
  const currentMonthPrefix = todayStr.slice(0, 7);
  const thisMonthHolidays = [...holidays]
    .filter(h => h.date.startsWith(currentMonthPrefix))
    .sort((a, b) => a.date.localeCompare(b.date));

  const calendarModal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeAll} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[#003527] text-white grid place-items-center">
              <LuCalendar size={17} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#003527]">Holiday Calendar</h3>
              <p className="text-xs text-slate-400">Manage holidays across all regions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#003527] hover:bg-[#064e3b] text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <LuPlus size={14} strokeWidth={2.5} /> Add Holiday
            </button>
            <button onClick={closeAll} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
              <LuX size={18} />
            </button>
          </div>
        </div>

        {/* Body — calendar + sidebar */}
        <div className="flex flex-1 overflow-hidden divide-x divide-slate-100">
          {/* Calendar grid */}
          <div className="flex-1 flex flex-col p-5 overflow-y-auto">
            {/* Active country indicator */}
            {mainCalendarCountry && (
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <span className={`w-2 h-2 rounded-full ${COUNTRY_COLORS[mainCalendarCountry] ?? "bg-slate-400"}`} />
                  Showing {mainCalendarCountry}
                </span>
                <button onClick={() => setMainCalendarCountry(null)} className="text-xs font-semibold text-teal-600 hover:underline">
                  Show All
                </button>
              </div>
            )}
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4 h-9">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-600 shrink-0">
                <LuChevronLeft size={18} strokeWidth={2} />
              </button>
              <div className="flex items-center gap-1.5">
                <select
                  value={calMonth}
                  onChange={(e) => setCalMonth(Number(e.target.value))}
                  className="text-sm font-bold text-[#003527] border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                >
                  {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <select
                  value={calYear}
                  onChange={(e) => setCalYear(Number(e.target.value))}
                  className="text-sm font-bold text-[#003527] border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                >
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 3 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-600 shrink-0">
                <LuChevronRight size={18} strokeWidth={2} />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-slate-400 uppercase py-1">{d}</div>
              ))}
            </div>

            {/* Cells */}
            {loading ? (
              <div className="flex items-center justify-center" style={{ minHeight: 312 }}>
                <LuLoader size={28} className="text-slate-300 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-7 grid-rows-6 gap-1" style={{ minHeight: 312 }}>
                {cells.map((day, i) => {
                  if (!day) return <div key={i} />;
                  const dateStr = `${calYear}-${pad(calMonth + 1)}-${pad(day)}`;
                  const isToday = activeCountryToday
                    ? calYear === activeCountryToday.year && calMonth === activeCountryToday.month && day === activeCountryToday.day
                    : dateStr === todayStr;
                  const dots = dotsByDay[day] ?? [];
                  const isSelected = selectedDay?.date === dateStr;
                  return (
                    <button
                      type="button"
                      key={i}
                      disabled={dots.length === 0}
                      onClick={() => setSelectedDay((current) => current?.date === dateStr ? null : { date: dateStr, holidays: dots })}
                      className={`min-h-[52px] rounded-lg p-1.5 flex flex-col items-center gap-0.5 border transition-colors ${dots.length > 0 ? "cursor-pointer" : "cursor-default"} ${
                        isSelected ? "ring-2 ring-[#003527] ring-offset-1" : ""
                      } ${
                        isToday ? "bg-[#003527] border-[#003527]"
                        : dots.length > 0 ? "bg-teal-50 border-teal-200 hover:bg-teal-100"
                        : "bg-white border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <span className={`text-xs font-semibold ${isToday ? "text-white" : "text-slate-700"}`}>{day}</span>
                      <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
                        {dots.slice(0, 3).map((h, di) => (
                          <span key={di} title={`${h.name} (${h.country})`}
                            className={`w-1.5 h-1.5 rounded-full ${COUNTRY_COLORS[h.country] ?? "bg-slate-400"}`} />
                        ))}
                      </div>
                      {dots.length > 0 && (
                        <span className={`text-[9px] leading-none w-full text-center truncate ${isToday ? "text-white/80" : "text-teal-600"} font-medium`}>
                          {dots[0].name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Regional mini-calendars — each shows "today" in its own time zone */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Regional Calendars</p>
              <div className="flex flex-wrap gap-3">
                {REGIONAL_CALENDARS.map(r => (
                  <MiniCountryCalendar
                    key={r.country}
                    country={r.country}
                    timeZone={r.timeZone}
                    now={now}
                    holidays={holidays}
                    loading={loading}
                    todayParts={regionalToday[r.country]}
                    isActive={mainCalendarCountry === r.country}
                    onSelect={() => selectRegionalCountry(r.country)}
                  />
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-slate-100">
              {COUNTRIES.map(c => (
                <div key={c} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${COUNTRY_COLORS[c]}`} />
                  <span className="text-xs text-slate-500">{c}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-52 shrink-0 flex flex-col p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">All Holidays</span>
              <select
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
              >
                <option value="All">All</option>
                {COUNTRIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {loading ? (
                <div className="flex items-center justify-center mt-8">
                  <LuLoader size={20} className="text-slate-300 animate-spin" />
                </div>
              ) : sidebarHolidays.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center mt-4">No holidays found.</p>
              ) : sidebarHolidays.map(h => {
                const [y, mo, d] = h.date.split("-");
                const label = `${MONTHS[parseInt(mo)-1].slice(0,3)} ${parseInt(d)}, ${y}`;
                return (
                  <div key={h.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 group transition-colors">
                    <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${COUNTRY_COLORS[h.country] ?? "bg-slate-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{h.name}</p>
                      <p className="text-[10px] text-slate-400">{h.country} · {label}</p>
                    </div>
                    <button
                      onClick={() => setDeleteTarget(h)}
                      disabled={isPending}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all disabled:opacity-30"
                    >
                      <LuTrash2 size={12} strokeWidth={2} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const addModal = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowAdd(false); setAddError(""); }} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[#003527] text-white grid place-items-center">
              <LuPlus size={17} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#003527]">Add Holiday</h3>
              <p className="text-xs text-slate-400">Fill in the details below</p>
            </div>
          </div>
          <button onClick={() => { setShowAdd(false); setAddError(""); }} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <LuX size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Holiday Name</label>
            <input className={INPUT} placeholder="e.g. New Year's Day" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Country</label>
            <select className={SELECT} value={newCountry} onChange={(e) => setNewCountry(e.target.value)}>
              {COUNTRIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</label>
            <input type="date" className={INPUT} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>
          {addError && <p className="text-xs text-red-500">{addError}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
          <button onClick={() => { setShowAdd(false); setAddError(""); }} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={isPending}
            className="px-5 py-2 bg-[#003527] hover:bg-[#064e3b] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60"
          >
            {isPending
              ? <LuLoader size={15} className="animate-spin" />
              : <LuCalendar size={15} strokeWidth={2} />
            }
            {isPending ? "Saving…" : "Add Holiday"}
          </button>
        </div>
      </div>
    </div>
  );

  const holidayDetailsModal = selectedDay && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedDay(null)} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[#003527] text-white grid place-items-center">
              <LuFlag size={17} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#003527]">Holiday Details</h3>
              <p className="text-xs text-slate-400">
                {new Date(`${selectedDay.date}T00:00:00.000Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>
          <button onClick={() => setSelectedDay(null)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <LuX size={18} />
          </button>
        </div>
        <div className="p-6">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {["Holiday", "Local Date & Time", "Arizona Date & Time", "Hours Difference"].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedDay.holidays.map((h) => {
                  const diff = hourOffsetDifference(h.date.slice(0, 10), h.country);
                  return (
                    <tr key={h.id}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${COUNTRY_COLORS[h.country] ?? "bg-slate-400"}`} />
                        <span className="font-semibold text-slate-700">{h.name}</span>
                        <span className="text-slate-400"> ({h.country})</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatNaiveDateTime(h.date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{h.arizonaDate ? formatNaiveDateTime(h.arizonaDate) : "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-semibold text-[#003527]">{diff != null ? formatHourDiff(diff) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50">
          <button onClick={() => setSelectedDay(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  const deleteConfirmModal = deleteTarget && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isPending && setDeleteTarget(null)} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 size-11 rounded-xl bg-red-50 flex items-center justify-center">
            <LuTrash2 size={20} className="text-red-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Delete Holiday</h3>
            <p className="text-sm text-slate-500 mt-1">
              Are you sure you want to delete <span className="font-semibold text-slate-700">{deleteTarget.name}</span> ({deleteTarget.country})?
              This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setDeleteTarget(null)}
            disabled={isPending}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => handleDelete(deleteTarget.id)}
            disabled={isPending}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            <LuTrash2 size={15} strokeWidth={2} />
            {isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Widget card */}
      <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <h4 className="text-xl md:text-2xl font-semibold text-[#003527]">Holidays</h4>
          <LuCalendar size={22} strokeWidth={1.75} className="text-teal-600" />
        </div>
        <div className="space-y-3 flex-1 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <LuLoader size={22} className="text-slate-300 animate-spin" />
            </div>
          ) : thisMonthHolidays.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No holidays this month.</p>
          ) : thisMonthHolidays.map((h) => {
            const [y, mo, d] = h.date.split("-");
            const dateLabel = `${MONTHS[parseInt(mo)-1].slice(0,3)} ${parseInt(d)}, ${y}`;
            return (
              <div key={h.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <LuFlag size={15} strokeWidth={1.75} className={`shrink-0 ${FLAG_COLORS[h.country] ?? "text-slate-400"}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide leading-none mb-0.5">{h.country}</p>
                    <p className="text-sm font-medium text-slate-700 truncate">{h.name}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-400 shrink-0 tabular-nums">{dateLabel}</span>
              </div>
            );
          })}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="w-full mt-5 py-3 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors uppercase tracking-widest"
        >
          View Full Calendar
        </button>
      </div>

      {/* Portals */}
      {mounted && showModal    && createPortal(calendarModal,       document.body)}
      {mounted && showAdd      && createPortal(addModal,            document.body)}
      {mounted && selectedDay  && createPortal(holidayDetailsModal, document.body)}
      {mounted && deleteTarget && createPortal(deleteConfirmModal,  document.body)}
    </>
  );
}
