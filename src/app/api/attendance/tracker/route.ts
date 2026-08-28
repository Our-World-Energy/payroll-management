import { prisma } from "@/lib/prisma";
import { ARIZONA_TIME_ZONE, utcInstantForLocalTime } from "@/lib/countryTimeZones";
import { LATE_GRACE_MINUTES, SHIFTING_SCHEDULE, parseShiftTime, scheduledMinutes } from "@/app/admin/contractors/shiftScheduleShared";

/**
 * Attendance across everyone for either one day or a date range, for the
 * Reports → Attendance Tracker page: each contractor's actual clock-in /
 * clock-out plus the project/task rows that make up the time.
 *
 *   GET /api/attendance/tracker?date=2026-08-24
 *   GET /api/attendance/tracker?from=2026-08-23&to=2026-08-29
 *
 * The per-day rules (late, over break, undertime, absent) are evaluated one day
 * at a time and then counted, so a range never invents its own thresholds — a
 * week's "2 late days" is exactly what the daily view would have shown twice.
 *
 * This is the bulk counterpart to /api/attendance/user-breakdown (one user,
 * one week). Doing it in a single route keeps the report to one round trip
 * instead of one request per contractor.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TrackerTask = {
  projectName: string;
  taskName: string;
  category: string;
  /** Total across the whole range. */
  minutes: number;
  /** Minutes per date, keyed YYYY-MM-DD. Only dates actually worked appear, so
   *  a missing key means this task wasn't touched that day. */
  minutesByDate: Record<string, number>;
};

type TrackerRow = {
  worksnapUserId: number;
  userName: string;
  email: string;
  department: string;
  shiftType: string;
  payCategory: string;
  location: string;
  // Single day: that day's clock times. Range: earliest clock-in and latest
  // clock-out seen, with the day each fell on so neither reads as a daily value.
  timeIn: string | null;
  timeOut: string | null;
  timeInDate: string | null;
  timeOutDate: string | null;
  totalMins: number;
  tasks: TrackerTask[];
  // Lateness is decided here rather than on the page: the shift start lives in
  // contractor_profiles.shiftHours as free text and the comparison needs the
  // raw clock-in instant, both of which stay server-side.
  isLate: boolean;
  lateByMins: number | null;
  // Whether this row is an Active contractor in Contractor Details. False for
  // Worksnap-only users and for dismissed contractors who still logged time —
  // both would otherwise inflate the Active / Present / Absent headcounts.
  isActiveContractor: boolean;
  // The shift window in force. On a single day, that date's window; over a
  // range, the window only when every scheduled day shares one (otherwise blank,
  // since there is no single answer). For a Shifting Schedule contractor these
  // come from contractor_shift_schedule; for a Fixed contractor from shiftHours.
  shiftStart: string;
  shiftEnd: string;
  expectedMins: number | null;
  // Range aggregates. On a single day these collapse to 0/1 and the day-level
  // fields above are what the page uses.
  /** Typical Non-Working Days from Contractor Details, e.g. "Saturday,Sunday". */
  restDay: string;
  /** Nothing logged on any working day in the range. Rest days are excluded, so
   *  a contractor whose whole range is rest days is not reported absent. */
  isAbsentInRange: boolean;
  days: number;
  daysLogged: number;
  lateDays: number;
  overBreakDays: number;
  undertimeDays: number;
  absentDays: number;
  // One entry per date in the range, in order — so a week view can show each
  // day's scheduled window and actual clock times rather than one collapsed
  // pair. Length is 1 in single-day mode, where the row fields above say the
  // same thing.
  perDay: TrackerDay[];
};

