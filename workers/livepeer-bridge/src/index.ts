import { base58Decode } from './base58';
import {
    KeyPairSigner,
    SCHEMA,
    actions,
    baseDecode,
    baseEncode,
    createTransaction,
    encodeDelegateAction,
    encodeSignedDelegate,
    type SignedDelegate,
} from 'near-api-js';
import { deserialize } from 'borsh';
import { verifyMessage as verifyNep413Message } from 'near-api-js/nep413';
import type { CreateUploadResult, MediaSourceType } from './media-provider';
import { MEDIA_SOURCE_FORMATS } from './media-provider';
import { LivepeerProvider } from './livepeer-provider';
import { dependencyFetch } from './dependency-fetch';
import {
    assertDurableObjectRecordCapacity,
    DURABLE_OBJECT_MAX_PERSISTENT_RECORDS,
} from './durable-object-capacity';
import {
    MAX_PROVIDER_PLAYBACK_OUTPUTS,
    firstVttThumbnailUrl,
    validPlaybackUrl,
} from './provider-verification';
import {
    parseWebhook,
    providerPhase,
    webhookAsset,
    webhookDigest,
    webhookRoute,
} from './provider-webhook';
import type { WebhookEvent } from './provider-webhook';
import { commitUploadJobArchive, type UploadJobArchive } from './upload-job-archive';
import {
    commitOperatorOutboxArchive,
    type OperatorOutboxArchive,
} from './operator-outbox-archive';
import {
    paymentAssets,
    expirePaymentRateLimit,
    paymentOptions,
    paymentQuote,
    paymentRateLimit,
    paymentStatus,
} from './payments';
export interface Env {
    CF_VERSION_METADATA: WorkerVersionMetadata;
    LIVEPEER_BRIDGE_ENABLED?: string;
    LIVEPEER_NEW_UPLOADS_ENABLED?: string;
    LIVEPEER_PLAYBACK_ISSUANCE_ENABLED?: string;
    LIVEPEER_PROVIDER_MUTATIONS_ENABLED?: string;
    LIVEPEER_OPERATOR_MUTATIONS_ENABLED?: string;
    LIVEPEER_OPERATOR_JOB_ID?: string;
    LIVEPEER_PLAYBACK_V2_ENABLED?: string;
    LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED?: string;
    LIVEPEER_NEAR_CREATOR_FEE_ENABLED?: string;
    LIVEPEER_SPONSORED_UPLOADS_ENABLED?: string;
    LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED?: string;
    LIVEPEER_API_KEY?: string;
    LIVEPEER_PROJECT_ID?: string;
    LIVEPEER_API_TOKEN_NAME?: string;
    LIVEPEER_CREATOR_ALLOWLIST?: string;
    LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS?: string;
    LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS?: string;
    LIVEPEER_PAID_MEDIA_OPERATOR_ID?: string;
    LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN?: string;
    LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN_PREVIOUS?: string;
    LIVEPEER_WEBHOOK_SECRET?: string;
    LIVEPEER_WEBHOOK_SECRET_PREVIOUS?: string;
    LIVEPEER_WEBHOOK_QUEUE_ENABLED?: string;
    LIVEPEER_WEBHOOK_QUEUE_BATCH_SIZE?: string;
    LIVEPEER_WEBHOOK_QUEUE_BATCH_TIMEOUT_SECONDS?: string;
    LIVEPEER_WEBHOOK_QUEUE_MAX_RETRIES?: string;
    LIVEPEER_WEBHOOK_QUEUE_MAX_CONCURRENCY?: string;
    LIVEPEER_WEBHOOK_QUEUE_RETENTION_SECONDS?: string;
    LIVEPEER_WEBHOOK_QUEUE_DLQ?: string;
    LIVEPEER_EVENTS?: Queue;
    ALLOWED_ORIGINS?: string;
    NEAR_NETWORK?: string;
    NEAR_RPC_URL?: string;
    MARKET_CONTRACT_ID?: string;
    ACCESS_CONTRACT_ID?: string;
    LIVEPEER_JWT_PRIVATE_KEY?: string;
    LIVEPEER_JWT_PUBLIC_KEY?: string;
    LIVEPEER_JWT_ISSUER?: string;
    NEAR_OPERATOR_ACCOUNT_ID?: string;
    NEAR_OPERATOR_PRIVATE_KEY?: string;
    NEAR_OPERATOR_KEY_EPOCH?: string;
    NEAR_SPONSOR_RELAYER_ACCOUNT_ID?: string;
    NEAR_SPONSOR_RELAYER_PRIVATE_KEY?: string;
    NEAR_SPONSOR_RELAYER_KEY_EPOCH?: string;
    CREATOR_FEE_QUOTE_PRIVATE_KEY?: string;
    CREATOR_FEE_QUOTE_KEY_VERSION?: string;
    MULTI_ASSET_PAYMENTS_MODE?: string;
    MULTI_ASSET_PAYMENT_ASSET_IDS?: string;
    ONECLICK_API_KEY?: string;
    LIVEPEER_CONTROL?: DurableObjectNamespace;
    UPLOAD_JOB_ARCHIVE_ENABLED?: string;
    OPERATOR_OUTBOX_ARCHIVE_ENABLED?: string;
    MARKET_READ_MODEL?: D1Database;
    PUBLIC_BETA_RATE_LIMITER?: RateLimit;
}

type JsonObject = Record<string, unknown>;
type LivepeerSourceType = MediaSourceType;
type UploadIntentBody = {
    job_id: string;
    generation: number;
    expected_source_bytes: string;
    source_fingerprint_sha256: string;
    source_type: LivepeerSourceType;
    profile_id: 'paid-media-livepeer-v1';
    profile_config_sha256: string;
    recovery?: 'reconcile';
};
type PlaybackTokenBody = {
    job_id: string;
    generation: number;
    playback_id: string;
    grant_id: string;
    origin_hash: string;
    device_hash: string;
    requested_ttl_seconds: number;
};
type ControlEnvelope = {
    domain: 'youtick.paid-media-livepeer-v1.control';
    version: '2' | '3';
    method: 'POST';
    route: '/v1/upload-intents' | '/v1/upload-heartbeats'
        | '/v1/upload-cancellations' | '/v1/playback-tokens';
    network: 'testnet' | 'mainnet';
    contract_id: string;
    account_id: string;
    resource: string;
    session_public_key: string;
    origin: string;
    device_nonce: string;
    expires_at_ms: string;
    body_sha256: string;
};
type UploadIntentRequest = {
    body: UploadIntentBody;
    envelope: ControlEnvelope;
};
type UploadHeartbeatBody = {
    job_id: string;
    generation: number;
    lease_id: string;
};
type UploadHeartbeatRequest = {
    body: UploadHeartbeatBody;
    envelope: ControlEnvelope;
};
type UploadCancellationBody = {
    job_id: string;
    generation: number;
};
type UploadCancellationRequest = {
    body: UploadCancellationBody;
    envelope: ControlEnvelope;
};
type PlaybackTokenRequest = {
    body: PlaybackTokenBody;
    envelope: ControlEnvelope;
    shadowV2?: unknown;
};
type PlaybackV2Body = {
    publication_id: string;
    generation: number;
    playback_id: string;
};
type DeviceSessionCertificate = {
    domain: 'youtick.device-session';
    version: '1';
    network: 'testnet' | 'mainnet';
    account_id: string;
    session_public_key: string;
    origin_hash: string;
    scopes: ['play'];
    issued_at_ms: string;
    expires_at_ms: string;
};
type DeviceCertificateProof = {
    public_key: string;
    signature: string;
    nonce: string;
};
type PlaybackV2Envelope = {
    domain: 'youtick.playback-request';
    version: '1';
    network: 'testnet' | 'mainnet';
    contract_id: string;
    account_id: string;
    origin: string;
    request_nonce: string;
    request_expires_at_ms: string;
    body_sha256: string;
    certificate_sha256: string;
};
type PlaybackV2Request = {
    body: PlaybackV2Body;
    certificate: DeviceSessionCertificate;
    certificateProof: DeviceCertificateProof;
    request: PlaybackV2Envelope;
    requestSignature: string;
};
type CreatorFeeQuoteRequest = {
    creator_id: string;
    job_id: string;
    expected_source_bytes: string;
};
type SponsoredPaidJobRequest = {
    creator_id: string;
    job_id: string;
    title: string;
    price_usdc: string;
    expected_source_bytes: string;
    profile_id: 'paid-media-livepeer-v1';
    profile_config_sha256: string;
    upload_public_key: string;
    upload_key_expires_at_ms: string;
};
type SponsoredUploadQuote = {
    domain: 'youtick.sponsored-upload-quote';
    version: '1';
    network: 'testnet' | 'mainnet';
    contract_id: string;
    creator_id: string;
    job_id: string;
    request_sha256: string;
    expected_source_bytes: string;
    upload_fee_usdc: string;
    sponsor_fee_usdc: string;
    total_fee_usdc: string;
    delegate_receiver_id: string;
    delegate_method: 'ft_transfer_call';
    delegate_gas: string;
    delegate_deposit_yocto: '1';
    issued_at_ms: string;
    quote_block_height: string;
    max_delegate_block_height: string;
    expires_at_ms: string;
    quote_key_version: number;
    quote_id: string;
};
type ParsedSponsoredDelegate = {
    signedDelegate: SignedDelegate;
    signedDelegateBase64: string;
    signedDelegateSha256: string;
    publicKey: string;
    nonce: bigint;
    maxBlockHeight: bigint;
    request: SponsoredPaidJobRequest;
    quote: SponsoredUploadQuote;
};
type SponsorRelayRecord = {
    schema: 'youtick.sponsor-relay.v1';
    state: 'PENDING' | 'RESERVED' | 'SIGNED' | 'BROADCAST';
    jobId: string;
    creator: string;
    payloadSha256: string;
    signedDelegateBase64: string;
    createdAtMs: number;
    nonce?: string;
    blockHash?: string;
    signedTxBase64?: string;
    txHash?: string;
};
type UploadPreflightRequest = {
    creator_id: string;
    job_id: string;
    generation: number;
    expected_source_bytes: string;
};
type OnChainJob = {
    job_id?: unknown;
    creator_id?: unknown;
    profile_id?: unknown;
    profile_config_sha256?: unknown;
    expected_source_bytes?: unknown;
    generation?: unknown;
    status?: unknown;
    upload_public_key?: unknown;
    upload_key_expires_at_ms?: unknown;
    title?: unknown;
    price_usdc?: unknown;
    fee_asset?: unknown;
    fee_amount?: unknown;
    fee_usd_micro?: unknown;
    fee_quote_hash?: unknown;
};
type PublicTestnetBetaJob = {
    creator_id: string;
    generation: number;
    request_sha256: string;
    sponsor_quote_id: string;
    admitted_at_ms: string;
    deadline_at_ms: string;
};
type PublicTestnetBetaState = {
    version: number;
    started_at_ms: string;
    upload_closes_at_ms: string;
    ends_at_ms: string;
    closed_at_ms: string | null;
    total_job_count: number;
};
type JobState = 'AUTHORIZED' | 'LEASED' | 'PROVIDER_CREATE_PENDING'
    | 'CREATE_PENDING' | 'CREATE_AMBIGUOUS' | 'UPLOAD_READY'
    | 'UPLOADING' | 'PROCESSING' | 'READY_VERIFIED' | 'FINALIZE_QUEUED'
    | 'FINALIZE_RETRY' | 'UPLOAD_EXPIRED' | 'PROVIDER_FAILED' | 'CANCELLED'
    | 'ONCHAIN_PUBLISHED';
type JobRecord = {
    schema: 'youtick.livepeer-control-job.v1' | 'youtick.livepeer-control-job.v2';
    state: JobState;
    network: 'testnet' | 'mainnet';
    contractId: string;
    jobId: string;
    generation: number;
    creator: string;
    expectedSourceBytes: string;
    sourceFingerprintSha256?: string;
    sourceType: LivepeerSourceType;
    profileId: 'paid-media-livepeer-v1';
    profileConfigSha256: string;
    createdAtMs: number;
    stateChangedAtMs?: number;
    terminalAtMs?: number;
    apiTokenName: string;
    leaseId?: string;
    leaseExpiresAtMs?: number;
    assetId?: string;
    playbackId?: string;
    projectId?: string;
    tusEndpoint?: string;
    publication?: FinalizePublication;
    finalizeRetry?: {
        attempts: number;
        lastHttpStatus: number;
        nextAttemptAtMs: number;
    };
    providerCreate?: {
        attempts: 1;
        lastAttemptAtMs: number;
        retryPolicy: 'RECONCILE_ONLY';
        lastErrorCode?: 'provider_admission_closed' | 'provider_create_ambiguous'
            | 'provider_unavailable';
        ambiguousAtMs?: number;
        completedAtMs?: number;
    };
    terminalArchive?: {
        status: 'PENDING' | 'RETRY' | 'COMMITTED';
        attempts: number;
        createdAtMs: number;
        nextAttemptAtMs: number;
        archiveSha256?: string;
        committedAtMs?: number;
        cleanupEligibleAtMs?: number;
    };
    absoluteDeadlineAtMs?: number;
    providerDelete?: {
        assetIdSha256: string;
        outcome: 'DELETED' | 'MISSING' | 'AMBIGUOUS';
        attemptedAtMs: number;
    };
};
type ReconcileStatus = 'HEALTHY' | 'DRIFT_BLOCKED' | 'PROVIDER_UNKNOWN' | 'NEAR_UNKNOWN';
type ReconcileRecord = {
    schema: 'youtick.livepeer-reconcile.v1';
    status: ReconcileStatus;
    consecutiveErrors: number;
    nextReconcileAtMs: number;
    uploadReadFailed?: boolean;
    lastGoodAtMs?: number;
    lastDrift?: {
        code: string;
        firstObservedAtMs: number;
        lastObservedAtMs: number;
        observations: number;
    };
    recovery?: {
        firstObservedAtMs: number;
        observations: number;
    };
    salesSuspensionQueuedAtMs?: number;
};
type FinalJob = { job: OnChainJob; blockHash: string };
type OutboxMethod = 'finalize_livepeer_publication' | 'suspend_livepeer_sales';
type OutboxInput = {
    idempotencyKey: string;
    method: OutboxMethod;
    jobId: string;
    generation: number;
    payloadSha256: string;
};
type OutboxRecord = OutboxInput & {
    schema: 'youtick.livepeer-control-outbox.v1';
    state: 'PENDING' | 'CONFIRMED';
    createdAtMs: number;
};
type FinalizePublication = {
    job_id: string;
    generation: number;
    creator_id: string;
    expected_source_bytes: string;
    profile_id: 'paid-media-livepeer-v1';
    profile_config_sha256: string;
    asset_id_hash: string;
    playback_id: string;
    project_id_hash: string;
    verified_source_bytes: string;
    provider_source_fingerprint: string | null;
    ready_at_ms: string;
    availability: 'ACTIVE';
};
type FinalizeInput = {
    idempotencyKey: string;
    payloadSha256: string;
    submission: FinalizePublication;
};
type SuspendSalesInput = {
    idempotencyKey: string;
    payloadSha256: string;
    publicationId: string;
};
type OperatorRecord = {
    schema: 'youtick.livepeer-operator-outbox.v1';
    state: 'PENDING' | 'RESERVED' | 'SIGNED' | 'BROADCAST' | 'CONFIRMED';
    method: OutboxMethod;
    idempotencyKey: string;
    payloadSha256: string;
    createdAtMs: number;
    nonce?: string;
    blockHash?: string;
    signedTxBase64?: string;
    txHash?: string;
    confirmedAtMs?: number;
    archive?: {
        status: 'PENDING' | 'RETRY' | 'COMMITTED';
        attempts: number;
        createdAtMs: number;
        nextAttemptAtMs: number;
        archiveSha256?: string;
        committedAtMs?: number;
        cleanupEligibleAtMs?: number;
    };
};
type OperatorArchiveScan = {
    after?: string;
    earliestRetryAtMs?: number;
};
type AdmissionJobState = 'CREATE_PENDING' | 'CREATE_AMBIGUOUS' | 'UPLOAD_READY'
    | 'UPLOADING' | 'READY_VERIFIED' | 'FINALIZE_QUEUED';
type AdmissionReservation = {
    creator: string;
    expectedSourceBytes: string;
    estimatedProviderCostUsdMicros: string;
    state: AdmissionJobState;
    createdAtMs: number;
    leaseId?: string;
    expiresAtMs?: number;
    lastHeartbeatAtMs?: number;
    ambiguousAtMs?: number;
};
type AdmissionRecord = {
    schema: 'youtick.livepeer-admission.v2';
    status: 'OPEN' | 'AUTO_CLOSED';
    reservations: Record<string, AdmissionReservation>;
    daily: { utcDay: string; globalAttempts: number; creatorAttempts: Record<string, number> };
    monthly: { utcMonth: string; reservedBudgetUsdMicros: string };
    providerFailures?: {
        count: number;
        firstObservedAtMs: number;
        lastObservedAtMs: number;
    };
    closure?: { code: string; observedAtMs: number };
};
type AdmissionCandidate = {
    jobId: string;
    generation: number;
    creator: string;
    expectedSourceBytes: string;
};
type AdmissionLease = {
    leaseId: string;
    expiresAtMs: number;
};
type AdmissionResolutionCode = 'PROVIDER_ABSENCE_CONFIRMED'
    | 'TUS_TERMINATION_CONFIRMED'
    | 'INVENTORY_RECONCILED'
    | 'BUDGET_WINDOW_ROLLED';
type AdmissionReopenInput = {
    idempotencyKey: string;
    operatorId: string;
    closureCode: string;
    closureObservedAtMs: number;
    incidentId: string;
    evidenceSha256: string;
    resolutionCode: AdmissionResolutionCode;
    jobId: string | null;
    generation: number | null;
};
type AdmissionReopenRecord = AdmissionReopenInput & {
    schema: 'youtick.livepeer-admission-reopen.v1';
    reopenedAtMs: number;
};
type LivepeerWebhookQueueMessage = {
    schema: 'youtick.livepeer-webhook-queue.v1';
    network: string;
    contract_id: string;
    job_id: string;
    generation: number;
    enqueued_at_ms: string;
    raw_body_base64: string;
};

const PUBLIC_CONTROL_REQUESTS_IMPLEMENTED = true;
const PUBLIC_BETA_RATE_LIMIT_ROUTES = new Set([
    '/v1/upload-preflight',
    '/v1/upload-intents',
    '/v1/upload-heartbeats',
    '/v1/sponsored-upload-quotes',
    '/v1/sponsored-upload-relays',
    '/v1/playback-tokens',
    '/v2/playback-tokens',
]);
const MAX_CONTROL_BODY_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 20_000_000_000n;
const PUBLIC_TESTNET_BETA_MAX_SOURCE_BYTES = 1_000_000_000n;
const PUBLIC_TESTNET_BETA_JOB_TTL_MS = 24 * 60 * 60 * 1_000;
const MIN_CREATOR_UPLOAD_FEE_USD_MICROS = 500_000n;
const CREATOR_FEE_RATE_SOURCE = 'outlayer-price-oracle-wrap-near-v1';
const OUTLAYER_NEAR_ASSET_ID = 'wrap.near';
const CREATOR_FEE_MAX_SOURCE_AGE_MS = 60_000;
const CREATOR_FEE_QUOTE_LIFETIME_MS = 120_000;
const CREATOR_FEE_RATE_LIMIT = 5;
const CREATOR_FEE_RATE_WINDOW_MS = 60_000;
const YOCTO_NEAR = 10n ** 24n;
const SPONSORED_UPLOAD_DELEGATE_GAS = 100_000_000_000_000n;
const SPONSORED_UPLOAD_FEE_USDC = 100_000n;
const SPONSORED_UPLOAD_MAX_BLOCK_WINDOW = 200n;
const SPONSORED_UPLOAD_SIGNING_HEADROOM_BLOCKS = 200n;
const SPONSORED_UPLOAD_FINAL_BLOCK_MAX_AGE_MS = 60_000;
const SPONSORED_RELAY_REJECTION_CODES = Object.freeze({
    delegate_decode: 'invalid_sponsored_upload_relay_delegate_decode',
    delegate_shape: 'invalid_sponsored_upload_relay_delegate_shape',
    quote_validation: 'invalid_sponsored_upload_relay_quote_validation',
    signature_validation: 'invalid_sponsored_upload_relay_signature_validation',
    freshness: 'invalid_sponsored_upload_relay_freshness',
    access_key: 'invalid_sponsored_upload_relay_access_key',
});
type SponsoredRelayRejectionReason = keyof typeof SPONSORED_RELAY_REJECTION_CODES;
const TESTNET_USDC_CONTRACT_ID = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
const MAINNET_USDC_CONTRACT_ID = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
const SPONSOR_RELAY_KEY_PREFIX = 'sponsor-relay:';
const SPONSOR_RELAYER_LAST_NONCE_KEY = 'sponsor-relayer:last-nonce';
const LIVEPEER_TUS_CHUNK_BYTES = 32 * 1024 * 1024;
const MAX_PUBLICATION_COVER_BYTES = 2 * 1024 * 1024;
const PUBLICATION_COVER_CACHE_SECONDS = 24 * 60 * 60;
const PROFILE_CONFIG_SHA256 = '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77';
const CONTROL_MAX_FUTURE_MS = 5 * 60 * 1000;
const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;
const WEBHOOK_DEDUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const LIFECYCLE_DELETE_BATCH = 128;
const PLAYBACK_MIN_TTL_SECONDS = 120;
const PLAYBACK_MAX_TTL_SECONDS = 300;
const PLAYBACK_V2_TTL_SECONDS = 180;
const DEVICE_CERTIFICATE_MAX_LIFETIME_MS = 8 * 60 * 60 * 1000;
const PLAYBACK_CACHE_MAX_RECORDS = 1024;
const DEVICE_CERTIFICATE_CACHE_MS = 60 * 1000;
const PUBLICATION_CACHE_MS = 30 * 1000;
const POSITIVE_ENTITLEMENT_CACHE_MS = 5 * 60 * 1000;
const NEGATIVE_ENTITLEMENT_CACHE_MS = 3 * 1000;
const PROVIDER_POLICY_CACHE_MS = 30 * 1000;
const FINALIZE_GAS = 15_000_000_000_000n;
const JOB_KEY = 'job:v1';
const RECONCILE_KEY = 'reconcile:v1';
const RECONCILE_HEALTHY_INTERVAL_MS = 15 * 60 * 1000;
const RECONCILE_CONFIRMATION_MS = 60 * 1000;
const RECONCILE_BACKOFF_MS = [60, 120, 240, 480, 900].map((seconds) => seconds * 1000);
const UPLOAD_JOB_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const OPERATOR_OUTBOX_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const OPERATOR_ARCHIVE_SCAN_KEY = 'operator:archive-scan:v1';
const OPERATOR_ARCHIVE_SCAN_BATCH = 32;
const ADMISSION_KEY = 'admission:v1';
const ADMISSION_REOPEN_KEY_PREFIX = 'admission:reopen:';
const ADMISSION_GLOBAL_CONCURRENCY = 2;
const ADMISSION_CREATOR_DAILY_ATTEMPTS = 2;
const ADMISSION_AMBIGUOUS_TIMEOUT_MS = 15 * 60 * 1000;
const ADMISSION_LEASE_TTL_MS = 30 * 60 * 1000;
const ADMISSION_LEASE_HEARTBEAT_MS = 5 * 60 * 1000;
const ADMISSION_PROVIDER_FAILURE_LIMIT = 2;
const ADMISSION_PROVIDER_FAILURE_WINDOW_MS = 60 * 1000;
const ADMISSION_AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const ADMISSION_CLOSURE_CODES = new Set([
    'monthly_budget_exceeded',
    'provider_budget_or_inventory',
    'provider_unavailable',
    'create_ambiguous_timeout',
]);
const DEFAULT_ALLOWED_ORIGINS = 'https://youtick.net,https://www.youtick.net';
const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const JOB_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SESSION_KEY_PATTERN = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LEASE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{1,192}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,192}$/;
const PLAYBACK_ID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
const OUTBOX_METHODS = new Set<OutboxMethod>([
    'finalize_livepeer_publication',
    'suspend_livepeer_sales',
]);
const playbackAuthorizationCache = new Map<string, { value: unknown; expiresAtMs: number }>();
let edgeColdStartPending = true;

export function playbackAuthorizationCacheRecordCount(): number {
    return playbackAuthorizationCache.size;
}
const STRONG_PROVIDER_DRIFT_CODES = new Set([
    'provider_asset_missing',
    'provider_identity_mismatch',
    'provider_playback_exposed',
    'provider_playback_mismatch',
    'provider_playback_missing',
    'provider_state_invalid',
]);
const PROVIDER_INVENTORY_DRIFT_CODES = new Set([
    'provider_asset_missing',
    'provider_identity_mismatch',
    'provider_playback_missing',
    'provider_publication_mismatch',
]);
const SAFE_ERROR_CODES = new Set([
    'control_body_too_large',
    'control_request_expired',
    'creator_fee_quote_rate_limited',
    'admission_closed',
    'admission_denied',
    'admission_reopen_conflict',
    'admission_reopen_denied',
    'device_key_not_authorized',
    'device_nonce_replayed',
    'deployment_binding_mismatch',
    'durable_object_record_limit',
    'invalid_control_envelope',
    'invalid_control_request',
    'invalid_creator_fee_quote_request',
    'invalid_json',
    'invalid_finalize_request',
    'invalid_admission_reopen',
    'invalid_outbox',
    'invalid_playback_request',
    'invalid_playback_v2_request',
    'invalid_sponsored_upload_quote_request',
    'invalid_sponsored_upload_relay',
    'invalid_upload_preflight',
    'invalid_upload_intent',
    'invalid_webhook',
    'invalid_webhook_signature',
    'near_finalize_failed',
    'near_finalize_mismatch',
    'near_finalize_pending',
    'near_job_not_found',
    'near_job_query_failed',
    'near_job_response_invalid',
    'on_chain_job_mismatch',
    'origin_denied',
    'operator_unauthorized',
    'operator_mutations_disabled',
    'operator_archive_conflict',
    'operator_archive_eligible_count_invalid',
    'operator_archive_scan_active',
    'operator_archive_unavailable',
    'outbox_conflict',
    'provider_identity_mismatch',
    'provider_asset_missing',
    'provider_admission_closed',
    'provider_playback_missing',
    'provider_playback_exposed',
    'provider_playback_mismatch',
    'publication_cover_image_denied',
    'publication_cover_image_redirected',
    'publication_cover_image_status',
    'publication_cover_image_type',
    'publication_cover_image_size',
    'publication_cover_image_invalid',
    'provider_state_invalid',
    'provider_unavailable',
    'provider_mutations_disabled',
    'rate_source_invalid',
    'rate_limited',
    'rate_source_stale',
    'rate_source_unavailable',
    'playback_authorization_unavailable',
    'playback_denied',
    'protocol_binding_mismatch',
    'provider_create_ambiguous',
    'provider_create_pending',
    'provider_recovery_not_ready',
    'provider_delete_ambiguous',
    'reservation_conflict',
    'runtime_not_configured',
    'sponsor_balance_insufficient',
    'sponsor_job_conflict',
    'sponsor_relay_conflict',
    'sponsor_relay_failed',
    'sponsor_relay_mutations_disabled',
    'sponsor_relay_pending',
    'upload_archive_conflict',
    'upload_archive_unavailable',
    'upload_cancel_denied',
    'webhook_expired',
    'webhook_queue_unavailable',
]);

