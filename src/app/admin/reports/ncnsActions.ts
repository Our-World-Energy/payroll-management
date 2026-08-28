"use server";

import { prisma } from "@/lib/prisma";

/**
 * NCNS (No Call No Show) overrides for the Attendance Tracker.
 *
 * The column derives Yes on a day the tracker codes "Absent" — no time logged,
 * and no US holiday, approved PTO/Sick Leave or rest day to explain it. An admin
 * can override that verdict either way, with a reason; the override is stored
 * per contractor per date and wins over the derived value.
 */

function toDbDate(dateIso: string) {
  return new Date(`${dateIso}T00:00:00.000Z`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type NcnsOverride = {
  email: string;
  date: string;
  isNcns: boolean;
  reason: string;
};

/**
 * Records the admin's verdict for one contractor-date. A reason is required:
 * the point of an override is that someone can later see why the derived
 * verdict was set aside.
 */
export async function saveNcns(
  email: string,
  date: string,
  isNcns: boolean,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const normalized = email.trim().toLowerCase();
  const trimmedReason = reason.trim();

  if (!normalized) return { ok: false, error: "A contractor email is required." };
  if (!ISO_DATE.test(date)) return { ok: false, error: "A valid date is required." };
  if (!trimmedReason) return { ok: false, error: "Please give a reason for the change." };

  try {
    await prisma.attendanceNcns.upsert({
      where: { attendance_ncns_key: { email: normalized, date: toDbDate(date) } },
      create: { email: normalized, date: toDbDate(date), isNcns, reason: trimmedReason },
      update: { isNcns, reason: trimmedReason },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the NCNS change." };
  }
}

/** Drops the override so the derived verdict applies again. */
export async function clearNcns(email: string, date: string): Promise<{ ok: boolean; error?: string }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !ISO_DATE.test(date)) return { ok: false, error: "A contractor email and date are required." };

  try {
    await prisma.attendanceNcns.deleteMany({
      where: { email: normalized, date: toDbDate(date) },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reset the NCNS value." };
  }
}
