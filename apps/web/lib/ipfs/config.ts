/**
 * IPFS read-path configuration.
 */

export interface GatewayConfig {
  name: string;
  url: string;
  priority: number;
  healthy: boolean;
  lastCheck: number;
}

export const IPFS_CONSTANTS = {
  /** Fetch timeout per gateway attempt (30 seconds) */
  FETCH_TIMEOUT: 30 * 1000,

  /** Duration to mark a gateway as unhealthy (5 minutes) */
  GATEWAY_UNHEALTHY_DURATION: 5 * 60 * 1000,

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
];
