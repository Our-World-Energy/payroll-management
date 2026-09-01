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
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [trackedEmails, profiles] = await Promise.all([
    prisma.worksnapDailyLog.findMany({ select: { email: true }, distinct: ["email"] }),
    prisma.contractorProfile.findMany({
      where: { status: "Active" },
      select: { email: true, fullName: true, firstName: true, surname: true, department: true },
    }),
  ]);

  const tracked = new Set(
    trackedEmails.map((e) => (e.email ?? "").trim().toLowerCase()).filter(Boolean)
  );

  const untracked = profiles
    .filter((p) => p.email && !tracked.has(p.email.trim().toLowerCase()))
    .map((p) => ({
      email: p.email.trim(),
      name: p.fullName?.trim() || [p.firstName, p.surname].filter(Boolean).join(" ").trim() || p.email.trim(),
      department: p.department?.trim() ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return Response.json({ untracked, activeCount: profiles.length });
}
