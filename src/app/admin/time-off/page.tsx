"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LuEye, LuX, LuClock, LuCircleCheck, LuCircleX, LuCalendarDays, LuTrendingUp,
  LuShieldCheck, LuChevronRight, LuDownload, LuHistory, LuRotateCcw, LuCalendarPlus,
} from "react-icons/lu";
import { TIME_OFF, type TimeOffRequest } from "@/lib/data";
import { calculatePtoBalance, calculateSickLeaveBalance } from "@/lib/timeOffBalances";
import { fetchAllContractors } from "../contractors/actions";
import type { Contractor } from "../contractors/types";

const HOURS_PER_DAY = 8;
const BIRTHDAY_LEAVE_HOURS = 8; // 1 day advance birthday leave
const ADVANCE_SICK_LEAVE_HOURS = 8; // 1 day advance sick leave
const TODAY = new Date();

type RequestDecision = "Approved" | "Pending" | "Declined";
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
  birthdayLeave: number;       // advance birthday leave (hrs)
  advanceSickLeave: number;    // advance sick leave (hrs)
  unusedSickLeave: number;     // carry-forward from prior year before Mar 1 reset
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
  if (result.getDate() !== date.getDate()) result.setDate(0);
  return result;
}

// First day of the month AFTER the given date's month
function firstOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

