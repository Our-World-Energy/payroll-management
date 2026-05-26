"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LuLayoutDashboard,
  LuHardHat,
  LuFingerprint,
  LuWallet,
  LuCalendarX,
  LuChartBar,
  LuSettings,
  LuChevronsUpDown,
  LuSparkles,
  LuLogOut,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import { Logo } from "./Logo";

type SidebarUser = {
  id: string;
  email: string;
};

type NavItem = {
  href: string;
  label: string;
  Icon: IconType;
  badge?: string;
};

const NAV_PRIMARY: NavItem[] = [
  { href: "/dashboard", label: "Overview", Icon: LuLayoutDashboard },
  { href: "/dashboard/contractors", label: "Contractors", Icon: LuHardHat, badge: "1,284" },
  { href: "/dashboard/attendance", label: "Attendance", Icon: LuFingerprint },
  { href: "/dashboard/payroll", label: "Payroll", Icon: LuWallet },
  { href: "/dashboard/time-off", label: "Time off", Icon: LuCalendarX, badge: "18" },
];

const NAV_SECONDARY: NavItem[] = [
  { href: "/dashboard/reports", label: "Reports", Icon: LuChartBar },
  { href: "/dashboard/settings", label: "Settings", Icon: LuSettings },
];

export function Sidebar({ user }: { user?: SidebarUser }) {
  const pathname = usePathname();

  const initials = (user?.email ?? "??")
    .split("@")[0]
    .split(/[.\-_]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "U";
  const displayName = user?.email?.split("@")[0] ?? "User";
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const renderItem = (item: NavItem) => {
    const active = isActive(item.href);
    const Icon = item.Icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={[
          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors",
          active
            ? "bg-white/7 text-white"
            : "text-emerald-100/60 hover:text-emerald-50 hover:bg-white/4",
        ].join(" ")}
      >
        {active && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent-300" />
        )}
        <Icon
          size={18}
          strokeWidth={1.75}
          className={[
            "transition-colors shrink-0",
            active
              ? "text-accent-300"
              : "text-emerald-100/40 group-hover:text-emerald-100/80",
          ].join(" ")}
        />
        <span className="flex-1 font-medium tracking-tight">{item.label}</span>
        {item.badge && (
          <span
            className={[
              "tabular-nums text-[10px] font-medium",
              active ? "text-accent-300" : "text-emerald-100/40",
            ].join(" ")}
          >
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 flex flex-col bg-brand-gradient text-white">
      <div className="absolute inset-0 bg-grid-soft pointer-events-none" />

      {/* Brand */}
      <div className="relative px-5 pt-6 pb-5 flex items-center gap-3">
        <Logo className="h-9 w-9" />
        <div className="leading-tight">
          <p className="text-[14px] font-semibold tracking-tight">Our World Energy</p>
          <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-100/45">
            Admin
          </p>
        </div>
      </div>

      {/* Workspace */}
      <div className="relative px-3">
        <button className="w-full flex items-center gap-3 rounded-xl border hairline-on-dark bg-white/3 hover:bg-white/6 px-3 py-2.5 text-left transition-colors">
          <div className="size-7 rounded-md bg-linear-to-br from-accent-300 to-brand-700 grid place-items-center text-[10px] font-semibold text-brand-950">
            EG
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/50">
              Workspace
            </p>
            <p className="text-[13px] font-medium truncate -mt-0.5">
              Eastern Grid Ops
            </p>
          </div>
          <LuChevronsUpDown
            size={14}
            strokeWidth={1.75}
            className="text-emerald-100/40 shrink-0"
          />
        </button>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 overflow-y-auto px-3 py-6 space-y-7">
        <div>
          <p className="px-3 mb-2 text-[10px] uppercase tracking-[0.22em] text-emerald-100/35">
            Operations
          </p>
          <div className="space-y-0.5">{NAV_PRIMARY.map(renderItem)}</div>
        </div>
        <div>
          <p className="px-3 mb-2 text-[10px] uppercase tracking-[0.22em] text-emerald-100/35">
            System
          </p>
          <div className="space-y-0.5">{NAV_SECONDARY.map(renderItem)}</div>
        </div>
      </nav>

      {/* Help nudge */}
      <div className="relative mx-3 mb-3 rounded-xl border hairline-on-dark bg-white/3 p-3">
        <div className="flex items-start gap-2.5">
          <div className="size-8 rounded-lg bg-accent-400/15 text-accent-300 grid place-items-center">
            <LuSparkles size={16} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold tracking-tight text-emerald-50">
              Need a quick tour?
            </p>
            <p className="text-[11px] text-emerald-100/55 leading-snug mt-0.5">
              Watch a 90-second overview of the new dashboard.
            </p>
          </div>
        </div>
      </div>

      {/* User */}
      <div className="relative m-3 mt-0 rounded-xl border hairline-on-dark bg-white/3 backdrop-blur-sm p-2.5 flex items-center gap-2.5">
        <div className="relative shrink-0">
          <div className="size-8 rounded-full bg-linear-to-br from-accent-300 to-brand-700 grid place-items-center text-[11px] font-semibold text-brand-950">
            {initials}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-accent-400 ring-2 ring-brand-900" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold truncate capitalize">
            {displayName}
          </p>
          <p className="text-[10px] text-emerald-100/55 truncate">
            {user?.email ?? "Signed out"}
          </p>
        </div>
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="p-1.5 text-emerald-100/55 hover:text-white rounded-md hover:bg-white/10 transition-colors"
          >
            <LuLogOut size={16} strokeWidth={1.75} />
          </button>
        </form>
      </div>
    </aside>
  );
}
