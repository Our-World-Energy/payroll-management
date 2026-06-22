-- AlterTable
ALTER TABLE "worksnap_entries" ADD COLUMN "email" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "worksnap_entries_email_entryDate_idx" ON "worksnap_entries"("email", "entryDate");
