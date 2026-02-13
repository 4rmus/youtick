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
      "img-src 'self' data: blob: https://*.near.org https://crustipfs.xyz https://ipfs.io https://dweb.link https://*.dweb.link https://trustless-gateway.link https://4everland.io https://*.4everland.io https://gateway.lighthouse.storage https://w3s.link https://*.w3s.link https://gw.crustfiles.app https://www.google-analytics.com https://www.googletagmanager.com https://raw.githubusercontent.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://rpc.mainnet.near.org https://rpc.testnet.near.org https://free.rpc.fastnear.com https://test.rpc.fastnear.com https://rpc.fastnear.com https://c1.rpc.fastnear.com https://c2.rpc.fastnear.com https://near.lava.build https://near-mainnet.lava.build https://*.near.org wss://*.near.org https://*.aurora.dev https://testnet.mynearwallet.com https://app.mynearwallet.com https://crustipfs.xyz https://gw.crustfiles.app https://ipfs.io https://dweb.link https://*.dweb.link https://trustless-gateway.link https://4everland.io https://*.4everland.io https://gateway.lighthouse.storage https://w3s.link https://*.w3s.link https://shade-agent.nova.network https://gateway.nova.network https://nova-mcp.fastmcp.app https://api.coingecko.com https://api.binance.com https://min-api.cryptocompare.com https://nova-sdk.com https://crust.webapi.subscan.io https://pin.crustcode.com https://www.google-analytics.com https://www.googletagmanager.com https://raw.githubusercontent.com https://1click.chaindefuser.com https://rpc.mainnet.pagoda.co https://arb1.arbitrum.io https://mainnet.base.org",
      "frame-src 'self' https://*.near.org https://wallet.near.org https://app.mynearwallet.com https://testnet.mynearwallet.com blob:",
      "worker-src 'self' blob:",
      "media-src 'self' blob: https://crustipfs.xyz https://gw.crustfiles.app https://ipfs.io https://dweb.link https://*.dweb.link https://trustless-gateway.link https://4everland.io https://*.4everland.io https://gateway.lighthouse.storage https://w3s.link https://*.w3s.link",
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

  // Body size limits for Nova proxy (now only small JSON: auth, group mgmt, key storage)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
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

  // No rewrites needed — Nova proxy only handles small JSON (auth, groups, keys).
  // Large file uploads go directly to Crust via the client.
};

export default nextConfig;
