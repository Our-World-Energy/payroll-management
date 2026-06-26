import { TIME_OFF, type TimeOffRequest } from "@/lib/data";

const PTO_MONTHLY_ACCRUAL = 6.67;
const PTO_HALF_MONTH_ACCRUAL = 3.33;
const SICK_LEAVE_MONTHLY_ACCRUAL = 3.335;
const SICK_LEAVE_HALF_MONTH_ACCRUAL = 1.6675;

export const HOURS_PER_DAY = 8;

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

function accrualPeriodStartFor(date: Date) {
  const marchFirst = new Date(date.getFullYear(), 2, 1);
  return date >= marchFirst ? new Date(date.getFullYear(), 0, 1) : new Date(date.getFullYear() - 1, 2, 1);
}

function latestResetDateFor(date: Date) {
  const marchFirst = new Date(date.getFullYear(), 2, 1);
  return date >= marchFirst ? marchFirst : new Date(date.getFullYear() - 1, 2, 1);
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
  asOfDate: Date
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

  const currentPeriodStart = accrualPeriodStartFor(asOfDate);
  const effectiveStartDate = accrualStartDate > currentPeriodStart ? accrualStartDate : currentPeriodStart;
  const prorationDate = effectiveStartDate.getTime() === accrualStartDate.getTime() ? eligibilityDate : effectiveStartDate;
  const firstAccrual = prorationDate.getDate() <= 15 ? monthlyAccrual : halfMonthAccrual;
  // Only count months whose last day has already passed (end-of-month accrual)
  const completedMonths = calendarMonthDiff(effectiveStartDate, startOfMonth(asOfDate));
  if (completedMonths === 0) return 0;
  return roundBalance(firstAccrual + (completedMonths - 1) * monthlyAccrual);
}

function calculatePolicyBalance(hireDate: string, monthlyAccrual: number, halfMonthAccrual: number) {
  return calculatePolicyBalanceAsOf(hireDate, monthlyAccrual, halfMonthAccrual, new Date());
}

export function calculatePtoBalance(hireDate: string) {
  return calculatePolicyBalance(hireDate, PTO_MONTHLY_ACCRUAL, PTO_HALF_MONTH_ACCRUAL);
}

export function calculateSickLeaveBalance(hireDate: string) {
  return calculatePolicyBalance(hireDate, SICK_LEAVE_MONTHLY_ACCRUAL, SICK_LEAVE_HALF_MONTH_ACCRUAL);
}

export function calculateUnusedSickLeaveBalance(
  name: string,
  hireDate: string,
  decisions: RequestDecisionMap = {}
) {
  const resetDate = latestResetDateFor(new Date());
  const priorPeriodStart = new Date(resetDate.getFullYear() - 1, 2, 1);
  const priorPeriodEnd = new Date(resetDate.getFullYear(), 2, 0);
  const priorBalance = calculatePolicyBalanceAsOf(
    hireDate,
    SICK_LEAVE_MONTHLY_ACCRUAL,
    SICK_LEAVE_HALF_MONTH_ACCRUAL,
    priorPeriodEnd
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