const bridgeWorker = {
    async fetch(request: Request, env: Env, context?: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        if (request.method === 'GET' && url.pathname === '/__health') {
            return json({
                status: 'ok',
                service: 'livepeer-bridge',
                versionId: env.CF_VERSION_METADATA.id,
                stage: env.LIVEPEER_BRIDGE_ENABLED === 'true' ? 'ENABLED' : 'DISABLED',
                publicControlImplemented: PUBLIC_CONTROL_REQUESTS_IMPLEMENTED,
                providerMutationEnabled: env.LIVEPEER_BRIDGE_ENABLED === 'true'
                    && env.LIVEPEER_PROVIDER_MUTATIONS_ENABLED === 'true',
                operatorMutationEnabled: env.LIVEPEER_BRIDGE_ENABLED === 'true'
                    && env.LIVEPEER_OPERATOR_MUTATIONS_ENABLED === 'true'
                    && (isPublicBetaPacket(env)
                        || (JOB_ID_PATTERN.test(env.LIVEPEER_OPERATOR_JOB_ID || '')
                            && creatorAllowlist(env).size === 1)),
                operatorJobFingerprint: JOB_ID_PATTERN.test(env.LIVEPEER_OPERATOR_JOB_ID || '')
                    ? await sha256Hex(env.LIVEPEER_OPERATOR_JOB_ID!)
                    : null,
                sponsoredUploadQuoteReady: env.LIVEPEER_BRIDGE_ENABLED === 'true'
                    && env.LIVEPEER_SPONSORED_UPLOADS_ENABLED === 'true'
                    && Boolean(env.LIVEPEER_CONTROL)
                    && validSponsoredUploadQuoteConfig(env),
                sponsoredUploadRelayReady: env.LIVEPEER_BRIDGE_ENABLED === 'true'
                    && env.LIVEPEER_SPONSORED_UPLOADS_ENABLED === 'true'
                    && env.LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED === 'true'
                    && Boolean(env.LIVEPEER_CONTROL)
                    && validSponsoredUploadRelayConfig(env),
                newUploadReady: env.LIVEPEER_BRIDGE_ENABLED === 'true'
                    && env.LIVEPEER_NEW_UPLOADS_ENABLED === 'true'
                    && env.LIVEPEER_PROVIDER_MUTATIONS_ENABLED === 'true'
                    && Boolean(env.LIVEPEER_CONTROL)
                    && validAdmissionConfig(env)
                    && validPlaybackConfig(env),
                controlPlaneReady: env.LIVEPEER_BRIDGE_ENABLED === 'true'
                    && Boolean(env.LIVEPEER_CONTROL)
                    && validWebhookConfig(env)
                    && validAdmissionConfig(env)
                    && validAdmissionReopenConfig(env),
                playbackReady: env.LIVEPEER_BRIDGE_ENABLED === 'true'
                    && env.LIVEPEER_PLAYBACK_ISSUANCE_ENABLED === 'true'
                    && Boolean(env.LIVEPEER_CONTROL)
                    && validPlaybackConfig(env),
                playbackV2Ready: env.LIVEPEER_BRIDGE_ENABLED === 'true'
                    && env.LIVEPEER_PLAYBACK_ISSUANCE_ENABLED === 'true'
                    && env.LIVEPEER_PLAYBACK_V2_ENABLED === 'true'
                    && validPlaybackV2Config(env),
                playbackShadowV2Ready: env.LIVEPEER_BRIDGE_ENABLED === 'true'
                    && env.LIVEPEER_PLAYBACK_ISSUANCE_ENABLED === 'true'
                    && env.LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED === 'true'
                    && Boolean(env.LIVEPEER_CONTROL)
                    && validPlaybackConfig(env)
                    && validPlaybackV2Config(env),
                webhookQueueReady: env.LIVEPEER_BRIDGE_ENABLED === 'true'
                    && env.LIVEPEER_WEBHOOK_QUEUE_ENABLED === 'true'
                    && Boolean(env.LIVEPEER_EVENTS)
                    && validWebhookQueuePolicy(env)
                    && validWebhookConfig(env),
                uploadJobArchiveReady: validTerminalArchiveConfig(env),
                operatorOutboxArchiveReady: validOperatorArchiveConfig(env),
                publicBetaRateLimitReady: isPublicBetaPacket(env)
                    && Boolean(env.PUBLIC_BETA_RATE_LIMITER),
            });
        }

        if (request.method === 'POST'
            && PUBLIC_BETA_RATE_LIMIT_ROUTES.has(url.pathname)
            && isPublicBetaPacket(env)) {
            const limited = await publicBetaRateLimitResponse(request, env, url.pathname);
            if (limited) return limited;
        }

        if (request.method === 'OPTIONS'
            && ['/v1/payments/assets', '/v1/payments/quote', '/v1/payments/status']
                .includes(url.pathname)) {
            return paymentOptions(request, env);
        }
        if (request.method === 'GET' && url.pathname === '/v1/payments/assets') {
            return paymentAssets(request, env);
        }
        if (request.method === 'POST' && url.pathname === '/v1/payments/quote') {
            return paymentQuote(request, env);
        }
        if (request.method === 'GET' && url.pathname === '/v1/payments/status') {
            return paymentStatus(request, env);
        }

        const coverRoute = publicationCoverRoute(url.pathname);
        if (request.method === 'GET' && coverRoute) {
            if (env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
                return json({ error: 'control_plane_disabled' }, 503);
            }
            if (!validApiKey(env.LIVEPEER_API_KEY) || !validPlaybackConfig(env)) {
                return json({ error: 'runtime_not_configured' }, 503);
            }
            return publicationCover(request, env, coverRoute.jobId, coverRoute.generation);
        }

        if (request.method === 'OPTIONS'
            && ['/v1/upload-preflight', '/v1/upload-intents', '/v1/upload-heartbeats', '/v1/playback-tokens', '/v2/playback-tokens', '/v1/creator-fee-quotes/near', '/v1/sponsored-upload-quotes', '/v1/sponsored-upload-relays']
                .includes(url.pathname)) {
            const origin = request.headers.get('Origin') || '';
            if (!allowedOrigins(env).has(origin)) return json({ error: 'origin_denied' }, 403);
            return withCors(new Response(null, { status: 204 }), origin);
        }

        if (request.method === 'POST' && url.pathname === '/v1/livepeer-webhooks') {
            if (env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
                return json({ error: 'control_plane_disabled' }, 503);
            }
            if (!env.LIVEPEER_CONTROL || !validWebhookConfig(env)) {
                return json({ error: 'runtime_not_configured' }, 503);
            }
            return forwardLivepeerWebhook(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/v1/operations/admission-reopen') {
            if (env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
                return json({ error: 'control_plane_disabled' }, 503);
            }
            if (!env.LIVEPEER_CONTROL || !validAdmissionReopenConfig(env)) {
                return json({ error: 'runtime_not_configured' }, 503);
            }
            return forwardAdmissionReopen(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/v1/operations/provider-assets/delete') {
            if (env.LIVEPEER_BRIDGE_ENABLED !== 'true'
                || env.LIVEPEER_PROVIDER_MUTATIONS_ENABLED !== 'true'
                || !isPublicBetaPacket(env)) {
                return json({ error: 'control_plane_disabled' }, 503);
            }
            if (!env.LIVEPEER_CONTROL || !validAdmissionReopenConfig(env)
                || !validProviderVerificationConfig(env)) {
                return json({ error: 'runtime_not_configured' }, 503);
            }
            return forwardPublicBetaAssetDelete(request, env);
        }

        if (request.method === 'GET' && url.pathname === '/v1/operations/admission-status') {
            if (env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
                return json({ error: 'control_plane_disabled' }, 503);
            }
            if (!env.LIVEPEER_CONTROL || !validAdmissionReopenConfig(env)) {
                return json({ error: 'runtime_not_configured' }, 503);
            }
            return forwardAdmissionStatus(request, env);
        }

        if (request.method === 'GET' && url.pathname === '/v1/operations/operator-outbox-status') {
            if (!env.LIVEPEER_CONTROL || !validOperatorStatusConfig(env)) {
                return json({ error: 'runtime_not_configured' }, 503);
            }
            return forwardOperatorOutboxStatus(request, env);
        }

        if (request.method === 'POST'
            && url.pathname === '/v1/operations/operator-outbox-archive-scan') {
            if (!env.LIVEPEER_CONTROL
                || !validOperatorStatusConfig(env)
                || !validOperatorArchiveConfig(env)) {
                return json({ error: 'runtime_not_configured' }, 503);
            }
            return forwardOperatorOutboxArchiveScan(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/v1/upload-preflight') {
            const origin = request.headers.get('Origin') || '';
            const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
            if (!PUBLIC_CONTROL_REQUESTS_IMPLEMENTED || env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
                return withCors(json({ error: 'control_plane_disabled' }, 503), corsOrigin);
            }
            if (!env.LIVEPEER_CONTROL || !validAdmissionConfig(env)) {
                return withCors(json({ error: 'runtime_not_configured' }, 503), corsOrigin);
            }
            return forwardUploadPreflight(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/v1/upload-intents') {
            const origin = request.headers.get('Origin') || '';
            const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
            if (!PUBLIC_CONTROL_REQUESTS_IMPLEMENTED || env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
                return withCors(json({ error: 'control_plane_disabled' }, 503), corsOrigin);
            }
            if (!env.LIVEPEER_CONTROL || !validWebhookConfig(env) || !validAdmissionConfig(env)) {
                return withCors(json({ error: 'runtime_not_configured' }, 503), corsOrigin);
            }
            return forwardUploadIntent(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/v1/upload-heartbeats') {
            const origin = request.headers.get('Origin') || '';
            const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
            if (!PUBLIC_CONTROL_REQUESTS_IMPLEMENTED || env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
                return withCors(json({ error: 'control_plane_disabled' }, 503), corsOrigin);
            }
            if (!env.LIVEPEER_CONTROL || !validAdmissionConfig(env)) {
                return withCors(json({ error: 'runtime_not_configured' }, 503), corsOrigin);
            }
            return forwardUploadHeartbeat(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/v1/playback-tokens') {
            const origin = request.headers.get('Origin') || '';
            const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
            if (!PUBLIC_CONTROL_REQUESTS_IMPLEMENTED || env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
                return withCors(json({ error: 'control_plane_disabled' }, 503), corsOrigin);
            }
            if (env.LIVEPEER_PLAYBACK_ISSUANCE_ENABLED !== 'true') {
                return withCors(json({ error: 'control_plane_disabled' }, 503), corsOrigin);
            }
            if (!env.LIVEPEER_CONTROL || !validPlaybackConfig(env)) {
                return withCors(json({ error: 'runtime_not_configured' }, 503), corsOrigin);
            }
            return forwardPlaybackToken(request, env, context);
        }

        if (request.method === 'POST' && url.pathname === '/v2/playback-tokens') {
            const origin = request.headers.get('Origin') || '';
            const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
            if (!PUBLIC_CONTROL_REQUESTS_IMPLEMENTED
                || env.LIVEPEER_BRIDGE_ENABLED !== 'true'
                || env.LIVEPEER_PLAYBACK_ISSUANCE_ENABLED !== 'true'
                || env.LIVEPEER_PLAYBACK_V2_ENABLED !== 'true') {
                return withCors(json({ error: 'control_plane_disabled' }, 503), corsOrigin);
            }
            if (!validPlaybackV2Config(env)) {
                return withCors(json({ error: 'runtime_not_configured' }, 503), corsOrigin);
            }
            return withCors(await issueStatelessPlaybackToken(request, env), corsOrigin);
        }

        if (request.method === 'POST' && url.pathname === '/v1/creator-fee-quotes/near') {
            const origin = request.headers.get('Origin') || '';
            const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
            if (env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
                return withCors(json({ error: 'control_plane_disabled' }, 503), corsOrigin);
            }
            if (!env.LIVEPEER_CONTROL || !validCreatorFeeQuoteConfig(env)) {
                return withCors(json({ error: 'runtime_not_configured' }, 503), corsOrigin);
            }
            return forwardCreatorFeeQuote(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/v1/sponsored-upload-quotes') {
            const origin = request.headers.get('Origin') || '';
            const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
            if (env.LIVEPEER_BRIDGE_ENABLED !== 'true'
                || env.LIVEPEER_SPONSORED_UPLOADS_ENABLED !== 'true') {
                return withCors(json({ error: 'control_plane_disabled' }, 503), corsOrigin);
            }
            if (!env.LIVEPEER_CONTROL || !validSponsoredUploadQuoteConfig(env)) {
                return withCors(json({ error: 'runtime_not_configured' }, 503), corsOrigin);
            }
            return forwardSponsoredUploadQuote(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/v1/sponsored-upload-relays') {
            const origin = request.headers.get('Origin') || '';
            const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
            if (env.LIVEPEER_BRIDGE_ENABLED !== 'true'
                || env.LIVEPEER_SPONSORED_UPLOADS_ENABLED !== 'true') {
                return withCors(json({ error: 'control_plane_disabled' }, 503), corsOrigin);
            }
            if (env.LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED !== 'true') {
                return withCors(json({ error: 'sponsor_relay_mutations_disabled' }, 503), corsOrigin);
            }
            if (!env.LIVEPEER_CONTROL || !validSponsoredUploadRelayConfig(env)) {
                return withCors(json({ error: 'runtime_not_configured' }, 503), corsOrigin);
            }
            return forwardSponsoredUploadRelay(request, env);
        }

        return json({ error: 'not_found', endpoints: ['/__health'] }, 404);
    },
};

export default {
    async fetch(request: Request, env: Env, context?: ExecutionContext): Promise<Response> {
        const startedAtMs = Date.now();
        const coldStart = request.cf ? edgeColdStartPending : false;
        if (request.cf) edgeColdStartPending = false;
        let status = 500;
        try {
            const response = await bridgeWorker.fetch(request, env, context);
            status = response.status;
            return response;
        } finally {
            if (request.cf) {
                console.info(formatLog('edge_request_completed', {
                    requestId: request.headers.get('CF-Ray') || crypto.randomUUID(),
                    environment: env.NEAR_NETWORK || 'unknown',
                    releaseVersion: env.CF_VERSION_METADATA.id,
                    route: new URL(request.url).pathname,
                    method: request.method,
                    httpCode: status,
                    latencyMs: Date.now() - startedAtMs,
                    coldStart,
                }));
            }
        }
    },

    async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
        for (const message of batch.messages) {
            if (env.LIVEPEER_WEBHOOK_QUEUE_ENABLED !== 'true'
                || !env.LIVEPEER_CONTROL
                || !validWebhookQueuePolicy(env)) {
                message.retry();
                continue;
            }
            let input: LivepeerWebhookQueueMessage;
            let rawBody: Uint8Array;
            try {
                input = parseLivepeerWebhookQueueMessage(message.body);
                if (input.network !== env.NEAR_NETWORK
                    || input.contract_id !== env.MARKET_CONTRACT_ID) {
                    throw new Error('deployment_binding_mismatch');
                }
                rawBody = base64Decode(input.raw_body_base64);
                if (rawBody.byteLength > MAX_CONTROL_BODY_BYTES) {
                    throw new Error('control_body_too_large');
                }
            } catch (error) {
                console.error(formatLog('webhook_queue_message_rejected', {
                    code: safeErrorCode(error),
                }));
                message.ack();
                continue;
            }
            try {
                const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(jobObjectName(
                    input.network,
                    input.contract_id,
                    input.job_id,
                    input.generation,
                )));
                const response = await object.fetch(new Request(
                    'https://object/internal/livepeer-webhook',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: rawBody,
                    },
                ));
                const outcome = response.ok ? 'ACK' : 'RETRY';
                if (response.ok) message.ack();
                else message.retry();
                console.info(formatLog('webhook_queue_delivery_completed', {
                    outcome,
                    queueLagMs: Math.max(0, Date.now() - Number(input.enqueued_at_ms)),
                }));
            } catch {
                message.retry();
                console.info(formatLog('webhook_queue_delivery_completed', {
                    outcome: 'RETRY',
                    queueLagMs: Math.max(0, Date.now() - Number(input.enqueued_at_ms)),
                }));
            }
        }
    },
};

export class LivepeerControl {
    private operatorTail = Promise.resolve();

    constructor(
        private readonly state: DurableObjectState,
        private readonly env: Env,
    ) {}

    async alarm(): Promise<void> {
        const run = this.operatorTail.then(() => this.advanceAlarm());
        this.operatorTail = run.then(() => undefined, () => undefined);
        return run;
    }

    private async advanceAlarm(): Promise<void> {
        if (await expirePaymentRateLimit(this.state)) return;
        if (await expireCreatorFeeQuoteRateLimit(this.state)) return;
        if (await advanceSponsorRelayAlarm(this.state, this.env)) return;
        if (await this.state.storage.get<AdmissionRecord>(ADMISSION_KEY)) {
            await maintainAdmissionLifecycle(this.state);
            return;
        }
        await purgeExpiredControlNonces(this.state);
        await purgeExpiredWebhookDedup(this.state);
        if (await advanceOperatorArchiveScan(this.state, this.env)) return;
        const job = await this.state.storage.get<JobRecord>(JOB_KEY);
        if (job?.terminalArchive
            && job.terminalArchive.status !== 'COMMITTED'
            && this.env.UPLOAD_JOB_ARCHIVE_ENABLED === 'true') {
            if (job.terminalArchive.nextAttemptAtMs > Date.now()) {
                await this.state.storage.setAlarm(job.terminalArchive.nextAttemptAtMs);
                return;
            }
            await advanceTerminalArchive(this.state, this.env, job);
            return;
        }
        if (!job) return;
        if (this.env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
            await scheduleReconcile(this.state, Date.now() + RECONCILE_HEALTHY_INTERVAL_MS);
            return;
        }
        if (!job.publication) {
            await this.reconcileUpload(job);
            return;
        }
        if (job.state === 'FINALIZE_RETRY'
            && job.finalizeRetry
            && job.finalizeRetry.nextAttemptAtMs > Date.now()) {
            await scheduleReconcile(this.state, job.finalizeRetry.nextAttemptAtMs);
            return;
        }
        if (['READY_VERIFIED', 'FINALIZE_QUEUED', 'FINALIZE_RETRY'].includes(job.state)) {
            await advanceFinalization(this.state, this.env, job);
            return;
        }
        if (job.state !== 'ONCHAIN_PUBLISHED') return;
        await reconcilePublishedJob(this.state, this.env, job);
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        try {
            if (request.method === 'POST' && url.pathname === '/v1/upload-intents') {
                if (!isPublicBetaPacket(this.env)) return await this.reserveUploadIntent(request);
                const run = this.operatorTail.then(() => this.reserveUploadIntent(request));
                this.operatorTail = run.then(() => undefined, () => undefined);
                return await run;
            }
            if (request.method === 'POST' && url.pathname === '/v1/upload-heartbeats') {
                if (isPublicBetaPacket(this.env)) {
                    const run = this.operatorTail.then(() => this.heartbeatUploadLease(request));
                    this.operatorTail = run.then(() => undefined, () => undefined);
                    return await run;
                }
                return await this.heartbeatUploadLease(request);
            }
            if (request.method === 'POST' && url.pathname === '/v1/upload-cancellations') {
                return await this.cancelUpload(request);
            }
            if (request.method === 'POST' && url.pathname === '/v1/playback-tokens') {
                return await this.issuePlaybackToken(request);
            }
            if (request.method === 'POST' && url.pathname === '/internal/outbox') {
                return await this.enqueueOutbox(request);
            }
            if (request.method === 'POST' && url.pathname === '/internal/livepeer-webhook') {
                if (!isPublicBetaPacket(this.env)) return await this.handleLivepeerWebhook(request);
                const run = this.operatorTail.then(() => this.handleLivepeerWebhook(request));
                this.operatorTail = run.then(() => undefined, () => undefined);
                return await run;
            }
            if (request.method === 'POST' && url.pathname === '/internal/finalize') {
                const run = this.operatorTail.then(() => this.finalizePublication(request));
                this.operatorTail = run.then(() => undefined, () => undefined);
                return await run;
            }
            if (request.method === 'POST' && url.pathname === '/internal/suspend-sales') {
                const run = this.operatorTail.then(() => this.suspendSales(request));
                this.operatorTail = run.then(() => undefined, () => undefined);
                return await run;
            }
            if (request.method === 'POST' && url.pathname === '/internal/provider-asset-delete') {
                return await this.deletePublicBetaAsset(request);
            }
            if (request.method === 'POST' && url.pathname === '/internal/admission/reserve') {
                return await reserveAdmission(this.state, this.env, await readJsonObject(request));
            }
            if (request.method === 'POST' && url.pathname === '/internal/admission/preflight') {
                return await preflightAdmission(this.state, this.env, await readJsonObject(request));
            }
            if (request.method === 'POST' && url.pathname === '/internal/admission/mark') {
                return await markAdmission(this.state, await readJsonObject(request));
            }
            if (request.method === 'POST' && url.pathname === '/internal/admission/heartbeat') {
                return await heartbeatAdmission(this.state, await readJsonObject(request));
            }
            if (request.method === 'POST' && url.pathname === '/internal/creator-fee-quote') {
                return await issueCreatorFeeQuote(this.state, this.env, request);
            }
            if (request.method === 'POST' && url.pathname === '/internal/sponsored-upload-quote') {
                return await issueSponsoredUploadQuote(this.state, this.env, request);
            }
            if (request.method === 'POST' && url.pathname === '/internal/sponsored-upload-relay') {
                const run = this.operatorTail.then(() => relaySponsoredUpload(this.state, this.env, request));
                this.operatorTail = run.then(() => undefined, () => undefined);
                return await run;
            }
            if (request.method === 'POST' && url.pathname === '/internal/payment-rate-limit') {
                return await paymentRateLimit(this.state, request);
            }
            if (request.method === 'POST' && url.pathname === '/internal/admission/reopen') {
                return await reopenAdmission(this.state, await readJsonObject(request));
            }
            if (request.method === 'GET' && url.pathname === '/internal/admission/status') {
                return await readAdmissionStatus(this.state, this.env);
            }
            if (request.method === 'GET' && url.pathname === '/internal/operator-outbox/status') {
                return await readOperatorOutboxStatus(this.state);
            }
            if (request.method === 'POST'
                && url.pathname === '/internal/operator-outbox/archive-scan') {
                return await startOperatorOutboxArchiveScan(this.state, this.env);
            }
            return json({ error: 'not_found' }, 404);
        } catch (error) {
            const reason = sponsoredRelayRejectionReason(error);
            const code = safeErrorCode(error);
            console.error(formatLog('livepeer_control_request_failed', { code }));
            return json({
                error: code,
                ...(reason ? { reason } : {}),
            }, errorStatus(code));
        }
    }

    private async reserveUploadIntent(request: Request): Promise<Response> {
        const startedAtMs = Date.now();
        const input = await parseUploadIntentRequest(request, this.env);
        await verifyControlSignature(request, input.envelope);
        const { job: chainJob } = await readFinalMediaJob(this.env, input.body.job_id);
        requireExactChainJob(input, chainJob);
        const [publicBetaJob, publicBetaState] = isPublicBetaPacket(this.env)
            ? await Promise.all([
                readFinalPublicTestnetBetaJob(this.env, input.body.job_id),
                readFinalPublicTestnetBetaState(this.env),
            ])
            : [null, null];
        if (isPublicBetaPacket(this.env)) {
            await requirePublicTestnetBetaJob(input, chainJob, publicBetaJob, publicBetaState);
        }

        const candidate = jobRecord(input, this.env, publicBetaJob?.deadline_at_ms);
        const result = await this.state.storage.transaction(async (transaction) => {
            const nonceKey = `nonce:${input.envelope.device_nonce}`;
            if (await transaction.get(nonceKey)) throw new Error('device_nonce_replayed');
            const existing = await transaction.get<JobRecord>(JOB_KEY);
            await assertDurableObjectRecordCapacity(
                transaction,
                existing
                    ? [nonceKey, RECONCILE_KEY]
                    : [nonceKey, JOB_KEY, RECONCILE_KEY],
                'upload_job',
            );
            if (existing) {
                if (!sameJob(existing, candidate)) throw new Error('reservation_conflict');
                await transaction.put(nonceKey, { expiresAtMs: Number(input.envelope.expires_at_ms) });
                return { record: existing, created: false };
            }
            if (input.body.recovery) throw new Error('provider_recovery_not_ready');
            if (this.env.LIVEPEER_NEW_UPLOADS_ENABLED !== 'true') {
                throw new Error('admission_closed');
            }
            await transaction.put(nonceKey, { expiresAtMs: Number(input.envelope.expires_at_ms) });
            await transaction.put(JOB_KEY, candidate);
            return { record: candidate, created: true };
        });
        await scheduleAlarmNoLaterThan(this.state, Number(input.envelope.expires_at_ms));
        if (result.created) logJobStateTransition(null, candidate.state);

        let record = result.record;
        if (input.body.recovery === 'reconcile') {
            await this.reconcileUpload(record);
            record = await this.state.storage.get<JobRecord>(JOB_KEY) || record;
            const observation = await this.state.storage.get<ReconcileRecord>(RECONCILE_KEY);
            if (observation?.uploadReadFailed) throw new Error('provider_unavailable');
            return json({ job_id: record.jobId, generation: record.generation, state: record.state });
        }
        if (['UPLOAD_READY', 'UPLOADING'].includes(record.state)) {
            if (!record.leaseExpiresAtMs || record.leaseExpiresAtMs <= Date.now()) {
                const lease = await requestAdmission(this.env, record);
                record = {
                    ...record,
                    leaseId: lease.leaseId,
                    leaseExpiresAtMs: Math.min(
                        lease.expiresAtMs,
                        record.absoluteDeadlineAtMs ?? lease.expiresAtMs,
                    ),
                };
                await this.state.storage.put(JOB_KEY, record);
            }
            console.info(formatLog('upload_intent_control_completed', {
                outcome: 'REUSED',
                providerCalls: 0,
                latencyMs: Math.max(0, Date.now() - startedAtMs),
            }));
            return uploadIntentResponse(record, false);
        }
        if (!['AUTHORIZED', 'LEASED'].includes(record.state)) {
            throw new Error(['CREATE_PENDING', 'PROVIDER_CREATE_PENDING'].includes(record.state)
                ? 'provider_create_pending'
                : 'provider_create_ambiguous');
        }
        if (publicBetaDeadlineExpired(record)) throw new Error('admission_denied');
        if (this.env.LIVEPEER_PROVIDER_MUTATIONS_ENABLED !== 'true') {
            throw new Error('provider_mutations_disabled');
        }

        if (record.state === 'AUTHORIZED') {
            const lease = await requestAdmission(this.env, record);
            const leased = {
                ...transitionJob(record, 'LEASED'),
                leaseId: lease.leaseId,
                leaseExpiresAtMs: Math.min(
                    lease.expiresAtMs,
                    record.absoluteDeadlineAtMs ?? lease.expiresAtMs,
                ),
            };
            await this.state.storage.put(JOB_KEY, leased);
            logJobStateTransition(record.state, leased.state);
            record = leased;
        } else if (!record.leaseExpiresAtMs || record.leaseExpiresAtMs <= Date.now()) {
            const lease = await requestAdmission(this.env, record);
            record = {
                ...record,
                leaseId: lease.leaseId,
                leaseExpiresAtMs: Math.min(
                    lease.expiresAtMs,
                    record.absoluteDeadlineAtMs ?? lease.expiresAtMs,
                ),
            };
            await this.state.storage.put(JOB_KEY, record);
        }

        const pending = {
            ...transitionJob(record, 'PROVIDER_CREATE_PENDING'),
            providerCreate: {
                attempts: 1,
                lastAttemptAtMs: Date.now(),
                retryPolicy: 'RECONCILE_ONLY',
            },
        } satisfies JobRecord;
        await this.state.storage.put(JOB_KEY, pending);
        logJobStateTransition(record.state, pending.state);
        console.info(formatLog('upload_intent_control_completed', {
            outcome: 'CREATE_PENDING',
            providerCalls: 0,
            latencyMs: Math.max(0, Date.now() - startedAtMs),
        }));

        let provider: CreateUploadResult;
        try {
            provider = await livepeerProvider(this.env).createUpload(pending);
        } catch (error) {
            const providerError = safeErrorCode(error);
            const errorCode = providerError === 'provider_admission_closed'
                ? 'provider_admission_closed'
                : providerError === 'provider_unavailable'
                    ? 'provider_unavailable'
                    : 'provider_create_ambiguous';
            const ambiguous = {
                ...transitionJob(pending, 'CREATE_AMBIGUOUS'),
                providerCreate: {
                    ...pending.providerCreate,
                    lastErrorCode: errorCode,
                    ambiguousAtMs: Date.now(),
                },
            } satisfies JobRecord;
            await this.state.storage.put(JOB_KEY, ambiguous);
            logJobStateTransition(pending.state, ambiguous.state);
            await updateAdmission(
                this.env,
                ambiguous,
                errorCode === 'provider_unavailable'
                    ? 'PROVIDER_UNAVAILABLE'
                    : 'CREATE_AMBIGUOUS',
            );
            if (errorCode === 'provider_admission_closed') {
                await updateAdmission(this.env, pending, 'AUTO_CLOSED');
            }
            throw new Error('provider_create_ambiguous');
        }
        const ready: JobRecord = {
            ...transitionJob(pending, 'UPLOAD_READY'),
            assetId: provider.assetId,
            playbackId: provider.playbackId,
            projectId: provider.projectId,
            tusEndpoint: provider.tusEndpoint,
            providerCreate: {
                ...pending.providerCreate,
                completedAtMs: Date.now(),
            },
        };
        if (publicBetaDeadlineExpired(ready)) {
            const expired = transitionJob(ready, 'UPLOAD_EXPIRED');
            await this.state.storage.put(JOB_KEY, expired);
            await updateAdmission(this.env, expired, 'UPLOAD_EXPIRED');
            throw new Error('admission_denied');
        }
        await this.state.storage.put(JOB_KEY, ready);
        logJobStateTransition(pending.state, ready.state);
        await updateAdmission(this.env, ready, 'UPLOAD_READY');
        return uploadIntentResponse(ready, true);
    }

    private async reconcileUpload(record: JobRecord): Promise<void> {
        if (!isPublicBetaPacket(this.env)
            || !record.absoluteDeadlineAtMs
            || !record.assetId
            || !['UPLOAD_READY', 'UPLOADING', 'PROCESSING'].includes(record.state)) return;
        if (publicBetaDeadlineExpired(record)) {
            const expired = transitionJob(record, 'UPLOAD_EXPIRED');
            await this.state.storage.put(JOB_KEY, expired);
            await updateAdmission(this.env, expired, 'UPLOAD_EXPIRED');
            return;
        }
        const previous = await this.state.storage.get<ReconcileRecord>(RECONCILE_KEY);
        if (previous && previous.nextReconcileAtMs > Date.now()) {
            await scheduleReconcile(this.state, Math.min(previous.nextReconcileAtMs, record.absoluteDeadlineAtMs));
            return;
        }
        // Persist the next read before external I/O; duplicate polls cannot spin the provider.
        await persistUnknownReconcile(this.state, 'PROVIDER_UNKNOWN');
        const observation = (await this.state.storage.get<ReconcileRecord>(RECONCILE_KEY))!;
        await this.state.storage.put(RECONCILE_KEY, { ...observation, uploadReadFailed: true });
        await scheduleReconcile(this.state, record.absoluteDeadlineAtMs);
        const asset = await livepeerProvider(this.env).readAsset(record.assetId);
        if (asset.id !== record.assetId
            || asset.playbackId !== record.playbackId
            || asset.projectId !== record.projectId
            || asset.projectId !== this.env.LIVEPEER_PROJECT_ID
            || asset.creatorBindingType !== 'unverified'
            || asset.creatorBindingValue !== `${record.jobId}:${record.generation}`
            || asset.createdByTokenName !== record.apiTokenName
            || asset.name !== `youtick-${record.jobId}-g${record.generation}`
            || asset.policy !== 'jwt') throw new Error('provider_identity_mismatch');
        if (!['waiting', 'processing', 'ready', 'failed'].includes(asset.phase)) {
            throw new Error('provider_state_invalid');
        }
        await this.handleLivepeerWebhook(new Request('https://object/internal/livepeer-webhook', {
            method: 'POST',
            body: JSON.stringify({
                event: asset.phase === 'failed' ? 'asset.failed' : 'asset.updated',
                timestamp: Date.now(),
                payload: { asset: { id: asset.id, status: { phase: asset.phase } } },
            }),
        }));
        const current = (await this.state.storage.get<ReconcileRecord>(RECONCILE_KEY))!;
        await this.state.storage.put(RECONCILE_KEY, { ...current, uploadReadFailed: false });
    }

    private async heartbeatUploadLease(request: Request): Promise<Response> {
        const input = await parseUploadHeartbeatRequest(request, this.env);
        await verifyControlSignature(request, input.envelope);
        const { job: chainJob } = await readFinalMediaJob(this.env, input.body.job_id);
        requireHeartbeatChainJob(input, chainJob);
        const [publicBetaJob, publicBetaState] = isPublicBetaPacket(this.env)
            ? await Promise.all([
                readFinalPublicTestnetBetaJob(this.env, input.body.job_id),
                readFinalPublicTestnetBetaState(this.env),
            ])
            : [null, null];
        if (isPublicBetaPacket(this.env)) {
            await requirePublicTestnetBetaJob(input, chainJob, publicBetaJob, publicBetaState);
        }
        const record = await this.state.storage.transaction(async (transaction) => {
            const nonceKey = `nonce:${input.envelope.device_nonce}`;
            if (await transaction.get(nonceKey)) throw new Error('device_nonce_replayed');
            const current = await transaction.get<JobRecord>(JOB_KEY);
            if (!current
                || current.jobId !== input.body.job_id
                || current.generation !== input.body.generation
                || current.leaseId !== input.body.lease_id
                || (current.absoluteDeadlineAtMs !== undefined
                    && current.absoluteDeadlineAtMs <= Date.now())
                || !['UPLOAD_READY', 'UPLOADING'].includes(current.state)) {
                throw new Error('admission_denied');
            }
            await assertDurableObjectRecordCapacity(
                transaction,
                [nonceKey, RECONCILE_KEY],
                'upload_job',
            );
            await transaction.put(nonceKey, { expiresAtMs: Number(input.envelope.expires_at_ms) });
            return current;
        });
        await scheduleAlarmNoLaterThan(this.state, Number(input.envelope.expires_at_ms));
        let lease: AdmissionLease;
        try {
            lease = await heartbeatAdmissionLease(this.env, record);
        } catch (error) {
            if (safeErrorCode(error) === 'admission_denied') {
                const expired = transitionJob(record, 'UPLOAD_EXPIRED');
                await this.state.storage.put(JOB_KEY, expired);
                logJobStateTransition(record.state, expired.state);
                await scheduleTerminalArchive(this.state, this.env, expired);
                await updateAdmission(this.env, expired, 'UPLOAD_EXPIRED');
            }
            throw error;
        }
        const uploading = transitionJob(record, 'UPLOADING');
        await this.state.storage.put(JOB_KEY, {
            ...uploading,
            leaseId: lease.leaseId,
            leaseExpiresAtMs: Math.min(
                lease.expiresAtMs,
                record.absoluteDeadlineAtMs ?? lease.expiresAtMs,
            ),
        });
        logJobStateTransition(record.state, uploading.state);
        return json({
            schema: 'youtick.livepeer-upload-lease.v1',
            job_id: record.jobId,
            generation: record.generation,
            lease_id: lease.leaseId,
            expires_at_ms: String(Math.min(
                lease.expiresAtMs,
                record.absoluteDeadlineAtMs ?? lease.expiresAtMs,
            )),
            heartbeat_interval_ms: ADMISSION_LEASE_HEARTBEAT_MS,
        });
    }

    private async cancelUpload(request: Request): Promise<Response> {
        const input = await parseUploadCancellationRequest(request, this.env);
        await verifyControlSignature(request, input.envelope);
        const { job: chainJob } = await readFinalMediaJob(this.env, input.body.job_id);
        requireCancellationChainJob(input, chainJob);
        const result = await this.state.storage.transaction(async (transaction) => {
            const nonceKey = `nonce:${input.envelope.device_nonce}`;
            if (await transaction.get(nonceKey)) throw new Error('device_nonce_replayed');
            const current = await transaction.get<JobRecord>(JOB_KEY);
            if (!current
                || current.jobId !== input.body.job_id
                || current.generation !== input.body.generation
                || current.creator !== input.envelope.account_id) {
                throw new Error('upload_cancel_denied');
            }
            await assertDurableObjectRecordCapacity(
                transaction,
                [nonceKey, RECONCILE_KEY],
                'upload_job',
            );
            if (current.state === 'CANCELLED') {
                await transaction.put(nonceKey, { expiresAtMs: Number(input.envelope.expires_at_ms) });
                return { record: current, duplicate: true, fromState: current.state };
            }
            if (!['AUTHORIZED', 'LEASED'].includes(current.state)) {
                throw new Error('upload_cancel_denied');
            }
            const cancelled = transitionJob(current, 'CANCELLED');
            await transaction.put(nonceKey, { expiresAtMs: Number(input.envelope.expires_at_ms) });
            await transaction.put(JOB_KEY, cancelled);
            return { record: cancelled, duplicate: false, fromState: current.state };
        });
        await scheduleAlarmNoLaterThan(this.state, Number(input.envelope.expires_at_ms));
        if (!result.duplicate) logJobStateTransition(result.fromState, result.record.state);
        await scheduleTerminalArchive(this.state, this.env, result.record);
        if (result.record.leaseId) await updateAdmission(this.env, result.record, 'CANCELLED');
        return json({ cancelled: true, duplicate: result.duplicate, refundable: false });
    }

    private async issuePlaybackToken(request: Request): Promise<Response> {
        const input = await parsePlaybackTokenRequest(request, this.env);
        await verifyControlSignature(request, input.envelope);
        const [job, reconcile] = await Promise.all([
            this.state.storage.get<JobRecord>(JOB_KEY),
            this.state.storage.get<ReconcileRecord>(RECONCILE_KEY),
        ]);
        if (!job
            || job.state !== 'ONCHAIN_PUBLISHED'
            || job.jobId !== input.body.job_id
            || job.generation !== input.body.generation
            || job.playbackId !== input.body.playback_id
            || reconcile?.status !== 'HEALTHY') {
            throw new Error('playback_denied');
        }
        await this.state.storage.transaction(async (transaction) => {
            const nonceKey = `nonce:${input.envelope.device_nonce}`;
            if (await transaction.get(nonceKey)) throw new Error('device_nonce_replayed');
            await assertDurableObjectRecordCapacity(
                transaction,
                [nonceKey, RECONCILE_KEY],
                'upload_job',
            );
            await transaction.put(nonceKey, { expiresAtMs: Number(input.envelope.expires_at_ms) });
        });
        await scheduleAlarmNoLaterThan(this.state, Number(input.envelope.expires_at_ms));

        const authorization = await readPlaybackAuthorization(this.env, input);
        const nowMs = Date.now();
        const remainingSeconds = Math.floor((authorization.grantExpiresAtMs - nowMs) / 1000);
        if (remainingSeconds < 1) throw new Error('playback_denied');
        const ttlSeconds = Math.min(
            input.body.requested_ttl_seconds,
            remainingSeconds,
            isPublicBetaPacket(this.env) ? PLAYBACK_V2_TTL_SECONDS : PLAYBACK_MAX_TTL_SECONDS,
        );
        const issuedAtSeconds = Math.floor(nowMs / 1000);
        const token = await signLivepeerJwt(
            this.env,
            input.body.playback_id,
            issuedAtSeconds,
            ttlSeconds,
        );
        return json({
            schema: 'youtick.livepeer-playback-token.v1',
            playback_id: input.body.playback_id,
            token,
            expires_at_ms: String((issuedAtSeconds + ttlSeconds) * 1000),
            hls_url: livepeerHlsUrl(input.body.playback_id),
        });
    }

    private async enqueueOutbox(request: Request): Promise<Response> {
        const input = parseOutboxInput(await readJsonObject(request));
        const key = `outbox:${input.idempotencyKey}`;
        const candidate: OutboxRecord = {
            schema: 'youtick.livepeer-control-outbox.v1',
            state: 'PENDING',
            ...input,
            createdAtMs: Date.now(),
        };
        const result = await this.state.storage.transaction(async (transaction) => {
            const existing = await transaction.get<OutboxRecord>(key);
            if (existing) {
                if (!sameOutbox(existing, candidate)) throw new Error('outbox_conflict');
                return { record: existing, created: false };
            }
            await assertDurableObjectRecordCapacity(
                transaction,
                [key, RECONCILE_KEY],
                'upload_job',
            );
            await transaction.put(key, candidate);
            return { record: candidate, created: true };
        });
        return json({ ...result.record, created: result.created }, result.created ? 201 : 200);
    }

    private async handleLivepeerWebhook(request: Request): Promise<Response> {
        const rawBody = new Uint8Array(await request.arrayBuffer());
        if (rawBody.byteLength > MAX_CONTROL_BODY_BYTES) throw new Error('control_body_too_large');
        let value: unknown;
        try {
            value = JSON.parse(new TextDecoder().decode(rawBody));
        } catch {
            throw new Error('invalid_webhook');
        }
        const webhook = parseWebhook(requireObject(value, 'invalid_webhook'));
        const asset = webhookAsset(webhook);
        if (!asset) {
            return json({ accepted: true, ignored: true }, 202);
        }
        const existing = await this.state.storage.get<JobRecord>(JOB_KEY);
        if (!existing || asset.id !== existing.assetId) {
            return json({ accepted: true, ignored: true }, 202);
        }
        if (publicBetaDeadlineExpired(existing)
            && !['UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'CANCELLED', 'ONCHAIN_PUBLISHED']
                .includes(existing.state)) {
            const expired = transitionJob(existing, 'UPLOAD_EXPIRED');
            await this.state.storage.put(JOB_KEY, expired);
            await scheduleTerminalArchive(this.state, this.env, expired);
            await updateAdmission(this.env, expired, 'UPLOAD_EXPIRED');
            return json({ accepted: true, expired: true }, 202);
        }
        if (['PROVIDER_FAILED', 'UPLOAD_EXPIRED'].includes(existing.state)) {
            return json({ accepted: true, ignored: true, terminal: true }, 202);
        }
        const phase = providerPhase(asset);
        const providerFailed = ['asset.failed', 'asset.deleted'].includes(webhook.event);
        const readinessEvent = webhook.event === 'asset.ready'
            || (webhook.event === 'asset.updated'
                && ['UPLOAD_READY', 'UPLOADING', 'PROCESSING'].includes(existing.state)
                && phase === 'ready');
        if (existing.state === 'ONCHAIN_PUBLISHED' && readinessEvent) {
            await updateAdmission(this.env, existing, 'ONCHAIN_PUBLISHED');
            await ensureReconcileScheduled(this.state);
            return json({ accepted: true, duplicate: true, finalized: true });
        }
        if (!readinessEvent) {
            if (existing.state === 'ONCHAIN_PUBLISHED') {
                await scheduleReconcile(this.state, Date.now());
                return json({ accepted: true, ignored: true, reconcile_triggered: true }, 202);
            }
            if (providerFailed && [
                'UPLOAD_READY',
                'UPLOADING',
                'PROCESSING',
                'READY_VERIFIED',
                'FINALIZE_QUEUED',
                'FINALIZE_RETRY',
                'PROVIDER_FAILED',
            ].includes(existing.state)) {
                const failed = transitionJob(existing, 'PROVIDER_FAILED');
                await this.state.storage.put(JOB_KEY, failed);
                logJobStateTransition(existing.state, failed.state);
                await scheduleTerminalArchive(this.state, this.env, failed);
                await updateAdmission(this.env, failed, 'PROVIDER_FAILED');
                return json({ accepted: true, provider_failed: true });
            }
            if (['UPLOAD_READY', 'UPLOADING'].includes(existing.state)
                && webhook.event === 'asset.updated'
                && phase === 'processing') {
                const processing = transitionJob(existing, 'PROCESSING');
                await this.state.storage.put(JOB_KEY, processing);
                logJobStateTransition(existing.state, processing.state);
                return json({ accepted: true, processing: true });
            }
            return json({ accepted: true, ignored: true }, 202);
        }

        const digest = await webhookDigest(webhook, asset, await sha256BytesHex(rawBody), sha256Hex);
        const dedupKey = `webhook:${digest}`;
        const seen = await this.state.storage.transaction(async (transaction) => {
            const duplicate = await transaction.get(dedupKey);
            if (!duplicate) {
                await assertDurableObjectRecordCapacity(
                    transaction,
                    [dedupKey, RECONCILE_KEY],
                    'upload_job',
                );
                await transaction.put(dedupKey, {
                    state: 'PROCESSING',
                    event: webhook.event,
                    assetId: asset.id,
                    phase: providerPhase(asset),
                    receivedAtMs: Date.now(),
                });
            }
            return Boolean(duplicate);
        });
        let record = existing;
        if (!seen) {
            try {
                const publication = await verifyReadyProviderAsset(this.env, record);
                const { tusEndpoint: _clearedTusEndpoint, ...withoutTusEndpoint } = record;
                record = {
                    ...transitionJob(withoutTusEndpoint, 'READY_VERIFIED'),
                    publication,
                };
                await this.state.storage.put(JOB_KEY, record);
                logJobStateTransition(existing.state, record.state);
                await updateAdmission(this.env, record, 'READY_VERIFIED');
                await this.state.storage.put(dedupKey, {
                    state: 'VERIFIED',
                    event: webhook.event,
                    assetId: asset.id,
                    phase: providerPhase(asset),
                    receivedAtMs: Date.now(),
                });
            } catch (error) {
                await this.state.storage.delete(dedupKey);
                throw error;
            }
        } else {
            record = await this.state.storage.get<JobRecord>(JOB_KEY) || existing;
            if (['UPLOAD_READY', 'UPLOADING', 'PROCESSING'].includes(record.state)) {
                return json({ accepted: true, duplicate: true, processing: true }, 202);
            }
        }

        if (record.state === 'ONCHAIN_PUBLISHED') {
            await updateAdmission(this.env, record, 'ONCHAIN_PUBLISHED');
            await ensureReconcileScheduled(this.state);
            return json({ accepted: true, duplicate: Boolean(seen), finalized: true });
        }
        if (!record.publication) throw new Error('provider_state_invalid');
        return advanceFinalization(this.state, this.env, record);
    }

    private async finalizePublication(request: Request): Promise<Response> {
        const input = await parseFinalizeInput(await readJsonObject(request));
        return processFinalizeOutbox(this.state, this.env, input);
    }

    private async suspendSales(request: Request): Promise<Response> {
        const input = await parseSuspendSalesInput(await readJsonObject(request));
        return processSuspendSalesOutbox(this.state, this.env, input);
    }

    private async deletePublicBetaAsset(request: Request): Promise<Response> {
        const input = await readJsonObject(request);
        requireExactKeys(input, ['jobId', 'generation', 'assetId'], 'invalid_outbox');
        if (typeof input.jobId !== 'string'
            || !JOB_ID_PATTERN.test(input.jobId)
            || input.generation !== 1
            || typeof input.assetId !== 'string'
            || !PROVIDER_ID_PATTERN.test(input.assetId)) {
            throw new Error('invalid_outbox');
        }
        const record = await this.state.storage.get<JobRecord>(JOB_KEY);
        if (!record
            || record.jobId !== input.jobId
            || record.generation !== input.generation
            || record.assetId !== input.assetId
            || !record.projectId
            || !record.playbackId) {
            throw new Error('provider_identity_mismatch');
        }
        const assetIdSha256 = await sha256Hex(input.assetId);
        if (record.providerDelete) {
            if (record.providerDelete.assetIdSha256 !== assetIdSha256) {
                throw new Error('provider_identity_mismatch');
            }
            if (record.providerDelete.outcome === 'AMBIGUOUS') {
                throw new Error('provider_delete_ambiguous');
            }
            return json({ deleted: true, duplicate: true, outcome: record.providerDelete.outcome });
        }
        const [chainJob, marker, publication] = await Promise.all([
            readFinalMediaJob(this.env, input.jobId),
            readFinalPublicTestnetBetaJob(this.env, input.jobId),
            readFinalPublicationById(this.env, input.jobId),
        ]);
        if (!marker
            || marker.creator_id !== record.creator
            || marker.generation !== 1
            || chainJob.job.fee_quote_hash !== marker.sponsor_quote_id) {
            throw new Error('provider_identity_mismatch');
        }
        const takedown = publication?.availability === 'TAKEDOWN'
            && publication.asset_id_hash === assetIdSha256;
        const expired = publication === null
            && record.state === 'UPLOAD_EXPIRED'
            && Number(marker.deadline_at_ms) <= Date.now();
        if (!takedown && !expired) throw new Error('provider_identity_mismatch');

        const asset = await livepeerProvider(this.env).readAsset(input.assetId);
        if (asset.id !== input.assetId
            || asset.projectId !== record.projectId
            || asset.projectId !== this.env.LIVEPEER_PROJECT_ID
            || asset.playbackId !== record.playbackId
            || asset.creatorBindingType !== 'unverified'
            || asset.creatorBindingValue !== `${record.jobId}:${record.generation}`
            || asset.name !== `youtick-${record.jobId}-g${record.generation}`
            || (publication !== null
                && (publication.playback_id !== asset.playbackId
                    || publication.project_id_hash !== await sha256Hex(asset.projectId)))) {
            throw new Error('provider_identity_mismatch');
        }
        try {
            const outcome = await livepeerProvider(this.env).deleteAsset(input.assetId);
            const storedOutcome = outcome === 'deleted' ? 'DELETED' : 'MISSING';
            await this.state.storage.put(JOB_KEY, {
                ...record,
                providerDelete: { assetIdSha256, outcome: storedOutcome, attemptedAtMs: Date.now() },
            } satisfies JobRecord);
            return json({ deleted: true, duplicate: false, outcome: storedOutcome });
        } catch {
            await this.state.storage.put(JOB_KEY, {
                ...record,
                providerDelete: { assetIdSha256, outcome: 'AMBIGUOUS', attemptedAtMs: Date.now() },
            } satisfies JobRecord);
            await closeAdmissionAfterAmbiguousDelete(this.env, record);
            throw new Error('provider_delete_ambiguous');
        }
    }
}

async function purgeExpiredWebhookDedup(state: DurableObjectState): Promise<void> {
    const cutoff = Date.now() - WEBHOOK_DEDUP_RETENTION_MS;
    const records = await state.storage.list<{ receivedAtMs?: unknown }>({
        prefix: 'webhook:',
        limit: LIFECYCLE_DELETE_BATCH,
    });
    const expired = [...records]
        .filter(([, record]) => !Number.isSafeInteger(record.receivedAtMs)
            || Number(record.receivedAtMs) <= cutoff)
        .map(([key]) => key);
    if (expired.length > 0) await state.storage.delete(expired);
}

async function purgeExpiredControlNonces(state: DurableObjectState): Promise<void> {
    const now = Date.now();
    const records = await state.storage.list<number | { expiresAtMs?: unknown }>({
        prefix: 'nonce:',
        limit: LIFECYCLE_DELETE_BATCH,
    });
    const deadlines = [...records].map(([key, record]) => ({
        key,
        expiresAtMs: typeof record === 'number'
            ? record + CONTROL_MAX_FUTURE_MS
            : Number(record.expiresAtMs),
    }));
    const expired = deadlines
        .filter(({ expiresAtMs }) => !Number.isSafeInteger(expiresAtMs) || expiresAtMs <= now)
        .map(({ key }) => key);
    if (expired.length > 0) await state.storage.delete(expired);
    const pending = deadlines
        .filter(({ expiresAtMs }) => Number.isSafeInteger(expiresAtMs) && expiresAtMs > now)
        .map(({ expiresAtMs }) => expiresAtMs);
    if (records.size === LIFECYCLE_DELETE_BATCH && expired.length > 0) pending.push(now);
    if (pending.length > 0) await scheduleAlarmNoLaterThan(state, Math.min(...pending));
}

type OperatorOutboxStatus = {
    totalRecords: number;
    invalidRecords: number;
    confirmedRecords: number;
    pendingRecords: number;
    retryRecords: number;
    committedRecords: number;
    uncommittedRecords: number;
    eligibleRecords: number;
    scanActive: boolean;
};

function validOperatorOutboxRecord(key: string, value: unknown): value is OperatorRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Partial<OperatorRecord>;
    if (record.schema !== 'youtick.livepeer-operator-outbox.v1'
        || !['PENDING', 'RESERVED', 'SIGNED', 'BROADCAST', 'CONFIRMED'].includes(record.state || '')
        || !OUTBOX_METHODS.has(record.method as OutboxMethod)
        || typeof record.idempotencyKey !== 'string'
        || !IDEMPOTENCY_PATTERN.test(record.idempotencyKey)
        || key !== `outbox:${record.idempotencyKey}`
        || typeof record.payloadSha256 !== 'string'
        || !SHA256_PATTERN.test(record.payloadSha256)
        || !Number.isSafeInteger(record.createdAtMs)
        || Number(record.createdAtMs) <= 0) return false;
    if (record.state !== 'CONFIRMED') return true;
    const archive = record.archive;
    return Number.isSafeInteger(record.confirmedAtMs)
        && Number(record.confirmedAtMs) > 0
        && Boolean(archive)
        && ['PENDING', 'RETRY', 'COMMITTED'].includes(archive?.status || '')
        && Number.isSafeInteger(archive?.attempts)
        && Number(archive?.attempts) >= 0
        && Number.isSafeInteger(archive?.createdAtMs)
        && Number(archive?.createdAtMs) > 0
        && Number.isSafeInteger(archive?.nextAttemptAtMs)
        && Number(archive?.nextAttemptAtMs) > 0;
}

function summarizeOperatorOutbox(
    stored: Map<string, unknown>,
    scanActive: boolean,
    now: number,
): OperatorOutboxStatus {
    const records = [...stored].filter((entry): entry is [string, OperatorRecord] => (
        validOperatorOutboxRecord(entry[0], entry[1])
    )).map(([, record]) => record);
    const confirmed = records.filter((record) => record.state === 'CONFIRMED');
    const pending = confirmed.filter((record) => record.archive?.status === 'PENDING');
    const retry = confirmed.filter((record) => record.archive?.status === 'RETRY');
    const committed = confirmed.filter((record) => record.archive?.status === 'COMMITTED');
    const uncommitted = [...pending, ...retry];
    return {
        totalRecords: stored.size,
        invalidRecords: stored.size - records.length,
        confirmedRecords: confirmed.length,
        pendingRecords: pending.length,
        retryRecords: retry.length,
        committedRecords: committed.length,
        uncommittedRecords: uncommitted.length,
        eligibleRecords: uncommitted.filter((record) => record.archive!.nextAttemptAtMs <= now).length,
        scanActive,
    };
}

async function readOperatorOutboxStatus(state: DurableObjectState): Promise<Response> {
    const [stored, scan] = await Promise.all([
        state.storage.list<unknown>({
            prefix: 'outbox:',
            limit: DURABLE_OBJECT_MAX_PERSISTENT_RECORDS,
        }),
        state.storage.get<OperatorArchiveScan>(OPERATOR_ARCHIVE_SCAN_KEY),
    ]);
    return json({
        schema: 'youtick.livepeer-operator-outbox-status.v1',
        ...summarizeOperatorOutbox(stored, Boolean(scan), Date.now()),
    });
}

async function startOperatorOutboxArchiveScan(
    state: DurableObjectState,
    env: Env,
): Promise<Response> {
    if (!validOperatorArchiveConfig(env)) throw new Error('runtime_not_configured');
    const status = await state.storage.transaction(async (transaction) => {
        const stored = await transaction.list<unknown>({
            prefix: 'outbox:',
            limit: DURABLE_OBJECT_MAX_PERSISTENT_RECORDS,
        });
        const scan = await transaction.get<OperatorArchiveScan>(OPERATOR_ARCHIVE_SCAN_KEY);
        const current = summarizeOperatorOutbox(stored, Boolean(scan), Date.now());
        if (current.scanActive) throw new Error('operator_archive_scan_active');
        if (current.invalidRecords !== 0
            || current.uncommittedRecords !== 1
            || current.eligibleRecords !== 1) {
            throw new Error('operator_archive_eligible_count_invalid');
        }
        await assertDurableObjectRecordCapacity(
            transaction,
            [OPERATOR_ARCHIVE_SCAN_KEY],
            'operator',
        );
        await transaction.put(OPERATOR_ARCHIVE_SCAN_KEY, {} satisfies OperatorArchiveScan);
        return current;
    });
    await scheduleAlarmNoLaterThan(state, Date.now());
    return json({ accepted: true, eligibleRecords: status.eligibleRecords }, 202);
}

async function advanceOperatorArchiveScan(
    state: DurableObjectState,
    env: Env,
): Promise<boolean> {
    if (env.OPERATOR_OUTBOX_ARCHIVE_ENABLED !== 'true') return false;
    const scan = await state.storage.get<OperatorArchiveScan>(OPERATOR_ARCHIVE_SCAN_KEY);
    if (!scan) return false;
    const now = Date.now();
    if (scan.after === undefined
        && scan.earliestRetryAtMs !== undefined
        && scan.earliestRetryAtMs > now) {
        await scheduleAlarmNoLaterThan(state, scan.earliestRetryAtMs);
        return true;
    }
    const records = await state.storage.list<OperatorRecord>({
        prefix: 'outbox:',
        startAfter: scan.after,
        limit: OPERATOR_ARCHIVE_SCAN_BATCH,
    });
    if (records.size === 0) {
        if (scan.earliestRetryAtMs !== undefined) {
            await state.storage.put(OPERATOR_ARCHIVE_SCAN_KEY, {
                earliestRetryAtMs: scan.earliestRetryAtMs,
            } satisfies OperatorArchiveScan);
            await scheduleAlarmNoLaterThan(state, scan.earliestRetryAtMs);
            return true;
        }
        await state.storage.delete(OPERATOR_ARCHIVE_SCAN_KEY);
        return scan.after !== undefined;
    }

    let earliestRetryAtMs = scan.after === undefined ? undefined : scan.earliestRetryAtMs;
    for (const [key, record] of records) {
        if (record.schema !== 'youtick.livepeer-operator-outbox.v1'
            || record.state !== 'CONFIRMED'
            || !record.archive
            || record.archive.status === 'COMMITTED') continue;
        if (record.archive.nextAttemptAtMs > now) {
            earliestRetryAtMs = Math.min(
                earliestRetryAtMs ?? record.archive.nextAttemptAtMs,
                record.archive.nextAttemptAtMs,
            );
            continue;
        }
        const retryAtMs = await advanceOperatorArchive(state, env, key, record);
        if (retryAtMs !== null) {
            earliestRetryAtMs = Math.min(earliestRetryAtMs ?? retryAtMs, retryAtMs);
        }
        await state.storage.transaction(async (transaction) => {
            await assertDurableObjectRecordCapacity(
                transaction,
                [OPERATOR_ARCHIVE_SCAN_KEY],
                'operator',
            );
            await transaction.put(OPERATOR_ARCHIVE_SCAN_KEY, {
                after: key,
                ...(earliestRetryAtMs === undefined ? {} : { earliestRetryAtMs }),
            } satisfies OperatorArchiveScan);
        });
        await scheduleAlarmNoLaterThan(state, now);
        return true;
    }

    const after = [...records.keys()].at(-1)!;
    if (records.size === OPERATOR_ARCHIVE_SCAN_BATCH) {
        await state.storage.transaction(async (transaction) => {
            await assertDurableObjectRecordCapacity(
                transaction,
                [OPERATOR_ARCHIVE_SCAN_KEY],
                'operator',
            );
            await transaction.put(OPERATOR_ARCHIVE_SCAN_KEY, {
                after,
                ...(earliestRetryAtMs === undefined ? {} : { earliestRetryAtMs }),
            } satisfies OperatorArchiveScan);
        });
        await scheduleAlarmNoLaterThan(state, now);
        return true;
    }
    if (earliestRetryAtMs !== undefined) {
        await state.storage.put(OPERATOR_ARCHIVE_SCAN_KEY, {
            earliestRetryAtMs,
        } satisfies OperatorArchiveScan);
        await scheduleAlarmNoLaterThan(state, earliestRetryAtMs);
        return true;
    }
    await state.storage.delete(OPERATOR_ARCHIVE_SCAN_KEY);
    return false;
}

async function advanceOperatorArchive(
    state: DurableObjectState,
    env: Env,
    key: string,
    record: OperatorRecord,
): Promise<number | null> {
    const metadata = record.archive;
    if (!metadata) return null;
    const attempts = Math.min(metadata.attempts + 1, RECONCILE_BACKOFF_MS.length);
    try {
        if (!validOperatorArchiveConfig(env)) throw new Error('operator_archive_unavailable');
        const archive = await operatorOutboxArchive(env, record);
        await commitOperatorOutboxArchive(env.MARKET_READ_MODEL!, archive);
        await state.storage.put(key, {
            ...record,
            archive: {
                ...metadata,
                status: 'COMMITTED',
                attempts,
                archiveSha256: archive.archiveSha256,
                committedAtMs: Date.now(),
                cleanupEligibleAtMs: archive.cleanupEligibleAtMs,
            },
        } satisfies OperatorRecord);
        return null;
    } catch (error) {
        const nextAttemptAtMs = Date.now() + RECONCILE_BACKOFF_MS[attempts - 1];
        await state.storage.put(key, {
            ...record,
            archive: {
                ...metadata,
                status: 'RETRY',
                attempts,
                nextAttemptAtMs,
            },
        } satisfies OperatorRecord);
        console.error(formatLog('operator_outbox_archive_failed', {
            code: safeErrorCode(error),
            attempts,
        }));
        return nextAttemptAtMs;
    }
}

async function operatorOutboxArchive(
    env: Env,
    record: OperatorRecord,
): Promise<OperatorOutboxArchive> {
    if (record.state !== 'CONFIRMED' || !record.confirmedAtMs || !record.archive) {
        throw new Error('operator_archive_unavailable');
    }
    const summary = {
        network: 'testnet' as const,
        contractId: env.MARKET_CONTRACT_ID!,
        operatorAccountId: env.NEAR_OPERATOR_ACCOUNT_ID!,
        operatorKeyEpoch: Number(env.NEAR_OPERATOR_KEY_EPOCH),
        idempotencyKey: record.idempotencyKey,
        method: record.method,
        payloadSha256: record.payloadSha256,
        txHash: record.txHash || null,
        createdAtMs: record.createdAtMs,
        confirmedAtMs: record.confirmedAtMs,
        archiveRequestedAtMs: record.archive.createdAtMs,
        cleanupEligibleAtMs: record.confirmedAtMs + OPERATOR_OUTBOX_RETENTION_MS,
    };
    return { ...summary, archiveSha256: await sha256Hex(canonicalJson(summary)) };
}

async function scheduleTerminalArchive(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<void> {
    if (env.UPLOAD_JOB_ARCHIVE_ENABLED !== 'true'
        || !job.terminalArchive
        || job.terminalArchive.status === 'COMMITTED') return;
    await scheduleAlarmNoLaterThan(state, Math.max(Date.now(), job.terminalArchive.nextAttemptAtMs));
}

async function advanceTerminalArchive(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<void> {
    const metadata = job.terminalArchive;
    if (!metadata) return;
    const attempts = Math.min(metadata.attempts + 1, RECONCILE_BACKOFF_MS.length);
    try {
        if (!env.MARKET_READ_MODEL
            || env.NEAR_NETWORK !== 'testnet'
            || env.MARKET_CONTRACT_ID !== job.contractId) {
            throw new Error('upload_archive_unavailable');
        }
        const archive = await terminalUploadJobArchive(job);
        await commitUploadJobArchive(env.MARKET_READ_MODEL, archive);
        await state.storage.put(JOB_KEY, {
            ...job,
            terminalArchive: {
                ...metadata,
                status: 'COMMITTED',
                attempts,
                archiveSha256: archive.archiveSha256,
                committedAtMs: Date.now(),
                cleanupEligibleAtMs: archive.cleanupEligibleAtMs,
            },
        } satisfies JobRecord);
        console.info(formatLog('upload_job_archive_committed', {
            terminalState: job.state,
            attempts,
        }));
    } catch (error) {
        const code = safeErrorCode(error);
        const nextAttemptAtMs = Date.now() + RECONCILE_BACKOFF_MS[attempts - 1];
        await state.storage.put(JOB_KEY, {
            ...job,
            terminalArchive: {
                ...metadata,
                status: 'RETRY',
                attempts,
                nextAttemptAtMs,
            },
        } satisfies JobRecord);
        console.error(formatLog('upload_job_archive_failed', { code, attempts }));
        await state.storage.setAlarm(nextAttemptAtMs);
    }
}

async function terminalUploadJobArchive(job: JobRecord): Promise<UploadJobArchive> {
    if (job.network !== 'testnet'
        || !['CANCELLED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED'].includes(job.state)
        || !job.terminalAtMs
        || !job.terminalArchive) {
        throw new Error('upload_archive_unavailable');
    }
    const summary = {
        network: job.network,
        contractId: job.contractId,
        jobId: job.jobId,
        generation: job.generation,
        creatorId: job.creator,
        terminalState: job.state as UploadJobArchive['terminalState'],
        terminalAtMs: job.terminalAtMs,
        expectedSourceBytes: job.expectedSourceBytes,
        sourceFingerprintSha256: job.sourceFingerprintSha256 || null,
        assetIdSha256: job.assetId ? await sha256Hex(job.assetId) : null,
        projectIdSha256: job.projectId ? await sha256Hex(job.projectId) : null,
        archiveRequestedAtMs: job.terminalArchive.createdAtMs,
        cleanupEligibleAtMs: job.terminalAtMs + UPLOAD_JOB_RETENTION_MS,
    };
    return { ...summary, archiveSha256: await sha256Hex(canonicalJson(summary)) };
}

async function advanceFinalization(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<Response> {
    if (publicBetaDeadlineExpired(job)) {
        const expired = transitionJob(job, 'UPLOAD_EXPIRED');
        await state.storage.put(JOB_KEY, expired);
        await scheduleTerminalArchive(state, env, expired);
        await updateAdmission(env, expired, 'UPLOAD_EXPIRED');
        return json({ accepted: true, expired: true }, 202);
    }
    if (!operatorJobAllowed(env, job.jobId, job.creator) || job.generation !== 1) {
        return json({ accepted: true, ignored: true }, 202);
    }
    const response = await forwardFinalize(env, job.publication!);
    if (!response.ok) {
        const attempts = Math.min(
            (job.finalizeRetry?.attempts || 0) + 1,
            RECONCILE_BACKOFF_MS.length,
        );
        const nextAttemptAtMs = Date.now() + RECONCILE_BACKOFF_MS[attempts - 1];
        const retry = {
            ...transitionJob(job, 'FINALIZE_RETRY'),
            finalizeRetry: {
                attempts,
                lastHttpStatus: response.status,
                nextAttemptAtMs,
            },
        };
        await state.storage.put(JOB_KEY, retry);
        logJobStateTransition(job.state, retry.state);
        await scheduleReconcile(state, nextAttemptAtMs);
        return response;
    }
    const result = await response.clone().json() as { finalized?: unknown };
    const nextState = result.finalized === true ? 'ONCHAIN_PUBLISHED' : 'FINALIZE_QUEUED';
    const { finalizeRetry: _retry, ...withoutRetry } = job;
    const record = transitionJob(withoutRetry, nextState);
    await state.storage.put(JOB_KEY, record);
    logJobStateTransition(job.state, record.state);
    await updateAdmission(env, record, nextState);
    if (record.state === 'ONCHAIN_PUBLISHED') {
        await ensureReconcileScheduled(state);
    } else {
        await scheduleReconcile(state, Date.now() + RECONCILE_BACKOFF_MS[0]);
    }
    return response;
}

async function requestAdmission(env: Env, job: JobRecord): Promise<AdmissionLease> {
    if (!env.LIVEPEER_CONTROL) throw new Error('runtime_not_configured');
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
        admissionObjectName(job.network, job.contractId),
    ));
    const response = await object.fetch(new Request('https://object/internal/admission/reserve', {
        method: 'POST',
        body: JSON.stringify({
            jobId: job.jobId,
            generation: job.generation,
            creator: job.creator,
            expectedSourceBytes: job.expectedSourceBytes,
        }),
    }));
    if (!response.ok) {
        const result = await response.json() as { error?: unknown };
        throw new Error(result.error === 'admission_denied' ? 'admission_denied' : 'admission_closed');
    }
    const result = await response.json() as Record<string, unknown>;
    if (typeof result.lease_id !== 'string'
        || !LEASE_ID_PATTERN.test(result.lease_id)
        || typeof result.expires_at_ms !== 'string'
        || !/^[1-9][0-9]{12,15}$/.test(result.expires_at_ms)
        || Number(result.expires_at_ms) <= Date.now()) {
        throw new Error('admission_closed');
    }
    return { leaseId: result.lease_id, expiresAtMs: Number(result.expires_at_ms) };
}

async function closeAdmissionAfterAmbiguousDelete(env: Env, job: JobRecord): Promise<void> {
    if (!env.LIVEPEER_CONTROL) return;
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
        admissionObjectName(job.network, job.contractId),
    ));
    await object.fetch(new Request('https://object/internal/admission/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.jobId, generation: job.generation, state: 'AUTO_CLOSED' }),
    }));
}

async function heartbeatAdmissionLease(env: Env, job: JobRecord): Promise<AdmissionLease> {
    if (!env.LIVEPEER_CONTROL || !job.leaseId) throw new Error('runtime_not_configured');
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
        admissionObjectName(job.network, job.contractId),
    ));
    const response = await object.fetch(new Request('https://object/internal/admission/heartbeat', {
        method: 'POST',
        body: JSON.stringify({
            jobId: job.jobId,
            generation: job.generation,
            leaseId: job.leaseId,
        }),
    }));
    if (!response.ok) {
        let code: unknown;
        try {
            code = (await response.clone().json() as { error?: unknown }).error;
        } catch {
            throw new Error('admission_closed');
        }
        if (response.status === 409 && code === 'admission_denied') {
            throw new Error('admission_denied');
        }
        throw new Error('admission_closed');
    }
    const result = await response.json() as Record<string, unknown>;
    if (result.lease_id !== job.leaseId
        || typeof result.expires_at_ms !== 'string'
        || !/^[1-9][0-9]{12,15}$/.test(result.expires_at_ms)
        || Number(result.expires_at_ms) <= Date.now()) {
        throw new Error('admission_denied');
    }
    return { leaseId: job.leaseId, expiresAtMs: Number(result.expires_at_ms) };
}

async function updateAdmission(
    env: Env,
    job: JobRecord,
    state: AdmissionJobState | 'UPLOAD_EXPIRED' | 'PROVIDER_FAILED'
        | 'ONCHAIN_PUBLISHED' | 'AUTO_CLOSED' | 'CANCELLED'
        | 'PROVIDER_UNAVAILABLE',
): Promise<void> {
    if (!env.LIVEPEER_CONTROL) throw new Error('runtime_not_configured');
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
        admissionObjectName(job.network, job.contractId),
    ));
    const response = await object.fetch(new Request('https://object/internal/admission/mark', {
        method: 'POST',
        body: JSON.stringify({ jobId: job.jobId, generation: job.generation, state }),
    }));
    if (!response.ok) throw new Error('admission_closed');
}

