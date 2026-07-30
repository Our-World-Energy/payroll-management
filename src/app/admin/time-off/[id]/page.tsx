"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { LuChevronLeft, LuClock, LuCircleCheck, LuCircleX, LuCircleDot, LuCircleAlert, LuX, LuTrash2 } from "react-icons/lu";
import {
  fetchAllContractors, fetchAllLeaveRequestsAdmin, updateLeaveRequestStatus, deleteLeaveRequestAdmin,
  type AdminLeaveRequest,
} from "../../contractors/actions";
import type { Contractor } from "../../contractors/types";
import { fmtBalance, calculatePtoBalance, calculateSickLeaveBalance, cutoffFromSaved, DEFAULT_CUTOFF, type CutoffDate } from "@/lib/timeOffBalances";
import { fetchCutOffTime } from "../../settings/actions";

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

      {/* Score Cards — same PTO/Sick Leave 3-card layout as the Contractor
          Time-Off Detail tab in Time Off Management, with the same
          red-when-negative Available treatment. */}
      <div className="space-y-4 mb-8">
        {!isIndia && (
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">PTO</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                ["PTO Accrual",           `${fmtBalance(ptoBalance)}h`,   false],
                ["PTO Used",              `${fmtBalance(ptoUsed)}h`,      false],
                ["PTO Accrual Available", `${fmtBalance(ptoAvailable)}h`, ptoAvailable < 0],
              ] as [string, string, boolean][]).map(([label, value, negative]) => (
                <div key={label} className={`rounded-xl border px-3 py-2.5 ${negative ? "border-red-200 bg-red-50" : "border-teal-100 bg-teal-50"}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${negative ? "text-red-600" : "text-teal-700"}`}>{label}</p>
                  <p className={`text-lg font-bold mt-0.5 tabular-nums ${negative ? "text-red-700" : "text-[#003527]"}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Sick Leave</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              ["Sick Leave Accrual",     `${fmtBalance(sickBalance)}h`,   false],
              ["Sick Leave Used",        `${fmtBalance(sickUsed)}h`,      false],
              ["Sick Accrual Available", `${fmtBalance(sickAvailable)}h`, sickAvailable < 0],
            ] as [string, string, boolean][]).map(([label, value, negative]) => (
              <div key={label} className={`rounded-xl border px-3 py-2.5 ${negative ? "border-red-200 bg-red-50" : "border-orange-100 bg-orange-50"}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${negative ? "text-red-600" : "text-orange-700"}`}>{label}</p>
                <p className={`text-lg font-bold mt-0.5 tabular-nums ${negative ? "text-red-700" : "text-orange-700"}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Current Requests Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {["Name", "Start Date", "End Date",
                  ...(!isIndia ? ["PTO Used"] : []),
                  "Sick Leave Used", "Reason",
                  ...(!isIndia ? ["PTO Available"] : []),
                  "Sick Leave Available", "Type", "Action Status", "Action"
                ].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentRequests.length === 0 ? (
                <tr>
                  <td colSpan={isIndia ? 9 : 11} className="px-5 py-16 text-center text-sm text-slate-400">
                    <LuClock size={28} className="mx-auto mb-2 text-slate-200" strokeWidth={1.5} />
                    No pending time-off requests.
                  </td>
                </tr>
              ) : currentRequests.map((req) => {
                const isSick = !req.type.startsWith("PTO");
                return (
                  <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4 text-sm font-semibold text-[#003527] whitespace-nowrap">{fullName}</td>
                    <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">{fmtDate(req.startDate)}</td>
                    <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">{fmtDate(req.endDate)}</td>
                    {!isIndia && (
                      <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">
                        {req.ptoUsedHours > 0 ? `${fmtBalance(req.ptoUsedHours)}h` : "-"}
                      </td>
                    )}
                    <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">
                      {req.sickLeaveUsedHours > 0 ? `${fmtBalance(req.sickLeaveUsedHours)}h` : "-"}
                    </td>
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
                    {/* Type badge */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        isSick
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}>
                        {req.type}
                      </span>
                    </td>
                    {/* Action Status */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-200">
                        <LuCircleDot size={11} /> Pending
                      </span>
                    </td>
                    {/* Action buttons */}
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historical Data Table */}
      <div className="mt-10">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-[#003527]">Historical Request Data</h2>
          <p className="text-slate-400 text-sm mt-0.5">Previous time-off requests for {fullName}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {["Name", "Start Date", "End Date",
                    ...(!isIndia ? ["PTO Used"] : []),
                    "Sick Leave Used", "Reason", "Submitted", "Type", "Review", "Delete"
                  ].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historicalRequests.length === 0 ? (
                  <tr>
                    <td colSpan={isIndia ? 9 : 10} className="px-5 py-16 text-center text-sm text-slate-400">
                      <LuClock size={28} className="mx-auto mb-2 text-slate-200" strokeWidth={1.5} />
                      No historical requests found.
                    </td>
                  </tr>
                ) : historicalRequests.map((req) => {
                  const isSick = !req.type.startsWith("PTO");
                  const isApproved = req.status === "Approved";
                  return (
                    <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4 text-sm font-semibold text-[#003527] whitespace-nowrap">{fullName}</td>
                      <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">{fmtDate(req.startDate)}</td>
                      <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">{fmtDate(req.endDate)}</td>
                      {!isIndia && (
                        <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">
                          {req.ptoUsedHours > 0 ? `${fmtBalance(req.ptoUsedHours)}h` : "-"}
                        </td>
                      )}
                      <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">
                        {req.sickLeaveUsedHours > 0 ? `${fmtBalance(req.sickLeaveUsedHours)}h` : "-"}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500 max-w-xs">
                        <span className="line-clamp-2">{req.reason || "-"}</span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-400 whitespace-nowrap">{fmtDateTime(req.createdAt)}</td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          isSick
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}>
                          {req.type}
                        </span>
                      </td>
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
