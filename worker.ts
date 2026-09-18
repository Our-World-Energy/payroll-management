// ts-ignore rather than ts-expect-error: this module is emitted by
// `opennextjs-cloudflare build`, so it is missing on a clean checkout and
// present afterwards. ts-expect-error would itself error once it resolves.
// @ts-ignore
import { default as handler } from "./.open-next/worker.js";

/**
 * Custom Worker entrypoint.
 *
 * OpenNext generates a fetch-only handler. Cron jobs used to be driven by
 * vercel.json hitting two API routes over HTTP; on Workers they arrive as
 * scheduled() invocations instead, so this wrapper re-exports OpenNext's fetch
 * handler unchanged and dispatches cron runs into the very same routes.
 *
 * Dispatching through handler.fetch rather than importing the job functions
 * keeps one code path: the routes keep their own CRON_SECRET check, and
 * hitting them by hand for a manual re-run still behaves identically.
 *
 * The Cloudflare runtime types are declared locally rather than pulled in via
 * `wrangler types`. That generated file lands workerd's global lib over the
 * whole project, which retypes Response.json() from `any` to `unknown` and
 * lights up every existing `await res.json()` call in src/. Only these three
 * shapes are needed here, so they are not worth that.
 */

type ScheduledEvent = { cron: string };
type WorkerEnv = { CRON_SECRET?: string };

// Keyed by the exact cron string from wrangler.jsonc — Cloudflare passes the
// expression that fired as event.cron, so these two must stay in step.
const JOBS: Record<string, string> = {
  "0 0,3,15,18,21 * * *": "/api/cron/worksnap-sync/",
  "0 9 * * *": "/api/cron/leave-balance-reset/",
};

// Any absolute origin works — the request never leaves the isolate. Using the
// real host keeps logs readable.
const ORIGIN = "https://team.ourworldenergy.com";

export default {
  fetch: handler.fetch,

  async scheduled(event: ScheduledEvent, env: WorkerEnv, ctx: unknown): Promise<void> {
    const path = JOBS[event.cron];
    if (!path) {
      console.error(`No job mapped to cron "${event.cron}"`);
      return;
    }

    const secret = env.CRON_SECRET;
    const request = new Request(new URL(path, ORIGIN), {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    });

    const response: Response = await handler.fetch(request, env, ctx);
    const body = await response.text();

    if (!response.ok) {
      // Throwing marks the cron invocation as failed, so it shows up in
      // Workers observability rather than silently logging a 500.
      throw new Error(`${path} failed (${response.status}): ${body.slice(0, 500)}`);
    }
    console.log(`${path} ok: ${body.slice(0, 500)}`);
  },
};
