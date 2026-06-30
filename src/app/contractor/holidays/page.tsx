"use client";

import { useEffect, useState } from "react";
import { LuCalendar, LuFlag, LuChevronLeft, LuChevronRight, LuLoader } from "react-icons/lu";
import { fetchHolidays, type Holiday } from "@/app/admin/holidays/actions";

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[#003527]">Holiday Calendar</h1>
        <p className="text-slate-500 text-sm mt-1">View holidays across all regions.</p>
      </div>

      {/* Upcoming */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Upcoming Holidays</h2>
        {loading ? (
          <div className="flex items-center justify-center py-6"><LuLoader size={22} className="text-slate-300 animate-spin" /></div>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No upcoming holidays.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map(h => {
              const [y, mo, d] = h.date.split("-");
              const label = `${MONTHS[parseInt(mo)-1]} ${parseInt(d)}, ${y}`;
              return (
                <div key={h.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <LuFlag size={15} className={`shrink-0 ${FLAG_COLORS[h.country] ?? "text-slate-400"}`} strokeWidth={1.75} />
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide leading-none mb-0.5">{h.country}</p>
                      <p className="text-sm font-medium text-slate-700">{h.name}</p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 tabular-nums shrink-0">{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-5">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-600">
            <LuChevronLeft size={18} strokeWidth={2} />
          </button>
          <div className="flex items-center gap-2">
            <select value={calMonth} onChange={e => setCalMonth(Number(e.target.value))}
              className="text-sm font-bold text-[#003527] border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer">
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select value={calYear} onChange={e => setCalYear(Number(e.target.value))}
              className="text-sm font-bold text-[#003527] border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer">
              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 3 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-600">
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
          <div className="grid grid-cols-7 gap-1" style={{ minHeight: 312 }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const dateStr = `${calYear}-${pad(calMonth+1)}-${pad(day)}`;
              const isToday = dateStr === todayStr;
              const dots = dotsByDay[day] ?? [];
              return (
                <div key={i} className={`min-h-[52px] rounded-lg p-1.5 flex flex-col items-center gap-0.5 border transition-colors ${
                  isToday ? "bg-[#003527] border-[#003527]"
                  : dots.length > 0 ? "bg-teal-50 border-teal-200"
                  : "bg-white border-slate-100"
                }`}>
                  <span className={`text-xs font-semibold ${isToday ? "text-white" : "text-slate-700"}`}>{day}</span>
                  <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
                    {dots.slice(0, 3).map((h, di) => (
                      <span key={di} title={`${h.name} (${h.country})`}
                        className={`w-1.5 h-1.5 rounded-full ${COUNTRY_COLORS[h.country] ?? "bg-slate-400"}`} />
                    ))}
                  </div>
                  {dots.length > 0 && (
                    <span className={`text-[9px] leading-none w-full text-center truncate font-medium ${isToday ? "text-white/80" : "text-teal-600"}`}>
                      {dots[0].name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

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

      {/* Full list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">All Holidays</h2>
          <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer">
            <option value="All">All Regions</option>
            {COUNTRIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
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
  );
}
