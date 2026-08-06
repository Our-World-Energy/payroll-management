"use client";

import { useState, useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { LuX } from "react-icons/lu";

const POPUP_WIDTH = 288; // w-72
const POPUP_HEIGHT = 260; // approx — date input + Cancel/Go buttons

// Anchored via the caller's trigger button ref rather than CSS
// absolute-positioning off a `relative` ancestor — the toolbar row it opens
// from (see Attendance/Payroll's week-selector pill bar) has overflow-x-auto,
// and an inline absolutely-positioned popup still counts toward that
// ancestor's scrollable content size, which can clip or shift the toolbar on
// open, especially once that row is width-constrained on a small screen. A
// fixed-position portal to document.body sidesteps that entirely, and
// clamping to the viewport keeps the whole 288px-wide popup reachable even
// when the trigger sits close to a narrow phone's edge.
export function WeekJumpDropdown({ onApply, onClose, anchorRef }: {
  onApply: (iso: string) => void;
  onClose: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const [date, setDate] = useState("");
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rect = anchorRef?.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.right - POPUP_WIDTH, window.innerWidth - POPUP_WIDTH - 8));
    const top = rect.bottom + POPUP_HEIGHT <= window.innerHeight
      ? rect.bottom + 8
      : Math.max(8, rect.top - POPUP_HEIGHT - 8);
    setCoords({ top, left });
  }, [anchorRef]);

  useEffect(() => {
    function h(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchorRef?.current?.contains(target as Node)) return;
      onClose();
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose, anchorRef]);

  if (!coords) return null;

  return createPortal(
    <div ref={ref} className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-72" style={{ top: coords.top, left: coords.left }}>
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
    </div>,
    document.body
  );
}
