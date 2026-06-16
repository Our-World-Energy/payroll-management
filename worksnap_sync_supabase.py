"""
Worksnap → Supabase weekly sync (manager_report based)
=======================================================
Pulls the Worksnaps *summary/manager report* (which actually returns data,
unlike the per-user /time_entries.xml path) for a date range, categorises each
line item by task (Work / Break / Meeting/Training), tags it with the user's
Worksnaps email, and upserts into the Prisma-managed `worksnap_entries` table.

Granularity = one row per user x project x task x date x type
(the natural grain of a manager_report line_item).

The email column is the join key: platform users see their own Worksnap data
where Profile.email == worksnap_entries.email.

Env (read from .env.local):
  WORKSNAP_API_TOKEN   - Worksnaps API token (used as basic-auth username)
  DATABASE_URL         - Supabase Postgres connection string

Usage:
  python worksnap_sync_supabase.py                       # last full week (Mon-Sun)
  python worksnap_sync_supabase.py --from-date 2026-05-25 --to-date 2026-05-31
  python worksnap_sync_supabase.py --days 14             # rolling: last 14 days .. today
                                                         # (used by the daily cron — keeps
                                                         #  the current week fresh + prior week final)
"""

import os
import sys
import uuid
import logging
import argparse
from datetime import date, datetime, timedelta
from collections import defaultdict
import xml.etree.ElementTree as ET

import requests
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv()  # fall back to .env

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s",
                    datefmt="%H:%M:%S")
log = logging.getLogger("worksnap-sync")

BASE = "https://api.worksnaps.com/api"
TZ_OFFSET = -7  # USA Arizona (MST, no DST) — aligns the report's day boundaries
TOKEN = os.environ["WORKSNAP_API_TOKEN"]   # set in .env.local
DATABASE_URL = os.environ["DATABASE_URL"]


def categorize(task_name: str) -> str:
    n = (task_name or "").lower()
    if "break" in n or "lunch" in n:
        return "Break"
    if "meeting" in n or "training" in n:
        return "Meeting/Training"
    return "Work"


def last_full_week():
    """Most recent full Sunday..Saturday week (the one before the current week)."""
    today = date.today()
    # weekday(): Mon=0..Sun=6 → days since the most recent Sunday
    days_since_sunday = (today.weekday() + 1) % 7
    this_sunday = today - timedelta(days=days_since_sunday)
    start = this_sunday - timedelta(days=7)
    return start.isoformat(), (start + timedelta(days=6)).isoformat()


def session() -> requests.Session:
    s = requests.Session()
    s.auth = (TOKEN, "x")
    s.headers.update({"Accept": "application/xml"})
    return s


def get_user_emails(s: requests.Session) -> dict[str, str]:
    root = ET.fromstring(s.get(f"{BASE}/users.xml", timeout=60).text)
    out = {}
    for u in root:
        uid = u.findtext("id")
        if uid:
            out[uid] = (u.findtext("email") or "").strip().lower()
    return out


def get_task_names(s: requests.Session, project_id: str, cache: dict) -> dict:
    if project_id in cache:
        return cache[project_id]
    names = {}
    try:
        for t in ET.fromstring(s.get(f"{BASE}/projects/{project_id}/tasks.xml", timeout=60).text):
            names[t.findtext("id")] = (t.findtext("name") or "").strip()
    except Exception as err:
        log.warning("task names failed for project %s: %s", project_id, err)
    cache[project_id] = names
    return names


def fetch_rows(s: requests.Session, from_date: str, to_date: str) -> list[dict]:
    emails = get_user_emails(s)
    log.info("users: %d", len(emails))
    url = (f"{BASE}/summary_reports.xml?name=manager_report"
           f"&from_date={from_date}&to_date={to_date}&timezone_offset={TZ_OFFSET}")
    root = ET.fromstring(s.get(url, timeout=300).text)
    items = root.findall("line_item")
    log.info("line items fetched: %d", len(items))

    task_cache: dict = {}
    # aggregate by natural key (defensive — collapses any same-grain duplicates)
    agg: dict[tuple, dict] = {}
    for li in items:
        uid = li.findtext("user_id")
        pid = li.findtext("project_id")
        tid = li.findtext("task_id") or "0"
        tname = get_task_names(s, pid, task_cache).get(tid) or (li.findtext("task_name") or "")
        etype = li.findtext("type") or "online"
        edate = li.findtext("date")
        mins = int(round(float(li.findtext("duration_in_minutes") or 0)))
        key = (int(uid), int(pid), int(tid), edate, etype)
        if key in agg:
            agg[key]["durationMins"] += mins
        else:
            agg[key] = {
                "worksnapUserId": int(uid),
                "email": emails.get(uid, ""),
                "userName": li.findtext("user_name") or "",
                "projectId": int(pid),
                "projectName": li.findtext("project_name") or "",
                "taskId": int(tid),
                "taskName": tname,
                "category": categorize(tname),
                "type": etype,
                "entryDate": edate,
                "durationMins": mins,
            }
    return list(agg.values())


