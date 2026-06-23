"use client";

import { useEffect, useMemo, useState } from "react";
import { LuChevronLeft, LuChevronRight, LuCircleCheck, LuCircleX, LuClock, LuEye, LuTrendingUp, LuX } from "react-icons/lu";
import { TIME_OFF, type TimeOffRequest } from "@/lib/data";
import {
  approvedHoursFor,
  calculatePtoBalance,
  calculateSickLeaveBalance,
  calculateUnusedSickLeaveBalance,
  effectiveRequestStatus,
  fmtBalance,
  HOURS_PER_DAY,
  ptoAvailableTextClass,
  roundBalance,
  type RequestDecision,
  type RequestDecisionMap,
} from "@/lib/timeOffBalances";
import { fetchAllContractors } from "../contractors/actions";
import type { Contractor } from "../contractors/types";

type TimeOffRow = {
  id: string;
  fullName: string;
  email: string;
  country: string;
  department: string;
  role: string;
  hireDate: string;
  requestStatus: "PTO Leave" | "Sick Leave" | "-";
  reviewStatus: RequestDecision | "-";
  latestRequest: TimeOffRequest | null;
  ptoBalance: number;
  ptoUsed: number;
  ptoAvailable: number;
  sickLeaveBalance: number;
  sickLeaveUsed: number;
  sickLeaveAvailable: number;
  unusedSickLeave: number;
  advanceBirthdayLeave: number;
  advanceSickLeave: number;
};

const REVIEW_STATUS_STYLES: Record<RequestDecision, string> = {
  Approved: "bg-emerald-50 text-emerald-700",
  Pending: "bg-amber-50 text-amber-700",
  Rejected: "bg-red-50 text-red-600",
};

function fmtDate(date: string) {
  if (!date) return "-";
  const [year, month, day] = date.split("-");
  return year && month && day ? `${month}-${day}-${year}` : date;
}

function latestRequestFor(name: string) {
  return TIME_OFF
    .filter((item) => item.name === name && (item.type === "Annual Leave" || item.type === "Sick Leave"))
    .sort((a, b) => b.from.localeCompare(a.from))[0] ?? null;
}

function countryFromLocation(location: string) {
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.at(-1) ?? "Unknown";
}

function avatarInitials(name: string) {
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-teal-100 text-teal-700",
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
];

