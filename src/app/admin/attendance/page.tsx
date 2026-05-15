"use client";

import { useState, useRef, useEffect } from "react";
import { LuCircleCheck, LuCircleAlert, LuClock, LuUsers, LuFileText, LuRefreshCw, LuCalendar, LuEye, LuMessageSquare, LuX } from "react-icons/lu";
import { ATTENDANCE } from "@/lib/data";

const WEEKS = [
  { label: "Week 20 (May 11 - 17)", key: "w20" },
  { label: "Week 19 (May 4 - 10)",  key: "w19" },
];

function DateRangeDropdown({ onApply, onClose }: { onApply: (from: string, to: string) => void; onClose: () => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo]     = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  function handleApply() {
    if (from && to) { onApply(from, to); onClose(); }
  }

  return (
    <div ref={ref} className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-72">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-[#003527]">Select Date Range</p>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors">
          <LuX size={14} />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">To</label>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleApply}
          disabled={!from || !to}
          className="flex-1 py-2 text-sm font-semibold bg-[#003527] text-white rounded-lg hover:bg-[#064E3B] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

type ReviewModalProps = {
  name: string;
  role: string;
  variance: number;
  actual: number;
  type: "overtime" | "undertime";
  onClose: () => void;
};

function ReviewModal({ name, role, variance, actual, type, onClose }: ReviewModalProps) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="text-lg font-bold text-[#003527]">Review Time Variance</h3>
          <p className="text-sm text-slate-500 mt-0.5">{name} · {role}</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className={`flex items-center gap-3 p-3 rounded-xl ${type === "overtime" ? "bg-red-50 border border-red-100" : "bg-amber-50 border border-amber-100"}`}>
            <LuCircleAlert size={18} className={type === "overtime" ? "text-red-500" : "text-amber-500"} />
            <div>
              <p className={`text-sm font-bold ${type === "overtime" ? "text-red-700" : "text-amber-700"}`}>
                {type === "overtime" ? "Overtime Detected" : "Undertime Detected"}
              </p>
              <p className="text-xs text-slate-500">
                Actual: {actual.toLocaleString()} min · Variance: {variance > 0 ? "+" : ""}{variance} min
              </p>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Review Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Add a review note or approval reason..."
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            {type === "overtime" ? "Approve Overtime" : "Acknowledge"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const [activeWeek, setActiveWeek] = useState("w20");
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [reviewTarget, setReviewTarget] = useState<typeof ATTENDANCE[number] | null>(null);

  function handleApplyRange(from: string, to: string) {
    setCustomRange({ from, to });
    setActiveWeek("");
  }

  function formatRangeLabel(from: string, to: string) {
    const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(from)} – ${fmt(to)}`;
  }

  const perfectStandard  = ATTENDANCE.filter((r) => r.weeklyStatus === "Standard Met").length;
  const varianceFlags    = ATTENDANCE.filter((r) => r.weeklyStatus === "Approval Needed" || r.weeklyStatus === "Review Needed").length;
  const pendingReviews   = ATTENDANCE.filter((r) => r.weeklyStatus === "Approval Needed").length;
  const totalWorkforce   = ATTENDANCE.length;

  const STATS = [
    { label: "Perfect Standard", value: perfectStandard, color: "text-slate-900",  iconBg: "bg-teal-50",   iconColor: "text-teal-600",  Icon: LuCircleCheck   },
    { label: "Variance Flags",   value: varianceFlags,   color: "text-red-600",    iconBg: "bg-red-50",    iconColor: "text-red-600",   Icon: LuCircleAlert   },
    { label: "Pending Reviews",  value: pendingReviews,  color: "text-slate-900",  iconBg: "bg-amber-50",  iconColor: "text-amber-600", Icon: LuClock         },
    { label: "Total Workforce",  value: totalWorkforce,  color: "text-slate-900",  iconBg: "bg-slate-50",  iconColor: "text-slate-600", Icon: LuUsers         },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">Attendance Management</h2>
          <p className="text-sm md:text-base text-slate-600 mt-1">Weekly Time Tracking Review (Standard: 2,400 min/week)</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white border border-slate-200 text-[#003527] rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">
            <LuFileText size={16} strokeWidth={2} />
            <span className="hidden sm:inline">Export Timesheet</span>
            <span className="sm:hidden">Export</span>
          </button>
          <button className="flex items-center gap-2 px-3 sm:px-5 py-2 bg-[#003527] hover:bg-[#064E3B] text-white rounded-lg text-sm font-semibold transition-all shadow-md">
            <LuRefreshCw size={16} strokeWidth={2} />
            <span className="hidden sm:inline">Sync All Data</span>
            <span className="sm:hidden">Sync</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
        {STATS.map(({ label, value, color, iconBg, iconColor, Icon }) => (
          <div key={label} className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 flex items-center gap-3 md:gap-4">
            <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg ${iconBg} flex items-center justify-center ${iconColor} shrink-0`}>
              <Icon size={20} strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className={`text-xl md:text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Weekly Time Tracking Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Table header toolbar */}
        <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-slate-50/50">
          <h3 className="text-xl md:text-2xl font-semibold text-[#003527]">Weekly Time Tracking</h3>
          <div className="flex flex-wrap gap-2 items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
            <div className="flex flex-wrap bg-slate-100 rounded-md p-0.5 gap-0.5">
              {WEEKS.map((w) => (
                <button
                  key={w.key}
                  onClick={() => { setActiveWeek(w.key); setCustomRange(null); }}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded transition-all ${
                    activeWeek === w.key
                      ? "bg-white shadow-sm text-emerald-900"
                      : "text-slate-500 hover:text-emerald-700"
                  }`}
                >
                  {w.label}
                </button>
              ))}
              {customRange && (
                <span className="px-3 py-1.5 bg-white shadow-sm rounded text-xs font-bold text-teal-700 flex items-center gap-1">
                  {formatRangeLabel(customRange.from, customRange.to)}
                  <button onClick={() => { setCustomRange(null); setActiveWeek("w20"); }} className="ml-1 text-slate-400 hover:text-red-500 transition-colors">
                    <LuX size={11} />
                  </button>
                </span>
              )}
            </div>
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <div className="relative">
              <button
                onClick={() => setShowRangePicker((v) => !v)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all group ${
                  showRangePicker ? "text-emerald-700 bg-emerald-50" : "text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                <LuCalendar size={16} className={showRangePicker ? "text-emerald-600" : "text-slate-400 group-hover:text-emerald-600"} strokeWidth={2} />
                <span className="text-xs font-bold">Select Range</span>
              </button>
              {showRangePicker && (
                <DateRangeDropdown
                  onApply={handleApplyRange}
                  onClose={() => setShowRangePicker(false)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: "600px" }}>
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Employee", "Standard (Min)", "Actual (Min)", "Variance", "Status", "Actions"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap ${i === 5 ? "text-right" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ATTENDANCE.map((row) => {
                const variance = row.actualMinutes - row.standardMinutes;
                const isOnLeave = row.weeklyStatus === "On Leave";
                const isStandard = row.weeklyStatus === "Standard Met";
                const needsApproval = row.weeklyStatus === "Approval Needed";
                const needsReview = row.weeklyStatus === "Review Needed";

                return (
                  <tr key={row.contractorId} className="hover:bg-slate-50/80 transition-colors group">
                    {/* Employee */}
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      <div className="flex items-center gap-2 md:gap-3">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#003527] text-white flex items-center justify-center text-xs md:text-sm font-bold shrink-0">
                          {row.avatar}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 whitespace-nowrap">{row.name}</p>
                          <p className="text-xs text-slate-500 whitespace-nowrap">{row.role}</p>
                        </div>
                      </div>
                    </td>

                    {/* Standard */}
                    <td className="px-4 md:px-6 py-3 md:py-4 text-sm font-medium text-slate-500">
                      {row.standardMinutes.toLocaleString()}
                    </td>

                    {/* Actual */}
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      {isOnLeave ? (
                        <span className="text-sm text-slate-400">—</span>
                      ) : (
                        <span className={`text-sm font-bold ${(needsApproval || needsReview) ? "text-red-600" : "text-slate-900"}`}>
                          {row.actualMinutes.toLocaleString()}
                        </span>
                      )}
                    </td>

                    {/* Variance */}
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      {isOnLeave || isStandard ? (
                        <span className="text-sm text-slate-400">--</span>
                      ) : (
                        <span className="text-sm font-medium text-red-600">
                          {variance > 0 ? `+${variance}` : variance}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      {isStandard && (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-[11px] font-bold uppercase">
                          Standard Met
                        </span>
                      )}
                      {needsApproval && (
                        <span className="flex items-center gap-1 text-red-600">
                          <LuCircleAlert size={15} strokeWidth={2} className="fill-red-100" />
                          <span className="text-[11px] font-bold uppercase">Approval Needed</span>
                        </span>
                      )}
                      {needsReview && (
                        <span className="flex items-center gap-1 text-red-600">
                          <LuCircleAlert size={15} strokeWidth={2} className="fill-red-100" />
                          <span className="text-[11px] font-bold uppercase">Review Needed</span>
                        </span>
                      )}
                      {isOnLeave && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-[11px] font-bold uppercase">
                          On Leave
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 md:px-6 py-3 md:py-4 text-right">
                      {isStandard && (
                        <button className="text-slate-400 hover:text-[#003527] transition-all">
                          <LuEye size={20} strokeWidth={1.75} />
                        </button>
                      )}
                      {isOnLeave && (
                        <button className="text-slate-400 hover:text-[#003527] transition-all">
                          <LuEye size={20} strokeWidth={1.75} />
                        </button>
                      )}
                      {(needsApproval || needsReview) && (
                        <div className="flex justify-end gap-2">
                          <button className="p-1.5 text-slate-400 hover:text-[#003527] hover:bg-slate-100 rounded-lg transition-all" title="Message Employee">
                            <LuMessageSquare size={18} strokeWidth={1.75} />
                          </button>
                          <button
                            onClick={() => setReviewTarget(row)}
                            className="px-3 py-1 bg-[#003527] text-white rounded text-[11px] font-bold hover:bg-[#064E3B] transition-all"
                          >
                            REVIEW
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-slate-50 flex justify-center border-t border-slate-100">
          <button className="text-xs font-bold text-[#003527] hover:underline">
            Load {150 - ATTENDANCE.length} more employees...
          </button>
        </div>
      </div>

      {/* Review Modal */}
      {reviewTarget && (
        <ReviewModal
          name={reviewTarget.name}
          role={reviewTarget.role}
          variance={reviewTarget.actualMinutes - reviewTarget.standardMinutes}
          actual={reviewTarget.actualMinutes}
          type={reviewTarget.actualMinutes > reviewTarget.standardMinutes ? "overtime" : "undertime"}
          onClose={() => setReviewTarget(null)}
        />
      )}
    </div>
  );
}
