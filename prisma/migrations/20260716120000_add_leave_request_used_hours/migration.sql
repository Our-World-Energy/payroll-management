-- AlterTable
ALTER TABLE "contractor_leave_requests"
  ADD COLUMN "ptoUsedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "sickLeaveUsedHours" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill existing rows from their type, so historical/pending requests
-- created before this column existed still display the correct hours.
UPDATE "contractor_leave_requests" SET "ptoUsedHours" = 8 WHERE "type" = 'PTO';
UPDATE "contractor_leave_requests" SET "ptoUsedHours" = 4 WHERE "type" = 'PTO Half Day';
UPDATE "contractor_leave_requests" SET "sickLeaveUsedHours" = 8 WHERE "type" = 'Sick Leave';
UPDATE "contractor_leave_requests" SET "sickLeaveUsedHours" = 4 WHERE "type" = 'Sick Leave Half Day';