type TrackerDay = {
  date: string;
  shiftStart: string;
  shiftEnd: string;
  timeIn: string | null;
  timeOut: string | null;
  mins: number;
  isLate: boolean;
  lateByMins: number | null;
  /** Whether this date falls on one of the contractor's Typical Non-Working
   *  Days. A rest day with no time logged is not an absence. */
  isRestDay: boolean;
  /** Not a rest day and nothing logged — the actual absence test. */
  isAbsent: boolean;
  /** What the Absent column reports for this day. See ABSENCE_CODE below. */
  absenceCode: AbsenceCode;
  /** Some time logged but under half a day. Requires time to have been logged —
   *  zero minutes is an absence, not a half day. */
  isHalfDay: boolean;
  /** NCNS derived from the data: an unexplained absence. */
  ncnsDefault: boolean;
  /** An admin's override of that verdict, or null when none is recorded. */
  ncnsOverride: boolean | null;
  /** The reason the admin gave for the override; empty when there is none. */
  ncnsReason: string;
  /** The approved PTO request type covering this date ("PTO", "PTO Half Day"),
   *  or empty when none. Reported whatever the logged time, since it is a fact
   *  about the date rather than a verdict on attendance. */
  ptoType: string;
  /** The approved Sick Leave request type covering this date, same rules. */
  silType: string;
  /** Break minutes logged that day, for the per-day Over Break verdict. */
  breakMins: number;
  /** The day's resolved expected minutes — its scheduled window when it has
   *  one, otherwise the standard full day. What Undertime measures against. */
  expectedMins: number;
};

// Mirrors the page's own rules so the range counts and the daily badges agree.
const BREAK_ALLOWANCE_MINUTES = 30;
const FULL_DAY_MINUTES = 480;

/**
 * What the Absent column reports for one day:
 *   "HO"       — a United States holiday falls on it
 *   "PTO/SIL"  — an approved PTO or Sick Leave request covers it
 *   "Rest day" — one of the contractor's Typical Non-Working Days
 *   "Absent"   — a working day with no time logged at all
 *   "No"       — any time logged, so not an absence
 *
 * The reason codes are only reached when nothing was logged: someone who worked
 * on a holiday reads "No", because the column answers "is this person missing",
 * not "was this a special day".
 */
type AbsenceCode = "No" | "Absent" | "PTO/SIL" | "HO" | "Rest day";

// Under this much logged time — but more than none — a day counts as a half day.
const HALF_DAY_MINUTES = 240;

function isBreakTask(category: string, taskName: string) {
  return `${category} ${taskName}`.toLowerCase().includes("break");
}

// contractor_profiles.restDay is free text — "Saturday,Sunday" on most rows,
// "Saturday, Sunday" on others — so it's split on any of , ; / and matched by
// day name, the same normalisation Contractor Details applies.
function isRestDayDate(dateIso: string, restDay: string) {
  const raw = (restDay ?? "").trim();
  if (!raw || raw === "-" || raw === "—") return false;
  // Formatted in UTC because dateIso is a bare calendar date; using the server's
  // local zone could shift it to the previous or next weekday.
  const weekday = new Date(`${dateIso}T00:00:00.000Z`)
    .toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })
    .toLowerCase();
  return raw.split(/[,;/]/).map((d) => d.trim().toLowerCase()).includes(weekday);
}

// Work first, then meetings/training, then breaks — so a contractor's actual
// output reads before the time that surrounds it. Mirrors the page's own
// classification, which drives the task chip colours.
function taskKindRank(category: string, taskName: string) {
  if (isBreakTask(category, taskName)) return 2;
  const label = `${category} ${taskName}`.toLowerCase();
  if (label.includes("meeting") || label.includes("training")) return 1;
  return 0;
}

