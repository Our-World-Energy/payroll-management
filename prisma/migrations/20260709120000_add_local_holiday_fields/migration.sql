-- AlterTable
ALTER TABLE "attendance_day_status"
  ADD COLUMN "localHoliday" TEXT,
  ADD COLUMN "localHolidayMinutes" INTEGER;
