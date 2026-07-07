"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { LuTrendingUp, LuTriangleAlert, LuX, LuClock } from "react-icons/lu";
import { getDashboardMetrics } from "@/lib/data";
import { AnnouncementBoard } from "@/components/AnnouncementBoard";
import { HolidayCalendar } from "@/components/HolidayCalendar";
import { fetchAllContractors } from "./contractors/actions";

type AbsentRow = {
  name: string;
  department: string;
  date: string;
  status: string;
};

type LateRow = {
  name: string;
  department: string;
  date: string;
  mins: number;
};

export default function AdminPage() {
  const m = getDashboardMetrics();
  const [showAbsentModal, setShowAbsentModal] = useState(false);
  const [showLateModal, setShowLateModal] = useState(false);
  const [absentRows, setAbsentRows] = useState<AbsentRow[]>([]);
  const [lateRows, setLateRows] = useState<LateRow[]>([]);

  useEffect(() => {
    async function loadAbsent() {
      const now = new Date();
      const cutoff = new Date();
      cutoff.setHours(7, 30, 0, 0);
      if (now < cutoff) return;

      const todayLocal = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");

      try {
        const [entriesRes, contractors] = await Promise.all([
          fetch(`/api/worksnap-entries?from=${todayLocal}&to=${todayLocal}`).then((r) => r.json()),
          fetchAllContractors({ country: "All Countries", status: "Active", rules: [] }),
        ]);

        const minutesByEmail = new Map<string, number>();
        for (const e of (entriesRes.entries ?? [])) {
          const email = String(e.email ?? "").trim().toLowerCase();
          if (email) minutesByEmail.set(email, (minutesByEmail.get(email) ?? 0) + ((e as { durationMins?: number }).durationMins ?? 0));
        }
        const activeContractors = contractors.filter((c) => c.status === "Active" && c.email);

        // Absent = no actual Worksnap time logged today at all (matches the same
        // "Worksnap Actual Time" total shown in Attendance Review) — checked by
        // total minutes, not just whether a (possibly zero-duration) entry exists.
        setAbsentRows(
          activeContractors
            .filter((c) => (minutesByEmail.get(c.email!.trim().toLowerCase()) ?? 0) === 0)
            .map((c) => ({ name: c.fullName, department: c.department, date: todayLocal, status: "Absent" }))
        );

        setLateRows(
          activeContractors
            .filter((c) => {
              const mins = minutesByEmail.get(c.email!.trim().toLowerCase()) ?? 0;
              return mins > 0 && mins < 480;
            })
            .map((c) => ({
              name: c.fullName,
              department: c.department,
              date: todayLocal,
              mins: minutesByEmail.get(c.email!.trim().toLowerCase()) ?? 0,
            }))
        );
      } catch {
        // silently fail — keep empty lists
      }
    }

    loadAbsent();
  }, []);

  const METRICS = [
    { label: "Active Total Contractors", value: m.totalActive,   delta: "+4% this month",       href: "/admin/contractors", highlight: true  },
    { label: "US Region",                value: m.us,            sub: "Headquarters & Field",   href: "/admin/contractors", highlight: false },
    { label: "Philippines",              value: m.philippines,   sub: "Support & Logistics",    href: "/admin/contractors", highlight: false },
    { label: "Mexico",                   value: m.mexico,        sub: "Manufacturing & Solar",  href: "/admin/contractors", highlight: false },
    { label: "India",                    value: m.india,         sub: "Tech & Engineering",     href: "/admin/contractors", highlight: false },
    { label: "PTO Today",                value: m.ptoToday,      sub: "Approved requests",      href: "/admin/time-off",    highlight: false },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">Dashboard</h2>
        <p className="text-sm md:text-base text-slate-500 mt-1">Real-time overview of global workforce and operations.</p>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 md:gap-4 mb-6 md:mb-8">
        {METRICS.map((card) => {
          if (card.highlight) {
            return (
              <Link key={card.label} href={card.href} className="col-span-2 sm:col-span-1 bg-[#003527] hover:bg-[#064e3b] text-white p-4 rounded-xl shadow-md flex flex-col justify-between transition-colors cursor-pointer">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{card.label}</p>
                  <p className="text-4xl font-black mt-1">{card.value}</p>
                </div>
                <div className="mt-4 flex items-center gap-1 text-xs text-emerald-300">
                  <LuTrendingUp size={14} strokeWidth={2} />
                  {card.delta}
                </div>
              </Link>
            );
          }
          return (
            <Link key={card.label} href={card.href} className="bg-white hover:bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between transition-colors cursor-pointer">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{card.label}</p>
                <p className="text-3xl font-bold text-[#003527] mt-1">{card.value}</p>
              </div>
              <p className="mt-4 text-xs text-slate-400">{card.sub}</p>
            </Link>
          );
        })}

        {/* Absent Today + Late Today — stacked in one grid cell */}
        <div className="flex flex-col gap-2">
          {/* Absent Today */}
          <button
            onClick={() => setShowAbsentModal(true)}
            className="text-left bg-red-100 hover:bg-red-200 text-red-800 px-4 py-3 rounded-xl shadow-sm flex flex-col justify-between transition-colors cursor-pointer w-full flex-1"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider">Absent Today</p>
              <p className="text-2xl font-black mt-0.5 text-red-600">{absentRows.length}</p>
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs">
              <LuTriangleAlert size={12} strokeWidth={2} />
              No time logged
            </div>
          </button>

          {/* Late Today */}
          <button
            onClick={() => setShowLateModal(true)}
            className="text-left bg-amber-50 hover:bg-amber-100 text-amber-800 px-4 py-3 rounded-xl shadow-sm flex flex-col justify-between transition-colors cursor-pointer w-full flex-1"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider">Late Today</p>
              <p className="text-2xl font-black mt-0.5 text-amber-600">{lateRows.length}</p>
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs">
              <LuClock size={12} strokeWidth={2} />
              Partial time logged
            </div>
          </button>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        {/* Announcement */}
        <AnnouncementBoard />

        {/* Holidays */}
        <HolidayCalendar />
      </div>

      {/* Absent Today Modal */}
      {showAbsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAbsentModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between px-6 py-5 bg-[#003527]">
              <div>
                <h3 className="text-lg font-bold text-white">Absent Today</h3>
                <p className="text-sm text-green-200 mt-0.5">{absentRows.length} contractor{absentRows.length !== 1 ? "s" : ""} with no time logged</p>
              </div>
              <button
                onClick={() => setShowAbsentModal(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-green-200 transition-colors hover:bg-[#064E3B] hover:text-white"
              >
                <LuX size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                  <tr>
                    {["Name", "Department", "Date", "Status"].map((h) => (
                      <th key={h} className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {absentRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-400">No absences recorded today.</td>
                    </tr>
                  ) : absentRows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-semibold text-slate-900 whitespace-nowrap">{row.name}</td>
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{row.department}</td>
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{row.date}</td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-1 rounded-md text-[11px] font-bold uppercase bg-red-100 text-red-700">
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50">
              <button onClick={() => setShowAbsentModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Late Today Modal */}
      {showLateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowLateModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between px-6 py-5 bg-amber-600">
              <div>
                <h3 className="text-lg font-bold text-white">Late Today</h3>
                <p className="text-sm text-amber-100 mt-0.5">{lateRows.length} contractor{lateRows.length !== 1 ? "s" : ""} with partial time logged</p>
              </div>
              <button
                onClick={() => setShowLateModal(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-amber-100 transition-colors hover:bg-amber-700 hover:text-white"
              >
                <LuX size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                  <tr>
                    {["Name", "Department", "Date", "Mins Logged"].map((h) => (
                      <th key={h} className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lateRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-400">No late arrivals recorded today.</td>
                    </tr>
                  ) : lateRows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-semibold text-slate-900 whitespace-nowrap">{row.name}</td>
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{row.department}</td>
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{row.date}</td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-1 rounded-md text-[11px] font-bold bg-amber-100 text-amber-700">
                          {row.mins} mins
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50">
              <button onClick={() => setShowLateModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
