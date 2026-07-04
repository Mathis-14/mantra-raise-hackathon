import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright + the Computer Use loop run in the worker process, never in a
  // route handler — keep them out of the Next.js bundle.
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
