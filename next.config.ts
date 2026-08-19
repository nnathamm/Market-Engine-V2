import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "*.replit.dev",
    "*.janeway.replit.dev",
    "*.replit.dev:5000",
    "*.janeway.replit.dev:5000",
    "127.0.0.1",
    "127.0.0.1:5000",
    ...(process.env.REPLIT_DEV_DOMAIN ? [process.env.REPLIT_DEV_DOMAIN] : []),
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "*.replit.dev",
        "*.janeway.replit.dev",
        "*.replit.dev:5000",
        "*.janeway.replit.dev:5000",
        "127.0.0.1",
        "127.0.0.1:5000",
        ...(process.env.REPLIT_DEV_DOMAIN ? [process.env.REPLIT_DEV_DOMAIN, `${process.env.REPLIT_DEV_DOMAIN}:5000`] : []),
      ],
    },
  },
};

export default nextConfig;
