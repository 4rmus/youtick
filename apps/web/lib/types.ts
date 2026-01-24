/**
 * Centralized Type Definitions for YouTick
 *
 * This file consolidates type definitions to:
 * - Eliminate duplicate type definitions across files
 * - Reduce `any` usage
 * - Provide single source of truth for shared types
 */

// ============================================================================
// NEAR Protocol Types
// ============================================================================

/**
 * NEAR network identifier
 */
export type NetworkId = 'testnet' | 'mainnet';

/**
 * NEAR account balance information
 */
export interface AccountBalance {
    total: string;
    stateStaked: string;
    staked: string;
    available: string;
}

/**
 * NEAR access key permission types
 */
export interface FunctionCallPermission {
    FunctionCall: {
        allowance: string | null;
        receiver_id: string;
        method_names: string[];
    };
}

export type AccessKeyPermission = 'FullAccess' | FunctionCallPermission;

/**
 * NEAR access key info
 */
export interface AccessKeyInfo {
    public_key: string;
    access_key: {
        nonce: number;
        permission: AccessKeyPermission;
    };
}

/**
 * NEAR execution failure (contract errors, gas errors, etc.)
 */
export interface NEARFailure {
    ActionError?: {
        index: number;
        kind: Record<string, unknown>;
    };
    InvalidTxError?: Record<string, unknown>;
}

/**
 * NEAR transaction outcome
 */
export interface TransactionOutcome {
    transaction: {
        hash: string;
        signer_id: string;
        receiver_id: string;
    };
    status?: {
        SuccessValue?: string;
        Failure?: NEARFailure;
    };
    receipts_outcome?: Array<{
        id: string;
        outcome: {
            status: {
                SuccessValue?: string;
                Failure?: NEARFailure;
            };
            logs: string[];
        };
    }>;
}

// ============================================================================
// NFT Types
// ============================================================================

/**
 * NFT Token metadata (NEP-171)
 */
export interface NFTMetadata {
    title?: string;
    description?: string;
    media?: string;
    media_hash?: string;
    copies?: number;
    issued_at?: string;
    expires_at?: string;
    starts_at?: string;
    updated_at?: string;
    extra?: string;
    reference?: string;
    reference_hash?: string;
}

/**
 * Video-specific metadata
 */
export interface VideoMetadata {
    encrypted_cid: string;
    duration_seconds: number;
    event_date?: number;
    content_type: string;
    price?: string;
}

/**
 * NFT Token with video metadata
 */
export interface NFTToken {
    token_id: string;
    owner_id: string;
    metadata?: NFTMetadata;
    approved_account_ids?: Record<string, number>;
}

/**
 * Token with video metadata (combined)
 */
export interface TokenWithVideo extends NFTToken {
    video_metadata?: VideoMetadata;
}

/**
 * Event data from contract
 */
export interface NFTEvent {
    encrypted_cid: string;
    title: string;
    description: string;
    creator_id: string;
    price: string;
    created_at?: number;
}

// ============================================================================
// Lit Protocol Types
// ============================================================================

/**
 * PKP (Programmable Key Pair) data
 * Used for signless transactions with Lit Protocol
 */
export interface PKPData {
    /** PKP public key */
    publicKey: string;
    /** Derived Ethereum address */
    ethAddress: string;
    /** PKP Token ID (on Chronicle) */
    tokenId?: string;
}

/**
 * Lit Protocol session signatures
 */
export interface LitSessionSigs {
    [nodeAddress: string]: {
        sig: string;
        derivedVia: string;
        signedMessage: string;
        address: string;
        algo: string;
    };
}

/**
 * Lit Protocol access control condition
 */
export interface LitAccessControlCondition {
    conditionType: 'evmBasic' | 'evmContract' | 'solRpc' | 'cosmos' | 'litAction';
    contractAddress?: string;
    functionName?: string;
    functionParams?: string[];
    functionAbi?: Record<string, unknown>;
    chain?: string;
    returnValueTest: {
        key?: string;
        comparator: string;
        value: string;
    };
    // Lit Action specific
    code?: string;
    ipfsId?: string;
    jsParams?: Record<string, unknown>;
}

