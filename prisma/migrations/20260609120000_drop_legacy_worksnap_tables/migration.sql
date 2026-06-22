-- worksnap_time_entries (table) and worksnap_export (a view over it) are orphans
-- created by the old `worksnap_to_postgres 1.py` experiment. They are not in the
-- Prisma schema, not maintained by the cron sync, and not read by the app — a
-- stale 989-row snapshot. The current pipeline is worksnap_entries (detail) +
-- worksnap_weekly_task (per-task rollup). Drop the view, then the table.

-- DropView
DROP VIEW IF EXISTS "worksnap_export";

-- DropTable
DROP TABLE IF EXISTS "worksnap_time_entries";
