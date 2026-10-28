import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@ffprobe-installer/ffprobe"],
};

export default nextConfig;
