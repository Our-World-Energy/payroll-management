"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  fetchContractorTimeOff, fetchLeaveRequests, fetchAllLeaveRequests,
  submitLeaveRequest, cancelLeaveRequest,
  type ContractorTimeOff, type LeaveRequest,
} from "./actions";
import {
  HOURS_PER_DAY, leaveTypeDisplayLabel, isPtoLeaveType,
  bookedLeaveHoursByDate, leaveHoursPerCoveredDate, MAX_LEAVE_HOURS_PER_DAY,
} from "@/lib/timeOffBalances";
import { fetchTimeAwayRequestsEnabled } from "@/app/admin/settings/actions";
import {
  LuLoader, LuClock, LuCircleCheck, LuUmbrella, LuStethoscope,
  LuChevronRight, LuChevronDown, LuInfo, LuX, LuCircleAlert,
  LuClipboardList, LuSend, LuCalendarDays, LuCirclePlus, LuEye,
} from "react-icons/lu";
import { PageHeader, HeaderChip, ProgressRing } from "../_components/portal";
import { CalendarDateInput } from "@/components/CalendarDateInput";

// Every ISO date a request covers, inclusive of both ends.
function datesCoveredBy(startDate: string, endDate: string): string[] {
  if (!startDate) return [];
  const out: string[] = [];
  const end = endDate || startDate;
  for (let d = new Date(`${startDate}T00:00:00`); ; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push(iso);
    if (iso >= end || out.length > 400) break;
  }
  return out;
}

// Sits under the Start / End date field when that exact date is already
// spoken for, colour-matched to the leave that booked it. Native date inputs
// cannot mark their own days, so the signal lives beside the field instead.
function BookedDateHint({ date, booked, heldHours, blocked }: {
  date: string;
  booked: { kind: BookedKind; status: string; type: string };
  heldHours: number;
  blocked: boolean;
}) {
  // Red only when the day is genuinely full for this request. A day holding
  // 4h that can still take another half day keeps its own leave-type tint,
  // since it is telling the contractor something, not stopping them.
  const tone = blocked ? "text-red-700 bg-red-50 border-red-200"
    : booked.kind === "pto" ? "text-teal-700 bg-teal-50 border-teal-200"
    : booked.kind === "sick" ? "text-orange-700 bg-orange-50 border-orange-200"
    : "text-purple-700 bg-purple-50 border-purple-200";
  const remaining = MAX_LEAVE_HOURS_PER_DAY - heldHours;
  return (
    <p className={`mt-1.5 inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold ${tone}`}>
      <LuCircleAlert size={12} strokeWidth={2.5} className="shrink-0" />
      {fmtDayAndDate(date)} — {leaveTypeDisplayLabel(booked.type)} ({booked.status}), {heldHours}h used
      {blocked ? " — day is full" : remaining > 0 ? ` — ${remaining}h still available` : ""}
    </p>
  );
}

// "Mon, Aug 31, 2026" — naming the weekday matters over a range, since it
// says which day of the week is already spoken for.
type BookedKind = "pto" | "sick" | "other";

// Tint for a date field whose value is already spoken for, matching the
// BookedDateHint beneath it.
function bookedFieldTone(kind: BookedKind): string {
  return kind === "pto"
    ? "text-teal-800 bg-teal-50 border-teal-300 focus:ring-teal-500/20 focus:border-teal-500"
    : kind === "sick"
      ? "text-orange-800 bg-orange-50 border-orange-300 focus:ring-orange-500/20 focus:border-orange-500"
      : "text-purple-800 bg-purple-50 border-purple-300 focus:ring-purple-500/20 focus:border-purple-500";
}

function fmtDayAndDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

function fmtNoticeDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Shown under a PTO date that falls inside the two-week notice window, so the
// contractor can see how short the notice actually is rather than only that
// something is wrong.
function ShortNoticeHint({ days }: { days: number }) {
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-600">
      <LuCircleAlert size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
      {days < 0
        ? "This date is in the past."
        : days === 0
          ? "That's today — PTO needs 2 weeks' notice."
          : `Only ${days} day${days === 1 ? "" : "s"}' notice — PTO needs 14.`}
    </p>
  );
}

