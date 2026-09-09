"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";

/**
 * Calendar-popup date input, shared by Leave Override (admin) and the
 * contractor portal's own request form. A plain <input type="date"> cannot
 * render arbitrary individual dates as unavailable — only a single continuous
 * min/max range — so this draws its own month grid.
 *
 * Dates before `minDate`, and dates in `blockedDates` (already covered by an
 * existing request), render red and cannot be picked.
 */
// MM-DD-YYYY, matching how dates read elsewhere in the console.
function fmtDate(date: string) {
  if (!date) return "-";
  const [year, month, day] = date.split("-");
  return year && month && day ? `${month}-${day}-${year}` : date;
}

export function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function pad2(n: number) { return String(n).padStart(2, "0"); }
export function toDateStr(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

const CALENDAR_DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const CALENDAR_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function buildMonthCells(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// Calendar-popup date input for Leave Override's Start/End Date fields — a
// plain <input type="date"> can't render arbitrary individual dates in red,
// only a single continuous min/max range, so this renders its own month grid
// instead. Dates before `minDate` and dates in `blockedDates` (already
// covered by an existing request for this contractor, Current or Historical,
// any status) show red/disabled and can't be picked.
export function CalendarDateInput({ value, onChange, minDate, blockedDates, disabled }: {
  value: string;
  onChange: (date: string) => void;
  minDate?: string;
  blockedDates: Set<string>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // A disabled field must not be able to open its popup.
  const openable = !disabled;
  const anchor = parseDate(value) ?? (minDate ? parseDate(minDate) : null) ?? new Date();
  const [viewYear, setViewYear] = useState(anchor.getFullYear());
  const [viewMonth, setViewMonth] = useState(anchor.getMonth());
  // Popup coordinates in viewport space (for the fixed-position portal below).
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // The popup is portaled to document.body (fixed-positioned) instead of
  // rendered inline — an inline absolutely-positioned popup still counts
  // toward the scrollable modal body's content height, which can grow the
  // modal (up to its max-h cap) and re-center it on open, making everything
  // above — including the balance scorecards — visibly jump. Portaling keeps
  // it completely outside that layout.
  useEffect(() => {
    if (!open) return;
    function onOutsideClick(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    }
    // Closes on scroll (capture catches scroll from any ancestor, including
    // the modal body) rather than repositioning — simpler and avoids a
    // stale-position popup left floating after the page moves under it.
    function onScroll() { setOpen(false); }
    document.addEventListener("mousedown", onOutsideClick);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onOutsideClick);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  // The popup itself is a fixed w-52 (208px), roughly 240px tall — on a narrow
  // phone viewport, anchoring it straight to the button's own left/bottom
  // (with no clamping) can push it partly off-screen to the right, or below
  // the bottom edge when the button sits low in a scrollable modal. Clamp
  // left to the viewport width and flip above the button when there isn't
  // room below, so the whole calendar always stays reachable.
  function openPicker() {
    const target = parseDate(value) ?? (minDate ? parseDate(minDate) : null) ?? new Date();
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const POPUP_WIDTH = 208;
      const POPUP_HEIGHT = 240;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPUP_WIDTH - 8));
      const top = rect.bottom + POPUP_HEIGHT <= window.innerHeight
        ? rect.bottom + 4
        : Math.max(8, rect.top - POPUP_HEIGHT - 4);
      setCoords({ top, left });
    }
    setOpen(true);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  const cells = buildMonthCells(viewYear, viewMonth);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => { if (!openable) return; return open ? setOpen(false) : openPicker(); }}
        disabled={disabled}
        className="w-full text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500 text-left disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        {value ? fmtDate(value) : <span className="text-slate-400">Select date</span>}
      </button>
      {open && coords && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[60] bg-white border border-slate-200 rounded-lg shadow-lg p-2 w-52"
          style={{ top: coords.top, left: coords.left }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <button type="button" onClick={prevMonth} className="p-0.5 rounded hover:bg-slate-100 text-slate-500">
              <LuChevronLeft size={12} />
            </button>
            <span className="text-[11px] font-bold text-[#003527]">{CALENDAR_MONTH_NAMES[viewMonth]} {viewYear}</span>
            <button type="button" onClick={nextMonth} className="p-0.5 rounded hover:bg-slate-100 text-slate-500">
              <LuChevronRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-7 mb-0.5">
            {CALENDAR_DAY_HEADERS.map((d) => (
              <div key={d} className="text-center text-[9px] font-semibold text-slate-400">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} className="h-6" />;
              const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
              const isSelected = dateStr === value;
              const isBeforeMin = !!minDate && dateStr < minDate;
              const isBlocked = !isSelected && blockedDates.has(dateStr);
              const isDisabled = isBeforeMin || isBlocked;
              return (
                <button
                  type="button"
                  key={i}
                  disabled={isDisabled}
                  title={isBlocked ? "Already requested for this contractor" : undefined}
                  onClick={() => { onChange(dateStr); setOpen(false); }}
                  className={`h-6 rounded text-[10px] font-medium transition-colors ${
                    isSelected ? "bg-[#003527] text-white"
                    : isBlocked ? "bg-red-100 text-red-500 cursor-not-allowed"
                    : isBeforeMin ? "text-slate-300 cursor-not-allowed"
                    : "text-slate-700 hover:bg-teal-50"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
