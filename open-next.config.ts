import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * No incremental cache, tag cache or revalidation queue is configured, because
 * this app has no ISR or SSG revalidation to serve: there is no
 * revalidatePath/revalidateTag/unstable_cache anywhere in src, and 19 of the
 * 24 pages are "use client" shells that fetch their own data. Adding the R2 +
 * D1 cache layer would be cost and moving parts for nothing.
 *
 * Revisit this if a page ever gains `export const revalidate`.
 */
export default defineCloudflareConfig();
