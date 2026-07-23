"use client";

import { useState, useEffect } from "react";
import { LuX, LuUserPlus, LuPencil } from "react-icons/lu";
import type { Contractor } from "@/app/admin/contractors/types";
import { useContractorConfig } from "@/components/ContractorConfigContext";

type Props = {
  onClose: () => void;
  onSave: (c: Contractor) => void;
  initial?: Contractor;
};

// ── Country → States ──────────────────────────────────────────────────────────
// State lists only exist for these seed countries — any country an admin adds
// under Settings → Country Locations that isn't listed here just gets no
// state options (the State field then has nothing to pick from).
const COUNTRY_STATES: Record<string, string[]> = {
  Philippines: ["Metro Manila", "Cebu", "Davao", "Laguna", "Batangas", "Pampanga", "Bulacan"],
  Mexico:      ["Mexico City", "Jalisco", "Nuevo León", "Puebla", "Guanajuato", "Querétaro", "Yucatán"],
  India:       ["Karnataka", "Maharashtra", "Delhi", "Tamil Nadu", "Telangana", "Gujarat", "Rajasthan"],
  USA:         ["California", "Texas", "Arizona", "Colorado", "Florida", "New York", "Washington"],
};
const FALLBACK_COUNTRIES = Object.keys(COUNTRY_STATES);

