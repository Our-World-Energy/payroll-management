"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { LuCalendar, LuChevronLeft, LuChevronRight, LuPlus, LuX, LuFlag, LuTrash2 } from "react-icons/lu";

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

type Holiday = {
  id: number;
  name: string;
  country: string;
  date: string; // YYYY-MM-DD
};

const INITIAL_HOLIDAYS: Holiday[] = [
  { id: 1, name: "Memorial Day",     country: "United States", date: "2026-05-25" },
  { id: 2, name: "Bakrid",           country: "India",         date: "2026-06-07" },
  { id: 3, name: "Father's Day",     country: "Mexico",        date: "2026-06-21" },
  { id: 4, name: "Independence Day", country: "Philippines",   date: "2026-06-12" },
];

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

// Fixed date — avoids SSR/hydration mismatch from new Date() in render
const TODAY = new Date(2026, 4, 28); // May 28 2026 — update if needed, or set dynamically in useEffect
const TODAY_STR = `${TODAY.getFullYear()}-${pad(TODAY.getMonth()+1)}-${pad(TODAY.getDate())}`;

export function HolidayCalendar() {
  const [mounted, setMounted] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>(INITIAL_HOLIDAYS);
  const [showModal, setShowModal] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [calYear,  setCalYear]  = useState(TODAY.getFullYear());
  const [calMonth, setCalMonth] = useState(TODAY.getMonth());
  const [filterCountry, setFilterCountry] = useState("All");

  // Add form state
  const [newName,    setNewName]    = useState("");
  const [newCountry, setNewCountry] = useState(COUNTRIES[0]);
  const [newDate,    setNewDate]    = useState("");

  // Only render portals after mount (client-only)
  useEffect(() => { setMounted(true); }, []);

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
    if (!n || !newDate) return;
    setHolidays(prev => [...prev, { id: Date.now(), name: n, country: newCountry, date: newDate }]);
    setNewName(""); setNewDate(""); setNewCountry(COUNTRIES[0]);
    setShowAdd(false);
  }

  function handleDelete(id: number) {
    setHolidays(prev => prev.filter(h => h.id !== id));
  }

  function closeAll() { setShowModal(false); setShowAdd(false); }

  const cells = buildCalendar(calYear, calMonth);

  const monthHolidays = holidays.filter(h => {
    const [y, m] = h.date.split("-").map(Number);
    return y === calYear && m - 1 === calMonth;
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
  const sortedSidebar = [...sidebarHolidays].sort((a, b) => a.date.localeCompare(b.date));

  const upcoming = [...holidays]
    .filter(h => h.date >= TODAY_STR)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

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
            {/* Month nav — fixed height so grid never shifts */}
            <div className="flex items-center justify-between mb-4 h-9">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-600 shrink-0">
                <LuChevronLeft size={18} strokeWidth={2} />
              </button>
              {/* Month + Year pickers */}
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
                  {Array.from({ length: 10 }, (_, i) => TODAY.getFullYear() - 3 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-600 shrink-0">
                <LuChevronRight size={18} strokeWidth={2} />
              </button>
            </div>

            {/* Day headers — fixed, never moves */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-slate-400 uppercase py-1">{d}</div>
              ))}
            </div>

            {/* Cells — fixed 6-row height so nav never shifts */}
            <div className="grid grid-cols-7 grid-rows-6 gap-1" style={{ minHeight: 312 }}>
              {cells.map((day, i) => {
                if (!day) return <div key={i} />;
                const dateStr = `${calYear}-${pad(calMonth + 1)}-${pad(day)}`;
                const isToday = dateStr === TODAY_STR;
                const dots = dotsByDay[day] ?? [];
                return (
                  <div key={i} className={`min-h-[52px] rounded-lg p-1.5 flex flex-col items-center gap-0.5 border transition-colors ${
                    isToday ? "bg-[#003527] border-[#003527]"
                    : dots.length > 0 ? "bg-teal-50 border-teal-200"
                    : "bg-white border-slate-100 hover:bg-slate-50"
                  }`}>
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
                  </div>
                );
              })}
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
          <div className="w-64 shrink-0 flex flex-col p-4 overflow-hidden">
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
              {sortedSidebar.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center mt-4">No holidays found.</p>
              ) : sortedSidebar.map(h => {
                const [y, mo, d] = h.date.split("-");
                const label = `${MONTHS[parseInt(mo)-1].slice(0,3)} ${parseInt(d)}, ${y}`;
                return (
                  <div key={h.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 group transition-colors">
                    <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${COUNTRY_COLORS[h.country] ?? "bg-slate-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{h.name}</p>
                      <p className="text-[10px] text-slate-400">{h.country} · {label}</p>
                    </div>
                    <button onClick={() => handleDelete(h.id)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all">
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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
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
          <button onClick={() => setShowAdd(false)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
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
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
          <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleAdd}
            className="px-5 py-2 bg-[#003527] hover:bg-[#064e3b] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2">
            <LuCalendar size={15} strokeWidth={2} />
            Add Holiday
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
        <div className="space-y-3 flex-1">
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No upcoming holidays.</p>
          ) : upcoming.map((h) => {
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

      {/* Portals — rendered at document.body, not inside the card */}
      {mounted && showModal && createPortal(calendarModal, document.body)}
      {mounted && showAdd  && createPortal(addModal,      document.body)}
    </>
  );
}
