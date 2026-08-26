import Link from "next/link";
import { LuArrowRight, LuClock, LuChartColumn } from "react-icons/lu";
import { fetchAllContractors } from "../contractors/actions";
import { countryFromLocation } from "@/lib/countryTimeZones";

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

      {/* Attendance Tracker — a live per-day view, not a generated file */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <ul>
          <li>
            <Link
              href="/admin/reports/attendance-tracker"
              className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="size-9 rounded-lg bg-teal-50 text-teal-700 grid place-items-center">
                  <LuClock size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 group-hover:text-teal-800">Attendance Tracker</p>
                  <p className="text-xs text-slate-400">Per-day clock-in / clock-out and project task time</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 group-hover:text-teal-900 transition-colors">
                Open
                <LuArrowRight size={14} strokeWidth={2} />
              </span>
            </Link>
          </li>
        </ul>
      </div>

    </div>
  );
}
