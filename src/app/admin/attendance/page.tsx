"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useState, useRef, useEffect, useCallback } from "react";
import { LuCircleCheck, LuCircleAlert, LuClock, LuUsers, LuFileText, LuRefreshCw, LuCalendar, LuEye, LuX, LuSearch } from "react-icons/lu";

type EmpRow = {
  worksnapUserId: number;
  email: string;
  userName: string;
  location: string | null;
  shiftType: string | null;
  department: string | null;
  employmentStatus: string | null;
  offsetCredits: number;
  ptoCredits: number;
  sickLeaveCredits: number;
  targetTime: number;
  isFixed: boolean;
  daysLogged: number;
  daysMet: number;
  worksnapActual: number;
  fixedEvaluated: number;
  flexibleEvaluated: number;
  manualAdjustmentTime: number;
  timeOffTime: number;
  completionTime: number;
  status: string; // Met | Short | Over
  timeOffSummary: string; // comma-joined TimeOffKind values across the week's days
  requestStatus: string;
  manualAdjustmentNote: string;
};

type WeeklyResponse = {
  weeks: string[];
  week: string | null;
  rows: EmpRow[];
  departments: string[];
  lastSyncedAt: string | null;
};

const TIME_OFF_OPTS = [
  { value: "HO_HOLIDAY", label: "HO / Holiday" },
  { value: "PTO", label: "PTO" },
  { value: "SICK_LEAVE_HALF_DAY", label: "Sick Leave Half Day" },
  { value: "PTO_HALF_DAY", label: "PTO Half Day" },
  { value: "OPEN", label: "Open" },
  { value: "NOT_SET", label: "Not Set" },
];
const REQUEST_OPTS = [
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "OPEN", label: "Open" },
  { value: "NOT_SET", label: "Not Set" },
];
const labelOf = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;
const REQUEST_CHIP: Record<string, string> = {
  APPROVED: "bg-emerald-100 text-emerald-700", REJECTED: "bg-red-100 text-red-700",
  OPEN: "bg-amber-100 text-amber-700", NOT_SET: "bg-slate-100 text-slate-500",
};
const STATUS_CHIP: Record<string, string> = {
  Met: "bg-emerald-100 text-emerald-700", Over: "bg-sky-100 text-sky-700", Short: "bg-red-100 text-red-700",
};
const m = (n: number) => n.toLocaleString();
const signed = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());

function formatArizona(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Phoenix", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }) + " MST";
}
function weekLabel(iso: string): string {
  const start = new Date(`${iso}T00:00:00.000Z`);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
  const mo = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const day = (d: Date) => d.getUTCDate();
  return mo(start) === mo(end) ? `${mo(start)} ${day(start)} – ${day(end)}` : `${mo(start)} ${day(start)} – ${mo(end)} ${day(end)}`;
}
function sundayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

function WeekJumpDropdown({ onApply, onClose }: { onApply: (iso: string) => void; onClose: () => void }) {
  const [date, setDate] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-72">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-[#003527]">Jump to Week</p>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded"><LuX size={14} /></button>
      </div>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pick any date in the week</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
        className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500" />
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
        <button onClick={() => { if (date) { onApply(date); onClose(); } }} disabled={!date}
          className="flex-1 py-2 text-sm font-semibold bg-[#003527] text-white rounded-lg hover:bg-[#064E3B] disabled:opacity-40">Go</button>
      </div>
    </div>
  );
}

