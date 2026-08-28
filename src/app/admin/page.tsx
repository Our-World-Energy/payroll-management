"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { LuTrendingUp, LuX, LuClock, LuBriefcase, LuUser, LuTriangleAlert } from "react-icons/lu";
import { AnnouncementBoard } from "@/components/AnnouncementBoard";
import { HolidayCalendar } from "@/components/HolidayCalendar";
import { BirthdayCalendar } from "@/components/BirthdayCalendar";
import { fetchAllContractors, fetchAllLeaveRequestsAdmin } from "./contractors/actions";
import { utcInstantForLocalTime, ARIZONA_TIME_ZONE } from "@/lib/countryTimeZones";
import { LATE_GRACE_MINUTES, SHIFTING_SCHEDULE, parseShiftTime } from "./contractors/shiftScheduleShared";

type AbsentRow = {
  name: string;
  department: string;
  date: string;
  status: string;
  email?: string;
};

type LateRow = {
  name: string;
  department: string;
  date: string;
  detail: string;
};

type PtoRow = {
  name: string;
  department: string;
  date: string;
  status: string;
};

// contractor_profiles.shiftHours is free text like "9:00 AM to 6:00 PM"
// (or "Flexible" for non-Fixed shifts) — pull the leading start time out of it.
function parseShiftStart(shiftHours: string): { hour: number; minute: number } | null {
  const first = shiftHours.split(" to ")[0]?.trim();
  const m = first?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") hour += 12;
  return { hour, minute: Number(m[2]) };
}


// contractor_profiles.location is stored as "City, Country" — same parsing
// convention used on the Contractors/Payroll pages for country filtering.
function countryFromLocation(location: string) {
  const parts = location.split(",");
  return parts[parts.length - 1]?.trim() || "";
}

type CountryCounts = {
  totalActive: number;
  philippines: number;
  mexico: number;
  india: number;
  guatemala: number;
  colombia: number;
};

const EMPTY_COUNTRY_COUNTS: CountryCounts = {
  totalActive: 0, philippines: 0, mexico: 0, india: 0, guatemala: 0, colombia: 0,
};

