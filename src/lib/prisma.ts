import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Prisma on Cloudflare Workers.
 *
 * Two things differ from the Node build this file used to carry:
 *
 * 1. There is no Rust query engine. `engineType = "client"` in schema.prisma
 *    generates a Rust-free client that reaches Postgres through a driver
 *    adapter (`pg`) instead of a native binary Workers cannot load.
 *
 * 2. The client can no longer be a module-level singleton. A Worker isolate is
 *    reused across requests, and holding one pg Pool open across them
 *    deadlocks against Hyperdrive once the isolate outlives the pooled
 *    connections (prisma/orm#28193). So the client is scoped to a single
 *    request and thrown away with it — Hyperdrive does the real pooling, so
 *    the per-request pool is cheap.
 *
 * Every call site still imports `prisma` and calls it exactly as before; the
 * Proxy below resolves the right per-request client on each property access.
 */

const DEV = process.env.NODE_ENV === "development";

function create(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: DEV ? ["warn", "error"] : ["error"],
  });
}

// Keyed on the request's ExecutionContext, which is a fresh object per
// invocation — so the entry (and the pool it holds) becomes collectable as
// soon as the request is done.
const perRequest = new WeakMap<object, PrismaClient>();
let outsideWorkers: PrismaClient | undefined;

function client(): PrismaClient {
  let key: object | undefined;
  let connectionString: string | undefined;

  try {
    const { env, ctx } = getCloudflareContext();
    key = ctx as unknown as object;
    // Hyperdrive fronts the Supabase database: it pools and caches at the edge,
    // and hands back a local connection string pointing at its own proxy.
    connectionString = (env as { HYPERDRIVE?: { connectionString: string } })
      .HYPERDRIVE?.connectionString;
  } catch {
    // Not inside a Worker request — a migration script, a build-time import, or
    // `next dev` before the Cloudflare dev context is initialised. Fall through
    // to DATABASE_URL.
  }

  connectionString ??= process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "No database connection available: neither the HYPERDRIVE binding nor DATABASE_URL is set.",
    );
  }

  if (!key) return (outsideWorkers ??= create(connectionString));

  let existing = perRequest.get(key);
  if (!existing) {
    existing = create(connectionString);
    perRequest.set(key, existing);
  }
  return existing;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const active = client();
    const value = Reflect.get(active, prop, receiver);
    // Model delegates and $-methods must stay bound to the client they came
    // from, or `prisma.$transaction(...)` and friends lose their `this`.
    return typeof value === "function" ? value.bind(active) : value;
  },
});
