"use client";

import { useState } from "react";
import { LuDownload, LuUserPlus, LuChevronLeft, LuChevronRight, LuPencil, LuChevronRight as LuBreadcrumb, LuSlidersHorizontal, LuX, LuUpload } from "react-icons/lu";
import type { Contractor, FilterRule } from "./types";
import { AddContractorModal } from "@/components/AddContractorModal";
import { ImportContractorsModal } from "@/components/ImportContractorsModal";
import { FilterModal, applyFilters } from "@/components/FilterModal";

const INITIAL_DATA: Contractor[] = [
  {
    uid: "UID-99218", firstName: "Marcus",  middleName: "Lee",   surname: "Chen",      fullName: "Marcus Lee Chen",
    avatar: "MC", dob: "1995-05-14", gender: "Male",   contractorId: "#C-8821",
    department: "Solar Engineering", subDepartment: "Field Inspection", role: "Lead Inspector",
    location: "San Diego, CA", status: "Active", hireDate: "2021-03-12", officeLocation: "OWE [AZ, Phoenix]",
    currency: "USD", monthlyRate: "5200", weeklyRate: "1300", hourlyRate: "32.50",
    email: "marcus.c@worldenergy.com", payCategory: "Full-Time", shiftHours: "8:00 AM to 5:00 PM",
    restDay: "Sunday", manager: "Colten Warnock", payPeriod: "Sunday – Saturday", shiftType: "Fixed", dismissalReason: "", equipmentProvided: false, createdOn: "2021-03-10", dismissalDate: "",
  },
  {
    uid: "UID-99542", firstName: "Elena",  middleName: "Sofia", surname: "Rodriguez", fullName: "Elena Sofia Rodriguez",
    avatar: "ER", dob: "1992-11-28", gender: "Female", contractorId: "#C-9042",
    department: "Grid Maintenance", subDepartment: "High Voltage", role: "HV Specialist",
    location: "Austin, TX", status: "Active", hireDate: "2022-06-15", officeLocation: "OWE [TX, Austin]",
    currency: "USD", monthlyRate: "7200", weeklyRate: "1800", hourlyRate: "45.00",
    email: "e.rodriguez@contract.net", payCategory: "Freelance", shiftHours: "7:00 AM to 4:00 PM",
    restDay: "Saturday", manager: "Dillard Blanton", payPeriod: "Sunday – Saturday", shiftType: "Fixed", dismissalReason: "", equipmentProvided: false, createdOn: "2022-06-10", dismissalDate: "",
  },
  {
    uid: "UID-97731", firstName: "David",  middleName: "Alan",  surname: "Miller",    fullName: "David Alan Miller",
    avatar: "DM", dob: "1978-02-09", gender: "Male",   contractorId: "#C-7731",
    department: "Field Safety", subDepartment: "Compliance", role: "Safety Officer",
    location: "Phoenix, AZ", status: "Dismissed", hireDate: "2019-11-01", officeLocation: "OWE [AZ, Phoenix]",
    currency: "USD", monthlyRate: "6000", weeklyRate: "1500", hourlyRate: "37.50",
    email: "d.miller@external.com", payCategory: "Advisory", shiftHours: "9:00 AM to 6:00 PM",
    restDay: "Saturday, Sunday", manager: "Colten Warnock", payPeriod: "Sunday – Saturday", shiftType: "Fixed", dismissalReason: "Contract ended — role no longer required.", equipmentProvided: true, createdOn: "2019-10-28", dismissalDate: "2024-03-15",
  },
  {
    uid: "UID-99112", firstName: "Sarah",  middleName: "Beth",  surname: "Jenkins",   fullName: "Sarah Beth Jenkins",
    avatar: "SJ", dob: "1989-08-21", gender: "Female", contractorId: "#C-9112",
    department: "Logistics", subDepartment: "Supply Chain", role: "Logistics Lead",
    location: "Denver, CO", status: "Active", hireDate: "2020-04-10", officeLocation: "OWE [CO, Denver]",
    currency: "USD", monthlyRate: "5800", weeklyRate: "1450", hourlyRate: "36.25",
    email: "s.jenkins@worldenergy.com", payCategory: "Contract", shiftHours: "8:30 AM to 5:30 PM",
    restDay: "Sunday", manager: "Dillard Blanton", payPeriod: "Sunday – Saturday", shiftType: "Fixed", dismissalReason: "", equipmentProvided: false, createdOn: "2020-04-05", dismissalDate: "",
  },
  {
    uid: "UID-98401", firstName: "Priya",  middleName: "Anita", surname: "Sharma",    fullName: "Priya Anita Sharma",
    avatar: "PS", dob: "1990-03-15", gender: "Female", contractorId: "#C-8401",
    department: "Engineering", subDepartment: "Electrical", role: "Senior Engineer",
    location: "Bangalore, IN", status: "Active", hireDate: "2020-07-01", officeLocation: "No Office",
    currency: "INR", monthlyRate: "95000", weeklyRate: "23750", hourlyRate: "593",
    email: "p.sharma@worldenergy.com", payCategory: "Full-Time", shiftHours: "9:00 AM to 6:00 PM",
    restDay: "Sunday", manager: "Colten Warnock", payPeriod: "Sunday – Saturday", shiftType: "Fixed", dismissalReason: "", equipmentProvided: false, createdOn: "2020-06-25", dismissalDate: "",
  },
  {
    uid: "UID-98502", firstName: "Carlos", middleName: "Juan",  surname: "Rivera",    fullName: "Carlos Juan Rivera",
    avatar: "CR", dob: "1985-07-22", gender: "Male",   contractorId: "#C-8502",
    department: "Operations", subDepartment: "Solar Array", role: "Site Manager",
    location: "Monterrey, MX", status: "Active", hireDate: "2018-09-15", officeLocation: "Allied Energy Solutions [TX, Midland]",
    currency: "MXN", monthlyRate: "28000", weeklyRate: "7000", hourlyRate: "175",
    email: "c.rivera@worldenergy.com", payCategory: "Full-Time", shiftHours: "8:00 AM to 5:00 PM",
    restDay: "Sunday", manager: "Dillard Blanton", payPeriod: "Sunday – Saturday", shiftType: "Fixed", dismissalReason: "", equipmentProvided: false, createdOn: "2018-09-01", dismissalDate: "",
  },
  {
    uid: "UID-98613", firstName: "Ana",    middleName: "Maria", surname: "Santos",    fullName: "Ana Maria Santos",
    avatar: "AS", dob: "1993-12-05", gender: "Female", contractorId: "#C-8613",
    department: "Logistics", subDepartment: "Offshore Support", role: "Logistics Lead",
    location: "Manila, PH", status: "Active", hireDate: "2021-01-20", officeLocation: "Sunlife Tech [PR, Guaynabo]",
    currency: "PHP", monthlyRate: "55000", weeklyRate: "13750", hourlyRate: "344",
    email: "a.santos@worldenergy.com", payCategory: "Contract", shiftHours: "8:00 AM to 5:00 PM",
    restDay: "Saturday, Sunday", manager: "Colten Warnock", payPeriod: "Sunday – Saturday", shiftType: "Fixed", dismissalReason: "", equipmentProvided: false, createdOn: "2021-01-15", dismissalDate: "",
  },
  {
    uid: "UID-98724", firstName: "James",  middleName: "Kwame", surname: "Okoye",     fullName: "James Kwame Okoye",
    avatar: "JO", dob: "1988-04-11", gender: "Male",   contractorId: "#C-8724",
    department: "Grid Maintenance", subDepartment: "Distribution", role: "Grid Technician",
    location: "Houston, TX", status: "Active", hireDate: "2019-05-14", officeLocation: "OWE [TX, Houston]",
    currency: "USD", monthlyRate: "5500", weeklyRate: "1375", hourlyRate: "34.37",
    email: "j.okoye@worldenergy.com", payCategory: "Full-Time", shiftHours: "7:00 AM to 4:00 PM",
    restDay: "Saturday", manager: "Dillard Blanton", payPeriod: "Sunday – Saturday", shiftType: "Fixed", dismissalReason: "", equipmentProvided: false, createdOn: "2019-05-10", dismissalDate: "",
  },
];

