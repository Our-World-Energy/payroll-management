"use client";

import { useEffect, useRef, useState } from "react";
import { LuSearch, LuMenu, LuArrowLeftRight, LuLoader, LuChevronDown } from "react-icons/lu";
import { useRouter } from "next/navigation";
import { useSidebar } from "./SidebarContext";
import { useAdminTheme } from "./AdminThemeContext";
import { NotificationBell } from "./NotificationBell";

export function AdminTopbar() {
  const { toggle } = useSidebar();
  const { dark } = useAdminTheme();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, []);

  function switchToContractor() {
    setSwitching(true);
    localStorage.setItem("role_override", "contractor");
    router.push("/contractor/dashboard");
  }

  const bar = dark
    ? "bg-[#0f1a15] border-white/5 text-white"
    : "bg-white border-slate-200 text-slate-800";

  return (
    <header className={`sticky top-0 z-40 h-16 border-b shadow-sm flex items-center justify-between px-4 md:px-6 w-full transition-colors duration-300 ${bar}`}>
      <div className="flex items-center gap-3">
        {/* Hamburger — visible only on mobile */}
        <button
          onClick={toggle}
          aria-label="Toggle sidebar"
          className={`lg:hidden p-2 rounded-lg transition-colors ${dark ? "text-white/60 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"}`}
        >
          <LuMenu size={22} strokeWidth={1.75} />
        </button>

        {/* Search */}
        <div className="relative w-full max-w-xs sm:max-w-sm md:max-w-md">
          <LuSearch
            size={16}
            strokeWidth={1.75}
            className={`absolute left-3 top-1/2 -translate-y-1/2 ${dark ? "text-white/30" : "text-slate-400"}`}
          />
          <input
            type="text"
            placeholder="Search insights..."
            className={`w-full pl-10 pr-4 py-2 border border-transparent rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all ${dark ? "bg-white/5 text-white placeholder:text-white/30" : "bg-slate-50 text-slate-800"}`}
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3 ml-3">
        <NotificationBell dark={dark} />

        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={`flex items-center gap-2.5 pl-3 border-l cursor-pointer ${dark ? "border-white/10" : "border-slate-200"}`}
          >
            <div className="text-right hidden sm:block">
              <p className={`text-sm font-semibold leading-tight ${dark ? "text-white" : "text-emerald-900"}`}>Admin User</p>
              <p className={`text-xs leading-tight ${dark ? "text-white/40" : "text-slate-500"}`}>System Administrator</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-linear-to-br from-teal-400 to-emerald-700 grid place-items-center text-white text-sm font-bold shrink-0">
              AU
            </div>
            <LuChevronDown
              size={14}
              strokeWidth={2}
              className={`hidden sm:block transition-transform ${menuOpen ? "rotate-180" : ""} ${dark ? "text-white/40" : "text-slate-400"}`}
            />
          </button>

          {menuOpen && (
            <div className={`absolute right-0 top-full mt-2 z-50 w-56 rounded-xl shadow-xl border overflow-hidden ${
              dark ? "bg-[#0f1a15] border-white/10" : "bg-white border-slate-200"
            }`}>
              <button
                onClick={() => { setMenuOpen(false); switchToContractor(); }}
                disabled={switching}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-left transition-colors cursor-pointer disabled:cursor-not-allowed ${
                  dark ? "text-white/80 hover:bg-white/10" : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                }`}
              >
                {switching
                  ? <LuLoader size={15} strokeWidth={2} className="animate-spin" />
                  : <LuArrowLeftRight size={15} strokeWidth={2} />
                }
                {switching ? "Switching…" : "Switch to Contractor View"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
