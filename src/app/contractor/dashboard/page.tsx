"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchContractorProfileByEmail, type ContractorProfile } from "../profile/actions";
import { fetchContractorTimeOff, type ContractorTimeOff } from "../time-off/actions";
import { fetchHolidays, type Holiday } from "@/app/admin/holidays/actions";
import { fmtBalance, HOURS_PER_DAY } from "@/lib/timeOffBalances";
import {
  LuCalendarDays, LuClock, LuUmbrella, LuStethoscope,
  LuChevronRight, LuLoader, LuFlag, LuShieldCheck,
  LuArrowRight, LuBriefcase, LuMapPin,
} from "react-icons/lu";

const COUNTRY_FLAG: Record<string, string> = {
  "United States": "🇺🇸",
  "India":         "🇮🇳",
  "Mexico":        "🇲🇽",
  "Philippines":   "🇵🇭",
  "Global":        "🌍",
};

const COUNTRY_CODE: Record<string, string> = {
  "United States": "US",
  "India":         "IN",
  "Mexico":        "MX",
  "Philippines":   "PH",
  "Global":        "GL",
};

const COUNTRY_BG: Record<string, string> = {
  "United States": "bg-blue-100 text-blue-700",
  "India":         "bg-orange-100 text-orange-700",
  "Mexico":        "bg-emerald-100 text-emerald-700",
  "Philippines":   "bg-teal-100 text-teal-700",
  "Global":        "bg-purple-100 text-purple-700",
};

