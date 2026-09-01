"""
Backfill worksnap_daily_log.firstInLogged / .lastOutLogged
==========================================================
`firstIn` / `lastOut` come from Worksnaps' `from_timestamp`, which the API
clock-aligns to fixed 10-minute slots — every value satisfies `mod 600 == 1`,
and every entry is credited exactly 10.0 minutes (there is no partial opening
slot). They therefore cannot express a real clock-in: the trailing `:01` is a
constant API artifact, not a second-level reading.

`logged_timestamp` — the screenshot-upload instant — is the ONLY sub-slot signal
the API exposes. It is randomised inside its slot (measured 15s-582s past the
boundary over 665 entries) and always falls while tracking was live, so it
brackets the truth rather than pinpointing it:

    actual clock-in  in [firstIn,       firstInLogged]
    actual clock-out in [lastOutLogged, lastOut]

This script is UPDATE-only. Unlike the main sync it never deletes or re-inserts,
so a partial API failure can only leave some rows un-backfilled — never drop
attendance data. Safe to re-run; re-running just overwrites with the same values.

Env (read from .env.local):
  WORKSNAP_API_TOKEN   - Worksnaps API token (basic-auth username)
  DIRECT_URL           - direct (non-pooled) Postgres connection string

Usage:
  python worksnap_backfill_logged_ts.py                # last 14 days
  python worksnap_backfill_logged_ts.py --days 61      # full daily_log history
  python worksnap_backfill_logged_ts.py --days 14 --dry-run
"""

import os
import re
import logging
import argparse
from datetime import date, datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
import xml.etree.ElementTree as ET

import requests
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s",
                    datefmt="%H:%M:%S")
log = logging.getLogger("worksnap-backfill")

BASE = "https://api.worksnaps.com/api"
TZ_OFFSET = -7          # USA Arizona (MST, no DST) — matches the main sync
CONCURRENCY = 8
TOKEN = os.environ["WORKSNAP_API_TOKEN"]

# Cloudflare in front of api.worksnaps.com answers 403 (error 1010, "banned
# browser signature") to the default python-requests/urllib user agent. A normal
# browser UA is required — the Node sync is unaffected because undici sends its
# own. Without this every call fails, including ones that worked minutes earlier.
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")


def dsn() -> str:
    """DIRECT_URL minus the `pgbouncer` query param, which libpq rejects."""
    raw = os.environ.get("DIRECT_URL") or os.environ["DATABASE_URL"]
    return re.sub(r"([?&])pgbouncer=[^&]*&?", r"\1", raw).rstrip("?&")


def session() -> requests.Session:
    s = requests.Session()
    s.auth = (TOKEN, "x")
    s.headers.update({"Accept": "application/xml", "User-Agent": UA})
    return s


def local_midnight_unix(d: date) -> int:
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp()) - TZ_OFFSET * 3600


def local_date_of(ts: int) -> date:
    return datetime.fromtimestamp(ts + TZ_OFFSET * 3600, timezone.utc).date()


def fetch_pairs(days: int) -> list[tuple[int, int]]:
    """(projectId, worksnapUserId) pairs that logged time in the window."""
    conn = psycopg2.connect(dsn(), sslmode="require", connect_timeout=20)
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT DISTINCT "projectId", "worksnapUserId" FROM worksnap_entries '
                'WHERE "entryDate" > current_date - %s',
                (days,),
            )
            return cur.fetchall()
    finally:
        conn.close()


# The endpoint rejects long ranges outright: a 61-day window returns HTTP 400
# with error_code 100004, and it does so for EVERY pair — which silently yields
# an empty backfill rather than an obvious failure. 45 days still succeeds, so
# chunk well inside that and stitch the pieces together.
CHUNK_DAYS = 30


