import type { CreateUploadResult, NormalizedWebhookEvent } from './media-provider';
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
import {
    MAX_PUBLICATION_COVER_BYTES,
    publicationCoverContentType,
    type PublicationCoverContentType,
} from './cover-image';
import { assertDurableObjectRecordCapacity } from './durable-object-capacity';
import {
    isProcessingEvent,
    isProviderFailureEvent,
    isReadinessEvent,
    synthesizedProviderEvent,
} from './provider-webhook';
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
    JobRecord,
    ReconcileRecord,
    OutboxRecord,
    AdmissionRecord,
    AdmissionLease,
    LivepeerWebhookQueueMessage,
} from './types';
import {
    MAX_CONTROL_BODY_BYTES,
    PLAYBACK_MAX_TTL_SECONDS,
    PLAYBACK_V2_TTL_SECONDS,
    STREAM_DEFAULT_STUCK_TIMEOUT_MS,
    JOB_KEY,
    RECONCILE_KEY,
    RECONCILE_HEALTHY_INTERVAL_MS,
    RECONCILE_CONFIRMATION_MS,
    ADMISSION_KEY,
    ADMISSION_LEASE_HEARTBEAT_MS,
    JOB_ID_PATTERN,
    PROVIDER_ID_PATTERN,
    PLAYBACK_ID_PATTERN,
} from './constants';
import {
    formatLog,
    readJsonObject,
    requireExactKeys,
    sha256Hex,
    allowedOrigins,
    validApiKey,
    base64Decode,
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
    creatorAllowlist,
    isPublicTestnetEnvironment,
    isPublicBetaPacket,
    isMarketV2TestnetCreatorScope,
    streamEnabled,
    studioActive,
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
import { jobObjectName } from './object-names';
import {
    readFinalMediaJob,
    readFinalPublicTestnetBetaJob,
    readFinalPublicTestnetBetaState,
    readFinalPublicationById,
} from './near-rpc';
import {
    requirePublicUploadPolicy,
    publicUploadJobDeadline,
    publicBetaRateLimitResponse,
    enforcePublicBetaAccountRateLimit,
    publicBetaDeadlineExpired,
    requirePublicTestnetBetaJob,
} from './public-testnet-beta';
import {
    mediaProvider,
    jobProviderKind,
    providerIdentity,
    publicationProfileHash,
} from './provider-registry';
import { ensureReconcileScheduled, scheduleReconcile, scheduleAlarmNoLaterThan } from './alarm-schedule';
import {
    parseUploadIntentRequest,
    parseUploadHeartbeatRequest,
    parseUploadCancellationRequest,
    verifyControlSignature,
} from './control-requests';
import {
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
import {
    logJobStateTransition,
    transitionJob,
    uploadIntentResponse,
    requireHeartbeatChainJob,
    requireCancellationChainJob,
    requireExactChainJob,
    jobRecord,
    sameJob,
} from './job-state';
import {
    streamUploadOverflowed,
    trackStreamProgress,
    terminateStreamJob,
    logStreamStorageHeadroom,
    readStreamStorage,
    purgeExpiredWebhookDedup,
    purgeExpiredControlNonces,
    scheduleTerminalArchive,
    advanceTerminalArchive,
    advanceFinalization,
    isLegacyProfileJobOnMarketV2,
    expireLegacyProfileJob,
    settleLegacyProfileJob,
} from './upload-job-lifecycle';
import {
    CREATOR_PENDING_UPLOAD_ROUTE,
    recordCreatorPendingUpload,
    readCreatorPendingUpload,
    forwardCreatorPendingUpload,
} from './creator-pending-upload';
import { forwardUploadIntent, forwardUploadHeartbeat, forwardUploadPreflight } from './upload-routes';
import {
    forwardLivepeerWebhook,
    forwardProviderWebhook,
    parseLivepeerWebhookQueueMessage,
} from './webhook-ingress';
import {
    forwardCreatorFeeQuote,
    issueCreatorFeeQuote,
    expireCreatorFeeQuoteRateLimit,
} from './creator-fee-quotes';
import { issueStatelessPlaybackToken } from './playback-v2';
import { issueTicketPlaybackToken } from './playback-tickets';
import { forwardPlaybackToken, parsePlaybackTokenRequest, readPlaybackAuthorization } from './playback-v1';
import {
    forwardSponsoredUploadQuote,
    issueSponsoredUploadQuote,
    forwardSponsoredUploadRelay,
    relaySponsoredUpload,
    advanceSponsorRelayAlarm,
} from './sponsored-upload';

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
export { forwardCreatorPendingUpload } from './creator-pending-upload';
export { forwardUploadIntent, forwardUploadHeartbeat, forwardUploadPreflight } from './upload-routes';
export { forwardLivepeerWebhook, forwardProviderWebhook } from './webhook-ingress';
export { forwardCreatorFeeQuote } from './creator-fee-quotes';
export { playbackAuthorizationCacheRecordCount } from './playback-v2';
export { forwardPlaybackToken } from './playback-v1';
export {
    forwardSponsoredUploadQuote,
    forwardSponsoredUploadRelay,
    parseSponsoredUploadRelayRequest,
} from './sponsored-upload';

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
const PUBLICATION_COVER_CACHE_SECONDS = 24 * 60 * 60;
// Bounds how long a takedown can leave a cover visible: the edge visibility marker plus the browser max-age.
const PUBLICATION_COVER_VISIBLE_SECONDS = 30;
// Bounded Stream poll: every 5 minutes while the creator uploads, every minute while processing.
const STREAM_UPLOAD_POLL_MS = 5 * 60 * 1000;
const STREAM_PROCESSING_POLL_MS = 60 * 1000;
let edgeColdStartPending = true;

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
