"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LuLayoutDashboard, LuHardHat, LuFingerprint, LuWallet,
  LuCalendarX, LuChartBar, LuSettings, LuLogOut,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import Image from "next/image";
import { useSidebar } from "./SidebarContext";

type NavItem = { href: string; label: string; Icon: IconType };

const NAV_ITEMS: NavItem[] = [
  { href: "/admin",              label: "Dashboard",          Icon: LuLayoutDashboard },
  { href: "/admin/contractors",  label: "Contractor Details", Icon: LuHardHat         },
  { href: "/admin/attendance",   label: "Attendance",         Icon: LuFingerprint     },
  { href: "/admin/payroll",      label: "Payroll",            Icon: LuWallet          },
  { href: "/admin/time-off",     label: "Time-Off Management",Icon: LuCalendarX       },
  { href: "/admin/reports",      label: "Reports",            Icon: LuChartBar        },
  { href: "/admin/settings",     label: "Settings",           Icon: LuSettings        },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { open, close } = useSidebar();

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const sidebarContent = (
    <aside className="flex flex-col h-full w-64 bg-white border-r border-slate-200 overflow-y-auto">
      {/* Brand */}
      <div className="p-6 border-b border-slate-100 shrink-0">
        <Image src="/logo.svg" alt="Our World Energy" width={140} height={28} priority />
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mt-1">Admin Console</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={close}
              className={[
                "flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all rounded-lg",
                active
                  ? "bg-teal-50 text-teal-700 border-r-4 border-teal-600 rounded-r-none"
                  : "text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              <Icon size={18} strokeWidth={1.75} className={active ? "text-teal-600" : "text-slate-400"} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-slate-100 shrink-0">
        <button className="flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all rounded-lg">
          <LuLogOut size={18} strokeWidth={1.75} />
          Logout
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <div className="hidden lg:flex fixed left-0 top-0 h-full z-50 w-64">
        {sidebarContent}
      </div>

      {/* Mobile: drawer overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={close}
          />
          {/* Drawer */}
          <div className="relative z-10 h-full w-64 shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
