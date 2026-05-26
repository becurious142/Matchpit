import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/api-client-react"],
  experimental: {
    turbo: {
      root: "../../", // Allows Turbopack to resolve packages from the workspace root
    },
  },
};

export default nextConfig;
