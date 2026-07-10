-- AlterTable
ALTER TABLE "attendance_week_status"
  ADD COLUMN "totalEvaluatedRegularMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalUsHoMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalRegularOtMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalRdOtMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalHoOtMinutes" INTEGER NOT NULL DEFAULT 0;