async function tryAutoCloseAdmission(env: Env, job: JobRecord): Promise<void> {
    try {
        await updateAdmission(env, job, 'AUTO_CLOSED');
    } catch {
        // Reconciliation must retain its own alarm even if admission storage is unavailable.
    }
}

async function preflightAdmission(
    state: DurableObjectState,
    env: Env,
    input: JsonObject,
): Promise<Response> {
    const candidate = parseAdmissionCandidate(input, 'invalid_upload_preflight');
    const jobReservationUsdMicros = operationReservation(env);
    const monthlyBudgetUsdMicros = monthlyBudget(env);
    if (!creatorAllowed(env, candidate.creator)
        || !jobReservationUsdMicros
        || !monthlyBudgetUsdMicros) {
        throw new Error('admission_closed');
    }
    const now = Date.now();
    const record = await state.storage.get<AdmissionRecord>(ADMISSION_KEY);
    try {
        if (planAdmission(
            record,
            candidate,
            now,
            jobReservationUsdMicros,
            monthlyBudgetUsdMicros,
        ).budgetExceeded) throw new Error('admission_closed');
    } catch (error) {
        const utcDay = new Date(now).toISOString().slice(0, 10);
        console.warn(formatLog('livepeer_upload_preflight_rejected', {
            code: safeErrorCode(error),
            admissionStatus: record?.status || 'OPEN',
            activeReservations: Object.keys(record?.reservations || {}).length,
            dailyGlobalAttempts: record?.daily.utcDay === utcDay ? record.daily.globalAttempts : 0,
        }));
        throw error;
    }
    return json({ available: true });
}

async function reserveAdmission(
    state: DurableObjectState,
    env: Env,
    input: JsonObject,
): Promise<Response> {
    const candidate = parseAdmissionCandidate(input, 'invalid_outbox');
    if (!creatorAllowed(env, candidate.creator)) throw new Error('admission_closed');
    const jobReservationUsdMicros = operationReservation(env);
    const monthlyBudgetUsdMicros = monthlyBudget(env);
    if (!jobReservationUsdMicros || !monthlyBudgetUsdMicros) throw new Error('admission_closed');
    const now = Date.now();
    const result = await state.storage.transaction(async (transaction) => {
        const stored = await transaction.get<AdmissionRecord>(ADMISSION_KEY);
        await assertDurableObjectRecordCapacity(transaction, [ADMISSION_KEY], 'admission');
        const plan = planAdmission(
            stored,
            candidate,
            now,
            jobReservationUsdMicros,
            monthlyBudgetUsdMicros,
        );
        if (plan.budgetExceeded) {
            await transaction.put(ADMISSION_KEY, plan.record);
            return { record: plan.record, created: false, budgetExceeded: true };
        }
        if (!plan.created) {
            await transaction.put(ADMISSION_KEY, plan.record);
            return { record: plan.record, created: false, budgetExceeded: false };
        }
        const reservedBudgetUsdMicros = BigInt(plan.monthly.reservedBudgetUsdMicros)
            + jobReservationUsdMicros;
        const next: AdmissionRecord = {
            ...plan.record,
            reservations: {
                ...plan.record.reservations,
                [plan.reservationKey]: {
                    creator: candidate.creator,
                    expectedSourceBytes: candidate.expectedSourceBytes,
                    estimatedProviderCostUsdMicros: String(jobReservationUsdMicros),
                    state: 'CREATE_PENDING',
                    createdAtMs: now,
                    leaseId: crypto.randomUUID(),
                    expiresAtMs: now + ADMISSION_LEASE_TTL_MS,
                    lastHeartbeatAtMs: now,
                },
            },
            daily: {
                ...plan.daily,
                globalAttempts: plan.daily.globalAttempts + 1,
                creatorAttempts: {
                    ...plan.daily.creatorAttempts,
                    [candidate.creator]: (plan.daily.creatorAttempts[candidate.creator] || 0) + 1,
                },
            },
            monthly: {
                utcMonth: plan.monthly.utcMonth,
                reservedBudgetUsdMicros: String(reservedBudgetUsdMicros),
            },
        };
        await transaction.put(ADMISSION_KEY, next);
        return { record: next, created: true, budgetExceeded: false };
    });
    if (result.budgetExceeded) throw new Error('admission_closed');
    const lease = result.record.reservations[`${candidate.jobId}:${candidate.generation}`];
    if (!lease?.leaseId || !lease.expiresAtMs) throw new Error('admission_closed');
    await maintainAdmissionLifecycle(state);
    return json({
        accepted: true,
        created: result.created,
        lease_id: lease.leaseId,
        expires_at_ms: String(lease.expiresAtMs),
        heartbeat_interval_ms: ADMISSION_LEASE_HEARTBEAT_MS,
    });
}

function parseAdmissionCandidate(input: JsonObject, code: string): AdmissionCandidate {
    requireExactKeys(input, ['jobId', 'generation', 'creator', 'expectedSourceBytes'], code);
    if (typeof input.jobId !== 'string'
        || !JOB_ID_PATTERN.test(input.jobId)
        || !Number.isSafeInteger(input.generation)
        || (input.generation as number) < 1
        || typeof input.creator !== 'string'
        || !ACCOUNT_ID_PATTERN.test(input.creator)
        || typeof input.expectedSourceBytes !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(input.expectedSourceBytes)) {
        throw new Error(code);
    }
    return {
        jobId: input.jobId,
        generation: input.generation as number,
        creator: input.creator,
        expectedSourceBytes: input.expectedSourceBytes,
    };
}

function planAdmission(
    stored: AdmissionRecord | undefined,
    candidate: AdmissionCandidate,
    now: number,
    jobReservationUsdMicros: bigint,
    monthlyBudgetUsdMicros: bigint,
): {
    record: AdmissionRecord;
    reservationKey: string;
    created: boolean;
    budgetExceeded: boolean;
    daily: AdmissionRecord['daily'];
    monthly: AdmissionRecord['monthly'];
} {
    const utcDay = new Date(now).toISOString().slice(0, 10);
    const utcMonth = utcDay.slice(0, 7);
    let record = stored
        ? normalizeAdmissionLeases(stored, now)
        : emptyAdmissionRecord(utcDay, utcMonth);
    const reservationKey = `${candidate.jobId}:${candidate.generation}`;
    const existing = record.reservations[reservationKey];
    if (existing) {
        if (existing.creator !== candidate.creator
            || existing.expectedSourceBytes !== candidate.expectedSourceBytes) {
            throw new Error('admission_denied');
        }
        return {
            record,
            reservationKey,
            created: false,
            budgetExceeded: false,
            daily: record.daily,
            monthly: record.monthly,
        };
    }
    if (record.status === 'AUTO_CLOSED') {
        if (record.closure?.code !== 'monthly_budget_exceeded') {
            throw new Error('admission_closed');
        }
        if (record.monthly.utcMonth === utcMonth) {
            return {
                record,
                reservationKey,
                created: false,
                budgetExceeded: true,
                daily: record.daily,
                monthly: record.monthly,
            };
        }
        record = {
            schema: record.schema,
            status: 'OPEN',
            reservations: record.reservations,
            daily: record.daily,
            monthly: record.monthly,
        };
    }
    const daily = record.daily.utcDay === utcDay
        ? record.daily
        : { utcDay, globalAttempts: 0, creatorAttempts: {} };
    const monthly = record.monthly.utcMonth === utcMonth
        ? record.monthly
        : { utcMonth, reservedBudgetUsdMicros: '0' };
    const active = Object.values(record.reservations);
    if (active.length >= ADMISSION_GLOBAL_CONCURRENCY
        || active.some((reservation) => reservation.creator === candidate.creator)
        || (daily.creatorAttempts[candidate.creator] || 0) >= ADMISSION_CREATOR_DAILY_ATTEMPTS) {
        throw new Error('admission_denied');
    }
    if (BigInt(monthly.reservedBudgetUsdMicros) + jobReservationUsdMicros > monthlyBudgetUsdMicros) {
        return {
            record: {
                ...record,
                status: 'AUTO_CLOSED',
                daily,
                monthly,
                closure: { code: 'monthly_budget_exceeded', observedAtMs: now },
            },
            reservationKey,
            created: false,
            budgetExceeded: true,
            daily,
            monthly,
        };
    }
    return { record, reservationKey, created: true, budgetExceeded: false, daily, monthly };
}

function normalizeAdmissionLeases(record: AdmissionRecord, now: number): AdmissionRecord {
    const reservations: Record<string, AdmissionReservation> = {};
    for (const [key, reservation] of Object.entries(record.reservations)) {
        const normalized = {
            ...reservation,
            leaseId: reservation.leaseId && LEASE_ID_PATTERN.test(reservation.leaseId)
                ? reservation.leaseId
                : crypto.randomUUID(),
            expiresAtMs: Number.isSafeInteger(reservation.expiresAtMs)
                ? reservation.expiresAtMs
                : reservation.createdAtMs + ADMISSION_LEASE_TTL_MS,
            lastHeartbeatAtMs: Number.isSafeInteger(reservation.lastHeartbeatAtMs)
                ? reservation.lastHeartbeatAtMs
                : reservation.createdAtMs,
        };
        if (now < leaseDeadline(normalized)) reservations[key] = normalized;
    }
    return { ...record, reservations };
}

function leaseDeadline(reservation: AdmissionReservation): number {
    return reservation.state === 'CREATE_AMBIGUOUS'
        ? (reservation.ambiguousAtMs || reservation.createdAtMs) + ADMISSION_AMBIGUOUS_TIMEOUT_MS
        : reservation.expiresAtMs || reservation.createdAtMs + ADMISSION_LEASE_TTL_MS;
}

