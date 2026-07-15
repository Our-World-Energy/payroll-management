"use client";

import { useState, useEffect } from "react";
import { LuDownload, LuCircleCheck, LuClock, LuCircleAlert, LuSearch, LuCalendar, LuX, LuRefreshCw, LuEye, LuPencil } from "react-icons/lu";
import { fetchAllContractors, fetchAllLeaveRequestsAdmin } from "../contractors/actions";
import { fetchHolidays, type Holiday } from "../holidays/actions";
import { fetchPayrollAdjustments, savePayrollAdjustment } from "./actions";
import { addDaysIso, sundayOf, recentWeeks, weekLabel, datesBetween } from "@/lib/weekUtils";
import { WeekJumpDropdown } from "@/components/WeekJumpDropdown";
import { FilterSelect } from "@/components/FilterSelect";
import { Logo } from "@/components/Logo";

// No real deductions/tax data exists anywhere yet — kept as the same flat
// placeholder ratio the old mock page used, not a real tax calculation.
const DEDUCTION_RATE = 0.15;

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
  status: "Reviewed" | "For Review" | "No Activity";
  dailyMinutes: Record<string, number>;
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
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  Reviewed:      <LuCircleCheck size={13} strokeWidth={2} />,
  "For Review":  <LuClock       size={13} strokeWidth={2} />,
  "No Activity": <LuCircleAlert size={13} strokeWidth={2} />,
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

