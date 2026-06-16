-- AlterTable: per-location timezone for In/Out display
ALTER TABLE "contractors" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Phoenix';
