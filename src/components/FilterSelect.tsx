"use client";

import { LuChevronDown } from "react-icons/lu";

export function FilterSelect({ value, onChange, label, className = "", children }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="peer h-10 w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-sm font-medium text-slate-700 outline-none transition-all hover:border-slate-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
      >
        {children}
      </select>
      <LuChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors peer-focus:text-teal-600"
      />
    </div>
  );
}
