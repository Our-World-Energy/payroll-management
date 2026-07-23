import { TIME_OFF, type TimeOffRequest } from "@/lib/data";

const PTO_MONTHLY_ACCRUAL = 6.67;
const PTO_HALF_MONTH_ACCRUAL = 3.33;
const SICK_LEAVE_MONTHLY_ACCRUAL = 3.335;
const SICK_LEAVE_HALF_MONTH_ACCRUAL = 1.6675;

export const HOURS_PER_DAY = 8;

// The PTO/Sick Leave accrual "year" resets on a cut off date (month + day,
// no year) configured under Settings → Time Off Settings → Cut Off Time,
// rather than being hardcoded to March 1st.
export type CutoffDate = { month: number; day: number }; // month is 0-indexed (Date()-compatible)

export const CUTOFF_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Falls back to March 1st (the previously-hardcoded date) until a Cut Off
// Time has actually been saved in Settings.
export const DEFAULT_CUTOFF: CutoffDate = { month: 2, day: 1 };

export function cutoffFromSaved(saved: { monthName: string; monthNo: number } | null): CutoffDate {
  if (!saved) return DEFAULT_CUTOFF;
  const month = CUTOFF_MONTHS.indexOf(saved.monthName);
  return month >= 0 ? { month, day: saved.monthNo } : DEFAULT_CUTOFF;
}

// Fixed deduction per leave request, independent of the date range selected —
// "PTO"/"Sick Leave" = 1 full day, "* Half Day" = half a day. Not scaled by
// durationDays. Shared by the contractor submission flow (to stamp a request
// with its hours at creation time) and the admin approval flow (to deduct
// those same stored hours from PTO Used / Sick Leave Used).
export const LEAVE_TYPE_HOURS: Record<string, number> = {
  "PTO": 8,
  "PTO Half Day": 4,
  "Sick Leave": 8,
  "Sick Leave Half Day": 4,
  "Unpaid Leave": 0,
  "Special Leave": 8,
};

export function leaveTypeHours(type: string): number {
  return LEAVE_TYPE_HOURS[type] ?? 8;
}

export function isPtoLeaveType(type: string): boolean {
  return type.startsWith("PTO");
}

// Which balance a leave request type draws down. "Special Leave" is a
// separately-granted bonus balance (Special Leave Credits) — everything else
// keeps the existing PTO vs. Sick Leave split ("Unpaid Leave" lands in the
// Sick Leave bucket too, but always deducts 0 hours so it has no effect).
export type LeaveBucket = "pto" | "sickLeave" | "specialLeave";

export function leaveBucketFor(type: string): LeaveBucket {
  if (type.startsWith("PTO")) return "pto";
  if (type.startsWith("Special Leave")) return "specialLeave";
  return "sickLeave";
}

export const LEAVE_BUCKET_FIELDS: Record<LeaveBucket, {
  usedField: "ptoUsed" | "sickLeaveUsed" | "specialLeaveUsed";
  balanceField: "ptoBalance" | "sickLeaveBalance" | "specialLeaveCredits";
  hoursColumn: "ptoUsedHours" | "sickLeaveUsedHours" | "specialLeaveUsedHours";
  label: string;
}> = {
  pto:          { usedField: "ptoUsed",          balanceField: "ptoBalance",          hoursColumn: "ptoUsedHours",          label: "PTO" },
  sickLeave:    { usedField: "sickLeaveUsed",     balanceField: "sickLeaveBalance",    hoursColumn: "sickLeaveUsedHours",    label: "Sick Leave" },
  specialLeave: { usedField: "specialLeaveUsed",  balanceField: "specialLeaveCredits", hoursColumn: "specialLeaveUsedHours", label: "Special Leave" },
};

export type RequestDecision = "Approved" | "Pending" | "Rejected";
export type RequestDecisionMap = Record<string, RequestDecision>;

function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date.getFullYear(), date.getMonth() + months, date.getDate());

  if (result.getDate() !== date.getDate()) {
    result.setDate(0);
  }

  return result;
}

function firstDayAfterMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function calendarMonthDiff(start: Date, end: Date) {
  return Math.max(
    (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth(),
    0
  );
}

function accrualPeriodStartFor(date: Date, cutoff: CutoffDate) {
  const cutoffThisYear = new Date(date.getFullYear(), cutoff.month, cutoff.day);
  return date >= cutoffThisYear ? new Date(date.getFullYear(), 0, 1) : new Date(date.getFullYear() - 1, cutoff.month, cutoff.day);
}

function latestResetDateFor(date: Date, cutoff: CutoffDate) {
  const cutoffThisYear = new Date(date.getFullYear(), cutoff.month, cutoff.day);
  return date >= cutoffThisYear ? cutoffThisYear : new Date(date.getFullYear() - 1, cutoff.month, cutoff.day);
}

export function roundBalance(value: number) {
  return Math.round(value * 100) / 100;
}

export function fmtBalance(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function ptoAvailableTextClass(value: number) {
  return value <= 0 ? "text-red-600" : "text-[#003527]";
}

function calculatePolicyBalanceAsOf(
  hireDate: string,
  monthlyAccrual: number,
  halfMonthAccrual: number,
  asOfDate: Date,
  cutoff: CutoffDate
) {
  const startDate = parseDate(hireDate);

  if (!startDate) return 0;

  const eligibilityDate = addMonths(startDate, 6);
  const accrualStartDate = firstDayAfterMonth(eligibilityDate);
  const oneYearDate = addMonths(startDate, 12);

  if (asOfDate < accrualStartDate) return 0;

  if (asOfDate < oneYearDate) {
    const firstYearAccrual = eligibilityDate.getDate() <= 15 ? monthlyAccrual : halfMonthAccrual;
    const firstYearAdditionalMonths = calendarMonthDiff(accrualStartDate, asOfDate);

    return roundBalance(firstYearAccrual + firstYearAdditionalMonths * monthlyAccrual);
  }

  const currentPeriodStart = accrualPeriodStartFor(asOfDate, cutoff);
  const effectiveStartDate = accrualStartDate > currentPeriodStart ? accrualStartDate : currentPeriodStart;
  const prorationDate = effectiveStartDate.getTime() === accrualStartDate.getTime() ? eligibilityDate : effectiveStartDate;
  const firstAccrual = prorationDate.getDate() <= 15 ? monthlyAccrual : halfMonthAccrual;
  // Only count months whose last day has already passed (end-of-month accrual)
  const completedMonths = calendarMonthDiff(effectiveStartDate, startOfMonth(asOfDate));
  if (completedMonths === 0) return 0;
  return roundBalance(firstAccrual + (completedMonths - 1) * monthlyAccrual);
}

function calculatePolicyBalance(hireDate: string, monthlyAccrual: number, halfMonthAccrual: number, cutoff: CutoffDate) {
  return calculatePolicyBalanceAsOf(hireDate, monthlyAccrual, halfMonthAccrual, new Date(), cutoff);
}

export function calculatePtoBalance(hireDate: string, cutoff: CutoffDate = DEFAULT_CUTOFF) {
  return calculatePolicyBalance(hireDate, PTO_MONTHLY_ACCRUAL, PTO_HALF_MONTH_ACCRUAL, cutoff);
}

export function calculateSickLeaveBalance(hireDate: string, cutoff: CutoffDate = DEFAULT_CUTOFF) {
  return calculatePolicyBalance(hireDate, SICK_LEAVE_MONTHLY_ACCRUAL, SICK_LEAVE_HALF_MONTH_ACCRUAL, cutoff);
}

// Whenever newly-accrued Sick Leave becomes available, any outstanding
// Advance Sick Leave balance is repaid first: the newly-accrued amount is
// credited to Sick Leave Used (instead of increasing Sick Leave Available)
// until the advance reaches zero, then any leftover accrual increases
// Available normally. Repayment never exceeds either the amount just accrued
// or the remaining advance balance. advanceSickLeaveUsed is a running total
// of every repayment ever made, for the "Advance Leave Used" scorecard —
// it only ever grows, unlike advanceSickLeave (the remaining balance).
export function applyAdvanceSickLeaveRepayment(
  previousSickLeaveBalance: number,
  nextSickLeaveBalance: number,
  currentSickLeaveUsed: number,
  currentAdvanceSickLeave: number,
  currentAdvanceSickLeaveUsed: number
): { sickLeaveUsed: number; advanceSickLeave: number; advanceSickLeaveUsed: number } {
  const accrued = nextSickLeaveBalance - previousSickLeaveBalance;
  if (accrued <= 0 || currentAdvanceSickLeave <= 0) {
    return { sickLeaveUsed: currentSickLeaveUsed, advanceSickLeave: currentAdvanceSickLeave, advanceSickLeaveUsed: currentAdvanceSickLeaveUsed };
  }
  const repayment = Math.min(accrued, currentAdvanceSickLeave);
  return {
    sickLeaveUsed: roundBalance(currentSickLeaveUsed + repayment),
    advanceSickLeave: roundBalance(currentAdvanceSickLeave - repayment),
    advanceSickLeaveUsed: roundBalance(currentAdvanceSickLeaveUsed + repayment),
  };
}

// Whenever newly-accrued PTO becomes available, any outstanding Advance
// PTO/Birthday Leave balance (stored on birthdayLeave) is repaid first: the
// newly-accrued amount is credited to PTO Used (instead of increasing PTO
// Available) until the advance reaches zero, then any leftover accrual
// increases Available normally. Mirrors applyAdvanceSickLeaveRepayment for
// the PTO bucket, including the running birthdayLeaveUsed total.
export function applyAdvancePtoRepayment(
  previousPtoBalance: number,
  nextPtoBalance: number,
  currentPtoUsed: number,
  currentBirthdayLeave: number,
  currentBirthdayLeaveUsed: number
): { ptoUsed: number; birthdayLeave: number; birthdayLeaveUsed: number } {
  const accrued = nextPtoBalance - previousPtoBalance;
  if (accrued <= 0 || currentBirthdayLeave <= 0) {
    return { ptoUsed: currentPtoUsed, birthdayLeave: currentBirthdayLeave, birthdayLeaveUsed: currentBirthdayLeaveUsed };
  }
  const repayment = Math.min(accrued, currentBirthdayLeave);
  return {
    ptoUsed: roundBalance(currentPtoUsed + repayment),
    birthdayLeave: roundBalance(currentBirthdayLeave - repayment),
    birthdayLeaveUsed: roundBalance(currentBirthdayLeaveUsed + repayment),
  };
}

export function calculateUnusedSickLeaveBalance(
  name: string,
  hireDate: string,
  decisions: RequestDecisionMap = {},
  cutoff: CutoffDate = DEFAULT_CUTOFF
) {
  const resetDate = latestResetDateFor(new Date(), cutoff);
  const priorPeriodStart = new Date(resetDate.getFullYear() - 1, cutoff.month, cutoff.day);
  const priorPeriodEnd = new Date(resetDate.getFullYear(), cutoff.month, cutoff.day - 1);
  const priorBalance = calculatePolicyBalanceAsOf(
    hireDate,
    SICK_LEAVE_MONTHLY_ACCRUAL,
    SICK_LEAVE_HALF_MONTH_ACCRUAL,
    priorPeriodEnd,
    cutoff
  );
  const priorUsed = TIME_OFF
    .filter((request) => {
      const requestDate = parseDate(request.from);
      return (
        request.name === name &&
        request.type === "Sick Leave" &&
        effectiveRequestStatus(request, decisions) === "Approved" &&
        requestDate !== null &&
        requestDate >= priorPeriodStart &&
        requestDate <= priorPeriodEnd
      );
    })
    .reduce((total, request) => total + request.days * HOURS_PER_DAY, 0);

  return roundBalance(Math.max(priorBalance - priorUsed, 0));
}

export function effectiveRequestStatus(request: TimeOffRequest, decisions: RequestDecisionMap = {}) {
  return decisions[request.id] ?? request.status;
}

export function approvedHoursFor(
  name: string,
  type: "Annual Leave" | "Sick Leave",
  decisions: RequestDecisionMap = {}
) {
  return TIME_OFF
    .filter((request) =>
      request.name === name &&
      request.type === type &&
      effectiveRequestStatus(request, decisions) === "Approved"
    )
    .reduce((total, request) => total + request.days * HOURS_PER_DAY, 0);
}
