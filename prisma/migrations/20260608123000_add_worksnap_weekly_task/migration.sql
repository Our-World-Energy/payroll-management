-- CreateTable
CREATE TABLE "worksnap_weekly_task" (
    "id" UUID NOT NULL,
    "worksnapUserId" INTEGER NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "userName" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "projectId" INTEGER NOT NULL,
    "projectName" TEXT NOT NULL,
    "taskId" INTEGER NOT NULL DEFAULT 0,
    "taskName" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'Work',
    "totalMins" INTEGER NOT NULL DEFAULT 0,
    "daysLogged" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worksnap_weekly_task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worksnap_weekly_task_weekStart_idx" ON "worksnap_weekly_task"("weekStart");

-- CreateIndex
CREATE INDEX "worksnap_weekly_task_email_weekStart_idx" ON "worksnap_weekly_task"("email", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "worksnap_weekly_task_key" ON "worksnap_weekly_task"("worksnapUserId", "weekStart", "projectId", "taskId");
