/**
 * Crust Network Integration Module
 *
 * Provides decentralized IPFS storage for YouTick using Crust Network.
 * Uses W3Auth with NEAR Session Keys for 100% client-side, signless uploads.
 *
 * This module provides 100% decentralized IPFS storage.
 *
 * @example
 * ```typescript
 * import { uploadFile, getContentUrl } from '@/lib/crust';
 *
 * // Upload a file (signless, no gas cost)
 * const result = await uploadFile(file, accountId);
 * console.log('CID:', result.cid);
 *
 * // Get URL for the content
 * const url = getContentUrl(result.cid);
 * ```
 *
 * @module crust
 */

// Types
export type {
    W3AuthToken,
    CrustUploadResult,
    CrustUploadOptions,
    UploadProgress,
    GatewayConfig,
    IpfsAddResponse,
    CrustErrorCode
} from './types';

export { CrustError } from './types';

// W3Auth
export {
    generateW3AuthToken,
    clearW3AuthCache,
    hasValidW3AuthToken
} from './w3auth';

// Upload Client
export {
    uploadFile,
    uploadFiles,
    uploadJson,
    getContentUrl
} from './client';

// Gateway Management
export {
    CRUST_GATEWAYS,
    getCurrentGateway,
    getUploadGateway,
    switchToNextGateway,
    resetGateway,
    markGatewaySuccess,
    fetchWithFailover,
    fetchWithRace,
    checkAvailability,
    getGatewayUrl,
    getGatewayStatus
} from './gateway';
