-- Announcements can carry an image that replaces the generated emoji tile on
-- the Dashboard (banner and per-location list). Nullable: existing rows keep
-- the emoji. The file itself lives in the public "announcement-images"
-- storage bucket; this holds its URL.
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS "imageUrl" text;
