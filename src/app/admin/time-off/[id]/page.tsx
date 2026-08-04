"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  LuChevronLeft, LuClock, LuCircleCheck, LuCircleX, LuCircleAlert, LuX, LuTrash2,
  LuCalendarDays, LuShieldCheck, LuSearch, LuSlidersHorizontal, LuChevronDown,
} from "react-icons/lu";
import {
  fetchAllContractors, fetchAllLeaveRequestsAdmin, updateLeaveRequestStatus, deleteLeaveRequestAdmin,
  type AdminLeaveRequest,
} from "../../contractors/actions";
import type { Contractor } from "../../contractors/types";
import { fmtBalance, calculatePtoBalance, calculateSickLeaveBalance, cutoffFromSaved, DEFAULT_CUTOFF, type CutoffDate } from "@/lib/timeOffBalances";
import { fetchCutOffTime } from "../../settings/actions";
import { TimeOffBalanceCard } from "@/components/TimeOffBalanceCard";

function roundBalance(value: number) {
  return Math.round(value * 100) / 100;
}

function fmtDate(date: string) {
  if (!date) return "-";
  const [year, month, day] = date.split("-");
  return year && month && day ? `${month}-${day}-${year}` : date;
}

function fmtDateTime(iso: string) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function fmtDateRange(start: string, end: string) {
  return start === end ? fmtDate(start) : `${fmtDate(start)} – ${fmtDate(end)}`;
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = [parts[0], parts[parts.length - 1]].filter(Boolean).map((p) => p[0]?.toUpperCase());
  return initials.join("") || "?";
}

// A request's hours draw from exactly one bucket (PTO, Sick Leave, or
// Special Leave) — whichever one is actually stamped with a nonzero value.
function hoursFor(req: AdminLeaveRequest): number {
  if (req.ptoUsedHours > 0) return req.ptoUsedHours;
  if (req.sickLeaveUsedHours > 0) return req.sickLeaveUsedHours;
  return req.specialLeaveUsedHours;
}

function matchesQuery(req: AdminLeaveRequest, query: string) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return req.type.toLowerCase().includes(q) || (req.reason || "").toLowerCase().includes(q);
}

function typeBadgeClass(type: string) {
  return type.startsWith("PTO")
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-amber-50 text-amber-700 border-amber-200";
}

const HISTORY_FILTERS = ["All", "Approved", "Rejected"] as const;
type HistoryFilter = typeof HISTORY_FILTERS[number];

// Split into "current" (pending) and "historical" (decided) buckets
const CUTOFF_DATE = "2026-01-01"; // requests from before this treated as historical even if pending