async function markAdmission(state: DurableObjectState, input: JsonObject): Promise<Response> {
    requireExactKeys(input, ['jobId', 'generation', 'state'], 'invalid_outbox');
    if (typeof input.jobId !== 'string'
        || !JOB_ID_PATTERN.test(input.jobId)
        || !Number.isSafeInteger(input.generation)
        || (input.generation as number) < 1
        || !['CREATE_AMBIGUOUS', 'UPLOAD_READY', 'READY_VERIFIED', 'FINALIZE_QUEUED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'ONCHAIN_PUBLISHED', 'AUTO_CLOSED', 'CANCELLED', 'PROVIDER_UNAVAILABLE'].includes(String(input.state))) {
        throw new Error('invalid_outbox');
    }
    const reservationKey = `${input.jobId}:${input.generation}`;
    await state.storage.transaction(async (transaction) => {
        const record = await transaction.get<AdmissionRecord>(ADMISSION_KEY);
        if (!record) throw new Error('admission_closed');
        if (input.state === 'AUTO_CLOSED') {
            if (record.status === 'AUTO_CLOSED') return;
            await transaction.put(ADMISSION_KEY, {
                ...record,
                status: 'AUTO_CLOSED',
                closure: { code: 'provider_budget_or_inventory', observedAtMs: Date.now() },
            } satisfies AdmissionRecord);
            return;
        }
        const reservation = record.reservations[reservationKey];
        if (!reservation && ['UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'ONCHAIN_PUBLISHED', 'CANCELLED'].includes(String(input.state))) return;
        if (!reservation) throw new Error('admission_denied');
        const reservations = { ...record.reservations };
        if (input.state === 'PROVIDER_UNAVAILABLE') {
            if (reservation.state === 'CREATE_AMBIGUOUS') return;
            const now = Date.now();
            const previous = record.providerFailures;
            const consecutive = previous
                && now - previous.lastObservedAtMs
                    <= ADMISSION_PROVIDER_FAILURE_WINDOW_MS;
            const providerFailures = consecutive
                ? {
                    count: previous.count + 1,
                    firstObservedAtMs: previous.firstObservedAtMs,
                    lastObservedAtMs: now,
                }
                : { count: 1, firstObservedAtMs: now, lastObservedAtMs: now };
            const tripped = providerFailures.count >= ADMISSION_PROVIDER_FAILURE_LIMIT;
            reservations[reservationKey] = {
                ...reservation,
                state: 'CREATE_AMBIGUOUS',
                ambiguousAtMs: reservation.ambiguousAtMs || now,
            };
            await transaction.put(ADMISSION_KEY, {
                ...record,
                status: tripped ? 'AUTO_CLOSED' : record.status,
                reservations,
                providerFailures,
                closure: tripped
                    ? { code: 'provider_unavailable', observedAtMs: now }
                    : record.closure,
            } satisfies AdmissionRecord);
            return;
        }
        if (['UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'ONCHAIN_PUBLISHED', 'CANCELLED'].includes(String(input.state))) {
            delete reservations[reservationKey];
        } else {
            const ambiguousAtMs = input.state === 'CREATE_AMBIGUOUS'
                ? reservation.ambiguousAtMs || Date.now()
                : undefined;
            const heartbeatAtMs = Date.now();
            reservations[reservationKey] = {
                ...reservation,
                state: input.state as AdmissionJobState,
                ambiguousAtMs,
                expiresAtMs: input.state === 'CREATE_AMBIGUOUS'
                    ? reservation.expiresAtMs
                    : heartbeatAtMs + ADMISSION_LEASE_TTL_MS,
                lastHeartbeatAtMs: input.state === 'CREATE_AMBIGUOUS'
                    ? reservation.lastHeartbeatAtMs
                    : heartbeatAtMs,
            };
        }
        const next = { ...record, reservations };
        if (input.state === 'UPLOAD_READY') delete next.providerFailures;
        await transaction.put(ADMISSION_KEY, next);
    });
    await maintainAdmissionLifecycle(state);
    return json({ accepted: true });
}

async function heartbeatAdmission(state: DurableObjectState, input: JsonObject): Promise<Response> {
    requireExactKeys(input, ['jobId', 'generation', 'leaseId'], 'invalid_outbox');
    if (typeof input.jobId !== 'string'
        || !JOB_ID_PATTERN.test(input.jobId)
        || !Number.isSafeInteger(input.generation)
        || (input.generation as number) < 1
        || typeof input.leaseId !== 'string'
        || !LEASE_ID_PATTERN.test(input.leaseId)) {
        throw new Error('invalid_outbox');
    }
    const now = Date.now();
    const reservationKey = `${input.jobId}:${input.generation}`;
    const result = await state.storage.transaction(async (transaction) => {
        const stored = await transaction.get<AdmissionRecord>(ADMISSION_KEY);
        if (!stored) return null;
        const record = normalizeAdmissionLeases(stored, now);
        const reservation = record.reservations[reservationKey];
        if (!reservation
            || reservation.state === 'CREATE_AMBIGUOUS'
            || reservation.leaseId !== input.leaseId) {
            await transaction.put(ADMISSION_KEY, record);
            return null;
        }
        const renewed = {
            ...reservation,
            state: 'UPLOADING' as const,
            expiresAtMs: now + ADMISSION_LEASE_TTL_MS,
            lastHeartbeatAtMs: now,
        };
        await transaction.put(ADMISSION_KEY, {
            ...record,
            reservations: { ...record.reservations, [reservationKey]: renewed },
        } satisfies AdmissionRecord);
        return renewed;
    });
    if (!result?.leaseId || !result.expiresAtMs) throw new Error('admission_denied');
    await maintainAdmissionLifecycle(state);
    return json({
        accepted: true,
        lease_id: result.leaseId,
        expires_at_ms: String(result.expiresAtMs),
        heartbeat_interval_ms: ADMISSION_LEASE_HEARTBEAT_MS,
    });
}

async function maintainAdmissionLifecycle(state: DurableObjectState): Promise<void> {
    const now = Date.now();
    const record = await state.storage.get<AdmissionRecord>(ADMISSION_KEY);
    const activeRecord = record ? normalizeAdmissionLeases(record, now) : null;
    if (activeRecord) await state.storage.put(ADMISSION_KEY, activeRecord);
    const activeLeases = activeRecord
        ? Object.values(activeRecord.reservations).map((reservation) => ({
            deadline: leaseDeadline(reservation),
        }))
        : [];

    const audits = await state.storage.list<AdmissionReopenRecord>({
        prefix: ADMISSION_REOPEN_KEY_PREFIX,
        limit: LIFECYCLE_DELETE_BATCH,
    });
    const auditCutoff = now - ADMISSION_AUDIT_RETENTION_MS;
    const expiredAuditKeys = [...audits]
        .filter(([, audit]) => !Number.isSafeInteger(audit.reopenedAtMs)
            || audit.reopenedAtMs <= auditCutoff)
        .map(([key]) => key);
    if (expiredAuditKeys.length > 0) await state.storage.delete(expiredAuditKeys);

    const nextDeadlines = [
        ...activeLeases.map(({ deadline }) => deadline),
        ...[...audits]
            .filter(([key, audit]) => !expiredAuditKeys.includes(key)
                && Number.isSafeInteger(audit.reopenedAtMs))
            .map(([, audit]) => audit.reopenedAtMs + ADMISSION_AUDIT_RETENTION_MS),
    ];
    if (nextDeadlines.length > 0) await state.storage.setAlarm(Math.min(...nextDeadlines));
}

async function reopenAdmission(state: DurableObjectState, input: JsonObject): Promise<Response> {
    const reopen = parseAdmissionReopenInput(input);
    const auditKey = `${ADMISSION_REOPEN_KEY_PREFIX}${reopen.idempotencyKey}`;
    const result = await state.storage.transaction(async (transaction) => {
        const existing = await transaction.get<AdmissionReopenRecord>(auditKey);
        if (existing) {
            if (!sameAdmissionReopen(existing, reopen)) throw new Error('admission_reopen_conflict');
            return { replayed: true };
        }
        const record = await transaction.get<AdmissionRecord>(ADMISSION_KEY);
        if (!record
            || record.status !== 'AUTO_CLOSED'
            || record.closure?.code !== reopen.closureCode
            || record.closure.observedAtMs !== reopen.closureObservedAtMs) {
            throw new Error('admission_reopen_denied');
        }
        await assertDurableObjectRecordCapacity(transaction, [auditKey], 'admission');
        const reservations = { ...record.reservations };
        if (reopen.jobId !== null && reopen.generation !== null) {
            const reservationKey = `${reopen.jobId}:${reopen.generation}`;
            if (reservations[reservationKey]?.state !== 'CREATE_AMBIGUOUS') {
                throw new Error('admission_reopen_denied');
            }
            delete reservations[reservationKey];
        }
        if (record.closure.code === 'provider_unavailable'
            && reopen.resolutionCode === 'INVENTORY_RECONCILED') {
            for (const [key, reservation] of Object.entries(reservations)) {
                if (reservation.state === 'CREATE_AMBIGUOUS') delete reservations[key];
            }
        }
        if (reopen.resolutionCode === 'BUDGET_WINDOW_ROLLED'
            && record.monthly.utcMonth === new Date().toISOString().slice(0, 7)) {
            throw new Error('admission_reopen_denied');
        }
        await transaction.put(ADMISSION_KEY, {
            schema: record.schema,
            status: 'OPEN',
            reservations,
            daily: record.daily,
            monthly: record.monthly,
        } satisfies AdmissionRecord);
        await transaction.put(auditKey, {
            schema: 'youtick.livepeer-admission-reopen.v1',
            ...reopen,
            reopenedAtMs: Date.now(),
        } satisfies AdmissionReopenRecord);
        return { replayed: false };
    });
    await maintainAdmissionLifecycle(state);
    return json({ accepted: true, reopened: true, replayed: result.replayed }, result.replayed ? 200 : 201);
}

async function readAdmissionStatus(state: DurableObjectState, env: Env): Promise<Response> {
    const record = await state.storage.get<AdmissionRecord>(ADMISSION_KEY);
    const jobReservationUsdMicros = operationReservation(env);
    const monthlyBudgetUsdMicros = monthlyBudget(env);
    return json({
        schema: 'youtick.livepeer-admission-status.v1',
        status: record?.status || 'UNINITIALIZED',
        limits: {
            globalConcurrency: ADMISSION_GLOBAL_CONCURRENCY,
            creatorConcurrency: 1,
            creatorDailyAttempts: ADMISSION_CREATOR_DAILY_ATTEMPTS,
            ambiguousTimeoutMs: ADMISSION_AMBIGUOUS_TIMEOUT_MS,
            leaseTtlMs: ADMISSION_LEASE_TTL_MS,
            leaseHeartbeatMs: ADMISSION_LEASE_HEARTBEAT_MS,
            providerFailureLimit: ADMISSION_PROVIDER_FAILURE_LIMIT,
            providerFailureWindowMs: ADMISSION_PROVIDER_FAILURE_WINDOW_MS,
        },
        closure: record?.closure || null,
        providerFailures: record?.providerFailures || null,
        reservations: record?.reservations || {},
        daily: record?.daily || null,
        monthly: {
            current: record?.monthly || null,
            configuredBudgetUsdMicros: monthlyBudgetUsdMicros === null
                ? null
                : String(monthlyBudgetUsdMicros),
            configuredJobReservationUsdMicros: String(jobReservationUsdMicros || ''),
        },
    });
}

function parseAdmissionReopenInput(input: JsonObject): AdmissionReopenInput {
    requireExactKeys(input, [
        'idempotencyKey',
        'operatorId',
        'closureCode',
        'closureObservedAtMs',
        'incidentId',
        'evidenceSha256',
        'resolutionCode',
        'jobId',
        'generation',
    ], 'invalid_admission_reopen');
    const resolutionCode = input.resolutionCode as AdmissionResolutionCode;
    const hasJob = typeof input.jobId === 'string' && Number.isSafeInteger(input.generation);
    const hasNoJob = input.jobId === null && input.generation === null;
    const jobResolution = resolutionCode === 'PROVIDER_ABSENCE_CONFIRMED'
        || resolutionCode === 'TUS_TERMINATION_CONFIRMED';
    const generalResolution = resolutionCode === 'INVENTORY_RECONCILED'
        || resolutionCode === 'BUDGET_WINDOW_ROLLED';
    if (typeof input.idempotencyKey !== 'string'
        || !IDEMPOTENCY_PATTERN.test(input.idempotencyKey)
        || typeof input.operatorId !== 'string'
        || !IDENTIFIER_PATTERN.test(input.operatorId)
        || typeof input.closureCode !== 'string'
        || !ADMISSION_CLOSURE_CODES.has(input.closureCode)
        || !Number.isSafeInteger(input.closureObservedAtMs)
        || (input.closureObservedAtMs as number) < 1
        || typeof input.incidentId !== 'string'
        || !IDENTIFIER_PATTERN.test(input.incidentId)
        || typeof input.evidenceSha256 !== 'string'
        || !SHA256_PATTERN.test(input.evidenceSha256)
        || (!jobResolution && !generalResolution)
        || (jobResolution && !hasJob)
        || (generalResolution && !hasNoJob)
        || (hasJob && (!JOB_ID_PATTERN.test(input.jobId as string)
            || (input.generation as number) < 1))) {
        throw new Error('invalid_admission_reopen');
    }
    if ((input.closureCode === 'monthly_budget_exceeded'
        && resolutionCode !== 'BUDGET_WINDOW_ROLLED')
        || (input.closureCode === 'create_ambiguous_timeout' && !jobResolution)
        || (input.closureCode === 'provider_budget_or_inventory'
            && resolutionCode === 'BUDGET_WINDOW_ROLLED')
        || (input.closureCode === 'provider_unavailable'
            && resolutionCode !== 'INVENTORY_RECONCILED')) {
        throw new Error('invalid_admission_reopen');
    }
    return input as unknown as AdmissionReopenInput;
}

function sameAdmissionReopen(left: AdmissionReopenRecord, right: AdmissionReopenInput): boolean {
    return left.idempotencyKey === right.idempotencyKey
        && left.operatorId === right.operatorId
        && left.closureCode === right.closureCode
        && left.closureObservedAtMs === right.closureObservedAtMs
        && left.incidentId === right.incidentId
        && left.evidenceSha256 === right.evidenceSha256
        && left.resolutionCode === right.resolutionCode
        && left.jobId === right.jobId
        && left.generation === right.generation;
}

function emptyAdmissionRecord(utcDay: string, utcMonth: string): AdmissionRecord {
    return {
        schema: 'youtick.livepeer-admission.v2',
        status: 'OPEN',
        reservations: {},
        daily: { utcDay, globalAttempts: 0, creatorAttempts: {} },
        monthly: { utcMonth, reservedBudgetUsdMicros: '0' },
    };
}

function creatorAllowlist(env: Env): Set<string> {
    const values = (env.LIVEPEER_CREATOR_ALLOWLIST || '').split(',').map((value) => value.trim()).filter(Boolean);
    return values.length > 0
        && (values.every((value) => ACCOUNT_ID_PATTERN.test(value))
            || (values.length === 1 && values[0] === '*'))
        ? new Set(values)
        : new Set();
}

function creatorAllowed(env: Env, creator: string): boolean {
    const allowlist = creatorAllowlist(env);
    return allowlist.has('*') || allowlist.has(creator);
}

function isPublicBetaPacket(env: Env): boolean {
    const allowlist = creatorAllowlist(env);
    return env.NEAR_NETWORK === 'testnet'
        && env.LIVEPEER_BRIDGE_ENABLED === 'true'
        && env.LIVEPEER_NEW_UPLOADS_ENABLED === 'true'
        && env.LIVEPEER_PLAYBACK_ISSUANCE_ENABLED === 'true'
        && env.LIVEPEER_PLAYBACK_V2_ENABLED === 'true'
        && env.LIVEPEER_PROVIDER_MUTATIONS_ENABLED === 'true'
        && env.LIVEPEER_OPERATOR_MUTATIONS_ENABLED === 'true'
        && env.LIVEPEER_SPONSORED_UPLOADS_ENABLED === 'true'
        && env.LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED === 'true'
        && env.LIVEPEER_OPERATOR_JOB_ID === ''
        && env.LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS === '20000000'
        && env.LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS === '2000000'
        && (allowlist.has('*') || allowlist.size === 2);
}

function operatorJobAllowed(env: Env, jobId: string, creator?: string): boolean {
    return isPublicBetaPacket(env)
        ? creator === undefined || creatorAllowed(env, creator)
        : env.LIVEPEER_OPERATOR_JOB_ID === jobId
            && (creator === undefined || creatorAllowed(env, creator));
}

async function publicBetaRateLimitResponse(
    request: Request,
    env: Env,
    route: string,
): Promise<Response | null> {
    if (!env.PUBLIC_BETA_RATE_LIMITER) {
        return json({ error: 'runtime_not_configured' }, 503);
    }
    const ip = request.headers.get('CF-Connecting-IP')
        || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
        || 'unknown';
    try {
        if (!(await env.PUBLIC_BETA_RATE_LIMITER.limit({ key: `${route}:ip:${ip}` })).success) {
            const response = json({ error: 'rate_limited' }, 429);
            response.headers.set('Retry-After', '60');
            return response;
        }
    } catch {
        return json({ error: 'runtime_not_configured' }, 503);
    }
    return null;
}

async function enforcePublicBetaAccountRateLimit(
    env: Env,
    route: string,
    account: string,
): Promise<void> {
    if (!isPublicBetaPacket(env)) return;
    if (!env.PUBLIC_BETA_RATE_LIMITER) throw new Error('runtime_not_configured');
    let outcome: RateLimitOutcome;
    try {
        outcome = await env.PUBLIC_BETA_RATE_LIMITER.limit({ key: `${route}:account:${account}` });
    } catch {
        throw new Error('runtime_not_configured');
    }
    if (!outcome.success) throw new Error('rate_limited');
}

function operationReservation(env: Env): bigint | null {
    const job = env.LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS || '';
    return /^[1-9][0-9]{0,19}$/.test(job) ? BigInt(job) : null;
}

function monthlyBudget(env: Env): bigint | null {
    const budget = env.LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS || '';
    return /^[1-9][0-9]{0,19}$/.test(budget) ? BigInt(budget) : null;
}

async function ensureReconcileScheduled(state: DurableObjectState): Promise<void> {
    await state.storage.transaction(async (transaction) => {
        const existing = await transaction.get<ReconcileRecord>(RECONCILE_KEY);
        if (existing) return;
        const now = Date.now();
        await assertDurableObjectRecordCapacity(transaction, [RECONCILE_KEY], 'upload_job');
        await transaction.put(RECONCILE_KEY, {
            schema: 'youtick.livepeer-reconcile.v1',
            status: 'PROVIDER_UNKNOWN',
            consecutiveErrors: 0,
            nextReconcileAtMs: now,
        } satisfies ReconcileRecord);
    });
    await scheduleReconcile(state, Date.now());
}

async function scheduleReconcile(state: DurableObjectState, atMs: number): Promise<void> {
    await scheduleAlarmNoLaterThan(state, atMs);
}

async function scheduleAlarmNoLaterThan(state: DurableObjectState, atMs: number): Promise<void> {
    const setAlarm = state.storage.setAlarm;
    if (typeof setAlarm !== 'function') return;
    const getAlarm = state.storage.getAlarm;
    const existing = typeof getAlarm === 'function'
        ? await getAlarm.call(state.storage)
        : null;
    if (existing === null || existing > atMs) await setAlarm.call(state.storage, atMs);
}

async function reconcilePublishedJob(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<void> {
    await tryProcessSalesSuspension(state, env, job);
    try {
        const verified = await verifyReadyProviderAsset(env, job);
        if (canonicalJson(verified) !== canonicalJson(job.publication)) {
            await persistDriftReconcile(state, env, job, 'provider_publication_mismatch');
            return;
        }
    } catch (error) {
        const code = safeErrorCode(error);
        if (!STRONG_PROVIDER_DRIFT_CODES.has(code)) {
            await persistUnknownReconcile(state, 'PROVIDER_UNKNOWN');
            return;
        }
        await persistDriftReconcile(state, env, job, code);
        return;
    }

    try {
        const publication = await readFinalPublication(env, job.publication!);
        if (!publication
            || !publicationMatches(job.publication!, publication)
            || !['ACTIVE', 'SALES_SUSPENDED'].includes(String(publication.availability))) {
            await persistDriftReconcile(state, env, job, 'near_publication_mismatch');
            return;
        }
    } catch (error) {
        if (safeErrorCode(error) === 'near_finalize_pending') {
            await persistUnknownReconcile(state, 'NEAR_UNKNOWN');
            return;
        }
        await persistDriftReconcile(state, env, job, 'near_publication_mismatch');
        return;
    }

    await persistHealthyReconcile(state);
}

async function persistUnknownReconcile(
    state: DurableObjectState,
    status: 'PROVIDER_UNKNOWN' | 'NEAR_UNKNOWN',
): Promise<void> {
    const previous = await state.storage.get<ReconcileRecord>(RECONCILE_KEY);
    const consecutiveErrors = (previous?.consecutiveErrors || 0) + 1;
    const delay = RECONCILE_BACKOFF_MS[Math.min(consecutiveErrors - 1, RECONCILE_BACKOFF_MS.length - 1)];
    const nextReconcileAtMs = Date.now() + delay;
    await state.storage.put(RECONCILE_KEY, {
        schema: 'youtick.livepeer-reconcile.v1',
        status,
        consecutiveErrors,
        nextReconcileAtMs,
        lastGoodAtMs: previous?.lastGoodAtMs,
        lastDrift: previous?.lastDrift,
        salesSuspensionQueuedAtMs: previous?.salesSuspensionQueuedAtMs,
    } satisfies ReconcileRecord);
    await scheduleReconcile(state, nextReconcileAtMs);
}

async function persistDriftReconcile(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
    code: string,
): Promise<void> {
    const now = Date.now();
    const previous = await state.storage.get<ReconcileRecord>(RECONCILE_KEY);
    const repeated = previous?.status === 'DRIFT_BLOCKED' && previous.lastDrift?.code === code;
    const lastDrift = repeated ? {
        ...previous.lastDrift!,
        lastObservedAtMs: now,
        observations: previous.lastDrift!.observations + 1,
    } : {
        code,
        firstObservedAtMs: now,
        lastObservedAtMs: now,
        observations: 1,
    };
    const confirmed = lastDrift.observations >= 2
        && now - lastDrift.firstObservedAtMs >= RECONCILE_CONFIRMATION_MS;
    const consecutiveErrors = (previous?.consecutiveErrors || 0) + 1;
    const delay = RECONCILE_BACKOFF_MS[Math.min(consecutiveErrors - 1, RECONCILE_BACKOFF_MS.length - 1)];
    const nextReconcileAtMs = now + delay;
    let salesSuspensionQueuedAtMs = previous?.salesSuspensionQueuedAtMs;
    if (PROVIDER_INVENTORY_DRIFT_CODES.has(code)) {
        await tryAutoCloseAdmission(env, job);
    }
    if (confirmed
        && !salesSuspensionQueuedAtMs
        && operatorJobAllowed(env, job.jobId, job.creator)
        && job.generation === 1
    ) {
        await enqueueSalesSuspension(state, job, code);
        salesSuspensionQueuedAtMs = now;
    }
    if (confirmed) await tryProcessSalesSuspension(state, env, job);
    await state.storage.put(RECONCILE_KEY, {
        schema: 'youtick.livepeer-reconcile.v1',
        status: 'DRIFT_BLOCKED',
        consecutiveErrors,
        nextReconcileAtMs,
        lastGoodAtMs: previous?.lastGoodAtMs,
        lastDrift,
        salesSuspensionQueuedAtMs,
    } satisfies ReconcileRecord);
    await scheduleReconcile(state, nextReconcileAtMs);
}

async function persistHealthyReconcile(state: DurableObjectState): Promise<void> {
    const now = Date.now();
    const previous = await state.storage.get<ReconcileRecord>(RECONCILE_KEY);
    const recovering = (previous?.lastDrift !== undefined && previous.status !== 'HEALTHY')
        || previous?.recovery !== undefined;
    if (recovering) {
        const recovery = previous?.recovery || { firstObservedAtMs: now, observations: 0 };
        const nextRecovery = { ...recovery, observations: recovery.observations + 1 };
        if (nextRecovery.observations < 2
            || now - nextRecovery.firstObservedAtMs < RECONCILE_CONFIRMATION_MS) {
            const nextReconcileAtMs = now + RECONCILE_CONFIRMATION_MS;
            await state.storage.put(RECONCILE_KEY, {
                schema: 'youtick.livepeer-reconcile.v1',
                status: 'DRIFT_BLOCKED',
                consecutiveErrors: 0,
                nextReconcileAtMs,
                lastGoodAtMs: previous?.lastGoodAtMs,
                lastDrift: previous?.lastDrift,
                recovery: nextRecovery,
                salesSuspensionQueuedAtMs: previous?.salesSuspensionQueuedAtMs,
            } satisfies ReconcileRecord);
            await scheduleReconcile(state, nextReconcileAtMs);
            return;
        }
    }
    const nextReconcileAtMs = now + RECONCILE_HEALTHY_INTERVAL_MS;
    await state.storage.put(RECONCILE_KEY, {
        schema: 'youtick.livepeer-reconcile.v1',
        status: 'HEALTHY',
        consecutiveErrors: 0,
        nextReconcileAtMs,
        lastGoodAtMs: now,
        lastDrift: previous?.lastDrift,
        salesSuspensionQueuedAtMs: previous?.salesSuspensionQueuedAtMs,
    } satisfies ReconcileRecord);
    await scheduleReconcile(state, nextReconcileAtMs);
}

async function enqueueSalesSuspension(
    state: DurableObjectState,
    job: JobRecord,
    driftCode: string,
): Promise<void> {
    const idempotencyKey = `${job.jobId}:suspend-sales`;
    const key = `outbox:${idempotencyKey}`;
    const payloadSha256 = await sha256Hex(canonicalJson({
        method: 'suspend_livepeer_sales',
        publication_id: job.jobId,
        drift_code: driftCode,
    }));
    await state.storage.transaction(async (transaction) => {
        const existing = await transaction.get<OutboxRecord>(key);
        if (existing) return;
        await assertDurableObjectRecordCapacity(
            transaction,
            [key, RECONCILE_KEY],
            'upload_job',
        );
        await transaction.put(key, {
            schema: 'youtick.livepeer-control-outbox.v1',
            state: 'PENDING',
            idempotencyKey,
            method: 'suspend_livepeer_sales',
            jobId: job.jobId,
            generation: job.generation,
            payloadSha256,
            createdAtMs: Date.now(),
        } satisfies OutboxRecord);
    });
}

async function tryProcessSalesSuspension(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<void> {
    if (!operatorJobAllowed(env, job.jobId, job.creator) || job.generation !== 1) return;
    const key = `outbox:${job.jobId}:suspend-sales`;
    const record = await state.storage.get<OutboxRecord>(key);
    if (!record || record.state === 'CONFIRMED') return;
    try {
        const response = await forwardSalesSuspension(env, job.jobId);
        if (!response.ok) return;
        const result = await response.json() as { suspended?: unknown };
        if (result.suspended === true) {
            await state.storage.put(key, { ...record, state: 'CONFIRMED' });
        }
    } catch {
        // The durable alarm retry owns the next attempt; no provider or NEAR details are persisted.
    }
}

export async function forwardUploadIntent(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!env.LIVEPEER_CONTROL) throw new Error('runtime_not_configured');
        const forwardingRequest = request.clone();
        const input = await parseUploadIntentRequest(request, env);
        await enforcePublicBetaAccountRateLimit(
            env,
            '/v1/upload-intents',
            input.envelope.account_id,
        );
        const objectName = jobObjectName(
            input.envelope.network,
            input.envelope.contract_id,
            input.body.job_id,
            input.body.generation,
        );
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(objectName));
        return withCors(await object.fetch(forwardingRequest), corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_bridge_route_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
}

export async function forwardUploadHeartbeat(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!env.LIVEPEER_CONTROL) throw new Error('runtime_not_configured');
        const forwardingRequest = request.clone();
        const input = await parseUploadHeartbeatRequest(request, env);
        await enforcePublicBetaAccountRateLimit(
            env,
            '/v1/upload-heartbeats',
            input.envelope.account_id,
        );
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(jobObjectName(
            input.envelope.network,
            input.envelope.contract_id,
            input.body.job_id,
            input.body.generation,
        )));
        return withCors(await object.fetch(forwardingRequest), corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_upload_heartbeat_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
}

export async function forwardUploadPreflight(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!allowedOrigins(env).has(origin)) throw new Error('origin_denied');
        if (env.LIVEPEER_NEW_UPLOADS_ENABLED !== 'true') throw new Error('admission_closed');
        if (!env.LIVEPEER_CONTROL || !validAdmissionConfig(env)) {
            throw new Error('runtime_not_configured');
        }
        const input = parseUploadPreflightRequest(await readJsonObject(request));
        await enforcePublicBetaAccountRateLimit(
            env,
            '/v1/upload-preflight',
            input.creator_id,
        );
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(admissionObjectName(
            env.NEAR_NETWORK!,
            env.MARKET_CONTRACT_ID!,
        )));
        return withCors(await object.fetch(new Request('https://object/internal/admission/preflight', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jobId: input.job_id,
                generation: input.generation,
                creator: input.creator_id,
                expectedSourceBytes: input.expected_source_bytes,
            }),
        })), corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_upload_preflight_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
}

function parseUploadPreflightRequest(input: JsonObject): UploadPreflightRequest {
    requireExactKeys(
        input,
        ['creator_id', 'job_id', 'generation', 'expected_source_bytes'],
        'invalid_upload_preflight',
    );
    if (typeof input.creator_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(input.creator_id)
        || typeof input.job_id !== 'string'
        || !JOB_ID_PATTERN.test(input.job_id)
        || !Number.isSafeInteger(input.generation)
        || (input.generation as number) < 1
        || typeof input.expected_source_bytes !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(input.expected_source_bytes)
        || BigInt(input.expected_source_bytes) > MAX_SOURCE_BYTES) {
        throw new Error('invalid_upload_preflight');
    }
    return input as UploadPreflightRequest;
}

export async function forwardCreatorFeeQuote(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!allowedOrigins(env).has(origin)) throw new Error('origin_denied');
        if (!env.LIVEPEER_CONTROL || !validCreatorFeeQuoteConfig(env)) {
            throw new Error('runtime_not_configured');
        }
        const input = parseCreatorFeeQuoteRequest(await readJsonObject(request.clone()));
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
            `creator-fee-quote:${env.NEAR_NETWORK}:${env.MARKET_CONTRACT_ID}:${input.creator_id}`,
        ));
        return withCors(await object.fetch(new Request('https://object/internal/creator-fee-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        })), corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('creator_fee_quote_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
}

export async function forwardSponsoredUploadQuote(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!allowedOrigins(env).has(origin)) throw new Error('origin_denied');
        if (!env.LIVEPEER_CONTROL || !validSponsoredUploadQuoteConfig(env)) {
            throw new Error('runtime_not_configured');
        }
        const input = parseSponsoredUploadQuoteRequest(await readJsonObject(request.clone()));
        await enforcePublicBetaAccountRateLimit(
            env,
            '/v1/sponsored-upload-quotes',
            input.request.creator_id,
        );
        if (isPublicBetaPacket(env)) {
            const [state, alreadyAdmittedToday] = await Promise.all([
                readFinalPublicTestnetBetaState(env),
                hasFinalPublicTestnetBetaJobToday(env, input.request.creator_id),
            ]);
            const now = Date.now();
            if (!state
                || state.version !== 1
                || state.closed_at_ms !== null
                || Number(state.upload_closes_at_ms) <= now
                || Number(state.ends_at_ms) <= now
                || state.total_job_count >= 10
                || alreadyAdmittedToday
                || BigInt(input.request.upload_key_expires_at_ms) > BigInt(state.ends_at_ms)
                || BigInt(input.request.expected_source_bytes)
                    > PUBLIC_TESTNET_BETA_MAX_SOURCE_BYTES) {
                throw new Error('admission_closed');
            }
        }
        await preflightSponsoredUpload(env, input.request);
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
            `creator-fee-quote:${env.NEAR_NETWORK}:${env.MARKET_CONTRACT_ID}:${input.request.creator_id}`,
        ));
        return withCors(await object.fetch(new Request('https://object/internal/sponsored-upload-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        })), corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('sponsored_upload_quote_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
}

async function issueSponsoredUploadQuote(
    state: DurableObjectState,
    env: Env,
    request: Request,
): Promise<Response> {
    try {
        const input = parseSponsoredUploadQuoteRequest(await readJsonObject(request));
        await enforceCreatorFeeQuoteRateLimit(state);
        const block = await readFinalBlock(env);
        const now = block.timestampMs;
        const sourceBytes = BigInt(input.request.expected_source_bytes);
        const byteFeeUsdMicro = (sourceBytes * 3n + 9_999n) / 10_000n;
        const uploadFeeUsdc = byteFeeUsdMicro < MIN_CREATOR_UPLOAD_FEE_USD_MICROS
            ? MIN_CREATOR_UPLOAD_FEE_USD_MICROS
            : byteFeeUsdMicro;
        const totalFeeUsdc = uploadFeeUsdc + SPONSORED_UPLOAD_FEE_USDC;
        const quoteKeyVersion = Number(env.CREATOR_FEE_QUOTE_KEY_VERSION);
        const quoteWithoutId = {
            domain: 'youtick.sponsored-upload-quote' as const,
            version: '1' as const,
            network: env.NEAR_NETWORK as 'testnet' | 'mainnet',
            contract_id: env.MARKET_CONTRACT_ID!,
            creator_id: input.request.creator_id,
            job_id: input.request.job_id,
            request_sha256: await sha256Hex(paidJobRequestJson(input.request)),
            expected_source_bytes: input.request.expected_source_bytes,
            upload_fee_usdc: uploadFeeUsdc.toString(),
            sponsor_fee_usdc: SPONSORED_UPLOAD_FEE_USDC.toString(),
            total_fee_usdc: totalFeeUsdc.toString(),
            delegate_receiver_id: usdcContractId(env),
            delegate_method: 'ft_transfer_call' as const,
            delegate_gas: SPONSORED_UPLOAD_DELEGATE_GAS.toString(),
            delegate_deposit_yocto: '1' as const,
            issued_at_ms: String(now),
            quote_block_height: String(block.height),
            max_delegate_block_height: String(BigInt(block.height) + SPONSORED_UPLOAD_MAX_BLOCK_WINDOW),
            expires_at_ms: String(now + CREATOR_FEE_QUOTE_LIFETIME_MS),
            quote_key_version: quoteKeyVersion,
        };
        const canonicalMessage = canonicalSponsoredUploadQuoteMessage(quoteWithoutId);
        const quoteId = await sha256Hex(canonicalMessage);
        const privateKey = await importCreatorFeeQuotePrivateKey(env);
        const signature = new Uint8Array(await crypto.subtle.sign(
            'Ed25519',
            privateKey,
            new TextEncoder().encode(canonicalMessage),
        ));
        return json({
            request: input.request,
            quote: { ...quoteWithoutId, quote_id: quoteId },
            signature: bytesToBase64(signature),
            public_key_version: quoteKeyVersion,
        });
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('sponsored_upload_quote_issue_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

function parseSponsoredUploadQuoteRequest(value: JsonObject): { request: SponsoredPaidJobRequest } {
    requireExactKeys(value, ['request'], 'invalid_sponsored_upload_quote_request');
    return { request: parseSponsoredPaidJobRequest(requireObject(
        value.request,
        'invalid_sponsored_upload_quote_request',
    )) };
}

function parseSponsoredPaidJobRequest(
    value: JsonObject,
    requireFutureExpiry = true,
): SponsoredPaidJobRequest {
    requireExactKeys(value, [
        'creator_id',
        'job_id',
        'title',
        'price_usdc',
        'expected_source_bytes',
        'profile_id',
        'profile_config_sha256',
        'upload_public_key',
        'upload_key_expires_at_ms',
    ], 'invalid_sponsored_upload_quote_request');
    if (typeof value.creator_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(value.creator_id)
        || typeof value.job_id !== 'string'
        || !JOB_ID_PATTERN.test(value.job_id)
        || typeof value.title !== 'string'
        || value.title.trim().length < 1
        || new TextEncoder().encode(value.title).length > 200
        || typeof value.price_usdc !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(value.price_usdc)
        || BigInt(value.price_usdc) < 2_000_000n
        || typeof value.expected_source_bytes !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(value.expected_source_bytes)
        || BigInt(value.expected_source_bytes) > MAX_SOURCE_BYTES
        || value.profile_id !== 'paid-media-livepeer-v1'
        || typeof value.profile_config_sha256 !== 'string'
        || value.profile_config_sha256 !== PROFILE_CONFIG_SHA256
        || typeof value.upload_public_key !== 'string'
        || !SESSION_KEY_PATTERN.test(value.upload_public_key)
        || typeof value.upload_key_expires_at_ms !== 'string'
        || !/^[1-9][0-9]{12,15}$/.test(value.upload_key_expires_at_ms)
        || (requireFutureExpiry && BigInt(value.upload_key_expires_at_ms) <= BigInt(Date.now()))) {
        throw new Error('invalid_sponsored_upload_quote_request');
    }
    return {
        creator_id: value.creator_id,
        job_id: value.job_id,
        title: value.title,
        price_usdc: value.price_usdc,
        expected_source_bytes: value.expected_source_bytes,
        profile_id: value.profile_id,
        profile_config_sha256: value.profile_config_sha256,
        upload_public_key: value.upload_public_key,
        upload_key_expires_at_ms: value.upload_key_expires_at_ms,
    };
}

async function preflightSponsoredUpload(env: Env, request: SponsoredPaidJobRequest): Promise<void> {
    if (!env.LIVEPEER_CONTROL) throw new Error('runtime_not_configured');
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(admissionObjectName(
        env.NEAR_NETWORK!,
        env.MARKET_CONTRACT_ID!,
    )));
    const response = await object.fetch(new Request('https://object/internal/admission/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jobId: request.job_id,
            generation: 1,
            creator: request.creator_id,
            expectedSourceBytes: request.expected_source_bytes,
        }),
    }));
    if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: unknown };
        throw new Error(body.error === 'admission_denied' ? 'admission_denied' : 'admission_closed');
    }
}

