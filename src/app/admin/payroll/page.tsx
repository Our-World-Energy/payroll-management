"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { LuDownload, LuUpload, LuCircleCheck, LuClock, LuCircleAlert, LuSearch, LuCalendar, LuX, LuRefreshCw, LuEye, LuPencil, LuListChecks, LuBanknote } from "react-icons/lu";
import { fetchAllContractors, fetchAllLeaveRequestsAdmin } from "../contractors/actions";
import { fetchHolidays, type Holiday } from "../holidays/actions";
import {
  fetchPayrollAdjustments, savePayrollAdjustment, bulkImportPayrollAdjustments, type AdjustmentField,
  processWeeklyPayroll, fetchProcessedWeeklyPayroll, type ProcessedPayrollRow, type ProcessedSnapshot,
} from "./actions";
import { addDaysIso, sundayOf, recentWeeks, weekLabel, datesBetween, arizonaTodayIso } from "@/lib/weekUtils";
import { computePayComponents } from "@/lib/payrollVoucher";
import { WeekJumpDropdown } from "@/components/WeekJumpDropdown";
import { FilterSelect } from "@/components/FilterSelect";

function formatElapsedSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

type PayrollRow = {
  email: string;
  name: string;
  role: string;
  restDay: string;
  country: string;
  localHoliday: string;
  localHolidayMinutes: number | null;
  totalEvaluatedRegularMinutes: number | null;
  totalRegularOtMinutes: number | null;
  totalRdOtMinutes: number | null;
  totalUsHoMinutes: number | null;
  totalHoOtMinutes: number | null;
  totalTimeOffRequestMinutes: number;
  ptoHours: number;
  department: string;
  payCategory: string;
  shiftType: string;
  currency: string;
  hourlyRate: number;
  monthlyRate: number;
  weeklyRate: number;
  actualMinutes: number;
  completionMinutes: number | null;
  hours: number | null;
  gross: number | null;
  deductions: number | null;
  net: number | null;
  status: "Reviewed" | "For Review" | "No Activity" | "Processed";
  // True only when status is "Processed" AND something in Contractor
  // Details, Time Off Management, or Attendance has changed since the
  // process_weekly_payroll snapshot was taken — surfaced as an icon next to
  // the name, prompting a Re-Process.
  hasChangedSinceProcessed: boolean;
  // Saved per-day Evaluated Time (not raw Worksnap minutes) — feeds the
  // voucher's Sun→Sat grid only; all other voucher figures are unaffected.
  evaluatedDailyMinutes: Record<string, number>;
  bonus: number;
  misc: number;
  retroPay: number;
  reim: number;
  cashAdvance: number;
  hmo: number;
  tax: number;
};

// A leave request's hours are a flat per-request amount (not scaled by date
// range), so the week total sums each request overlapping the week once —
// matching the same logic Attendance Review uses for this same total.
function totalTimeOffRequestMinutesFor(
  rangeFrom: string,
  rangeTo: string,
  requests: Array<{ type: string; startDate: string; endDate: string; ptoUsedHours: number; sickLeaveUsedHours: number }>
) {
  return requests
    .filter((r) => r.startDate <= rangeTo && r.endDate >= rangeFrom)
    .reduce((sum, r) => sum + (r.type.startsWith("PTO") ? r.ptoUsedHours : r.sickLeaveUsedHours) * 60, 0);
}

// PTO-only hours (excludes Sick Leave requests) for the voucher's PTO HRS line.
function totalPtoHoursFor(
  rangeFrom: string,
  rangeTo: string,
  requests: Array<{ type: string; startDate: string; endDate: string; ptoUsedHours: number }>
) {
  return requests
    .filter((r) => r.type.startsWith("PTO") && r.startDate <= rangeTo && r.endDate >= rangeFrom)
    .reduce((sum, r) => sum + r.ptoUsedHours, 0);
}

function fmtVoucherDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}.${d}.${y.slice(2)}` : iso;
}

const STATUS_STYLES: Record<string, string> = {
  Reviewed:      "bg-emerald-50 text-emerald-700",
  "For Review":  "bg-amber-50 text-amber-700",
  "No Activity": "bg-slate-100 text-slate-500",
  Processed:     "bg-blue-50 text-blue-700",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  Reviewed:      <LuCircleCheck size={13} strokeWidth={2} />,
  "For Review":  <LuClock       size={13} strokeWidth={2} />,
  "No Activity": <LuCircleAlert size={13} strokeWidth={2} />,
  Processed:     <LuListChecks  size={13} strokeWidth={2} />,
};

function countryFromLocation(location: string) {
  const parts = location.split(",");
  return parts[parts.length - 1]?.trim() || "-";
}

function formatHolidayDate(dateIso: string) {
  const [y, m, d] = dateIso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

function formatLocalHolidays(matches: Holiday[]) {
  if (matches.length === 0) return "-";
  return matches.map((h) => `${formatHolidayDate(h.date)}: ${h.name}`).join("; ");
}

function formatMinutesAsHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${String(remaining).padStart(2, "0")}m`;
}

// Tolerates float rounding noise (e.g. computed via a slightly different
// division order) rather than flagging every processed row as "changed".
function numsDiffer(a: number, b: number, epsilon = 0.01) {
  return Math.abs(a - b) > epsilon;
}

