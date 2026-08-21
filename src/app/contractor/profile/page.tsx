"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchContractorProfileByEmail, type ContractorProfile } from "./actions";
import { LuLoader, LuBadge, LuMapPin, LuBriefcase, LuClock, LuUser, LuBanknote } from "react-icons/lu";

type Profile = ContractorProfile;

function Field({ label, value }: { label: string; value: string | boolean | undefined | null }) {
  const display =
    value === null || value === undefined || value === "" || value === "—"
      ? "—"
      : value === true  ? "Yes"
      : value === false ? "No"
      : String(value);

  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.14em] mb-1">{label}</p>
      <p className="text-base font-semibold text-slate-800">{display}</p>
    </div>
  );
}

// Section-card heading: an emerald icon chip + uppercase title.
function CardTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold text-[#003527] uppercase tracking-[0.14em] mb-6 flex items-center gap-2.5">
      <span className="grid place-items-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600">{icon}</span>
      {children}
    </h3>
  );
}

export default function ContractorProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) { setError("Not logged in."); setLoading(false); return; }
      const data = await fetchContractorProfileByEmail(session.user.email);
      if (!data) { setError("Profile not found."); } else { setProfile(data); }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LuLoader size={28} className="text-slate-300 animate-spin" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-sm">
        {error || "Profile not found."}
      </div>
    );
  }

  const avatarLetters = profile.avatar ||
    profile.fullName?.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";

  const monthlyNum = parseFloat(profile.monthlyRate?.replace(/[^0-9.]/g, "") || "0");
  const weeklyNum  = parseFloat(profile.weeklyRate?.replace(/[^0-9.]/g, "")  || "0");
  const hourlyNum  = parseFloat(profile.hourlyRate?.replace(/[^0-9.]/g, "")  || "0");

  const currency = profile.currency || "USD";
  function fmtMoney(val: number) {
    if (!val) return "—";
    return val.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 });
  }
  function fmtMoney2(val: number) {
    if (!val) return "—";
    return val.toLocaleString("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const isActive = (profile.status ?? "Active") === "Active";

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Page header — sized 20% smaller than the shared PageHeader (this
          page only; PageHeader itself is shared across the whole Contractor
          Portal, so its sizing isn't touched). */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className="h-px w-8 bg-emerald-600/50" />
            <span className="text-[8.8px] font-bold uppercase tracking-[0.22em] text-emerald-700">Contractor Portal</span>
          </div>
          <h2 className="text-[1.8rem] md:text-[2.16rem] font-bold text-[#003527] leading-none" style={{ letterSpacing: "-0.025em" }}>
            My Profile
          </h2>
          <p className="text-slate-500 mt-3 text-[0.8rem]">Your engagement details, contract information, and personal information.</p>
        </div>
      </header>

      {/* ── Identity hero — deep brand gradient ── */}
      <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-sm bg-brand-gradient">
        <div className="absolute inset-0 bg-grid-soft opacity-60 pointer-events-none" />
        <div className="relative flex flex-col md:flex-row items-center md:items-start gap-3 md:gap-4">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-2xl bg-white/10 ring-1 ring-white/15 shrink-0 grid place-items-center backdrop-blur-sm">
            <span className="text-xl font-black text-white">{avatarLetters}</span>
          </div>

          {/* Info */}
          <div className="flex-1 w-full text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
              <div>
                <h1 className="text-xl font-bold text-white leading-none" style={{ letterSpacing: "-0.02em" }}>
                  {profile.fullName || "—"}
                </h1>
                <p className="text-sm font-semibold text-emerald-300 mt-1">{profile.role || "Contractor"}</p>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-2.5 gap-y-1 mt-1.5 text-emerald-100/80">
                  {profile.contractorId && (
                    <span className="flex items-center text-xs gap-1">
                      <LuBadge size={12} strokeWidth={1.75} /> {profile.contractorId}
                    </span>
                  )}
                  {profile.location && (
                    <span className="flex items-center text-xs gap-1">
                      <LuMapPin size={12} strokeWidth={1.75} /> {profile.location}
                    </span>
                  )}
                </div>
              </div>
              <span className={`self-center md:self-start px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${
                isActive
                  ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/30"
                  : "bg-red-400/15 text-red-200 ring-1 ring-red-300/30"
              }`}>
                {profile.status || "Active"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Detail grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: Employment + Operational */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
            <CardTitle icon={<LuBriefcase size={16} strokeWidth={1.75} />}>Contractor Details</CardTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Field label="Assigned Team"     value={profile.department} />
              <Field label="Functional Team"   value={profile.subDepartment} />
              <Field label="Engagement Start Date" value={profile.hireDate} />
              <Field label="OWE Contact"       value={profile.manager} />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
            <CardTitle icon={<LuClock size={16} strokeWidth={1.75} />}>Operational Details</CardTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Field label="Work Location"      value={profile.officeLocation} />
              <Field label="Agreed Schedule"    value={profile.shiftHours} />
              <Field label="Typical Non-Working Days" value={profile.restDay} />
            </div>
          </div>
        </div>

        {/* Right: Personal Info + Contract Rate */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
            <CardTitle icon={<LuUser size={16} strokeWidth={1.75} />}>Personal Info</CardTitle>
            <div className="space-y-4">
              <Field label="Birthday" value={profile.dob} />
              <Field label="Gender"   value={profile.gender} />
              <Field label="Email"    value={profile.email} />
            </div>
          </div>

          <div className="bg-emerald-50 rounded-2xl border border-emerald-100 shadow-sm p-6">
            <CardTitle icon={<LuBanknote size={16} strokeWidth={1.75} />}>Contract Rate</CardTitle>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.1em]">Monthly Contract Rate</p>
                <p className="text-lg font-bold text-[#003527] tabular-nums">{fmtMoney(monthlyNum)}</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.1em]">Weekly Contract Rate</p>
                <p className="text-base font-semibold text-slate-800 tabular-nums">{fmtMoney(weeklyNum)}</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.1em]">Hourly Rate</p>
                <p className="text-base font-semibold text-slate-800 tabular-nums">{fmtMoney2(hourlyNum)}</p>
              </div>
              <div className="pt-4 border-t border-emerald-100">
                <p className="text-xs text-emerald-700 font-medium">
                  Pay cycle: {profile.payPeriod || "Sunday – Saturday"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
