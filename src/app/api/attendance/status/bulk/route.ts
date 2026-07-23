import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { buildAttendanceStatusOps, type AttendanceStatusInput } from "@/lib/attendanceStatusOps";

/**
 * Save many contractors' attendance for a week in ONE request — Bulk
 * Approve's save. Firing one /api/attendance/status request per selected
 * contractor (the previous approach) meant one auth check + one HTTP round
 * trip per contractor, all racing for the same small connection pool; a
 * large batch could take tens of seconds. This does one auth check and one
 * round trip for the whole batch, but each contractor still gets their own
 * transaction (not one giant transaction for everyone) so one contractor's
 * failure doesn't roll back everyone else's — the caller gets a per-contractor
 * result back and can highlight exactly which ones failed.
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

  const results = await Promise.all(items.map(async (item) => {
    const worksnapUserId = Number(item.worksnapUserId) || null;
    const built = buildAttendanceStatusOps(prisma, item);
    if (!built.ok) return { worksnapUserId, ok: false as const, error: built.error };
    try {
      await prisma.$transaction(built.ops);
      return { worksnapUserId, ok: true as const };
    } catch (e) {
      return { worksnapUserId, ok: false as const, error: e instanceof Error ? e.message : "Unknown error" };
    }
  }));

  const failed = results.filter((r) => !r.ok);
  return Response.json({ ok: failed.length === 0, saved: results.length - failed.length, failed: failed.length, results });
}
