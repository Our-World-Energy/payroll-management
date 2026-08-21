"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  fetchContractorTimeOff, fetchLeaveRequests, fetchAllLeaveRequests,
  submitLeaveRequest, cancelLeaveRequest,
  type ContractorTimeOff, type LeaveRequest,
} from "./actions";
import { HOURS_PER_DAY, leaveTypeDisplayLabel } from "@/lib/timeOffBalances";
import {
  LuLoader, LuClock, LuCircleCheck, LuUmbrella, LuStethoscope,
  LuChevronRight, LuChevronDown, LuInfo, LuX, LuCircleAlert,
  LuClipboardList, LuSend, LuCalendarDays,
} from "react-icons/lu";
import { PageHeader, HeaderChip, ProgressRing } from "../_components/portal";

function fmtHoursMinutes(hrs: number): string {
  const totalMins = Math.round(hrs * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// A leave request's duration in hours: half-day types are a fixed 4h; full-day
// types are the selected calendar span × the 8h standard day.
function fmtRequestHours(type: string, durationDays: number): string {
  if (type.endsWith("Half Day")) return "4h";
  return fmtHoursMinutes(durationDays * HOURS_PER_DAY);
}

function fmtDateRange(start: string, end: string) {
  const fmt = (s: string) => {
    const d = new Date(s + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  if (start === end) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

type BalanceCardProps = {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  badge: string;
  badgeBg: string;
  badgeText: string;
  total: number;
  used: number;
  barUsed: string;
  barAvail: string;
  availColor: string;
  wide?: boolean;
};

function BalanceCard({
  icon, iconBg, title, badge, badgeBg, badgeText,
  total, used, barUsed, barAvail, availColor,
}: BalanceCardProps) {
  const available = Math.max(total - used, 0);
  const usedPct   = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const availPct  = 100 - usedPct;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`grid place-items-center w-10 h-10 rounded-xl ${iconBg}`}>{icon}</div>
          <h3 className="text-sm font-bold text-[#003527]">{title}</h3>
        </div>
        <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${badgeBg} ${badgeText}`}>{badge}</span>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative grid place-items-center shrink-0">
          <ProgressRing pct={availPct} size={96} stroke={8} />
          <div className="absolute text-center leading-none">
            <span className={`block text-lg font-bold tabular-nums ${availColor}`}>{Math.round(availPct)}%</span>
            <span className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">left</span>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-1">Total</p>
            <p className="text-xl font-bold text-[#003527] tabular-nums">{fmtHoursMinutes(total)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-1">Used</p>
            <p className="text-xl font-bold text-slate-700 tabular-nums">{fmtHoursMinutes(used)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-1">Available</p>
            <p className={`text-xl font-bold tabular-nums ${availColor}`}>{fmtHoursMinutes(available)}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 w-full h-2 rounded-full overflow-hidden flex bg-slate-100">
        <div className={`h-full ${barUsed}`}  style={{ width: `${usedPct}%`  }} />
        <div className={`h-full ${barAvail}`} style={{ width: `${availPct}%` }} />
      </div>
    </div>
  );
}

const INPUT = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 transition-all bg-white";

function statusStyle(status: string) {
  if (status === "Approved") return "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (status === "Rejected") return "bg-red-50 text-red-600 border-red-100";
  return "bg-amber-50 text-amber-700 border-amber-100";
}

export default function ContractorTimeOffPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [data,     setData]     = useState<ContractorTimeOff | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  const [showHistory,    setShowHistory]    = useState(false);
  const [allRequests,    setAllRequests]    = useState<LeaveRequest[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const ALL_LEAVE_TYPES    = ["PTO", "PTO Half Day", "Sick Leave", "Sick Leave Half Day"] as const;
  const INDIA_LEAVE_TYPES  = ["Sick Leave", "Sick Leave Half Day"] as const;

  const [leaveType, setLeaveType] = useState<typeof ALL_LEAVE_TYPES[number]>("PTO");
  const [startDate, setStartDate] = useState("");
  const [endDate,   setEndDate]   = useState("");
  const [reason,    setReason]    = useState("");
  const [formError, setFormError] = useState("");
  const [success,   setSuccess]   = useState("");
  const [isPending, startTransition] = useTransition();

  const loadRequests = useCallback(async (userEmail: string) => {
    const reqs = await fetchLeaveRequests(userEmail);
    setRequests(reqs);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) { router.replace("/login"); return; }
      const userEmail = session.user.email;
      setEmail(userEmail);
      const [profile] = await Promise.all([
        fetchContractorTimeOff(userEmail),
        loadRequests(userEmail),
      ]);
      if (!profile) { setError("Profile not found."); setLoading(false); return; }
      setData(profile);
      // India contractors don't have PTO — default to sick leave tab
      const profileCountry = profile.location?.split(",").pop()?.trim().toLowerCase() ?? "";
      if (profileCountry === "india") setLeaveType("Sick Leave");
      setLoading(false);
    })();
  }, [router, loadRequests]);

  const isHalfDay = leaveType.endsWith("Half Day");

  const estimatedDays = (() => {
    if (isHalfDay) return startDate ? 0.5 : null;
    if (!startDate || !endDate) return null;
    const s = new Date(startDate), e = new Date(endDate);
    if (e < s) return null;
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  })();

  // DB durationDays is Int — half day is stored as 1; the type field ("* Half Day") already encodes it
  const durationDaysForDB = isHalfDay ? 1 : (estimatedDays ?? 1);

  function handleSubmit() {
    if (!startDate) { setFormError("Start date is required."); return; }
    if (!isHalfDay && !endDate) { setFormError("End date is required."); return; }
    if (!isHalfDay && new Date(endDate) < new Date(startDate)) { setFormError("End date must be on or after start date."); return; }
    setFormError(""); setSuccess("");

    startTransition(async () => {
      const result = await submitLeaveRequest({
        email,
        type:         leaveType,
        startDate,
        endDate:      isHalfDay ? startDate : endDate,
        durationDays: durationDaysForDB,
        reason,
      });
      if (!result.ok) {
        setFormError(result.error ?? "Failed to submit request.");
        return;
      }
      setSuccess("Request submitted successfully!");
      setStartDate(""); setEndDate(""); setReason("");
      await loadRequests(email);
    });
  }

  function handleClear() {
    setStartDate(""); setEndDate(""); setReason("");
    setFormError(""); setSuccess("");
  }

  async function handleOpenHistory() {
    setShowHistory(true);
    setHistoryLoading(true);
    const all = await fetchAllLeaveRequests(email);
    setAllRequests(all);
    setHistoryLoading(false);
  }

  async function handleCancel(id: string) {
    const result = await cancelLeaveRequest(id, email);
    if (result.ok) {
      setRequests((prev) => prev.filter((r) => r.id !== id));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LuLoader size={28} className="text-slate-300 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-sm">
        {error || "Unable to load time-off data."}
      </div>
    );
  }

  const now = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // location stored as "State, Country" — extract last segment
  const country = data.location
    ? data.location.split(",").pop()?.trim() ?? ""
    : "";
  const isPtoHidden = country.toLowerCase() === "india";

  return (
    <div className="space-y-8">
      {/* Page title */}
      <PageHeader
        title="Time Away Management"
        subtitle="Track and manage your leave requests and balances."
        right={
          <HeaderChip icon={<LuClock size={13} strokeWidth={2} className="text-emerald-600" />}>
            Last updated: {now}
          </HeaderChip>
        }
      />

      {/* Balance cards */}
      <section className={isPtoHidden ? "grid grid-cols-1 gap-6" : "grid grid-cols-1 lg:grid-cols-2 gap-6"}>
        {!isPtoHidden && (
          <BalanceCard
            icon={<LuUmbrella size={20} strokeWidth={1.75} />}
            iconBg="bg-emerald-100 text-emerald-900"
            title="Paid Time Off (PTO)"
            badge="Active Cycle"
            badgeBg="bg-emerald-50"
            badgeText="text-emerald-700"
            total={data.ptoBalance}
            used={data.ptoUsed}
            barUsed="bg-emerald-700"
            barAvail="bg-emerald-200"
            availColor="text-emerald-700"
          />
        )}
        <BalanceCard
          icon={<LuStethoscope size={20} strokeWidth={1.75} />}
          iconBg="bg-teal-100 text-teal-700"
          title="Medical Unavailability"
          badge="Renewal Dec 31"
          badgeBg="bg-slate-50"
          badgeText="text-slate-500"
          total={data.sickLeaveBalance}
          used={data.sickLeaveUsed}
          barUsed="bg-teal-600"
          barAvail="bg-teal-200"
          availColor="text-teal-700"
          wide={isPtoHidden}
        />
      </section>

      {/* Request form + policy */}
      <section className="grid grid-cols-1 gap-8">
        {/* Form */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="border-b border-slate-100 px-6 py-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center shrink-0">
              <LuClipboardList size={19} strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#003527]">Apply for Leave</h3>
              <p className="text-xs text-slate-400 mt-0.5">Submit a request for time away. All fields are required.</p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Success banner */}
            {success && (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700 font-medium">
                <LuCircleCheck size={16} strokeWidth={2} />
                {success}
              </div>
            )}

            {/* Error banner */}
            {formError && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 font-medium">
                <LuCircleAlert size={16} strokeWidth={2} />
                {formError}
              </div>
            )}

            {/* Leave Type */}
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2">1. Leave Type</label>
              <div className="relative">
                <LuCalendarDays size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none" />
                <select
                  value={leaveType}
                  onChange={(e) => { setLeaveType(e.target.value as typeof ALL_LEAVE_TYPES[number]); setFormError(""); setSuccess(""); }}
                  className="w-full appearance-none text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg pl-9 pr-9 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  {(isPtoHidden ? INDIA_LEAVE_TYPES : ALL_LEAVE_TYPES).map((t) => (
                    <option key={t} value={t}>{leaveTypeDisplayLabel(t)}</option>
                  ))}
                </select>
                <LuChevronDown size={16} strokeWidth={2} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">2. Start Date</label>
                <div className="relative">
                  <LuCalendarDays size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">3. End Date</label>
                <div className="relative">
                  <LuCalendarDays size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none" />
                  <input
                    type="date"
                    value={isHalfDay ? startDate : endDate}
                    onChange={e => setEndDate(e.target.value)}
                    disabled={isHalfDay}
                    className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2">4. Reason for Request</label>
              <textarea
                rows={3}
                maxLength={500}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Briefly describe the reason for your time off..."
                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
              />
              <p className="text-right text-xs text-slate-400 mt-1">{reason.length} / 500</p>
            </div>

            {/* Note */}
            <div className="flex items-start gap-3 bg-emerald-50/70 border border-emerald-100 rounded-xl px-4 py-3.5">
              <LuInfo size={16} strokeWidth={1.75} className="text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-800">Note</p>
                <p className="text-xs text-emerald-700/80 mt-0.5">Ensure your balance is sufficient before submitting your request.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                onClick={handleClear}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                <LuX size={15} strokeWidth={2} /> Clear
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold px-6 py-2.5 rounded-lg transition-all shadow-sm text-sm flex items-center gap-2 disabled:opacity-60"
              >
                {isPending ? <LuLoader size={15} className="animate-spin" /> : <LuSend size={15} strokeWidth={2} />}
                {isPending ? "Submitting…" : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Recent requests */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-semibold text-[#003527]">Recent Requests</h3>
          <button
            onClick={handleOpenHistory}
            className="text-emerald-700 text-sm font-semibold flex items-center gap-1 hover:underline"
          >
            View All History <LuChevronRight size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Type", "Dates", "Duration", "Reason", "Status"].map(h => (
                    <th key={h} className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                  <th className="px-6 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400">
                      No requests yet. Submit your first request above.
                    </td>
                  </tr>
                ) : (
                  requests.map((row) => {
                    const isPto = row.type.startsWith("PTO");
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${isPto ? "bg-emerald-50 text-emerald-700" : "bg-teal-50 text-teal-700"}`}>
                              {isPto
                                ? <LuUmbrella size={15} strokeWidth={1.75} />
                                : <LuStethoscope size={15} strokeWidth={1.75} />
                              }
                            </div>
                            <span className="text-sm font-semibold text-slate-800">{leaveTypeDisplayLabel(row.type)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">
                          {fmtDateRange(row.startDate, row.endDate)}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-800 whitespace-nowrap">
                          {fmtRequestHours(row.type, row.durationDays)}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-400 italic max-w-[180px] truncate">
                          {row.reason || "—"}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusStyle(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                          {row.status === "Pending" && (
                            <button
                              onClick={() => handleCancel(row.id)}
                              title="Cancel request"
                              className="text-slate-300 hover:text-red-400 transition-colors"
                            >
                              <LuX size={15} strokeWidth={2} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── History Modal ── */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowHistory(false)}
          />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-[#003527]">Leave Request History</h2>
                <p className="text-xs text-slate-400 mt-0.5">All time-off requests submitted through the portal</p>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <LuX size={18} strokeWidth={2} />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-auto flex-1">
              {historyLoading ? (
                <div className="flex items-center justify-center py-20">
                  <LuLoader size={26} className="text-slate-300 animate-spin" />
                </div>
              ) : allRequests.length === 0 ? (
                <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
                  No leave requests found.
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr className="border-b border-slate-100">
                      {["#", "Type", "Start Date", "End Date", "Duration", "Reason", "Submitted On", "Status"].map(h => (
                        <th key={h} className="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {allRequests.map((row, i) => {
                      const isPto = row.type.startsWith("PTO");
                      const submittedOn = new Date(row.createdAt).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      });
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-5 py-4 text-xs text-slate-400 font-medium">{i + 1}</td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded-lg ${isPto ? "bg-emerald-50 text-emerald-700" : "bg-teal-50 text-teal-700"}`}>
                                {isPto
                                  ? <LuUmbrella size={13} strokeWidth={1.75} />
                                  : <LuStethoscope size={13} strokeWidth={1.75} />
                                }
                              </div>
                              <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">{leaveTypeDisplayLabel(row.type)}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">
                            {new Date(row.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">
                            {new Date(row.endDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-5 py-4 text-sm font-semibold text-slate-800 whitespace-nowrap">
                            {fmtRequestHours(row.type, row.durationDays)}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-400 italic max-w-[200px]">
                            <span className="block truncate" title={row.reason}>{row.reason || "—"}</span>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap">{submittedOn}</td>
                          <td className="px-5 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusStyle(row.status)}`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex items-center justify-between bg-slate-50/50">
              <p className="text-xs text-slate-400">
                {allRequests.length} request{allRequests.length !== 1 ? "s" : ""} total
              </p>
              <button
                onClick={() => setShowHistory(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
