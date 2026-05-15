import { LuCircleCheck, LuCircleX, LuClock } from "react-icons/lu";
import { TIME_OFF } from "@/lib/data";

const STATUS_STYLES: Record<string, string> = {
  Approved: "bg-emerald-50 text-emerald-700",
  Pending:  "bg-amber-50 text-amber-700",
  Rejected: "bg-red-50 text-red-600",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  Approved: <LuCircleCheck size={13} strokeWidth={2} />,
  Pending:  <LuClock       size={13} strokeWidth={2} />,
  Rejected: <LuCircleX     size={13} strokeWidth={2} />,
};

const TYPE_STYLES: Record<string, string> = {
  "Annual Leave": "bg-blue-50 text-blue-700",
  "Sick Leave":   "bg-orange-50 text-orange-700",
  "Unpaid Leave": "bg-slate-100 text-slate-600",
};

export default function TimeOffPage() {
  const approved = TIME_OFF.filter((r) => r.status === "Approved").length;
  const pending  = TIME_OFF.filter((r) => r.status === "Pending").length;
  const rejected = TIME_OFF.filter((r) => r.status === "Rejected").length;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6 md:mb-8">
        <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">Time-Off Management</h2>
        <p className="text-sm md:text-base text-slate-500 mt-1">Review and manage contractor leave requests.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Approved</p>
          <p className="text-2xl md:text-3xl font-bold text-emerald-600 mt-1">{approved}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Review</p>
          <p className="text-2xl md:text-3xl font-bold text-amber-500 mt-1">{pending}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rejected</p>
          <p className="text-2xl md:text-3xl font-bold text-red-500 mt-1">{rejected}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "700px" }}>
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {["ID","Name","Region","Type","From","To","Days","Status","Actions"].map((h) => (
                  <th key={h} className="text-left px-4 md:px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {TIME_OFF.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 md:px-5 py-3.5 text-xs text-slate-400 font-mono whitespace-nowrap">{r.id}</td>
                  <td className="px-4 md:px-5 py-3.5 font-semibold text-slate-800 whitespace-nowrap">{r.name}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 whitespace-nowrap">{r.region}</td>
                  <td className="px-4 md:px-5 py-3.5">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${TYPE_STYLES[r.type]}`}>
                      {r.type}
                    </span>
                  </td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 font-mono text-xs whitespace-nowrap">{r.from}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-500 font-mono text-xs whitespace-nowrap">{r.to}</td>
                  <td className="px-4 md:px-5 py-3.5 text-slate-600 tabular-nums">{r.days}d</td>
                  <td className="px-4 md:px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[r.status]}`}>
                      {STATUS_ICONS[r.status]}
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 md:px-5 py-3.5">
                    {r.status === "Pending" && (
                      <div className="flex items-center gap-2">
                        <button className="text-xs font-semibold text-emerald-700 hover:underline whitespace-nowrap">Approve</button>
                        <span className="text-slate-300">·</span>
                        <button className="text-xs font-semibold text-red-500 hover:underline whitespace-nowrap">Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 md:px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
          {TIME_OFF.length} requests total
        </div>
      </div>
    </div>
  );
}
