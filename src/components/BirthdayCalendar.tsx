"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { LuCake, LuX } from "react-icons/lu";
import { fetchAllContractors } from "@/app/admin/contractors/actions";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type ContractorBirthday = { fullName: string; dob: string };

function buildMonthCalendar(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// contractor_profiles.dob is "YYYY-MM-DD" — only month/day matter here since
// a birthday recurs every year regardless of birth year.
function monthDayOf(dob: string): { month: number; day: number } | null {
  const [, month, day] = dob.split("-").map(Number);
  if (!month || !day) return null;
  return { month: month - 1, day };
}

function formatDob(dob: string): string {
  const [year, month, day] = dob.split("-").map(Number);
  if (!year || !month || !day) return dob;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    timeZone: "UTC", month: "long", day: "numeric", year: "numeric",
  });
}

export function BirthdayCalendar() {
  const [mounted, setMounted] = useState(false);
  const [contractors, setContractors] = useState<ContractorBirthday[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<{ day: number; entries: ContractorBirthday[] } | null>(null);

  useEffect(() => {
    setMounted(true);
    let active = true;
    fetchAllContractors({ country: "All Countries", status: "Active", rules: [] })
      .then((rows) => {
        if (!active) return;
        setContractors(
          rows
            .filter((c) => c.dob)
            .map((c) => ({
              fullName: c.fullName || [c.firstName, c.surname].filter(Boolean).join(" ") || "Unnamed",
              dob: c.dob,
            }))
        );
      })
      .catch(() => { if (active) setContractors([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const todayDay = today.getDate();
  const cells = buildMonthCalendar(year, month);

  const entriesByDay = new Map<number, ContractorBirthday[]>();
  for (const c of contractors) {
    const md = monthDayOf(c.dob);
    if (!md || md.month !== month) continue;
    const list = entriesByDay.get(md.day) ?? [];
    list.push(c);
    entriesByDay.set(md.day, list);
  }

  const birthdayDetailsModal = selectedDay && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedDay(null)} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[#003527] text-white grid place-items-center">
              <LuCake size={17} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#003527]">Birthdays</h3>
              <p className="text-xs text-slate-400">{MONTHS[month]} {selectedDay.day}</p>
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
                  {["Name", "Date of Birth"].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedDay.entries.map((c) => (
                  <tr key={c.fullName}>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-700">{c.fullName}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatDob(c.dob)}</td>
                  </tr>
                ))}
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

  return (
    <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xl md:text-2xl font-semibold text-[#003527]">Birthdays</h4>
        <div className="flex items-center gap-2">
          <LuCake size={20} strokeWidth={1.75} className="text-pink-500" />
          <span className="text-xs font-semibold text-slate-400">{MONTHS[month]} {year}</span>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading birthdays…</p>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {DAYS_OF_WEEK.map((d) => (
            <span key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase">{d[0]}</span>
          ))}
          {cells.map((day, i) => {
            if (day == null) return <div key={i} className="min-h-[46px] rounded-md border border-transparent" />;
            const dayEntries = entriesByDay.get(day);
            const isToday = day === todayDay;
            return (
              <button
                type="button"
                key={i}
                disabled={!dayEntries}
                onClick={() => dayEntries && setSelectedDay({ day, entries: dayEntries })}
                title={dayEntries?.map((c) => c.fullName).join(", ")}
                className={`min-h-[46px] rounded-md border p-1 flex flex-col text-left transition-colors ${
                  isToday
                    ? "border-[#003527] bg-[#003527]/5"
                    : dayEntries
                    ? "border-pink-200 bg-pink-50 cursor-pointer hover:border-pink-400 hover:bg-pink-100"
                    : "border-slate-100 cursor-default"
                }`}
              >
                <span className={`text-[10px] font-semibold ${isToday ? "text-[#003527]" : "text-slate-400"}`}>
                  {day}
                </span>
                {dayEntries?.map((c) => (
                  <p key={c.fullName} className="text-[9px] leading-tight text-pink-700 font-medium truncate">
                    {c.fullName}
                  </p>
                ))}
              </button>
            );
          })}
        </div>
      )}

      {mounted && selectedDay && createPortal(birthdayDetailsModal, document.body)}
    </div>
  );
}
