/**
 * NOVA Secure File-Sharing Type Definitions
 *
 * Type definitions for NOVA integration with YouTick.
 * NOVA provides TEE-based encryption and group-based access control.
 */

/**
 * NOVA authentication token (generated from NEAR Session Key)
 */
export interface NovaAuthToken {
  /** JWT authentication token */
  authToken: string;
  /** NEAR account ID */
  accountId: string;
  /** Token expiration timestamp (milliseconds) */
  expiresAt: number;
  /** TEE attestation data (optional - string for legacy, structured for verified) */
  teeAttestation?: TEEAttestation | string;
}

/**
 * Result of NOVA file upload
 */
export interface NovaUploadResult {
  /** IPFS CID of uploaded (encrypted) file */
  cid: string;
  /** NOVA group ID for access control */
  groupId: string;
  /** File size in bytes */
  size: number;
  /** Whether file was encrypted with TEE */
  teeEncrypted: boolean;
  /** CID of the AES key stored in Nova (Crust+Nova hybrid flow) */
  keyCid: string;
}

/**
 * Upload progress callback data
 */
export interface UploadProgress {
  /** Bytes uploaded so far */
  loaded: number;
  /** Total file size in bytes */
  total: number;
  /** Upload percentage (0-100) */
  percentage: number;
}

/**
 * NOVA group metadata
 */
export interface NovaGroup {
  /** NOVA group ID */
  groupId: string;
  /** Group name */
  name: string;
  /** Group owner (NEAR account) */
  owner: string;
  /** Group members (NEAR accounts) */
  members: string[];
  /** Content CID this group controls access to */
  contentCid: string;
  /** Group creation timestamp */
  createdAt: number;
}

/**
 * NOVA upload options
 */
export interface NovaUploadOptions {
  /** Filename for IPFS metadata */
  filename?: string;
  /** Progress callback */
  onProgress?: (progress: UploadProgress) => void;
  /** Request timeout (milliseconds) */
  timeout?: number;
  /** Whether to verify TEE attestation before upload */
  verifyAttestation?: boolean;
}

/**
 * NOVA fetch options
 */
export interface NovaFetchOptions {
  /** NOVA group ID (required for authorization) */
  groupId: string;
  /** CID of AES key in Nova (Crust+Nova hybrid flow) */
  keyCid: string;
  /** Request timeout (milliseconds) */
  timeout?: number;
  /** Whether to verify TEE attestation */
  verifyAttestation?: boolean;
}

/**
 * Group creation parameters
 */
export interface CreateGroupParams {
  /** Group name */
  name: string;
  /** Group owner (NEAR account) */
  owner: string;
  /** Initial members (NEAR accounts) */
  members: string[];
  /** Content CID to protect */
  cid: string;
}

/**
 * NOVA configuration
 */
export interface NovaConfig {
  /** Network (testnet or mainnet) */
  network: 'testnet' | 'mainnet';
  /** NOVA API key */
  apiKey?: string;
  /** NOVA account ID (e.g. "yourapp.nova-sdk.near") - used for SDK auth */
  novaAccountId?: string;
}

/**
 * NOVA error codes
 */
export type NovaErrorCode =
  | 'NO_SESSION_KEY'          // Session Key not found in localStorage
  | 'AUTH_FAILED'             // NOVA authentication failed
  | 'TEE_UNAVAILABLE'         // NOVA Shade Agent is down
  | 'UPLOAD_FAILED'           // File upload failed
  | 'FETCH_FAILED'            // File fetch failed
  | 'ACCESS_DENIED'           // User not authorized to access content
  | 'NOT_FOUND'               // File not found on NOVA IPFS
  | 'GROUP_CREATE_FAILED'     // Group creation failed
  | 'GROUP_ADD_FAILED'        // Failed to add member to group
  | 'GROUP_QUERY_FAILED'      // Failed to query group data
  | 'INVALID_CONFIG'          // Invalid NOVA configuration
  | 'NETWORK_ERROR'           // Network timeout or connection error
  | 'ATTESTATION_FAILED';     // TEE attestation verification failed

/**
 * NOVA error class
 */
