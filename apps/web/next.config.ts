import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compile the workspace package (shipped as TS source) instead of expecting
  // a pre-built dist. Keeps shared types as the single source of truth.
  transpilePackages: ["@sera/core"],
};

export default nextConfig;
