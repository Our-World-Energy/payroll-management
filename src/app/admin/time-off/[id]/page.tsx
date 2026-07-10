"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LuChevronLeft, LuClock, LuCircleCheck, LuCircleX, LuCircleDot } from "react-icons/lu";
import { fetchAllContractors } from "../../contractors/actions";
import type { Contractor } from "../../contractors/types";
import { fetchLeaveRequestsForEmail, updateLeaveRequestStatus, type LeaveRequest } from "../actions";
import { calculatePtoBalance, calculateSickLeaveBalance, roundBalance, fmtBalance } from "@/lib/timeOffBalances";

type RequestDecision = "Approved" | "Pending" | "Declined";

function deriveLeaveStatus(type: string, days: number): string {
  const t = type.toLowerCase();
  if (t.includes("sick"))   return days <= 0.5 ? "Sick Leave Half Day" : "Sick Leave";
  if (t.includes("unpaid")) return "Unpaid Leave";
  return days <= 0.5 ? "PTO Half Day" : "PTO";
}

function normalizeStatus(status: string): RequestDecision {
  if (status === "Rejected") return "Declined";
  if (status === "Approved") return "Approved";
  return "Pending";
}

function fmtDate(date: string) {
  if (!date) return "-";
  const [year, month, day] = date.split("-");
  return year && month && day ? `${month}-${day}-${year}` : date;
}


