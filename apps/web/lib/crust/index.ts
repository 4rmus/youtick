/**
 * Crust Network Module
 *
 * Decentralized IPFS pinning and retrieval via Crust Network.
 * Uses W3Auth (NEAR Session Key) authentication for decentralized storage.
 */

// Types
export type {
  CrustAuthToken,
  CrustDirectoryUploadEntry,
  CrustDirectoryUploadResult,
  CrustUploadResult,
  CrustPinResult,
  CrustPsaPinResult,
  GatewayConfig,
  CrustErrorCode,
  StorageOrderTrack,
} from './types';
export { CrustError } from './types';

// Config
export { CRUST_CONSTANTS, CRUST_GATEWAYS } from './config';

// W3Auth
export {
  generateW3AuthToken,
  getCachedW3AuthToken,
  clearW3AuthCache,
  ensureFreshW3AuthToken,
} from './w3auth';

// Gateway
export {
  getGatewayUrl,
  getGatewayUrls,
  resolveGatewayUrl,
  fetchFromGateways,
  markGatewayUnhealthy,
  markGatewayUnhealthyByUrl,
  getBestGateway,
} from './gateway';

// Client
export {
  uploadToCrust,
  uploadDirectoryToCrust,
  pinOnCrust,
  verifyCrustAvailability,
} from './client';

// Storage Orders
export {
  placeStorageOrder,
  placeStorageOrders,
  checkStorageOrderStatus,
  verifyStorageOrders,
} from './storage-order';
export type { StorageOrderBatchResult, StorageOrderVerifyResult } from './storage-order';

// CID Collector
export { CidCollector } from './cid-collector';
export type { UploadedAsset, UploadedAssetType } from './cid-collector';
