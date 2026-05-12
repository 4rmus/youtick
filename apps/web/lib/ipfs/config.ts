/**
 * IPFS read-path configuration.
 *
 * Gateway reads live here so Crust can remain focused on upload/write APIs.
 */

import type { GatewayConfig } from '../crust/types';
import { CRUST_CONSTANTS } from '../crust/config';

export const IPFS_CONSTANTS = {
  /** Crust IPFS read endpoint (POST only, supports CORS) */
  READ_ENDPOINT: CRUST_CONSTANTS.READ_ENDPOINT,

  /** Optional fallback Crust read endpoint (disabled until TLS issues are resolved) */
  READ_ENDPOINT_FALLBACK: CRUST_CONSTANTS.READ_ENDPOINT_FALLBACK,

  /** Fetch timeout per gateway attempt (30 seconds) */
  FETCH_TIMEOUT: CRUST_CONSTANTS.FETCH_TIMEOUT,

  /** Duration to mark a gateway as unhealthy (5 minutes) */
  GATEWAY_UNHEALTHY_DURATION: CRUST_CONSTANTS.GATEWAY_UNHEALTHY_DURATION,

  /** Optional hot media delivery Worker for encrypted manifest/segment reads */
  MEDIA_DELIVERY: CRUST_CONSTANTS.MEDIA_DELIVERY,
} as const;

/**
 * IPFS gateway list (ordered by priority)
 *
 * All gateways support CORS (Access-Control-Allow-Origin: *).
 * Crust-operated /ipfs/ gateways are excluded — they return 403/410 and lack CORS.
 * For Crust-pinned content, use IPFS_CONSTANTS.READ_ENDPOINT (POST /api/v0/cat).
 *
 * @see https://ipfs.github.io/public-gateway-checker/ — live status
 */
export const IPFS_GATEWAYS: GatewayConfig[] = [
  // Prioritize gateways that have been reliable for encrypted video reads.
  { name: 'ipfs-io', url: 'https://ipfs.io/ipfs', priority: 1, healthy: true, lastCheck: 0 },
  { name: 'lighthouse', url: 'https://gateway.lighthouse.storage/ipfs', priority: 2, healthy: true, lastCheck: 0 },
  // Third-party gateways (CORS ok)
  { name: '4everland', url: 'https://4everland.io/ipfs', priority: 3, healthy: true, lastCheck: 0 },
  { name: 'w3s', url: 'https://w3s.link/ipfs', priority: 4, healthy: true, lastCheck: 0 },
  { name: 'dweb', url: 'https://dweb.link/ipfs', priority: 5, healthy: true, lastCheck: 0 },
  // Crust-operated gateways are excluded as they have TLS/CORS issues currently.
];
