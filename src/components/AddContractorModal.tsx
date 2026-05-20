"use client";

import { useState, useEffect } from "react";
import { LuX, LuUserPlus, LuPencil } from "react-icons/lu";
import type { Contractor } from "@/app/admin/contractors/types";

type Props = {
  onClose: () => void;
  onSave: (c: Contractor) => void;
  initial?: Contractor;
};

// ── Department → Sub-department → Role ───────────────────────────────────────
const DEPT_TREE: Record<string, Record<string, string[]>> = {
  "Internal Operations": {
    CAD: ["Electrical Review Manager", "Electrical Review Team Lead", "Electrical Review Sr"],
    Electrical: ["Electrical 1", "Electrical 2"],
  },
  "Field Ops": {
    Construction: ["Construction Manager", "Construction Lead", "Site Supervisor"],
    Inspection:   ["Field Inspector", "Quality Inspector"],
  },
  "Solar Engineering": {
    "Field Inspection":   ["Lead Inspector", "Solar Technician"],
    "Panel Installation": ["Installation Lead", "Installer"],
    "System Design":      ["Design Engineer", "CAD Drafter"],
  },
  "Grid Maintenance": {
    "High Voltage":  ["HV Specialist", "HV Technician"],
    Distribution:    ["Grid Technician", "Maintenance Lead"],
    Substation:      ["Substation Engineer", "Protection Relay Tech"],
  },
  "Field Safety": {
    Compliance:            ["Safety Officer", "Compliance Analyst"],
    "Risk Assessment":     ["Risk Analyst", "HSE Coordinator"],
    "Emergency Response":  ["Emergency Coordinator", "First Responder"],
  },
  Logistics: {
    "Supply Chain":     ["Logistics Lead", "Supply Analyst"],
    "Offshore Support": ["Offshore Coordinator", "Logistics Specialist"],
    Warehouse:          ["Warehouse Manager", "Inventory Clerk"],
  },
};
const DEPARTMENTS = Object.keys(DEPT_TREE);

// ── Country → States ──────────────────────────────────────────────────────────
const COUNTRY_STATES: Record<string, string[]> = {
  Philippines: ["Metro Manila", "Cebu", "Davao", "Laguna", "Batangas", "Pampanga", "Bulacan"],
  Mexico:      ["Mexico City", "Jalisco", "Nuevo León", "Puebla", "Guanajuato", "Querétaro", "Yucatán"],
  India:       ["Karnataka", "Maharashtra", "Delhi", "Tamil Nadu", "Telangana", "Gujarat", "Rajasthan"],
  USA:         ["California", "Texas", "Arizona", "Colorado", "Florida", "New York", "Washington"],
};
const COUNTRIES = Object.keys(COUNTRY_STATES);

const OFFICE_LOCATIONS = [
  "PGS [AZ, Yuma]", "OWE [MA, Auburn]", "Solar Godz [FL, Jacksonville]",
  "eEquals [VA, Richmond]", "Allied Energy Solutions [ME, Brunswick]", "Adrian Martinez",
  "Allied Energy Solutions [NH, Bow]", "eEquals [IL, St Louis]",
  "Allied Energy Solutions [NJ, Pennsauken]", "OWE [AZ, Tucson]", "Va Energy Electric",
  "Solar Godz [VA, Richmond]", "Allied Energy Solutions [TX, Midland]",
  "Sunrite Solar [MA, Hudson]", "OWE [AZ, Tempe]", "Solar Godz [FL, Tallahassee]",
  "No Office", "Clear Solar Solutions [CA, Turlock]", "OWE [TX, San Antonio]",
  "OWE [AZ, Phoenix]", "OWE [TX, Austin]", "Allied Energy Solutions [RI, Providence]",
  "eEquals [MD, Jessup]", "Cody Rawleigh", "Sunforce [TX, Las Cruces]",
  "OWE [TX, El Paso]", "OWE [FL, St Peterburg]", "Integrity Electrical [AZ, Yuma]",
  "Green Volt [CA, Fresno]", "Sun Craft Contracting [FL, Flagler]", "OWE [CO, Denver]",
  "OWE [CO, Grand Junction]", "OWE [TX, Corpus Christi]", "Sunrite Solar [CT, Wallingford]",
  "OWE [AZ, Kingman]", "Sunlife Tech [PR, Guaynabo]", "Solar Godz [FL, Tampa]",
  "Solar Godz [MD, Jessup]", "Sunrite Solar [RI, Rhode Island]", "Optimum Home [TX, Houston]",
  "OWE [TX, Houston]", "Mendez Electric Solar [CA, San Jacinto]",
  "Direct Electrical Innovations [TX, Dallas]", "Allied Energy Solutions [IL, Hammond]",
  "OWE [TX, Grand Prairie]", "OWE [NM, Albuquerque]", "Adrian Ruvalcaba",
  "Allied Energy Solutions [MA, Mansfield]", "DT Solar [TX, Brownsville]",
];

