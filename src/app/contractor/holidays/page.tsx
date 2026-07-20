"use client";

import { useEffect, useState } from "react";
import { LuCalendar, LuFlag, LuChevronLeft, LuChevronRight, LuLoader, LuClock } from "react-icons/lu";
import { fetchHolidays, type Holiday } from "@/app/admin/holidays/actions";
import { PageHeader, HeaderChip } from "../_components/portal";

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
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_OF_WEEK = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function pad(n: number) { return String(n).padStart(2, "0"); }

function buildCalendar(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function ContractorHolidaysPage() {
  const [holidays,      setHolidays]      = useState<Holiday[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [calYear,       setCalYear]       = useState(new Date().getFullYear());
  const [calMonth,      setCalMonth]      = useState(new Date().getMonth());
  const [filterCountry, setFilterCountry] = useState("All");
  const [todayStr,      setTodayStr]      = useState("");

  useEffect(() => {
    const now = new Date();
    setTodayStr(`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`);
    fetchHolidays().then(setHolidays).finally(() => setLoading(false));
  }, []);

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }

  const cells = buildCalendar(calYear, calMonth);

  const dotsByDay: Record<number, Holiday[]> = {};
  holidays.forEach(h => {
    const [y, m] = h.date.split("-").map(Number);
    if (y === calYear && m - 1 === calMonth) {
      const day = parseInt(h.date.split("-")[2]);
      if (!dotsByDay[day]) dotsByDay[day] = [];
      dotsByDay[day].push(h);
    }
  });

  const listHolidays = (filterCountry === "All" ? holidays : holidays.filter(h => h.country === filterCountry))
    .sort((a, b) => a.date.localeCompare(b.date));

  const upcoming = holidays.filter(h => h.date >= todayStr).slice(0, 5);

  const todayLabel = todayStr
    ? new Date(todayStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <PageHeader
        title="Holiday Calendar"
        subtitle="Company holidays observed across all regions."
        right={todayLabel
          ? <HeaderChip icon={<LuClock size={13} strokeWidth={2} className="text-emerald-600" />}>{todayLabel}</HeaderChip>
          : undefined}
      />

      {/* Calendar + upcoming */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-[#003527] flex items-center gap-2.5">
              <span className="grid place-items-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700">
                <LuCalendar size={16} strokeWidth={2} />
              </span>
              {MONTHS[calMonth]} {calYear}
            </h3>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
                <LuChevronLeft size={17} strokeWidth={2} />
              </button>
              <select value={calMonth} onChange={e => setCalMonth(Number(e.target.value))}
                className="text-sm font-bold text-[#003527] border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer">
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select value={calYear} onChange={e => setCalYear(Number(e.target.value))}
                className="text-sm font-bold text-[#003527] border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer">
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 3 + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
                <LuChevronRight size={17} strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="p-4 md:p-5">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] py-1">{d}</div>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center" style={{ minHeight: 320 }}>
                <LuLoader size={28} className="text-slate-300 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1.5">
                {cells.map((day, i) => {
                  if (!day) return <div key={i} className="aspect-square" />;
                  const dateStr = `${calYear}-${pad(calMonth+1)}-${pad(day)}`;
                  const isToday = dateStr === todayStr;
                  const dots    = dotsByDay[day] ?? [];
                  const hasHol  = dots.length > 0;

                  let cellClass = "bg-white border-slate-100 text-slate-600 hover:border-slate-200";
                  if (isToday)     cellClass = "bg-[#003527] border-[#003527] text-white shadow-md shadow-emerald-900/20";
                  else if (hasHol) cellClass = "bg-teal-50 border-teal-100 text-teal-900";

                  return (
                    <div key={i} className={`aspect-square rounded-xl p-2 flex flex-col border transition-all ${cellClass}`}>
                      <span className={`text-xs tabular-nums ${isToday ? "font-bold" : "font-semibold"}`}>{day}</span>
                      <div className="flex flex-wrap gap-0.5 mt-1">
                        {dots.slice(0, 3).map((h, di) => (
                          <span key={di} title={`${h.name} (${h.country})`}
                            className={`w-1.5 h-1.5 rounded-full ${COUNTRY_COLORS[h.country] ?? "bg-slate-400"}`} />
                        ))}
                      </div>
                      {hasHol && (
                        <span className={`mt-auto text-[9px] leading-tight w-full truncate font-semibold ${isToday ? "text-emerald-200" : "text-teal-700"}`}>
                          {dots[0].name}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-4 border-t border-slate-100">
              {COUNTRIES.map(c => (
                <div key={c} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${COUNTRY_COLORS[c]}`} />
                  <span className="text-xs text-slate-500">{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Upcoming */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-slate-100">
            <h3 className="text-lg font-bold text-[#003527]">Upcoming Holidays</h3>
            <p className="text-xs text-slate-400 mt-0.5">Next 5 across all regions</p>
          </div>
          <div className="flex-1 p-6">
            {loading ? (
              <div className="flex items-center justify-center py-6"><LuLoader size={22} className="text-slate-300 animate-spin" /></div>
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No upcoming holidays.</p>
            ) : (
              <div className="space-y-4">
                {upcoming.map(h => {
                  const [y, mo, d] = h.date.split("-");
                  const label = `${MONTHS[parseInt(mo)-1]} ${parseInt(d)}, ${y}`;
                  return (
                    <div key={h.id} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="grid place-items-center w-9 h-9 rounded-xl bg-slate-50 shrink-0">
                          <LuFlag size={15} className={`${FLAG_COLORS[h.country] ?? "text-slate-400"}`} strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] leading-none mb-1">{h.country}</p>
                          <p className="text-sm font-semibold text-slate-700 leading-tight truncate">{h.name}</p>
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 tabular-nums shrink-0">{label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Full list */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-[#003527]">All Holidays</h3>
          <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)}
            className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer">
            <option value="All">All Regions</option>
            {COUNTRIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8"><LuLoader size={22} className="text-slate-300 animate-spin" /></div>
          ) : listHolidays.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No holidays found.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {listHolidays.map(h => {
                const [y, mo, d] = h.date.split("-");
                const label = `${MONTHS[parseInt(mo)-1]} ${parseInt(d)}, ${y}`;
                return (
                  <div key={h.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${COUNTRY_COLORS[h.country] ?? "bg-slate-400"}`} />
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{h.name}</p>
                        <p className="text-xs text-slate-400">{h.country}</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 tabular-nums shrink-0">{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
