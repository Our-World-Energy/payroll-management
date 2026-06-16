-- CreateTable
CREATE TABLE "worksnap_entries" (
    "id" UUID NOT NULL,
    "worksnapUserId" INTEGER NOT NULL,
    "userName" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "projectName" TEXT NOT NULL,
    "taskId" INTEGER NOT NULL DEFAULT 0,
    "taskName" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'Work',
    "type" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "durationMins" INTEGER NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worksnap_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worksnap_entries_entryDate_idx" ON "worksnap_entries"("entryDate");

-- CreateIndex
CREATE INDEX "worksnap_entries_worksnapUserId_entryDate_idx" ON "worksnap_entries"("worksnapUserId", "entryDate");

-- CreateIndex
CREATE INDEX "worksnap_entries_projectId_entryDate_idx" ON "worksnap_entries"("projectId", "entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "worksnap_natural_key" ON "worksnap_entries"("worksnapUserId", "projectId", "taskId", "entryDate", "type");