function fmtMoney(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PayrollPage() {
  const [weeks, setWeeks] = useState<string[]>([]);
  const [week, setWeek] = useState("");
  const [showRangePicker, setShowRangePicker] = useState(false);
  const weekJumpButtonRef = useRef<HTMLButtonElement>(null);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [nameSearch, setNameSearch] = useState("");
  const [payCategoryFilter, setPayCategoryFilter] = useState("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [shiftTypeFilter, setShiftTypeFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [voucherTarget, setVoucherTarget] = useState<PayrollRow | null>(null);
  const [reviewTarget,  setReviewTarget]  = useState<PayrollRow | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [processedByEmail, setProcessedByEmail] = useState<Record<string, ProcessedSnapshot>>({});

  // Same recent-Sun→Sat-weeks list Attendance Management uses, anchored to
  // the current Arizona week.
  useEffect(() => {
    const list = recentWeeks();
    setWeeks(list);
    setWeek((current) => current || list[0]);
  }, []);

  const rangeFrom = week;
  const rangeTo = week ? addDaysIso(week, 6) : "";
  const isSelectedWeekEnded = !!rangeTo && arizonaTodayIso() > rangeTo;

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!rangeFrom) return;
      setIsLoading(true);
      setLoadError("");

      try {
        const [contractors, entriesResult, weekStatusResult, dayStatusResult, holidays, leaveRequests, adjustments, processedSnapshotByEmail] = await Promise.all([
          fetchAllContractors({ country: "All Countries", status: "Active", rules: [] }),
          fetch(`/api/worksnap-entries?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`).then((r) => r.json()),
          fetch(`/api/attendance/week-status?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`).then((r) => (r.ok ? r.json() : { weekStatuses: [] })),
          fetch(`/api/attendance/day-status?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`).then((r) => (r.ok ? r.json() : { days: [] })),
          fetchHolidays().catch(() => [] as Holiday[]),
          fetchAllLeaveRequestsAdmin().catch(() => []),
          fetchPayrollAdjustments(rangeFrom).catch(() => []),
          fetchProcessedWeeklyPayroll(rangeFrom).catch(() => ({} as Record<string, ProcessedSnapshot>)),
        ]);

        if (!isMounted) return;

        const minutesByEmail = new Map<string, number>();
        for (const e of (entriesResult.entries ?? [])) {
          const email = String(e.email ?? "").trim().toLowerCase();
          const durationMins = (e as { durationMins?: number }).durationMins ?? 0;
          if (!email) continue;
          minutesByEmail.set(email, (minutesByEmail.get(email) ?? 0) + durationMins);
        }

        // Saved per-day Evaluated Time (not raw Worksnap minutes) for the
        // voucher's Sun→Sat grid only — reflects admin review/adjustments.
        // All other payroll figures still come from the week-level totals
        // below (totalEvaluatedRegularMinutes, etc.), unaffected by this.
        const evaluatedDailyMinutesByEmail = new Map<string, Record<string, number>>();
        for (const d of (dayStatusResult.days ?? []) as Array<{ email?: string; date?: string; evaluatedMinutes?: number }>) {
          const email = String(d.email ?? "").trim().toLowerCase();
          const date = String(d.date ?? "").slice(0, 10);
          if (!email || !date) continue;
          const days = evaluatedDailyMinutesByEmail.get(email) ?? {};
          days[date] = (days[date] ?? 0) + (d.evaluatedMinutes ?? 0);
          evaluatedDailyMinutesByEmail.set(email, days);
        }

        type SavedWeekStatus = {
          requestStatus: string; completionMinutes: number | null; totalLocalHolidayMinutes: number | null;
          totalEvaluatedRegularMinutes: number | null; totalUsHoMinutes: number | null;
          totalRegularOtMinutes: number | null; totalRdOtMinutes: number | null; totalHoOtMinutes: number | null;
        };
        const weekStatusByEmail = new Map<string, SavedWeekStatus>(
          (weekStatusResult.weekStatuses ?? [])
            .filter((s: { email?: string }) => s.email)
            .map((s: { email: string } & SavedWeekStatus) => [s.email.trim().toLowerCase(), s])
        );

        const leaveRequestsByEmail = new Map<string, typeof leaveRequests>();
        for (const r of leaveRequests) {
          if (r.status !== "Approved") continue;
          const email = r.email.trim().toLowerCase();
          const list = leaveRequestsByEmail.get(email) ?? [];
          list.push(r);
          leaveRequestsByEmail.set(email, list);
        }

        const holidaysInWeek = holidays.filter((h) => h.date.slice(0, 10) >= rangeFrom && h.date.slice(0, 10) <= rangeTo);

        const adjustmentByEmail = new Map(adjustments.map((a) => [a.email.trim().toLowerCase(), a]));

        const nextRows: PayrollRow[] = contractors
          .filter((c) => c.email && (c.payCategory || "").trim().toLowerCase() !== "fixed-ind")
          .map((c) => {
            const email = c.email.trim().toLowerCase();
            const actualMinutes = minutesByEmail.get(email) ?? 0;
            const saved = weekStatusByEmail.get(email);
            const isReviewed = saved?.requestStatus === "APPROVED" && saved.completionMinutes != null;
            const hourlyRate = parseFloat(c.hourlyRate) || 0;
            const hours = isReviewed ? (saved!.completionMinutes as number) / 60 : null;
            const country = countryFromLocation(c.location || "");
            const localHoliday = formatLocalHolidays(holidaysInWeek.filter((h) => h.country === country));
            const contractorRequests = leaveRequestsByEmail.get(email) ?? [];
            const totalTimeOffRequestMinutes = totalTimeOffRequestMinutesFor(rangeFrom, rangeTo, contractorRequests);
            const ptoHours = totalPtoHoursFor(rangeFrom, rangeTo, contractorRequests);

            // Earnings and deductions both come straight from this contractor's
            // Manual Payroll Adjustment for the week, rather than a placeholder.
            const adjustment = adjustmentByEmail.get(email);
            const bonus = adjustment?.bonus ?? 0;
            const misc = adjustment?.misc ?? 0;
            const retroPay = adjustment?.retroPay ?? 0;
            const reim = adjustment?.reim ?? 0;
            const cashAdvance = adjustment?.cashAdvance ?? 0;
            const hmo = adjustment?.hmo ?? 0;
            const tax = adjustment?.tax ?? 0;

            // Gross Pay is the sum of each payroll component calculated independently
            // (its own time total × Hourly Rate × its own multiplier), plus PTO Pay
            // and the Manual Payroll Adjustment earnings — see computePayComponents —
            // so this always matches the voucher's total exactly.
            const gross = isReviewed
              ? computePayComponents(hourlyRate, {
                  totalEvaluatedRegularMinutes: saved?.totalEvaluatedRegularMinutes ?? null,
                  totalRegularOtMinutes: saved?.totalRegularOtMinutes ?? null,
                  totalRdOtMinutes: saved?.totalRdOtMinutes ?? null,
                  totalUsHoMinutes: saved?.totalUsHoMinutes ?? null,
                  totalHoOtMinutes: saved?.totalHoOtMinutes ?? null,
                  localHolidayMinutes: saved?.totalLocalHolidayMinutes ?? null,
                }).grossPay + ptoHours * hourlyRate + bonus + misc + retroPay + reim
              : null;
            const deductions = gross != null ? cashAdvance + hmo + tax : null;
            const net = gross != null && deductions != null ? gross - deductions : null;

            // Compare the live-computed values against the saved snapshot to
            // catch a Contractor Details / Time Off / Attendance change that
            // happened after this contractor was processed — gross/net/
            // deductions already fold in attendance totals, PTO hours, and
            // hourly rate, so this alone covers changes from all three areas.
            const snapshot = processedSnapshotByEmail[email];
            const hasChangedSinceProcessed = !!snapshot && (
              numsDiffer(snapshot.hourlyRate, hourlyRate) ||
              numsDiffer(snapshot.monthlyRate, parseFloat(c.monthlyRate) || 0) ||
              numsDiffer(snapshot.weeklyRate, parseFloat(c.weeklyRate) || 0) ||
              snapshot.actualMinutes !== actualMinutes ||
              snapshot.completionMinutes !== (isReviewed ? (saved!.completionMinutes as number) : null) ||
              numsDiffer(snapshot.gross, gross ?? 0) ||
              numsDiffer(snapshot.deductions, deductions ?? 0) ||
              numsDiffer(snapshot.net, net ?? 0) ||
              snapshot.department !== (c.department || "-") ||
              snapshot.role !== (c.role || "-") ||
              snapshot.country !== country ||
              snapshot.payCategory !== (c.payCategory || "-") ||
              snapshot.shiftType !== (c.shiftType || "-") ||
              snapshot.currency !== (c.currency || "USD")
            );

            return {
              email,
              name: c.fullName || email,
              role: c.role || "-",
              restDay: c.restDay || "",
              country,
              localHoliday,
              localHolidayMinutes: saved?.totalLocalHolidayMinutes ?? null,
              totalEvaluatedRegularMinutes: saved?.totalEvaluatedRegularMinutes ?? null,
              totalRegularOtMinutes: saved?.totalRegularOtMinutes ?? null,
              totalRdOtMinutes: saved?.totalRdOtMinutes ?? null,
              totalUsHoMinutes: saved?.totalUsHoMinutes ?? null,
              totalHoOtMinutes: saved?.totalHoOtMinutes ?? null,
              totalTimeOffRequestMinutes,
              ptoHours,
              department: c.department || "-",
              payCategory: c.payCategory || "-",
              shiftType: c.shiftType || "-",
              currency: c.currency || "USD",
              hourlyRate,
              monthlyRate: parseFloat(c.monthlyRate) || 0,
              weeklyRate: parseFloat(c.weeklyRate) || 0,
              actualMinutes,
              completionMinutes: isReviewed ? (saved!.completionMinutes as number) : null,
              hours,
              gross,
              deductions,
              net,
              // "Processed" (via the Process Payroll action) takes priority
              // over the raw Reviewed/For Review/No Activity computation —
              // it only reflects whether a process_weekly_payroll snapshot
              // exists for this contractor/week.
              status: processedSnapshotByEmail[email]
                ? "Processed"
                : isReviewed ? "Reviewed" : actualMinutes > 0 ? "For Review" : "No Activity",
              hasChangedSinceProcessed,
              evaluatedDailyMinutes: evaluatedDailyMinutesByEmail.get(email) ?? {},
              bonus,
              misc,
              retroPay,
              reim,
              cashAdvance,
              hmo,
              tax,
            };
          });

        setRows(nextRows);
        setProcessedByEmail(processedSnapshotByEmail);
      } catch {
        if (isMounted) {
          setLoadError("Unable to load payroll data.");
          setRows([]);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    load();
    return () => { isMounted = false; };
  }, [rangeFrom, rangeTo, reloadKey]);

  const filteredRows = rows.filter((r) => {
    const query = nameSearch.trim().toLowerCase();
    const matchesName = !query || r.name.toLowerCase().includes(query) || r.email.includes(query);
    const matchesPayCategory = payCategoryFilter === "All" || r.payCategory === payCategoryFilter;
    const matchesCountry = countryFilter === "All" || r.country === countryFilter;
    const matchesShiftType = shiftTypeFilter === "All" || r.shiftType === shiftTypeFilter;
    const matchesDepartment = departmentFilter === "All" || r.department === departmentFilter;
    return matchesName && matchesPayCategory && matchesCountry && matchesShiftType && matchesDepartment;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const payCategoryOptions = Array.from(new Set(rows.map((r) => r.payCategory).filter((c) => c !== "-"))).sort();
  const countryOptions = Array.from(new Set(rows.map((r) => r.country).filter((c) => c !== "-"))).sort();
  const shiftTypeOptions = Array.from(new Set(rows.map((r) => r.shiftType).filter((c) => c !== "-"))).sort();
  const departmentOptions = Array.from(new Set(rows.map((r) => r.department).filter((c) => c !== "-"))).sort();

  const forReviewCount   = filteredRows.filter((r) => r.status === "For Review").length;
  const reviewedCount    = filteredRows.filter((r) => r.status === "Reviewed").length;
  const noActivityCount  = filteredRows.filter((r) => r.status === "No Activity").length;
  const processedCount   = filteredRows.filter((r) => r.status === "Processed").length;

  const STATS = [
    { label: "For Review",  value: forReviewCount,  color: "text-amber-700",  iconBg: "bg-amber-50",  iconColor: "text-amber-600",  Icon: LuClock       },
    { label: "Reviewed",    value: reviewedCount,   color: "text-emerald-700", iconBg: "bg-emerald-50", iconColor: "text-emerald-600", Icon: LuCircleCheck },
    { label: "No Activity", value: noActivityCount, color: "text-slate-600",  iconBg: "bg-slate-100", iconColor: "text-slate-500",  Icon: LuCircleAlert },
    { label: "Processed",   value: processedCount,  color: "text-blue-700",   iconBg: "bg-blue-50",   iconColor: "text-blue-600",   Icon: LuListChecks  },
  ];

  const filtersActive =
    nameSearch.trim() !== "" ||
    payCategoryFilter !== "All" ||
    countryFilter !== "All" ||
    shiftTypeFilter !== "All" ||
    departmentFilter !== "All";

  function clearFilters() {
    setNameSearch("");
    setPayCategoryFilter("All");
    setCountryFilter("All");
    setShiftTypeFilter("All");
    setDepartmentFilter("All");
  }

  async function handleSaveAdjustment(values: {
    bonus: number; misc: number; retroPay: number; reim: number;
    cashAdvance: number; hmo: number; tax: number;
  }) {
    if (!reviewTarget) return { ok: false, error: "No contractor selected." };
    const result = await savePayrollAdjustment({ email: reviewTarget.email, weekStart: rangeFrom, ...values });
    if (result.ok) {
      setRows((prev) => prev.map((r) => r.email === reviewTarget.email ? { ...r, ...values } : r));
    }
    return result;
  }

  function handleImported(field: AdjustmentField, values: Map<string, number>) {
    setRows((prev) => prev.map((r) => {
      const value = values.get(r.email.trim().toLowerCase());
      return value !== undefined ? { ...r, [field]: value } : r;
    }));
  }

  // Re-fetch from Supabase rather than trust a local mutation, so "Processed"
  // status and the changed-since-processed icon always reflect exactly
  // what's persisted — used by both bulk Process Payroll and the single-
  // contractor Process/Re-Process button on the Voucher.
  function handleProcessed() {
    setReloadKey((key) => key + 1);
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 mb-3 md:mb-4">
        <div className="flex items-center gap-3">
          <div className="hidden sm:grid size-9 shrink-0 place-items-center rounded-xl bg-[#003527] text-white shadow-sm">
            <LuBanknote size={18} strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-bold text-[#003527] tracking-tight">Payroll</h2>
            <p className="text-xs md:text-sm text-slate-600 mt-0.5">
              Pay period: <span className="font-semibold text-slate-600">{week ? weekLabel(week) : "—"}</span> · based on reviewed Attendance data
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setShowProcessModal(true)}
            disabled={!isSelectedWeekEnded}
            title={!isSelectedWeekEnded ? "Process Payroll is only available once the selected week has ended" : undefined}
            className="flex items-center justify-center gap-1.5 w-28 sm:w-36 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
          >
            <LuListChecks size={14} strokeWidth={2} />
            <span className="hidden sm:inline">Process Payroll</span>
            <span className="sm:hidden">Process</span>
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center justify-center gap-1.5 w-28 sm:w-52 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <LuUpload size={14} strokeWidth={2} />
            <span className="hidden sm:inline">Import Earning/Deduction</span>
            <span className="sm:hidden">Import</span>
          </button>
          <button className="flex items-center justify-center gap-1.5 w-28 sm:w-36 py-1.5 bg-white border border-slate-200 text-[#003527] rounded-lg text-xs font-semibold hover:bg-slate-50">
            <LuDownload size={14} strokeWidth={2} />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>
      </div>

      {/* Scorecards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 mb-3 md:mb-4">
        {STATS.map(({ label, value, color, iconBg, iconColor, Icon }) => (
          <div key={label} className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center ${iconColor} shrink-0`}><Icon size={14} strokeWidth={1.75} /></div>
            <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className={`text-xl font-bold leading-tight tabular-nums ${color}`}>{value}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 md:px-6 py-3 border-b border-slate-100 flex flex-col gap-3 bg-linear-to-b from-slate-50/80 to-white">
          {/* Week selector */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h3 className="text-lg md:text-xl font-bold tracking-tight text-[#003527]">Weekly Payroll</h3>
              {isLoading && (
                <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-teal-600">
                  <LuRefreshCw size={12} className="animate-spin" /> Loading payroll data…
                </p>
              )}
              {!isLoading && loadError && (
                <p className="mt-0.5 text-xs font-medium text-red-600">{loadError}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm w-full md:w-auto overflow-x-auto">
              <div className="flex gap-1">
                {weeks.slice(0, 4).map((w) => (
                  <button key={w} onClick={() => setWeek(w)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-all ${week === w ? "bg-[#003527] text-white shadow-sm" : "text-slate-500 hover:text-[#003527] hover:bg-slate-100"}`}>{weekLabel(w)}</button>
                ))}
              </div>
              <div className="h-6 w-px bg-slate-200 mx-0.5 shrink-0" />
              <div className="relative shrink-0">
                <button ref={weekJumpButtonRef} onClick={() => setShowRangePicker((v) => !v)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${showRangePicker ? "text-teal-700 bg-teal-50" : "text-slate-600 hover:text-teal-700 hover:bg-teal-50"}`}>
                  <LuCalendar size={15} strokeWidth={2} /><span className="text-xs font-bold">Jump to Week</span>
                </button>
                {showRangePicker && <WeekJumpDropdown anchorRef={weekJumpButtonRef} onApply={(d) => setWeek(sundayOf(d))} onClose={() => setShowRangePicker(false)} />}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <LuSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={nameSearch}
                onChange={(event) => setNameSearch(event.target.value)}
                placeholder="Search by name…"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-800 outline-none transition-all hover:border-slate-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
              />
              {nameSearch && (
                <button
                  onClick={() => setNameSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 grid size-5 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <LuX size={13} />
                </button>
              )}
            </div>

            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-48" value={payCategoryFilter} onChange={setPayCategoryFilter} label="Filter by pay category">
              <option value="All">All Pay Categories</option>
              {payCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </FilterSelect>
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-40" value={countryFilter} onChange={setCountryFilter} label="Filter by country">
              <option value="All">All Countries</option>
              {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </FilterSelect>
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-40" value={shiftTypeFilter} onChange={setShiftTypeFilter} label="Filter by shift type">
              <option value="All">All Shift Types</option>
              {shiftTypeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </FilterSelect>
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-40" value={departmentFilter} onChange={setDepartmentFilter} label="Filter by assigned team">
              <option value="All">All Assigned Teams</option>
              {departmentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </FilterSelect>

            <div className="flex items-center gap-2 ml-auto">
              {filtersActive && (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LuX size={14} strokeWidth={2.5} /> Clear
                </button>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 whitespace-nowrap">
                <span className="font-bold text-[#003527]">{filteredRows.length}</span> shown
              </span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto" style={{ maxHeight: "60vh" }}>
          <table className="w-full text-left text-sm" style={{ minWidth: "1180px", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead className="sticky top-0 z-30">
              <tr className="bg-[#003527]">
                {["Name", "Country", "Assigned Team", "Pay Category", "Shift Type", "Local Holiday", "Local HO Time",
                  "Total Evaluated Regular Time", "Total US HO Time", "Total Regular OT Time", "Total RD OT Time", "Total HO OT Time", "Total Time Off Request Time",
                  "Completion Time", "Rate/hr", "Rate", "Gross", "Deductions", "Net Pay", "Status", "Action"].map((h, i) => (
                  <th
                    key={h}
                    className={`text-left px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-white uppercase tracking-widest whitespace-nowrap border-r border-white/20 last:border-r-0 overflow-hidden ${
                      h === "Status" || h === "Action" ? "text-center" : ""
                    } ${
                      i === 0 ? "sticky left-0 z-20 w-[180px] min-w-[180px] shadow-[1px_0_0_0_#e2e8f0]" : ""
                    } ${h === "Status" ? "sticky right-[90px] z-20 border-l border-white/20" : ""} ${
                      h === "Action" ? "sticky right-0 z-20 border-l border-white/20" : ""
                    }`}
                    style={
                      i === 0 ? { background: "#003527" }
                      : h === "Status" ? { minWidth: 150, width: 150, maxWidth: 150, background: "#003527" }
                      : h === "Action" ? { minWidth: 90, width: 90, maxWidth: 90, background: "#003527" }
                      : undefined
                    }
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={21} className="px-5 py-10 text-center text-sm text-slate-400">
                    {isLoading ? "Loading…" : rows.length === 0 ? "No active contractors found." : "No payroll rows match your search."}
                  </td>
                </tr>
              ) : filteredRows.map((r) => (
                <tr key={r.email} className="group hover:bg-slate-50 transition-colors">
                  <td className="sticky left-0 z-10 w-[180px] min-w-[180px] bg-white group-hover:bg-slate-50 px-4 md:px-6 py-3 md:py-4 font-semibold text-slate-800 whitespace-nowrap border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">
                    <span className="inline-flex items-center gap-1.5">
                      {r.name}
                      {r.status === "Processed" && r.hasChangedSinceProcessed && (
                        <LuRefreshCw
                          size={13}
                          strokeWidth={2}
                          className="text-amber-500 shrink-0"
                          title="Contractor Details, Time Off, or Attendance changed since this was processed — Re-Process to refresh it"
                        />
                      )}
                    </span>
                  </td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-500 whitespace-nowrap border-r border-slate-100">{r.country}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-500 whitespace-nowrap border-r border-slate-100">{r.department}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-500 whitespace-nowrap border-r border-slate-100">{r.payCategory}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-500 whitespace-nowrap border-r border-slate-100">{r.shiftType}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-500 whitespace-nowrap border-r border-slate-100">{r.localHoliday}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.localHolidayMinutes ? formatMinutesAsHours(r.localHolidayMinutes) : "—"}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.totalEvaluatedRegularMinutes ? formatMinutesAsHours(r.totalEvaluatedRegularMinutes) : "—"}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.totalUsHoMinutes ? formatMinutesAsHours(r.totalUsHoMinutes) : "—"}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.totalRegularOtMinutes ? formatMinutesAsHours(r.totalRegularOtMinutes) : "—"}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.totalRdOtMinutes ? formatMinutesAsHours(r.totalRdOtMinutes) : "—"}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.totalHoOtMinutes ? formatMinutesAsHours(r.totalHoOtMinutes) : "—"}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.totalTimeOffRequestMinutes > 0 ? formatMinutesAsHours(r.totalTimeOffRequestMinutes) : "—"}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.completionMinutes != null ? formatMinutesAsHours(r.completionMinutes) : "—"}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.currency} {r.hourlyRate.toFixed(2)}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.hourlyRate.toFixed(2)}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-slate-700 font-medium tabular-nums whitespace-nowrap border-r border-slate-100">{r.gross != null ? fmtMoney(r.gross, r.currency) : "—"}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-red-500 tabular-nums whitespace-nowrap border-r border-slate-100">{r.deductions != null ? `−${fmtMoney(r.deductions, r.currency)}` : "—"}</td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-teal-700 font-semibold tabular-nums whitespace-nowrap border-r border-slate-100">{r.net != null ? fmtMoney(r.net, r.currency) : "—"}</td>
                  <td
                    className="text-center sticky right-[90px] z-10 bg-white group-hover:bg-slate-50 border-l border-slate-200 overflow-hidden px-4 md:px-6 py-3 md:py-4"
                    style={{ minWidth: 150, width: 150, maxWidth: 150 }}
                  >
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[r.status]}`}>
                      {STATUS_ICONS[r.status]}
                      {r.status}
                    </span>
                  </td>
                  <td
                    className="text-center sticky right-0 z-10 bg-white group-hover:bg-slate-50 border-l border-slate-200 overflow-hidden px-4 md:px-6 py-3 md:py-4"
                    style={{ minWidth: 90, width: 90, maxWidth: 90 }}
                  >
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => setVoucherTarget(r)}
                        title="View payroll voucher"
                        className="text-slate-400 hover:text-[#003527] transition-colors"
                      >
                        <LuEye size={18} strokeWidth={1.75} />
                      </button>
                      <button
                        onClick={() => setReviewTarget(r)}
                        title="Review — add Bonus, MISC, Retro Pay, REIM"
                        className="text-slate-400 hover:text-[#003527] transition-colors"
                      >
                        <LuPencil size={16} strokeWidth={1.75} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 md:px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
          {filteredRows.length} of {rows.length} contractors · Week of {week ? weekLabel(week) : "—"}
        </div>
      </div>

      {voucherTarget && (
        <PayrollVoucherModal
          row={voucherTarget}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          processedSnapshot={processedByEmail[voucherTarget.email]}
          onClose={() => setVoucherTarget(null)}
          onProcessed={handleProcessed}
        />
      )}

      {reviewTarget && (
        <PayrollAdjustmentModal
          row={reviewTarget}
          onSave={handleSaveAdjustment}
          onClose={() => setReviewTarget(null)}
        />
      )}

      {showImportModal && (
        <ImportAdjustmentsModal
          weekStart={rangeFrom}
          onClose={() => setShowImportModal(false)}
          onImported={handleImported}
        />
      )}

      {showProcessModal && (
        <ProcessPayrollModal
          rows={rows}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          onClose={() => setShowProcessModal(false)}
          onProcessed={handleProcessed}
        />
      )}
    </div>
  );
}

const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THUR", "FRI", "SAT"];
const REST_DAY_TO_LABEL: Record<string, string> = {
  Sunday: "SUN", Monday: "MON", Tuesday: "TUE", Wednesday: "WED",
  Thursday: "THUR", Friday: "FRI", Saturday: "SAT",
};

function PayrollVoucherModal({
  row, rangeFrom, rangeTo, processedSnapshot, onClose, onProcessed,
}: {
  row: PayrollRow;
  rangeFrom: string;
  rangeTo: string;
  processedSnapshot?: ProcessedSnapshot;
  onClose: () => void;
  onProcessed: () => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Same button either processes this contractor for the first time or
  // re-saves an already-"Processed" one — only the label/wording changes,
  // the save itself is identical (an upsert on email+weekStart).
  const canProcess = row.status === "Reviewed" || row.status === "Processed";
  const isReprocess = row.status === "Processed";
  // Once "Processed", the voucher is a frozen document: every figure below
  // comes straight from the saved process_weekly_payroll snapshot rather
  // than being recomputed from today's live Contractor Details/Time
  // Off/Attendance data (which is exactly what "hasChangedSinceProcessed"
  // would flag as drifted).
  const usingSnapshot = row.status === "Processed" && !!processedSnapshot;

  async function handleProcessClick() {
    setIsSaving(true);
    setSaveError("");
    try {
      const live = computePayComponents(row.hourlyRate, {
        totalEvaluatedRegularMinutes: row.totalEvaluatedRegularMinutes,
        totalRegularOtMinutes: row.totalRegularOtMinutes,
        totalRdOtMinutes: row.totalRdOtMinutes,
        totalUsHoMinutes: row.totalUsHoMinutes,
        totalHoOtMinutes: row.totalHoOtMinutes,
        localHolidayMinutes: row.localHolidayMinutes,
      });
      const ptoPay = row.ptoHours * row.hourlyRate;
      const result = await processWeeklyPayroll([{
        email: row.email,
        weekStart: rangeFrom,
        weekEnd: rangeTo,
        name: row.name,
        role: row.role,
        restDay: row.restDay,
        department: row.department,
        country: row.country,
        payCategory: row.payCategory,
        shiftType: row.shiftType,
        currency: row.currency,
        hourlyRate: row.hourlyRate,
        monthlyRate: row.monthlyRate,
        weeklyRate: row.weeklyRate,
        actualMinutes: row.actualMinutes,
        completionMinutes: row.completionMinutes,
        hours: row.hours,
        gross: row.gross ?? 0,
        deductions: row.deductions ?? 0,
        net: row.net ?? 0,
        status: row.status,
        bonus: row.bonus,
        misc: row.misc,
        retroPay: row.retroPay,
        reim: row.reim,
        cashAdvance: row.cashAdvance,
        hmo: row.hmo,
        tax: row.tax,
        ptoHours: row.ptoHours,
        regHours: live.regHours,
        regOtHours: live.regOtHours,
        rdOtHours: live.rdOtHours,
        usHolidayHours: live.usHolidayHours,
        hoOtHours: live.hoOtHours,
        localHolidayHours: live.localHolidayHours,
        ptoPay,
        regPay: live.regPay,
        regOtPay: live.regOtPay,
        rdOtPay: live.rdOtPay,
        usHolidayPay: live.usHolidayPay,
        hoOtPay: live.hoOtPay,
        localHolidayPay: live.localHolidayPay,
        evaluatedDailyMinutes: row.evaluatedDailyMinutes,
      }]);
      if (!result.ok) {
        setSaveError(result.failed[0]?.error ?? "Failed to process. Please try again.");
        return;
      }
      toast.success(`${row.name} ${isReprocess ? "re-processed" : "processed"} successfully`);
      onProcessed();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to process. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const weekDates = rangeFrom && rangeTo ? datesBetween(rangeFrom, rangeTo) : [];

  // Every figure the voucher renders — sourced from the frozen snapshot when
  // "Processed", otherwise computed live exactly as before.
  const figures = usingSnapshot
    ? {
        regHours: processedSnapshot!.regHours,
        regOtHours: processedSnapshot!.regOtHours,
        rdOtHours: processedSnapshot!.rdOtHours,
        usHolidayHours: processedSnapshot!.usHolidayHours,
        hoOtHours: processedSnapshot!.hoOtHours,
        localHolidayHours: processedSnapshot!.localHolidayHours,
        regPay: processedSnapshot!.regPay,
        regOtPay: processedSnapshot!.regOtPay,
        rdOtPay: processedSnapshot!.rdOtPay,
        usHolidayPay: processedSnapshot!.usHolidayPay,
        hoOtPay: processedSnapshot!.hoOtPay,
        localHolidayPay: processedSnapshot!.localHolidayPay,
        ptoHours: processedSnapshot!.ptoHours,
        ptoPay: processedSnapshot!.ptoPay,
        bonus: processedSnapshot!.bonus,
        misc: processedSnapshot!.misc,
        retroPay: processedSnapshot!.retroPay,
        reim: processedSnapshot!.reim,
        cashAdvance: processedSnapshot!.cashAdvance,
        hmo: processedSnapshot!.hmo,
        tax: processedSnapshot!.tax,
        grossPay: processedSnapshot!.gross,
        totalDeductions: processedSnapshot!.deductions,
        netPay: processedSnapshot!.net,
        hourlyRate: processedSnapshot!.hourlyRate,
        monthlyRate: processedSnapshot!.monthlyRate,
        weeklyRate: processedSnapshot!.weeklyRate,
        currency: processedSnapshot!.currency,
        restDay: processedSnapshot!.restDay,
        evaluatedDailyMinutes: processedSnapshot!.evaluatedDailyMinutes,
      }
    : (() => {
        const live = computePayComponents(row.hourlyRate, {
          totalEvaluatedRegularMinutes: row.totalEvaluatedRegularMinutes,
          totalRegularOtMinutes: row.totalRegularOtMinutes,
          totalRdOtMinutes: row.totalRdOtMinutes,
          totalUsHoMinutes: row.totalUsHoMinutes,
          totalHoOtMinutes: row.totalHoOtMinutes,
          localHolidayMinutes: row.localHolidayMinutes,
        });
        const ptoPay = row.ptoHours * row.hourlyRate;
        const grossPay = live.grossPay + ptoPay + row.bonus + row.misc + row.retroPay + row.reim;
        const totalDeductions = row.cashAdvance + row.hmo + row.tax;
        return {
          regHours: live.regHours,
          regOtHours: live.regOtHours,
          rdOtHours: live.rdOtHours,
          usHolidayHours: live.usHolidayHours,
          hoOtHours: live.hoOtHours,
          localHolidayHours: live.localHolidayHours,
          regPay: live.regPay,
          regOtPay: live.regOtPay,
          rdOtPay: live.rdOtPay,
          usHolidayPay: live.usHolidayPay,
          hoOtPay: live.hoOtPay,
          localHolidayPay: live.localHolidayPay,
          ptoHours: row.ptoHours,
          ptoPay,
          bonus: row.bonus,
          misc: row.misc,
          retroPay: row.retroPay,
          reim: row.reim,
          cashAdvance: row.cashAdvance,
          hmo: row.hmo,
          tax: row.tax,
          grossPay,
          totalDeductions,
          netPay: grossPay - totalDeductions,
          hourlyRate: row.hourlyRate,
          monthlyRate: row.monthlyRate,
          weeklyRate: row.weeklyRate,
          currency: row.currency,
          restDay: row.restDay,
          evaluatedDailyMinutes: row.evaluatedDailyMinutes,
        };
      })();

  const restDayLabels = new Set(
    figures.restDay.split(",").map((d) => REST_DAY_TO_LABEL[d.trim()]).filter(Boolean)
  );
  const {
    regHours, regOtHours, rdOtHours, usHolidayHours, hoOtHours, localHolidayHours,
    regPay, regOtPay, rdOtPay, usHolidayPay, hoOtPay, localHolidayPay,
    ptoHours, ptoPay, bonus, misc, retroPay, reim, cashAdvance, hmo,
    grossPay, totalDeductions, netPay,
  } = figures;

  const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors z-10"
        >
          <LuX size={18} strokeWidth={2} />
        </button>

        <div className="p-4 md:p-5 text-sm text-slate-800">
          {canProcess && (
            <div className="flex items-center justify-start gap-3 mb-2.5">
              <button
                onClick={handleProcessClick}
                disabled={isSaving}
                className={`px-5 py-1.5 text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                  isReprocess
                    ? "border border-blue-200 text-blue-700 hover:bg-blue-50"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                <LuListChecks size={15} strokeWidth={2} />
                {isSaving ? (isReprocess ? "Re-Processing…" : "Processing…") : (isReprocess ? "Re-Process" : "Process")}
              </button>
              {saveError && <p className="text-xs font-medium text-red-600">{saveError}</p>}
            </div>
          )}

          {/* Header */}
          <div className="grid grid-cols-3 items-start gap-4 pb-2.5 border-b-2 border-[#003527]">
            <div />
            <h3 className="text-center font-bold text-slate-700 tracking-wide">Payroll Voucher</h3>
            <div className="text-right text-xs justify-self-end">
              <p><span className="text-slate-500">Pay Period:</span> <span className="font-semibold">{fmtVoucherDate(rangeFrom)} to {fmtVoucherDate(rangeTo)}</span></p>
              <p className="mt-0.5"><span className="text-slate-500">Check Date:</span> <span className="font-semibold">{rangeTo ? fmtVoucherDate(addDaysIso(rangeTo, 6)) : "—"}</span></p>
            </div>
          </div>

          {/* Contractor info */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs mt-2.5 mb-3">
            <p><span className="text-slate-500">Contractor</span> <span className="font-semibold ml-2">{row.name}</span></p>
            <p><span className="text-slate-500">Monthly Rate</span> <span className="font-semibold ml-2">{money(figures.monthlyRate)}</span></p>
            <p><span className="text-slate-500">Role</span> <span className="font-semibold ml-2">{row.role}</span></p>
            <p><span className="text-slate-500">Weekly Rate</span> <span className="font-semibold ml-2">{money(figures.weeklyRate)}</span></p>
          </div>

          {/* Gross Pay */}
          <div className="bg-[#003527] text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-t-md">Gross Pay</div>
          <div className="border border-t-0 border-slate-200 rounded-b-md px-4 py-2.5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <table className="w-full text-xs mb-2">
                <thead>
                  <tr>
                    {DAY_LABELS.map((d) => (
                      <th key={d} className="border border-slate-200 bg-slate-50 px-1 py-0.5 font-semibold text-slate-500">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {weekDates.map((date, i) => {
                      const label = DAY_LABELS[i];
                      const isOff = restDayLabels.has(label);
                      const hours = (figures.evaluatedDailyMinutes[date] ?? 0) / 60;
                      return (
                        <td key={date} className="border border-slate-200 px-1 py-1 text-center tabular-nums">
                          {isOff ? "OFF" : hours.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>

              <div className="space-y-1 text-xs">
                {[
                  ["REG Hours", regHours],
                  ["PTO HRS", ptoHours],
                  ["US HO HRS", usHolidayHours],
                  ["LOCAL HO HRS", localHolidayHours],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-0.5">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold tabular-nums">{(value as number).toFixed(2)}</span>
                  </div>
                ))}
                {[
                  ["REG OT HRS", regOtHours],
                  ["RD OT HRS", rdOtHours],
                  ["HO OT HRS", hoOtHours],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-0.5">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold tabular-nums">{(value as number).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1 text-xs">
              {[
                ["REG HRS Pay", regPay],
                ["REG OT", regOtPay],
                ["RD OT", rdOtPay],
                ["US HOLIDAY PAY", usHolidayPay],
                ["HO OT", hoOtPay],
                ["LOCAL HOLIDAY PAY", localHolidayPay],
                ["PTO", ptoPay],
                ["Bonus", bonus],
                ["MISC", misc],
                ["Retro Pay", retroPay],
                ["REIM", reim],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-0.5">
                  <span className="text-slate-500">{label}</span>
                  <span className={`tabular-nums ${(value as number) > 0 ? "font-semibold" : "text-slate-300"}`}>{money(value as number)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-2 border-[#003527] rounded-md px-2 py-1 mt-1.5">
                <span className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Gross Pay</span>
                <span className="font-bold tabular-nums">{money(grossPay)}</span>
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div className="bg-[#003527] text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-t-md mt-2.5">Deduction</div>
          <div className="border border-t-0 border-slate-200 rounded-b-md px-4 py-2.5 flex items-end justify-between gap-6">
            <div className="space-y-1 text-xs flex-1">
              {[
                ["Cash Advance", cashAdvance],
                ["HMO Premium", hmo],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-0.5">
                  <span className="text-slate-500">{label}</span>
                  <span className={`tabular-nums ${(value as number) > 0 ? "font-semibold" : "text-slate-300"}`}>{money(value as number)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold uppercase text-[10px] tracking-wider text-slate-500 whitespace-nowrap">Total Deductions</span>
              <span className="font-bold tabular-nums border-2 border-slate-300 rounded-md px-3 py-1">{money(totalDeductions)}</span>
            </div>
          </div>

          {/* Net Pay */}
          <div className="mt-2.5 flex items-center justify-between bg-[#003527] text-white rounded-md px-4 py-2">
            <span className="font-bold uppercase text-xs tracking-wider">Net Pay</span>
            <span className="font-bold text-lg tabular-nums">{figures.currency} {money(netPay)}</span>
          </div>

          <p className="text-[10px] text-slate-400 mt-2">
            Check Date is always the Friday following the pay period&apos;s end date.
            Bonus, MISC, Retro Pay, REIM, Cash Advance, HMO Premium, and Tax can be entered via the Review action on the payroll table.
          </p>
        </div>
      </div>
    </div>
  );
}

type AdjustmentValues = {
  bonus: number; misc: number; retroPay: number; reim: number;
  cashAdvance: number; hmo: number; tax: number;
};

const EARNINGS_TAB = "earnings" as const;
const DEDUCTION_TAB = "deduction" as const;

function PayrollAdjustmentModal({
  row, onSave, onClose,
}: {
  row: PayrollRow;
  onSave: (values: AdjustmentValues) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<typeof EARNINGS_TAB | typeof DEDUCTION_TAB>(EARNINGS_TAB);
  const [bonus,       setBonus]       = useState(row.bonus ? row.bonus.toString() : "");
  const [misc,        setMisc]        = useState(row.misc ? row.misc.toString() : "");
  const [retroPay,    setRetroPay]    = useState(row.retroPay ? row.retroPay.toString() : "");
  const [reim,        setReim]        = useState(row.reim ? row.reim.toString() : "");
  const [cashAdvance, setCashAdvance] = useState(row.cashAdvance ? row.cashAdvance.toString() : "");
  const [hmo,         setHmo]         = useState(row.hmo ? row.hmo.toString() : "");
  const [tax,         setTax]         = useState(row.tax ? row.tax.toString() : "");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");

  const earningsFields: [string, string, (v: string) => void][] = [
    ["Bonus",     bonus,    setBonus],
    ["MISC",      misc,     setMisc],
    ["Retro Pay", retroPay, setRetroPay],
    ["REIM",      reim,     setReim],
  ];
  const deductionFields: [string, string, (v: string) => void][] = [
    ["Cash Advance", cashAdvance, setCashAdvance],
    ["HMO",          hmo,         setHmo],
    ["Tax",          tax,         setTax],
  ];

  async function handleSave() {
    setError("");
    setSaving(true);
    const result = await onSave({
      bonus: parseFloat(bonus) || 0,
      misc: parseFloat(misc) || 0,
      retroPay: parseFloat(retroPay) || 0,
      reim: parseFloat(reim) || 0,
      cashAdvance: parseFloat(cashAdvance) || 0,
      hmo: parseFloat(hmo) || 0,
      tax: parseFloat(tax) || 0,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Failed to save adjustment.");
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <button
          onClick={onClose}
          disabled={saving}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
        >
          <LuX size={18} strokeWidth={2} />
        </button>

        <h3 className="text-base font-bold text-[#003527]">Review — Manual Payroll Adjustments</h3>
        <p className="text-xs text-slate-400 mt-1 mb-5">{row.name}</p>

        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-4">
          {([
            [EARNINGS_TAB, "Earnings"],
            [DEDUCTION_TAB, "Deduction"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                tab === key ? "bg-white text-[#003527] shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {(tab === EARNINGS_TAB ? earningsFields : deductionFields).map(([label, value, setValue]) => (
            <div key={label} className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
              <input
                type="number"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.00"
                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          ))}
        </div>

        {error && <p className="text-xs font-medium text-red-600 mt-3">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-5 py-2.5 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <LuCircleCheck size={15} strokeWidth={2} /> {saving ? "Saving…" : "Save Adjustments"}
        </button>
      </div>
    </div>
  );
}

const EARNINGS_FIELD_OPTIONS: { value: AdjustmentField; label: string }[] = [
  { value: "bonus", label: "Bonus" },
  { value: "misc", label: "MISC" },
  { value: "retroPay", label: "Retro Pay" },
  { value: "reim", label: "REIM" },
];
const DEDUCTION_FIELD_OPTIONS: { value: AdjustmentField; label: string }[] = [
  { value: "cashAdvance", label: "Cash Advance" },
  { value: "hmo", label: "HMO" },
];

// Minimal dependency-free CSV parser — handles quoted fields (with ""
// escaping) and both \n and \r\n line endings. Good enough for a simple
// two-column Email,Amount file.
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

function ImportAdjustmentsModal({
  weekStart, onClose, onImported,
}: {
  weekStart: string;
  onClose: () => void;
  onImported: (field: AdjustmentField, values: Map<string, number>) => void;
}) {
  const [category, setCategory] = useState<"Earnings" | "Deduction">("Earnings");
  const [field, setField] = useState<AdjustmentField>("bonus");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ updated: number; failed: number } | null>(null);

  const fieldOptions = category === "Earnings" ? EARNINGS_FIELD_OPTIONS : DEDUCTION_FIELD_OPTIONS;

  function handleCategoryChange(next: "Earnings" | "Deduction") {
    setCategory(next);
    setField(next === "Earnings" ? EARNINGS_FIELD_OPTIONS[0].value : DEDUCTION_FIELD_OPTIONS[0].value);
    setResult(null);
    setError("");
  }

  async function handleImport() {
    if (!file) { setError("Choose a CSV file first."); return; }
    setError("");
    setResult(null);
    setImporting(true);
    try {
      const text = await file.text();
      const dataRows = parseCsvRows(text).slice(1); // first row is the header
      const rows: { email: string; value: number }[] = [];
      for (const cols of dataRows) {
        const email = (cols[0] ?? "").trim();
        const value = Number(cols[1]);
        if (!email || !Number.isFinite(value)) continue;
        rows.push({ email, value });
      }
      if (rows.length === 0) {
        setError("No valid rows found. Expected columns: Email, Amount.");
        return;
      }

      const res = await bulkImportPayrollAdjustments(weekStart, field, rows);
      setResult({ updated: res.updated, failed: res.failed.length });

      if (res.updated > 0) {
        const failedEmails = new Set(res.failed.map((f) => f.email));
        const values = new Map(
          rows
            .map((r) => [r.email.trim().toLowerCase(), r.value] as const)
            .filter(([email]) => !failedEmails.has(email))
        );
        onImported(field, values);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import CSV.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !importing && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <button
          onClick={onClose}
          disabled={importing}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
        >
          <LuX size={18} strokeWidth={2} />
        </button>

        <h3 className="text-base font-bold text-[#003527]">Import Earnings & Deductions</h3>
        <p className="text-xs text-slate-400 mt-1 mb-5">CSV columns: Email, Amount</p>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Type</label>
            <select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value as "Earnings" | "Deduction")}
              className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
            >
              <option value="Earnings">Earnings</option>
              <option value="Deduction">Deduction</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Field</label>
            <select
              value={field}
              onChange={(e) => setField(e.target.value as AdjustmentField)}
              className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
            >
              {fieldOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(""); }}
              className="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:text-xs file:font-semibold hover:file:bg-slate-200"
            />
          </div>
        </div>

        {error && <p className="text-xs font-medium text-red-600 mt-3">{error}</p>}
        {result && (
          <p className={`text-xs font-medium mt-3 ${result.failed > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {result.updated} row{result.updated !== 1 ? "s" : ""} updated{result.failed > 0 ? `, ${result.failed} failed` : ""}.
          </p>
        )}

        <button
          onClick={handleImport}
          disabled={importing || !file}
          className="w-full mt-5 py-2.5 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <LuUpload size={15} strokeWidth={2} /> {importing ? "Importing…" : "Import"}
        </button>
      </div>
    </div>
  );
}

// Finalizes every already-"Reviewed" row into process_weekly_payroll —
// "For Review"/"No Activity" rows are skipped entirely, same spirit as
// Process Attendance only saving Standard Met/Reviewed rows.
function ProcessPayrollModal({ rows, rangeFrom, rangeTo, onClose, onProcessed }: {
  rows: PayrollRow[];
  rangeFrom: string;
  rangeTo: string;
  onClose: () => void;
  onProcessed: () => void;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [processError, setProcessError] = useState("");
  const [processedSoFar, setProcessedSoFar] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [processingElapsedSeconds, setProcessingElapsedSeconds] = useState(0);
  const cancelledRef = useRef(false);
  const isBusy = isProcessing || isReprocessing;

  useEffect(() => {
    if (!isBusy) return;
    setProcessingElapsedSeconds(0);
    const id = setInterval(() => setProcessingElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isBusy]);

  const reviewedCount   = rows.filter((r) => r.status === "Reviewed").length;
  const forReviewCount  = rows.filter((r) => r.status === "For Review").length;
  const noActivityCount = rows.filter((r) => r.status === "No Activity").length;
  const processedCount  = rows.filter((r) => r.status === "Processed").length;

  // First-time processing only ever targets "Reviewed" rows — once a row is
  // "Processed" it's excluded here (see Re-Process below for revisiting it).
  const eligibleRows = rows.filter((r) => r.status === "Reviewed");
  // Already-"Processed" rows — re-saved on demand via Re-Process, e.g. if a
  // payroll adjustment was edited after the original processing run.
  const alreadyProcessedRows = rows.filter((r) => r.status === "Processed");

  function buildItems(rowsToProcess: PayrollRow[]): ProcessedPayrollRow[] {
    return rowsToProcess.map((r) => {
      const live = computePayComponents(r.hourlyRate, {
        totalEvaluatedRegularMinutes: r.totalEvaluatedRegularMinutes,
        totalRegularOtMinutes: r.totalRegularOtMinutes,
        totalRdOtMinutes: r.totalRdOtMinutes,
        totalUsHoMinutes: r.totalUsHoMinutes,
        totalHoOtMinutes: r.totalHoOtMinutes,
        localHolidayMinutes: r.localHolidayMinutes,
      });
      const ptoPay = r.ptoHours * r.hourlyRate;
      return {
        email: r.email,
        weekStart: rangeFrom,
        weekEnd: rangeTo,
        name: r.name,
        role: r.role,
        restDay: r.restDay,
        department: r.department,
        country: r.country,
        payCategory: r.payCategory,
        shiftType: r.shiftType,
        currency: r.currency,
        hourlyRate: r.hourlyRate,
        monthlyRate: r.monthlyRate,
        weeklyRate: r.weeklyRate,
        actualMinutes: r.actualMinutes,
        completionMinutes: r.completionMinutes,
        hours: r.hours,
        gross: r.gross ?? 0,
        deductions: r.deductions ?? 0,
        net: r.net ?? 0,
        status: r.status,
        bonus: r.bonus,
        misc: r.misc,
        retroPay: r.retroPay,
        reim: r.reim,
        cashAdvance: r.cashAdvance,
        hmo: r.hmo,
        tax: r.tax,
        ptoHours: r.ptoHours,
        regHours: live.regHours,
        regOtHours: live.regOtHours,
        rdOtHours: live.rdOtHours,
        usHolidayHours: live.usHolidayHours,
        hoOtHours: live.hoOtHours,
        localHolidayHours: live.localHolidayHours,
        ptoPay,
        regPay: live.regPay,
        regOtPay: live.regOtPay,
        rdOtPay: live.rdOtPay,
        usHolidayPay: live.usHolidayPay,
        hoOtPay: live.hoOtPay,
        localHolidayPay: live.localHolidayPay,
        evaluatedDailyMinutes: r.evaluatedDailyMinutes,
      };
    });
  }

  // One contractor at a time, awaited sequentially, instead of one call
  // covering the whole batch — this is what makes a real "N of M processed"
  // counter possible and lets Cancel stop cleanly between contractors
  // instead of having no visibility into an in-flight batch at all (same
  // approach as Bulk Approve / Process Attendance).
  async function runProcess(rowsToProcess: PayrollRow[], setBusy: (v: boolean) => void, label: string) {
    setBusy(true);
    setCancelling(false);
    setProcessError("");
    setProcessedSoFar(0);
    setTotalToProcess(rowsToProcess.length);
    cancelledRef.current = false;

    const items = buildItems(rowsToProcess);
    let processed = 0;
    const failed: Array<{ email: string; error: string }> = [];

    for (const item of items) {
      if (cancelledRef.current) break;
      try {
        const result = await processWeeklyPayroll([item]);
        if (!result.ok) failed.push(...result.failed);
      } catch (err) {
        failed.push({ email: item.email, error: err instanceof Error ? err.message : "Failed to process payroll." });
      }
      processed++;
      setProcessedSoFar(processed);
    }

    setBusy(false);
    setCancelling(false);

    if (cancelledRef.current) {
      setProcessError(`Cancelled after ${processed} of ${items.length} — contractors already processed before cancelling stay saved. Retry the rest, or refresh to check.`);
      if (processed > failed.length) onProcessed();
      return;
    }

    if (failed.length > 0) {
      setProcessError(`${failed.length} of ${items.length} record${items.length !== 1 ? "s" : ""} failed to process. Please try again.`);
      if (processed > failed.length) onProcessed();
      return;
    }

    toast.success(`${processed} contractor${processed !== 1 ? "s" : ""} ${label} successfully`);
    onProcessed();
    onClose();
  }

  function handleCancelProcess() {
    setCancelling(true);
    cancelledRef.current = true;
  }

  function handleProcess() {
    return runProcess(eligibleRows, setIsProcessing, "processed");
  }

  function handleReprocess() {
    return runProcess(alreadyProcessedRows, setIsReprocessing, "re-processed");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isProcessing && !isReprocessing && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-[#003527]">Process Payroll</h3>
          <button
            onClick={onClose}
            disabled={isProcessing || isReprocessing}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <LuX size={18} strokeWidth={2} />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          {rangeFrom && rangeTo ? weekLabel(rangeFrom) : "This week"} — rows still needing review are skipped.
        </p>

        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-100">
            <span className="text-sm font-medium text-amber-700">For Review</span>
            <span className="text-sm font-bold text-amber-700">{forReviewCount}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
            <span className="text-sm font-medium text-emerald-700">Reviewed</span>
            <span className="text-sm font-bold text-emerald-700">{reviewedCount}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-sm font-medium text-slate-600">No Activity</span>
            <span className="text-sm font-bold text-slate-600">{noActivityCount}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-100">
            <span className="text-sm font-medium text-blue-700">Processed</span>
            <span className="text-sm font-bold text-blue-700">{processedCount}</span>
          </div>
        </div>

        {processError && <p className="text-xs text-red-600 mb-3">{processError}</p>}

        <p className="text-xs text-slate-400 mb-5">
          {eligibleRows.length} record{eligibleRows.length !== 1 ? "s" : ""} will be saved to process_weekly_payroll.
          {processedCount > 0 && ` Re-Process will re-save the ${processedCount} already-processed record${processedCount !== 1 ? "s" : ""}.`}
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing || isReprocessing}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleReprocess}
            disabled={isProcessing || isReprocessing || alreadyProcessedRows.length === 0}
            title="Re-save the already-processed records — e.g. if a payroll adjustment changed since they were processed"
            className="px-4 py-2 border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            {isReprocessing ? "Re-Processing…" : "Re-Process"}
          </button>
          <button
            onClick={handleProcess}
            disabled={isProcessing || isReprocessing || eligibleRows.length === 0}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2"
          >
            {isProcessing ? "Processing…" : "Process"}
          </button>
        </div>
      </div>

      {/* Processing overlay — blocks interaction and shows live progress
          while a process is in flight (a large batch can take a while). */}
      {isBusy && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 flex flex-col items-center gap-3 min-w-[240px]">
            <LuRefreshCw size={28} className="text-blue-600 animate-spin" />
            <p className="text-sm font-semibold text-slate-700">
              {cancelling ? "Cancelling…" : isReprocessing ? "Re-Processing payroll…" : "Processing payroll…"}
            </p>
            <p className="text-xs font-semibold text-blue-700 tabular-nums">
              {processedSoFar} of {totalToProcess} contractor{totalToProcess !== 1 ? "s" : ""} processed
            </p>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${totalToProcess > 0 ? Math.round((processedSoFar / totalToProcess) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 tabular-nums">{formatElapsedSeconds(processingElapsedSeconds)}</p>
            <button
              type="button"
              onClick={handleCancelProcess}
              disabled={cancelling}
              title="Contractors already processed before cancelling will stay saved — this only stops waiting on the rest"
              className="mt-1 px-4 py-1.5 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