export async function forwardSponsoredUploadRelay(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!allowedOrigins(env).has(origin)) throw new Error('origin_denied');
        const object = await sponsorRelayerControlObject(env);
        return withCors(await object.fetch(new Request('https://object/internal/sponsored-upload-relay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: await request.text(),
        })), corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('sponsored_upload_relay_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
}

async function sponsorRelayerControlObject(env: Env): Promise<DurableObjectStub> {
    if (!env.LIVEPEER_CONTROL || !validSponsoredUploadRelayConfig(env)) {
        throw new Error('runtime_not_configured');
    }
    const signer = KeyPairSigner.fromSecretKey(
        env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY as `ed25519:${string}`,
    );
    const publicKey = (await signer.getPublicKey()).toString();
    return env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName([
        'sponsor-relayer',
        env.NEAR_NETWORK,
        publicKey,
        env.NEAR_SPONSOR_RELAYER_KEY_EPOCH,
    ].join(':')));
}

async function parseSponsoredUploadRelayRequest(
    request: Request,
    env: Env,
): Promise<ParsedSponsoredDelegate> {
    const value = await readJsonObject(request);
    requireExactKeys(
        value,
        ['signed_delegate_base64'],
        SPONSORED_RELAY_REJECTION_CODES.delegate_decode,
    );
    if (typeof value.signed_delegate_base64 !== 'string'
        || value.signed_delegate_base64.length < 64
        || value.signed_delegate_base64.length > MAX_CONTROL_BODY_BYTES
        || value.signed_delegate_base64.length % 4 !== 0
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.signed_delegate_base64)) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.delegate_decode);
    }
    let encoded: Uint8Array;
    let signedDelegate: SignedDelegate;
    try {
        encoded = base64Decode(value.signed_delegate_base64);
        signedDelegate = deserialize(SCHEMA.SignedDelegate, encoded) as unknown as SignedDelegate;
        if (!constantTimeEqual(encodeSignedDelegate(signedDelegate), encoded)) {
            throw new Error('non_canonical');
        }
    } catch {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.delegate_decode);
    }
    const shapeCode = SPONSORED_RELAY_REJECTION_CODES.delegate_shape;
    const signed = requireObject(signedDelegate, shapeCode);
    requireExactKeys(signed, ['delegateAction', 'signature'], shapeCode);
    const delegate = requireObject(signed.delegateAction, shapeCode);
    requireExactKeys(delegate, [
        'senderId', 'receiverId', 'actions', 'nonce', 'maxBlockHeight', 'publicKey',
    ], shapeCode);
    if (typeof delegate.senderId !== 'string'
        || !ACCOUNT_ID_PATTERN.test(delegate.senderId)
        || delegate.receiverId !== usdcContractId(env)
        || !Array.isArray(delegate.actions)
        || delegate.actions.length !== 1
        || typeof delegate.nonce !== 'bigint'
        || delegate.nonce < 1n
        || typeof delegate.maxBlockHeight !== 'bigint'
        || delegate.maxBlockHeight < 1n) {
        throw new Error(shapeCode);
    }
    const publicKey = requireObject(delegate.publicKey, shapeCode);
    requireExactKeys(publicKey, ['ed25519Key'], shapeCode);
    const publicKeyValue = requireObject(publicKey.ed25519Key, shapeCode);
    requireExactKeys(publicKeyValue, ['data'], shapeCode);
    const publicKeyBytes = parseBorshBytes(publicKeyValue.data, 32);
    const signature = requireObject(signed.signature, shapeCode);
    requireExactKeys(signature, ['ed25519Signature'], shapeCode);
    const signatureValue = requireObject(signature.ed25519Signature, shapeCode);
    requireExactKeys(signatureValue, ['data'], shapeCode);
    const signatureBytes = parseBorshBytes(signatureValue.data, 64);
    const action = requireObject(delegate.actions[0], shapeCode);
    requireExactKeys(action, ['functionCall'], shapeCode);
    const functionCall = requireObject(action.functionCall, shapeCode);
    requireExactKeys(functionCall, [
        'methodName', 'args', 'gas', 'deposit',
    ], shapeCode);
    if (functionCall.methodName !== 'ft_transfer_call'
        || functionCall.gas !== SPONSORED_UPLOAD_DELEGATE_GAS
        || functionCall.deposit !== 1n) {
        throw new Error(shapeCode);
    }
    let ftArgs: JsonObject;
    try {
        ftArgs = requireObject(JSON.parse(new TextDecoder().decode(
            parseBorshBytes(functionCall.args),
        )), shapeCode);
    } catch {
        throw new Error(shapeCode);
    }
    requireExactKeys(ftArgs, [
        'receiver_id', 'amount', 'memo', 'msg',
    ], shapeCode);
    if (ftArgs.receiver_id !== env.MARKET_CONTRACT_ID
        || typeof ftArgs.amount !== 'string'
        || ftArgs.memo !== 'YouTick creator upload fee'
        || typeof ftArgs.msg !== 'string') {
        throw new Error(shapeCode);
    }
    let message: JsonObject;
    try {
        message = requireObject(JSON.parse(ftArgs.msg), shapeCode);
    } catch {
        throw new Error(shapeCode);
    }
    requireExactKeys(message, [
        'action',
        'creator_id',
        'job_id',
        'title',
        'price_usdc',
        'expected_source_bytes',
        'profile_id',
        'profile_config_sha256',
        'upload_public_key',
        'upload_key_expires_at_ms',
        'sponsor_quote',
        'sponsor_quote_signature',
    ], shapeCode);
    if (message.action !== 'create_paid_job'
        || message.creator_id !== delegate.senderId
        || typeof message.sponsor_quote_signature !== 'string') {
        throw new Error(shapeCode);
    }
    const requestValue: JsonObject = {
        creator_id: message.creator_id,
        job_id: message.job_id,
        title: message.title,
        price_usdc: message.price_usdc,
        expected_source_bytes: message.expected_source_bytes,
        profile_id: message.profile_id,
        profile_config_sha256: message.profile_config_sha256,
        upload_public_key: message.upload_public_key,
        upload_key_expires_at_ms: message.upload_key_expires_at_ms,
    };
    let paidJobRequest: SponsoredPaidJobRequest;
    try {
        paidJobRequest = parseSponsoredPaidJobRequest(requestValue, false);
    } catch {
        throw new Error(shapeCode);
    }
    const quoteCode = SPONSORED_RELAY_REJECTION_CODES.quote_validation;
    const quote = parseSponsoredUploadQuote(requireObject(
        message.sponsor_quote,
        quoteCode,
    ));
    await verifySponsoredUploadQuote(
        env,
        paidJobRequest,
        quote,
        message.sponsor_quote_signature,
    );
    if (ftArgs.amount !== quote.total_fee_usdc
        || delegate.maxBlockHeight > BigInt(quote.max_delegate_block_height)
            + SPONSORED_UPLOAD_SIGNING_HEADROOM_BLOCKS) {
        throw new Error(quoteCode);
    }
    const delegateHash = new Uint8Array(await crypto.subtle.digest(
        'SHA-256',
        encodeDelegateAction(delegate as never),
    ));
    const verificationKey = await crypto.subtle.importKey(
        'raw',
        publicKeyBytes,
        'Ed25519',
        false,
        ['verify'],
    );
    if (!await crypto.subtle.verify('Ed25519', verificationKey, signatureBytes, delegateHash)) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.signature_validation);
    }
    return {
        signedDelegate,
        signedDelegateBase64: value.signed_delegate_base64,
        signedDelegateSha256: await sha256BytesHex(encoded),
        publicKey: `ed25519:${baseEncode(publicKeyBytes)}`,
        nonce: delegate.nonce,
        maxBlockHeight: delegate.maxBlockHeight,
        request: paidJobRequest,
        quote,
    };
}

function parseBorshBytes(value: unknown, exactLength?: number): Uint8Array {
    if (!Array.isArray(value)
        || value.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
        || (exactLength !== undefined && value.length !== exactLength)) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.delegate_shape);
    }
    return Uint8Array.from(value as number[]);
}

function parseSponsoredUploadQuote(value: JsonObject): SponsoredUploadQuote {
    const fields = [
        'domain', 'version', 'network', 'contract_id', 'creator_id', 'job_id',
        'request_sha256', 'expected_source_bytes', 'upload_fee_usdc', 'sponsor_fee_usdc',
        'total_fee_usdc', 'delegate_receiver_id', 'delegate_method', 'delegate_gas',
        'delegate_deposit_yocto', 'issued_at_ms', 'quote_block_height', 'max_delegate_block_height',
        'expires_at_ms', 'quote_key_version', 'quote_id',
    ];
    requireExactKeys(value, fields, SPONSORED_RELAY_REJECTION_CODES.quote_validation);
    const decimalFields = [
        'expected_source_bytes', 'upload_fee_usdc', 'sponsor_fee_usdc', 'total_fee_usdc',
        'delegate_gas', 'delegate_deposit_yocto', 'issued_at_ms', 'quote_block_height',
        'max_delegate_block_height', 'expires_at_ms',
    ];
    if (value.domain !== 'youtick.sponsored-upload-quote'
        || value.version !== '1'
        || !['testnet', 'mainnet'].includes(String(value.network))
        || typeof value.contract_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(value.contract_id)
        || typeof value.creator_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(value.creator_id)
        || typeof value.job_id !== 'string'
        || !JOB_ID_PATTERN.test(value.job_id)
        || typeof value.request_sha256 !== 'string'
        || !SHA256_PATTERN.test(value.request_sha256)
        || typeof value.delegate_receiver_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(value.delegate_receiver_id)
        || value.delegate_method !== 'ft_transfer_call'
        || !Number.isSafeInteger(value.quote_key_version)
        || Number(value.quote_key_version) < 1
        || typeof value.quote_id !== 'string'
        || !SHA256_PATTERN.test(value.quote_id)
        || decimalFields.some((field) => (
            typeof value[field] !== 'string' || !/^[1-9][0-9]{0,38}$/.test(value[field] as string)
        ))) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.quote_validation);
    }
    return value as unknown as SponsoredUploadQuote;
}

async function verifySponsoredUploadQuote(
    env: Env,
    request: SponsoredPaidJobRequest,
    quote: SponsoredUploadQuote,
    signatureBase64: string,
): Promise<void> {
    const sourceBytes = BigInt(request.expected_source_bytes);
    const byteFee = (sourceBytes * 3n + 9_999n) / 10_000n;
    const uploadFee = byteFee < MIN_CREATOR_UPLOAD_FEE_USD_MICROS
        ? MIN_CREATOR_UPLOAD_FEE_USD_MICROS
        : byteFee;
    const issuedAt = BigInt(quote.issued_at_ms);
    const expiresAt = BigInt(quote.expires_at_ms);
    if (quote.network !== env.NEAR_NETWORK
        || quote.contract_id !== env.MARKET_CONTRACT_ID
        || quote.creator_id !== request.creator_id
        || quote.job_id !== request.job_id
        || quote.request_sha256 !== await sha256Hex(paidJobRequestJson(request))
        || quote.expected_source_bytes !== request.expected_source_bytes
        || BigInt(quote.upload_fee_usdc) !== uploadFee
        || BigInt(quote.sponsor_fee_usdc) !== SPONSORED_UPLOAD_FEE_USDC
        || BigInt(quote.total_fee_usdc) !== uploadFee + SPONSORED_UPLOAD_FEE_USDC
        || quote.delegate_receiver_id !== usdcContractId(env)
        || quote.delegate_gas !== SPONSORED_UPLOAD_DELEGATE_GAS.toString()
        || quote.delegate_deposit_yocto !== '1'
        || quote.quote_key_version !== Number(env.CREATOR_FEE_QUOTE_KEY_VERSION)
        || expiresAt <= issuedAt
        || expiresAt - issuedAt > BigInt(CREATOR_FEE_QUOTE_LIFETIME_MS)
        || BigInt(quote.quote_block_height) >= BigInt(quote.max_delegate_block_height)
        || BigInt(quote.max_delegate_block_height) - BigInt(quote.quote_block_height)
            > SPONSORED_UPLOAD_MAX_BLOCK_WINDOW) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.quote_validation);
    }
    const canonicalMessage = canonicalSponsoredUploadQuoteMessage(quote);
    if (quote.quote_id !== await sha256Hex(canonicalMessage)) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.quote_validation);
    }
    let providedSignature: Uint8Array;
    try {
        providedSignature = base64Decode(signatureBase64);
    } catch {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.quote_validation);
    }
    const privateKey = await importCreatorFeeQuotePrivateKey(env);
    const expectedSignature = new Uint8Array(await crypto.subtle.sign(
        'Ed25519',
        privateKey,
        new TextEncoder().encode(canonicalMessage),
    ));
    if (!constantTimeEqual(providedSignature, expectedSignature)) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.quote_validation);
    }
}

function sponsoredQuoteIsFresh(input: ParsedSponsoredDelegate): boolean {
    const now = BigInt(Date.now());
    const issuedAt = BigInt(input.quote.issued_at_ms);
    const expiresAt = BigInt(input.quote.expires_at_ms);
    return BigInt(input.request.upload_key_expires_at_ms) > now
        && issuedAt <= now
        && now - issuedAt <= BigInt(CREATOR_FEE_QUOTE_LIFETIME_MS)
        && expiresAt > now
        && expiresAt > issuedAt
        && expiresAt - issuedAt <= BigInt(CREATOR_FEE_QUOTE_LIFETIME_MS);
}

async function relaySponsoredUpload(
    state: DurableObjectState,
    env: Env,
    request: Request,
): Promise<Response> {
    const input = await parseSponsoredUploadRelayRequest(request, env);
    await enforcePublicBetaAccountRateLimit(
        env,
        '/v1/sponsored-upload-relays',
        input.request.creator_id,
    );
    const existingJob = await readSponsoredMediaJob(env, input.request.job_id);
    if (existingJob) {
        requireExactSponsoredJob(existingJob, input);
        await state.storage.delete(`${SPONSOR_RELAY_KEY_PREFIX}${input.request.job_id}`);
        return json({
            accepted: true,
            relayed: true,
            job_id: input.request.job_id,
            tx_hash: null,
        });
    }

    const key = `${SPONSOR_RELAY_KEY_PREFIX}${input.request.job_id}`;
    let storedRecord = await state.storage.get<SponsorRelayRecord>(key);
    if (storedRecord
        && (storedRecord.payloadSha256 !== input.signedDelegateSha256
            || storedRecord.creator !== input.request.creator_id)) {
        throw new Error('sponsor_relay_conflict');
    }
    if (storedRecord?.state === 'BROADCAST' && storedRecord.txHash) {
        const observed = await queryTransactionForAccount(
            env,
            storedRecord.txHash,
            env.NEAR_SPONSOR_RELAYER_ACCOUNT_ID!,
        );
        const job = await readSponsoredMediaJob(env, input.request.job_id);
        if (job) {
            requireExactSponsoredJob(job, input);
            await state.storage.delete(key);
            return json({
                accepted: true,
                relayed: true,
                job_id: input.request.job_id,
                tx_hash: storedRecord.txHash,
            });
        }
        if (observed === 'failed' || observed === 'sent') {
            await releaseSponsoredAdmission(env, input.request);
            await state.storage.delete(key);
            throw new Error('sponsor_relay_failed');
        }
        if (observed === 'unknown') {
            await state.storage.setAlarm(Date.now() + 30_000);
            return json({
                accepted: true,
                relayed: false,
                job_id: input.request.job_id,
                tx_hash: storedRecord.txHash,
            }, 202);
        }
        storedRecord = clearSponsorRelayTransaction(storedRecord);
        await state.storage.put(key, storedRecord);
    }
    if (!sponsoredQuoteIsFresh(input)) {
        if (storedRecord) {
            await releaseSponsoredAdmission(env, input.request);
            await state.storage.delete(key);
        }
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.freshness);
    }

    const [block, creatorAccessKey, relayerAccessKey, balance] = await Promise.all([
        readFinalBlock(env),
        readCreatorAccessKey(env, input.request.creator_id, input.publicKey),
        readSponsorRelayerAccessKey(env),
        readUsdcBalance(env, input.request.creator_id),
    ]);
    if (input.nonce !== creatorAccessKey.nonce + 1n
        || input.maxBlockHeight <= BigInt(block.height)
        || input.maxBlockHeight > BigInt(input.quote.max_delegate_block_height)
            + SPONSORED_UPLOAD_SIGNING_HEADROOM_BLOCKS) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.access_key);
    }
    requireCreatorDelegatePermission(creatorAccessKey.permission, env);
    if (balance < BigInt(input.quote.total_fee_usdc)) {
        throw new Error('sponsor_balance_insufficient');
    }
    await reserveSponsoredAdmission(env, input.request);
    let record = await state.storage.transaction(async (transaction) => {
        const existing = await transaction.get<SponsorRelayRecord>(key);
        if (existing) {
            if (existing.payloadSha256 !== input.signedDelegateSha256
                || existing.creator !== input.request.creator_id) {
                throw new Error('sponsor_relay_conflict');
            }
            return existing;
        }
        await assertDurableObjectRecordCapacity(transaction, [
            key,
            SPONSOR_RELAYER_LAST_NONCE_KEY,
        ], 'operator');
        const created: SponsorRelayRecord = {
            schema: 'youtick.sponsor-relay.v1',
            state: 'PENDING',
            jobId: input.request.job_id,
            creator: input.request.creator_id,
            payloadSha256: input.signedDelegateSha256,
            signedDelegateBase64: input.signedDelegateBase64,
            createdAtMs: Date.now(),
        };
        await transaction.put(key, created);
        return created;
    });

    const signer = KeyPairSigner.fromSecretKey(
        env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY as `ed25519:${string}`,
    );
    const relayerPublicKey = await signer.getPublicKey();
    if (!record.signedTxBase64) {
        if (!record.nonce || !record.blockHash) {
            record = await state.storage.transaction(async (transaction) => {
                const current = await transaction.get<SponsorRelayRecord>(key);
                if (!current) throw new Error('sponsor_relay_pending');
                if (current.nonce && current.blockHash) return current;
                const lastNonce = BigInt(
                    await transaction.get<string>(SPONSOR_RELAYER_LAST_NONCE_KEY) || '0',
                );
                const nonce = (lastNonce > relayerAccessKey.nonce
                    ? lastNonce
                    : relayerAccessKey.nonce) + 1n;
                const reserved = {
                    ...current,
                    state: 'RESERVED' as const,
                    nonce: String(nonce),
                    blockHash: relayerAccessKey.blockHash,
                };
                await transaction.put(SPONSOR_RELAYER_LAST_NONCE_KEY, String(nonce));
                await transaction.put(key, reserved);
                return reserved;
            });
        }
        const transaction = createTransaction(
            env.NEAR_SPONSOR_RELAYER_ACCOUNT_ID!,
            relayerPublicKey,
            input.request.creator_id,
            BigInt(record.nonce!),
            [actions.signedDelegate(input.signedDelegate)],
            baseDecode(record.blockHash!),
        );
        const signed = await signer.signTransaction(transaction);
        record = {
            ...record,
            state: 'SIGNED',
            signedTxBase64: bytesToBase64(signed.signedTransaction.encode()),
            txHash: baseEncode(signed.txHash),
        };
        await state.storage.put(key, record);
    }

    let broadcast: 'sent' | 'invalid_nonce' | 'failed' | 'unknown';
    try {
        broadcast = await sendTransaction(env, record.signedTxBase64!);
    } catch {
        broadcast = 'unknown';
    }
    record = { ...record, state: 'BROADCAST' };
    await state.storage.put(key, record);
    const job = await readSponsoredMediaJob(env, input.request.job_id);
    if (job) {
        requireExactSponsoredJob(job, input);
        await state.storage.delete(key);
        return json({ accepted: true, relayed: true, job_id: input.request.job_id, tx_hash: record.txHash || null });
    }
    if (broadcast === 'failed' || broadcast === 'sent') {
        await releaseSponsoredAdmission(env, input.request);
        await state.storage.delete(key);
        throw new Error('sponsor_relay_failed');
    }
    if (broadcast === 'invalid_nonce') {
        await state.storage.put(key, clearSponsorRelayTransaction(record));
    }
    await state.storage.setAlarm(Date.now() + 30_000);
    return json({ accepted: true, relayed: false, job_id: input.request.job_id, tx_hash: record.txHash || null }, 202);
}

async function advanceSponsorRelayAlarm(state: DurableObjectState, env: Env): Promise<boolean> {
    const records = await state.storage.list<SponsorRelayRecord>({
        prefix: SPONSOR_RELAY_KEY_PREFIX,
        limit: 1,
    });
    const record = records.values().next().value as SponsorRelayRecord | undefined;
    if (!record) return false;
    if (env.LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED !== 'true') return true;
    try {
        const response = await relaySponsoredUpload(state, env, new Request(
            'https://object/internal/sponsored-upload-relay',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ signed_delegate_base64: record.signedDelegateBase64 }),
            },
        ));
        if (response.status === 202) await state.storage.setAlarm(Date.now() + 30_000);
    } catch (error) {
        console.error(formatLog('sponsor_relay_alarm_failed', { code: safeErrorCode(error) }));
        await state.storage.setAlarm(Date.now() + 60_000);
    }
    return true;
}

function clearSponsorRelayTransaction(record: SponsorRelayRecord): SponsorRelayRecord {
    const next = { ...record, state: 'PENDING' as const };
    delete next.nonce;
    delete next.blockHash;
    delete next.signedTxBase64;
    delete next.txHash;
    return next;
}

async function readSponsoredMediaJob(env: Env, jobId: string): Promise<OnChainJob | null> {
    try {
        return (await readFinalMediaJob(env, jobId)).job;
    } catch (error) {
        if (error instanceof Error && error.message === 'near_job_not_found') return null;
        throw error;
    }
}

function requireExactSponsoredJob(job: OnChainJob, input: ParsedSponsoredDelegate): void {
    if (job.job_id !== input.request.job_id
        || job.creator_id !== input.request.creator_id
        || job.title !== input.request.title
        || job.price_usdc !== input.request.price_usdc
        || job.expected_source_bytes !== input.request.expected_source_bytes
        || job.profile_id !== input.request.profile_id
        || job.profile_config_sha256 !== input.request.profile_config_sha256
        || job.upload_public_key !== input.request.upload_public_key
        || job.upload_key_expires_at_ms !== input.request.upload_key_expires_at_ms
        || job.status !== 'Authorized'
        || job.fee_asset !== 'USDC'
        || job.fee_amount !== input.quote.total_fee_usdc
        || job.fee_usd_micro !== input.quote.total_fee_usdc
        || job.fee_quote_hash !== input.quote.quote_id) {
        throw new Error('sponsor_job_conflict');
    }
}

async function readCreatorAccessKey(
    env: Env,
    accountId: string,
    publicKey: string,
): Promise<{ nonce: bigint; permission: unknown }> {
    const payload = await nearRpcRaw(env, 'query', {
        request_type: 'view_access_key',
        finality: 'final',
        account_id: accountId,
        public_key: publicKey,
    });
    const accessCode = SPONSORED_RELAY_REJECTION_CODES.access_key;
    const result = requireObject(payload.result, accessCode);
    if (typeof result.nonce !== 'number'
        || !Number.isSafeInteger(result.nonce)
        || result.nonce < 0
        || result.permission === undefined) {
        throw new Error(accessCode);
    }
    return { nonce: BigInt(result.nonce), permission: result.permission };
}

function requireCreatorDelegatePermission(permission: unknown, env: Env): void {
    if (permission === 'FullAccess') return;
    const accessCode = SPONSORED_RELAY_REJECTION_CODES.access_key;
    const root = requireObject(permission, accessCode);
    requireExactKeys(root, ['FunctionCall'], accessCode);
    const functionCall = requireObject(root.FunctionCall, accessCode);
    const methods = functionCall.method_names;
    if (functionCall.receiver_id !== usdcContractId(env)
        || !Array.isArray(methods)
        || !methods.includes('ft_transfer_call')
        || methods.some((method) => typeof method !== 'string')) {
        throw new Error(accessCode);
    }
}

async function readSponsorRelayerAccessKey(
    env: Env,
): Promise<{ nonce: bigint; blockHash: string }> {
    const signer = KeyPairSigner.fromSecretKey(
        env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY as `ed25519:${string}`,
    );
    const publicKey = (await signer.getPublicKey()).toString();
    const payload = await nearRpcRaw(env, 'query', {
        request_type: 'view_access_key',
        finality: 'final',
        account_id: env.NEAR_SPONSOR_RELAYER_ACCOUNT_ID,
        public_key: publicKey,
    });
    const result = requireObject(payload.result, 'runtime_not_configured');
    if (result.permission !== 'FullAccess'
        || typeof result.nonce !== 'number'
        || !Number.isSafeInteger(result.nonce)
        || result.nonce < 0
        || typeof result.block_hash !== 'string') {
        throw new Error('runtime_not_configured');
    }
    return { nonce: BigInt(result.nonce), blockHash: result.block_hash };
}

async function readUsdcBalance(env: Env, accountId: string): Promise<bigint> {
    const payload = await nearRpcRaw(env, 'query', {
        request_type: 'call_function',
        finality: 'final',
        account_id: usdcContractId(env),
        method_name: 'ft_balance_of',
        args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify({ account_id: accountId }))),
    });
    const result = requireObject(payload.result, 'near_finalize_pending');
    if (!Array.isArray(result.result)) throw new Error('near_finalize_pending');
    let balance: unknown;
    try {
        balance = JSON.parse(new TextDecoder().decode(Uint8Array.from(result.result as number[])));
    } catch {
        throw new Error('near_finalize_pending');
    }
    if (typeof balance !== 'string' || !/^[0-9]+$/.test(balance)) {
        throw new Error('near_finalize_pending');
    }
    return BigInt(balance);
}

async function reserveSponsoredAdmission(env: Env, request: SponsoredPaidJobRequest): Promise<void> {
    if (!env.LIVEPEER_CONTROL) throw new Error('runtime_not_configured');
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(admissionObjectName(
        env.NEAR_NETWORK!,
        env.MARKET_CONTRACT_ID!,
    )));
    const response = await object.fetch(new Request('https://object/internal/admission/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jobId: request.job_id,
            generation: 1,
            creator: request.creator_id,
            expectedSourceBytes: request.expected_source_bytes,
        }),
    }));
    if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: unknown };
        throw new Error(body.error === 'admission_denied' ? 'admission_denied' : 'admission_closed');
    }
}

async function releaseSponsoredAdmission(env: Env, request: SponsoredPaidJobRequest): Promise<void> {
    if (!env.LIVEPEER_CONTROL) return;
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(admissionObjectName(
        env.NEAR_NETWORK!,
        env.MARKET_CONTRACT_ID!,
    )));
    const response = await object.fetch(new Request('https://object/internal/admission/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: request.job_id, generation: 1, state: 'CANCELLED' }),
    }));
    if (!response.ok) throw new Error('admission_closed');
}

async function issueCreatorFeeQuote(
    state: DurableObjectState,
    env: Env,
    request: Request,
): Promise<Response> {
    try {
        const input = parseCreatorFeeQuoteRequest(await readJsonObject(request));
        await enforceCreatorFeeQuoteRateLimit(state);
        const now = Date.now();
        const rate = await readOutlayerNearUsd(env, now);
        const sourceBytes = BigInt(input.expected_source_bytes);
        const byteFeeUsdMicro = (sourceBytes * 3n + 9_999n) / 10_000n;
        const feeUsdMicro = byteFeeUsdMicro < MIN_CREATOR_UPLOAD_FEE_USD_MICROS
            ? MIN_CREATOR_UPLOAD_FEE_USD_MICROS
            : byteFeeUsdMicro;
        const feeNearYocto = (feeUsdMicro * YOCTO_NEAR + rate.nearUsdMicro - 1n)
            / rate.nearUsdMicro;
        const quoteKeyVersion = Number(env.CREATOR_FEE_QUOTE_KEY_VERSION);
        const quoteWithoutId = {
            domain: 'youtick.creator-fee-quote',
            version: '1',
            network: env.NEAR_NETWORK!,
            contract_id: env.MARKET_CONTRACT_ID!,
            creator_id: input.creator_id,
            job_id: input.job_id,
            expected_source_bytes: input.expected_source_bytes,
            fee_usd_micro: feeUsdMicro.toString(),
            near_usd_micro: rate.nearUsdMicro.toString(),
            fee_near_yocto: feeNearYocto.toString(),
            rate_source: CREATOR_FEE_RATE_SOURCE,
            rate_timestamp_ms: String(rate.timestampMs),
            expires_at_ms: String(rate.timestampMs + CREATOR_FEE_QUOTE_LIFETIME_MS),
            quote_key_version: quoteKeyVersion,
        };
        const canonicalMessage = canonicalCreatorFeeQuoteMessage(quoteWithoutId);
        const quoteId = await sha256Hex(canonicalMessage);
        const privateKey = await importCreatorFeeQuotePrivateKey(env);
        const signature = new Uint8Array(await crypto.subtle.sign(
            'Ed25519',
            privateKey,
            new TextEncoder().encode(canonicalMessage),
        ));
        return json({
            quote: { ...quoteWithoutId, quote_id: quoteId },
            signature: bytesToBase64(signature),
            public_key_version: quoteKeyVersion,
        });
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('creator_fee_quote_issue_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

function parseCreatorFeeQuoteRequest(value: JsonObject): CreatorFeeQuoteRequest {
    requireExactKeys(value, [
        'creator_id', 'job_id', 'expected_source_bytes',
    ], 'invalid_creator_fee_quote_request');
    if (typeof value.creator_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(value.creator_id)
        || typeof value.job_id !== 'string'
        || !JOB_ID_PATTERN.test(value.job_id)
        || typeof value.expected_source_bytes !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(value.expected_source_bytes)
        || BigInt(value.expected_source_bytes) > MAX_SOURCE_BYTES) {
        throw new Error('invalid_creator_fee_quote_request');
    }
    return value as CreatorFeeQuoteRequest;
}

async function enforceCreatorFeeQuoteRateLimit(state: DurableObjectState): Promise<void> {
    const now = Date.now();
    const expiresAtMs = await state.storage.transaction(async (transaction) => {
        const current = await transaction.get<{ windowStartedAtMs: number; count: number }>('quote-rate:v1');
        const next = !current || now - current.windowStartedAtMs >= CREATOR_FEE_RATE_WINDOW_MS
            ? { windowStartedAtMs: now, count: 1 }
            : { ...current, count: current.count + 1 };
        if (next.count > CREATOR_FEE_RATE_LIMIT) throw new Error('creator_fee_quote_rate_limited');
        await assertDurableObjectRecordCapacity(transaction, ['quote-rate:v1'], 'rate_limit');
        await transaction.put('quote-rate:v1', next);
        return next.windowStartedAtMs + CREATOR_FEE_RATE_WINDOW_MS;
    });
    await state.storage.setAlarm(expiresAtMs);
}

async function expireCreatorFeeQuoteRateLimit(state: DurableObjectState): Promise<boolean> {
    const record = await state.storage.get<{ windowStartedAtMs: number }>('quote-rate:v1');
    if (!record) return false;
    const expiresAtMs = record.windowStartedAtMs + CREATOR_FEE_RATE_WINDOW_MS;
    if (Date.now() < expiresAtMs) {
        await state.storage.setAlarm(expiresAtMs);
        return true;
    }
    await state.storage.deleteAll();
    return true;
}

async function readOutlayerNearUsd(
    env: Env,
    now: number,
): Promise<{ nearUsdMicro: bigint; timestampMs: number }> {
    let response: Response;
    let payload: { result?: unknown; error?: unknown };
    try {
        response = await dependencyFetch('near_rpc', 'oracle_price', env.NEAR_RPC_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'creator-fee-near-usd',
                method: 'query',
                params: {
                    request_type: 'call_function',
                    finality: 'final',
                    account_id: env.NEAR_NETWORK === 'mainnet'
                        ? 'price-oracle.near'
                        : 'price-oracle.testnet',
                    method_name: 'get_price_data',
                    args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify({
                        asset_ids: [OUTLAYER_NEAR_ASSET_ID],
                    }))),
                },
            }),
            signal: AbortSignal.timeout(2_500),
        });
        payload = await response.json() as typeof payload;
    } catch {
        throw new Error('rate_source_unavailable');
    }
    if (!response.ok || payload.error || !payload.result) {
        throw new Error('rate_source_unavailable');
    }
    const rpcResult = requireObject(payload.result, 'rate_source_invalid');
    if (!Array.isArray(rpcResult.result)
        || rpcResult.result.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
        throw new Error('rate_source_invalid');
    }
    let root: JsonObject;
    try {
        root = requireObject(JSON.parse(new TextDecoder().decode(
            Uint8Array.from(rpcResult.result as number[]),
        )), 'rate_source_invalid');
    } catch {
        throw new Error('rate_source_invalid');
    }
    if (typeof root.timestamp !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(root.timestamp)
        || !Number.isInteger(root.recency_duration_sec)
        || (root.recency_duration_sec as number) < 1
        || !Array.isArray(root.prices)
        || root.prices.length !== 1) {
        throw new Error('rate_source_invalid');
    }
    if ((root.recency_duration_sec as number) * 1_000 > CREATOR_FEE_MAX_SOURCE_AGE_MS) {
        throw new Error('rate_source_stale');
    }
    const entry = requireObject(root.prices[0], 'rate_source_invalid');
    if (entry.asset_id !== OUTLAYER_NEAR_ASSET_ID) throw new Error('rate_source_invalid');
    if (entry.price === null) throw new Error('rate_source_unavailable');
    const price = requireObject(entry.price, 'rate_source_invalid');
    if (typeof price.multiplier !== 'string'
        || !/^[1-9][0-9]{0,38}$/.test(price.multiplier)
        || !Number.isInteger(price.decimals)
        || (price.decimals as number) < 0
        || (price.decimals as number) > 30) {
        throw new Error('rate_source_invalid');
    }
    const timestampMsBig = BigInt(root.timestamp) / 1_000_000n;
    if (timestampMsBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('rate_source_invalid');
    const timestampMs = Number(timestampMsBig);
    if (timestampMs > now) throw new Error('rate_source_invalid');
    if (now - timestampMs > CREATOR_FEE_MAX_SOURCE_AGE_MS) {
        throw new Error('rate_source_stale');
    }
    const nearUsdMicro = decimalPriceToMicro(
        BigInt(price.multiplier),
        price.decimals as number,
    );
    if (nearUsdMicro < 1n) throw new Error('rate_source_invalid');
    return { nearUsdMicro, timestampMs };
}

function decimalPriceToMicro(multiplier: bigint, decimals: number): bigint {
    if (decimals <= 6) return multiplier * (10n ** BigInt(6 - decimals));
    return multiplier / (10n ** BigInt(decimals - 6));
}

