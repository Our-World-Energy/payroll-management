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
