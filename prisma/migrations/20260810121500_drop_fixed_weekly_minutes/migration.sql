-- AlterTable
-- Superseded by the fixed_time table (week-scoped instead of a single
-- per-contractor profile value).
ALTER TABLE "contractor_profiles"
  DROP COLUMN "fixedWeeklyMinutes";