function canonicalCreatorFeeQuoteMessage(quote: Record<string, string | number>): string {
    return [
        quote.domain,
        quote.version,
        quote.network,
        quote.contract_id,
        quote.creator_id,
        quote.job_id,
        quote.expected_source_bytes,
        quote.fee_usd_micro,
        quote.near_usd_micro,
        quote.fee_near_yocto,
        quote.rate_source,
        quote.rate_timestamp_ms,
        quote.expires_at_ms,
        quote.quote_key_version,
    ].join('\n');
}

function canonicalSponsoredUploadQuoteMessage(quote: Omit<SponsoredUploadQuote, 'quote_id'>): string {
    return [
        quote.domain,
        quote.version,
        quote.network,
        quote.contract_id,
        quote.creator_id,
        quote.job_id,
        quote.request_sha256,
        quote.expected_source_bytes,
        quote.upload_fee_usdc,
        quote.sponsor_fee_usdc,
        quote.total_fee_usdc,
        quote.delegate_receiver_id,
        quote.delegate_method,
        quote.delegate_gas,
        quote.delegate_deposit_yocto,
        quote.issued_at_ms,
        quote.quote_block_height,
        quote.max_delegate_block_height,
        quote.expires_at_ms,
        quote.quote_key_version,
    ].join('\n');
}

function paidJobRequestJson(request: SponsoredPaidJobRequest): string {
    return JSON.stringify({
        creator_id: request.creator_id,
        job_id: request.job_id,
        title: request.title,
        price_usdc: request.price_usdc,
        expected_source_bytes: request.expected_source_bytes,
        profile_id: request.profile_id,
        profile_config_sha256: request.profile_config_sha256,
        upload_public_key: request.upload_public_key,
        upload_key_expires_at_ms: request.upload_key_expires_at_ms,
    });
}

async function readFinalBlock(env: Env): Promise<{ height: number; timestampMs: number }> {
    const payload = await nearRpcRaw(env, 'block', { finality: 'final' });
    const result = requireObject(payload.result, 'near_finalize_pending');
    const header = requireObject(result.header, 'near_finalize_pending');
    if (typeof header.height !== 'number'
        || !Number.isSafeInteger(header.height)
        || header.height < 1
        || typeof header.timestamp_nanosec !== 'string'
        || !/^[1-9][0-9]{0,29}$/.test(header.timestamp_nanosec)) {
        throw new Error('near_finalize_pending');
    }
    const timestampMsBig = BigInt(header.timestamp_nanosec) / 1_000_000n;
    if (timestampMsBig > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('near_finalize_pending');
    }
    const timestampMs = Number(timestampMsBig);
    const now = Date.now();
    if (timestampMs > now || now - timestampMs > SPONSORED_UPLOAD_FINAL_BLOCK_MAX_AGE_MS) {
        throw new Error('near_finalize_pending');
    }
    return { height: header.height, timestampMs };
}

function usdcContractId(env: Env): string {
    if (env.NEAR_NETWORK === 'testnet') return TESTNET_USDC_CONTRACT_ID;
    if (env.NEAR_NETWORK === 'mainnet') return MAINNET_USDC_CONTRACT_ID;
    throw new Error('runtime_not_configured');
}

async function importCreatorFeeQuotePrivateKey(env: Env): Promise<CryptoKey> {
    try {
        return await crypto.subtle.importKey(
            'pkcs8',
            base64Decode(env.CREATOR_FEE_QUOTE_PRIVATE_KEY!),
            'Ed25519',
            false,
            ['sign'],
        );
    } catch {
        throw new Error('runtime_not_configured');
    }
}

export async function forwardPlaybackToken(
    request: Request,
    env: Env,
    context?: ExecutionContext,
): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!env.LIVEPEER_CONTROL || !validPlaybackConfig(env)) throw new Error('runtime_not_configured');
        const input = await parsePlaybackTokenRequest(request, env);
        await enforcePublicBetaAccountRateLimit(
            env,
            '/v1/playback-tokens',
            input.envelope.account_id,
        );
        await requireActivePublicTestnetBetaForPlayback(env);
        const forwardingRequest = new Request(request.url, {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify({ body: input.body, envelope: input.envelope }),
        });
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(jobObjectName(
            input.envelope.network,
            input.envelope.contract_id,
            input.body.job_id,
            input.body.generation,
        )));
        const response = await object.fetch(forwardingRequest);
        if (env.LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED === 'true'
            && input.shadowV2 !== undefined
            && context) {
            context.waitUntil(observePlaybackShadow(
                input.shadowV2,
                origin,
                env,
                response.clone(),
            ));
        }
        return withCors(response, corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_playback_route_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
}

async function observePlaybackShadow(
    shadowV2: unknown,
    origin: string,
    env: Env,
    legacyResponse: Response,
): Promise<void> {
    const legacyReasonCode = legacyResponse.ok
        ? 'authorized'
        : await responseErrorCode(legacyResponse);
    let v2ReasonCode = 'authorized';
    try {
        if (!validPlaybackV2Config(env)) throw new Error('runtime_not_configured');
        const request = new Request('https://shadow.invalid/v2/playback-tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: origin },
            body: JSON.stringify(shadowV2),
        });
        const input = await parsePlaybackV2Request(request, env);
        await verifyPlaybackV2Proofs(env, input);
        await readStatelessPlaybackAuthorization(env, input);
    } catch (error) {
        v2ReasonCode = safeErrorCode(error);
    }
    const legacyDecision = playbackDecision(legacyReasonCode);
    const v2Decision = playbackDecision(v2ReasonCode);
    console.info(formatLog('playback_shadow_authorization_compared', {
        legacyDecision,
        legacyReasonCode,
        v2Decision,
        v2ReasonCode,
        decisionMatch: legacyDecision === v2Decision,
    }));
}

async function responseErrorCode(response: Response): Promise<string> {
    try {
        const body = await response.json() as { error?: unknown };
        return safeErrorCode(new Error(typeof body.error === 'string' ? body.error : 'internal_error'));
    } catch {
        return 'internal_error';
    }
}

function playbackDecision(reasonCode: string): 'ALLOW' | 'DENY' | 'UNAVAILABLE' {
    if (reasonCode === 'authorized') return 'ALLOW';
    if (reasonCode === 'internal_error'
        || reasonCode === 'runtime_not_configured'
        || reasonCode === 'playback_authorization_unavailable'
        || reasonCode === 'provider_unavailable'
        || reasonCode.startsWith('near_')) return 'UNAVAILABLE';
    return 'DENY';
}

export async function forwardAdmissionReopen(request: Request, env: Env): Promise<Response> {
    try {
        if (!env.LIVEPEER_CONTROL || !validAdmissionReopenConfig(env)) {
            throw new Error('runtime_not_configured');
        }
        await requireOperatorAuthorization(request, env);
        const input = parseAdmissionReopenRequest(await readJsonObject(request), env);
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(admissionObjectName(
            env.NEAR_NETWORK!,
            env.MARKET_CONTRACT_ID!,
        )));
        return await object.fetch(new Request('https://object/internal/admission/reopen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        }));
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_admission_reopen_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

export async function forwardPublicBetaAssetDelete(request: Request, env: Env): Promise<Response> {
    try {
        await requireOperatorAuthorization(request, env);
        const input = await readJsonObject(request);
        requireExactKeys(input, ['job_id', 'generation', 'asset_id'], 'invalid_outbox');
        if (typeof input.job_id !== 'string'
            || !JOB_ID_PATTERN.test(input.job_id)
            || input.generation !== 1
            || typeof input.asset_id !== 'string'
            || !PROVIDER_ID_PATTERN.test(input.asset_id)) {
            throw new Error('invalid_outbox');
        }
        const object = env.LIVEPEER_CONTROL!.get(env.LIVEPEER_CONTROL!.idFromName(jobObjectName(
            env.NEAR_NETWORK!,
            env.MARKET_CONTRACT_ID!,
            input.job_id,
            input.generation,
        )));
        return await object.fetch(new Request('https://object/internal/provider-asset-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jobId: input.job_id,
                generation: input.generation,
                assetId: input.asset_id,
            }),
        }));
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('public_beta_provider_delete_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

export async function forwardAdmissionStatus(request: Request, env: Env): Promise<Response> {
    try {
        if (!env.LIVEPEER_CONTROL || !validAdmissionReopenConfig(env)) {
            throw new Error('runtime_not_configured');
        }
        await requireOperatorAuthorization(request, env);
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(admissionObjectName(
            env.NEAR_NETWORK!,
            env.MARKET_CONTRACT_ID!,
        )));
        return await object.fetch(new Request('https://object/internal/admission/status'));
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_admission_status_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

async function operatorControlObject(env: Env): Promise<DurableObjectStub> {
    if (!env.LIVEPEER_CONTROL || !validOperatorStatusConfig(env)) {
        throw new Error('runtime_not_configured');
    }
    const signer = KeyPairSigner.fromSecretKey(env.NEAR_OPERATOR_PRIVATE_KEY as `ed25519:${string}`);
    const publicKey = (await signer.getPublicKey()).toString();
    return env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(operatorObjectName(
        env.NEAR_NETWORK!,
        publicKey,
        Number(env.NEAR_OPERATOR_KEY_EPOCH),
    )));
}

export async function forwardOperatorOutboxStatus(
    request: Request,
    env: Env,
): Promise<Response> {
    try {
        await requireOperatorAuthorization(request, env);
        return await (await operatorControlObject(env)).fetch(
            new Request('https://object/internal/operator-outbox/status'),
        );
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_operator_outbox_status_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

export async function forwardOperatorOutboxArchiveScan(
    request: Request,
    env: Env,
): Promise<Response> {
    try {
        if (!validOperatorArchiveConfig(env)) throw new Error('runtime_not_configured');
        await requireOperatorAuthorization(request, env);
        return await (await operatorControlObject(env)).fetch(new Request(
            'https://object/internal/operator-outbox/archive-scan',
            { method: 'POST' },
        ));
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_operator_outbox_archive_scan_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

function parseAdmissionReopenRequest(input: JsonObject, env: Env): AdmissionReopenInput {
    requireExactKeys(input, [
        'idempotency_key',
        'network',
        'contract_id',
        'closure_code',
        'closure_observed_at_ms',
        'incident_id',
        'evidence_sha256',
        'resolution_code',
        'job_id',
        'generation',
    ], 'invalid_admission_reopen');
    if (input.network !== env.NEAR_NETWORK || input.contract_id !== env.MARKET_CONTRACT_ID) {
        throw new Error('admission_reopen_denied');
    }
    return parseAdmissionReopenInput({
        idempotencyKey: input.idempotency_key,
        operatorId: env.LIVEPEER_PAID_MEDIA_OPERATOR_ID,
        closureCode: input.closure_code,
        closureObservedAtMs: typeof input.closure_observed_at_ms === 'string'
            && /^[1-9][0-9]{0,15}$/.test(input.closure_observed_at_ms)
            ? Number(input.closure_observed_at_ms)
            : Number.NaN,
        incidentId: input.incident_id,
        evidenceSha256: input.evidence_sha256,
        resolutionCode: input.resolution_code,
        jobId: input.job_id,
        generation: input.generation,
    });
}

async function requireOperatorAuthorization(request: Request, env: Env): Promise<void> {
    const authorization = request.headers.get('Authorization') || '';
    const encoder = new TextEncoder();
    const actual = encoder.encode(authorization);
    const authorized = [
        env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN,
        env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN_PREVIOUS,
    ].filter((value): value is string => typeof value === 'string').reduce((matched, token) => (
        constantTimeEqual(actual, encoder.encode(`Bearer ${token}`)) || matched
    ), false);
    if (!authorized) {
        throw new Error('operator_unauthorized');
    }
}

export async function forwardLivepeerWebhook(request: Request, env: Env): Promise<Response> {
    const startedAtMs = Date.now();
    try {
        if (!env.LIVEPEER_CONTROL || !validWebhookConfig(env)) {
            throw new Error('runtime_not_configured');
        }
        const rawBody = new Uint8Array(await request.arrayBuffer());
        if (rawBody.byteLength > MAX_CONTROL_BODY_BYTES) throw new Error('control_body_too_large');
        const webhook = await verifyWebhookWithOverlap(
            rawBody,
            request.headers.get('Livepeer-Signature') || '',
            env,
        );
        const route = webhookRoute(webhook, (jobId) => JOB_ID_PATTERN.test(jobId));
        if (!route) return json({ accepted: true, ignored: true }, 202);
        if (env.LIVEPEER_WEBHOOK_QUEUE_ENABLED === 'true') {
            if (!env.LIVEPEER_EVENTS || !validWebhookQueuePolicy(env)) {
                throw new Error('webhook_queue_unavailable');
            }
            try {
                await env.LIVEPEER_EVENTS.send({
                    schema: 'youtick.livepeer-webhook-queue.v1',
                    network: env.NEAR_NETWORK!,
                    contract_id: env.MARKET_CONTRACT_ID!,
                    job_id: route.jobId,
                    generation: route.generation,
                    enqueued_at_ms: String(Date.now()),
                    raw_body_base64: bytesToBase64(rawBody),
                } satisfies LivepeerWebhookQueueMessage, { contentType: 'json' });
            } catch {
                throw new Error('webhook_queue_unavailable');
            }
            console.info(formatLog('webhook_ack_completed', {
                delivery: 'QUEUE',
                httpCode: 202,
                latencyMs: Math.max(0, Date.now() - startedAtMs),
            }));
            return json({ accepted: true, queued: true }, 202);
        }
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(jobObjectName(
            env.NEAR_NETWORK!,
            env.MARKET_CONTRACT_ID!,
            route.jobId,
            route.generation,
        )));
        return await object.fetch(new Request('https://object/internal/livepeer-webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: rawBody,
        }));
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_webhook_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

function parseLivepeerWebhookQueueMessage(value: unknown): LivepeerWebhookQueueMessage {
    const input = requireObject(value, 'invalid_webhook');
    requireExactKeys(input, [
        'schema',
        'network',
        'contract_id',
        'job_id',
        'generation',
        'enqueued_at_ms',
        'raw_body_base64',
    ], 'invalid_webhook');
    const maxEncodedBodyLength = Math.ceil(MAX_CONTROL_BODY_BYTES / 3) * 4;
    if (input.schema !== 'youtick.livepeer-webhook-queue.v1'
        || !['testnet', 'mainnet'].includes(String(input.network))
        || typeof input.contract_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(input.contract_id)
        || typeof input.job_id !== 'string'
        || !JOB_ID_PATTERN.test(input.job_id)
        || !Number.isSafeInteger(input.generation)
        || (input.generation as number) < 1
        || typeof input.enqueued_at_ms !== 'string'
        || !/^[1-9][0-9]{0,15}$/.test(input.enqueued_at_ms)
        || typeof input.raw_body_base64 !== 'string'
        || input.raw_body_base64.length < 4
        || input.raw_body_base64.length > maxEncodedBodyLength
        || input.raw_body_base64.length % 4 !== 0
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.raw_body_base64)) {
        throw new Error('invalid_webhook');
    }
    return input as LivepeerWebhookQueueMessage;
}

export function jobObjectName(
    network: string,
    contractId: string,
    jobId: string,
    generation: number,
): string {
    return `job:${network}:${contractId}:${jobId}:${generation}`;
}

export function operatorObjectName(network: string, publicKey: string, keyEpoch: number): string {
    return `operator:${network}:${publicKey}:${keyEpoch}`;
}

export function admissionObjectName(network: string, contractId: string): string {
    return `admission:${network}:${contractId}`;
}

export function sanitizeForLog(value: unknown, key = ''): unknown {
    if (isSensitiveLogKey(key)) return '[REDACTED]';
    if (typeof value === 'string'
        && /^https?:\/\//i.test(value)
        && /(?:tus|upload)/i.test(value)) return '[REDACTED]';
    if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item));
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([childKey, child]) => [
                childKey,
                sanitizeForLog(child, childKey),
            ]),
        );
    }
    return value;
}

function isSensitiveLogKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return normalized.includes('authorization')
        || normalized.includes('secret')
        || normalized.includes('token')
        || normalized.includes('tus')
        || (normalized.includes('upload') && normalized.includes('url'))
        || (normalized.includes('signed') && normalized.includes('transaction'))
        || (normalized.includes('private') && normalized.includes('key'));
}

export function formatLog(event: string, details: JsonObject): string {
    return JSON.stringify({ event, details: sanitizeForLog(details) });
}

function logJobStateTransition(
    fromState: JobRecord['state'] | null,
    toState: JobRecord['state'],
): void {
    if (fromState === toState) return;
    console.info(formatLog('state_transition', {
        stateKind: 'upload_job',
        fromState: fromState || 'NONE',
        toState,
    }));
}

const JOB_STATE_TRANSITIONS: Record<JobState, ReadonlySet<JobState>> = {
    AUTHORIZED: new Set(['LEASED', 'UPLOAD_EXPIRED', 'CANCELLED']),
    LEASED: new Set(['PROVIDER_CREATE_PENDING', 'UPLOAD_EXPIRED', 'CANCELLED']),
    PROVIDER_CREATE_PENDING: new Set(['CREATE_AMBIGUOUS', 'UPLOAD_READY', 'UPLOAD_EXPIRED']),
    CREATE_PENDING: new Set(['CREATE_AMBIGUOUS', 'UPLOAD_READY']),
    CREATE_AMBIGUOUS: new Set(),
    UPLOAD_READY: new Set(['UPLOADING', 'PROCESSING', 'READY_VERIFIED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED']),
    UPLOADING: new Set(['PROCESSING', 'READY_VERIFIED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED']),
    PROCESSING: new Set(['READY_VERIFIED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED']),
    READY_VERIFIED: new Set(['FINALIZE_QUEUED', 'FINALIZE_RETRY', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'ONCHAIN_PUBLISHED']),
    FINALIZE_QUEUED: new Set(['FINALIZE_RETRY', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'ONCHAIN_PUBLISHED']),
    FINALIZE_RETRY: new Set(['FINALIZE_QUEUED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'ONCHAIN_PUBLISHED']),
    UPLOAD_EXPIRED: new Set(),
    PROVIDER_FAILED: new Set(),
    ONCHAIN_PUBLISHED: new Set(),
    CANCELLED: new Set(),
};

function transitionJob(record: JobRecord, state: JobState): JobRecord {
    if (record.state === state) return record;
    if (!JOB_STATE_TRANSITIONS[record.state].has(state)) throw new Error('invalid_job_transition');
    const now = Date.now();
    const terminal = ['UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'CANCELLED'].includes(state);
    return {
        ...record,
        state,
        stateChangedAtMs: now,
        ...(terminal ? {
            terminalAtMs: now,
            terminalArchive: {
                status: 'PENDING',
                attempts: 0,
                createdAtMs: now,
                nextAttemptAtMs: now,
            },
        } : {}),
    };
}

function publicBetaDeadlineExpired(record: JobRecord): boolean {
    return record.absoluteDeadlineAtMs !== undefined && record.absoluteDeadlineAtMs <= Date.now();
}

async function parseUploadIntentRequest(request: Request, env: Env): Promise<UploadIntentRequest> {
    const value = await readJsonObject(request);
    requireExactKeys(value, ['body', 'envelope'], 'invalid_control_request');
    const body = parseUploadBody(value.body);
    const envelope = parseControlEnvelope(value.envelope);
    const bodySha256 = await sha256Hex(canonicalJson(body));

    if (envelope.version !== '3'
        || envelope.route !== '/v1/upload-intents'
        || envelope.body_sha256 !== bodySha256
        || envelope.resource !== `job:${body.job_id}:${body.generation}`
        || request.headers.get('Origin') !== envelope.origin) {
        throw new Error('protocol_binding_mismatch');
    }
    if (envelope.network !== env.NEAR_NETWORK || envelope.contract_id !== env.MARKET_CONTRACT_ID) {
        throw new Error('deployment_binding_mismatch');
    }
    if (!allowedOrigins(env).has(envelope.origin)) throw new Error('origin_denied');
    const now = BigInt(Date.now());
    const expiresAt = BigInt(envelope.expires_at_ms);
    if (expiresAt <= now || expiresAt > now + BigInt(CONTROL_MAX_FUTURE_MS)) {
        throw new Error('control_request_expired');
    }
    return { body, envelope };
}

async function parseUploadHeartbeatRequest(
    request: Request,
    env: Env,
): Promise<UploadHeartbeatRequest> {
    const value = await readJsonObject(request);
    requireExactKeys(value, ['body', 'envelope'], 'invalid_control_request');
    const body = parseUploadHeartbeatBody(value.body);
    const envelope = parseControlEnvelope(value.envelope);
    const bodySha256 = await sha256Hex(canonicalJson(body));
    if (envelope.version !== '2'
        || envelope.route !== '/v1/upload-heartbeats'
        || envelope.body_sha256 !== bodySha256
        || envelope.resource !== `job:${body.job_id}:${body.generation}`
        || request.headers.get('Origin') !== envelope.origin) {
        throw new Error('protocol_binding_mismatch');
    }
    if (envelope.network !== env.NEAR_NETWORK || envelope.contract_id !== env.MARKET_CONTRACT_ID) {
        throw new Error('deployment_binding_mismatch');
    }
    if (!allowedOrigins(env).has(envelope.origin)) throw new Error('origin_denied');
    const now = BigInt(Date.now());
    const expiresAt = BigInt(envelope.expires_at_ms);
    if (expiresAt <= now || expiresAt > now + BigInt(CONTROL_MAX_FUTURE_MS)) {
        throw new Error('control_request_expired');
    }
    return { body, envelope };
}

async function parseUploadCancellationRequest(
    request: Request,
    env: Env,
): Promise<UploadCancellationRequest> {
    const value = await readJsonObject(request);
    requireExactKeys(value, ['body', 'envelope'], 'invalid_control_request');
    const body = parseUploadCancellationBody(value.body);
    const envelope = parseControlEnvelope(value.envelope);
    const bodySha256 = await sha256Hex(canonicalJson(body));
    if (envelope.version !== '2'
        || envelope.route !== '/v1/upload-cancellations'
        || envelope.body_sha256 !== bodySha256
        || envelope.resource !== `job:${body.job_id}:${body.generation}`
        || request.headers.get('Origin') !== envelope.origin) {
        throw new Error('protocol_binding_mismatch');
    }
    if (envelope.network !== env.NEAR_NETWORK || envelope.contract_id !== env.MARKET_CONTRACT_ID) {
        throw new Error('deployment_binding_mismatch');
    }
    if (!allowedOrigins(env).has(envelope.origin)) throw new Error('origin_denied');
    const now = BigInt(Date.now());
    const expiresAt = BigInt(envelope.expires_at_ms);
    if (expiresAt <= now || expiresAt > now + BigInt(CONTROL_MAX_FUTURE_MS)) {
        throw new Error('control_request_expired');
    }
    return { body, envelope };
}

async function parsePlaybackTokenRequest(request: Request, env: Env): Promise<PlaybackTokenRequest> {
    const value = await readJsonObject(request);
    const hasShadowV2 = Object.hasOwn(value, 'shadow_v2');
    requireExactKeys(
        value,
        hasShadowV2 ? ['body', 'envelope', 'shadow_v2'] : ['body', 'envelope'],
        'invalid_control_request',
    );
    const body = parsePlaybackTokenBody(value.body);
    const envelope = parseControlEnvelope(value.envelope);
    const bodySha256 = await sha256Hex(canonicalJson(body));

    if (envelope.version !== '2'
        || envelope.route !== '/v1/playback-tokens'
        || envelope.body_sha256 !== bodySha256
        || envelope.resource !== `playback:${body.job_id}:${body.generation}:${body.playback_id}`
        || body.grant_id !== `play:${body.job_id}:${envelope.account_id}`
        || request.headers.get('Origin') !== envelope.origin
        || body.origin_hash !== await sha256Hex(envelope.origin)) {
        throw new Error('protocol_binding_mismatch');
    }
    if (envelope.network !== env.NEAR_NETWORK || envelope.contract_id !== env.MARKET_CONTRACT_ID) {
        throw new Error('deployment_binding_mismatch');
    }
    if (!allowedOrigins(env).has(envelope.origin)) throw new Error('origin_denied');
    const now = BigInt(Date.now());
    const expiresAt = BigInt(envelope.expires_at_ms);
    if (expiresAt <= now || expiresAt > now + BigInt(CONTROL_MAX_FUTURE_MS)) {
        throw new Error('control_request_expired');
    }
    return { body, envelope, ...(hasShadowV2 ? { shadowV2: value.shadow_v2 } : {}) };
}

async function parsePlaybackV2Request(request: Request, env: Env): Promise<PlaybackV2Request> {
    const value = await readJsonObject(request);
    requireExactKeys(value, [
        'body',
        'certificate',
        'certificate_proof',
        'request',
        'request_signature',
    ], 'invalid_playback_v2_request');
    const body = parsePlaybackV2Body(value.body);
    const certificate = parseDeviceSessionCertificate(value.certificate);
    const certificateProof = parseDeviceCertificateProof(value.certificate_proof);
    const playbackRequest = parsePlaybackV2Envelope(value.request);
    if (typeof value.request_signature !== 'string'
        || value.request_signature.length > 128
        || /[\r\n]/.test(value.request_signature)) {
        throw new Error('invalid_playback_v2_request');
    }

    const origin = request.headers.get('Origin') || '';
    if (origin !== playbackRequest.origin
        || !allowedOrigins(env).has(origin)
        || certificate.origin_hash !== await sha256Hex(origin)
        || playbackRequest.network !== env.NEAR_NETWORK
        || certificate.network !== env.NEAR_NETWORK
        || playbackRequest.contract_id !== env.MARKET_CONTRACT_ID
        || playbackRequest.account_id !== certificate.account_id
        || playbackRequest.body_sha256 !== await sha256Hex(canonicalJson(body))
        || playbackRequest.certificate_sha256 !== await sha256Hex(canonicalJson(certificate))) {
        throw new Error('protocol_binding_mismatch');
    }

    const now = BigInt(Date.now());
    const requestExpiresAt = BigInt(playbackRequest.request_expires_at_ms);
    const issuedAt = BigInt(certificate.issued_at_ms);
    const certificateExpiresAt = BigInt(certificate.expires_at_ms);
    if (requestExpiresAt <= now || requestExpiresAt > now + BigInt(CONTROL_MAX_FUTURE_MS)
        || issuedAt > now
        || certificateExpiresAt <= now
        || certificateExpiresAt > now + BigInt(DEVICE_CERTIFICATE_MAX_LIFETIME_MS)
        || certificateExpiresAt - issuedAt > BigInt(DEVICE_CERTIFICATE_MAX_LIFETIME_MS)) {
        throw new Error('playback_denied');
    }

    return {
        body,
        certificate,
        certificateProof,
        request: playbackRequest,
        requestSignature: value.request_signature,
    };
}

function parsePlaybackV2Body(value: unknown): PlaybackV2Body {
    const body = requireObject(value, 'invalid_playback_v2_request');
    requireExactKeys(body, ['publication_id', 'generation', 'playback_id'], 'invalid_playback_v2_request');
    if (typeof body.publication_id !== 'string'
        || !JOB_ID_PATTERN.test(body.publication_id)
        || !Number.isSafeInteger(body.generation)
        || (body.generation as number) < 1
        || typeof body.playback_id !== 'string'
        || !PLAYBACK_ID_PATTERN.test(body.playback_id)) {
        throw new Error('invalid_playback_v2_request');
    }
    return body as PlaybackV2Body;
}

function parseDeviceSessionCertificate(value: unknown): DeviceSessionCertificate {
    const certificate = requireObject(value, 'invalid_playback_v2_request');
    requireExactKeys(certificate, [
        'domain',
        'version',
        'network',
        'account_id',
        'session_public_key',
        'origin_hash',
        'scopes',
        'issued_at_ms',
        'expires_at_ms',
    ], 'invalid_playback_v2_request');
    if (certificate.domain !== 'youtick.device-session'
        || certificate.version !== '1'
        || !['testnet', 'mainnet'].includes(String(certificate.network))
        || typeof certificate.account_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(certificate.account_id)
        || typeof certificate.session_public_key !== 'string'
        || !SESSION_KEY_PATTERN.test(certificate.session_public_key)
        || typeof certificate.origin_hash !== 'string'
        || !SHA256_PATTERN.test(certificate.origin_hash)
        || !Array.isArray(certificate.scopes)
        || certificate.scopes.length !== 1
        || certificate.scopes[0] !== 'play'
        || typeof certificate.issued_at_ms !== 'string'
        || !/^[1-9][0-9]{12,15}$/.test(certificate.issued_at_ms)
        || typeof certificate.expires_at_ms !== 'string'
        || !/^[1-9][0-9]{12,15}$/.test(certificate.expires_at_ms)) {
        throw new Error('invalid_playback_v2_request');
    }
    return certificate as DeviceSessionCertificate;
}

function parseDeviceCertificateProof(value: unknown): DeviceCertificateProof {
    const proof = requireObject(value, 'invalid_playback_v2_request');
    requireExactKeys(proof, ['public_key', 'signature', 'nonce'], 'invalid_playback_v2_request');
    if (typeof proof.public_key !== 'string'
        || !SESSION_KEY_PATTERN.test(proof.public_key)
        || typeof proof.signature !== 'string'
        || proof.signature.length > 128
        || /[\r\n]/.test(proof.signature)
        || typeof proof.nonce !== 'string'
        || !NONCE_PATTERN.test(proof.nonce)) {
        throw new Error('invalid_playback_v2_request');
    }
    return proof as DeviceCertificateProof;
}

function parsePlaybackV2Envelope(value: unknown): PlaybackV2Envelope {
    const request = requireObject(value, 'invalid_playback_v2_request');
    requireExactKeys(request, [
        'domain',
        'version',
        'network',
        'contract_id',
        'account_id',
        'origin',
        'request_nonce',
        'request_expires_at_ms',
        'body_sha256',
        'certificate_sha256',
    ], 'invalid_playback_v2_request');
    if (request.domain !== 'youtick.playback-request'
        || request.version !== '1'
        || !['testnet', 'mainnet'].includes(String(request.network))
        || typeof request.contract_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(request.contract_id)
        || typeof request.account_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(request.account_id)
        || typeof request.origin !== 'string'
        || !isAllowedControlOrigin(request.origin)
        || typeof request.request_nonce !== 'string'
        || !NONCE_PATTERN.test(request.request_nonce)
        || typeof request.request_expires_at_ms !== 'string'
        || !/^[1-9][0-9]{12,15}$/.test(request.request_expires_at_ms)
        || typeof request.body_sha256 !== 'string'
        || !SHA256_PATTERN.test(request.body_sha256)
        || typeof request.certificate_sha256 !== 'string'
        || !SHA256_PATTERN.test(request.certificate_sha256)) {
        throw new Error('invalid_playback_v2_request');
    }
    return request as PlaybackV2Envelope;
}

function parsePlaybackTokenBody(value: unknown): PlaybackTokenBody {
    const body = requireObject(value, 'invalid_playback_request');
    requireExactKeys(body, [
        'job_id',
        'generation',
        'playback_id',
        'grant_id',
        'origin_hash',
        'device_hash',
        'requested_ttl_seconds',
    ], 'invalid_playback_request');
    if (typeof body.job_id !== 'string'
        || !JOB_ID_PATTERN.test(body.job_id)
        || !Number.isSafeInteger(body.generation)
        || (body.generation as number) < 1
        || typeof body.playback_id !== 'string'
        || !PLAYBACK_ID_PATTERN.test(body.playback_id)
        || typeof body.grant_id !== 'string'
        || body.grant_id.length > 256
        || /[\r\n]/.test(body.grant_id)
        || typeof body.origin_hash !== 'string'
        || !SHA256_PATTERN.test(body.origin_hash)
        || typeof body.device_hash !== 'string'
        || !SHA256_PATTERN.test(body.device_hash)
        || !Number.isSafeInteger(body.requested_ttl_seconds)
        || (body.requested_ttl_seconds as number) < PLAYBACK_MIN_TTL_SECONDS
        || (body.requested_ttl_seconds as number) > PLAYBACK_MAX_TTL_SECONDS) {
        throw new Error('invalid_playback_request');
    }
    return body as PlaybackTokenBody;
}

function parseUploadBody(value: unknown): UploadIntentBody {
    const body = requireObject(value, 'invalid_upload_intent');
    const keys = [
        'job_id',
        'generation',
        'expected_source_bytes',
        'source_fingerprint_sha256',
        'source_type',
        'profile_id',
        'profile_config_sha256',
    ];
    requireExactKeys(body, body.recovery === undefined ? keys : [...keys, 'recovery'], 'invalid_upload_intent');
    if (typeof body.job_id !== 'string'
        || !JOB_ID_PATTERN.test(body.job_id)
        || !Number.isSafeInteger(body.generation)
        || (body.generation as number) < 1
        || typeof body.expected_source_bytes !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(body.expected_source_bytes)
        || BigInt(body.expected_source_bytes) > MAX_SOURCE_BYTES
        || typeof body.source_fingerprint_sha256 !== 'string'
        || !SHA256_PATTERN.test(body.source_fingerprint_sha256)
        || !isLivepeerSourceType(body.source_type)
        || body.profile_id !== 'paid-media-livepeer-v1'
        || body.profile_config_sha256 !== PROFILE_CONFIG_SHA256
        || (body.recovery !== undefined && body.recovery !== 'reconcile')) {
        throw new Error('invalid_upload_intent');
    }
    return body as UploadIntentBody;
}

function parseUploadHeartbeatBody(value: unknown): UploadHeartbeatBody {
    const body = requireObject(value, 'invalid_upload_intent');
    requireExactKeys(body, ['job_id', 'generation', 'lease_id'], 'invalid_upload_intent');
    if (typeof body.job_id !== 'string'
        || !JOB_ID_PATTERN.test(body.job_id)
        || !Number.isSafeInteger(body.generation)
        || (body.generation as number) < 1
        || typeof body.lease_id !== 'string'
        || !LEASE_ID_PATTERN.test(body.lease_id)) {
        throw new Error('invalid_upload_intent');
    }
    return body as UploadHeartbeatBody;
}

function parseUploadCancellationBody(value: unknown): UploadCancellationBody {
    const body = requireObject(value, 'invalid_upload_intent');
    requireExactKeys(body, ['job_id', 'generation'], 'invalid_upload_intent');
    if (typeof body.job_id !== 'string'
        || !JOB_ID_PATTERN.test(body.job_id)
        || !Number.isSafeInteger(body.generation)
        || (body.generation as number) < 1) {
        throw new Error('invalid_upload_intent');
    }
    return body as UploadCancellationBody;
}

function isLivepeerSourceType(value: unknown): value is LivepeerSourceType {
    return typeof value === 'string' && Object.hasOwn(MEDIA_SOURCE_FORMATS, value);
}

function parseControlEnvelope(value: unknown): ControlEnvelope {
    const envelope = requireObject(value, 'invalid_control_envelope');
    requireExactKeys(envelope, [
        'domain',
        'version',
        'method',
        'route',
        'network',
        'contract_id',
        'account_id',
        'resource',
        'session_public_key',
        'origin',
        'device_nonce',
        'expires_at_ms',
        'body_sha256',
    ], 'invalid_control_envelope');
    if (envelope.domain !== 'youtick.paid-media-livepeer-v1.control'
        || !['2', '3'].includes(String(envelope.version))
        || envelope.method !== 'POST'
        || !['/v1/upload-intents', '/v1/upload-heartbeats', '/v1/upload-cancellations', '/v1/playback-tokens']
            .includes(String(envelope.route))
        || !['testnet', 'mainnet'].includes(String(envelope.network))
        || typeof envelope.contract_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(envelope.contract_id)
        || typeof envelope.account_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(envelope.account_id)
        || typeof envelope.resource !== 'string'
        || /[\r\n]/.test(envelope.resource)
        || typeof envelope.session_public_key !== 'string'
        || !SESSION_KEY_PATTERN.test(envelope.session_public_key)
        || typeof envelope.origin !== 'string'
        || !isAllowedControlOrigin(envelope.origin)
        || typeof envelope.device_nonce !== 'string'
        || !NONCE_PATTERN.test(envelope.device_nonce)
        || typeof envelope.expires_at_ms !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(envelope.expires_at_ms)
        || typeof envelope.body_sha256 !== 'string'
        || !SHA256_PATTERN.test(envelope.body_sha256)) {
        throw new Error('invalid_control_envelope');
    }
    return envelope as ControlEnvelope;
}

async function readFinalMediaJob(env: Env, jobId: string): Promise<FinalJob> {
    if (!isHttpsUrl(env.NEAR_RPC_URL) || !ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')) {
        throw new Error('runtime_not_configured');
    }
    let response: Response;
    let payload: { result?: { result?: number[]; block_hash?: unknown }; error?: unknown };
    try {
        response = await dependencyFetch('near_rpc', 'get_media_job', env.NEAR_RPC_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'paid-media-livepeer-v1-job',
                method: 'query',
                params: {
                    request_type: 'call_function',
                    finality: 'final',
                    account_id: env.MARKET_CONTRACT_ID,
                    method_name: 'get_media_job',
                    args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify({ job_id: jobId }))),
                },
            }),
            signal: AbortSignal.timeout(2_500),
        });
        payload = await response.json() as typeof payload;
    } catch {
        throw new Error('near_job_query_failed');
    }
    if (!response.ok
        || payload.error
        || !Array.isArray(payload.result?.result)
        || typeof payload.result.block_hash !== 'string') {
        throw new Error('near_job_query_failed');
    }
    const raw = new TextDecoder().decode(new Uint8Array(payload.result.result));
    let job: unknown;
    try {
        job = raw ? JSON.parse(raw) as unknown : null;
    } catch {
        throw new Error('near_job_response_invalid');
    }
    if (!job || typeof job !== 'object' || Array.isArray(job)) throw new Error('near_job_not_found');
    return { job: job as OnChainJob, blockHash: payload.result.block_hash };
}

