"use client";

import { useEffect, useMemo, useState } from "react";
import { LuEye, LuX } from "react-icons/lu";
import { TIME_OFF, type TimeOffRequest } from "@/lib/data";
import { fetchAllContractors } from "../contractors/actions";
import type { Contractor } from "../contractors/types";

const PTO_MONTHLY_ACCRUAL = 6.67;
const PTO_HALF_MONTH_ACCRUAL = 3.33;
const SICK_LEAVE_MONTHLY_ACCRUAL = 3.33;
const SICK_LEAVE_HALF_MONTH_ACCRUAL = 1.665;
const HOURS_PER_DAY = 8;
const TODAY = new Date();

type RequestDecision = "Approved" | "Pending" | "Rejected";
type RequestDecisionMap = Record<string, RequestDecision>;

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

function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date.getFullYear(), date.getMonth() + months, date.getDate());

  if (result.getDate() !== date.getDate()) {
    result.setDate(0);
  }

  return result;
}

function calendarMonthDiff(start: Date, end: Date) {
  return Math.max(
    (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth(),
    0
  );
}

function accrualPeriodStartFor(date: Date) {
  const marchFirst = new Date(date.getFullYear(), 2, 1);
  return date >= marchFirst ? new Date(date.getFullYear(), 0, 1) : new Date(date.getFullYear() - 1, 2, 1);
}

function roundBalance(value: number) {
  return Math.round(value * 100) / 100;
}

function fmtBalance(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function calculatePolicyBalance(hireDate: string, monthlyAccrual: number, halfMonthAccrual: number) {
  const startDate = parseDate(hireDate);

  if (!startDate) return 0;

  const accrualStartDate = addMonths(startDate, 6);
  const oneYearDate = addMonths(startDate, 12);

  if (TODAY < accrualStartDate) return 0;

  if (TODAY < oneYearDate) {
    const firstYearAccrual = accrualStartDate.getDate() <= 15 ? monthlyAccrual : halfMonthAccrual;
    const firstYearAdditionalMonths = calendarMonthDiff(accrualStartDate, TODAY);

    return roundBalance(firstYearAccrual + firstYearAdditionalMonths * monthlyAccrual);
  }

  const currentPeriodStart = accrualPeriodStartFor(TODAY);
  const effectiveStartDate = accrualStartDate > currentPeriodStart ? accrualStartDate : currentPeriodStart;
  const firstAccrual = effectiveStartDate.getDate() <= 15 ? monthlyAccrual : halfMonthAccrual;
  const additionalAccrualMonths = calendarMonthDiff(effectiveStartDate, TODAY);

  return roundBalance(firstAccrual + additionalAccrualMonths * monthlyAccrual);
}

function calculatePtoBalance(hireDate: string) {
  return calculatePolicyBalance(hireDate, PTO_MONTHLY_ACCRUAL, PTO_HALF_MONTH_ACCRUAL);
}

function calculateSickLeaveBalance(hireDate: string) {
  return calculatePolicyBalance(hireDate, SICK_LEAVE_MONTHLY_ACCRUAL, SICK_LEAVE_HALF_MONTH_ACCRUAL);
}

function effectiveRequestStatus(request: TimeOffRequest, decisions: RequestDecisionMap) {
  return decisions[request.id] ?? request.status;
}

function approvedHoursFor(name: string, type: "Annual Leave" | "Sick Leave", decisions: RequestDecisionMap) {
  return TIME_OFF
    .filter((request) =>
      request.name === name &&
      request.type === type &&
      effectiveRequestStatus(request, decisions) === "Approved"
    )
    .reduce((total, request) => total + request.days * HOURS_PER_DAY, 0);
}

function latestRequestFor(name: string) {
  return TIME_OFF
    .filter((item) => item.name === name && (item.type === "Annual Leave" || item.type === "Sick Leave"))
    .sort((a, b) => b.from.localeCompare(a.from))[0] ?? null;
}

function requestStatusFor(): TimeOffRow["requestStatus"] {
  return "PTO Leave";
}

function countryFromLocation(location: string) {
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) ?? "Unknown";
}

export default function TimeOffPage() {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [countryFilter, setCountryFilter] = useState("All Countries");
  const [departmentFilter, setDepartmentFilter] = useState("All Departments");
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [requestDecisions, setRequestDecisions] = useState<RequestDecisionMap>({});

  useEffect(() => {
    let active = true;

    async function loadContractors() {
      setLoading(true);
      setLoadError("");

      try {
        const allContractors = await fetchAllContractors({
          country: "All Countries",
          status: "All Statuses",
          rules: [],
        });

        if (active) setContractors(allContractors);
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Unable to load contractors.");
          setContractors([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadContractors();

    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo<TimeOffRow[]>(() => contractors.map((contractor) => {
    const fullName = contractor.fullName || [contractor.firstName, contractor.surname].filter(Boolean).join(" ");
    const latestRequest = latestRequestFor(fullName);
    const ptoBalance = calculatePtoBalance(contractor.hireDate);
    const sickLeaveBalance = calculateSickLeaveBalance(contractor.hireDate);
    const ptoUsed = approvedHoursFor(fullName, "Annual Leave", requestDecisions);
    const sickLeaveUsed = approvedHoursFor(fullName, "Sick Leave", requestDecisions);

    return {
      id: contractor.uid,
      fullName,
      email: contractor.email,
      country: countryFromLocation(contractor.location),
      department: contractor.department,
      role: contractor.role,
      hireDate: contractor.hireDate,
      requestStatus: requestStatusFor(),
      reviewStatus: latestRequest ? effectiveRequestStatus(latestRequest, requestDecisions) : "-",
      latestRequest,
      ptoBalance,
      ptoUsed,
      ptoAvailable: roundBalance(Math.max(ptoBalance - ptoUsed, 0)),
      sickLeaveBalance,
      sickLeaveUsed,
      sickLeaveAvailable: roundBalance(Math.max(sickLeaveBalance - sickLeaveUsed, 0)),
    };
  }), [contractors, requestDecisions]);

  const countryOptions = Array.from(new Set(rows.map((row) => row.country))).sort();
  const departmentOptions = Array.from(new Set(rows.map((row) => row.department || "Unassigned"))).sort();
  const filtersActive = countryFilter !== "All Countries" || departmentFilter !== "All Departments";

  const filteredRows = rows.filter((row) => {
    const countryMatch = countryFilter === "All Countries" || row.country === countryFilter;
    const departmentMatch = departmentFilter === "All Departments" || (row.department || "Unassigned") === departmentFilter;
    return countryMatch && departmentMatch;
  });

  const visibleNames = new Set(filteredRows.map((row) => row.fullName));
  const pendingRequests = TIME_OFF.filter((request) =>
    effectiveRequestStatus(request, requestDecisions) === "Pending" && visibleNames.has(request.name)
  ).length;
  const selectedRow = rows.find((row) => row.id === selectedRowId) ?? null;

  function clearFilters() {
    setCountryFilter("All Countries");
    setDepartmentFilter("All Departments");
  }

  function setSelectedRequestDecision(decision: "Approved" | "Rejected") {
    if (!selectedRow?.latestRequest) return;
    const requestId = selectedRow.latestRequest.id;

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
    "Action",
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedRowId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[84vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-[#003527]">Contractor Time-Off Details</h3>
                <p className="text-sm text-slate-500 mt-0.5">{selectedRow.fullName}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 sm:max-w-md">
                  <div className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2">
                    <p className="text-[10px] font-semibold text-teal-700 uppercase tracking-wider">Available PTO</p>
                    <p className="text-xl font-bold text-[#003527] leading-tight mt-0.5">{fmtBalance(selectedRow.ptoAvailable)}h</p>
                  </div>
                  <div className="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2">
                    <p className="text-[10px] font-semibold text-orange-700 uppercase tracking-wider">Available Sick Leave</p>
                    <p className="text-xl font-bold text-orange-700 leading-tight mt-0.5">{fmtBalance(selectedRow.sickLeaveAvailable)}h</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRowId(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Close details"
              >
                <LuX size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  ["Full Name", selectedRow.fullName],
                  ["Email Address", selectedRow.email || "-"],
                  ["Country", selectedRow.country],
                  ["Department", selectedRow.department || "Unassigned"],
                  ["Role", selectedRow.role || "-"],
                  ["Hire Date", fmtDate(selectedRow.hireDate)],
                  ["Status Request", selectedRow.requestStatus],
                  ["Request Hours", selectedRow.latestRequest ? `${fmtBalance(selectedRow.latestRequest.days * HOURS_PER_DAY)}h` : "-"],
                  ["Review Status", selectedRow.reviewStatus],
                  ["Request ID", selectedRow.latestRequest?.id ?? "-"],
                  ["Request From", selectedRow.latestRequest ? fmtDate(selectedRow.latestRequest.from) : "-"],
                  ["Request To", selectedRow.latestRequest ? fmtDate(selectedRow.latestRequest.to) : "-"],
                  ["Request Reason", selectedRow.latestRequest?.reason ?? "-"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-medium text-slate-800 mt-1 break-words">{value}</p>
                  </div>
                ))}
              </div>

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
                        <p className="text-lg font-bold text-[#003527] mt-1 tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Sick Leave</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      ["Sick Leave Balance", `${fmtBalance(selectedRow.sickLeaveBalance)}h`],
                      ["Sick Leave Used", `${fmtBalance(selectedRow.sickLeaveUsed)}h`],
                      ["Sick Leave Available", `${fmtBalance(selectedRow.sickLeaveAvailable)}h`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-orange-100 p-3 bg-orange-50">
                        <p className="text-[11px] font-semibold text-orange-700 uppercase tracking-wider">{label}</p>
                        <p className="text-lg font-bold text-orange-700 mt-1 tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Current Review Status</p>
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

            <div className="shrink-0 px-6 py-3 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedRowId(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => setSelectedRequestDecision("Rejected")}
                disabled={!selectedRow.latestRequest}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:hover:bg-red-600"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => setSelectedRequestDecision("Approved")}
                disabled={!selectedRow.latestRequest}
                className="px-5 py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:hover:bg-[#003527]"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 md:mb-8">
        <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">Time-Off Management</h2>
        <p className="text-sm md:text-base text-slate-500 mt-1">Track PTO and sick leave balances by contractor.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Requests</p>
          <p className="text-2xl md:text-3xl font-bold text-amber-500 mt-1">{pendingRequests}</p>
        </div>
      </div>

      <div className="mb-4">
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

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Department</span>
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              disabled={loading}
              className="min-w-52 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option>All Departments</option>
              {departmentOptions.map((department) => (
                <option key={department}>{department}</option>
              ))}
            </select>
          </label>

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
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
          <table
            className="w-full text-sm"
            style={{ minWidth: "1900px", borderCollapse: "separate", borderSpacing: 0 }}
          >
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {columns.map((heading, index) => (
                  <th
                    key={heading}
                    className={`text-left px-4 md:px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap ${
                      index === 0 ? "sticky left-0 z-20 bg-slate-50 border-r border-slate-200" : "border-r border-slate-100"
                    }`}
                    style={index === 0 ? { minWidth: 190 } : undefined}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-16 text-center text-sm text-slate-400">
                    Loading contractor time-off balances...
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-16 text-center text-sm text-red-500">
                    {loadError}
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-16 text-center text-sm text-slate-400">
                    No contractors match the selected filters.
                  </td>
                </tr>
              ) : filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors group">
                  <td
                    className="px-4 md:px-5 py-3.5 font-semibold text-[#003527] whitespace-nowrap sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200"
                    style={{ minWidth: 190 }}
                  >
                    {row.fullName}
                  </td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap border-r border-slate-100">
                    {row.email
                      ? <a href={`mailto:${row.email}`} className="hover:text-teal-700 hover:underline">{row.email}</a>
                      : <span className="text-slate-300">-</span>}
                  </td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap border-r border-slate-100">{row.country}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-700 whitespace-nowrap border-r border-slate-100">{row.department || "Unassigned"}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap border-r border-slate-100">{row.role}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 font-mono text-xs whitespace-nowrap border-r border-slate-100">{fmtDate(row.hireDate)}</td>
                  <td className="px-4 md:px-5 py-3.5 whitespace-nowrap border-r border-slate-100">
                    {row.requestStatus === "-"
                      ? <span className="text-slate-300">-</span>
                      : (
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          row.requestStatus === "Sick Leave"
                            ? "bg-orange-50 text-orange-700"
                            : "bg-blue-50 text-blue-700"
                        }`}>
                          {row.requestStatus}
                        </span>
                      )}
                  </td>

                  <td className="px-4 md:px-5 py-3.5 whitespace-nowrap border-r border-slate-100">
                    {row.reviewStatus === "-" ? (
                      <span className="text-slate-300">-</span>
                    ) : (
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${REVIEW_STATUS_STYLES[row.reviewStatus]}`}>
                        {row.reviewStatus}
                      </span>
                    )}
                  </td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums border-r border-slate-100">{fmtBalance(row.ptoBalance)}h</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums border-r border-slate-100">{fmtBalance(row.ptoUsed)}h</td>
                  <td className="px-4 md:px-5 py-3.5 text-teal-700 font-semibold tabular-nums border-r border-slate-100">{fmtBalance(row.ptoAvailable)}h</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums border-r border-slate-100">{fmtBalance(row.sickLeaveBalance)}h</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums border-r border-slate-100">{fmtBalance(row.sickLeaveUsed)}h</td>
                  <td className="px-4 md:px-5 py-3.5 text-teal-700 font-semibold tabular-nums border-r border-slate-100">{fmtBalance(row.sickLeaveAvailable)}h</td>
                  <td className="px-4 md:px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedRowId(row.id)}
                      title="View user details"
                      aria-label={`View details for ${row.fullName}`}
                      className="inline-flex items-center justify-center size-8 text-slate-400 hover:text-[#003527] hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <LuEye size={18} strokeWidth={1.75} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 md:px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
          {filteredRows.length} of {rows.length} contractors shown
        </div>
      </div>
    </div>
  );
}
