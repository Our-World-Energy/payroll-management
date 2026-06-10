"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  LuDownload, LuUserPlus, LuChevronLeft, LuChevronRight,
  LuPencil, LuChevronRight as LuBreadcrumb,
  LuSlidersHorizontal, LuX, LuUpload, LuRefreshCw, LuTrash2, LuTriangle,
} from "react-icons/lu";
import type { Contractor, FilterRule } from "./types";
import { AddContractorModal } from "@/components/AddContractorModal";
import { ImportContractorsModal } from "@/components/ImportContractorsModal";
import { FilterModal } from "@/components/FilterModal";
import {
  fetchContractorsPage,
  fetchAllContractors,
  createContractor,
  updateContractor,
  deleteContractor,
  type FetchParams,
} from "./actions";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Module-level cache — survives navigation, cleared when filters/page change.
type CacheEntry = { rows: Contractor[]; total: number; key: string };
let pageCache: CacheEntry | null = null;

function cacheKey(page: number, pageSize: number, country: string, status: string, rules: FilterRule[]) {
  return `${page}|${pageSize}|${country}|${status}|${JSON.stringify(rules)}`;
}

const STATUS_STYLES: Record<string, string> = {
  Active:    "bg-teal-100 text-teal-800",
  Dismissed: "bg-red-100 text-red-700",
};

const AVATAR_BG = [
  "bg-emerald-100 text-emerald-700",
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
  "bg-amber-100 text-amber-700",
  "bg-slate-200 text-slate-600",
];

function avatarColor(uid: string) {
  let n = 0;
  for (let i = 0; i < uid.length; i++) n += uid.charCodeAt(i);
  return AVATAR_BG[n % AVATAR_BG.length];
}

function fmtDate(d: string) {
  if (!d || d === "—") return d || "—";
  const [y, m, day] = d.split("-");
  return m && day ? `${m}-${day}-${y}` : d;
}

// Export all filtered rows as CSV
function exportCSV(rows: Contractor[]) {
  const headers = [
    "Unique ID","First Name","Middle Name","Surname","Full Name","DOB","Gender",
    "Contractor ID","Department","Sub-Department","Role","Location","Status",
    "Hire Date","Office Location","Currency","Monthly Rate","Weekly Rate","Hourly Rate",
    "Email","Pay Category","Shift Hours","Rest Day","Manager","Pay Period","Shift Type",
    "Equipment Provided","Created On","Dismissal Date","Dismissal Reason",
  ];
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    headers.join(","),
    ...rows.map((c) => [
      c.uid, c.firstName, c.middleName, c.surname, c.fullName, c.dob, c.gender,
      c.contractorId, c.department, c.subDepartment, c.role, c.location, c.status,
      c.hireDate, c.officeLocation, c.currency, c.monthlyRate, c.weeklyRate, c.hourlyRate,
      c.email, c.payCategory, c.shiftHours, c.restDay, c.manager, c.payPeriod, c.shiftType,
      c.equipmentProvided ? "Yes" : "No", c.createdOn, c.dismissalDate, c.dismissalReason,
    ].map(escape).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "contractors.csv"; a.click();
  URL.revokeObjectURL(url);
}

// Pagination page numbers with ellipsis
function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [];
  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, "…", total);
  } else if (current >= total - 3) {
    pages.push(1, "…", total - 4, total - 3, total - 2, total - 1, total);
  } else {
    pages.push(1, "…", current - 1, current, current + 1, "…", total);
  }
  return pages;
}

const COLS = [
  "Unique ID","Full Name","Date of Birth","Gender",
  "Contractor ID","Department","Sub-Department","Role","Location","Status","Hire Date",
  "Office Location","Currency","Monthly Rate","Weekly Rate","Hourly Rate","Email",
  "Pay Category","Shift Hours","Rest Day","Manager","Pay Period","Equipment Provided",
  "Worksnap ID","Created On","Dismissal Date","Dismissal Reason","Action",
];

