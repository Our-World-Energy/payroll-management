import type { NextConfig } from "next";

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
