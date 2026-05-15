"use client";

import { LuSearch, LuBell, LuMenu } from "react-icons/lu";
import { useSidebar } from "./SidebarContext";

export function AdminTopbar() {
  const { toggle } = useSidebar();

  return (
    <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between px-4 md:px-6 w-full">
      <div className="flex items-center gap-3">
        {/* Hamburger — visible only on mobile */}
        <button
          onClick={toggle}
          aria-label="Toggle sidebar"
          className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <LuMenu size={22} strokeWidth={1.75} />
        </button>

        {/* Search */}
        <div className="relative w-full max-w-xs sm:max-w-sm md:max-w-md">
          <LuSearch
            size={16}
            strokeWidth={1.75}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search insights..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-transparent rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3 ml-3">
        <button
          aria-label="Notifications"
          className="relative p-2 text-slate-600 hover:bg-slate-50 rounded-full transition-colors"
        >
          <LuBell size={20} strokeWidth={1.75} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
        </button>

        <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-emerald-900 leading-tight">Admin User</p>
            <p className="text-xs text-slate-500 leading-tight">System Administrator</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-linear-to-br from-teal-400 to-emerald-700 grid place-items-center text-white text-sm font-bold shrink-0">
            AU
          </div>
        </div>
      </div>
    </header>
  );
}