const PAY_CATEGORIES = ["Hourly", "Fixed-Ind", "Fixed-Mex"];
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getPayPeriod() {
  const today = new Date();
  const sun   = new Date(today); sun.setDate(today.getDate() - today.getDay());
  const sat   = new Date(sun);   sat.setDate(sun.getDate() + 6);
  const fmt   = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(sun)} – ${fmt(sat)}`;
}

// monthly → weekly (× 12 ÷ 52) and hourly (÷ 5 ÷ 8), rounded to 2dp
function calcWeekly(monthly: string)  { const m = parseFloat(monthly); return isNaN(m) ? "" : (m * 12 / 52).toFixed(2); }
function calcHourly(monthly: string)  { const m = parseFloat(monthly); return isNaN(m) ? "" : (m * 12 / 52 / 5 / 8).toFixed(2); }

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
  const { officeLocations, deptTree, managers, countryLocations } = useContractorConfig();
  const DEPARTMENTS = Object.keys(deptTree);
  const COUNTRIES = countryLocations.length ? countryLocations : FALLBACK_COUNTRIES;

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
    officeLocation: initial?.officeLocation ?? officeLocations[0],
    manager:        initial?.manager        ?? managers[0] ?? "",
    hireDate:       initial?.hireDate       ?? "",
    status:         (initial?.status ?? "Active") as typeof STATUSES[number],
    payCategory:    initial?.payCategory    ?? PAY_CATEGORIES[0],
    shiftType:      initial?.shiftType ?? "Fixed",
    shiftFrom:      initial?.shiftHours?.split(" to ")[0] ?? "9:00 AM",
    shiftTo:        initial?.shiftHours?.split(" to ")[1] ?? "6:00 PM",
    restDays:       initial?.restDay && initial.restDay !== "—" ? initial.restDay.split(", ") : [] as string[],
    currency:       initial?.currency       ?? CURRENCIES[0],
    monthlyRate:    initial?.monthlyRate    ?? "",
    weeklyRate:     initial?.weeklyRate     ?? "",
    hourlyRate:     initial?.hourlyRate     ?? "",
    dismissalDate:      initial?.dismissalDate      ?? "",
    dismissalReason:    initial?.dismissalReason    ?? "",
    equipmentProvided:  initial?.equipmentProvided  ?? false,
    worksnapId:         initial?.worksnapId         ?? "",
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
    if (!form.restDays.length)  e.restDays  = "Required";
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
      location:       form.country,
      officeLocation: form.officeLocation,
      manager:        form.manager,
      hireDate:       form.hireDate,
      status:         form.status,
      payCategory:    form.payCategory,
      payPeriod:      "Sunday – Saturday",
      shiftType:      form.shiftType,
      shiftHours:     form.shiftType === "Fixed" ? `${form.shiftFrom} to ${form.shiftTo}` : "Flexible",
      restDay:        form.restDays.length ? form.restDays.join(", ") : "—",
      currency:       form.currency,
      monthlyRate:    form.monthlyRate || "—",
      weeklyRate:     form.weeklyRate  || "—",
      hourlyRate:     form.hourlyRate  || "—",
      dismissalDate:      form.status === "Dismissed" ? (form.dismissalDate   || "") : "",
      dismissalReason:    form.status === "Dismissed" ? (form.dismissalReason || "") : "",
      equipmentProvided:  form.equipmentProvided,
      worksnapId:         form.worksnapId,
      // Preserve on edit — these are recomputed/maintained server-side
      // (accrual balances, advance-leave repayment) and must not be reset
      // to 0 just because an unrelated profile field changed.
      ptoBalance:         initial?.ptoBalance       ?? 0,
      ptoUsed:            initial?.ptoUsed          ?? 0,
      ptoUsedImport:      initial?.ptoUsedImport    ?? 0,
      sickLeaveBalance:   initial?.sickLeaveBalance ?? 0,
      sickLeaveUsed:      initial?.sickLeaveUsed    ?? 0,
      sickUsedImport:     initial?.sickUsedImport   ?? 0,
      birthdayLeave:      initial?.birthdayLeave    ?? 0,
      birthdayLeaveUsed:  initial?.birthdayLeaveUsed ?? 0,
      advanceSickLeave:   initial?.advanceSickLeave ?? 0,
      advanceSickLeaveUsed: initial?.advanceSickLeaveUsed ?? 0,
      specialLeaveCredits: initial?.specialLeaveCredits ?? 0,
      specialLeaveUsed:    initial?.specialLeaveUsed    ?? 0,
    };

    onSave(contractor);
    onClose();
  }

  const subDepts = Object.keys(deptTree[form.department] ?? {});
  const roles    = deptTree[form.department]?.[form.subDepartment] ?? [];
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

              {/* Country */}
              <FIELD label="Country">
                <select className={SELECT} value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value, state: "" }))}>
                  {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </FIELD>

              <FIELD label="Office Location">
                <select className={SELECT} value={form.officeLocation} onChange={(e) => set("officeLocation", e.target.value)}>
                  {officeLocations.map((o) => <option key={o}>{o}</option>)}
                </select>
              </FIELD>

              <FIELD label="Manager">
                <select className={SELECT} value={form.manager} onChange={(e) => set("manager", e.target.value)}>
                  {managers.map((m) => <option key={m}>{m}</option>)}
                </select>
              </FIELD>
            </div>
          </section>

          {/* ── Employment ── */}
          <section>
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">Employment</p>

            {/* Row 1: Hire Date · Pay Category · Pay Period */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <FIELD label="Hire Date" required>
                <input type="date" className={INPUT} value={form.hireDate} onChange={(e) => set("hireDate", e.target.value)} />
                {errors.hireDate && <span className="text-xs text-red-500">{errors.hireDate}</span>}
              </FIELD>
              <FIELD label="Pay Category">
                <select className={SELECT} value={form.payCategory} onChange={(e) => set("payCategory", e.target.value)}>
                  {PAY_CATEGORIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </FIELD>
              <FIELD label="Pay Period">
                <input className={READONLY} readOnly value="Sunday – Saturday" />
              </FIELD>
            </div>

            {/* Row 2: Status · Dismissal Date · Dismissal Reason (conditional) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <FIELD label="Status">
                <select className={SELECT} value={form.status} onChange={(e) => set("status", e.target.value as typeof STATUSES[number])}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </FIELD>
              {form.status === "Dismissed" && (
                <>
                  <FIELD label="Dismissal Date">
                    <input type="date" className={INPUT} value={form.dismissalDate} onChange={(e) => set("dismissalDate", e.target.value)} />
                  </FIELD>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Dismissal Reason</label>
                    <textarea rows={3} className={INPUT + " resize-none"}
                      placeholder="Describe the reason for dismissal…"
                      value={form.dismissalReason}
                      onChange={(e) => set("dismissalReason", e.target.value)} />
                  </div>
                </>
              )}
            </div>

            {/* Row 3: Shift Type · Shift Start · Shift End */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <FIELD label="Shift Type">
                <select className={SELECT} value={form.shiftType} onChange={(e) => set("shiftType", e.target.value)}>
                  <option value="Fixed">Fixed</option>
                  <option value="Flexible">Flexible</option>
                </select>
              </FIELD>
              {form.shiftType === "Fixed" && (
                <>
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
                </>
              )}
            </div>

            {/* Row 4: Equipment Provided */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FIELD label="Equipment Provided">
                <div className="flex items-center gap-4 py-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="equipmentProvided" checked={form.equipmentProvided === true}
                      onChange={() => setForm((f) => ({ ...f, equipmentProvided: true }))}
                      className="w-4 h-4 accent-teal-600" />
                    <span className="text-sm text-slate-700 font-medium">Yes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="equipmentProvided" checked={form.equipmentProvided === false}
                      onChange={() => setForm((f) => ({ ...f, equipmentProvided: false }))}
                      className="w-4 h-4 accent-teal-600" />
                    <span className="text-sm text-slate-700 font-medium">No</span>
                  </label>
                </div>
              </FIELD>
            </div>

            {/* Rest Days */}
            <div className="mt-4 flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Rest Days<span className="text-red-400 ml-0.5">*</span>
                </label>
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
                {errors.restDays && <span className="text-xs text-red-500">{errors.restDays}</span>}
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
            <p className="text-xs text-slate-400 mt-2">Weekly = Monthly × 12 ÷ 52 &nbsp;·&nbsp; Hourly = Weekly ÷ 5 ÷ 8</p>
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
