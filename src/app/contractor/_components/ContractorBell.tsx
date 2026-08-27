"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentMonthBirthdays } from "../profile/actions";
import { fetchWishState } from "../dashboard/wishes";
import { fetchLeaveDecisions, type LeaveDecision } from "../time-off/actions";
import { leaveTypeDisplayLabel } from "@/lib/timeOffBalances";
import { LuBell, LuCake, LuCircleCheck, LuCircleX, LuX } from "react-icons/lu";

type BdayItem = { name: string; email: string; isMe: boolean };

function todayIsoLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtRange(startDate: string, endDate: string): string {
  return startDate === endDate ? fmtDate(startDate) : `${fmtDate(startDate)} – ${fmtDate(endDate)}`;
}

// "3h ago" / "2d ago" — a decision's age matters more than its exact instant.
function fmtAge(isoInstant: string): string {
  const then = new Date(isoInstant).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Per-browser high-water mark: the newest decision the contractor has already
// seen. Only decisions *newer* than this are listed, so an approval shows once
// and then stops appearing — the bell is for news, not a history of every
// decision (that lives on the Time Off page).
//
// On first use there is no marker, so it is set to "now" and nothing already
// decided is shown; otherwise every past decision would arrive at once looking
// brand new.
const SEEN_KEY = "contractor-bell-seen-decision";

function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeSeen(value: string) {
  try {
    localStorage.setItem(SEEN_KEY, value);
  } catch {
    // private mode / blocked storage — decisions then show once per session
    // rather than persisting as read
  }
}

// Contractor topbar bell — surfaces decisions on the contractor's own leave
// requests (PTO, Medical Unavailability, Advance Sick Leave, Special Leave and
// the rest), plus today's birthdays so wishes get seen without scrolling the
// dashboard.
export function ContractorBell({ dark = false }: { dark?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [birthdays, setBirthdays] = useState<BdayItem[]>([]);
  const [myWishes, setMyWishes] = useState(0);
  const [decisions, setDecisions] = useState<LeaveDecision[]>([]);
  // Frozen for the lifetime of this mount: opening the panel must not make the
  // rows the contractor is currently reading disappear underneath them. The
  // stored marker moves immediately, so they're gone on the next load.
  const baselineRef = useRef<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    // First ever use: start the clock now so nothing already decided surfaces.
    const stored = readSeen();
    if (stored) {
      baselineRef.current = stored;
    } else {
      const now = new Date().toISOString();
      writeSeen(now);
      baselineRef.current = now;
    }

    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email?.trim().toLowerCase() ?? "";
      if (!email) return;

      const iso = todayIsoLocal();
      const md = iso.slice(5, 10);

      const [all, leaveDecisions] = await Promise.all([
        fetchCurrentMonthBirthdays().catch(() => []),
        fetchLeaveDecisions(email).catch(() => [] as LeaveDecision[]),
      ]);

      setDecisions(leaveDecisions);

      const todays = all
        .filter((b) => b.dob.slice(5, 10) === md)
        .map((b) => ({ name: b.fullName, email: b.email.trim().toLowerCase(), isMe: b.email.trim().toLowerCase() === email }));
      setBirthdays(todays);

      if (todays.some((b) => b.isMe)) {
        const { received } = await fetchWishState(email, iso).catch(() => ({ received: [] as { fromName: string }[], sentTo: [] }));
        setMyWishes(received.length);
      }
    })();
  }, []);

  // Only decisions newer than the baseline are news; anything older has been
  // seen already and belongs to the Time Off page's history, not the bell.
  const newDecisions = decisions.filter((d) => d.decidedAt > (baselineRef.current ?? ""));
  const count = (acknowledged ? 0 : newDecisions.length) + birthdays.length;
  const iconColor = dark ? "text-white/80" : "text-slate-600";

  function togglePanel() {
    const opening = !open;
    setOpen(opening);
    // Opening acknowledges what's listed: the stored marker jumps to the newest
    // decision so it won't come back, while baselineRef stays put so the rows
    // remain readable until this page is left.
    if (opening && newDecisions.length > 0) {
      writeSeen(newDecisions[0].decidedAt);
      setAcknowledged(true);
    }
  }

  const isEmpty = newDecisions.length === 0 && birthdays.length === 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={togglePanel}
        aria-label="Notifications"
        className={`relative p-2 rounded-full transition-colors hover:bg-black/5 ${iconColor} cursor-pointer`}
      >
        <LuBell size={20} strokeWidth={1.75} />
        {count > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-teal-500 ring-2 ring-white" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-[#003527]">Notifications</p>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
              <LuX size={15} strokeWidth={2} />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isEmpty ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">Nothing new right now.</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {/* Leave decisions first — they're actionable, birthdays aren't. */}
                {newDecisions.map((d) => {
                  const approved = d.status === "Approved";
                  return (
                    <button
                      key={d.id}
                      onClick={() => { setOpen(false); router.push("/contractor/time-off"); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <span className={`grid place-items-center w-9 h-9 rounded-full shrink-0 ${approved ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                        {approved ? <LuCircleCheck size={16} strokeWidth={2} /> : <LuCircleX size={16} strokeWidth={2} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[#003527] truncate">
                          {leaveTypeDisplayLabel(d.type)} {approved ? "approved" : "rejected"}
                        </span>
                        <span className="block text-xs text-slate-400">
                          {fmtRange(d.startDate, d.endDate)} · {fmtAge(d.decidedAt)}
                        </span>
                      </span>
                      {!acknowledged && <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />}
                    </button>
                  );
                })}

                {birthdays.map((b) => (
                  <button
                    key={b.email || b.name}
                    onClick={() => { setOpen(false); router.push("/contractor/dashboard"); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-emerald-50/60 transition-colors cursor-pointer"
                  >
                    <span className="grid place-items-center w-9 h-9 rounded-full bg-teal-100 text-teal-700 shrink-0">
                      <LuCake size={16} strokeWidth={2} />
                    </span>
                    <span className="min-w-0">
                      {b.isMe ? (
                        <>
                          <span className="block text-sm font-semibold text-[#003527]">It&apos;s your birthday! 🎉</span>
                          <span className="block text-xs text-slate-400">{myWishes > 0 ? `${myWishes} colleague${myWishes !== 1 ? "s" : ""} wished you` : "See who's celebrating with you"}</span>
                        </>
                      ) : (
                        <>
                          <span className="block text-sm font-semibold text-[#003527] truncate">{b.name}&apos;s birthday today</span>
                          <span className="block text-xs text-teal-700 font-medium">Tap to send wishes →</span>
                        </>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
