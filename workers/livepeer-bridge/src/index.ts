import { MEDIA_PROVIDER_HEADER, MEDIA_WEBHOOK_TIME_HEADER } from './media-provider';
import { paymentAssets, paymentOptions, paymentQuote, paymentStatus } from './payments';
import type { Env } from './env';
import type { LivepeerWebhookQueueMessage } from './types';
import { MAX_CONTROL_BODY_BYTES, JOB_ID_PATTERN } from './constants';
import {
    formatLog,
    sha256Hex,
    allowedOrigins,
    validApiKey,
    base64Decode,
    safeErrorCode,
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
import { requirePublicUploadPolicy, publicBetaRateLimitResponse } from './public-testnet-beta';
import { mediaProvider } from './provider-registry';
import { streamHealthBlock } from './admission';
import { runScheduledRelease } from './operator-outbox';
import {
    forwardAdmissionReopen,
    forwardPublicBetaAssetDelete,
    forwardAdmissionStatus,
    forwardOperatorOutboxStatus,
    forwardOperatorOutboxArchiveScan,
} from './operator-routes';
import { logStreamStorageHeadroom } from './upload-job-lifecycle';
import { CREATOR_PENDING_UPLOAD_ROUTE, forwardCreatorPendingUpload } from './creator-pending-upload';
import { forwardUploadIntent, forwardUploadHeartbeat, forwardUploadPreflight } from './upload-routes';
import {
    forwardLivepeerWebhook,
    forwardProviderWebhook,
    parseLivepeerWebhookQueueMessage,
} from './webhook-ingress';
import { forwardCreatorFeeQuote } from './creator-fee-quotes';
import { issueStatelessPlaybackToken } from './playback-v2';
import { issueTicketPlaybackToken } from './playback-tickets';
import { forwardPlaybackToken } from './playback-v1';
import { forwardSponsoredUploadQuote, forwardSponsoredUploadRelay } from './sponsored-upload';
import { publicationCoverRoute, publicationCover } from './publication-cover';

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
export { LivepeerControl } from './livepeer-control';

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
