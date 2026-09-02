-- Fixed-Ind "Apply Time Credit" persistence. Minutes granted on this week to
-- bring a short week up to the 2,400-min target; the following week reads it to
-- know what it owes back. Previously held only in React state, so it was lost
-- on every reload.
--
-- IF NOT EXISTS so this is safe to re-run against a database the column was
-- already added to out-of-band.
ALTER TABLE "attendance_week_status"
  ADD COLUMN IF NOT EXISTS "offsetCreditMinutes" INTEGER NOT NULL DEFAULT 0;
