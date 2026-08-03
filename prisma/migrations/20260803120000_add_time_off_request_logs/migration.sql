-- CreateTable
CREATE TABLE "time_off_request_logs" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "ptoUsedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sickLeaveUsedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "specialLeaveUsedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_off_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_off_request_logs_email_decidedAt_idx" ON "time_off_request_logs"("email", "decidedAt");

-- CreateIndex
CREATE INDEX "time_off_request_logs_requestId_idx" ON "time_off_request_logs"("requestId");
