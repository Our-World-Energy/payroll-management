"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type ContractorProfile, type BirthdayEntry } from "../profile/actions";
import { type Holiday } from "@/app/admin/holidays/actions";
import { type Announcement } from "@/app/admin/announcements/actions";
import { fetchDashboardBundle } from "./actions";
import { ARIZONA_TIME_ZONE } from "@/lib/countryTimeZones";
import { Confetti } from "../_components/Confetti";
import {
  LuCalendarDays, LuCake, LuGlobe,
  LuChevronRight, LuShieldCheck,
  LuX, LuChevronLeft,
} from "react-icons/lu";

// ── Calendar helpers ──────────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const COUNTRY_COLORS: Record<string, string> = {
  "United States": "bg-blue-500",
  "India":         "bg-orange-500",
  "Mexico":        "bg-emerald-500",
  "Philippines":   "bg-teal-500",
  "Global":        "bg-purple-500",
};
const COUNTRY_BG: Record<string, string> = {
  "United States": "bg-blue-100 text-blue-700",
  "India":         "bg-orange-100 text-orange-700",
  "Mexico":        "bg-emerald-100 text-emerald-700",
  "Philippines":   "bg-teal-100 text-teal-700",
  "Global":        "bg-purple-100 text-purple-700",
};
const COUNTRY_CODE: Record<string, string> = {
  "United States": "US",
  "India":         "IN",
  "Mexico":        "MX",
  "Philippines":   "PH",
  "Global":        "GL",
};

function pad(n: number) { return String(n).padStart(2, "0"); }

function buildCalendar(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}


const ANNOUNCEMENT_ICONS = ["📢", "📅", "🛡️", "👥", "⚡", "🔔", "📋", "🌐"];
const ANNOUNCEMENT_BG    = ["bg-teal-50", "bg-emerald-50", "bg-red-50", "bg-blue-50", "bg-amber-50", "bg-purple-50"];