def fetch_project_user(s: requests.Session, pid: int, uid: int,
                       from_ts: int, to_ts: int) -> list[dict]:
    """Raw time entries for one (project, user), across as many <= CHUNK_DAYS
    requests as the range needs. The endpoint honours a single user_ids value, so
    one request per (pair, chunk) is unavoidable."""
    out: list[dict] = []
    span = CHUNK_DAYS * 86400
    lo = from_ts
    while lo < to_ts:
        hi = min(lo + span, to_ts)
        out.extend(_fetch_window(s, pid, uid, lo, hi))
        lo = hi
    return out


def _fetch_window(s: requests.Session, pid: int, uid: int,
                  from_ts: int, to_ts: int) -> list[dict]:
    url = (f"{BASE}/projects/{pid}/time_entries.xml?user_ids={uid}"
           f"&from_timestamp={from_ts}&to_timestamp={to_ts}")
    for attempt in range(4):
        try:
            r = s.get(url, timeout=180)
            if r.status_code == 200:
                out = []
                for te in ET.fromstring(r.text).findall("time_entry"):
                    frm = int(te.findtext("from_timestamp") or 0)
                    logged = int(te.findtext("logged_timestamp") or 0)
                    mins = round(float(te.findtext("duration_in_minutes") or 0))
                    # `offline` entries (manually added time) have no screenshot and
                    # report logged_timestamp == from_timestamp — the slot boundary,
                    # which carries no sub-slot information. Storing it would look
                    # like a to-the-second clock-in that is pure artifact, so drop it
                    # to 0 ("unknown"). ~0.7% of entries measured.
                    if logged <= frm:
                        logged = 0
                    if frm:
                        out.append({"uid": int(te.findtext("user_id") or uid),
                                    "frm": frm, "logged": logged, "mins": mins})
                return out
            # WARNING, not DEBUG: a systematic 4xx (bad range, revoked token)
            # otherwise looks identical to "this user logged no time".
            log.warning("HTTP %s for project %s user %s: %s",
                        r.status_code, pid, uid, " ".join(r.text[:160].split()))
        except Exception as err:
            log.warning("error project %s user %s: %s", pid, uid, err)
        # brief linear backoff — Worksnaps throttles bursts
        import time
        time.sleep(1.5 * (attempt + 1))
    log.warning("gave up on project %s user %s", pid, uid)
    return []


def aggregate(entries: list[dict]) -> dict[tuple[int, date], dict]:
    """Per (user, local day): the logged_timestamp OF the earliest-starting entry
    and OF the latest-ending one — not the min/max logged value, which could
    belong to any other slot in the day."""
    agg: dict[tuple[int, date], dict] = {}
    for e in entries:
        key = (e["uid"], local_date_of(e["frm"]))
        end = e["frm"] + e["mins"] * 60
        cur = agg.get(key)
        if cur is None:
            agg[key] = {"start": e["frm"], "startLogged": e["logged"],
                        "end": end, "endLogged": e["logged"]}
            continue
        if e["frm"] < cur["start"]:
            cur["start"], cur["startLogged"] = e["frm"], e["logged"]
        if end > cur["end"]:
            cur["end"], cur["endLogged"] = end, e["logged"]
    return agg


