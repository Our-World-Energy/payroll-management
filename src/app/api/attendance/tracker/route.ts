import { prisma } from "@/lib/prisma";
import { ARIZONA_TIME_ZONE, utcInstantForLocalTime } from "@/lib/countryTimeZones";
import { SHIFTING_SCHEDULE, parseShiftTime, scheduledMinutes } from "@/app/admin/contractors/shiftScheduleShared";

/**
 * One calendar day of attendance across everyone, for the Reports → Attendance
 * Tracker page: each contractor's actual clock-in / clock-out plus the
 * project/task rows that make up that day's time.
 *
 *   GET /api/attendance/tracker?date=2026-08-24
 *
 * This is the bulk counterpart to /api/attendance/user-breakdown (one user,
 * one week). Doing it in a single route keeps the report to one round trip
 * instead of one request per contractor.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TrackerTask = { projectName: string; taskName: string; category: string; minutes: number };

type TrackerRow = {
  worksnapUserId: number;
  userName: string;
  email: string;
  department: string;
  shiftType: string;
  location: string;
  timeIn: string | null;
  timeOut: string | null;
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
  // The shift window actually in force on this date, and how long it is.
  // For a Shifting Schedule contractor these come from that date's row in
  // contractor_shift_schedule; for a Fixed contractor from shiftHours.
  // expectedMins is null when no window applies (Flexible, or an unscheduled
  // date), which means the report falls back to a standard full day.
  shiftStart: string;
  shiftEnd: string;
  expectedMins: number | null;
};

// A clock-in at exactly Shift Start + 15 min is still on time; one minute past
// that is late. Matches the Dashboard and NotificationBell.
const LATE_GRACE_MINUTES = 15;

// Actual clock times are rendered in Arizona time with seconds — firstIn/lastOut
// are Timestamptz, so this is a straight zone conversion. Seconds are kept
// because firstInLogged/lastOutLogged are real punch instants, not the rounded
// 10-minute Worksnap buckets.
function formatArizonaClock(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: ARIZONA_TIME_ZONE,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "Missing or invalid date (expected YYYY-MM-DD)." }, { status: 400 });
  }

  const day = new Date(`${date}T00:00:00.000Z`);

  const [entries, logs, profiles, shiftSchedules] = await Promise.all([
    prisma.worksnapEntry.findMany({
      where: { entryDate: day },
      select: { worksnapUserId: true, userName: true, email: true, projectName: true, taskName: true, category: true, durationMins: true },
    }),
    prisma.worksnapDailyLog.findMany({
      where: { entryDate: day },
      select: { worksnapUserId: true, userName: true, email: true, firstIn: true, lastOut: true, firstInLogged: true, lastOutLogged: true, totalMins: true },
    }),
    prisma.contractorProfile.findMany({
      select: {
        email: true, department: true, fullName: true, firstName: true, surname: true, status: true,
        // Feed the report's Shift Type and Country filters, and the Late check.
        shiftType: true, location: true, shiftHours: true,
      },
    }),
    // Per-date overrides for Shifting Schedule contractors — only this one day.
    prisma.contractorShiftSchedule.findMany({
      where: { date: day },
      select: { email: true, shiftStart: true, shiftEnd: true },
    }),
  ]);

  const profileByEmail = new Map(
    profiles
      .filter((p) => p.email)
      .map((p) => [p.email.trim().toLowerCase(), p])
  );

  const scheduleByEmail = new Map(
    shiftSchedules.map((s) => [s.email.trim().toLowerCase(), s])
  );

  // The shift window in force for one contractor on this date. A Shifting
  // Schedule contractor is driven entirely by their own per-date row — with no
  // row for the date they simply have no window, rather than silently falling
  // back to a company-wide default that was never theirs.
  function shiftWindowFor(email: string) {
    const profile = email ? profileByEmail.get(email.toLowerCase()) : undefined;
    const shiftType = profile?.shiftType?.trim() ?? "";

    if (shiftType === SHIFTING_SCHEDULE) {
      const scheduled = email ? scheduleByEmail.get(email.toLowerCase()) : undefined;
      if (!scheduled) return { shiftStart: "", shiftEnd: "", expectedMins: null };
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
      return { shiftStart: start, shiftEnd: end, expectedMins: null };
    }

    return { shiftStart: "", shiftEnd: "", expectedMins: null };
  }

  const rowsByUser = new Map<number, TrackerRow>();

  function rowFor(worksnapUserId: number, userName: string, email: string): TrackerRow {
    const existing = rowsByUser.get(worksnapUserId);
    if (existing) return existing;

    const normalizedEmail = email.trim().toLowerCase();
    const profile = normalizedEmail ? profileByEmail.get(normalizedEmail) : undefined;
    const profileName = profile
      ? profile.fullName?.trim() || [profile.firstName, profile.surname].filter(Boolean).join(" ").trim()
      : "";

    const row: TrackerRow = {
      worksnapUserId,
      // Contractor Details is the naming authority when the person has a
      // profile; the Worksnap display name is the fallback for users who
      // haven't been added there yet.
      userName: profileName || userName?.trim() || email.trim() || `Worksnap User ${worksnapUserId}`,
      email: email.trim(),
      department: profile?.department?.trim() ?? "",
      shiftType: profile?.shiftType?.trim() ?? "",
      location: profile?.location?.trim() ?? "",
      timeIn: null,
      timeOut: null,
      totalMins: 0,
      tasks: [],
      isLate: false,
      lateByMins: null,
      isActiveContractor: profile?.status === "Active",
      ...shiftWindowFor(email.trim()),
    };
    rowsByUser.set(worksnapUserId, row);
    return row;
  }

  // Task rows first, then clock-in/out — a contractor can have either without
  // the other (tracked time with no daily-log row, or vice versa), and both
  // shapes need to appear in the report.
  const taskIndexByUser = new Map<number, Map<string, TrackerTask>>();
  for (const entry of entries) {
    const row = rowFor(entry.worksnapUserId, entry.userName, entry.email);
    const key = `${entry.projectName}||${entry.taskName}||${entry.category}`;
    let index = taskIndexByUser.get(entry.worksnapUserId);
    if (!index) {
      index = new Map();
      taskIndexByUser.set(entry.worksnapUserId, index);
    }
    let task = index.get(key);
    if (!task) {
      task = { projectName: entry.projectName, taskName: entry.taskName, category: entry.category, minutes: 0 };
      index.set(key, task);
      row.tasks.push(task);
    }
    task.minutes += entry.durationMins;
    row.totalMins += entry.durationMins;
  }

  for (const log of logs) {
    const row = rowFor(log.worksnapUserId, log.userName, log.email);
    row.timeIn = formatArizonaClock(log.firstInLogged ?? log.firstIn);
    row.timeOut = formatArizonaClock(log.lastOutLogged ?? log.lastOut);
    // worksnap_daily_log carries its own total; it only stands in when there
    // were no task entries to sum (so the two can't double-count).
    if (row.tasks.length === 0) row.totalMins = log.totalMins;

    // Late = actual clock-in past that date's Shift Start + grace, in Arizona
    // time. The start comes from row.shiftStart, which is this date's Shifting
    // Schedule row when the contractor has one and shiftHours otherwise — so a
    // shifting contractor is judged against the hours they were actually given
    // for the day. Flexible contractors have no start time and are excluded.
    const shiftStart = parseShiftTime(row.shiftStart);
    if (shiftStart) {
      const clockIn = log.firstInLogged ?? log.firstIn;
      const startInstant = utcInstantForLocalTime(date, shiftStart.hour, shiftStart.minute, ARIZONA_TIME_ZONE);
      const threshold = utcInstantForLocalTime(date, shiftStart.hour, shiftStart.minute + LATE_GRACE_MINUTES, ARIZONA_TIME_ZONE);
      if (clockIn.getTime() > threshold.getTime()) {
        row.isLate = true;
        row.lateByMins = Math.round((clockIn.getTime() - startInstant.getTime()) / 60000);
      }
    }
  }

  // Active contractors with no Worksnap time at all that day. They have no
  // Worksnap rows to be built from above, so the roster is the only place they
  // can come from — and without them the report can't report Absent.
  const trackedEmails = new Set(
    Array.from(rowsByUser.values()).map((row) => row.email.toLowerCase()).filter(Boolean)
  );
  const absentRows: TrackerRow[] = profiles
    .filter((p) => p.status === "Active" && p.email && !trackedEmails.has(p.email.trim().toLowerCase()))
    .map((p) => ({
      worksnapUserId: 0,
      userName: p.fullName?.trim() || [p.firstName, p.surname].filter(Boolean).join(" ").trim() || p.email.trim(),
      email: p.email.trim(),
      department: p.department?.trim() ?? "",
      shiftType: p.shiftType?.trim() ?? "",
      location: p.location?.trim() ?? "",
      timeIn: null,
      timeOut: null,
      totalMins: 0,
      tasks: [],
      isLate: false,
      lateByMins: null,
      isActiveContractor: true, // filtered to status === "Active" above
      ...shiftWindowFor(p.email.trim()),
    }));

  const rows = [...Array.from(rowsByUser.values()), ...absentRows]
    .map((row) => ({ ...row, tasks: row.tasks.sort((a, b) => b.minutes - a.minutes) }))
    .sort((a, b) => a.userName.localeCompare(b.userName));

  return Response.json({ date, rows });
}
