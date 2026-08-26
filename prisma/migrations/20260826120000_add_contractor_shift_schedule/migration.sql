-- Per-contractor per-date shift window, for contractors whose Shift Type is
-- "Shifting Schedule". Keyed on (email, date) so one contractor can hold
-- different hours on different days and across different weeks.
--
-- Written with IF NOT EXISTS so it is safe to run directly against the database
-- (e.g. the Supabase SQL editor) as well as through Prisma — this project's
-- migration history and its database have drifted, so `prisma migrate deploy`
-- is not currently a safe way to apply it.

CREATE TABLE IF NOT EXISTS "contractor_shift_schedule" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "email"      TEXT         NOT NULL,
    "date"       DATE         NOT NULL,
    "shiftStart" TEXT         NOT NULL DEFAULT '',
    "shiftEnd"   TEXT         NOT NULL DEFAULT '',
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contractor_shift_schedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "contractor_shift_schedule_email_date_key"
    ON "contractor_shift_schedule" ("email", "date");

CREATE INDEX IF NOT EXISTS "contractor_shift_schedule_date_idx"
    ON "contractor_shift_schedule" ("date");

CREATE INDEX IF NOT EXISTS "contractor_shift_schedule_email_date_idx"
    ON "contractor_shift_schedule" ("email", "date");
