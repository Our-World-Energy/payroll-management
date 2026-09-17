import fs from "node:fs";

/**
 * Makes `pg-cloudflare` resolvable inside the Cloudflare Worker bundle.
 *
 * `pg` picks its socket implementation at runtime: on Workers it detects
 * navigator.userAgent === "Cloudflare-Workers" and requires pg-cloudflare for
 * the native TCP socket. So the real implementation must be in the bundle.
 *
 * pg-cloudflare ships exports where `workerd.import` -> ./esm/index.mjs and
 * `default` -> ./dist/empty.js. The OpenNext dependency copier follows the
 * `default` condition, so it copies only dist/empty.js and skips both the esm
 * build and dist/index.js. esbuild then resolves the workerd condition, finds
 * no esm/index.mjs, and the build dies with:
 *
 *   Could not resolve "pg-cloudflare"   (pg/lib/stream.js)
 *
 * Pointing every condition at ./dist/index.js makes the copier bring the real
 * implementation along and lets esbuild resolve it. Safe because this bundle
 * only ever runs on workerd — dist/empty.js exists as a fallback for
 * environments without the TCP socket API, which is not a case we ship to.
 *
 * Runs from postinstall because it patches node_modules, which npm rebuilds.
 */

const pkgPath = "node_modules/pg-cloudflare/package.json";

if (!fs.existsSync(pkgPath)) {
  console.log("patch-pg-cloudflare: pg-cloudflare not installed, skipping");
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const target = "./dist/index.js";

if (pkg.exports?.["."]?.default === target) {
  console.log("patch-pg-cloudflare: already patched");
  process.exit(0);
}

pkg.exports["."] = {
  workerd: { import: target, require: target },
  default: target,
};
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log(`patch-pg-cloudflare: exports["."] -> ${target}`);
