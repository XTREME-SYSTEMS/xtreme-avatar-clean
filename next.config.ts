import type { NextConfig } from "next";

const figmaPreviewHost =
  process.env.FIGMA && process.env.FIGMA_PUBLIC_URL
    ? new URL(process.env.FIGMA_PUBLIC_URL).hostname
    : undefined;

const nextConfig: NextConfig = {
  allowedDevOrigins: figmaPreviewHost ? [figmaPreviewHost] : undefined,
  poweredByHeader: false,
};

export default nextConfig;
