"use client";

import { useState, useRef, useCallback } from "react";
import {
  LuX, LuUpload, LuDownload, LuFileText, LuCircleCheck,
  LuCircleAlert, LuTriangleAlert, LuChevronDown, LuChevronUp,
} from "react-icons/lu";
import type { Contractor } from "@/app/admin/contractors/types";

// ── CSV column spec (matches modal fields) ────────────────────────────────────
const CSV_COLUMNS = [
  "first_name", "middle_name", "surname", "dob", "gender", "email",
  "department", "sub_department", "role", "country", "state",
  "office_location", "manager", "hire_date", "status", "pay_category",
  "shift_from", "shift_to", "rest_days", "currency", "monthly_rate",
];

const SAMPLE_ROWS = [
  [
    "John", "Paul", "Smith", "1990-06-15", "Male", "john.smith@company.com",
    "Solar Engineering", "Field Inspection", "Lead Inspector",
    "USA", "California", "OWE [AZ, Phoenix]", "Colten Warnock",
    "2023-01-10", "Active", "Hourly", "8:00 AM", "5:00 PM",
    "Saturday, Sunday", "USD", "5200",
  ],
  [
    "Maria", "Elena", "Lopez", "1994-03-22", "Female", "m.lopez@company.com",
    "Grid Maintenance", "High Voltage", "HV Technician",
    "Mexico", "Jalisco", "Allied Energy Solutions [TX, Midland]", "Dillard Blanton",
    "2023-04-01", "Active", "Fixed", "7:00 AM", "4:00 PM",
    "Sunday", "MXN", "32000",
  ],
];

function buildSampleCSV() {
  const header = CSV_COLUMNS.join(",");
  const rows   = SAMPLE_ROWS.map((r) =>
    r.map((v) => (v.includes(",") ? `"${v}"` : v)).join(",")
  );
  return [header, ...rows].join("\n");
}

function downloadSample() {
  const blob = new Blob([buildSampleCSV()], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "contractors_import_sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Validation helpers ────────────────────────────────────────────────────────
const VALID_STATUSES    = ["Active", "Dismissed"];
const VALID_PAY_CATS    = ["Hourly", "Fixed"];
const VALID_GENDERS     = ["Not Specified", "Male", "Female"];
const VALID_CURRENCIES  = ["PHP", "INR", "MXN", "USD"];
const EMAIL_RE          = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE           = /^\d{4}-\d{2}-\d{2}$/;

type RowResult = {
  row:    number;
  data:   Record<string, string>;
  errors: string[];
  status: "ok" | "warning" | "error";
};

function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cols.push(cur.trim());
    lines.push(cols);
  }
  return lines;
}

function validateRow(data: Record<string, string>, rowNum: number): RowResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data.first_name?.trim())  errors.push("first_name is required");
  if (!data.surname?.trim())     errors.push("surname is required");
  if (!data.email?.trim())       errors.push("email is required");
  else if (!EMAIL_RE.test(data.email)) errors.push("email is invalid");
  if (!data.hire_date?.trim())   errors.push("hire_date is required");
  else if (!DATE_RE.test(data.hire_date)) errors.push("hire_date must be YYYY-MM-DD");
  if (data.dob && !DATE_RE.test(data.dob)) errors.push("dob must be YYYY-MM-DD");
  if (data.status && !VALID_STATUSES.includes(data.status))
    errors.push(`status must be one of: ${VALID_STATUSES.join(", ")}`);
  if (data.pay_category && !VALID_PAY_CATS.includes(data.pay_category))
    errors.push(`pay_category must be one of: ${VALID_PAY_CATS.join(", ")}`);
  if (data.currency && !VALID_CURRENCIES.includes(data.currency))
    warnings.push(`currency "${data.currency}" is unrecognised`);
  if (data.gender && !VALID_GENDERS.includes(data.gender))
    warnings.push(`gender "${data.gender}" is unrecognised, defaulting to "Not Specified"`);
  if (data.monthly_rate && isNaN(parseFloat(data.monthly_rate)))
    errors.push("monthly_rate must be a number");

  const allIssues = [...errors, ...warnings];
  return {
    row:    rowNum,
    data,
    errors: allIssues,
    status: errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok",
  };
}

