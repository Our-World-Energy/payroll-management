-- Admin overrides for the Attendance Tracker's NCNS (No Call No Show) column.
-- The column derives Yes on a day coded "Absent"; a row here overrides that
-- verdict for one contractor on one date, with the admin's reason. No row means
-- the derived default stands.
--
-- Written with IF NOT EXISTS so it is safe to run directly against the database
-- (e.g. the Supabase SQL editor) as well as through Prisma — this project's
-- migration history and its database have drifted, so `prisma migrate deploy`
-- is not currently a safe way to apply it.

CREATE TABLE IF NOT EXISTS "attendance_ncns" (
    "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
    "email"     TEXT         NOT NULL,
    "date"      DATE         NOT NULL,
    "isNcns"    BOOLEAN      NOT NULL,
    "reason"    TEXT         NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_ncns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_ncns_email_date_key"
    ON "attendance_ncns" ("email", "date");

CREATE INDEX IF NOT EXISTS "attendance_ncns_date_idx"
    ON "attendance_ncns" ("date");

CREATE INDEX IF NOT EXISTS "attendance_ncns_email_date_idx"
    ON "attendance_ncns" ("email", "date");
