import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { buildAttendanceStatusOps, runOpsSequentially, type AttendanceStatusInput } from "@/lib/attendanceStatusOps";

/**
 * Save many contractors' attendance for a week in ONE request — Bulk Approve.
 *
 * DATABASE_URL uses Supabase's pgbouncer (port 6543, transaction-level pooling)
 * with a small connection_limit (as low as 1 in some environments), so
 * prisma.$transaction([...]) always times out on large batches, and firing
 * many upserts concurrently just queues them against the pool_timeout instead
 * of actually running in parallel. Every upsert — across every contractor —
 * is run one at a time instead, so the pool never has more than a single
 * statement in flight regardless of batch size or connection_limit.
 *
 *   POST /api/attendance/status/bulk
 *   body: { items: [ <same shape as /api/attendance/status body>, ... ] }
 *   response: { ok, saved, failed, results: [{ worksnapUserId, ok, error? }] }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { items?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }

  const items = Array.isArray(body.items) ? (body.items as AttendanceStatusInput[]) : [];
  if (items.length === 0) return Response.json({ error: "items is required" }, { status: 400 });

  // Build all Prisma ops (pure CPU, no DB I/O) and validate inputs first.
  const builtItems = items.map((item) => ({
    worksnapUserId: Number(item.worksnapUserId) || null,
    built: buildAttendanceStatusOps(prisma, item),
  }));

  const results: { worksnapUserId: number | null; ok: boolean; error?: string }[] = [];
  for (const { worksnapUserId, built } of builtItems) {
    if (!built.ok) {
      results.push({ worksnapUserId, ok: false, error: built.error });
      continue;
    }
    try {
      await runOpsSequentially(built.ops);
      results.push({ worksnapUserId, ok: true });
    } catch (e) {
      results.push({ worksnapUserId, ok: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  const failed = results.filter((r) => !r.ok);
  return Response.json({ ok: failed.length === 0, saved: results.length - failed.length, failed: failed.length, results });
}
