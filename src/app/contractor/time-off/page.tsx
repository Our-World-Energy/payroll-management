"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  fetchContractorTimeOff, fetchLeaveRequests, fetchAllLeaveRequests,
  submitLeaveRequest, cancelLeaveRequest,
  type ContractorTimeOff, type LeaveRequest,
} from "./actions";
import { fmtBalance, HOURS_PER_DAY } from "@/lib/timeOffBalances";
import {
  LuLoader, LuClock, LuCircleCheck, LuUmbrella, LuStethoscope,
  LuCalendarDays, LuDownload, LuChevronRight, LuInfo, LuX, LuCircleAlert,
} from "react-icons/lu";

function fmtDays(hrs: number) {
  return fmtBalance(hrs / HOURS_PER_DAY);
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
  total, used, barUsed, barAvail, availColor, wide = false,
}: BalanceCardProps) {
  const available = Math.max(total - used, 0);
  const usedPct   = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const availPct  = 100 - usedPct;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 relative overflow-hidden group hover:border-emerald-200 transition-colors">
      <div className="absolute top-0 right-0 p-4 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity pointer-events-none select-none">
        <span style={{ fontSize: 80 }}>{icon}</span>
      </div>

      <div className={`flex items-center mb-6 ${wide ? "justify-start gap-4" : "justify-between"}`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${iconBg}`}>{icon}</div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${badgeBg} ${badgeText}`}>{badge}</span>
      </div>

      <div className={`grid gap-4 ${wide ? "grid-cols-3 lg:grid-cols-6" : "grid-cols-3"}`}>
        <div className={wide ? "lg:col-span-2" : ""}>
          <p className="text-slate-500 text-[10px] uppercase font-bold tracking-tight mb-1">Total Balance</p>
          <p className="text-2xl font-bold text-[#003527]">
            {fmtDays(total)} <span className="text-xs font-medium text-slate-400">days</span>
          </p>
        </div>
        <div className={wide ? "lg:col-span-2" : ""}>
          <p className="text-slate-500 text-[10px] uppercase font-bold tracking-tight mb-1">Used</p>
          <p className="text-2xl font-bold text-slate-700">
            {fmtDays(used)} <span className="text-xs font-medium text-slate-400">days</span>
          </p>
        </div>
        <div className={wide ? "lg:col-span-2" : ""}>
          <p className="text-slate-500 text-[10px] uppercase font-bold tracking-tight mb-1">Available</p>
          <p className={`text-3xl font-black ${availColor}`}>
            {fmtDays(available)} <span className="text-sm font-medium text-slate-400">days</span>
          </p>
        </div>
      </div>

      <div className="mt-6 w-full h-2 rounded-full overflow-hidden flex">
        <div className={`h-full ${barUsed}`}   style={{ width: `${usedPct}%`  }} />
        <div className={`h-full ${barAvail}`}  style={{ width: `${availPct}%` }} />
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

  const [tab,       setTab]       = useState<"pto" | "sick">("pto");
  const [startDate, setStartDate] = useState("");
  const [endDate,   setEndDate]   = useState("");
  const [isHalfDay, setIsHalfDay] = useState(false);
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
      if (profileCountry === "india") setTab("sick");
      setLoading(false);
    })();
  }, [router, loadRequests]);

  const estimatedDays = (() => {
    if (isHalfDay) return startDate ? 0.5 : null;
    if (!startDate || !endDate) return null;
    const s = new Date(startDate), e = new Date(endDate);
    if (e < s) return null;
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  })();

  function handleSubmit() {
    if (!startDate) { setFormError("Start date is required."); return; }
    if (!isHalfDay && !endDate) { setFormError("End date is required."); return; }
    if (!isHalfDay && new Date(endDate) < new Date(startDate)) { setFormError("End date must be on or after start date."); return; }
    setFormError(""); setSuccess("");

    const baseType = tab === "pto" ? "PTO" : "Sick Leave";

    startTransition(async () => {
      const result = await submitLeaveRequest({
        email,
        type:         isHalfDay ? `${baseType} Half Day` : baseType,
        startDate,
        endDate:      isHalfDay ? startDate : endDate,
        durationDays: estimatedDays ?? 1,
        reason,
      });
      if (!result.ok) {
        setFormError(result.error ?? "Failed to submit request.");
        return;
      }
      setSuccess("Request submitted successfully!");
      setStartDate(""); setEndDate(""); setIsHalfDay(false); setReason("");
      await loadRequests(email);
    });
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl font-bold text-[#003527] tracking-tight" style={{ letterSpacing: "-0.02em" }}>
            Time-Off Management
          </h2>
          <p className="text-slate-600 mt-1">Track and manage your leave requests and balances.</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <LuClock size={13} strokeWidth={2} />
          Last updated: {now}
        </div>
      </div>

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
          title="Sick Leave"
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
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Form */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-slate-100">
            <nav className="flex px-6">
              {(["pto", "sick"] as const).filter(t => !(t === "pto" && isPtoHidden)).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setFormError(""); setSuccess(""); }}
                  className={[
                    "px-6 py-4 text-sm font-semibold border-b-2 transition-colors",
                    tab === t
                      ? "border-emerald-700 text-emerald-900"
                      : "border-transparent text-slate-400 hover:text-emerald-700",
                  ].join(" ")}
                >
                  {t === "pto" ? "Request PTO" : "Request Sick Leave"}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6 space-y-6">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 block">Start Date</label>
                <div className="relative">
                  <LuCalendarDays size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={1.75} />
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className={INPUT + " pl-9"}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 block">End Date</label>
                <div className="relative">
                  <LuCalendarDays size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={1.75} />
                  <input
                    type="date"
                    value={isHalfDay ? startDate : endDate}
                    onChange={e => setEndDate(e.target.value)}
                    disabled={isHalfDay}
                    className={INPUT + " pl-9 disabled:bg-slate-50 disabled:text-slate-400"}
                  />
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 select-none">
              <input
                type="checkbox"
                checked={isHalfDay}
                onChange={e => setIsHalfDay(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-emerald-700 cursor-pointer"
              />
              Half day request (4 hours)
            </label>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 block">Reason for request</label>
              <textarea
                rows={4}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Briefly describe the reason for your time off..."
                className={INPUT + " resize-none"}
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <LuInfo size={14} strokeWidth={1.75} />
                Estimated duration:{" "}
                <span className="font-bold text-slate-700">
                  {estimatedDays === null ? "-- days" : isHalfDay ? "Half day" : `${estimatedDays} day${estimatedDays !== 1 ? "s" : ""}`}
                </span>
              </div>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="bg-[#003527] hover:opacity-90 active:scale-95 text-white font-bold px-8 py-3 rounded-lg transition-all shadow-md text-sm flex items-center gap-2 disabled:opacity-60"
              >
                {isPending && <LuLoader size={14} className="animate-spin" />}
                {isPending ? "Submitting…" : "Submit Request"}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Policy */}
          <div className="bg-[#064e3b] text-white rounded-xl p-6 shadow-sm">
            <h4 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <LuCircleCheck size={20} strokeWidth={1.75} />
              Policy Reminder
            </h4>
            <ul className="space-y-3 text-sm opacity-90">
              {[
                "PTO requests must be submitted at least 2 weeks in advance.",
                "Sick leave requires a medical certificate if longer than 3 days.",
                "A maximum of 5 days can carry over to the next year.",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <LuCircleCheck size={13} className="shrink-0 mt-0.5 opacity-70" strokeWidth={2} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Actions */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h4 className="text-xs font-bold mb-4 uppercase text-slate-400 tracking-widest">Quick Actions</h4>
            <div className="space-y-3">
              <button className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700">
                Download Policy Handbook
                <LuDownload size={18} className="text-emerald-700" strokeWidth={1.75} />
              </button>
              <button
                onClick={() => router.push("/contractor/holidays")}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700"
              >
                View Holiday Calendar
                <LuCalendarDays size={18} className="text-emerald-700" strokeWidth={1.75} />
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

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
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
                            <span className="text-sm font-semibold text-slate-800">{row.type}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">
                          {fmtDateRange(row.startDate, row.endDate)}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-800 whitespace-nowrap">
                          {row.type.endsWith("Half Day") ? "Half day" : `${row.durationDays} day${row.durationDays !== 1 ? "s" : ""}`}
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
                              <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">{row.type}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">
                            {new Date(row.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">
                            {new Date(row.endDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-5 py-4 text-sm font-semibold text-slate-800 whitespace-nowrap">
                            {row.type.endsWith("Half Day") ? "Half day" : `${row.durationDays} day${row.durationDays !== 1 ? "s" : ""}`}
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
