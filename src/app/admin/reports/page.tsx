import { LuDownload, LuUsers, LuWallet, LuFingerprint, LuCalendarX } from "react-icons/lu";

const SUMMARY = [
  { label: "Total Contractors", value: "124", change: "+4%", positive: true },
  { label: "Total Payroll (May)", value: "$21,365", change: "+2.1%", positive: true },
  { label: "Avg Attendance Rate", value: "91%", change: "-1.2%", positive: false },
  { label: "Leave Requests (May)", value: "18", change: "+3", positive: false },
];

const REGION_BREAKDOWN = [
  { region: "United States", contractors: 42, payroll: 8850, attendance: 94 },
  { region: "Philippines", contractors: 38, payroll: 5320, attendance: 90 },
  { region: "Mexico", contractors: 26, payroll: 4380, attendance: 89 },
  { region: "India", contractors: 18, payroll: 2815, attendance: 92 },
];

const REPORTS = [
  { name: "Payroll Summary – May 2026", type: "Payroll", generated: "2026-05-15", Icon: LuWallet },
  { name: "Attendance Report – May 2026", type: "Attendance", generated: "2026-05-15", Icon: LuFingerprint },
  { name: "Headcount by Region – Q2 2026", type: "Workforce", generated: "2026-05-01", Icon: LuUsers },
  { name: "Leave & Absence – May 2026", type: "Time-Off", generated: "2026-05-15", Icon: LuCalendarX },
];

export default function ReportsPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h2 className="text-4xl font-bold text-[#003527] tracking-tight">Reports</h2>
        <p className="text-base text-slate-500 mt-1">Workforce analytics and downloadable reports.</p>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {SUMMARY.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{s.label}</p>
            <p className="text-3xl font-bold text-[#003527] mt-1">{s.value}</p>
            <p className={`text-xs mt-2 font-medium ${s.positive ? "text-emerald-600" : "text-red-500"}`}>
              {s.change} vs last period
            </p>
          </div>
        ))}
      </div>

      {/* Region breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-slate-100">
          <h4 className="text-lg font-semibold text-[#003527]">Regional Breakdown</h4>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Region</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contractors</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Payroll (May)</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Attendance Rate</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {REGION_BREAKDOWN.map((r) => (
              <tr key={r.region} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3.5 font-semibold text-slate-800">{r.region}</td>
                <td className="px-5 py-3.5 text-slate-600 tabular-nums">{r.contractors}</td>
                <td className="px-5 py-3.5 text-slate-600 tabular-nums">${r.payroll.toLocaleString()}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-[80px]">
                      <div className="h-full bg-teal-500 rounded-full" style={{ width: `${r.attendance}%` }} />
                    </div>
                    <span className="text-slate-600 tabular-nums text-xs">{r.attendance}%</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-slate-500 tabular-nums text-xs">
                  {Math.round((r.contractors / 124) * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Downloadable reports */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h4 className="text-lg font-semibold text-[#003527]">Generated Reports</h4>
        </div>
        <ul className="divide-y divide-slate-100">
          {REPORTS.map(({ name, type, generated, Icon }) => (
            <li key={name} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="size-9 rounded-lg bg-teal-50 text-teal-700 grid place-items-center">
                  <Icon size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{name}</p>
                  <p className="text-xs text-slate-400">{type} · Generated {generated}</p>
                </div>
              </div>
              <button className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900 transition-colors">
                <LuDownload size={14} strokeWidth={2} />
                Download
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
