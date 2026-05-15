"use client";

import { useState } from "react";
import { LuX, LuUserPlus } from "react-icons/lu";
import type { Contractor } from "@/app/admin/contractors/types";

type Props = {
  onClose: () => void;
  onAdd: (c: Contractor) => void;
};

const DEPARTMENTS = ["Solar Engineering", "Grid Maintenance", "Field Safety", "Logistics", "Engineering", "Operations"];
const REGIONS = ["US", "Philippines", "Mexico", "India"];
const PAY_CATEGORIES = ["Full-Time", "Freelance", "Contract", "Advisory"];
const PAY_PERIODS = ["Weekly", "Bi-Weekly", "Monthly"];
const CURRENCIES = ["USD", "INR", "MXN", "PHP"];
const REST_DAYS = ["Sunday", "Saturday", "Weekends"];
const STATUSES = ["Active", "Inactive", "On Leave"] as const;

const FIELD = ({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const INPUT = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all bg-white";
const SELECT = INPUT + " cursor-pointer";

export function AddContractorModal({ onClose, onAdd }: Props) {
  const [form, setForm] = useState({
    firstName: "", middleName: "", surname: "", dob: "", gender: "Male",
    department: DEPARTMENTS[0], subDepartment: "", role: "", location: "",
    status: "Active" as typeof STATUSES[number], hireDate: "", officeLocation: "",
    currency: "USD", monthlyRate: "", weeklyRate: "", hourlyRate: "",
    email: "", payCategory: PAY_CATEGORIES[0], shiftHours: "", restDay: REST_DAYS[0],
    manager: "", payPeriod: PAY_PERIODS[1], region: REGIONS[0],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function validate() {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = "Required";
    if (!form.surname.trim()) e.surname = "Required";
    if (!form.email.trim()) e.email = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email";
    if (!form.role.trim()) e.role = "Required";
    if (!form.hireDate) e.hireDate = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const uid = `UID-${Math.floor(10000 + Math.random() * 89999)}`;
    const cid = `#C-${Math.floor(1000 + Math.random() * 8999)}`;
    const avatar = (form.firstName[0] + form.surname[0]).toUpperCase();
    const newContractor: Contractor = {
      uid, firstName: form.firstName, middleName: form.middleName, surname: form.surname,
      fullName: [form.firstName, form.middleName, form.surname].filter(Boolean).join(" "),
      avatar, dob: form.dob, gender: form.gender, contractorId: cid,
      department: form.department, subDepartment: form.subDepartment, role: form.role,
      location: form.location, status: form.status, hireDate: form.hireDate,
      officeLocation: form.officeLocation, currency: form.currency,
      monthlyRate: form.monthlyRate ? `${form.currency === "USD" ? "$" : form.currency === "INR" ? "₹" : form.currency === "PHP" ? "₱" : "MX$"}${form.monthlyRate}` : "—",
      weeklyRate: form.weeklyRate ? `${form.currency === "USD" ? "$" : form.currency === "INR" ? "₹" : form.currency === "PHP" ? "₱" : "MX$"}${form.weeklyRate}` : "—",
      hourlyRate: form.hourlyRate ? `${form.currency === "USD" ? "$" : form.currency === "INR" ? "₹" : form.currency === "PHP" ? "₱" : "MX$"}${form.hourlyRate}` : "—",
      email: form.email, payCategory: form.payCategory, shiftHours: form.shiftHours,
      restDay: form.restDay, manager: form.manager, payPeriod: form.payPeriod,
    };
    onAdd(newContractor);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[#003527] text-white grid place-items-center">
              <LuUserPlus size={18} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#003527]">Add New Contractor</h3>
              <p className="text-xs text-slate-400">Fill in the basic details below</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <LuX size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Personal Info */}
          <section>
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">Personal Information</p>
            <div className="grid grid-cols-3 gap-4">
              <FIELD label="First Name" required>
                <input className={INPUT} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Marcus" />
                {errors.firstName && <span className="text-xs text-red-500">{errors.firstName}</span>}
              </FIELD>
              <FIELD label="Middle Name">
                <input className={INPUT} value={form.middleName} onChange={(e) => set("middleName", e.target.value)} placeholder="Lee" />
              </FIELD>
              <FIELD label="Surname" required>
                <input className={INPUT} value={form.surname} onChange={(e) => set("surname", e.target.value)} placeholder="Chen" />
                {errors.surname && <span className="text-xs text-red-500">{errors.surname}</span>}
              </FIELD>
              <FIELD label="Date of Birth">
                <input type="date" className={INPUT} value={form.dob} onChange={(e) => set("dob", e.target.value)} />
              </FIELD>
              <FIELD label="Gender">
                <select className={SELECT} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
              </FIELD>
              <FIELD label="Email" required>
                <input type="email" className={INPUT} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@company.com" />
                {errors.email && <span className="text-xs text-red-500">{errors.email}</span>}
              </FIELD>
            </div>
          </section>

          {/* Role & Location */}
          <section>
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">Role & Location</p>
            <div className="grid grid-cols-3 gap-4">
              <FIELD label="Department">
                <select className={SELECT} value={form.department} onChange={(e) => set("department", e.target.value)}>
                  {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </FIELD>
              <FIELD label="Sub-Department">
                <input className={INPUT} value={form.subDepartment} onChange={(e) => set("subDepartment", e.target.value)} placeholder="Field Inspection" />
              </FIELD>
              <FIELD label="Role" required>
                <input className={INPUT} value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Lead Inspector" />
                {errors.role && <span className="text-xs text-red-500">{errors.role}</span>}
              </FIELD>
              <FIELD label="Location">
                <input className={INPUT} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="San Diego, CA" />
              </FIELD>
              <FIELD label="Office Location">
                <input className={INPUT} value={form.officeLocation} onChange={(e) => set("officeLocation", e.target.value)} placeholder="West Coast HQ" />
              </FIELD>
              <FIELD label="Manager">
                <input className={INPUT} value={form.manager} onChange={(e) => set("manager", e.target.value)} placeholder="Jonathan Wu" />
              </FIELD>
            </div>
          </section>

          {/* Employment */}
          <section>
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">Employment</p>
            <div className="grid grid-cols-3 gap-4">
              <FIELD label="Hire Date" required>
                <input type="date" className={INPUT} value={form.hireDate} onChange={(e) => set("hireDate", e.target.value)} />
                {errors.hireDate && <span className="text-xs text-red-500">{errors.hireDate}</span>}
              </FIELD>
              <FIELD label="Status">
                <select className={SELECT} value={form.status} onChange={(e) => set("status", e.target.value as typeof STATUSES[number])}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </FIELD>
              <FIELD label="Pay Category">
                <select className={SELECT} value={form.payCategory} onChange={(e) => set("payCategory", e.target.value)}>
                  {PAY_CATEGORIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </FIELD>
              <FIELD label="Pay Period">
                <select className={SELECT} value={form.payPeriod} onChange={(e) => set("payPeriod", e.target.value)}>
                  {PAY_PERIODS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </FIELD>
              <FIELD label="Shift Hours">
                <input className={INPUT} value={form.shiftHours} onChange={(e) => set("shiftHours", e.target.value)} placeholder="08:00 - 17:00" />
              </FIELD>
              <FIELD label="Rest Day">
                <select className={SELECT} value={form.restDay} onChange={(e) => set("restDay", e.target.value)}>
                  {REST_DAYS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </FIELD>
            </div>
          </section>

          {/* Compensation */}
          <section>
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">Compensation</p>
            <div className="grid grid-cols-4 gap-4">
              <FIELD label="Currency">
                <select className={SELECT} value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </FIELD>
              <FIELD label="Monthly Rate">
                <input type="number" className={INPUT} value={form.monthlyRate} onChange={(e) => set("monthlyRate", e.target.value)} placeholder="5200" />
              </FIELD>
              <FIELD label="Weekly Rate">
                <input type="number" className={INPUT} value={form.weeklyRate} onChange={(e) => set("weeklyRate", e.target.value)} placeholder="1300" />
              </FIELD>
              <FIELD label="Hourly Rate">
                <input type="number" className={INPUT} value={form.hourlyRate} onChange={(e) => set("hourlyRate", e.target.value)} placeholder="32.50" />
              </FIELD>
            </div>
          </section>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit as never}
            className="px-5 py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2"
          >
            <LuUserPlus size={15} strokeWidth={2} />
            Add Contractor
          </button>
        </div>
      </div>
    </div>
  );
}
