import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const isWeb4 = process.env.NEXT_PUBLIC_DEPLOY_TARGET === 'web4';

const cspValue = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self' https:",
  "media-src 'self' blob: https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  // Static export for Web4 deployment (youtick.near.page)
  // Enabled when NEXT_PUBLIC_DEPLOY_TARGET=web4 (via `npm run build:web4`)
  // Disabled in dev mode so API routes still work locally
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspValue,
          },
        ],
      },
    ];
  },
  ...(isWeb4 && {
    output: 'export' as const,
    trailingSlash: true,
  }),

  // Disable next/image optimization (required for static export, harmless otherwise)
  images: {
    unoptimized: true,
  },

  // Remove console.log in production (keeps error, warn)
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },

  // When not in Web4 mode, keep server features for local dev
  ...(!isWeb4 && {
    serverExternalPackages: ["pino", "thread-stream"],
  }),

  // Poweredby header not useful for decentralized deployment
  poweredByHeader: false,

  turbopack: {
    root: path.resolve(__dirname),
  },

  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },

  // Generate build ID deterministically for cache coherence
  generateBuildId: isWeb4
    ? async () => `web4-${Date.now()}`
    : undefined,
};

const sentryConfig = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  hideSourceMaps: true,
};

export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryConfig)
  : nextConfig;
