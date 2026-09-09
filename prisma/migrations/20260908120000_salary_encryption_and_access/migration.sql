-- Salary-at-rest encryption + salary visibility gate.
--
-- 1. Every money column on payroll_adjustments / process_weekly_payroll becomes
--    TEXT so it can hold an AES-256-GCM ciphertext ("enc:v1:…") written by
--    src/lib/salaryCrypto.ts. Existing numbers are cast to their decimal text
--    ("12.5") — the app reads plaintext and ciphertext alike, and Settings →
--    Salary Visibility → "Encrypt existing data" converts the rest in place.
--    contractor_profiles rates were already TEXT and need no change. Hours
--    columns stay numeric: they aren't money.
-- 2. salary_access_grants — one row per admin who completed the email OTP;
--    access lasts until expiresAt (30 days), then they verify again.
-- 3. salary_otp_challenges — hashed one-time codes with attempt counting.
-- The allowlist of who may unlock lives in app_settings under
-- "salary_viewer_emails" (JSON array) — no new table needed.
--
-- Run this BEFORE deploying the matching app code: once deployed, the app
-- writes ciphertext strings, which a double precision column would reject.
--
-- Written with IF NOT EXISTS / information_schema guards so it is safe to run
-- directly in the Supabase SQL editor as well as through Prisma — this
-- project's migration history and its database have drifted, so
-- `prisma migrate deploy` is not currently a safe way to apply it.

DO $$
DECLARE
  col text;
  adj_cols text[] := ARRAY['bonus','misc','retroPay','reim','cashAdvance','hmo','tax'];
  pwp_cols text[] := ARRAY[
    'hourlyRate','monthlyRate','weeklyRate','gross','deductions','net',
    'bonus','misc','retroPay','reim','cashAdvance','hmo','tax','indHoursPay',
    'sickPay','specialPay','advancePay','ptoPay',
    'regPay','regOtPay','rdOtPay','usHolidayPay','hoOtPay','localHolidayPay'
  ];
BEGIN
  FOREACH col IN ARRAY adj_cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'payroll_adjustments'
        AND column_name = col AND data_type <> 'text'
    ) THEN
      EXECUTE format('ALTER TABLE "payroll_adjustments" ALTER COLUMN %I DROP DEFAULT', col);
      EXECUTE format('ALTER TABLE "payroll_adjustments" ALTER COLUMN %I TYPE TEXT USING %I::text', col, col);
      EXECUTE format('ALTER TABLE "payroll_adjustments" ALTER COLUMN %I SET DEFAULT ''0''', col);
    END IF;
  END LOOP;

  FOREACH col IN ARRAY pwp_cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'process_weekly_payroll'
        AND column_name = col AND data_type <> 'text'
    ) THEN
      EXECUTE format('ALTER TABLE "process_weekly_payroll" ALTER COLUMN %I DROP DEFAULT', col);
      EXECUTE format('ALTER TABLE "process_weekly_payroll" ALTER COLUMN %I TYPE TEXT USING %I::text', col, col);
      EXECUTE format('ALTER TABLE "process_weekly_payroll" ALTER COLUMN %I SET DEFAULT ''0''', col);
    END IF;
  END LOOP;
END $$;

-- Timestamps are TIMESTAMPTZ on purpose: the app writes and compares UTC
-- instants, and a plain TIMESTAMP would come back through PostgREST with no
-- offset, which a browser in a non-UTC zone then misreads as local time
-- (an OTP issued a minute ago looked "expired" from IST).
CREATE TABLE IF NOT EXISTS "salary_access_grants" (
    "email"      TEXT           NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"  TIMESTAMPTZ(3) NOT NULL,
    "createdAt"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_access_grants_pkey" PRIMARY KEY ("email")
);

CREATE TABLE IF NOT EXISTS "salary_otp_challenges" (
    "id"         UUID           NOT NULL,
    "email"      TEXT           NOT NULL,
    "codeHash"   TEXT           NOT NULL,
    "expiresAt"  TIMESTAMPTZ(3) NOT NULL,
    "attempts"   INTEGER        NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "salary_otp_challenges_email_createdAt_idx"
    ON "salary_otp_challenges"("email", "createdAt");

-- Databases that ran the first cut of this migration got TIMESTAMP (no zone);
-- upgrade those columns in place. The stored values were UTC instants.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('salary_access_grants', 'salary_otp_challenges')
      AND data_type = 'timestamp without time zone'
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ(3) USING %I AT TIME ZONE ''UTC''',
                   r.table_name, r.column_name, r.column_name);
  END LOOP;
END $$;
