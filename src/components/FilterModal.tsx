"use client";

import { useState } from "react";
import { LuX, LuPlus, LuTrash2, LuSlidersHorizontal } from "react-icons/lu";
import type { FilterRule, ColumnDef } from "@/app/admin/contractors/types";
import { COLUMNS } from "@/app/admin/contractors/types";
import type { Contractor } from "@/app/admin/contractors/types";

type Props = {
  initialRules: FilterRule[];
  onApply: (rules: FilterRule[]) => void;
  onClose: () => void;
};

const STRING_OPS = [
  { value: "contains",    label: "Contains" },
  { value: "not_contains",label: "Does not contain" },
  { value: "starts_with", label: "Starts with" },
  { value: "ends_with",   label: "Ends with" },
  { value: "equals",      label: "Equals" },
  { value: "not_equals",  label: "Not equals" },
  { value: "is_empty",    label: "Is empty" },
  { value: "is_not_empty",label: "Is not empty" },
];

const NUMBER_OPS = [
  { value: "eq",  label: "= Equals" },
  { value: "neq", label: "≠ Not equals" },
  { value: "gt",  label: "> Greater than" },
  { value: "gte", label: "≥ Greater or equal" },
  { value: "lt",  label: "< Less than" },
  { value: "lte", label: "≤ Less or equal" },
  { value: "between", label: "Between" },
];

const DATE_OPS = [
  { value: "date_eq",      label: "On date" },
  { value: "date_before",  label: "Before" },
  { value: "date_after",   label: "After" },
  { value: "date_between", label: "Between" },
];

function getOps(type: ColumnDef["type"]) {
  if (type === "number") return NUMBER_OPS;
  if (type === "date")   return DATE_OPS;
  return STRING_OPS;
}

function needsSecondValue(op: string) {
  return op === "between" || op === "date_between";
}

function noValueNeeded(op: string) {
  return op === "is_empty" || op === "is_not_empty";
}

function makeRule(): FilterRule {
  return { id: crypto.randomUUID(), column: "firstName", operator: "contains", value: "" };
}

function extractNumber(v: string) {
  return parseFloat(v.replace(/[^0-9.-]/g, ""));
}

export function applyFilters(data: Contractor[], rules: FilterRule[]): Contractor[] {
  return data.filter((row) =>
    rules.every((rule) => {
      const colDef = COLUMNS.find((c) => c.key === rule.column);
      if (!colDef) return true;
      const raw = String(row[rule.column] ?? "");
      const val = rule.value.toLowerCase().trim();

      if (colDef.type === "string") {
        const cell = raw.toLowerCase();
        switch (rule.operator) {
          case "contains":     return cell.includes(val);
          case "not_contains": return !cell.includes(val);
          case "starts_with":  return cell.startsWith(val);
          case "ends_with":    return cell.endsWith(val);
          case "equals":       return cell === val;
          case "not_equals":   return cell !== val;
          case "is_empty":     return cell === "";
          case "is_not_empty": return cell !== "";
          default: return true;
        }
      }

      if (colDef.type === "number") {
        const cellNum = extractNumber(raw);
        const v1 = parseFloat(rule.value);
        const v2 = parseFloat(rule.value2 ?? "");
        if (isNaN(cellNum)) return false;
        switch (rule.operator) {
          case "eq":      return cellNum === v1;
          case "neq":     return cellNum !== v1;
          case "gt":      return cellNum > v1;
          case "gte":     return cellNum >= v1;
          case "lt":      return cellNum < v1;
          case "lte":     return cellNum <= v1;
          case "between": return cellNum >= v1 && cellNum <= v2;
          default: return true;
        }
      }

      if (colDef.type === "date") {
        const cellDate = new Date(raw);
        const d1 = new Date(rule.value);
        const d2 = new Date(rule.value2 ?? "");
        if (isNaN(cellDate.getTime())) return false;
        switch (rule.operator) {
          case "date_eq":      return cellDate.toDateString() === d1.toDateString();
          case "date_before":  return cellDate < d1;
          case "date_after":   return cellDate > d1;
          case "date_between": return cellDate >= d1 && cellDate <= d2;
          default: return true;
        }
      }

      return true;
    })
  );
}

