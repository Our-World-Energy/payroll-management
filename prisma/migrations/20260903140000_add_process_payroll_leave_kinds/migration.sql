-- Paid leave split by kind on the processed payroll snapshot. Each is its own
-- voucher earnings line and part of Gross; the existing ptoHours/ptoPay cover
-- the PTO line, these cover Medical Unavailability, Special Leave and the
-- Advance pools.
ALTER TABLE "process_weekly_payroll"
  ADD COLUMN IF NOT EXISTS "sickHours"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sickPay"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "specialHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "specialPay"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "advanceHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "advancePay"   DOUBLE PRECISION NOT NULL DEFAULT 0;
