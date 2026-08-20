-- CreateTable
CREATE TABLE "special_leave_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "hoursUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grantDate" TEXT NOT NULL,
    "note" TEXT,
    "expirationDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "special_leave_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "special_leave_grants_email_idx" ON "special_leave_grants"("email");

-- AlterTable
ALTER TABLE "contractor_leave_requests" ADD COLUMN "specialLeaveGrantDeductions" JSONB;
