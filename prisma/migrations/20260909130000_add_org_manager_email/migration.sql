-- OWE Contacts gained an optional email alongside the name, so Settings can
-- capture both. Nullable: the 51 rows that predate this have names only.
ALTER TABLE org_managers ADD COLUMN IF NOT EXISTS email text;