# Only write a value that is CONSISTENT with the slot already stored on the row.
#
# firstIn/lastOut are a snapshot from whenever the main sync last ran; this script
# fetches later, so on a still-in-progress day it can legitimately see entries the
# stored row predates (measured: 263 rows on the current day ran up to 9.5h past
# the stored lastOut). Writing those would produce a row that contradicts itself —
# a "seen 11:51:54" sitting under a "Last Out 10:40:01" — which is worse than a
# NULL. So each column is written only when it lands inside its own 10-minute slot,
# and `else` keeps whatever was already there. Skipped rows resolve on their own
# once the main sync refreshes the slot: it now derives both halves from a single
# fetch, so they cannot disagree.
UPDATE = """
UPDATE worksnap_daily_log AS d SET
  "firstInLogged" = CASE
      WHEN v.first_in_logged >  d."firstIn"
       AND v.first_in_logged <  d."firstIn" + interval '600 seconds'
      THEN v.first_in_logged ELSE d."firstInLogged" END,
  "lastOutLogged" = CASE
      WHEN v.last_out_logged <= d."lastOut"
       AND v.last_out_logged >  d."lastOut" - interval '600 seconds'
      THEN v.last_out_logged ELSE d."lastOutLogged" END
FROM (VALUES %s) AS v(uid, entry_date, first_in_logged, last_out_logged)
WHERE d."worksnapUserId" = v.uid AND d."entryDate" = v.entry_date::date;
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14,
                    help="How far back to backfill (default 14; 61 covers all history).")
    ap.add_argument("--dry-run", action="store_true",
                    help="Fetch and report, but write nothing.")
    args = ap.parse_args()

    today = date.today()
    start = today - timedelta(days=args.days - 1)
    from_ts, to_ts = local_midnight_unix(start), local_midnight_unix(today) + 86400
    log.info("backfilling %s .. %s", start, today)

    pairs = fetch_pairs(args.days)
    log.info("(project, user) pairs to fetch: %d", len(pairs))

    s = session()
    all_entries: list[dict] = []
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futures = [pool.submit(fetch_project_user, s, pid, uid, from_ts, to_ts)
                   for pid, uid in pairs]
        for i, f in enumerate(futures, 1):
            all_entries.extend(f.result())
            if i % 50 == 0:
                log.info("fetched %d / %d pairs (%d entries)", i, len(pairs), len(all_entries))

    log.info("time entries fetched: %d", len(all_entries))
    if not all_entries:
        raise SystemExit("fetched 0 entries across all pairs - the API rejected "
                         "every request (check the window and the token); refusing "
                         "to report success")
    agg = aggregate(all_entries)
    log.info("user-days resolved: %d", len(agg))

    rows = [(uid, d.isoformat(),
             datetime.fromtimestamp(a["startLogged"], timezone.utc) if a["startLogged"] else None,
             datetime.fromtimestamp(a["endLogged"], timezone.utc) if a["endLogged"] else None)
            for (uid, d), a in agg.items()
            if a["startLogged"] or a["endLogged"]]
    log.info("rows with a usable logged_timestamp: %d", len(rows))

    if args.dry_run:
        for r in rows[:10]:
            log.info("  would set uid=%s %s  firstInLogged=%s  lastOutLogged=%s", *r)
        log.info("dry run - nothing written")
        return
    if not rows:
        log.info("nothing to write")
        return

    conn = psycopg2.connect(dsn(), sslmode="require", connect_timeout=20)
    try:
        with conn.cursor() as cur:
            CHUNK = 500
            for i in range(0, len(rows), CHUNK):
                psycopg2.extras.execute_values(cur, UPDATE, rows[i:i + CHUNK])
                conn.commit()
                log.info("updated %d / %d", min(i + CHUNK, len(rows)), len(rows))
            cur.execute(
                'SELECT count(*) FILTER (WHERE "firstInLogged" IS NOT NULL), '
                '       count(*) FILTER (WHERE "lastOutLogged" IS NOT NULL), count(*) '
                'FROM worksnap_daily_log WHERE "entryDate" >= %s', (start,))
            f_in, f_out, total = cur.fetchone()
            log.info("window coverage: firstInLogged %d/%d, lastOutLogged %d/%d",
                     f_in, total, f_out, total)
            # Must be 0,0 — the CASE guards above make a violation impossible, so a
            # non-zero count means stale data predating this script's guard.
            cur.execute(
                'SELECT count(*) FILTER (WHERE "firstInLogged" < "firstIn"), '
                '       count(*) FILTER (WHERE "lastOutLogged" > "lastOut") '
                'FROM worksnap_daily_log')
            bad_in, bad_out = cur.fetchone()
            if bad_in or bad_out:
                log.warning("INVARIANT VIOLATIONS present: %d firstInLogged < firstIn, "
                            "%d lastOutLogged > lastOut", bad_in, bad_out)
            else:
                log.info("invariant holds on all rows")
    finally:
        conn.close()
    log.info("done.")


if __name__ == "__main__":
    main()
