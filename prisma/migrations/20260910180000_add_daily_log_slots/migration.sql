-- The individual 10-minute Worksnap slots behind a day's total, as
-- [[startEpochSeconds, minutes], ...]. The sync already fetches every slot to
-- derive firstIn/lastOut/totalMins and then discarded them, which left any
-- "how much of this day fell inside window X" question unanswerable — Local HO
-- Time had to approximate from the first-in/last-out span and over-credited a
-- shift straddling the holiday's edge. Nullable: rows synced before this keep
-- working via that approximation.
ALTER TABLE worksnap_daily_log ADD COLUMN IF NOT EXISTS slots jsonb;
