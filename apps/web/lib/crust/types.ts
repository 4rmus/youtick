/**
 * Crust Network Type Definitions
 *
 * Type definitions for Crust W3Auth integration with NEAR Protocol
 */

/**
 * W3Auth token structure for Crust IPFS authentication
 */
export interface W3AuthToken {
    /** Authorization header value (Basic base64(...)) */
    authHeader: string;
    /** NEAR public key used for authentication */
    publicKey: string;
    /** Account ID that generated the token */
    accountId: string;
    /** Timestamp when token was generated */
    generatedAt: number;
}

/**
 * Result of a successful Crust upload
 */
export interface CrustUploadResult {
    /** IPFS CID (Content Identifier) */
    cid: string;
    /** File size in bytes */
    size: number;
    /** Original filename */
    name?: string;
}

/**
 * Upload options for Crust client
 */
export interface CrustUploadOptions {
    /** Custom filename for the upload */
    filename?: string;
    /** Callback for upload progress */
    onProgress?: (progress: UploadProgress) => void;
    /** Request timeout in milliseconds */
    timeout?: number;
}

/**
 * Upload progress information
 */
export interface UploadProgress {
    /** Bytes uploaded so far */
    loaded: number;
    /** Total bytes to upload */
    total: number;
    /** Progress percentage (0-100) */
    percentage: number;
}

/**
 * Gateway configuration
 */
export interface GatewayConfig {
    /** Gateway URL (without /ipfs suffix) */
    url: string;
    /** Gateway priority (lower = higher priority) */
    priority: number;
    /** Whether this gateway supports uploads */
    supportsUpload: boolean;
}

/**
 * Crust IPFS API response for add operation
 */
export interface IpfsAddResponse {
    /** File name */
    Name: string;
    /** IPFS CID */
    Hash: string;
    /** File size as string */
    Size: string;
}

/**
 * Error types specific to Crust operations
 */
export type CrustErrorCode =
    | 'NO_SESSION_KEY'
    | 'AUTH_FAILED'
    | 'UPLOAD_FAILED'
    | 'GATEWAY_UNAVAILABLE'
    | 'INVALID_RESPONSE'
    | 'NETWORK_ERROR';

/**
 * Crust operation error
 */
export class CrustError extends Error {
    constructor(
        public code: CrustErrorCode,
        message: string,
        public cause?: Error
    ) {
        super(message);
        this.name = 'CrustError';
    }
}
