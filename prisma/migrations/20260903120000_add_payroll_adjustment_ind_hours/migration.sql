-- Fixed-Ind hours-at-percentage entry on the Payroll table's Action column.
-- Total hours = indHours * indPercentage / 100; that total x Rate/hr is added to
-- Gross. The two inputs are stored rather than the product so the figure stays
-- reproducible from what was entered.
--
-- IF NOT EXISTS so this is safe to re-run against a database already patched
-- out-of-band.
ALTER TABLE "payroll_adjustments"
  ADD COLUMN IF NOT EXISTS "indHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "indPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0;
