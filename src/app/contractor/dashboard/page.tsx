"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchContractorProfileByEmail, fetchCurrentMonthBirthdays, type ContractorProfile, type BirthdayEntry } from "../profile/actions";
import { fetchHolidays, type Holiday } from "@/app/admin/holidays/actions";
import { fetchAnnouncements, type Announcement } from "@/app/admin/announcements/actions";
import { PageHeader } from "../_components/portal";
import {
  LuCalendarDays, LuCake,
  LuChevronRight, LuLoader, LuShieldCheck,
  LuArrowRight,
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

  const todayFull = new Date(todayStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

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
export default function ContractorDashboardPage() {
  const router = useRouter();

  const [profile,       setProfile]       = useState<ContractorProfile | null>(null);
  const [allHolidays,   setAllHolidays]   = useState<Holiday[]>([]);
  const [upcomingHols,  setUpcomingHols]  = useState<Holiday[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [birthdays,     setBirthdays]     = useState<BirthdayEntry[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [calOpen,       setCalOpen]       = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) { router.replace("/login"); return; }
      const email = session.user.email;

      const [prof, hols, allAnnouncements, bdays] = await Promise.all([
        fetchContractorProfileByEmail(email),
        fetchHolidays(),
        fetchAnnouncements(),
        fetchCurrentMonthBirthdays(),
      ]);

      setProfile(prof);
      setAllHolidays(hols);
      setBirthdays(bdays);

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

      // Announcements: contractor's country + "All" + "Global"
      const filtered = allAnnouncements
        .filter(a => a.location === "All" || a.location === "Global" || a.location === country)
        .slice(0, 3);
      setAnnouncements(filtered);

      setLoading(false);
    })();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LuLoader size={28} className="text-slate-300 animate-spin" />
      </div>
    );
  }

  const firstName = profile?.firstName || profile?.fullName?.split(" ")[0] || "there";
  const country   = profile?.location?.split(",").pop()?.trim() ?? "";

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  const statusChip = profile?.status === "Active" ? (
    <span className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 rounded-full text-sm font-semibold shadow-sm">
      <LuShieldCheck size={16} strokeWidth={2} />
      Active Contractor
    </span>
  ) : undefined;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">

      {calOpen && (
        <HolidayCalendarModal
          holidays={allHolidays}
          country={country}
          onClose={() => setCalOpen(false)}
        />
      )}

      {/* ── Welcome ── */}
      <PageHeader
        title={`${greeting}, ${firstName}.`}
        subtitle="Ready to power the future today?"
        right={statusChip}
      />

      {/* ── Announcements + holidays ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Announcements — left 2/3 */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-[#003527]">Offshore Announcements</h3>
            <button className="text-emerald-700 text-sm font-semibold flex items-center gap-1 hover:underline">
              View All <LuChevronRight size={16} strokeWidth={2} />
            </button>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
            {announcements.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">No announcements yet.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {announcements.map((a, i) => (
                  <div key={a.id} className="flex gap-4 p-5 hover:bg-slate-50 transition-colors">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${ANNOUNCEMENT_BG[i % ANNOUNCEMENT_BG.length]}`}>
                      {ANNOUNCEMENT_ICONS[i % ANNOUNCEMENT_ICONS.length]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="text-sm font-bold text-[#003527]">{a.title}</h4>
                        <span className="text-xs text-slate-400 shrink-0">{fmtAnnouncementDate(a.date)}</span>
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{a.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-6">
          {/* This Month's Holidays */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">
              {MONTHS[new Date().getMonth()]} Holidays
            </h4>
            {upcomingHols.length === 0 ? (
              <p className="text-sm text-slate-400">No holidays this month.</p>
            ) : (
              <div className="space-y-2">
                {upcomingHols.map((h) => {
                  const code     = COUNTRY_CODE[h.country] ?? h.country.slice(0, 2).toUpperCase();
                  const colorCls = COUNTRY_BG[h.country]  ?? "bg-slate-100 text-slate-600";
                  const date     = new Date(h.date + "T00:00:00").toLocaleDateString("en-US", {
                    month: "short", day: "numeric",
                  });
                  return (
                    <div key={h.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${colorCls}`}>
                        {code}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#003527] leading-tight truncate">{h.name}</p>
                        <p className="text-xs text-slate-400 tabular-nums">{date}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              onClick={() => setCalOpen(true)}
              className="mt-3 flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
            >
              View full calendar <LuArrowRight size={13} strokeWidth={2} />
            </button>
          </div>

        </div>
      </div>

      {/* ── Birthday Calendar ── */}
      <BirthdaySection birthdays={birthdays} />

    </div>
  );
}

// ── Birthday section component ────────────────────────────────────────────────
function BirthdaySection({ birthdays }: { birthdays: BirthdayEntry[] }) {

  const today     = new Date();
  const year      = today.getFullYear();
  const month     = today.getMonth();
  const todayDay  = today.getDate();
  const cells     = buildCalendar(year, month);

  const entriesByDay = new Map<number, BirthdayEntry[]>();
  for (const c of birthdays) {
    const [, mm, dd] = c.dob.split("-").map(Number);
    if (!mm || !dd || mm - 1 !== month) continue;
    const list = entriesByDay.get(dd) ?? [];
    list.push(c);
    entriesByDay.set(dd, list);
  }

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 md:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xl font-bold text-[#003527]">Birthdays</h3>
        <div className="flex items-center gap-2">
          <LuCake size={18} strokeWidth={1.75} className="text-pink-400" />
          <span className="text-xs font-semibold text-slate-400">{MONTHS[month]} {year}</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAYS.map((d) => (
          <span key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase">{d[0]}</span>
        ))}
        {cells.map((day, i) => {
          if (day == null) return <div key={i} className="min-h-11 rounded-md border border-transparent" />;
          const dayEntries = entriesByDay.get(day);
          const isToday    = day === todayDay;
          return (
            <div
              key={i}
              title={dayEntries?.map((c) => c.fullName).join(", ")}
              className={[
                "min-h-11 rounded-md border p-1 flex flex-col",
                isToday    ? "border-[#003527] bg-[#003527]/5"
                : dayEntries ? "border-pink-200 bg-pink-50"
                : "border-slate-100",
              ].join(" ")}
            >
              <span className={`text-[10px] font-semibold ${isToday ? "text-[#003527]" : "text-slate-400"}`}>{day}</span>
              {dayEntries?.map((c) => (
                <p key={c.fullName} className="text-[9px] leading-tight text-pink-700 font-medium truncate">{c.fullName}</p>
              ))}
            </div>
          );
        })}
      </div>

      {birthdays.length === 0 && (
        <p className="text-sm text-slate-400 mt-4 text-center">No birthdays this month.</p>
      )}

    </div>
  );
}
