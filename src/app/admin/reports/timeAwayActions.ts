"use server";

import { prisma } from "@/lib/prisma";
import { countryFromLocation } from "@/lib/countryTimeZones";
import { addDaysIso, sundayOf } from "@/lib/weekUtils";
import { leaveTypeDisplayLabel, requestStatusDisplayLabel, leaveBucketFor } from "@/lib/timeOffBalances";

/**
 * Data for the Time Away Report: one row per leave request touching a single
 * Sun→Sat week.
 *
 * Requests that OVERLAP the week, not ones filed during it. A request filed in
 * August for days in September belongs to the September week it covers —
 * that's the week someone reporting on absence is asking about. The filed date
 * rides along as its own column so the notice period stays visible.
 *
 * No salary gate: leave carries hours and balances, never money.
 */

export type TimeAwayReportRow = {
  weekStart: string;
  weekEnd: string;
  name: string;
  contractorId: string;
  email: string;
  payCategory: string;
  department: string;
  country: string;
  /** Relabelled for display — "Time Away", "Medical Unavailability", … */
  type: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  /** Hours this request deducts, and which balance it draws them from. */
  hours: number;
  bucket: string;
  status: string;
  reason: string;
  filedOn: string;
};

export type TimeAwayReportResult = {
  rows: TimeAwayReportRow[];
  error?: string;
};

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Which balance the request draws on, in the wording the portals now use. */
function bucketLabel(type: string): string {
  const bucket = leaveBucketFor(type);
  return bucket === "pto" ? "Time Away"
    : bucket === "specialLeave" ? "Special Leave"
    : "Medical Unavailability";
}

export async function fetchTimeAwayReport(params: {
  week: string;
  payCategory: string;
  department: string;
  status: string;
}): Promise<TimeAwayReportResult> {
  const weekStart = sundayOf(params.week);
  if (!weekStart) return { rows: [], error: "Pick a week." };
  const weekEnd = addDaysIso(weekStart, 6);

  const [requests, profiles] = await Promise.all([
    // Overlap test on the stored "YYYY-MM-DD" strings: starts on or before the
    // week ends, and ends on or after it begins.
    prisma.contractorLeaveRequest.findMany({
      where: { startDate: { lte: weekEnd }, endDate: { gte: weekStart } },
      select: {
        email: true, type: true, startDate: true, endDate: true, durationDays: true,
        reason: true, status: true, createdAt: true,
        ptoUsedHours: true, sickLeaveUsedHours: true, specialLeaveUsedHours: true,
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.contractorProfile.findMany({
      select: { email: true, fullName: true, contractorId: true, payCategory: true, department: true, location: true },
    }),
  ]);

  const profileByEmail = new Map(profiles.map((p) => [norm(p.email), p]));

  const rows: TimeAwayReportRow[] = [];
  for (const r of requests) {
    const profile = profileByEmail.get(norm(r.email));
    const payCategory = (profile?.payCategory ?? "").trim();
    const department = (profile?.department ?? "").trim();

    if (params.payCategory !== "All" && payCategory !== params.payCategory) continue;
    if (params.department !== "All" && department !== params.department) continue;
    // Filtered on the stored value, not the relabelled one, so "Declined"
    // still matches the "Rejected" rows behind it.
    if (params.status !== "All" && r.status !== params.status) continue;

    // Whichever bucket the request stamped its hours on. Advance overrides
    // write to sickLeaveUsedHours whichever pool they draw from, so the hours
    // are read from the column rather than inferred from the type.
    const hours = r.ptoUsedHours + r.sickLeaveUsedHours + r.specialLeaveUsedHours;

    rows.push({
      weekStart,
      weekEnd,
      name: (profile?.fullName ?? "").trim() || norm(r.email),
      contractorId: (profile?.contractorId ?? "").trim(),
      email: norm(r.email),
      payCategory,
      department,
      country: countryFromLocation(profile?.location ?? ""),
      type: leaveTypeDisplayLabel(r.type),
      startDate: r.startDate,
      endDate: r.endDate,
      durationDays: r.durationDays,
      hours,
      bucket: bucketLabel(r.type),
      status: requestStatusDisplayLabel(r.status),
      reason: (r.reason ?? "").trim(),
      filedOn: r.createdAt.toISOString().slice(0, 10),
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name) || a.startDate.localeCompare(b.startDate));
  return { rows };
}
