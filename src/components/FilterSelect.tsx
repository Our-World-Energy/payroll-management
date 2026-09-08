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
        className="peer h-[clamp(1.75rem,2.13vw,2rem)] w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-[clamp(0.4375rem,0.7vw,0.5625rem)] pr-[clamp(1.25rem,1.8vw,1.625rem)] text-[clamp(0.6875rem,0.87vw,0.8125rem)] font-medium text-slate-700 outline-none transition-all hover:border-slate-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
      >
        {children}
      </select>
      <LuChevronDown
        size={14}
        className="pointer-events-none absolute right-[clamp(0.4375rem,0.7vw,0.5625rem)] top-1/2 -translate-y-1/2 shrink-0 text-slate-400 transition-colors peer-focus:text-teal-600"
      />
    </div>
  );
}
