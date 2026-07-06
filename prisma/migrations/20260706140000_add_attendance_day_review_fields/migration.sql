-- AlterEnum
-- 'SICK_LEAVE' and 'UNPAID_LEAVE' already exist on this database from a prior
-- migration attempt that was rolled back at the table/column level only
-- (Postgres does not support dropping enum values), so no ALTER TYPE needed here.

-- AlterTable
ALTER TABLE "attendance_day_status"
  ADD COLUMN "decisionStatus" "AttendanceRequestStatus" NOT NULL DEFAULT 'NOT_SET',
  ADD COLUMN "evaluatedMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "adjustedMinutes" INTEGER,
  ADD COLUMN "holidayMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "timeOffMinutes" INTEGER NOT NULL DEFAULT 0;
