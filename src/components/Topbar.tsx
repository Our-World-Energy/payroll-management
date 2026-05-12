import {
  LuChevronRight,
  LuSearch,
  LuBell,
  LuCircleHelp,
  LuChevronDown,
} from "react-icons/lu";

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 h-16 bg-canvas/85 backdrop-blur-md border-b hairline flex items-center justify-between px-6 lg:px-8">
      {/* Left: breadcrumbs */}
      <nav className="hidden md:flex items-center gap-2 text-[13px]">
        <span className="text-ink-400">Workspace</span>
        <LuChevronRight size={14} strokeWidth={1.75} className="text-ink-300" />
        <span className="text-ink-400">Eastern Grid</span>
        <LuChevronRight size={14} strokeWidth={1.75} className="text-ink-300" />
        <span className="font-medium text-ink-900">Dashboard</span>
      </nav>

      {/* Center: search */}
      <div className="flex-1 max-w-md mx-6 hidden md:block">
        <div className="relative">
          <LuSearch
            size={16}
            strokeWidth={1.75}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            type="text"
            placeholder="Search contractors, sites, payroll…"
            className="w-full pl-10 pr-14 py-2 bg-paper border hairline rounded-lg text-[13px] text-ink-900 placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-700 focus:ring-4 focus:ring-brand-900/10 outline-none transition-all"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden lg:inline-flex items-center gap-1 rounded-md border hairline bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
            ⌘ K
          </kbd>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1.5">
        <button
          aria-label="Notifications"
          className="relative size-9 grid place-items-center rounded-lg text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition-colors"
        >
          <LuBell size={18} strokeWidth={1.75} />
          <span className="absolute top-2 right-2 size-1.5 rounded-full bg-brand-600 ring-2 ring-canvas" />
        </button>
        <button
          aria-label="Help"
          className="size-9 grid place-items-center rounded-lg text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition-colors"
        >
          <LuCircleHelp size={18} strokeWidth={1.75} />
        </button>

        <div className="hidden md:block w-px h-6 bg-ink-200 mx-1.5" />

        <button className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-ink-100 transition-colors">
          <div className="size-7 rounded-md bg-linear-to-br from-accent-300 to-brand-700 grid place-items-center text-white text-[11px] font-semibold">
            AU
          </div>
          <span className="hidden sm:inline text-[13px] font-medium text-ink-900">
            Alex
          </span>
          <LuChevronDown size={14} strokeWidth={1.75} className="text-ink-400" />
        </button>
      </div>
    </header>
  );
}
