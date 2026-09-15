-- Fixed-Ind "Ind Time" for the week: worked Worksnap time plus approved sick
-- leave, uncapped and before any Offset Credit repayment — the figure the
-- Attendance Review "Ind Time" cell shows.
--
-- Stored because it is not recoverable from `completionMinutes`, which is the
-- Net Time derived FROM it (repayment deducted, then capped at 2,400, plus any
-- credit granted on the week). Payroll pays Fixed-Ind Reg Hours on Ind Time, so
-- it needs the pre-cap figure rather than re-deriving it from Worksnap and risk
-- drifting from what Attendance Review displayed.
--
-- Nullable rather than defaulted: null means "saved before this column existed"
-- and lets Payroll fall back to completionMinutes for those weeks, which a 0
-- default could not express.
--
-- IF NOT EXISTS so this is safe to re-run against a database the column was
-- already added to out-of-band.
ALTER TABLE "attendance_week_status"
  ADD COLUMN IF NOT EXISTS "totalIndMinutes" INTEGER;
