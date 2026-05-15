import { LuDownload, LuCircleCheck, LuClock, LuCircleAlert } from "react-icons/lu";
import { PAYROLL } from "@/lib/data";

const STATUS_STYLES: Record<string, string> = {
  Paid:       "bg-emerald-50 text-emerald-700",
  Pending:    "bg-amber-50 text-amber-700",
  "On Leave": "bg-blue-50 text-blue-600",
  "On Hold":  "bg-slate-100 text-slate-500",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  Paid:       <LuCircleCheck size={13} strokeWidth={2} />,
  Pending:    <LuClock       size={13} strokeWidth={2} />,
  "On Leave": <LuCircleAlert size={13} strokeWidth={2} />,
  "On Hold":  <LuCircleAlert size={13} strokeWidth={2} />,
};

const fmt = (n: number) => `$${n.toLocaleString()}`;

export default function PayrollPage() {
  const totalGross      = PAYROLL.reduce((s, r) => s + r.gross, 0);
  const totalNet        = PAYROLL.reduce((s, r) => s + r.net, 0);
  const totalDeductions = PAYROLL.reduce((s, r) => s + r.deductions, 0);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">Payroll</h2>
          <p className="text-sm md:text-base text-slate-500 mt-1">Pay period: May 1 – May 15, 2026</p>
        </div>
        <button className="self-start sm:self-auto flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors shadow-sm">
          <LuDownload size={16} strokeWidth={2} />
          Export CSV
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 md:mb-8">
        <div className="bg-[#003527] text-white rounded-xl p-5 shadow-md">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-75">Total Gross</p>
          <p className="text-3xl font-black mt-1">{fmt(totalGross)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Deductions</p>
          <p className="text-3xl font-bold text-red-500 mt-1">{fmt(totalDeductions)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Net Pay</p>
          <p className="text-3xl font-bold text-teal-600 mt-1">{fmt(totalNet)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "700px" }}>
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {["ID","Name","Region","Hours","Rate/hr","Gross","Deductions","Net Pay","Status"].map((h) => (
                  <th key={h} className="text-left px-4 md:px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PAYROLL.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 md:px-5 py-3.5 text-xs text-slate-400 font-mono whitespace-nowrap">{r.id}</td>
                  <td className="px-4 md:px-5 py-3.5 font-semibold text-slate-800 whitespace-nowrap">{r.name}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap">{r.region}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums">{r.hours}h</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums">${r.rate}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-700 font-medium tabular-nums whitespace-nowrap">{fmt(r.gross)}</td>
                  <td className="px-4 md:px-5 py-3.5 text-red-500 tabular-nums whitespace-nowrap">−{fmt(r.deductions)}</td>
                  <td className="px-4 md:px-5 py-3.5 text-teal-700 font-semibold tabular-nums whitespace-nowrap">{fmt(r.net)}</td>
                  <td className="px-4 md:px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[r.status]}`}>
                      {STATUS_ICONS[r.status]}
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 md:px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
          {PAYROLL.length} records · Pay period May 1–15, 2026
        </div>
      </div>
    </div>
  );
}
