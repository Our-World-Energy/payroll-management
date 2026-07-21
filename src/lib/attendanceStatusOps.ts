import type { Prisma, PrismaClient } from "@prisma/client";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

// Shared by the single-contractor save (Attendance Review) and the bulk save
// (Bulk Approve) so both build the exact same Prisma operations for a
// worksnapUserId/week/days payload — kept here instead of duplicated in both
// route files.

const TIME_OFF = ["HO_HOLIDAY", "PTO", "SICK_LEAVE", "SICK_LEAVE_HALF_DAY", "PTO_HALF_DAY", "UNPAID_LEAVE", "OPEN", "NOT_SET"] as const;
const REQUEST = ["APPROVED", "REJECTED", "OPEN", "NOT_SET"] as const;
type TimeOff = (typeof TIME_OFF)[number];
type Req = (typeof REQUEST)[number];
const asTimeOff = (v: unknown): TimeOff => (TIME_OFF.includes(v as TimeOff) ? (v as TimeOff) : "NOT_SET");
const asReq = (v: unknown): Req => (REQUEST.includes(v as Req) ? (v as Req) : "NOT_SET");
const asInt = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : fallback);
const asNullableInt = (v: unknown) => (v == null ? null : Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);

export type DayInput = {
  date?: unknown;
  decisionStatus?: unknown;
  evaluatedMinutes?: unknown;
  adjustedMinutes?: unknown;
  holidayMinutes?: unknown;
  localHoliday?: unknown;
  localHolidayMinutes?: unknown;
  evaluatedRegularMinutes?: unknown;
  regularOtMinutes?: unknown;
  rdOtMinutes?: unknown;
  hoOtMinutes?: unknown;
  timeOffStatus?: unknown;
  timeOffMinutes?: unknown;
  manualAdjustmentTime?: unknown;
  note?: unknown;
};

export type AttendanceStatusInput = {
  worksnapUserId?: unknown;
  email?: unknown;
  week?: unknown;
  requestStatus?: unknown;
  completionMinutes?: unknown;
  days?: unknown;
};

export function buildAttendanceStatusOps(
  client: PrismaLike,
  body: AttendanceStatusInput
): { ok: true; ops: Prisma.PrismaPromise<unknown>[] } | { ok: false; error: string } {
  const worksnapUserId = Number(body.worksnapUserId);
  const week = typeof body.week === "string" ? body.week : "";
  if (!worksnapUserId || !week) {
    return { ok: false, error: "worksnapUserId and week are required" };
  }
  const email = typeof body.email === "string" ? body.email : "";
  const weekStart = new Date(`${week}T00:00:00.000Z`);
  const requestStatus = asReq(body.requestStatus);
  const completionMinutes = Number.isFinite(Number(body.completionMinutes)) ? Math.trunc(Number(body.completionMinutes)) : null;
  const days = Array.isArray(body.days) ? (body.days as DayInput[]) : [];

  // Derived from the same per-day values being saved below, so the week totals
  // can never drift from their own days.
  const localHolidayMinutesPerDay = days.map((d) => asNullableInt(d.localHolidayMinutes));
  const totalLocalHolidayMinutes = localHolidayMinutesPerDay.some((v) => v != null)
    ? localHolidayMinutesPerDay.reduce((sum: number, v) => sum + (v ?? 0), 0)
    : null;
  const sumDayField = (field: keyof DayInput) => days.reduce((sum: number, d) => sum + asInt(d[field]), 0);
  const totalEvaluatedRegularMinutes = sumDayField("evaluatedRegularMinutes");
  const totalEvaluatedMinutes = sumDayField("evaluatedMinutes");
  const totalUsHoMinutes = sumDayField("holidayMinutes");
  const totalRegularOtMinutes = sumDayField("regularOtMinutes");
  const totalRdOtMinutes = sumDayField("rdOtMinutes");
  const totalHoOtMinutes = sumDayField("hoOtMinutes");

  const ops: Prisma.PrismaPromise<unknown>[] = [
    // week-level request status + saved completion time
    client.attendanceWeekStatus.upsert({
      where: { attendance_week_key: { worksnapUserId, weekStart } },
      create: {
        worksnapUserId, email, weekStart, requestStatus, completionMinutes, totalLocalHolidayMinutes,
        totalEvaluatedRegularMinutes, totalEvaluatedMinutes, totalUsHoMinutes, totalRegularOtMinutes, totalRdOtMinutes, totalHoOtMinutes,
      },
      update: {
        email, requestStatus, completionMinutes, totalLocalHolidayMinutes,
        totalEvaluatedRegularMinutes, totalEvaluatedMinutes, totalUsHoMinutes, totalRegularOtMinutes, totalRdOtMinutes, totalHoOtMinutes,
      },
    }),
    // per-day attendance review snapshot
    ...days
      .filter((d) => typeof d.date === "string")
      .map((d) => {
        const date = new Date(`${d.date as string}T00:00:00.000Z`);
        const decisionStatus = asReq(d.decisionStatus);
        const evaluatedMinutes = asInt(d.evaluatedMinutes);
        const adjustedMinutes = asNullableInt(d.adjustedMinutes);
        const holidayMinutes = asInt(d.holidayMinutes);
        const localHoliday = typeof d.localHoliday === "string" && d.localHoliday.trim() ? d.localHoliday.trim() : null;
        const localHolidayMinutes = asNullableInt(d.localHolidayMinutes);
        const evaluatedRegularMinutes = asInt(d.evaluatedRegularMinutes);
        const regularOtMinutes = asInt(d.regularOtMinutes);
        const rdOtMinutes = asInt(d.rdOtMinutes);
        const hoOtMinutes = asInt(d.hoOtMinutes);
        const timeOffStatus = asTimeOff(d.timeOffStatus);
        const timeOffMinutes = asInt(d.timeOffMinutes);
        const manualAdjustmentTime = asInt(d.manualAdjustmentTime);
        const note = typeof d.note === "string" && d.note.trim() ? d.note.trim() : null;
        const fields = {
          email, decisionStatus, evaluatedMinutes, adjustedMinutes, holidayMinutes, localHoliday, localHolidayMinutes,
          evaluatedRegularMinutes, regularOtMinutes, rdOtMinutes, hoOtMinutes,
          timeOffStatus, timeOffMinutes, manualAdjustmentTime, note,
        };
        return client.attendanceDayStatus.upsert({
          where: { attendance_day_key: { worksnapUserId, date } },
          create: { worksnapUserId, date, ...fields },
          update: fields,
        });
      }),
  ];

  return { ok: true, ops };
}
