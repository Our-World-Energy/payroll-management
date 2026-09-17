import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  trailingSlash: true,
  devIndicators: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    optimisticClientCache: true,
    serverActions: {
      // Announcement image uploads go through a Server Action, and the default
      // request body cap is 1 MB — below the 2 MB the upload form allows, so
      // an in-range image failed at the framework layer before the action ran.
      // 3 MB leaves room for multipart overhead on a 2 MB file.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;

// Makes the Cloudflare bindings (HYPERDRIVE, secrets) available to
// getCloudflareContext() during `next dev`, so local dev exercises the same
// code path as the deployed Worker instead of a Node-only fallback.
//
// Guarded to dev deliberately: unguarded it also initialises the binding
// emulation during `next build`, where Hyperdrive then demands a local
// Postgres connection string and fails a build that never needed a database.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}