export default function ContractorTimeOffPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [contractor,   setContractor]   = useState<Contractor | null>(null);
  const [allRequests,  setAllRequests]  = useState<AdminLeaveRequest[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminLeaveRequest | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [cutoff,       setCutoff]       = useState<CutoffDate>(DEFAULT_CUTOFF);
  const [pendingSearch, setPendingSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("All");
  const [, startTransition] = useTransition();

  const loadData = useCallback(async () => {
    const [all, requests, savedCutoff] = await Promise.all([
      fetchAllContractors({ country: "All Countries", status: "All Statuses", rules: [] }),
      fetchAllLeaveRequestsAdmin(),
      fetchCutOffTime(),
    ]);
    const found = all.find((c) => c.uid === id) ?? null;
    setContractor(found);
    setCutoff(cutoffFromSaved(savedCutoff));
    // filter to only this contractor's requests
    if (found) {
      setAllRequests(requests.filter((r) => r.email === found.email));
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await loadData();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadData]);

  const fullName = contractor
    ? contractor.fullName || [contractor.firstName, contractor.surname].filter(Boolean).join(" ")
    : "";

  const country = contractor?.location?.split(",").map((p) => p.trim()).filter(Boolean).at(-1) ?? "";
  const isIndia = country.toLowerCase() === "india";

  // Current = Pending requests; Historical = Approved or Rejected
  const currentRequests    = allRequests.filter((r) => r.status === "Pending");
  const historicalRequests = allRequests.filter((r) => r.status !== "Pending");

  const filteredCurrentRequests = useMemo(
    () => currentRequests.filter((r) => matchesQuery(r, pendingSearch)),
    [currentRequests, pendingSearch]
  );
  const filteredHistoricalRequests = useMemo(
    () => historicalRequests
      .filter((r) => historyFilter === "All" || r.status === historyFilter)
      .filter((r) => matchesQuery(r, historySearch)),
    [historicalRequests, historyFilter, historySearch]
  );

  async function decide(reqId: string, decision: "Approved" | "Rejected") {
    // Optimistic update
    setAllRequests((prev) => prev.map((r) => r.id === reqId ? { ...r, status: decision } : r));
    const result = await updateLeaveRequestStatus(reqId, decision);
    if (!result.ok) {
      // revert on error (e.g. insufficient balance) and surface the reason
      setAllRequests((prev) => prev.map((r) => r.id === reqId ? { ...r, status: "Pending" } : r));
      setErrorMessage(result.error ?? "Failed to update request.");
      return;
    }
    // Refresh contractor balances + request list from the server so the score
    // cards (PTO/Sick Used & Available) and both tables reflect the change.
    await loadData();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteLeaveRequestAdmin(deleteTarget.id);
    setDeleting(false);
    if (!result.ok) {
      setErrorMessage(result.error ?? "Failed to delete request.");
      setDeleteTarget(null);
      return;
    }
    setDeleteTarget(null);
    // Refresh so the score cards reflect any reversed balance from a deleted Approved request.
    await loadData();
  }

  // Live-computed from Hire Date + the current Cut Off Time, rather than
  // trusting the stored snapshot — so a Cut Off Time change is reflected
  // immediately without waiting for this contractor to be saved again.
  const ptoBalance       = contractor ? calculatePtoBalance(contractor.hireDate, cutoff) : 0;
  // Same formula as the main Time Off Management page: an imported/legacy
  // baseline supersedes the computed value wherever it's set, and Advance
  // PTO/Sick Leave Used is always added on top so this matches what's shown
  // there instead of only reflecting the normal (non-advance) usage.
  const ptoUsed          = contractor ? (contractor.ptoUsedImport > 0 ? contractor.ptoUsedImport : contractor.ptoUsed) + contractor.birthdayLeaveUsed : 0;
  // Not floored at 0 — a negative Available (Used exceeds Accrual) is shown as-is.
  const ptoAvailable     = roundBalance(ptoBalance - ptoUsed);
  const sickBalance      = contractor ? calculateSickLeaveBalance(contractor.hireDate, cutoff) : 0;
  const sickUsed         = contractor ? (contractor.sickUsedImport > 0 ? contractor.sickUsedImport : contractor.sickLeaveUsed) + contractor.advanceSickLeaveUsed : 0;
  const sickAvailable    = roundBalance(sickBalance - sickUsed);

  if (!loading && !contractor) {
    return (
      <div className="p-8">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#003527] mb-6">
          <LuChevronLeft size={16} /> Back
        </button>
        <p className="text-slate-500 text-sm">Contractor not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 w-full">
      {/* Back */}
      <button
        onClick={() => router.push(`/admin/time-off?open=${id}`)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#003527] mb-6 transition-colors"
      >
        <LuChevronLeft size={16} /> Back
      </button>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[#003527]">Current / New Request Data</h1>
        <p className="text-slate-500 text-sm mt-1">{fullName}</p>
      </div>

      {/* Balance Cards */}
      <div className={`grid gap-4 mb-8 ${isIndia ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
        {!isIndia && (
          <TimeOffBalanceCard
            icon={<LuCalendarDays size={18} strokeWidth={1.75} />}
            title="PTO Balance"
            tone={ptoAvailable < 0 ? "red" : "teal"}
            accrued={ptoBalance}
            used={ptoUsed}
            available={ptoAvailable}
          />
        )}
        <TimeOffBalanceCard
          icon={<LuShieldCheck size={18} strokeWidth={1.75} />}
          title="Sick Leave Balance"
          tone={sickAvailable < 0 ? "red" : "orange"}
          accrued={sickBalance}
          used={sickUsed}
          available={sickAvailable}
        />
      </div>

      {/* Pending Requests */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-[#003527]">Pending Requests</h2>
          <span className="inline-flex min-w-[24px] h-6 items-center justify-center rounded-full bg-teal-100 px-2 text-xs font-bold text-teal-700">
            {currentRequests.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <LuSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              placeholder="Search requests"
              className="w-52 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            All Status <LuChevronDown size={14} />
          </button>
          <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            <LuSlidersHorizontal size={14} /> Filters
          </button>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredCurrentRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-slate-100 bg-slate-50">
              <LuClock size={26} className="text-slate-300" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-bold text-slate-700">
              {currentRequests.length === 0 ? "No pending time-off requests" : "No requests match your search"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {currentRequests.length === 0 ? "New requests will appear here for review." : "Try a different search term."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {["Employee", "Dates", "Leave Type", "Hours", "Reason",
                    ...(!isIndia ? ["PTO Available"] : []),
                    "Sick Leave Available", "Actions",
                  ].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCurrentRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">
                          {initialsFor(fullName)}
                        </div>
                        <span className="text-sm font-semibold text-[#003527]">{fullName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">{fmtDateRange(req.startDate, req.endDate)}</td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${typeBadgeClass(req.type)}`}>
                        {req.type}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-700 whitespace-nowrap">{fmtBalance(hoursFor(req))}h</td>
                    <td className="px-5 py-4 text-sm text-slate-500 max-w-xs">
                      <span className="line-clamp-2">{req.reason || "-"}</span>
                    </td>
                    {!isIndia && (
                      <td className={`px-5 py-4 text-sm whitespace-nowrap font-medium ${ptoAvailable < 0 ? "text-red-600" : "text-slate-700"}`}>
                        {fmtBalance(ptoAvailable)}h
                      </td>
                    )}
                    <td className={`px-5 py-4 text-sm whitespace-nowrap font-medium ${sickAvailable < 0 ? "text-red-600" : "text-slate-700"}`}>
                      {fmtBalance(sickAvailable)}h
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => decide(req.id, "Rejected")}
                          className="px-4 py-1.5 bg-red-400 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          Decline
                        </button>
                        <button
                          onClick={() => decide(req.id, "Approved")}
                          className="px-4 py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          Approve
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Request History */}
      <div className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#003527]">Request History</h2>
            <p className="text-slate-400 text-sm mt-0.5">Previous time-off requests for {fullName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
              {HISTORY_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setHistoryFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    historyFilter === f
                      ? f === "Approved" ? "bg-emerald-100 text-emerald-700"
                        : f === "Rejected" ? "bg-red-100 text-red-600"
                        : "bg-white text-slate-700 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="relative">
              <LuSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search history"
                className="w-52 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {filteredHistoricalRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-slate-100 bg-slate-50">
                <LuClock size={26} className="text-slate-300" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-bold text-slate-700">
                {historicalRequests.length === 0 ? "No historical requests found" : "No requests match your filters"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {historicalRequests.length === 0 ? "Decided requests will appear here." : "Try a different search term or status."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {["Employee", "Dates", "Leave Type", "Hours", "Reason", "Submitted", "Status", "Actions"].map((h) => (
                      <th key={h} className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistoricalRequests.map((req) => {
                    const isApproved = req.status === "Approved";
                    return (
                      <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">
                              {initialsFor(fullName)}
                            </div>
                            <span className="text-sm font-semibold text-[#003527]">{fullName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">{fmtDateRange(req.startDate, req.endDate)}</td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${typeBadgeClass(req.type)}`}>
                            {req.type}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm font-medium text-slate-700 whitespace-nowrap">{fmtBalance(hoursFor(req))}h</td>
                        <td className="px-5 py-4 text-sm text-slate-500 max-w-xs">
                          <span className="line-clamp-2">{req.reason || "-"}</span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-400 whitespace-nowrap">{fmtDateTime(req.createdAt)}</td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            isApproved
                              ? "bg-green-50 text-green-700 border border-green-200"
                              : "bg-red-50 text-red-600 border border-red-200"
                          }`}>
                            {isApproved ? <LuCircleCheck size={11} /> : <LuCircleX size={11} />}
                            {req.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <button
                            onClick={() => setDeleteTarget(req)}
                            title="Delete request"
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <LuTrash2 size={15} strokeWidth={1.75} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Insufficient-balance / error message box */}
      {errorMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setErrorMessage("")} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <button
              onClick={() => setErrorMessage("")}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <LuX size={18} strokeWidth={2} />
            </button>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
                <LuCircleAlert size={20} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#003527]">Unable to Approve Request</h3>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
            <button
              onClick={() => setErrorMessage("")}
              className="mt-6 w-full py-2.5 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40"
            >
              <LuX size={18} strokeWidth={2} />
            </button>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
                <LuTrash2 size={18} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#003527]">Delete Leave Request</h3>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                  This will permanently delete the {deleteTarget.type} request for {fmtDate(deleteTarget.startDate)} – {fmtDate(deleteTarget.endDate)}.
                  {deleteTarget.status === "Approved" && " Its approved hours will be reversed from the contractor's balance."}
                  {" "}This cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
