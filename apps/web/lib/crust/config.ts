/**
 * Crust Network Configuration
 *
 * Gateway URLs, timeouts, and constants for Crust IPFS integration.
 */

import { GatewayConfig } from './types';

/**
 * Crust configuration constants
 */
export const CRUST_CONSTANTS = {
  /** Crust IPFS upload endpoints (primary + fallbacks) */
  UPLOAD_ENDPOINT: 'https://crustipfs.xyz/api/v0/add',
  UPLOAD_ENDPOINTS_FALLBACK: [
    'https://gw.crustfiles.app/api/v0/add',
    'https://gw-seattle.crustcloud.io/api/v0/add',
  ] as readonly string[],

  /**
   * Crust IPFS read endpoint (POST only, supports CORS)
   * Usage: POST /api/v0/cat?arg={CID}
   * This is the fastest way to read Crust-pinned content — no propagation delay.
   */
  READ_ENDPOINT: 'https://crustipfs.xyz/api/v0/cat',

  /** Optional fallback Crust read endpoint (disabled until TLS issues are resolved) */
  READ_ENDPOINT_FALLBACK: '',

  /** W3Auth token cache duration (30 minutes) */
  AUTH_CACHE_DURATION: 30 * 60 * 1000,

  /** Upload timeout (15 minutes — increased for 500 MB uploads) */
  UPLOAD_TIMEOUT: 15 * 60 * 1000,

  /** Fetch timeout per gateway attempt (30 seconds) */
  FETCH_TIMEOUT: 30 * 1000,

  /** Duration to mark a gateway as unhealthy (5 minutes) */
  GATEWAY_UNHEALTHY_DURATION: 5 * 60 * 1000,

  /** Crust PSA (IPFS Pinning Service API) endpoint */
  PSA_ENDPOINT: process.env.NEXT_PUBLIC_DEPLOY_TARGET === 'web4'
    ? '/api/crust/psa/pins'
    : 'https://pin.crustcode.com/psa/pins',

  /** Optional hot media delivery Worker for encrypted manifest/segment reads */
  MEDIA_DELIVERY: {
    ENABLED: process.env.NEXT_PUBLIC_ENABLE_MEDIA_DELIVERY_WORKER === 'true',
    BASE_URL: (process.env.NEXT_PUBLIC_MEDIA_DELIVERY_URL || '').trim().replace(/\/+$/, ''),
  },
} as const;

/**
 * IPFS gateway list (ordered by priority)
 *
 * All gateways support CORS (Access-Control-Allow-Origin: *).
 * Crust-operated /ipfs/ gateways are excluded — they return 403/410 and lack CORS.
 * For Crust-pinned content, use CRUST_CONSTANTS.READ_ENDPOINT (POST /api/v0/cat).
 *
 * @see https://ipfs.github.io/public-gateway-checker/ — live status
 */
export const CRUST_GATEWAYS: GatewayConfig[] = [
  // Prioritize gateways that have been reliable for encrypted video reads.
  { name: 'ipfs-io', url: 'https://ipfs.io/ipfs', priority: 1, healthy: true, lastCheck: 0 },
  { name: 'lighthouse', url: 'https://gateway.lighthouse.storage/ipfs', priority: 2, healthy: true, lastCheck: 0 },
  // Third-party gateways (CORS ✓)
  { name: '4everland', url: 'https://4everland.io/ipfs', priority: 3, healthy: true, lastCheck: 0 },
  { name: 'w3s', url: 'https://w3s.link/ipfs', priority: 4, healthy: true, lastCheck: 0 },
  { name: 'dweb', url: 'https://dweb.link/ipfs', priority: 5, healthy: true, lastCheck: 0 },
  // Crust-operated gateways are excluded as they have TLS/CORS issues currently.
];