export default function AdminPage() {
  // Computed client-side after mount (not during the SSR/first-paint render)
  // to avoid a server-vs-client time zone mismatch — starts as a neutral
  // greeting that's replaced within the same tick on real browsers.
  const [greeting, setGreeting] = useState("Good day");
  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  }, []);

  const [showAbsentModal, setShowAbsentModal] = useState(false);
  const [showLateModal, setShowLateModal] = useState(false);
  const [showPtoModal, setShowPtoModal] = useState(false);
  const [absentRows, setAbsentRows] = useState<AbsentRow[]>([]);
  const [lateRows, setLateRows] = useState<LateRow[]>([]);
  const [ptoRows, setPtoRows] = useState<PtoRow[]>([]);
  const [countryCounts, setCountryCounts] = useState<CountryCounts>(EMPTY_COUNTRY_COUNTS);

  // Active contractors present in Contractor Details but with no record in
  // Worksnap at all. A subset of Absent Today by definition — no Worksnap
  // record means no time today — but a different problem: they aren't being
  // tracked, rather than being away.
  const [noWorksnapRows, setNoWorksnapRows] = useState<AbsentRow[]>([]);
  const noWorksnapEmails = new Set(noWorksnapRows.map((r) => r.email).filter(Boolean) as string[]);

  // What the Absent Today modal lists: every contractor with no Worksnap time
  // today, plus any untracked contractor not already among them. The two
  // usually overlap completely (no Worksnap record means no time today), but
  // absentRows is gated behind the 7:30am cutoff below — before then it is
  // empty, and without this merge the modal would show nothing while the tile
  // still reported 9.
  const absentModalRows: AbsentRow[] = (() => {
    const seen = new Set(absentRows.map((r) => r.email).filter(Boolean) as string[]);
    const missing = noWorksnapRows.filter((r) => r.email && !seen.has(r.email));
    const rows = [...absentRows, ...missing];
    // Untracked contractors last, so the two groups read as groups.
    return rows.sort((a, b) => {
      const aUntracked = Boolean(a.email) && noWorksnapEmails.has(a.email!);
      const bUntracked = Boolean(b.email) && noWorksnapEmails.has(b.email!);
      if (aUntracked !== bUntracked) return aUntracked ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  })();

  useEffect(() => {
    let isMounted = true;
    // Trailing slash matches next.config's trailingSlash: true — without it
    // this takes a 308 on every load.
    fetch("/api/worksnap-coverage/")
      .then(async (r) => {
        if (!r.ok) throw new Error(`worksnap-coverage returned ${r.status}`);
        return r.json();
      })
      .then((result: { untracked?: { name: string; department: string; email: string }[] }) => {
        if (!isMounted) return;
        setNoWorksnapRows(
          (result.untracked ?? []).map((c) => ({
            name: c.name,
            department: c.department,
            date: "",
            status: "No Worksnap",
            email: c.email.trim().toLowerCase(),
          }))
        );
      })
      // Logged rather than swallowed: a silent failure here is indistinguishable
      // from "nobody is untracked", which is exactly the wrong thing to show.
      .catch((err) => console.error("No Worksnap count failed to load:", err));
    return () => { isMounted = false; };
  }, []);

  // Live per-country Active headcounts (independent of the absent/late gate
  // below, which only runs after 7:30am) — these tiles should always be current.
  useEffect(() => {
    let isMounted = true;
    fetchAllContractors({ country: "All Countries", status: "Active", rules: [] })
      .then((contractors) => {
        if (!isMounted) return;
        const counts = { ...EMPTY_COUNTRY_COUNTS };
        for (const c of contractors) {
          counts.totalActive++;
          const country = countryFromLocation(c.location || "");
          if (country === "Philippines") counts.philippines++;
          else if (country === "Mexico") counts.mexico++;
          else if (country === "India") counts.india++;
          else if (country === "Guatemala") counts.guatemala++;
          else if (country === "Colombia") counts.colombia++;
        }
        setCountryCounts(counts);
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    async function loadAbsent() {
      const now = new Date();
      const cutoff = new Date();
      cutoff.setHours(7, 30, 0, 0);
      if (now < cutoff) return;

      const todayLocal = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");

      try {
        const [entriesRes, contractors, dailyLogRes, leaveRequests, shiftScheduleRes] = await Promise.all([
          fetch(`/api/worksnap-entries?from=${todayLocal}&to=${todayLocal}`).then((r) => r.json()),
          fetchAllContractors({ country: "All Countries", status: "Active", rules: [] }),
          fetch(`/api/attendance/daily-log?date=${todayLocal}`).then((r) => (r.ok ? r.json() : { logs: [] })),
          fetchAllLeaveRequestsAdmin().catch(() => []),
          // Per-date windows for Shifting Schedule contractors — their start
          // time changes day to day, so it can't come from shiftHours.
          fetch(`/api/attendance/shift-schedule?date=${todayLocal}`)
            .then((r) => (r.ok ? r.json() : { schedules: [] }))
            .catch(() => ({ schedules: [] })),
        ]);

        const shiftStartByEmail = new Map<string, string>();
        for (const s of (shiftScheduleRes.schedules ?? []) as { email: string; shiftStart: string }[]) {
          const email = String(s.email ?? "").trim().toLowerCase();
          if (email && s.shiftStart) shiftStartByEmail.set(email, s.shiftStart);
        }

        const minutesByEmail = new Map<string, number>();
        for (const e of (entriesRes.entries ?? [])) {
          const email = String(e.email ?? "").trim().toLowerCase();
          if (email) minutesByEmail.set(email, (minutesByEmail.get(email) ?? 0) + ((e as { durationMins?: number }).durationMins ?? 0));
        }

        // Late Today keys off `firstInLogged` — the contractor's actual clock-in
        // instant. `firstIn` is the rounded Worksnap time-entry bucket boundary
        // (e.g. 6:30:01 for a 6:32:51 clock-in), which reads a few minutes early
        // and can clear the grace period when the real login didn't. Fall back to
        // `firstIn` only for the small tail of rows with no logged instant.
        const firstInByEmail = new Map<string, Date>();
        for (const log of (dailyLogRes.logs ?? [])) {
          const email = String(log.email ?? "").trim().toLowerCase();
          const logged = log.firstInLogged ?? log.firstIn;
          if (email && logged) firstInByEmail.set(email, new Date(logged));
        }

        const activeContractors = contractors.filter((c) => c.status === "Active" && c.email);

        // If a contractor with no logged time today has an approved leave
        // request covering today, that's why they're absent — label it PTO
        // or Medical Unavailability instead of a bare "Absent" (Half Day/Unpaid/Special
        // Leave requests are left as "Absent" since they weren't asked for).
        function absenceStatusFor(email: string): string {
          const match = leaveRequests.find((r) =>
            r.status === "Approved" && r.email.trim().toLowerCase() === email && todayLocal >= r.startDate && todayLocal <= r.endDate
          );
          if (match?.type === "PTO") return "PTO";
          if (match?.type === "Sick Leave") return "Medical Unavailability";
          return "Absent";
        }

        // Absent = no actual Worksnap time logged today at all (matches the same
        // "Worksnap Actual Time" total shown in Attendance Review) — checked by
        // total minutes, not just whether a (possibly zero-duration) entry exists.
        setAbsentRows(
          activeContractors
            .filter((c) => (minutesByEmail.get(c.email!.trim().toLowerCase()) ?? 0) === 0)
            .map((c) => ({ name: c.fullName, department: c.department, date: todayLocal, status: absenceStatusFor(c.email!.trim().toLowerCase()), email: c.email!.trim().toLowerCase() }))
        );

        // Late Today applies to Fixed and Shifting Schedule contractors — real
        // check: firstInLogged (worksnap_daily_log) vs the contractor's own
        // Shift Start for today, in Arizona time, with the LATE_GRACE_MINUTES grace period
        // (a clock-in at exactly Shift Start + 15 min is still on time; one
        // minute past that is late). Fixed contractors take their start from
        // contractor_profiles.shiftHours; Shifting Schedule contractors from
        // today's row in contractor_shift_schedule. Flexible shift contractors
        // have no start time to be late against, so they're excluded entirely.
        const lateRows: LateRow[] = [];
        for (const c of activeContractors) {
          const shiftTypeLabel = (c.shiftType || "").trim();
          const isFixed = shiftTypeLabel.toLowerCase() === "fixed";
          const isShifting = shiftTypeLabel === SHIFTING_SCHEDULE;
          if (!isFixed && !isShifting) continue;

          const email = c.email!.trim().toLowerCase();
          const firstIn = firstInByEmail.get(email);
          // A Shifting Schedule contractor is judged against today's own
          // assigned start; with no row for today they have no start time to be
          // late against and are skipped, the same as a Flexible contractor.
          const shiftStart = isShifting
            ? parseShiftTime(shiftStartByEmail.get(email) ?? "")
            : parseShiftStart(c.shiftHours || "");
          if (!firstIn || !shiftStart) continue; // no clock-in yet today, or no parsable shift start

          // Shift Start (from Contractor Profile) and firstIn are both
          // compared in Arizona time — the same reference frame the Task
          // Breakdown modal already displays First In/Last Out in.
          const shiftStartInstant = utcInstantForLocalTime(todayLocal, shiftStart.hour, shiftStart.minute, ARIZONA_TIME_ZONE);
          const thresholdInstant = utcInstantForLocalTime(todayLocal, shiftStart.hour, shiftStart.minute + LATE_GRACE_MINUTES, ARIZONA_TIME_ZONE);

          if (firstIn.getTime() > thresholdInstant.getTime()) {
            const lateByMinutes = Math.round((firstIn.getTime() - shiftStartInstant.getTime()) / 60000);
            const loginLabel = firstIn.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ARIZONA_TIME_ZONE });
            lateRows.push({ name: c.fullName, department: c.department, date: todayLocal, detail: `Logged in ${loginLabel} (${lateByMinutes} min late)` });
          }
        }
        setLateRows(lateRows);

        // PTO/Medical Unavailability Today — every active contractor with an Approved
        // PTO or Medical Unavailability request (full or half day) covering today,
        // sourced straight from Time Away Management, independent of whether
        // they also logged Worksnap time today.
        const ptoRows: PtoRow[] = [];
        for (const c of activeContractors) {
          const email = c.email!.trim().toLowerCase();
          const match = leaveRequests.find((r) =>
            r.status === "Approved" &&
            r.email.trim().toLowerCase() === email &&
            todayLocal >= r.startDate && todayLocal <= r.endDate &&
            (r.type === "PTO" || r.type === "PTO Half Day" || r.type === "Sick Leave" || r.type === "Sick Leave Half Day")
          );
          if (match) {
            ptoRows.push({ name: c.fullName, department: c.department, date: todayLocal, status: match.type.startsWith("PTO") ? "PTO" : "Medical Unavailability" });
          }
        }
        setPtoRows(ptoRows);
      } catch {
        // silently fail — keep empty lists
      }
    }

    loadAbsent();
  }, []);

  const METRICS = [
    { label: "Active Total Contractors", value: countryCounts.totalActive, delta: "+4% this month",       href: "/admin/contractors", highlight: true  },
    { label: "Philippines",              value: countryCounts.philippines, sub: "Support & Logistics",    href: "/admin/contractors?country=Philippines", highlight: false },
    { label: "Mexico",                   value: countryCounts.mexico,      sub: "Manufacturing & Solar",  href: "/admin/contractors?country=Mexico",      highlight: false },
    { label: "India",                    value: countryCounts.india,       sub: "Tech & Engineering",     href: "/admin/contractors?country=India",       highlight: false },
    { label: "Guatemala",                value: countryCounts.guatemala,   sub: "Regional Operations",    href: "/admin/contractors?country=Guatemala",   highlight: false },
    { label: "Colombia",                 value: countryCounts.colombia,    sub: "Regional Operations",    href: "/admin/contractors?country=Colombia",    highlight: false },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-[#003527] tracking-tight flex items-center gap-2">
          {greeting} <span aria-hidden>👋</span>
        </h2>
        <p className="text-sm md:text-base text-slate-500 mt-1">Here&apos;s your Contractor Overview</p>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 md:gap-4 mb-6 md:mb-8">
        {METRICS.map((card) => {
          if (card.highlight) {
            return (
              <Link key={card.label} href={card.href} className="col-span-2 sm:col-span-1 bg-[#003527] hover:bg-[#064e3b] text-white p-2 rounded-xl shadow-md flex flex-col justify-between transition-colors cursor-pointer">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{card.label}</p>
                  <p className="text-xl font-black mt-0.5">{card.value}</p>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-300">
                  <LuTrendingUp size={10} strokeWidth={2} />
                  {card.delta}
                </div>
              </Link>
            );
          }
          return (
            <Link key={card.label} href={card.href} className="bg-white hover:bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between transition-colors cursor-pointer">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{card.label}</p>
                <p className="text-xl font-bold text-[#003527] mt-0.5">{card.value}</p>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">{card.sub}</p>
            </Link>
          );
        })}

        {/* PTO/Medical Unavailability + Absent Today + Late Today — one slim stacked column */}
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => setShowPtoModal(true)}
            className="text-left bg-blue-50 hover:bg-blue-100 rounded-xl px-2.5 py-1.5 flex items-center gap-2 transition-colors flex-1"
          >
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 grid place-items-center shrink-0">
              <LuBriefcase size={13} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold text-blue-600 uppercase tracking-wider leading-none truncate">PTO/Medical Unavailability</p>
              <p className="text-sm font-bold text-blue-700 leading-tight mt-0.5">{ptoRows.length}</p>
            </div>
          </button>

          <button
            onClick={() => setShowAbsentModal(true)}
            className="text-left bg-red-50 hover:bg-red-100 rounded-xl px-2.5 py-1.5 flex items-center gap-2 transition-colors flex-1"
          >
            <div className="w-7 h-7 rounded-lg bg-red-100 text-red-600 grid place-items-center shrink-0">
              <LuUser size={13} strokeWidth={2} />
            </div>
            {/* Two separate figures, each with its own label: the shared
                "Absent Today / No Worksnap" caption truncated in this narrow
                column, which hid what the second number even was. Left is no
                Worksnap time logged today; right is no Worksnap record at all
                despite being in Contractor Details — a subset, and a setup
                problem rather than an absence. */}
            <div className="min-w-0 flex items-center gap-2.5">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold text-red-600 uppercase tracking-wider leading-none truncate">Absent Today</p>
                <p className="text-sm font-bold text-red-700 leading-tight mt-0.5">{absentRows.length}</p>
              </div>
              <div className="w-px self-stretch bg-red-200 shrink-0" />
              {/* Violet here and on the modal rows, so the count and the nine
                  contractors it refers to are visibly the same group. */}
              <div className="min-w-0" title="In Contractor Details but no record in Worksnap at all">
                <p className="text-[9px] font-semibold text-violet-600 uppercase tracking-wider leading-none truncate">No Worksnap</p>
                <p className="text-sm font-bold text-violet-700 leading-tight mt-0.5">{noWorksnapRows.length}</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setShowLateModal(true)}
            className="text-left bg-amber-50 hover:bg-amber-100 rounded-xl px-2.5 py-1.5 flex items-center gap-2 transition-colors flex-1"
          >
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-600 grid place-items-center shrink-0">
              <LuClock size={13} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold text-amber-600 uppercase tracking-wider leading-none truncate">Late Today</p>
              <p className="text-sm font-bold text-amber-700 leading-tight mt-0.5">{lateRows.length}</p>
            </div>
          </button>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        {/* Announcement */}
        <AnnouncementBoard />

        {/* Birthdays */}
        <BirthdayCalendar />

        {/* Holidays */}
        <HolidayCalendar />
      </div>

      {/* Absent Today Modal */}
      {showAbsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAbsentModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between px-6 py-5 bg-[#003527]">
              <div>
                <h3 className="text-lg font-bold text-white">Absent Today / No Worksnap</h3>
                <p className="text-sm text-green-200 mt-0.5">
                  {absentRows.length} with no time logged today
                  <span className="text-green-300/80"> · {noWorksnapRows.length} with no Worksnap record at all</span>
                </p>
              </div>
              <button
                onClick={() => setShowAbsentModal(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-green-200 transition-colors hover:bg-[#064E3B] hover:text-white"
              >
                <LuX size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="overflow-y-auto overflow-x-hidden">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[30%]" />
                  <col className="w-[35%]" />
                  <col className="w-[20%]" />
                  <col className="w-[15%]" />
                </colgroup>
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                  <tr>
                    {["Name", "Assigned Team", "Date", "Status"].map((h) => (
                      <th key={h} className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {absentModalRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-400">No absences recorded today.</td>
                    </tr>
                  ) : absentModalRows.map((row, i) => {
                    // A contractor with no Worksnap record at all is reported as
                    // such rather than as a plain absence — the fix is to set
                    // them up in Worksnap, not to chase the missing day.
                    const untracked = Boolean(row.email) && noWorksnapEmails.has(row.email!);
                    const status = untracked ? "No Worksnap" : row.status;
                    return (
                    // The untracked rows are tinted and left-bordered as well as
                    // badged, so the group is findable at a glance in a list of
                    // seventy-odd names rather than only by reading each status.
                    <tr
                      key={i}
                      className={untracked
                        ? "bg-violet-50/70 hover:bg-violet-100/70 transition-colors"
                        : "hover:bg-slate-50 transition-colors"}
                    >
                      <td className={`px-5 py-3 font-semibold break-words ${untracked ? "text-violet-900 border-l-4 border-violet-500" : "text-slate-900"}`}>
                        {row.name}
                      </td>
                      <td className={`px-5 py-3 break-words ${untracked ? "text-violet-800/70" : "text-slate-600"}`}>{row.department}</td>
                      <td className={`px-5 py-3 whitespace-nowrap ${untracked ? "text-violet-800/60" : "text-slate-600"}`}>
                        {untracked ? "—" : row.date}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold uppercase whitespace-nowrap ${
                          untracked ? "bg-violet-600 text-white"
                          : status === "Absent" ? "bg-red-100 text-red-700"
                          : "bg-orange-100 text-orange-700"
                        }`}>
                          {untracked && <LuTriangleAlert size={11} strokeWidth={2.5} />}
                          {status}
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50">
              <button onClick={() => setShowAbsentModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Late Today Modal */}
      {showLateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowLateModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between px-6 py-5 bg-amber-600">
              <div>
                <h3 className="text-lg font-bold text-white">Late Today</h3>
                <p className="text-sm text-amber-100 mt-0.5">{lateRows.length} contractor{lateRows.length !== 1 ? "s" : ""} flagged today</p>
              </div>
              <button
                onClick={() => setShowLateModal(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-amber-100 transition-colors hover:bg-amber-700 hover:text-white"
              >
                <LuX size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-left text-sm" style={{ minWidth: 480 }}>
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                  <tr>
                    {["Name", "Assigned Team", "Date", "Detail"].map((h) => (
                      <th key={h} className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lateRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-400">No late arrivals recorded today.</td>
                    </tr>
                  ) : lateRows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-semibold text-slate-900 whitespace-nowrap">{row.name}</td>
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{row.department}</td>
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{row.date}</td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-1 rounded-md text-[11px] font-bold bg-amber-100 text-amber-700">
                          {row.detail}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50">
              <button onClick={() => setShowLateModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PTO/Medical Unavailability Today Modal */}
      {showPtoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowPtoModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between px-6 py-5 bg-blue-600">
              <div>
                <h3 className="text-lg font-bold text-white">PTO/Medical Unavailability Today</h3>
                <p className="text-sm text-blue-100 mt-0.5">{ptoRows.length} contractor{ptoRows.length !== 1 ? "s" : ""} on approved leave today</p>
              </div>
              <button
                onClick={() => setShowPtoModal(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-blue-100 transition-colors hover:bg-blue-700 hover:text-white"
              >
                <LuX size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-left text-sm" style={{ minWidth: 480 }}>
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                  <tr>
                    {["Name", "Assigned Team", "Date", "Status"].map((h) => (
                      <th key={h} className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ptoRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-400">No approved PTO or Medical Unavailability today.</td>
                    </tr>
                  ) : ptoRows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-semibold text-slate-900 whitespace-nowrap">{row.name}</td>
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{row.department}</td>
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{row.date}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase ${
                          row.status === "PTO" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                        }`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50">
              <button onClick={() => setShowPtoModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
