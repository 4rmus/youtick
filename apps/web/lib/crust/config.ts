/**
 * Crust Network Configuration
 *
 * Upload endpoints, timeouts, and constants for Crust IPFS integration.
 */

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
