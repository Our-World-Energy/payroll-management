"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAdminTheme } from "@/components/AdminThemeContext";
import { LuDownload, LuUpload, LuCircleCheck, LuClock, LuCircleAlert, LuSearch, LuCalendar, LuX, LuRefreshCw, LuEye, LuPencil, LuListChecks, LuBanknote, LuCalendarDays, LuFingerprint } from "react-icons/lu";
import { fetchAllContractors, fetchAllLeaveRequestsAdmin } from "../contractors/actions";
import { fetchHolidays, type Holiday } from "../holidays/actions";
import {
  fetchPayrollAdjustments, savePayrollAdjustment, bulkImportPayrollAdjustments, type AdjustmentField,
  processWeeklyPayroll, fetchProcessedWeeklyPayroll, type ProcessedPayrollRow, type ProcessedSnapshot,
} from "./actions";
import { addDaysIso, sundayOf, recentWeeks, weekLabel, datesBetween, arizonaTodayIso } from "@/lib/weekUtils";
import { payComponentsFor, leaveHoursFor, weeklyRateFrom, hourlyRateFrom } from "@/lib/payrollVoucher";
import { fetchFixedTimeForWeek } from "../attendance/actions";
import { WeekJumpDropdown } from "@/components/WeekJumpDropdown";
import { FilterSelect } from "@/components/FilterSelect";
import { useSalaryAccess, SALARY_MASK, SalaryLockedBanner } from "@/components/SalaryAccessContext";

function formatElapsedSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

type PayrollRow = {
  email: string;
  name: string;
  role: string;
  restDay: string;
  country: string;
  localHoliday: string;
  localHolidayMinutes: number | null;
  totalEvaluatedRegularMinutes: number | null;
  totalRegularOtMinutes: number | null;
  totalRdOtMinutes: number | null;
  totalUsHoMinutes: number | null;
  totalHoOtMinutes: number | null;
  totalTimeOffRequestMinutes: number;
  ptoHours: number;
  /** Paid leave by kind — see leaveHoursFor. Each is its own voucher line. */
  sickHours: number;
  specialHours: number;
  advanceHours: number;
  /** Each paid-leave kind as money, at Rate/hr — its own payroll column. */
  ptoPay: number;
  sickPay: number;
  specialPay: number;
  advancePay: number;
  department: string;
  payCategory: string;
  shiftType: string;
  currency: string;
  hourlyRate: number;
  monthlyRate: number;
  weeklyRate: number;
  actualMinutes: number;
  completionMinutes: number | null;
  hours: number | null;
  /** Pay derived from time alone — the pay components plus PTO pay, before any
   *  Manual Payroll Adjustment. Gross is this plus Bonus/MISC/Retro Pay/REIM. */
  earnings: number | null;
  gross: number | null;
  deductions: number | null;
  net: number | null;
  status: "Reviewed" | "For Review" | "No Activity" | "Processed";
  // True only when status is "Processed" AND something in Contractor
  // Details, Time Away Management, or Attendance has changed since the
  // process_weekly_payroll snapshot was taken — surfaced as an icon next to
  // the name, prompting a Re-Process.
  hasChangedSinceProcessed: boolean;
  // Saved per-day Evaluated Time (not raw Worksnap minutes) — feeds the
  // voucher's Sun→Sat grid only; all other voucher figures are unaffected.
  evaluatedDailyMinutes: Record<string, number>;
  // Saved per-day Regular OT Time, for the voucher Day View grid only. The
  // paid OT total stays totalRegularOtMinutes/regOtHours — this attributes
  // that same OT to the day it was earned and feeds no calculation.
  regularOtDailyMinutes: Record<string, number>;
  // Saved per-day US HO Time, for the voucher Day View grid only. Not part of
  // the snapshot (no column) — the paid total stays totalUsHoMinutes.
  usHolidayDailyMinutes: Record<string, number>;
  bonus: number;
  misc: number;
  retroPay: number;
  reim: number;
  cashAdvance: number;
  hmo: number;
  tax: number;
  /** Fixed-Ind hours-at-percentage entry. Total hours = indHours ×
   *  indPercentage/100; that × hourlyRate is the amount added to Gross. */
  indHours: number;
  indPercentage: number;
  /** The money indHours/indPercentage contributes to Gross, at Rate/hr. */
  indHoursPay: number;
};

// A leave request's hours are a flat per-request amount (not scaled by date
// range), so the week total sums each request overlapping the week once —
// matching the same logic Attendance Review uses for this same total.
function totalTimeOffRequestMinutesFor(
  rangeFrom: string,
  rangeTo: string,
  requests: Array<{ type: string; startDate: string; endDate: string; ptoUsedHours: number; sickLeaveUsedHours: number; specialLeaveUsedHours: number }>
) {
  return requests
    .filter((r) => r.startDate <= rangeTo && r.endDate >= rangeFrom)
    .reduce((sum, r) => sum + (
      r.type.startsWith("PTO") ? r.ptoUsedHours :
      r.type === "Special Leave" ? r.specialLeaveUsedHours :
      r.sickLeaveUsedHours
    ) * 60, 0);
}

function fmtVoucherDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}.${d}.${y.slice(2)}` : iso;
}

const STATUS_STYLES: Record<string, string> = {
  Reviewed:      "bg-emerald-50 text-emerald-700",
  "For Review":  "bg-amber-50 text-amber-700",
  "No Activity": "bg-slate-100 text-slate-500",
  Processed:     "bg-blue-50 text-blue-700",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  Reviewed:      <LuCircleCheck size={13} strokeWidth={2} />,
  "For Review":  <LuClock       size={13} strokeWidth={2} />,
  "No Activity": <LuCircleAlert size={13} strokeWidth={2} />,
  Processed:     <LuListChecks  size={13} strokeWidth={2} />,
};

function countryFromLocation(location: string) {
  const parts = location.split(",");
  return parts[parts.length - 1]?.trim() || "-";
}

function formatHolidayDate(dateIso: string) {
  const [y, m, d] = dateIso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

function formatLocalHolidays(matches: Holiday[]) {
  if (matches.length === 0) return "-";
  return matches.map((h) => `${formatHolidayDate(h.date)}: ${h.name}`).join("; ");
}

function formatMinutesAsHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${String(remaining).padStart(2, "0")}m`;
}

// Tolerates float rounding noise (e.g. computed via a slightly different
// division order) rather than flagging every processed row as "changed".
function numsDiffer(a: number, b: number, epsilon = 0.01) {
  return Math.abs(a - b) > epsilon;
}

/** Fixed-Ind — the pay category the hours-at-percentage entry applies to. */
function isFixedIndCategory(payCategory: string) {
  return payCategory.trim().toLowerCase() === "fixed-ind";
}

// Fixed-Ind hours-at-percentage. The Total the entry window shows is an HOURS
// figure — hours × percentage — and it reaches Gross at the contractor's own
// Rate/hr. Defined once so the window's preview and the payroll row can't
// disagree about the amount.
function fixedIndTotalHours(hours: number, percentage: number) {
  return hours * (percentage / 100);
}

function fixedIndHoursPay(hours: number, percentage: number, hourlyRate: number) {
  return fixedIndTotalHours(hours, percentage) * hourlyRate;
}

/**
 * Rates are shown unrounded, unlike money totals. A rate is multiplied by every
 * hour worked, so presenting it rounded hides the precision the figures were
 * actually calculated from — see calcWeekly/calcHourly in AddContractorModal.
 * 20 is the most Intl allows and exceeds what a double carries, so every
 * available digit is shown.
 */
function fmtRate(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 20 });
}

