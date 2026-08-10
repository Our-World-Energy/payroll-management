import { LuDownload, LuUsers, LuWallet, LuFingerprint, LuCalendarX, LuChartColumn } from "react-icons/lu";
import { fetchAllContractors } from "../contractors/actions";
import { countryFromLocation } from "@/lib/countryTimeZones";

const REPORTS = [
  { name: "Payroll Summary – May 2026", type: "Payroll", generated: "2026-05-15", Icon: LuWallet },
  { name: "Attendance Report – May 2026", type: "Attendance", generated: "2026-05-15", Icon: LuFingerprint },
  { name: "Headcount by Region – Q2 2026", type: "Workforce", generated: "2026-05-01", Icon: LuUsers },
  { name: "Leave & Absence – May 2026", type: "Time Away", generated: "2026-05-15", Icon: LuCalendarX },
];

export default async function ReportsPage() {
  const contractors = await fetchAllContractors({ country: "All Countries", status: "Active", rules: [] });
  const countsByCountry = new Map<string, number>();
  for (const c of contractors) {
    const country = countryFromLocation(c.location);
    countsByCountry.set(country, (countsByCountry.get(country) ?? 0) + 1);
  }
  const regionBreakdown = Array.from(countsByCountry, ([region, count]) => ({ region, contractors: count }))
    .sort((a, b) => b.contractors - a.contractors);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-full overflow-x-hidden">
      <div className="flex items-center gap-3 mb-3 md:mb-4">
        <div className="hidden sm:grid size-9 shrink-0 place-items-center rounded-xl bg-[#003527] text-white shadow-sm">
          <LuChartColumn size={18} strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-lg md:text-xl font-bold text-[#003527] tracking-tight">Reports</h2>
          <p className="text-xs md:text-sm text-slate-600 mt-0.5">Workforce analytics and downloadable reports.</p>
        </div>
      </div>

      {/* Region breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-slate-100">
          <h4 className="text-lg font-semibold text-[#003527]">Regional Breakdown</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 640 }}>
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Region</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contractors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {regionBreakdown.map((r) => (
                <tr key={r.region} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-slate-800">{r.region}</td>
                  <td className="px-5 py-3.5 text-slate-600 tabular-nums">{r.contractors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
