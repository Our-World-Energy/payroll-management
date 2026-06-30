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
      <p className="text-xs text-slate-500 uppercase font-bold mb-1 tracking-wide">{label}</p>
      <p className="text-base font-medium text-slate-900">{display}</p>
    </div>
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

  function fmtMoney(val: number) {
    if (!val) return "—";
    return val.toLocaleString("en-US", { style: "currency", currency: profile.currency || "USD", maximumFractionDigits: 0 });
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── Hero Card ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
          {/* Avatar */}
          <div className="w-32 h-32 rounded-full bg-emerald-100 shrink-0 overflow-hidden border-4 border-emerald-50 grid place-items-center">
            <span className="text-4xl font-black text-emerald-700">{avatarLetters}</span>
          </div>

          {/* Info */}
          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold text-[#003527]" style={{ letterSpacing: "-0.02em" }}>
                  {profile.fullName || "—"}
                </h1>
                <p className="text-lg font-medium text-emerald-700 mt-0.5">{profile.role || "Contractor"}</p>
                <div className="flex items-center justify-center md:justify-start gap-4 mt-2 text-slate-500">
                  {profile.contractorId && (
                    <span className="flex items-center text-sm gap-1">
                      <LuBadge size={14} strokeWidth={1.75} /> {profile.contractorId}
                    </span>
                  )}
                  {profile.location && (
                    <span className="flex items-center text-sm gap-1">
                      <LuMapPin size={14} strokeWidth={1.75} /> {profile.location}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 justify-center">
                <span className={`px-4 py-1.5 rounded-lg text-sm font-semibold ${
                  profile.status === "Active"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-600"
                }`}>
                  {profile.status || "Active"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Left: Employment + Operational */}
        <div className="md:col-span-2 space-y-6">

          {/* Employment Details */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-wider mb-6 flex items-center gap-2">
              <LuBriefcase size={16} className="text-emerald-600" strokeWidth={1.75} />
              Employment Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Field label="Department"     value={profile.department} />
              <Field label="Sub-Department" value={profile.subDepartment} />
              <Field label="Hire Date"      value={profile.hireDate} />
              <Field label="Manager"        value={profile.manager} />
            </div>
          </div>

          {/* Operational Details */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-wider mb-6 flex items-center gap-2">
              <LuClock size={16} className="text-emerald-600" strokeWidth={1.75} />
              Operational Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Field label="Office Location"    value={profile.officeLocation} />
              <Field label="Shift Hours"        value={profile.shiftHours} />
              <Field label="Rest Day"           value={profile.restDay} />
              <Field label="Equipment Provided" value={profile.equipmentProvided ? "Yes" : "No"} />
            </div>
          </div>

        </div>

        {/* Right: Personal Info + Compensation */}
        <div className="space-y-6">

          {/* Personal Info */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-wider mb-6 flex items-center gap-2">
              <LuUser size={16} className="text-emerald-600" strokeWidth={1.75} />
              Personal Info
            </h3>
            <div className="space-y-4">
              <Field label="Birthday" value={profile.dob} />
              <Field label="Gender"   value={profile.gender} />
              <Field label="Email"    value={profile.email} />
            </div>
          </div>

          {/* Compensation */}
          <div className="bg-emerald-50 rounded-xl border border-emerald-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-wider mb-6 flex items-center gap-2">
              <LuBanknote size={16} className="text-emerald-600" strokeWidth={1.75} />
              Compensation
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wide">Monthly Rate</p>
                <p className="text-lg font-bold text-emerald-900">{fmtMoney(monthlyNum)}</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wide">Weekly Rate</p>
                <p className="text-base font-medium text-slate-900">{fmtMoney(weeklyNum)}</p>
              </div>
              <div className="pt-4 border-t border-emerald-100">
                <p className="text-xs text-emerald-700 font-medium">
                  Pay period: {profile.payPeriod || "Sunday – Saturday"}
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
