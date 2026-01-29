import type { NextConfig } from "next";

// P0 Fix: Security headers for mainnet production
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()'
  },
  // Content Security Policy - adjust domains as needed
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.lit-protocol.com https://*.litprotocol.com https://www.googletagmanager.com https://www.google-analytics.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.near.org https://crustipfs.xyz https://*.crustfiles.app https://dweb.link https://w3s.link https://ipfs.io https://www.google-analytics.com https://www.googletagmanager.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://*.near.org",
      "worker-src 'self' blob:",
      "media-src 'self' blob: https://crustipfs.xyz https://*.crustfiles.app https://dweb.link https://w3s.link https://ipfs.io",
    ].join('; ')
  }
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pino", "thread-stream"],

  // P0 Fix: Remove console.log in production (keeps error, warn)
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },

  // Security headers for all routes
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
