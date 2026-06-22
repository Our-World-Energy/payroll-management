-- CreateTable
CREATE TABLE "worksnap_weekly" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "worksnapUserId" INTEGER NOT NULL,
    "userName" TEXT NOT NULL,
    "workMins" INTEGER NOT NULL DEFAULT 0,
    "breakMins" INTEGER NOT NULL DEFAULT 0,
    "meetingMins" INTEGER NOT NULL DEFAULT 0,
    "totalMins" INTEGER NOT NULL DEFAULT 0,
    "daysLogged" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worksnap_weekly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worksnap_weekly_weekStart_idx" ON "worksnap_weekly"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "worksnap_weekly_key" ON "worksnap_weekly"("email", "weekStart");
