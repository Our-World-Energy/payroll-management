-- AlterTable
ALTER TABLE "contractor_profiles"
  ADD COLUMN "outstandingLeaveBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "outstandingMedicalBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;
