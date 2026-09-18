"use server";

import { prisma } from "@/lib/prisma";
import { countryFromLocation } from "@/lib/countryTimeZones";
import { datesBetween, addDaysIso, sundayOf } from "@/lib/weekUtils";
import { isPtoLeaveType } from "@/lib/timeOffBalances";

/**
 * Data for the Attendance Report: one row per contractor for a single Sun→Sat
 * week, carrying the seven day cells.
 *
 * Prisma rather than Supabase REST, unlike most actions here: REST caps a
 * response at 1,000 rows, and attendance_day_status alone runs to ~2,500 rows
 * for one week across 358 contractors.
 */

export type AttendanceReportDay = {
  /** Worked minutes the attendance review accepted for the day. */
  minutes: number;
  /** "Time Away" / "Medical" / "Special" / "Unpaid" — approved leave only. */
  leave: string;
  /** Holiday name in effect for this contractor's country, if any. */
  holiday: string;
  restDay: boolean;
  /** True when no attendance row exists and the figure came from Worksnap. */
  unreviewed: boolean;
};

export type AttendanceReportRow = {
  weekStart: string;
  weekEnd: string;
  name: string;
  contractorId: string;
  email: string;
  payCategory: string;
  department: string;
  country: string;
  days: AttendanceReportDay[];
};

export type AttendanceReportResult = {
  rows: AttendanceReportRow[];
  error?: string;
};

/**
 * Just the Assigned Team list, for the filter dropdown.
 *
 * Its own action because the report itself reads five tables: asking it for a
 * throwaway week on mount, purely to get this list, ran four queries whose
 * results were discarded.
 */
export async function fetchReportDepartments(): Promise<string[]> {
  const rows = await prisma.contractorProfile.findMany({
    where: { status: "Active" },
    select: { department: true },
  });
  return Array.from(new Set(rows.map((r) => (r.department ?? "").trim()).filter(Boolean))).sort();
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Which leave kind a day carries, in the wording the portals now use. */
function leaveLabel(type: string): string {
  if (type.startsWith("Special Leave")) return "Special";
  if (type.startsWith("Unpaid")) return "Unpaid";
  if (isPtoLeaveType(type) || type.startsWith("Advance PTO")) return "Time Away";
  return "Medical";
}

function isRestDay(date: string, restDaysStr: string): boolean {
  if (!restDaysStr || restDaysStr === "-") return false;
  const dayName = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  return restDaysStr.split(",").map((d) => d.trim()).includes(dayName);
}

export async function fetchAttendanceReport(params: {
  week: string;
  payCategory: string;
  department: string;
}): Promise<AttendanceReportResult> {
  // Normalised through sundayOf so the report always covers a whole Sun→Sat
  // week, whichever day of it the caller happened to send.
  const weekStart = sundayOf(params.week);
  if (!weekStart) return { rows: [], error: "Pick a week." };
  const weekEnd = addDaysIso(weekStart, 6);
  const dates = datesBetween(weekStart, weekEnd);

  const [profiles, dayStatuses, dailyLogs, leaveRequests, holidays] = await Promise.all([
    prisma.contractorProfile.findMany({
      where: { status: "Active" },
      select: { email: true, fullName: true, contractorId: true, payCategory: true, department: true, location: true, restDay: true },
    }),
    prisma.attendanceDayStatus.findMany({
      where: { date: { gte: new Date(`${weekStart}T00:00:00.000Z`), lte: new Date(`${weekEnd}T00:00:00.000Z`) } },
      select: { email: true, date: true, evaluatedMinutes: true },
    }),
    // Fallback for a week nobody has reviewed: the raw clock-in/out totals, so
    // the report shows what was logged rather than a blank week.
    prisma.worksnapDailyLog.findMany({
      where: { entryDate: { gte: new Date(`${weekStart}T00:00:00.000Z`), lte: new Date(`${weekEnd}T00:00:00.000Z`) } },
      select: { email: true, entryDate: true, totalMins: true },
    }),
    prisma.contractorLeaveRequest.findMany({
      where: { status: "Approved", startDate: { lte: weekEnd }, endDate: { gte: weekStart } },
      select: { email: true, type: true, startDate: true, endDate: true },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: new Date(`${weekStart}T00:00:00.000Z`), lte: new Date(`${weekEnd}T00:00:00.000Z`) } },
      select: { date: true, name: true, country: true },
    }),
  ]);

  const evaluatedByKey = new Map<string, number>();
  for (const d of dayStatuses) evaluatedByKey.set(`${norm(d.email)}|${iso(d.date)}`, d.evaluatedMinutes);

  const loggedByKey = new Map<string, number>();
  for (const l of dailyLogs) {
    const key = `${norm(l.email)}|${iso(l.entryDate)}`;
    loggedByKey.set(key, (loggedByKey.get(key) ?? 0) + l.totalMins);
  }

  const leaveByKey = new Map<string, string>();
  for (const r of leaveRequests) {
    for (const date of datesBetween(r.startDate, r.endDate)) {
      // First one wins, matching how the rest of the app resolves a date that
      // somehow carries two approved requests.
      const key = `${norm(r.email)}|${date}`;
      if (!leaveByKey.has(key)) leaveByKey.set(key, leaveLabel(r.type));
    }
  }

  // Holidays apply per country, plus the two scopes every contractor observes.
  const holidayByKey = new Map<string, string>();
  for (const h of holidays) {
    const key = `${h.country}|${iso(h.date)}`;
    if (!holidayByKey.has(key)) holidayByKey.set(key, h.name);
  }

  const scoped = profiles.filter((p) =>
    (params.payCategory === "All" || (p.payCategory ?? "").trim() === params.payCategory) &&
    (params.department === "All" || (p.department ?? "").trim() === params.department)
  );

  const rows: AttendanceReportRow[] = [];
  for (const p of scoped) {
    const email = norm(p.email);
    if (!email) continue;
    const country = countryFromLocation(p.location ?? "");
    const restDaysStr = (p.restDay ?? "").trim();

    const days: AttendanceReportDay[] = dates.map((date) => {
      const key = `${email}|${date}`;
      const reviewed = evaluatedByKey.get(key);
      const minutes = reviewed ?? loggedByKey.get(key) ?? 0;
      return {
        minutes,
        leave: leaveByKey.get(key) ?? "",
        holiday:
          holidayByKey.get(`${country}|${date}`)
          ?? holidayByKey.get(`Global|${date}`)
          ?? holidayByKey.get(`United States|${date}`)
          ?? "",
        restDay: isRestDay(date, restDaysStr),
        unreviewed: reviewed == null,
      };
    });

    // A contractor with nothing at all this week — no time, no leave, no
    // holiday — is left out rather than exported as a row of dashes for
    // everyone who had not started yet.
    if (!days.some((d) => d.minutes > 0 || d.leave || d.holiday)) continue;

    rows.push({
      weekStart,
      weekEnd,
      name: (p.fullName ?? "").trim() || email,
      contractorId: (p.contractorId ?? "").trim(),
      email,
      payCategory: (p.payCategory ?? "").trim(),
      department: (p.department ?? "").trim(),
      country,
      days,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { rows };
}
