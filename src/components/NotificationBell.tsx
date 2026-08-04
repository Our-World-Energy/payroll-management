"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LuBell, LuX, LuFileClock, LuUserX, LuClock, LuCake, LuMegaphone, LuLoader,
} from "react-icons/lu";
import { fetchAllContractors, fetchAllLeaveRequestsAdmin } from "@/app/admin/contractors/actions";
import { fetchAnnouncements } from "@/app/admin/announcements/actions";
import { utcInstantForLocalTime, ARIZONA_TIME_ZONE } from "@/lib/countryTimeZones";

type PendingApprovalRow = { name: string; type: string; startDate: string; endDate: string };
type AlertRow = { name: string; department: string };
type BirthdayRow = { name: string };
type AnnouncementRow = { title: string; location: string };

const LATE_GRACE_MINUTES = 15;

// contractor_profiles.shiftHours is free text like "9:00 AM to 6:00 PM"
// (or "Flexible" for non-Fixed shifts) — pull the leading start time out of
// it. Mirrors the same parsing admin/page.tsx's Late Today widget uses.
function parseShiftStart(shiftHours: string): { hour: number; minute: number } | null {
  const first = shiftHours.split(" to ")[0]?.trim();
  const m = first?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") hour += 12;
  return { hour, minute: Number(m[2]) };
}

