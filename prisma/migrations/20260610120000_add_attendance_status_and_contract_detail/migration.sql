-- AlterTable: contract-detail fields on contractors
ALTER TABLE "contractors"
  ADD COLUMN "department"       TEXT,
  ADD COLUMN "location"         TEXT,
  ADD COLUMN "shiftType"        TEXT,
  ADD COLUMN "employmentStatus" TEXT,
  ADD COLUMN "offsetCredits"    DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN "ptoCredits"       DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN "sickLeaveCredits" DECIMAL(6,2) NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "TimeOffKind" AS ENUM ('HO_HOLIDAY', 'PTO', 'SICK_LEAVE_HALF_DAY', 'PTO_HALF_DAY', 'OPEN', 'NOT_SET');

-- CreateEnum
CREATE TYPE "AttendanceRequestStatus" AS ENUM ('APPROVED', 'REJECTED', 'OPEN', 'NOT_SET');

-- CreateTable
CREATE TABLE "attendance_week_status" (
    "id" UUID NOT NULL,
    "worksnapUserId" INTEGER NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "weekStart" DATE NOT NULL,
    "timeOffStatus" "TimeOffKind" NOT NULL DEFAULT 'NOT_SET',
    "requestStatus" "AttendanceRequestStatus" NOT NULL DEFAULT 'NOT_SET',
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_week_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_week_key" ON "attendance_week_status"("worksnapUserId", "weekStart");

-- CreateIndex
CREATE INDEX "attendance_week_status_weekStart_idx" ON "attendance_week_status"("weekStart");

-- CreateIndex
CREATE INDEX "attendance_week_status_email_weekStart_idx" ON "attendance_week_status"("email", "weekStart");
