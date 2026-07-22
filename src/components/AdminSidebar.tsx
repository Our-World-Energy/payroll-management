"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LuLayoutDashboard, LuHardHat, LuFingerprint, LuWallet,
  LuCalendarX, LuChartBar, LuSettings, LuLogOut, LuUsers,
  LuChevronLeft, LuChevronRight, LuSun, LuMoon,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import Image from "next/image";
import { useSidebar } from "./SidebarContext";
import { useAdminTheme } from "./AdminThemeContext";
import { createClient } from "@/lib/supabase/client";

type NavItem = { href: string; label: string; Icon: IconType };

const NAV_ITEMS: NavItem[] = [
  { href: "/admin",              label: "Dashboard",          Icon: LuLayoutDashboard },
  { href: "/admin/contractors",  label: "Contractor Details", Icon: LuHardHat         },
  { href: "/admin/time-off",     label: "Time-Off Management",Icon: LuCalendarX       },
  { href: "/admin/attendance",   label: "Attendance",         Icon: LuFingerprint     },
  { href: "/admin/payroll",      label: "Payroll",            Icon: LuWallet          },
  { href: "/admin/reports",      label: "Reports",            Icon: LuChartBar        },
  { href: "/admin/users",        label: "User Management",    Icon: LuUsers           },
  { href: "/admin/settings",     label: "Settings",           Icon: LuSettings        },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { open, close } = useSidebar();
  const { dark, collapsed, toggleDark, toggleCollapsed } = useAdminTheme();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const s = dark
    ? {
        wrap: "bg-[#0f1a15] border-white/5",
        brand: "border-white/5",
        label: "text-white/30",
        nav: "text-white/50",
        navActive: "bg-white/10 text-white",
        navActiveBorder: "border-teal-400",
        navHover: "hover:bg-white/5 hover:text-white",
        icon: "text-white/30",
        iconActive: "text-teal-400",
        divider: "border-white/5",
        logout: "text-white/40 hover:bg-red-900/30 hover:text-red-400",
        collapseBtn: "bg-white/5 hover:bg-white/10 text-white/40 hover:text-white border-white/10",
      }
    : {
        wrap: "bg-white border-slate-200",
        brand: "border-slate-100",
        label: "text-slate-400",
        nav: "text-slate-600",
        navActive: "bg-teal-50 text-teal-700",
        navActiveBorder: "border-teal-600",
        navHover: "hover:bg-slate-50 hover:text-slate-800",
        icon: "text-slate-400",
        iconActive: "text-teal-600",
        divider: "border-slate-100",
        logout: "text-slate-500 hover:bg-red-50 hover:text-red-600",
        collapseBtn: "bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-700 border-slate-200",
      };

  function SidebarContent({ mobile = false }: { mobile?: boolean }) {
    const w = collapsed && !mobile ? "w-17" : "w-64";
    return (
      <aside className={`flex flex-col h-full ${w} ${s.wrap} border-r overflow-y-auto transition-all duration-300`}>

        {/* Brand */}
        <div className={`px-4 py-4 border-b ${s.brand} shrink-0 flex items-center justify-between gap-2 min-h-16`}>
          {(!collapsed || mobile) && (
            <div className="min-w-0">
              <Image
                src="/logo.svg"
                alt="Our World Energy"
                width={140}
                height={28}
                priority
                className={dark ? "brightness-0 invert" : ""}
              />
              <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${s.label}`}>
                Admin Console
              </p>
            </div>
          )}
          {!mobile && (
            <button
              onClick={toggleCollapsed}
              className={`shrink-0 w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${s.collapseBtn}`}
            >
              {collapsed
                ? <LuChevronRight size={13} strokeWidth={2.5} />
                : <LuChevronLeft  size={13} strokeWidth={2.5} />}
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => { if (mobile) close(); }}
                prefetch={true}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all rounded-lg relative group",
                  collapsed && !mobile ? "justify-center px-2" : "",
                  active
                    ? `${s.navActive} border-r-[3px] ${s.navActiveBorder} rounded-r-none`
                    : `${s.nav} ${s.navHover}`,
                ].join(" ")}
              >
                <Icon size={18} strokeWidth={1.75} className={`shrink-0 ${active ? s.iconActive : s.icon}`} />
                {(!collapsed || mobile) && <span>{label}</span>}
                {collapsed && !mobile && (
                  <span className="absolute left-full ml-3 px-2 py-1 bg-slate-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                    {label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Dark toggle + Logout */}
        <div className={`p-2 border-t ${s.divider} shrink-0 space-y-0.5`}>
          <button
            onClick={toggleDark}
            className={[
              "flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-all group relative",
              collapsed && !mobile ? "justify-center px-2" : "",
              s.nav,
              s.navHover,
            ].join(" ")}
          >
            {dark
              ? <LuSun  size={17} strokeWidth={1.75} className={`shrink-0 ${s.icon}`} />
              : <LuMoon size={17} strokeWidth={1.75} className={`shrink-0 ${s.icon}`} />}
            {(!collapsed || mobile) && <span>{dark ? "Light Mode" : "Dark Mode"}</span>}
            {collapsed && !mobile && (
              <span className="absolute left-full ml-3 px-2 py-1 bg-slate-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                {dark ? "Light Mode" : "Dark Mode"}
              </span>
            )}
          </button>

          <button
            onClick={handleLogout}
            className={[
              "flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-all group relative",
              collapsed && !mobile ? "justify-center px-2" : "",
              s.logout,
            ].join(" ")}
          >
            <LuLogOut size={17} strokeWidth={1.75} className="shrink-0" />
            {(!collapsed || mobile) && <span>Logout</span>}
            {collapsed && !mobile && (
              <span className="absolute left-full ml-3 px-2 py-1 bg-slate-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                Logout
              </span>
            )}
          </button>
        </div>
      </aside>
    );
  }

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <div className={`hidden lg:flex fixed left-0 top-0 h-full z-50 ${collapsed ? "w-17" : "w-64"} transition-all duration-300`}>
        <SidebarContent />
      </div>

      {/* Mobile: drawer overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
          <div className="relative z-10 h-full shadow-2xl">
            <SidebarContent mobile />
          </div>
        </div>
      )}
    </>
  );
}
