"use client";

import { useEffect, useState } from "react";
import { LuUmbrella, LuDownload, LuLoader } from "react-icons/lu";
import { recentWeeks, weekLabel, addDaysIso } from "@/lib/weekUtils";
import { PAY_CATEGORIES } from "@/components/AddContractorModal";
import { fetchReportDepartments } from "./actions";
import { fetchTimeAwayReport } from "./timeAwayActions";

const SELECT =
  "text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer";

/**
 * Stored status values, with the wording the portals show.
 *
 * The value is what the filter sends, so "Declined" still matches the
 * "Rejected" rows behind it — see requestStatusDisplayLabel.
 */
const STATUS_OPTIONS = [
  { value: "All", label: "All Statuses" },
  { value: "Pending", label: "Pending" },
  { value: "Approved", label: "Approved" },
  { value: "Rejected", label: "Declined" },
  { value: "Cancelled", label: "Cancelled" },
  { value: "Archived", label: "Archived" },
] as const;

export function TimeAwayReport() {
  const weeks = recentWeeks(26);
  const [week, setWeek] = useState(weeks[0]);
  const [payCategory, setPayCategory] = useState("All");
  const [department, setDepartment] = useState("All");
  const [status, setStatus] = useState("All");
  const [departments, setDepartments] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchReportDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, []);

  async function handleExport() {
    setBusy(true);
    setMessage("");
    try {
      const { rows, error } = await fetchTimeAwayReport({ week, payCategory, department, status });
      if (error) { setMessage(error); return; }
      if (rows.length === 0) { setMessage("No time away requests cover that week under those filters."); return; }

      const headers = [
        "Week", "Name", "Contractor ID", "Email", "Pay Category", "Assigned Team", "Country",
        "Leave Type", "Drawn From", "Start Date", "End Date", "Days", "Hours", "Status", "Filed On", "Reason",
      ];
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const lines = [
        headers.join(","),
        ...rows.map((r) => [
          `${r.weekStart} to ${r.weekEnd}`,
          r.name, r.contractorId, r.email, r.payCategory, r.department, r.country,
          r.type, r.bucket, r.startDate, r.endDate,
          String(r.durationDays),
          // Decimal, so the column totals in a spreadsheet.
          r.hours.toFixed(2),
          r.status, r.filedOn, r.reason,
        ].map(escape).join(",")),
      ];

      // Leading BOM so Excel reads it as UTF-8 and accented names survive.
      const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `time-away-report_${week}_to_${addDaysIso(week, 6)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${rows.length} request${rows.length === 1 ? "" : "s"}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
        <LuUmbrella size={18} strokeWidth={2} className="text-teal-600 shrink-0" />
        <div>
          <h4 className="text-lg font-semibold text-[#003527]">Time Away Report</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            One row per request covering the week — type, dates, hours, which balance it draws from, and its
            status.
          </p>
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Week</span>
            <select className={SELECT} value={week} onChange={(e) => setWeek(e.target.value)}>
              {weeks.map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</span>
            <select className={SELECT} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
          Requests that overlap the week, not ones filed during it — a request filed in advance belongs to the
          week it covers. Filed On is carried separately so the notice period stays visible. Hours are what the
          request deducts from its balance; a date range is filed as one request per day, so it appears as one
          row per day.
        </p>
      </div>
    </div>
  );
}
