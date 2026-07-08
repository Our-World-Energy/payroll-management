"use client";

import { useState, useEffect } from "react";
import { LuDownload, LuCircleCheck, LuClock, LuCircleAlert, LuSearch, LuCalendar, LuX, LuRefreshCw } from "react-icons/lu";
import { fetchAllContractors } from "../contractors/actions";
import { addDaysIso, sundayOf, recentWeeks, weekLabel } from "@/lib/weekUtils";
import { WeekJumpDropdown } from "@/components/WeekJumpDropdown";
import { FilterSelect } from "@/components/FilterSelect";

// No real deductions/tax data exists anywhere yet — kept as the same flat
// placeholder ratio the old mock page used, not a real tax calculation.
const DEDUCTION_RATE = 0.15;

type PayrollRow = {
  email: string;
  name: string;
  country: string;
  department: string;
  payCategory: string;
  shiftType: string;
  currency: string;
  hourlyRate: number;
  actualMinutes: number;
  completionMinutes: number | null;
  hours: number | null;
  gross: number | null;
  deductions: number | null;
  net: number | null;
  status: "Reviewed" | "For Review" | "No Activity";
};

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
        const [contractors, entriesResult, weekStatusResult] = await Promise.all([
          fetchAllContractors({ country: "All Countries", status: "Active", rules: [] }),
          fetch(`/api/worksnap-entries?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`).then((r) => r.json()),
          fetch(`/api/attendance/week-status?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`).then((r) => (r.ok ? r.json() : { weekStatuses: [] })),
        ]);

        if (!isMounted) return;

        const minutesByEmail = new Map<string, number>();
        for (const e of (entriesResult.entries ?? [])) {
          const email = String(e.email ?? "").trim().toLowerCase();
          if (email) minutesByEmail.set(email, (minutesByEmail.get(email) ?? 0) + ((e as { durationMins?: number }).durationMins ?? 0));
        }

        const weekStatusByEmail = new Map<string, { requestStatus: string; completionMinutes: number | null }>(
          (weekStatusResult.weekStatuses ?? [])
            .filter((s: { email?: string }) => s.email)
            .map((s: { email: string; requestStatus: string; completionMinutes: number | null }) => [s.email.trim().toLowerCase(), s])
        );

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

            return {
              email,
              name: c.fullName || email,
              country: countryFromLocation(c.location || ""),
              department: c.department || "-",
              payCategory: c.payCategory || "-",
              shiftType: c.shiftType || "-",
              currency: c.currency || "USD",
              hourlyRate,
              actualMinutes,
              completionMinutes: isReviewed ? (saved!.completionMinutes as number) : null,
              hours,
              gross,
              deductions,
              net,
              status: isReviewed ? "Reviewed" : actualMinutes > 0 ? "For Review" : "No Activity",
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

  // Sum per currency — mixing currencies (USD/MXN/PHP, etc.) into one number would be wrong.
  const totalsByCurrency = new Map<string, { gross: number; deductions: number; net: number }>();
  filteredRows.forEach((r) => {
    if (r.gross == null || r.deductions == null || r.net == null) return;
    const t = totalsByCurrency.get(r.currency) ?? { gross: 0, deductions: 0, net: 0 };
    t.gross += r.gross;
    t.deductions += r.deductions;
    t.net += r.net;
    totalsByCurrency.set(r.currency, t);
  });
  const currencyTotals = Array.from(totalsByCurrency.entries());

  function summaryCard(pick: (t: { gross: number; deductions: number; net: number }) => number) {
    if (currencyTotals.length === 0) return <span className="text-3xl font-black mt-1">—</span>;
    return (
      <div className="mt-1 space-y-0.5">
        {currencyTotals.map(([currency, t]) => (
          <p key={currency} className="text-xl md:text-2xl font-black leading-tight">{fmtMoney(pick(t), currency)}</p>
        ))}
      </div>
    );
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

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 md:mb-8">
        <div className="bg-[#003527] text-white rounded-xl p-5 shadow-md">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-75">Total Gross</p>
          {summaryCard((t) => t.gross)}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Deductions</p>
          {summaryCard((t) => t.deductions)}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Net Pay</p>
          {summaryCard((t) => t.net)}
        </div>
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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" style={{ minWidth: "1180px", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {["Name", "Country", "Department", "Pay Category", "Shift Type", "Completion Time", "Rate/hr", "Rate", "Gross", "Deductions", "Net Pay", "Status"].map((h, i) => (
                  <th
                    key={h}
                    className={`text-left px-4 md:px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap border-r border-slate-100 last:border-r-0 ${
                      i === 0 ? "sticky left-0 z-20 bg-slate-50 w-[180px] min-w-[180px] shadow-[1px_0_0_0_#e2e8f0]" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-5 py-10 text-center text-sm text-slate-400">
                    {isLoading ? "Loading…" : rows.length === 0 ? "No active contractors found." : "No payroll rows match your search."}
                  </td>
                </tr>
              ) : filteredRows.map((r) => (
                <tr key={r.email} className="hover:bg-slate-50 transition-colors">
                  <td className="sticky left-0 z-10 w-[180px] min-w-[180px] bg-white px-4 md:px-5 py-3.5 font-semibold text-slate-800 whitespace-nowrap border-r border-slate-100 shadow-[1px_0_0_0_#e2e8f0]">{r.name}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap border-r border-slate-100">{r.country}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap border-r border-slate-100">{r.department}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap border-r border-slate-100">{r.payCategory}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap border-r border-slate-100">{r.shiftType}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.completionMinutes != null ? formatMinutesAsHours(r.completionMinutes) : "—"}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.currency} {r.hourlyRate.toFixed(2)}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums whitespace-nowrap border-r border-slate-100">{r.hourlyRate.toFixed(2)}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-700 font-medium tabular-nums whitespace-nowrap border-r border-slate-100">{r.gross != null ? fmtMoney(r.gross, r.currency) : "—"}</td>
                  <td className="px-4 md:px-5 py-3.5 text-red-500 tabular-nums whitespace-nowrap border-r border-slate-100">{r.deductions != null ? `−${fmtMoney(r.deductions, r.currency)}` : "—"}</td>
                  <td className="px-4 md:px-5 py-3.5 text-teal-700 font-semibold tabular-nums whitespace-nowrap border-r border-slate-100">{r.net != null ? fmtMoney(r.net, r.currency) : "—"}</td>
                  <td className="px-4 md:px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[r.status]}`}>
                      {STATUS_ICONS[r.status]}
                      {r.status}
                    </span>
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
    </div>
  );
}
