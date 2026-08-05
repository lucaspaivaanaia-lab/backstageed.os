import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to this project — avoids Next.js misdetecting
    // an unrelated lockfile elsewhere on disk as the monorepo root.
    root: path.resolve(__dirname),
  },
  experimental: {
    serverActions: {
      // Next.js defaults Server Action request bodies to 1MB, well under
      // this app's own 5MB per-file limit (MAX_FILE_BYTES in
      // lib/actions/client-files.ts) — any client file upload past 1MB hit
      // "Body exceeded 1 MB limit" before ever reaching that check. 6mb
      // gives headroom for multipart/form-data framing overhead above the
      // 5MB payload itself.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
