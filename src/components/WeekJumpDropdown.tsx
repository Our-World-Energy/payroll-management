"use client";

import { useState, useEffect, useRef } from "react";
import { LuX } from "react-icons/lu";

export function WeekJumpDropdown({ onApply, onClose }: { onApply: (iso: string) => void; onClose: () => void }) {
  const [date, setDate] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-72">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-[#003527]">Jump to Week</p>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded"><LuX size={14} /></button>
      </div>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pick any date in the week</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
        className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500" />
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
        <button onClick={() => { if (date) { onApply(date); onClose(); } }} disabled={!date}
          className="flex-1 py-2 text-sm font-semibold bg-[#003527] text-white rounded-lg hover:bg-[#064E3B] disabled:opacity-40">Go</button>
      </div>
    </div>
  );
}