// How many complete months have elapsed from start → end (both on 1st of month)
function calendarMonthDiff(start: Date, end: Date) {
  return Math.max(
    (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth(),
    0
  );
}

// Sick leave accrual period resets on March 1 each year
function sickLeaveYearStart(date: Date): Date {
  const marchFirst = new Date(date.getFullYear(), 2, 1);
  return date >= marchFirst
    ? new Date(date.getFullYear(), 2, 1)
    : new Date(date.getFullYear() - 1, 2, 1);
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



/**
 * Unused sick leave from the PREVIOUS year (before the most recent March 1 reset).
 * Any sick leave balance that was accrued before the current March 1 cutoff and
 * not used is captured here as a carry-forward credit.
 */
function calculateUnusedSickLeave(hireDate: string, sickLeaveUsedHours: number): number {
  const startDate = parseDate(hireDate);
  if (!startDate) return 0;

  const eligibilityDate = addMonths(startDate, 6);
  const accrualStart = firstOfNextMonth(eligibilityDate);

  // Current sick leave year started on this March 1
  const currentYearStart = sickLeaveYearStart(TODAY);

  // Previous year ended on currentYearStart - 1 day
  const prevYearEnd = new Date(currentYearStart.getTime() - 86400000);
  const prevYearStart = new Date(currentYearStart.getFullYear() - 1, 2, 1); // Mar 1 prev year

  // Effective start of previous year accrual
  const effectiveStart = accrualStart > prevYearStart ? accrualStart : prevYearStart;

  // If accrual hadn't started before current year began, no prior-year balance
  if (effectiveStart >= currentYearStart) return 0;

  const prevYearEndFirst = new Date(prevYearEnd.getFullYear(), prevYearEnd.getMonth(), 1);
  const monthsInPrevYear = calendarMonthDiff(effectiveStart, prevYearEndFirst) + 1;
  const prevYearAccrued = roundBalance(monthsInPrevYear * 3.33);

  // Unused = what was accrued in prior year minus what was used (approximate: all used hours attributed to prior year)
  const unused = Math.max(prevYearAccrued - sickLeaveUsedHours, 0);
  return roundBalance(unused);
}

/**
 * Birthday leave: 1 day (8 hrs) advance credit — granted once eligible (after 6-month wait + next month start)
 */
function calculateBirthdayLeave(hireDate: string): number {
  const startDate = parseDate(hireDate);
  if (!startDate) return 0;
  const eligibilityDate = addMonths(startDate, 6);
  const accrualStart = firstOfNextMonth(eligibilityDate);
  return TODAY >= accrualStart ? BIRTHDAY_LEAVE_HOURS : 0;
}

/**
 * Advance sick leave: 1 day (8 hrs) credit — granted once eligible
 */
function calculateAdvanceSickLeave(hireDate: string): number {
  const startDate = parseDate(hireDate);
  if (!startDate) return 0;
  const eligibilityDate = addMonths(startDate, 6);
  const accrualStart = firstOfNextMonth(eligibilityDate);
  return TODAY >= accrualStart ? ADVANCE_SICK_LEAVE_HOURS : 0;
}

function effectiveRequestStatus(request: TimeOffRequest, decisions: RequestDecisionMap): RequestDecision | "-" {
  const override = decisions[request.id];
  if (override) return override;
  // Map legacy "Rejected" from data to "Declined"
  if (request.status === "Rejected") return "Declined";
  return request.status as RequestDecision;
}

function approvedHoursFor(name: string, type: "Annual Leave" | "Sick Leave", decisions: RequestDecisionMap): number {
  return TIME_OFF
    .filter((r) => r.name === name && r.type === type && effectiveRequestStatus(r, decisions) === "Approved")
    .reduce((total, r) => total + r.days * HOURS_PER_DAY, 0);
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
  Declined: "bg-red-50 text-red-600 border border-red-200",
};

const REVIEW_ICON: Record<RequestDecision, React.ReactNode> = {
  Approved: <LuCircleCheck size={11} />,
  Pending:  <LuClock size={11} />,
  Declined: <LuCircleX size={11} />,
};

export default function TimeOffPage() {
  const router = useRouter();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState("");
  const [countryFilter, setCountryFilter]         = useState("All Countries");
  const [departmentFilter, setDepartmentFilter]   = useState("All Departments");
  const [reviewStatusFilter, setReviewStatusFilter] = useState("All Statuses");
  const [selectedRowId, setSelectedRowId]       = useState<string | null>(null);
  const [requestDecisions, setRequestDecisions] = useState<RequestDecisionMap>({});
  const [editLeaveType, setEditLeaveType] = useState<"Advance Sick Leave" | "Advance PTO/Birthday Leave">("Advance Sick Leave");
  const [editHours,     setEditHours]     = useState("");
  const [editReason,    setEditReason]    = useState("");
  const [editFrom,      setEditFrom]      = useState("");
  const [editTo,        setEditTo]        = useState("");
  const [modalTab,      setModalTab]      = useState<"details" | "history" | "info">("details");
  // Tracks how many advance hours have been granted per row (in-session only)
  const [advanceGrants, setAdvanceGrants] = useState<Record<string, { sick: number; pto: number }>>({});

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
    const ptoBalance      = calculatePtoBalance(c.hireDate);
    const sickLeaveBalance = calculateSickLeaveBalance(c.hireDate);
    const ptoUsed        = approvedHoursFor(fullName, "Annual Leave", requestDecisions);
    const sickLeaveUsed  = approvedHoursFor(fullName, "Sick Leave",  requestDecisions);

    // Total advance hours granted this session
    const advancePtoGranted  = calculateBirthdayLeave(c.hireDate)    + (advanceGrants[c.uid]?.pto  ?? 0);
    const advanceSickGranted = calculateAdvanceSickLeave(c.hireDate) + (advanceGrants[c.uid]?.sick ?? 0);

    // Each month of accrual first repays the advance debt before building usable balance.
    // Remaining debt = max(advanceGranted - accrualBalance, 0)
    // i.e. once accrual >= advance, the debt is fully covered.
    const advancePtoDebt  = Math.max(advancePtoGranted  - ptoBalance,       0);
    const advanceSickDebt = Math.max(advanceSickGranted - sickLeaveBalance, 0);

    // PTO available: balance minus used minus any still-outstanding advance PTO debt
    const ptoAvailable = roundBalance(Math.max(ptoBalance - ptoUsed - advancePtoDebt, 0));

    // Sick Leave available: balance minus used minus still-outstanding advance sick debt
    // AND minus any still-outstanding advance PTO/birthday debt (per spec)
    const sickLeaveAvailable = roundBalance(
      Math.max(sickLeaveBalance - sickLeaveUsed - advanceSickDebt - advancePtoDebt, 0)
    );

    return {
      id: c.uid, fullName, email: c.email,
      country: countryFromLocation(c.location),
      department: c.department, role: c.role, hireDate: c.hireDate,
      requestStatus: "PTO Leave",
      reviewStatus: latestRequest ? effectiveRequestStatus(latestRequest, requestDecisions) : "-",
      latestRequest, ptoBalance, ptoUsed, ptoAvailable,
      sickLeaveBalance, sickLeaveUsed, sickLeaveAvailable,
      birthdayLeave:    advancePtoGranted,
      advanceSickLeave: advanceSickGranted,
      unusedSickLeave:  calculateUnusedSickLeave(c.hireDate, sickLeaveUsed),
    };
  }), [contractors, requestDecisions, advanceGrants]);

  const countryOptions    = Array.from(new Set(rows.map((r) => r.country))).sort();
  const departmentOptions = Array.from(new Set(rows.map((r) => r.department || "Unassigned"))).sort();
  const filtersActive = countryFilter !== "All Countries" || departmentFilter !== "All Departments" || reviewStatusFilter !== "All Statuses";

  const filteredRows = rows.filter((r) => {
    const cm = countryFilter      === "All Countries"   || r.country === countryFilter;
    const dm = departmentFilter   === "All Departments" || (r.department || "Unassigned") === departmentFilter;
    const sm = reviewStatusFilter === "All Statuses"    || r.reviewStatus === reviewStatusFilter;
    return cm && dm && sm;
  });

  const visibleNames   = new Set(filteredRows.map((r) => r.fullName));
  const pendingRequests = TIME_OFF.filter((r) =>
    effectiveRequestStatus(r, requestDecisions) === "Pending" && visibleNames.has(r.name)
  ).length;
  const approvedRequests = TIME_OFF.filter((r) =>
    effectiveRequestStatus(r, requestDecisions) === "Approved" && visibleNames.has(r.name)
  ).length;
  const declinedRequests = TIME_OFF.filter((r) =>
    effectiveRequestStatus(r, requestDecisions) === "Declined" && visibleNames.has(r.name)
  ).length;

  const selectedRow = rows.find((r) => r.id === selectedRowId) ?? null;

  function setSelectedRequestDecision(decision: "Approved" | "Declined") {
    if (!selectedRow?.latestRequest) return;
    setRequestDecisions((cur) => ({ ...cur, [selectedRow.latestRequest!.id]: decision }));
  }

  function revertSelectedRequest() {
    if (!selectedRow?.latestRequest) return;
    setRequestDecisions((cur) => {
      const next = { ...cur };
      delete next[selectedRow.latestRequest!.id];
      return next;
    });
  }

  function exportCSV() {
    const headers = [
      "Name", "Country", "Department", "Hire Date",
      "PTO Accrual (h)", "PTO Used (h)", "PTO Accrual Available (h)",
      "Sick Leave Accrual (h)", "Sick Used (h)", "Sick Accrual Available (h)",
      "Advance PTO/Birthday Leave (h)", "Advance Sick Leave (h)",
      "Review Status",
    ];
    const csvRows = [
      headers.join(","),
      ...filteredRows.map((r) =>
        [
          `"${r.fullName}"`, `"${r.country}"`, `"${r.department || "Unassigned"}"`, r.hireDate,
          r.ptoBalance, r.ptoUsed, r.ptoAvailable,
          r.sickLeaveBalance, r.sickLeaveUsed, r.sickLeaveAvailable,
          r.birthdayLeave, r.advanceSickLeave,
          `"${r.reviewStatus === "-" ? "No Request" : r.reviewStatus}"`,
        ].join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-off-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const COLS = [
    "Employee", "Country", "Department", "Hire Date",
    "PTO Accrual", "PTO Used", "PTO Accrual Available",
    "Sick Leave Accrual", "Sick Used", "Sick Accrual Available",
    "Advance PTO/Birthday Leave", "Advance Sick Leave",
    "Review Status", "Action",
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-full">

      {/* ── Detail Modal ──────────────────────────────────────────── */}
      {selectedRow && (() => {
        const employeeHistory = TIME_OFF
          .filter((r) => r.name === selectedRow.fullName)
          .sort((a, b) => b.from.localeCompare(a.from));
        const currentStatus = selectedRow.reviewStatus;
        const isDecided = currentStatus === "Approved" || currentStatus === "Declined";

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedRowId(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">

              {/* Header */}
              <div className="px-6 py-5 bg-gradient-to-r from-[#003527] to-[#006b5f] flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`size-12 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor(selectedRow.id)}`}>
                    {avatarInitials(selectedRow.fullName)}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedRow.fullName}</h3>
                    <p className="text-sm text-white/60 mt-0.5">{selectedRow.role || "—"} · {selectedRow.department || "—"}</p>
                    <p className="text-xs text-white/50 mt-0.5">{selectedRow.email || "—"}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedRowId(null)} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                  <LuX size={18} strokeWidth={2} />
                </button>
              </div>

              {/* Balance summary bar */}
              <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
                <div className="px-5 py-3">
                  <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider">PTO Accrual Available</p>
                  <p className="text-2xl font-black text-[#003527] leading-tight">{fmtBalance(selectedRow.ptoAvailable)}<span className="text-sm font-semibold ml-1 text-slate-400">hrs</span></p>
                  <BalanceBar used={selectedRow.ptoUsed} total={selectedRow.ptoBalance} color="bg-teal-500" />
                  <p className="text-[10px] text-slate-400 mt-1">{fmtBalance(selectedRow.ptoUsed)}h used of {fmtBalance(selectedRow.ptoBalance)}h</p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider">Sick Accrual Available</p>
                  <p className="text-2xl font-black text-orange-600 leading-tight">{fmtBalance(selectedRow.sickLeaveAvailable)}<span className="text-sm font-semibold ml-1 text-slate-400">hrs</span></p>
                  <BalanceBar used={selectedRow.sickLeaveUsed} total={selectedRow.sickLeaveBalance} color="bg-orange-400" />
                  <p className="text-[10px] text-slate-400 mt-1">{fmtBalance(selectedRow.sickLeaveUsed)}h used of {fmtBalance(selectedRow.sickLeaveBalance)}h</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-100 px-6">
                {([
                  { key: "info",    label: "Contractor Time-Off Detail", icon: <LuEye size={13} /> },
                  { key: "details", label: "Advance Leave Request",      icon: <LuCalendarPlus size={13} /> },
                  { key: "history", label: `History (${employeeHistory.length})`, icon: <LuHistory size={13} /> },
                ] as const).map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => setModalTab(key)}
                    className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                      modalTab === key
                        ? "border-[#003527] text-[#003527]"
                        : "border-transparent text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {icon}{label}
                  </button>
                ))}
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                {modalTab === "info" ? (
                  /* ── Contractor Time-Off Detail tab ── */
                  <div className="space-y-4">
                    {/* Info fields grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ["Role",           selectedRow.role        || "—"],
                        ["Hire Date",      fmtDate(selectedRow.hireDate)],
                        ["Status Request", selectedRow.requestStatus === "-" ? "—" : selectedRow.requestStatus],
                        ["Request Hours",  selectedRow.latestRequest ? `${fmtBalance(selectedRow.latestRequest.days * HOURS_PER_DAY)}h` : "—"],
                        ["Review Status",  currentStatus === "-" ? "—" : currentStatus],
                        ["Request ID",     selectedRow.latestRequest?.id ?? "—"],
                        ["Request From",   selectedRow.latestRequest ? fmtDate(selectedRow.latestRequest.from) : "—"],
                        ["Request To",     selectedRow.latestRequest ? fmtDate(selectedRow.latestRequest.to)   : "—"],
                        ["Request Reason", selectedRow.latestRequest?.reason ?? "—"],
                      ] as [string, string][]).map(([label, value]) => (
                        <div key={label} className={`bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 ${label === "Request Reason" ? "col-span-2" : ""}`}>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
                          <p className="text-sm font-medium text-slate-700 mt-0.5 break-words">{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* PTO section */}
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">PTO</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ["PTO Accrual",   `${fmtBalance(selectedRow.ptoBalance)}h`,   "teal"],
                          ["PTO Used",      `${fmtBalance(selectedRow.ptoUsed)}h`,       "teal"],
                          ["PTO Accrual Available", `${fmtBalance(selectedRow.ptoAvailable)}h`,  "teal"],
                        ] as [string, string, string][]).map(([label, value]) => (
                          <div key={label} className="rounded-xl border border-teal-100 bg-teal-50 px-3 py-2.5">
                            <p className="text-[10px] font-semibold text-teal-700 uppercase tracking-wider">{label}</p>
                            <p className="text-lg font-bold text-[#003527] mt-0.5 tabular-nums">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Sick Leave section */}
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Sick Leave</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ["Sick Leave Accrual",   `${fmtBalance(selectedRow.sickLeaveBalance)}h`],
                          ["Sick Leave Used",      `${fmtBalance(selectedRow.sickLeaveUsed)}h`],
                          ["Sick Accrual Available", `${fmtBalance(selectedRow.sickLeaveAvailable)}h`],
                        ] as [string, string][]).map(([label, value]) => (
                          <div key={label} className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2.5">
                            <p className="text-[10px] font-semibold text-orange-700 uppercase tracking-wider">{label}</p>
                            <p className="text-lg font-bold text-orange-700 mt-0.5 tabular-nums">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Current review status */}
                    <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Current Review Status</p>
                        {currentStatus === "-" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">No request</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${REVIEW_BADGE[currentStatus]}`}>
                            {REVIEW_ICON[currentStatus]}
                            {currentStatus}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => router.push(`/admin/time-off/${selectedRow.id}`)}
                        title="View all requests"
                        className="p-1 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        <LuEye size={24} className="text-slate-300 hover:text-[#003527]" />
                      </button>
                    </div>
                  </div>
                ) : modalTab === "details" ? (() => {
                  // Contractor is eligible for advance leave only if they have NO regular balance yet
                  const hasNoPtoBalance    = selectedRow.ptoBalance === 0 && selectedRow.ptoAvailable === 0;
                  const hasNoSickBalance   = selectedRow.sickLeaveBalance === 0 && selectedRow.sickLeaveAvailable === 0;
                  const advanceEligible    = hasNoPtoBalance && hasNoSickBalance;
                  const isPto = editLeaveType === "Advance PTO/Birthday Leave";

                  function applyAdvanceGrant() {
                    const hoursToAdd = isPto ? 8 : (parseFloat(editHours) || 0);
                    if (!isPto && hoursToAdd <= 0) return;
                    setAdvanceGrants((cur) => {
                      const prev = cur[selectedRow.id] ?? { sick: 0, pto: 0 };
                      return {
                        ...cur,
                        [selectedRow.id]: {
                          sick: prev.sick + (isPto ? 0 : hoursToAdd),
                          pto:  prev.pto  + (isPto ? 8 : 0),
                        },
                      };
                    });
                    if (!isPto) setEditHours("");
                  }

                  return (<>
                  {/* Leave balance cards */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-pink-50 rounded-xl border border-pink-200 px-3 py-2.5">
                      <p className="text-[10px] font-semibold text-pink-600 uppercase tracking-wider">Advance PTO/Birthday Leave</p>
                      <p className="text-xl font-black text-pink-700 leading-tight mt-0.5">
                        {selectedRow.birthdayLeave > 0
                          ? <>{fmtBalance(selectedRow.birthdayLeave)}<span className="text-xs font-semibold ml-0.5 text-pink-400">hrs</span></>
                          : <span className="text-sm text-pink-300">Not eligible</span>}
                      </p>
                    </div>
                    <div className="bg-blue-50 rounded-xl border border-blue-200 px-3 py-2.5">
                      <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Advance Sick Leave</p>
                      <p className="text-xl font-black text-blue-700 leading-tight mt-0.5">
                        {selectedRow.advanceSickLeave > 0
                          ? <>{fmtBalance(selectedRow.advanceSickLeave)}<span className="text-xs font-semibold ml-0.5 text-blue-400">hrs</span></>
                          : <span className="text-sm text-blue-300">Not eligible</span>}
                      </p>
                    </div>
                  </div>

                  {/* Contractor info */}
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Contractor Info</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ["Country",   selectedRow.country],
                        ["Hire Date", fmtDate(selectedRow.hireDate)],
                      ] as [string, string][]).map(([label, value]) => (
                        <div key={label} className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
                          <p className="text-sm font-medium text-slate-700 mt-0.5">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Advance Leave Request */}
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                      <LuCalendarPlus size={13} /> Advance Leave Request
                    </p>

                    {!advanceEligible ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-start gap-3">
                        <LuCalendarDays size={16} className="text-slate-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Advance leave is only available to contractors who have <strong>no regular PTO or sick leave balance</strong>. This contractor has an existing leave balance and is not eligible for advance leave.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          {/* Advance Leave Type */}
                          <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 col-span-2">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Advance Leave Type</p>
                            <select
                              value={editLeaveType}
                              onChange={(e) => {
                                setEditLeaveType(e.target.value as typeof editLeaveType);
                                setEditHours("");
                              }}
                              className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            >
                              <option value="Advance Sick Leave">Advance Sick Leave</option>
                              <option value="Advance PTO/Birthday Leave">Advance PTO/Birthday Leave</option>
                            </select>
                          </div>

                          {/* Request Hours — only for Advance Sick Leave */}
                          {!isPto && (
                            <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 col-span-2">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                Request Hours <span className="text-red-400">*</span>
                              </p>
                              <input
                                type="number"
                                min="1"
                                value={editHours}
                                onChange={(e) => setEditHours(e.target.value)}
                                placeholder="Enter hours e.g. 8"
                                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                              />
                            </div>
                          )}

                          {/* PTO auto-note */}
                          {isPto && (
                            <div className="col-span-2 rounded-lg bg-pink-50 border border-pink-200 px-3 py-2 text-xs text-pink-700">
                              <strong>Auto:</strong> 8 hours will be added to the Advance PTO/Birthday Leave balance upon apply.
                            </div>
                          )}

                          {/* From date */}
                          <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">From Date</p>
                            <input
                              type="date"
                              value={editFrom}
                              onChange={(e) => setEditFrom(e.target.value)}
                              className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          </div>

                          {/* To date */}
                          <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">To Date</p>
                            <input
                              type="date"
                              value={editTo}
                              onChange={(e) => setEditTo(e.target.value)}
                              className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          </div>
                        </div>

                        {/* Reason */}
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Reason</p>
                          <textarea
                            value={editReason}
                            onChange={(e) => setEditReason(e.target.value)}
                            placeholder="Enter reason for advance leave request..."
                            rows={2}
                            className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                          />
                        </div>

                        {/* Apply button */}
                        <button
                          onClick={applyAdvanceGrant}
                          disabled={!isPto && (!editHours || parseFloat(editHours) <= 0)}
                          className="w-full py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                          <LuCircleCheck size={15} strokeWidth={2} />
                          Apply Advance Leave
                        </button>
                      </div>
                    )}
                  </div>
                  </>);
                })() : (
                  /* History tab */
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">All Time-Off Requests</p>
                    {employeeHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                        <LuHistory size={32} strokeWidth={1.5} />
                        <p className="mt-3 text-sm font-medium">No request history</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {employeeHistory.map((req) => {
                          const st = effectiveRequestStatus(req, requestDecisions);
                          return (
                            <div key={req.id} className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-3 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-mono text-slate-400">{req.id}</span>
                                  <span className="text-xs font-semibold text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded">{req.type}</span>
                                </div>
                                <p className="text-sm font-semibold text-slate-700 mt-1">
                                  {fmtDate(req.from)} → {fmtDate(req.to)}
                                  <span className="text-xs text-slate-400 font-normal ml-2">{req.days} day{req.days !== 1 ? "s" : ""}</span>
                                </p>
                                {req.reason && <p className="text-xs text-slate-400 mt-0.5 truncate">{req.reason}</p>}
                              </div>
                              {st !== "-" && (
                                <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${REVIEW_BADGE[st]}`}>
                                  {REVIEW_ICON[st]}
                                  {st}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div className="shrink-0 px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedRowId(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* ── Stat cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
        <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm p-4 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Pending</p>
            <p className="text-3xl font-black text-amber-600 mt-1">{pendingRequests}</p>
            <p className="text-xs text-amber-400 mt-1">Awaiting review</p>
          </div>
          <div className="size-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <LuClock size={18} className="text-amber-600" />
          </div>
        </div>

        <div className="bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm p-4 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Approved</p>
            <p className="text-3xl font-black text-emerald-700 mt-1">{approvedRequests}</p>
            <p className="text-xs text-emerald-400 mt-1">Requests approved</p>
          </div>
          <div className="size-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <LuCircleCheck size={18} className="text-emerald-600" />
          </div>
        </div>

        <div className="bg-red-50 rounded-xl border border-red-200 shadow-sm p-4 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Declined</p>
            <p className="text-3xl font-black text-red-600 mt-1">{declinedRequests}</p>
            <p className="text-xs text-red-300 mt-1">Requests declined</p>
          </div>
          <div className="size-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <LuCircleX size={18} className="text-red-500" />
          </div>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────── */}
      <div className="mb-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-3 items-center">
        <span className="text-sm font-semibold text-slate-500 mr-1">Quick Filters:</span>

        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          disabled={loading}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option>All Countries</option>
          {countryOptions.map((c) => <option key={c}>{c}</option>)}
        </select>

        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          disabled={loading}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option>All Departments</option>
          {departmentOptions.map((d) => <option key={d}>{d}</option>)}
        </select>

        <select
          value={reviewStatusFilter}
          onChange={(e) => setReviewStatusFilter(e.target.value)}
          disabled={loading}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="All Statuses">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Declined">Declined</option>
          <option value="-">No Request</option>
        </select>

        {filtersActive && (
          <button
            onClick={() => { setCountryFilter("All Countries"); setDepartmentFilter("All Departments"); setReviewStatusFilter("All Statuses"); }}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Clear filters"
          >
            <LuX size={16} strokeWidth={2} />
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <LuShieldCheck size={14} className="text-teal-500" />
            <span>{filteredRows.length} contractors shown</span>
          </div>
          <button
            onClick={exportCSV}
            disabled={loading || filteredRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#003527] border border-[#003527]/30 bg-white hover:bg-[#003527] hover:text-white rounded-lg transition-colors disabled:opacity-40"
          >
            <LuDownload size={13} strokeWidth={2} />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
          <table
            className="w-full text-left"
            style={{ minWidth: "1840px", borderCollapse: "separate", borderSpacing: 0 }}
          >
            <thead>
              <tr style={{ background: "#003527" }}>
                <th className="px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap sticky left-0 z-20 border-r border-white/20"
                  style={{ minWidth: 210, background: "#003527" }}>
                  Employee
                </th>
                {COLS.slice(1, -1).map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap border-r border-white/20">
                    {h}
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
                    {COLS.slice(1, -1).map((h) => (
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
                  <td colSpan={COLS.length} className="px-4 py-16 text-center text-sm text-red-500">{loadError}</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length} className="px-4 text-center text-slate-400 text-sm" style={{ height: 200 }}>
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

                  {/* Advance PTO/Birthday Leave */}
                  <td className="px-4 py-3 text-sm tabular-nums text-slate-500 border-r border-slate-100">
                    {row.birthdayLeave > 0
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-pink-50 text-pink-700 border border-pink-200">{fmtBalance(row.birthdayLeave)}h</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  {/* Advance Sick Leave */}
                  <td className="px-4 py-3 text-sm tabular-nums text-slate-500 border-r border-slate-100">
                    {row.advanceSickLeave > 0
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">{fmtBalance(row.advanceSickLeave)}h</span>
                      : <span className="text-slate-300">—</span>}
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

                  {/* Action — sticky right */}
                  <td className="px-4 py-3 text-right sticky right-0 z-10 bg-white group-hover:bg-slate-50 border-l border-slate-200">
                    <button
                      onClick={() => {
                        setSelectedRowId(row.id);
                        setModalTab("info");
                        setEditLeaveType("Advance Sick Leave");
                        setEditHours("");
                        setEditFrom("");
                        setEditTo("");
                        setEditReason("");
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