export default function ContractorsPage() {
  const [rows, setRows]           = useState<Contractor[]>(pageCache?.rows ?? []);
  const [total, setTotal]         = useState(pageCache?.total ?? 0);
  const [loading, setLoading]     = useState(pageCache === null);
  const [saving, setSaving]       = useState(false);
  const [exporting, setExporting] = useState(false);

  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(25);
  const [country, setCountry]     = useState("All Countries");
  const [status, setStatus]       = useState("All Statuses");
  const [activeRules, setActiveRules] = useState<FilterRule[]>([]);

  const [showAdd, setShowAdd]         = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [editTarget, setEditTarget]   = useState<Contractor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contractor | null>(null);
  const [deleting, setDeleting]       = useState(false);
  const [showFilter, setShowFilter]   = useState(false);

  // Debounce ref — cancel in-flight fetch when params change
  const fetchIdRef = useRef(0);

  const loadPage = useCallback(async (
    p: number, ps: number, c: string, s: string, rules: FilterRule[],
    { force = false } = {}
  ) => {
    const key = cacheKey(p, ps, c, s, rules);
    // Serve from cache unless forced (e.g. after add/edit/import)
    if (!force && pageCache?.key === key) {
      setRows(pageCache.rows);
      setTotal(pageCache.total);
      setLoading(false);
      return;
    }
    const id = ++fetchIdRef.current;
    setLoading(true);
    try {
      const params: FetchParams = { page: p, pageSize: ps, country: c, status: s, rules };
      const result = await fetchContractorsPage(params);
      if (id !== fetchIdRef.current) return; // stale
      pageCache = { rows: result.rows, total: result.total, key };
      setRows(result.rows);
      setTotal(result.total);
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage(page, pageSize, country, status, activeRules);
  }, [page, pageSize, country, status, activeRules, loadPage]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function changeFilter(newCountry: string, newStatus: string, newRules: FilterRule[]) {
    setCountry(newCountry);
    setStatus(newStatus);
    setActiveRules(newRules);
    setPage(1);
  }

  function removeRule(id: string) {
    const next = activeRules.filter((x) => x.id !== id);
    setActiveRules(next);
    setPage(1);
  }

  const reset = () => changeFilter("All Countries", "All Statuses", []);

  async function handleExport() {
    setExporting(true);
    try {
      const all = await fetchAllContractors({ country, status, rules: activeRules });
      exportCSV(all);
    } finally {
      setExporting(false);
    }
  }

  async function handleAddContractor(c: Contractor) {
    setSaving(true);
    try {
      await createContractor(c);
      pageCache = null;
      setPage(1);
      await loadPage(1, pageSize, country, status, activeRules, { force: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleEditContractor(c: Contractor) {
    setSaving(true);
    try {
      await updateContractor(c);
      pageCache = null;
      await loadPage(page, pageSize, country, status, activeRules, { force: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleImportContractors(contractors: Contractor[]) {
    setSaving(true);
    try {
      await Promise.all(contractors.map((c) => createContractor(c)));
      pageCache = null;
      setPage(1);
      await loadPage(1, pageSize, country, status, activeRules, { force: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteContractor(deleteTarget.uid);
      pageCache = null;
      setDeleteTarget(null);
      // If we just deleted the last row on this page, go back one
      const newPage = rows.length === 1 && page > 1 ? page - 1 : page;
      setPage(newPage);
      await loadPage(newPage, pageSize, country, status, activeRules, { force: true });
    } finally {
      setDeleting(false);
    }
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  return (
    <>
      {showAdd    && <AddContractorModal onClose={() => setShowAdd(false)} onSave={handleAddContractor} />}
      {editTarget && <AddContractorModal onClose={() => setEditTarget(null)} onSave={handleEditContractor} initial={editTarget} />}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-4">
              <div className="shrink-0 size-11 rounded-xl bg-red-50 flex items-center justify-center">
                <LuTriangle size={22} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Delete Contractor</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Are you sure you want to delete <span className="font-semibold text-slate-700">{deleteTarget.fullName}</span>?
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                <LuTrash2 size={15} strokeWidth={2} />
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showFilter && (
        <FilterModal
          initialRules={activeRules}
          onApply={(rules) => { setActiveRules(rules); setPage(1); }}
          onClose={() => setShowFilter(false)}
        />
      )}
      {showImport && <ImportContractorsModal onClose={() => setShowImport(false)} onImport={handleImportContractors} />}

      <div className="p-4 sm:p-6 md:p-8 max-w-full overflow-x-hidden">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 md:mb-8 gap-4">
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
            <button
              onClick={() => { pageCache = null; loadPage(page, pageSize, country, status, activeRules, { force: true }); }}
              disabled={loading}
              title="Refresh"
              className="inline-flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
            >
              <LuRefreshCw size={16} strokeWidth={2} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || total === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
            >
              <LuDownload size={16} strokeWidth={2} className={exporting ? "animate-bounce" : ""} />
              {exporting ? "Exporting…" : "Export"}
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
        <div className="mb-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap gap-3 items-center">
            <span className="text-sm font-semibold text-slate-500 mr-1">Quick Filters:</span>

            <select
              value={country}
              onChange={(e) => changeFilter(e.target.value, status, activeRules)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option>All Countries</option>
              <option>Philippines</option>
              <option>Mexico</option>
              <option>India</option>
              <option>USA</option>
            </select>

            <select
              value={status}
              onChange={(e) => changeFilter(country, e.target.value, activeRules)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option>All Statuses</option>
              <option>Active</option>
              <option>Dismissed</option>
            </select>

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
              <button
                onClick={reset}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Clear all filters"
              >
                <LuX size={16} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {activeRules.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
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

        {/* Table card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          <div className="overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
            <table
              className="w-full text-left"
              style={{ minWidth: "2580px", borderCollapse: "separate", borderSpacing: 0 }}
            >
              <thead>
                <tr style={{ background: "#003527" }}>
                  <th className="px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap sticky left-0 z-20 border-r border-white/20"
                    style={{ minWidth: 130, background: "#003527" }}>
                    Unique ID
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap sticky z-20 border-r border-white/20"
                    style={{ left: 130, minWidth: 200, background: "#003527" }}>
                    Full Name
                  </th>
                  {COLS.slice(2).map((h, i) => (
                    <th key={h}
                      className={`px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap ${
                        i < COLS.slice(2).length - 1 ? "border-r border-white/20" : ""
                      }`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100" style={{ minHeight: 400 }}>
                {loading ? (
                  // Skeleton rows
                  Array.from({ length: Math.min(pageSize, 8) }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-3 sticky left-0 bg-white border-r border-slate-200" style={{ minWidth: 130 }}>
                        <div className="h-3 bg-slate-100 rounded w-20" />
                      </td>
                      <td className="px-4 py-3 sticky bg-white border-r border-slate-200" style={{ left: 130, minWidth: 200 }}>
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-slate-100 shrink-0" />
                          <div className="h-3 bg-slate-100 rounded w-32" />
                        </div>
                      </td>
                      {COLS.slice(2, -1).map((h) => (
                        <td key={h} className="px-4 py-3 border-r border-slate-100">
                          <div className="h-3 bg-slate-100 rounded w-16" />
                        </td>
                      ))}
                      <td className="px-4 py-3" />
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={COLS.length} className="px-4 text-center text-slate-400 text-sm" style={{ height: 300 }}>
                      {total === 0 && country === "All Countries" && status === "All Statuses" && activeRules.length === 0
                        ? <>No contractors yet.<br />Click <strong>Add Contractor</strong> to get started.</>
                        : "No contractors match your filters."
                      }
                    </td>
                  </tr>
                ) : rows.map((c) => (
                  <tr key={c.uid} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-2.5 text-sm text-slate-500 font-mono whitespace-nowrap sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200" style={{ minWidth: 130 }}>
                      {c.uid}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap sticky z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200" style={{ left: 130, minWidth: 200 }}>
                      <div className="flex items-center gap-2.5">
                        <div className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor(c.uid)}`}>
                          {c.avatar || (c.firstName[0] ?? "") + (c.surname[0] ?? "")}
                        </div>
                        <span className="text-sm font-semibold text-[#003527]">{c.fullName}</span>
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
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap border-r border-slate-100" style={{ minWidth: 160 }}>{c.payPeriod}</td>
                    <td className="px-4 py-2.5 border-r border-slate-100 whitespace-nowrap">
                      {c.equipmentProvided
                        ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-700">Yes</span>
                        : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">No</span>}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 font-mono whitespace-nowrap border-r border-slate-100">
                      {c.worksnapId || <span className="text-slate-300">—</span>}
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
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditTarget(c)}
                          className="p-1.5 text-slate-400 hover:text-[#003527] transition-colors rounded-md hover:bg-slate-100"
                          title="Edit contractor"
                        >
                          <LuPencil size={15} strokeWidth={1.75} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(c)}
                          className="p-1.5 text-slate-400 hover:text-red-600 transition-colors rounded-md hover:bg-red-50"
                          title="Delete contractor"
                        >
                          <LuTrash2 size={15} strokeWidth={1.75} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">

            {/* Left: count + rows-per-page */}
            <div className="flex items-center gap-4">
              <p className="text-xs text-slate-500 font-medium whitespace-nowrap">
                {total === 0 ? "0 contractors" : `${from}–${to} of ${total} contractors`}
                {saving && <span className="ml-2 text-teal-600 font-semibold">Saving…</span>}
              </p>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-slate-400 whitespace-nowrap">Rows per page:</label>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Right: page buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="p-1.5 border border-slate-200 rounded-lg hover:bg-white transition-colors disabled:opacity-40"
              >
                <LuChevronLeft size={16} strokeWidth={2} />
              </button>

              {pageNumbers(page, totalPages).map((n, i) =>
                n === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-1.5 text-slate-400 text-sm select-none">…</span>
                ) : (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    disabled={loading}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      n === page
                        ? "bg-white border border-teal-600 text-teal-700 font-bold"
                        : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    {n}
                  </button>
                )
              )}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
                className="p-1.5 border border-slate-200 rounded-lg hover:bg-white transition-colors disabled:opacity-40"
              >
                <LuChevronRight size={16} strokeWidth={2} />
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
