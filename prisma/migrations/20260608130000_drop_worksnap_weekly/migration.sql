-- worksnap_weekly is fully redundant: it is never read by the app and is
-- derivable from worksnap_weekly_task (which carries `category`, so Work/Break/
-- Meeting totals are a GROUP BY away) and covers more users. Drop it.

-- DropTable
DROP TABLE "worksnap_weekly";
