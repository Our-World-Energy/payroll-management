-- Capture Worksnaps' `logged_timestamp` (screenshot-upload instant) for the first
-- and last time entry of each user-day.
--
-- Why: `firstIn`/`lastOut` are derived from `from_timestamp`, which Worksnaps
-- clock-aligns to fixed 10-minute slots (every value is `mod 600 == 1`, and every
-- entry is credited exactly 10.0 minutes — there is no partial opening slot). They
-- therefore cannot carry a real clock-in time; the trailing `:01` is a constant
-- API artifact, not a second-level reading.
--
-- `logged_timestamp` is the only sub-bucket signal the API exposes. It is
-- randomised within its slot (measured 15s-582s past the boundary over 665
-- entries), and always falls while tracking was live, which brackets the truth:
--     actual clock-in  in [firstIn,       firstInLogged]
--     actual clock-out in [lastOutLogged, lastOut]
--
-- Nullable: existing rows have no local source to backfill from — only a re-sync
-- of the window repopulates them.

-- AlterTable
ALTER TABLE "worksnap_daily_log"
  ADD COLUMN "firstInLogged" TIMESTAMPTZ(3),
  ADD COLUMN "lastOutLogged" TIMESTAMPTZ(3);
