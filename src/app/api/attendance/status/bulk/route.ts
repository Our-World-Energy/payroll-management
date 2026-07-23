import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { buildAttendanceStatusOps, type AttendanceStatusInput } from "@/lib/attendanceStatusOps";

/**
 * Save many contractors' attendance for a week in ONE request — Bulk Approve.
 *
 * DATABASE_URL uses Supabase's pgbouncer (port 6543, transaction-level pooling).
 * pgbouncer CANNOT hold a connection open across a multi-statement transaction,
 * so prisma.$transaction([...]) always times out on large batches. Instead we
 * fire all upserts as independent statements in controlled parallel chunks:
 * each upsert borrows a connection for ~1ms then returns it, so the pool never
 * saturates regardless of batch size.
 *
 *   POST /api/attendance/status/bulk
 *   body: { items: [ <same shape as /api/attendance/status body>, ... ] }
 *   response: { ok, saved, failed, results: [{ worksnapUserId, ok, error? }] }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Run an array of async thunks in parallel batches of `size`.
async function chunked<T>(thunks: (() => Promise<T>)[], size: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < thunks.length; i += size) {
    const batch = await Promise.all(thunks.slice(i, i + size).map((fn) => fn()));
    results.push(...batch);
  }
  return results;
}

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

  // Each contractor's ops (1 week-upsert + up to 7 day-upserts) run as
  // independent statements — no transaction needed since pgbouncer can't hold
  // one open. Contractors are processed in chunks of 4 so at most 4×8=32
  // concurrent statements hit the pool at once, well within the 9-connection
  // limit (each statement holds its connection for ~1ms then releases it).
  const CHUNK = 4;
  const thunks = builtItems.map(({ worksnapUserId, built }) => async () => {
    if (!built.ok) return { worksnapUserId, ok: false as const, error: built.error };
    try {
      // Run this one contractor's 8 ops in parallel — they touch different rows
      // so there's no ordering dependency between them.
      await Promise.all(built.ops);
      return { worksnapUserId, ok: true as const };
    } catch (e) {
      return { worksnapUserId, ok: false as const, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });

  const results = await chunked(thunks, CHUNK);

  const failed = results.filter((r) => !r.ok);
  return Response.json({ ok: failed.length === 0, saved: results.length - failed.length, failed: failed.length, results });
}
