import {
    COMPACT_UPLOAD_PREFIX,
    unpackCompactUpload,
} from '../../../protocol/paid-media-livepeer-v1/compact-upload';
import { hasTitleContent } from '../../../protocol/paid-media-livepeer-v1/title';
import profiles from '../../../protocol/paid-media-livepeer-v1/profiles.json';
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
import type {
    CreateUploadResult,
    MediaProviderKind,
    NormalizedWebhookEvent,
    ProviderPlayback,
} from './media-provider';
import { canonicalPlaybackV3Message, decideTicketPlayback, parsePlaybackV3Body } from './playback-v3';
import {
    MEDIA_PROVIDER_HEADER,
    MEDIA_WEBHOOK_TIME_HEADER,
    mediaProfileFamily,
    mediaProviderKind,
} from './media-provider';
import {
    CloudflareStreamProvider,
    STREAM_TUS_URL_LIFETIME_MS,
    STREAM_UPLOAD_EXPIRY_MS,
} from './cloudflare-stream-provider';
import { dependencyFetch } from './dependency-fetch';
import {
    MAX_PUBLICATION_COVER_BYTES,
    publicationCoverContentType,
    type PublicationCoverContentType,
} from './cover-image';
import { assertDurableObjectRecordCapacity } from './durable-object-capacity';
import { MAX_PROVIDER_PLAYBACK_OUTPUTS, playbackUrlAllowed } from './provider-verification';
import {
    isProcessingEvent,
    isProviderFailureEvent,
    isReadinessEvent,
    synthesizedProviderEvent,
} from './provider-webhook';
import { commitUploadJobArchive, type UploadJobArchive } from './upload-job-archive';
import {
    paymentAssets,
    expirePaymentRateLimit,
    paymentOptions,
    paymentQuote,
    paymentRateLimit,
    paymentStatus,
} from './payments';
import type { Env } from './env';
import type {
    JsonObject,
    MediaProfileId,
    ControlEnvelope,
    UploadIntentRequest,
    UploadHeartbeatRequest,
    UploadCancellationRequest,
    OnChainJob,
    JobState,
    JobRecord,
    ReconcileRecord,
    OutboxRecord,
    AdmissionRecord,
    AdmissionLease,
    LivepeerWebhookQueueMessage,
} from './types';
import {
    MAX_CONTROL_BODY_BYTES,
    MAX_SOURCE_BYTES,
    PUBLIC_TESTNET_BETA_MAX_SOURCE_BYTES,
    MIN_CREATOR_UPLOAD_FEE_USD_MICROS,
    CREATOR_FEE_QUOTE_LIFETIME_MS,
    SPONSORED_RELAY_REJECTION_CODES,
    CONTROL_MAX_FUTURE_MS,
    LIFECYCLE_DELETE_BATCH,
    PLAYBACK_MIN_TTL_SECONDS,
    PLAYBACK_MAX_TTL_SECONDS,
    PLAYBACK_V2_TTL_SECONDS,
    STREAM_DEFAULT_STUCK_TIMEOUT_MS,
    PROVIDER_POLICY_CACHE_MS,
    JOB_KEY,
    RECONCILE_KEY,
    RECONCILE_HEALTHY_INTERVAL_MS,
    RECONCILE_CONFIRMATION_MS,
    RECONCILE_BACKOFF_MS,
    ADMISSION_KEY,
    ADMISSION_LEASE_HEARTBEAT_MS,
    ACCOUNT_ID_PATTERN,
    JOB_ID_PATTERN,
    SHA256_PATTERN,
    SESSION_KEY_PATTERN,
    NONCE_PATTERN,
    PROVIDER_ID_PATTERN,
    PLAYBACK_ID_PATTERN,
    LEGACY_PROFILE_ID,
} from './constants';
import {
    formatLog,
    constantTimeEqual,
    readJsonObject,
    requireObject,
    requireExactKeys,
    canonicalJson,
    sha256Hex,
    sha256BytesHex,
    allowedOrigins,
    isAllowedControlOrigin,
    validApiKey,
    base64Decode,
    base64UrlDecode,
    bytesToBase64,
    errorStatus,
    safeErrorCode,
    sponsoredRelayRejectionReason,
    json,
    withHealthCors,
    withCors,
} from './helpers';
import {
    isMarketV2,
    rateLimitedEnvironment,
    playbackProfileIdAccepted,
    creatorAllowlist,
    isPublicTestnetEnvironment,
    isPublicBetaPacket,
    isMarketV2TestnetCreatorScope,
    operatorJobAllowed,
    usdcContractId,
    streamEnabled,
    studioActive,
    positiveIntegerVar,
    streamMaxDurationSeconds,
    streamStuckTimeoutMs,
    validStreamConfig,
    validWebhookConfig,
    validStudioWebhookSecrets,
    validStreamWebhookConfig,
    validWebhookQueuePolicy,
    validTerminalArchiveConfig,
    validOperatorArchiveConfig,
    validAdmissionConfig,
    validAdmissionReopenConfig,
    validOperatorStatusConfig,
    validProviderVerificationConfig,
    validPlaybackConfig,
    validPlaybackV2Config,
    validCreatorFeeQuoteConfig,
    validSponsoredUploadQuoteConfig,
    validSponsoredUploadRelayConfig,
} from './config';
import { jobObjectName, admissionObjectName } from './object-names';
import {
    readFinalBlock,
    readFinalMediaJob,
    readFinalPublicTestnetBetaJob,
    readFinalPublicTestnetBetaState,
    hasFinalPublicTestnetBetaJobToday,
    readFinalAccessKey,
    nearPlaybackView,
    sendTransaction,
    queryTransactionForAccount,
    finalPublicationMatches,
    readFinalPublicationById,
    nearRpcRaw,
} from './near-rpc';
import {
    requirePublicUploadPolicy,
    publicUploadJobDeadline,
    publicBetaRateLimitResponse,
    enforcePublicBetaAccountRateLimit,
    publicBetaDeadlineExpired,
    requireActivePublicTestnetBetaForPlayback,
    requirePublicTestnetBetaJob,
} from './public-testnet-beta';
import {
    streamProvider,
    mediaProvider,
    jobProviderKind,
    supportedMediaProfile,
    providerIdentity,
    publicationProfileHash,
} from './provider-registry';
import { ensureReconcileScheduled, scheduleReconcile, scheduleAlarmNoLaterThan } from './alarm-schedule';
import {
    parseUploadIntentRequest,
    parseUploadHeartbeatRequest,
    parseUploadCancellationRequest,
    parseControlEnvelope,
    verifyControlSignature,
} from './control-requests';
import {
    signalStreamAdmission,
    recordStreamSignal,
    streamHealthBlock,
    readStreamAdmissionStatus,
    requestAdmission,
    closeAdmissionAfterAmbiguousDelete,
    heartbeatAdmissionLease,
    updateAdmission,
    preflightAdmission,
    reserveAdmission,
    resumeAdmission,
    markAdmission,
    heartbeatAdmission,
    maintainAdmissionLifecycle,
    reopenAdmission,
    readAdmissionStatus,
} from './admission';
import {
    parseOutboxInput,
    sameOutbox,
    forwardFinalize,
    forwardMarkWatched,
    parseMarkWatchedInput,
    processMarkWatchedOutbox,
    parseReleaseExpiredInput,
    processReleaseExpiredOutbox,
    runScheduledRelease,
    parseSuspendSalesInput,
    parseFinalizeInput,
    processFinalizeOutbox,
    processSuspendSalesOutbox,
} from './operator-outbox';
import {
    readOperatorOutboxStatus,
    startOperatorOutboxArchiveScan,
    advanceOperatorArchiveScan,
} from './operator-archive-scan';
import {
    forwardAdmissionReopen,
    forwardPublicBetaAssetDelete,
    forwardAdmissionStatus,
    forwardOperatorOutboxStatus,
    forwardOperatorOutboxArchiveScan,
} from './operator-routes';
import {
    reconcilePublishedJob,
    persistUnknownReconcile,
    persistUploadVerificationResult,
    verifyReadyProviderAsset,
} from './reconcile';

export type { Env } from './env';
export { sanitizeForLog, formatLog } from './helpers';
export { jobObjectName, operatorObjectName, admissionObjectName } from './object-names';
export { resetPublicUploadPolicyCache, requirePublicUploadPolicy } from './public-testnet-beta';
export { dueReleaseTicketIds, runScheduledRelease } from './operator-outbox';
export {
    forwardAdmissionReopen,
    forwardPublicBetaAssetDelete,
    forwardAdmissionStatus,
    forwardOperatorOutboxStatus,
    forwardOperatorOutboxArchiveScan,
} from './operator-routes';

