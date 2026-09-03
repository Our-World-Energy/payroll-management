-- Fixed-Ind hours-at-percentage amount, frozen into the processed payroll
-- snapshot. Part of Gross, so a processed voucher can itemise it instead of
-- showing a Gross its own earnings lines don't add up to.
ALTER TABLE "process_weekly_payroll"
  ADD COLUMN IF NOT EXISTS "indHoursPay" DOUBLE PRECISION NOT NULL DEFAULT 0;
