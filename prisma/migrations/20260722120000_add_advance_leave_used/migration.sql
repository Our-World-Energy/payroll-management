-- AlterTable
ALTER TABLE "contractor_profiles"
  ADD COLUMN "birthdayLeaveUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "advanceSickLeaveUsed" DOUBLE PRECISION NOT NULL DEFAULT 0;
