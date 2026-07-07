import { runWorksnapSync } from "@/lib/worksnap-sync";
import { requireAdmin } from "@/lib/auth";

/**
 * Manual "Sync All Data" trigger for the attendance page. Admin-only
 * (session + 2FA). Reuses the shared sync routine — distinct from the Vercel
 * cron GET, which is gated by CRON_SECRET instead.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    return Response.json(await runWorksnapSync());
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