export function FilterModal({ initialRules, onApply, onClose }: Props) {
  const [rules, setRules] = useState<FilterRule[]>(
    initialRules.length > 0 ? initialRules : [makeRule()]
  );

  function addRule() { setRules((r) => [...r, makeRule()]); }
  function removeRule(id: string) { setRules((r) => r.filter((x) => x.id !== id)); }

  function updateRule(id: string, patch: Partial<FilterRule>) {
    setRules((r) =>
      r.map((x) => {
        if (x.id !== id) return x;
        const updated = { ...x, ...patch };
        // When column changes, reset operator to first valid op
        if (patch.column) {
          const colDef = COLUMNS.find((c) => c.key === patch.column);
          const ops = getOps(colDef?.type ?? "string");
          updated.operator = ops[0].value;
          updated.value = "";
          updated.value2 = "";
        }
        // When operator changes, clear values
        if (patch.operator) {
          updated.value = "";
          updated.value2 = "";
        }
        return updated;
      })
    );
  }

  function handleApply() {
    const valid = rules.filter((r) => noValueNeeded(r.operator) || r.value.trim() !== "");
    onApply(valid);
    onClose();
  }

  function handleClear() { onApply([]); onClose(); }

  const INPUT = "border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[#003527] text-white grid place-items-center">
              <LuSlidersHorizontal size={18} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#003527]">Advanced Filters</h3>
              <p className="text-xs text-slate-400">Filter by any column with type-aware conditions</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <LuX size={18} />
          </button>
        </div>

        {/* Rules */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {rules.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No filters added yet. Click &quot;+ Add Filter&quot; to start.</p>
          )}

          {rules.map((rule, idx) => {
            const colDef = COLUMNS.find((c) => c.key === rule.column)!;
            const ops = getOps(colDef.type);
            const noVal = noValueNeeded(rule.operator);
            const twoVals = needsSecondValue(rule.operator);

            return (
              <div key={rule.id} className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                {/* Top row: label + column + type badge + operator + remove */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-400 w-12 shrink-0 text-center">
                    {idx === 0 ? "WHERE" : "AND"}
                  </span>

                  {/* Column */}
                  <select
                    value={rule.column}
                    onChange={(e) => updateRule(rule.id, { column: e.target.value as keyof Contractor })}
                    className={INPUT + " w-40"}
                  >
                    {COLUMNS.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>

                  {/* Type badge */}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${
                    colDef.type === "date"   ? "bg-blue-50 text-blue-600" :
                    colDef.type === "number" ? "bg-amber-50 text-amber-600" :
                    "bg-slate-100 text-slate-500"
                  }`}>
                    {colDef.type}
                  </span>

                  {/* Operator */}
                  <select
                    value={rule.operator}
                    onChange={(e) => updateRule(rule.id, { operator: e.target.value })}
                    className={INPUT + " w-44"}
                  >
                    {ops.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>

                  {/* Value(s) inline when single value */}
                  {!noVal && !twoVals && (
                    <input
                      type={colDef.type === "date" ? "date" : colDef.type === "number" ? "number" : "text"}
                      value={rule.value}
                      onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                      placeholder={colDef.type === "number" ? "0" : "value..."}
                      className={INPUT + " flex-1 min-w-25"}
                    />
                  )}

                  {/* Remove */}
                  <button
                    onClick={() => removeRule(rule.id)}
                    className="ml-auto p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  >
                    <LuTrash2 size={15} strokeWidth={2} />
                  </button>
                </div>

                {/* Between inputs on second row */}
                {twoVals && (
                  <div className="flex items-center gap-2 mt-2 pl-14">
                    <input
                      type={colDef.type === "date" ? "date" : "number"}
                      value={rule.value}
                      onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                      placeholder={colDef.type === "number" ? "from" : ""}
                      className={INPUT + " flex-1"}
                    />
                    <span className="text-xs text-slate-400 shrink-0">and</span>
                    <input
                      type={colDef.type === "date" ? "date" : "number"}
                      value={rule.value2 ?? ""}
                      onChange={(e) => updateRule(rule.id, { value2: e.target.value })}
                      placeholder={colDef.type === "number" ? "to" : ""}
                      className={INPUT + " flex-1"}
                    />
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={addRule}
            className="flex items-center gap-2 text-sm font-semibold text-teal-600 hover:text-teal-800 mt-1 px-2 py-1 rounded-lg hover:bg-teal-50 transition-colors"
          >
            <LuPlus size={15} strokeWidth={2} />
            Add Filter
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 rounded-b-2xl">
          <button
            onClick={handleClear}
            className="px-4 py-2 text-sm font-semibold text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            Clear All Filters
          </button>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-5 py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2"
            >
              <LuSlidersHorizontal size={15} strokeWidth={2} />
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