function fmtAnnouncementDate(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7)  return `${diffDays} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Calendar popup component ──────────────────────────────────────────────────
function HolidayCalendarModal({
  holidays,
  country,
  onClose,
}: {
  holidays: Holiday[];
  country: string;
  onClose: () => void;
}) {
  const now = new Date();
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

  // Show contractor's country + Global
  const visible = holidays.filter(h => h.country === country || h.country === "Global");

  const cells = buildCalendar(calYear, calMonth);

  const dotsByDay: Record<number, Holiday[]> = {};
  visible.forEach(h => {
    const [y, m] = h.date.split("-").map(Number);
    if (y === calYear && m - 1 === calMonth) {
      const day = parseInt(h.date.split("-")[2]);
      if (!dotsByDay[day]) dotsByDay[day] = [];
      dotsByDay[day].push(h);
    }
  });

  const upcomingAll = visible
    .filter(h => h.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-[#003527] px-5 py-3.5 flex items-center justify-between shrink-0 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <LuCalendarDays size={15} className="text-white/70" strokeWidth={2} />
            <h2 className="text-sm font-bold text-white">Holiday Calendar</h2>
            <span className="text-xs text-white/40 ml-1">· {country} &amp; Global</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <LuX size={14} strokeWidth={2.5} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px]">

            {/* Left — calendar */}
            <div className="p-4 border-r border-slate-100">
              {/* Month nav */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-baseline gap-1.5">
                  <h3 className="text-base font-bold text-[#003527]">{MONTHS[calMonth]}</h3>
                  <span className="text-sm text-slate-400">{calYear}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={prevMonth} className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-400 transition-colors">
                    <LuChevronLeft size={13} strokeWidth={2.5} />
                  </button>
                  <select value={calMonth} onChange={e => setCalMonth(Number(e.target.value))}
                    className="text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none cursor-pointer text-slate-600">
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                  <select value={calYear} onChange={e => setCalYear(Number(e.target.value))}
                    className="text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none cursor-pointer text-slate-600">
                    {Array.from({ length: 8 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <button onClick={nextMonth} className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-400 transition-colors">
                    <LuChevronRight size={13} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-slate-300 uppercase tracking-wider py-0.5">{d}</div>
                ))}
              </div>

              {/* Grid */}
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (!day) return <div key={i} className="aspect-square" />;
                  const dateStr = `${calYear}-${pad(calMonth+1)}-${pad(day)}`;
                  const isToday = dateStr === todayStr;
                  const dots    = dotsByDay[day] ?? [];
                  const hasHol  = dots.length > 0;

                  let cellCls = "bg-slate-50/50 border-transparent text-slate-500 hover:bg-slate-100";
                  if (isToday)     cellCls = "bg-[#003527] border-[#003527] text-white shadow-md shadow-emerald-900/20";
                  else if (hasHol) cellCls = "bg-teal-50 border-teal-200 text-teal-900";

                  return (
                    <div key={i} title={dots.map(h => h.name).join(" · ")}
                      className={`aspect-square rounded-xl p-1 flex flex-col border transition-all cursor-default ${cellCls}`}>
                      <span className={`text-[11px] tabular-nums leading-none ${isToday ? "font-black" : "font-medium"}`}>{day}</span>
                      {hasHol && (
                        <>
                          <div className="flex gap-0.5 mt-0.5">
                            {dots.slice(0, 2).map((h, di) => (
                              <span key={di} className={`w-1 h-1 rounded-full ${COUNTRY_COLORS[h.country] ?? "bg-slate-400"}`} />
                            ))}
                          </div>
                          <span className={`mt-auto text-[7px] leading-tight w-full truncate font-semibold ${isToday ? "text-white/60" : "text-teal-600"}`}>
                            {dots[0].name}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                {[country, "Global"].filter(Boolean).map(c => (
                  <div key={c} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${COUNTRY_COLORS[c] ?? "bg-slate-400"}`} />
                    <span className="text-[11px] text-slate-400">{c}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1 ml-auto">
                  <span className="w-3 h-3 rounded bg-teal-50 border border-teal-200 inline-block" />
                  <span className="text-[11px] text-slate-400">Holiday</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-[#003527] inline-block" />
                  <span className="text-[11px] text-slate-400">Today</span>
                </div>
              </div>
            </div>

            {/* Right — upcoming */}
            <div className="p-4 bg-slate-50/60">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 mb-3">Upcoming</p>
              {upcomingAll.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No upcoming holidays</p>
              ) : (
                <div className="space-y-1.5">
                  {upcomingAll.map((h, idx) => {
                    const d        = new Date(h.date + "T00:00:00");
                    const dayNum   = d.getDate();
                    const mon      = d.toLocaleDateString("en-US", { month: "short" });
                    const colorCls = COUNTRY_BG[h.country] ?? "bg-slate-100 text-slate-500";
                    const isFirst  = idx === 0;
                    return (
                      <div key={h.id}
                        className={`flex items-center gap-2.5 p-2 rounded-xl transition-colors ${isFirst ? "bg-white shadow-sm border border-slate-100" : "hover:bg-white/60"}`}>
                        <div className={`w-8 h-8 rounded-lg flex flex-col items-center justify-center shrink-0 ${colorCls}`}>
                          <span className="text-[9px] font-bold uppercase leading-none">{mon}</span>
                          <span className="text-sm font-black leading-tight">{dayNum}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-[#003527] truncate">{h.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${COUNTRY_COLORS[h.country] ?? "bg-slate-300"}`} />
                            <p className="text-[10px] text-slate-400 truncate">{h.country}</p>
                          </div>
                        </div>
                        {isFirst && (
                          <span className="shrink-0 text-[9px] font-bold bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">Next</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export function DashboardView({ eyebrow }: { eyebrow?: string }) {
  const router = useRouter();

  const [profile,       setProfile]       = useState<ContractorProfile | null>(null);
  const [allHolidays,   setAllHolidays]   = useState<Holiday[]>([]);
  const [upcomingHols,  setUpcomingHols]  = useState<Holiday[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  // "Global" location announcements whose announce-date has arrived — shown
  // as their own animated banner at the top of the page, separately from the
  // plain Announcements list below (which holds the country-scoped ones plus
  // "Offshore"/"All", and is never gated by date).
  const [globalBanners, setGlobalBanners] = useState<Announcement[]>([]);
  // The front page shows the newest three; this keeps the rest for "View All
  // News", which would otherwise promise more than the page holds.
  const [allNews, setAllNews] = useState<Announcement[]>([]);
  const [newsOpen, setNewsOpen] = useState(false);
  const [birthdays,     setBirthdays]     = useState<BirthdayEntry[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [calOpen,       setCalOpen]       = useState(false);
  // Birthday wishes: my email, colleagues I've already wished today, and wishes
  // I've received today (shown when it's my own birthday).
  const [myEmail,       setMyEmail]       = useState("");

  // Local calendar date (YYYY-MM-DD) — the wishDate key for today's birthdays.
  const todayIso = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) { router.replace("/login"); return; }
      const email = session.user.email;

      // One Server Action, not four — see fetchDashboardBundle.
      const { profile: prof, holidays: hols, announcements: allAnnouncements, birthdays: bdays } =
        await fetchDashboardBundle(email);

      setProfile(prof);
      setAllHolidays(hols);
      setBirthdays(bdays);
      setMyEmail(email);

      // Country comes from the location field: "City, Country" → last segment
      const country = prof?.location?.split(",").pop()?.trim() ?? "";
      const today   = new Date().toISOString().slice(0, 10);

      // Current month: contractor's country + US + Global
      const nowDate  = new Date();
      const monthPfx = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`;
      const upcoming = hols
        .filter(h =>
          h.date.startsWith(monthPfx) &&
          (h.country === country || h.country === "United States" || h.country === "Global")
        )
        .sort((a, b) => a.date.localeCompare(b.date));
      setUpcomingHols(upcoming);

      // Announcements: the contractor's own country, plus "Offshore", which is
      // addressed to every country rather than to a place — so it reaches
      // everyone, whatever their location. "All" is the legacy spelling of the
      // same idea and is still honoured for older rows.
      //
      // None of these are date-gated. "Global" is handled separately below:
      // it's the only kind with a scheduled announce-date, so it's pulled out
      // into its own animated banner instead of this list.
      const addressedToMe = allAnnouncements.filter(a =>
        a.location === "All" || a.location === "Offshore" || a.location === country
        // A due "Global" announcement is addressed to everyone, so it belongs
        // in the full list even though the front page shows it as the banner.
        || (a.location === "Global" && a.date <= today)
      );
      setAllNews([...addressedToMe].sort((a, b) => b.date.localeCompare(a.date)));
      // Latest Announcements excludes "Global" — those already have the front
      // page's banner, and repeating them in the list below it is noise. The
      // All Announcements window still lists them.
      setAnnouncements(addressedToMe.filter(a => a.location !== "Global").slice(0, 3));

      // Banner announcements (location "Global", set on the admin Dashboard's
      // Announcements board): shown only once the scheduled date has arrived,
      // and only the newest one — a new banner replaces the previous rather than
      // stacking, so contractors always see the current message instead of a
      // pile of old ones. Sorted explicitly rather than trusting the fetch order.
      const dueGlobal = allAnnouncements
        .filter(a => a.location === "Global" && a.date <= today)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 1);
      setGlobalBanners(dueGlobal);

      setLoading(false);
    })();
  }, [router, todayIso]);

  // Live-refresh wishes ONLY on the viewer's own birthday — that's the only day
  // they can receive wishes, so there's nothing to poll for otherwise.
  const isMyBirthdayToday = !!myEmail && birthdays.some(
    (b) => b.email.trim().toLowerCase() === myEmail.trim().toLowerCase() && b.dob.slice(5, 10) === todayIso.slice(5, 10)
  );
  // On your birthday, stamp the browser tab with a 🎂 title + favicon; restore on leave.
  useEffect(() => {
    if (!isMyBirthdayToday) return;
    const name = profile?.firstName || profile?.fullName?.split(" ")[0] || "you";
    const prevTitle = document.title;
    document.title = `🎂 Happy Birthday, ${name}!`;
    const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    const prevHref = link?.getAttribute("href") ?? null;
    const cake = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎂</text></svg>");
    link?.setAttribute("href", cake);
    return () => {
      document.title = prevTitle;
      if (link && prevHref) link.setAttribute("href", prevHref);
    };
  }, [isMyBirthdayToday, profile]);

  const firstName = profile?.firstName || profile?.fullName?.split(" ")[0] || "there";
  const country   = profile?.location?.split(",").pop()?.trim() ?? "";

  const now = new Date();
  // Arizona (HO) time, not the viewer's own browser/local time — the whole
  // Contractor Portal shows times on Arizona time for consistency.
  const azHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: ARIZONA_TIME_ZONE, hour: "numeric", hour12: false }).format(now));
  const greeting = azHour < 12 ? "Good morning" : azHour < 17 ? "Good afternoon" : "Good evening";

  const mastheadDate = new Intl.DateTimeFormat("en-US", {
    timeZone: ARIZONA_TIME_ZONE, weekday: "short", month: "short", day: "2-digit", year: "numeric",
  }).format(now).toUpperCase();

  const statusChip = profile?.status === "Active" ? (
    <span className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 rounded-full text-sm font-semibold shadow-sm">
      <LuShieldCheck size={16} strokeWidth={2} />
      Active Contractor
    </span>
  ) : undefined;

  return (
    <div className="space-y-0 max-w-[110rem] mx-auto">

      {calOpen && (
        <HolidayCalendarModal
          holidays={allHolidays}
          country={country}
          onClose={() => setCalOpen(false)}
        />
      )}

      {/* All news, for when the front page's three aren't the whole story. */}
      {newsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setNewsOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b-2 border-[#003527]">
              <div>
                <h3 className="font-serif text-2xl font-bold text-[#003527] leading-none">All Announcements</h3>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mt-1.5">
                  {allNews.length} {allNews.length === 1 ? "story" : "stories"} for you
                </p>
              </div>
              <button
                onClick={() => setNewsOpen(false)}
                aria-label="Close"
                className="shrink-0 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <LuX size={18} strokeWidth={2.5} />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-2">
              {allNews.length === 0 ? (
                <p className="py-12 text-center font-serif italic text-base text-slate-400">
                  No announcements yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-200">
                  {allNews.map((a, i) => (
                    <article key={a.id} className="flex gap-4 py-4">
                      {a.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={a.imageUrl} alt="" className="hidden sm:block size-20 rounded-md object-cover shrink-0 border border-slate-200" />
                      ) : (
                        <div className={`hidden sm:grid place-items-center size-20 rounded-md shrink-0 text-2xl ${ANNOUNCEMENT_BG[i % ANNOUNCEMENT_BG.length]}`}>
                          {ANNOUNCEMENT_ICONS[i % ANNOUNCEMENT_ICONS.length]}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">{a.location}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap shrink-0">
                            {fmtAnnouncementDate(a.date)}
                          </p>
                        </div>
                        <h4 className="font-serif text-lg font-bold text-[#003527] leading-snug mt-0.5">{a.title}</h4>
                        <p className="text-[13px] text-slate-600 leading-relaxed mt-1 wrap-break-word">{a.body}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setNewsOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Masthead: top rule ── */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-y-2 border-[#003527] py-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#003527]">
        <span className="inline-flex items-center gap-2 min-w-0 justify-self-start truncate">
          <LuGlobe size={13} strokeWidth={2} className="text-emerald-700" />
          Our World Energy
          {eyebrow && <span className="text-slate-400 font-bold">&middot; {eyebrow}</span>}
        </span>
        <span className="hidden md:block justify-self-center whitespace-nowrap text-slate-500 tracking-[0.22em]">
          People &middot; Energy &middot; A Brighter Tomorrow
        </span>
        <span className="justify-self-end whitespace-nowrap tabular-nums text-slate-600">{mastheadDate}</span>
      </div>

      {/* ── Masthead: the nameplate ── */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b-2 border-[#003527] py-4 px-1">
        <p className="hidden md:block font-serif italic text-xs leading-snug text-slate-500 justify-self-start w-36">
          &ldquo;Together<br />We Power<br />Possibilities&rdquo;
        </p>
        <div className="text-center">
          <h1 className="font-serif font-bold text-[#003527] leading-none tracking-tight text-[clamp(2.25rem,6vw,4.25rem)]">
            OWE DAILY
          </h1>
          <p className="mt-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">
            News &middot; Announcements &middot; People &middot; Updates
          </p>
        </div>
        <p className="hidden md:block font-serif italic text-xs leading-snug text-slate-500 text-right justify-self-end w-36">
          {greeting},<br />{firstName}.
        </p>
      </div>

      {loading ? (
        /* Placeholder in the shape of the page, rather than a bare spinner in
           an empty viewport. */
        <div className="mt-4 animate-pulse space-y-4">
          <div className="h-28 rounded-lg bg-slate-100" />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6 border-t-2 border-slate-200 pt-4">
            <div className="space-y-3">
              <div className="h-6 w-56 rounded bg-slate-100" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-4">
                  <div className="hidden sm:block size-24 rounded-md bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 w-24 rounded bg-slate-100" />
                    <div className="h-4 w-2/3 rounded bg-slate-100" />
                    <div className="h-3 w-full rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="h-5 w-40 rounded bg-slate-100" />
              <div className="h-20 rounded-md bg-slate-100" />
              <div className="h-10 rounded-md bg-slate-100" />
            </div>
          </div>
        </div>
      ) : (
      <>

      {/* ── Your birthday: a special edition bar ── */}
      {isMyBirthdayToday && (
        <>
          <Confetti />
          <div className="mt-4 rounded-lg border-2 border-[#003527] bg-linear-to-r from-emerald-600 via-teal-600 to-emerald-800 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/75">Special Edition</p>
              <h2 className="font-serif text-2xl md:text-3xl font-bold mt-0.5">Happy Birthday, {firstName}! &#127881;</h2>
            </div>
            {statusChip}
          </div>
        </>
      )}

      {/* ── Front-page feature: today's global announcement(s) ── */}
      {globalBanners.map((a, i) => (
        <div
          key={a.id}
          className="mt-4 overflow-hidden rounded-lg border-2 border-[#003527] bg-[#003527] text-white animate-announcement-slide-in"
        >
          <div className="grid grid-cols-1 md:grid-cols-[7rem_1fr_auto]">
            {a.imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={a.imageUrl} alt="" className="hidden md:block h-full w-full object-cover" />
            ) : (
              <div className={`hidden md:grid place-items-center text-3xl ${ANNOUNCEMENT_BG[i % ANNOUNCEMENT_BG.length]}`}>
                {ANNOUNCEMENT_ICONS[i % ANNOUNCEMENT_ICONS.length]}
              </div>
            )}
            <div className="px-5 py-4 min-w-0">
              <h2 className="font-serif text-2xl md:text-3xl font-bold leading-tight">{a.title}</h2>
              <p className="text-sm text-white/85 mt-2 leading-relaxed wrap-break-word">{a.body}</p>
            </div>
            <div className="hidden lg:flex flex-col justify-center gap-1 border-l border-white/15 px-6 text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-100/80">
              <span>Joyful</span><span>People</span><span>Brighter</span><span>Tomorrows</span>
            </div>
          </div>
        </div>
      ))}

      {/* ── Two columns: announcements | holidays ── */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-0 lg:gap-6 border-t-2 border-[#003527] pt-3">

        {/* Left column — the news */}
        <div className="lg:pr-6 lg:border-r border-slate-200 min-w-0">
          <div className="flex items-end justify-between gap-4 border-b border-slate-300 pb-1.5 mb-3">
            <h3 className="font-serif text-2xl font-bold text-[#003527] leading-none">Latest Announcements</h3>
            <button
              onClick={() => setNewsOpen(true)}
              className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 whitespace-nowrap hover:underline"
            >
              View All News {allNews.length > 0 && `(${allNews.length}) `}&rarr;
            </button>
          </div>

          {announcements.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No announcements yet.</p>
          ) : (
            <div className="divide-y divide-slate-200 max-h-[30rem] overflow-y-auto pr-1">
              {announcements.map((a, i) => (
                <article key={a.id} className="flex gap-4 py-3">
                  {a.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={a.imageUrl} alt="" className="hidden sm:block size-24 rounded-md object-cover shrink-0 border border-slate-200" />
                  ) : (
                    <div className={`hidden sm:grid place-items-center size-24 rounded-md shrink-0 text-3xl ${ANNOUNCEMENT_BG[i % ANNOUNCEMENT_BG.length]}`}>
                      {ANNOUNCEMENT_ICONS[i % ANNOUNCEMENT_ICONS.length]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">{a.location}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap shrink-0">
                        {fmtAnnouncementDate(a.date)}
                      </p>
                    </div>
                    <h4 className="font-serif text-lg font-bold text-[#003527] leading-snug mt-0.5">{a.title}</h4>
                    <p className="text-[13px] text-slate-600 leading-relaxed mt-1 wrap-break-word">{a.body}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {/* Right column — the almanac */}
        <aside className="mt-6 lg:mt-0 min-w-0">
          <div className="flex items-end justify-between gap-3 border-b border-slate-300 pb-1.5 mb-3">
            <h3 className="font-serif text-xl font-bold text-[#003527] leading-none">{MONTHS[new Date().getMonth()]} Holidays</h3>
            <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 whitespace-nowrap">
              <LuCalendarDays size={12} strokeWidth={2} /> Mark your calendar
            </span>
          </div>

          {upcomingHols.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No holidays this month.</p>
          ) : (
            <div className="space-y-2 max-h-[20rem] overflow-y-auto pr-1">
              {upcomingHols.map((h) => {
                const iso = h.date.slice(0, 10);
                const [, mm, dd] = iso.split("-").map(Number);
                const dow = new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
                const code = COUNTRY_CODE[h.country] ?? h.country.slice(0, 2).toUpperCase();
                const colorCls = COUNTRY_BG[h.country] ?? "bg-slate-100 text-slate-500";
                return (
                  <div key={h.id} className="flex gap-3 rounded-md border border-slate-200 bg-white p-2.5">
                    <div className="grid place-items-center shrink-0 w-14 rounded-md bg-slate-50 border border-slate-200 py-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{MONTHS[(mm ?? 1) - 1].slice(0, 3)}</span>
                      <span className="font-serif text-2xl font-bold text-[#003527] leading-none">{dd}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{dow}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-serif text-base font-bold text-[#003527] leading-tight truncate">{h.name}</p>
                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${colorCls}`}>{code}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={() => setCalOpen(true)}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#003527] hover:bg-[#064E3B] text-white px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] transition-colors"
          >
            <LuCalendarDays size={13} strokeWidth={2} /> View Full Holiday Calendar &rarr;
          </button>

          <figure className="mt-4 border-y border-slate-200 py-4 text-center">
            <blockquote className="font-serif italic text-lg text-[#003527] leading-snug">
              Take time to rest and recharge.
            </blockquote>
          </figure>

          <div className="mt-4 rounded-md bg-[#003527] text-white px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]">Our World Energy</span>
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-200/80 text-right leading-relaxed">
              People<br />Progress<br />Possibilities
            </span>
          </div>
        </aside>
      </div>

      {/* ── Today's birthdays ── */}
      <div className="mt-5 border-t-2 border-[#003527] pt-3">
        <BirthdaySection birthdays={birthdays} myEmail={myEmail} />
      </div>

      </>
      )}
    </div>
  );
}

// Initials from a full name (up to 2 letters).
function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

// ── Birthday section component ────────────────────────────────────────────────
// ── Today's birthdays ─────────────────────────────────────────────────────────
// A plain list: who has a birthday today, and nothing else. No wish-sending,
// no per-person cards.
function BirthdaySection({ birthdays, myEmail }: { birthdays: BirthdayEntry[]; myEmail: string }) {
  const today    = new Date();
  const month    = today.getMonth();
  const todayDay = today.getDate();
  const me       = myEmail.trim().toLowerCase();

  const items = birthdays
    .map((c) => {
      const [, mm, dd] = c.dob.split("-").map(Number);
      return { ...c, mm, dd };
    })
    .filter((c) => c.mm && c.dd && c.mm - 1 === month && c.dd === todayDay)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const todayLabel = today
    .toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })
    .toUpperCase();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-300 pb-1.5 mb-3">
        <h3 className="font-serif text-2xl font-bold text-[#003527] leading-none">Today&apos;s Birthdays</h3>
        <span className="hidden sm:block h-6 w-px bg-slate-300" />
        <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          <LuCake size={14} strokeWidth={1.75} className="text-teal-600" />
          {todayLabel}
        </span>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 whitespace-nowrap">
          Celebrating our amazing people
        </span>
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center font-serif italic text-base text-slate-400">
          No birthdays today.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_16rem] gap-4 items-start">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map((c) => {
              const isMe = !!c.email && c.email.trim().toLowerCase() === me;
              return (
                <div
                  key={`${c.fullName}-${c.dd}`}
                  className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="size-10 rounded-full bg-teal-100 text-teal-700 grid place-items-center text-xs font-bold shrink-0">
                    {initialsOf(c.fullName)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#003527] truncate">
                      {c.fullName}
                      {isMe && <span className="ml-2 text-[9px] font-bold uppercase tracking-wide text-teal-600">You</span>}
                    </p>
                    <p className="font-serif italic text-sm text-amber-700 mt-0.5">
                      &#127874; Happy Birthday!
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <figure className="lg:border-l border-slate-200 lg:pl-5 py-2 text-center">
            <blockquote className="font-serif italic text-lg text-[#003527] leading-snug">
              Great people make a brighter tomorrow.
            </blockquote>
          </figure>
        </div>
      )}
    </div>
  );
}