const AVATAR_COLORS: Record<string, string> = {
  MC: "bg-emerald-100 text-emerald-700", ER: "bg-blue-100 text-blue-700",
  DM: "bg-slate-200 text-slate-600",     SJ: "bg-emerald-100 text-emerald-700",
  PS: "bg-purple-100 text-purple-700",   CR: "bg-orange-100 text-orange-700",
  AS: "bg-pink-100 text-pink-700",       JO: "bg-teal-100 text-teal-700",
};

const STATUS_STYLES: Record<string, string> = {
  Active:    "bg-teal-100 text-teal-800",
  Dismissed: "bg-red-100 text-red-700",
};

const PAGE_SIZE = 15;

export default function ContractorsPage() {
  const [data, setData]               = useState<Contractor[]>(INITIAL_DATA);
  const [activeRules, setActiveRules] = useState<FilterRule[]>([]);
  const [page, setPage]               = useState(1);
  const [showAdd, setShowAdd]         = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [editTarget, setEditTarget]   = useState<Contractor | null>(null);
  const [showFilter, setShowFilter]   = useState(false);
  const [country, setCountry]         = useState("All Countries");
  const [status,  setStatus]          = useState("All Statuses");

  // Quick filters + advanced filters combined
  const quickFiltered = data.filter((c) => {
    const countryMatch = country === "All Countries" || c.location.endsWith(`, ${country}`) || c.location === country;
    const statusMatch  = status  === "All Statuses"  || c.status === status;
    return countryMatch && statusMatch;
  });
  const filtered = activeRules.length > 0 ? applyFilters(quickFiltered, activeRules) : quickFiltered;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleAddContractor(c: Contractor) {
    setData((d) => [c, ...d]);
    setPage(1);
  }

  function handleEditContractor(c: Contractor) {
    setData((d) => d.map((x) => x.uid === c.uid ? c : x));
  }

  function handleImportContractors(contractors: Contractor[]) {
    setData((d) => [...contractors, ...d]);
    setPage(1);
  }

  function handleApplyFilters(rules: FilterRule[]) {
    setActiveRules(rules);
    setPage(1);
  }

  function removeRule(id: string) {
    setActiveRules((r) => r.filter((x) => x.id !== id));
    setPage(1);
  }

  const reset = () => { setCountry("All Countries"); setStatus("All Statuses"); setActiveRules([]); setPage(1); };

  const avatarColor = (avatar: string) => AVATAR_COLORS[avatar] ?? "bg-slate-100 text-slate-600";

  // Convert YYYY-MM-DD → MM-DD-YYYY
  const fmtDate = (d: string) => {
    if (!d || d === "—") return d;
    const [y, m, day] = d.split("-");
    return m && day ? `${m}-${day}-${y}` : d;
  };

  const COLS = [
    "Unique ID","Full Name","Date of Birth","Gender",
    "Contractor ID","Department","Sub-Department","Role","Location","Status","Hire Date",
    "Office Location","Currency","Monthly Rate","Weekly Rate","Hourly Rate","Email",
    "Pay Category","Shift Hours","Rest Day","Manager","Pay Period","Equipment Provided","Created On","Dismissal Date","Dismissal Reason","Action",
  ];

  return (
    <>
      {showAdd    && <AddContractorModal onClose={() => setShowAdd(false)} onSave={handleAddContractor} />}
      {editTarget && <AddContractorModal onClose={() => setEditTarget(null)} onSave={handleEditContractor} initial={editTarget} />}
      {showFilter && <FilterModal initialRules={activeRules} onApply={handleApplyFilters} onClose={() => setShowFilter(false)} />}
      {showImport && <ImportContractorsModal onClose={() => setShowImport(false)} onImport={handleImportContractors} />}

      <div className="p-4 sm:p-6 md:p-8 max-w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 md:mb-8 gap-4 max-w-full mx-auto">
          <div>
            <nav className="flex mb-2">
              <ol className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <li>Management</li>
                <li><LuBreadcrumb size={14} className="text-slate-400" /></li>
                <li className="text-teal-600">Contractor Details</li>
              </ol>
            </nav>
            <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">Contractor Details</h2>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all shadow-sm">
              <LuDownload size={16} strokeWidth={2} />
              Export
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all shadow-sm"
            >
              <LuUpload size={16} strokeWidth={2} />
              Import
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#003527] text-white rounded-xl text-sm font-semibold hover:bg-[#064E3B] transition-all shadow-md"
            >
              <LuUserPlus size={16} strokeWidth={2} />
              Add Contractor
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mb-4 max-w-full mx-auto">
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap gap-3 items-center">
            <span className="text-sm font-semibold text-slate-500 mr-1">Quick Filters:</span>
            <select value={country} onChange={(e) => { setCountry(e.target.value); setPage(1); }}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option>All Countries</option>
              <option>Philippines</option><option>Mexico</option>
              <option>India</option><option>USA</option>
            </select>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option>All Statuses</option>
              <option>Active</option>
              <option>Dismissed</option>
            </select>

            {/* Advanced filter trigger */}
            <button
              onClick={() => setShowFilter(true)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                activeRules.length > 0
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <LuSlidersHorizontal size={15} strokeWidth={2} />
              Advanced Filters
              {activeRules.length > 0 && (
                <span className="inline-flex items-center justify-center size-5 rounded-full bg-white text-teal-700 text-xs font-bold">
                  {activeRules.length}
                </span>
              )}
            </button>

            {(country !== "All Countries" || status !== "All Statuses" || activeRules.length > 0) && (
              <button onClick={reset} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Clear all filters">
                <LuX size={16} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {activeRules.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4 max-w-full mx-auto">
            {activeRules.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 border border-teal-200 text-teal-700 text-xs font-medium rounded-full">
                <span className="font-semibold capitalize">{r.column}</span>
                <span className="opacity-60">{r.operator.replace(/_/g, " ")}</span>
                {r.value && <span>&ldquo;{r.value}&rdquo;</span>}
                {r.value2 && <span>– &ldquo;{r.value2}&rdquo;</span>}
                <button onClick={() => removeRule(r.id)} className="ml-0.5 hover:text-red-500 transition-colors">
                  <LuX size={11} strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-full mx-auto">
          <div className="overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
            <table className="w-full text-left" style={{ minWidth: "2580px", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr style={{ background: "#003527" }}>
                  {/* Fixed columns */}
                  <th className="px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap sticky left-0 z-20 border-r border-white/20" style={{ minWidth: 130, background: "#003527" }}>Unique ID</th>
                  <th className="px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap sticky z-20 border-r border-white/20" style={{ left: 130, minWidth: 200, background: "#003527" }}>Full Name</th>
                  {/* Scrollable columns */}
                  {COLS.slice(2).map((h, i) => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap ${i < COLS.slice(2).length - 1 ? "border-r border-white/20" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={COLS.length} className="px-4 py-16 text-center text-slate-400 text-sm">
                      No contractors match your filters.
                    </td>
                  </tr>
                ) : rows.map((c) => (
                  <tr key={c.uid} className="hover:bg-slate-50 transition-colors cursor-pointer group">
                    {/* Fixed columns */}
                    <td className="px-4 py-2.5 text-sm text-slate-500 font-mono whitespace-nowrap sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200" style={{ minWidth: 130 }}>{c.uid}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap sticky z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200" style={{ left: 130, minWidth: 200 }}>
                      <div className="flex items-center gap-2.5">
                        <div className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor(c.avatar)}`}>
                          {c.avatar}
                        </div>
                        <span className="text-sm font-semibold text-[#003527] whitespace-nowrap">{c.fullName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap border-r border-slate-100">{fmtDate(c.dob)}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 border-r border-slate-100">{c.gender}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 font-mono border-r border-slate-100">{c.contractorId}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-900 whitespace-nowrap border-r border-slate-100">{c.department}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap border-r border-slate-100">{c.subDepartment}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap border-r border-slate-100">{c.role}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap border-r border-slate-100">{c.location}</td>
                    <td className="px-4 py-2.5 border-r border-slate-100">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_STYLES[c.status] ?? "bg-slate-100 text-slate-500"}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap border-r border-slate-100">{fmtDate(c.hireDate)}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap border-r border-slate-100">{c.officeLocation}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 border-r border-slate-100">{c.currency}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600 tabular-nums border-r border-slate-100">{c.monthlyRate.replace(/^(\$|₹|₱|MX\$)/, "")}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600 tabular-nums border-r border-slate-100">{c.weeklyRate.replace(/^(\$|₹|₱|MX\$)/, "")}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600 tabular-nums border-r border-slate-100">{c.hourlyRate.replace(/^(\$|₹|₱|MX\$)/, "")}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap border-r border-slate-100">{c.email}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 border-r border-slate-100">{c.payCategory}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap border-r border-slate-100">{c.shiftHours}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 border-r border-slate-100">{c.restDay}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap border-r border-slate-100">{c.manager}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap border-r border-slate-100" style={{ minWidth: 160 }}>Sunday – Saturday</td>
                    <td className="px-4 py-2.5 border-r border-slate-100 whitespace-nowrap">
                      {c.equipmentProvided
                        ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-700">Yes</span>
                        : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">No</span>}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap border-r border-slate-100">{fmtDate(c.createdOn)}</td>
                    <td className="px-4 py-2.5 text-sm whitespace-nowrap border-r border-slate-100">
                      {c.dismissalDate
                        ? <span className="text-red-500 font-medium">{fmtDate(c.dismissalDate)}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-sm border-r border-slate-100" style={{ minWidth: 200, maxWidth: 280 }}>
                      {c.dismissalReason
                        ? <span className="text-red-500">{c.dismissalReason}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditTarget(c)}
                        className="p-1.5 text-slate-400 hover:text-[#003527] transition-colors rounded-md hover:bg-slate-100"
                        title="Edit contractor"
                      >
                        <LuPencil size={15} strokeWidth={1.75} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">
              Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} contractors
            </p>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 border border-slate-200 rounded-lg hover:bg-white transition-colors disabled:opacity-40">
                <LuChevronLeft size={16} strokeWidth={2} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button key={n} onClick={() => setPage(n)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    n === page ? "bg-white border border-teal-600 text-teal-700 font-bold" : "text-slate-600 hover:bg-white"
                  }`}>
                  {n}
                </button>
              ))}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 border border-slate-200 rounded-lg hover:bg-white transition-colors disabled:opacity-40">
                <LuChevronRight size={16} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
