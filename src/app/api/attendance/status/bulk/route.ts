import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { buildAttendanceStatusOps, type AttendanceStatusInput } from "@/lib/attendanceStatusOps";

/**
 * Save many contractors' attendance for a week in ONE request/transaction —
 * Bulk Approve's save. Firing one /api/attendance/status request per selected
 * contractor (the previous approach) meant one auth check + one DB
 * transaction/connection per contractor, all racing for the same small
 * connection pool; a large batch could take tens of seconds. This does the
 * same per-contractor upserts, but as a single round trip and a single
 * transaction.
 *
 *   POST /api/attendance/status/bulk
 *   body: { items: [ <same shape as /api/attendance/status body>, ... ] }
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

  // Built once against a plain object here just to validate/count upfront;
  // the real ops (built per-item against the transaction client) run below.
  const errors: string[] = [];
  const validItems = items.filter((item) => {
    const result = buildAttendanceStatusOps(prisma, item);
    if (!result.ok) { errors.push(result.error); return false; }
    return true;
  });

  if (validItems.length === 0) {
    return Response.json({ error: errors[0] ?? "No valid items to save" }, { status: 400 });
  }

  // Interactive transaction (not the array form) so a large batch — many
  // sequential statements over one connection — can be given more headroom
  // than Prisma's 5s default transaction timeout.
  await prisma.$transaction(async (tx) => {
    for (const item of validItems) {
      const result = buildAttendanceStatusOps(tx, item);
      if (!result.ok) continue; // already validated above
      for (const op of result.ops) await op;
    }
  }, { timeout: 60_000 });

  return Response.json({ ok: true, saved: validItems.length, failed: errors.length });
}
