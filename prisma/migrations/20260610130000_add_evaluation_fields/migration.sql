-- AlterTable: weekly target on contractors
ALTER TABLE "contractors" ADD COLUMN "targetMinutes" INTEGER NOT NULL DEFAULT 2400;

-- AlterTable: manual adjustment minutes on the per-week status
ALTER TABLE "attendance_week_status" ADD COLUMN "manualAdjustmentTime" INTEGER NOT NULL DEFAULT 0;
