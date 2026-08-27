-- Global admin switches, one row per key. Key/value rather than a column per
-- setting so a new toggle needs no migration. First key is
-- "time_away_requests_enabled" (Settings → Time Away Settings), which gates the
-- Apply Leave form on the Contractor Portal.
--
-- Written with IF NOT EXISTS so it is safe to run directly against the database
-- (e.g. the Supabase SQL editor) as well as through Prisma — this project's
-- migration history and its database have drifted, so `prisma migrate deploy`
-- is not currently a safe way to apply it.

CREATE TABLE IF NOT EXISTS "app_settings" (
    "key"       TEXT         NOT NULL,
    "value"     TEXT         NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
