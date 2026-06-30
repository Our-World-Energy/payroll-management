"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchContractorTimeOff, type ContractorTimeOff } from "./actions";
import { fmtBalance, HOURS_PER_DAY } from "@/lib/timeOffBalances";
import {
  LuLoader, LuClock, LuCircleCheck, LuUmbrella, LuStethoscope,
  LuCalendarDays, LuDownload, LuChevronRight, LuInfo,
} from "react-icons/lu";

function fmtDays(hrs: number) {
  return fmtBalance(hrs / HOURS_PER_DAY);
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
};

function BalanceCard({
  icon, iconBg, title, badge, badgeBg, badgeText,
  total, used, barUsed, barAvail, availColor,
}: BalanceCardProps) {
  const available = Math.max(total - used, 0);
  const usedPct   = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const availPct  = 100 - usedPct;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 relative overflow-hidden group hover:border-emerald-200 transition-colors">
      {/* watermark icon */}
      <div className="absolute top-0 right-0 p-4 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity pointer-events-none select-none">
        <span style={{ fontSize: 80 }}>{icon}</span>
      </div>

      {/* header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${iconBg}`}>{icon}</div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${badgeBg} ${badgeText}`}>{badge}</span>
      </div>

      {/* numbers */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-slate-500 text-[10px] uppercase font-bold tracking-tight mb-1">Total Balance</p>
          <p className="text-2xl font-bold text-[#003527]">
            {fmtDays(total)} <span className="text-xs font-medium text-slate-400">days</span>
          </p>
        </div>
        <div>
          <p className="text-slate-500 text-[10px] uppercase font-bold tracking-tight mb-1">Used</p>
          <p className="text-2xl font-bold text-slate-700">
            {fmtDays(used)} <span className="text-xs font-medium text-slate-400">days</span>
          </p>
        </div>
        <div>
          <p className="text-slate-500 text-[10px] uppercase font-bold tracking-tight mb-1">Available</p>
          <p className={`text-3xl font-black ${availColor}`}>
            {fmtDays(available)} <span className="text-sm font-medium text-slate-400">days</span>
          </p>
        </div>
      </div>

      {/* two-segment progress bar */}
      <div className="mt-6 w-full h-2 rounded-full overflow-hidden flex">
        <div className={`h-full ${barUsed}`}   style={{ width: `${usedPct}%`  }} />
        <div className={`h-full ${barAvail}`}  style={{ width: `${availPct}%` }} />
      </div>
    </div>
  );
}

const INPUT = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 transition-all bg-white";

export default function ContractorTimeOffPage() {
  const router = useRouter();
  const [data,    setData]    = useState<ContractorTimeOff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [tab,     setTab]     = useState<"pto" | "sick">("pto");
  const [startDate, setStartDate] = useState("");
  const [endDate,   setEndDate]   = useState("");
  const [reason,    setReason]    = useState("");

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) { router.replace("/login"); return; }
      const profile = await fetchContractorTimeOff(session.user.email);
      if (!profile) { setError("Profile not found."); setLoading(false); return; }
      setData(profile);
      setLoading(false);
    })();
  }, [router]);

  const estimatedDays = (() => {
    if (!startDate || !endDate) return null;
    const s = new Date(startDate), e = new Date(endDate);
    if (e < s) return null;
    const diff = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    return diff;
  })();

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

  const ptoTotal   = data.ptoBalance;
  const sickTotal  = data.sickLeaveBalance;

  const now = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

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
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BalanceCard
          icon={<LuUmbrella size={20} strokeWidth={1.75} />}
          iconBg="bg-emerald-100 text-emerald-900"
          title="Paid Time Off (PTO)"
          badge="Active Cycle"
          badgeBg="bg-emerald-50"
          badgeText="text-emerald-700"
          total={ptoTotal}
          used={data.ptoUsed}
          barUsed="bg-emerald-700"
          barAvail="bg-emerald-200"
          availColor="text-emerald-700"
        />
        <BalanceCard
          icon={<LuStethoscope size={20} strokeWidth={1.75} />}
          iconBg="bg-teal-100 text-teal-700"
          title="Sick Leave"
          badge="Renewal Dec 31"
          badgeBg="bg-slate-50"
          badgeText="text-slate-500"
          total={sickTotal}
          used={data.sickLeaveUsed}
          barUsed="bg-teal-600"
          barAvail="bg-teal-200"
          availColor="text-teal-700"
        />
      </section>

      {/* Request form + policy */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Form */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-slate-100">
            <nav className="flex px-6">
              {(["pto", "sick"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
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
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className={INPUT + " pl-9"}
                  />
                </div>
              </div>
            </div>

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
                  {estimatedDays !== null ? `${estimatedDays} day${estimatedDays !== 1 ? "s" : ""}` : "-- days"}
                </span>
              </div>
              <button className="bg-[#003527] hover:opacity-90 active:scale-95 text-white font-bold px-8 py-3 rounded-lg transition-all shadow-md text-sm">
                Submit Request
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Policy */}
          <div className="bg-brand-900 text-white rounded-xl p-6 shadow-sm">
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
          <button className="text-emerald-700 text-sm font-semibold flex items-center gap-1 hover:underline">
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
                {/* placeholder rows — will be replaced with real data later */}
                {[
                  { type: "PTO",        icon: <LuUmbrella size={15} strokeWidth={1.75} />, iconBg: "bg-emerald-50 text-emerald-700", dates: "Nov 15 – Nov 20, 2023", duration: "5 Days", reason: "Family Vacation",  status: "Pending",  statusBg: "bg-amber-50 text-amber-700 border-amber-100"   },
                  { type: "Sick Leave", icon: <LuStethoscope size={15} strokeWidth={1.75} />, iconBg: "bg-teal-50 text-teal-700",     dates: "Oct 12 – Oct 13, 2023", duration: "2 Days", reason: "Seasonal Flu",    status: "Approved", statusBg: "bg-emerald-50 text-emerald-700 border-emerald-100" },
                  { type: "PTO",        icon: <LuUmbrella size={15} strokeWidth={1.75} />, iconBg: "bg-emerald-50 text-emerald-700", dates: "Aug 01 – Aug 05, 2023", duration: "5 Days", reason: "Home Renovation", status: "Approved", statusBg: "bg-emerald-50 text-emerald-700 border-emerald-100" },
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${row.iconBg}`}>{row.icon}</div>
                        <span className="text-sm font-semibold text-slate-800">{row.type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{row.dates}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-800">{row.duration}</td>
                    <td className="px-6 py-4 text-sm text-slate-400 italic">{row.reason}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${row.statusBg}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="text-slate-300 hover:text-red-400 transition-colors">
                        <span className="text-xs">✕</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
