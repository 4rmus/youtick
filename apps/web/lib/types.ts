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
    price_usd?: number | null;
    access_mode?: 'paid' | 'free_collectible';
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
export type ContentType = 'Concert' | 'Cinema' | 'Exclusive' | 'LiveEvent' | 'Documentary' | 'ShortFilm' | 'FestivalSelection';

export interface NFTEvent {
    encrypted_cid?: string;
    title: string;
    description: string;
    creator_id: string;
    price: string;
    price_usd?: number | null;
    price_usdc?: string | null;
    created_at?: number;
    access_mode?: 'paid' | 'free_collectible' | string;
    content_type?: ContentType | string;
    banned?: boolean;
    ban_reason?: string;
}

export interface CreatorProfile {
    display_name?: string | null;
    bio?: string | null;
    website?: string | null;
    twitter?: string | null;
    instagram?: string | null;
    avatar_url?: string | null;
}

export interface CreatorStats {
    total_sales: number;
    total_revenue_yocto: string;
}

export interface PurchaseLog {
    buyer_id: string;
    creator_id: string;
    event_cid: string;
    token_id: string;
    price: string;
    creator_amount: string;
    commission_amount: string;
    purchase_type: 'Direct' | 'Prepaid' | 'Free';
    timestamp_ns: number;
}

// ============================================================================
// Storage Types
// ============================================================================

/**
 * Video storage provider type
 */
export type StorageType = 'KMS';

/**
 * Media delivery track type
 */
export type DeliveryTrackKind = 'audio' | 'video';

/**
 * Per-track metadata for segmented delivery
 */
export interface DeliveryTrackInfo {
    id: number;
    kind: DeliveryTrackKind;
    codec: string;
    bitrate: number;
    timescale: number;
}

export interface DeliveryPayloadChunk {
    cid: string;
    byteLength: number;
}

/**
 * CID-backed payload for one track inside a delivery segment
 */
export interface DeliverySegmentPayload {
    cid: string;
    chunks?: DeliveryPayloadChunk[];
    trackId: number;
    kind: DeliveryTrackKind;
    byteLength: number;
    startMs: number;
    endMs: number;
    counterB64?: string;
}

/**
 * Time-bucketed delivery segment
 */
export interface DeliverySegment {
    seq: number;
    durationMs: number;
    payloads: DeliverySegmentPayload[];
}

/**
 * Segment-based media manifest used by the v2 player
 */
export interface DeliveryManifestV2 {
    version: 2;
    packaging: 'cmaf';
    encrypted: boolean;
    codec: string;
    contentType: 'video/mp4';
    durationMs: number;
    thumbnails?: {
        posterCid?: string;
    };
    initSegment: {
        cid: string;
        chunks?: DeliveryPayloadChunk[];
        byteLength: number;
        counterB64?: string;
    };
    tracks: DeliveryTrackInfo[];
    segments: DeliverySegment[];
}

// ============================================================================
// Wallet Types
// ============================================================================

/**
 * Wallet selector instance type
 *
 * Uses method syntax (not property syntax) so TypeScript applies bivariant
 * parameter checking — required because NearWalletBase and TrialWallet use
 * narrower Action types from different packages.
 * Return type is `object` to stay compatible with both FinalExecutionOutcome
 * (NearWalletBase) and RpcTransactionResponse (near-api-js Account).
 */
export interface WalletInstance {
    signAndSendTransaction(params: {
        receiverId: string;
        actions: unknown[];
    }): Promise<object>;
    signAndSendTransactions(params: {
        transactions: Array<{
            receiverId: string;
            actions: unknown[];
        }>;
    }): Promise<object[]>;
    getAccounts(): Promise<Array<{ accountId: string }>>;
    signMessage(params: {
        message: string;
        recipient: string;
        nonce: Uint8Array;
        callbackUrl?: string;
        state?: string;
    }): Promise<{
        accountId: string;
        publicKey: string;
        signature: string;
        state?: string;
    } | void>;
}

/**
 * Wallet context type for useWallet hook
 */
export interface WalletContextType {
    accountId: string | null;
    isTrial: boolean;
    managedAccountKind?: 'guest' | 'trial' | 'evm' | null;
    /** Active wallet ID: 'my-near-wallet' | 'meteor-wallet' | null */
    walletType: string | null;
    getWallet: () => Promise<WalletInstance>;
    signOut: () => Promise<void>;
    connect: () => Promise<void>;
    isReady: boolean;
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
