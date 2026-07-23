"use client";

import { useState, useRef, useCallback } from "react";
import {
  LuX, LuUpload, LuDownload, LuFileText, LuCircleCheck,
  LuCircleAlert, LuUmbrella, LuStethoscope,
} from "react-icons/lu";
import { bulkImportUsedImport } from "@/app/admin/contractors/actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LeaveType = "pto" | "sick";

type ParsedRow = {
  row: number;
  email: string;
  hours: string;
  error?: string;
};

type SavedRow = {
  email: string;
  ok: boolean;
  error?: string;
};

function parseCSV(text: string): string[][] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
}

function validateRow(email: string, hours: string, row: number): ParsedRow {
  if (!email) return { row, email, hours, error: "email is required" };
  if (!EMAIL_RE.test(email)) return { row, email, hours, error: "email is invalid" };
  if (!hours || isNaN(parseFloat(hours)) || parseFloat(hours) < 0) {
    return { row, email, hours, error: "hours must be a non-negative number" };
  }
  return { row, email, hours };
}

function buildSampleCSV() {
  return ["email,hours", "john.smith@company.com,40", "m.lopez@company.com,16"].join("\n");
}

function downloadSample() {
  const blob = new Blob([buildSampleCSV()], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "pto_sick_used_import_sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type Props = { onClose: () => void; onImported: () => void };
type Step  = "upload" | "review" | "done";

export function PtoSickUsedImportModal({ onClose, onImported }: Props) {
  const [leaveType, setLeaveType] = useState<LeaveType>("pto");
  const [step,      setStep]      = useState<Step>("upload");
  const [dragging,  setDragging]  = useState(false);
  const [fileName,  setFileName]  = useState("");
  const [rows,      setRows]      = useState<ParsedRow[]>([]);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedRows, setSavedRows] = useState<SavedRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const validRows = rows.filter((r) => !r.error);
  const errCount  = rows.filter((r) => r.error).length;
  const failedRows = savedRows.filter((r) => !r.ok);

  function processFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text  = (e.target?.result as string) ?? "";
      const lines = parseCSV(text);
      if (lines.length < 2) return;
      const header = lines[0].map((h) => h.toLowerCase());
      const emailIdx = header.indexOf("email");
      const hoursIdx = header.indexOf("hours");
      const parsed: ParsedRow[] = lines.slice(1).map((cols, i) =>
        validateRow(
          emailIdx >= 0 ? (cols[emailIdx] ?? "") : (cols[0] ?? ""),
          hoursIdx >= 0 ? (cols[hoursIdx] ?? "") : (cols[1] ?? ""),
          i + 2,
        )
      );
      setRows(parsed);
      setStep("review");
    };
    reader.readAsText(file);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  async function handleConfirmImport() {
    setSaving(true);
    setSaveError("");
    try {
      const { results } = await bulkImportUsedImport(
        leaveType,
        validRows.map((r) => ({ email: r.email, hours: parseFloat(r.hours) })),
      );
      setSavedRows(results);
      setStep("done");
      onImported();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Import failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const columnLabel = leaveType === "pto" ? "PTO Used Import" : "Sick Used Import";

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
              <h3 className="text-lg font-bold text-[#003527]">PTO / Sick Used Import</h3>
              <p className="text-xs text-slate-400">Bulk-set the imported {columnLabel} baseline from a CSV</p>
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
                  : i < ["upload", "review", "done"].indexOf(step)
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
              {/* PTO / Sick selector */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Which balance is this import for?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLeaveType("pto")}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                      leaveType === "pto"
                        ? "border-teal-500 bg-teal-50 text-teal-700"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <LuUmbrella size={15} strokeWidth={2} /> PTO
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeaveType("sick")}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                      leaveType === "sick"
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <LuStethoscope size={15} strokeWidth={2} /> Sick
                  </button>
                </div>
              </div>

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

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Required CSV columns</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded font-mono">email</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded font-mono">hours</span>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Each row sets the {columnLabel} value for the contractor matching that email — existing values are overwritten.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 2: Review ── */}
          {step === "review" && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <p className="text-2xl font-bold text-slate-800">{rows.length}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Total Rows</p>
                </div>
                <div className="p-3 bg-teal-50 rounded-xl border border-teal-200 text-center">
                  <p className="text-2xl font-bold text-teal-700">{validRows.length}</p>
                  <p className="text-xs text-teal-600 mt-0.5">Will Import</p>
                </div>
                <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-center">
                  <p className="text-2xl font-bold text-red-600">{errCount}</p>
                  <p className="text-xs text-red-500 mt-0.5">Skipped (errors)</p>
                </div>
              </div>

              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Setting {columnLabel} — {fileName}
              </p>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {rows.map((r) => (
                  <div key={r.row} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${r.error ? "bg-red-50 border-red-100" : "bg-teal-50 border-teal-100"}`}>
                    {r.error ? <LuCircleAlert size={15} className="text-red-500 shrink-0" /> : <LuCircleCheck size={15} className="text-teal-500 shrink-0" />}
                    <span className="text-xs font-semibold text-slate-700 flex-1">
                      Row {r.row} — {r.email || "(no email)"}
                      {!r.error && <span className="font-normal text-slate-400 ml-1">({r.hours}h)</span>}
                    </span>
                    {r.error && <span className="text-xs text-red-600">{r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3: Done ── */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div className={`size-16 rounded-full flex items-center justify-center ${failedRows.length === 0 ? "bg-teal-100" : "bg-amber-100"}`}>
                {failedRows.length === 0
                  ? <LuCircleCheck size={36} className="text-teal-600" />
                  : <LuCircleAlert size={36} className="text-amber-600" />}
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-[#003527] mb-1">
                  {failedRows.length === 0 ? "Import Successful" : "Import Finished With Errors"}
                </p>
                <p className="text-sm text-slate-500">
                  {savedRows.length - failedRows.length} of {savedRows.length} row{savedRows.length !== 1 ? "s" : ""} saved.
                  {failedRows.length > 0 && ` ${failedRows.length} failed — see below.`}
                </p>
              </div>
              {failedRows.length > 0 && (
                <div className="w-full space-y-1.5 max-h-48 overflow-y-auto">
                  {failedRows.map((r) => (
                    <div key={r.email} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-red-50 border-red-100">
                      <LuCircleAlert size={13} className="text-red-500 shrink-0" />
                      <span className="text-xs font-semibold text-slate-700 flex-1">{r.email}</span>
                      <span className="text-xs text-red-600">{r.error}</span>
                    </div>
                  ))}
                </div>
              )}
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
              onClick={step === "upload" ? onClose : () => { setStep("upload"); setRows([]); }}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
            >
              {step === "upload" ? "Cancel" : "← Back"}
            </button>
            {step === "review" && (
              <div className="flex items-center gap-3">
                {saveError && <p className="text-sm font-medium text-red-600">{saveError}</p>}
                <button
                  onClick={handleConfirmImport}
                  disabled={validRows.length === 0 || saving}
                  className="px-5 py-2 bg-[#003527] hover:bg-[#064E3B] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2"
                >
                  <LuUpload size={15} strokeWidth={2} />
                  {saving ? "Saving…" : `Import ${validRows.length} Row${validRows.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
