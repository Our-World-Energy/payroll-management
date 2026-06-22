import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  devIndicators: false,
  experimental: {
    optimisticClientCache: true,
  },
};

export default nextConfig;
