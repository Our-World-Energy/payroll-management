-- AlterTable
ALTER TABLE "contractor_profiles"
  ADD COLUMN "specialLeaveCredits" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "specialLeaveUsed" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "contractor_leave_requests"
  ADD COLUMN "specialLeaveUsedHours" DOUBLE PRECISION NOT NULL DEFAULT 0;
