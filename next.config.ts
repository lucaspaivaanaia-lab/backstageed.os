import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to this project — avoids Next.js misdetecting
    // an unrelated lockfile elsewhere on disk as the monorepo root.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
