"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LuEye, LuX, LuClock, LuCircleCheck, LuCircleX, LuCalendarDays, LuTrendingUp,
  LuShieldCheck, LuChevronLeft, LuChevronRight, LuChevronDown, LuChevronUp, LuDownload, LuUpload, LuCalendarPlus, LuUmbrella, LuStethoscope,
  LuSlidersHorizontal, LuCircleAlert, LuSearch, LuGift, LuPencil, LuTrash2, LuLoader, LuListChecks, LuFingerprint, LuBanknote,
} from "react-icons/lu";
import {
  fetchAllContractors, updateTimeOffUsage, bulkImportUsedImport, resetUsedHours,
  fetchAllLeaveRequestsAdmin, createLeaveOverride, createAdvanceLeaveOverride, type AdminLeaveRequest,
  fetchAllSpecialLeaveGrantsAdmin, addSpecialLeaveGrant, type SpecialLeaveGrant,
} from "../contractors/actions";
import { fetchCutOffTime, fetchAlerts, removeAlert, type AdminAlert } from "../settings/actions";
import type { Contractor } from "../contractors/types";
import { leaveTypeHours, isPtoLeaveType, leaveBucketFor, cutoffFromSaved, DEFAULT_CUTOFF, type CutoffDate, calculatePtoBalance, calculateSickLeaveBalance, resetSpecialLeaveIfExpired, leaveTypeDisplayLabel, specialLeaveAvailableForGrants, isSpecialLeaveGrantExpired } from "@/lib/timeOffBalances";
import { PtoSickUsedImportModal } from "@/components/PtoSickUsedImportModal";
import { TimeOffBalanceCard } from "@/components/TimeOffBalanceCard";
import { PAY_CATEGORIES } from "@/components/AddContractorModal";
import { arizonaTodayIso, addDaysIso, arizonaNowParts } from "@/lib/weekUtils";

const HOURS_PER_DAY = 8;
const TODAY = new Date();

function fmtDate(date: string) {
  if (!date) return "-";
  const [year, month, day] = date.split("-");
  return year && month && day ? `${month}-${day}-${year}` : date;
}

