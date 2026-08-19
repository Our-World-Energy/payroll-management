import { resetAdvanceLeaveIfDue } from "@/app/admin/contractors/actions";

// Runs daily; resetAdvanceLeaveIfDue() is a no-op for any contractor whose
// Cut Off Time cycle was already reset, so most days this touches nothing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    return Response.json({ ok: true, ...(await resetAdvanceLeaveIfDue()) });
  } catch (err) {
    console.error("leave-balance-reset failed:", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