// ── per-user task × date breakdown modal ────────────────────────────────────
type BreakdownTask = { projectName: string; taskName: string; category: string; perDay: Record<string, number>; total: number };
type BreakdownResponse = { userName: string; email: string; week: string; days: string[]; tasks: BreakdownTask[]; dailyTotals: Record<string, number>; grandTotal: number; adjustments: Record<string, number>; timeOff: Record<string, number> };
const CAT_CHIP: Record<string, string> = { Work: "bg-emerald-50 text-emerald-700", Break: "bg-amber-50 text-amber-700", "Meeting/Training": "bg-sky-50 text-sky-700" };
function dayHeader(iso: string) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return { dow: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }), day: d.getUTCDate(), mon: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) };
}
function BreakdownModal({ userId, userName, email, week, onClose }: { userId: number; userName: string; email: string; week: string; onClose: () => void }) {
  const [data, setData] = useState<BreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true; setLoading(true);
    fetch(`/api/attendance/user-breakdown/?userId=${userId}&week=${week}`, { cache: "no-store" })
      .then((r) => r.json()).then((d: BreakdownResponse) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, week]);
  const days = data?.days ?? [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#003527]">{userName} — Task Breakdown</h3>
            <p className="text-sm text-slate-500 mt-0.5">{email || "no platform email"} · week of {weekLabel(week)}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded"><LuX size={18} /></button>
        </div>
        <div className="overflow-auto p-2 sm:p-4">
          {loading && <p className="px-4 py-10 text-center text-sm text-slate-400">Loading…</p>}
          {!loading && data && data.tasks.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-400">No logged time this week.</p>}
          {!loading && data && data.tasks.length > 0 && (
            <table className="w-full text-left text-sm" style={{ minWidth: "640px" }}>
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Project / Task</th>
                  {days.map((d) => { const h = dayHeader(d); return (
                    <th key={d} className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                      {h.dow}<br /><span className="text-slate-400 font-semibold">{h.day} {h.mon}</span></th>); })}
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.tasks.map((t, i) => (
                  <tr key={i} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2"><div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${CAT_CHIP[t.category] ?? "bg-slate-100 text-slate-600"}`}>{t.taskName || t.category}</span>
                      <span className="text-xs text-slate-400">{t.projectName}</span></div></td>
                    {days.map((d) => <td key={d} className={`px-2 py-2 text-center tabular-nums ${t.perDay[d] ? "text-slate-800" : "text-slate-300"}`}>{t.perDay[d] ?? "·"}</td>)}
                    <td className="px-3 py-2 text-right font-bold text-slate-900 tabular-nums">{t.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-600">Worked (min)</td>
                  {days.map((d) => <td key={d} className="px-2 py-2 text-center font-bold text-[#003527] tabular-nums">{data.dailyTotals[d] || 0}</td>)}
                  <td className="px-3 py-2 text-right font-extrabold text-[#003527] tabular-nums">{data.grandTotal}</td>
                </tr>
                <tr className="bg-slate-50/60">
                  <td className="px-3 py-1.5 text-xs font-semibold text-indigo-600">Manual Adjustment</td>
                  {days.map((d) => { const v = data.adjustments?.[d] ?? 0; return <td key={d} className={`px-2 py-1.5 text-center tabular-nums ${v ? "text-indigo-600 font-semibold" : "text-slate-300"}`}>{v ? signed(v) : "·"}</td>; })}
                  <td className="px-3 py-1.5 text-right font-bold text-indigo-600 tabular-nums">{signed(days.reduce((s, d) => s + (data.adjustments?.[d] ?? 0), 0))}</td>
                </tr>
                <tr className="bg-slate-50/60">
                  <td className="px-3 py-1.5 text-xs font-semibold text-amber-600">Time Off</td>
                  {days.map((d) => { const v = data.timeOff?.[d] ?? 0; return <td key={d} className={`px-2 py-1.5 text-center tabular-nums ${v ? "text-amber-600 font-semibold" : "text-slate-300"}`}>{v || "·"}</td>; })}
                  <td className="px-3 py-1.5 text-right font-bold text-amber-600 tabular-nums">{days.reduce((s, d) => s + (data.timeOff?.[d] ?? 0), 0)}</td>
                </tr>
                <tr className="border-t-2 border-slate-200 bg-emerald-50/60">
                  <td className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#003527]">Total (min)</td>
                  {days.map((d) => { const v = (data.dailyTotals[d] ?? 0) + (data.adjustments?.[d] ?? 0) + (data.timeOff?.[d] ?? 0); return <td key={d} className={`px-2 py-2 text-center font-bold tabular-nums ${v ? "text-[#003527]" : "text-slate-300"}`}>{v || "·"}</td>; })}
                  <td className="px-3 py-2 text-right font-extrabold text-[#003527] tabular-nums">{days.reduce((s, d) => s + (data.dailyTotals[d] ?? 0) + (data.adjustments?.[d] ?? 0) + (data.timeOff?.[d] ?? 0), 0)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── contractor details + per-day time-off / manual adjustment (the "Action" popup) ──
type DayEdit = { date: string; actualMins: number; timeOffStatus: string; manualAdjustmentTime: number; note: string };

function ContractorDetailsModal({ row, week, onClose, onSaved }: { row: EmpRow; week: string; onClose: () => void; onSaved: () => void }) {
  const [days, setDays] = useState<DayEdit[]>([]);
  const [requestStatus, setRequestStatus] = useState(row.requestStatus);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true; setLoading(true);
    fetch(`/api/attendance/day-status/?userId=${row.worksnapUserId}&week=${week}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { days: DayEdit[]; requestStatus: string }) => { if (alive) { setDays(d.days ?? []); setRequestStatus(d.requestStatus ?? "NOT_SET"); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [row.worksnapUserId, week]);

  function updateDay(i: number, patch: Partial<DayEdit>) {
    setDays((ds) => ds.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/attendance/status/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worksnapUserId: row.worksnapUserId, email: row.email, week, requestStatus, days }),
      });
      onSaved(); onClose();
    } finally { setSaving(false); }
  }

  const detail: [string, string][] = [
    ["Name", row.userName], ["Location", row.location ?? "—"], ["Shift Type", row.shiftType ?? "—"],
    ["Status", row.employmentStatus ?? "—"], ["Offset Credits", String(row.offsetCredits)],
    ["PTO Credits", String(row.ptoCredits)], ["Sick Leave Credits", String(row.sickLeaveCredits)],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#003527]">Contractor Details</h3>
            <p className="text-sm text-slate-500 mt-0.5">{row.email || "no platform email"} · {row.department ?? "No dept"} · week of {weekLabel(week)}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded"><LuX size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-auto">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            {detail.map(([k, v]) => (
              <div key={k}><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</dt>
                <dd className="text-sm font-semibold text-slate-800 mt-0.5">{v}</dd></div>
            ))}
          </dl>

          <div className="rounded-xl border border-slate-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([["Target", m(row.targetTime)], ["Worksnap Actual", m(row.worksnapActual)], ["Time Off", m(row.timeOffTime)], ["Completion", m(row.completionTime)]] as [string, string][]).map(([k, v]) => (
              <div key={k}><dt className="text-[10px] text-slate-400">{k}</dt><dd className={`text-sm font-bold ${k === "Completion" ? "text-[#003527]" : "text-slate-700"}`}>{v}</dd></div>
            ))}
          </div>

          {/* Per-day editor: pick the date, set time off + manual adjustment */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Per-Day Time Off &amp; Manual Adjustment</p>
            {loading ? <p className="text-sm text-slate-400 py-4 text-center">Loading…</p> : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm" style={{ minWidth: "640px" }}>
                  <thead className="bg-slate-50">
                    <tr>
                      {["Date", "Actual", "Time Off Status", "Manual Adj (±min)", "Note"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {days.map((d, i) => {
                      const h = dayHeader(d.date);
                      return (
                        <tr key={d.date}>
                          <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-700">{h.dow} {h.day} {h.mon}</td>
                          <td className={`px-3 py-2 tabular-nums ${d.actualMins ? "text-slate-700" : "text-slate-300"}`}>{d.actualMins || "·"}</td>
                          <td className="px-3 py-2">
                            <select value={d.timeOffStatus} onChange={(e) => updateDay(i, { timeOffStatus: e.target.value })}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                              {TIME_OFF_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={d.manualAdjustmentTime} onChange={(e) => updateDay(i, { manualAdjustmentTime: Number(e.target.value) || 0 })}
                              className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="text" value={d.note} onChange={(e) => updateDay(i, { note: e.target.value })} placeholder="reason…"
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="sm:max-w-xs">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attendance Request Status (week)</label>
            <select value={requestStatus} onChange={(e) => setRequestStatus(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              {REQUEST_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving || loading} className="px-5 py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const COLS = [
  "Name", "Location", "Shift Type", "Target Time", "Worksnap Actual Time", "Fixed Evaluated Time", "Flexible Evaluated Time",
  "Manual Adjustment Time", "Time Off Time", "Completion Time", "Status", "Time Off Status", "Request Status", "Manual Adjustment Note", "Action",
];

export default function AttendancePage() {
  const [weeks, setWeeks] = useState<string[]>([]);
  const [week, setWeek] = useState<string>("");
  const [rows, setRows] = useState<EmpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [visible, setVisible] = useState(25);
  const [query, setQuery] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detailTarget, setDetailTarget] = useState<EmpRow | null>(null);
  const [breakdownTarget, setBreakdownTarget] = useState<EmpRow | null>(null);

  const load = useCallback(async (w?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance/weekly/${w ? `?week=${w}` : ""}`, { cache: "no-store" });
      const data: WeeklyResponse = await res.json();
      setWeeks(data.weeks); setWeek(data.week ?? ""); setRows(data.rows);
      setDepartments(data.departments ?? []); setLastSyncedAt(data.lastSyncedAt); setVisible(25);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true);
    try { await fetch("/api/attendance/sync/", { method: "POST" }); await load(week || undefined); }
    finally { setSyncing(false); }
  }

  const completed = rows.filter((r) => r.completionTime >= r.targetTime).length;
  const short = rows.filter((r) => r.completionTime < r.targetTime).length;
  const onTimeOff = rows.filter((r) => r.timeOffTime > 0).length;
  const STATS = [
    { label: "Target Met", value: completed, color: "text-slate-900", iconBg: "bg-teal-50", iconColor: "text-teal-600", Icon: LuCircleCheck },
    { label: "Short", value: short, color: "text-red-600", iconBg: "bg-red-50", iconColor: "text-red-600", Icon: LuCircleAlert },
    { label: "On Time Off", value: onTimeOff, color: "text-slate-900", iconBg: "bg-amber-50", iconColor: "text-amber-600", Icon: LuClock },
    { label: "Total Workforce", value: rows.length, color: "text-slate-900", iconBg: "bg-slate-50", iconColor: "text-slate-600", Icon: LuUsers },
  ];

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (q && !(r.userName.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))) return false;
    if (deptFilter && r.department !== deptFilter) return false;
    if (statusFilter && r.requestStatus !== statusFilter) return false;
    return true;
  });
  const shown = filtered.slice(0, visible);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-400 mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">Attendance Management</h2>
          <p className="text-sm md:text-base text-slate-600 mt-1">Weekly Evaluation · Fixed 480 min/day · Flexible 2,400 min/week</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white border border-slate-200 text-[#003527] rounded-lg text-sm font-semibold hover:bg-slate-50">
              <LuFileText size={16} /><span className="hidden sm:inline">Export Timesheet</span><span className="sm:hidden">Export</span>
            </button>
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-2 px-3 sm:px-5 py-2 bg-[#003527] hover:bg-[#064E3B] text-white rounded-lg text-sm font-semibold shadow-md disabled:opacity-50">
              <LuRefreshCw size={16} className={syncing ? "animate-spin" : ""} /><span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync All Data"}</span><span className="sm:hidden">{syncing ? "…" : "Sync"}</span>
            </button>
          </div>
          <p className="text-xs text-slate-400">Last updated: <span className="font-semibold text-slate-500">{syncing ? "syncing…" : formatArizona(lastSyncedAt)}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
        {STATS.map(({ label, value, color, iconBg, iconColor, Icon }) => (
          <div key={label} className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 flex items-center gap-3 md:gap-4">
            <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg ${iconBg} flex items-center justify-center ${iconColor} shrink-0`}><Icon size={20} strokeWidth={1.75} /></div>
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className={`text-xl md:text-2xl font-bold mt-0.5 ${color}`}>{value}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50/50 space-y-4">
          {/* Row 1: title + week selector */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h3 className="text-xl md:text-2xl font-semibold text-[#003527]">Weekly Time Tracking</h3>
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm w-full md:w-auto overflow-x-auto">
              <div className="flex bg-slate-100 rounded-md p-0.5 gap-0.5">
                {weeks.slice(0, 4).map((w) => (
                  <button key={w} onClick={() => { setWeek(w); load(w); }}
                    className={`px-3 py-1.5 text-xs font-bold rounded whitespace-nowrap transition-colors ${week === w ? "bg-white shadow-sm text-emerald-900" : "text-slate-500 hover:text-emerald-700"}`}>{weekLabel(w)}</button>
                ))}
              </div>
              <div className="h-6 w-px bg-slate-200 mx-1 shrink-0" />
              <div className="relative shrink-0">
                <button onClick={() => setShowRangePicker((v) => !v)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md whitespace-nowrap ${showRangePicker ? "text-emerald-700 bg-emerald-50" : "text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"}`}>
                  <LuCalendar size={16} strokeWidth={2} /><span className="text-xs font-bold">Jump to Week</span>
                </button>
                {showRangePicker && <WeekJumpDropdown onApply={(d) => { const s = sundayOf(d); setWeek(s); load(s); }} onClose={() => setShowRangePicker(false)} />}
              </div>
            </div>
          </div>

          {/* Row 2: search + filters */}
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1 min-w-0">
              <LuSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={query} onChange={(e) => { setQuery(e.target.value); setVisible(25); }} placeholder="Search by name or email…"
                className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800" />
              {query && <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><LuX size={14} /></button>}
            </div>
            <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setVisible(25); }}
              className="sm:w-44 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" title="Department">
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setVisible(25); }}
              className="sm:w-44 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" title="Attendance request status">
              <option value="">All Statuses</option>
              {REQUEST_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-auto max-h-[65vh]">
          <table className="w-full text-left text-sm" style={{ minWidth: "1500px" }}>
            <thead className="border-b border-slate-200">
              <tr>
                {COLS.map((h, i) => (
                  <th key={h} className={[
                    "px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap bg-slate-50 sticky top-0",
                    (i >= 3 && i <= 9) || h === "Action" ? "text-right" : "",
                    i === 0 ? "left-0 z-30" : h === "Action" ? "right-0 z-30" : "z-10",
                  ].join(" ")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={COLS.length} className="px-6 py-10 text-center text-sm text-slate-400">Loading…</td></tr>}
              {!loading && shown.length === 0 && <tr><td colSpan={COLS.length} className="px-6 py-10 text-center text-sm text-slate-400">{q || deptFilter || statusFilter ? "No employees match the filters." : "No data for this week."}</td></tr>}
              {!loading && shown.map((row) => (
                <tr key={row.worksnapUserId} className="hover:bg-slate-50/80 group">
                  <td className="px-3 py-3 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#003527] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {((row.userName.split(/\s+/)[0]?.[0] ?? "") + (row.userName.split(/\s+/)[1]?.[0] ?? "")).toUpperCase() || "?"}
                      </div>
                      <div>
                        <button onClick={() => setBreakdownTarget(row)} className="font-semibold text-slate-900 whitespace-nowrap hover:text-emerald-700 hover:underline text-left" title="Task breakdown">{row.userName}</button>
                        <p className="text-xs text-slate-500 whitespace-nowrap">{row.email || "no email"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{row.location ?? "—"}</td>
                  <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{row.shiftType ?? "—"}</td>
                  <td className="px-3 py-3 text-right text-slate-500 tabular-nums whitespace-nowrap">
                    {row.isFixed ? <span>480<span className="text-slate-400">/day</span></span> : <span>{m(row.targetTime)}<span className="text-slate-400">/wk</span></span>}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-900 tabular-nums">{m(row.worksnapActual)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{m(row.fixedEvaluated)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{m(row.flexibleEvaluated)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${row.manualAdjustmentTime ? "text-indigo-600 font-semibold" : "text-slate-400"}`}>{row.manualAdjustmentTime ? signed(row.manualAdjustmentTime) : "0"}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${row.timeOffTime ? "text-amber-600 font-semibold" : "text-slate-400"}`}>{m(row.timeOffTime)}</td>
                  <td className="px-3 py-3 text-right font-bold text-[#003527] tabular-nums">{m(row.completionTime)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${STATUS_CHIP[row.status] ?? "bg-slate-100 text-slate-500"}`}>{row.status}</span>
                    {row.isFixed && (
                      <span className={`block mt-1 text-[10px] font-semibold ${row.daysMet === row.daysLogged ? "text-emerald-600" : "text-red-500"}`}>
                        {row.daysMet}/{row.daysLogged} days ≥480
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-slate-600">{row.timeOffSummary ? row.timeOffSummary.split(", ").map((v) => labelOf(TIME_OFF_OPTS, v)).join(", ") : "—"}</td>
                  <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${REQUEST_CHIP[row.requestStatus] ?? REQUEST_CHIP.NOT_SET}`}>{labelOf(REQUEST_OPTS, row.requestStatus)}</span></td>
                  <td className="px-3 py-3 max-w-40 truncate text-slate-500" title={row.manualAdjustmentNote}>{row.manualAdjustmentNote || "—"}</td>
                  <td className="px-3 py-3 text-right sticky right-0 z-10 bg-white group-hover:bg-slate-50 border-l border-slate-100">
                    <div className="flex justify-end gap-2 items-center">
                      <button onClick={() => setBreakdownTarget(row)} className="p-1.5 text-slate-400 hover:text-[#003527] hover:bg-slate-100 rounded-lg" title="Task breakdown"><LuEye size={18} /></button>
                      <button onClick={() => setDetailTarget(row)} className="px-3 py-1 bg-[#003527] text-white rounded text-[11px] font-bold hover:bg-[#064E3B]">ACTION</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && visible < filtered.length && (
          <div className="p-4 bg-slate-50 flex justify-center border-t border-slate-100">
            <button onClick={() => setVisible((v) => v + 25)} className="text-xs font-bold text-[#003527] hover:underline">Load more ({filtered.length - visible} of {filtered.length} remaining)…</button>
          </div>
        )}
      </div>

      {detailTarget && week && (
        <ContractorDetailsModal row={detailTarget} week={week} onClose={() => setDetailTarget(null)} onSaved={() => load(week)} />
      )}
      {breakdownTarget && week && (
        <BreakdownModal userId={breakdownTarget.worksnapUserId} userName={breakdownTarget.userName} email={breakdownTarget.email} week={week} onClose={() => setBreakdownTarget(null)} />
      )}
    </div>
  );
}