export default function ContractorTimeOffPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [contractor, setContractor] = useState<Contractor | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const all = await fetchAllContractors({ country: "All Countries", status: "All Statuses", rules: [] });
        if (!active) return;
        const found = all.find((c) => c.uid === id) ?? null;
        setContractor(found);
        const email = found?.email?.trim();
        const reqs = email ? await fetchLeaveRequestsForEmail(email) : [];
        if (active) setRequests(reqs);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [id]);

  const fullName = contractor
    ? contractor.fullName || [contractor.firstName, contractor.surname].filter(Boolean).join(" ")
    : "";

  const country = contractor?.location?.split(",").map((p) => p.trim()).filter(Boolean).at(-1) ?? "";
  const isIndia = country.toLowerCase() === "india";

  async function decide(reqId: string, decision: "Approved" | "Declined") {
    const dbStatus = decision === "Declined" ? "Rejected" : "Approved";
    setActionError("");
    setUpdatingId(reqId);
    try {
      await updateLeaveRequestStatus(reqId, dbStatus);
      setRequests((prev) => prev.map((r) => (r.id === reqId ? { ...r, status: dbStatus } : r)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update the request.");
    } finally {
      setUpdatingId(null);
    }
  }

  function effectiveStatus(req: LeaveRequest): RequestDecision {
    return normalizeStatus(req.status);
  }

  const currentRequests = requests.filter((r) => effectiveStatus(r) === "Pending");
  const historicalRequests = requests.filter((r) => effectiveStatus(r) !== "Pending");

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-50">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 rounded-full border-4 border-slate-200 border-t-[#003527] animate-spin" />
          <p className="text-sm font-medium text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!contractor) {
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

      {/* Score Cards */}
      <div className={`grid grid-cols-2 ${isIndia ? "md:grid-cols-3" : "md:grid-cols-3 lg:grid-cols-6"} gap-4 mb-8`}>
        {/* PTO cards — hidden for India */}
        {!isIndia && <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">PTO Accrual</p>
            <p className="text-2xl font-black text-[#003527]">
              {contractor.hireDate ? `${fmtBalance(calculatePtoBalance(contractor.hireDate))}h` : "—"}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">PTO Used</p>
            <p className="text-2xl font-black text-slate-700">0h</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl border border-emerald-200 shadow-sm px-5 py-4">
            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">PTO Available</p>
            <p className="text-2xl font-black text-emerald-700">
              {contractor.hireDate ? `${fmtBalance(roundBalance(Math.max(calculatePtoBalance(contractor.hireDate), 0)))}h` : "—"}
            </p>
          </div>
        </>}
        {/* Sick Leave Accrual */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Sick Leave Accrual</p>
          <p className="text-2xl font-black text-[#003527]">
            {contractor.hireDate ? `${fmtBalance(calculateSickLeaveBalance(contractor.hireDate))}h` : "—"}
          </p>
        </div>
        {/* Sick Leave Used */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Sick Leave Used</p>
          <p className="text-2xl font-black text-slate-700">0h</p>
        </div>
        {/* Sick Leave Available */}
        <div className="bg-amber-50 rounded-2xl border border-amber-200 shadow-sm px-5 py-4">
          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-1">Sick Leave Available</p>
          <p className="text-2xl font-black text-amber-700">
            {contractor.hireDate ? `${fmtBalance(roundBalance(Math.max(calculateSickLeaveBalance(contractor.hireDate), 0)))}h` : "—"}
          </p>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {actionError}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {["Name", "Start Date", "End Date", "Reason", ...(!isIndia ? ["PTO Available"] : []), "Sick Leave Available", "Status", "Action Status", "Action"].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentRequests.length === 0 ? (
                <tr>
                  <td colSpan={isIndia ? 8 : 9} className="px-5 py-16 text-center text-sm text-slate-400">
                    <LuClock size={28} className="mx-auto mb-2 text-slate-200" strokeWidth={1.5} />
                    No time-off requests found.
                  </td>
                </tr>
              ) : currentRequests.map((req) => {
                const status = effectiveStatus(req);
                const blocked = isIndia && !req.type.toLowerCase().includes("sick");
                return (
                  <tr key={req.id} className={`transition-colors ${blocked ? "opacity-40 bg-slate-50" : "hover:bg-slate-50"}`}>
                    <td className="px-5 py-4 text-sm font-semibold text-[#003527] whitespace-nowrap">{fullName}</td>
                    <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">{fmtDate(req.startDate)}</td>
                    <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">{fmtDate(req.endDate)}</td>
                    <td className="px-5 py-4 text-sm text-slate-500 max-w-xs">
                      <span className="line-clamp-2">{req.reason || "-"}</span>
                    </td>
                    {!isIndia && (
                      <td className="px-5 py-4 text-sm text-slate-700 whitespace-nowrap font-medium">
                        {contractor.hireDate ? `${fmtBalance(roundBalance(Math.max(calculatePtoBalance(contractor.hireDate), 0)))}h` : "-"}
                      </td>
                    )}
                    <td className="px-5 py-4 text-sm text-slate-700 whitespace-nowrap font-medium">
                      {contractor.hireDate ? `${fmtBalance(roundBalance(Math.max(calculateSickLeaveBalance(contractor.hireDate), 0)))}h` : "-"}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {(() => {
                        const ls = deriveLeaveStatus(req.type, req.durationDays);
                        return (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            ls === "PTO"                 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                            ls === "PTO Half Day"        ? "bg-emerald-50 text-emerald-600 border border-emerald-200" :
                            ls === "Sick Leave"          ? "bg-amber-50 text-amber-700 border border-amber-200"       :
                            ls === "Sick Leave Half Day" ? "bg-amber-50 text-amber-600 border border-amber-200"       :
                                                          "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}>
                            {ls}
                          </span>
                        );
                      })()}
                    </td>
                    {/* Action Status */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {status === "Approved" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <LuCircleCheck size={11} /> Approved
                        </span>
                      ) : status === "Declined" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                          <LuCircleX size={11} /> Declined
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-200">
                          <LuCircleDot size={11} /> Pending
                        </span>
                      )}
                    </td>
                    {/* Action buttons */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => decide(req.id, "Declined")}
                          disabled={blocked || updatingId === req.id}
                          className="px-4 py-1.5 bg-red-400 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                        >
                          Decline
                        </button>
                        <button
                          onClick={() => decide(req.id, "Approved")}
                          disabled={blocked || updatingId === req.id}
                          className="px-4 py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
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
                  {["Name", "Start Date", "End Date", "Reason", "Status", "Review"].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historicalRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center text-sm text-slate-400">
                      <LuClock size={28} className="mx-auto mb-2 text-slate-200" strokeWidth={1.5} />
                      No historical requests found.
                    </td>
                  </tr>
                ) : historicalRequests.map((req) => {
                  const ls = deriveLeaveStatus(req.type, req.durationDays);
                  const reviewStatus = effectiveStatus(req);
                  const blocked = isIndia && !req.type.toLowerCase().includes("sick");
                  return (
                    <tr key={req.id} className={`transition-colors ${blocked ? "opacity-40 bg-slate-50" : "hover:bg-slate-50"}`}>
                      <td className="px-5 py-4 text-sm font-semibold text-[#003527] whitespace-nowrap">{fullName}</td>
                      <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">{fmtDate(req.startDate)}</td>
                      <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">{fmtDate(req.endDate)}</td>
                      <td className="px-5 py-4 text-sm text-slate-500 max-w-xs">
                        <span className="line-clamp-2">{req.reason || "-"}</span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          ls === "PTO"                 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                          ls === "PTO Half Day"        ? "bg-emerald-50 text-emerald-600 border border-emerald-200" :
                          ls === "Sick Leave"          ? "bg-amber-50 text-amber-700 border border-amber-200"       :
                          ls === "Sick Leave Half Day" ? "bg-amber-50 text-amber-600 border border-amber-200"       :
                                                        "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}>
                          {ls}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          reviewStatus === "Approved" ? "bg-green-50 text-green-700 border border-green-200" :
                          reviewStatus === "Declined" ? "bg-red-50 text-red-600 border border-red-200"       :
                                                      "bg-amber-50 text-amber-600 border border-amber-200"
                        }`}>
                          {reviewStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
