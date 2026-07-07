-- CreateTable
CREATE TABLE "worksnap_daily_log" (
    "id" UUID NOT NULL,
    "worksnapUserId" INTEGER NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "userName" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "firstIn" TIMESTAMPTZ(3) NOT NULL,
    "lastOut" TIMESTAMPTZ(3) NOT NULL,
    "totalMins" INTEGER NOT NULL DEFAULT 0,
    "entries" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worksnap_daily_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worksnap_daily_log_entryDate_idx" ON "worksnap_daily_log"("entryDate");

-- CreateIndex
CREATE INDEX "worksnap_daily_log_email_entryDate_idx" ON "worksnap_daily_log"("email", "entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "worksnap_daily_log_key" ON "worksnap_daily_log"("worksnapUserId", "entryDate");