async function readFinalPublicTestnetBetaJob(
    env: Env,
    jobId: string,
): Promise<PublicTestnetBetaJob | null> {
    const value = await readFinalPublicTestnetBetaView(
        env,
        'get_public_testnet_beta_job',
        { job_id: jobId },
    );
    return value === null
        ? null
        : requireObject(value, 'near_job_response_invalid') as PublicTestnetBetaJob;
}

async function readFinalPublicTestnetBetaState(env: Env): Promise<PublicTestnetBetaState | null> {
    const value = await readFinalPublicTestnetBetaView(
        env,
        'get_public_testnet_beta_state',
        {},
    );
    return value === null
        ? null
        : requireObject(value, 'near_job_response_invalid') as PublicTestnetBetaState;
}

async function hasFinalPublicTestnetBetaJobToday(env: Env, creatorId: string): Promise<boolean> {
    const value = await readFinalPublicTestnetBetaView(
        env,
        'has_public_testnet_beta_job_today',
        { creator_id: creatorId },
    );
    if (typeof value !== 'boolean') throw new Error('near_job_response_invalid');
    return value;
}

async function requireActivePublicTestnetBetaForPlayback(env: Env): Promise<void> {
    if (!isPublicBetaPacket(env)) return;
    const state = await readFinalPublicTestnetBetaState(env);
    if (!state
        || state.version !== 1
        || state.closed_at_ms !== null
        || !Number.isSafeInteger(Number(state.ends_at_ms))
        || Number(state.ends_at_ms) <= Date.now()) {
        throw new Error('playback_denied');
    }
}

async function readFinalPublicTestnetBetaView(
    env: Env,
    methodName: string,
    args: JsonObject,
): Promise<unknown> {
    const payload = await nearRpc(env, {
        request_type: 'call_function',
        finality: 'final',
        account_id: env.MARKET_CONTRACT_ID,
        method_name: methodName,
        args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify(args))),
    });
    const result = requireObject(payload.result, 'near_job_query_failed');
    if (!Array.isArray(result.result)) throw new Error('near_job_query_failed');
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(Uint8Array.from(result.result as number[])));
    } catch {
        throw new Error('near_job_response_invalid');
    }
    return value;
}

async function requirePublicTestnetBetaJob(
    input: UploadIntentRequest | UploadHeartbeatRequest,
    job: OnChainJob,
    marker: PublicTestnetBetaJob | null,
    state: PublicTestnetBetaState | null,
): Promise<void> {
    const now = Date.now();
    const request = {
        creator_id: job.creator_id,
        job_id: job.job_id,
        title: job.title,
        price_usdc: job.price_usdc,
        expected_source_bytes: job.expected_source_bytes,
        profile_id: job.profile_id,
        profile_config_sha256: job.profile_config_sha256,
        upload_public_key: job.upload_public_key,
        upload_key_expires_at_ms: job.upload_key_expires_at_ms,
    };
    const admittedAtMs = Number(marker?.admitted_at_ms);
    const deadlineAtMs = Number(marker?.deadline_at_ms);
    const endsAtMs = Number(state?.ends_at_ms);
    if (!marker
        || !state
        || state.version !== 1
        || state.closed_at_ms !== null
        || !Number.isSafeInteger(endsAtMs)
        || endsAtMs <= now
        || marker.creator_id !== input.envelope.account_id
        || marker.generation !== 1
        || input.body.generation !== 1
        || marker.sponsor_quote_id !== job.fee_quote_hash
        || marker.request_sha256 !== await sha256Hex(JSON.stringify(request))
        || !Number.isSafeInteger(admittedAtMs)
        || !Number.isSafeInteger(deadlineAtMs)
        || deadlineAtMs <= now
        || deadlineAtMs > admittedAtMs + PUBLIC_TESTNET_BETA_JOB_TTL_MS
        || deadlineAtMs > endsAtMs
        || BigInt(String(job.expected_source_bytes)) > PUBLIC_TESTNET_BETA_MAX_SOURCE_BYTES) {
        throw new Error('on_chain_job_mismatch');
    }
}

async function verifyControlSignature(request: Request, envelope: ControlEnvelope): Promise<void> {
    const signature = request.headers.get('X-Youtick-Signature') || '';
    let signatureBytes: Uint8Array;
    try {
        signatureBytes = base64Decode(signature);
    } catch {
        throw new Error('invalid_control_request');
    }
    let publicKeyBytes: Uint8Array;
    try {
        publicKeyBytes = base58Decode(envelope.session_public_key);
    } catch {
        throw new Error('invalid_control_request');
    }
    if (signatureBytes.length !== 64 || publicKeyBytes.length !== 32) {
        throw new Error('invalid_control_request');
    }
    const key = await crypto.subtle.importKey('raw', publicKeyBytes, 'Ed25519', false, ['verify']);
    const valid = await crypto.subtle.verify(
        'Ed25519',
        key,
        signatureBytes,
        new TextEncoder().encode(canonicalControlMessage(envelope)),
    );
    if (!valid) throw new Error('invalid_control_request');
}

function canonicalControlMessage(envelope: ControlEnvelope): string {
    return [
        envelope.domain,
        envelope.version,
        envelope.method,
        envelope.route,
        envelope.network,
        envelope.contract_id,
        envelope.account_id,
        envelope.resource,
        envelope.session_public_key,
        envelope.origin,
        envelope.device_nonce,
        envelope.expires_at_ms,
        envelope.body_sha256,
    ].join('\n');
}

function livepeerProvider(env: Env): LivepeerProvider {
    return new LivepeerProvider(env.LIVEPEER_API_KEY, {
        readyVerificationEnabled: validProviderVerificationConfig(env),
        sha256: sha256Hex,
        signPlaybackToken: validPlaybackConfig(env)
            ? (playbackId) => signLivepeerJwt(
                env,
                playbackId,
                Math.floor(Date.now() / 1_000),
                PLAYBACK_MIN_TTL_SECONDS,
            )
            : undefined,
    });
}

function uploadIntentResponse(record: JobRecord, created: boolean): Response {
    if (!['UPLOAD_READY', 'UPLOADING'].includes(record.state)
        || !record.tusEndpoint
        || !record.leaseId
        || !record.leaseExpiresAtMs) {
        throw new Error('provider_create_ambiguous');
    }
    return json({
        schema: 'youtick.livepeer-upload-intent.v2',
        job_id: record.jobId,
        generation: record.generation,
        expected_source_bytes: record.expectedSourceBytes,
        source_type: record.sourceType,
        chunk_bytes: LIVEPEER_TUS_CHUNK_BYTES,
        tus_endpoint: record.tusEndpoint,
        lease_id: record.leaseId,
        lease_expires_at_ms: String(record.leaseExpiresAtMs),
        heartbeat_interval_ms: ADMISSION_LEASE_HEARTBEAT_MS,
        created,
    }, created ? 201 : 200);
}

function requireHeartbeatChainJob(input: UploadHeartbeatRequest, job: OnChainJob): void {
    if (job.job_id !== input.body.job_id
        || job.creator_id !== input.envelope.account_id
        || job.generation !== input.body.generation
        || job.status !== 'Authorized'
        || job.upload_public_key !== input.envelope.session_public_key
        || typeof job.upload_key_expires_at_ms !== 'string'
        || !/^[1-9][0-9]{0,15}$/.test(job.upload_key_expires_at_ms)
        || BigInt(job.upload_key_expires_at_ms) <= BigInt(Date.now())) {
        throw new Error('on_chain_job_mismatch');
    }
}

function requireCancellationChainJob(input: UploadCancellationRequest, job: OnChainJob): void {
    if (job.job_id !== input.body.job_id
        || job.creator_id !== input.envelope.account_id
        || job.generation !== input.body.generation
        || job.status !== 'Authorized'
        || job.upload_public_key !== input.envelope.session_public_key
        || typeof job.upload_key_expires_at_ms !== 'string'
        || !/^[1-9][0-9]{0,15}$/.test(job.upload_key_expires_at_ms)
        || BigInt(job.upload_key_expires_at_ms) <= BigInt(Date.now())) {
        throw new Error('on_chain_job_mismatch');
    }
}

function requireExactChainJob(input: UploadIntentRequest, job: OnChainJob): void {
    if (job.job_id !== input.body.job_id
        || job.creator_id !== input.envelope.account_id
        || job.profile_id !== input.body.profile_id
        || job.profile_config_sha256 !== input.body.profile_config_sha256
        || job.expected_source_bytes !== input.body.expected_source_bytes
        || job.generation !== input.body.generation
        || job.status !== 'Authorized'
        || job.upload_public_key !== input.envelope.session_public_key
        || typeof job.upload_key_expires_at_ms !== 'string'
        || !/^[1-9][0-9]{0,15}$/.test(job.upload_key_expires_at_ms)
        || BigInt(job.upload_key_expires_at_ms) <= BigInt(Date.now())) {
        throw new Error('on_chain_job_mismatch');
    }
}

function jobRecord(
    input: UploadIntentRequest,
    env: Env,
    absoluteDeadlineAtMs?: string,
): JobRecord {
    if (typeof env.LIVEPEER_API_TOKEN_NAME !== 'string'
        || env.LIVEPEER_API_TOKEN_NAME.length < 1
        || env.LIVEPEER_API_TOKEN_NAME.length > 128) {
        throw new Error('runtime_not_configured');
    }
    const createdAtMs = Date.now();
    return {
        schema: 'youtick.livepeer-control-job.v2',
        state: 'AUTHORIZED',
        network: input.envelope.network,
        contractId: input.envelope.contract_id,
        jobId: input.body.job_id,
        generation: input.body.generation,
        creator: input.envelope.account_id,
        expectedSourceBytes: input.body.expected_source_bytes,
        sourceFingerprintSha256: input.body.source_fingerprint_sha256,
        sourceType: input.body.source_type,
        profileId: input.body.profile_id,
        profileConfigSha256: input.body.profile_config_sha256,
        createdAtMs,
        stateChangedAtMs: createdAtMs,
        apiTokenName: env.LIVEPEER_API_TOKEN_NAME,
        ...(absoluteDeadlineAtMs === undefined
            ? {}
            : { absoluteDeadlineAtMs: Number(absoluteDeadlineAtMs) }),
    };
}

async function issueStatelessPlaybackToken(request: Request, env: Env): Promise<Response> {
    const startedAtMs = Date.now();
    try {
        const input = await parsePlaybackV2Request(request, env);
        await enforcePublicBetaAccountRateLimit(
            env,
            '/v2/playback-tokens',
            input.request.account_id,
        );
        await requireActivePublicTestnetBetaForPlayback(env);
        const certificateCacheHit = await verifyPlaybackV2Proofs(env, input);
        const authorization = await readStatelessPlaybackAuthorization(env, input);
        const nowMs = Date.now();
        const certificateRemainingSeconds = Math.floor(
            (Number(input.certificate.expires_at_ms) - nowMs) / 1000,
        );
        if (certificateRemainingSeconds < 1) throw new Error('playback_denied');
        const ttlSeconds = Math.min(PLAYBACK_V2_TTL_SECONDS, certificateRemainingSeconds);
        const issuedAtSeconds = Math.floor(nowMs / 1000);
        const token = await signLivepeerJwt(
            env,
            input.body.playback_id,
            issuedAtSeconds,
            ttlSeconds,
        );
        const cacheHits = [
            certificateCacheHit,
            authorization.publicationCacheHit,
            authorization.entitlementCacheHit,
            authorization.providerCacheHit,
        ];
        console.info(formatLog('stateless_playback_authorization_completed', {
            cacheResult: cacheHits.every(Boolean) ? 'HIT' : 'MISS',
            rpcCalls: Number(!certificateCacheHit)
                + Number(!authorization.publicationCacheHit)
                + Number(!authorization.entitlementCacheHit),
            providerCalls: Number(!authorization.providerCacheHit),
            latencyMs: Math.max(0, Date.now() - startedAtMs),
        }));
        return json({
            schema: 'youtick.livepeer-playback-token.v2',
            playback_id: input.body.playback_id,
            token,
            expires_at_ms: String((issuedAtSeconds + ttlSeconds) * 1000),
            hls_url: livepeerHlsUrl(input.body.playback_id),
        });
    } catch (error) {
        const code = safeErrorCode(error);
        const httpCode = errorStatus(code);
        console.error(formatLog('stateless_playback_request_failed', { code, httpCode }));
        return json({ error: code }, httpCode);
    }
}

async function verifyPlaybackV2Proofs(env: Env, input: PlaybackV2Request): Promise<boolean> {
    await verifyEd25519Signature(
        input.certificate.session_public_key,
        input.requestSignature,
        canonicalPlaybackV2Message(input.request),
    );

    const cacheKey = await playbackCacheKey(env, 'certificate', canonicalJson({
        certificate: input.certificate,
        proof: input.certificateProof,
    }));
    if (playbackCacheGet<boolean>(cacheKey) === true) return true;

    let signature: Uint8Array;
    let nonce: Uint8Array;
    try {
        signature = base64Decode(input.certificateProof.signature);
        nonce = base64UrlDecode(input.certificateProof.nonce);
    } catch {
        throw new Error('playback_denied');
    }
    if (signature.length !== 64 || nonce.length !== 32) throw new Error('playback_denied');

    try {
        await verifyNep413Message({
            signerAccountId: input.certificate.account_id,
            signerPublicKey: input.certificateProof.public_key,
            payload: {
                message: canonicalJson(input.certificate),
                recipient: env.MARKET_CONTRACT_ID!,
                nonce,
            },
            signature,
            provider: {
                viewAccessKey: async ({ accountId, publicKey }: { accountId: string; publicKey: unknown }) => (
                    readFinalAccessKey(env, accountId, String(publicKey))
                ),
            } as never,
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'playback_authorization_unavailable') throw error;
        throw new Error('playback_denied');
    }
    playbackCachePut(
        cacheKey,
        true,
        Math.min(
            Date.now() + DEVICE_CERTIFICATE_CACHE_MS,
            Number(input.certificate.expires_at_ms),
        ),
    );
    return false;
}

async function verifyEd25519Signature(
    publicKey: string,
    encodedSignature: string,
    message: string,
): Promise<void> {
    let signature: Uint8Array;
    let publicKeyBytes: Uint8Array;
    try {
        signature = base64Decode(encodedSignature);
        publicKeyBytes = base58Decode(publicKey);
    } catch {
        throw new Error('playback_denied');
    }
    if (signature.length !== 64 || publicKeyBytes.length !== 32) throw new Error('playback_denied');
    const key = await crypto.subtle.importKey('raw', publicKeyBytes, 'Ed25519', false, ['verify']);
    if (!await crypto.subtle.verify(
        'Ed25519',
        key,
        signature,
        new TextEncoder().encode(message),
    )) {
        throw new Error('playback_denied');
    }
}

function canonicalPlaybackV2Message(request: PlaybackV2Envelope): string {
    return [
        request.domain,
        request.version,
        request.network,
        request.contract_id,
        request.account_id,
        request.origin,
        request.request_nonce,
        request.request_expires_at_ms,
        request.body_sha256,
        request.certificate_sha256,
    ].join('\n');
}

async function readFinalAccessKey(
    env: Env,
    accountId: string,
    publicKey: string,
): Promise<{ permission: 'FullAccess' | JsonObject }> {
    let response: Response;
    let payload: { result?: { permission?: unknown }; error?: unknown };
    try {
        response = await dependencyFetch('near_rpc', 'device_certificate_key', env.NEAR_RPC_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'youtick-device-certificate-key',
                method: 'query',
                params: {
                    request_type: 'view_access_key',
                    finality: 'final',
                    account_id: accountId,
                    public_key: publicKey,
                },
            }),
            signal: AbortSignal.timeout(2_500),
        });
        payload = await response.json() as typeof payload;
    } catch {
        throw new Error('playback_authorization_unavailable');
    }
    if (!response.ok) throw new Error('playback_authorization_unavailable');
    if (payload.error) {
        const detail = JSON.stringify(payload.error);
        throw new Error(/UNKNOWN_ACCESS_KEY|does not exist|not found/i.test(detail)
            ? 'playback_denied'
            : 'playback_authorization_unavailable');
    }
    if (payload.result?.permission !== 'FullAccess') throw new Error('playback_denied');
    return { permission: 'FullAccess' };
}

async function readStatelessPlaybackAuthorization(
    env: Env,
    input: PlaybackV2Request,
): Promise<{
    publicationCacheHit: boolean;
    entitlementCacheHit: boolean;
    providerCacheHit: boolean;
}> {
    const publicationCacheKey = await playbackCacheKey(
        env,
        'publication',
        input.body.publication_id,
    );
    let publication = playbackCacheGet<JsonObject>(publicationCacheKey);
    const publicationCacheHit = publication !== undefined;
    let publicationBlockHash: string | undefined;
    if (!publication) {
        const publicationRead = await nearPlaybackView(
            env,
            env.MARKET_CONTRACT_ID!,
            'get_publication',
            { publication_id: input.body.publication_id },
        );
        publication = requireObject(publicationRead.value, 'playback_denied');
        publicationBlockHash = publicationRead.blockHash;
    }
    logTakedownPlaybackAttempt(publication, 'DEVICE_SESSION_CERTIFICATE');
    if (publication.publication_id !== input.body.publication_id
        || publication.generation !== input.body.generation
        || publication.playback_id !== input.body.playback_id
        || publication.profile_id !== 'paid-media-livepeer-v1'
        || publication.profile_config_sha256 !== PROFILE_CONFIG_SHA256
        || !['ACTIVE', 'SALES_SUSPENDED'].includes(String(publication.availability))) {
        throw new Error('playback_denied');
    }
    if (publicationBlockHash) {
        playbackCachePut(
            publicationCacheKey,
            publication,
            Date.now() + PUBLICATION_CACHE_MS,
        );
    }

    const tupleHash = await sha256Hex(canonicalJson(publication));
    const entitlementCacheKey = await playbackCacheKey(
        env,
        'entitlement',
        `${input.certificate.account_id}:${input.body.publication_id}:${tupleHash}`,
    );
    let entitled = playbackCacheGet<boolean>(entitlementCacheKey);
    const entitlementCacheHit = entitled !== undefined;
    if (entitled === undefined) {
        const entitlementRead = await nearPlaybackView(
            env,
            env.MARKET_CONTRACT_ID!,
            'has_entitlement',
            {
                account_id: input.certificate.account_id,
                publication_id: input.body.publication_id,
            },
            publicationBlockHash,
        );
        entitled = entitlementRead.value === true;
        playbackCachePut(
            entitlementCacheKey,
            entitled,
            Date.now() + (entitled
                ? POSITIVE_ENTITLEMENT_CACHE_MS
                : NEGATIVE_ENTITLEMENT_CACHE_MS),
        );
    }
    if (!entitled) throw new Error('playback_denied');

    const providerCacheKey = await playbackCacheKey(
        env,
        'provider-policy',
        input.body.playback_id,
    );
    const providerCacheHit = playbackCacheGet<boolean>(providerCacheKey) === true;
    if (!providerCacheHit) {
        await verifyStatelessProviderPolicy(env, input.body.playback_id);
        playbackCachePut(providerCacheKey, true, Date.now() + PROVIDER_POLICY_CACHE_MS);
    }
    return { publicationCacheHit, entitlementCacheHit, providerCacheHit };
}

async function verifyStatelessProviderPolicy(env: Env, playbackId: string): Promise<void> {
    let playback: JsonObject;
    try {
        playback = await livepeerProvider(env).readPlayback(playbackId);
    } catch (error) {
        if (safeErrorCode(error) === 'provider_unavailable') throw error;
        throw new Error('playback_denied');
    }
    if (playback.kind !== 'vod' || playback.policy !== 'jwt') throw new Error('playback_denied');
}

async function playbackCacheKey(env: Env, kind: string, value: string): Promise<string> {
    return `${env.CF_VERSION_METADATA.id}:${kind}:${await sha256Hex(value)}`;
}

function playbackCacheGet<T>(key: string): T | undefined {
    const entry = playbackAuthorizationCache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtMs <= Date.now()) {
        playbackAuthorizationCache.delete(key);
        return undefined;
    }
    playbackAuthorizationCache.delete(key);
    playbackAuthorizationCache.set(key, entry);
    return entry.value as T;
}

function playbackCachePut(key: string, value: unknown, expiresAtMs: number): void {
    if (expiresAtMs <= Date.now()) return;
    playbackAuthorizationCache.delete(key);
    while (playbackAuthorizationCache.size >= PLAYBACK_CACHE_MAX_RECORDS) {
        const oldest = playbackAuthorizationCache.keys().next().value as string | undefined;
        if (!oldest) break;
        playbackAuthorizationCache.delete(oldest);
    }
    playbackAuthorizationCache.set(key, { value, expiresAtMs });
}

async function readPlaybackAuthorization(
    env: Env,
    input: PlaybackTokenRequest,
): Promise<{ grantExpiresAtMs: number }> {
    if (!validPlaybackConfig(env)) throw new Error('runtime_not_configured');
    const publicationRead = await nearPlaybackView(
        env,
        env.MARKET_CONTRACT_ID!,
        'get_publication',
        { publication_id: input.body.job_id },
    );
    const publication = requireObject(publicationRead.value, 'playback_denied');
    logTakedownPlaybackAttempt(publication, 'LEGACY_SESSION_GRANT');
    if (publication.publication_id !== input.body.job_id
        || publication.generation !== input.body.generation
        || publication.playback_id !== input.body.playback_id
        || !['ACTIVE', 'SALES_SUSPENDED'].includes(String(publication.availability))) {
        throw new Error('playback_denied');
    }

    const [entitlementRead, grantRead, verificationRead] = await Promise.all([
        nearPlaybackView(env, env.MARKET_CONTRACT_ID!, 'has_entitlement', {
            account_id: input.envelope.account_id,
            publication_id: input.body.job_id,
        }, publicationRead.blockHash),
        nearPlaybackView(env, env.ACCESS_CONTRACT_ID!, 'get_session_grant', {
            session_pk: input.envelope.session_public_key,
        }, publicationRead.blockHash),
        nearPlaybackView(env, env.ACCESS_CONTRACT_ID!, 'verify_session_grant', {
            session_pk: input.envelope.session_public_key,
            scope: 'Play',
            resource_id: input.body.job_id,
            origin_hash: input.body.origin_hash,
            device_hash: input.body.device_hash,
        }, publicationRead.blockHash),
    ]);
    const grant = requireObject(grantRead.value, 'playback_denied');
    const verification = requireObject(verificationRead.value, 'playback_denied');
    if (entitlementRead.value !== true
        || verification.valid !== true
        || verification.owner_id !== input.envelope.account_id
        || grant.owner_id !== input.envelope.account_id
        || grant.session_pk !== input.envelope.session_public_key
        || grant.scope !== 'Play'
        || grant.resource_id !== input.body.job_id
        || grant.origin_hash !== input.body.origin_hash
        || grant.device_hash !== input.body.device_hash
        || grant.revoked !== false
        || !Number.isSafeInteger(grant.expires_at_ms)
        || (grant.expires_at_ms as number) <= Date.now()) {
        throw new Error('playback_denied');
    }
    return { grantExpiresAtMs: grant.expires_at_ms as number };
}

function logTakedownPlaybackAttempt(
    publication: JsonObject,
    protocol: 'DEVICE_SESSION_CERTIFICATE' | 'LEGACY_SESSION_GRANT',
): void {
    if (publication.availability !== 'TAKEDOWN') return;
    console.warn(formatLog('takedown_playback_token_attempted', { protocol }));
}

async function nearPlaybackView(
    env: Env,
    contractId: string,
    methodName: string,
    args: JsonObject,
    blockId?: string,
): Promise<{ value: unknown; blockHash: string }> {
    let response: Response;
    let payload: { result?: { result?: number[]; block_hash?: unknown }; error?: unknown };
    try {
        response = await dependencyFetch('near_rpc', 'playback_authorization', env.NEAR_RPC_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: `paid-media-livepeer-v1-playback-${methodName}`,
                method: 'query',
                params: {
                    request_type: 'call_function',
                    ...(blockId ? { block_id: blockId } : { finality: 'final' }),
                    account_id: contractId,
                    method_name: methodName,
                    args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify(args))),
                },
            }),
            signal: AbortSignal.timeout(2_500),
        });
        payload = await response.json() as typeof payload;
    } catch {
        throw new Error('playback_authorization_unavailable');
    }
    if (!response.ok
        || payload.error
        || !Array.isArray(payload.result?.result)
        || typeof payload.result.block_hash !== 'string'
        || (blockId && payload.result.block_hash !== blockId)) {
        throw new Error('playback_authorization_unavailable');
    }
    const raw = new TextDecoder().decode(new Uint8Array(payload.result.result));
    try {
        return {
            value: raw ? JSON.parse(raw) as unknown : null,
            blockHash: payload.result.block_hash,
        };
    } catch {
        throw new Error('playback_authorization_unavailable');
    }
}

async function signLivepeerJwt(
    env: Env,
    playbackId: string,
    issuedAtSeconds: number,
    ttlSeconds: number,
): Promise<string> {
    let privateKey: CryptoKey;
    try {
        privateKey = await crypto.subtle.importKey(
            'pkcs8',
            decodePkcs8(env.LIVEPEER_JWT_PRIVATE_KEY!),
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['sign'],
        );
    } catch {
        throw new Error('runtime_not_configured');
    }
    const header = base64UrlJson({ alg: 'ES256', typ: 'JWT' });
    const payload = base64UrlJson({
        action: 'pull',
        iss: env.LIVEPEER_JWT_ISSUER,
        pub: env.LIVEPEER_JWT_PUBLIC_KEY,
        sub: playbackId,
        video: 'none',
        exp: issuedAtSeconds + ttlSeconds,
        iat: issuedAtSeconds,
    });
    const signingInput = `${header}.${payload}`;
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
}

function decodePkcs8(value: string): Uint8Array {
    const decoded = value.startsWith('-----BEGIN PRIVATE KEY-----') ? value : atob(value);
    const body = decoded.replace(/(?:-----(?:BEGIN|END) PRIVATE KEY-----|\s)/g, '');
    return base64Decode(body);
}

function base64UrlJson(value: JsonObject): string {
    return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(value: Uint8Array): string {
    return bytesToBase64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function livepeerHlsUrl(playbackId: string): string {
    return `https://playback.livepeer.studio/asset/hls/${playbackId}/index.m3u8`;
}

function sameJob(left: JobRecord, right: JobRecord): boolean {
    return left.network === right.network
        && left.contractId === right.contractId
        && left.jobId === right.jobId
        && left.generation === right.generation
        && left.creator === right.creator
        && left.expectedSourceBytes === right.expectedSourceBytes
        && left.sourceFingerprintSha256 === right.sourceFingerprintSha256
        && left.sourceType === right.sourceType
        && left.profileId === right.profileId
        && left.profileConfigSha256 === right.profileConfigSha256;
}

function parseOutboxInput(value: JsonObject): OutboxInput {
    requireExactKeys(value, ['idempotencyKey', 'method', 'jobId', 'generation', 'payloadSha256'], 'invalid_outbox');
    if (typeof value.idempotencyKey !== 'string'
        || !IDEMPOTENCY_PATTERN.test(value.idempotencyKey)
        || typeof value.method !== 'string'
        || !OUTBOX_METHODS.has(value.method as OutboxMethod)
        || typeof value.jobId !== 'string'
        || !JOB_ID_PATTERN.test(value.jobId)
        || !Number.isSafeInteger(value.generation)
        || (value.generation as number) < 1
        || typeof value.payloadSha256 !== 'string'
        || !SHA256_PATTERN.test(value.payloadSha256)) {
        throw new Error('invalid_outbox');
    }
    return value as OutboxInput;
}

function sameOutbox(left: OutboxRecord, right: OutboxRecord): boolean {
    return left.idempotencyKey === right.idempotencyKey
        && left.method === right.method
        && left.jobId === right.jobId
        && left.generation === right.generation
        && left.payloadSha256 === right.payloadSha256;
}

async function verifyWebhookWithOverlap(
    rawBody: Uint8Array,
    signatureHeader: string,
    env: Env,
): Promise<WebhookEvent> {
    const secrets = [env.LIVEPEER_WEBHOOK_SECRET, env.LIVEPEER_WEBHOOK_SECRET_PREVIOUS]
        .filter((value): value is string => Boolean(value));
    for (const secret of secrets) {
        try {
            return await verifyAndParseWebhook(rawBody, signatureHeader, secret);
        } catch (error) {
            if (safeErrorCode(error) !== 'invalid_webhook_signature') throw error;
        }
    }
    throw new Error('invalid_webhook_signature');
}

async function verifyAndParseWebhook(
    rawBody: Uint8Array,
    signatureHeader: string,
    secret: string,
): Promise<WebhookEvent> {
    const parts = signatureHeader.split(',').map((part) => part.trim());
    const timestampText = parts.find((part) => part.startsWith('t='))?.slice(2) || '';
    const signatures = parts
        .filter((part) => part.startsWith('v1='))
        .map((part) => part.slice(3))
        .filter((value) => /^[0-9a-f]{64}$/.test(value));
    if (!/^[1-9][0-9]{9,15}$/.test(timestampText) || signatures.length === 0) {
        throw new Error('invalid_webhook_signature');
    }
    const timestamp = Number(timestampText);
    if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > WEBHOOK_TOLERANCE_MS) {
        throw new Error('webhook_expired');
    }
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, rawBody));
    const valid = signatures.some((signature) => constantTimeEqual(expected, hexDecode(signature)));
    if (!valid) throw new Error('invalid_webhook_signature');

    let parsed: unknown;
    try {
        parsed = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
        throw new Error('invalid_webhook');
    }
    const webhook = parseWebhook(requireObject(parsed, 'invalid_webhook'));
    if (webhook.timestamp !== timestamp) throw new Error('invalid_webhook_signature');
    return webhook;
}

async function verifyReadyProviderAsset(env: Env, job: JobRecord): Promise<FinalizePublication> {
    if (!validProviderVerificationConfig(env)
        || !job.assetId
        || !job.playbackId
        || !job.projectId) {
        throw new Error('runtime_not_configured');
    }
    const verified = await livepeerProvider(env).verifyReadyAsset({
        jobId: job.jobId,
        generation: job.generation,
        expectedSourceBytes: job.expectedSourceBytes,
        assetId: job.assetId,
        playbackId: job.playbackId,
        projectId: job.projectId,
        expectedProjectId: env.LIVEPEER_PROJECT_ID!,
        apiTokenName: job.apiTokenName,
    });
    return {
        job_id: job.jobId,
        generation: job.generation,
        creator_id: job.creator,
        expected_source_bytes: job.expectedSourceBytes,
        profile_id: job.profileId,
        profile_config_sha256: job.profileConfigSha256,
        asset_id_hash: verified.assetIdHash,
        playback_id: verified.playbackId,
        project_id_hash: verified.projectIdHash,
        verified_source_bytes: verified.verifiedSourceBytes,
        provider_source_fingerprint: verified.sourceFingerprint,
        ready_at_ms: verified.readyAtMs,
        availability: 'ACTIVE',
    };
}

function publicationCoverRoute(pathname: string): { jobId: string; generation: number } | null {
    const match = /^\/v1\/publication-covers\/([^/]+)\/([1-9][0-9]*)$/.exec(pathname);
    if (!match) return null;
    let jobId: string;
    try {
        jobId = decodeURIComponent(match[1]);
    } catch {
        return null;
    }
    const generation = Number(match[2]);
    if (!JOB_ID_PATTERN.test(jobId) || !Number.isSafeInteger(generation)) return null;
    return { jobId, generation };
}

async function publicationCover(
    request: Request,
    env: Env,
    jobId: string,
    generation: number,
): Promise<Response> {
    try {
        const publication = await readFinalPublicationById(env, jobId);
        if (publication?.publication_id !== jobId
            || publication.generation !== generation
            || !['ACTIVE', 'SALES_SUSPENDED'].includes(String(publication.availability))
            || typeof publication.playback_id !== 'string'
            || !PLAYBACK_ID_PATTERN.test(publication.playback_id)) {
            return json({ error: 'not_found' }, 404);
        }

        const cacheKey = publicationCoverCacheKey(request, env, jobId, generation);
        const cached = await caches.default.match(cacheKey);
        if (cached) {
            const cachedBytes = new Uint8Array(await cached.arrayBuffer());
            const cachedContentType = publicationCoverContentType(cachedBytes);
            if (cachedBytes.byteLength <= MAX_PUBLICATION_COVER_BYTES && cachedContentType) {
                return publicCoverResponse(cachedBytes, cachedContentType);
            }
        }

        const playback = await livepeerProvider(env).readPlayback(publication.playback_id);
        if (playback.kind !== 'vod'
            || playback.policy !== 'jwt'
            || playback.sources.length > MAX_PROVIDER_PLAYBACK_OUTPUTS) {
            throw new Error('provider_playback_mismatch');
        }
        const vttUrls = [...new Set(playback.sources
            .filter((source) => source.kind === 'vtt')
            .map((source) => source.url))];
        if (vttUrls.length === 0 || vttUrls.some((url) => !validPlaybackUrl(url))) {
            throw new Error('provider_playback_mismatch');
        }

        const token = await signLivepeerJwt(
            env,
            publication.playback_id,
            Math.floor(Date.now() / 1_000),
            PLAYBACK_MIN_TTL_SECONDS,
        );
        const thumbnailUrl = await firstVttThumbnailUrl(vttUrls, token);
        if (!thumbnailUrl) throw new Error('provider_playback_mismatch');
        const cover = await fetchPublicationCover(thumbnailUrl, token, [
            env.LIVEPEER_API_KEY!,
            ...vttUrls,
            thumbnailUrl,
        ]);
        const internal = new Response(cover.bytes, {
            headers: {
                'Cache-Control': `public, max-age=${PUBLICATION_COVER_CACHE_SECONDS}`,
                'Content-Length': String(cover.bytes.byteLength),
                'Content-Type': cover.contentType,
            },
        });
        await caches.default.put(cacheKey, internal.clone()).catch(() => undefined);
        return publicCoverResponse(cover.bytes, cover.contentType);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('publication_cover_failed', { code }));
        const status = code.startsWith('near_') || code === 'provider_unavailable' ? 503 : 502;
        return json({ error: 'publication_cover_unavailable' }, status);
    }
}

function publicationCoverCacheKey(
    request: Request,
    env: Env,
    jobId: string,
    generation: number,
): Request {
    const origin = new URL(request.url).origin;
    const scope = `${encodeURIComponent(env.NEAR_NETWORK!)}:${encodeURIComponent(env.MARKET_CONTRACT_ID!)}`;
    return new Request(`${origin}/__cache/publication-covers/${scope}/${encodeURIComponent(jobId)}/${generation}`);
}