const MANAGERS       = ["Colten Warnock", "Dillard Blanton"];
const PAY_CATEGORIES = ["Hourly", "Fixed"];
const CURRENCIES     = ["PHP", "INR", "MXN", "USD"];
const STATUSES       = ["Active", "Dismissed"] as const;
const GENDERS        = ["Not Specified", "Male", "Female"];
const WEEK_DAYS      = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// 30-min time slots
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    const period = h < 12 ? "AM" : "PM";
    const hour   = h === 0 ? 12 : h > 12 ? h - 12 : h;
    TIME_OPTIONS.push(`${hour}:${m === 0 ? "00" : "30"} ${period}`);
  }
}

// Pay period: always Sun–Sat of current week
function getPayPeriod() {
  const today = new Date();
  const sun   = new Date(today); sun.setDate(today.getDate() - today.getDay());
  const sat   = new Date(sun);   sat.setDate(sun.getDate() + 6);
  const fmt   = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(sun)} – ${fmt(sat)}`;
}

// monthly → weekly (÷ 4.33) and hourly (÷ 4.33 ÷ 40), rounded to 2dp
function calcWeekly(monthly: string)  { const m = parseFloat(monthly); return isNaN(m) ? "" : (m / 4.33).toFixed(2); }
function calcHourly(monthly: string)  { const m = parseFloat(monthly); return isNaN(m) ? "" : (m / 4.33 / 40).toFixed(2); }

const FIELD = ({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const INPUT  = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all bg-white";
const SELECT = INPUT + " cursor-pointer";
const READONLY = "w-full border border-slate-100 rounded-lg px-3 py-2 text-sm text-slate-500 bg-slate-50 cursor-not-allowed";

export function AddContractorModal({ onClose, onSave, initial }: Props) {
  const isEdit = !!initial;

  const parseLocation = (loc?: string) => {
    if (!loc) return { country: COUNTRIES[0], state: "" };
    const parts = loc.split(", ");
    if (parts.length >= 2) {
      const maybeCountry = parts[parts.length - 1];
      if (COUNTRIES.includes(maybeCountry)) return { country: maybeCountry, state: parts.slice(0, -1).join(", ") };
    }
    return { country: COUNTRIES[0], state: "" };
  };

  const initLoc = parseLocation(initial?.location);

  const [form, setForm] = useState({
    firstName:      initial?.firstName      ?? "",
    middleName:     initial?.middleName     ?? "",
    surname:        initial?.surname        ?? "",
    dob:            initial?.dob            ?? "",
    gender:         initial?.gender         ?? "Not Specified",
    email:          initial?.email          ?? "",
    department:     initial?.department     ?? DEPARTMENTS[0],
    subDepartment:  initial?.subDepartment  ?? "",
    role:           initial?.role           ?? "",
    country:        initLoc.country,
    state:          initLoc.state,
    officeLocation: initial?.officeLocation ?? OFFICE_LOCATIONS[0],
    manager:        initial?.manager        ?? MANAGERS[0],
    hireDate:       initial?.hireDate       ?? "",
    status:         (initial?.status ?? "Active") as typeof STATUSES[number],
    payCategory:    initial?.payCategory    ?? PAY_CATEGORIES[0],
    shiftFrom:      initial?.shiftHours?.split(" to ")[0] ?? "8:00 AM",
    shiftTo:        initial?.shiftHours?.split(" to ")[1] ?? "5:00 PM",
    restDays:       initial?.restDay && initial.restDay !== "—" ? initial.restDay.split(", ") : [] as string[],
    currency:       initial?.currency       ?? CURRENCIES[0],
    monthlyRate:    initial?.monthlyRate    ?? "",
    weeklyRate:     initial?.weeklyRate     ?? "",
    hourlyRate:     initial?.hourlyRate     ?? "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Auto-calculate weekly and hourly when monthly changes
  useEffect(() => {
    if (form.monthlyRate) {
      setForm((f) => ({
        ...f,
        weeklyRate: calcWeekly(f.monthlyRate),
        hourlyRate: calcHourly(f.monthlyRate),
      }));
    }
  }, [form.monthlyRate]);

  function toggleRestDay(day: string) {
    setForm((f) => ({
      ...f,
      restDays: f.restDays.includes(day) ? f.restDays.filter((d) => d !== day) : [...f.restDays, day],
    }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = "Required";
    if (!form.surname.trim())   e.surname   = "Required";
    if (!form.email.trim())     e.email     = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email";
    if (!form.role.trim())      e.role      = "Required";
    if (!form.hireDate)         e.hireDate  = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const contractor: Contractor = {
      uid:            initial?.uid          ?? `UID-${Math.floor(10000 + Math.random() * 89999)}`,
      contractorId:   initial?.contractorId ?? `#C-${Math.floor(1000 + Math.random() * 8999)}`,
      avatar:         (form.firstName[0] + form.surname[0]).toUpperCase(),
      fullName:       [form.firstName, form.middleName, form.surname].filter(Boolean).join(" "),
      createdOn:      initial?.createdOn    ?? new Date().toISOString().split("T")[0],
      firstName:      form.firstName,
      middleName:     form.middleName,
      surname:        form.surname,
      dob:            form.dob,
      gender:         form.gender,
      email:          form.email,
      department:     form.department,
      subDepartment:  form.subDepartment,
      role:           form.role,
      location:       form.state ? `${form.state}, ${form.country}` : form.country,
      officeLocation: form.officeLocation,
      manager:        form.manager,
      hireDate:       form.hireDate,
      status:         form.status,
      payCategory:    form.payCategory,
      payPeriod:      getPayPeriod(),
      shiftHours:     `${form.shiftFrom} to ${form.shiftTo}`,
      restDay:        form.restDays.length ? form.restDays.join(", ") : "—",
      currency:       form.currency,
      monthlyRate:    form.monthlyRate || "—",
      weeklyRate:     form.weeklyRate  || "—",
      hourlyRate:     form.hourlyRate  || "—",
    };

    onSave(contractor);
    onClose();
  }

  const subDepts = Object.keys(DEPT_TREE[form.department] ?? {});
  const roles    = DEPT_TREE[form.department]?.[form.subDepartment] ?? [];
  const states   = COUNTRY_STATES[form.country] ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[#003527] text-white grid place-items-center">
              {isEdit ? <LuPencil size={17} strokeWidth={2} /> : <LuUserPlus size={18} strokeWidth={2} />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#003527]">{isEdit ? "Edit Contractor" : "Add New Contractor"}</h3>
              <p className="text-xs text-slate-400">{isEdit ? `Editing ${initial?.fullName}` : "Fill in the details below"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <LuX size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── Personal Info ── */}
          <section>
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">Personal Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

              {/* Full Name — auto-generated, read-only */}
              <FIELD label="Full Name">
                <input className={READONLY} readOnly
                  value={[form.firstName, form.middleName, form.surname].filter(Boolean).join(" ") || "—"}
                />
              </FIELD>

              <FIELD label="Date of Birth">
                <input type="date" className={INPUT} value={form.dob} onChange={(e) => set("dob", e.target.value)} />
              </FIELD>

              {/* Gender — default Not Specified */}
              <FIELD label="Gender">
                <select className={SELECT} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                  {GENDERS.map((g) => <option key={g}>{g}</option>)}
                </select>
              </FIELD>

              <FIELD label="Email" required>
                <input type="email" className={INPUT} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@company.com" />
                {errors.email && <span className="text-xs text-red-500">{errors.email}</span>}
              </FIELD>
            </div>
          </section>

          {/* ── Role & Location ── */}
          <section>
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">Role & Location</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Department → resets sub + role */}
              <FIELD label="Department">
                <select className={SELECT} value={form.department} onChange={(e) =>
                  setForm((f) => ({ ...f, department: e.target.value, subDepartment: "", role: "" }))
                }>
                  {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </FIELD>

              {/* Sub-Department → depends on Dept, resets role */}
              <FIELD label="Sub-Department">
                <select className={SELECT} value={form.subDepartment} disabled={!subDepts.length}
                  onChange={(e) => setForm((f) => ({ ...f, subDepartment: e.target.value, role: "" }))}>
                  <option value="">— Select —</option>
                  {subDepts.map((s) => <option key={s}>{s}</option>)}
                </select>
              </FIELD>

              {/* Role → depends on Sub-Dept */}
              <FIELD label="Role" required>
                <select className={SELECT} value={form.role} disabled={!roles.length}
                  onChange={(e) => set("role", e.target.value)}>
                  <option value="">— Select —</option>
                  {roles.map((r) => <option key={r}>{r}</option>)}
                </select>
                {errors.role && <span className="text-xs text-red-500">{errors.role}</span>}
              </FIELD>

              {/* Country → resets state */}
              <FIELD label="Country">
                <select className={SELECT} value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value, state: "" }))}>
                  {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </FIELD>

              {/* State → depends on Country */}
              <FIELD label="State / Province">
                <select className={SELECT} value={form.state} onChange={(e) => set("state", e.target.value)}>
                  <option value="">— Select —</option>
                  {states.map((s) => <option key={s}>{s}</option>)}
                </select>
              </FIELD>

              <FIELD label="Office Location">
                <select className={SELECT} value={form.officeLocation} onChange={(e) => set("officeLocation", e.target.value)}>
                  {OFFICE_LOCATIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </FIELD>

              <FIELD label="Manager">
                <select className={SELECT} value={form.manager} onChange={(e) => set("manager", e.target.value)}>
                  {MANAGERS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </FIELD>
            </div>
          </section>

          {/* ── Employment ── */}
          <section>
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">Employment</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FIELD label="Hire Date" required>
                <input type="date" className={INPUT} value={form.hireDate} onChange={(e) => set("hireDate", e.target.value)} />
                {errors.hireDate && <span className="text-xs text-red-500">{errors.hireDate}</span>}
              </FIELD>

              {/* Status: Active or Dismissed only */}
              <FIELD label="Status">
                <select className={SELECT} value={form.status} onChange={(e) => set("status", e.target.value as typeof STATUSES[number])}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </FIELD>

              {/* Pay Category: Hourly or Fixed */}
              <FIELD label="Pay Category">
                <select className={SELECT} value={form.payCategory} onChange={(e) => set("payCategory", e.target.value)}>
                  {PAY_CATEGORIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </FIELD>

              {/* Pay Period — always Sun–Sat, read-only */}
              <FIELD label="Pay Period (Sun – Sat cut-off)">
                <input className={READONLY} readOnly value={getPayPeriod()} />
              </FIELD>

              {/* Shift time range */}
              <FIELD label="Shift Start">
                <select className={SELECT} value={form.shiftFrom} onChange={(e) => set("shiftFrom", e.target.value)}>
                  {TIME_OPTIONS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </FIELD>
              <FIELD label="Shift End">
                <select className={SELECT} value={form.shiftTo} onChange={(e) => set("shiftTo", e.target.value)}>
                  {TIME_OPTIONS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </FIELD>

              {/* Rest Days — multi-select pill buttons */}
              <div className="sm:col-span-3 flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rest Days</label>
                <div className="flex flex-wrap gap-2">
                  {WEEK_DAYS.map((day) => {
                    const checked = form.restDays.includes(day);
                    return (
                      <button key={day} type="button" onClick={() => toggleRestDay(day)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          checked
                            ? "bg-[#003527] text-white border-[#003527]"
                            : "bg-white text-slate-600 border-slate-200 hover:border-teal-400 hover:text-teal-700"
                        }`}>
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* ── Compensation ── */}
          <section>
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">Compensation</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <FIELD label="Currency">
                <select className={SELECT} value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </FIELD>

              {/* Monthly rate — main source */}
              <FIELD label="Monthly Rate *">
                <input type="number" className={INPUT} value={form.monthlyRate}
                  onChange={(e) => set("monthlyRate", e.target.value)} placeholder="5200" />
              </FIELD>

              {/* Weekly & Hourly — auto-calculated */}
              <FIELD label="Weekly Rate (auto)">
                <input className={READONLY} readOnly
                  value={form.weeklyRate ? Number(form.weeklyRate).toFixed(2) : ""}
                  placeholder="Auto from monthly" />
              </FIELD>
              <FIELD label="Hourly Rate (auto)">
                <input className={READONLY} readOnly
                  value={form.hourlyRate ? Number(form.hourlyRate).toFixed(2) : ""}
                  placeholder="Auto from monthly" />
              </FIELD>
            </div>
            <p className="text-xs text-slate-400 mt-2">Weekly = Monthly ÷ 4.33 &nbsp;·&nbsp; Hourly = Weekly ÷ 40</p>
          </section>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit as never}
            className="px-5 py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2">
            {isEdit ? <LuPencil size={15} strokeWidth={2} /> : <LuUserPlus size={15} strokeWidth={2} />}
            {isEdit ? "Save Changes" : "Add Contractor"}
          </button>
        </div>
      </div>
    </div>
  );
}
