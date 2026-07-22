"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import Link from "next/link";
import { LuLogOut, LuCalendarDays, LuMenu, LuBell, LuUser, LuUmbrella, LuClipboardCheck, LuLayoutDashboard } from "react-icons/lu";

type NavItem = { href: string; label: string; Icon: React.ElementType };

const NAV_ITEMS: NavItem[] = [
  { href: "/contractor/dashboard",  label: "Dashboard",        Icon: LuLayoutDashboard },
  { href: "/contractor/profile",    label: "Profile",          Icon: LuUser },
  { href: "/contractor/attendance", label: "Attendance",       Icon: LuClipboardCheck },
  { href: "/contractor/holidays",   label: "Holiday Calendar", Icon: LuCalendarDays },
  { href: "/contractor/time-off",   label: "Time-Off",         Icon: LuUmbrella },
];

export default function ContractorLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [checked,     setChecked]     = useState(false);
  const [email,       setEmail]       = useState("");
  const [initials,    setInitials]    = useState("U");
  const [drawerOpen,  setDrawerOpen]  = useState(false);

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
      const name = em.split("@")[0];
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

  const sidebarContent = (
    <aside className="flex flex-col h-full w-64 bg-white border-r border-slate-200 overflow-y-auto">
      {/* Brand */}
      <div className="p-6 border-b border-slate-100 shrink-0">
        <Image src="/logo.svg" alt="Our World Energy" width={140} height={28} priority />
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mt-1">Contractor Portal</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setDrawerOpen(false)}
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
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all rounded-lg"
        >
          <LuLogOut size={18} strokeWidth={1.75} />
          Logout
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex fixed left-0 top-0 h-full z-50 w-64">
        {sidebarContent}
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="relative z-10 h-full w-64 shadow-2xl">{sidebarContent}</div>
        </div>
      )}

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Topbar */}
        <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between px-4 md:px-6 w-full">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <LuMenu size={22} strokeWidth={1.75} />
            </button>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            <button className="relative p-2 text-slate-600 hover:bg-slate-50 rounded-full transition-colors">
              <LuBell size={20} strokeWidth={1.75} />
            </button>
            <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-emerald-900 leading-tight truncate max-w-40">{email.split("@")[0]}</p>
                <p className="text-xs text-slate-500 leading-tight">Contractor</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-linear-to-br from-teal-400 to-emerald-700 grid place-items-center text-white text-sm font-bold shrink-0">
                {initials}
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
