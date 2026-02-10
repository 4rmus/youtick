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
  /** Crust IPFS upload endpoint */
  UPLOAD_ENDPOINT: 'https://crustipfs.xyz/api/v0/add',

  /**
   * Crust IPFS read endpoint (POST only, supports CORS)
   * Usage: POST /api/v0/cat?arg={CID}
   * This is the fastest way to read Crust-pinned content — no propagation delay.
   */
  READ_ENDPOINT: 'https://crustipfs.xyz/api/v0/cat',

  /** Fallback Crust read endpoint */
  READ_ENDPOINT_FALLBACK: 'https://gw.crustfiles.app/api/v0/cat',

  /** W3Auth token cache duration (30 minutes) */
  AUTH_CACHE_DURATION: 30 * 60 * 1000,

  /** Upload timeout (5 minutes) */
  UPLOAD_TIMEOUT: 5 * 60 * 1000,

  /** Fetch timeout per gateway attempt (30 seconds) */
  FETCH_TIMEOUT: 30 * 1000,

  /** Duration to mark a gateway as unhealthy (5 minutes) */
  GATEWAY_UNHEALTHY_DURATION: 5 * 60 * 1000,

  /** Crust chain storage status API (Subscan) */
  STORAGE_STATUS_API: 'https://crust.webapi.subscan.io/api/scan/search',

  /** Crust PSA (IPFS Pinning Service API) endpoint */
  PSA_ENDPOINT: 'https://pin.crustcode.com/psa/pins',

  /** Storage status query timeout (10 seconds) */
  STORAGE_STATUS_TIMEOUT: 10 * 1000,
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
  // IPFS Foundation gateways (reliable, CORS ✓)
  { name: 'ipfs-io',     url: 'https://ipfs.io/ipfs',                    priority: 1, healthy: true, lastCheck: 0 },
  { name: 'dweb',        url: 'https://dweb.link/ipfs',                  priority: 2, healthy: true, lastCheck: 0 },
  { name: 'trustless',   url: 'https://trustless-gateway.link/ipfs',     priority: 3, healthy: true, lastCheck: 0 },
  // Third-party gateways (CORS ✓)
  { name: '4everland',   url: 'https://4everland.io/ipfs',               priority: 4, healthy: true, lastCheck: 0 },
  { name: 'lighthouse',  url: 'https://gateway.lighthouse.storage/ipfs', priority: 5, healthy: true, lastCheck: 0 },
  { name: 'w3s',         url: 'https://w3s.link/ipfs',                   priority: 6, healthy: true, lastCheck: 0 },
  // Note: crustipfs.xyz/ipfs and gw.crustfiles.app/ipfs return 403 for GET requests.
  // Use CRUST_CONSTANTS.READ_ENDPOINT (POST /api/v0/cat) for Crust-pinned content instead.
];
