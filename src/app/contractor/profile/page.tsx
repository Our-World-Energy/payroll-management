"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchContractorProfileByEmail, type ContractorProfile } from "./actions";
import {
  LuUser, LuBriefcase, LuClock, LuDollarSign, LuLoader, LuMapPin, LuMail,
  LuCalendar, LuChevronRight,
} from "react-icons/lu";

type Profile = ContractorProfile;

function Field({ label, value }: { label: string; value: string | boolean | undefined | null }) {
  const display =
    value === null || value === undefined || value === "" || value === "—"
      ? "Not available"
      : value === true
      ? "Yes"
      : value === false
      ? "No"
      : String(value);

  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${display === "Not available" ? "text-slate-300 italic" : "text-[#003527]"}`}>
        {display}
      </p>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100">
        <div className="size-7 rounded-lg bg-teal-50 grid place-items-center">
          <Icon size={14} className="text-teal-600" strokeWidth={2} />
        </div>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
        {children}
      </div>
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
      if (!data) {
        setError("Profile not found.");
      } else {
        setProfile(data);
      }
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
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-sm">{error || "Profile not found."}</div>
    );
  }

  const avatarLetters = profile.avatar || (profile.fullName?.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()) || "?";

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <nav className="flex">
        <ol className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <li>Portal</li>
          <li><LuChevronRight size={13} className="text-slate-400" /></li>
          <li className="text-teal-600">Profile</li>
        </ol>
      </nav>

      {/* Hero card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
        {/* Avatar */}
        <div className="size-20 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-700 grid place-items-center text-white text-2xl font-black shrink-0 shadow-md">
          {avatarLetters}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-[#003527] truncate">{profile.fullName || "—"}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{profile.role || "Contractor"}</p>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {profile.contractorId && (
              <span className="text-xs text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded-md">{profile.contractorId}</span>
            )}
            {profile.location && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <LuMapPin size={11} /> {profile.location}
              </span>
            )}
            {profile.email && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <LuMail size={11} /> {profile.email}
              </span>
            )}
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
              profile.status === "Active"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-600 border border-red-200"
            }`}>
              {profile.status || "Active"}
            </span>
          </div>
        </div>
      </div>

      {/* Employment Details */}
      <Section title="Employment Details" icon={LuBriefcase}>
        <Field label="Department"     value={profile.department} />
        <Field label="Sub-Department" value={profile.subDepartment} />
        <Field label="Hire Date"      value={profile.hireDate} />
        <Field label="Manager"        value={profile.manager} />
        <Field label="Office Location" value={profile.officeLocation} />
        <Field label="Pay Category"   value={profile.payCategory} />
      </Section>

      {/* Personal Info */}
      <Section title="Personal Info" icon={LuUser}>
        <Field label="Date of Birth" value={profile.dob} />
        <Field label="Gender"        value={profile.gender} />
        <Field label="Email"         value={profile.email} />
      </Section>

      {/* Operational Details */}
      <Section title="Operational Details" icon={LuClock}>
        <Field label="Shift Hours"          value={profile.shiftHours} />
        <Field label="Shift Type"           value={profile.shiftType} />
        <Field label="Rest Day"             value={profile.restDay} />
        <Field label="Pay Period"           value={profile.payPeriod} />
        <Field label="Equipment Provided"   value={profile.equipmentProvided} />
        <Field label="Worksnap ID"          value={profile.worksnapId} />
      </Section>

      {/* Compensation */}
      <Section title="Compensation" icon={LuDollarSign}>
        <Field label="Currency"      value={profile.currency} />
        <Field label="Monthly Rate"  value={profile.monthlyRate ? `${profile.currency || "$"}${profile.monthlyRate}` : ""} />
        <Field label="Weekly Rate"   value={profile.weeklyRate  ? `${profile.currency || "$"}${profile.weeklyRate}`  : ""} />
        <Field label="Hourly Rate"   value={profile.hourlyRate  ? `${profile.currency || "$"}${profile.hourlyRate}`  : ""} />
      </Section>

      {/* Calendar */}
      <Section title="Schedule" icon={LuCalendar}>
        <Field label="Hire Date"   value={profile.hireDate} />
        <Field label="Pay Period"  value={profile.payPeriod} />
        <Field label="Rest Day"    value={profile.restDay} />
      </Section>
    </div>
  );
}