function fmtMoney(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PayrollPage() {
  const { dark } = useAdminTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Salary gate. The server already returns 0 for every money figure to a
  // locked caller (see payroll/actions.ts); `salaryVisible` only decides
  // whether a cell renders the figure or the mask, and disables the actions
  // that would write money (adjustments, import, process) or export it.
  const { canView: salaryVisible, loading: salaryLoading } = useSalaryAccess();
  const m = (text: string) => (salaryVisible ? text : SALARY_MASK);
  const lockedTitle = salaryVisible ? undefined : "Verify your identity to access salary data";
  const [weeks, setWeeks] = useState<string[]>([]);
  const [week, setWeek] = useState("");
  const [showRangePicker, setShowRangePicker] = useState(false);
  const weekJumpButtonRef = useRef<HTMLButtonElement>(null);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [nameSearch, setNameSearch] = useState("");
  const [payCategoryFilter, setPayCategoryFilter] = useState("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [shiftTypeFilter, setShiftTypeFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"All" | PayrollRow["status"]>("All");
  const [voucherTarget, setVoucherTarget] = useState<PayrollRow | null>(null);
  const [reviewTarget,  setReviewTarget]  = useState<PayrollRow | null>(null);
  const [hoursTarget,   setHoursTarget]   = useState<PayrollRow | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [processedByEmail, setProcessedByEmail] = useState<Record<string, ProcessedSnapshot>>({});

  // Same recent-Sun→Sat-weeks list Attendance Management uses, anchored to
  // the current Arizona week.
  useEffect(() => {
    const list = recentWeeks();
    setWeeks(list);
    setWeek((current) => current || list[0]);
  }, []);

  // Deep link from Attendance Review's "Open in Payroll" shortcut — carries
  // over the week being reviewed there (the voucher is week-scoped), so this
  // overrides the current-week anchor above once the param is present.
  useEffect(() => {
    const weekParam = searchParams.get("week");
    if (weekParam) setWeek(weekParam);
  }, [searchParams]);

  // Resolves by email since Attendance only knows the contractor's email, not
  // their contractor_profiles uid. Waits for rows (for the requested week, see
  // above) to load before it can find a match.
  useEffect(() => {
    const openEmail = searchParams.get("openEmail");
    if (openEmail && rows.length > 0 && !voucherTarget) {
      const match = rows.find((r) => r.email.toLowerCase() === openEmail.toLowerCase());
      if (match) setVoucherTarget(match);
      router.replace("/admin/payroll");
    }
  }, [searchParams, rows, voucherTarget, router]);

  // Keeps an open Payroll Voucher modal in sync with its own week selector:
  // switching weeks from inside the modal changes this page's `week` state,
  // which reloads `rows` for that week — once the new data lands, swap in
  // the matching row so the voucher reflects the newly selected week instead
  // of staying frozen on the week it was opened for.
  useEffect(() => {
    if (!voucherTarget) return;
    const match = rows.find((r) => r.email === voucherTarget.email);
    if (match && match !== voucherTarget) setVoucherTarget(match);
  }, [rows, voucherTarget]);

  const rangeFrom = week;
  const rangeTo = week ? addDaysIso(week, 6) : "";
  const isSelectedWeekEnded = !!rangeTo && arizonaTodayIso() > rangeTo;

  useEffect(() => {
    let isMounted = true;

    async function load() {
      // Wait until we know whether this user is unlocked, and re-fetch when
      // that changes — the server decrypts only for an unlocked caller.
      if (!rangeFrom || salaryLoading) return;
      setIsLoading(true);
      setLoadError("");

      try {
        const [contractors, entriesResult, weekStatusResult, dayStatusResult, holidays, leaveRequests, adjustments, processedSnapshotByEmail, fixedTimeByEmail] = await Promise.all([
          fetchAllContractors({ country: "All Countries", status: "Active", rules: [] }),
          fetch(`/api/worksnap-entries?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`).then((r) => r.json()),
          fetch(`/api/attendance/week-status?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`).then((r) => (r.ok ? r.json() : { weekStatuses: [] })),
          fetch(`/api/attendance/day-status?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`).then((r) => (r.ok ? r.json() : { days: [] })),
          fetchHolidays().catch(() => [] as Holiday[]),
          fetchAllLeaveRequestsAdmin().catch(() => []),
          fetchPayrollAdjustments(rangeFrom).catch(() => []),
          fetchProcessedWeeklyPayroll(rangeFrom).catch(() => ({} as Record<string, ProcessedSnapshot>)),
          fetchFixedTimeForWeek(rangeFrom).catch(() => ({} as Record<string, number>)),
        ]);

        if (!isMounted) return;

        const minutesByEmail = new Map<string, number>();
        for (const e of (entriesResult.entries ?? [])) {
          const email = String(e.email ?? "").trim().toLowerCase();
          const durationMins = (e as { durationMins?: number }).durationMins ?? 0;
          if (!email) continue;
          minutesByEmail.set(email, (minutesByEmail.get(email) ?? 0) + durationMins);
        }

        // Saved per-day Evaluated Time (not raw Worksnap minutes) for the
        // voucher's Sun→Sat grid only — reflects admin review/adjustments.
        // All other payroll figures still come from the week-level totals
        // below (totalEvaluatedRegularMinutes, etc.), unaffected by this.
        const evaluatedDailyMinutesByEmail = new Map<string, Record<string, number>>();
        const regularOtDailyMinutesByEmail = new Map<string, Record<string, number>>();
        const usHolidayDailyMinutesByEmail = new Map<string, Record<string, number>>();
        for (const d of (dayStatusResult.days ?? []) as Array<{ email?: string; date?: string; evaluatedMinutes?: number; regularOtMinutes?: number; holidayMinutes?: number }>) {
          const email = String(d.email ?? "").trim().toLowerCase();
          const date = String(d.date ?? "").slice(0, 10);
          if (!email || !date) continue;
          const days = evaluatedDailyMinutesByEmail.get(email) ?? {};
          days[date] = (days[date] ?? 0) + (d.evaluatedMinutes ?? 0);
          evaluatedDailyMinutesByEmail.set(email, days);
          const otDays = regularOtDailyMinutesByEmail.get(email) ?? {};
          otDays[date] = (otDays[date] ?? 0) + (d.regularOtMinutes ?? 0);
          regularOtDailyMinutesByEmail.set(email, otDays);
          const hoDays = usHolidayDailyMinutesByEmail.get(email) ?? {};
          hoDays[date] = (hoDays[date] ?? 0) + (d.holidayMinutes ?? 0);
          usHolidayDailyMinutesByEmail.set(email, hoDays);
        }

        type SavedWeekStatus = {
          requestStatus: string; completionMinutes: number | null; totalLocalHolidayMinutes: number | null;
          totalEvaluatedRegularMinutes: number | null; totalUsHoMinutes: number | null;
          totalRegularOtMinutes: number | null; totalRdOtMinutes: number | null; totalHoOtMinutes: number | null;
        };
        const weekStatusByEmail = new Map<string, SavedWeekStatus>(
          (weekStatusResult.weekStatuses ?? [])
            .filter((s: { email?: string }) => s.email)
            .map((s: { email: string } & SavedWeekStatus) => [s.email.trim().toLowerCase(), s])
        );

        const leaveRequestsByEmail = new Map<string, typeof leaveRequests>();
        for (const r of leaveRequests) {
          if (r.status !== "Approved") continue;
          const email = r.email.trim().toLowerCase();
          const list = leaveRequestsByEmail.get(email) ?? [];
          list.push(r);
          leaveRequestsByEmail.set(email, list);
        }

        const holidaysInWeek = holidays.filter((h) => h.date.slice(0, 10) >= rangeFrom && h.date.slice(0, 10) <= rangeTo);

        const adjustmentByEmail = new Map(adjustments.map((a) => [a.email.trim().toLowerCase(), a]));

        const nextRows: PayrollRow[] = contractors
          .filter((c) => c.email)
          .map((c) => {
            const email = c.email.trim().toLowerCase();
            const actualMinutes = minutesByEmail.get(email) ?? 0;
            const saved = weekStatusByEmail.get(email);
            const isReviewed = saved?.requestStatus === "APPROVED" && saved.completionMinutes != null;
            // Derived from the monthly rate rather than read from the stored
            // hourlyRate, which older saves wrote rounded to 2dp — so payroll
            // pays from the same unrounded figure Contractor Details shows.
            // Falls back to the stored value when there's no usable monthly rate.
            const monthlyRateNum = parseFloat(c.monthlyRate) || 0;
            const hourlyRate = monthlyRateNum > 0
              ? hourlyRateFrom(monthlyRateNum)
              : (parseFloat(c.hourlyRate) || 0);
            // Fixed-Mex: the admin-entered Regular Time from the "Fixed Time"
            // button on Attendance Management (fixed_time table) is this
            // contractor's Completion Time for the week, taking priority over
            // the normal Worksnap-review-derived value.
            const isFixedMex = (c.payCategory || "").trim().toLowerCase() === "fixed-mex";
            const fixedMinutes = fixedTimeByEmail[email];
            const completionMinutes = isFixedMex && fixedMinutes != null
              ? fixedMinutes
              : (isReviewed ? (saved!.completionMinutes as number) : null);
            const hours = completionMinutes != null ? completionMinutes / 60 : null;
            const country = countryFromLocation(c.location || "");
            const localHoliday = formatLocalHolidays(holidaysInWeek.filter((h) => h.country === country));
            const contractorRequests = leaveRequestsByEmail.get(email) ?? [];
            const totalTimeOffRequestMinutes = totalTimeOffRequestMinutesFor(rangeFrom, rangeTo, contractorRequests);
            // Paid leave, split by kind. Regular Medical Unavailability used to
            // be excluded from pay entirely; it now pays like the rest.
            const leaveHours = leaveHoursFor(rangeFrom, rangeTo, contractorRequests);
            const ptoHours = leaveHours.pto;

            // Earnings and deductions both come straight from this contractor's
            // Manual Payroll Adjustment for the week, rather than a placeholder.
            const adjustment = adjustmentByEmail.get(email);
            const bonus = adjustment?.bonus ?? 0;
            const misc = adjustment?.misc ?? 0;
            const retroPay = adjustment?.retroPay ?? 0;
            const reim = adjustment?.reim ?? 0;
            const cashAdvance = adjustment?.cashAdvance ?? 0;
            const hmo = adjustment?.hmo ?? 0;
            const tax = adjustment?.tax ?? 0;
            const indHours = adjustment?.indHours ?? 0;
            const indPercentage = adjustment?.indPercentage ?? 0;
            // Fixed-Ind hours at a percentage: the Total is an hours figure
            // (hours × percentage), and it reaches Gross at the contractor's own
            // Rate/hr — the same rate every other pay component uses.
            // Gated on the pay category, not just on the stored values: the
            // clock icon is Fixed-Ind-only, but a contractor re-categorised
            // after entering hours would otherwise keep the amount in Gross
            // while the voucher hides the line explaining it.
            const indPay = isFixedIndCategory(c.payCategory || "")
              ? fixedIndHoursPay(indHours, indPercentage, hourlyRate)
              : 0;

            // Gross Pay is the sum of each payroll component calculated independently
            // (its own time total × Hourly Rate × its own multiplier), plus PTO Pay
            // and the Manual Payroll Adjustment earnings — see payComponentsFor —
            // so this always matches the voucher's total exactly.
            const hasGrossInputs = (isFixedMex && fixedMinutes != null) || isReviewed;
            // Earnings is the time-derived half, broken out so the table can show
            // it beside the manual adjustments that make up the rest of Gross.
            const earnings = hasGrossInputs
              ? payComponentsFor(c.payCategory || "", hourlyRate, completionMinutes, {
                  totalEvaluatedRegularMinutes: saved?.totalEvaluatedRegularMinutes ?? null,
                  totalRegularOtMinutes: saved?.totalRegularOtMinutes ?? null,
                  totalRdOtMinutes: saved?.totalRdOtMinutes ?? null,
                  totalUsHoMinutes: saved?.totalUsHoMinutes ?? null,
                  totalHoOtMinutes: saved?.totalHoOtMinutes ?? null,
                  localHolidayMinutes: saved?.totalLocalHolidayMinutes ?? null,
                }).grossPay
              : null;
            // Each paid-leave kind at the contractor's Rate/hr, its own column.
            const ptoPay = leaveHours.pto * hourlyRate;
            const sickPay = leaveHours.sick * hourlyRate;
            const specialPay = leaveHours.special * hourlyRate;
            const advancePay = leaveHours.advance * hourlyRate;
            // Gross is still the sum of every earnings column, so the row reads
            // left to right into it — Earnings now just excludes the leave that
            // the four columns beside it show.
            const gross = earnings != null
              ? earnings + ptoPay + sickPay + specialPay + advancePay
                + bonus + misc + retroPay + reim + indPay
              : null;
            // Tax is no longer part of payroll — it is neither entered nor shown,
            // so Deductions is exactly the two components the table and the
            // voucher list. The column itself is kept on payroll_adjustments for
            // legacy rows (all currently 0) rather than dropped destructively.
            const deductions = gross != null ? cashAdvance + hmo : null;
            const net = gross != null && deductions != null ? gross - deductions : null;

            // Compare the live-computed values against the saved snapshot to
            // catch a Contractor Details / Time Away / Attendance change that
            // happened after this contractor was processed — gross/net/
            // deductions already fold in attendance totals, PTO hours, and
            // hourly rate, so this alone covers changes from all three areas.
            const snapshot = processedSnapshotByEmail[email];
            const hasChangedSinceProcessed = !!snapshot && (
              numsDiffer(snapshot.hourlyRate, hourlyRate) ||
              numsDiffer(snapshot.monthlyRate, parseFloat(c.monthlyRate) || 0) ||
              numsDiffer(snapshot.weeklyRate, parseFloat(c.weeklyRate) || 0) ||
              snapshot.actualMinutes !== actualMinutes ||
              snapshot.completionMinutes !== (isReviewed ? (saved!.completionMinutes as number) : null) ||
              numsDiffer(snapshot.gross, gross ?? 0) ||
              numsDiffer(snapshot.deductions, deductions ?? 0) ||
              numsDiffer(snapshot.net, net ?? 0) ||
              snapshot.department !== (c.department || "-") ||
              snapshot.role !== (c.role || "-") ||
              snapshot.country !== country ||
              snapshot.payCategory !== (c.payCategory || "-") ||
              snapshot.shiftType !== (c.shiftType || "-") ||
              snapshot.currency !== (c.currency || "USD")
            );

            return {
              email,
              name: c.fullName || email,
              role: c.role || "-",
              restDay: c.restDay || "",
              country,
              localHoliday,
              localHolidayMinutes: saved?.totalLocalHolidayMinutes ?? null,
              totalEvaluatedRegularMinutes: saved?.totalEvaluatedRegularMinutes ?? null,
              totalRegularOtMinutes: saved?.totalRegularOtMinutes ?? null,
              totalRdOtMinutes: saved?.totalRdOtMinutes ?? null,
              totalUsHoMinutes: saved?.totalUsHoMinutes ?? null,
              totalHoOtMinutes: saved?.totalHoOtMinutes ?? null,
              totalTimeOffRequestMinutes,
              ptoHours,
              sickHours: leaveHours.sick,
              specialHours: leaveHours.special,
              advanceHours: leaveHours.advance,
              ptoPay,
              sickPay,
              specialPay,
              advancePay,
              department: c.department || "-",
              payCategory: c.payCategory || "-",
              shiftType: c.shiftType || "-",
              currency: c.currency || "USD",
              hourlyRate,
              monthlyRate: monthlyRateNum,
              // Same reasoning as hourlyRate above.
              weeklyRate: monthlyRateNum > 0 ? weeklyRateFrom(monthlyRateNum) : (parseFloat(c.weeklyRate) || 0),
              actualMinutes,
              completionMinutes,
              hours,
              earnings,
              gross,
              deductions,
              net,
              // "Processed" (via the Process Payroll action) takes priority
              // over the raw Reviewed/For Review/No Activity computation —
              // it only reflects whether a process_weekly_payroll snapshot
              // exists for this contractor/week.
              status: processedSnapshotByEmail[email]
                ? "Processed"
                : isReviewed ? "Reviewed" : actualMinutes > 0 ? "For Review" : "No Activity",
              hasChangedSinceProcessed,
              evaluatedDailyMinutes: evaluatedDailyMinutesByEmail.get(email) ?? {},
              regularOtDailyMinutes: regularOtDailyMinutesByEmail.get(email) ?? {},
              usHolidayDailyMinutes: usHolidayDailyMinutesByEmail.get(email) ?? {},
              bonus,
              misc,
              retroPay,
              reim,
              cashAdvance,
              hmo,
              tax,
              indHours,
              indPercentage,
              indHoursPay: indPay,
            };
          });

        setRows(nextRows);
        setProcessedByEmail(processedSnapshotByEmail);
      } catch {
        if (isMounted) {
          setLoadError("Unable to load payroll data.");
          setRows([]);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    load();
    return () => { isMounted = false; };
  }, [rangeFrom, rangeTo, reloadKey, salaryLoading, salaryVisible]);

  // Every filter EXCEPT status. The scorecards count from this, so picking a
  // status narrows the table without flattening the status breakdown above it
  // to a single non-zero card — which is the one moment that breakdown is
  // actually being read.
  const rowsBeforeStatusFilter = rows.filter((r) => {
    const query = nameSearch.trim().toLowerCase();
    const matchesName = !query || r.name.toLowerCase().includes(query) || r.email.includes(query);
    const matchesPayCategory = payCategoryFilter === "All" || r.payCategory === payCategoryFilter;
    const matchesCountry = countryFilter === "All" || r.country === countryFilter;
    const matchesShiftType = shiftTypeFilter === "All" || r.shiftType === shiftTypeFilter;
    const matchesDepartment = departmentFilter === "All" || r.department === departmentFilter;
    return matchesName && matchesPayCategory && matchesCountry && matchesShiftType && matchesDepartment;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const filteredRows = statusFilter === "All"
    ? rowsBeforeStatusFilter
    : rowsBeforeStatusFilter.filter((r) => r.status === statusFilter);

  const payCategoryOptions = Array.from(new Set(rows.map((r) => r.payCategory).filter((c) => c !== "-"))).sort();
  const countryOptions = Array.from(new Set(rows.map((r) => r.country).filter((c) => c !== "-"))).sort();
  const shiftTypeOptions = Array.from(new Set(rows.map((r) => r.shiftType).filter((c) => c !== "-"))).sort();
  const departmentOptions = Array.from(new Set(rows.map((r) => r.department).filter((c) => c !== "-"))).sort();

  function handleExportCSV() {
    const headers = [
      "Name", "Country", "Assigned Team", "Pay Category", "Shift Type", "Local Holiday", "Local HO Time",
      "Total Evaluated Regular Time", "Total US HO Time", "Total Regular OT Time", "Total RD OT Time", "Total HO OT Time", "Total Time Away Request Time",
      "Completion Time", "Currency", "Rate/hr", "Rate", "Earnings", "PTO", "Medical Unavailability", "Special Leave", "Advance Leave", "Bonus", "MISC", "Retro Pay", "REIM", "Gross", "Cash Advance", "HMO", "Deductions", "Net Pay", "Status",
    ];
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    // Plain 2dp, no currency prefix and no thousands separators: currency is
    // its own column now, and "PHP 1,234.56" imports as text, so a
    // spreadsheet can neither sum nor sort the column.
    const decimal = (n: number) => n.toFixed(2);
    const lines = [
      headers.join(","),
      ...filteredRows.map((r) => [
        r.name, r.country, r.department, r.payCategory, r.shiftType, r.localHoliday,
        r.localHolidayMinutes ? formatMinutesAsHours(r.localHolidayMinutes) : "",
        r.totalEvaluatedRegularMinutes ? formatMinutesAsHours(r.totalEvaluatedRegularMinutes) : "",
        r.totalUsHoMinutes ? formatMinutesAsHours(r.totalUsHoMinutes) : "",
        r.totalRegularOtMinutes ? formatMinutesAsHours(r.totalRegularOtMinutes) : "",
        r.totalRdOtMinutes ? formatMinutesAsHours(r.totalRdOtMinutes) : "",
        r.totalHoOtMinutes ? formatMinutesAsHours(r.totalHoOtMinutes) : "",
        r.totalTimeOffRequestMinutes > 0 ? formatMinutesAsHours(r.totalTimeOffRequestMinutes) : "",
        r.completionMinutes != null ? formatMinutesAsHours(r.completionMinutes) : "",
        r.currency,
        `${r.currency} ${fmtRate(r.hourlyRate)}`, fmtRate(r.hourlyRate),
        r.earnings != null ? decimal(r.earnings) : "",
        r.ptoPay ? decimal(r.ptoPay) : "",
        r.sickPay ? decimal(r.sickPay) : "",
        r.specialPay ? decimal(r.specialPay) : "",
        r.advancePay ? decimal(r.advancePay) : "",
        // Blank rather than 0.00 when an adjustment wasn't entered, so a real
        // zero stays distinguishable from "nothing recorded" in a spreadsheet.
        r.bonus ? decimal(r.bonus) : "",
        r.misc ? decimal(r.misc) : "",
        r.retroPay ? decimal(r.retroPay) : "",
        r.reim ? decimal(r.reim) : "",
        r.gross != null ? decimal(r.gross) : "",
        r.cashAdvance ? decimal(r.cashAdvance) : "",
        r.hmo ? decimal(r.hmo) : "",
        // Kept negative — it is a deduction, and the sign is what makes the
        // column reconcile against Gross and Net.
        r.deductions != null ? decimal(-r.deductions) : "",
        r.net != null ? decimal(r.net) : "",
        r.status,
      ].map(escape).join(",")),
    ];
    // Leading BOM — without it, Excel misreads the UTF-8 file as its default
    // codepage and garbles anything beyond plain ASCII (currency symbols,
    // accented names).
    const csvContent = String.fromCharCode(0xFEFF) + lines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll_${rangeFrom || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const forReviewCount   = rowsBeforeStatusFilter.filter((r) => r.status === "For Review").length;
  const reviewedCount    = rowsBeforeStatusFilter.filter((r) => r.status === "Reviewed").length;
  const noActivityCount  = rowsBeforeStatusFilter.filter((r) => r.status === "No Activity").length;
  const processedCount   = rowsBeforeStatusFilter.filter((r) => r.status === "Processed").length;

  const STATS = [
    { label: "For Review",  value: forReviewCount,  color: "text-amber-700",  iconBg: "bg-amber-50",  iconColor: "text-amber-600",  Icon: LuClock       },
    { label: "Reviewed",    value: reviewedCount,   color: "text-emerald-700", iconBg: "bg-emerald-50", iconColor: "text-emerald-600", Icon: LuCircleCheck },
    { label: "No Activity", value: noActivityCount, color: "text-slate-600",  iconBg: "bg-slate-100", iconColor: "text-slate-500",  Icon: LuCircleAlert },
    { label: "Processed",   value: processedCount,  color: "text-blue-700",   iconBg: "bg-blue-50",   iconColor: "text-blue-600",   Icon: LuListChecks  },
  ];

  const filtersActive =
    nameSearch.trim() !== "" ||
    payCategoryFilter !== "All" ||
    countryFilter !== "All" ||
    shiftTypeFilter !== "All" ||
    departmentFilter !== "All" ||
    statusFilter !== "All";

  function clearFilters() {
    setNameSearch("");
    setPayCategoryFilter("All");
    setCountryFilter("All");
    setShiftTypeFilter("All");
    setDepartmentFilter("All");
    setStatusFilter("All");
  }

  async function handleSaveAdjustment(values: {
    bonus: number; misc: number; retroPay: number; reim: number;
    cashAdvance: number; hmo: number; tax: number;
  }) {
    if (!reviewTarget) return { ok: false, error: "No contractor selected." };
    // savePayrollAdjustment writes the whole row, so the Fixed-Ind hours entry
    // is passed through unchanged — otherwise saving here would clear it.
    const result = await savePayrollAdjustment({
      email: reviewTarget.email, weekStart: rangeFrom, ...values,
      indHours: reviewTarget.indHours, indPercentage: reviewTarget.indPercentage,
    });
    if (result.ok) {
      setRows((prev) => prev.map((r) => r.email === reviewTarget.email ? { ...r, ...values } : r));
    }
    return result;
  }

  // Mirror of handleSaveAdjustment for the Fixed-Ind hours window: only the two
  // hours fields change, and every other adjustment on the row is passed through
  // so this can't wipe a Bonus or Cash Advance entered in the other window.
  async function handleSaveIndHours(values: { indHours: number; indPercentage: number }) {
    if (!hoursTarget) return { ok: false, error: "No contractor selected." };
    const result = await savePayrollAdjustment({
      email: hoursTarget.email, weekStart: rangeFrom,
      bonus: hoursTarget.bonus, misc: hoursTarget.misc, retroPay: hoursTarget.retroPay, reim: hoursTarget.reim,
      cashAdvance: hoursTarget.cashAdvance, hmo: hoursTarget.hmo, tax: hoursTarget.tax,
      ...values,
    });
    if (result.ok) {
      // Gross/Deductions/Net are derived in the load effect, so a reload keeps
      // the table honest rather than patching the money here by hand.
      setRows((prev) => prev.map((r) => r.email === hoursTarget.email ? { ...r, ...values } : r));
      setReloadKey((k) => k + 1);
    }
    return result;
  }

  function handleImported(field: AdjustmentField, values: Map<string, number>) {
    setRows((prev) => prev.map((r) => {
      const value = values.get(r.email.trim().toLowerCase());
      return value !== undefined ? { ...r, [field]: value } : r;
    }));
  }

  // Re-fetch from Supabase rather than trust a local mutation, so "Processed"
  // status and the changed-since-processed icon always reflect exactly
  // what's persisted — used by both bulk Process Payroll and the single-
  // contractor Process/Re-Process button on the Voucher.
  function handleProcessed() {
    setReloadKey((key) => key + 1);
  }

  // Same fluid scale as Attendance Management: every clamp() maxes out at its
  // intended desktop size (reached around 1500px) and shrinks from there, so a
  // narrow screen gets a scaled-down copy of this layout rather than a
  // rearranged one. Control height clamp(1.75rem,2.13vw,2rem), control text
  // clamp(0.6875rem,0.87vw,0.8125rem), headings clamp(1rem,1.45vw,1.25rem).
  return (
    <div className="p-[clamp(0.75rem,2.2vw,2rem)] max-w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-[clamp(0.5rem,1vw,0.75rem)] mb-[clamp(0.5rem,1.2vw,1rem)]">
        <div className="flex items-center gap-[clamp(0.5rem,1vw,0.75rem)]">
          <div className="grid size-[clamp(1.75rem,2.4vw,2.25rem)] shrink-0 place-items-center rounded-xl bg-[#003527] text-white shadow-sm">
            <LuBanknote size={18} strokeWidth={2} />
          </div>
          <div>
            <h2 className={`text-[clamp(1rem,1.45vw,1.25rem)] font-bold tracking-tight ${dark ? "text-white" : "text-[#003527]"}`}>Payroll</h2>
            <p className={`text-[clamp(0.6875rem,0.95vw,0.875rem)] mt-0.5 ${dark ? "text-white/60" : "text-slate-600"}`}>
              Pay cycle: <span className={`font-semibold ${dark ? "text-white/80" : "text-slate-600"}`}>{week ? weekLabel(week) : "—"}</span> · based on reviewed Attendance data
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-[clamp(0.375rem,0.8vw,0.75rem)] self-start sm:self-auto">
          <button
            onClick={() => setShowProcessModal(true)}
            disabled={!isSelectedWeekEnded || !salaryVisible}
            title={lockedTitle ?? (!isSelectedWeekEnded ? "Process Payroll is only available once the selected week has ended" : undefined)}
            className="flex items-center justify-center gap-[clamp(0.25rem,0.5vw,0.375rem)] w-[clamp(5.25rem,9.5vw,9rem)] py-[clamp(0.25rem,0.5vw,0.375rem)] bg-blue-600 hover:bg-blue-700 text-white text-[clamp(0.625rem,0.85vw,0.75rem)] font-semibold whitespace-nowrap rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
          >
            <LuListChecks size={14} strokeWidth={2} />
            Process Payroll
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            disabled={!salaryVisible}
            title={lockedTitle}
            className="flex items-center justify-center gap-[clamp(0.25rem,0.5vw,0.375rem)] w-[clamp(10.5rem,13.9vw,13rem)] py-[clamp(0.25rem,0.5vw,0.375rem)] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[clamp(0.625rem,0.85vw,0.75rem)] font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-600"
          >
            <LuUpload size={14} strokeWidth={2} />
            Import Earning/Deduction
          </button>
          <button
            onClick={handleExportCSV}
            disabled={filteredRows.length === 0 || !salaryVisible}
            title={lockedTitle}
            className="flex items-center justify-center gap-[clamp(0.25rem,0.5vw,0.375rem)] w-[clamp(5.25rem,9.5vw,9rem)] py-[clamp(0.25rem,0.5vw,0.375rem)] bg-white border border-slate-200 text-[#003527] rounded-lg text-[clamp(0.625rem,0.85vw,0.75rem)] font-semibold whitespace-nowrap hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LuDownload size={14} strokeWidth={2} />
            Export CSV
          </button>
        </div>
      </div>

      <SalaryLockedBanner dark={dark} what="Rates, earnings, deductions and net pay" />

      {/* Scorecards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-[clamp(0.375rem,0.7vw,0.625rem)] mb-[clamp(0.5rem,0.9vw,0.75rem)]">
        {STATS.map(({ label, value, color, iconBg, iconColor, Icon }) => (
          <div key={label} className={`p-[clamp(0.375rem,0.55vw,0.5rem)] rounded-lg border shadow-sm hover:shadow-md transition-all flex items-center gap-[clamp(0.3125rem,0.55vw,0.5rem)] ${dark ? "bg-[#1c2320] border-white/10 hover:border-white/20" : "bg-white border-slate-200 hover:border-slate-300"}`}>
            <div className={`size-[clamp(1.25rem,1.6vw,1.5rem)] rounded-md flex items-center justify-center shrink-0 ${dark ? "bg-white/8" : iconBg} ${dark ? "text-white/60" : iconColor}`}><Icon size={12} strokeWidth={1.75} /></div>
            {/* Label and figure share one line, so the card is a single row
                tall. The label absorbs any shortfall in width; the figure is
                the point of the card and never truncates. */}
            <p className={`min-w-0 truncate text-[clamp(0.5rem,0.6vw,0.5625rem)] font-bold uppercase tracking-wide ${dark ? "text-white/40" : "text-slate-600"}`}>{label}</p>
            <p className={`shrink-0 text-[clamp(0.6875rem,0.93vw,0.875rem)] font-bold leading-none tabular-nums ${dark ? "text-white/90" : color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-xl border shadow-sm overflow-hidden ${dark ? "bg-[#1c2320] border-white/10" : "bg-white border-slate-200"}`}>
        {/* Toolbar */}
        <div className={`px-[clamp(0.75rem,1.6vw,1.5rem)] py-[clamp(0.5rem,0.9vw,0.75rem)] border-b border-slate-100 flex flex-col gap-[clamp(0.5rem,0.9vw,0.75rem)] ${dark ? "bg-[#1c2320]" : "bg-linear-to-b from-slate-50/80 to-white"}`}>
          {/* Week selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[clamp(0.5rem,0.9vw,0.75rem)]">
            <div className="min-w-0">
              <h3 className={`text-[clamp(1rem,1.45vw,1.25rem)] font-bold tracking-tight ${dark ? "text-white" : "text-[#003527]"}`}>Weekly Payroll</h3>
              {isLoading && (
                <p className={`mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium ${dark ? "text-teal-400" : "text-teal-600"}`}>
                  <LuRefreshCw size={12} className="animate-spin" /> Loading payroll data…
                </p>
              )}
              {!isLoading && loadError && (
                <p className="mt-0.5 text-xs font-medium text-red-600">{loadError}</p>
              )}
            </div>
            <div className={`flex items-center gap-1 rounded-xl border p-[clamp(0.25rem,0.5vw,0.375rem)] shadow-sm w-full sm:w-auto min-w-0 overflow-x-auto ${dark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
              <div className="flex gap-1">
                {weeks.slice(0, 4).map((w) => (
                  <button key={w} onClick={() => setWeek(w)}
                    className={`px-[clamp(0.375rem,0.9vw,0.75rem)] py-[clamp(0.25rem,0.5vw,0.375rem)] text-[clamp(0.625rem,0.8vw,0.75rem)] font-bold rounded-lg whitespace-nowrap transition-all ${week === w ? "bg-[#003527] text-white shadow-sm" : dark ? "text-white/50 hover:text-white hover:bg-white/10" : "text-slate-500 hover:text-[#003527] hover:bg-slate-100"}`}>{weekLabel(w)}</button>
                ))}
              </div>
              <div className={`h-6 w-px mx-0.5 shrink-0 ${dark ? "bg-white/15" : "bg-slate-200"}`} />
              <div className="relative shrink-0">
                <button ref={weekJumpButtonRef} onClick={() => setShowRangePicker((v) => !v)}
                  className={`flex items-center gap-[clamp(0.25rem,0.5vw,0.5rem)] px-[clamp(0.375rem,0.9vw,0.75rem)] py-[clamp(0.25rem,0.5vw,0.375rem)] rounded-lg whitespace-nowrap transition-colors ${showRangePicker ? (dark ? "text-teal-300 bg-white/10" : "text-teal-700 bg-teal-50") : dark ? "text-white/60 hover:text-white hover:bg-white/10" : "text-slate-600 hover:text-teal-700 hover:bg-teal-50"}`}>
                  <LuCalendar size={15} strokeWidth={2} className="shrink-0" /><span className="text-[clamp(0.625rem,0.8vw,0.75rem)] font-bold">Jump to Week</span>
                </button>
                {showRangePicker && <WeekJumpDropdown anchorRef={weekJumpButtonRef} onApply={(d) => setWeek(sundayOf(d))} onClose={() => setShowRangePicker(false)} />}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-[clamp(0.375rem,0.8vw,0.5rem)]">
            <div className="relative w-full sm:w-[clamp(8.5rem,13.9vw,13rem)]">
              <LuSearch size={14} className="absolute left-[clamp(0.4375rem,0.7vw,0.5625rem)] top-1/2 -translate-y-1/2 shrink-0 text-slate-400" />
              <input
                type="text"
                value={nameSearch}
                onChange={(event) => setNameSearch(event.target.value)}
                placeholder="Search by name…"
                className={`h-[clamp(1.75rem,2.13vw,2rem)] w-full rounded-lg border pl-[clamp(1.5rem,1.9vw,1.75rem)] pr-[clamp(1.375rem,1.8vw,1.625rem)] text-[clamp(0.6875rem,0.87vw,0.8125rem)] outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 ${dark ? "bg-white/5 border-white/10 text-white placeholder:text-white/30 hover:border-white/20" : "bg-white border-slate-200 text-slate-800 hover:border-slate-300"}`}
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

            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-[clamp(6rem,10.6vw,10rem)]" value={payCategoryFilter} onChange={setPayCategoryFilter} label="Filter by pay category">
              <option value="All">All Pay Categories</option>
              {payCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </FilterSelect>
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-[clamp(5.5rem,9vw,8.5rem)]" value={countryFilter} onChange={setCountryFilter} label="Filter by country">
              <option value="All">All Countries</option>
              {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </FilterSelect>
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-[clamp(5.5rem,9vw,8.5rem)]" value={shiftTypeFilter} onChange={setShiftTypeFilter} label="Filter by shift type">
              <option value="All">All Shift Types</option>
              {shiftTypeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </FilterSelect>
            {/* Wider than its neighbours on purpose: team names run to 23
                characters ("Supply Chain Operations"), which the 8.5rem the
                other filters use cut off mid-word. */}
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-[clamp(7rem,13.3vw,12.5rem)]" value={departmentFilter} onChange={setDepartmentFilter} label="Filter by assigned team">
              <option value="All">All Assigned Teams</option>
              {departmentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </FilterSelect>
            {/* Fixed options rather than derived from the rows: a status with
                no rows this week still has to be selectable, or it silently
                disappears from the filter exactly when someone wants to
                confirm nothing is sitting in it. */}
            <FilterSelect className="w-[calc(50%-0.25rem)] sm:w-[clamp(6rem,10.6vw,10rem)]" value={statusFilter} onChange={(v) => setStatusFilter(v as "All" | PayrollRow["status"])} label="Filter by status">
              <option value="All">All Statuses</option>
              <option value="For Review">For Review</option>
              <option value="Reviewed">Reviewed</option>
              <option value="Processed">Processed</option>
              <option value="No Activity">No Activity</option>
            </FilterSelect>

            <div className="flex items-center gap-2 ml-auto">
              {filtersActive && (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 h-[clamp(1.75rem,2.13vw,2rem)] px-[clamp(0.375rem,0.7vw,0.625rem)] rounded-lg text-[clamp(0.625rem,0.73vw,0.6875rem)] font-semibold whitespace-nowrap text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LuX size={14} strokeWidth={2.5} /> Clear
                </button>
              )}
              <span className={`inline-flex items-center gap-1 rounded-full px-[clamp(0.4375rem,0.7vw,0.625rem)] py-0.5 text-[clamp(0.625rem,0.73vw,0.6875rem)] font-medium whitespace-nowrap ${dark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-600"}`}>
                <span className={`font-bold ${dark ? "text-white" : "text-[#003527]"}`}>{filteredRows.length}</span> shown
              </span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto max-h-[72vh] md:max-h-[60vh]">
          <table className="w-full text-left text-sm" style={{ minWidth: "2340px", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead className="sticky top-0 z-30">
              <tr className="bg-[#003527]">
                {["Name", "Country", "Assigned Team", "Pay Category", "Shift Type", "Local Holiday", "Local HO Time",
                  "Total Evaluated Regular Time", "Total US HO Time", "Total Regular OT Time", "Total RD OT Time", "Total HO OT Time", "Total Time Away Request Time",
                  "Completion Time", "Rate/hr", "Rate", "Earnings", "PTO", "Medical Unavailability", "Special Leave", "Advance Leave", "Bonus", "MISC", "Retro Pay", "REIM", "Gross", "Cash Advance", "HMO", "Deductions", "Net Pay", "Status", "Action"].map((h, i) => (
                  <th
                    key={h}
                    className={`text-left px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-white uppercase tracking-widest whitespace-nowrap border-r border-white/20 last:border-r-0 overflow-hidden ${
                      h === "Status" ? "text-center" : ""
                    } ${
                      i === 0 ? "sticky left-0 z-20 w-[180px] min-w-[180px] shadow-[1px_0_0_0_#e2e8f0]" : ""
                    } ${h === "Status" ? "sticky right-[132px] z-20 border-l border-white/20" : ""} ${
                      h === "Action" ? "sticky right-0 z-20 border-l border-white/20" : ""
                    }`}
                    style={
                      i === 0 ? { background: "#003527" }
                      : h === "Status" ? { minWidth: 150, width: 150, maxWidth: 150, background: "#003527" }
                      : h === "Action" ? { minWidth: 132, width: 132, maxWidth: 132, background: "#003527" }
                      : undefined
                    }
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={32} className={`px-5 py-10 text-center text-sm ${dark ? "text-white/35" : "text-slate-400"}`}>
                    {isLoading ? "Loading…" : rows.length === 0 ? "No active contractors found." : "No payroll rows match your search."}
                  </td>
                </tr>
              ) : filteredRows.map((r) => (
                <tr key={r.email} className={`group transition-colors ${dark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}>
                  <td className={`sticky left-0 z-10 w-[180px] min-w-[180px] px-4 md:px-6 py-3 md:py-4 font-semibold whitespace-nowrap border-r shadow-[1px_0_0_0_#e2e8f0] ${dark ? "bg-[#1c2320] group-hover:bg-[#222e27] text-white border-white/10" : "bg-white group-hover:bg-slate-50 text-slate-800 border-slate-100"}`}>
                    <span className="inline-flex items-center gap-1.5">
                      {r.name}
                      {r.status === "Processed" && r.hasChangedSinceProcessed && (
                        <LuRefreshCw
                          size={13}
                          strokeWidth={2}
                          className="text-amber-500 shrink-0"
                          title="Contractor Details, Time Away, or Attendance changed since this was processed — Re-Process to refresh it"
                        />
                      )}
                    </span>
                  </td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 whitespace-nowrap border-r ${dark ? "text-white/55 border-white/8" : "text-slate-500 border-slate-100"}`}>{r.country}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 whitespace-nowrap border-r ${dark ? "text-white/55 border-white/8" : "text-slate-500 border-slate-100"}`}>{r.department}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 whitespace-nowrap border-r ${dark ? "text-white/55 border-white/8" : "text-slate-500 border-slate-100"}`}>{r.payCategory}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 whitespace-nowrap border-r ${dark ? "text-white/55 border-white/8" : "text-slate-500 border-slate-100"}`}>{r.shiftType}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 whitespace-nowrap border-r ${dark ? "text-white/55 border-white/8" : "text-slate-500 border-slate-100"}`}>{r.localHoliday}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 tabular-nums whitespace-nowrap border-r ${dark ? "text-white/65 border-white/8" : "text-slate-600 border-slate-100"}`}>{r.localHolidayMinutes ? formatMinutesAsHours(r.localHolidayMinutes) : "—"}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 tabular-nums whitespace-nowrap border-r ${dark ? "text-white/65 border-white/8" : "text-slate-600 border-slate-100"}`}>{r.totalEvaluatedRegularMinutes ? formatMinutesAsHours(r.totalEvaluatedRegularMinutes) : "—"}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 tabular-nums whitespace-nowrap border-r ${dark ? "text-white/65 border-white/8" : "text-slate-600 border-slate-100"}`}>{r.totalUsHoMinutes ? formatMinutesAsHours(r.totalUsHoMinutes) : "—"}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 tabular-nums whitespace-nowrap border-r ${dark ? "text-white/65 border-white/8" : "text-slate-600 border-slate-100"}`}>{r.totalRegularOtMinutes ? formatMinutesAsHours(r.totalRegularOtMinutes) : "—"}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 tabular-nums whitespace-nowrap border-r ${dark ? "text-white/65 border-white/8" : "text-slate-600 border-slate-100"}`}>{r.totalRdOtMinutes ? formatMinutesAsHours(r.totalRdOtMinutes) : "—"}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 tabular-nums whitespace-nowrap border-r ${dark ? "text-white/65 border-white/8" : "text-slate-600 border-slate-100"}`}>{r.totalHoOtMinutes ? formatMinutesAsHours(r.totalHoOtMinutes) : "—"}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 tabular-nums whitespace-nowrap border-r ${dark ? "text-white/65 border-white/8" : "text-slate-600 border-slate-100"}`}>{r.totalTimeOffRequestMinutes > 0 ? formatMinutesAsHours(r.totalTimeOffRequestMinutes) : "—"}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 tabular-nums whitespace-nowrap border-r ${dark ? "text-white/65 border-white/8" : "text-slate-600 border-slate-100"}`}>{r.completionMinutes != null ? formatMinutesAsHours(r.completionMinutes) : "—"}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 tabular-nums whitespace-nowrap border-r ${dark ? "text-white/65 border-white/8" : "text-slate-600 border-slate-100"}`}>{m(`${r.currency} ${fmtRate(r.hourlyRate)}`)}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 tabular-nums whitespace-nowrap border-r ${dark ? "text-white/65 border-white/8" : "text-slate-600 border-slate-100"}`}>{m(fmtRate(r.hourlyRate))}</td>
                  {/* Earnings is the time-derived pay; the four that follow are
                      this week's Manual Payroll Adjustments. Together they make
                      up Gross, so the breakdown reads left to right into it. */}
                  <td className={`px-4 md:px-6 py-3 md:py-4 tabular-nums whitespace-nowrap border-r ${dark ? "text-white/65 border-white/8" : "text-slate-600 border-slate-100"}`}>{m(r.earnings != null ? fmtMoney(r.earnings, r.currency) : "—")}</td>
                  {/* Paid leave by kind. Each is money at Rate/hr; the hours
                      behind it are in the tooltip, since four extra hour columns
                      would double the width for a figure that's rarely read. */}
                  {([
                    ["ptoPay", r.ptoPay, r.ptoHours, "PTO"],
                    ["sickPay", r.sickPay, r.sickHours, "Medical Unavailability"],
                    ["specialPay", r.specialPay, r.specialHours, "Special Leave"],
                    ["advancePay", r.advancePay, r.advanceHours, "Advance Leave"],
                  ] as [string, number, number, string][]).map(([key, amount, hours, label]) => (
                    <td key={key} title={salaryVisible && amount ? `${hours} hrs of ${label} at ${r.currency} ${fmtRate(r.hourlyRate)}/hr` : undefined}
                      className={`px-4 md:px-6 py-3 md:py-4 tabular-nums whitespace-nowrap border-r ${dark ? "border-white/8" : "border-slate-100"} ${
                        amount || !salaryVisible ? (dark ? "text-white/80" : "text-slate-700") : (dark ? "text-white/25" : "text-slate-300")
                      }`}>
                      {m(amount ? fmtMoney(amount, r.currency) : "—")}
                    </td>
                  ))}
                  {([["bonus", r.bonus], ["misc", r.misc], ["retroPay", r.retroPay], ["reim", r.reim]] as [string, number][]).map(([key, amount]) => (
                    <td key={key} className={`px-4 md:px-6 py-3 md:py-4 tabular-nums whitespace-nowrap border-r ${dark ? "border-white/8" : "border-slate-100"} ${
                      amount || !salaryVisible ? (dark ? "text-white/80" : "text-slate-700") : (dark ? "text-white/25" : "text-slate-300")
                    }`}>
                      {m(amount ? fmtMoney(amount, r.currency) : "—")}
                    </td>
                  ))}
                  <td className={`px-4 md:px-6 py-3 md:py-4 font-medium tabular-nums whitespace-nowrap border-r ${dark ? "text-white/80 border-white/8" : "text-slate-700 border-slate-100"}`}>{m(r.gross != null ? fmtMoney(r.gross, r.currency) : "—")}</td>
                  {/* The two deduction components that make up the Deductions
                      total beside them. */}
                  {([["cashAdvance", r.cashAdvance], ["hmo", r.hmo]] as [string, number][]).map(([key, amount]) => (
                    <td key={key} className={`px-4 md:px-6 py-3 md:py-4 tabular-nums whitespace-nowrap border-r ${dark ? "border-white/8" : "border-slate-100"} ${
                      amount ? (dark ? "text-red-400" : "text-red-500") : !salaryVisible ? (dark ? "text-white/80" : "text-slate-700") : (dark ? "text-white/25" : "text-slate-300")
                    }`}>
                      {m(amount ? `−${fmtMoney(amount, r.currency)}` : "—")}
                    </td>
                  ))}
                  <td className={`px-4 md:px-6 py-3 md:py-4 tabular-nums whitespace-nowrap border-r ${dark ? "text-red-400 border-white/8" : "text-red-500 border-slate-100"}`}>{m(r.deductions != null ? `−${fmtMoney(r.deductions, r.currency)}` : "—")}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 font-semibold tabular-nums whitespace-nowrap border-r ${dark ? "text-teal-300 border-white/8" : "text-teal-700 border-slate-100"}`}>{m(r.net != null ? fmtMoney(r.net, r.currency) : "—")}</td>
                  <td
                    className={`text-center sticky right-[132px] z-10 border-l overflow-hidden px-4 md:px-6 py-3 md:py-4 ${dark ? "bg-[#1c2320] group-hover:bg-[#222e27] border-white/10" : "bg-white group-hover:bg-slate-50 border-slate-200"}`}
                    style={{ minWidth: 150, width: 150, maxWidth: 150 }}
                  >
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[r.status]}`}>
                      {STATUS_ICONS[r.status]}
                      {r.status}
                    </span>
                  </td>
                  <td
                    className={`text-left sticky right-0 z-10 border-l overflow-hidden px-4 py-3 md:py-4 ${dark ? "bg-[#1c2320] group-hover:bg-[#222e27] border-white/10" : "bg-white group-hover:bg-slate-50 border-slate-200"}`}
                    style={{ minWidth: 132, width: 132, maxWidth: 132 }}
                  >
                    <div className="flex items-center justify-start gap-3">
                      {/* Every action here reads or writes money, so all three
                          are locked with the figures. */}
                      <button
                        onClick={() => setVoucherTarget(r)}
                        disabled={!salaryVisible}
                        title={lockedTitle ?? "View payroll voucher"}
                        className={`transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${dark ? "text-white/30 hover:text-white" : "text-slate-400 hover:text-[#003527]"}`}
                      >
                        <LuEye size={18} strokeWidth={1.75} />
                      </button>
                      <button
                        onClick={() => setReviewTarget(r)}
                        disabled={!salaryVisible}
                        title={lockedTitle ?? "Review — add Bonus, MISC, Retro Pay, REIM"}
                        className={`transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${dark ? "text-white/30 hover:text-white" : "text-slate-400 hover:text-[#003527]"}`}
                      >
                        <LuPencil size={16} strokeWidth={1.75} />
                      </button>
                      {/* Fixed-Ind only — hours at a percentage, added to Gross
                          at the contractor's Rate/hr. */}
                      {isFixedIndCategory(r.payCategory) && (
                        <button
                          onClick={() => setHoursTarget(r)}
                          disabled={!salaryVisible}
                          title={lockedTitle ?? (r.indHours > 0
                            ? `Hours at percentage — ${r.indHours} hrs x ${r.indPercentage}%`
                            : "Hours at percentage")}
                          className={`transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            r.indHours > 0
                              ? (dark ? "text-teal-300 hover:text-teal-200" : "text-teal-600 hover:text-teal-800")
                              : (dark ? "text-white/30 hover:text-white" : "text-slate-400 hover:text-[#003527]")
                          }`}
                        >
                          <LuClock size={16} strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={`px-4 md:px-5 py-3 border-t text-xs ${dark ? "border-white/10 text-white/35" : "border-slate-100 text-slate-400"}`}>
          {filteredRows.length} of {rows.length} contractors · Week of {week ? weekLabel(week) : "—"}
        </div>
      </div>

      {voucherTarget && (
        <PayrollVoucherModal
          row={voucherTarget}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          processedSnapshot={processedByEmail[voucherTarget.email]}
          onClose={() => setVoucherTarget(null)}
          onProcessed={handleProcessed}
          weeks={weeks}
          week={week}
          onSelectWeek={setWeek}
        />
      )}

      {reviewTarget && (
        <PayrollAdjustmentModal
          row={reviewTarget}
          onSave={handleSaveAdjustment}
          onClose={() => setReviewTarget(null)}
        />
      )}

      {hoursTarget && (
        <FixedIndHoursModal
          row={hoursTarget}
          onSave={handleSaveIndHours}
          onClose={() => setHoursTarget(null)}
        />
      )}

      {showImportModal && (
        <ImportAdjustmentsModal
          weekStart={rangeFrom}
          onClose={() => setShowImportModal(false)}
          onImported={handleImported}
        />
      )}

      {showProcessModal && (
        <ProcessPayrollModal
          rows={rows}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          onClose={() => setShowProcessModal(false)}
          onProcessed={handleProcessed}
        />
      )}
    </div>
  );
}

const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THUR", "FRI", "SAT"];
const REST_DAY_TO_LABEL: Record<string, string> = {
  Sunday: "SUN", Monday: "MON", Tuesday: "TUE", Wednesday: "WED",
  Thursday: "THUR", Friday: "FRI", Saturday: "SAT",
};

function PayrollVoucherModal({
  row, rangeFrom, rangeTo, processedSnapshot, onClose, onProcessed, weeks, week, onSelectWeek,
}: {
  row: PayrollRow;
  rangeFrom: string;
  rangeTo: string;
  processedSnapshot?: ProcessedSnapshot;
  onClose: () => void;
  onProcessed: () => void;
  weeks: string[];
  week: string;
  onSelectWeek: (week: string) => void;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showWeekJump, setShowWeekJump] = useState(false);
  const weekJumpButtonRef = useRef<HTMLButtonElement>(null);

  // Jumps to this same contractor in Time Away Management / Attendance,
  // carrying this voucher's week over to Attendance (which is week-scoped
  // like Payroll) so it opens the matching week's row.
  function goToTimeAway() {
    router.push(`/admin/time-off?openEmail=${encodeURIComponent(row.email)}`);
  }
  function goToAttendance() {
    router.push(`/admin/attendance?openEmail=${encodeURIComponent(row.email)}&week=${rangeFrom}`);
  }

  // Same button either processes this contractor for the first time or
  // re-saves an already-"Processed" one — only the label/wording changes,
  // the save itself is identical (an upsert on email+weekStart).
  const canProcess = row.status === "Reviewed" || row.status === "Processed";
  const isReprocess = row.status === "Processed";
  // Once "Processed", the voucher is a frozen document: every figure below —
  // including Contractor Name and Role — comes straight from the saved
  // process_weekly_payroll snapshot rather than being recomputed from
  // today's live Contractor Details/Time Off/Attendance data (which is
  // exactly what "hasChangedSinceProcessed" would flag as drifted). A
  // contractor renamed or reassigned a new Role after processing won't
  // change what an already-processed voucher shows unless it's re-processed.
  const usingSnapshot = row.status === "Processed" && !!processedSnapshot;

  async function handleProcessClick() {
    setIsSaving(true);
    setSaveError("");
    try {
      const live = payComponentsFor(row.payCategory, row.hourlyRate, row.completionMinutes, {
        totalEvaluatedRegularMinutes: row.totalEvaluatedRegularMinutes,
        totalRegularOtMinutes: row.totalRegularOtMinutes,
        totalRdOtMinutes: row.totalRdOtMinutes,
        totalUsHoMinutes: row.totalUsHoMinutes,
        totalHoOtMinutes: row.totalHoOtMinutes,
        localHolidayMinutes: row.localHolidayMinutes,
      });
      const ptoPay = row.ptoHours * row.hourlyRate;
      const result = await processWeeklyPayroll([{
        email: row.email,
        weekStart: rangeFrom,
        weekEnd: rangeTo,
        name: row.name,
        role: row.role,
        restDay: row.restDay,
        department: row.department,
        country: row.country,
        payCategory: row.payCategory,
        shiftType: row.shiftType,
        currency: row.currency,
        hourlyRate: row.hourlyRate,
        monthlyRate: row.monthlyRate,
        weeklyRate: row.weeklyRate,
        actualMinutes: row.actualMinutes,
        completionMinutes: row.completionMinutes,
        hours: row.hours,
        gross: row.gross ?? 0,
        deductions: row.deductions ?? 0,
        net: row.net ?? 0,
        // Always "Processed": this column records that a snapshot exists, and
        // the contractor portal keys its voucher list off it. Writing
        // row.status stamped a first-time process as "Reviewed" (row.status is
        // only "Processed" once a snapshot is already there), which hid the
        // voucher until the week happened to be processed a second time.
        status: "Processed",
        bonus: row.bonus,
        misc: row.misc,
        retroPay: row.retroPay,
        reim: row.reim,
        indHoursPay: row.indHoursPay,
        cashAdvance: row.cashAdvance,
        hmo: row.hmo,
        tax: row.tax,
        ptoHours: row.ptoHours,
        sickHours: row.sickHours,
        sickPay: row.sickHours * row.hourlyRate,
        specialHours: row.specialHours,
        specialPay: row.specialHours * row.hourlyRate,
        advanceHours: row.advanceHours,
        advancePay: row.advanceHours * row.hourlyRate,
        regHours: live.regHours,
        regOtHours: live.regOtHours,
        rdOtHours: live.rdOtHours,
        usHolidayHours: live.usHolidayHours,
        hoOtHours: live.hoOtHours,
        localHolidayHours: live.localHolidayHours,
        ptoPay,
        regPay: live.regPay,
        regOtPay: live.regOtPay,
        rdOtPay: live.rdOtPay,
        usHolidayPay: live.usHolidayPay,
        hoOtPay: live.hoOtPay,
        localHolidayPay: live.localHolidayPay,
        evaluatedDailyMinutes: row.evaluatedDailyMinutes,
        regularOtDailyMinutes: row.regularOtDailyMinutes,
      }]);
      if (!result.ok) {
        setSaveError(result.failed[0]?.error ?? "Failed to process. Please try again.");
        return;
      }
      toast.success(`${row.name} ${isReprocess ? "re-processed" : "processed"} successfully`);
      onProcessed();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to process. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const weekDates = rangeFrom && rangeTo ? datesBetween(rangeFrom, rangeTo) : [];

  // Every figure the voucher renders — sourced from the frozen snapshot when
  // "Processed", otherwise computed live exactly as before.
  const figures = usingSnapshot
    ? {
        name: processedSnapshot!.name,
        role: processedSnapshot!.role,
        regHours: processedSnapshot!.regHours,
        regOtHours: processedSnapshot!.regOtHours,
        rdOtHours: processedSnapshot!.rdOtHours,
        usHolidayHours: processedSnapshot!.usHolidayHours,
        hoOtHours: processedSnapshot!.hoOtHours,
        localHolidayHours: processedSnapshot!.localHolidayHours,
        regPay: processedSnapshot!.regPay,
        regOtPay: processedSnapshot!.regOtPay,
        rdOtPay: processedSnapshot!.rdOtPay,
        usHolidayPay: processedSnapshot!.usHolidayPay,
        hoOtPay: processedSnapshot!.hoOtPay,
        localHolidayPay: processedSnapshot!.localHolidayPay,
        ptoHours: processedSnapshot!.ptoHours,
        ptoPay: processedSnapshot!.ptoPay,
        sickHours: processedSnapshot!.sickHours,
        sickPay: processedSnapshot!.sickPay,
        specialHours: processedSnapshot!.specialHours,
        specialPay: processedSnapshot!.specialPay,
        advanceHours: processedSnapshot!.advanceHours,
        advancePay: processedSnapshot!.advancePay,
        bonus: processedSnapshot!.bonus,
        misc: processedSnapshot!.misc,
        retroPay: processedSnapshot!.retroPay,
        reim: processedSnapshot!.reim,
        indHoursPay: processedSnapshot!.indHoursPay,
        cashAdvance: processedSnapshot!.cashAdvance,
        hmo: processedSnapshot!.hmo,
        tax: processedSnapshot!.tax,
        grossPay: processedSnapshot!.gross,
        totalDeductions: processedSnapshot!.deductions,
        netPay: processedSnapshot!.net,
        hourlyRate: processedSnapshot!.hourlyRate,
        monthlyRate: processedSnapshot!.monthlyRate,
        weeklyRate: processedSnapshot!.weeklyRate,
        currency: processedSnapshot!.currency,
        restDay: processedSnapshot!.restDay,
        evaluatedDailyMinutes: processedSnapshot!.evaluatedDailyMinutes,
        // Snapshots taken before this map existed hold {}; fall back to the
        // live per-day OT so their Day View still attributes OT to its day.
        regularOtDailyMinutes: Object.keys(processedSnapshot!.regularOtDailyMinutes ?? {}).length > 0
          ? processedSnapshot!.regularOtDailyMinutes
          : row.regularOtDailyMinutes,
        usHolidayDailyMinutes: row.usHolidayDailyMinutes,
      }
    : (() => {
        const live = payComponentsFor(row.payCategory, row.hourlyRate, row.completionMinutes, {
          totalEvaluatedRegularMinutes: row.totalEvaluatedRegularMinutes,
          totalRegularOtMinutes: row.totalRegularOtMinutes,
          totalRdOtMinutes: row.totalRdOtMinutes,
          totalUsHoMinutes: row.totalUsHoMinutes,
          totalHoOtMinutes: row.totalHoOtMinutes,
          localHolidayMinutes: row.localHolidayMinutes,
        });
        const ptoPay = row.ptoHours * row.hourlyRate;
        const sickPay = row.sickHours * row.hourlyRate;
        const specialPay = row.specialHours * row.hourlyRate;
        const advancePay = row.advanceHours * row.hourlyRate;
        // Every earnings line the voucher prints is in this sum, and every
        // deduction line is in totalDeductions below — so Net Pay is exactly
        // what the two lists show, and matches the table's Net Pay column.
        const grossPay = live.grossPay + ptoPay + row.bonus + row.misc + row.retroPay + row.reim + row.indHoursPay
          + sickPay + specialPay + advancePay;
        // Matches the two lines the voucher actually prints — Tax used to be in
        // this sum without appearing in the list, so the total read higher than
        // the deductions shown.
        const totalDeductions = row.cashAdvance + row.hmo;
        return {
          name: row.name,
          role: row.role,
          regHours: live.regHours,
          regOtHours: live.regOtHours,
          rdOtHours: live.rdOtHours,
          usHolidayHours: live.usHolidayHours,
          hoOtHours: live.hoOtHours,
          localHolidayHours: live.localHolidayHours,
          regPay: live.regPay,
          regOtPay: live.regOtPay,
          rdOtPay: live.rdOtPay,
          usHolidayPay: live.usHolidayPay,
          hoOtPay: live.hoOtPay,
          localHolidayPay: live.localHolidayPay,
          ptoHours: row.ptoHours,
          ptoPay,
          sickHours: row.sickHours,
          sickPay,
          specialHours: row.specialHours,
          specialPay,
          advanceHours: row.advanceHours,
          advancePay,
          bonus: row.bonus,
          misc: row.misc,
          retroPay: row.retroPay,
          reim: row.reim,
          indHoursPay: row.indHoursPay,
          cashAdvance: row.cashAdvance,
          hmo: row.hmo,
          tax: row.tax,
          grossPay,
          totalDeductions,
          netPay: grossPay - totalDeductions,
          hourlyRate: row.hourlyRate,
          monthlyRate: row.monthlyRate,
          weeklyRate: row.weeklyRate,
          currency: row.currency,
          restDay: row.restDay,
          evaluatedDailyMinutes: row.evaluatedDailyMinutes,
          regularOtDailyMinutes: row.regularOtDailyMinutes,
          usHolidayDailyMinutes: row.usHolidayDailyMinutes,
        };
      })();

  const restDayLabels = new Set(
    figures.restDay.split(",").map((d) => REST_DAY_TO_LABEL[d.trim()]).filter(Boolean)
  );
  const {
    regHours, regOtHours, rdOtHours, usHolidayHours, hoOtHours, localHolidayHours,
    regPay, regOtPay, rdOtPay, usHolidayPay, hoOtPay, localHolidayPay,
    ptoHours, sickHours, specialHours, advanceHours,
    ptoPay, sickPay, specialPay, advancePay,
    bonus, misc, retroPay, reim, indHoursPay, cashAdvance, hmo,
    grossPay, totalDeductions, netPay,
  } = figures;

  const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="p-4 md:p-5 text-sm text-slate-800">
          <div className="flex items-center gap-3 mb-2.5">
            {/* Process sits on the same line as the week selector it acts on,
                rather than on a centred row of its own below it. */}
            {canProcess && (
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={handleProcessClick}
                  disabled={isSaving}
                  className={`px-5 py-1.5 text-sm font-semibold rounded-lg transition-colors shadow-sm flex shrink-0 items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                    isReprocess
                      ? "border border-blue-200 text-blue-700 hover:bg-blue-50"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  <LuListChecks size={15} strokeWidth={2} />
                  {isSaving ? (isReprocess ? "Re-Processing…" : "Processing…") : (isReprocess ? "Re-Process" : "Process")}
                </button>
                {saveError && <p className="text-xs font-medium text-red-600">{saveError}</p>}
              </div>
            )}
            <div className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm overflow-x-auto">
              <div className="flex gap-0.5">
                {weeks.slice(0, 4).map((w) => (
                  <button
                    key={w}
                    onClick={() => onSelectWeek(w)}
                    className={`px-2 py-1 text-[10px] font-bold rounded-md whitespace-nowrap transition-all ${week === w ? "bg-[#003527] text-white shadow-sm" : "text-slate-500 hover:text-[#003527] hover:bg-slate-100"}`}
                  >
                    {weekLabel(w)}
                  </button>
                ))}
              </div>
              <div className="h-4 w-px mx-0.5 shrink-0 bg-slate-200" />
              <div className="relative shrink-0">
                <button
                  ref={weekJumpButtonRef}
                  onClick={() => setShowWeekJump((v) => !v)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md whitespace-nowrap transition-colors ${showWeekJump ? "text-teal-700 bg-teal-50" : "text-slate-600 hover:text-teal-700 hover:bg-teal-50"}`}
                >
                  <LuCalendar size={12} strokeWidth={2} />
                  <span className="text-[10px] font-bold">Jump to Week</span>
                </button>
                {showWeekJump && (
                  <WeekJumpDropdown
                    anchorRef={weekJumpButtonRef}
                    onApply={(d) => onSelectWeek(sundayOf(d))}
                    onClose={() => setShowWeekJump(false)}
                  />
                )}
              </div>
              <div className="h-4 w-px mx-0.5 shrink-0 bg-slate-200" />
              <select
                value={week}
                onChange={(e) => onSelectWeek(e.target.value)}
                title="Select any week from the last few months, including previous months"
                className="h-6 shrink-0 rounded-md border border-slate-200 bg-white px-1.5 text-[10px] font-bold text-slate-600 outline-none focus:ring-2 focus:ring-teal-500"
              >
                {weeks.map((w) => (
                  <option key={w} value={w}>{weekLabel(w)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Header */}
          <div className="grid grid-cols-3 items-start gap-4 pb-2.5 border-b-2 border-[#003527]">
            <div />
            <h3 className="text-center font-bold text-slate-700 tracking-wide">Payroll Voucher</h3>
            <div className="text-right text-xs justify-self-end">
              <p><span className="text-slate-500">Pay Cycle:</span> <span className="font-semibold">{fmtVoucherDate(rangeFrom)} to {fmtVoucherDate(rangeTo)}</span></p>
              <p className="mt-0.5"><span className="text-slate-500">Check Date:</span> <span className="font-semibold">{rangeTo ? fmtVoucherDate(addDaysIso(rangeTo, 6)) : "—"}</span></p>
            </div>
          </div>

          {/* Contractor info */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs mt-2.5 mb-3">
            <p><span className="text-slate-500">Contractor</span> <span className="font-semibold ml-2">{figures.name}</span></p>
            <p><span className="text-slate-500">Monthly Contract Rate</span> <span className="font-semibold ml-2">{fmtRate(figures.monthlyRate)}</span></p>
            <p><span className="text-slate-500">Role</span> <span className="font-semibold ml-2">{figures.role}</span></p>
            <p><span className="text-slate-500">Weekly Contract Rate</span> <span className="font-semibold ml-2">{fmtRate(figures.weeklyRate)}</span></p>
            {/* Empty left cell so the three rates stay stacked in the right
                column instead of Hourly landing under Role. */}
            <p />
            {/* Two decimals, not fmtRate: the hourly rate is Monthly × 12 ÷ 52
                ÷ 40, which recurs — fmtRate would print 819.2307692307692.
                Pay is still calculated from the unrounded value. */}
            <p><span className="text-slate-500">Hourly Contract Rate</span> <span className="font-semibold ml-2">{money(figures.hourlyRate)}</span></p>
          </div>

          {/* Gross Pay */}
          <div className="bg-[#003527] text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-t-md">Gross Pay</div>
          <div className="border border-t-0 border-slate-200 rounded-b-md px-4 py-2.5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <table className="w-full text-xs mb-2">
                <thead>
                  <tr>
                    {DAY_LABELS.map((d) => (
                      <th key={d} className="border border-slate-200 bg-slate-50 px-1 py-0.5 font-semibold text-slate-500">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {weekDates.map((date, i) => {
                      const label = DAY_LABELS[i];
                      const isOff = restDayLabels.has(label);
                      const hours = (figures.evaluatedDailyMinutes[date] ?? 0) / 60;
                      const otHours = (figures.regularOtDailyMinutes[date] ?? 0) / 60;
                      // A day whose whole time was approved as Regular OT has
                      // no evaluated hours, so show the OT in place of the 0
                      // rather than printing a blank-looking day.
                      const otInPlaceOfZero = !isOff && hours === 0 && otHours > 0;
                      // A US holiday with no worked time is credited HO rather
                      // than reading as an empty day. OT takes precedence, so a
                      // day that somehow has both still shows the worked time.
                      const usHoHours = (figures.usHolidayDailyMinutes[date] ?? 0) / 60;
                      const hoInPlaceOfZero = !isOff && !otInPlaceOfZero && hours === 0 && usHoHours > 0;
                      return (
                        <td key={date} className="border border-slate-200 px-1 py-1 text-center tabular-nums">
                          <div className={otInPlaceOfZero ? "font-semibold text-amber-600" : hoInPlaceOfZero ? "font-semibold text-blue-600" : undefined}
                            title={otInPlaceOfZero ? `Regular OT earned this day — counted in REG OT HRS, not REG Hours`
                              : hoInPlaceOfZero ? `US Holiday — ${usHoHours.toFixed(2)} h credited, counted in HO HRS, not REG Hours` : undefined}>
                            {isOff ? "OFF" : hoInPlaceOfZero ? "HO" : (otInPlaceOfZero ? otHours : hours).toFixed(2)}
                          </div>
                          {!otInPlaceOfZero && otHours > 0 && (
                            <div className="text-[9px] font-semibold leading-tight text-amber-600"
                              title={`Regular OT earned this day — counted in REG OT HRS, not REG Hours`}>
                              +{otHours.toFixed(2)}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>

              <div className="space-y-1 text-xs">
                {[
                  ["REG Hours", regHours],
                  // Every paid-leave hour for the week, not just PTO: Medical
                  // Unavailability, Special Leave and the advance pools all
                  // land here, half-days included (a half-day request stamps
                  // 4h in its own column, so it needs no special handling).
                  // This is what the Time Off Pay line below is paid on — it
                  // sums the same four — so showing PTO alone left hours ×
                  // rate unable to reconcile with the pay beside it.
                  ["PTO HRS", ptoHours + sickHours + specialHours + advanceHours],
                  // Combined to match the single Holiday Pay line below. Kept
                  // distinct from "HO OT HRS" in the next group — that's
                  // overtime worked on a holiday, not holiday hours.
                  ["HO HRS", usHolidayHours + localHolidayHours],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-0.5">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold tabular-nums">{(value as number).toFixed(2)}</span>
                  </div>
                ))}
                {[
                  ["REG OT HRS", regOtHours],
                  ["RD OT HRS", rdOtHours],
                  ["HO OT HRS", hoOtHours],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-0.5">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold tabular-nums">{(value as number).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1 text-xs">
              {[
                ["REG HRS Pay", regPay],
                ["REG OT", regOtPay],
                ["RD OT", rdOtPay],
                // US and local holiday pay on one line. HO OT stays separate
                // below: it's overtime worked on a holiday, not holiday pay.
                ["Holiday Pay", usHolidayPay + localHolidayPay],
                ["HO OT", hoOtPay],
                // Every paid-leave kind on one line. The Weekly Payroll table
                // still breaks them out per kind for the admin view; the payslip
                // only needs the amount.
                ["Time Off Pay", ptoPay + sickPay + specialPay + advancePay],
                ["Bonus", bonus],
                ["MISC", misc],
                ["Retro Pay", retroPay],
                ["REIM", reim],
                // Fixed-Ind only — no other pay category can accrue it, so the
                // line is left out rather than printed as a zero.
                ...(isFixedIndCategory(row.payCategory) ? [["IND HRS", indHoursPay]] : []),
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-0.5">
                  <span className="text-slate-500">{label}</span>
                  <span className={`tabular-nums ${(value as number) > 0 ? "font-semibold" : "text-slate-300"}`}>{money(value as number)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-2 border-[#003527] rounded-md px-2 py-1 mt-1.5">
                <span className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Gross Pay</span>
                <span className="font-bold tabular-nums">{money(grossPay)}</span>
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div className="bg-[#003527] text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-t-md mt-2.5">Deduction</div>
          <div className="border border-t-0 border-slate-200 rounded-b-md px-4 py-2.5 flex items-end justify-between gap-6">
            <div className="space-y-1 text-xs flex-1">
              {[
                ["Cash Advance", cashAdvance],
                ["HMO Premium", hmo],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-0.5">
                  <span className="text-slate-500">{label}</span>
                  <span className={`tabular-nums ${(value as number) > 0 ? "font-semibold" : "text-slate-300"}`}>{money(value as number)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold uppercase text-[10px] tracking-wider text-slate-500 whitespace-nowrap">Total Deductions</span>
              <span className="font-bold tabular-nums border-2 border-slate-300 rounded-md px-3 py-1">{money(totalDeductions)}</span>
            </div>
          </div>

          {/* Net Pay */}
          <div className="mt-2.5 flex items-center justify-between bg-[#003527] text-white rounded-md px-4 py-2">
            <span className="font-bold uppercase text-xs tracking-wider">Net Pay</span>
            <span className="font-bold text-lg tabular-nums">{figures.currency} {money(netPay)}</span>
          </div>

          <p className="text-[10px] text-slate-400 mt-2">
            Check Date is always the Friday following the pay cycle&apos;s end date.
            Bonus, MISC, Retro Pay, REIM, Cash Advance and HMO Premium can be entered via the Review action on the payroll table. Paid-leave hours come from approved Time Away requests.
          </p>

          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={goToTimeAway}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              title="Open in Time Away Management"
            >
              <LuCalendarDays size={13} strokeWidth={2} /> Time Away
            </button>
            <button
              onClick={goToAttendance}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              title="Open in Attendance"
            >
              <LuFingerprint size={13} strokeWidth={2} /> Attendance
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type AdjustmentValues = {
  bonus: number; misc: number; retroPay: number; reim: number;
  cashAdvance: number; hmo: number; tax: number;
};

const EARNINGS_TAB = "earnings" as const;
const DEDUCTION_TAB = "deduction" as const;

function PayrollAdjustmentModal({
  row, onSave, onClose,
}: {
  row: PayrollRow;
  onSave: (values: AdjustmentValues) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<typeof EARNINGS_TAB | typeof DEDUCTION_TAB>(EARNINGS_TAB);
  const [bonus,       setBonus]       = useState(row.bonus ? row.bonus.toString() : "");
  const [misc,        setMisc]        = useState(row.misc ? row.misc.toString() : "");
  const [retroPay,    setRetroPay]    = useState(row.retroPay ? row.retroPay.toString() : "");
  const [reim,        setReim]        = useState(row.reim ? row.reim.toString() : "");
  const [cashAdvance, setCashAdvance] = useState(row.cashAdvance ? row.cashAdvance.toString() : "");
  const [hmo,         setHmo]         = useState(row.hmo ? row.hmo.toString() : "");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");

  const earningsFields: [string, string, (v: string) => void][] = [
    ["Bonus",     bonus,    setBonus],
    ["MISC",      misc,     setMisc],
    ["Retro Pay", retroPay, setRetroPay],
    ["REIM",      reim,     setReim],
  ];
  const deductionFields: [string, string, (v: string) => void][] = [
    ["Cash Advance", cashAdvance, setCashAdvance],
    ["HMO",          hmo,         setHmo],
  ];

  async function handleSave() {
    setError("");
    setSaving(true);
    const result = await onSave({
      bonus: parseFloat(bonus) || 0,
      misc: parseFloat(misc) || 0,
      retroPay: parseFloat(retroPay) || 0,
      reim: parseFloat(reim) || 0,
      cashAdvance: parseFloat(cashAdvance) || 0,
      hmo: parseFloat(hmo) || 0,
      // Retired: no input, not shown, and out of both Deductions sums. Written
      // as 0 so a saved row can't keep a value nothing can reach.
      tax: 0,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Failed to save adjustment.");
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <button
          onClick={onClose}
          disabled={saving}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
        >
          <LuX size={18} strokeWidth={2} />
        </button>

        <h3 className="text-base font-bold text-[#003527]">Review — Manual Payroll Adjustments</h3>
        <p className="text-xs text-slate-400 mt-1 mb-5">{row.name}</p>

        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-4">
          {([
            [EARNINGS_TAB, "Earnings"],
            [DEDUCTION_TAB, "Deduction"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                tab === key ? "bg-white text-[#003527] shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {(tab === EARNINGS_TAB ? earningsFields : deductionFields).map(([label, value, setValue]) => (
            <div key={label} className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
              <input
                type="number"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.00"
                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          ))}
        </div>

        {error && <p className="text-xs font-medium text-red-600 mt-3">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-5 py-2.5 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <LuCircleCheck size={15} strokeWidth={2} /> {saving ? "Saving…" : "Save Adjustments"}
        </button>
      </div>
    </div>
  );
}

/**
 * Fixed-Ind hours-at-percentage entry, opened from the clock icon on the
 * Payroll table's Action column. Two inputs and a derived Total:
 *
 *   Total (hrs) = Hours × Percentage
 *   added to Gross = Total × Rate/hr
 *
 * Stores the two inputs rather than the product, so the figure stays
 * reproducible from what was typed. Only the two Fixed-Ind fields are sent —
 * every other adjustment on the row is passed through untouched, so saving here
 * can't wipe a Bonus or a Cash Advance entered in the other window.
 */
function FixedIndHoursModal({
  row, onClose, onSave,
}: {
  row: PayrollRow;
  onClose: () => void;
  onSave: (values: { indHours: number; indPercentage: number }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [hours, setHours] = useState(row.indHours ? row.indHours.toString() : "");
  const [percentage, setPercentage] = useState(row.indPercentage ? row.indPercentage.toString() : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hoursNum = parseFloat(hours) || 0;
  const pctNum = parseFloat(percentage) || 0;
  const totalHours = fixedIndTotalHours(hoursNum, pctNum);
  const totalPay = fixedIndHoursPay(hoursNum, pctNum, row.hourlyRate);

  async function handleSave() {
    setError("");
    setSaving(true);
    const result = await onSave({ indHours: hoursNum, indPercentage: pctNum });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Failed to save.");
      return;
    }
    onClose();
  }

  const fields: [string, string, string, (v: string) => void][] = [
    ["Hours", "0.00", hours, setHours],
    ["Percentage (%)", "0", percentage, setPercentage],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <button
          onClick={onClose}
          disabled={saving}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
        >
          <LuX size={18} strokeWidth={2} />
        </button>

        <h3 className="text-base font-bold text-[#003527]">Hours at Percentage</h3>
        <p className="text-xs text-slate-400 mt-1 mb-5">{row.name} · {row.payCategory}</p>

        <div className="space-y-3">
          {fields.map(([label, placeholder, value, setValue]) => (
            <div key={label} className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
              <input
                type="number"
                step="0.01"
                min="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          ))}
        </div>

        {/* Total is the hours figure the two inputs produce. The money it adds to
            Gross is shown beneath it, since the Total alone doesn't say what
            will reach payroll. */}
        <div className="mt-4 rounded-xl border-2 border-[#003527] px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</span>
            <span className="text-base font-bold tabular-nums text-[#003527]">
              {totalHours.toFixed(2)} <span className="text-xs font-semibold text-slate-400">hrs</span>
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between border-t border-dotted border-slate-300 pt-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Added to Gross · {row.currency} {fmtRate(row.hourlyRate)}/hr
            </span>
            <span className={`text-sm font-semibold tabular-nums ${totalPay > 0 ? "text-teal-700" : "text-slate-300"}`}>
              {fmtMoney(totalPay, row.currency)}
            </span>
          </div>
        </div>

        {error && <p className="text-xs font-medium text-red-600 mt-3">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-5 py-2.5 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <LuCircleCheck size={15} strokeWidth={2} /> {saving ? "Saving…" : "Save Hours"}
        </button>
      </div>
    </div>
  );
}

const EARNINGS_FIELD_OPTIONS: { value: AdjustmentField; label: string }[] = [
  { value: "bonus", label: "Bonus" },
  { value: "misc", label: "MISC" },
  { value: "retroPay", label: "Retro Pay" },
  { value: "reim", label: "REIM" },
];
const DEDUCTION_FIELD_OPTIONS: { value: AdjustmentField; label: string }[] = [
  { value: "cashAdvance", label: "Cash Advance" },
  { value: "hmo", label: "HMO" },
];

// Minimal dependency-free CSV parser — handles quoted fields (with ""
// escaping) and both \n and \r\n line endings. Good enough for a simple
// two-column Email,Amount file.
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

function ImportAdjustmentsModal({
  weekStart, onClose, onImported,
}: {
  weekStart: string;
  onClose: () => void;
  onImported: (field: AdjustmentField, values: Map<string, number>) => void;
}) {
  const [category, setCategory] = useState<"Earnings" | "Deduction">("Earnings");
  const [field, setField] = useState<AdjustmentField>("bonus");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ updated: number; failed: number } | null>(null);

  const fieldOptions = category === "Earnings" ? EARNINGS_FIELD_OPTIONS : DEDUCTION_FIELD_OPTIONS;

  function handleCategoryChange(next: "Earnings" | "Deduction") {
    setCategory(next);
    setField(next === "Earnings" ? EARNINGS_FIELD_OPTIONS[0].value : DEDUCTION_FIELD_OPTIONS[0].value);
    setResult(null);
    setError("");
  }

  async function handleImport() {
    if (!file) { setError("Choose a CSV file first."); return; }
    setError("");
    setResult(null);
    setImporting(true);
    try {
      const text = await file.text();
      const dataRows = parseCsvRows(text).slice(1); // first row is the header
      const rows: { email: string; value: number }[] = [];
      for (const cols of dataRows) {
        const email = (cols[0] ?? "").trim();
        const value = Number(cols[1]);
        if (!email || !Number.isFinite(value)) continue;
        rows.push({ email, value });
      }
      if (rows.length === 0) {
        setError("No valid rows found. Expected columns: Email, Amount.");
        return;
      }

      const res = await bulkImportPayrollAdjustments(weekStart, field, rows);
      setResult({ updated: res.updated, failed: res.failed.length });

      if (res.updated > 0) {
        const failedEmails = new Set(res.failed.map((f) => f.email));
        const values = new Map(
          rows
            .map((r) => [r.email.trim().toLowerCase(), r.value] as const)
            .filter(([email]) => !failedEmails.has(email))
        );
        onImported(field, values);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import CSV.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !importing && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <button
          onClick={onClose}
          disabled={importing}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
        >
          <LuX size={18} strokeWidth={2} />
        </button>

        <h3 className="text-base font-bold text-[#003527]">Import Earnings & Deductions</h3>
        <p className="text-xs text-slate-400 mt-1 mb-5">CSV columns: Email, Amount</p>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Type</label>
            <select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value as "Earnings" | "Deduction")}
              className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
            >
              <option value="Earnings">Earnings</option>
              <option value="Deduction">Deduction</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Field</label>
            <select
              value={field}
              onChange={(e) => setField(e.target.value as AdjustmentField)}
              className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
            >
              {fieldOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(""); }}
              className="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:text-xs file:font-semibold hover:file:bg-slate-200"
            />
          </div>
        </div>

        {error && <p className="text-xs font-medium text-red-600 mt-3">{error}</p>}
        {result && (
          <p className={`text-xs font-medium mt-3 ${result.failed > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {result.updated} row{result.updated !== 1 ? "s" : ""} updated{result.failed > 0 ? `, ${result.failed} failed` : ""}.
          </p>
        )}

        <button
          onClick={handleImport}
          disabled={importing || !file}
          className="w-full mt-5 py-2.5 bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <LuUpload size={15} strokeWidth={2} /> {importing ? "Importing…" : "Import"}
        </button>
      </div>
    </div>
  );
}

// Finalizes every already-"Reviewed" row into process_weekly_payroll —
// "For Review"/"No Activity" rows are skipped entirely, same spirit as
// Process Attendance only saving Standard Met/Reviewed rows.
function ProcessPayrollModal({ rows, rangeFrom, rangeTo, onClose, onProcessed }: {
  rows: PayrollRow[];
  rangeFrom: string;
  rangeTo: string;
  onClose: () => void;
  onProcessed: () => void;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [processError, setProcessError] = useState("");
  const [processedSoFar, setProcessedSoFar] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [processingElapsedSeconds, setProcessingElapsedSeconds] = useState(0);
  const cancelledRef = useRef(false);
  const isBusy = isProcessing || isReprocessing;

  useEffect(() => {
    if (!isBusy) return;
    setProcessingElapsedSeconds(0);
    const id = setInterval(() => setProcessingElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isBusy]);

  const reviewedCount   = rows.filter((r) => r.status === "Reviewed").length;
  const forReviewCount  = rows.filter((r) => r.status === "For Review").length;
  const noActivityCount = rows.filter((r) => r.status === "No Activity").length;
  const processedCount  = rows.filter((r) => r.status === "Processed").length;

  // First-time processing only ever targets "Reviewed" rows — once a row is
  // "Processed" it's excluded here (see Re-Process below for revisiting it).
  const eligibleRows = rows.filter((r) => r.status === "Reviewed");
  // Already-"Processed" rows — re-saved on demand via Re-Process, e.g. if a
  // payroll adjustment was edited after the original processing run.
  const alreadyProcessedRows = rows.filter((r) => r.status === "Processed");

  function buildItems(rowsToProcess: PayrollRow[]): ProcessedPayrollRow[] {
    return rowsToProcess.map((r) => {
      const live = payComponentsFor(r.payCategory, r.hourlyRate, r.completionMinutes, {
        totalEvaluatedRegularMinutes: r.totalEvaluatedRegularMinutes,
        totalRegularOtMinutes: r.totalRegularOtMinutes,
        totalRdOtMinutes: r.totalRdOtMinutes,
        totalUsHoMinutes: r.totalUsHoMinutes,
        totalHoOtMinutes: r.totalHoOtMinutes,
        localHolidayMinutes: r.localHolidayMinutes,
      });
      const ptoPay = r.ptoHours * r.hourlyRate;
      return {
        email: r.email,
        weekStart: rangeFrom,
        weekEnd: rangeTo,
        name: r.name,
        role: r.role,
        restDay: r.restDay,
        department: r.department,
        country: r.country,
        payCategory: r.payCategory,
        shiftType: r.shiftType,
        currency: r.currency,
        hourlyRate: r.hourlyRate,
        monthlyRate: r.monthlyRate,
        weeklyRate: r.weeklyRate,
        actualMinutes: r.actualMinutes,
        completionMinutes: r.completionMinutes,
        hours: r.hours,
        gross: r.gross ?? 0,
        deductions: r.deductions ?? 0,
        net: r.net ?? 0,
        // Always "Processed": this column records that a snapshot exists, and
        // the contractor portal keys its voucher list off it. Writing
        // row.status stamped a first-time process as "Reviewed" (row.status is
        // only "Processed" once a snapshot is already there), which hid the
        // voucher until the week happened to be processed a second time.
        status: "Processed",
        bonus: r.bonus,
        misc: r.misc,
        retroPay: r.retroPay,
        reim: r.reim,
        indHoursPay: r.indHoursPay,
        cashAdvance: r.cashAdvance,
        hmo: r.hmo,
        tax: r.tax,
        ptoHours: r.ptoHours,
        sickHours: r.sickHours,
        sickPay: r.sickHours * r.hourlyRate,
        specialHours: r.specialHours,
        specialPay: r.specialHours * r.hourlyRate,
        advanceHours: r.advanceHours,
        advancePay: r.advanceHours * r.hourlyRate,
        regHours: live.regHours,
        regOtHours: live.regOtHours,
        rdOtHours: live.rdOtHours,
        usHolidayHours: live.usHolidayHours,
        hoOtHours: live.hoOtHours,
        localHolidayHours: live.localHolidayHours,
        ptoPay,
        regPay: live.regPay,
        regOtPay: live.regOtPay,
        rdOtPay: live.rdOtPay,
        usHolidayPay: live.usHolidayPay,
        hoOtPay: live.hoOtPay,
        localHolidayPay: live.localHolidayPay,
        evaluatedDailyMinutes: r.evaluatedDailyMinutes,
        regularOtDailyMinutes: r.regularOtDailyMinutes,
      };
    });
  }

  // One contractor at a time, awaited sequentially, instead of one call
  // covering the whole batch — this is what makes a real "N of M processed"
  // counter possible and lets Cancel stop cleanly between contractors
  // instead of having no visibility into an in-flight batch at all (same
  // approach as Bulk Approve / Process Attendance).
  async function runProcess(rowsToProcess: PayrollRow[], setBusy: (v: boolean) => void, label: string) {
    setBusy(true);
    setCancelling(false);
    setProcessError("");
    setProcessedSoFar(0);
    setTotalToProcess(rowsToProcess.length);
    cancelledRef.current = false;

    const items = buildItems(rowsToProcess);
    let processed = 0;
    const failed: Array<{ email: string; error: string }> = [];

    for (const item of items) {
      if (cancelledRef.current) break;
      try {
        const result = await processWeeklyPayroll([item]);
        if (!result.ok) failed.push(...result.failed);
      } catch (err) {
        failed.push({ email: item.email, error: err instanceof Error ? err.message : "Failed to process payroll." });
      }
      processed++;
      setProcessedSoFar(processed);
    }

    setBusy(false);
    setCancelling(false);

    if (cancelledRef.current) {
      setProcessError(`Cancelled after ${processed} of ${items.length} — contractors already processed before cancelling stay saved. Retry the rest, or refresh to check.`);
      if (processed > failed.length) onProcessed();
      return;
    }

    if (failed.length > 0) {
      setProcessError(`${failed.length} of ${items.length} record${items.length !== 1 ? "s" : ""} failed to process. Please try again.`);
      if (processed > failed.length) onProcessed();
      return;
    }

    toast.success(`${processed} contractor${processed !== 1 ? "s" : ""} ${label} successfully`);
    onProcessed();
    onClose();
  }

  function handleCancelProcess() {
    setCancelling(true);
    cancelledRef.current = true;
  }

  function handleProcess() {
    return runProcess(eligibleRows, setIsProcessing, "processed");
  }

  function handleReprocess() {
    return runProcess(alreadyProcessedRows, setIsReprocessing, "re-processed");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isProcessing && !isReprocessing && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-[#003527]">Process Payroll</h3>
          <button
            onClick={onClose}
            disabled={isProcessing || isReprocessing}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <LuX size={18} strokeWidth={2} />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          {rangeFrom && rangeTo ? weekLabel(rangeFrom) : "This week"} — rows still needing review are skipped.
        </p>

        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-100">
            <span className="text-sm font-medium text-amber-700">For Review</span>
            <span className="text-sm font-bold text-amber-700">{forReviewCount}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
            <span className="text-sm font-medium text-emerald-700">Reviewed</span>
            <span className="text-sm font-bold text-emerald-700">{reviewedCount}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-sm font-medium text-slate-600">No Activity</span>
            <span className="text-sm font-bold text-slate-600">{noActivityCount}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-100">
            <span className="text-sm font-medium text-blue-700">Processed</span>
            <span className="text-sm font-bold text-blue-700">{processedCount}</span>
          </div>
        </div>

        {processError && <p className="text-xs text-red-600 mb-3">{processError}</p>}

        <p className="text-xs text-slate-400 mb-5">
          {eligibleRows.length} record{eligibleRows.length !== 1 ? "s" : ""} will be saved to process_weekly_payroll.
          {processedCount > 0 && ` Re-Process will re-save the ${processedCount} already-processed record${processedCount !== 1 ? "s" : ""}.`}
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing || isReprocessing}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleReprocess}
            disabled={isProcessing || isReprocessing || alreadyProcessedRows.length === 0}
            title="Re-save the already-processed records — e.g. if a payroll adjustment changed since they were processed"
            className="px-4 py-2 border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            {isReprocessing ? "Re-Processing…" : "Re-Process"}
          </button>
          <button
            onClick={handleProcess}
            disabled={isProcessing || isReprocessing || eligibleRows.length === 0}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2"
          >
            {isProcessing ? "Processing…" : "Process"}
          </button>
        </div>
      </div>

      {/* Processing overlay — blocks interaction and shows live progress
          while a process is in flight (a large batch can take a while). */}
      {isBusy && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 flex flex-col items-center gap-3 min-w-[240px]">
            <LuRefreshCw size={28} className="text-blue-600 animate-spin" />
            <p className="text-sm font-semibold text-slate-700">
              {cancelling ? "Cancelling…" : isReprocessing ? "Re-Processing payroll…" : "Processing payroll…"}
            </p>
            <p className="text-xs font-semibold text-blue-700 tabular-nums">
              {processedSoFar} of {totalToProcess} contractor{totalToProcess !== 1 ? "s" : ""} processed
            </p>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${totalToProcess > 0 ? Math.round((processedSoFar / totalToProcess) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 tabular-nums">{formatElapsedSeconds(processingElapsedSeconds)}</p>
            <button
              type="button"
              onClick={handleCancelProcess}
              disabled={cancelling}
              title="Contractors already processed before cancelling will stay saved — this only stops waiting on the rest"
              className="mt-1 px-4 py-1.5 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