/**
 * Encryption result from Lit Protocol
 */
export interface EncryptionResult {
    ciphertext: string;
    dataToEncryptHash: string;
    accessControlConditions: LitAccessControlCondition[];
}

// ============================================================================
// Chain Signatures (MPC) Types
// ============================================================================

/**
 * MPC signature result
 */
export interface MPCSignature {
    big_r: {
        affine_point: string;
    };
    s: {
        scalar: string;
    };
    recovery_id: number;
}

// ============================================================================
// Wallet Types
// ============================================================================

/**
 * Wallet selector instance type
 */
export interface WalletInstance {
    signAndSendTransaction: (params: {
        receiverId: string;
        actions: unknown[];
    }) => Promise<TransactionOutcome>;
    signAndSendTransactions: (params: {
        transactions: Array<{
            receiverId: string;
            actions: unknown[];
        }>;
    }) => Promise<TransactionOutcome[]>;
    getAccounts: () => Promise<Array<{ accountId: string }>>;
}

/**
 * Wallet context type for useWallet hook
 */
/**
 * Wallet selector type (opaque - from @near-wallet-selector/core)
 */
export type WalletSelector = unknown;

/**
 * Modal type (opaque - from @near-wallet-selector/modal-ui)
 */
export type WalletModal = unknown;

export interface WalletContextType {
    selector: WalletSelector;
    modal: WalletModal;
    accountId: string | null;
    getWallet: () => Promise<WalletInstance>;
    signOut: () => Promise<void>;
    isTrial: boolean;
    pkpData: PKPData | null;
    isPKPMinting: boolean;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Standard API success response
 */
export interface ApiSuccessResponse<T = unknown> {
    success: true;
    data: T;
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
    success: false;
    error: string;
    code: string;
    details?: string;
    retryAfter?: number;
}

/**
 * Union type for API responses
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Lighthouse upload response
 */
export interface LighthouseUploadResponse {
    data: Array<{ Hash: string; Name: string; Size: string }> | { Hash: string; Name: string; Size: string };
}

// ============================================================================
// Session & Storage Types
// ============================================================================

/**
 * Cached session data in localStorage
 */
export interface CachedSession {
    accountId: string;
    createdAt: number;
    expiresAt: number;
    sessionSigs?: LitSessionSigs;
}

/**
 * Cached PKP data in localStorage
 */
export interface CachedPKP extends PKPData {
    createdAt: number;
    accountId: string;
}

// ============================================================================
// Gift System Types
// ============================================================================

/**
 * Gift drop data
 */
export interface GiftDrop {
    event_cid: string;
    public_key: string;
    created_at: number;
    claimed: boolean;
}

/**
 * Gift link parameters
 */
export interface GiftLinkParams {
    eventCid: string;
    secretKey: string;
}

// ============================================================================
// Upload Types
// ============================================================================

/**
 * Upload progress step
 */
export interface UploadStep {
    id: string;
    label: string;
    status: 'pending' | 'loading' | 'complete' | 'error';
}

/**
 * Upload metadata
 */
export interface UploadMetadata {
    title: string;
    description: string;
    price: string;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if response is an error
 */
export function isApiError(response: ApiResponse): response is ApiErrorResponse {
    return response.success === false;
}

/**
 * Check if access key has function call permission
 */
export function isFunctionCallPermission(
    permission: AccessKeyPermission
): permission is FunctionCallPermission {
    return typeof permission === 'object' && 'FunctionCall' in permission;
}

/**
 * Check if PKP data is valid
 */
export function isValidPKPData(data: unknown): data is PKPData {
    if (!data || typeof data !== 'object') return false;
    const pkp = data as PKPData;
    return (
        typeof pkp.publicKey === 'string' &&
        typeof pkp.ethAddress === 'string' &&
        pkp.publicKey.length > 0 &&
        pkp.ethAddress.length > 0
    );
}
