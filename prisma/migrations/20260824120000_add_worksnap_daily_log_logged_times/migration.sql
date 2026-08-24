-- Actual clock-in / clock-out instants alongside the rounded firstIn/lastOut
-- bucket boundaries. These columns already exist in the live database (added
-- out-of-band), so the adds are guarded to keep this migration idempotent.
ALTER TABLE "worksnap_daily_log"
  ADD COLUMN IF NOT EXISTS "firstInLogged" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "lastOutLogged" TIMESTAMPTZ(3);
