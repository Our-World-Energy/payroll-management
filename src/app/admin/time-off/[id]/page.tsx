"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LuChevronLeft, LuCircleCheck, LuCircleX, LuClock } from "react-icons/lu";
import { fetchAllContractors } from "../../contractors/actions";
import type { Contractor } from "../../contractors/types";

type RequestDecision = "Approved" | "Pending" | "Declined";
type RequestDecisionMap = Record<string, RequestDecision>;

type DummyRequest = {
  id: string;
  from: string;
  to: string;
  reason: string;
  status: RequestDecision;
};

const DUMMY_REQUESTS: DummyRequest[] = [
  { id: "TOR-001", from: "2026-01-06", to: "2026-01-08", reason: "Family vacation planned in advance.", status: "Approved" },
  { id: "TOR-002", from: "2026-02-14", to: "2026-02-14", reason: "Personal day off.", status: "Pending" },
  { id: "TOR-003", from: "2026-03-03", to: "2026-03-05", reason: "Medical appointment and recovery.", status: "Declined" },
  { id: "TOR-004", from: "2026-04-21", to: "2026-04-23", reason: "Attending a family event out of town.", status: "Approved" },
  { id: "TOR-005", from: "2026-05-18", to: "2026-05-18", reason: "Sick leave — fever.", status: "Pending" },
];

function fmtDate(date: string) {
  if (!date) return "-";
  const [year, month, day] = date.split("-");
  return year && month && day ? `${month}-${day}-${year}` : date;
}

const STATUS_BADGE: Record<RequestDecision, string> = {
  Approved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Pending:  "bg-amber-50 text-amber-600 border border-amber-200",
  Declined: "bg-red-50 text-red-600 border border-red-200",
};

export default function ContractorTimeOffPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [contractor, setContractor] = useState<Contractor | null>(null);
  const [loading, setLoading] = useState(true);
  const [decisions, setDecisions] = useState<RequestDecisionMap>({});

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const all = await fetchAllContractors({ country: "All Countries", status: "All Statuses", rules: [] });
        if (active) {
          const found = all.find((c) => c.uid === id) ?? null;
          setContractor(found);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [id]);

  const fullName = contractor
    ? contractor.fullName || [contractor.firstName, contractor.surname].filter(Boolean).join(" ")
    : "";

  const requests = DUMMY_REQUESTS;

  function decide(reqId: string, decision: "Approved" | "Declined") {
    setDecisions((cur) => ({ ...cur, [reqId]: decision }));
  }

  function effectiveStatus(req: DummyRequest): RequestDecision {
    return decisions[req.id] ?? req.status;
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-6 w-48 bg-slate-100 rounded animate-pulse mb-4" />
        <div className="h-10 w-64 bg-slate-100 rounded animate-pulse mb-2" />
        <div className="h-4 w-40 bg-slate-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!contractor) {
    return (
      <div className="p-8">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#003527] mb-6">
          <LuChevronLeft size={16} /> Back
        </button>
        <p className="text-slate-500 text-sm">Contractor not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 w-full">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#003527] mb-6 transition-colors"
      >
        <LuChevronLeft size={16} /> Back
      </button>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[#003527]">Time-Off Request</h1>
        <p className="text-slate-500 text-sm mt-1">{fullName}</p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {["Name", "Start Date", "End Date", "Reason", "Status", "Action"].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-sm text-slate-400">
                    <LuClock size={28} className="mx-auto mb-2 text-slate-200" strokeWidth={1.5} />
                    No time-off requests found.
                  </td>
                </tr>
              ) : requests.map((req) => {
                const status = effectiveStatus(req);
                return (
                  <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4 text-sm font-semibold text-[#003527] whitespace-nowrap">{fullName}</td>
                    <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">{fmtDate(req.from)}</td>
                    <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">{fmtDate(req.to)}</td>
                    <td className="px-5 py-4 text-sm text-slate-500 max-w-xs">
                      <span className="line-clamp-2">{req.reason || "-"}</span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[status]}`}>
                        {status === "Approved" && <LuCircleCheck size={11} />}
                        {status === "Pending"  && <LuClock size={11} />}
                        {status === "Declined" && <LuCircleX size={11} />}
                        {status}
                      </span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => decide(req.id, "Declined")}
                          disabled={status === "Declined"}
                          className="px-4 py-1.5 bg-red-400 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => decide(req.id, "Approved")}
                          disabled={status === "Approved"}
                          className="px-4 py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                        >
                          Approve
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