type PlaybackTokenBody = {
    job_id: string;
    generation: number;
    playback_id: string;
    grant_id: string;
    origin_hash: string;
    device_hash: string;
    requested_ttl_seconds: number;
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
type LegacyDeviceCertificate = {
    domain: 'youtick.device-session';
    version: '1' | '2';
    network: 'testnet' | 'mainnet';
    account_id?: string;
    contract_id?: string;
    session_public_key: string;
    origin_hash: string;
    scopes: ['play'];
    issued_at_ms: string;
    expires_at_ms: string;
};
type MarketDeviceCertificate = Omit<LegacyDeviceCertificate, 'version' | 'issued_at_ms' | 'expires_at_ms'> & {
    version: '3';
    account_id: string;
    contract_id: string;
    authorization_duration_ms: string;
};
type DeviceSessionCertificate = LegacyDeviceCertificate | MarketDeviceCertificate;
type MarketCertificateProof = { kind: 'market'; account_id: string; signed_delegate_base64?: string };
type WalletCertificateProof = {
    account_id?: string;
    public_key: string;
    signature: string;
    nonce: string;
};
type DeviceCertificateProof = WalletCertificateProof | MarketCertificateProof;
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
    deviceExpiresAtMs?: number;
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
    profile_id: MediaProfileId;
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
    hasPlaybackSession?: boolean;
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

const PUBLIC_CONTROL_REQUESTS_IMPLEMENTED = true;
const PUBLIC_BETA_RATE_LIMIT_ROUTES = new Set([
    '/v1/upload-preflight',
    '/v1/upload-intents',
    '/v1/upload-heartbeats',
    '/v1/sponsored-upload-quotes',
    '/v1/sponsored-upload-relays',
    '/v1/playback-tokens',
    '/v2/playback-tokens',
    '/v3/playback-tokens',
]);
const CREATOR_FEE_RATE_SOURCE = 'outlayer-price-oracle-wrap-near-v1';
const OUTLAYER_NEAR_ASSET_ID = 'wrap.near';
const CREATOR_FEE_MAX_SOURCE_AGE_MS = 60_000;
const CREATOR_FEE_RATE_LIMIT = 5;
const CREATOR_FEE_RATE_WINDOW_MS = 60_000;
const YOCTO_NEAR = 10n ** 24n;
const SPONSORED_UPLOAD_DELEGATE_GAS = 100_000_000_000_000n;
const SPONSORED_UPLOAD_FEE_USDC = 100_000n;
const SPONSORED_UPLOAD_MAX_BLOCK_WINDOW = 200n;
const SPONSORED_UPLOAD_SIGNING_HEADROOM_BLOCKS = 200n;
const SPONSOR_RELAY_KEY_PREFIX = 'sponsor-relay:';
const SPONSOR_RELAYER_LAST_NONCE_KEY = 'sponsor-relayer:last-nonce';
const LIVEPEER_TUS_CHUNK_BYTES = 32 * 1024 * 1024;
const PUBLICATION_COVER_CACHE_SECONDS = 24 * 60 * 60;
// Bounds how long a takedown can leave a cover visible: the edge visibility marker plus the browser max-age.
const PUBLICATION_COVER_VISIBLE_SECONDS = 30;
const WEBHOOK_DEDUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// Bounded Stream poll: every 5 minutes while the creator uploads, every minute while processing.
const STREAM_UPLOAD_POLL_MS = 5 * 60 * 1000;
const STREAM_PROCESSING_POLL_MS = 60 * 1000;
const DEVICE_CERTIFICATE_MAX_LIFETIME_MS = 8 * 60 * 60 * 1000;
const MARKET_DEVICE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const PLAYBACK_CACHE_MAX_RECORDS = 1024;
const DEVICE_CERTIFICATE_CACHE_MS = 60 * 1000;
const PUBLICATION_CACHE_MS = 30 * 1000;
const POSITIVE_ENTITLEMENT_CACHE_MS = 5 * 60 * 1000;
const NEGATIVE_ENTITLEMENT_CACHE_MS = 3 * 1000;
const UPLOAD_JOB_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const playbackAuthorizationCache = new Map<string, { value: unknown; expiresAtMs: number }>();
let edgeColdStartPending = true;

export function playbackAuthorizationCacheRecordCount(): number {
    return playbackAuthorizationCache.size;
}

const bridgeWorker = {
    async fetch(request: Request, env: Env, context?: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        // The V2 web reads `streamConfigured` here before it takes an upload fee, so the configured
        // web origins may read health cross-origin (GET only, no credentials).
        if (request.method === 'OPTIONS' && url.pathname === '/__health') {
            const origin = request.headers.get('Origin') || '';
            if (!allowedOrigins(env).has(origin)) return json({ error: 'origin_denied' }, 403);
            return withHealthCors(new Response(null, { status: 204 }), request, env);
        }
        if (request.method === 'GET' && url.pathname === '/__health') {
            // Health stays observable without the binding; it reports publicBetaRateLimitReady itself.
            if (env.PUBLIC_BETA_RATE_LIMITER && rateLimitedEnvironment(env)) {
                const limited = await publicBetaRateLimitResponse(request, env, '/__health');
                if (limited?.status === 429) return withHealthCors(limited, request, env);
            }
            if (isPublicTestnetEnvironment(env)) {
                try { await requirePublicUploadPolicy(env); }
                catch { return withHealthCors(json({ status: 'error', error: 'deployment_binding_mismatch' }, 503), request, env); }
            }
            return withHealthCors(json({
                status: 'ok',
                service: 'livepeer-bridge',
                compactUpload: { version: 1, network: env.NEAR_NETWORK, market: env.MARKET_CONTRACT_ID },
                versionId: env.CF_VERSION_METADATA.id,
                stage: env.LIVEPEER_BRIDGE_ENABLED === 'true' ? 'ENABLED' : 'DISABLED',
                publicControlImplemented: PUBLIC_CONTROL_REQUESTS_IMPLEMENTED,
                providerMutationEnabled: env.LIVEPEER_BRIDGE_ENABLED === 'true'
                    && env.LIVEPEER_PROVIDER_MUTATIONS_ENABLED === 'true',
                operatorMutationEnabled: env.LIVEPEER_BRIDGE_ENABLED === 'true'
                    && env.LIVEPEER_OPERATOR_MUTATIONS_ENABLED === 'true'
                    && (isPublicBetaPacket(env) || isPublicTestnetEnvironment(env) || isMarketV2TestnetCreatorScope(env)
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
                publicBetaRateLimitReady: rateLimitedEnvironment(env) && Boolean(env.PUBLIC_BETA_RATE_LIMITER),
                mediaProvider: { kind: studioActive(env) ? mediaProvider(env).id : 'stream' },
                // Never true with the flag off: empty STREAM_* values then mean "not configured".
                streamConfigured: streamEnabled(env) && validStreamConfig(env),
                ...(streamEnabled(env) ? { stream: await streamHealthBlock(env) } : {}),
            }), request, env);
        }

        if (request.method === 'POST'
            && PUBLIC_BETA_RATE_LIMIT_ROUTES.has(url.pathname)
            && rateLimitedEnvironment(env)) {
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
            if (!(validApiKey(env.LIVEPEER_API_KEY) || validStreamConfig(env)) || !validPlaybackConfig(env)) {
                return json({ error: 'runtime_not_configured' }, 503);
            }
            return publicationCover(request, env, coverRoute.jobId, coverRoute.generation);
        }

        if (request.method === 'OPTIONS'
            && ['/v1/upload-preflight', '/v1/upload-intents', '/v1/upload-heartbeats', '/v1/playback-tokens', '/v2/playback-tokens', '/v3/playback-tokens', '/v1/creator-fee-quotes/near', '/v1/sponsored-upload-quotes', '/v1/sponsored-upload-relays']
                .includes(url.pathname)) {
            const origin = request.headers.get('Origin') || '';
            if (!allowedOrigins(env).has(origin)) return json({ error: 'origin_denied' }, 403);
            return withCors(new Response(null, { status: 204 }), origin);
        }

        if (request.method === 'POST' && url.pathname === '/v1/livepeer-webhooks') {
            if (env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
                return json({ error: 'control_plane_disabled' }, 503);
            }
            if (!env.LIVEPEER_CONTROL || !validWebhookConfig(env) || !validStudioWebhookSecrets(env)) {
                return json({ error: 'runtime_not_configured' }, 503);
            }
            return forwardLivepeerWebhook(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/v1/stream-webhooks') {
            if (env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
                return json({ error: 'control_plane_disabled' }, 503);
            }
            if (!env.LIVEPEER_CONTROL || !validStreamWebhookConfig(env)) {
                return json({ error: 'runtime_not_configured' }, 503);
            }
            return forwardProviderWebhook(request, env, 'stream');
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
                || (!isPublicBetaPacket(env) && !isPublicTestnetEnvironment(env))) {
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

        if (request.method === 'POST' && url.pathname === '/v3/playback-tokens') {
            const origin = request.headers.get('Origin') || '';
            const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
            if (!PUBLIC_CONTROL_REQUESTS_IMPLEMENTED
                || env.LIVEPEER_BRIDGE_ENABLED !== 'true'
                || env.LIVEPEER_PLAYBACK_ISSUANCE_ENABLED !== 'true'
                || env.LIVEPEER_PLAYBACK_V3_ENABLED !== 'true'
                || !isMarketV2(env)) {
                return withCors(json({ error: 'control_plane_disabled' }, 503), corsOrigin);
            }
            if (!validPlaybackV2Config(env)) {
                return withCors(json({ error: 'runtime_not_configured' }, 503), corsOrigin);
            }
            return withCors(await issueTicketPlaybackToken(request, env), corsOrigin);
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

        const pendingUploadRoute = url.pathname.match(/^\/v1\/creators\/([^/]+)\/pending-upload$/);
        if (request.method === 'GET' && pendingUploadRoute) {
            const origin = request.headers.get('Origin') || '';
            const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
            if (env.LIVEPEER_BRIDGE_ENABLED !== 'true'
                || env.LIVEPEER_SPONSORED_UPLOADS_ENABLED !== 'true') {
                return withCors(json({ error: 'control_plane_disabled' }, 503), corsOrigin);
            }
            if (!env.LIVEPEER_CONTROL) {
                return withCors(json({ error: 'runtime_not_configured' }, 503), corsOrigin);
            }
            if (rateLimitedEnvironment(env)) {
                const limited = await publicBetaRateLimitResponse(request, env, CREATOR_PENDING_UPLOAD_ROUTE);
                if (limited) return withCors(limited, corsOrigin);
            }
            return forwardCreatorPendingUpload(decodeURIComponent(pendingUploadRoute[1]), env, corsOrigin);
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

    async scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext): Promise<void> {
        context.waitUntil(runScheduledRelease(env).then(() => undefined, (error) => {
            console.error(formatLog('market_v2_release_failed', { code: safeErrorCode(error) }));
        }));
        if (streamEnabled(env)) {
            context.waitUntil(logStreamStorageHeadroom(env).then(() => undefined, (error) => {
                console.error(formatLog('stream_storage_headroom_failed', { code: safeErrorCode(error) }));
            }));
        }
    },

    async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
        const deliver = async (message: Message<unknown>) => {
            if (env.LIVEPEER_WEBHOOK_QUEUE_ENABLED !== 'true'
                || !env.LIVEPEER_CONTROL
                || !validWebhookQueuePolicy(env)) {
                message.retry();
                return;
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
                return;
            }
            const deliveryStartedAtMs = Date.now();
            const deliveryStarted = performance.now();
            const queueLagMs = Math.max(0, deliveryStartedAtMs - Number(input.enqueued_at_ms));
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
                        headers: {
                            'Content-Type': 'application/json',
                            ...(input.provider ? { [MEDIA_PROVIDER_HEADER]: input.provider } : {}),
                            ...(input.signed_time_ms ? { [MEDIA_WEBHOOK_TIME_HEADER]: input.signed_time_ms } : {}),
                        },
                        body: rawBody,
                    },
                ));
                const outcome = response.ok ? 'ACK' : 'RETRY';
                if (response.ok) message.ack();
                else message.retry();
                console.info(formatLog('webhook_queue_delivery_completed', {
                    outcome,
                    queueLagMs,
                    processingMs: Math.max(0, performance.now() - deliveryStarted),
                }));
            } catch {
                message.retry();
                console.info(formatLog('webhook_queue_delivery_completed', {
                    outcome: 'RETRY',
                    queueLagMs,
                    processingMs: Math.max(0, performance.now() - deliveryStarted),
                }));
            }
        };
        const parallelism = isPublicTestnetEnvironment(env) ? 10 : 1;
        for (let offset = 0; offset < batch.messages.length; offset += parallelism) {
            await Promise.all(batch.messages.slice(offset, offset + parallelism).map(deliver));
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
        if (isPublicTestnetEnvironment(this.env)) await requirePublicUploadPolicy(this.env);
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
        if (await expireLegacyProfileJob(this.state, this.env, job)) return;
        if (!job.publication) {
            if (job.providerVerification && ['UPLOAD_READY', 'UPLOADING', 'PROCESSING'].includes(job.state)) {
                const event = await synthesizedProviderEvent({
                    provider: jobProviderKind(job), event: 'processing', assetId: job.assetId!, phase: 'ready',
                    nowMs: Date.now(),
                }, sha256Hex);
                await this.handleProviderEvent(event, await this.state.storage.get<JobRecord>(JOB_KEY));
                return;
            }
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
            if (isPublicTestnetEnvironment(this.env)) {
                await requirePublicUploadPolicy(this.env, { fresh: url.pathname === '/internal/sponsored-upload-relay' });
            }
            if (request.method === 'POST' && url.pathname === '/v1/upload-intents') {
                if (!isPublicBetaPacket(this.env) && !isPublicTestnetEnvironment(this.env)) return await this.reserveUploadIntent(request);
                const run = this.operatorTail.then(() => this.reserveUploadIntent(request));
                this.operatorTail = run.then(() => undefined, () => undefined);
                return await run;
            }
            if (request.method === 'POST' && url.pathname === '/v1/upload-heartbeats') {
                if (isPublicBetaPacket(this.env) || isPublicTestnetEnvironment(this.env)) {
                    const run = this.operatorTail.then(() => this.heartbeatUploadLease(request));
                    this.operatorTail = run.then(() => undefined, () => undefined);
                    return await run;
                }
                return await this.heartbeatUploadLease(request);
            }
            if (request.method === 'POST' && url.pathname === '/v1/upload-cancellations') {
                const run = this.operatorTail.then(() => this.cancelUpload(request));
                this.operatorTail = run.then(() => undefined, () => undefined);
                return await run;
            }
            if (request.method === 'POST' && url.pathname === '/v1/playback-tokens') {
                return await this.issuePlaybackToken(request);
            }
            if (request.method === 'POST' && url.pathname === '/internal/outbox') {
                return await this.enqueueOutbox(request);
            }
            if (request.method === 'POST' && url.pathname === '/internal/livepeer-webhook') {
                if (!isPublicBetaPacket(this.env) && !isPublicTestnetEnvironment(this.env)) return await this.handleLivepeerWebhook(request);
                const run = this.operatorTail.then(() => this.handleLivepeerWebhook(request));
                this.operatorTail = run.then(() => undefined, () => undefined);
                return await run;
            }
            if (request.method === 'POST' && url.pathname === '/internal/finalize') {
                const run = this.operatorTail.then(() => this.finalizePublication(request));
                this.operatorTail = run.then(() => undefined, () => undefined);
                return await run;
            }
            if (request.method === 'POST' && url.pathname === '/internal/mark-watched') {
                const run = this.operatorTail.then(() => this.markWatched(request));
                this.operatorTail = run.then(() => undefined, () => undefined);
                return await run;
            }
            if (request.method === 'POST' && url.pathname === '/internal/release-expired') {
                const run = this.operatorTail.then(() => this.releaseExpired(request));
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
            if (request.method === 'POST' && url.pathname === '/internal/admission/resume') {
                return await resumeAdmission(this.state, this.env, await readJsonObject(request));
            }
            if (request.method === 'POST' && url.pathname === '/internal/admission/preflight') {
                return await preflightAdmission(this.state, this.env, await readJsonObject(request));
            }
            if (request.method === 'POST' && url.pathname === '/internal/admission/mark') {
                return await markAdmission(this.state, await readJsonObject(request));
            }
            if (request.method === 'POST' && url.pathname === '/internal/admission/stream-signal') {
                return await recordStreamSignal(this.state, await readJsonObject(request));
            }
            if (request.method === 'GET' && url.pathname === '/internal/admission/stream-status') {
                return await readStreamAdmissionStatus(this.state, this.env);
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
            if (url.pathname === '/internal/creator-pending-upload') {
                if (request.method === 'POST') return await recordCreatorPendingUpload(this.state, request);
                if (request.method === 'GET') return await readCreatorPendingUpload(this.state, url);
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
        // Only a signature by the job's registered upload key may consume the creator's bucket.
        await enforcePublicBetaAccountRateLimit(this.env, '/v1/upload-intents', input.envelope.account_id);
        const [publicBetaJob, publicBetaState] = isPublicBetaPacket(this.env)
            ? await Promise.all([
                readFinalPublicTestnetBetaJob(this.env, input.body.job_id),
                readFinalPublicTestnetBetaState(this.env),
            ])
            : [null, null];
        if (isPublicBetaPacket(this.env)) {
            await requirePublicTestnetBetaJob(input, chainJob, publicBetaJob, publicBetaState);
        }

        const candidate = jobRecord(input, this.env, isPublicTestnetEnvironment(this.env)
            ? String(publicUploadJobDeadline(chainJob)) : publicBetaJob?.deadline_at_ms);
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
            if (!['UPLOAD_READY', 'UPLOADING', 'PROCESSING'].includes(record.state)) {
                await persistUploadVerificationResult(this.state);
                return json({ job_id: record.jobId, generation: record.generation, state: record.state });
            }
            const observation = await this.state.storage.get<ReconcileRecord>(RECONCILE_KEY);
            if (observation?.uploadReadFailed) throw new Error(observation.uploadErrorCode || 'provider_unavailable');
            return json({ job_id: record.jobId, generation: record.generation, state: record.state });
        }
        if (input.body.recovery === 'resume') {
            if (!isPublicTestnetEnvironment(this.env) || !record.assetId) throw new Error('provider_recovery_not_ready');
            if (['PROCESSING', 'READY_VERIFIED', 'FINALIZE_QUEUED', 'FINALIZE_RETRY', 'ONCHAIN_PUBLISHED',
                'PROVIDER_FAILED', 'UPLOAD_EXPIRED'].includes(record.state)) {
                return json({ job_id: record.jobId, generation: record.generation, state: record.state });
            }
            if (!['UPLOAD_READY', 'UPLOADING'].includes(record.state) || !record.tusEndpoint) {
                throw new Error('provider_recovery_not_ready');
            }
            if (jobProviderKind(record) === 'stream'
                && Date.now() >= (record.providerCreate?.completedAtMs ?? record.createdAtMs) + STREAM_TUS_URL_LIFETIME_MS) {
                const ended = await terminateStreamJob(this.state, this.env, record, 'UPLOAD_EXPIRED', 'provider_tus_url_expired');
                return json({ job_id: ended.jobId, generation: ended.generation, state: ended.state });
            }
            const source = await mediaProvider(this.env, record).readTusOffset(record.tusEndpoint).catch(async (error) => {
                if (error instanceof Error && error.message === 'provider_tus_state_invalid') throw new Error('provider_recovery_not_ready');
                if (error instanceof Error && error.message === 'provider_tus_url_expired' && jobProviderKind(record) === 'stream') {
                    await terminateStreamJob(this.state, this.env, record, 'UPLOAD_EXPIRED', 'provider_tus_url_expired');
                }
                throw error;
            });
            if (source.lengthBytes !== record.expectedSourceBytes) throw new Error('provider_identity_mismatch');
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
            const lease = await requestAdmission(this.env, record, jobProviderKind(record) === 'stream'
                ? await readStreamStorage(this.env, record) : undefined);
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
            provider = await mediaProvider(this.env, pending).createUpload({
                ...pending,
                uploadExpiresAtMs: Math.min(
                    Date.now() + STREAM_UPLOAD_EXPIRY_MS,
                    pending.absoluteDeadlineAtMs ?? Number.MAX_SAFE_INTEGER,
                ),
            });
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
        if (publicBetaDeadlineExpired(ready) && jobProviderKind(ready) === 'stream') {
            await this.state.storage.put(JOB_KEY, ready);
            await terminateStreamJob(this.state, this.env, ready, 'UPLOAD_EXPIRED', 'job_expired');
            throw new Error('admission_denied');
        }
        if (publicBetaDeadlineExpired(ready)) {
            const expired = transitionJob(ready, 'UPLOAD_EXPIRED');
            await this.state.storage.put(JOB_KEY, expired);
            await updateAdmission(this.env, expired, 'UPLOAD_EXPIRED');
            throw new Error('admission_denied');
        }
        await this.state.storage.put(JOB_KEY, ready);
        logJobStateTransition(pending.state, ready.state);
        await updateAdmission(this.env, ready, 'UPLOAD_READY');
        if (jobProviderKind(ready) === 'stream') await scheduleAlarmNoLaterThan(this.state, Date.now() + STREAM_UPLOAD_POLL_MS);
        return uploadIntentResponse(ready, true);
    }

    private async reconcileUpload(record: JobRecord): Promise<void> {
        if (jobProviderKind(record) === 'stream') {
            await this.pollStreamUpload(record);
            return;
        }
        if ((!isPublicBetaPacket(this.env) && !isPublicTestnetEnvironment(this.env))
            || !record.absoluteDeadlineAtMs
            || !record.assetId
            || !['UPLOAD_READY', 'UPLOADING', 'PROCESSING'].includes(record.state)) return;
        if (publicBetaDeadlineExpired(record)) {
            const expired = transitionJob(record, 'UPLOAD_EXPIRED');
            await this.state.storage.put(JOB_KEY, expired);
            await persistUploadVerificationResult(this.state);
            await updateAdmission(this.env, expired, 'UPLOAD_EXPIRED');
            return;
        }
        const previous = await this.state.storage.get<ReconcileRecord>(RECONCILE_KEY);
        if (previous && previous.nextReconcileAtMs > Date.now()) {
            await scheduleReconcile(this.state, Math.min(previous.nextReconcileAtMs, record.absoluteDeadlineAtMs));
            return;
        }
        const nextReadAtMs = Math.min(Date.now() + RECONCILE_CONFIRMATION_MS, record.absoluteDeadlineAtMs);
        // Reserve the next read before I/O, without treating normal processing as an error.
        await this.state.storage.put(RECONCILE_KEY, {
            ...previous, schema: 'youtick.livepeer-reconcile.v1', status: 'PROVIDER_UNKNOWN',
            consecutiveErrors: previous?.consecutiveErrors || 0,
            nextReconcileAtMs: nextReadAtMs, uploadReadFailed: true,
            uploadErrorCode: previous?.uploadErrorCode || 'provider_unavailable',
        } satisfies ReconcileRecord);
        await scheduleReconcile(this.state, nextReadAtMs);
        try {
            const provider = mediaProvider(this.env, record);
            const asset = await provider.readAsset(record.assetId);
            if (!provider.identityMatches(asset, providerIdentity(record, record.assetId, record.apiTokenName))
                || asset.policy !== 'jwt') throw new Error('provider_identity_mismatch');
            if (!['waiting', 'processing', 'ready', 'failed'].includes(asset.phase)) {
                throw new Error('provider_state_invalid');
            }
            const response = await this.handleProviderEvent(await synthesizedProviderEvent({
                provider: provider.id,
                event: asset.phase === 'failed' ? 'failed' : 'processing',
                assetId: asset.id,
                phase: asset.phase,
                nowMs: Date.now(),
            }, sha256Hex), await this.state.storage.get<JobRecord>(JOB_KEY));
            if (!response.ok) throw new Error('provider_unavailable');
            const current = (await this.state.storage.get<ReconcileRecord>(RECONCILE_KEY))!;
            const pending = (await this.state.storage.get<JobRecord>(JOB_KEY))?.providerVerification;
            await this.state.storage.put(RECONCILE_KEY, { ...current, consecutiveErrors: 0,
                nextReconcileAtMs: pending ? current.nextReconcileAtMs : nextReadAtMs,
                uploadReadFailed: false, uploadErrorCode: undefined });
        } catch (error) {
            if (['provider_unavailable', 'near_finalize_pending', 'near_job_query_failed'].includes(safeErrorCode(error))) {
                await persistUnknownReconcile(this.state, 'PROVIDER_UNKNOWN');
                await scheduleReconcile(this.state, record.absoluteDeadlineAtMs);
            }
            await persistUploadVerificationResult(this.state, safeErrorCode(error));
            throw error;
        }
    }

    /**
     * Bounded Stream poll (the V2 Bridge has no other poll): one GET per alarm for a job still
     * uploading or processing, plus one tus HEAD while Stream transcodes, so a lost webhook cannot
     * strand a job whose fee is spent and an overflow ends before readiness. Stops at a terminal
     * state; a pre-ready job ends at the tus URL's 24 h life.
     */
    private async pollStreamUpload(record: JobRecord): Promise<void> {
        if (!['UPLOAD_READY', 'UPLOADING', 'PROCESSING'].includes(record.state) || !record.assetId) return;
        const now = Date.now();
        const createdAtMs = record.providerCreate?.completedAtMs ?? record.createdAtMs;
        if (now >= createdAtMs + STREAM_TUS_URL_LIFETIME_MS) {
            await terminateStreamJob(this.state, this.env, record, 'UPLOAD_EXPIRED', 'provider_tus_url_expired');
            return;
        }
        const provider = mediaProvider(this.env, record) as CloudflareStreamProvider;
        const nextPollAtMs = now + (record.state === 'PROCESSING' ? STREAM_PROCESSING_POLL_MS : STREAM_UPLOAD_POLL_MS);
        let video: Awaited<ReturnType<CloudflareStreamProvider['readVideo']>>;
        try {
            video = await provider.readVideo(record.assetId);
        } catch (error) {
            const code = safeErrorCode(error);
            if (code === 'provider_asset_missing') {
                await terminateStreamJob(this.state, this.env, record, 'PROVIDER_FAILED', code);
                return;
            }
            await scheduleReconcile(this.state, Math.min(nextPollAtMs, createdAtMs + STREAM_TUS_URL_LIFETIME_MS));
            return;
        }
        if (video.uid !== record.assetId || !video.route
            || video.route.jobId !== record.jobId || video.route.generation !== record.generation) {
            await terminateStreamJob(this.state, this.env, record, 'PROVIDER_FAILED', 'provider_identity_mismatch');
            return;
        }
        if (video.state === 'error') {
            await terminateStreamJob(this.state, this.env, record, 'PROVIDER_FAILED', video.errorReasonCode || 'ERR_UNKNOWN');
            return;
        }
        if (video.state === 'ready' && video.readyToStream) {
            await this.handleProviderEvent(await synthesizedProviderEvent({
                provider: 'stream', event: 'processing', assetId: record.assetId, phase: 'ready', nowMs: now,
            }, sha256Hex), record);
            const after = await this.state.storage.get<JobRecord>(JOB_KEY);
            if (after && ['UPLOAD_READY', 'UPLOADING', 'PROCESSING'].includes(after.state) && !after.providerVerification) {
                await scheduleReconcile(this.state, nextPollAtMs);
            }
            return;
        }
        const progress = { state: video.state, pctComplete: Number.isFinite(video.pctComplete) ? video.pctComplete : 0 };
        const tracked = trackStreamProgress(record, progress, now);
        if (['queued', 'inprogress', 'downloading'].includes(video.state)) {
            // Option A, early: an upload past its declared length (offset > length, the overflow
            // shape of 2026-10-21 F3b) is terminal as soon as a poll sees it, before Stream finishes
            // transcoding the extra bytes. Only that definitive shape ends the job here; every other
            // HEAD outcome is left to the ready proof, which fails closed.
            if (record.tusEndpoint && await streamUploadOverflowed(provider, record.tusEndpoint)) {
                await terminateStreamJob(this.state, this.env, tracked, 'PROVIDER_FAILED', 'provider_tus_state_invalid');
                return;
            }
            if (record.state !== 'PROCESSING') {
                const processing = transitionJob(tracked, 'PROCESSING');
                await this.state.storage.put(JOB_KEY, processing);
                logJobStateTransition(record.state, processing.state, record);
                await scheduleReconcile(this.state, now + STREAM_PROCESSING_POLL_MS);
                return;
            }
            if (tracked !== record) await this.state.storage.put(JOB_KEY, tracked);
            const stuckTimeoutMs = streamStuckTimeoutMs(this.env) ?? STREAM_DEFAULT_STUCK_TIMEOUT_MS;
            const lastProgressAtMs = tracked.streamProgress?.changedAtMs ?? tracked.stateChangedAtMs ?? now;
            if (now - lastProgressAtMs > stuckTimeoutMs) {
                // One authoritative read before a destructive decision: fail only if nothing moved.
                let confirm: Awaited<ReturnType<CloudflareStreamProvider['readVideo']>> | null = null;
                try {
                    confirm = await provider.readVideo(record.assetId);
                } catch {
                    confirm = null;
                }
                const unchanged = confirm !== null
                    && confirm.state === progress.state
                    && (Number.isFinite(confirm.pctComplete) ? confirm.pctComplete : 0) === progress.pctComplete;
                if (unchanged) {
                    console.warn(formatLog('provider_job_stuck', { state: video.state, stuckTimeoutMs }));
                    await terminateStreamJob(this.state, this.env, tracked, 'PROVIDER_FAILED', 'provider_job_stuck', { reason: 'stuck' });
                    return;
                }
                if (confirm) {
                    const moved = trackStreamProgress(tracked, {
                        state: confirm.state,
                        pctComplete: Number.isFinite(confirm.pctComplete) ? confirm.pctComplete : 0,
                    }, Date.now());
                    if (moved !== tracked) await this.state.storage.put(JOB_KEY, moved);
                }
                await scheduleReconcile(this.state, Date.now() + STREAM_PROCESSING_POLL_MS);
                return;
            }
        } else if (tracked !== record) {
            await this.state.storage.put(JOB_KEY, tracked);
        }
        if (video.state === 'pendingupload' && record.leaseExpiresAtMs !== undefined && record.leaseExpiresAtMs <= now) {
            // No heartbeat renewed the lease and nothing arrived: release the reservation now.
            await terminateStreamJob(this.state, this.env, record, 'UPLOAD_EXPIRED', 'lease_expired');
            return;
        }
        await scheduleReconcile(this.state, Math.min(nextPollAtMs, createdAtMs + STREAM_TUS_URL_LIFETIME_MS));
    }

    private async heartbeatUploadLease(request: Request): Promise<Response> {
        const input = await parseUploadHeartbeatRequest(request, this.env);
        await verifyControlSignature(request, input.envelope);
        const { job: chainJob } = await readFinalMediaJob(this.env, input.body.job_id);
        requireHeartbeatChainJob(input, chainJob);
        await enforcePublicBetaAccountRateLimit(this.env, '/v1/upload-heartbeats', input.envelope.account_id);
        if (isPublicTestnetEnvironment(this.env)) publicUploadJobDeadline(chainJob);
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
                if (jobProviderKind(record) === 'stream') {
                    await terminateStreamJob(this.state, this.env, record, 'UPLOAD_EXPIRED', 'lease_expired');
                    throw error;
                }
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
                return { record: current, duplicate: true, fromState: current.state, releaseProvider: false };
            }
            // A Stream upload the creator gives up before its bytes are in frees the slot at once
            // (UID deleted, reservation released) instead of holding it until the lease lapses.
            // Once Stream has the bytes (PROCESSING and later) the job runs to its own end.
            if (['UPLOAD_READY', 'UPLOADING'].includes(current.state) && jobProviderKind(current) === 'stream') {
                await transaction.put(nonceKey, { expiresAtMs: Number(input.envelope.expires_at_ms) });
                return { record: current, duplicate: false, fromState: current.state, releaseProvider: true };
            }
            if (!['AUTHORIZED', 'LEASED'].includes(current.state)) {
                throw new Error('upload_cancel_denied');
            }
            const cancelled = transitionJob(current, 'CANCELLED');
            await transaction.put(nonceKey, { expiresAtMs: Number(input.envelope.expires_at_ms) });
            await transaction.put(JOB_KEY, cancelled);
            return { record: cancelled, duplicate: false, fromState: current.state, releaseProvider: false };
        });
        await scheduleAlarmNoLaterThan(this.state, Number(input.envelope.expires_at_ms));
        if (result.releaseProvider) {
            // Transition, UID delete, archive and admission release in one place with the other Stream exits.
            await terminateStreamJob(this.state, this.env, result.record, 'CANCELLED', 'creator_cancelled');
            return json({ cancelled: true, duplicate: false, refundable: false });
        }
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
        // The V1 session-grant path is Studio-only: a Stream publication never gets a /v1 token.
        if (mediaProfileFamily(authorization.profileConfigSha256) === 'stream' || jobProviderKind(job) === 'stream') {
            throw new Error('playback_denied');
        }
        const nowMs = Date.now();
        const remainingSeconds = Math.floor((authorization.grantExpiresAtMs - nowMs) / 1000);
        if (remainingSeconds < 1) throw new Error('playback_denied');
        const ttlSeconds = Math.min(
            input.body.requested_ttl_seconds,
            remainingSeconds,
            isPublicBetaPacket(this.env) || isPublicTestnetEnvironment(this.env) ? PLAYBACK_V2_TTL_SECONDS : PLAYBACK_MAX_TTL_SECONDS,
        );
        const issuedAtSeconds = Math.floor(nowMs / 1000);
        const signed = await mediaProvider(this.env, authorization.profileConfigSha256).signPlayback(
            input.body.playback_id,
            ttlSeconds,
            issuedAtSeconds,
        );
        return json({
            schema: 'youtick.livepeer-playback-token.v1',
            playback_id: input.body.playback_id,
            token: signed.token,
            expires_at_ms: String(signed.expiresAtSeconds * 1000),
            hls_url: signed.hlsUrl,
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

    // Raw bodies arrive from the ingress (already authenticated) or the Queue consumer; the
    // ingress names the adapter in MEDIA_PROVIDER_HEADER, the Queue path falls back to the job record.
    private async handleLivepeerWebhook(request: Request): Promise<Response> {
        const rawBody = new Uint8Array(await request.arrayBuffer());
        if (rawBody.byteLength > MAX_CONTROL_BODY_BYTES) throw new Error('control_body_too_large');
        const existing = await this.state.storage.get<JobRecord>(JOB_KEY);
        const kind = mediaProviderKind(request.headers.get(MEDIA_PROVIDER_HEADER))
            ?? (existing ? jobProviderKind(existing) : 'studio');
        const signedTime = request.headers.get(MEDIA_WEBHOOK_TIME_HEADER);
        const event = await mediaProvider(this.env, { provider: kind }).parseWebhook(
            rawBody,
            signedTime && /^[1-9][0-9]{0,15}$/.test(signedTime) ? { timestampMs: Number(signedTime) } : undefined,
        );
        return this.handleProviderEvent(event, existing);
    }

    private async handleProviderEvent(
        event: NormalizedWebhookEvent | null,
        existing: JobRecord | undefined,
    ): Promise<Response> {
        if (!event) {
            return json({ accepted: true, ignored: true }, 202);
        }
        if (!existing || event.assetId !== existing.assetId || event.provider !== jobProviderKind(existing)) {
            return json({ accepted: true, ignored: true }, 202);
        }
        const legacyExpired = await expireLegacyProfileJob(this.state, this.env, existing);
        if (legacyExpired) return legacyExpired;
        if (publicBetaDeadlineExpired(existing)
            && !['UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'CANCELLED', 'ONCHAIN_PUBLISHED']
                .includes(existing.state)) {
            if (jobProviderKind(existing) === 'stream') {
                await terminateStreamJob(this.state, this.env, existing, 'UPLOAD_EXPIRED', 'job_expired');
                return json({ accepted: true, expired: true }, 202);
            }
            const expired = transitionJob(existing, 'UPLOAD_EXPIRED');
            await this.state.storage.put(JOB_KEY, expired);
            await scheduleTerminalArchive(this.state, this.env, expired);
            await updateAdmission(this.env, expired, 'UPLOAD_EXPIRED');
            return json({ accepted: true, expired: true }, 202);
        }
        if (['PROVIDER_FAILED', 'UPLOAD_EXPIRED', 'CANCELLED'].includes(existing.state)) {
            return json({ accepted: true, ignored: true, terminal: true }, 202);
        }
        const providerFailed = isProviderFailureEvent(event);
        const readinessEvent = isReadinessEvent(event, existing.state);
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
                if (jobProviderKind(existing) === 'stream') {
                    // The signed error webhook is terminal even while GET still reports inprogress.
                    await terminateStreamJob(this.state, this.env, existing, 'PROVIDER_FAILED', event.failureCode ?? 'ERR_UNKNOWN');
                    return json({ accepted: true, provider_failed: true });
                }
                const failed = transitionJob(existing, 'PROVIDER_FAILED');
                await this.state.storage.put(JOB_KEY, failed);
                logJobStateTransition(existing.state, failed.state, existing);
                await scheduleTerminalArchive(this.state, this.env, failed);
                await updateAdmission(this.env, failed, 'PROVIDER_FAILED');
                return json({ accepted: true, provider_failed: true });
            }
            const tracked = trackStreamProgress(existing, event.streamProgress, Date.now());
            if (['UPLOAD_READY', 'UPLOADING'].includes(existing.state)
                && isProcessingEvent(event)) {
                const processing = transitionJob(tracked, 'PROCESSING');
                await this.state.storage.put(JOB_KEY, processing);
                logJobStateTransition(existing.state, processing.state, existing);
                return json({ accepted: true, processing: true });
            }
            if (tracked !== existing) await this.state.storage.put(JOB_KEY, tracked);
            return json({ accepted: true, ignored: true }, 202);
        }
        if (isLegacyProfileJobOnMarketV2(this.env, existing) && existing.publication
            && ['READY_VERIFIED', 'FINALIZE_QUEUED', 'FINALIZE_RETRY'].includes(existing.state)) {
            // Settled from final chain state only: no provider re-verification, no finalization.
            return settleLegacyProfileJob(this.state, this.env, existing);
        }

        if (jobProviderKind(existing) === 'stream' && existing.publication
            && ['READY_VERIFIED', 'FINALIZE_QUEUED', 'FINALIZE_RETRY'].includes(existing.state)) {
            // The byte proof is stored and the upload URL is gone: never re-verify; the alarm finalizes.
            return json({ accepted: true, duplicate: true, processing: true }, 202);
        }
        const dedupKey = `webhook:${event.digest}`;
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
                    event: event.providerEvent,
                    assetId: event.assetId,
                    phase: event.phase,
                    receivedAtMs: Date.now(),
                });
            }
            return Boolean(duplicate);
        });
        let record = existing;
        if (!seen) {
            try {
                const verified = await verifyReadyProviderAsset(this.state, this.env, record, 'ready');
                if (!verified) {
                    await this.state.storage.delete(dedupKey);
                    return json({ accepted: true, processing: true }, 202);
                }
                const { tusEndpoint: _clearedTusEndpoint, providerVerification: _checkpoint, ...withoutTusEndpoint } = record;
                record = {
                    ...transitionJob(withoutTusEndpoint, 'READY_VERIFIED'),
                    publication: verified.publication,
                    // The upload URL is cleared here, so the byte proof must be stored no later than this write.
                    ...(verified.sourceBytesEvidence ? { sourceBytesEvidence: verified.sourceBytesEvidence } : {}),
                };
                await this.state.storage.put(JOB_KEY, record);
                await persistUploadVerificationResult(this.state);
                logJobStateTransition(existing.state, record.state, existing);
                await updateAdmission(this.env, record, 'READY_VERIFIED',
                    verified.durationSeconds !== undefined ? { durationSeconds: verified.durationSeconds } : undefined);
                await this.state.storage.put(dedupKey, {
                    state: 'VERIFIED',
                    event: event.providerEvent,
                    assetId: event.assetId,
                    phase: event.phase,
                    receivedAtMs: Date.now(),
                });
            } catch (error) {
                await this.state.storage.delete(dedupKey);
                const code = safeErrorCode(error);
                await persistUploadVerificationResult(this.state, code);
                if (jobProviderKind(record) === 'stream'
                    && (code === 'provider_tus_state_invalid' || code === 'provider_tus_url_expired')) {
                    // Option A failed (overflow, short or foreign upload) or the URL died: never finalize.
                    await terminateStreamJob(this.state, this.env, record,
                        code === 'provider_tus_url_expired' ? 'UPLOAD_EXPIRED' : 'PROVIDER_FAILED', code);
                    return json({ accepted: true, provider_failed: code === 'provider_tus_state_invalid', code }, 202);
                }
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
        const input = await parseFinalizeInput(await readJsonObject(request), this.env);
        return processFinalizeOutbox(this.state, this.env, input);
    }

    private async suspendSales(request: Request): Promise<Response> {
        const input = await parseSuspendSalesInput(await readJsonObject(request));
        return processSuspendSalesOutbox(this.state, this.env, input);
    }

    private async releaseExpired(request: Request): Promise<Response> {
        const input = await parseReleaseExpiredInput(await readJsonObject(request));
        return processReleaseExpiredOutbox(this.state, this.env, input);
    }

    private async markWatched(request: Request): Promise<Response> {
        const input = await parseMarkWatchedInput(await readJsonObject(request));
        return processMarkWatchedOutbox(this.state, this.env, input);
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
            isPublicTestnetEnvironment(this.env) ? null : readFinalPublicTestnetBetaJob(this.env, input.jobId),
            readFinalPublicationById(this.env, input.jobId),
        ]);
        if (isPublicTestnetEnvironment(this.env)) {
            if (chainJob.job.job_id !== input.jobId || chainJob.job.creator_id !== record.creator
                || chainJob.job.generation !== record.generation) throw new Error('provider_identity_mismatch');
            publicUploadJobDeadline(chainJob.job, false);
        } else if (!marker
            || marker.creator_id !== record.creator
            || marker.generation !== 1
            || chainJob.job.fee_quote_hash !== marker.sponsor_quote_id) {
            throw new Error('provider_identity_mismatch');
        }
        const takedown = publication?.availability === 'TAKEDOWN'
            && publication.asset_id_hash === assetIdSha256;
        const expired = publication === null
            && record.state === 'UPLOAD_EXPIRED'
            && (isPublicTestnetEnvironment(this.env)
                ? publicUploadJobDeadline(chainJob.job, false) : Number(marker!.deadline_at_ms)) <= Date.now();
        if (!takedown && !expired) throw new Error('provider_identity_mismatch');

        const provider = mediaProvider(this.env, record);
        const asset = await provider.readAsset(input.assetId);
        // The creating token is not bound here: takedown and expiry deletes may run after a key rotation.
        if (!provider.identityMatches(asset, providerIdentity(record, input.assetId, null))
            || (publication !== null
                && (publication.playback_id !== asset.playbackId
                    || publication.project_id_hash !== await sha256Hex(asset.projectId ?? '')))) {
            throw new Error('provider_identity_mismatch');
        }
        try {
            const outcome = await provider.deleteAsset(input.assetId);
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

/** True only for a readable tus HEAD whose offset exceeds its length; unreadable, expired or short is false. */
async function streamUploadOverflowed(provider: CloudflareStreamProvider, tusEndpoint: string): Promise<boolean> {
    try {
        const tus = await provider.readTusProgress(tusEndpoint);
        return BigInt(tus.offsetBytes) > BigInt(tus.lengthBytes);
    } catch {
        return false;
    }
}

/** Records a Stream state/pctComplete observation; returns the same object when nothing changed. */
function trackStreamProgress(
    job: JobRecord,
    progress: { state: string; pctComplete: number } | undefined,
    now: number,
): JobRecord {
    if (jobProviderKind(job) !== 'stream' || !progress) return job;
    const previous = job.streamProgress;
    if (previous && previous.state === progress.state && previous.pctComplete === progress.pctComplete) return job;
    return { ...job, streamProgress: { state: progress.state, pctComplete: progress.pctComplete, changedAtMs: now } };
}

/**
 * Ends a Stream job (failure, expiry or cancellation) and deletes its UID exactly once, so the
 * reservation Stream booked at creation is released; gated by the provider-mutation flag.
 */
async function terminateStreamJob(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
    toState: 'PROVIDER_FAILED' | 'UPLOAD_EXPIRED' | 'CANCELLED',
    code: string,
    extra?: { reason: 'stuck' },
): Promise<JobRecord> {
    const current = await state.storage.get<JobRecord>(JOB_KEY) ?? job;
    let record = current;
    if (!['PROVIDER_FAILED', 'UPLOAD_EXPIRED', 'CANCELLED'].includes(current.state)) {
        record = transitionJob(current, toState);
        await state.storage.put(JOB_KEY, record);
        logJobStateTransition(current.state, record.state, current);
    }
    console.warn(formatLog(toState === 'PROVIDER_FAILED' ? 'stream_upload_failed' : 'stream_upload_ended', {
        toState: record.state,
        code: /^[A-Za-z0-9_]{1,64}$/.test(code) ? code : 'unknown',
    }));
    record = await deleteStreamUpload(state, env, record);
    await scheduleTerminalArchive(state, env, record);
    await updateAdmission(env, record, record.state as 'PROVIDER_FAILED' | 'UPLOAD_EXPIRED' | 'CANCELLED', extra);
    return record;
}

/** Cron: log the prepaid storage headroom every run and keep the health block fresh. */
async function logStreamStorageHeadroom(env: Env): Promise<void> {
    if (!validStreamConfig(env)) return;
    const usage = await streamProvider(env).readStorageUsage();
    const capacity = positiveIntegerVar(env.STREAM_STORAGE_MINUTES_CAPACITY)!;
    const cap = streamMaxDurationSeconds(env)!;
    console.info(formatLog('stream_storage_headroom', {
        totalStorageMinutes: usage.totalStorageMinutes,
        capacityMinutes: capacity,
        headroomMinutes: capacity - usage.totalStorageMinutes,
        uploadsThatFit: Math.max(0, Math.floor((capacity - usage.totalStorageMinutes) / (cap / 60))),
    }));
    await signalStreamAdmission(env, { storageMinutesUsed: usage.totalStorageMinutes });
}

/** Reads Stream's prepaid storage for a new lease; the admission object makes the decision. */
async function readStreamStorage(
    env: Env,
    job: JobRecord,
): Promise<{ storageMinutesUsed: number; storageMinutesLimit: number | null }> {
    const usage = await (mediaProvider(env, job) as CloudflareStreamProvider).readStorageUsage();
    return { storageMinutesUsed: usage.totalStorageMinutes, storageMinutesLimit: usage.totalStorageMinutesLimit };
}

async function deleteStreamUpload(state: DurableObjectState, env: Env, job: JobRecord): Promise<JobRecord> {
    if (jobProviderKind(job) !== 'stream' || !job.assetId || job.providerDelete
        || env.LIVEPEER_PROVIDER_MUTATIONS_ENABLED !== 'true') return job;
    let outcome: NonNullable<JobRecord['providerDelete']>['outcome'];
    try {
        outcome = await mediaProvider(env, job).deleteAsset(job.assetId) === 'deleted' ? 'DELETED' : 'MISSING';
    } catch {
        outcome = 'AMBIGUOUS';
    }
    const record: JobRecord = {
        ...job,
        providerDelete: { assetIdSha256: await sha256Hex(job.assetId), outcome, attemptedAtMs: Date.now() },
    };
    await state.storage.put(JOB_KEY, record);
    console.info(formatLog('stream_upload_deleted', { outcome }));
    if (outcome === 'AMBIGUOUS') await closeAdmissionAfterAmbiguousDelete(env, record);
    return record;
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

async function scheduleTerminalArchive(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<void> {
    await persistUploadVerificationResult(state);
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
        return expireJob(state, env, job);
    }
    if (isLegacyProfileJobOnMarketV2(env, job)) {
        return settleLegacyProfileJob(state, env, job);
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
        logJobStateTransition(job.state, retry.state, job);
        await scheduleReconcile(state, nextAttemptAtMs);
        return response;
    }
    const result = await response.clone().json() as { finalized?: unknown };
    const nextState = result.finalized === true ? 'ONCHAIN_PUBLISHED' : 'FINALIZE_QUEUED';
    const { finalizeRetry: _retry, ...withoutRetry } = job;
    const record = transitionJob(withoutRetry, nextState);
    await state.storage.put(JOB_KEY, record);
    logJobStateTransition(job.state, record.state, job);
    await updateAdmission(env, record, nextState);
    if (record.state === 'ONCHAIN_PUBLISHED') {
        await ensureReconcileScheduled(state);
    } else {
        await scheduleReconcile(state, Date.now() + RECONCILE_BACKOFF_MS[0]);
    }
    return response;
}

async function expireJob(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<Response> {
    if (jobProviderKind(job) === 'stream') {
        await terminateStreamJob(state, env, job, 'UPLOAD_EXPIRED', 'job_expired');
        return json({ accepted: true, expired: true }, 202);
    }
    const expired = transitionJob(job, 'UPLOAD_EXPIRED');
    await state.storage.put(JOB_KEY, expired);
    await scheduleTerminalArchive(state, env, expired);
    await updateAdmission(env, expired, 'UPLOAD_EXPIRED');
    return json({ accepted: true, expired: true }, 202);
}

// A job stored with the V1 profile id before the MC rename can never finalize on Market V2
// (assert_profile requires the neutral id and job.profile_id == submission.profile_id).
function isLegacyProfileJobOnMarketV2(env: Env, job: JobRecord): boolean {
    return isMarketV2(env) && job.profileId === LEGACY_PROFILE_ID;
}

// States from which UPLOAD_EXPIRED is a legal transition before a publication exists.
const LEGACY_PROFILE_EXPIRABLE_STATES = new Set<JobState>([
    'AUTHORIZED', 'LEASED', 'PROVIDER_CREATE_PENDING', 'UPLOAD_READY', 'UPLOADING', 'PROCESSING',
]);

async function expireLegacyProfileJob(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<Response | null> {
    if (!isLegacyProfileJobOnMarketV2(env, job) || !LEGACY_PROFILE_EXPIRABLE_STATES.has(job.state)) return null;
    console.warn(formatLog('legacy_profile_job_expired', { fromState: job.state, generation: job.generation }));
    logJobStateTransition(job.state, 'UPLOAD_EXPIRED', job);
    return expireJob(state, env, job);
}

// Never forwards a finalization: a publication already final on chain is adopted, anything else expires.
async function settleLegacyProfileJob(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<Response> {
    let published = false;
    if (job.publication) {
        try {
            published = await finalPublicationMatches(env, job.publication);
        } catch (error) {
            if (safeErrorCode(error) !== 'near_finalize_mismatch') {
                // NEAR is unavailable: keep the job and read again later; nothing is signed.
                await scheduleReconcile(state, Date.now() + RECONCILE_BACKOFF_MS[0]);
                return json({ accepted: true, pending: true }, 202);
            }
        }
    }
    if (!published) {
        console.warn(formatLog('legacy_profile_job_expired', { fromState: job.state, generation: job.generation }));
        logJobStateTransition(job.state, 'UPLOAD_EXPIRED', job);
        return expireJob(state, env, job);
    }
    const { finalizeRetry: _retry, ...withoutRetry } = job;
    const record = transitionJob(withoutRetry, 'ONCHAIN_PUBLISHED');
    await state.storage.put(JOB_KEY, record);
    logJobStateTransition(job.state, record.state, job);
    await updateAdmission(env, record, 'ONCHAIN_PUBLISHED');
    await ensureReconcileScheduled(state);
    return json({ accepted: true, finalized: true });
}

export async function forwardUploadIntent(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!env.LIVEPEER_CONTROL) throw new Error('runtime_not_configured');
        const forwardingRequest = request.clone();
        // The account limit runs in the object once the signature and on-chain key binding are verified.
        const input = await parseUploadIntentRequest(request, env);
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
        // The account limit runs in the object once the signature and on-chain key binding are verified.
        const input = await parseUploadHeartbeatRequest(request, env);
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
        // creator_id is unsigned here, so only the route's IP limit applies; an account bucket would let anyone lock it.
        const input = parseUploadPreflightRequest(await readJsonObject(request));
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
                // Stream-only Market V2: the preflight also answers the reservation budget.
                ...(!studioActive(env) && streamMaxDurationSeconds(env) !== null
                    ? { reservedSeconds: streamMaxDurationSeconds(env) } : {}),
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
        // creator_id is unsigned here, so only the route's IP limit applies; an account bucket would let anyone lock it.
        const input = parseSponsoredUploadQuoteRequest(await readJsonObject(request.clone()));
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
        if (isPublicTestnetEnvironment(env)) {
            const currentProfile = await requirePublicUploadPolicy(env, { fresh: true });
            if (input.request.profile_config_sha256 !== currentProfile) throw new Error('admission_denied');
            if (BigInt(input.request.expected_source_bytes) > 5_000_000_000n) {
                throw new Error('admission_denied');
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
        const expectedProfile = isPublicTestnetEnvironment(env)
            ? await requirePublicUploadPolicy(env, { fresh: true }) : profiles.legacy.hash;
        if (input.request.profile_config_sha256 !== expectedProfile) throw new Error('admission_denied');
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
        || !hasTitleContent(value.title)
        || new TextEncoder().encode(value.title).length > 200
        || typeof value.price_usdc !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(value.price_usdc)
        || BigInt(value.price_usdc) < 2_000_000n
        || typeof value.expected_source_bytes !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(value.expected_source_bytes)
        || BigInt(value.expected_source_bytes) > MAX_SOURCE_BYTES
        || value.profile_id !== 'paid-media-livepeer-v1'
        || typeof value.profile_config_sha256 !== 'string'
        || !supportedMediaProfile(value.profile_config_sha256)
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

const CREATOR_PENDING_UPLOAD_ROUTE = '/v1/creators/pending-upload';
const CREATOR_PENDING_UPLOAD_KEY = 'creator-pending-upload';

type CreatorPendingUploadRecord = {
    schema: 'youtick.creator-pending-upload.v1';
    creator: string;
    jobId: string;
    recordedAtMs: number;
};

// One object per creator keeps this index out of the sponsor relayer's bounded storage.
function creatorPendingUploadObject(env: Env, creator: string): DurableObjectStub {
    if (!env.LIVEPEER_CONTROL) throw new Error('runtime_not_configured');
    return env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName([
        'creator-pending-upload',
        env.NEAR_NETWORK,
        env.MARKET_CONTRACT_ID,
        creator,
    ].join(':')));
}

// A discovery hint for browsers that lost local recovery state. NEAR remains the job
// authority: callers verify the returned job on chain, and a failed write never fails a relay.
async function rememberCreatorPaidJob(env: Env, creator: string, jobId: string): Promise<void> {
    try {
        const response = await creatorPendingUploadObject(env, creator).fetch(new Request(
            'https://object/internal/creator-pending-upload',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creator_id: creator, job_id: jobId }),
            },
        ));
        if (!response.ok) throw new Error('creator_pending_upload_record_failed');
    } catch (error) {
        console.error(formatLog('creator_pending_upload_record_failed', { code: safeErrorCode(error) }));
    }
}

async function recordCreatorPendingUpload(state: DurableObjectState, request: Request): Promise<Response> {
    const value = await readJsonObject(request);
    requireExactKeys(value, ['creator_id', 'job_id'], 'invalid_creator_pending_upload');
    const creator = value.creator_id;
    const jobId = value.job_id;
    if (typeof creator !== 'string' || !ACCOUNT_ID_PATTERN.test(creator)
        || typeof jobId !== 'string' || !JOB_ID_PATTERN.test(jobId)) {
        throw new Error('invalid_creator_pending_upload');
    }
    const record: CreatorPendingUploadRecord = {
        schema: 'youtick.creator-pending-upload.v1',
        creator,
        jobId,
        recordedAtMs: Date.now(),
    };
    await state.storage.put(CREATOR_PENDING_UPLOAD_KEY, record);
    return json({ recorded: true });
}

async function readCreatorPendingUpload(state: DurableObjectState, url: URL): Promise<Response> {
    const creator = url.searchParams.get('creator_id') || '';
    if (!ACCOUNT_ID_PATTERN.test(creator)) throw new Error('invalid_creator_pending_upload');
    const record = await state.storage.get<CreatorPendingUploadRecord>(CREATOR_PENDING_UPLOAD_KEY);
    return json({
        schema: 'youtick.creator-pending-upload.v1',
        creator_id: creator,
        job_id: record?.creator === creator ? record.jobId : null,
    });
}

export async function forwardCreatorPendingUpload(
    creator: string,
    env: Env,
    corsOrigin: string,
): Promise<Response> {
    try {
        if (!ACCOUNT_ID_PATTERN.test(creator)) throw new Error('invalid_creator_pending_upload');
        const object = creatorPendingUploadObject(env, creator);
        const response = await object.fetch(new Request(
            `https://object/internal/creator-pending-upload?creator_id=${encodeURIComponent(creator)}`,
        ));
        const headers = new Headers(response.headers);
        headers.set('Cache-Control', 'no-store');
        return withCors(new Response(response.body, { status: response.status, headers }), corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('creator_pending_upload_read_failed', { code }));
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

export async function parseSponsoredUploadRelayRequest(
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
    const compact = typeof ftArgs.msg === 'string' && ftArgs.msg.startsWith(COMPACT_UPLOAD_PREFIX);
    requireExactKeys(ftArgs, compact ? ['receiver_id', 'amount', 'msg'] : ['receiver_id', 'amount', 'memo', 'msg'], shapeCode);
    if (ftArgs.receiver_id !== env.MARKET_CONTRACT_ID
        || typeof ftArgs.amount !== 'string'
        || (!compact && ftArgs.memo !== 'YouTick creator upload fee')
        || typeof ftArgs.msg !== 'string') {
        throw new Error(shapeCode);
    }
    let message: JsonObject;
    try {
        message = requireObject(compact ? await unpackCompactUpload(ftArgs.msg, { network: env.NEAR_NETWORK!, market: env.MARKET_CONTRACT_ID!,
            creator: delegate.senderId, usdc: usdcContractId(env), keyString: bytes => `ed25519:${baseEncode(bytes)}` }) : JSON.parse(ftArgs.msg), shapeCode);
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
        ...(Object.hasOwn(message, 'playback_session') ? ['playback_session'] : []),
    ], shapeCode);
    if (Object.hasOwn(message, 'playback_session')) {
        try { parsePlaybackSessionAuthorization(message.playback_session); } catch { throw new Error(shapeCode); }
    }
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
        hasPlaybackSession: Object.hasOwn(message, 'playback_session'),
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

function requireSponsoredQuoteFresh(input: ParsedSponsoredDelegate, height: number): void {
    if (!sponsoredQuoteIsFresh(input)
        || BigInt(height) < BigInt(input.quote.quote_block_height)
        || BigInt(height) > BigInt(input.quote.max_delegate_block_height)
        || BigInt(height) >= input.maxBlockHeight) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.freshness);
    }
}

async function relaySponsoredUpload(
    state: DurableObjectState,
    env: Env,
    request: Request,
): Promise<Response> {
    const input = await parseSponsoredUploadRelayRequest(request, env);
    const existingJob = await readSponsoredMediaJob(env, input.request.job_id);
    if (existingJob) {
        requireExactSponsoredJob(existingJob, input);
        await state.storage.delete(`${SPONSOR_RELAY_KEY_PREFIX}${input.request.job_id}`);
        await rememberCreatorPaidJob(env, input.request.creator_id, input.request.job_id);
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
            await rememberCreatorPaidJob(env, input.request.creator_id, input.request.job_id);
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
    requireSponsoredQuoteFresh(input, block.height);
    if (input.nonce !== creatorAccessKey.nonce + 1n
        || input.maxBlockHeight <= BigInt(block.height)
        || input.maxBlockHeight > BigInt(input.quote.max_delegate_block_height)
            + SPONSORED_UPLOAD_SIGNING_HEADROOM_BLOCKS) {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.access_key);
    }
    requireCreatorDelegatePermission(creatorAccessKey.permission, env);
    if (input.hasPlaybackSession && creatorAccessKey.permission !== 'FullAccess') {
        throw new Error(SPONSORED_RELAY_REJECTION_CODES.access_key);
    }
    // The delegate signature alone proves only its own key; the creator's access key proves the account.
    await enforcePublicBetaAccountRateLimit(env, '/v1/sponsored-upload-relays', input.request.creator_id);
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

    // Reconcile existing broadcasts above; only a new send requires a fresh quote.
    const latestBlock = await readFinalBlock(env);
    requireSponsoredQuoteFresh(input, latestBlock.height);
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
        await rememberCreatorPaidJob(env, input.request.creator_id, input.request.job_id);
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

export function forwardLivepeerWebhook(request: Request, env: Env): Promise<Response> {
    return forwardProviderWebhook(request, env, 'studio');
}

/**
 * One ingress pipeline per adapter route: the adapter authenticates and routes the raw body
 * before any Queue send or job-object call; the job object re-parses the same bytes.
 */
export async function forwardProviderWebhook(
    request: Request,
    env: Env,
    kind: MediaProviderKind,
): Promise<Response> {
    const startedAtMs = Date.now();
    try {
        if (!env.LIVEPEER_CONTROL
            || !(kind === 'stream' ? validStreamWebhookConfig(env) : validWebhookConfig(env))) {
            throw new Error('runtime_not_configured');
        }
        const rawBody = new Uint8Array(await request.arrayBuffer());
        if (rawBody.byteLength > MAX_CONTROL_BODY_BYTES) throw new Error('control_body_too_large');
        // Each route names its adapter; the adapter owns the signature header and scheme.
        const provider = mediaProvider(env, { provider: kind });
        const event = await provider.verifyWebhook(rawBody, request.headers, Date.now());
        if (kind === 'stream') await signalStreamAdmission(env, { lastWebhookAtMs: Date.now() });
        const route = event?.route;
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
                    ...(kind === 'stream' ? {
                        provider: 'stream' as const,
                        ...(event ? { signed_time_ms: String(event.timestampMs) } : {}),
                    } : {}),
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
            headers: {
                'Content-Type': 'application/json',
                [MEDIA_PROVIDER_HEADER]: provider.id,
                // Stream signs the time outside the body; the job object folds it into the digest.
                ...(kind === 'stream' && event ? { [MEDIA_WEBHOOK_TIME_HEADER]: String(event.timestampMs) } : {}),
            },
            body: rawBody,
        }));
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog(kind === 'stream' ? 'stream_webhook_rejected' : 'livepeer_webhook_failed', { code }));
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
        ...['provider', 'signed_time_ms'].filter((key) => input[key] !== undefined),
    ], 'invalid_webhook');
    if ((input.provider !== undefined && input.provider !== 'stream')
        || (input.signed_time_ms !== undefined
            && (typeof input.signed_time_ms !== 'string' || !/^[1-9][0-9]{0,15}$/.test(input.signed_time_ms)))) {
        throw new Error('invalid_webhook');
    }
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

function logJobStateTransition(
    fromState: JobRecord['state'] | null,
    toState: JobRecord['state'],
    previous?: JobRecord,
): void {
    if (fromState === toState) return;
    console.info(formatLog('state_transition', {
        stateKind: 'upload_job',
        fromState: fromState || 'NONE',
        toState,
        ...(previous ? {
            generation: previous.generation,
            clock: 'server_observation',
            observedAtMs: Date.now(),
            // Time between our state observations, not provider queue/transcode time.
            observedStateMs: previous.stateChangedAtMs === undefined
                ? null : Math.max(0, Date.now() - previous.stateChangedAtMs),
        } : {}),
    }));
}

const JOB_STATE_TRANSITIONS: Record<JobState, ReadonlySet<JobState>> = {
    AUTHORIZED: new Set(['LEASED', 'UPLOAD_EXPIRED', 'CANCELLED']),
    LEASED: new Set(['PROVIDER_CREATE_PENDING', 'UPLOAD_EXPIRED', 'CANCELLED']),
    PROVIDER_CREATE_PENDING: new Set(['CREATE_AMBIGUOUS', 'UPLOAD_READY', 'UPLOAD_EXPIRED']),
    CREATE_PENDING: new Set(['CREATE_AMBIGUOUS', 'UPLOAD_READY']),
    CREATE_AMBIGUOUS: new Set(),
    UPLOAD_READY: new Set(['UPLOADING', 'PROCESSING', 'READY_VERIFIED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'CANCELLED']),
    UPLOADING: new Set(['PROCESSING', 'READY_VERIFIED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'CANCELLED']),
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
    const certificateProof = parseDeviceCertificateProof(value.certificate_proof, certificate.version);
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
        || (certificate.version === '1'
            ? playbackRequest.account_id !== certificate.account_id
            : certificate.contract_id !== env.MARKET_CONTRACT_ID || playbackRequest.account_id !== certificateProof.account_id)
        || playbackRequest.body_sha256 !== await sha256Hex(canonicalJson(body))
        || playbackRequest.certificate_sha256 !== await sha256Hex(canonicalJson(certificate))) {
        throw new Error('protocol_binding_mismatch');
    }

    const now = BigInt(Date.now());
    const requestExpiresAt = BigInt(playbackRequest.request_expires_at_ms);
    if (certificate.version === '3') {
        if (certificate.account_id !== playbackRequest.account_id
            || requestExpiresAt <= now || requestExpiresAt > now + BigInt(CONTROL_MAX_FUTURE_MS)) {
            throw new Error('playback_denied');
        }
        return { body, certificate, certificateProof, request: playbackRequest, requestSignature: value.request_signature };
    }
    const issuedAt = BigInt(certificate.issued_at_ms);
    const certificateExpiresAt = BigInt(certificate.expires_at_ms);
    if (requestExpiresAt <= now || requestExpiresAt > now + BigInt(CONTROL_MAX_FUTURE_MS)
        || issuedAt > now
        || certificateExpiresAt <= now
        || certificateExpiresAt > now + BigInt(DEVICE_CERTIFICATE_MAX_LIFETIME_MS)
        || certificateExpiresAt - issuedAt > BigInt(DEVICE_CERTIFICATE_MAX_LIFETIME_MS)
        || (certificate.version === '2' && certificateExpiresAt - issuedAt !== BigInt(DEVICE_CERTIFICATE_MAX_LIFETIME_MS))) {
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
    if (certificate.version === '3') {
        requireExactKeys(certificate, ['domain', 'version', 'network', 'account_id', 'contract_id',
            'session_public_key', 'origin_hash', 'scopes', 'authorization_duration_ms'], 'invalid_playback_v2_request');
        if (certificate.domain !== 'youtick.device-session'
            || !['testnet', 'mainnet'].includes(String(certificate.network))
            || typeof certificate.account_id !== 'string' || !ACCOUNT_ID_PATTERN.test(certificate.account_id)
            || typeof certificate.contract_id !== 'string' || !ACCOUNT_ID_PATTERN.test(certificate.contract_id)
            || typeof certificate.session_public_key !== 'string' || !SESSION_KEY_PATTERN.test(certificate.session_public_key)
            || typeof certificate.origin_hash !== 'string' || !SHA256_PATTERN.test(certificate.origin_hash)
            || !Array.isArray(certificate.scopes) || certificate.scopes.length !== 1 || certificate.scopes[0] !== 'play'
            || certificate.authorization_duration_ms !== String(MARKET_DEVICE_LIFETIME_MS)) throw new Error('invalid_playback_v2_request');
        return certificate as MarketDeviceCertificate;
    }
    requireExactKeys(certificate, [
        'domain',
        'version',
        'network',
        certificate.version === '2' ? 'contract_id' : 'account_id',
        'session_public_key',
        'origin_hash',
        'scopes',
        'issued_at_ms',
        'expires_at_ms',
    ], 'invalid_playback_v2_request');
    if (certificate.domain !== 'youtick.device-session'
        || !['1', '2'].includes(String(certificate.version))
        || !['testnet', 'mainnet'].includes(String(certificate.network))
        || typeof certificate[certificate.version === '2' ? 'contract_id' : 'account_id'] !== 'string'
        || !ACCOUNT_ID_PATTERN.test(String(certificate[certificate.version === '2' ? 'contract_id' : 'account_id']))
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

function parseDeviceCertificateProof(value: unknown, version: '1' | '2' | '3'): DeviceCertificateProof {
    const proof = requireObject(value, 'invalid_playback_v2_request');
    if (version === '3') {
        requireExactKeys(proof, ['account_id', 'kind', ...(Object.hasOwn(proof, 'signed_delegate_base64') ? ['signed_delegate_base64'] : [])], 'invalid_playback_v2_request');
        if (proof.kind !== 'market' || typeof proof.account_id !== 'string' || !ACCOUNT_ID_PATTERN.test(proof.account_id)
            || (Object.hasOwn(proof, 'signed_delegate_base64') && (typeof proof.signed_delegate_base64 !== 'string'
                || proof.signed_delegate_base64.length > MAX_CONTROL_BODY_BYTES
                || !/^[A-Za-z0-9+/]+={0,2}$/.test(proof.signed_delegate_base64)))) throw new Error('invalid_playback_v2_request');
        return proof as MarketCertificateProof;
    }
    requireExactKeys(proof, [...(version === '2' ? ['account_id'] : []), 'public_key', 'signature', 'nonce'], 'invalid_playback_v2_request');
    if ((version === '2' && (typeof proof.account_id !== 'string' || !ACCOUNT_ID_PATTERN.test(proof.account_id)))
        || typeof proof.public_key !== 'string'
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
    // The adapter is fixed at creation from the profile hash and never re-derived later.
    const stream = mediaProfileFamily(input.body.profile_config_sha256) === 'stream';
    if (!stream && (typeof env.LIVEPEER_API_TOKEN_NAME !== 'string'
        || env.LIVEPEER_API_TOKEN_NAME.length < 1
        || env.LIVEPEER_API_TOKEN_NAME.length > 128)) {
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
        ...(stream ? { provider: 'stream' as const } : { apiTokenName: env.LIVEPEER_API_TOKEN_NAME }),
        ...(absoluteDeadlineAtMs === undefined
            ? {}
            : { absoluteDeadlineAtMs: Number(absoluteDeadlineAtMs) }),
    };
}

async function issueStatelessPlaybackToken(request: Request, env: Env): Promise<Response> {
    const startedAtMs = performance.now();
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
        // The /v2 device-certificate path is Studio-only: a Stream publication plays through /v3.
        if (mediaProfileFamily(authorization.profileConfigSha256) === 'stream') throw new Error('playback_denied');
        const nowMs = Date.now();
        const certificateRemainingSeconds = Math.floor(
            ((input.certificate.version === '3' ? input.deviceExpiresAtMs! : Number(input.certificate.expires_at_ms)) - nowMs) / 1000,
        );
        if (certificateRemainingSeconds < 1) throw new Error('playback_denied');
        const ttlSeconds = Math.min(PLAYBACK_V2_TTL_SECONDS, certificateRemainingSeconds);
        const issuedAtSeconds = Math.floor(nowMs / 1000);
        const signed = await mediaProvider(env, authorization.profileConfigSha256).signPlayback(
            input.body.playback_id,
            ttlSeconds,
            issuedAtSeconds,
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
                + Number(!authorization.entitlementCacheHit)
                + Number(isPublicBetaPacket(env) || isPublicTestnetEnvironment(env)),
            policyRpcCalls: Number(isPublicBetaPacket(env) || isPublicTestnetEnvironment(env)),
            providerCalls: Number(!authorization.providerCacheHit),
            latencyMs: Math.max(0, performance.now() - startedAtMs),
        }));
        return json({
            schema: 'youtick.livepeer-playback-token.v2',
            playback_id: input.body.playback_id,
            token: signed.token,
            expires_at_ms: String(signed.expiresAtSeconds * 1000),
            hls_url: signed.hlsUrl,
            ...(authorization.previewVttUrl ? { preview_vtt_url: authorization.previewVttUrl } : {}),
        });
    } catch (error) {
        const code = safeErrorCode(error);
        const httpCode = errorStatus(code);
        console.error(formatLog('stateless_playback_request_failed', {
            code, httpCode, latencyMs: Math.max(0, performance.now() - startedAtMs),
        }));
        return json({ error: code }, httpCode);
    }
}

// V2 Market playback: the device session key signs the protocol request; the final ticket view
// authorizes; the first play finalizes mark_watched (escrow settlement) before any token.
async function issueTicketPlaybackToken(request: Request, env: Env): Promise<Response> {
    const startedAtMs = performance.now();
    try {
        const input = parsePlaybackV3Body(await readJsonObject(request), {
            network: env.NEAR_NETWORK!,
            contractId: env.MARKET_CONTRACT_ID!,
            origins: allowedOrigins(env),
            nowMs: Date.now(),
        });
        await verifyEd25519Signature(
            input.request.session_public_key,
            input.signature,
            canonicalPlaybackV3Message(input.request),
        );
        const ticket = await nearPlaybackView(env, env.MARKET_CONTRACT_ID!, 'get_ticket', {
            ticket_id: input.request.ticket_id,
        });
        const ticketValue = ticket.value === null ? null : requireObject(ticket.value, 'playback_authorization_unavailable');
        const publication = ticketValue === null ? { value: null } : await nearPlaybackView(
            env,
            env.MARKET_CONTRACT_ID!,
            'get_publication',
            { publication_id: ticketValue.publication_id },
            ticket.blockHash,
        );
        const decision = decideTicketPlayback(ticketValue, publication.value, input.request, Date.now());
        let markWatchedRequired = false;
        if (decision.kind === 'watch') {
            markWatchedRequired = true;
            const response = await forwardMarkWatched(env, input.request.ticket_id);
            if (response.status !== 200) {
                // Only a refusal is reported as such; operator internals stay private.
                const failure = await response.json().catch(() => ({})) as { error?: unknown };
                throw new Error(failure.error === 'playback_denied' ? 'playback_denied' : 'playback_pending');
            }
        }
        // The publication read above carries the profile hash that selects the media adapter.
        const profileConfigSha256 = publicationProfileHash(publication.value);
        // Same 30-second provider-policy cache as /v2 (Studio keys are shared with /v2; Stream keys are namespaced).
        const providerCacheKey = await playbackCacheKey(
            env,
            'provider-policy',
            mediaProfileFamily(profileConfigSha256) === 'stream' ? `stream:${decision.playbackId}` : decision.playbackId,
        );
        let provider = playbackCacheGet<{ previewVttUrl?: string }>(providerCacheKey);
        if (!provider) {
            provider = await verifyStatelessProviderPolicy(env, decision.playbackId, profileConfigSha256);
            playbackCachePut(providerCacheKey, provider, Date.now() + PROVIDER_POLICY_CACHE_MS);
        }
        const nowMs = Date.now();
        const deviceRemainingSeconds = Math.floor((decision.deviceExpiresAtMs - nowMs) / 1000);
        if (deviceRemainingSeconds < 1) throw new Error('playback_denied');
        const ttlSeconds = Math.min(PLAYBACK_V2_TTL_SECONDS, deviceRemainingSeconds);
        const issuedAtSeconds = Math.floor(nowMs / 1000);
        const adapter = mediaProvider(env, profileConfigSha256);
        const signed = await adapter.signPlayback(decision.playbackId, ttlSeconds, issuedAtSeconds);
        console.info(formatLog('ticket_playback_authorization_completed', {
            markWatched: markWatchedRequired,
            latencyMs: Math.max(0, performance.now() - startedAtMs),
        }));
        // Studio responses stay byte-identical; Stream adds `provider` and never a preview VTT.
        return json({
            schema: 'youtick.livepeer-playback-token.v3',
            playback_id: decision.playbackId,
            token: signed.token,
            expires_at_ms: String(signed.expiresAtSeconds * 1000),
            hls_url: signed.hlsUrl,
            ...(adapter.id === 'stream'
                ? { provider: 'cloudflare-stream' }
                : provider.previewVttUrl ? { preview_vtt_url: provider.previewVttUrl } : {}),
        });
    } catch (error) {
        const code = safeErrorCode(error);
        const httpCode = errorStatus(code);
        console.error(formatLog('ticket_playback_request_failed', {
            code, httpCode, latencyMs: Math.max(0, performance.now() - startedAtMs),
        }));
        return json({ error: code }, httpCode);
    }
}

async function verifyPlaybackV2Proofs(env: Env, input: PlaybackV2Request): Promise<boolean> {
    await verifyEd25519Signature(
        input.certificate.session_public_key,
        input.requestSignature,
        canonicalPlaybackV2Message(input.request),
    );

    if (input.certificate.version === '3') return verifyMarketDeviceProof(env, input);
    if ('kind' in input.certificateProof) throw new Error('playback_denied');
    const cacheKey = await playbackCacheKey(env, 'certificate', canonicalJson({
        certificate: input.certificate,
        proof: input.certificateProof,
        account_id: input.request.account_id,
    }));
    if (playbackCacheGet<boolean>(cacheKey) === true) return true;

    const certificateProof = input.certificateProof;
    let signature: Uint8Array;
    let nonce: Uint8Array;
    try {
        signature = base64Decode(certificateProof.signature);
        nonce = base64UrlDecode(certificateProof.nonce);
    } catch {
        throw new Error('playback_denied');
    }
    if (signature.length !== 64 || nonce.length !== 32) throw new Error('playback_denied');

    try {
        await verifyNep413Message({
            signerAccountId: input.request.account_id,
            signerPublicKey: certificateProof.public_key,
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

function parsePlaybackSessionAuthorization(value: unknown): JsonObject {
    const session = requireObject(value, 'invalid_playback_v2_request');
    requireExactKeys(session, ['session_public_key', 'certificate_sha256', 'authorization_duration_ms'], 'invalid_playback_v2_request');
    if (typeof session.session_public_key !== 'string' || !SESSION_KEY_PATTERN.test(session.session_public_key)
        || typeof session.certificate_sha256 !== 'string' || !SHA256_PATTERN.test(session.certificate_sha256)
        || session.authorization_duration_ms !== String(MARKET_DEVICE_LIFETIME_MS)) throw new Error('invalid_playback_v2_request');
    return session;
}

async function verifyMarketDeviceProof(env: Env, input: PlaybackV2Request): Promise<boolean> {
    if (!('kind' in input.certificateProof)) throw new Error('playback_denied');
    const cacheKey = await playbackCacheKey(env, 'market-device', canonicalJson({
        account_id: input.request.account_id, certificate: input.certificate, proof: input.certificateProof,
    }));
    const cachedExpiry = playbackCacheGet<number>(cacheKey);
    if (cachedExpiry !== undefined) {
        input.deviceExpiresAtMs = cachedExpiry;
        return true;
    }
    const read = await nearPlaybackView(env, env.MARKET_CONTRACT_ID!, 'get_playback_device', {
        account_id: input.request.account_id, session_public_key: input.certificate.session_public_key,
    });
    const device = requireObject(read.value, 'playback_denied');
    if (device.session_public_key !== input.certificate.session_public_key
        || device.certificate_sha256 !== input.request.certificate_sha256
        || typeof device.authorized_at_ms !== 'string' || !/^[0-9]{1,16}$/.test(device.authorized_at_ms)
        || typeof device.expires_at_ms !== 'string' || !/^[0-9]{1,16}$/.test(device.expires_at_ms)
        || Number(device.expires_at_ms) - Number(device.authorized_at_ms) !== MARKET_DEVICE_LIFETIME_MS
        || Number(device.authorized_at_ms) > Date.now() || Number(device.expires_at_ms) <= Date.now()) throw new Error('playback_denied');
    let publicKey = device.authorizing_public_key;
    if (publicKey === null) {
        publicKey = await verifyPlaybackDelegate(env, input);
    }
    if (typeof publicKey !== 'string' || !SESSION_KEY_PATTERN.test(publicKey)) throw new Error('playback_denied');
    await readFinalAccessKey(env, input.request.account_id, publicKey);
    input.deviceExpiresAtMs = Number(device.expires_at_ms);
    playbackCachePut(cacheKey, input.deviceExpiresAtMs, Math.min(Date.now() + DEVICE_CERTIFICATE_CACHE_MS, input.deviceExpiresAtMs));
    return false;
}

async function verifyPlaybackDelegate(env: Env, input: PlaybackV2Request): Promise<string> {
    if (!('kind' in input.certificateProof) || !input.certificateProof.signed_delegate_base64) throw new Error('playback_denied');
    try {
        const bytes = base64Decode(input.certificateProof.signed_delegate_base64);
        const signed = deserialize(SCHEMA.SignedDelegate, bytes) as unknown as SignedDelegate;
        if (!constantTimeEqual(encodeSignedDelegate(signed), bytes)) throw new Error('playback_denied');
        const delegate = signed.delegateAction;
        if (delegate.senderId !== input.request.account_id || delegate.receiverId !== usdcContractId(env)
            || delegate.actions.length !== 1) throw new Error('playback_denied');
        const call = delegate.actions[0].functionCall;
        if (!call || call.methodName !== 'ft_transfer_call' || call.deposit !== 1n) throw new Error('playback_denied');
        const args = JSON.parse(new TextDecoder().decode(Uint8Array.from(call.args))) as JsonObject;
        if (args.receiver_id !== env.MARKET_CONTRACT_ID || typeof args.msg !== 'string') throw new Error('playback_denied');
        const message = args.msg.startsWith(COMPACT_UPLOAD_PREFIX)
            ? await unpackCompactUpload(args.msg, { network: env.NEAR_NETWORK!, market: env.MARKET_CONTRACT_ID!, creator: input.request.account_id,
                usdc: usdcContractId(env), keyString: bytes => `ed25519:${baseEncode(bytes)}` }) : JSON.parse(args.msg) as JsonObject;
        const authorization = parsePlaybackSessionAuthorization(message.playback_session);
        if (message.action !== 'create_paid_job' || message.creator_id !== input.request.account_id
            || authorization.session_public_key !== input.certificate.session_public_key
            || authorization.certificate_sha256 !== input.request.certificate_sha256) throw new Error('playback_denied');
        const publicKey = (delegate.publicKey as unknown as { ed25519Key: { data: number[] } }).ed25519Key.data;
        const signature = (signed.signature as unknown as { ed25519Signature: { data: number[] } }).ed25519Signature.data;
        const digest = await crypto.subtle.digest('SHA-256', encodeDelegateAction(delegate));
        const key = await crypto.subtle.importKey('raw', Uint8Array.from(publicKey), 'Ed25519', false, ['verify']);
        if (!await crypto.subtle.verify('Ed25519', key, Uint8Array.from(signature), digest)) throw new Error('playback_denied');
        // The accepted Market record supplies the 30-day lifetime. The delegate's
        // block window only limits submitting the payment, not using its proof.
        return `ed25519:${baseEncode(Uint8Array.from(publicKey))}`;
    } catch { throw new Error('playback_denied'); }
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

async function readStatelessPlaybackAuthorization(
    env: Env,
    input: PlaybackV2Request,
): Promise<{
    publicationCacheHit: boolean;
    entitlementCacheHit: boolean;
    providerCacheHit: boolean;
    profileConfigSha256: string;
    previewVttUrl?: string;
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
        || !playbackProfileIdAccepted(env, publication.profile_id)
        || !supportedMediaProfile(publication.profile_config_sha256)
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
        `${input.request.account_id}:${input.body.publication_id}:${tupleHash}`,
    );
    let entitled = playbackCacheGet<boolean>(entitlementCacheKey);
    const entitlementCacheHit = entitled !== undefined;
    if (entitled === undefined) {
        const entitlementRead = await nearPlaybackView(
            env,
            env.MARKET_CONTRACT_ID!,
            'has_entitlement',
            {
                account_id: input.request.account_id,
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
    let providerPolicy = playbackCacheGet<{ previewVttUrl?: string }>(providerCacheKey);
    const providerCacheHit = providerPolicy !== undefined;
    const profileConfigSha256 = publication.profile_config_sha256 as string;
    if (mediaProfileFamily(profileConfigSha256) === 'stream') throw new Error('playback_denied');
    if (!providerPolicy) {
        providerPolicy = await verifyStatelessProviderPolicy(env, input.body.playback_id, profileConfigSha256);
        playbackCachePut(providerCacheKey, providerPolicy, Date.now() + PROVIDER_POLICY_CACHE_MS);
    }
    return { publicationCacheHit, entitlementCacheHit, providerCacheHit, profileConfigSha256, ...providerPolicy };
}

async function verifyStatelessProviderPolicy(
    env: Env,
    playbackId: string,
    profileConfigSha256: string | undefined,
): Promise<{ previewVttUrl?: string }> {
    const provider = mediaProvider(env, profileConfigSha256);
    let playback: ProviderPlayback | undefined;
    // One more read after an outage answer: a cold isolate has no policy cache, and a single slow
    // provider read (M4, 2026-10-28: Stream API timed out at 5 s) would otherwise stop a renewal.
    for (let attempt = 0; !playback; attempt += 1) {
        try {
            playback = await provider.readPlayback(playbackId);
        } catch (error) {
            if (safeErrorCode(error) !== 'provider_unavailable') throw new Error('playback_denied');
            if (attempt >= 1) throw error;
        }
    }
    if (playback.kind !== 'vod' || playback.policy !== 'jwt') throw new Error('playback_denied');
    // Optional metadata from the same authorized playback lookup; never fetch it during token issuance.
    const preview = playback.sources.length <= MAX_PROVIDER_PLAYBACK_OUTPUTS
        ? playback.sources.find(source => source.kind === 'vtt' && source.url.length <= 2048
            && playbackUrlAllowed(source.url, provider.hostAllowlist())
            && !new URL(source.url).search && !new URL(source.url).hash)
        : undefined;
    return preview ? { previewVttUrl: preview.url } : {};
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
): Promise<{ grantExpiresAtMs: number; profileConfigSha256?: string }> {
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
    return {
        grantExpiresAtMs: grant.expires_at_ms as number,
        profileConfigSha256: publicationProfileHash(publication),
    };
}

function logTakedownPlaybackAttempt(
    publication: JsonObject,
    protocol: 'DEVICE_SESSION_CERTIFICATE' | 'LEGACY_SESSION_GRANT',
): void {
    if (publication.availability !== 'TAKEDOWN') return;
    console.warn(formatLog('takedown_playback_token_attempted', { protocol }));
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
        const cacheKey = publicationCoverCacheKey(request, env, jobId, generation);
        const visibleKey = new Request(`${cacheKey.url}/visible`);
        const cachedCover = async (): Promise<Response | null> => {
            const cached = await caches.default.match(cacheKey);
            if (!cached) return null;
            const cachedBytes = new Uint8Array(await cached.arrayBuffer());
            const cachedContentType = publicationCoverContentType(cachedBytes);
            return cachedBytes.byteLength <= MAX_PUBLICATION_COVER_BYTES && cachedContentType
                ? publicCoverResponse(cachedBytes, cachedContentType) : null;
        };
        // Cache-first: a recent visibility check lets cached bytes skip the NEAR read and the rate limit.
        if (await caches.default.match(visibleKey)) {
            const hit = await cachedCover();
            if (hit) return hit;
        }
        if (rateLimitedEnvironment(env)) {
            const limited = await publicBetaRateLimitResponse(request, env, '/v1/publication-covers');
            if (limited) return limited;
        }

        const publication = await readFinalPublicationById(env, jobId);
        if (publication?.publication_id !== jobId
            || publication.generation !== generation
            || !['ACTIVE', 'SALES_SUSPENDED'].includes(String(publication.availability))
            || typeof publication.playback_id !== 'string'
            || !PLAYBACK_ID_PATTERN.test(publication.playback_id)) {
            await caches.default.delete(visibleKey).catch(() => false);
            return json({ error: 'not_found' }, 404);
        }
        await caches.default.put(visibleKey, new Response(null, {
            headers: { 'Cache-Control': `public, max-age=${PUBLICATION_COVER_VISIBLE_SECONDS}` },
        })).catch(() => undefined);

        const hit = await cachedCover();
        if (hit) return hit;

        const cover = await mediaProvider(env, publicationProfileHash(publication))
            .readCover(publication.playback_id);
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

function publicCoverResponse(body: ArrayBuffer | Uint8Array, contentType: PublicationCoverContentType): Response {
    const byteLength = body.byteLength;
    return new Response(body, {
        headers: {
            'Cache-Control': `public, max-age=${PUBLICATION_COVER_VISIBLE_SECONDS}`,
            'Content-Length': String(byteLength),
            'Content-Type': contentType,
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
