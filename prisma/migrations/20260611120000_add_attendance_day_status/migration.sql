-- CreateTable
CREATE TABLE "attendance_day_status" (
    "id" UUID NOT NULL,
    "worksnapUserId" INTEGER NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "date" DATE NOT NULL,
    "timeOffStatus" "TimeOffKind" NOT NULL DEFAULT 'NOT_SET',
    "manualAdjustmentTime" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_day_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_day_key" ON "attendance_day_status"("worksnapUserId", "date");

-- CreateIndex
CREATE INDEX "attendance_day_status_date_idx" ON "attendance_day_status"("date");

-- CreateIndex
CREATE INDEX "attendance_day_status_email_date_idx" ON "attendance_day_status"("email", "date");