function rowToContractor(data: Record<string, string>): Contractor {
  const monthly = data.monthly_rate ?? "";
  const weekly  = monthly ? (parseFloat(monthly) / 4.33).toFixed(2)       : "—";
  const hourly  = monthly ? (parseFloat(monthly) / 4.33 / 40).toFixed(2)  : "—";
  const firstName  = data.first_name?.trim()  ?? "";
  const middleName = data.middle_name?.trim() ?? "";
  const surname    = data.surname?.trim()     ?? "";

  return {
    uid:           `UID-${Math.floor(10000 + Math.random() * 89999)}`,
    contractorId:  `#C-${Math.floor(1000 + Math.random() * 8999)}`,
    avatar:        ((firstName[0] ?? "") + (surname[0] ?? "")).toUpperCase(),
    fullName:      [firstName, middleName, surname].filter(Boolean).join(" "),
    createdOn:     new Date().toISOString().split("T")[0],
    firstName,
    middleName,
    surname,
    dob:           data.dob            ?? "",
    gender:        VALID_GENDERS.includes(data.gender) ? data.gender : "Not Specified",
    email:         data.email          ?? "",
    department:    data.department     ?? "",
    subDepartment: data.sub_department ?? "",
    role:          data.role           ?? "",
    location:      data.state ? `${data.state}, ${data.country}` : (data.country ?? ""),
    officeLocation:data.office_location ?? "",
    manager:       data.manager        ?? "",
    hireDate:      data.hire_date      ?? "",
    status:        VALID_STATUSES.includes(data.status) ? (data.status as "Active" | "Dismissed") : "Active",
    payCategory:   data.pay_category   ?? "",
    payPeriod:     "Sunday – Saturday",
    shiftType:     data.shift_type === "Flexible" ? "Flexible" : "Fixed",
    shiftHours:    data.shift_type === "Flexible" ? "Flexible" : (data.shift_from && data.shift_to ? `${data.shift_from} to ${data.shift_to}` : ""),
    restDay:       data.rest_days      ?? "—",
    currency:      data.currency       ?? "USD",
    monthlyRate:   monthly             || "—",
    weeklyRate:    weekly,
    hourlyRate:    hourly,
    dismissalDate:      data.status === "Dismissed" ? (data.dismissal_date   ?? "") : "",
    dismissalReason:    data.status === "Dismissed" ? (data.dismissal_reason ?? "") : "",
    equipmentProvided:  data.equipment_provided === "yes" || data.equipment_provided === "true",
    worksnapId:         String(data.worksnap_id ?? ""),
    ptoBalance:         0,
    ptoUsed:            0,
    sickLeaveBalance:   0,
    sickLeaveUsed:      0,
    birthdayLeave:      0,
    advanceSickLeave:   0,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Props = { onClose: () => void; onImport: (contractors: Contractor[]) => void };
type Step  = "upload" | "review" | "done";

const STATUS_ICON = {
  ok:      <LuCircleCheck  size={15} className="text-teal-500 shrink-0" />,
  warning: <LuTriangleAlert size={15} className="text-amber-500 shrink-0" />,
  error:   <LuCircleAlert  size={15} className="text-red-500 shrink-0"  />,
};

const STATUS_ROW = {
  ok:      "bg-teal-50   border-teal-100",
  warning: "bg-amber-50  border-amber-100",
  error:   "bg-red-50    border-red-100",
};

export function ImportContractorsModal({ onClose, onImport }: Props) {
  const [step,      setStep]      = useState<Step>("upload");
  const [dragging,  setDragging]  = useState(false);
  const [fileName,  setFileName]  = useState("");
  const [results,   setResults]   = useState<RowResult[]>([]);
  const [expanded,  setExpanded]  = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const okRows   = results.filter((r) => r.status !== "error");
  const errCount = results.filter((r) => r.status === "error").length;
  const warnCount= results.filter((r) => r.status === "warning").length;

  function processFile(file: File) {
    if (!file.name.endsWith(".csv")) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text  = (e.target?.result as string) ?? "";
      const lines = parseCSV(text);
      if (lines.length < 2) return;
      const header = lines[0].map((h) => h.toLowerCase().replace(/\s+/g, "_"));
      const parsed: RowResult[] = lines.slice(1).map((cols, i) => {
        const data: Record<string, string> = {};
        header.forEach((h, j) => { data[h] = cols[j] ?? ""; });
        return validateRow(data, i + 2);
      });
      setResults(parsed);
      setStep("review");
    };
    reader.readAsText(file);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  function toggleExpand(row: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(row)) { next.delete(row); } else { next.add(row); }
      return next;
    });
  }

  function handleConfirmImport() {
    const contractors = okRows.map((r) => rowToContractor(r.data));
    onImport(contractors);
    setStep("done");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[#003527] text-white grid place-items-center">
              <LuUpload size={17} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#003527]">Import Contractors</h3>
              <p className="text-xs text-slate-400">Upload a CSV file to add multiple contractors at once</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <LuX size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 pb-2 flex items-center gap-2">
          {(["upload", "review", "done"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full transition-all ${
                step === s
                  ? "bg-[#003527] text-white"
                  : i < ["upload","review","done"].indexOf(step)
                    ? "bg-teal-100 text-teal-700"
                    : "bg-slate-100 text-slate-400"
              }`}>
                <span>{i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}</span>
              </div>
              {i < 2 && <div className="w-6 h-px bg-slate-200" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* ── Step 1: Upload ── */}
          {step === "upload" && (
            <div className="space-y-4">
              {/* Sample download */}
              <div className="flex items-center justify-between p-3 bg-teal-50 border border-teal-200 rounded-xl">
                <div className="flex items-center gap-2 text-sm text-teal-800">
                  <LuFileText size={16} className="shrink-0" />
                  <span>Download the sample CSV to see the required format</span>
                </div>
                <button
                  onClick={downloadSample}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#003527] text-white text-xs font-semibold rounded-lg hover:bg-[#064E3B] transition-colors"
                >
                  <LuDownload size={13} strokeWidth={2} />
                  Sample CSV
                </button>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all select-none ${
                  dragging
                    ? "border-teal-500 bg-teal-50"
                    : "border-slate-200 hover:border-teal-400 hover:bg-slate-50"
                }`}
              >
                <LuUpload size={32} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-semibold text-slate-600 mb-1">Drag & drop your CSV here</p>
                <p className="text-xs text-slate-400">or click to browse — .csv files only</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
                />
              </div>

              {/* Column reference */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Required CSV columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {CSV_COLUMNS.map((col) => (
                    <span key={col} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded font-mono">{col}</span>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  weekly_rate and hourly_rate are auto-calculated from monthly_rate — do not include them.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 2: Review ── */}
          {step === "review" && (
            <div className="space-y-3">
              {/* Summary bar */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <p className="text-2xl font-bold text-slate-800">{results.length}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Total Rows</p>
                </div>
                <div className="p-3 bg-teal-50 rounded-xl border border-teal-200 text-center">
                  <p className="text-2xl font-bold text-teal-700">{okRows.length}</p>
                  <p className="text-xs text-teal-600 mt-0.5">Will Import</p>
                </div>
                <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-center">
                  <p className="text-2xl font-bold text-red-600">{errCount}</p>
                  <p className="text-xs text-red-500 mt-0.5">Skipped (errors)</p>
                </div>
              </div>

              {warnCount > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {warnCount} row{warnCount > 1 ? "s" : ""} have warnings but will still be imported with defaults applied.
                </p>
              )}

              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Row-by-row status — {fileName}</p>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {results.map((r) => (
                  <div key={r.row} className={`rounded-lg border ${STATUS_ROW[r.status]}`}>
                    <button
                      type="button"
                      onClick={() => r.errors.length > 0 && toggleExpand(r.row)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left"
                    >
                      {STATUS_ICON[r.status]}
                      <span className="text-xs font-semibold text-slate-700 flex-1">
                        Row {r.row} — {r.data.first_name} {r.data.surname}
                        {r.data.email && <span className="font-normal text-slate-400 ml-1">({r.data.email})</span>}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        r.status === "ok"      ? "bg-teal-100 text-teal-700" :
                        r.status === "warning" ? "bg-amber-100 text-amber-700" :
                                                 "bg-red-100 text-red-600"
                      }`}>
                        {r.status === "ok" ? "Ready" : r.status === "warning" ? "Warning" : "Error"}
                      </span>
                      {r.errors.length > 0 && (
                        expanded.has(r.row) ? <LuChevronUp size={13} className="text-slate-400" /> : <LuChevronDown size={13} className="text-slate-400" />
                      )}
                    </button>
                    {expanded.has(r.row) && r.errors.length > 0 && (
                      <ul className="px-4 pb-2 space-y-0.5">
                        {r.errors.map((err, i) => (
                          <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                            <span className="mt-0.5">•</span>{err}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3: Done ── */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div className="size-16 rounded-full bg-teal-100 flex items-center justify-center">
                <LuCircleCheck size={36} className="text-teal-600" />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-[#003527] mb-1">Import Successful</p>
                <p className="text-sm text-slate-500">
                  {okRows.length} contractor{okRows.length !== 1 ? "s" : ""} added to the directory.
                  {errCount > 0 && ` ${errCount} row${errCount > 1 ? "s" : ""} were skipped due to errors.`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-2 px-6 py-2.5 bg-[#003527] text-white text-sm font-semibold rounded-xl hover:bg-[#064E3B] transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== "done" && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 rounded-b-2xl">
            <button
              type="button"
              onClick={step === "upload" ? onClose : () => { setStep("upload"); setResults([]); }}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
            >
              {step === "upload" ? "Cancel" : "← Back"}
            </button>
            {step === "review" && (
              <button
                onClick={handleConfirmImport}
                disabled={okRows.length === 0}
                className="px-5 py-2 bg-[#003527] hover:bg-[#064E3B] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2"
              >
                <LuUpload size={15} strokeWidth={2} />
                Import {okRows.length} Contractor{okRows.length !== 1 ? "s" : ""}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
