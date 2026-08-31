// Shared, non-server module: a "use server" file may only export async
// functions, so the Shift Type label and the row shape live here where both
// client components and the server actions can import them.

export const SHIFTING_SCHEDULE = "Shifting Schedule";

/**
 * A shift that starts on one calendar day and ends on the next — e.g.
 * 10:00 PM – 7:00 AM. The whole shift belongs to its **start** date: a punch at
 * Monday 10:05 PM and out at Tuesday 7:02 AM is Monday's shift, not two
 * part-days.
 */
export const CROSS_DAY_SHIFT = "Cross-Day Shift";

/** Whether a start/end pair wraps past midnight. */
export function isCrossDayWindow(shiftStart: string, shiftEnd: string): boolean {
  const start = parseShiftTime(shiftStart);
  const end = parseShiftTime(shiftEnd);
  if (!start || !end) return false;
  return end.hour * 60 + end.minute <= start.hour * 60 + start.minute;
}

/**
 * Minutes of grace after Shift Start before a clock-in counts as late. A punch
 * at exactly Shift Start + this is still on time; one minute past it is late.
 *
 * Defined here because four places evaluate lateness — the Dashboard's Late
 * Today widget, the NotificationBell, the Attendance Tracker API and the
 * tracker's tooltips — and they previously each held their own copy of the
 * number, which could silently drift apart.
 */
export const LATE_GRACE_MINUTES = 16;

export type ShiftScheduleDay = {
  date: string;       // YYYY-MM-DD
  shiftStart: string; // "7:00 AM" — same format as contractor_profiles.shiftHours
  shiftEnd: string;   // "3:00 PM"
};

// contractor_profiles.shiftHours is free text like "9:00 AM to 6:00 PM" — pull
// the leading start time out of it. Shared so the shift-schedule rows and the
// Fixed-shift string are parsed by exactly the same rule.
export function parseShiftTime(value: string): { hour: number; minute: number } | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") hour += 12;
  return { hour, minute: Number(m[2]) };
}

// Scheduled length of a shift window, in minutes. An end at or before the start
// is read as an overnight shift and wraps past midnight.
export function scheduledMinutes(shiftStart: string, shiftEnd: string): number | null {
  const start = parseShiftTime(shiftStart);
  const end = parseShiftTime(shiftEnd);
  if (!start || !end) return null;

  const startMins = start.hour * 60 + start.minute;
  const endMins = end.hour * 60 + end.minute;
  return endMins > startMins ? endMins - startMins : endMins + 24 * 60 - startMins;
}