function fmtHireDate(dateStr: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function fmtDays(hrs: number) {
  return fmtBalance(hrs / HOURS_PER_DAY);
}

const ANNOUNCEMENTS = [
  {
    icon: "🛡️",
    iconBg: "bg-red-50",
    title: "Safety Protocol Update",
    body: "Revised safety procedures for high-voltage equipment maintenance are now effective.",
    time: "2 hours ago",
  },
  {
    icon: "📅",
    iconBg: "bg-teal-50",
    title: "New Maintenance Schedule",
    body: "The Q4 maintenance calendar for wind farm sectors A-D has been published.",
    time: "Yesterday",
  },
  {
    icon: "👥",
    iconBg: "bg-emerald-50",
    title: "Quarterly Town Hall",
    body: "Join us for the quarterly progress report and future roadmap discussion.",
    time: "3 days ago",
  },
];

export default function ContractorDashboardPage() {
  const router = useRouter();

  const [profile,   setProfile]   = useState<ContractorProfile | null>(null);
  const [timeOff,   setTimeOff]   = useState<ContractorTimeOff | null>(null);
  const [holidays,  setHolidays]  = useState<Holiday[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) { router.replace("/login"); return; }
      const email = session.user.email;

      const [prof, to, hols] = await Promise.all([
        fetchContractorProfileByEmail(email),
        fetchContractorTimeOff(email),
        fetchHolidays(),
      ]);

      setProfile(prof);
      setTimeOff(to);

      // Show next 4 upcoming holidays for their country
      const country = prof?.location?.split(",").pop()?.trim() ?? "";
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = hols
        .filter((h) => h.date >= today && (h.country === country || h.country === "Global" || h.country === "United States"))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4);
      setHolidays(upcoming);

      setLoading(false);
    })();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LuLoader size={28} className="text-slate-300 animate-spin" />
      </div>
    );
  }

  const firstName = profile?.firstName || profile?.fullName?.split(" ")[0] || "there";
  const country   = profile?.location?.split(",").pop()?.trim() ?? "";
  const isPtoHidden = country.toLowerCase() === "india";

  const ptoBalance       = timeOff?.ptoBalance       ?? 0;
  const ptoUsed          = timeOff?.ptoUsed          ?? 0;
  const ptoAvailable     = Math.max(ptoBalance - ptoUsed, 0);
  const sickBalance      = timeOff?.sickLeaveBalance ?? 0;
  const sickUsed         = timeOff?.sickLeaveUsed    ?? 0;
  const sickAvailable    = Math.max(sickBalance - sickUsed, 0);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">

      {/* ── Welcome ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-[#003527] tracking-tight" style={{ letterSpacing: "-0.02em" }}>
            {greeting}, {firstName}.
          </h1>
          <p className="text-slate-600 mt-1 text-lg">Ready to power the future today?</p>
        </div>
        {profile?.status === "Active" && (
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 rounded-lg text-sm font-semibold">
            <LuShieldCheck size={16} strokeWidth={2} />
            Active Contractor
          </div>
        )}
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Profile / ID card */}
        <div className="md:col-span-1 bg-[#003527] rounded-2xl p-6 text-white flex flex-col justify-between min-h-[160px] shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Contractor ID</span>
            <LuBriefcase size={20} className="text-white/40" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-2xl font-black leading-tight">{profile?.contractorId || "—"}</p>
            <p className="text-sm text-white/60 mt-1">{profile?.department || "—"} · {profile?.role || "—"}</p>
          </div>
        </div>

        {/* Hire Date */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between min-h-[160px] shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Hire Date</span>
            <LuCalendarDays size={20} className="text-[#003527]/40" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-2xl font-black text-[#003527] leading-tight">{fmtHireDate(profile?.hireDate ?? "")}</p>
            <p className="text-sm text-slate-400 mt-1">Member since</p>
          </div>
        </div>

        {/* Location */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between min-h-[160px] shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Location</span>
            <LuMapPin size={20} className="text-[#003527]/40" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-2xl font-black text-[#003527] leading-tight">{country || "—"}</p>
            <p className="text-sm text-slate-400 mt-1">{profile?.location || "—"}</p>
          </div>
        </div>
      </div>

      {/* ── Leave Balance Cards ── */}
      <div className={`grid gap-4 ${isPtoHidden ? "grid-cols-1 md:grid-cols-1 max-w-sm" : "grid-cols-1 md:grid-cols-2"}`}>
        {!isPtoHidden && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
                  <LuUmbrella size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Paid Time Off (PTO)</p>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Active Cycle</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] uppercase font-bold tracking-tight text-slate-400 mb-1">Balance</p>
                <p className="text-2xl font-bold text-[#003527]">{fmtDays(ptoBalance)}<span className="text-xs font-medium text-slate-400 ml-1">days</span></p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold tracking-tight text-slate-400 mb-1">Used</p>
                <p className="text-2xl font-bold text-slate-700">{fmtDays(ptoUsed)}<span className="text-xs font-medium text-slate-400 ml-1">days</span></p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold tracking-tight text-slate-400 mb-1">Available</p>
                <p className="text-2xl font-black text-emerald-700">{fmtDays(ptoAvailable)}<span className="text-sm font-medium text-slate-400 ml-1">days</span></p>
              </div>
            </div>
            <div className="mt-4 w-full h-2 rounded-full overflow-hidden flex bg-slate-100">
              <div className="h-full bg-emerald-700" style={{ width: ptoBalance > 0 ? `${Math.min((ptoUsed / ptoBalance) * 100, 100)}%` : "0%" }} />
              <div className="h-full bg-emerald-200" style={{ width: ptoBalance > 0 ? `${Math.min((ptoAvailable / ptoBalance) * 100, 100)}%` : "100%" }} />
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-teal-100 text-teal-700">
                <LuStethoscope size={18} strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Sick Leave</p>
                <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Renewal Dec 31</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] uppercase font-bold tracking-tight text-slate-400 mb-1">Balance</p>
              <p className="text-2xl font-bold text-[#003527]">{fmtDays(sickBalance)}<span className="text-xs font-medium text-slate-400 ml-1">days</span></p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-tight text-slate-400 mb-1">Used</p>
              <p className="text-2xl font-bold text-slate-700">{fmtDays(sickUsed)}<span className="text-xs font-medium text-slate-400 ml-1">days</span></p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-tight text-slate-400 mb-1">Available</p>
              <p className="text-2xl font-black text-teal-700">{fmtDays(sickAvailable)}<span className="text-sm font-medium text-slate-400 ml-1">days</span></p>
            </div>
          </div>
          <div className="mt-4 w-full h-2 rounded-full overflow-hidden flex bg-slate-100">
            <div className="h-full bg-teal-600" style={{ width: sickBalance > 0 ? `${Math.min((sickUsed / sickBalance) * 100, 100)}%` : "0%" }} />
            <div className="h-full bg-teal-200" style={{ width: sickBalance > 0 ? `${Math.min((sickAvailable / sickBalance) * 100, 100)}%` : "100%" }} />
          </div>
        </div>
      </div>

      {/* ── Announcements + Holidays ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Announcements — left 2/3 */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-2xl font-semibold text-[#003527]">Offshore Announcements</h3>
            <button className="text-emerald-700 text-sm font-semibold flex items-center gap-1 hover:underline">
              View All <LuChevronRight size={16} strokeWidth={2} />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-50">
              {ANNOUNCEMENTS.map((a, i) => (
                <div key={i} className="flex gap-4 p-5 hover:bg-slate-50 transition-colors">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0 ${a.iconBg}`}>
                    {a.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="text-sm font-semibold text-[#003527]">{a.title}</h4>
                      <span className="text-xs text-slate-400 shrink-0">{a.time}</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{a.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-6">

          {/* Upcoming Holidays */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Upcoming Holidays</h4>
            {holidays.length === 0 ? (
              <p className="text-sm text-slate-400">No upcoming holidays.</p>
            ) : (
              <div className="space-y-3">
                {holidays.map((h, i) => {
                  const code = COUNTRY_CODE[h.country] ?? h.country.slice(0, 2).toUpperCase();
                  const colorCls = COUNTRY_BG[h.country] ?? "bg-slate-100 text-slate-600";
                  const date = new Date(h.date + "T00:00:00").toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric",
                  });
                  return (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${i === 0 ? "bg-slate-50 border border-slate-100" : ""}`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${colorCls}`}>
                        {code}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#003527]">{h.name}</p>
                        <p className="text-xs text-slate-400">{date}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Link href="/contractor/holidays" className="mt-4 flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">
              View full calendar <LuArrowRight size={13} strokeWidth={2} />
            </Link>
          </div>

          {/* Quick Links */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Quick Actions</h4>
            <div className="space-y-2">
              <Link href="/contractor/time-off" className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700">
                Request Time Off
                <LuUmbrella size={17} className="text-emerald-700" strokeWidth={1.75} />
              </Link>
              <Link href="/contractor/holidays" className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700">
                View Holiday Calendar
                <LuCalendarDays size={17} className="text-emerald-700" strokeWidth={1.75} />
              </Link>
              <Link href="/contractor/profile" className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700">
                View My Profile
                <LuArrowRight size={17} className="text-emerald-700" strokeWidth={1.75} />
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