function fmtMoney(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PayrollPage() {
  const [weeks, setWeeks] = useState<string[]>([]);
  const [week, setWeek] = useState("");
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [payCategoryFilter, setPayCategoryFilter] = useState("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [shiftTypeFilter, setShiftTypeFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [voucherTarget, setVoucherTarget] = useState<PayrollRow | null>(null);
  const [reviewTarget,  setReviewTarget]  = useState<PayrollRow | null>(null);

  // Same recent-Sun→Sat-weeks list Attendance Management uses, anchored to
  // the current Arizona week.
  useEffect(() => {
    const list = recentWeeks();
    setWeeks(list);
    setWeek((current) => current || list[0]);
  }, []);

  const rangeFrom = week;
  const rangeTo = week ? addDaysIso(week, 6) : "";

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!rangeFrom) return;
      setIsLoading(true);
      setLoadError("");

      try {
        const [contractors, entriesResult, weekStatusResult, holidays, leaveRequests, adjustments] = await Promise.all([
          fetchAllContractors({ country: "All Countries", status: "Active", rules: [] }),
          fetch(`/api/worksnap-entries?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`).then((r) => r.json()),
          fetch(`/api/attendance/week-status?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`).then((r) => (r.ok ? r.json() : { weekStatuses: [] })),
          fetchHolidays().catch(() => [] as Holiday[]),
          fetchAllLeaveRequestsAdmin().catch(() => []),
          fetchPayrollAdjustments(rangeFrom).catch(() => []),
        ]);

        if (!isMounted) return;

        const minutesByEmail = new Map<string, number>();
        const dailyMinutesByEmail = new Map<string, Record<string, number>>();
        for (const e of (entriesResult.entries ?? [])) {
          const email = String(e.email ?? "").trim().toLowerCase();
          const durationMins = (e as { durationMins?: number }).durationMins ?? 0;
          if (!email) continue;
          minutesByEmail.set(email, (minutesByEmail.get(email) ?? 0) + durationMins);
          const entryDate = String((e as { entryDate?: string }).entryDate ?? "").slice(0, 10);
          if (entryDate) {
            const days = dailyMinutesByEmail.get(email) ?? {};
            days[entryDate] = (days[entryDate] ?? 0) + durationMins;
            dailyMinutesByEmail.set(email, days);
          }
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
          .filter((c) => c.email)
          .map((c) => {
            const email = c.email.trim().toLowerCase();
            const actualMinutes = minutesByEmail.get(email) ?? 0;
            const saved = weekStatusByEmail.get(email);
            const isReviewed = saved?.requestStatus === "APPROVED" && saved.completionMinutes != null;
            const hourlyRate = parseFloat(c.hourlyRate) || 0;
            const hours = isReviewed ? (saved!.completionMinutes as number) / 60 : null;
            const gross = hours != null ? hours * hourlyRate : null;
            const deductions = gross != null ? gross * DEDUCTION_RATE : null;
            const net = gross != null && deductions != null ? gross - deductions : null;
            const country = countryFromLocation(c.location || "");
            const localHoliday = formatLocalHolidays(holidaysInWeek.filter((h) => h.country === country));
            const contractorRequests = leaveRequestsByEmail.get(email) ?? [];
            const totalTimeOffRequestMinutes = totalTimeOffRequestMinutesFor(rangeFrom, rangeTo, contractorRequests);
            const ptoHours = totalPtoHoursFor(rangeFrom, rangeTo, contractorRequests);

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
              status: isReviewed ? "Reviewed" : actualMinutes > 0 ? "For Review" : "No Activity",
              dailyMinutes: dailyMinutesByEmail.get(email) ?? {},
              bonus: adjustmentByEmail.get(email)?.bonus ?? 0,
              misc: adjustmentByEmail.get(email)?.misc ?? 0,
              retroPay: adjustmentByEmail.get(email)?.retroPay ?? 0,
              reim: adjustmentByEmail.get(email)?.reim ?? 0,
              cashAdvance: adjustmentByEmail.get(email)?.cashAdvance ?? 0,
              hmo: adjustmentByEmail.get(email)?.hmo ?? 0,
              tax: adjustmentByEmail.get(email)?.tax ?? 0,
            };
          });

        setRows(nextRows);
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
  }, [rangeFrom, rangeTo]);

  const filteredRows = rows.filter((r) => {
    const query = nameSearch.trim().toLowerCase();
    const matchesName = !query || r.name.toLowerCase().includes(query) || r.email.includes(query);
    const matchesPayCategory = payCategoryFilter === "All" || r.payCategory === payCategoryFilter;
    const matchesCountry = countryFilter === "All" || r.country === countryFilter;
    const matchesShiftType = shiftTypeFilter === "All" || r.shiftType === shiftTypeFilter;
    const matchesDepartment = departmentFilter === "All" || r.department === departmentFilter;
    return matchesName && matchesPayCategory && matchesCountry && matchesShiftType && matchesDepartment;
  });

  const payCategoryOptions = Array.from(new Set(rows.map((r) => r.payCategory).filter((c) => c !== "-"))).sort();
  const countryOptions = Array.from(new Set(rows.map((r) => r.country).filter((c) => c !== "-"))).sort();
  const shiftTypeOptions = Array.from(new Set(rows.map((r) => r.shiftType).filter((c) => c !== "-"))).sort();
  const departmentOptions = Array.from(new Set(rows.map((r) => r.department).filter((c) => c !== "-"))).sort();

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

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">Payroll</h2>
          <p className="text-sm md:text-base text-slate-500 mt-1">
            Pay period: <span className="font-semibold text-slate-600">{week ? weekLabel(week) : "—"}</span> · based on reviewed Attendance data
          </p>
        </div>
        <button className="self-start sm:self-auto flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors shadow-sm">
          <LuDownload size={16} strokeWidth={2} />
          Export CSV
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 md:px-6 py-5 border-b border-slate-100 flex flex-col gap-5 bg-linear-to-b from-slate-50/80 to-white">
          {/* Week selector */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-xl md:text-2xl font-bold tracking-tight text-[#003527]">Weekly Payroll</h3>
              {isLoading && (
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-teal-600">
                  <LuRefreshCw size={12} className="animate-spin" /> Loading payroll data…
                </p>
              )}
              {!isLoading && loadError && (
                <p className="mt-1 text-xs font-medium text-red-600">{loadError}</p>
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
                <button onClick={() => setShowRangePicker((v) => !v)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${showRangePicker ? "text-teal-700 bg-teal-50" : "text-slate-600 hover:text-teal-700 hover:bg-teal-50"}`}>
                  <LuCalendar size={15} strokeWidth={2} /><span className="text-xs font-bold">Jump to Week</span>
                </button>
                {showRangePicker && <WeekJumpDropdown onApply={(d) => setWeek(sundayOf(d))} onClose={() => setShowRangePicker(false)} />}
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

            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-40" value={payCategoryFilter} onChange={setPayCategoryFilter} label="Filter by pay category">
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
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-40" value={departmentFilter} onChange={setDepartmentFilter} label="Filter by department">
              <option value="All">All Departments</option>
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
                {["Name", "Country", "Department", "Pay Category", "Shift Type", "Local Holiday", "Local HO Time",
                  "Total Evaluated Regular Time", "Total US HO Time", "Total Regular OT Time", "Total RD OT Time", "Total HO OT Time", "Total Time Off Request Time",
                  "Completion Time", "Rate/hr", "Rate", "Gross", "Deductions", "Net Pay", "Status", "Action"].map((h, i) => (
                  <th
                    key={h}
                    className={`text-left px-4 md:px-5 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap border-r border-white/20 last:border-r-0 overflow-hidden ${
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
                  <td className="sticky left-0 z-10 w-[180px] min-w-[180px] bg-white group-hover:bg-slate-50 px-4 md:px-5 py-3.5 font-semibold text-slate-800 whitespace-nowrap border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">{r.name}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap border-r border-slate-100">{r.country}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap border-r border-slate-100">{r.department}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap border-r border-slate-100">{r.payCategory}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap border-r border-slate-100">{r.shiftType}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap border-r border-slate-100">{r.localHoliday}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.localHolidayMinutes ? formatMinutesAsHours(r.localHolidayMinutes) : "—"}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.totalEvaluatedRegularMinutes ? formatMinutesAsHours(r.totalEvaluatedRegularMinutes) : "—"}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.totalUsHoMinutes ? formatMinutesAsHours(r.totalUsHoMinutes) : "—"}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.totalRegularOtMinutes ? formatMinutesAsHours(r.totalRegularOtMinutes) : "—"}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.totalRdOtMinutes ? formatMinutesAsHours(r.totalRdOtMinutes) : "—"}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.totalHoOtMinutes ? formatMinutesAsHours(r.totalHoOtMinutes) : "—"}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.totalTimeOffRequestMinutes > 0 ? formatMinutesAsHours(r.totalTimeOffRequestMinutes) : "—"}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.completionMinutes != null ? formatMinutesAsHours(r.completionMinutes) : "—"}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.currency} {r.hourlyRate.toFixed(2)}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.hourlyRate.toFixed(2)}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-700 font-medium tabular-nums whitespace-nowrap border-r border-slate-100">{r.gross != null ? fmtMoney(r.gross, r.currency) : "—"}</td>
                  <td className="px-4 md:px-5 py-3.5 text-red-500 tabular-nums whitespace-nowrap border-r border-slate-100">{r.deductions != null ? `−${fmtMoney(r.deductions, r.currency)}` : "—"}</td>
                  <td className="px-4 md:px-5 py-3.5 text-teal-700 font-semibold tabular-nums whitespace-nowrap border-r border-slate-100">{r.net != null ? fmtMoney(r.net, r.currency) : "—"}</td>
                  <td
                    className="text-center sticky right-[90px] z-10 bg-white group-hover:bg-slate-50 border-l border-slate-200 overflow-hidden px-4 md:px-5 py-3.5"
                    style={{ minWidth: 150, width: 150, maxWidth: 150 }}
                  >
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[r.status]}`}>
                      {STATUS_ICONS[r.status]}
                      {r.status}
                    </span>
                  </td>
                  <td
                    className="text-center sticky right-0 z-10 bg-white group-hover:bg-slate-50 border-l border-slate-200 overflow-hidden px-4 md:px-5 py-3.5"
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
          onClose={() => setVoucherTarget(null)}
        />
      )}

      {reviewTarget && (
        <PayrollAdjustmentModal
          row={reviewTarget}
          onSave={handleSaveAdjustment}
          onClose={() => setReviewTarget(null)}
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
  row, rangeFrom, rangeTo, onClose,
}: {
  row: PayrollRow;
  rangeFrom: string;
  rangeTo: string;
  onClose: () => void;
}) {
  const weekDates = rangeFrom && rangeTo ? datesBetween(rangeFrom, rangeTo) : [];
  const restDayLabels = new Set(
    row.restDay.split(",").map((d) => REST_DAY_TO_LABEL[d.trim()]).filter(Boolean)
  );

  const regHours = (row.totalEvaluatedRegularMinutes ?? 0) / 60;
  const ptoHours = row.ptoHours;
  const hoHours = ((row.totalUsHoMinutes ?? 0) + (row.localHolidayMinutes ?? 0)) / 60;
  const regOtHours = (row.totalRegularOtMinutes ?? 0) / 60;
  const rdOtHours = (row.totalRdOtMinutes ?? 0) / 60;
  const hoOtHours = (row.totalHoOtMinutes ?? 0) / 60;

  const regPay = regHours * row.hourlyRate;
  const regOtPay = regOtHours * row.hourlyRate;
  const rdOtPay = rdOtHours * row.hourlyRate;
  const holidayPay = hoHours * row.hourlyRate;
  const hoOtPay = hoOtHours * row.hourlyRate;
  const ptoPay = ptoHours * row.hourlyRate;
  // Bonus/MISC/Retro Pay/REIM (earnings) and Cash Advance/HMO/Tax (deductions)
  // all come from the manual Review adjustment (if any).
  const { bonus, misc, retroPay, reim, cashAdvance, hmo, tax } = row;
  const grossPay = regPay + regOtPay + rdOtPay + holidayPay + hoOtPay + ptoPay + bonus + misc + retroPay + reim;
  const totalDeductions = cashAdvance + hmo + tax;
  const netPay = grossPay - totalDeductions;

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

        <div className="p-6 md:p-8 text-sm text-slate-800">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-[#003527]">
            <div className="flex items-start gap-3">
              <Logo className="h-10 w-10 shrink-0" />
              <div>
                <p className="font-bold text-slate-800">Our World Energy</p>
                <p className="text-xs text-slate-500">2501 W Phelps Rd, Phoenix, AZ 85023</p>
                <p className="text-xs text-teal-600">offshorepayroll@ourworldenergy.com</p>
              </div>
            </div>
            <div className="text-right text-xs">
              <p><span className="text-slate-500">Pay Period:</span> <span className="font-semibold">{fmtVoucherDate(rangeFrom)} to {fmtVoucherDate(rangeTo)}</span></p>
              <p className="mt-1"><span className="text-slate-500">Check Date:</span> <span className="font-semibold">—</span></p>
            </div>
          </div>

          <h3 className="text-center font-bold text-slate-700 tracking-wide mt-3 mb-4">Payroll Voucher</h3>

          {/* Contractor info */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs mb-5">
            <p><span className="text-slate-500">Contractor</span> <span className="font-semibold ml-2">{row.name}</span></p>
            <p><span className="text-slate-500">Monthly Rate</span> <span className="font-semibold ml-2">{money(row.monthlyRate)}</span></p>
            <p><span className="text-slate-500">Role</span> <span className="font-semibold ml-2">{row.role}</span></p>
            <p><span className="text-slate-500">Weekly Rate</span> <span className="font-semibold ml-2">{money(row.weeklyRate)}</span></p>
          </div>

          {/* Gross Pay */}
          <div className="bg-[#003527] text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-t-md">Gross Pay</div>
          <div className="border border-t-0 border-slate-200 rounded-b-md px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <table className="w-full text-xs mb-4">
                <thead>
                  <tr>
                    {DAY_LABELS.map((d) => (
                      <th key={d} className="border border-slate-200 bg-slate-50 px-1 py-1 font-semibold text-slate-500">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {weekDates.map((date, i) => {
                      const label = DAY_LABELS[i];
                      const isOff = restDayLabels.has(label);
                      const hours = (row.dailyMinutes[date] ?? 0) / 60;
                      return (
                        <td key={date} className="border border-slate-200 px-1 py-1.5 text-center tabular-nums">
                          {isOff ? "OFF" : hours.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>

              <div className="space-y-2 text-xs">
                {[
                  ["REG Hours", regHours],
                  ["PTO HRS", ptoHours],
                  ["HO HRS", hoHours],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-1">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold tabular-nums">{(value as number).toFixed(2)}</span>
                  </div>
                ))}
                {[
                  ["REG OT HRS", regOtHours],
                  ["RD OT HRS", rdOtHours],
                  ["HO OT HRS", hoOtHours],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-1">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold tabular-nums">{(value as number).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 text-xs">
              {[
                ["REG HRS Pay", regPay],
                ["REG OT", regOtPay],
                ["RD OT", rdOtPay],
                ["HOLIDAY PAY", holidayPay],
                ["HO OT", hoOtPay],
                ["PTO", ptoPay],
                ["Bonus", bonus],
                ["MISC", misc],
                ["Retro Pay", retroPay],
                ["REIM", reim],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-1">
                  <span className="text-slate-500">{label}</span>
                  <span className={`tabular-nums ${(value as number) > 0 ? "font-semibold" : "text-slate-300"}`}>{money(value as number)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-2 border-[#003527] rounded-md px-2 py-1.5 mt-3">
                <span className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Gross Pay</span>
                <span className="font-bold tabular-nums">{money(grossPay)}</span>
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div className="bg-[#003527] text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-t-md mt-5">Deduction</div>
          <div className="border border-t-0 border-slate-200 rounded-b-md px-4 py-4 flex items-end justify-between gap-6">
            <div className="space-y-2 text-xs flex-1">
              {[
                ["Cash Advance", cashAdvance],
                ["HMO Premium", hmo],
                ["Tax", tax],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-1">
                  <span className="text-slate-500">{label}</span>
                  <span className={`tabular-nums ${(value as number) > 0 ? "font-semibold" : "text-slate-300"}`}>{money(value as number)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold uppercase text-[10px] tracking-wider text-slate-500 whitespace-nowrap">Total Deductions</span>
              <span className="font-bold tabular-nums border-2 border-slate-300 rounded-md px-3 py-1.5">{money(totalDeductions)}</span>
            </div>
          </div>

          {/* Net Pay */}
          <div className="mt-5 flex items-center justify-between bg-[#003527] text-white rounded-md px-4 py-3">
            <span className="font-bold uppercase text-xs tracking-wider">Net Pay</span>
            <span className="font-bold text-lg tabular-nums">{row.currency} {money(netPay)}</span>
          </div>

          <p className="text-[10px] text-slate-400 mt-3">
            Check Date is not yet tracked in the system and is shown blank pending manual entry.
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
