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
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.near.org https://dweb.link https://w3s.link https://ipfs.io https://gateway.pinata.cloud https://www.google-analytics.com https://www.googletagmanager.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://rpc.mainnet.near.org https://rpc.testnet.near.org https://free.rpc.fastnear.com https://test.rpc.fastnear.com https://rpc.fastnear.com https://near.lava.build https://near-mainnet.lava.build https://*.near.org wss://*.near.org https://testnet.mynearwallet.com https://app.mynearwallet.com https://ipfs.io https://dweb.link https://w3s.link https://gateway.pinata.cloud https://shade-agent.nova.network https://gateway.nova.network https://nova-mcp.fastmcp.app https://api.coingecko.com https://nova-sdk.com https://www.google-analytics.com https://www.googletagmanager.com",
      "frame-src 'self' https://*.near.org https://wallet.near.org https://app.mynearwallet.com https://testnet.mynearwallet.com",
      "worker-src 'self' blob:",
      "media-src 'self' blob: https://dweb.link https://w3s.link https://ipfs.io https://gateway.pinata.cloud",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
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

  // Increase body size limit for large file uploads via Nova SDK.
  // The SDK sends encrypted file data as base64 JSON to /api/finalize-upload
  // which can exceed the default 1MB limit.
  experimental: {
    serverActions: {
      bodySizeLimit: '200mb',
    },
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

  // Rewrite upload-heavy endpoints directly to the upstream server.
  // This bypasses the route handler's body parsing layer, avoiding
  // 413 Payload Too Large errors for large encrypted file uploads.
  // Auth headers (Authorization, X-Account-Id) from the browser request
  // are forwarded automatically by the rewrite proxy.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/nova-proxy/api/finalize-upload',
          destination: 'https://nova-mcp.fastmcp.app/api/finalize-upload',
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
