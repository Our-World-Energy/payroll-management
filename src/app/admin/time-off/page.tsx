"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LuEye, LuX, LuClock, LuCircleCheck, LuCircleX, LuCalendarDays, LuTrendingUp,
  LuShieldCheck, LuChevronRight, LuDownload, LuCalendarPlus, LuUmbrella, LuStethoscope,
  LuSlidersHorizontal, LuCircleAlert, LuSearch, LuGift,
} from "react-icons/lu";
import {
  fetchAllContractors, updateTimeOffUsage,
  fetchAllLeaveRequestsAdmin, createLeaveOverride, type AdminLeaveRequest,
} from "../contractors/actions";
import type { Contractor } from "../contractors/types";
import { leaveTypeHours, isPtoLeaveType, leaveBucketFor } from "@/lib/timeOffBalances";

const HOURS_PER_DAY = 8;
const TODAY = new Date();

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

function firstOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function calendarMonthDiff(start: Date, end: Date) {
  return Math.max(
    (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth(),
    0
  );
}

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

function calculateUnusedSickLeave(hireDate: string, sickLeaveUsedHours: number): number {
  const startDate = parseDate(hireDate);
  if (!startDate) return 0;
  const eligibilityDate = addMonths(startDate, 6);
  const accrualStart = firstOfNextMonth(eligibilityDate);
  const currentYearStart = sickLeaveYearStart(TODAY);
  const prevYearEnd = new Date(currentYearStart.getTime() - 86400000);
  const prevYearStart = new Date(currentYearStart.getFullYear() - 1, 2, 1);
  const effectiveStart = accrualStart > prevYearStart ? accrualStart : prevYearStart;
  if (effectiveStart >= currentYearStart) return 0;
  const prevYearEndFirst = new Date(prevYearEnd.getFullYear(), prevYearEnd.getMonth(), 1);
  const monthsInPrevYear = calendarMonthDiff(effectiveStart, prevYearEndFirst) + 1;
  const prevYearAccrued = roundBalance(monthsInPrevYear * 3.33);
  return roundBalance(Math.max(prevYearAccrued - sickLeaveUsedHours, 0));
}

type RequestDecision = "Approved" | "Pending" | "Declined";

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
  "bg-teal-100 text-teal-700", "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700", "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700", "bg-emerald-100 text-emerald-700",
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

type TimeOffRow = {
  id: string;
  fullName: string;
  email: string;
  country: string;
  department: string;
  role: string;
  hireDate: string;
  ptoBalance: number;
  ptoUsed: number;
  ptoAvailable: number;
  sickLeaveBalance: number;
  sickLeaveUsed: number;
  sickLeaveAvailable: number;
  birthdayLeave: number;
  advanceSickLeave: number;
  specialLeaveCredits: number;
  specialLeaveUsed: number;
  specialLeaveAvailable: number;
  unusedSickLeave: number;
  latestRequest: AdminLeaveRequest | null;
};

export default function TimeOffPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [contractors,   setContractors]   = useState<Contractor[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<AdminLeaveRequest[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState("");

  const [nameSearch,         setNameSearch]         = useState("");
  const [countryFilter,      setCountryFilter]      = useState("All Countries");
  const [departmentFilter,   setDepartmentFilter]   = useState("All Departments");
  const [reviewStatusFilter, setReviewStatusFilter] = useState("All Statuses");

  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [modalTab,      setModalTab]      = useState<"details" | "info" | "override" | "special">("info");

  const [editLeaveType, setEditLeaveType] = useState<"Advance Sick Leave" | "Advance PTO/Birthday Leave">("Advance Sick Leave");
  const [editHours,     setEditHours]     = useState("");
  const [editReason,    setEditReason]    = useState("");
  const [editFrom,      setEditFrom]      = useState("");
  const [editTo,        setEditTo]        = useState("");

  const [specialHours, setSpecialHours] = useState("");
  const [specialReason, setSpecialReason] = useState("");

  const OVERRIDE_TYPES = ["PTO", "PTO Half Day", "Sick Leave", "Sick Leave Half Day", "Unpaid Leave", "Special Leave"] as const;
  const [overrideType,       setOverrideType]       = useState<typeof OVERRIDE_TYPES[number]>("PTO");
  const [overrideStartDate,  setOverrideStartDate]  = useState("");
  const [overrideEndDate,    setOverrideEndDate]    = useState("");
  const [overrideReason,     setOverrideReason]     = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideError,      setOverrideError]      = useState("");
  const [overrideSuccess,    setOverrideSuccess]    = useState("");
  const [overrideBlocked,    setOverrideBlocked]    = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setLoadError("");
      try {
        const [all, requests] = await Promise.all([
          fetchAllContractors({ country: "All Countries", status: "All Statuses", rules: [] }),
          fetchAllLeaveRequestsAdmin(),
        ]);
        if (active) { setContractors(all); setLeaveRequests(requests); }
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : "Unable to load contractors.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  // Map email → latest leave request (already sorted newest-first)
  const latestByEmail = useMemo<Record<string, AdminLeaveRequest>>(() => {
    const map: Record<string, AdminLeaveRequest> = {};
    for (const r of leaveRequests) {
      if (!map[r.email]) map[r.email] = r;
    }
    return map;
  }, [leaveRequests]);

  const rows = useMemo<TimeOffRow[]>(() => contractors.map((c) => {
    const fullName = c.fullName || [c.firstName, c.surname].filter(Boolean).join(" ");
    const ptoBalance       = c.ptoBalance;
    const sickLeaveBalance = c.sickLeaveBalance;
    const ptoUsed          = c.ptoUsed;
    const sickLeaveUsed    = c.sickLeaveUsed;
    const ptoAvailable       = roundBalance(Math.max(ptoBalance - ptoUsed, 0));
    const sickLeaveAvailable = roundBalance(Math.max(sickLeaveBalance - sickLeaveUsed, 0));
    const specialLeaveAvailable = roundBalance(Math.max(c.specialLeaveCredits - c.specialLeaveUsed, 0));
    return {
      id: c.uid, fullName, email: c.email,
      country: countryFromLocation(c.location),
      department: c.department, role: c.role, hireDate: c.hireDate,
      ptoBalance, ptoUsed, ptoAvailable,
      sickLeaveBalance, sickLeaveUsed, sickLeaveAvailable,
      birthdayLeave:    c.birthdayLeave,
      advanceSickLeave: c.advanceSickLeave,
      specialLeaveCredits: c.specialLeaveCredits,
      specialLeaveUsed:    c.specialLeaveUsed,
      specialLeaveAvailable,
      unusedSickLeave:  calculateUnusedSickLeave(c.hireDate, sickLeaveUsed),
      latestRequest:    latestByEmail[c.email] ?? null,
    };
  }), [contractors, latestByEmail]);

  const countryOptions    = Array.from(new Set(rows.map((r) => r.country))).sort();
  const departmentOptions = Array.from(new Set(rows.map((r) => r.department || "Unassigned"))).sort();
  const filtersActive = nameSearch.trim() !== "" || countryFilter !== "All Countries" || departmentFilter !== "All Departments" || reviewStatusFilter !== "All Statuses";

  const filteredRows = rows.filter((r) => {
    const nm = !nameSearch.trim() || r.fullName.toLowerCase().includes(nameSearch.trim().toLowerCase());
    const cm = countryFilter    === "All Countries"   || r.country === countryFilter;
    const dm = departmentFilter === "All Departments" || (r.department || "Unassigned") === departmentFilter;
    const sm = reviewStatusFilter === "All Statuses"  || r.latestRequest?.status === reviewStatusFilter;
    return nm && cm && dm && sm;
  });

  const pendingCount  = leaveRequests.filter((r) => r.status === "Pending").length;
  const approvedCount = leaveRequests.filter((r) => r.status === "Approved").length;
  const rejectedCount = leaveRequests.filter((r) => r.status === "Rejected").length;

  const selectedRow = rows.find((r) => r.id === selectedRowId) ?? null;

  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId && rows.length > 0 && !selectedRowId) {
      setSelectedRowId(openId);
      setModalTab("info");
      router.replace("/admin/time-off");
    }
  }, [searchParams, rows, selectedRowId, router]);

  const isIndia = countryFilter === "India";

  const COLS = [
    "Employee", "Country", "Department", "Hire Date",
    ...(!isIndia ? ["PTO Accrual", "PTO Used", "PTO Accrual Available"] : []),
    "Sick Leave Accrual", "Sick Used", "Sick Accrual Available",
    ...(!isIndia ? ["Advance PTO/Birthday Leave"] : []),
    "Advance Sick Leave", "Status", "Action",
  ];

  function exportCSV() {
    const headers = [
      "Name", "Country", "Department", "Hire Date",
      "PTO Accrual (h)", "PTO Used (h)", "PTO Available (h)",
      "Sick Leave Accrual (h)", "Sick Used (h)", "Sick Available (h)",
      "Advance PTO/Birthday Leave (h)", "Advance Sick Leave (h)",
      "Special Leave Credits (h)", "Special Leave Used (h)", "Special Leave Available (h)", "Status",
    ];
    const csvRows = [
      headers.join(","),
      ...filteredRows.map((r) =>
        [
          `"${r.fullName}"`, `"${r.country}"`, `"${r.department || "Unassigned"}"`, r.hireDate,
          r.ptoBalance, r.ptoUsed, r.ptoAvailable,
          r.sickLeaveBalance, r.sickLeaveUsed, r.sickLeaveAvailable,
          r.birthdayLeave, r.advanceSickLeave,
          r.specialLeaveCredits, r.specialLeaveUsed, r.specialLeaveAvailable,
          `"${r.latestRequest?.status ?? "No Request"}"`,
        ].join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `time-off-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 sm:p-5 md:p-6 max-w-full">

      {/* ── Detail Modal ── */}
      {selectedRow && (() => {
        const currentStatus = selectedRow.latestRequest?.status as RequestDecision | undefined;
        const reviewStatus: RequestDecision | "-" = currentStatus ?? "-";
        const isRowIndia = selectedRow.country === "India";

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedRowId(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">

              {/* Header */}
              <div className="px-6 py-5 bg-gradient-to-r from-[#003527] to-[#006b5f] flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`size-12 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor(selectedRow.id)}`}>
                    {avatarInitials(selectedRow.fullName)}
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">Contractor Time Off – Advance Leave Request Details</p>
                    <h3 className="text-lg font-bold text-white mt-0.5">{selectedRow.fullName}</h3>
                    <p className="text-sm text-white/60 mt-0.5">{selectedRow.department || "—"}</p>
                    <p className="text-xs text-white/50 mt-0.5">{selectedRow.email || "—"}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedRowId(null)} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                  <LuX size={18} strokeWidth={2} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-100 px-6">
                {([
                  { key: "info",     label: "Contractor Time-Off Detail", icon: <LuEye size={13} /> },
                  { key: "details",  label: "Advance Leave Request",      icon: <LuCalendarPlus size={13} /> },
                  { key: "override", label: "Leave Override",             icon: <LuSlidersHorizontal size={13} /> },
                  { key: "special",  label: "Special Leave Credits",      icon: <LuGift size={13} /> },
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
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ["Hire Date",      fmtDate(selectedRow.hireDate)],
                        ["Status Request", selectedRow.latestRequest?.type ?? "—"],
                        ["Request Days",   selectedRow.latestRequest ? (selectedRow.latestRequest.type.endsWith("Half Day") ? "Half day" : `${selectedRow.latestRequest.durationDays} day${selectedRow.latestRequest.durationDays !== 1 ? "s" : ""}`) : "—"],
                        ["Review Status",  reviewStatus === "-" ? "—" : reviewStatus],
                        ["Request Reason", selectedRow.latestRequest?.reason ?? "—"],
                      ] as [string, string][]).map(([label, value]) => (
                        <div key={label} className={`bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 ${label === "Request Reason" ? "col-span-2" : ""}`}>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
                          <p className="text-sm font-medium text-slate-700 mt-0.5 break-words">{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* PTO section — hidden for India */}
                    {!isRowIndia && (
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">PTO</p>
                        <div className="grid grid-cols-3 gap-2">
                          {([
                            ["PTO Accrual",           `${fmtBalance(selectedRow.ptoBalance)}h`],
                            ["PTO Used",              `${fmtBalance(selectedRow.ptoUsed)}h`],
                            ["PTO Accrual Available", `${fmtBalance(selectedRow.ptoAvailable)}h`],
                          ] as [string, string][]).map(([label, value]) => (
                            <div key={label} className="rounded-xl border border-teal-100 bg-teal-50 px-3 py-2.5">
                              <p className="text-[10px] font-semibold text-teal-700 uppercase tracking-wider">{label}</p>
                              <p className="text-lg font-bold text-[#003527] mt-0.5 tabular-nums">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sick Leave section */}
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Sick Leave</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ["Sick Leave Accrual",     `${fmtBalance(selectedRow.sickLeaveBalance)}h`],
                          ["Sick Leave Used",        `${fmtBalance(selectedRow.sickLeaveUsed)}h`],
                          ["Sick Accrual Available", `${fmtBalance(selectedRow.sickLeaveAvailable)}h`],
                        ] as [string, string][]).map(([label, value]) => (
                          <div key={label} className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2.5">
                            <p className="text-[10px] font-semibold text-orange-700 uppercase tracking-wider">{label}</p>
                            <p className="text-lg font-bold text-orange-700 mt-0.5 tabular-nums">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Current review status + eye icon to go to full page */}
                    <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Current Review Status</p>
                        {reviewStatus === "-" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">No request</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${REVIEW_BADGE[reviewStatus]}`}>
                            {REVIEW_ICON[reviewStatus]}
                            {reviewStatus}
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
                  const hasNoPtoBalance  = selectedRow.ptoBalance === 0 && selectedRow.ptoAvailable === 0;
                  const hasNoSickBalance = selectedRow.sickLeaveBalance === 0 && selectedRow.sickLeaveAvailable === 0;
                  const advanceEligible  = isRowIndia ? hasNoSickBalance : (hasNoPtoBalance && hasNoSickBalance);
                  const isPto = editLeaveType === "Advance PTO/Birthday Leave";

                  async function applyAdvanceGrant() {
                    if (!selectedRow) return;
                    const hoursToAdd = parseFloat(editHours) || 0;
                    if (hoursToAdd <= 0) return;
                    const newBirthday    = isPto ? selectedRow.birthdayLeave + hoursToAdd : selectedRow.birthdayLeave;
                    const newAdvanceSick = isPto ? selectedRow.advanceSickLeave : selectedRow.advanceSickLeave + hoursToAdd;
                    await updateTimeOffUsage(selectedRow.id, { birthdayLeave: newBirthday, advanceSickLeave: newAdvanceSick });
                    setContractors((prev) => prev.map((c) =>
                      c.uid === selectedRow.id
                        ? { ...c, birthdayLeave: newBirthday, advanceSickLeave: newAdvanceSick }
                        : c
                    ));
                    setEditHours("");
                  }

                  return (<>
                    <div className={`grid ${isRowIndia ? "grid-cols-1" : "grid-cols-2"} gap-2`}>
                      {!isRowIndia && (
                        <div className="bg-pink-50 rounded-xl border border-pink-200 px-3 py-2.5">
                          <p className="text-[10px] font-semibold text-pink-600 uppercase tracking-wider">Advance PTO/Birthday Leave</p>
                          <p className="text-xl font-black text-pink-700 leading-tight mt-0.5">
                            {selectedRow.birthdayLeave > 0
                              ? <>{fmtBalance(selectedRow.birthdayLeave)}<span className="text-xs font-semibold ml-0.5 text-pink-400">hrs</span></>
                              : <span className="text-sm text-pink-300">Not eligible</span>}
                          </p>
                        </div>
                      )}
                      <div className="bg-blue-50 rounded-xl border border-blue-200 px-3 py-2.5">
                        <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Advance Sick Leave</p>
                        <p className="text-xl font-black text-blue-700 leading-tight mt-0.5">
                          {selectedRow.advanceSickLeave > 0
                            ? <>{fmtBalance(selectedRow.advanceSickLeave)}<span className="text-xs font-semibold ml-0.5 text-blue-400">hrs</span></>
                            : <span className="text-sm text-blue-300">Not eligible</span>}
                        </p>
                      </div>
                    </div>

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
                            <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 col-span-2">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Advance Leave Type</p>
                              <select
                                value={editLeaveType}
                                onChange={(e) => { setEditLeaveType(e.target.value as typeof editLeaveType); setEditHours(""); }}
                                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                              >
                                <option value="Advance Sick Leave">Advance Sick Leave</option>
                                {!isRowIndia && <option value="Advance PTO/Birthday Leave">Advance PTO/Birthday Leave</option>}
                              </select>
                            </div>
                            <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 col-span-2">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Request Hours <span className="text-red-400">*</span></p>
                              <input type="number" min="1" value={editHours} onChange={(e) => setEditHours(e.target.value)} placeholder="Enter hours e.g. 8"
                                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                            </div>
                            <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">From Date</p>
                              <input type="date" value={editFrom} onChange={(e) => setEditFrom(e.target.value)}
                                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                            </div>
                            <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">To Date</p>
                              <input type="date" value={editTo} onChange={(e) => setEditTo(e.target.value)}
                                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                            </div>
                          </div>
                          <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Reason</p>
                            <textarea value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="Enter reason for advance leave request..." rows={2}
                              className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
                          </div>
                          <button onClick={applyAdvanceGrant} disabled={!editHours || parseFloat(editHours) <= 0}
                            className="w-full py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                            <LuCircleCheck size={15} strokeWidth={2} /> Apply Advance Leave
                          </button>
                        </div>
                      )}
                    </div>
                  </>);
                })() : modalTab === "override" ? (() => {
                  async function handleOverrideSubmit() {
                    if (!selectedRow) return;
                    if (!overrideStartDate || !overrideEndDate) {
                      setOverrideError("Start Date and End Date are required.");
                      return;
                    }
                    if (new Date(overrideEndDate) < new Date(overrideStartDate)) {
                      setOverrideError("End Date must be on or after Start Date.");
                      return;
                    }
                    const requiredHours = leaveTypeHours(overrideType);
                    const overrideBucket = leaveBucketFor(overrideType);
                    const availableHours =
                      overrideBucket === "pto" ? selectedRow.ptoAvailable :
                      overrideBucket === "specialLeave" ? selectedRow.specialLeaveAvailable :
                      selectedRow.sickLeaveAvailable;
                    if (requiredHours > 0 && availableHours < requiredHours) {
                      const leaveLabel =
                        overrideBucket === "pto" ? "PTO" :
                        overrideBucket === "specialLeave" ? "Special Leave Credits" :
                        "Sick Leave";
                      setOverrideBlocked(
                        `${leaveLabel} Available is not enough for this override. Available: ${fmtBalance(availableHours)}h, Required: ${requiredHours}h.`
                      );
                      return;
                    }
                    setOverrideError(""); setOverrideSuccess("");
                    setOverrideSubmitting(true);
                    const result = await createLeaveOverride({
                      email: selectedRow.email,
                      type: overrideType,
                      startDate: overrideStartDate,
                      endDate: overrideEndDate,
                      reason: overrideReason,
                    });
                    setOverrideSubmitting(false);
                    if (!result.ok || !result.request) {
                      setOverrideError(result.error ?? "Failed to create override.");
                      return;
                    }
                    const req = result.request;
                    setContractors((prev) => prev.map((c) =>
                      c.uid === selectedRow.id
                        ? {
                            ...c,
                            ptoUsed: c.ptoUsed + req.ptoUsedHours,
                            sickLeaveUsed: c.sickLeaveUsed + req.sickLeaveUsedHours,
                            specialLeaveUsed: c.specialLeaveUsed + req.specialLeaveUsedHours,
                          }
                        : c
                    ));
                    setLeaveRequests((prev) => [req, ...prev]);
                    setOverrideSuccess("Leave override created and applied.");
                    setOverrideStartDate(""); setOverrideEndDate(""); setOverrideReason("");
                  }

                  return (
                    <div className="space-y-4">
                      {!isRowIndia && (
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">PTO</p>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              ["PTO Accrual",           `${fmtBalance(selectedRow.ptoBalance)}h`],
                              ["PTO Used",              `${fmtBalance(selectedRow.ptoUsed)}h`],
                              ["PTO Accrual Available", `${fmtBalance(selectedRow.ptoAvailable)}h`],
                            ] as [string, string][]).map(([label, value]) => (
                              <div key={label} className="rounded-xl border border-teal-100 bg-teal-50 px-3 py-2.5">
                                <p className="text-[10px] font-semibold text-teal-700 uppercase tracking-wider">{label}</p>
                                <p className="text-lg font-bold text-[#003527] mt-0.5 tabular-nums">{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Sick Leave</p>
                        <div className="grid grid-cols-3 gap-2">
                          {([
                            ["Sick Leave Accrual",     `${fmtBalance(selectedRow.sickLeaveBalance)}h`],
                            ["Sick Leave Used",        `${fmtBalance(selectedRow.sickLeaveUsed)}h`],
                            ["Sick Accrual Available", `${fmtBalance(selectedRow.sickLeaveAvailable)}h`],
                          ] as [string, string][]).map(([label, value]) => (
                            <div key={label} className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2.5">
                              <p className="text-[10px] font-semibold text-orange-700 uppercase tracking-wider">{label}</p>
                              <p className="text-lg font-bold text-orange-700 mt-0.5 tabular-nums">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Leave Type</p>
                        <select
                          value={overrideType}
                          onChange={(e) => setOverrideType(e.target.value as typeof OVERRIDE_TYPES[number])}
                          className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        >
                          {OVERRIDE_TYPES.filter((t) => isRowIndia ? !isPtoLeaveType(t) : true).map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Start Date</p>
                          <input type="date" value={overrideStartDate} onChange={(e) => setOverrideStartDate(e.target.value)}
                            className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                        </div>
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">End Date</p>
                          <input type="date" value={overrideEndDate} onChange={(e) => setOverrideEndDate(e.target.value)}
                            className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Reason for Request</p>
                        <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Enter reason for this leave override..." rows={2}
                          className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
                      </div>
                      {overrideError && <p className="text-xs font-medium text-red-600">{overrideError}</p>}
                      {overrideSuccess && <p className="text-xs font-medium text-emerald-600">{overrideSuccess}</p>}
                      <button onClick={handleOverrideSubmit} disabled={overrideSubmitting || !overrideStartDate || !overrideEndDate}
                        className="w-full py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                        <LuCircleCheck size={15} strokeWidth={2} /> {overrideSubmitting ? "Applying…" : "Apply Leave Override"}
                      </button>
                    </div>
                  );
                })() : modalTab === "special" ? (() => {
                  async function applySpecialGrant() {
                    if (!selectedRow) return;
                    const hoursToAdd = parseFloat(specialHours) || 0;
                    if (hoursToAdd <= 0) return;
                    const newCredits = selectedRow.specialLeaveCredits + hoursToAdd;
                    await updateTimeOffUsage(selectedRow.id, { specialLeaveCredits: newCredits });
                    setContractors((prev) => prev.map((c) =>
                      c.uid === selectedRow.id ? { ...c, specialLeaveCredits: newCredits } : c
                    ));
                    setSpecialHours(""); setSpecialReason("");
                  }

                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ["Special Leave Credits",   `${fmtBalance(selectedRow.specialLeaveCredits)}h`],
                          ["Special Leave Used",      `${fmtBalance(selectedRow.specialLeaveUsed)}h`],
                          ["Special Leave Available", `${fmtBalance(selectedRow.specialLeaveAvailable)}h`],
                        ] as [string, string][]).map(([label, value]) => (
                          <div key={label} className="rounded-xl border border-purple-100 bg-purple-50 px-3 py-2.5">
                            <p className="text-[10px] font-semibold text-purple-700 uppercase tracking-wider">{label}</p>
                            <p className="text-lg font-bold text-purple-700 mt-0.5 tabular-nums">{value}</p>
                          </div>
                        ))}
                      </div>

                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                          <LuGift size={13} /> Grant Special Leave Credits
                        </p>
                        <p className="text-xs text-slate-500 leading-relaxed mb-3">
                          Grants an extra bonus leave balance for this contractor, on top of their regular PTO/Sick Leave — grantable at any time. Once granted, it can be drawn against via a Leave Override with type &ldquo;Special Leave&rdquo;.
                        </p>
                        <div className="space-y-2">
                          <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Hours to Grant <span className="text-red-400">*</span></p>
                            <input type="number" min="1" value={specialHours} onChange={(e) => setSpecialHours(e.target.value)} placeholder="Enter hours e.g. 8"
                              className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                          </div>
                          <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Reason</p>
                            <textarea value={specialReason} onChange={(e) => setSpecialReason(e.target.value)} placeholder="Enter reason for this special leave grant..." rows={2}
                              className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
                          </div>
                          <button onClick={applySpecialGrant} disabled={!specialHours || parseFloat(specialHours) <= 0}
                            className="w-full py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                            <LuCircleCheck size={15} strokeWidth={2} /> Apply Special Leave Credits
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })() : null}
              </div>

              {/* Footer */}
              <div className="shrink-0 px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                <button onClick={() => setSelectedRowId(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Insufficient-balance message box for Leave Override */}
      {overrideBlocked && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOverrideBlocked("")} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <button
              onClick={() => setOverrideBlocked("")}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <LuX size={18} strokeWidth={2} />
            </button>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
                <LuCircleAlert size={20} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#003527]">Insufficient Balance</h3>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{overrideBlocked}</p>
              </div>
            </div>
            <button
              onClick={() => setOverrideBlocked("")}
              className="mt-6 w-full py-2.5 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-3 gap-2">
        <div>
          <nav className="flex mb-1">
            <ol className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <li>Management</li>
              <li><LuChevronRight size={14} className="text-slate-400" /></li>
              <li className="text-teal-600">Time-Off Management</li>
            </ol>
          </nav>
          <h2 className="text-lg md:text-xl font-bold text-[#003527] tracking-tight">Time-Off Management</h2>
          <p className="text-xs text-slate-500 mt-0.5">Track PTO and sick leave balances across your contractor workforce.</p>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-3">
        <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm p-2.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Pending</p>
            <p className="text-xl font-black text-amber-600 leading-tight">{pendingCount}</p>
          </div>
          <div className="size-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <LuClock size={14} className="text-amber-600" />
          </div>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm p-2.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Approved</p>
            <p className="text-xl font-black text-emerald-700 leading-tight">{approvedCount}</p>
          </div>
          <div className="size-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
            <LuCircleCheck size={14} className="text-emerald-600" />
          </div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 shadow-sm p-2.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider">Declined</p>
            <p className="text-xl font-black text-red-600 leading-tight">{rejectedCount}</p>
          </div>
          <div className="size-7 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
            <LuCircleX size={14} className="text-red-500" />
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="mb-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-3 items-center">
        <span className="text-sm font-semibold text-slate-500 mr-1">Quick Filters:</span>
        <div className="relative w-full sm:w-64">
          <LuSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            placeholder="Search by name…"
            disabled={loading}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-700 outline-none transition-all hover:border-slate-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60"
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
        <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} disabled={loading}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option>All Countries</option>
          {countryOptions.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} disabled={loading}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option>All Departments</option>
          {departmentOptions.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={reviewStatusFilter} onChange={(e) => setReviewStatusFilter(e.target.value)} disabled={loading}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="All Statuses">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
        {filtersActive && (
          <button onClick={() => { setNameSearch(""); setCountryFilter("All Countries"); setDepartmentFilter("All Departments"); setReviewStatusFilter("All Statuses"); }}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Clear filters">
            <LuX size={16} strokeWidth={2} />
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <LuShieldCheck size={14} className="text-teal-500" />
            <span>{filteredRows.length} contractors shown</span>
          </div>
          <button onClick={exportCSV} disabled={loading || filteredRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#003527] border border-[#003527]/30 bg-white hover:bg-[#003527] hover:text-white rounded-lg transition-colors disabled:opacity-40">
            <LuDownload size={13} strokeWidth={2} /> Export CSV
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-auto" style={{ scrollbarWidth: "thin", maxHeight: "60vh" }}>
          <table className="w-full text-left" style={{ minWidth: "1840px", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead className="sticky top-0 z-20" style={{ background: "#003527" }}>
              <tr style={{ background: "#003527" }}>
                <th className="px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap sticky left-0 z-20 border-r border-white/20"
                  style={{ minWidth: 210, background: "#003527" }}>Employee</th>
                {COLS.slice(1, -1).map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap border-r border-white/20">{h}</th>
                ))}
                <th className="px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap sticky right-0 z-20 border-l border-white/20"
                  style={{ background: "#003527" }}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3 sticky left-0 bg-white border-r border-slate-200" style={{ minWidth: 210 }}>
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full bg-slate-100 shrink-0" />
                        <div className="space-y-1.5"><div className="h-3 bg-slate-100 rounded w-28" /><div className="h-2 bg-slate-100 rounded w-20" /></div>
                      </div>
                    </td>
                    {COLS.slice(1, -1).map((h) => (
                      <td key={h} className="px-4 py-3 border-r border-slate-100"><div className="h-3 bg-slate-100 rounded w-16" /></td>
                    ))}
                    <td className="px-4 py-3 sticky right-0 bg-white border-l border-slate-200"><div className="h-3 bg-slate-100 rounded w-12" /></td>
                  </tr>
                ))
              ) : loadError ? (
                <tr><td colSpan={COLS.length} className="px-4 py-16 text-center text-sm text-red-500">{loadError}</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={COLS.length} className="px-4 text-center text-slate-400 text-sm" style={{ height: 200 }}>No contractors match the selected filters.</td></tr>
              ) : filteredRows.map((row) => {
                const latest = row.latestRequest;
                const reviewStatus: RequestDecision | "-" = (latest?.status as RequestDecision) ?? "-";
                return (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-3 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200" style={{ minWidth: 210 }}>
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor(row.id)}`}>
                            {avatarInitials(row.fullName)}
                          </div>
                          {latest?.status === "Pending" && (
                            <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                              <span className="relative inline-flex rounded-full size-2.5 bg-amber-500" />
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#003527] truncate">{row.fullName}</p>
                          <p className="text-xs text-slate-400 truncate">{row.role || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap border-r border-slate-100">{row.country}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-700 whitespace-nowrap border-r border-slate-100">{row.department || "Unassigned"}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap font-mono text-xs border-r border-slate-100">{fmtDate(row.hireDate)}</td>
                    {!isIndia && <>
                      <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500 border-r border-slate-100">
                        {row.country === "India" ? <span className="text-slate-300">—</span> : `${fmtBalance(row.ptoBalance)}h`}
                      </td>
                      <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500 border-r border-slate-100">
                        {row.country === "India" ? <span className="text-slate-300">—</span> : `${fmtBalance(row.ptoUsed)}h`}
                      </td>
                      <td className="px-4 py-2.5 border-r border-slate-100">
                        {row.country === "India" ? <span className="text-slate-300">—</span> : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold tabular-nums text-teal-700">{fmtBalance(row.ptoAvailable)}h</span>
                            <div className="w-12"><BalanceBar used={row.ptoUsed} total={row.ptoBalance} color="bg-teal-400" /></div>
                          </div>
                        )}
                      </td>
                    </>}
                    <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500 border-r border-slate-100">{fmtBalance(row.sickLeaveBalance)}h</td>
                    <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500 border-r border-slate-100">{fmtBalance(row.sickLeaveUsed)}h</td>
                    <td className="px-4 py-2.5 border-r border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-orange-600">{fmtBalance(row.sickLeaveAvailable)}h</span>
                        <div className="w-12"><BalanceBar used={row.sickLeaveUsed} total={row.sickLeaveBalance} color="bg-orange-400" /></div>
                      </div>
                    </td>
                    {!isIndia && (
                      <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500 border-r border-slate-100">
                        {row.country === "India" ? <span className="text-slate-300">—</span> : (
                          row.birthdayLeave > 0
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-pink-50 text-pink-700 border border-pink-200">{fmtBalance(row.birthdayLeave)}h</span>
                            : <span className="text-slate-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500 border-r border-slate-100">
                      {row.advanceSickLeave > 0
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">{fmtBalance(row.advanceSickLeave)}h</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    {/* Status */}
                    <td className="px-4 py-2.5 whitespace-nowrap border-r border-slate-100">
                      {latest ? (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          reviewStatus === "Approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          reviewStatus === "Declined" || reviewStatus === "Rejected" ? "bg-red-50 text-red-600 border-red-200" :
                          "bg-amber-50 text-amber-700 border-amber-200"
                        }`}>
                          {reviewStatus === "Approved" ? <LuCircleCheck size={11} /> : reviewStatus === "Pending" ? <LuClock size={11} /> : <LuCircleX size={11} />}
                          {latest.type} · {reviewStatus}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right sticky right-0 z-10 bg-white group-hover:bg-slate-50 border-l border-slate-200">
                      <button
                        onClick={() => { setSelectedRowId(row.id); setModalTab("info"); setEditLeaveType("Advance Sick Leave"); setEditHours(""); setEditFrom(""); setEditTo(""); setEditReason(""); const rowIsIndia = countryFromLocation(row.country) === "India" || row.country === "India"; setOverrideType(rowIsIndia ? "Sick Leave" : "PTO"); setOverrideStartDate(""); setOverrideEndDate(""); setOverrideReason(""); setOverrideError(""); setOverrideSuccess(""); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-[#003527] hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <LuEye size={14} strokeWidth={1.75} /> View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-400 font-medium">{filteredRows.length} of {rows.length} contractors</p>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <LuTrendingUp size={13} className="text-teal-500" />
            Balances calculated from hire date
          </div>
        </div>
      </div>
    </div>
  );
}