async function fetchPublicationCover(
    url: string,
    token: string,
    sensitiveValues: string[],
): Promise<{ bytes: Uint8Array; contentType: PublicationCoverContentType }> {
    let response: Response;
    try {
        response = await dependencyFetch('livepeer_media', 'cover_read', url, {
            method: 'GET',
            headers: { 'Livepeer-Jwt': token },
            redirect: 'manual',
            signal: AbortSignal.timeout(5_000),
        });
    } catch {
        throw new Error('provider_unavailable');
    }
    if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
    if ([401, 403].includes(response.status)) throw new Error('publication_cover_image_denied');
    if (response.status >= 300 && response.status < 400) {
        throw new Error('publication_cover_image_redirected');
    }
    if (response.status !== 200) throw new Error('publication_cover_image_status');
    const contentLength = response.headers.get('Content-Length');
    const declaredContentType = response.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
    if (declaredContentType !== 'image/jpeg' && declaredContentType !== 'image/png') {
        throw new Error('publication_cover_image_type');
    }
    if (contentLength !== null && (!/^[0-9]+$/.test(contentLength)
        || Number(contentLength) > MAX_PUBLICATION_COVER_BYTES)) {
        throw new Error('publication_cover_image_size');
    }
    if (!response.body) throw new Error('provider_playback_mismatch');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_PUBLICATION_COVER_BYTES) {
            await reader.cancel();
            throw new Error('publication_cover_image_size');
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    const contentType = publicationCoverContentType(bytes);
    if (!contentType) throw new Error('publication_cover_image_invalid');
    if (contentType !== declaredContentType) throw new Error('publication_cover_image_type');
    if ([token, ...sensitiveValues].some((value) => containsBytes(bytes, new TextEncoder().encode(value)))) {
        throw new Error('provider_playback_mismatch');
    }
    return { bytes, contentType };
}

function containsBytes(body: Uint8Array, needle: Uint8Array): boolean {
    if (needle.byteLength === 0 || needle.byteLength > body.byteLength) return false;
    outer: for (let offset = 0; offset <= body.byteLength - needle.byteLength; offset += 1) {
        for (let index = 0; index < needle.byteLength; index += 1) {
            if (body[offset + index] !== needle[index]) continue outer;
        }
        return true;
    }
    return false;
}

function validJpeg(bytes: Uint8Array): boolean {
    return bytes.byteLength >= 4
        && bytes[0] === 0xff
        && bytes[1] === 0xd8
        && bytes[2] === 0xff
        && bytes[bytes.byteLength - 2] === 0xff
        && bytes[bytes.byteLength - 1] === 0xd9;
}

type PublicationCoverContentType = 'image/jpeg' | 'image/png';

function validPng(bytes: Uint8Array): boolean {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const ihdr = [0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52];
    const iend = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
    return bytes.byteLength >= 45
        && signature.every((byte, index) => bytes[index] === byte)
        && ihdr.every((byte, index) => bytes[signature.length + index] === byte)
        && iend.every((byte, index) => bytes[bytes.byteLength - iend.length + index] === byte);
}

function publicationCoverContentType(bytes: Uint8Array): PublicationCoverContentType | null {
    if (validJpeg(bytes)) return 'image/jpeg';
    if (validPng(bytes)) return 'image/png';
    return null;
}

function publicCoverResponse(body: ArrayBuffer | Uint8Array, contentType: PublicationCoverContentType): Response {
    const byteLength = body.byteLength;
    return new Response(body, {
        headers: {
            'Cache-Control': 'no-store',
            'Content-Length': String(byteLength),
            'Content-Type': contentType,
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}

async function forwardFinalize(env: Env, submission: FinalizePublication): Promise<Response> {
    if (!env.LIVEPEER_CONTROL || !validOperatorConfig(env)) throw new Error('runtime_not_configured');
    const signer = KeyPairSigner.fromSecretKey(env.NEAR_OPERATOR_PRIVATE_KEY as `ed25519:${string}`);
    const publicKey = (await signer.getPublicKey()).toString();
    const keyEpoch = Number(env.NEAR_OPERATOR_KEY_EPOCH);
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
        operatorObjectName(env.NEAR_NETWORK!, publicKey, keyEpoch),
    ));
    const payloadSha256 = await sha256Hex(canonicalJson({ submission }));
    return object.fetch(new Request('https://object/internal/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            idempotencyKey: `${submission.job_id}:${submission.generation}:finalize`,
            payloadSha256,
            submission,
        }),
    }));
}

async function forwardSalesSuspension(env: Env, publicationId: string): Promise<Response> {
    if (!env.LIVEPEER_CONTROL || !validOperatorConfig(env)) throw new Error('runtime_not_configured');
    const signer = KeyPairSigner.fromSecretKey(env.NEAR_OPERATOR_PRIVATE_KEY as `ed25519:${string}`);
    const publicKey = (await signer.getPublicKey()).toString();
    const keyEpoch = Number(env.NEAR_OPERATOR_KEY_EPOCH);
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
        operatorObjectName(env.NEAR_NETWORK!, publicKey, keyEpoch),
    ));
    const payloadSha256 = await sha256Hex(canonicalJson({ publication_id: publicationId }));
    return object.fetch(new Request('https://object/internal/suspend-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            idempotencyKey: `${publicationId}:suspend-sales`,
            payloadSha256,
            publicationId,
        }),
    }));
}

async function parseSuspendSalesInput(value: JsonObject): Promise<SuspendSalesInput> {
    requireExactKeys(value, ['idempotencyKey', 'payloadSha256', 'publicationId'], 'invalid_outbox');
    if (typeof value.publicationId !== 'string'
        || !JOB_ID_PATTERN.test(value.publicationId)
        || value.idempotencyKey !== `${value.publicationId}:suspend-sales`
        || typeof value.payloadSha256 !== 'string'
        || value.payloadSha256 !== await sha256Hex(canonicalJson({
            publication_id: value.publicationId,
        }))) {
        throw new Error('invalid_outbox');
    }
    return value as SuspendSalesInput;
}

async function parseFinalizeInput(value: JsonObject): Promise<FinalizeInput> {
    requireExactKeys(value, ['idempotencyKey', 'payloadSha256', 'submission'], 'invalid_finalize_request');
    const submission = requireObject(value.submission, 'invalid_finalize_request');
    requireExactKeys(submission, [
        'job_id', 'generation', 'creator_id', 'expected_source_bytes', 'profile_id',
        'profile_config_sha256', 'asset_id_hash', 'playback_id', 'project_id_hash',
        'verified_source_bytes', 'provider_source_fingerprint', 'ready_at_ms', 'availability',
    ], 'invalid_finalize_request');
    if (typeof submission.job_id !== 'string'
        || !JOB_ID_PATTERN.test(submission.job_id)
        || !Number.isSafeInteger(submission.generation)
        || (submission.generation as number) < 1
        || typeof submission.creator_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(submission.creator_id)
        || typeof submission.expected_source_bytes !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(submission.expected_source_bytes)
        || BigInt(submission.expected_source_bytes) > MAX_SOURCE_BYTES
        || submission.verified_source_bytes !== submission.expected_source_bytes
        || submission.profile_id !== 'paid-media-livepeer-v1'
        || submission.profile_config_sha256 !== PROFILE_CONFIG_SHA256
        || typeof submission.asset_id_hash !== 'string'
        || !SHA256_PATTERN.test(submission.asset_id_hash)
        || typeof submission.playback_id !== 'string'
        || !PROVIDER_ID_PATTERN.test(submission.playback_id)
        || typeof submission.project_id_hash !== 'string'
        || !SHA256_PATTERN.test(submission.project_id_hash)
        || (submission.provider_source_fingerprint !== null
            && (typeof submission.provider_source_fingerprint !== 'string'
                || !SHA256_PATTERN.test(submission.provider_source_fingerprint)))
        || typeof submission.ready_at_ms !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(submission.ready_at_ms)
        || submission.availability !== 'ACTIVE') {
        throw new Error('invalid_finalize_request');
    }
    const typed = submission as FinalizePublication;
    if (value.idempotencyKey !== `${typed.job_id}:${typed.generation}:finalize`
        || typeof value.payloadSha256 !== 'string'
        || value.payloadSha256 !== await sha256Hex(canonicalJson({ submission: typed }))) {
        throw new Error('invalid_finalize_request');
    }
    return {
        idempotencyKey: value.idempotencyKey,
        payloadSha256: value.payloadSha256,
        submission: typed,
    } as FinalizeInput;
}

async function processFinalizeOutbox(
    state: DurableObjectState,
    env: Env,
    input: FinalizeInput,
): Promise<Response> {
    if (!operatorJobAllowed(env, input.submission.job_id, input.submission.creator_id)
        || input.submission.generation !== 1) {
        throw new Error('operator_unauthorized');
    }
    const result = await processOperatorOutbox(
        state,
        env,
        input,
        'finalize_livepeer_publication',
        { submission: input.submission },
        () => finalPublicationMatches(env, input.submission),
    );
    return json({ accepted: true, finalized: result.confirmed, tx_hash: result.txHash }, result.status);
}

async function processSuspendSalesOutbox(
    state: DurableObjectState,
    env: Env,
    input: SuspendSalesInput,
): Promise<Response> {
    if (!operatorJobAllowed(env, input.publicationId)) {
        throw new Error('operator_unauthorized');
    }
    const result = await processOperatorOutbox(
        state,
        env,
        input,
        'suspend_livepeer_sales',
        { publication_id: input.publicationId },
        () => finalPublicationSalesSuspended(env, input.publicationId),
    );
    return json({ accepted: true, suspended: result.confirmed, tx_hash: result.txHash }, result.status);
}

async function processOperatorOutbox(
    state: DurableObjectState,
    env: Env,
    input: FinalizeInput | SuspendSalesInput,
    method: OutboxMethod,
    args: JsonObject,
    isConfirmed: () => Promise<boolean>,
): Promise<{ confirmed: boolean; txHash: string | null; status: number }> {
    if (!validOperatorConfig(env)) throw new Error('runtime_not_configured');
    const signer = KeyPairSigner.fromSecretKey(env.NEAR_OPERATOR_PRIVATE_KEY as `ed25519:${string}`);
    const publicKey = await signer.getPublicKey();
    const key = `outbox:${input.idempotencyKey}`;
    let record = await state.storage.transaction(async (transaction) => {
        const existing = await transaction.get<OperatorRecord>(key);
        if (existing) {
            if (existing.payloadSha256 !== input.payloadSha256
                || (existing.method !== undefined && existing.method !== method)) {
                throw new Error('outbox_conflict');
            }
            const normalized = normalizeOperatorRecord(existing, method);
            await transaction.put(key, normalized);
            return normalized;
        }
        await assertDurableObjectRecordCapacity(transaction, [
            key,
            'operator:last-nonce',
            OPERATOR_ARCHIVE_SCAN_KEY,
        ], 'operator');
        const created: OperatorRecord = {
            schema: 'youtick.livepeer-operator-outbox.v1',
            state: 'PENDING',
            method,
            idempotencyKey: input.idempotencyKey,
            payloadSha256: input.payloadSha256,
            createdAtMs: Date.now(),
        };
        await transaction.put(key, created);
        return created;
    });

    if (await isConfirmed()) {
        record = await persistConfirmedOperatorRecord(state, env, key, record);
        return { confirmed: true, txHash: record.txHash || null, status: 200 };
    }

    if (record.state === 'BROADCAST' && record.txHash) {
        const status = await queryTransaction(env, record.txHash);
        if (await isConfirmed()) {
            record = await persistConfirmedOperatorRecord(state, env, key, record);
            return { confirmed: true, txHash: record.txHash || null, status: 200 };
        }
        if (status === 'failed') throw new Error('near_finalize_failed');
        if (status === 'invalid_nonce') {
            record = clearSignedTransaction(record);
            await state.storage.put(key, record);
        }
    }

    if (env.LIVEPEER_OPERATOR_MUTATIONS_ENABLED !== 'true') {
        throw new Error('operator_mutations_disabled');
    }

    if (!record.signedTxBase64) {
        if (!record.nonce || !record.blockHash) {
            const accessKey = await readOperatorAccessKey(env, publicKey.toString());
            record = await state.storage.transaction(async (transaction) => {
                const current = await transaction.get<OperatorRecord>(key);
                if (!current) throw new Error('near_finalize_pending');
                if (current.nonce && current.blockHash) return current;
                const lastNonce = BigInt(await transaction.get<string>('operator:last-nonce') || '0');
                const nonce = (lastNonce > accessKey.nonce ? lastNonce : accessKey.nonce) + 1n;
                const reserved = {
                    ...current,
                    state: 'RESERVED' as const,
                    nonce: String(nonce),
                    blockHash: accessKey.blockHash,
                };
                await assertDurableObjectRecordCapacity(
                    transaction,
                    ['operator:last-nonce'],
                    'operator',
                );
                await transaction.put('operator:last-nonce', String(nonce));
                await transaction.put(key, reserved);
                return reserved;
            });
        }
        const transaction = createTransaction(
            env.NEAR_OPERATOR_ACCOUNT_ID!,
            publicKey,
            env.MARKET_CONTRACT_ID!,
            BigInt(record.nonce!),
            [actions.functionCall(
                method,
                args,
                FINALIZE_GAS,
                0n,
            )],
            baseDecode(record.blockHash!),
        );
        const signed = await signer.signTransaction(transaction);
        record = {
            ...record,
            state: 'SIGNED',
            signedTxBase64: bytesToBase64(signed.signedTransaction.encode()),
            txHash: baseEncode(signed.txHash),
        };
        await state.storage.put(key, record);
    }

    let broadcast: 'sent' | 'invalid_nonce' | 'failed' | 'unknown';
    try {
        broadcast = await sendTransaction(env, record.signedTxBase64!);
    } catch {
        broadcast = 'unknown';
    }
    record = { ...record, state: 'BROADCAST' };
    await state.storage.put(key, record);
    if (await isConfirmed()) {
        record = await persistConfirmedOperatorRecord(state, env, key, record);
        return { confirmed: true, txHash: record.txHash || null, status: 200 };
    }
    if (broadcast === 'failed') throw new Error('near_finalize_failed');
    if (broadcast === 'invalid_nonce') {
        await state.storage.put(key, clearSignedTransaction(record));
    }
    if (broadcast !== 'invalid_nonce' && record.nonce) {
        console.warn(formatLog('operator_nonce_pending_observed', {
            method,
            state: record.state,
            ageMs: Math.max(0, Date.now() - record.createdAtMs),
        }));
    }
    return { confirmed: false, txHash: record.txHash || null, status: 202 };
}

async function readOperatorAccessKey(
    env: Env,
    publicKey: string,
): Promise<{ nonce: bigint; blockHash: string }> {
    const payload = await nearRpc(env, {
        request_type: 'view_access_key',
        finality: 'final',
        account_id: env.NEAR_OPERATOR_ACCOUNT_ID,
        public_key: publicKey,
    });
    const result = requireObject(payload.result, 'runtime_not_configured');
    const permission = requireObject(result.permission, 'runtime_not_configured');
    const functionCall = requireObject(permission.FunctionCall, 'runtime_not_configured');
    const methodNames = functionCall.method_names;
    if (functionCall.receiver_id !== env.MARKET_CONTRACT_ID
        || typeof functionCall.allowance !== 'string'
        || !/^[1-9][0-9]*$/.test(functionCall.allowance)
        || !Array.isArray(methodNames)
        || methodNames.length !== OUTBOX_METHODS.size
        || methodNames.some((method) => typeof method !== 'string' || !OUTBOX_METHODS.has(method as OutboxMethod))
        || Array.from(OUTBOX_METHODS).some((method) => !methodNames.includes(method))
        || typeof result.nonce !== 'number'
        || !Number.isSafeInteger(result.nonce)
        || typeof result.block_hash !== 'string') {
        throw new Error('runtime_not_configured');
    }
    return { nonce: BigInt(result.nonce), blockHash: result.block_hash };
}

async function sendTransaction(env: Env, signedTxBase64: string): Promise<'sent' | 'invalid_nonce' | 'failed' | 'unknown'> {
    const payload = await nearRpcRaw(env, 'send_tx', {
        signed_tx_base64: signedTxBase64,
        wait_until: 'FINAL',
    });
    if (payload.error) return classifyNearError(payload.error);
    const result = requireObject(payload.result, 'near_finalize_pending');
    const status = result.status;
    if (status && typeof status === 'object' && !Array.isArray(status) && 'Failure' in status) {
        return 'failed';
    }
    return 'sent';
}

async function queryTransaction(env: Env, txHash: string): Promise<'sent' | 'invalid_nonce' | 'failed' | 'unknown'> {
    return queryTransactionForAccount(env, txHash, env.NEAR_OPERATOR_ACCOUNT_ID!);
}

async function queryTransactionForAccount(
    env: Env,
    txHash: string,
    senderAccountId: string,
): Promise<'sent' | 'invalid_nonce' | 'failed' | 'unknown'> {
    const payload = await nearRpcRaw(env, 'tx', {
        tx_hash: txHash,
        sender_account_id: senderAccountId,
        wait_until: 'FINAL',
    });
    if (payload.error) return classifyNearError(payload.error);
    const result = requireObject(payload.result, 'near_finalize_pending');
    const status = result.status;
    if (status && typeof status === 'object' && !Array.isArray(status) && 'Failure' in status) {
        return 'failed';
    }
    return 'sent';
}

function classifyNearError(error: unknown): 'invalid_nonce' | 'failed' | 'unknown' {
    const value = JSON.stringify(error);
    if (/InvalidNonce|EXPIRED_TRANSACTION|INVALID_TRANSACTION/i.test(value)) return 'invalid_nonce';
    if (/UNKNOWN_TRANSACTION|TIMEOUT_ERROR|timeout/i.test(value)) return 'unknown';
    return 'failed';
}

async function finalPublicationMatches(env: Env, submission: FinalizePublication): Promise<boolean> {
    const value = await readFinalPublication(env, submission);
    if (!value) return false;
    if (!publicationMatches(submission, value)) throw new Error('near_finalize_mismatch');
    return true;
}

async function readFinalPublication(
    env: Env,
    submission: FinalizePublication,
): Promise<JsonObject | null> {
    return readFinalPublicationById(env, submission.job_id);
}

async function finalPublicationSalesSuspended(env: Env, publicationId: string): Promise<boolean> {
    const publication = await readFinalPublicationById(env, publicationId);
    return publication?.publication_id === publicationId
        && ['SALES_SUSPENDED', 'TAKEDOWN'].includes(String(publication.availability));
}

async function readFinalPublicationById(env: Env, publicationId: string): Promise<JsonObject | null> {
    const payload = await nearRpc(env, {
        request_type: 'call_function',
        finality: 'final',
        account_id: env.MARKET_CONTRACT_ID,
        method_name: 'get_publication',
        args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify({
            publication_id: publicationId,
        }))),
    });
    const result = requireObject(payload.result, 'near_finalize_pending');
    if (!Array.isArray(result.result)) throw new Error('near_finalize_pending');
    const raw = new TextDecoder().decode(new Uint8Array(result.result as number[]));
    if (!raw || raw === 'null') return null;
    let publication: unknown;
    try {
        publication = JSON.parse(raw);
    } catch {
        throw new Error('near_finalize_mismatch');
    }
    return requireObject(publication, 'near_finalize_mismatch');
}

function publicationMatches(submission: FinalizePublication, value: JsonObject): boolean {
    return value.publication_id === submission.job_id
        && value.creator_id === submission.creator_id
        && value.generation === submission.generation
        && value.expected_source_bytes === submission.expected_source_bytes
        && value.profile_id === submission.profile_id
        && value.profile_config_sha256 === submission.profile_config_sha256
        && value.asset_id_hash === submission.asset_id_hash
        && value.playback_id === submission.playback_id
        && value.project_id_hash === submission.project_id_hash
        && value.verified_source_bytes === submission.verified_source_bytes
        && value.provider_source_fingerprint === submission.provider_source_fingerprint
        && value.ready_at_ms === submission.ready_at_ms
        && value.published_availability === submission.availability;
}

async function nearRpc(env: Env, params: JsonObject): Promise<JsonObject> {
    const payload = await nearRpcRaw(env, 'query', params);
    if (payload.error) throw new Error('near_finalize_pending');
    return payload;
}

async function nearRpcRaw(env: Env, method: string, params: unknown): Promise<JsonObject> {
    let response: Response;
    try {
        response = await dependencyFetch(
            'near_rpc',
            method === 'send_tx' ? 'operator_broadcast' : 'operator_query',
            env.NEAR_RPC_URL!,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: `paid-media-livepeer-v1-${method}`, method, params }),
                signal: AbortSignal.timeout(5_000),
            },
        );
    } catch {
        throw new Error('near_finalize_pending');
    }
    if (!response.ok) throw new Error('near_finalize_pending');
    try {
        return requireObject(await response.json(), 'near_finalize_pending');
    } catch {
        throw new Error('near_finalize_pending');
    }
}

function clearSignedTransaction(record: OperatorRecord): OperatorRecord {
    const next = { ...record, state: 'PENDING' as const };
    delete next.nonce;
    delete next.blockHash;
    delete next.signedTxBase64;
    delete next.txHash;
    return next;
}

function normalizeOperatorRecord(record: OperatorRecord, method: OutboxMethod): OperatorRecord {
    return {
        schema: 'youtick.livepeer-operator-outbox.v1',
        state: record.state,
        method,
        idempotencyKey: record.idempotencyKey,
        payloadSha256: record.payloadSha256,
        createdAtMs: record.createdAtMs,
        ...(record.nonce === undefined ? {} : { nonce: record.nonce }),
        ...(record.blockHash === undefined ? {} : { blockHash: record.blockHash }),
        ...(record.signedTxBase64 === undefined ? {} : { signedTxBase64: record.signedTxBase64 }),
        ...(record.txHash === undefined ? {} : { txHash: record.txHash }),
        ...(record.confirmedAtMs === undefined ? {} : { confirmedAtMs: record.confirmedAtMs }),
        ...(record.archive === undefined ? {} : { archive: record.archive }),
    };
}

function confirmOperatorRecord(record: OperatorRecord): OperatorRecord {
    const confirmedAtMs = record.confirmedAtMs || Date.now();
    return {
        schema: 'youtick.livepeer-operator-outbox.v1',
        state: 'CONFIRMED',
        method: record.method,
        idempotencyKey: record.idempotencyKey,
        payloadSha256: record.payloadSha256,
        createdAtMs: record.createdAtMs,
        ...(record.txHash === undefined ? {} : { txHash: record.txHash }),
        confirmedAtMs,
        archive: record.archive || {
            status: 'PENDING',
            attempts: 0,
            createdAtMs: confirmedAtMs,
            nextAttemptAtMs: confirmedAtMs,
        },
    };
}

async function persistConfirmedOperatorRecord(
    state: DurableObjectState,
    env: Env,
    key: string,
    record: OperatorRecord,
): Promise<OperatorRecord> {
    const confirmed = confirmOperatorRecord(record);
    await state.storage.put(key, confirmed);
    const archive = confirmed.archive;
    if (env.OPERATOR_OUTBOX_ARCHIVE_ENABLED === 'true'
        && archive
        && archive.status !== 'COMMITTED') {
        await state.storage.transaction(async (transaction) => {
            if (await transaction.get<OperatorArchiveScan>(OPERATOR_ARCHIVE_SCAN_KEY)) return;
            await assertDurableObjectRecordCapacity(
                transaction,
                [OPERATOR_ARCHIVE_SCAN_KEY],
                'operator',
            );
            await transaction.put(OPERATOR_ARCHIVE_SCAN_KEY, {} satisfies OperatorArchiveScan);
        });
        await scheduleAlarmNoLaterThan(
            state,
            Math.max(Date.now(), archive.nextAttemptAtMs),
        );
    }
    return confirmed;
}

function validWebhookConfig(env: Env): boolean {
    return typeof env.LIVEPEER_WEBHOOK_SECRET === 'string'
        && env.LIVEPEER_WEBHOOK_SECRET.length >= 16
        && (env.LIVEPEER_WEBHOOK_SECRET_PREVIOUS === undefined
            || env.LIVEPEER_WEBHOOK_SECRET_PREVIOUS.length >= 16)
        && validProviderVerificationConfig(env)
        && validOperatorConfig(env);
}

function validWebhookQueuePolicy(env: Env): boolean {
    return env.NEAR_NETWORK === 'testnet'
        && env.LIVEPEER_WEBHOOK_QUEUE_BATCH_SIZE === '10'
        && env.LIVEPEER_WEBHOOK_QUEUE_BATCH_TIMEOUT_SECONDS === '5'
        && env.LIVEPEER_WEBHOOK_QUEUE_MAX_RETRIES === '3'
        && env.LIVEPEER_WEBHOOK_QUEUE_MAX_CONCURRENCY === '1'
        && env.LIVEPEER_WEBHOOK_QUEUE_RETENTION_SECONDS === '345600'
        && env.LIVEPEER_WEBHOOK_QUEUE_DLQ === 'youtick-livepeer-events-dlq-testnet';
}

function validTerminalArchiveConfig(env: Env): boolean {
    return env.UPLOAD_JOB_ARCHIVE_ENABLED === 'true'
        && env.NEAR_NETWORK === 'testnet'
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && Boolean(env.MARKET_READ_MODEL);
}

function validOperatorArchiveConfig(env: Env): boolean {
    return env.OPERATOR_OUTBOX_ARCHIVE_ENABLED === 'true'
        && env.NEAR_NETWORK === 'testnet'
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && ACCOUNT_ID_PATTERN.test(env.NEAR_OPERATOR_ACCOUNT_ID || '')
        && Number.isSafeInteger(Number(env.NEAR_OPERATOR_KEY_EPOCH))
        && Number(env.NEAR_OPERATOR_KEY_EPOCH) > 0
        && Boolean(env.MARKET_READ_MODEL);
}

function validAdmissionConfig(env: Env): boolean {
    return creatorAllowlist(env).size > 0
        && operationReservation(env) !== null
        && monthlyBudget(env) !== null
        && ['testnet', 'mainnet'].includes(env.NEAR_NETWORK || '')
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '');
}

function validAdmissionReopenConfig(env: Env): boolean {
    return ['testnet', 'mainnet'].includes(env.NEAR_NETWORK || '')
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && typeof env.LIVEPEER_PAID_MEDIA_OPERATOR_ID === 'string'
        && IDENTIFIER_PATTERN.test(env.LIVEPEER_PAID_MEDIA_OPERATOR_ID)
        && typeof env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN === 'string'
        && env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN.length >= 32
        && !/[\r\n]/.test(env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN)
        && (env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN_PREVIOUS === undefined
            || (env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN_PREVIOUS.length >= 32
                && !/[\r\n]/.test(env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN_PREVIOUS)));
}

function validOperatorStatusConfig(env: Env): boolean {
    return validAdmissionReopenConfig(env) && validOperatorConfig(env);
}

function validProviderVerificationConfig(env: Env): boolean {
    return validApiKey(env.LIVEPEER_API_KEY)
        && typeof env.LIVEPEER_PROJECT_ID === 'string'
        && PROVIDER_ID_PATTERN.test(env.LIVEPEER_PROJECT_ID)
        && typeof env.LIVEPEER_API_TOKEN_NAME === 'string'
        && env.LIVEPEER_API_TOKEN_NAME.length >= 1
        && env.LIVEPEER_API_TOKEN_NAME.length <= 128;
}

function validPlaybackConfig(env: Env): boolean {
    return isHttpsUrl(env.NEAR_RPC_URL)
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && ACCOUNT_ID_PATTERN.test(env.ACCESS_CONTRACT_ID || '')
        && ['testnet', 'mainnet'].includes(env.NEAR_NETWORK || '')
        && typeof env.LIVEPEER_JWT_PRIVATE_KEY === 'string'
        && env.LIVEPEER_JWT_PRIVATE_KEY.length >= 64
        && typeof env.LIVEPEER_JWT_PUBLIC_KEY === 'string'
        && env.LIVEPEER_JWT_PUBLIC_KEY.length >= 32
        && !/[\r\n]/.test(env.LIVEPEER_JWT_PUBLIC_KEY)
        && typeof env.LIVEPEER_JWT_ISSUER === 'string'
        && isHttpsOrigin(env.LIVEPEER_JWT_ISSUER);
}

function validPlaybackV2Config(env: Env): boolean {
    return isHttpsUrl(env.NEAR_RPC_URL)
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && ['testnet', 'mainnet'].includes(env.NEAR_NETWORK || '')
        && validApiKey(env.LIVEPEER_API_KEY)
        && typeof env.LIVEPEER_JWT_PRIVATE_KEY === 'string'
        && env.LIVEPEER_JWT_PRIVATE_KEY.length >= 64
        && typeof env.LIVEPEER_JWT_PUBLIC_KEY === 'string'
        && env.LIVEPEER_JWT_PUBLIC_KEY.length >= 32
        && !/[\r\n]/.test(env.LIVEPEER_JWT_PUBLIC_KEY)
        && typeof env.LIVEPEER_JWT_ISSUER === 'string'
        && isHttpsOrigin(env.LIVEPEER_JWT_ISSUER);
}

function validCreatorFeeQuoteConfig(env: Env): boolean {
    return env.LIVEPEER_NEAR_CREATOR_FEE_ENABLED === 'true' && validQuoteSigningConfig(env);
}

function validQuoteSigningConfig(env: Env): boolean {
    return ['testnet', 'mainnet'].includes(env.NEAR_NETWORK || '')
        && isHttpsUrl(env.NEAR_RPC_URL)
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && typeof env.CREATOR_FEE_QUOTE_PRIVATE_KEY === 'string'
        && env.CREATOR_FEE_QUOTE_PRIVATE_KEY.length >= 64
        && /^[1-9][0-9]{0,9}$/.test(env.CREATOR_FEE_QUOTE_KEY_VERSION || '')
        && Number(env.CREATOR_FEE_QUOTE_KEY_VERSION) <= 0xffff_ffff;
}

function validSponsoredUploadQuoteConfig(env: Env): boolean {
    return env.LIVEPEER_SPONSORED_UPLOADS_ENABLED === 'true'
        && validQuoteSigningConfig(env)
        && validAdmissionConfig(env);
}

function validSponsoredUploadRelayConfig(env: Env): boolean {
    const accountId = env.NEAR_SPONSOR_RELAYER_ACCOUNT_ID || '';
    const structurallyValid = validSponsoredUploadQuoteConfig(env)
        && ACCOUNT_ID_PATTERN.test(accountId)
        && accountId !== env.MARKET_CONTRACT_ID
        && accountId !== env.ACCESS_CONTRACT_ID
        && accountId !== env.NEAR_OPERATOR_ACCOUNT_ID
        && typeof env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY === 'string'
        && /^ed25519:[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY)
        && /^[1-9][0-9]{0,9}$/.test(env.NEAR_SPONSOR_RELAYER_KEY_EPOCH || '');
    if (!structurallyValid) return false;
    try {
        KeyPairSigner.fromSecretKey(env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY as `ed25519:${string}`);
        return true;
    } catch {
        return false;
    }
}

function validOperatorConfig(env: Env): boolean {
    const structurallyValid = isHttpsUrl(env.NEAR_RPC_URL)
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && ACCOUNT_ID_PATTERN.test(env.NEAR_OPERATOR_ACCOUNT_ID || '')
        && typeof env.NEAR_OPERATOR_PRIVATE_KEY === 'string'
        && /^ed25519:[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(env.NEAR_OPERATOR_PRIVATE_KEY)
        && /^[1-9][0-9]{0,9}$/.test(env.NEAR_OPERATOR_KEY_EPOCH || '')
        && ['testnet', 'mainnet'].includes(env.NEAR_NETWORK || '');
    if (!structurallyValid) return false;
    try {
        KeyPairSigner.fromSecretKey(env.NEAR_OPERATOR_PRIVATE_KEY as `ed25519:${string}`);
        return true;
    } catch {
        return false;
    }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    return difference === 0;
}

function hexDecode(value: string): Uint8Array {
    if (value.length % 2 !== 0) return new Uint8Array();
    return Uint8Array.from(value.match(/.{2}/g) || [], (byte) => Number.parseInt(byte, 16));
}

async function readJsonObject(request: Request): Promise<JsonObject> {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_CONTROL_BODY_BYTES) throw new Error('control_body_too_large');
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        throw new Error('invalid_json');
    }
    return requireObject(value, 'invalid_json');
}

function requireObject(value: unknown, code: string): JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
    return value as JsonObject;
}

function requireExactKeys(value: JsonObject, expected: string[], code: string): void {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
        throw new Error(code);
    }
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value as JsonObject).sort().map((key) => (
            `${JSON.stringify(key)}:${canonicalJson((value as JsonObject)[key])}`
        )).join(',')}}`;
    }
    return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
    return sha256BytesHex(new TextEncoder().encode(value));
}

async function sha256BytesHex(value: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', value);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function allowedOrigins(env: Env): Set<string> {
    return new Set((env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean));
}

function isHttpsOrigin(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.origin === value;
    } catch {
        return false;
    }
}

function isAllowedControlOrigin(value: string): boolean {
    if (isHttpsOrigin(value)) return true;
    try {
        const url = new URL(value);
        return url.protocol === 'http:' && url.hostname === 'localhost' && url.origin === value;
    } catch {
        return false;
    }
}

function isHttpsUrl(value?: string): boolean {
    try {
        return new URL(value || '').protocol === 'https:' && !value?.startsWith('<');
    } catch {
        return false;
    }
}

function validApiKey(value?: string): boolean {
    return typeof value === 'string' && value.length >= 16 && !/[\r\n]/.test(value);
}

function base64Decode(value: string): Uint8Array {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlDecode(value: string): Uint8Array {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    return base64Decode(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function errorStatus(code: string): number {
    if (code === 'internal_error') return 500;
    if (code === 'creator_fee_quote_rate_limited' || code === 'rate_limited') return 429;
    if (code === 'origin_denied'
        || code === 'device_key_not_authorized'
        || code === 'invalid_webhook_signature'
        || code === 'admission_reopen_denied'
        || code === 'operator_unauthorized'
        || code === 'playback_denied') return 403;
    if (code.includes('conflict')
        || code === 'admission_denied'
        || code === 'operator_archive_eligible_count_invalid'
        || code === 'operator_archive_scan_active'
        || code === 'on_chain_job_mismatch'
        || code === 'near_finalize_failed'
        || code === 'near_finalize_mismatch'
        || code === 'provider_asset_missing'
        || code === 'provider_identity_mismatch'
        || code === 'provider_playback_missing'
        || code === 'provider_playback_exposed'
        || code === 'provider_playback_mismatch'
        || code === 'provider_state_invalid'
        || code === 'device_nonce_replayed'
        || code === 'provider_create_pending'
        || code === 'provider_delete_ambiguous'
        || code === 'provider_recovery_not_ready'
        || code === 'upload_cancel_denied'
        || code === 'sponsor_balance_insufficient'
        || code === 'sponsor_job_conflict'
        || code === 'sponsor_relay_failed') return 409;
    if (code.startsWith('near_')
        || code === 'admission_closed'
        || code === 'runtime_not_configured'
        || code === 'webhook_queue_unavailable'
        || code === 'playback_authorization_unavailable'
        || code === 'rate_source_invalid'
        || code === 'rate_source_stale'
        || code === 'rate_source_unavailable'
        || code === 'provider_unavailable'
        || code === 'durable_object_record_limit'
        || code === 'provider_mutations_disabled'
        || code === 'operator_mutations_disabled'
        || code === 'sponsor_relay_mutations_disabled'
        || code === 'sponsor_relay_pending'
        || code === 'provider_admission_closed'
        || code === 'provider_create_ambiguous') return 503;
    return 400;
}

function safeErrorCode(error: unknown): string {
    if (sponsoredRelayRejectionReason(error)) return 'invalid_sponsored_upload_relay';
    return error instanceof Error && SAFE_ERROR_CODES.has(error.message)
        ? error.message
        : 'internal_error';
}

function sponsoredRelayRejectionReason(error: unknown): SponsoredRelayRejectionReason | undefined {
    if (!(error instanceof Error)) return undefined;
    return (Object.keys(SPONSORED_RELAY_REJECTION_CODES) as SponsoredRelayRejectionReason[])
        .find((reason) => SPONSORED_RELAY_REJECTION_CODES[reason] === error.message);
}

function json(body: JsonObject, status = 200): Response {
    return Response.json(body, {
        status,
        headers: { 'Cache-Control': 'no-store' },
    });
}

function withCors(response: Response, origin: string): Response {
    const headers = new Headers(response.headers);
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Youtick-Signature');
    headers.set('Vary', 'Origin');
    return new Response(response.body, { status: response.status, headers });
}
