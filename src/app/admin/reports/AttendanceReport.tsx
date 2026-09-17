"use client";

import { useEffect, useState } from "react";
import { LuCalendarDays, LuDownload, LuLoader } from "react-icons/lu";
import { recentWeeks, weekLabel, addDaysIso } from "@/lib/weekUtils";
import { PAY_CATEGORIES } from "@/components/AddContractorModal";
import { fetchAttendanceReport, fetchReportDepartments, MAX_REPORT_WEEKS, type AttendanceReportDay } from "./actions";

const DAY_HEADERS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * What one day reads as in the export.
 *
 * Hours first, because that is what the report is for and what a spreadsheet
 * can total. A marker only ever accompanies the figure; it never replaces a
 * non-zero one, so a half day of leave still shows the 4 hours worked next to
 * the reason the other half is missing.
 *
 * Decimal hours rather than "8h 00m" for the same reason the payroll export
 * uses them: a duration written as text cannot be summed.
 */
function dayCell(day: AttendanceReportDay): string {
  const hours = day.minutes > 0 ? (day.minutes / 60).toFixed(2) : "";
  const marks: string[] = [];
  if (day.leave) marks.push(day.leave);
  if (day.holiday) marks.push("Holiday");
  // Only worth saying on a day that is otherwise empty — a worked rest day
  // already tells that story through its hours.
  if (!hours && !marks.length && day.restDay) marks.push("Rest Day");

  if (hours && marks.length) return `${hours} (${marks.join(", ")})`;
  if (hours) return hours;
  if (marks.length) return marks.join(", ");
  return "-";
}

const SELECT =
  "text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer";

export function AttendanceReport() {
  // Enough history to cover a quarter without an unbounded list.
  const weeks = recentWeeks(26);
  const [fromWeek, setFromWeek] = useState(weeks[3] ?? weeks[0]);
  const [toWeek, setToWeek] = useState(weeks[0]);
  const [payCategory, setPayCategory] = useState("All");
  const [department, setDepartment] = useState("All");
  const [departments, setDepartments] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // Assigned Teams come from the contractor records, so a new one appears here
  // without a code change.
  useEffect(() => {
    fetchReportDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, []);

  async function handleExport() {
    setBusy(true);
    setMessage("");
    try {
      const { rows, error } = await fetchAttendanceReport({ fromWeek, toWeek, payCategory, department });
      if (error) { setMessage(error); return; }
      if (rows.length === 0) { setMessage("No attendance found for that range and filters."); return; }

      const headers = [
        "Week", "Name", "Contractor ID", "Email", "Pay Category", "Assigned Team", "Country",
        ...DAY_HEADERS, "Total Hours",
      ];
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const lines = [
        headers.join(","),
        ...rows.map((r) => {
          const totalMinutes = r.days.reduce((sum, d) => sum + d.minutes, 0);
          return [
            // The week's own Sun-Sat span, so a row says which days its seven
            // columns are without the reader counting from a single date.
            `${r.weekStart} to ${addDaysIso(r.weekStart, 6)}`,
            r.name, r.contractorId, r.email, r.payCategory, r.department, r.country,
            ...r.days.map(dayCell),
            (totalMinutes / 60).toFixed(2),
          ].map(escape).join(",");
        }),
      ];

      // Leading BOM so Excel reads it as UTF-8 and accented names survive.
      const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance-report_${fromWeek}_to_${addDaysIso(toWeek, 6)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
        <LuCalendarDays size={18} strokeWidth={2} className="text-teal-600 shrink-0" />
        <div>
          <h4 className="text-lg font-semibold text-[#003527]">Attendance Report</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Daily hours per contractor, one row per week, Sunday to Saturday. Time Away and holidays are marked on
            the day they fall.
          </p>
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">From Week</span>
            <select className={SELECT} value={fromWeek} onChange={(e) => setFromWeek(e.target.value)}>
              {weeks.map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">To Week</span>
            <select className={SELECT} value={toWeek} onChange={(e) => setToWeek(e.target.value)}>
              {weeks.map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pay Category</span>
            <select className={SELECT} value={payCategory} onChange={(e) => setPayCategory(e.target.value)}>
              <option value="All">All Categories</option>
              {PAY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Assigned Team</span>
            <select className={SELECT} value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="All">All Assigned Teams</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <button
            onClick={handleExport}
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? <LuLoader size={15} className="animate-spin" /> : <LuDownload size={15} strokeWidth={2} />}
            {busy ? "Building…" : "Export"}
          </button>
        </div>

        {message && <p className="mt-3 text-xs font-medium text-slate-500">{message}</p>}

        <p className="mt-3 text-[11px] text-slate-400">
          Hours are the Evaluated Time each day was reviewed at; a week nobody has reviewed yet falls back to the
          raw Worksnap total. A day carrying both work and leave shows the hours with the reason beside them.
          Ranges are capped at {MAX_REPORT_WEEKS} weeks.
        </p>
      </div>
    </div>
  );
}
