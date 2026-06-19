// Netlify Scheduled Function — runs the Worksnaps→Supabase sync 3x/day.
// (Vercel cron in vercel.json does NOT run on Netlify; this is the Netlify
// equivalent.) It calls the Next.js cron route with the CRON_SECRET.
//
// Env required (Netlify → Site configuration → Environment variables):
//   CRON_SECRET            must match the value the /api/cron route checks
//   (URL is provided automatically by Netlify)

export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
  const secret = process.env.CRON_SECRET || "";
  if (!base) {
    return new Response("no site URL", { status: 500 });
  }
  const res = await fetch(`${base}/api/cron/worksnap-sync/`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log("worksnap-sync:", res.status, body.slice(0, 300));
  return new Response(body, { status: res.status });
};

// Netlify cron — 08:00, 14:00, 20:00 (UTC) daily
export const config = {
  schedule: "0 8,14,20 * * *",
};
