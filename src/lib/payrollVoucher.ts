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

// PTO hours for the voucher's PTO HRS line — regular PTO ("PTO"/"PTO Half
// Day"), Advance PTO/Birthday Leave and Advance Sick Leave overrides, and
// Special Leave (excludes regular Medical Unavailability/Sick Leave
// requests). Advance overrides always stamp their hours on
// sickLeaveUsedHours regardless of which advance pool they draw from (see
// createAdvanceLeaveOverride), while Special Leave has its own dedicated
// specialLeaveUsedHours column (see LEAVE_BUCKET_FIELDS).
export const PTO_HRS_TYPES = [
  "PTO", "PTO Half Day", "Advance PTO/Birthday Leave", "Advance Sick Leave",
  "Advance PTO/Birthday Leave Half Day", "Advance Sick Leave Half Day", "Special Leave",
];

export function totalPtoHoursFor(
  rangeFrom: string,
  rangeTo: string,
  requests: Array<{ type: string; startDate: string; endDate: string; ptoUsedHours: number; sickLeaveUsedHours: number; specialLeaveUsedHours: number }>
) {
  return requests
    .filter((r) => PTO_HRS_TYPES.includes(r.type) && r.startDate <= rangeTo && r.endDate >= rangeFrom)
    .reduce((sum, r) => sum + (
      r.type.startsWith("PTO") ? r.ptoUsedHours :
      r.type === "Special Leave" ? r.specialLeaveUsedHours :
      r.sickLeaveUsedHours
    ), 0);
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