UPSERT = """
INSERT INTO worksnap_entries
  ("id","worksnapUserId","email","userName","projectId","projectName",
   "taskId","taskName","category","type","entryDate","durationMins","syncedAt")
VALUES %s
ON CONFLICT ("worksnapUserId","projectId","taskId","entryDate","type") DO UPDATE SET
  "email"        = EXCLUDED."email",
  "userName"     = EXCLUDED."userName",
  "projectName"  = EXCLUDED."projectName",
  "taskName"     = EXCLUDED."taskName",
  "category"     = EXCLUDED."category",
  "durationMins" = EXCLUDED."durationMins",
  "syncedAt"     = now();
"""


# Per-user PER-TASK per-week rollup — preserves each user's actual task, with its
# category (so Work/Break/Meeting totals are a GROUP BY away; no separate category
# rollup needed). Keyed on worksnapUserId so users without a mapped email are
# never dropped.
#
# The rollup MIRRORS the detail table: the synced window's weeks are rebuilt every
# run (delete + re-aggregate), which prunes any (user, project, task) combo that
# stopped being logged — no stale rows. %(start)s = first day of the sync window;
# weeks are the Mondays from that day forward. Older weeks are untouched.
# Weeks run SUNDAY → SATURDAY. Postgres date_trunc('week') is Monday-based, so
# the week start = entryDate - dow(entryDate) days (dow: Sunday=0 … Saturday=6)
# → the Sunday on/before the date.
PRUNE_WEEKLY_TASK = """
DELETE FROM worksnap_weekly_task
WHERE "weekStart" >= (%(start)s::date - (extract(dow from %(start)s::date)::int) * interval '1 day')::date;
"""

REFRESH_WEEKLY_TASK = """
INSERT INTO worksnap_weekly_task
  ("id","worksnapUserId","email","userName","weekStart","projectId","projectName",
   "taskId","taskName","category","totalMins","daysLogged","syncedAt")
SELECT gen_random_uuid(),
       "worksnapUserId",
       max(email),
       max("userName"),
       ("entryDate" - (extract(dow from "entryDate")::int) * interval '1 day')::date,
       "projectId",
       max("projectName"),
       "taskId",
       max("taskName"),
       max(category),
       coalesce(sum("durationMins"), 0),
       count(DISTINCT "entryDate"),
       now()
FROM worksnap_entries
WHERE "entryDate" >= (%(start)s::date - (extract(dow from %(start)s::date)::int) * interval '1 day')::date
GROUP BY "worksnapUserId",
         ("entryDate" - (extract(dow from "entryDate")::int) * interval '1 day')::date,
         "projectId", "taskId";
"""


def upsert(rows: list[dict], window_start: str) -> None:
    if not rows:
        log.info("nothing to upsert")
        return
    now = datetime.utcnow()
    values = [(
        str(uuid.uuid4()), r["worksnapUserId"], r["email"], r["userName"],
        r["projectId"], r["projectName"], r["taskId"], r["taskName"],
        r["category"], r["type"], r["entryDate"], r["durationMins"], now,
    ) for r in rows]
    conn = psycopg2.connect(DATABASE_URL, sslmode="require", connect_timeout=15)
    try:
        with conn.cursor() as cur:
            CHUNK = 1000
            for i in range(0, len(values), CHUNK):
                psycopg2.extras.execute_values(cur, UPSERT, values[i:i + CHUNK])
                conn.commit()
                log.info("upserted %d / %d", min(i + CHUNK, len(values)), len(values))
            # Rebuild the window's weeks so the rollup mirrors the detail table.
            cur.execute(PRUNE_WEEKLY_TASK, {"start": window_start})
            cur.execute(REFRESH_WEEKLY_TASK, {"start": window_start})
            conn.commit()
            cur.execute("SELECT count(*) FROM worksnap_weekly_task")
            log.info("weekly per-task rollup refreshed (%d rows)", cur.fetchone()[0])
    finally:
        conn.close()


def main():
    fw_from, fw_to = last_full_week()
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-date", default=fw_from, help="YYYY-MM-DD (default: last Monday)")
    ap.add_argument("--to-date", default=fw_to, help="YYYY-MM-DD (default: last Sunday)")
    ap.add_argument("--days", type=int, default=None,
                    help="Rolling window: sync the last N days up to today (overrides from/to).")
    args = ap.parse_args()

    if args.days:
        today = date.today()
        args.from_date = (today - timedelta(days=args.days - 1)).isoformat()
        args.to_date = today.isoformat()

    if (date.fromisoformat(args.to_date) - date.fromisoformat(args.from_date)).days > 30:
        sys.exit("Worksnaps caps each report at a 30-day range.")

    log.info("syncing %s .. %s", args.from_date, args.to_date)
    s = session()
    rows = fetch_rows(s, args.from_date, args.to_date)
    log.info("distinct rows: %d | users with data: %d | total minutes: %d",
             len(rows), len({r["worksnapUserId"] for r in rows}),
             sum(r["durationMins"] for r in rows))
    upsert(rows, args.from_date)
    log.info("done.")


if __name__ == "__main__":
    main()