// Actual clock times are rendered in Arizona time with seconds — firstIn/lastOut
// are Timestamptz, so this is a straight zone conversion. Seconds are kept
// because firstInLogged/lastOutLogged are real punch instants, not the rounded
// 10-minute Worksnap buckets.
function formatArizonaClock(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: ARIZONA_TIME_ZONE,
  });
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function datesInRange(from: string, to: string) {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    out.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Guards against a typo'd range pulling months of rows into memory.
const MAX_RANGE_DAYS = 31;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const from = searchParams.get("from") ?? date;
  const to = searchParams.get("to") ?? date;

  if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return Response.json({ error: "Missing or invalid date (expected YYYY-MM-DD, or from/to)." }, { status: 400 });
  }
  if (from > to) {
    return Response.json({ error: "`from` must be on or before `to`." }, { status: 400 });
  }

  const dates = datesInRange(from, to);
  if (dates.length > MAX_RANGE_DAYS) {
    return Response.json({ error: `Range too long — ${MAX_RANGE_DAYS} days maximum.` }, { status: 400 });
  }

  const rangeStart = new Date(`${from}T00:00:00.000Z`);
  const rangeEnd = new Date(`${to}T00:00:00.000Z`);

  const [entries, logs, profiles, shiftSchedules, usHolidays, approvedLeave, ncnsOverrides] = await Promise.all([
    prisma.worksnapEntry.findMany({
      where: { entryDate: { gte: rangeStart, lte: rangeEnd } },
      select: { worksnapUserId: true, userName: true, email: true, entryDate: true, projectName: true, taskName: true, category: true, durationMins: true },
    }),
    prisma.worksnapDailyLog.findMany({
      where: { entryDate: { gte: rangeStart, lte: rangeEnd } },
      select: { worksnapUserId: true, userName: true, email: true, entryDate: true, firstIn: true, lastOut: true, firstInLogged: true, lastOutLogged: true, totalMins: true },
    }),
    prisma.contractorProfile.findMany({
      select: {
        email: true, department: true, fullName: true, firstName: true, surname: true, status: true,
        // Feed the report's Pay Category / Shift Type / Country filters, and
        // the Late check.
        shiftType: true, payCategory: true, location: true, shiftHours: true,
        // Typical Non-Working Days — a rest day with no time is not an absence.
        restDay: true,
      },
    }),
    // Per-date overrides for Shifting Schedule contractors, across the range.
    prisma.contractorShiftSchedule.findMany({
      where: { date: { gte: rangeStart, lte: rangeEnd } },
      select: { email: true, date: true, shiftStart: true, shiftEnd: true },
    }),
    // United States holidays in the range — the "HO" code.
    prisma.holiday.findMany({
      where: { country: "United States", date: { gte: rangeStart, lte: rangeEnd } },
      select: { date: true, name: true },
    }),
    // Approved PTO / Sick Leave overlapping the range — the "PTO/SIL" code.
    // startDate/endDate are stored as YYYY-MM-DD strings, which compare
    // correctly as strings, so the overlap test needs no date parsing.
    prisma.contractorLeaveRequest.findMany({
      where: { status: "Approved", startDate: { lte: to }, endDate: { gte: from } },
      select: { email: true, type: true, startDate: true, endDate: true },
    }),
    // Admin NCNS overrides in the range.
    prisma.attendanceNcns.findMany({
      where: { date: { gte: rangeStart, lte: rangeEnd } },
      select: { email: true, date: true, isNcns: true, reason: true },
    }),
  ]);

  const profileByEmail = new Map(
    profiles
      .filter((p) => p.email)
      .map((p) => [p.email.trim().toLowerCase(), p])
  );

  // email + date -> that day's assigned window.
  const scheduleByEmailDate = new Map(
    shiftSchedules.map((s) => [`${s.email.trim().toLowerCase()}|${toIsoDate(s.date)}`, s])
  );

  const usHolidayDates = new Set(usHolidays.map((h) => toIsoDate(h.date)));

  const ncnsByEmailDate = new Map(
    ncnsOverrides.map((n) => [`${n.email.trim().toLowerCase()}|${toIsoDate(n.date)}`, n])
  );

  // Only PTO and Sick Leave count towards "PTO/SIL" — Unpaid, Special and the
  // Advance variants aren't what the code is meant to report. Half days are
  // included since they are still the same two kinds of leave.
  const ptoSilLeave = approvedLeave.filter((r) => {
    const type = r.type.toLowerCase();
    return type.startsWith("pto") || type.startsWith("sick leave");
  });

  function hasPtoOrSickOn(email: string, dateIso: string) {
    return ptoSilLeave.some((r) =>
      r.email.trim().toLowerCase() === email && dateIso >= r.startDate && dateIso <= r.endDate
    );
  }

  // The PTO and Sick Leave columns report their own kind only, unlike the
  // Absent column's combined "PTO/SIL" code. "Advance Sick Leave" is a distinct
  // request type and is deliberately not counted as Sick Leave here.
  function leaveTypeOn(prefix: string) {
    const matching = approvedLeave.filter((r) => r.type.toLowerCase().startsWith(prefix));
    return (email: string, dateIso: string) => {
      const match = matching.find((r) =>
        r.email.trim().toLowerCase() === email && dateIso >= r.startDate && dateIso <= r.endDate
      );
      return match?.type ?? "";
    };
  }

  const ptoTypeOn = leaveTypeOn("pto");
  const silTypeOn = leaveTypeOn("sick leave");

  // The shift window in force for one contractor on one date. A Shifting
  // Schedule contractor is driven entirely by their own per-date row — with no
  // row for the date they simply have no window, rather than silently falling
  // back to a company-wide default that was never theirs.
  function shiftWindowFor(email: string, dateIso: string) {
    const key = email.toLowerCase();
    const profile = key ? profileByEmail.get(key) : undefined;
    const shiftType = profile?.shiftType?.trim() ?? "";

    if (shiftType === SHIFTING_SCHEDULE) {
      const scheduled = scheduleByEmailDate.get(`${key}|${dateIso}`);
      if (!scheduled) return { shiftStart: "", shiftEnd: "", expectedMins: null as number | null };
      return {
        shiftStart: scheduled.shiftStart,
        shiftEnd: scheduled.shiftEnd,
        expectedMins: scheduledMinutes(scheduled.shiftStart, scheduled.shiftEnd),
      };
    }

    if (shiftType.toLowerCase() === "fixed") {
      const [start = "", end = ""] = (profile?.shiftHours ?? "").split(" to ").map((v) => v.trim());
      // expectedMins is deliberately left null for Fixed contractors: their
      // shiftHours is long-standing free text and some rows are malformed
      // (e.g. "9:00 AM to 5:00 AM" computes to a 20-hour day), which would
      // silently change the Undertime figures that already exist for them.
      // Only Shifting Schedule contractors — whose hours are entered per date
      // through the new modal — drive expected hours off their window.
      return { shiftStart: start, shiftEnd: end, expectedMins: null as number | null };
    }

    return { shiftStart: "", shiftEnd: "", expectedMins: null as number | null };
  }

  // ── Per (user, day) accumulation ──────────────────────────────────────────
  type DayAcc = {
    totalMins: number;
    breakMins: number;
    hasTasks: boolean;
    clockIn: Date | null;
    clockOut: Date | null;
    logTotalMins: number | null;
  };

  const identityByUser = new Map<number, { userName: string; email: string }>();
  const dayByUser = new Map<number, Map<string, DayAcc>>();
  // Tasks are summed across the whole range — that is the figure the report's
  // Task Total Time column shows.
  const taskByUser = new Map<number, Map<string, TrackerTask>>();

  function dayAcc(userId: number, dateIso: string): DayAcc {
    let days = dayByUser.get(userId);
    if (!days) {
      days = new Map();
      dayByUser.set(userId, days);
    }
    let acc = days.get(dateIso);
    if (!acc) {
      acc = { totalMins: 0, breakMins: 0, hasTasks: false, clockIn: null, clockOut: null, logTotalMins: null };
      days.set(dateIso, acc);
    }
    return acc;
  }

  function noteIdentity(userId: number, userName: string, email: string) {
    if (!identityByUser.has(userId)) {
      identityByUser.set(userId, { userName: userName?.trim() ?? "", email: email?.trim() ?? "" });
    }
  }

  for (const entry of entries) {
    noteIdentity(entry.worksnapUserId, entry.userName, entry.email);
    const dateIso = toIsoDate(entry.entryDate);
    const acc = dayAcc(entry.worksnapUserId, dateIso);
    acc.totalMins += entry.durationMins;
    acc.hasTasks = true;
    if (isBreakTask(entry.category, entry.taskName)) acc.breakMins += entry.durationMins;

    let tasks = taskByUser.get(entry.worksnapUserId);
    if (!tasks) {
      tasks = new Map();
      taskByUser.set(entry.worksnapUserId, tasks);
    }
    const key = `${entry.projectName}||${entry.taskName}||${entry.category}`;
    let task = tasks.get(key);
    if (!task) {
      task = { projectName: entry.projectName, taskName: entry.taskName, category: entry.category, minutes: 0, minutesByDate: {} };
      tasks.set(key, task);
    }
    task.minutes += entry.durationMins;
    task.minutesByDate[dateIso] = (task.minutesByDate[dateIso] ?? 0) + entry.durationMins;
  }

  for (const log of logs) {
    noteIdentity(log.worksnapUserId, log.userName, log.email);
    const acc = dayAcc(log.worksnapUserId, toIsoDate(log.entryDate));
    acc.clockIn = log.firstInLogged ?? log.firstIn;
    acc.clockOut = log.lastOutLogged ?? log.lastOut;
    acc.logTotalMins = log.totalMins;
  }

  // A day with nothing logged is an absence; the code then says why. Any logged
  // time at all means not absent, whatever else the date was.
  function absenceCodeFor(dayMins: number, restDay: boolean, dateIso: string, email: string): AbsenceCode {
    if (dayMins > 0) return "No";
    // Holiday first: a US holiday is company-wide and shouldn't be reported as
    // leave the contractor spent.
    if (usHolidayDates.has(dateIso)) return "HO";
    if (email && hasPtoOrSickOn(email, dateIso)) return "PTO/SIL";
    if (restDay) return "Rest day";
    return "Absent";
  }

  // ── Fold each user's days into one row ────────────────────────────────────
  function buildRow(userId: number, userName: string, email: string): TrackerRow {
    const normalizedEmail = email.trim().toLowerCase();
    const profile = normalizedEmail ? profileByEmail.get(normalizedEmail) : undefined;
    const profileName = profile
      ? profile.fullName?.trim() || [profile.firstName, profile.surname].filter(Boolean).join(" ").trim()
      : "";

    const days = dayByUser.get(userId) ?? new Map<string, DayAcc>();
    const tasks = Array.from(taskByUser.get(userId)?.values() ?? []).sort((a, b) => {
      const rank = taskKindRank(a.category, a.taskName) - taskKindRank(b.category, b.taskName);
      return rank !== 0 ? rank : b.minutes - a.minutes;
    });

    let totalMins = 0;
    let daysLogged = 0;
    let lateDays = 0;
    let overBreakDays = 0;
    let undertimeDays = 0;
    let absentDays = 0;
    let workingDays = 0;
    let firstLate: { mins: number } | null = null;
    let earliestIn: { at: Date; date: string } | null = null;
    let latestOut: { at: Date; date: string } | null = null;
    const windows = new Set<string>();
    let lastWindow = { shiftStart: "", shiftEnd: "", expectedMins: null as number | null };
    const perDay: TrackerDay[] = [];

    for (const dateIso of dates) {
      const acc = days.get(dateIso);
      const window = shiftWindowFor(normalizedEmail, dateIso);
      lastWindow = window;
      if (window.shiftStart || window.shiftEnd) windows.add(`${window.shiftStart}|${window.shiftEnd}`);

      // worksnap_daily_log carries its own total; it only stands in when there
      // were no task entries to sum (so the two can't double-count).
      const dayMins = acc ? (acc.hasTasks ? acc.totalMins : acc.logTotalMins ?? 0) : 0;
      totalMins += dayMins;

      // A rest day with nothing logged is not an absence — only a working day is.
      const restDay = isRestDayDate(dateIso, profile?.restDay ?? "");
      const dayAbsent = !restDay && dayMins === 0;
      if (dayMins > 0) daysLogged++;
      if (dayAbsent) absentDays++;
      if (!restDay) workingDays++;

      if (acc && acc.breakMins > BREAK_ALLOWANCE_MINUTES) overBreakDays++;

      const expected = window.expectedMins && window.expectedMins > 0 ? window.expectedMins : FULL_DAY_MINUTES;
      if (dayMins > 0 && dayMins < expected) undertimeDays++;

      // Late = actual clock-in past that date's Shift Start + grace, in Arizona
      // time, judged against the hours the contractor actually had that day.
      // Flexible contractors have no start time and are excluded.
      const shiftStart = parseShiftTime(window.shiftStart);
      let dayLate = false;
      let dayLateBy: number | null = null;
      if (acc?.clockIn && shiftStart) {
        const startInstant = utcInstantForLocalTime(dateIso, shiftStart.hour, shiftStart.minute, ARIZONA_TIME_ZONE);
        const threshold = utcInstantForLocalTime(dateIso, shiftStart.hour, shiftStart.minute + LATE_GRACE_MINUTES, ARIZONA_TIME_ZONE);
        if (acc.clockIn.getTime() > threshold.getTime()) {
          lateDays++;
          dayLate = true;
          dayLateBy = Math.round((acc.clockIn.getTime() - startInstant.getTime()) / 60000);
          if (!firstLate) firstLate = { mins: dayLateBy };
        }
      }

      // NCNS defaults to an unexplained absence — absenceCodeFor already rules
      // out holidays, approved leave and rest days before returning "Absent".
      const dayAbsenceCode = absenceCodeFor(dayMins, restDay, dateIso, normalizedEmail);
      const override = normalizedEmail ? ncnsByEmailDate.get(`${normalizedEmail}|${dateIso}`) : undefined;

      perDay.push({
        date: dateIso,
        ncnsDefault: dayAbsenceCode === "Absent",
        ncnsOverride: override ? override.isNcns : null,
        ncnsReason: override?.reason ?? "",
        ptoType: normalizedEmail ? ptoTypeOn(normalizedEmail, dateIso) : "",
        silType: normalizedEmail ? silTypeOn(normalizedEmail, dateIso) : "",
        shiftStart: window.shiftStart,
        shiftEnd: window.shiftEnd,
        timeIn: acc?.clockIn ? formatArizonaClock(acc.clockIn) : null,
        timeOut: acc?.clockOut ? formatArizonaClock(acc.clockOut) : null,
        mins: dayMins,
        isLate: dayLate,
        lateByMins: dayLateBy,
        isRestDay: restDay,
        isAbsent: dayAbsent,
        absenceCode: dayAbsenceCode,
        isHalfDay: dayMins > 0 && dayMins < HALF_DAY_MINUTES,
        breakMins: acc?.breakMins ?? 0,
        expectedMins: expected,
      });

      if (acc?.clockIn && (!earliestIn || acc.clockIn.getTime() < earliestIn.at.getTime())) {
        earliestIn = { at: acc.clockIn, date: dateIso };
      }
      if (acc?.clockOut && (!latestOut || acc.clockOut.getTime() > latestOut.at.getTime())) {
        latestOut = { at: acc.clockOut, date: dateIso };
      }
    }

    const singleDay = dates.length === 1;
    // Over a range the window is only reported when every scheduled day shares
    // one; otherwise there is no single answer and the page shows "Varies".
    const window = singleDay || windows.size <= 1
      ? lastWindow
      : { shiftStart: "", shiftEnd: "", expectedMins: null as number | null };

    return {
      worksnapUserId: userId,
      // Contractor Details is the naming authority when the person has a
      // profile; the Worksnap display name is the fallback for users who
      // haven't been added there yet.
      userName: profileName || userName?.trim() || email.trim() || `Worksnap User ${userId}`,
      email: email.trim(),
      department: profile?.department?.trim() ?? "",
      shiftType: profile?.shiftType?.trim() ?? "",
      payCategory: profile?.payCategory?.trim() ?? "",
      location: profile?.location?.trim() ?? "",
      timeIn: earliestIn ? formatArizonaClock(earliestIn.at) : null,
      timeOut: latestOut ? formatArizonaClock(latestOut.at) : null,
      timeInDate: singleDay ? null : earliestIn?.date ?? null,
      timeOutDate: singleDay ? null : latestOut?.date ?? null,
      totalMins,
      tasks,
      isLate: lateDays > 0,
      lateByMins: firstLate?.mins ?? null,
      isActiveContractor: profile?.status === "Active",
      shiftStart: window.shiftStart,
      shiftEnd: window.shiftEnd,
      expectedMins: window.expectedMins,
      days: dates.length,
      daysLogged,
      lateDays,
      overBreakDays,
      undertimeDays,
      absentDays,
      restDay: profile?.restDay?.trim() ?? "",
      // Requires at least one working day in the range, so a range made up
      // entirely of rest days never reads as an absence.
      isAbsentInRange: daysLogged === 0 && workingDays > 0,
      perDay,
    };
  }

  const rows: TrackerRow[] = [];
  for (const [userId, identity] of identityByUser) {
    rows.push(buildRow(userId, identity.userName, identity.email));
  }

  // Active contractors with no Worksnap rows at all in the range. They have
  // nothing to be built from above, so the roster is the only place they can
  // come from — and without them the report can't report Absent.
  const trackedEmails = new Set(rows.map((row) => row.email.toLowerCase()).filter(Boolean));
  for (const p of profiles) {
    if (p.status !== "Active" || !p.email) continue;
    if (trackedEmails.has(p.email.trim().toLowerCase())) continue;
    rows.push(buildRow(0, p.fullName?.trim() || [p.firstName, p.surname].filter(Boolean).join(" ").trim() || p.email.trim(), p.email));
  }

  rows.sort((a, b) => a.userName.localeCompare(b.userName));

  return Response.json({ from, to, date: dates.length === 1 ? from : null, days: dates.length, rows });
}
