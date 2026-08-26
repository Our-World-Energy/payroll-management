"use server";

import { prisma } from "@/lib/prisma";
import type { ShiftScheduleDay } from "./shiftScheduleShared";

/**
 * Per-contractor per-date shift windows, for contractors whose Shift Type is
 * "Shifting Schedule". Keyed on email + date — the same key the attendance
 * pipeline already joins contractors on (contractor_profiles.worksnapId is
 * blank on most profiles, see /api/attendance/daily-log).
 *
 * The SHIFTING_SCHEDULE label and the ShiftScheduleDay shape live in
 * ./shiftScheduleShared — a "use server" module may only export async
 * functions, and client components need both.
 */

// Dates are stored as DATE columns; a bare YYYY-MM-DD is pinned to UTC midnight
// so the day never shifts under the server's local zone.
function toDbDate(dateIso: string) {
  return new Date(`${dateIso}T00:00:00.000Z`);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function fetchShiftSchedule(email: string, from: string, to: string): Promise<ShiftScheduleDay[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];

  const rows = await prisma.contractorShiftSchedule.findMany({
    where: { email: normalized, date: { gte: toDbDate(from), lte: toDbDate(to) } },
    select: { date: true, shiftStart: true, shiftEnd: true },
    orderBy: { date: "asc" },
  });

  return rows.map((row) => ({
    date: toIsoDate(row.date),
    shiftStart: row.shiftStart,
    shiftEnd: row.shiftEnd,
  }));
}

/**
 * Upserts one week's worth of days. A day with both times blank is deleted
 * rather than stored empty, so clearing a row in the modal genuinely removes
 * that date's override instead of leaving an unparsable schedule behind.
 */
export async function saveShiftSchedule(email: string, days: ShiftScheduleDay[]): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("A contractor email is required to save a shift schedule.");

  const toDelete = days.filter((d) => !d.shiftStart.trim() || !d.shiftEnd.trim());
  const toUpsert = days.filter((d) => d.shiftStart.trim() && d.shiftEnd.trim());

  if (toDelete.length) {
    await prisma.contractorShiftSchedule.deleteMany({
      where: { email: normalized, date: { in: toDelete.map((d) => toDbDate(d.date)) } },
    });
  }

  // Sequential rather than concurrent: these all hit the same (email, date)
  // unique index, and the pooled Supabase connection is happier with one write
  // at a time than with seven racing upserts.
  for (const day of toUpsert) {
    await prisma.contractorShiftSchedule.upsert({
      where: { contractor_shift_schedule_key: { email: normalized, date: toDbDate(day.date) } },
      create: {
        email: normalized,
        date: toDbDate(day.date),
        shiftStart: day.shiftStart.trim(),
        shiftEnd: day.shiftEnd.trim(),
      },
      update: { shiftStart: day.shiftStart.trim(), shiftEnd: day.shiftEnd.trim() },
    });
  }
}
