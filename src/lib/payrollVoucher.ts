// Shared payroll-voucher math and labels, used by BOTH the admin Payroll page
// and the contractor Pay Vouchers page so their gross/net totals — and the
// Sun→Sat grid / rest-day labelling — can never drift apart.

// Pay multipliers applied on top of Hourly Rate for each OT bucket. Regular
// Time, US Holiday Time, and Local Holiday Time all pay at the plain hourly
// rate (100%) and need no multiplier of their own.
export const REGULAR_OT_MULTIPLIER = 1.25;
export const RD_OT_MULTIPLIER = 1.5;
export const HO_OT_MULTIPLIER = 2.25;

export type VoucherTimeTotals = {
  totalEvaluatedRegularMinutes: number | null;
  totalRegularOtMinutes: number | null;
  totalRdOtMinutes: number | null;
  totalUsHoMinutes: number | null;
  totalHoOtMinutes: number | null;
  localHolidayMinutes: number | null;
};

// Each payroll component is calculated independently from its own saved time
// total, the contractor's Hourly Rate, and its own pay multiplier, then
// summed into one base payroll gross.
export function computePayComponents(hourlyRate: number, totals: VoucherTimeTotals) {
  const regHours = (totals.totalEvaluatedRegularMinutes ?? 0) / 60;
  const regOtHours = (totals.totalRegularOtMinutes ?? 0) / 60;
  const rdOtHours = (totals.totalRdOtMinutes ?? 0) / 60;
  const usHolidayHours = (totals.totalUsHoMinutes ?? 0) / 60;
  const hoOtHours = (totals.totalHoOtMinutes ?? 0) / 60;
  const localHolidayHours = (totals.localHolidayMinutes ?? 0) / 60;

  const regPay = regHours * hourlyRate;
  const regOtPay = regOtHours * hourlyRate * REGULAR_OT_MULTIPLIER;
  const rdOtPay = rdOtHours * hourlyRate * RD_OT_MULTIPLIER;
  const usHolidayPay = usHolidayHours * hourlyRate;
  const hoOtPay = hoOtHours * hourlyRate * HO_OT_MULTIPLIER;
  const localHolidayPay = localHolidayHours * hourlyRate;

  const grossPay = regPay + regOtPay + rdOtPay + usHolidayPay + hoOtPay + localHolidayPay;

  return {
    regHours, regOtHours, rdOtHours, usHolidayHours, hoOtHours, localHolidayHours,
    regPay, regOtPay, rdOtPay, usHolidayPay, hoOtPay, localHolidayPay,
    grossPay,
  };
}

// Fixed-Ind and Fixed-Mex — no OT/holiday multiplier breakdown applies to
// either: Fixed-Ind's Completion Time comes from attendance_week_status
// (same weekly-review source Hourly contractors use), Fixed-Mex's from the
// "Fixed Time" button on Attendance Management (fixed_time table) — either
// way, their whole week's pay is simply Completion Time (hours) × Hourly
// Rate (from Contractor Details), folded into the same shape
// computePayComponents returns so every voucher/gross calculation can call
// this one function regardless of pay category.
export function payComponentsFor(
  payCategory: string,
  hourlyRate: number,
  completionMinutes: number | null,
  totals: VoucherTimeTotals
) {
  const category = payCategory.trim().toLowerCase();
  const isFixed = category === "fixed-mex" || category === "fixed-ind";
  if (isFixed && completionMinutes != null) {
    const regHours = completionMinutes / 60;
    const regPay = regHours * hourlyRate;
    return {
      regHours, regOtHours: 0, rdOtHours: 0, usHolidayHours: 0, hoOtHours: 0, localHolidayHours: 0,
      regPay, regOtPay: 0, rdOtPay: 0, usHolidayPay: 0, hoOtPay: 0, localHolidayPay: 0,
      grossPay: regPay,
    };
  }
  return computePayComponents(hourlyRate, totals);
}

// Paid leave hours for the week, split by kind so each gets its own voucher
// line and its own column instead of one combined "PTO" figure.
//
// Which hour column a request stamps is NOT inferable from the kind: advance
// overrides always write to sickLeaveUsedHours regardless of which pool they
// draw from (see createAdvanceLeaveOverride), and Special Leave has its own
// dedicated column (see LEAVE_BUCKET_FIELDS). So the kind is decided by `type`
// and the hours are then read from whichever column that kind uses.
//
// Unpaid Leave is deliberately absent — it carries no paid hours. Callers are
// expected to have filtered to Approved requests already.
export type LeaveHours = {
  pto: number;
  /** Medical Unavailability — regular Sick Leave, not the advance pool. */
  sick: number;
  special: number;
  /** Advance PTO/Birthday Leave and Advance Sick Leave, either half-day or full. */
  advance: number;
};

type LeaveRequestHours = {
  type: string;
  startDate: string;
  endDate: string;
  ptoUsedHours: number;
  sickLeaveUsedHours: number;
  specialLeaveUsedHours: number;
};

/** Which paid-leave line a request belongs on, or null if it isn't paid leave. */
function leaveKindFor(type: string): keyof LeaveHours | null {
  // "Advance" is tested first: "Advance PTO/Birthday Leave" also starts with
  // "PTO"-ish wording but belongs on the Advance line, not the PTO one.
  if (type.startsWith("Advance ")) return "advance";
  if (type.startsWith("PTO")) return "pto";
  if (type.startsWith("Special Leave")) return "special";
  if (type.startsWith("Sick Leave")) return "sick";
  return null;
}

export function leaveHoursFor(
  rangeFrom: string,
  rangeTo: string,
  requests: Array<LeaveRequestHours>
): LeaveHours {
  const totals: LeaveHours = { pto: 0, sick: 0, special: 0, advance: 0 };

  for (const r of requests) {
    if (r.startDate > rangeTo || r.endDate < rangeFrom) continue;
    const kind = leaveKindFor(r.type);
    if (!kind) continue;
    totals[kind] += kind === "pto" ? r.ptoUsedHours
      : kind === "special" ? r.specialLeaveUsedHours
      // Both Medical Unavailability and the advance pools stamp their hours here.
      : r.sickLeaveUsedHours;
  }

  return totals;
}

/** Every paid-leave hour for the week, whatever its kind. */
export function totalLeaveHours(hours: LeaveHours) {
  return hours.pto + hours.sick + hours.special + hours.advance;
}

export const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THUR", "FRI", "SAT"];

export const REST_DAY_TO_LABEL: Record<string, string> = {
  Sunday: "SUN", Monday: "MON", Tuesday: "TUE", Wednesday: "WED",
  Thursday: "THUR", Friday: "FRI", Saturday: "SAT",
};

// Voucher-style short date, e.g. "10.07.23".
export function fmtVoucherDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}.${d}.${y.slice(2)}` : iso;
}
