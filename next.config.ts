import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  experimental: {
    optimisticClientCache: true,
  },
};

export default nextConfig;