function fmtHoursMinutes(hrs: number): string {
  const totalMins = Math.round(hrs * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// A leave request's duration in hours: half-day types are a fixed 4h; full-day
// types are the selected calendar span × the 8h standard day.
function fmtRequestHours(type: string, durationDays: number): string {
  if (type.endsWith("Half Day")) return "4h";
  return fmtHoursMinutes(durationDays * HOURS_PER_DAY);
}

function fmtDateRange(start: string, end: string) {
  const fmt = (s: string) => {
    const d = new Date(s + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  if (start === end) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

type BalanceCardProps = {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  badge: string;
  badgeBg: string;
  badgeText: string;
  total: number;
  used: number;
  barUsed: string;
  barAvail: string;
  availColor: string;
  wide?: boolean;
};

function BalanceCard({
  icon, iconBg, title, badge, badgeBg, badgeText,
  total, used, barUsed, barAvail, availColor,
}: BalanceCardProps) {
  const available = Math.max(total - used, 0);
  const usedPct   = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const availPct  = 100 - usedPct;

  // Under 8 hours left is less than a full day off, so the balance and the
  // percentage both turn orange — the card's own accent colour reads as
  // healthy and would understate how little is actually left.
  const lowColor = available < HOURS_PER_DAY ? "text-orange-500" : availColor;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`grid place-items-center size-8 rounded-lg ${iconBg}`}>{icon}</div>
          <h3 className="text-sm font-bold text-[#003527]">{title}</h3>
        </div>
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badgeBg} ${badgeText}`}>{badge}</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative grid place-items-center shrink-0">
          <ProgressRing pct={availPct} size={68} stroke={6} />
          <div className="absolute text-center leading-none">
            <span className={`block text-sm font-bold tabular-nums ${lowColor}`}>{Math.round(availPct)}%</span>
            <span className="block text-[8px] font-semibold text-slate-400 uppercase tracking-wide">left</span>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-3 gap-3">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-0.5">Total</p>
            <p className="text-base font-bold text-[#003527] tabular-nums">{fmtHoursMinutes(total)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-0.5">Used</p>
            <p className="text-base font-bold text-slate-700 tabular-nums">{fmtHoursMinutes(used)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-0.5">Available</p>
            <p className={`text-base font-bold tabular-nums ${lowColor}`}>{fmtHoursMinutes(available)}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 w-full h-1.5 rounded-full overflow-hidden flex bg-slate-100">
        <div className={`h-full ${barUsed}`}  style={{ width: `${usedPct}%`  }} />
        <div className={`h-full ${barAvail}`} style={{ width: `${availPct}%` }} />
      </div>
    </div>
  );
}


function statusStyle(status: string) {
  if (status === "Approved") return "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (status === "Rejected") return "bg-red-50 text-red-600 border-red-100";
  return "bg-amber-50 text-amber-700 border-amber-100";
}

export default function ContractorTimeOffPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [data,     setData]     = useState<ContractorTimeOff | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  const [showHistory,    setShowHistory]    = useState(false);
  const [allRequests,    setAllRequests]    = useState<LeaveRequest[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const ALL_LEAVE_TYPES    = ["PTO", "PTO Half Day", "Sick Leave", "Sick Leave Half Day"] as const;
  const INDIA_LEAVE_TYPES  = ["Sick Leave", "Sick Leave Half Day"] as const;

  const [leaveType, setLeaveType] = useState<typeof ALL_LEAVE_TYPES[number]>("PTO");
  const [showForm, setShowForm] = useState(false);
  const [viewRequest, setViewRequest] = useState<LeaveRequest | null>(null);
  const [cancelTarget, setCancelTarget] = useState<LeaveRequest | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate,   setEndDate]   = useState("");
  const [reason,    setReason]    = useState("");
  const [formError, setFormError] = useState("");
  const [success,   setSuccess]   = useState("");
  const [isPending, startTransition] = useTransition();
  // Settings → Time Away Settings → Enable Time Away Request. Defaults to
  // enabled so a slow or failed read never locks contractors out of filing;
  // submitLeaveRequest re-checks server-side, which is the real enforcement.
  const [requestsEnabled, setRequestsEnabled] = useState(true);

  const loadRequests = useCallback(async (userEmail: string) => {
    const reqs = await fetchLeaveRequests(userEmail);
    setRequests(reqs);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) { router.replace("/login"); return; }
      const userEmail = session.user.email;
      setEmail(userEmail);
      const [profile, enabled] = await Promise.all([
        fetchContractorTimeOff(userEmail),
        loadRequests(userEmail),
        fetchTimeAwayRequestsEnabled().catch(() => true),
      ]).then(([p, , e]) => [p, e] as const);
      setRequestsEnabled(enabled);
      if (!profile) { setError("Profile not found."); setLoading(false); return; }
      setData(profile);
      // India contractors don't have PTO — default to sick leave tab
      const profileCountry = profile.location?.split(",").pop()?.trim().toLowerCase() ?? "";
      if (profileCountry === "india") setLeaveType("Sick Leave");
      setLoading(false);
    })();
  }, [router, loadRequests]);

  const isHalfDay = leaveType.endsWith("Half Day");
  // Covers both "PTO" and "PTO Half Day", matching how the history tables below
  // already classify a row (row.type.startsWith("PTO")).
  const isPto = leaveType.startsWith("PTO");

  // PTO must be filed at least two weeks ahead. A date on the boundary itself
  // (exactly 14 days out) is fine; anything nearer is short notice.
  const PTO_NOTICE_DAYS = 14;
  const earliestPtoDate = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + PTO_NOTICE_DAYS);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  // ISO date strings compare correctly as plain strings, so no Date parsing
  // (and no timezone drift) is needed here.
  function daysOfNotice(date: string) {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(`${date}T00:00:00`);
    return Math.round((to.getTime() - from.getTime()) / 86400000);
  }

  const effectiveEndDate = isHalfDay ? startDate : endDate;

  // Every date already spoken for by a live request, mapped to what booked it.
  // Rejected and Archived requests free their dates back up.
  const bookedDates = (() => {
    const map = new Map<string, { kind: "pto" | "sick" | "other"; status: string; type: string }>();
    for (const r of allRequests.length > 0 ? allRequests : requests) {
      if (r.status === "Rejected" || r.status === "Archived") continue;
      const kind = isPtoLeaveType(r.type) ? "pto" : r.type.includes("Sick") ? "sick" : "other";
      for (const d of datesCoveredBy(r.startDate, r.endDate)) {
        // A Pending marker should not overwrite an Approved one for the day.
        if (!map.has(d) || map.get(d)!.status === "Pending") map.set(d, { kind, status: r.status, type: r.type });
      }
    }
    return map;
  })();

  // Hours already held per date, and what this request would add to each date
  // it covers. A date is only closed once the two together pass 8 — so a PTO
  // Half Day and a Sick Leave Half Day can share one date, while a second
  // full day on top of either cannot.
  const bookedHours = bookedLeaveHoursByDate(
    (allRequests.length > 0 ? allRequests : requests).map((r) => ({
      type: r.type, startDate: r.startDate, endDate: r.endDate, status: r.status,
    })),
  );
  const hoursThisRequestAdds = leaveHoursPerCoveredDate(leaveType);
  const wouldExceedOn = (date: string) =>
    hoursThisRequestAdds > 0
    && (bookedHours.get(date) ?? 0) + hoursThisRequestAdds > MAX_LEAVE_HOURS_PER_DAY;

  // Dates in the range being filled in that this request cannot fit on.
  const clashingDates = datesCoveredBy(startDate, effectiveEndDate).filter(wouldExceedOn);
  // The Start / End hints already speak for those two dates; this covers a
  // clash buried in the middle of a range, which neither field would show.
  const clashesInsideRange = clashingDates.filter((d) => d !== startDate && d !== effectiveEndDate);
  // Same shape Leave Override passes its calendar, but keyed on whether THIS
  // request still fits rather than on the date being touched at all — a date
  // holding 4h stays selectable for another half day and closed to a full one.
  const blockedDates = new Set([...bookedHours.keys()].filter(wouldExceedOn));
  // The hint beside each field still names whatever already holds the date,
  // shown whenever there is something there — including the 4h case that is
  // no longer blocking, so the contractor can see why the day is part-used.
  const startBooked = startDate ? bookedDates.get(startDate) : undefined;
  const endBooked = effectiveEndDate && effectiveEndDate !== startDate ? bookedDates.get(effectiveEndDate) : undefined;
  const startTooSoon = isPto && Boolean(startDate) && startDate < earliestPtoDate;
  const endTooSoon = isPto && Boolean(effectiveEndDate) && effectiveEndDate < earliestPtoDate;

  const estimatedDays = (() => {
    if (isHalfDay) return startDate ? 0.5 : null;
    if (!startDate || !endDate) return null;
    const s = new Date(startDate), e = new Date(endDate);
    if (e < s) return null;
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  })();

  // DB durationDays is Int — half day is stored as 1; the type field ("* Half Day") already encodes it
  const durationDaysForDB = isHalfDay ? 1 : (estimatedDays ?? 1);

  function handleSubmit() {
    if (!startDate) { setFormError("Start date is required."); return; }
    if (!isHalfDay && !endDate) { setFormError("End date is required."); return; }
    if (!isHalfDay && new Date(endDate) < new Date(startDate)) { setFormError("End date must be on or after start date."); return; }
    if (clashingDates.length > 0) {
      setFormError(
        clashingDates.length === 1
          ? `You already have a time away request on ${fmtDayAndDate(clashingDates[0])}.`
          : `You already have time away requests on ${clashingDates.length} of the selected dates, starting ${fmtDayAndDate(clashingDates[0])}.`
      );
      return;
    }
    setFormError(""); setSuccess("");

    startTransition(async () => {
      const result = await submitLeaveRequest({
        email,
        type:         leaveType,
        startDate,
        endDate:      isHalfDay ? startDate : endDate,
        durationDays: durationDaysForDB,
        reason,
      });
      if (!result.ok) {
        setFormError(result.error ?? "Failed to submit request.");
        return;
      }
      setSuccess("Request submitted successfully!");
      setStartDate(""); setEndDate(""); setReason("");
      await loadRequests(email);
    });
  }

  function handleClear() {
    setStartDate(""); setEndDate(""); setReason("");
    setFormError(""); setSuccess("");
  }

  async function handleOpenHistory() {
    setShowHistory(true);
    setHistoryLoading(true);
    const all = await fetchAllLeaveRequests(email);
    setAllRequests(all);
    setHistoryLoading(false);
  }

  // Cancelling deletes the request outright, so it goes through a confirm
  // step rather than firing on a single click.
  async function handleCancel(id: string) {
    setCancelBusy(true);
    setCancelError("");
    const result = await cancelLeaveRequest(id, email);
    setCancelBusy(false);
    if (!result.ok) {
      setCancelError(result.error ?? "Could not cancel the request. Please try again.");
      return;
    }
    setRequests((prev) => prev.filter((r) => r.id !== id));
    setAllRequests((prev) => prev.filter((r) => r.id !== id));
    setCancelTarget(null);
  }

  const viewDialog = viewRequest && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setViewRequest(null)} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[#003527]">{leaveTypeDisplayLabel(viewRequest.type)}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Request details</p>
          </div>
          <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold border ${statusStyle(viewRequest.status)}`}>
            {viewRequest.status}
          </span>
        </div>
        <div className="px-5 py-4 space-y-0.5">
          {([
            ["Dates", viewRequest.endDate && viewRequest.endDate !== viewRequest.startDate
              ? `${fmtDayAndDate(viewRequest.startDate)} – ${fmtDayAndDate(viewRequest.endDate)}`
              : fmtDayAndDate(viewRequest.startDate)],
            ["Duration", fmtRequestHours(viewRequest.type, viewRequest.durationDays)],
            ["Filed", fmtDayAndDate(String(viewRequest.createdAt).slice(0, 10))],
          ] as const).map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-1.5 border-b border-dotted border-slate-200 last:border-b-0">
              <span className="text-xs text-slate-500">{label}</span>
              <span className="text-sm font-medium text-slate-700 text-right">{value}</span>
            </div>
          ))}
          <div className="pt-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1.5">Reason</p>
            <div className="rounded-xl border border-slate-200 px-3 py-2.5 min-h-[4rem]">
              <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                {viewRequest.reason?.trim() || <span className="text-slate-300">No reason given.</span>}
              </p>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={() => setViewRequest(null)}
            className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  const cancelDialog = cancelTarget && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !cancelBusy && setCancelTarget(null)} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-lg font-bold text-[#003527]">Cancel this request?</h3>
        <p className="text-sm text-slate-500 mt-1.5">
          {leaveTypeDisplayLabel(cancelTarget.type)} on{" "}
          <span className="font-semibold text-slate-700">
            {cancelTarget.endDate && cancelTarget.endDate !== cancelTarget.startDate
              ? `${fmtNoticeDate(cancelTarget.startDate)} – ${fmtNoticeDate(cancelTarget.endDate)}`
              : fmtNoticeDate(cancelTarget.startDate)}
          </span>.
        </p>
        <p className="text-xs text-slate-400 mt-2">
          The request will be deleted and those dates freed up. This cannot be undone
          — you would need to submit a new request.
        </p>
        {cancelError && <p className="mt-3 text-xs font-medium text-red-600">{cancelError}</p>}
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={() => setCancelTarget(null)}
            disabled={cancelBusy}
            className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40"
          >
            Keep request
          </button>
          <button
            onClick={() => handleCancel(cancelTarget.id)}
            disabled={cancelBusy}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cancelBusy
              ? <LuLoader size={13} strokeWidth={2} className="animate-spin" />
              : <LuX size={13} strokeWidth={2.5} />}
            {cancelBusy ? "Cancelling…" : "Cancel request"}
          </button>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LuLoader size={28} className="text-slate-300 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-sm">
        {error || "Unable to load time-off data."}
      </div>
    );
  }

  const now = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // location stored as "State, Country" — extract last segment
  const country = data.location
    ? data.location.split(",").pop()?.trim() ?? ""
    : "";
  const isPtoHidden = country.toLowerCase() === "india";

  return (
    <div className="space-y-5 max-w-[110rem] mx-auto">
      {cancelDialog}
      {viewDialog}
      {/* Page title */}
      <PageHeader
        eyebrow=""
        title="Time Away"
        subtitle="Track and manage your leave requests and balances."
        right={
          <HeaderChip icon={<LuClock size={13} strokeWidth={2} className="text-emerald-600" />}>
            Last updated: {now}
          </HeaderChip>
        }
      />

      {/* Balance cards */}
      <section className={isPtoHidden ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 lg:grid-cols-2 gap-4"}>
        {!isPtoHidden && (
          <BalanceCard
            icon={<LuUmbrella size={20} strokeWidth={1.75} />}
            iconBg="bg-emerald-100 text-emerald-900"
            title="Paid Time Off (PTO)"
            badge="Active Cycle"
            badgeBg="bg-emerald-50"
            badgeText="text-emerald-700"
            total={data.ptoBalance}
            used={data.ptoUsed}
            barUsed="bg-emerald-700"
            barAvail="bg-emerald-200"
            availColor="text-emerald-700"
          />
        )}
        <BalanceCard
          icon={<LuStethoscope size={20} strokeWidth={1.75} />}
          iconBg="bg-teal-100 text-teal-700"
          title="Medical Unavailability"
          badge="Renewal Dec 31"
          badgeBg="bg-slate-50"
          badgeText="text-slate-500"
          total={data.sickLeaveBalance}
          used={data.sickLeaveUsed}
          barUsed="bg-teal-600"
          barAvail="bg-teal-200"
          availColor="text-teal-700"
          wide={isPtoHidden}
        />
      </section>

      {/* Apply for Leave — a banner that opens the form, rather than the whole
          form sitting open on the page. */}
      <section className="rounded-2xl border border-emerald-100 bg-linear-to-r from-emerald-50/80 to-white shadow-sm px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="size-11 rounded-xl bg-emerald-100 text-emerald-700 grid place-items-center shrink-0">
          <LuClipboardList size={20} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-[#003527]">Apply for Leave</h3>
          <p className="text-xs text-slate-500 mt-0.5">Submit a request for time away. All fields are required.</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setFormError(""); }}
          disabled={!requestsEnabled}
          title={!requestsEnabled ? "Time Away requests are currently disabled by your administrator" : undefined}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#046B4D] hover:bg-[#035c42] text-white text-sm font-bold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LuCirclePlus size={17} strokeWidth={2} />
          {requestsEnabled ? "Apply for Leave" : "Requests Closed"}
          <LuChevronRight size={16} strokeWidth={2.5} />
        </button>
      </section>

      {/* The form itself, in a dialog. */}
      {showForm && (
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
        <section className="relative grid grid-cols-1 gap-8 min-w-0 w-full max-w-2xl my-8">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="border-b border-slate-100 px-5 py-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center shrink-0">
              <LuClipboardList size={19} strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-[#003527]">Apply for Leave</h3>
              <p className="text-xs text-slate-400 mt-0.5">Submit a request for time away. All fields are required.</p>
            </div>
            <button
              onClick={() => setShowForm(false)}
              aria-label="Close"
              className="shrink-0 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <LuX size={16} strokeWidth={2.5} />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Requests turned off under Settings → Time Away Settings. The
                section stays visible — balances and history are still useful —
                but nothing here can be submitted. */}
            {!requestsEnabled && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <LuCircleAlert size={16} strokeWidth={2} className="text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-800">Time Away requests are currently closed</p>
                  <p className="text-xs text-amber-700/90 mt-0.5">
                    New requests are temporarily disabled by your administrator. Your balances and request history
                    below are still up to date — please check back later or contact your OWE contact.
                  </p>
                </div>
              </div>
            )}

            {/* Success banner */}
            {success && (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700 font-medium">
                <LuCircleCheck size={16} strokeWidth={2} />
                {success}
              </div>
            )}

            {/* Error banner */}
            {formError && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 font-medium">
                <LuCircleAlert size={16} strokeWidth={2} />
                {formError}
              </div>
            )}

            {/* fieldset disables every control inside in one place, so a new
                field added later is covered without being wired up separately. */}
            <fieldset disabled={!requestsEnabled} className={`space-y-5 border-0 p-0 m-0 ${!requestsEnabled ? "opacity-60" : ""}`}>
            {/* Leave Type */}
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2">1. Leave Type</label>
              <div className="relative">
                <LuCalendarDays size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none" />
                <select
                  value={leaveType}
                  onChange={(e) => { setLeaveType(e.target.value as typeof ALL_LEAVE_TYPES[number]); setFormError(""); setSuccess(""); }}
                  className="w-full appearance-none text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg pl-9 pr-9 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  {(isPtoHidden ? INDIA_LEAVE_TYPES : ALL_LEAVE_TYPES).map((t) => (
                    <option key={t} value={t}>{leaveTypeDisplayLabel(t)}</option>
                  ))}
                </select>
                <LuChevronDown size={16} strokeWidth={2} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* PTO carries a two-week notice period; Sick Leave does not. */}
              {isPto && (
                <div className="mt-2 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5">
                  <LuInfo size={15} strokeWidth={2} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800">
                    <span className="font-bold">PTO must be filed at least 2 weeks in advance.</span>{" "}
                    The earliest date that meets this is{" "}
                    <span className="font-bold tabular-nums">{fmtNoticeDate(earliestPtoDate)}</span>.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">2. Start Date</label>
                <div className={`rounded-lg border px-3 py-2 ${
                  // A booked date blocks submission outright, so it takes
                  // precedence over the short-notice warning.
                  startBooked ? bookedFieldTone(startBooked.kind)
                    : startTooSoon ? "bg-red-50 border-red-300"
                    : "bg-white border-slate-200"
                }`}>
                  <CalendarDateInput
                    value={startDate}
                    blockedDates={blockedDates}
                    onChange={(next) => {
                      setStartDate(next);
                      // Don't leave an End Date sitting before the new start.
                      if (endDate && endDate < next) setEndDate(next);
                    }}
                  />
                </div>
                {startTooSoon && <ShortNoticeHint days={daysOfNotice(startDate)} />}
                {startBooked && (
                  <BookedDateHint
                    date={startDate}
                    booked={startBooked}
                    heldHours={bookedHours.get(startDate) ?? 0}
                    blocked={wouldExceedOn(startDate)}
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">3. End Date</label>
                <div className={`rounded-lg border px-3 py-2 ${
                  isHalfDay ? "bg-slate-100 border-slate-200"
                    : endBooked ? bookedFieldTone(endBooked.kind)
                    : endTooSoon ? "bg-red-50 border-red-300"
                    : "bg-white border-slate-200"
                }`}>
                  <CalendarDateInput
                    value={isHalfDay ? startDate : endDate}
                    minDate={startDate || undefined}
                    blockedDates={blockedDates}
                    disabled={isHalfDay}
                    onChange={setEndDate}
                  />
                </div>
                {endTooSoon && <ShortNoticeHint days={daysOfNotice(effectiveEndDate)} />}
                {endBooked && (
                  <BookedDateHint
                    date={effectiveEndDate}
                    booked={endBooked}
                    heldHours={bookedHours.get(effectiveEndDate) ?? 0}
                    blocked={wouldExceedOn(effectiveEndDate)}
                  />
                )}
              </div>
            </div>

            {clashesInsideRange.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <LuCircleAlert size={16} strokeWidth={2} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-800">
                    {clashesInsideRange.length === 1 ? "A day" : `${clashesInsideRange.length} days`} inside this range
                    {" "}would go over the {MAX_LEAVE_HOURS_PER_DAY}-hour daily leave limit.
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {clashesInsideRange.slice(0, 5).map((d) => fmtDayAndDate(d)).join(", ")}
                    {clashesInsideRange.length > 5 && ` and ${clashesInsideRange.length - 5} more`}.
                    {" "}Cancel the existing request first, or pick different dates.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2">4. Reason for Request</label>
              <textarea
                rows={3}
                maxLength={500}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Briefly describe the reason for your time off..."
                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
              />
              <p className="text-right text-xs text-slate-400 mt-1">{reason.length} / 500</p>
            </div>

            {/* Note */}
            <div className="flex items-start gap-3 bg-emerald-50/70 border border-emerald-100 rounded-xl px-4 py-3.5">
              <LuInfo size={16} strokeWidth={1.75} className="text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-800">Note</p>
                <p className="text-xs text-emerald-700/80 mt-0.5">Ensure your balance is sufficient before submitting your request.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                onClick={handleClear}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                <LuX size={15} strokeWidth={2} /> Clear
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending || !requestsEnabled}
                title={!requestsEnabled ? "Time Away requests are currently disabled by your administrator" : undefined}
                className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold px-6 py-2.5 rounded-lg transition-all shadow-sm text-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                {isPending ? <LuLoader size={15} className="animate-spin" /> : <LuSend size={15} strokeWidth={2} />}
                {isPending ? "Submitting…" : !requestsEnabled ? "Requests Closed" : "Submit Request"}
              </button>
            </div>
            </fieldset>
          </div>
        </div>
        </section>
      </div>
      )}

      {/* Recent requests */}
      <section className="space-y-3 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#003527]">Recent Requests</h3>
          <button
            onClick={handleOpenHistory}
            className="text-emerald-700 text-sm font-semibold flex items-center gap-1 hover:underline"
          >
            View All History <LuChevronRight size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-auto max-h-[26rem]">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Type", "Dates", "Duration", "Reason", "Status", "Action"].map(h => (
                    <th key={h} className="bg-slate-50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400">
                      No requests yet. Use Apply for Leave above to submit one.
                    </td>
                  </tr>
                ) : (
                  requests.map((row) => {
                    const isPto = row.type.startsWith("PTO");
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${isPto ? "bg-emerald-50 text-emerald-700" : "bg-teal-50 text-teal-700"}`}>
                              {isPto
                                ? <LuUmbrella size={15} strokeWidth={1.75} />
                                : <LuStethoscope size={15} strokeWidth={1.75} />
                              }
                            </div>
                            <span className="text-sm font-semibold text-slate-800">{leaveTypeDisplayLabel(row.type)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap">
                          {fmtDateRange(row.startDate, row.endDate)}
                        </td>
                        <td className="px-4 py-2.5 text-sm font-semibold text-slate-800 whitespace-nowrap">
                          {fmtRequestHours(row.type, row.durationDays)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-400 italic max-w-[180px] truncate">
                          {row.reason || "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusStyle(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {row.status === "Pending" ? (
                            <button
                              onClick={() => { setCancelTarget(row); setCancelError(""); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
                            >
                              <LuX size={13} strokeWidth={2.5} /> Cancel Request
                            </button>
                          ) : (
                            <button
                              onClick={() => setViewRequest(row)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                            >
                              <LuEye size={13} strokeWidth={2} /> View
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── History Modal ── */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowHistory(false)}
          />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-[#003527]">Leave Request History</h2>
                <p className="text-xs text-slate-400 mt-0.5">All time-off requests submitted through the portal</p>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <LuX size={18} strokeWidth={2} />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-auto flex-1">
              {historyLoading ? (
                <div className="flex items-center justify-center py-20">
                  <LuLoader size={26} className="text-slate-300 animate-spin" />
                </div>
              ) : allRequests.length === 0 ? (
                <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
                  No leave requests found.
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr className="border-b border-slate-100">
                      {["#", "Type", "Start Date", "End Date", "Duration", "Reason", "Submitted On", "Status"].map(h => (
                        <th key={h} className="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {allRequests.map((row, i) => {
                      const isPto = row.type.startsWith("PTO");
                      const submittedOn = new Date(row.createdAt).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      });
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-5 py-4 text-xs text-slate-400 font-medium">{i + 1}</td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded-lg ${isPto ? "bg-emerald-50 text-emerald-700" : "bg-teal-50 text-teal-700"}`}>
                                {isPto
                                  ? <LuUmbrella size={13} strokeWidth={1.75} />
                                  : <LuStethoscope size={13} strokeWidth={1.75} />
                                }
                              </div>
                              <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">{leaveTypeDisplayLabel(row.type)}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">
                            {new Date(row.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">
                            {new Date(row.endDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-5 py-4 text-sm font-semibold text-slate-800 whitespace-nowrap">
                            {fmtRequestHours(row.type, row.durationDays)}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-400 italic max-w-[200px]">
                            <span className="block truncate" title={row.reason}>{row.reason || "—"}</span>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap">{submittedOn}</td>
                          <td className="px-5 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusStyle(row.status)}`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-slate-100 shrink-0 flex items-center justify-between bg-slate-50/50">
              <p className="text-xs text-slate-400">
                {allRequests.length} request{allRequests.length !== 1 ? "s" : ""} total
              </p>
              <button
                onClick={() => setShowHistory(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
