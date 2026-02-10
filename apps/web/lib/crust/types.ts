/**
 * Crust Network Type Definitions
 *
 * Types for Crust IPFS integration with YouTick.
 * Crust provides decentralized IPFS pinning with NEAR-based W3Auth.
 */

/**
 * Crust W3Auth token (generated from NEAR Session Key)
 */
export interface CrustAuthToken {
  /** Authorization header value (Basic base64) */
  header: string;
  /** NEAR account ID */
  accountId: string;
  /** Token creation timestamp (milliseconds) */
  createdAt: number;
  /** Token expiration timestamp (milliseconds) */
  expiresAt: number;
}

/**
 * Result of Crust IPFS upload
 */
export interface CrustUploadResult {
  /** IPFS CID of uploaded file */
  cid: string;
  /** File size in bytes */
  size: number;
}

/**
 * Result of Crust pin operation
 */
export interface CrustPinResult {
  /** IPFS CID */
  cid: string;
  /** Pin status */
  status: 'pinned' | 'queued' | 'failed';
  /** Gateway URL used */
  gateway: string;
}

/**
 * Gateway configuration for multi-gateway failover
 */
export interface GatewayConfig {
  /** Gateway name */
  name: string;
  /** Gateway base URL (e.g. https://crustipfs.xyz/ipfs) */
  url: string;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Whether gateway is currently healthy */
  healthy: boolean;
  /** Last health check timestamp */
  lastCheck: number;
}

/**
 * Crust on-chain storage status for a CID
 */
export interface CrustStorageStatus {
  /** IPFS CID queried */
  cid: string;
  /** Number of storage replicas on Crust chain */
  replicas: number;
  /** File size in bytes (as reported by Crust chain) */
  fileSize: number;
  /** Block number when storage order expires (0 if no order) */
  expireAt: number;
  /** Timestamp of this query */
  queriedAt: number;
  /** Whether a storage order exists on-chain */
  hasStorageOrder: boolean;
}

/**
 * Result of Crust PSA (Pinning Service API) pin request
 */
export interface CrustPsaPinResult {
  /** Pin request ID from Crust PSA */
  requestId: string;
  /** Pin status */
  status: 'queued' | 'pinning' | 'pinned' | 'failed';
  /** IPFS CID */
  cid: string;
  /** Timestamp of pin request */
  createdAt: number;
}

/**
 * Crust error codes
 */
export type CrustErrorCode =
  | 'AUTH_FAILED'            // W3Auth token generation failed
  | 'UPLOAD_FAILED'          // File upload to Crust failed
  | 'PIN_FAILED'             // CID pinning failed
  | 'STORAGE_ORDER_FAILED'   // On-chain storage order failed
  | 'GATEWAY_UNAVAILABLE'    // All gateways unavailable
  | 'NO_SESSION_KEY'         // Session Key not found
  | 'TIMEOUT';               // Operation timed out

/**
 * Crust error class (follows NovaError pattern)
 */
export class CrustError extends Error {
  code: CrustErrorCode;
  cause?: Error;

  constructor(code: CrustErrorCode, message: string, cause?: Error) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = 'CrustError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CrustError);
    }
  }
}