export class NovaError extends Error {
  code: NovaErrorCode;
  cause?: Error;

  constructor(code: NovaErrorCode, message: string, cause?: Error) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = 'NovaError';

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NovaError);
    }
  }
}

/**
 * NOVA authentication request payload
 */
export interface NovaAuthRequest {
  /** NEAR account ID */
  accountId: string;
  /** Signature (hex string) */
  signature: string;
  /** Public key */
  publicKey: string;
  /** Nonce (timestamp-based) */
  nonce: string;
  /** Chain type */
  chainType: 'near';
}

/**
 * NOVA authentication response
 */
export interface NovaAuthResponse {
  /** JWT token */
  token: string;
  /** TEE attestation (optional) */
  attestation?: string;
  /** Token expiration timestamp */
  expiresAt: number;
}

/**
 * TEE health check result
 */
export interface TEEHealthCheck {
  /** Health status */
  status: 'UP' | 'DOWN';
  /** Response latency (milliseconds) */
  latency?: number;
  /** Error message if down */
  error?: string;
  /** Timestamp of check */
  timestamp: number;
}

/**
 * TEE attestation data returned by Nova Shade Agent
 */
export interface TEEAttestation {
  /** TEE platform (e.g. "phala", "sgx", "simulation") */
  platform: string;
  /** Enclave measurement hash */
  enclave_hash: string;
  /** Raw attestation quote (hex or base64) */
  quote: string;
  /** Attestation report body */
  report: string;
  /** When the attestation was generated (ms epoch) */
  timestamp: number;
  /** Attestation validity deadline (ms epoch) */
  valid_until: number;
}

/**
 * Inline attestation (subset included in auth responses)
 */
export interface InlineAttestation {
  /** Raw attestation quote */
  quote: string;
  /** Attestation report body */
  report: string;
}

/**
 * Result of attestation verification
 */
export interface AttestationVerificationResult {
  /** Whether verification passed */
  verified: boolean;
  /** TEE platform (e.g. "phala", "simulation") */
  platform?: string;
  /** Verified enclave hash */
  enclaveHash?: string;
  /** Attestation generation timestamp */
  attestedAt?: number;
  /** Attestation validity deadline */
  validUntil?: number;
  /** Error message if verification failed */
  error?: string;
  /** Which check failed (structure, freshness, enclave_hash) */
  failedCheck?: 'structure' | 'freshness' | 'enclave_hash';
}

/**
 * Options for attestation verification
 */
export interface AttestationVerifyOptions {
  /** Maximum attestation age in milliseconds (default: 1 hour) */
  maxAge?: number;
  /** Expected enclave hash to verify against */
  expectedEnclaveHash?: string;
  /** Force fresh fetch (bypass cache) */
  forceFresh?: boolean;
}

// ============================================================================
// Public Group Types (for thumbnails)
// ============================================================================

/**
 * Public group configuration
 */
export interface NovaPublicGroupConfig {
  /** Public group ID prefix */
  prefix: string;
  /** Cache duration in milliseconds */
  cacheDuration: number;
  /** Auto-join enabled for public groups */
  autoJoin: boolean;
}

/**
 * Result of public thumbnail upload
 */
export interface NovaThumbnailResult extends NovaUploadResult {
  /** Nova URL format: nova://{groupId}/{cid} */
  novaUrl: string;
  /** Legacy IPFS gateway URL (for backward compatibility) */
  gatewayUrl: string;
}

/**
 * Parsed Nova URL components
 */
export interface ParsedNovaUrl {
  /** NOVA group ID */
  groupId: string;
  /** IPFS CID */
  cid: string;
}

/**
 * Type guard: Check if URL is a Nova URL (nova://)
 */
export function isNovaUrl(url: string | undefined | null): url is string {
  return typeof url === 'string' && url.startsWith('nova://');
}

/**
 * Type guard: Check if URL is a legacy IPFS URL
 */
export function isIpfsUrl(url: string | undefined | null): url is string {
  if (typeof url !== 'string') return false;
  return url.includes('/ipfs/') || url.startsWith('ipfs://');
}
