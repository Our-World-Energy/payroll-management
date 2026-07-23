"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import Link from "next/link";
import {
  LuLogOut, LuMenu, LuBell, LuUser, LuUmbrella,
  LuClipboardCheck, LuLayoutDashboard,
  LuChevronLeft, LuChevronRight, LuSun, LuMoon,
} from "react-icons/lu";

type NavItem = { href: string; label: string; Icon: React.ElementType };

const NAV_ITEMS: NavItem[] = [
  { href: "/contractor/dashboard",  label: "Dashboard",  Icon: LuLayoutDashboard },
  { href: "/contractor/profile",    label: "Profile",    Icon: LuUser },
  { href: "/contractor/attendance", label: "Attendance", Icon: LuClipboardCheck },
  { href: "/contractor/time-off",   label: "Time-Off",   Icon: LuUmbrella },
];

export default function ContractorLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();

  const [checked,     setChecked]     = useState(false);
  const [email,       setEmail]       = useState("");
  const [initials,    setInitials]    = useState("U");
  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const [collapsed,   setCollapsed]   = useState(false);
  const [dark,        setDark]        = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel !== "aal2") { router.replace("/two-factor"); return; }

      const role = session.user.user_metadata?.role ?? "admin";
      if (role !== "user") { router.replace("/admin"); return; }

      const em = session.user.email ?? "";
      setEmail(em);
      const name  = em.split("@")[0];
      const parts = name.split(/[.\-_]/);
      setInitials(parts.slice(0, 2).map((p: string) => p[0]?.toUpperCase() ?? "").join("") || "U");
      setChecked(true);
    })();
  }, [router]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const isActive = (href: string) => pathname.startsWith(href);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">Loading…</div>
    );
  }

  // ── theme tokens ────────────────────────────────────────────────────────────
  const sidebar = dark
    ? { wrap: "bg-[#0f1a15] border-white/5",  brand: "border-white/5",  label: "text-white/30", nav: "text-white/50",   navActive: "bg-white/10 text-white",     navActiveBorder: "border-teal-400", navHover: "hover:bg-white/5 hover:text-white",  icon: "text-white/30", iconActive: "text-teal-400", divider: "border-white/5",  logout: "text-white/40 hover:bg-red-900/30 hover:text-red-400", collapseBtn: "bg-white/5 hover:bg-white/10 text-white/40 hover:text-white border-white/10" }
    : { wrap: "bg-white border-slate-200",     brand: "border-slate-100", label: "text-slate-400", nav: "text-slate-600", navActive: "bg-teal-50 text-teal-700",   navActiveBorder: "border-teal-600", navHover: "hover:bg-slate-50 hover:text-slate-800", icon: "text-slate-400", iconActive: "text-teal-600", divider: "border-slate-100", logout: "text-slate-500 hover:bg-red-50 hover:text-red-600",    collapseBtn: "bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-700 border-slate-200" };

  const topbar = dark
    ? "bg-[#0f1a15] border-white/5 text-white"
    : "bg-white border-slate-200 text-slate-800";

  const page = dark ? "bg-[#111a15]" : "bg-slate-50";

  // ── sidebar content ─────────────────────────────────────────────────────────
  function SidebarContent({ mobile = false }: { mobile?: boolean }) {
    const w = collapsed && !mobile ? "w-17" : "w-64";
    return (
      <aside className={`flex flex-col h-full ${w} ${sidebar.wrap} border-r overflow-y-auto transition-all duration-300`}>

        {/* Brand */}
        <div className={`px-4 py-4 border-b ${sidebar.brand} shrink-0 flex items-center justify-between gap-2 min-h-16`}>
          {(!collapsed || mobile) && (
            <div className="min-w-0">
              <Image src="/logo.svg" alt="Our World Energy" width={120} height={24} priority
                className={dark ? "brightness-0 invert" : ""} />
              <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${sidebar.label}`}>Contractor Portal</p>
            </div>
          )}
          {!mobile && (
            <button
              onClick={() => setCollapsed(c => !c)}
              className={`shrink-0 w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${sidebar.collapseBtn}`}
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
                onClick={() => mobile && setDrawerOpen(false)}
                title={collapsed && !mobile ? label : undefined}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all rounded-lg relative group",
                  collapsed && !mobile ? "justify-center px-2" : "",
                  active
                    ? `${sidebar.navActive} border-r-[3px] ${sidebar.navActiveBorder} rounded-r-none`
                    : `${sidebar.nav} ${sidebar.navHover}`,
                ].join(" ")}
              >
                <Icon size={18} strokeWidth={1.75} className={`shrink-0 ${active ? sidebar.iconActive : sidebar.icon}`} />
                {(!collapsed || mobile) && <span>{label}</span>}
                {/* tooltip when collapsed */}
                {collapsed && !mobile && (
                  <span className="absolute left-full ml-3 px-2 py-1 bg-slate-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                    {label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Dark mode toggle + logout */}
        <div className={`p-2 border-t ${sidebar.divider} shrink-0 space-y-0.5`}>
          <button
            onClick={() => setDark(d => !d)}
            title={collapsed && !mobile ? (dark ? "Light mode" : "Dark mode") : undefined}
            className={[
              "flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-all group relative",
              collapsed && !mobile ? "justify-center px-2" : "",
              sidebar.nav,
              sidebar.navHover,
            ].join(" ")}
          >
            {dark
              ? <LuSun  size={17} strokeWidth={1.75} className={`shrink-0 ${sidebar.icon}`} />
              : <LuMoon size={17} strokeWidth={1.75} className={`shrink-0 ${sidebar.icon}`} />}
            {(!collapsed || mobile) && <span>{dark ? "Light Mode" : "Dark Mode"}</span>}
            {collapsed && !mobile && (
              <span className="absolute left-full ml-3 px-2 py-1 bg-slate-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                {dark ? "Light Mode" : "Dark Mode"}
              </span>
            )}
          </button>

          <button
            onClick={handleLogout}
            title={collapsed && !mobile ? "Logout" : undefined}
            className={[
              "flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-all group relative",
              collapsed && !mobile ? "justify-center px-2" : "",
              sidebar.logout,
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

  const sidebarW = collapsed ? "lg:ml-17" : "lg:ml-64";
  const fixedW   = collapsed ? "w-17"     : "w-64";

  return (
    <div className={`min-h-screen ${page} transition-colors duration-300`} data-theme={dark ? "dark" : "light"}>

      {/* Desktop sidebar */}
      <div className={`hidden lg:flex fixed left-0 top-0 h-full z-50 ${fixedW} transition-all duration-300`}>
        <SidebarContent />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="relative z-10 h-full shadow-2xl">
            <SidebarContent mobile />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className={`${sidebarW} transition-all duration-300`}>
        {/* Topbar */}
        <header className={`sticky top-0 z-40 h-16 border-b shadow-sm flex items-center justify-between px-4 md:px-6 w-full ${topbar}`}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden p-2 rounded-lg transition-colors hover:bg-black/5"
            >
              <LuMenu size={22} strokeWidth={1.75} />
            </button>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-full transition-colors hover:bg-black/5">
              <LuBell size={20} strokeWidth={1.75} />
            </button>
            <div className={`flex items-center gap-2.5 pl-3 border-l ${dark ? "border-white/10" : "border-slate-200"}`}>
              <div className="text-right hidden sm:block">
                <p className={`text-sm font-semibold leading-tight truncate max-w-40 ${dark ? "text-white" : "text-emerald-900"}`}>
                  {email.split("@")[0]}
                </p>
                <p className={`text-xs leading-tight ${dark ? "text-white/40" : "text-slate-500"}`}>Contractor</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-linear-to-br from-teal-400 to-emerald-700 grid place-items-center text-white text-sm font-bold shrink-0">
                {initials}
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 md:p-8 contractor-page min-h-screen transition-colors duration-300">{children}</main>
      </div>
    </div>
  );
}