function todayLocalIso(): string {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

// contractor_profiles.dob is "YYYY-MM-DD" — only month/day matter since a
// birthday recurs every year regardless of birth year.
function monthDayOf(dob: string): { month: number; day: number } | null {
  const [, month, day] = dob.split("-").map(Number);
  if (!month || !day) return null;
  return { month: month - 1, day };
}

function fmtLeaveDates(startDate: string, endDate: string): string {
  return startDate === endDate ? startDate : `${startDate} – ${endDate}`;
}

export function NotificationBell({ dark = false }: { dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalRow[]>([]);
  const [absentRows, setAbsentRows] = useState<AlertRow[]>([]);
  const [lateRows, setLateRows] = useState<AlertRow[]>([]);
  const [birthdaysToday, setBirthdaysToday] = useState<BirthdayRow[]>([]);
  const [announcementsToday, setAnnouncementsToday] = useState<AnnouncementRow[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      const todayLocal = todayLocalIso();
      const now = new Date();

      try {
        const [contractors, leaveRequests, announcements] = await Promise.all([
          fetchAllContractors({ country: "All Countries", status: "Active", rules: [] }),
          fetchAllLeaveRequestsAdmin().catch(() => []),
          fetchAnnouncements().catch(() => []),
        ]);
        if (!active) return;

        setPendingApprovals(
          leaveRequests
            .filter((r) => r.status === "Pending")
            .map((r) => {
              const c = contractors.find((c) => c.email.trim().toLowerCase() === r.email.trim().toLowerCase());
              return { name: c?.fullName || r.email, type: r.type, startDate: r.startDate, endDate: r.endDate };
            })
        );

        setBirthdaysToday(
          contractors
            .filter((c) => {
              const md = monthDayOf(c.dob);
              return md != null && md.month === now.getMonth() && md.day === now.getDate();
            })
            .map((c) => ({ name: c.fullName || [c.firstName, c.surname].filter(Boolean).join(" ") || "Unnamed" }))
        );

        setAnnouncementsToday(
          announcements
            .filter((a) => a.date === todayLocal)
            .map((a) => ({ title: a.title, location: a.location }))
        );

        // Absent/Late Today — gated the same way the Dashboard gates its own
        // Absent/Late widgets: no point flagging anyone before contractors
        // have had a real chance to clock in for the day.
        const cutoff = new Date();
        cutoff.setHours(7, 30, 0, 0);
        if (now < cutoff) { setAbsentRows([]); setLateRows([]); return; }

        const [entriesRes, dailyLogRes] = await Promise.all([
          fetch(`/api/worksnap-entries?from=${todayLocal}&to=${todayLocal}`).then((r) => r.json()),
          fetch(`/api/attendance/daily-log?date=${todayLocal}`).then((r) => (r.ok ? r.json() : { logs: [] })),
        ]);
        if (!active) return;

        const minutesByEmail = new Map<string, number>();
        for (const e of (entriesRes.entries ?? [])) {
          const email = String(e.email ?? "").trim().toLowerCase();
          if (email) minutesByEmail.set(email, (minutesByEmail.get(email) ?? 0) + ((e as { durationMins?: number }).durationMins ?? 0));
        }
        const firstInByEmail = new Map<string, Date>();
        for (const log of (dailyLogRes.logs ?? [])) {
          const email = String(log.email ?? "").trim().toLowerCase();
          if (email && log.firstIn) firstInByEmail.set(email, new Date(log.firstIn));
        }

        const activeContractors = contractors.filter((c) => c.status === "Active" && c.email);

        // Absent = no actual Worksnap time logged today at all — same
        // definition as the Dashboard's Absent Today count.
        setAbsentRows(
          activeContractors
            .filter((c) => (minutesByEmail.get(c.email.trim().toLowerCase()) ?? 0) === 0)
            .map((c) => ({ name: c.fullName, department: c.department }))
        );

        // Late Today only applies to Fixed shift contractors — same check as
        // the Dashboard's Late Today widget (firstIn vs Shift Start + 15min grace).
        const late: AlertRow[] = [];
        for (const c of activeContractors) {
          const isFixed = (c.shiftType || "").trim().toLowerCase() === "fixed";
          if (!isFixed) continue;
          const email = c.email.trim().toLowerCase();
          const firstIn = firstInByEmail.get(email);
          const shiftStart = parseShiftStart(c.shiftHours || "");
          if (!firstIn || !shiftStart) continue;
          const thresholdInstant = utcInstantForLocalTime(todayLocal, shiftStart.hour, shiftStart.minute + LATE_GRACE_MINUTES, ARIZONA_TIME_ZONE);
          if (firstIn.getTime() > thresholdInstant.getTime()) {
            late.push({ name: c.fullName, department: c.department });
          }
        }
        setLateRows(late);
      } catch {
        // silently fail — bell just shows whatever loaded successfully
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const totalCount = pendingApprovals.length + absentRows.length + lateRows.length + birthdaysToday.length + announcementsToday.length;

  const sections = [
    {
      key: "pending", label: "Pending Approvals", icon: LuFileClock, count: pendingApprovals.length,
      color: "text-amber-600 bg-amber-50", href: "/admin/time-off",
      items: pendingApprovals.map((r) => `${r.name} — ${r.type} (${fmtLeaveDates(r.startDate, r.endDate)})`),
    },
    {
      key: "absent", label: "Absent Today", icon: LuUserX, count: absentRows.length,
      color: "text-red-600 bg-red-50", href: "/admin",
      items: absentRows.map((r) => `${r.name} — ${r.department}`),
    },
    {
      key: "late", label: "Late Today", icon: LuClock, count: lateRows.length,
      color: "text-orange-600 bg-orange-50", href: "/admin",
      items: lateRows.map((r) => `${r.name} — ${r.department}`),
    },
    {
      key: "birthday", label: "Birthdays Today", icon: LuCake, count: birthdaysToday.length,
      color: "text-pink-600 bg-pink-50", href: "/admin",
      items: birthdaysToday.map((r) => r.name),
    },
    {
      key: "announcement", label: "Announcements Today", icon: LuMegaphone, count: announcementsToday.length,
      color: "text-teal-600 bg-teal-50", href: "/admin",
      items: announcementsToday.map((r) => `${r.title} (${r.location})`),
    },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className={`relative p-2 rounded-full transition-colors ${dark ? "text-white/60 hover:bg-white/10" : "text-slate-600 hover:bg-slate-50"}`}
      >
        <LuBell size={20} strokeWidth={1.75} />
        {totalCount > 0 && (
          <span className={`absolute top-1.5 right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold leading-4 text-center border-2 ${dark ? "border-[#0f1a15]" : "border-white"}`}>
            {totalCount > 99 ? "99+" : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-80 max-h-[28rem] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
            <p className="text-sm font-bold text-[#003527]">Notifications</p>
            <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded">
              <LuX size={14} />
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <LuLoader size={20} className="text-slate-300 animate-spin" />
              </div>
            ) : totalCount === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-10">Nothing needs your attention right now.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {sections.filter((s) => s.count > 0).map((s) => (
                  <Link
                    key={s.key}
                    href={s.href}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <span className={`w-6 h-6 rounded-lg grid place-items-center shrink-0 ${s.color}`}>
                        <s.icon size={13} strokeWidth={2} />
                      </span>
                      <p className="text-xs font-bold text-slate-700 flex-1">{s.label}</p>
                      <span className="text-xs font-bold text-slate-400">{s.count}</span>
                    </div>
                    <div className="pl-9 space-y-0.5">
                      {s.items.slice(0, 3).map((item, i) => (
                        <p key={i} className="text-[11px] text-slate-500 truncate">{item}</p>
                      ))}
                      {s.items.length > 3 && (
                        <p className="text-[11px] text-slate-400 font-medium">+{s.items.length - 3} more</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
