@echo off
REM Worksnap -> Supabase daily sync (runs 3x/day via Windows Task Scheduler).
REM Rolling 14-day window keeps the current week fresh and the prior week final.
cd /d "d:\owehub-projects\payroll-management"
echo ---- %DATE% %TIME% : worksnap sync (rolling 14d) ---- >> "worksnap_cron.log"
"C:\Python314\python.exe" "worksnap_sync_supabase.py" --days 14 >> "worksnap_cron.log" 2>&1
echo ---- exit code %ERRORLEVEL% ---- >> "worksnap_cron.log"
