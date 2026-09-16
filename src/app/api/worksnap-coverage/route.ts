import { prisma } from "@/lib/prisma";

/**
 * Active contractors who exist in Contractor Details but have no data at all in
 * worksnap_daily_log — never a single clock-in/clock-out row. Distinct from
 * being absent on a given day: these contractors aren't being tracked in the
 * first place, so no amount of waiting will produce time for them.
 *
 *   GET /api/worksnap-coverage
 *
 * Feeds the Dashboard's "Absent Today / No Worksnap" tile. The comparison is
 * done here rather than on the page because it needs every distinct email in
 * worksnap_daily_log, not just one day's.
 *
 * The daily log is the authority rather than worksnap_entries: a contractor can
 * carry task entries yet still have no clock-in/out record, and it's the daily
 * log that every attendance check (late, first in / last out) reads.
 *
 * One raw query rather than two Prisma reads intersected in JS. The previous
 * shape fetched `distinct: ["email"]` from worksnap_daily_log, which Prisma
 * resolves by reading every row and deduplicating client-side — 22,758 rows
 * transferred to derive 420 addresses — and then read all Active profiles in a
 * second query. Against the live database that measured ~791ms and ~508ms;
 * NOT EXISTS does the same work inside Postgres in a single round trip, which
 * matters on a Dashboard where the per-query latency is the whole cost.
 *
 * json_agg with a COALESCE so the row always comes back, `untracked` included
 * as an empty array when nobody is untracked — a FILTER-less aggregate over no
 * rows returns NULL, which would otherwise read as a failure.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CoverageResult = {
  untracked: { email: string; name: string; department: string }[] | null;
  activeCount: number;
};

export async function GET() {
  const [result] = await prisma.$queryRaw<CoverageResult[]>`
    SELECT
      (SELECT COUNT(*)::int FROM "contractor_profiles" WHERE "status" = 'Active') AS "activeCount",
      COALESCE(
        (
          SELECT json_agg(u ORDER BY u.name)
          FROM (
            SELECT
              btrim(p."email") AS email,
              COALESCE(
                NULLIF(btrim(p."fullName"), ''),
                NULLIF(btrim(CONCAT_WS(' ', p."firstName", p."surname")), ''),
                btrim(p."email")
              ) AS name,
              COALESCE(btrim(p."department"), '') AS department
            FROM "contractor_profiles" p
            WHERE p."status" = 'Active'
              AND btrim(COALESCE(p."email", '')) <> ''
              AND NOT EXISTS (
                SELECT 1 FROM "worksnap_daily_log" l
                WHERE lower(btrim(l."email")) = lower(btrim(p."email"))
              )
          ) u
        ),
        '[]'::json
      ) AS "untracked"
  `;

  return Response.json({
    untracked: result?.untracked ?? [],
    activeCount: result?.activeCount ?? 0,
  });
}
