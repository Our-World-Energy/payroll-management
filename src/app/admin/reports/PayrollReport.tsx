"use client";

import { useEffect, useState } from "react";
import { LuBanknote, LuDownload, LuLoader, LuLock } from "react-icons/lu";
import { recentWeeks, weekLabel, datesBetween, addDaysIso } from "@/lib/weekUtils";
import { PAY_CATEGORIES } from "@/components/AddContractorModal";
import { useSalaryAccess } from "@/components/SalaryAccessContext";
import { fetchReportDepartments } from "./actions";
import { fetchPayrollReport } from "./payrollActions";

const DAY_HEADERS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const SELECT =
  "text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer";

/** Decimal, so a spreadsheet can total the column. */
const dec = (n: number) => n.toFixed(2);
const hrs = (minutes: number) => (minutes / 60).toFixed(2);

export function PayrollReport() {
  const weeks = recentWeeks(26);
  const [week, setWeek] = useState(weeks[0]);
  const [payCategory, setPayCategory] = useState("All");
  const [department, setDepartment] = useState("All");
  const [departments, setDepartments] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // The same unlock the rest of the console uses, so the button can say why it
  // is unavailable before anyone clicks it. canView is the context's own name
  // for it. The action checks again on the server — this is only the
  // affordance.
  const { canView: salaryVisible } = useSalaryAccess();

  useEffect(() => {
    fetchReportDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, []);

  async function handleExport() {
    setBusy(true);
    setMessage("");
    try {
      const { rows, error } = await fetchPayrollReport({ week, payCategory, department });
      if (error) { setMessage(error); return; }
      if (rows.length === 0) {
        setMessage("No processed payroll for that week and filters. A week has to be processed on Weekly Payroll before it appears here.");
        return;
      }

      const headers = [
        "Week", "Name", "Contractor ID", "Email", "Role", "Assigned Team", "Country", "Pay Category", "Currency",
        ...DAY_HEADERS,
        "Worksnap Actual Hours", "Completion Hours",
        "Reg Hours", "Reg OT Hours", "RD OT Hours", "US Holiday Hours", "HO OT Hours", "Local Holiday Hours",
        "Time Away Hours", "Medical Hours", "Special Leave Hours", "Advance Leave Hours", "Total Paid Hours",
        "Rate/hr", "Monthly Rate", "Weekly Rate",
        "Reg Pay", "Reg OT Pay", "RD OT Pay", "US Holiday Pay", "HO OT Pay", "Local Holiday Pay",
        "Time Away Pay", "Medical Pay", "Special Leave Pay", "Advance Leave Pay", "IND Hours Pay",
        "Bonus", "Miscellaneous", "Retroactive Pay", "REIM",
        "Gross", "Cash Advance", "HMO", "Deductions", "Net Pay", "Status",
      ];
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

      const lines = [
        headers.join(","),
        ...rows.map((r) => {
          const dates = datesBetween(r.weekStart, r.weekEnd);
          const h = r.hours;
          const p = r.pay;
          const totalPaidHours =
            h.reg + h.regOt + h.rdOt + h.usHoliday + h.hoOt + h.localHoliday
            + h.pto + h.sick + h.special + h.advance;
          return [
            `${r.weekStart} to ${r.weekEnd}`,
            r.name, r.contractorId, r.email, r.role, r.department, r.country, r.payCategory, r.currency,
            // The frozen Sun→Sat grid the voucher prints, in decimal hours.
            ...dates.map((d) => hrs(r.dailyMinutes[d] ?? 0)),
            hrs(r.actualMinutes),
            r.completionMinutes != null ? hrs(r.completionMinutes) : "",
            dec(h.reg), dec(h.regOt), dec(h.rdOt), dec(h.usHoliday), dec(h.hoOt), dec(h.localHoliday),
            dec(h.pto), dec(h.sick), dec(h.special), dec(h.advance), dec(totalPaidHours),
            dec(r.rates.hourly), dec(r.rates.monthly), dec(r.rates.weekly),
            dec(p.reg), dec(p.regOt), dec(p.rdOt), dec(p.usHoliday), dec(p.hoOt), dec(p.localHoliday),
            dec(p.pto), dec(p.sick), dec(p.special), dec(p.advance), dec(p.indHours),
            dec(p.bonus), dec(p.misc), dec(p.retroPay), dec(p.reim),
            dec(r.gross), dec(r.deductions.cashAdvance), dec(r.deductions.hmo),
            // Negative, as on the payroll export — the sign is what makes the
            // column reconcile against Gross and Net.
            dec(-r.deductions.total),
            dec(r.net), r.status,
          ].map(escape).join(",");
        }),
      ];

      // Leading BOM so Excel reads it as UTF-8 and accented names survive.
      const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll-report_${week}_to_${addDaysIso(week, 6)}.csv`;
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
        <LuBanknote size={18} strokeWidth={2} className="text-teal-600 shrink-0" />
        <div>
          <h4 className="text-lg font-semibold text-[#003527]">Payroll Report</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            One row per contractor for a week: the Sunday to Saturday day grid, every hour and pay component,
            deductions, Gross and Net.
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
            disabled={busy || !salaryVisible}
            title={salaryVisible ? undefined : "Unlock salary access to export pay figures"}
            className="inline-flex items-center gap-2 px-5 py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? <LuLoader size={15} className="animate-spin" />
              : salaryVisible ? <LuDownload size={15} strokeWidth={2} />
              : <LuLock size={15} strokeWidth={2} />}
            {busy ? "Building…" : salaryVisible ? "Export" : "Locked"}
          </button>
        </div>

        {message && <p className="mt-3 text-xs font-medium text-slate-500">{message}</p>}

        <p className="mt-3 text-[11px] text-slate-400">
          Read from the processed snapshots, so it reports what was actually paid — a week has to be processed on
          Weekly Payroll before it appears here. Every figure is decimal so a spreadsheet can total it, and
          Deductions is negative so it reconciles against Gross and Net. Pay figures require salary access.
        </p>
      </div>
    </div>
  );
}