function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function pad2(n: number) { return String(n).padStart(2, "0"); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

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
function CalendarDateInput({ value, onChange, minDate, blockedDates }: {
  value: string;
  onChange: (date: string) => void;
  minDate?: string;
  blockedDates: Set<string>;
}) {
  const [open, setOpen] = useState(false);
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
        onClick={() => (open ? setOpen(false) : openPicker())}
        className="w-full text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500 text-left"
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

function addMonths(date: Date, months: number) {
  const result = new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
  if (result.getDate() !== date.getDate()) result.setDate(0);
  return result;
}

function firstOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function calendarMonthDiff(start: Date, end: Date) {
  return Math.max(
    (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth(),
    0
  );
}

function sickLeaveYearStart(date: Date, cutoff: CutoffDate): Date {
  const cutoffThisYear = new Date(date.getFullYear(), cutoff.month, cutoff.day);
  return date >= cutoffThisYear
    ? cutoffThisYear
    : new Date(date.getFullYear() - 1, cutoff.month, cutoff.day);
}

function roundBalance(value: number) {
  return Math.round(value * 100) / 100;
}

function fmtBalance(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function calculateUnusedSickLeave(hireDate: string, sickLeaveUsedHours: number, cutoff: CutoffDate): number {
  const startDate = parseDate(hireDate);
  if (!startDate) return 0;
  const eligibilityDate = addMonths(startDate, 6);
  const accrualStart = firstOfNextMonth(eligibilityDate);
  const currentYearStart = sickLeaveYearStart(TODAY, cutoff);
  const prevYearEnd = new Date(currentYearStart.getTime() - 86400000);
  const prevYearStart = new Date(currentYearStart.getFullYear() - 1, cutoff.month, cutoff.day);
  const effectiveStart = accrualStart > prevYearStart ? accrualStart : prevYearStart;
  if (effectiveStart >= currentYearStart) return 0;
  const prevYearEndFirst = new Date(prevYearEnd.getFullYear(), prevYearEnd.getMonth(), 1);
  const monthsInPrevYear = calendarMonthDiff(effectiveStart, prevYearEndFirst) + 1;
  const prevYearAccrued = roundBalance(monthsInPrevYear * 3.33);
  return roundBalance(Math.max(prevYearAccrued - sickLeaveUsedHours, 0));
}

type RequestDecision = "Approved" | "Pending" | "Declined";

function countryFromLocation(location: string) {
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.at(-1) ?? "Unknown";
}

function avatarInitials(name: string) {
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-teal-100 text-teal-700", "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700", "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700", "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
];

function avatarColor(uid: string) {
  let n = 0;
  for (let i = 0; i < uid.length; i++) n += uid.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function BalanceBar({ used, total, color }: { used: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const REVIEW_BADGE: Record<RequestDecision, string> = {
  Approved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Pending:  "bg-amber-50 text-amber-700 border border-amber-200",
  Declined: "bg-red-50 text-red-600 border border-red-200",
};

const REVIEW_ICON: Record<RequestDecision, React.ReactNode> = {
  Approved: <LuCircleCheck size={11} />,
  Pending:  <LuClock size={11} />,
  Declined: <LuCircleX size={11} />,
};

type TimeOffRow = {
  id: string;
  fullName: string;
  email: string;
  country: string;
  department: string;
  payCategory: string;
  role: string;
  hireDate: string;
  ptoBalance: number;
  ptoUsed: number;
  ptoUsedImport: number;
  ptoAvailable: number;
  sickLeaveBalance: number;
  sickLeaveUsed: number;
  sickUsedImport: number;
  sickLeaveAvailable: number;
  birthdayLeave: number;
  birthdayLeaveUsed: number;
  advanceSickLeave: number;
  advanceSickLeaveUsed: number;
  specialLeaveCredits: number;
  specialLeaveUsed: number;
  specialLeaveAvailable: number;
  specialLeaveGrantedAt: string | null;
  specialLeaveGrants: SpecialLeaveGrant[]; // Hourly/Fixed-Ind only — see specialLeaveAvailableForGrants
  outstandingLeaveBalance: number;
  outstandingMedicalBalance: number;
  unusedSickLeave: number;
  latestRequest: AdminLeaveRequest | null;
};

// Summarizes current PTO/Sick Leave usage, and offers "Reset PTO Used / Sick
// Leave Used" — see resetUsedHours for what that actually does.
function ProcessTimeOffModal({
  rows, onClose, onProcessed, dueAlert, onAlertResolved,
}: {
  rows: TimeOffRow[]; onClose: () => void; onProcessed: () => void;
  dueAlert: AdminAlert | null; onAlertResolved: () => void;
}) {
  const ptoCount = rows.filter((r) => r.ptoUsed > 0).length;
  const sickLeaveCount = rows.filter((r) => r.sickLeaveUsed > 0).length;
  const negativeCount = rows.filter((r) => r.ptoAvailable < 0 || r.sickLeaveAvailable < 0).length;

  // Auto-prompts the same confirmation below whenever this modal is opened
  // with a due Scheduled Trigger Date already resolved by the page (Time Away
  // Management checks for it as soon as it's opened, not just this modal —
  // see the mount effect in TimeOffPage). Only an explicit Cancel (or
  // Proceed) resolves the trigger, so simply closing this dialog leaves it
  // due and it prompts again next time Time Away Management is opened.
  const [showResetUsedConfirm, setShowResetUsedConfirm] = useState(!!dueAlert);
  const [isResettingUsed, setIsResettingUsed] = useState(false);
  const [resetUsedError, setResetUsedError] = useState("");
  const [resetUsedCount, setResetUsedCount] = useState<number | null>(null);

  // No precondition on the button itself — gated
  // by an explicit confirmation step instead. Per-side (PTO vs Medical),
  // resetUsedHours() leaves a contractor's fields untouched whenever their
  // Outstanding Balance on that side is still negative, so a real
  // unresolved deficit is never silently erased just because this ran.
  async function handleResetUsed() {
    setIsResettingUsed(true);
    setResetUsedError("");
    try {
      const { updated } = await resetUsedHours();
      if (dueAlert) { await removeAlert(dueAlert.id); onAlertResolved(); }
      setResetUsedCount(updated);
      setShowResetUsedConfirm(false);
      onProcessed();
    } catch (err) {
      setResetUsedError(err instanceof Error ? err.message : "Failed to reset. Please try again.");
    } finally {
      setIsResettingUsed(false);
    }
  }

  async function handleCancelResetUsed() {
    if (dueAlert) {
      await removeAlert(dueAlert.id);
      onAlertResolved();
    }
    setShowResetUsedConfirm(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-[#003527]">Process Time Away</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <LuX size={18} strokeWidth={2} />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">Current PTO / Medical Unavailability usage across your contractor workforce.</p>

        <div className="space-y-2 mb-5">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-teal-50 border border-teal-100">
            <span className="text-sm font-medium text-teal-700">Contractors with PTO</span>
            <span className="text-sm font-bold text-teal-700">{ptoCount}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-orange-50 border border-orange-100">
            <span className="text-sm font-medium text-orange-700">Count of Medical Unavailability</span>
            <span className="text-sm font-bold text-orange-700">{sickLeaveCount}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-red-50 border border-red-100">
            <span className="text-sm font-medium text-red-700">Negative balances to save</span>
            <span className="text-sm font-bold text-red-700">{negativeCount}</span>
          </div>
        </div>

        {resetUsedError && <p className="text-xs text-red-600 mb-3">{resetUsedError}</p>}
        {resetUsedCount != null && !resetUsedError && (
          <p className="text-xs text-emerald-600 mb-3">
            Reset PTO Used / Sick Leave Used for {resetUsedCount} contractor{resetUsedCount !== 1 ? "s" : ""}.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Close
          </button>
          <button
            onClick={() => setShowResetUsedConfirm(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-red-700 border border-red-200 bg-white hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Reset PTO Used / Sick Leave Used
          </button>
        </div>
      </div>

      {/* Reset PTO Used / Sick Leave Used confirmation — a blunt, unconditional
          bulk action, so it's gated by an explicit confirm step instead of a
          balance precondition. */}
      {showResetUsedConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isResettingUsed && handleCancelResetUsed()} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <button
              onClick={handleCancelResetUsed}
              disabled={isResettingUsed}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40"
            >
              <LuX size={18} strokeWidth={2} />
            </button>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
                <LuTrash2 size={18} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#003527]">Reset PTO Used / Sick Leave Used</h3>
                {dueAlert && (
                  <p className="text-xs font-semibold text-amber-600 mt-1">
                    Scheduled to run {fmtDate(dueAlert.alertDate)}{dueAlert.alertTime ? ` ${dueAlert.alertTime}` : ""} — proceed or cancel this scheduled run.
                  </p>
                )}
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                  This will set PTO Used, Sick Leave Used, Advance PTO/Birthday Leave (Time and Used), and Advance Sick Leave (Time and Used) back to 0, and mark the matching Approved leave requests as Archived. Before resetting, any currently-negative Available is captured into Outstanding Balance first (same as Process) — otherwise Outstanding Balance is cleared to 0. It does not touch imported baselines, Pending requests, or Special Leave. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleCancelResetUsed}
                disabled={isResettingUsed}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleResetUsed}
                disabled={isResettingUsed}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
              >
                {isResettingUsed && <LuLoader size={14} strokeWidth={2} className="animate-spin" />}
                {isResettingUsed ? "Resetting…" : "Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TimeOffPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [contractors,   setContractors]   = useState<Contractor[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<AdminLeaveRequest[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState("");

  const [nameSearch,         setNameSearch]         = useState("");
  const [countryFilter,      setCountryFilter]      = useState("All Countries");
  const [departmentFilter,   setDepartmentFilter]   = useState("All Assigned Teams");
  const [payCategoryFilter,  setPayCategoryFilter]  = useState("All Categories");
  const [reviewStatusFilter, setReviewStatusFilter] = useState("All Statuses");

  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [modalTab,      setModalTab]      = useState<"details" | "info" | "override" | "special">("info");

  const [editLeaveType, setEditLeaveType] = useState<"Advance Sick Leave" | "Advance PTO/Birthday Leave">("Advance Sick Leave");
  const [editHours,     setEditHours]     = useState("");

  const [isEditingAdvanceBalance, setIsEditingAdvanceBalance] = useState(false);
  const [editAdvancePtoBalance,  setEditAdvancePtoBalance]  = useState("");
  const [editAdvancePtoUsed,     setEditAdvancePtoUsed]     = useState("");
  const [editAdvanceSickBalance, setEditAdvanceSickBalance] = useState("");
  const [editAdvanceSickUsed,    setEditAdvanceSickUsed]    = useState("");

  const [specialHours, setSpecialHours] = useState("");
  const [specialReason, setSpecialReason] = useState("");
  const [specialGrantDate, setSpecialGrantDate] = useState(arizonaTodayIso());
  const [isEditingSpecialBalance, setIsEditingSpecialBalance] = useState(false);
  const [editSpecialCredits, setEditSpecialCredits] = useState("");
  const [editSpecialUsed, setEditSpecialUsed] = useState("");

  // Hourly/Fixed-Ind multi-grant Special Leave (every other pay category,
  // currently just Fixed-Mex, keeps using the single specialHours/
  // specialReason/specialGrantDate flow above).
  const [specialLeaveGrants, setSpecialLeaveGrants] = useState<SpecialLeaveGrant[]>([]);
  const [grantHours, setGrantHours] = useState("");
  const [grantDate, setGrantDate] = useState(arizonaTodayIso());
  const [grantNote, setGrantNote] = useState("");
  const [grantExpirationDays, setGrantExpirationDays] = useState("");
  const [grantSubmitting, setGrantSubmitting] = useState(false);
  const [grantError, setGrantError] = useState("");
  const [showGrantsList, setShowGrantsList] = useState(false);

  const OVERRIDE_TYPES = [
    "PTO", "PTO Half Day", "Sick Leave", "Sick Leave Half Day", "Unpaid Leave", "Special Leave",
    "Advance PTO/Birthday Leave", "Advance PTO/Birthday Leave Half Day", "Advance Sick Leave", "Advance Sick Leave Half Day",
  ] as const;
  const [overrideType,       setOverrideType]       = useState<typeof OVERRIDE_TYPES[number]>("PTO");
  const [overrideStartDate,  setOverrideStartDate]  = useState("");
  const [overrideEndDate,    setOverrideEndDate]    = useState("");
  const [overrideReason,     setOverrideReason]     = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideError,      setOverrideError]      = useState("");
  const [overrideBlocked,    setOverrideBlocked]    = useState("");
  const [overrideDuplicateWarning, setOverrideDuplicateWarning] = useState("");
  const [confirmOverrideAnyway, setConfirmOverrideAnyway] = useState<(() => void) | null>(null);
  const [cutoff, setCutoff] = useState<CutoffDate>(DEFAULT_CUTOFF);

  const [showUsedImportModal, setShowUsedImportModal] = useState(false);
  const [showProcessTimeOffModal, setShowProcessTimeOffModal] = useState(false);

  // The Scheduled Trigger Date (Settings → Time Away Settings → Reset Time
  // Off) is a one-time due date/time, not a recurring cron — checked as soon
  // as an admin opens Time Away Management itself (not just Process Time
  // Away), so a due trigger surfaces the moment they land here, however late.
  const [dueAlert, setDueAlert] = useState<AdminAlert | null>(null);

  useEffect(() => {
    let isCancelled = false;
    fetchAlerts().then((list) => {
      if (isCancelled) return;
      const alert = list[0];
      if (!alert) return;
      const now = arizonaNowParts();
      const isDue = alert.alertDate < now.date || (alert.alertDate === now.date && alert.alertTime <= now.time);
      if (isDue) {
        setDueAlert(alert);
        setShowProcessTimeOffModal(true);
      }
    });
    return () => { isCancelled = true; };
  }, []);

  const reloadData = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const [all, requests, grants, savedCutoff] = await Promise.all([
        fetchAllContractors({ country: "All Countries", status: "All Statuses", rules: [] }),
        fetchAllLeaveRequestsAdmin(),
        fetchAllSpecialLeaveGrantsAdmin(),
        fetchCutOffTime(),
      ]);
      setContractors(all); setLeaveRequests(requests); setSpecialLeaveGrants(grants); setCutoff(cutoffFromSaved(savedCutoff));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Unable to load contractors.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reloadData(); }, [reloadData]);

  // ── Clear PTO/Medical Unavailability Used Import ─────────────────────────
  // Resets a single contractor's imported baseline back to 0 (i.e. "no
  // import on file"), reusing the same bulk-import action with a lone
  // zero-hours entry rather than adding a dedicated clear endpoint.
  const [clearingUsedImport, setClearingUsedImport] = useState<{ id: string; type: "pto" | "sick" } | null>(null);
  const [clearImportError,   setClearImportError]   = useState<{ id: string; type: "pto" | "sick"; message: string } | null>(null);

  async function handleClearUsedImport(row: TimeOffRow, type: "pto" | "sick") {
    setClearingUsedImport({ id: row.id, type });
    setClearImportError(null);
    try {
      const { results } = await bulkImportUsedImport(type, [{ email: row.email, hours: 0 }]);
      if (!results[0]?.ok) {
        setClearImportError({ id: row.id, type, message: results[0]?.error ?? "Failed to clear." });
        return;
      }
      await reloadData();
    } catch (err) {
      setClearImportError({ id: row.id, type, message: err instanceof Error ? err.message : "Failed to clear." });
    } finally {
      setClearingUsedImport(null);
    }
  }

  // Map email → latest leave request (already sorted newest-first)
  const latestByEmail = useMemo<Record<string, AdminLeaveRequest>>(() => {
    const map: Record<string, AdminLeaveRequest> = {};
    for (const r of leaveRequests) {
      if (!map[r.email]) map[r.email] = r;
    }
    return map;
  }, [leaveRequests]);

  // Map email → every Special Leave grant (Hourly/Fixed-Ind only — see specialLeaveAvailableForGrants).
  const grantsByEmail = useMemo<Record<string, SpecialLeaveGrant[]>>(() => {
    const map: Record<string, SpecialLeaveGrant[]> = {};
    for (const g of specialLeaveGrants) (map[g.email] ??= []).push(g);
    return map;
  }, [specialLeaveGrants]);

  const rows = useMemo<TimeOffRow[]>(() => contractors.map((c) => {
    const fullName = c.fullName || [c.firstName, c.surname].filter(Boolean).join(" ");
    // Live-computed from Engagement Start Date + the current Cut Off Time,
    // rather than trusting the stored snapshot — so a Cut Off Time change is
    // reflected immediately without waiting for this contractor to be saved again.
    const ptoBalance       = calculatePtoBalance(c.hireDate, cutoff);
    const sickLeaveBalance = calculateSickLeaveBalance(c.hireDate, cutoff);
    // An imported/legacy baseline (pto_used_import / sick_used_import) takes
    // over as the effective Used value wherever it's set — it's meant to
    // supersede the in-app-computed total, not sit alongside it. Falls back
    // to the normal computed value when the import field is blank (0). Advance
    // PTO/Sick Leave used (birthdayLeaveUsed / advanceSickLeaveUsed) is always
    // added on top, so PTO Used / Sick Leave Used reflect total time taken
    // regardless of which pool (normal accrual or advance allotment) it drew from.
    // outstandingLeaveBalance is intentionally not netted out of PTO Used
    // here — it's shown separately as its own Outstanding Balance line
    // instead. Sick Leave Used still nets outstandingMedicalBalance back out
    // (floored at 0 so Used/Available/Accrued stay mutually consistent).
    const ptoUsed          = (c.ptoUsedImport > 0  ? c.ptoUsedImport  : c.ptoUsed) + c.birthdayLeaveUsed;
    const sickLeaveUsed    = Math.max(0, (c.sickUsedImport > 0 ? c.sickUsedImport : c.sickLeaveUsed) + c.advanceSickLeaveUsed - c.outstandingMedicalBalance);
    // Not floored at 0 — a negative Available (Used exceeds Accrual, e.g.
    // Accrual 0 with 8h Used) is shown as-is so it's visible instead of
    // silently masked to 0. outstandingLeaveBalance is deducted directly
    // here instead of via ptoUsed (see above), so a still-outstanding
    // deficit reduces PTO Available without inflating what's shown as Used.
    const ptoAvailable       = roundBalance(ptoBalance - ptoUsed - c.outstandingLeaveBalance);
    const sickLeaveAvailable = roundBalance(sickLeaveBalance - sickLeaveUsed);
    // Fixed-Ind only — a Special Leave Credit grant expires 60 days after
    // it was added, live-resetting the credit pool to 0 (see
    // resetSpecialLeaveIfExpired) the same way the Advance PTO/Sick Leave
    // resets above work — immediately, without waiting for a save.
    // Hourly and Fixed-Ind both use the multi-grant model: multiple
    // independent grants, each with its own free-form expiration, instead of
    // one shared balance — see specialLeaveAvailableForGrants. Every other
    // pay category (currently just Fixed-Mex) is untouched, still driven by
    // resetSpecialLeaveIfExpired above.
    const payCategoryLower = c.payCategory.trim().toLowerCase();
    const usesGrants = payCategoryLower === "hourly" || payCategoryLower === "fixed-ind";
    const rowGrants = grantsByEmail[c.email] ?? [];
    const specialLeaveReset = resetSpecialLeaveIfExpired(c.payCategory, c.specialLeaveGrantedAt, c.specialLeaveCredits, c.specialLeaveUsed);
    // An expired grant's hours are dropped from Credits entirely, not just
    // excluded from Available — so a grant added for 8h that later expires
    // unused takes its 8h back out of the Credits total too, keeping
    // Credits/Used/Available consistent with each other.
    const specialLeaveCredits = usesGrants
      ? roundBalance(rowGrants.reduce((s, g) => isSpecialLeaveGrantExpired(g, TODAY) ? s : s + g.hours, 0))
      : specialLeaveReset.specialLeaveCredits;
    const specialLeaveUsed = usesGrants ? roundBalance(rowGrants.reduce((s, g) => s + g.hoursUsed, 0)) : specialLeaveReset.specialLeaveUsed;
    const specialLeaveAvailable = usesGrants
      ? specialLeaveAvailableForGrants(rowGrants, TODAY)
      : roundBalance(Math.max(specialLeaveReset.specialLeaveCredits - specialLeaveReset.specialLeaveUsed, 0));
    return {
      id: c.uid, fullName, email: c.email,
      country: countryFromLocation(c.location),
      department: c.department, payCategory: c.payCategory, role: c.role, hireDate: c.hireDate,
      ptoBalance, ptoUsed, ptoUsedImport: c.ptoUsedImport, ptoAvailable,
      sickLeaveBalance, sickLeaveUsed, sickUsedImport: c.sickUsedImport, sickLeaveAvailable,
      birthdayLeave:    c.birthdayLeave,
      birthdayLeaveUsed: c.birthdayLeaveUsed,
      advanceSickLeave: c.advanceSickLeave,
      advanceSickLeaveUsed: c.advanceSickLeaveUsed,
      specialLeaveCredits,
      specialLeaveUsed,
      specialLeaveAvailable,
      specialLeaveGrantedAt: c.specialLeaveGrantedAt,
      specialLeaveGrants: rowGrants,
      outstandingLeaveBalance: c.outstandingLeaveBalance,
      outstandingMedicalBalance: c.outstandingMedicalBalance,
      unusedSickLeave:  calculateUnusedSickLeave(c.hireDate, sickLeaveUsed, cutoff),
      latestRequest:    latestByEmail[c.email] ?? null,
    };
  }), [contractors, latestByEmail, grantsByEmail, cutoff]);

  const countryOptions    = Array.from(new Set(rows.map((r) => r.country))).sort();
  const departmentOptions = Array.from(new Set(rows.map((r) => r.department || "Unassigned"))).sort();
  const filtersActive = nameSearch.trim() !== "" || countryFilter !== "All Countries" || departmentFilter !== "All Assigned Teams" || payCategoryFilter !== "All Categories" || reviewStatusFilter !== "All Statuses";

  const filteredRows = rows.filter((r) => {
    const nm = !nameSearch.trim() || r.fullName.toLowerCase().includes(nameSearch.trim().toLowerCase());
    const cm = countryFilter    === "All Countries"   || r.country === countryFilter;
    const dm = departmentFilter === "All Assigned Teams" || (r.department || "Unassigned") === departmentFilter;
    const pm = payCategoryFilter === "All Categories" || r.payCategory === payCategoryFilter;
    const sm = reviewStatusFilter === "All Statuses"  || r.latestRequest?.status === reviewStatusFilter;
    return nm && cm && dm && pm && sm;
  });

  const pendingCount  = leaveRequests.filter((r) => r.status === "Pending").length;
  const approvedCount = leaveRequests.filter((r) => r.status === "Approved").length;
  const rejectedCount = leaveRequests.filter((r) => r.status === "Rejected").length;

  const selectedRow = rows.find((r) => r.id === selectedRowId) ?? null;

  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId && rows.length > 0 && !selectedRowId) {
      setSelectedRowId(openId);
      setModalTab("info");
      router.replace("/admin/time-off");
    }
  }, [searchParams, rows, selectedRowId, router]);

  // Deep link from Attendance Review's "Open in Time Away Management"
  // shortcut — resolves by email since Attendance only knows the contractor's
  // email, not their contractor_profiles uid.
  useEffect(() => {
    const openEmail = searchParams.get("openEmail");
    if (openEmail && rows.length > 0 && !selectedRowId) {
      const match = rows.find((r) => r.email.toLowerCase() === openEmail.toLowerCase());
      if (match) {
        setSelectedRowId(match.id);
        setModalTab("info");
      }
      router.replace("/admin/time-off");
    }
  }, [searchParams, rows, selectedRowId, router]);

  // Deep link from the Notification bell's Pending Approvals section header
  // (see NotificationBell.tsx) — pre-filters the review-status dropdown.
  useEffect(() => {
    const status = searchParams.get("status");
    if (status) {
      setReviewStatusFilter(status);
      router.replace("/admin/time-off");
    }
  }, [searchParams, router]);

  const isIndia = countryFilter === "India";

  const COLS = [
    "Contractor", "Country", "Assigned Team", "Engagement Start Date",
    // The two "Used Import" columns are hidden from the table — the imported
    // baseline still drives the Used figures (see the row build above) and is
    // surfaced/clearable from the Used cells themselves. Both values remain in
    // the CSV export.
    ...(!isIndia ? ["PTO Accrual", "PTO Used", "PTO Accrual Available"] : []),
    "Medical Unavailability Accrual", "Medical Unavailability Used", "Medical Unavailability Accrual Available",
    ...(!isIndia ? ["Advance PTO/Birthday Leave"] : []),
    "Advance Medical Unavailability", "Status", "Action",
  ];

  function exportCSV() {
    const headers = [
      "Name", "Country", "Assigned Team", "Engagement Start Date",
      "PTO Accrual (h)", "PTO Used (h)", "PTO Used Import (h)", "PTO Available (h)",
      "Medical Unavailability Accrual (h)", "Medical Unavailability Used (h)", "Medical Unavailability Used Import (h)", "Medical Unavailability Available (h)",
      "Advance PTO/Birthday Leave (h)", "Advance Medical Unavailability (h)",
      "Special Leave Credits (h)", "Special Leave Used (h)", "Special Leave Available (h)", "Status",
    ];
    const csvRows = [
      headers.join(","),
      ...filteredRows.map((r) =>
        [
          `"${r.fullName}"`, `"${r.country}"`, `"${r.department || "Unassigned"}"`, r.hireDate,
          r.ptoBalance, r.ptoUsed, r.ptoUsedImport, r.ptoAvailable,
          r.sickLeaveBalance, r.sickLeaveUsed, r.sickUsedImport, r.sickLeaveAvailable,
          r.birthdayLeave, r.advanceSickLeave,
          r.specialLeaveCredits, r.specialLeaveUsed, r.specialLeaveAvailable,
          `"${r.latestRequest?.status ?? "No Request"}"`,
        ].join(",")
      ),
    ];
    // Leading BOM — without it, Excel misreads the UTF-8 file as its default
    // codepage and garbles anything beyond plain ASCII (accented names, etc.).
    const csvContent = String.fromCharCode(0xFEFF) + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `time-off-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-full overflow-x-hidden">

      {/* ── Detail Modal ── */}
      {selectedRow && (() => {
        const currentStatus = selectedRow.latestRequest?.status as RequestDecision | undefined;
        const reviewStatus: RequestDecision | "-" = currentStatus ?? "-";
        const isRowIndia = selectedRow.country === "India";

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedRowId(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">

              {/* Header */}
              <div className="px-6 py-5 bg-linear-to-r from-[#003527] to-[#006b5f] flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`size-12 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor(selectedRow.id)}`}>
                    {avatarInitials(selectedRow.fullName)}
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">Contractor Time Away – Advance Leave Request Details</p>
                    <h3 className="text-lg font-bold text-white mt-0.5">{selectedRow.fullName}</h3>
                    <p className="text-sm text-white/60 mt-0.5">{selectedRow.department || "—"}{selectedRow.payCategory ? `/${selectedRow.payCategory}` : ""}</p>
                    <p className="text-xs text-white/50 mt-0.5">{selectedRow.email || "—"}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {selectedRow.email && (
                    <>
                      <button
                        onClick={() => router.push(`/admin/attendance?openEmail=${encodeURIComponent(selectedRow.email)}`)}
                        className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        aria-label="Open in Attendance"
                        title="Open in Attendance"
                      >
                        <LuFingerprint size={18} strokeWidth={2} />
                      </button>
                      <button
                        onClick={() => router.push(`/admin/payroll?openEmail=${encodeURIComponent(selectedRow.email)}`)}
                        className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        aria-label="Open in Payroll"
                        title="Open in Payroll"
                      >
                        <LuBanknote size={18} strokeWidth={2} />
                      </button>
                    </>
                  )}
                  <button onClick={() => setSelectedRowId(null)} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                    <LuX size={18} strokeWidth={2} />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-100 px-6">
                {([
                  { key: "info",     label: "Contractor Time Away Detail", icon: <LuEye size={13} /> },
                  { key: "details",  label: "Advance Leave Request",      icon: <LuCalendarPlus size={13} /> },
                  { key: "special",  label: "Special Leave Credits",      icon: <LuGift size={13} /> },
                  { key: "override", label: "Leave Override",             icon: <LuSlidersHorizontal size={13} /> },
                ] as const).map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => setModalTab(key)}
                    className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                      modalTab === key
                        ? "border-[#003527] text-[#003527]"
                        : "border-transparent text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {icon}{label}
                  </button>
                ))}
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                {modalTab === "info" ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ["Engagement Start Date", fmtDate(selectedRow.hireDate)],
                        ["Status Request", selectedRow.latestRequest?.type ?? "—"],
                        ["Request Days",   selectedRow.latestRequest ? (selectedRow.latestRequest.type.endsWith("Half Day") ? "Half day" : `${selectedRow.latestRequest.durationDays} day${selectedRow.latestRequest.durationDays !== 1 ? "s" : ""}`) : "—"],
                        ["Review Status",  reviewStatus === "-" ? "—" : reviewStatus],
                        ["Request Reason", selectedRow.latestRequest?.reason ?? "—"],
                      ] as [string, string][]).map(([label, value]) => (
                        <div key={label} className={`bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 ${label === "Request Reason" ? "col-span-2" : ""}`}>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
                          <p className="text-sm font-medium text-slate-700 mt-0.5 break-words">{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* PTO / Sick Leave balance cards — PTO hidden for India */}
                    <div className={`grid gap-3 ${isRowIndia ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                      {!isRowIndia && (
                        <TimeOffBalanceCard
                          icon={<LuCalendarDays size={18} strokeWidth={1.75} />}
                          title="PTO Balance"
                          tone={selectedRow.ptoAvailable < 0 ? "red" : "teal"}
                          accrued={selectedRow.ptoBalance}
                          used={selectedRow.ptoUsed}
                          available={selectedRow.ptoAvailable}
                          outstandingBalance={selectedRow.outstandingLeaveBalance}
                        />
                      )}
                      <TimeOffBalanceCard
                        icon={<LuShieldCheck size={18} strokeWidth={1.75} />}
                        title="Medical Unavailability Balance"
                        tone={selectedRow.sickLeaveAvailable < 0 ? "red" : "orange"}
                        accrued={selectedRow.sickLeaveBalance}
                        used={selectedRow.sickLeaveUsed}
                        available={selectedRow.sickLeaveAvailable}
                        outstandingBalance={selectedRow.outstandingMedicalBalance}
                      />
                    </div>

                    {/* Current review status + eye icon to go to full page */}
                    <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Current Review Status</p>
                        {reviewStatus === "-" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">No request</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${REVIEW_BADGE[reviewStatus]}`}>
                            {REVIEW_ICON[reviewStatus]}
                            {reviewStatus}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => router.push(`/admin/time-off/${selectedRow.id}`)}
                        title="View all requests"
                        className="p-1 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        <LuEye size={24} className="text-slate-300 hover:text-[#003527]" />
                      </button>
                    </div>
                  </div>

                ) : modalTab === "details" ? (() => {
                  // Advance leave is available per-type, purely on current available
                  // balance — not on tenure. A brand-new hire and a long-tenured
                  // contractor who has simply run low both qualify the same way.
                  // Advance PTO/Birthday Leave is one-time-use only, though: once any
                  // of it has actually been drawn on (birthdayLeaveUsed > 0), granting
                  // it again is disabled until it's reset back to 0 (e.g. via Reset PTO
                  // Used or the annual cutoff reset). Advance Medical has no such limit.
                  const ptoAdvanceEligible  = !isRowIndia && selectedRow.ptoAvailable < 8 && selectedRow.birthdayLeaveUsed === 0;
                  const sickAdvanceEligible = selectedRow.sickLeaveAvailable < 8;
                  const advanceEligible = ptoAdvanceEligible || sickAdvanceEligible;
                  const eligibleLeaveTypes = [
                    ...(sickAdvanceEligible ? ["Advance Sick Leave"] as const : []),
                    ...(ptoAdvanceEligible ? ["Advance PTO/Birthday Leave"] as const : []),
                  ];
                  // Falls back to whichever type is actually eligible if the
                  // dropdown's stored selection no longer qualifies (e.g. PTO
                  // balance recovered above 8h since it was last picked).
                  const effectiveLeaveType = eligibleLeaveTypes.includes(editLeaveType) ? editLeaveType : eligibleLeaveTypes[0];
                  const isPto = effectiveLeaveType === "Advance PTO/Birthday Leave";

                  async function applyAdvanceGrant() {
                    if (!selectedRow) return;
                    const hoursToAdd = parseFloat(editHours) || 0;
                    if (hoursToAdd <= 0) return;
                    const newBirthday    = isPto ? selectedRow.birthdayLeave + hoursToAdd : selectedRow.birthdayLeave;
                    const newAdvanceSick = isPto ? selectedRow.advanceSickLeave : selectedRow.advanceSickLeave + hoursToAdd;
                    await updateTimeOffUsage(selectedRow.id, { birthdayLeave: newBirthday, advanceSickLeave: newAdvanceSick });
                    setContractors((prev) => prev.map((c) =>
                      c.uid === selectedRow.id
                        ? { ...c, birthdayLeave: newBirthday, advanceSickLeave: newAdvanceSick }
                        : c
                    ));
                    setEditHours("");
                    toast.success(`${hoursToAdd}h of ${isPto ? "Advance PTO/Birthday Leave" : "Advance Medical Unavailability"} granted.`);
                  }

                  function startEditAdvanceBalance() {
                    if (!selectedRow) return;
                    setEditAdvancePtoBalance(String(selectedRow.birthdayLeave));
                    setEditAdvancePtoUsed(String(selectedRow.birthdayLeaveUsed));
                    setEditAdvanceSickBalance(String(selectedRow.advanceSickLeave));
                    setEditAdvanceSickUsed(String(selectedRow.advanceSickLeaveUsed));
                    setIsEditingAdvanceBalance(true);
                  }

                  // Directly sets Time/Used to the entered values (unlike the Grant
                  // flow above, which only ever adds on top) — for correcting a
                  // wrong grant or clearing a contractor's advance balance outright.
                  async function saveAdvanceBalanceEdit() {
                    if (!selectedRow) return;
                    const newBirthdayLeave       = Math.max(0, parseFloat(editAdvancePtoBalance)  || 0);
                    const newBirthdayLeaveUsed   = Math.max(0, parseFloat(editAdvancePtoUsed)      || 0);
                    const newAdvanceSickLeave    = Math.max(0, parseFloat(editAdvanceSickBalance)  || 0);
                    const newAdvanceSickLeaveUsed = Math.max(0, parseFloat(editAdvanceSickUsed)    || 0);
                    await updateTimeOffUsage(selectedRow.id, {
                      birthdayLeave: newBirthdayLeave, birthdayLeaveUsed: newBirthdayLeaveUsed,
                      advanceSickLeave: newAdvanceSickLeave, advanceSickLeaveUsed: newAdvanceSickLeaveUsed,
                    });
                    setContractors((prev) => prev.map((c) =>
                      c.uid === selectedRow.id
                        ? {
                            ...c,
                            birthdayLeave: newBirthdayLeave, birthdayLeaveUsed: newBirthdayLeaveUsed,
                            advanceSickLeave: newAdvanceSickLeave, advanceSickLeaveUsed: newAdvanceSickLeaveUsed,
                          }
                        : c
                    ));
                    setIsEditingAdvanceBalance(false);
                  }

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Balance</p>
                        {!isEditingAdvanceBalance && (
                          <button
                            onClick={startEditAdvanceBalance}
                            className="flex items-center gap-1 text-xs font-semibold text-pink-600 hover:text-pink-800 transition-colors"
                          >
                            <LuPencil size={12} strokeWidth={2} /> Edit
                          </button>
                        )}
                      </div>
                      {isEditingAdvanceBalance ? (
                        <div className="space-y-3">
                          {!isRowIndia && (
                            <div>
                              <p className="text-[10px] font-semibold text-pink-600 uppercase tracking-wider mb-1.5">Advance PTO/Birthday Leave</p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Time</p>
                                  <input type="number" min="0" step="0.01" value={editAdvancePtoBalance} onChange={(e) => setEditAdvancePtoBalance(e.target.value)}
                                    className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                                </div>
                                <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Used</p>
                                  <input type="number" min="0" step="0.01" value={editAdvancePtoUsed} onChange={(e) => setEditAdvancePtoUsed(e.target.value)}
                                    className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                                </div>
                                <div className="rounded-xl border border-pink-100 bg-pink-50 px-3 py-2.5">
                                  <p className="text-[10px] font-semibold text-pink-700 uppercase tracking-wider">Available</p>
                                  <p className="text-lg font-bold text-pink-700 mt-0.5 tabular-nums leading-9">
                                    {fmtBalance(Math.max(0, (parseFloat(editAdvancePtoBalance) || 0) - (parseFloat(editAdvancePtoUsed) || 0)))}h
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                          <div>
                            <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-1.5">Advance Medical Unavailability</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Time</p>
                                <input type="number" min="0" step="0.01" value={editAdvanceSickBalance} onChange={(e) => setEditAdvanceSickBalance(e.target.value)}
                                  className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                              </div>
                              <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Used</p>
                                <input type="number" min="0" step="0.01" value={editAdvanceSickUsed} onChange={(e) => setEditAdvanceSickUsed(e.target.value)}
                                  className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                              </div>
                              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5">
                                <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">Available</p>
                                <p className="text-lg font-bold text-blue-700 mt-0.5 tabular-nums leading-9">
                                  {fmtBalance(Math.max(0, (parseFloat(editAdvanceSickBalance) || 0) - (parseFloat(editAdvanceSickUsed) || 0)))}h
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setIsEditingAdvanceBalance(false)}
                              className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveAdvanceBalanceEdit}
                              className="flex-1 py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                              <LuCircleCheck size={15} strokeWidth={2} /> Save Changes
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={`grid ${isRowIndia ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"} gap-3`}>
                          {!isRowIndia && (
                            <TimeOffBalanceCard
                              icon={<LuCalendarPlus size={18} strokeWidth={1.75} />}
                              title="Advance PTO/Birthday Leave"
                              tone="pink"
                              accruedLabel="Time"
                              accrued={selectedRow.birthdayLeave}
                              used={selectedRow.birthdayLeaveUsed}
                              available={Math.max(selectedRow.birthdayLeave - selectedRow.birthdayLeaveUsed, 0)}
                            />
                          )}
                          <TimeOffBalanceCard
                            icon={<LuShieldCheck size={18} strokeWidth={1.75} />}
                            title="Advance Medical Unavailability"
                            tone="blue"
                            accruedLabel="Time"
                            accrued={selectedRow.advanceSickLeave}
                            used={selectedRow.advanceSickLeaveUsed}
                            available={Math.max(selectedRow.advanceSickLeave - selectedRow.advanceSickLeaveUsed, 0)}
                          />
                        </div>
                      )}

                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                          <LuCalendarPlus size={13} /> Grant Advance Leave
                        </p>
                        {!advanceEligible ? (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-start gap-3">
                            <LuCalendarDays size={16} className="text-slate-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-slate-500 leading-relaxed">
                              Advance leave becomes available once a contractor&apos;s available PTO or Medical Unavailability balance drops <strong>below 8 hours</strong>. This contractor currently has 8+ hours available in {isRowIndia ? "Medical Unavailability" : "both PTO and Medical Unavailability"}, so advance leave isn&apos;t needed.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs text-slate-500 leading-relaxed mb-1">
                              Grants extra advance leave hours ahead of accrual for a contractor running low on PTO or Medical Unavailability — repaid automatically from future accrual.
                            </p>
                            <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Advance Leave Type</p>
                              <select
                                value={effectiveLeaveType}
                                onChange={(e) => { setEditLeaveType(e.target.value as typeof editLeaveType); setEditHours(""); }}
                                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                              >
                                {sickAdvanceEligible && <option value="Advance Sick Leave">Advance Medical Unavailability</option>}
                                {ptoAdvanceEligible && <option value="Advance PTO/Birthday Leave">Advance PTO/Birthday Leave</option>}
                              </select>
                            </div>
                            <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Hours to Grant <span className="text-red-400">*</span></p>
                              <input type="number" min="1" value={editHours} onChange={(e) => setEditHours(e.target.value)} placeholder="Enter hours e.g. 8"
                                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                            </div>
                            <button onClick={applyAdvanceGrant} disabled={!editHours || parseFloat(editHours) <= 0}
                              className="w-full py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                              <LuCircleCheck size={15} strokeWidth={2} /> Apply Advance Leave
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })() : modalTab === "override" ? (() => {
                  // Actually creates the override — split out from the validation/
                  // duplicate-check above it so the "Apply Anyway" button on the
                  // duplicate-warning prompt can call straight through to it.
                  async function submitOverride() {
                    if (!selectedRow) return;
                    setOverrideError("");
                    setOverrideSubmitting(true);
                    const result = await createLeaveOverride({
                      email: selectedRow.email,
                      // Only reached once handleOverrideSubmit has already routed
                      // the two Advance types to submitAdvanceOverride instead.
                      type: overrideType as "PTO" | "PTO Half Day" | "Sick Leave" | "Sick Leave Half Day" | "Unpaid Leave" | "Special Leave",
                      startDate: overrideStartDate,
                      endDate: overrideEndDate,
                      reason: overrideReason,
                    });
                    setOverrideSubmitting(false);
                    if (!result.ok || !result.request) {
                      setOverrideError(result.error ?? "Failed to create override.");
                      return;
                    }
                    const req = result.request;
                    setContractors((prev) => prev.map((c) =>
                      c.uid === selectedRow.id
                        ? {
                            ...c,
                            ptoUsed: c.ptoUsed + req.ptoUsedHours,
                            sickLeaveUsed: c.sickLeaveUsed + req.sickLeaveUsedHours,
                            specialLeaveUsed: c.specialLeaveUsed + req.specialLeaveUsedHours,
                          }
                        : c
                    ));
                    setLeaveRequests((prev) => [req, ...prev]);
                    // Hourly/Fixed-Ind Special Leave can span multiple grants —
                    // cheaper and more reliable to refetch than to reconstruct
                    // the server's FIFO deduction client-side.
                    const overridePayCategory = selectedRow.payCategory.trim().toLowerCase();
                    if (leaveBucketFor(overrideType) === "specialLeave" && (overridePayCategory === "hourly" || overridePayCategory === "fixed-ind")) {
                      fetchAllSpecialLeaveGrantsAdmin().then(setSpecialLeaveGrants);
                    }
                    toast.success("Leave override created and applied.");
                    setOverrideStartDate(""); setOverrideEndDate(""); setOverrideReason("");
                  }

                  // Advance PTO/Birthday Leave and Advance Sick Leave don't draw from
                  // the normal PTO/Sick Leave buckets — they consume the Advance
                  // allotment instead (birthdayLeave/advanceSickLeave), deducted into
                  // birthdayLeaveUsed/advanceSickLeaveUsed rather than the normal
                  // ptoUsed/sickLeaveUsed — so this bypasses the generic bucket logic
                  // below entirely.
                  async function submitAdvanceOverride() {
                    if (!selectedRow) return;
                    const isAdvancePto = overrideType.startsWith("Advance PTO/Birthday Leave");
                    setOverrideError("");
                    setOverrideSubmitting(true);
                    const result = await createAdvanceLeaveOverride({
                      email: selectedRow.email,
                      type: overrideType as "Advance PTO/Birthday Leave" | "Advance Sick Leave" | "Advance PTO/Birthday Leave Half Day" | "Advance Sick Leave Half Day",
                      startDate: overrideStartDate,
                      endDate: overrideEndDate,
                      reason: overrideReason,
                    });
                    setOverrideSubmitting(false);
                    if (!result.ok || !result.request) {
                      setOverrideError(result.error ?? "Failed to create override.");
                      return;
                    }
                    const req = result.request;
                    setContractors((prev) => prev.map((c) =>
                      c.uid === selectedRow.id
                        ? isAdvancePto
                          ? { ...c, birthdayLeaveUsed: c.birthdayLeaveUsed + req.sickLeaveUsedHours }
                          : { ...c, advanceSickLeaveUsed: c.advanceSickLeaveUsed + req.sickLeaveUsedHours }
                        : c
                    ));
                    setLeaveRequests((prev) => [req, ...prev]);
                    toast.success("Leave override created and applied.");
                    setOverrideStartDate(""); setOverrideEndDate(""); setOverrideReason("");
                  }

                  async function handleOverrideSubmit(skipDuplicateCheck = false) {
                    if (!selectedRow) return;
                    if (!overrideStartDate || !overrideEndDate) {
                      setOverrideError("Start Date and End Date are required.");
                      return;
                    }
                    if (new Date(overrideEndDate) < new Date(overrideStartDate)) {
                      setOverrideError("End Date must be on or after Start Date.");
                      return;
                    }

                    if (overrideType.startsWith("Advance PTO/Birthday Leave") || overrideType.startsWith("Advance Sick Leave")) {
                      const isAdvancePto = overrideType.startsWith("Advance PTO/Birthday Leave");
                      // Available (balance - already used), not the raw balance —
                      // the balance itself never shrinks on its own, only Used grows.
                      const available = isAdvancePto
                        ? Math.max(selectedRow.birthdayLeave - selectedRow.birthdayLeaveUsed, 0)
                        : Math.max(selectedRow.advanceSickLeave - selectedRow.advanceSickLeaveUsed, 0);
                      // Deduction is capped to whatever's left (see
                      // createAdvanceLeaveOverride) rather than requiring a full 8h
                      // every time — only block once there's nothing left at all.
                      if (available <= 0) {
                        setOverrideBlocked(`${leaveTypeDisplayLabel(overrideType)} has no balance remaining for this override.`);
                        return;
                      }
                      await submitAdvanceOverride();
                      return;
                    }

                    const requiredHours = leaveTypeHours(overrideType);
                    const overrideBucket = leaveBucketFor(overrideType);
                    const availableHours =
                      overrideBucket === "pto" ? selectedRow.ptoAvailable :
                      overrideBucket === "specialLeave" ? selectedRow.specialLeaveAvailable :
                      selectedRow.sickLeaveAvailable;
                    if (requiredHours > 0 && availableHours < requiredHours) {
                      const leaveLabel =
                        overrideBucket === "pto" ? "PTO" :
                        overrideBucket === "specialLeave" ? "Special Leave Credits" :
                        "Medical Unavailability";
                      setOverrideBlocked(
                        `${leaveLabel} Available is not enough for this override. Available: ${fmtBalance(availableHours)}h, Required: ${requiredHours}h.`
                      );
                      return;
                    }

                    // Warn (rather than block outright) when this contractor already
                    // has a non-rejected, non-archived PTO/Sick Leave request
                    // overlapping these dates — an admin override for the same days
                    // is very likely a duplicate, but they may still need to apply
                    // it (e.g. correcting a prior entry), so let them confirm
                    // instead of hard-blocking. Rejected/Archived requests never
                    // actually consumed these dates, so they don't count as a conflict.
                    if (!skipDuplicateCheck && (overrideBucket === "pto" || overrideBucket === "sickLeave")) {
                      const conflict = leaveRequests.find((r) =>
                        r.email === selectedRow.email &&
                        r.status !== "Rejected" &&
                        r.status !== "Archived" &&
                        leaveBucketFor(r.type) === overrideBucket &&
                        r.startDate <= overrideEndDate &&
                        r.endDate >= overrideStartDate
                      );
                      if (conflict) {
                        setOverrideDuplicateWarning(
                          `This contractor already has a ${conflict.status.toLowerCase()} ${leaveTypeDisplayLabel(conflict.type)} request from ${fmtDate(conflict.startDate)} to ${fmtDate(conflict.endDate)} that overlaps these dates. Apply this override anyway?`
                        );
                        setConfirmOverrideAnyway(() => () => handleOverrideSubmit(true));
                        return;
                      }
                    }

                    await submitOverride();
                  }

                  // Every date already covered by an existing Pending or Approved
                  // request for this contractor, so the Start/End Date calendars can
                  // red it out. Rejected/Archived requests are excluded — they never
                  // actually consumed these dates, so those dates stay selectable.
                  const requestedDates = new Set<string>();
                  for (const r of leaveRequests) {
                    if (r.email !== selectedRow.email) continue;
                    if (r.status === "Rejected" || r.status === "Archived") continue;
                    const start = parseDate(r.startDate);
                    const end = parseDate(r.endDate);
                    if (!start || !end) continue;
                    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                      requestedDates.add(toDateStr(d));
                    }
                  }

                  return (
                    <div className="space-y-4">
                      <div className={`grid gap-3 ${isRowIndia ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                        {!isRowIndia && (
                          <TimeOffBalanceCard
                            icon={<LuCalendarDays size={18} strokeWidth={1.75} />}
                            title="PTO Balance"
                            tone={selectedRow.ptoAvailable < 0 ? "red" : "teal"}
                            accrued={selectedRow.ptoBalance}
                            used={selectedRow.ptoUsed}
                            available={selectedRow.ptoAvailable}
                            outstandingBalance={selectedRow.outstandingLeaveBalance}
                          />
                        )}
                        <TimeOffBalanceCard
                          icon={<LuShieldCheck size={18} strokeWidth={1.75} />}
                          title="Medical Unavailability Balance"
                          tone={selectedRow.sickLeaveAvailable < 0 ? "red" : "orange"}
                          accrued={selectedRow.sickLeaveBalance}
                          used={selectedRow.sickLeaveUsed}
                          available={selectedRow.sickLeaveAvailable}
                          outstandingBalance={selectedRow.outstandingMedicalBalance}
                        />
                      </div>

                      <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Leave Type</p>
                        <select
                          value={overrideType}
                          onChange={(e) => setOverrideType(e.target.value as typeof OVERRIDE_TYPES[number])}
                          className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        >
                          {OVERRIDE_TYPES.filter((t) => isRowIndia ? !isPtoLeaveType(t) && !t.startsWith("Advance PTO/Birthday Leave") : true)
                            .filter((t) => !t.startsWith("Advance PTO/Birthday Leave") || selectedRow.ptoAvailable < 8)
                            .filter((t) => !t.startsWith("Advance Sick Leave") || selectedRow.sickLeaveAvailable < 8)
                            .map((t) => <option key={t} value={t}>{leaveTypeDisplayLabel(t)}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Start Date</p>
                          <CalendarDateInput
                            value={overrideStartDate}
                            blockedDates={requestedDates}
                            onChange={(newStart) => {
                              setOverrideStartDate(newStart);
                              // Keep an already-picked End Date from silently sitting before the
                              // new Start Date once it's moved later.
                              if (overrideEndDate && overrideEndDate < newStart) setOverrideEndDate(newStart);
                            }}
                          />
                        </div>
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">End Date</p>
                          <CalendarDateInput
                            value={overrideEndDate}
                            minDate={overrideStartDate || undefined}
                            blockedDates={requestedDates}
                            onChange={setOverrideEndDate}
                          />
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Reason for Request</p>
                        <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Enter reason for this leave override..." rows={2}
                          className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
                      </div>
                      {overrideError && <p className="text-xs font-medium text-red-600">{overrideError}</p>}
                      <button onClick={() => handleOverrideSubmit()} disabled={overrideSubmitting || !overrideStartDate || !overrideEndDate}
                        className="w-full py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                        <LuCircleCheck size={15} strokeWidth={2} /> {overrideSubmitting ? "Applying…" : "Apply Leave Override"}
                      </button>
                    </div>
                  );
                })() : modalTab === "special" ? (() => {
                  if (["hourly", "fixed-ind"].includes(selectedRow.payCategory.trim().toLowerCase())) {
                    async function submitAddGrant() {
                      if (!selectedRow) return;
                      const hoursVal = parseFloat(grantHours) || 0;
                      if (hoursVal <= 0) return;
                      setGrantSubmitting(true); setGrantError("");
                      const expirationDays = grantExpirationDays.trim() ? parseInt(grantExpirationDays, 10) : null;
                      const result = await addSpecialLeaveGrant({
                        email: selectedRow.email,
                        hours: hoursVal,
                        grantDate: grantDate || arizonaTodayIso(),
                        note: grantNote,
                        expirationDays,
                      });
                      setGrantSubmitting(false);
                      if (!result.ok || !result.grant) {
                        setGrantError(result.error ?? "Failed to add grant.");
                        return;
                      }
                      setSpecialLeaveGrants((prev) => [result.grant!, ...prev]);
                      setGrantHours(""); setGrantNote(""); setGrantExpirationDays(""); setGrantDate(arizonaTodayIso());
                    }

                    const sortedGrants = [...selectedRow.specialLeaveGrants].sort((a, b) => a.grantDate.localeCompare(b.grantDate));

                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2 rounded-xl border border-purple-100 bg-purple-50/70 px-3 py-2.5">
                          <div className="col-span-3 flex items-center gap-1.5 mb-0.5">
                            <LuGift size={13} strokeWidth={2} className="text-purple-600" />
                            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700">Special Leave Credits</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700/70">Credits</p>
                            <p className="text-sm font-bold tabular-nums text-purple-900">{fmtBalance(selectedRow.specialLeaveCredits)}h</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700/70">Used</p>
                            <p className="text-sm font-bold tabular-nums text-purple-900">{fmtBalance(selectedRow.specialLeaveUsed)}h</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700/70">Available</p>
                            <p className="text-sm font-bold tabular-nums text-purple-900">{fmtBalance(selectedRow.specialLeaveAvailable)}h</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                            <LuGift size={13} /> Add Special Leave Grant
                          </p>
                          <p className="text-xs text-slate-500 leading-relaxed mb-3">
                            Adds a new, independently-tracked grant for this contractor. Oldest grants are drawn from first when a Leave Override of type &ldquo;Special Leave&rdquo; is applied.
                          </p>
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Hours <span className="text-red-400">*</span></p>
                                <input type="number" min="1" value={grantHours} onChange={(e) => setGrantHours(e.target.value)} placeholder="Enter hours e.g. 8"
                                  className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                              </div>
                              <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Grant Date</p>
                                <input type="date" value={grantDate} onChange={(e) => setGrantDate(e.target.value)}
                                  className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                              </div>
                            </div>
                            <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Note</p>
                              <textarea value={grantNote} onChange={(e) => setGrantNote(e.target.value)} placeholder="Enter a note for this grant..." rows={2}
                                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
                            </div>
                            <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Expiration (days)</p>
                              <input type="number" min="1" value={grantExpirationDays} onChange={(e) => setGrantExpirationDays(e.target.value)} placeholder="e.g. 45 — leave blank for never expires"
                                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                            </div>
                            {grantError && <p className="text-xs font-medium text-red-600">{grantError}</p>}
                            <button onClick={submitAddGrant} disabled={grantSubmitting || !grantHours || parseFloat(grantHours) <= 0}
                              className="w-full py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                              {grantSubmitting && <LuLoader size={14} strokeWidth={2} className="animate-spin" />}
                              <LuCircleCheck size={15} strokeWidth={2} /> Add Grant
                            </button>
                          </div>
                        </div>

                        <div>
                          <button
                            onClick={() => setShowGrantsList((v) => !v)}
                            className="w-full flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 hover:text-slate-600 transition-colors"
                          >
                            <span>Grants ({sortedGrants.length})</span>
                            {showGrantsList ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
                          </button>
                          {showGrantsList && (
                            sortedGrants.length === 0 ? (
                              <p className="text-xs text-slate-400">No grants added yet.</p>
                            ) : (
                              <div className="space-y-2 max-h-56 overflow-y-auto">
                                {sortedGrants.map((g) => {
                                  const expired = isSpecialLeaveGrantExpired(g, TODAY);
                                  const remaining = Math.max(0, g.hours - g.hoursUsed);
                                  // A grant fully drawn down (via oldest-first Leave
                                  // Override consumption) but not yet past its own
                                  // expiration date shows as "Used" rather than "Active"
                                  // — it has nothing left, but isn't forfeited/expired either.
                                  const usedUp = !expired && remaining <= 0;
                                  return (
                                    <div key={g.id} className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-slate-700">{fmtDate(g.grantDate)} — {fmtBalance(g.hours)}h</span>
                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${expired ? "bg-slate-200 text-slate-500" : usedUp ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                                          {expired ? "Expired" : usedUp ? "Used" : "Active"}
                                        </span>
                                      </div>
                                      <p className="text-xs text-slate-500 mt-1">
                                        Used {fmtBalance(g.hoursUsed)}h · Remaining {fmtBalance(remaining)}h · Expires {g.expirationDays == null ? "Never" : fmtDate(addDaysIso(g.grantDate, g.expirationDays))}
                                      </p>
                                      {g.note && <p className="text-xs text-slate-400 mt-1 italic" title={g.note}>{g.note}</p>}
                                    </div>
                                  );
                                })}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    );
                  }

                  async function applySpecialGrant() {
                    if (!selectedRow) return;
                    const hoursToAdd = parseFloat(specialHours) || 0;
                    if (hoursToAdd <= 0) return;
                    const newCredits = selectedRow.specialLeaveCredits + hoursToAdd;
                    const isFixedInd = selectedRow.payCategory.trim().toLowerCase() === "fixed-ind";
                    // For Fixed-Ind, the admin-picked date is what the 60-day
                    // expiry (resetSpecialLeaveIfExpired) counts from, so every
                    // new grant restarts the expiry clock from that date.
                    const grantedAt = isFixedInd ? (specialGrantDate || arizonaTodayIso()) : arizonaTodayIso();
                    await updateTimeOffUsage(selectedRow.id, { specialLeaveCredits: newCredits, specialLeaveGrantedAt: grantedAt });
                    setContractors((prev) => prev.map((c) =>
                      c.uid === selectedRow.id ? { ...c, specialLeaveCredits: newCredits, specialLeaveGrantedAt: grantedAt } : c
                    ));
                    setSpecialHours(""); setSpecialReason(""); setSpecialGrantDate(arizonaTodayIso());
                  }

                  function startEditSpecialBalance() {
                    if (!selectedRow) return;
                    setEditSpecialCredits(String(selectedRow.specialLeaveCredits));
                    setEditSpecialUsed(String(selectedRow.specialLeaveUsed));
                    setIsEditingSpecialBalance(true);
                  }

                  // Directly sets Credits/Used to the entered values (unlike the
                  // Grant flow above, which only ever adds on top) — for correcting
                  // a wrong grant or clearing a contractor's balance outright.
                  async function saveSpecialBalanceEdit() {
                    if (!selectedRow) return;
                    const newCredits = Math.max(0, parseFloat(editSpecialCredits) || 0);
                    const newUsed = Math.max(0, parseFloat(editSpecialUsed) || 0);
                    // Setting Credits to a new positive value restarts the
                    // Fixed-Ind 60-day expiry clock, same as a fresh Grant.
                    const grantedAt = newCredits > 0 ? arizonaTodayIso() : selectedRow.specialLeaveGrantedAt;
                    await updateTimeOffUsage(selectedRow.id, { specialLeaveCredits: newCredits, specialLeaveUsed: newUsed, specialLeaveGrantedAt: grantedAt });
                    setContractors((prev) => prev.map((c) =>
                      c.uid === selectedRow.id ? { ...c, specialLeaveCredits: newCredits, specialLeaveUsed: newUsed, specialLeaveGrantedAt: grantedAt } : c
                    ));
                    setIsEditingSpecialBalance(false);
                  }

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Balance</p>
                        {!isEditingSpecialBalance && (
                          <button
                            onClick={startEditSpecialBalance}
                            className="flex items-center gap-1 text-xs font-semibold text-purple-600 hover:text-purple-800 transition-colors"
                          >
                            <LuPencil size={12} strokeWidth={2} /> Edit
                          </button>
                        )}
                      </div>
                      {isEditingSpecialBalance ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Credits</p>
                              <input type="number" min="0" step="0.01" value={editSpecialCredits} onChange={(e) => setEditSpecialCredits(e.target.value)}
                                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                            </div>
                            <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Used</p>
                              <input type="number" min="0" step="0.01" value={editSpecialUsed} onChange={(e) => setEditSpecialUsed(e.target.value)}
                                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                            </div>
                            <div className="rounded-xl border border-purple-100 bg-purple-50 px-3 py-2.5">
                              <p className="text-[10px] font-semibold text-purple-700 uppercase tracking-wider">Available</p>
                              <p className="text-lg font-bold text-purple-700 mt-0.5 tabular-nums leading-9">
                                {fmtBalance(Math.max(0, (parseFloat(editSpecialCredits) || 0) - (parseFloat(editSpecialUsed) || 0)))}h
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setIsEditingSpecialBalance(false)}
                              className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveSpecialBalanceEdit}
                              className="flex-1 py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                              <LuCircleCheck size={15} strokeWidth={2} /> Save Changes
                            </button>
                          </div>
                        </div>
                      ) : (
                        <TimeOffBalanceCard
                          icon={<LuGift size={18} strokeWidth={1.75} />}
                          title="Special Leave Credits"
                          tone="purple"
                          accruedLabel="Credits"
                          accrued={selectedRow.specialLeaveCredits}
                          used={selectedRow.specialLeaveUsed}
                          available={selectedRow.specialLeaveAvailable}
                        />
                      )}

                      {selectedRow.specialLeaveGrantedAt && (
                        <p className="text-xs text-slate-500">
                          Date Added: <span className="font-semibold text-slate-700">{fmtDate(selectedRow.specialLeaveGrantedAt)}</span>
                          {selectedRow.payCategory.trim().toLowerCase() === "fixed-ind" && (
                            <> — <span className="text-purple-700 font-semibold">expires {fmtDate(addDaysIso(selectedRow.specialLeaveGrantedAt, 60))}</span> (Fixed-Ind credits reset to 0 after 60 days)</>
                          )}
                        </p>
                      )}

                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                          <LuGift size={13} /> Grant Special Leave Credits
                        </p>
                        <p className="text-xs text-slate-500 leading-relaxed mb-3">
                          Grants an extra bonus leave balance for this contractor, on top of their regular PTO/Medical Unavailability — grantable at any time. Once granted, it can be drawn against via a Leave Override with type &ldquo;Special Leave&rdquo;.
                        </p>
                        <div className="space-y-2">
                          {selectedRow.payCategory.trim().toLowerCase() === "fixed-ind" && (
                            <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Grant Date — 60-day expiry starts here <span className="text-red-400">*</span></p>
                              <input type="date" value={specialGrantDate} onChange={(e) => setSpecialGrantDate(e.target.value)}
                                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                            </div>
                          )}
                          <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Hours to Grant <span className="text-red-400">*</span></p>
                            <input type="number" min="1" value={specialHours} onChange={(e) => setSpecialHours(e.target.value)} placeholder="Enter hours e.g. 8"
                              className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                          </div>
                          <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Reason</p>
                            <textarea value={specialReason} onChange={(e) => setSpecialReason(e.target.value)} placeholder="Enter reason for this special leave grant..." rows={2}
                              className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
                          </div>
                          <button onClick={applySpecialGrant} disabled={!specialHours || parseFloat(specialHours) <= 0 || (selectedRow.payCategory.trim().toLowerCase() === "fixed-ind" && !specialGrantDate)}
                            className="w-full py-2 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                            <LuCircleCheck size={15} strokeWidth={2} /> Apply Special Leave Credits
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })() : null}
              </div>

              {/* Footer */}
              <div className="shrink-0 px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                <button onClick={() => setSelectedRowId(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Insufficient-balance message box for Leave Override */}
      {overrideBlocked && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOverrideBlocked("")} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <button
              onClick={() => setOverrideBlocked("")}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <LuX size={18} strokeWidth={2} />
            </button>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
                <LuCircleAlert size={20} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#003527]">Insufficient Balance</h3>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{overrideBlocked}</p>
              </div>
            </div>
            <button
              onClick={() => setOverrideBlocked("")}
              className="mt-6 w-full py-2.5 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Duplicate PTO/Sick Leave request warning for Leave Override — a soft
          confirmation (unlike the hard-blocking Insufficient Balance dialog
          above) since an admin may still need to apply it, e.g. to correct
          an existing entry. */}
      {overrideDuplicateWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { setOverrideDuplicateWarning(""); setConfirmOverrideAnyway(null); }}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <button
              onClick={() => { setOverrideDuplicateWarning(""); setConfirmOverrideAnyway(null); }}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <LuX size={18} strokeWidth={2} />
            </button>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                <LuCircleAlert size={20} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#003527]">Possible Duplicate Request</h3>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{overrideDuplicateWarning}</p>
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => { setOverrideDuplicateWarning(""); setConfirmOverrideAnyway(null); }}
                className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const proceed = confirmOverrideAnyway;
                  setOverrideDuplicateWarning("");
                  setConfirmOverrideAnyway(null);
                  proceed?.();
                }}
                className="flex-1 py-2.5 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Apply Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-3 gap-2">
        <div>
          <nav className="flex mb-1">
            <ol className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <li>Management</li>
              <li><LuChevronRight size={14} className="text-slate-400" /></li>
              <li className="text-teal-600">Time Away Management</li>
            </ol>
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden sm:grid size-9 shrink-0 place-items-center rounded-xl bg-[#003527] text-white shadow-sm">
              <LuCalendarDays size={18} strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-[#003527] tracking-tight">Time Away Management</h2>
              <p className="text-xs text-slate-500 mt-0.5">Track PTO and sick leave balances across your contractor workforce.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => setShowProcessTimeOffModal(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <LuLoader size={13} strokeWidth={2} className="animate-spin" /> : <LuListChecks size={13} strokeWidth={2} />}
            Process Time Away
          </button>
          <button
            onClick={() => setShowUsedImportModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#003527] hover:bg-[#064E3B] rounded-lg transition-colors"
          >
            <LuUpload size={13} strokeWidth={2} /> PTO / SICK Used Import
          </button>
        </div>
      </div>

      {showUsedImportModal && (
        <PtoSickUsedImportModal
          onClose={() => setShowUsedImportModal(false)}
          onImported={reloadData}
        />
      )}

      {showProcessTimeOffModal && (
        <ProcessTimeOffModal
          rows={rows}
          onClose={() => setShowProcessTimeOffModal(false)}
          onProcessed={reloadData}
          dueAlert={dueAlert}
          onAlertResolved={() => setDueAlert(null)}
        />
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-3">
        <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm p-2.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Pending</p>
            <p className="text-xl font-black text-amber-600 leading-tight">{pendingCount}</p>
          </div>
          <div className="size-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <LuClock size={14} className="text-amber-600" />
          </div>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm p-2.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Approved</p>
            <p className="text-xl font-black text-emerald-700 leading-tight">{approvedCount}</p>
          </div>
          <div className="size-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
            <LuCircleCheck size={14} className="text-emerald-600" />
          </div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 shadow-sm p-2.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider">Declined</p>
            <p className="text-xl font-black text-red-600 leading-tight">{rejectedCount}</p>
          </div>
          <div className="size-7 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
            <LuCircleX size={14} className="text-red-500" />
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="mb-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-3 items-center">
        <span className="text-sm font-semibold text-slate-500 mr-1">Quick Filters:</span>
        <div className="relative w-full sm:w-64">
          <LuSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            placeholder="Search by name…"
            disabled={loading}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-700 outline-none transition-all hover:border-slate-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60"
          />
          {nameSearch && (
            <button
              onClick={() => setNameSearch("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 grid size-5 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <LuX size={13} />
            </button>
          )}
        </div>
        <select value={payCategoryFilter} onChange={(e) => setPayCategoryFilter(e.target.value)} disabled={loading}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option>All Categories</option>
          {PAY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} disabled={loading}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option>All Countries</option>
          {countryOptions.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} disabled={loading}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option>All Assigned Teams</option>
          {departmentOptions.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={reviewStatusFilter} onChange={(e) => setReviewStatusFilter(e.target.value)} disabled={loading}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="All Statuses">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
        {filtersActive && (
          <button onClick={() => { setNameSearch(""); setCountryFilter("All Countries"); setDepartmentFilter("All Assigned Teams"); setPayCategoryFilter("All Categories"); setReviewStatusFilter("All Statuses"); }}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Clear filters">
            <LuX size={16} strokeWidth={2} />
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <LuShieldCheck size={14} className="text-teal-500" />
            <span>{filteredRows.length} contractors shown</span>
          </div>
          <button onClick={exportCSV} disabled={loading || filteredRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#003527] border border-[#003527]/30 bg-white hover:bg-[#003527] hover:text-white rounded-lg transition-colors disabled:opacity-40">
            <LuDownload size={13} strokeWidth={2} /> Export CSV
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-auto" style={{ scrollbarWidth: "thin", maxHeight: "60vh" }}>
          <table className="w-full text-left" style={{ minWidth: "1840px", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead className="sticky top-0 z-20" style={{ background: "#003527" }}>
              <tr style={{ background: "#003527" }}>
                <th className="px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap sticky left-0 z-20 border-r border-white/20"
                  style={{ minWidth: 210, background: "#003527" }}>Contractor</th>
                {COLS.slice(1, -1).map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap border-r border-white/20">{h}</th>
                ))}
                <th className="px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap sticky right-0 z-20 border-l border-white/20"
                  style={{ background: "#003527" }}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3 sticky left-0 bg-white border-r border-slate-200" style={{ minWidth: 210 }}>
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full bg-slate-100 shrink-0" />
                        <div className="space-y-1.5"><div className="h-3 bg-slate-100 rounded w-28" /><div className="h-2 bg-slate-100 rounded w-20" /></div>
                      </div>
                    </td>
                    {COLS.slice(1, -1).map((h) => (
                      <td key={h} className="px-4 py-3 border-r border-slate-100"><div className="h-3 bg-slate-100 rounded w-16" /></td>
                    ))}
                    <td className="px-4 py-3 sticky right-0 bg-white border-l border-slate-200"><div className="h-3 bg-slate-100 rounded w-12" /></td>
                  </tr>
                ))
              ) : loadError ? (
                <tr><td colSpan={COLS.length} className="px-4 py-16 text-center text-sm text-red-500">{loadError}</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={COLS.length} className="px-4 text-center text-slate-400 text-sm" style={{ height: 200 }}>No contractors match the selected filters.</td></tr>
              ) : filteredRows.map((row) => {
                const latest = row.latestRequest;
                const reviewStatus: RequestDecision | "-" = (latest?.status as RequestDecision) ?? "-";
                return (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-3 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200" style={{ minWidth: 210 }}>
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor(row.id)}`}>
                            {avatarInitials(row.fullName)}
                          </div>
                          {latest?.status === "Pending" && (
                            <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                              <span className="relative inline-flex rounded-full size-2.5 bg-amber-500" />
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#003527] truncate">{row.fullName}</p>
                          <p className="text-xs text-slate-400 truncate">{row.role || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap border-r border-slate-100">{row.country}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-700 whitespace-nowrap border-r border-slate-100">{row.department || "Unassigned"}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap font-mono text-xs border-r border-slate-100">{fmtDate(row.hireDate)}</td>
                    {!isIndia && <>
                      <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500 border-r border-slate-100">
                        {row.country === "India" ? <span className="text-slate-300">—</span> : `${fmtBalance(row.ptoBalance)}h`}
                      </td>
                      <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500 border-r border-slate-100">
                        {row.country === "India" ? <span className="text-slate-300">—</span> : (
                          <div className="flex items-center gap-1.5">
                            <span>{fmtBalance(row.ptoUsed)}h</span>
                            {/* An imported baseline overrides ptoUsed when set, and the
                                Used Import column is hidden — so this is the only place
                                that override stays visible and clearable. */}
                            {row.ptoUsedImport > 0 && (
                              <button
                                type="button"
                                onClick={() => handleClearUsedImport(row, "pto")}
                                disabled={clearingUsedImport?.id === row.id && clearingUsedImport.type === "pto"}
                                title={`Imported baseline of ${fmtBalance(row.ptoUsedImport)}h is overriding PTO Used — clear it`}
                                className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {clearingUsedImport?.id === row.id && clearingUsedImport.type === "pto"
                                  ? <LuLoader size={13} className="animate-spin" />
                                  : <LuTrash2 size={13} strokeWidth={2} />}
                              </button>
                            )}
                          </div>
                        )}
                        {clearImportError?.id === row.id && clearImportError.type === "pto" && (
                          <p className="text-[10px] text-red-500 mt-0.5">{clearImportError.message}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 border-r border-slate-100">
                        {row.country === "India" ? <span className="text-slate-300">—</span> : (
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold tabular-nums ${row.ptoAvailable < 0 ? "text-red-600" : "text-teal-700"}`}>{fmtBalance(row.ptoAvailable)}h</span>
                            <div className="w-12"><BalanceBar used={row.ptoUsed} total={row.ptoBalance} color={row.ptoAvailable < 0 ? "bg-red-500" : "bg-teal-400"} /></div>
                          </div>
                        )}
                      </td>
                    </>}
                    <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500 border-r border-slate-100">{fmtBalance(row.sickLeaveBalance)}h</td>
                    <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500 border-r border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <span>{fmtBalance(row.sickLeaveUsed)}h</span>
                        {/* Same as PTO Used above — the hidden Used Import column's
                            override stays visible and clearable from here. */}
                        {row.sickUsedImport > 0 && (
                          <button
                            type="button"
                            onClick={() => handleClearUsedImport(row, "sick")}
                            disabled={clearingUsedImport?.id === row.id && clearingUsedImport.type === "sick"}
                            title={`Imported baseline of ${fmtBalance(row.sickUsedImport)}h is overriding Medical Unavailability Used — clear it`}
                            className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {clearingUsedImport?.id === row.id && clearingUsedImport.type === "sick"
                              ? <LuLoader size={13} className="animate-spin" />
                              : <LuTrash2 size={13} strokeWidth={2} />}
                          </button>
                        )}
                      </div>
                      {clearImportError?.id === row.id && clearImportError.type === "sick" && (
                        <p className="text-[10px] text-red-500 mt-0.5">{clearImportError.message}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 border-r border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold tabular-nums ${row.sickLeaveAvailable < 0 ? "text-red-600" : "text-orange-600"}`}>{fmtBalance(row.sickLeaveAvailable)}h</span>
                        <div className="w-12"><BalanceBar used={row.sickLeaveUsed} total={row.sickLeaveBalance} color={row.sickLeaveAvailable < 0 ? "bg-red-500" : "bg-orange-400"} /></div>
                      </div>
                    </td>
                    {!isIndia && (
                      <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500 border-r border-slate-100">
                        {row.country === "India" ? <span className="text-slate-300">—</span> : (
                          row.birthdayLeave > 0
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-pink-50 text-pink-700 border border-pink-200">{fmtBalance(row.birthdayLeave)}h</span>
                            : <span className="text-slate-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500 border-r border-slate-100">
                      {row.advanceSickLeave > 0
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">{fmtBalance(row.advanceSickLeave)}h</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    {/* Status */}
                    <td className="px-4 py-2.5 whitespace-nowrap border-r border-slate-100">
                      {latest ? (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          reviewStatus === "Approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          reviewStatus === "Declined" || reviewStatus === "Rejected" ? "bg-red-50 text-red-600 border-red-200" :
                          "bg-amber-50 text-amber-700 border-amber-200"
                        }`}>
                          {reviewStatus === "Approved" ? <LuCircleCheck size={11} /> : reviewStatus === "Pending" ? <LuClock size={11} /> : <LuCircleX size={11} />}
                          {leaveTypeDisplayLabel(latest.type)} · {reviewStatus}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right sticky right-0 z-10 bg-white group-hover:bg-slate-50 border-l border-slate-200">
                      <button
                        onClick={() => { setSelectedRowId(row.id); setModalTab("info"); setEditLeaveType("Advance Sick Leave"); setEditHours(""); const rowIsIndia = countryFromLocation(row.country) === "India" || row.country === "India"; setOverrideType(rowIsIndia ? "Sick Leave" : "PTO"); setOverrideStartDate(""); setOverrideEndDate(""); setOverrideReason(""); setOverrideError(""); setSpecialGrantDate(arizonaTodayIso()); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-[#003527] hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <LuEye size={14} strokeWidth={1.75} /> View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-400 font-medium">{filteredRows.length} of {rows.length} contractors</p>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <LuTrendingUp size={13} className="text-teal-500" />
            Balances calculated from engagement start date
          </div>
        </div>
      </div>
    </div>
  );
}