function avatarColor(uid: string) {
  let n = 0;
  for (let i = 0; i < uid.length; i++) n += uid.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function BalanceBar({ used, total, color }: { used: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const REVIEW_BADGE: Record<RequestDecision, string> = {
  Approved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Pending:  "bg-amber-50 text-amber-700 border border-amber-200",
  Rejected: "bg-red-50 text-red-600 border border-red-200",
};

const REVIEW_ICON: Record<RequestDecision, React.ReactNode> = {
  Approved: <LuCircleCheck size={11} />,
  Pending:  <LuClock size={11} />,
  Rejected: <LuCircleX size={11} />,
};

export default function TimeOffPage() {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState("");
  const [countryFilter, setCountryFilter]       = useState("All Countries");
  const [departmentFilter, setDepartmentFilter] = useState("All Departments");
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [requestPageRowId, setRequestPageRowId] = useState<string | null>(null);
  const [requestDecisions, setRequestDecisions] = useState<RequestDecisionMap>({});
  const [editStatus,  setEditStatus]  = useState("PTO Leave");
  const [editHours,   setEditHours]   = useState("");
  const [editReason,  setEditReason]  = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setLoadError("");
      try {
        const all = await fetchAllContractors({ country: "All Countries", status: "All Statuses", rules: [] });
        if (active) setContractors(all);
      } catch (err) {
        if (active) { setLoadError(err instanceof Error ? err.message : "Unable to load contractors."); setContractors([]); }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const rows = useMemo<TimeOffRow[]>(() => contractors.map((c) => {
    const fullName = c.fullName || [c.firstName, c.surname].filter(Boolean).join(" ");
    const latestRequest = latestRequestFor(fullName);
    const ptoBalance = calculatePtoBalance(c.hireDate);
    const sickLeaveBalance = calculateSickLeaveBalance(c.hireDate);
    const ptoUsed = approvedHoursFor(fullName, "Annual Leave", requestDecisions);
    const sickLeaveUsed = approvedHoursFor(fullName, "Sick Leave", requestDecisions);
    const unusedSickLeave = calculateUnusedSickLeaveBalance(fullName, c.hireDate, requestDecisions);

    return {
      id: c.uid, fullName, email: c.email,
      country: countryFromLocation(c.location),
      department: c.department, role: c.role, hireDate: c.hireDate,
      requestStatus: "PTO Leave",
      reviewStatus: latestRequest ? effectiveRequestStatus(latestRequest, requestDecisions) : "-",
      latestRequest, ptoBalance, ptoUsed,
      ptoAvailable: roundBalance(Math.max(ptoBalance - ptoUsed, 0)),
      sickLeaveBalance, sickLeaveUsed,
      sickLeaveAvailable: roundBalance(Math.max(sickLeaveBalance - sickLeaveUsed, 0)),
      unusedSickLeave,
      advanceBirthdayLeave: 0,
      advanceSickLeave: 0,
    };
  }), [contractors, requestDecisions]);

  const countryOptions    = Array.from(new Set(rows.map((r) => r.country))).sort();
  const departmentOptions = Array.from(new Set(rows.map((r) => r.department || "Unassigned"))).sort();
  const filtersActive = countryFilter !== "All Countries" || departmentFilter !== "All Departments";

  const filteredRows = rows.filter((r) => {
    const cm = countryFilter    === "All Countries"   || r.country === countryFilter;
    const dm = departmentFilter === "All Departments" || (r.department || "Unassigned") === departmentFilter;
    return cm && dm;
  });

  const visibleNames   = new Set(filteredRows.map((r) => r.fullName));
  const pendingRequests = TIME_OFF.filter((r) =>
    effectiveRequestStatus(r, requestDecisions) === "Pending" && visibleNames.has(r.name)
  ).length;
  const approvedRequests = TIME_OFF.filter((r) =>
    effectiveRequestStatus(r, requestDecisions) === "Approved" && visibleNames.has(r.name)
  ).length;
  const rejectedRequests = TIME_OFF.filter((r) =>
    effectiveRequestStatus(r, requestDecisions) === "Rejected" && visibleNames.has(r.name)
  ).length;
  const selectedRow = rows.find((row) => row.id === selectedRowId) ?? null;
  const requestPageRow = rows.find((row) => row.id === requestPageRowId) ?? null;

  function clearFilters() {
    setCountryFilter("All Countries");
    setDepartmentFilter("All Departments");
  }

  function closeSelectedRow() {
    setSelectedRowId(null);
  }

  function openRequestPage(row: TimeOffRow) {
    setSelectedRowId(null);
    setRequestPageRowId(row.id);
  }

  function setSelectedRequestDecision(decision: "Approved" | "Rejected") {
    const row = requestPageRow ?? selectedRow;
    if (!row?.latestRequest) return;
    const requestId = row.latestRequest.id;

    setRequestDecisions((current) => ({
      ...current,
      [requestId]: decision,
    }));
  }

  const columns = [
    "Full Name",
    "Email Address",
    "Country",
    "Department",
    "Role",
    "Hire Date",
    "Status Request",
    "Review Status",
    "PTO Balance",
    "PTO Used",
    "PTO Available",
    "Sick Leave Balance",
    "Sick Leave Used",
    "Sick Leave Available",
    "Unused Sick Leave",
    "Advance Birthday Leave",
    "Advance Sick Leave",
    "Action",
  ];

  if (requestPageRow) {
    return (
      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
        <div className="mb-6 md:mb-8">
          <div>
            <button
              type="button"
              onClick={() => setRequestPageRowId(null)}
              className="inline-flex items-center gap-2 px-3 py-2 mb-4 text-sm font-semibold text-slate-600 hover:text-[#003527] hover:bg-slate-100 rounded-lg transition-colors"
            >
              <LuChevronLeft size={17} strokeWidth={2} />
              Back
            </button>
            <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">Time-Off Request</h2>
            <p className="text-sm md:text-base text-slate-500 mt-1">{requestPageRow.fullName}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
            <table
              className="w-full text-sm"
              style={{ minWidth: "980px", borderCollapse: "separate", borderSpacing: 0 }}
            >
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Name", "Start Date", "End Date", "Reason", "Status", "Action"].map((heading) => (
                    <th
                      key={heading}
                      className="text-left px-4 md:px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap border-r border-slate-100 last:border-r-0"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 md:px-5 py-3.5 font-semibold text-[#003527] whitespace-nowrap border-r border-slate-100">
                    {requestPageRow.fullName}
                  </td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap border-r border-slate-100">
                    {requestPageRow.latestRequest ? fmtDate(requestPageRow.latestRequest.from) : "-"}
                  </td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap border-r border-slate-100">
                    {requestPageRow.latestRequest ? fmtDate(requestPageRow.latestRequest.to) : "-"}
                  </td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 border-r border-slate-100">
                    {requestPageRow.latestRequest?.reason || "-"}
                  </td>
                  <td className="px-4 md:px-5 py-3.5 whitespace-nowrap border-r border-slate-100">
                    {requestPageRow.reviewStatus === "-" ? (
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                        No request
                      </span>
                    ) : (
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${REVIEW_STATUS_STYLES[requestPageRow.reviewStatus]}`}>
                        {requestPageRow.reviewStatus}
                      </span>
                    )}
                  </td>
                  <td className="px-4 md:px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRequestDecision("Rejected")}
                        disabled={!requestPageRow.latestRequest}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:hover:bg-red-600"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRequestDecision("Approved")}
                        disabled={!requestPageRow.latestRequest}
                        className="px-4 py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-xs font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:hover:bg-[#003527]"
                      >
                        Approve
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-full">

      {/* ── Detail Modal ──────────────────────────────────────────── */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeSelectedRow} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[84vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-[#003527]">Contractor Time-Off Details</h3>
                <p className="text-sm text-slate-500 mt-0.5">{selectedRow.fullName}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 sm:max-w-md">
                  <div className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2">
                    <p className="text-[10px] font-semibold text-teal-700 uppercase tracking-wider">Available PTO</p>
                    <p className={`text-xl font-bold leading-tight mt-0.5 ${ptoAvailableTextClass(selectedRow.ptoAvailable)}`}>{fmtBalance(selectedRow.ptoAvailable)}h</p>
                  </div>
                  <div className="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2">
                    <p className="text-[10px] font-semibold text-orange-700 uppercase tracking-wider">Available Sick Leave</p>
                    <p className="text-xl font-bold text-orange-700 leading-tight mt-0.5">{fmtBalance(selectedRow.sickLeaveAvailable)}h</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={closeSelectedRow}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Close details"
              >
                <LuX size={18} strokeWidth={2} />
              </button>
            </div>

            {/* Balance summary bar */}
            <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
              <div className="px-5 py-3">
                <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider">PTO Available</p>
                <p className="text-2xl font-black text-[#003527] leading-tight">{fmtBalance(selectedRow.ptoAvailable)}<span className="text-sm font-semibold ml-1 text-slate-400">hrs</span></p>
                <BalanceBar used={selectedRow.ptoUsed} total={selectedRow.ptoBalance} color="bg-teal-500" />
                <p className="text-[10px] text-slate-400 mt-1">{fmtBalance(selectedRow.ptoUsed)}h used of {fmtBalance(selectedRow.ptoBalance)}h</p>
              </div>
              <div className="px-5 py-3">
                <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider">Sick Leave Available</p>
                <p className="text-2xl font-black text-orange-600 leading-tight">{fmtBalance(selectedRow.sickLeaveAvailable)}<span className="text-sm font-semibold ml-1 text-slate-400">hrs</span></p>
                <BalanceBar used={selectedRow.sickLeaveUsed} total={selectedRow.sickLeaveBalance} color="bg-orange-400" />
                <p className="text-[10px] text-slate-400 mt-1">{fmtBalance(selectedRow.sickLeaveUsed)}h used of {fmtBalance(selectedRow.sickLeaveBalance)}h</p>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">PTO</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      ["PTO Balance", `${fmtBalance(selectedRow.ptoBalance)}h`],
                      ["PTO Used", `${fmtBalance(selectedRow.ptoUsed)}h`],
                      ["PTO Available", `${fmtBalance(selectedRow.ptoAvailable)}h`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-teal-100 p-3 bg-teal-50">
                        <p className="text-[11px] font-semibold text-teal-700 uppercase tracking-wider">{label}</p>
                        <p className={`text-lg font-bold mt-1 tabular-nums ${label === "PTO Available" ? ptoAvailableTextClass(selectedRow.ptoAvailable) : "text-[#003527]"}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Reason — full width textarea */}
                <div className="mt-2 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Reason</p>
                  <textarea
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="Enter reason for time-off request..."
                    rows={3}
                    className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  />
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Current Review Status</p>
                  <button
                    type="button"
                    onClick={() => openRequestPage(selectedRow)}
                    title="View time-off request"
                    aria-label={`View time-off request for ${selectedRow.fullName}`}
                    className="inline-flex items-center justify-center size-8 text-slate-400 hover:text-[#003527] hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <LuEye size={17} strokeWidth={1.8} />
                  </button>
                </div>
                <div>
                  {selectedRow.reviewStatus === "-" ? (
                    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                      No request
                    </span>
                  ) : (
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${REVIEW_STATUS_STYLES[selectedRow.reviewStatus]}`}>
                      {selectedRow.reviewStatus}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0 px-6 py-3 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={closeSelectedRow}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ───────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4">
        <div>
          <nav className="flex mb-2">
            <ol className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <li>Management</li>
              <li><LuChevronRight size={14} className="text-slate-400" /></li>
              <li className="text-teal-600">Time-Off Management</li>
            </ol>
          </nav>
          <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">Time-Off Management</h2>
          <p className="text-sm text-slate-500 mt-1">Track PTO and sick leave balances across your contractor workforce.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 items-end justify-between">
        <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap gap-3 items-end shadow-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Country</span>
            <select
              value={countryFilter}
              onChange={(event) => setCountryFilter(event.target.value)}
              disabled={loading}
              className="min-w-44 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option>All Countries</option>
              {countryOptions.map((country) => (
                <option key={country}>{country}</option>
              ))}
            </select>
          </label>

        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          disabled={loading}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option>All Departments</option>
          {departmentOptions.map((d) => <option key={d}>{d}</option>)}
        </select>

          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              title="Clear filters"
              className="inline-flex items-center justify-center size-10 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LuX size={18} strokeWidth={2} />
            </button>
          )}
        </div>

        <div className="min-w-44 rounded-xl border border-amber-100 bg-amber-50 px-4 py-2.5 shadow-sm">
          <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Pending Requests</p>
          <p className="text-2xl font-bold text-amber-600 leading-tight mt-0.5">{pendingRequests}</p>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
          <table
            className="w-full text-sm"
            style={{ minWidth: "2400px", borderCollapse: "separate", borderSpacing: 0 }}
          >
            <thead>
              <tr className="border-b border-white/20 bg-[#003527]">
                {columns.map((heading, index) => (
                  <th
                    key={heading}
                    className={`text-left px-4 md:px-5 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap ${
                      index === 0 ? "sticky left-0 z-20 bg-[#003527] border-r border-white/20" : "border-r border-white/20"
                    }`}
                    style={index === 0 ? { minWidth: 190 } : undefined}
                  >
                    {heading}
                  </th>
                ))}
                <th className="px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap sticky right-0 z-20 border-l border-white/20"
                  style={{ background: "#003527" }}>
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3 sticky left-0 bg-white border-r border-slate-200" style={{ minWidth: 210 }}>
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full bg-slate-100 shrink-0" />
                        <div className="space-y-1.5">
                          <div className="h-3 bg-slate-100 rounded w-28" />
                          <div className="h-2 bg-slate-100 rounded w-20" />
                        </div>
                      </div>
                    </td>
                    {columns.slice(1, -1).map((h: string) => (
                      <td key={h} className="px-4 py-3 border-r border-slate-100">
                        <div className="h-3 bg-slate-100 rounded w-16" />
                      </td>
                    ))}
                    <td className="px-4 py-3 sticky right-0 bg-white border-l border-slate-200">
                      <div className="h-3 bg-slate-100 rounded w-12" />
                    </td>
                  </tr>
                ))
              ) : loadError ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-16 text-center text-sm text-red-500">{loadError}</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 text-center text-slate-400 text-sm" style={{ height: 200 }}>
                    No contractors match the selected filters.
                  </td>
                </tr>
              ) : filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors group">
                  {/* Employee cell */}
                  <td className="px-4 py-3 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200" style={{ minWidth: 210 }}>
                    <div className="flex items-center gap-3">
                      <div className={`size-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor(row.id)}`}>
                        {avatarInitials(row.fullName)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#003527] truncate">{row.fullName}</p>
                        <p className="text-xs text-slate-400 truncate">{row.role || "—"}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap border-r border-slate-100">{row.country}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap border-r border-slate-100">{row.department || "Unassigned"}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap font-mono text-xs border-r border-slate-100">{fmtDate(row.hireDate)}</td>

                  {/* PTO */}
                  <td className="px-4 py-3 text-sm tabular-nums text-slate-500 border-r border-slate-100">{fmtBalance(row.ptoBalance)}h</td>
                  <td className="px-4 py-3 text-sm tabular-nums text-slate-500 border-r border-slate-100">{fmtBalance(row.ptoUsed)}h</td>
                  <td className="px-4 py-3 border-r border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-teal-700">{fmtBalance(row.ptoAvailable)}h</span>
                      <div className="w-12">
                        <BalanceBar used={row.ptoUsed} total={row.ptoBalance} color="bg-teal-400" />
                      </div>
                    </div>
                  </td>

                  {/* Sick */}
                  <td className="px-4 py-3 text-sm tabular-nums text-slate-500 border-r border-slate-100">{fmtBalance(row.sickLeaveBalance)}h</td>
                  <td className="px-4 py-3 text-sm tabular-nums text-slate-500 border-r border-slate-100">{fmtBalance(row.sickLeaveUsed)}h</td>
                  <td className="px-4 py-3 border-r border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-orange-600">{fmtBalance(row.sickLeaveAvailable)}h</span>
                      <div className="w-12">
                        <BalanceBar used={row.sickLeaveUsed} total={row.sickLeaveBalance} color="bg-orange-400" />
                      </div>
                    </div>
                  </td>

                  {/* Review status */}
                  <td className="px-4 py-3 whitespace-nowrap border-r border-slate-100">
                    {row.reviewStatus === "-" ? (
                      <span className="text-slate-300 text-sm">—</span>
                    ) : (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${REVIEW_BADGE[row.reviewStatus]}`}>
                        {REVIEW_ICON[row.reviewStatus]}
                        {row.reviewStatus}
                      </span>
                    )}
                  </td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums border-r border-slate-100">{fmtBalance(row.ptoBalance)}h</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums border-r border-slate-100">{fmtBalance(row.ptoUsed)}h</td>
                  <td className={`px-4 md:px-5 py-3.5 font-semibold tabular-nums border-r border-slate-100 ${row.ptoAvailable <= 0 ? "text-red-600" : "text-teal-700"}`}>{fmtBalance(row.ptoAvailable)}h</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums border-r border-slate-100">{fmtBalance(row.sickLeaveBalance)}h</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums border-r border-slate-100">{fmtBalance(row.sickLeaveUsed)}h</td>
                  <td className="px-4 md:px-5 py-3.5 text-teal-700 font-semibold tabular-nums border-r border-slate-100">{fmtBalance(row.sickLeaveAvailable)}h</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums border-r border-slate-100">{fmtBalance(row.unusedSickLeave)}h</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums border-r border-slate-100">{fmtBalance(row.advanceBirthdayLeave)}h</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums border-r border-slate-100">{fmtBalance(row.advanceSickLeave)}h</td>
                  <td className="px-4 md:px-5 py-3.5 text-right">
                    <button
                      onClick={() => {
                        setSelectedRowId(row.id);
                        setEditStatus(row.requestStatus === "-" ? "PTO Leave" : row.requestStatus);
                        setEditHours(row.latestRequest ? String(row.latestRequest.days * HOURS_PER_DAY) : "");
                        setEditReason(row.latestRequest?.reason ?? "");
                      }}
                      title="View details"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-[#003527] hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <LuEye size={14} strokeWidth={1.75} />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-400 font-medium">
            {filteredRows.length} of {rows.length} contractors
          </p>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <LuTrendingUp size={13} className="text-teal-500" />
            Balances calculated from hire date
          </div>
        </div>
      </div>
    </div>
  );
}
