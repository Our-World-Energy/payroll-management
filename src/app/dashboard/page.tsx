import {
  LuUsers,
  LuZap,
  LuClipboardList,
  LuWallet,
  LuTrendingUp,
  LuTrendingDown,
  LuBadgeCheck,
  LuRocket,
  LuCircleCheck,
  LuTriangleAlert,
  LuCalendar,
  LuChevronDown,
  LuDownload,
  LuPlus,
  LuExternalLink,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import { Sparkline } from "@/components/Sparkline";
import { AttendanceChart } from "@/components/AttendanceChart";
import { SitesMap } from "@/components/SitesMap";

type Stat = {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "neutral";
  Icon: IconType;
  caption: string;
  spark: number[];
};

const STATS: Stat[] = [
  {
    label: "Total Contractors",
    value: "1,284",
    delta: "+12.4%",
    trend: "up",
    Icon: LuUsers,
    caption: "vs. previous month",
    spark: [8, 9, 11, 10, 13, 14, 16],
  },
  {
    label: "Active Shifts",
    value: "452",
    delta: "Live",
    trend: "neutral",
    Icon: LuZap,
    caption: "across 42 sites",
    spark: [3, 5, 4, 7, 6, 8, 7],
  },
  {
    label: "Pending PTO",
    value: "18",
    delta: "−4",
    trend: "down",
    Icon: LuClipboardList,
    caption: "awaiting approval",
    spark: [22, 24, 21, 19, 20, 19, 18],
  },
  {
    label: "Upcoming Payroll",
    value: "$248,500",
    delta: "ETA 2d",
    trend: "neutral",
    Icon: LuWallet,
    caption: "for Apr 22 — Apr 28",
    spark: [180, 195, 210, 222, 230, 238, 248],
  },
];

type Activity = {
  Icon: IconType;
  title: string;
  detail: string;
  time: string;
};

const ACTIVITIES: Activity[] = [
  {
    Icon: LuBadgeCheck,
    title: "Contractor certified",
    detail: "Sarah Jenkins completed Solar-Tech Level 2.",
    time: "2 min",
  },
  {
    Icon: LuRocket,
    title: "New site deployment",
    detail: "Green Meadows initialized with 14 members.",
    time: "45 min",
  },
  {
    Icon: LuCircleCheck,
    title: "Payroll finalized",
    detail: "Weekly disbursements approved by Finance.",
    time: "2 hr",
  },
  {
    Icon: LuTriangleAlert,
    title: "Certification expiring",
    detail: "Michael Chen's safety certificate expires in 3 days.",
    time: "4 hr",
  },
];

const SITES = [
  { name: "Solar Array A", active: 142, percent: 78 },
  { name: "Wind Farm East", active: 89, percent: 52 },
  { name: "Hydro Beta", active: 54, percent: 31 },
];

function deltaTone(t: Stat["trend"]) {
  if (t === "up") return "text-brand-700";
  return "text-ink-500";
}

export default function DashboardPage() {
  return (
    <div className="px-6 lg:px-10 py-10 space-y-10">
      {/* Page header */}
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700">
            Overview
          </p>
          <h1 className="font-display mt-3 text-[40px] leading-[1.04] tracking-tight text-ink-900">
            Good morning, Alex.
          </h1>
          <p className="mt-2 text-ink-500 text-[15px] leading-relaxed max-w-xl">
            Here&apos;s what&apos;s moving across your sites today, Wednesday,
            24 April.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-lg border hairline bg-paper hover:bg-ink-50 text-ink-700 text-[13px] font-medium px-3 py-2 transition-colors">
            <LuCalendar size={15} strokeWidth={1.75} />
            Last 7 days
            <LuChevronDown size={14} strokeWidth={1.75} className="text-ink-400" />
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg border hairline bg-paper hover:bg-ink-50 text-ink-700 text-[13px] font-medium px-3 py-2 transition-colors">
            <LuDownload size={15} strokeWidth={1.75} />
            Export
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 hover:bg-ink-800 text-white text-[13px] font-medium px-3.5 py-2 transition-colors shadow-[0_6px_18px_-10px_rgba(18,18,16,0.5)]">
            <LuPlus size={15} strokeWidth={2} />
            New contractor
          </button>
        </div>
      </header>

      {/* Stats grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-ink-200/60 border hairline rounded-2xl overflow-hidden">
        {STATS.map((s) => {
          const Icon = s.Icon;
          return (
            <article
              key={s.label}
              className="bg-paper p-6 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
                  {s.label}
                </p>
                <div className="size-8 rounded-lg bg-ink-100 text-ink-700 grid place-items-center">
                  <Icon size={16} strokeWidth={1.75} />
                </div>
              </div>

              <div className="mt-6">
                <p className="font-display text-[34px] leading-none tracking-tight text-ink-900 tabular-nums">
                  {s.value}
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-[12px]">
                  {s.trend === "up" && (
                    <LuTrendingUp
                      size={14}
                      strokeWidth={2}
                      className={deltaTone(s.trend)}
                    />
                  )}
                  {s.trend === "down" && (
                    <LuTrendingDown
                      size={14}
                      strokeWidth={2}
                      className={deltaTone(s.trend)}
                    />
                  )}
                  {s.trend === "neutral" && (
                    <span className="size-1.5 rounded-full bg-ink-300" />
                  )}
                  <span className={`font-medium ${deltaTone(s.trend)}`}>
                    {s.delta}
                  </span>
                  <span className="text-ink-400">· {s.caption}</span>
                </div>
              </div>

              <Sparkline
                values={s.spark}
                className="mt-4 h-9 w-full"
                stroke="#0f766e"
                fill="rgba(15, 118, 110, 0.10)"
              />
            </article>
          );
        })}
      </section>

      {/* Chart + Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <article className="lg:col-span-2 rounded-2xl bg-paper border hairline">
          <header className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5 pb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
                Attendance · 7 days
              </p>
              <h3 className="font-display mt-1.5 text-[22px] leading-tight tracking-tight text-ink-900">
                Where the week landed
              </h3>
              <p className="mt-1 text-[13px] text-ink-500">
                Contractor check-in volume across regional sites.
              </p>
            </div>
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-4 text-[12px]">
                <div className="flex items-center gap-1.5 text-ink-700">
                  <span className="h-0.5 w-4 rounded-full bg-brand-700" />
                  This week
                </div>
                <div className="flex items-center gap-1.5 text-ink-400">
                  <span className="h-0.5 w-4 rounded-full bg-ink-300" />
                  Previous
                </div>
              </div>
              <div className="hidden sm:flex rounded-lg border hairline bg-paper p-0.5 text-[12px]">
                <button className="px-2.5 py-1 rounded-md bg-ink-100 text-ink-900 font-medium">
                  7D
                </button>
                <button className="px-2.5 py-1 rounded-md text-ink-500 hover:text-ink-900">
                  30D
                </button>
                <button className="px-2.5 py-1 rounded-md text-ink-500 hover:text-ink-900">
                  90D
                </button>
              </div>
            </div>
          </header>
          <div className="px-3 pb-5">
            <AttendanceChart />
          </div>
        </article>

        <article className="rounded-2xl bg-paper border hairline flex flex-col">
          <header className="flex items-center justify-between px-5 pt-5 pb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
                Activity
              </p>
              <h3 className="font-display mt-1.5 text-[20px] leading-tight tracking-tight text-ink-900">
                Latest movements
              </h3>
            </div>
            <button className="text-[12px] font-medium text-brand-700 hover:text-brand-900">
              View all
            </button>
          </header>
          <ol className="relative px-5 pb-5 space-y-5 flex-1">
            <span className="absolute left-[27px] top-2 bottom-5 w-px bg-ink-200" />
            {ACTIVITIES.map((a) => {
              const ActIcon = a.Icon;
              return (
                <li key={a.title} className="relative flex gap-3">
                  <div className="relative z-10 size-7 rounded-full bg-canvas border hairline grid place-items-center text-ink-700">
                    <ActIcon size={14} strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 -mt-0.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[13px] font-semibold text-ink-900 truncate">
                        {a.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-ink-400 tabular-nums">
                        {a.time}
                      </span>
                    </div>
                    <p className="text-[13px] text-ink-500 leading-snug">
                      {a.detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </article>
      </section>

      {/* Map + breakdown */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <article className="lg:col-span-2 relative overflow-hidden rounded-2xl border hairline-strong shadow-[0_30px_60px_-30px_rgba(2,44,34,0.4)]">
          <div className="absolute inset-0">
            <SitesMap />
          </div>
          <div className="relative p-7 flex flex-col justify-between min-h-[300px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border hairline-on-dark bg-white/6 backdrop-blur-sm px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-50/85">
                  <span className="size-1.5 rounded-full bg-accent-300 animate-pulse" />
                  Live
                </span>
                <h3 className="font-display mt-4 text-[26px] leading-tight tracking-tight text-white">
                  Regional presence
                </h3>
                <p className="mt-1.5 text-[14px] text-emerald-100/75 max-w-md leading-relaxed">
                  Real-time distribution of personnel across the Eastern Grid
                  facilities.
                </p>
              </div>
              <button className="hidden md:inline-flex items-center gap-1.5 rounded-lg bg-white/6 hover:bg-white/10 border hairline-on-dark backdrop-blur-sm text-emerald-50 text-[12px] font-medium px-3 py-1.5 transition-colors">
                <LuExternalLink size={13} strokeWidth={1.75} />
                Open map
              </button>
            </div>
            <div className="self-end inline-flex items-center gap-2.5 rounded-xl bg-paper/95 backdrop-blur px-4 py-2.5 shadow-lg">
              <span className="size-2 rounded-full bg-brand-500" />
              <span className="text-[13px] font-semibold text-ink-900 tabular-nums">
                12 sites active now
              </span>
            </div>
          </div>
        </article>

        <article className="rounded-2xl bg-paper border hairline p-6">
          <header className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
                Sites
              </p>
              <h3 className="font-display mt-1.5 text-[20px] leading-tight tracking-tight text-ink-900">
                Distribution
              </h3>
            </div>
            <button className="text-[12px] font-medium text-brand-700 hover:text-brand-900">
              All sites
            </button>
          </header>
          <ul className="space-y-5">
            {SITES.map((s) => (
              <li key={s.name}>
                <div className="flex items-baseline justify-between">
                  <p className="text-[13px] font-medium text-ink-700">
                    {s.name}
                  </p>
                  <p className="text-[13px] font-semibold text-ink-900 tabular-nums">
                    {s.active}
                    <span className="font-normal text-ink-400 ml-1">
                      active
                    </span>
                  </p>
                </div>
                <div className="mt-2 h-1 w-full rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-brand-600 to-accent-500"
                    style={{ width: `${s.percent}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-7 rounded-xl border hairline bg-canvas p-4">
            <div className="flex items-start gap-3">
              <div className="size-8 rounded-lg bg-brand-100 text-brand-800 grid place-items-center">
                <LuTrendingUp size={16} strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-ink-900">
                  Capacity up 8% this week
                </p>
                <p className="mt-0.5 text-[12px] text-ink-500 leading-snug">
                  Three new contractors deployed across Solar Array A and Hydro
                  Beta.
                </p>
              </div>
            </div>
          </div>
        </article>
      </section>

      {/* Footer */}
      <footer className="pt-4 pb-2 flex flex-col md:flex-row md:items-center justify-between gap-3 text-[11px] text-ink-400 border-t hairline">
        <p className="pt-5">
          © 2026 Our World Energy · Contractor Suite v4.2.1
        </p>
        <div className="flex items-center gap-5 pt-2 md:pt-5">
          <a href="#" className="hover:text-ink-700 transition-colors">
            Security
          </a>
          <a href="#" className="hover:text-ink-700 transition-colors">
            Privacy
          </a>
          <a href="#" className="hover:text-ink-700 transition-colors">
            Support
          </a>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-brand-500" />
            Operational
          </span>
        </div>
      </footer>
    </div>
  );
}
