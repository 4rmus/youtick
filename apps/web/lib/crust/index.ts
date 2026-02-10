/**
 * Crust Network Module
 *
 * Decentralized IPFS pinning and retrieval via Crust Network.
 * Uses W3Auth (NEAR Session Key) authentication for decentralized storage.
 */

// Types
export type {
  CrustAuthToken,
  CrustUploadResult,
  CrustPinResult,
  GatewayConfig,
  CrustErrorCode,
} from './types';
export { CrustError } from './types';

// Config
export { CRUST_CONSTANTS, CRUST_GATEWAYS } from './config';

// W3Auth
export {
  generateW3AuthToken,
  getCachedW3AuthToken,
  clearW3AuthCache,
} from './w3auth';

// Gateway
export {
  getGatewayUrl,
  getGatewayUrls,
  fetchFromGateways,
  markGatewayUnhealthy,
  getBestGateway,
} from './gateway';

// Client
export {
  uploadToCrust,
  pinOnCrust,
  verifyCrustAvailability,
} from './client';

// Storage Status
export { queryStorageStatus } from './storage-status';

// Storage Orders
export { placeStorageOrder } from './storage-order';
