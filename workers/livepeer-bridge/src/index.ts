import { base58Decode } from './base58';
import {
    KeyPairSigner,
    actions,
    baseDecode,
    baseEncode,
    createTransaction,
} from 'near-api-js';

export interface Env {
    LIVEPEER_BRIDGE_ENABLED?: string;
    LIVEPEER_NEAR_CREATOR_FEE_ENABLED?: string;
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
    CREATOR_FEE_QUOTE_PRIVATE_KEY?: string;
    CREATOR_FEE_QUOTE_KEY_VERSION?: string;
    LIVEPEER_CONTROL?: DurableObjectNamespace;
}

type JsonObject = Record<string, unknown>;
type UploadIntentBody = {
    job_id: string;
    generation: number;
    expected_source_bytes: string;
    profile_id: 'paid-media-livepeer-v1';
    profile_config_sha256: string;
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
    version: '2';
    method: 'POST';
    route: '/v1/upload-intents' | '/v1/playback-tokens';
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
type PlaybackTokenRequest = {
    body: PlaybackTokenBody;
    envelope: ControlEnvelope;
};
type CreatorFeeQuoteRequest = {
    creator_id: string;
    job_id: string;
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
};
type JobRecord = {
    schema: 'youtick.livepeer-control-job.v1';
    state: 'CREATE_PENDING' | 'CREATE_AMBIGUOUS' | 'UPLOAD_READY'
        | 'READY_VERIFIED' | 'FINALIZE_QUEUED' | 'ONCHAIN_PUBLISHED';
    network: 'testnet' | 'mainnet';
    contractId: string;
    jobId: string;
    generation: number;
    creator: string;
    expectedSourceBytes: string;
    profileId: 'paid-media-livepeer-v1';
    profileConfigSha256: string;
    createdAtMs: number;
    apiTokenName: string;
    assetId?: string;
    playbackId?: string;
    projectId?: string;
    tusEndpoint?: string;
    publication?: FinalizePublication;
};
type ReconcileStatus = 'HEALTHY' | 'DRIFT_BLOCKED' | 'PROVIDER_UNKNOWN' | 'NEAR_UNKNOWN';
type ReconcileRecord = {
    schema: 'youtick.livepeer-reconcile.v1';
    status: ReconcileStatus;
    consecutiveErrors: number;
    nextReconcileAtMs: number;
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
type ProviderUpload = {
    assetId: string;
    playbackId: string;
    projectId: string;
    tusEndpoint: string;
};
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
    idempotencyKey: string;
    payloadSha256: string;
    createdAtMs: number;
    nonce?: string;
    blockHash?: string;
    signedTxBase64?: string;
    txHash?: string;
};
type AdmissionJobState = 'CREATE_PENDING' | 'CREATE_AMBIGUOUS' | 'UPLOAD_READY'
    | 'READY_VERIFIED' | 'FINALIZE_QUEUED';
type AdmissionReservation = {
    creator: string;
    expectedSourceBytes: string;
    estimatedProviderCostUsdMicros: string;
    state: AdmissionJobState;
    createdAtMs: number;
    ambiguousAtMs?: number;
};
type AdmissionRecord = {
    schema: 'youtick.livepeer-admission.v2';
    status: 'OPEN' | 'AUTO_CLOSED';
    reservations: Record<string, AdmissionReservation>;
    daily: { utcDay: string; globalAttempts: number; creatorAttempts: Record<string, number> };
    monthly: { utcMonth: string; reservedBudgetUsdMicros: string };
    closure?: { code: string; observedAtMs: number };
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

const PUBLIC_CONTROL_REQUESTS_IMPLEMENTED = true;
const MAX_CONTROL_BODY_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 20_000_000_000n;
const CREATOR_FEE_RATE_SOURCE = 'outlayer-price-oracle-wrap-near-v1';
const OUTLAYER_NEAR_ASSET_ID = 'wrap.near';
const CREATOR_FEE_MAX_SOURCE_AGE_MS = 60_000;
const CREATOR_FEE_QUOTE_LIFETIME_MS = 120_000;
const CREATOR_FEE_RATE_LIMIT = 5;
const CREATOR_FEE_RATE_WINDOW_MS = 60_000;
const YOCTO_NEAR = 10n ** 24n;
const LIVEPEER_TUS_CHUNK_BYTES = 32 * 1024 * 1024;
const LIVEPEER_API_BASE = 'https://livepeer.studio/api';
const LIVEPEER_TUS_VERSION = '1.0.0';
const LIVEPEER_HLS_SOURCE_TYPE = 'html5/application/vnd.apple.mpegurl';
const LIVEPEER_MP4_SOURCE_TYPE = 'html5/video/mp4';
const LIVEPEER_VTT_SOURCE_TYPE = 'text/vtt';
const MAX_PROVIDER_PLAYBACK_OUTPUTS = 16;
const MAX_THUMBNAIL_REFERENCE_PROBES = 32;
const PROFILE_CONFIG_SHA256 = '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77';
const CONTROL_MAX_FUTURE_MS = 5 * 60 * 1000;
const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;
const PLAYBACK_MIN_TTL_SECONDS = 120;
const PLAYBACK_MAX_TTL_SECONDS = 300;
const FINALIZE_GAS = 15_000_000_000_000n;
const JOB_KEY = 'job:v1';
const RECONCILE_KEY = 'reconcile:v1';
const RECONCILE_HEALTHY_INTERVAL_MS = 15 * 60 * 1000;
const RECONCILE_CONFIRMATION_MS = 60 * 1000;
const RECONCILE_BACKOFF_MS = [60, 120, 240, 480, 900].map((seconds) => seconds * 1000);
const ADMISSION_KEY = 'admission:v1';
const ADMISSION_REOPEN_KEY_PREFIX = 'admission:reopen:';
const ADMISSION_AMBIGUOUS_TIMEOUT_MS = 15 * 60 * 1000;
const ADMISSION_CLOSURE_CODES = new Set([
    'monthly_budget_exceeded',
    'provider_budget_or_inventory',
    'create_ambiguous_timeout',
]);
const DEFAULT_ALLOWED_ORIGINS = 'https://youtick.net,https://www.youtick.net';
const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const JOB_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SESSION_KEY_PATTERN = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{1,192}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,192}$/;
const PLAYBACK_ID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
const OUTBOX_METHODS = new Set<OutboxMethod>([
    'finalize_livepeer_publication',
    'suspend_livepeer_sales',
]);
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
const SENSITIVE_LOG_KEY = /authorization|secret|token|tus|upload.*url|signed.*transaction|private.*key/i;
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
    'invalid_control_envelope',
    'invalid_control_request',
    'invalid_creator_fee_quote_request',
    'invalid_json',
    'invalid_finalize_request',
    'invalid_admission_reopen',
    'invalid_outbox',
    'invalid_playback_request',
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
    'outbox_conflict',
    'provider_identity_mismatch',
    'provider_asset_missing',
    'provider_admission_closed',
    'provider_playback_missing',
    'provider_playback_exposed',
    'provider_playback_mismatch',
    'provider_state_invalid',
    'provider_unavailable',
    'rate_source_invalid',
    'rate_source_stale',
    'rate_source_unavailable',
    'playback_authorization_unavailable',
    'playback_denied',
    'protocol_binding_mismatch',
    'provider_create_ambiguous',
    'provider_create_pending',
    'reservation_conflict',
    'runtime_not_configured',
    'webhook_expired',
]);

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        if (request.method === 'GET' && url.pathname === '/__health') {
            return json({
                status: 'ok',
                service: 'livepeer-bridge',
                stage: env.LIVEPEER_BRIDGE_ENABLED === 'true' ? 'ENABLED' : 'DISABLED',
                publicControlImplemented: PUBLIC_CONTROL_REQUESTS_IMPLEMENTED,
                providerMutationEnabled: env.LIVEPEER_BRIDGE_ENABLED === 'true',
                controlPlaneReady: env.LIVEPEER_BRIDGE_ENABLED === 'true'
                    && Boolean(env.LIVEPEER_CONTROL)
                    && validWebhookConfig(env)
                    && validAdmissionConfig(env)
                    && validAdmissionReopenConfig(env),
                playbackReady: env.LIVEPEER_BRIDGE_ENABLED === 'true'
                    && Boolean(env.LIVEPEER_CONTROL)
                    && validPlaybackConfig(env),
            });
        }

        if (request.method === 'OPTIONS'
            && ['/v1/upload-intents', '/v1/playback-tokens', '/v1/creator-fee-quotes/near']
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

        if (request.method === 'POST' && url.pathname === '/v1/playback-tokens') {
            const origin = request.headers.get('Origin') || '';
            const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
            if (!PUBLIC_CONTROL_REQUESTS_IMPLEMENTED || env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
                return withCors(json({ error: 'control_plane_disabled' }, 503), corsOrigin);
            }
            if (!env.LIVEPEER_CONTROL || !validPlaybackConfig(env)) {
                return withCors(json({ error: 'runtime_not_configured' }, 503), corsOrigin);
            }
            return forwardPlaybackToken(request, env);
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

        return json({ error: 'not_found', endpoints: ['/__health'] }, 404);
    },
};

export class LivepeerControl {
    private operatorTail = Promise.resolve();

    constructor(
        private readonly state: DurableObjectState,
        private readonly env: Env,
    ) {}

    async alarm(): Promise<void> {
        if (await this.state.storage.get<AdmissionRecord>(ADMISSION_KEY)) {
            await expireAmbiguousAdmissions(this.state);
            return;
        }
        const job = await this.state.storage.get<JobRecord>(JOB_KEY);
        if (!job || !job.publication) return;
        if (this.env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
            await scheduleReconcile(this.state, Date.now() + RECONCILE_HEALTHY_INTERVAL_MS);
            return;
        }
        if (['READY_VERIFIED', 'FINALIZE_QUEUED'].includes(job.state)) {
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
                return await this.reserveUploadIntent(request);
            }
            if (request.method === 'POST' && url.pathname === '/v1/playback-tokens') {
                return await this.issuePlaybackToken(request);
            }
            if (request.method === 'POST' && url.pathname === '/internal/outbox') {
                return await this.enqueueOutbox(request);
            }
            if (request.method === 'POST' && url.pathname === '/internal/livepeer-webhook') {
                return await this.handleLivepeerWebhook(request);
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
            if (request.method === 'POST' && url.pathname === '/internal/admission/reserve') {
                return await reserveAdmission(this.state, this.env, await readJsonObject(request));
            }
            if (request.method === 'POST' && url.pathname === '/internal/admission/mark') {
                return await markAdmission(this.state, await readJsonObject(request));
            }
            if (request.method === 'POST' && url.pathname === '/internal/creator-fee-quote') {
                return await issueCreatorFeeQuote(this.state, this.env, request);
            }
            if (request.method === 'POST' && url.pathname === '/internal/admission/reopen') {
                return await reopenAdmission(this.state, await readJsonObject(request));
            }
            return json({ error: 'not_found' }, 404);
        } catch (error) {
            const code = safeErrorCode(error);
            console.error(formatLog('livepeer_control_request_failed', { code }));
            return json({ error: code }, errorStatus(code));
        }
    }

    private async reserveUploadIntent(request: Request): Promise<Response> {
        const input = await parseUploadIntentRequest(request, this.env);
        await verifyControlSignature(request, input.envelope);
        const { job: chainJob } = await readFinalMediaJob(this.env, input.body.job_id);
        requireExactChainJob(input, chainJob);

        const candidate = jobRecord(input, this.env);
        if (!await this.state.storage.get<JobRecord>(JOB_KEY)) {
            await requestAdmission(this.env, candidate);
        }
        const result = await this.state.storage.transaction(async (transaction) => {
            const nonceKey = `nonce:${input.envelope.device_nonce}`;
            if (await transaction.get(nonceKey)) throw new Error('device_nonce_replayed');
            const existing = await transaction.get<JobRecord>(JOB_KEY);
            if (existing) {
                if (!sameJob(existing, candidate)) throw new Error('reservation_conflict');
                await transaction.put(nonceKey, Date.now());
                return { record: existing, created: false };
            }
            await transaction.put(nonceKey, Date.now());
            await transaction.put(JOB_KEY, candidate);
            return { record: candidate, created: true };
        });

        if (!result.created) {
            if (result.record.state === 'UPLOAD_READY') return uploadIntentResponse(result.record, false);
            throw new Error(result.record.state === 'CREATE_PENDING'
                ? 'provider_create_pending'
                : 'provider_create_ambiguous');
        }

        let provider: ProviderUpload;
        try {
            provider = await createProviderUpload(this.env, candidate);
        } catch (error) {
            await this.state.storage.put(JOB_KEY, { ...candidate, state: 'CREATE_AMBIGUOUS' });
            await updateAdmission(this.env, candidate, 'CREATE_AMBIGUOUS');
            if (safeErrorCode(error) === 'provider_admission_closed') {
                await updateAdmission(this.env, candidate, 'AUTO_CLOSED');
            }
            throw new Error('provider_create_ambiguous');
        }
        const ready: JobRecord = {
            ...candidate,
            state: 'UPLOAD_READY',
            assetId: provider.assetId,
            playbackId: provider.playbackId,
            projectId: provider.projectId,
            tusEndpoint: provider.tusEndpoint,
        };
        await this.state.storage.put(JOB_KEY, ready);
        await updateAdmission(this.env, ready, 'UPLOAD_READY');
        return uploadIntentResponse(ready, true);
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
            await transaction.put(nonceKey, Date.now());
        });

        const authorization = await readPlaybackAuthorization(this.env, input);
        const nowMs = Date.now();
        const remainingSeconds = Math.floor((authorization.grantExpiresAtMs - nowMs) / 1000);
        if (remainingSeconds < 1) throw new Error('playback_denied');
        const ttlSeconds = Math.min(input.body.requested_ttl_seconds, remainingSeconds);
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
        const readinessEvent = webhook.event === 'asset.ready'
            || (webhook.event === 'asset.updated'
                && existing.state === 'UPLOAD_READY'
                && providerPhase(asset) === 'ready');
        if (!readinessEvent) {
            if (existing.state === 'ONCHAIN_PUBLISHED') {
                await scheduleReconcile(this.state, Date.now());
                return json({ accepted: true, ignored: true, reconcile_triggered: true }, 202);
            }
            return json({ accepted: true, ignored: true }, 202);
        }

        const digest = await webhookDigest(webhook, asset, await sha256BytesHex(rawBody));
        const dedupKey = `webhook:${digest}`;
        const seen = await this.state.storage.transaction(async (transaction) => {
            const duplicate = await transaction.get(dedupKey);
            if (!duplicate) {
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
                    ...withoutTusEndpoint,
                    state: 'READY_VERIFIED',
                    publication,
                };
                await this.state.storage.put(JOB_KEY, record);
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
            if (record.state === 'UPLOAD_READY') {
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
}

async function advanceFinalization(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<Response> {
    const response = await forwardFinalize(env, job.publication!);
    if (!response.ok) {
        await scheduleReconcile(state, Date.now() + RECONCILE_BACKOFF_MS[0]);
        return response;
    }
    const result = await response.clone().json() as { finalized?: unknown };
    const record: JobRecord = {
        ...job,
        state: result.finalized === true ? 'ONCHAIN_PUBLISHED' : 'FINALIZE_QUEUED',
    };
    await state.storage.put(JOB_KEY, record);
    await updateAdmission(env, record, record.state);
    if (record.state === 'ONCHAIN_PUBLISHED') {
        await ensureReconcileScheduled(state);
    } else {
        await scheduleReconcile(state, Date.now() + RECONCILE_BACKOFF_MS[0]);
    }
    return response;
}

async function requestAdmission(env: Env, job: JobRecord): Promise<void> {
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
}

async function updateAdmission(
    env: Env,
    job: JobRecord,
    state: AdmissionJobState | 'ONCHAIN_PUBLISHED' | 'AUTO_CLOSED',
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

async function reserveAdmission(
    state: DurableObjectState,
    env: Env,
    input: JsonObject,
): Promise<Response> {
    requireExactKeys(input, ['jobId', 'generation', 'creator', 'expectedSourceBytes'], 'invalid_outbox');
    if (typeof input.jobId !== 'string'
        || !JOB_ID_PATTERN.test(input.jobId)
        || !Number.isSafeInteger(input.generation)
        || (input.generation as number) < 1
        || typeof input.creator !== 'string'
        || !ACCOUNT_ID_PATTERN.test(input.creator)
        || typeof input.expectedSourceBytes !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(input.expectedSourceBytes)) {
        throw new Error('invalid_outbox');
    }
    const creator = input.creator as string;
    const expectedSourceBytes = input.expectedSourceBytes as string;
    const allowlist = creatorAllowlist(env);
    if (!allowlist.has(creator)) throw new Error('admission_closed');
    const budget = operationBudget(env);
    if (!budget) throw new Error('admission_closed');
    const now = Date.now();
    const utcDay = new Date(now).toISOString().slice(0, 10);
    const utcMonth = utcDay.slice(0, 7);
    const reservationKey = `${input.jobId}:${input.generation}`;
    const result = await state.storage.transaction(async (transaction) => {
        const stored = await transaction.get<AdmissionRecord>(ADMISSION_KEY);
        const record = stored || emptyAdmissionRecord(utcDay, utcMonth);
        if (record.status === 'AUTO_CLOSED') throw new Error('admission_closed');
        const existing = record.reservations[reservationKey];
        if (existing) {
            if (existing.creator !== creator
                || existing.expectedSourceBytes !== expectedSourceBytes) {
                throw new Error('admission_denied');
            }
            return { record, created: false, closed: false };
        }
        const daily = record.daily.utcDay === utcDay
            ? record.daily
            : { utcDay, globalAttempts: 0, creatorAttempts: {} };
        const monthly = record.monthly.utcMonth === utcMonth
            ? record.monthly
            : { utcMonth, reservedBudgetUsdMicros: '0' };
        const active = Object.values(record.reservations);
        if (active.length >= 1
            || active.some((reservation) => reservation.creator === creator)
            || daily.globalAttempts >= 2
            || (daily.creatorAttempts[creator] || 0) >= 2) {
            throw new Error('admission_denied');
        }
        const reservedBudgetUsdMicros = BigInt(monthly.reservedBudgetUsdMicros)
            + budget.jobReservationUsdMicros;
        if (reservedBudgetUsdMicros > budget.monthlyBudgetUsdMicros) {
            const closed: AdmissionRecord = {
                ...record,
                status: 'AUTO_CLOSED',
                closure: { code: 'monthly_budget_exceeded', observedAtMs: now },
            };
            await transaction.put(ADMISSION_KEY, closed);
            return { record: closed, created: false, closed: true };
        }
        const next: AdmissionRecord = {
            ...record,
            reservations: {
                ...record.reservations,
                [reservationKey]: {
                    creator,
                    expectedSourceBytes,
                    estimatedProviderCostUsdMicros: String(budget.jobReservationUsdMicros),
                    state: 'CREATE_PENDING',
                    createdAtMs: now,
                },
            },
            daily: {
                ...daily,
                globalAttempts: daily.globalAttempts + 1,
                creatorAttempts: {
                    ...daily.creatorAttempts,
                    [creator]: (daily.creatorAttempts[creator] || 0) + 1,
                },
            },
            monthly: { utcMonth, reservedBudgetUsdMicros: String(reservedBudgetUsdMicros) },
        };
        await transaction.put(ADMISSION_KEY, next);
        return { record: next, created: true, closed: false };
    });
    if (result.closed) throw new Error('admission_closed');
    return json({ accepted: true, created: result.created });
}

async function markAdmission(state: DurableObjectState, input: JsonObject): Promise<Response> {
    requireExactKeys(input, ['jobId', 'generation', 'state'], 'invalid_outbox');
    if (typeof input.jobId !== 'string'
        || !JOB_ID_PATTERN.test(input.jobId)
        || !Number.isSafeInteger(input.generation)
        || (input.generation as number) < 1
        || !['CREATE_AMBIGUOUS', 'UPLOAD_READY', 'READY_VERIFIED', 'FINALIZE_QUEUED', 'ONCHAIN_PUBLISHED', 'AUTO_CLOSED'].includes(String(input.state))) {
        throw new Error('invalid_outbox');
    }
    const reservationKey = `${input.jobId}:${input.generation}`;
    let ambiguousAlarmAt: number | null = null;
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
        if (!reservation && input.state === 'ONCHAIN_PUBLISHED') return;
        if (!reservation) throw new Error('admission_denied');
        const reservations = { ...record.reservations };
        if (input.state === 'ONCHAIN_PUBLISHED') {
            delete reservations[reservationKey];
        } else {
            const ambiguousAtMs = input.state === 'CREATE_AMBIGUOUS'
                ? reservation.ambiguousAtMs || Date.now()
                : undefined;
            reservations[reservationKey] = {
                ...reservation,
                state: input.state as AdmissionJobState,
                ambiguousAtMs,
            };
            if (input.state === 'CREATE_AMBIGUOUS') {
                ambiguousAlarmAt = ambiguousAtMs! + ADMISSION_AMBIGUOUS_TIMEOUT_MS;
            }
        }
        await transaction.put(ADMISSION_KEY, { ...record, reservations });
    });
    if (ambiguousAlarmAt !== null) await state.storage.setAlarm(ambiguousAlarmAt);
    return json({ accepted: true });
}

async function expireAmbiguousAdmissions(state: DurableObjectState): Promise<void> {
    const now = Date.now();
    const record = await state.storage.get<AdmissionRecord>(ADMISSION_KEY);
    if (!record || record.status === 'AUTO_CLOSED') return;
    const deadlines = Object.values(record.reservations)
        .filter((reservation) => reservation.state === 'CREATE_AMBIGUOUS')
        .map((reservation) => (
            (reservation.ambiguousAtMs || reservation.createdAtMs) + ADMISSION_AMBIGUOUS_TIMEOUT_MS
        ));
    const expired = deadlines.some((deadline) => now >= deadline);
    if (expired) {
        await state.storage.put(ADMISSION_KEY, {
            ...record,
            status: 'AUTO_CLOSED',
            closure: { code: 'create_ambiguous_timeout', observedAtMs: now },
        } satisfies AdmissionRecord);
    } else if (deadlines.length > 0) {
        await state.storage.setAlarm(Math.min(...deadlines));
    }
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
        const reservations = { ...record.reservations };
        if (reopen.jobId !== null && reopen.generation !== null) {
            const reservationKey = `${reopen.jobId}:${reopen.generation}`;
            if (reservations[reservationKey]?.state !== 'CREATE_AMBIGUOUS') {
                throw new Error('admission_reopen_denied');
            }
            delete reservations[reservationKey];
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
    return json({ accepted: true, reopened: true, replayed: result.replayed }, result.replayed ? 200 : 201);
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
            && resolutionCode === 'BUDGET_WINDOW_ROLLED')) {
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
    return values.length > 0 && values.every((value) => ACCOUNT_ID_PATTERN.test(value))
        ? new Set(values)
        : new Set();
}

function operationBudget(env: Env): {
    monthlyBudgetUsdMicros: bigint;
    jobReservationUsdMicros: bigint;
} | null {
    const monthly = env.LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS || '';
    const job = env.LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS || '';
    if (!/^[1-9][0-9]{0,19}$/.test(monthly) || !/^[1-9][0-9]{0,19}$/.test(job)) return null;
    const monthlyBudgetUsdMicros = BigInt(monthly);
    const jobReservationUsdMicros = BigInt(job);
    return jobReservationUsdMicros <= monthlyBudgetUsdMicros
        ? { monthlyBudgetUsdMicros, jobReservationUsdMicros }
        : null;
}

async function ensureReconcileScheduled(state: DurableObjectState): Promise<void> {
    const existing = await state.storage.get<ReconcileRecord>(RECONCILE_KEY);
    if (!existing) {
        const now = Date.now();
        await state.storage.put(RECONCILE_KEY, {
            schema: 'youtick.livepeer-reconcile.v1',
            status: 'PROVIDER_UNKNOWN',
            consecutiveErrors: 0,
            nextReconcileAtMs: now,
        } satisfies ReconcileRecord);
    }
    await scheduleReconcile(state, Date.now());
}

async function scheduleReconcile(state: DurableObjectState, atMs: number): Promise<void> {
    await state.storage.setAlarm(atMs);
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
    if (confirmed && !salesSuspensionQueuedAtMs) {
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
        const feeUsdMicro = (sourceBytes * 3n + 9_999n) / 10_000n;
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
    await state.storage.transaction(async (transaction) => {
        const current = await transaction.get<{ windowStartedAtMs: number; count: number }>('quote-rate:v1');
        const next = !current || now - current.windowStartedAtMs >= CREATOR_FEE_RATE_WINDOW_MS
            ? { windowStartedAtMs: now, count: 1 }
            : { ...current, count: current.count + 1 };
        if (next.count > CREATOR_FEE_RATE_LIMIT) throw new Error('creator_fee_quote_rate_limited');
        await transaction.put('quote-rate:v1', next);
    });
}

async function readOutlayerNearUsd(
    env: Env,
    now: number,
): Promise<{ nearUsdMicro: bigint; timestampMs: number }> {
    let response: Response;
    let payload: { result?: unknown; error?: unknown };
    try {
        response = await fetch(env.NEAR_RPC_URL!, {
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

export async function forwardPlaybackToken(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!env.LIVEPEER_CONTROL || !validPlaybackConfig(env)) throw new Error('runtime_not_configured');
        const forwardingRequest = request.clone();
        const input = await parsePlaybackTokenRequest(request, env);
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(jobObjectName(
            input.envelope.network,
            input.envelope.contract_id,
            input.body.job_id,
            input.body.generation,
        )));
        return withCors(await object.fetch(forwardingRequest), corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_playback_route_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
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
        const route = webhookRoute(webhook);
        if (!route) return json({ accepted: true, ignored: true }, 202);
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
    if (SENSITIVE_LOG_KEY.test(key)) return '[REDACTED]';
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

export function formatLog(event: string, details: JsonObject): string {
    return JSON.stringify({ event, details: sanitizeForLog(details) });
}

async function parseUploadIntentRequest(request: Request, env: Env): Promise<UploadIntentRequest> {
    const value = await readJsonObject(request);
    requireExactKeys(value, ['body', 'envelope'], 'invalid_control_request');
    const body = parseUploadBody(value.body);
    const envelope = parseControlEnvelope(value.envelope);
    const bodySha256 = await sha256Hex(canonicalJson(body));

    if (envelope.route !== '/v1/upload-intents'
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
    requireExactKeys(value, ['body', 'envelope'], 'invalid_control_request');
    const body = parsePlaybackTokenBody(value.body);
    const envelope = parseControlEnvelope(value.envelope);
    const bodySha256 = await sha256Hex(canonicalJson(body));

    if (envelope.route !== '/v1/playback-tokens'
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
    return { body, envelope };
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
    requireExactKeys(body, [
        'job_id',
        'generation',
        'expected_source_bytes',
        'profile_id',
        'profile_config_sha256',
    ], 'invalid_upload_intent');
    if (typeof body.job_id !== 'string'
        || !JOB_ID_PATTERN.test(body.job_id)
        || !Number.isSafeInteger(body.generation)
        || (body.generation as number) < 1
        || typeof body.expected_source_bytes !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(body.expected_source_bytes)
        || BigInt(body.expected_source_bytes) > MAX_SOURCE_BYTES
        || body.profile_id !== 'paid-media-livepeer-v1'
        || body.profile_config_sha256 !== PROFILE_CONFIG_SHA256) {
        throw new Error('invalid_upload_intent');
    }
    return body as UploadIntentBody;
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
        || envelope.version !== '2'
        || envelope.method !== 'POST'
        || !['/v1/upload-intents', '/v1/playback-tokens'].includes(String(envelope.route))
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
        response = await fetch(env.NEAR_RPC_URL!, {
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

async function createProviderUpload(env: Env, job: JobRecord): Promise<ProviderUpload> {
    if (!validApiKey(env.LIVEPEER_API_KEY)) throw new Error('runtime_not_configured');
    const response = await fetch(`${LIVEPEER_API_BASE}/asset/request-upload`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.LIVEPEER_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: `youtick-${job.jobId}-g${job.generation}`,
            playbackPolicy: { type: 'jwt' },
            creatorId: { type: 'unverified', value: `${job.jobId}:${job.generation}` },
            profiles: [{
                name: '720p',
                width: 1280,
                height: 720,
                bitrate: 3_000_000,
                fps: 30,
                fpsDen: 1,
                gop: '2',
                profile: 'H264Baseline',
                encoder: 'H.264',
            }],
        }),
        signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 402 || response.status === 429) {
        throw new Error('provider_admission_closed');
    }
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new Error('provider_create_ambiguous');
    }
    const value = requireObject(body, 'provider_create_ambiguous');
    const asset = requireObject(value.asset, 'provider_create_ambiguous');
    if (!response.ok
        || typeof value.tusEndpoint !== 'string'
        || !isLivepeerTusEndpoint(value.tusEndpoint)
        || typeof asset.id !== 'string'
        || typeof asset.playbackId !== 'string'
        || typeof asset.projectId !== 'string'
        || requireObject(asset.playbackPolicy, 'provider_create_ambiguous').type !== 'jwt') {
        throw new Error('provider_create_ambiguous');
    }
    const tusEndpoint = await createBoundTusResource(
        value.tusEndpoint,
        job.expectedSourceBytes,
    );
    return {
        assetId: asset.id,
        playbackId: asset.playbackId,
        projectId: asset.projectId,
        tusEndpoint,
    };
}

async function createBoundTusResource(endpoint: string, expectedBytes: string): Promise<string> {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Tus-Resumable': LIVEPEER_TUS_VERSION,
            'Upload-Length': expectedBytes,
            'Upload-Metadata': 'filename c291cmNlLm1wNA==,filetype dmlkZW8vbXA0',
        },
        signal: AbortSignal.timeout(20_000),
    });
    const location = response.headers.get('Location');
    if (response.status !== 201 || !location) throw new Error('provider_create_ambiguous');
    const uploadUrl = new URL(location, endpoint).toString();
    if (!isLivepeerTusEndpoint(uploadUrl)) throw new Error('provider_create_ambiguous');

    const head = await fetch(uploadUrl, {
        method: 'HEAD',
        headers: { 'Tus-Resumable': LIVEPEER_TUS_VERSION },
        signal: AbortSignal.timeout(10_000),
    });
    if (![200, 204].includes(head.status)
        || head.headers.get('Upload-Length') !== expectedBytes
        || head.headers.get('Upload-Offset') !== '0') {
        throw new Error('provider_create_ambiguous');
    }
    return uploadUrl;
}

function uploadIntentResponse(record: JobRecord, created: boolean): Response {
    if (record.state !== 'UPLOAD_READY' || !record.tusEndpoint) {
        throw new Error('provider_create_ambiguous');
    }
    return json({
        schema: 'youtick.livepeer-upload-intent.v1',
        job_id: record.jobId,
        generation: record.generation,
        expected_source_bytes: record.expectedSourceBytes,
        chunk_bytes: LIVEPEER_TUS_CHUNK_BYTES,
        tus_endpoint: record.tusEndpoint,
        created,
    }, created ? 201 : 200);
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

function jobRecord(input: UploadIntentRequest, env: Env): JobRecord {
    if (typeof env.LIVEPEER_API_TOKEN_NAME !== 'string'
        || env.LIVEPEER_API_TOKEN_NAME.length < 1
        || env.LIVEPEER_API_TOKEN_NAME.length > 128) {
        throw new Error('runtime_not_configured');
    }
    return {
        schema: 'youtick.livepeer-control-job.v1',
        state: 'CREATE_PENDING',
        network: input.envelope.network,
        contractId: input.envelope.contract_id,
        jobId: input.body.job_id,
        generation: input.body.generation,
        creator: input.envelope.account_id,
        expectedSourceBytes: input.body.expected_source_bytes,
        profileId: input.body.profile_id,
        profileConfigSha256: input.body.profile_config_sha256,
        createdAtMs: Date.now(),
        apiTokenName: env.LIVEPEER_API_TOKEN_NAME,
    };
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
        response = await fetch(env.NEAR_RPC_URL!, {
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

type WebhookEvent = {
    event: string;
    timestamp: number;
    payload: JsonObject;
};

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

function parseWebhook(value: JsonObject): WebhookEvent {
    if (typeof value.event !== 'string'
        || value.event.length < 1
        || value.event.length > 64
        || !Number.isSafeInteger(value.timestamp)
        || !value.payload
        || typeof value.payload !== 'object'
        || Array.isArray(value.payload)) {
        throw new Error('invalid_webhook');
    }
    return {
        event: value.event,
        timestamp: value.timestamp as number,
        payload: value.payload as JsonObject,
    };
}

function webhookAsset(webhook: WebhookEvent): JsonObject | null {
    const asset = webhook.payload.asset;
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) return null;
    const snapshot = (asset as JsonObject).snapshot;
    return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
        ? snapshot as JsonObject
        : asset as JsonObject;
}

function webhookRoute(webhook: WebhookEvent): { jobId: string; generation: number } | null {
    const asset = webhookAsset(webhook);
    if (!asset || !['asset.ready', 'asset.updated', 'asset.failed', 'asset.deleted'].includes(webhook.event)) {
        return null;
    }
    const creator = asset.creatorId;
    if (!creator || typeof creator !== 'object' || Array.isArray(creator)) return null;
    const value = (creator as JsonObject).value;
    if ((creator as JsonObject).type !== 'unverified' || typeof value !== 'string') return null;
    const separator = value.lastIndexOf(':');
    if (separator < 1) return null;
    const jobId = value.slice(0, separator);
    const generation = Number(value.slice(separator + 1));
    return JOB_ID_PATTERN.test(jobId) && Number.isSafeInteger(generation) && generation > 0
        ? { jobId, generation }
        : null;
}

async function webhookDigest(
    webhook: WebhookEvent,
    asset: JsonObject,
    rawBodyHash: string,
): Promise<string> {
    return sha256Hex([
        String(webhook.timestamp),
        rawBodyHash,
        String(asset.id || ''),
        providerPhase(asset),
    ].join('\n'));
}

function providerPhase(asset: JsonObject): string {
    const status = asset.status;
    return status && typeof status === 'object' && !Array.isArray(status)
        ? String((status as JsonObject).phase || '')
        : '';
}

async function verifyReadyProviderAsset(env: Env, job: JobRecord): Promise<FinalizePublication> {
    if (!validProviderVerificationConfig(env)
        || !job.assetId
        || !job.playbackId
        || !job.projectId) {
        throw new Error('runtime_not_configured');
    }
    const asset = await providerJson(env, `/asset/${encodeURIComponent(job.assetId)}`);
    const playback = await providerJson(env, `/playback/${encodeURIComponent(job.playbackId)}`);
    const creator = requireObject(asset.creatorId, 'provider_identity_mismatch');
    if (asset.id !== job.assetId
        || asset.playbackId !== job.playbackId
        || asset.projectId !== job.projectId
        || asset.projectId !== env.LIVEPEER_PROJECT_ID
        || asset.createdByTokenName !== job.apiTokenName
        || creator.type !== 'unverified'
        || creator.value !== `${job.jobId}:${job.generation}`
        || asset.name !== `youtick-${job.jobId}-g${job.generation}`) {
        throw new Error('provider_identity_mismatch');
    }
    const assetPolicy = requireObject(asset.playbackPolicy, 'provider_playback_mismatch');
    const assetStatus = requireObject(asset.status, 'provider_state_invalid');
    if (assetPolicy.type !== 'jwt'
        || assetStatus.phase !== 'ready'
        || !Number.isSafeInteger(assetStatus.updatedAt)
        || (assetStatus.updatedAt as number) <= 0
        || !Number.isSafeInteger(asset.size)
        || BigInt(asset.size as number) !== BigInt(job.expectedSourceBytes)) {
        throw new Error('provider_state_invalid');
    }

    const playbackMeta = requireObject(playback.meta, 'provider_playback_mismatch');
    const playbackPolicy = requireObject(playbackMeta.playbackPolicy, 'provider_playback_mismatch');
    if (playback.type !== 'vod' || playbackPolicy.type !== 'jwt' || !Array.isArray(playbackMeta.source)) {
        throw new Error('provider_playback_mismatch');
    }
    if (playbackMeta.source.length > MAX_PROVIDER_PLAYBACK_OUTPUTS) {
        throw new Error('provider_playback_mismatch');
    }
    const sources = playbackMeta.source.map((source) => requireObject(source, 'provider_playback_mismatch'));
    const hlsSources = sources.filter((source) => source.type === LIVEPEER_HLS_SOURCE_TYPE);
    const mp4Sources = sources.filter((source) => source.type === LIVEPEER_MP4_SOURCE_TYPE);
    const vttSources = sources.filter((source) => source.type === LIVEPEER_VTT_SOURCE_TYPE);
    const hlsUrls = [...new Set(hlsSources.map((source) => String(source.url)))];
    const mp4Urls = [...new Set(mp4Sources.map((source) => String(source.url)))];
    const vttUrls = [...new Set(vttSources.map((source) => String(source.url)))];
    if (hlsUrls.length === 0
        || mp4Urls.length === 0
        || sources.some((source) => (
            source.type !== LIVEPEER_HLS_SOURCE_TYPE
            && source.type !== LIVEPEER_MP4_SOURCE_TYPE
            && source.type !== LIVEPEER_VTT_SOURCE_TYPE
        ))
        || !mp4Sources.some((source) => (
            source.width === 1280
            && source.height === 720
            && typeof source.bitrate === 'number'
            && source.bitrate > 0
        ))
        || hlsUrls.some((url) => !validPlaybackUrl(url))
        || mp4Urls.some((url) => !validPlaybackUrl(url))
        || vttUrls.some((url) => !validPlaybackUrl(url))
        || !validPlaybackUrl(asset.downloadUrl)) {
        throw new Error('provider_playback_mismatch');
    }
    for (const hlsUrl of new Set([livepeerHlsUrl(job.playbackId), ...hlsUrls])) {
        await requireHlsPlaybackDenied(hlsUrl);
    }
    for (const mp4Url of mp4Urls) {
        await requireAnonymousPlaybackDenied(mp4Url);
    }
    for (const vttUrl of vttUrls) {
        await requireAnonymousPlaybackDenied(vttUrl);
    }
    if (vttUrls.length > 0) {
        if (!validPlaybackConfig(env)) throw new Error('runtime_not_configured');
        const token = await signLivepeerJwt(
            env,
            job.playbackId,
            Math.floor(Date.now() / 1_000),
            PLAYBACK_MIN_TTL_SECONDS,
        );
        for (const thumbnailUrl of await vttThumbnailUrls(vttUrls, token)) {
            await requireAnonymousPlaybackDenied(thumbnailUrl);
        }
    }
    await requireAnonymousPlaybackDenied(String(asset.downloadUrl));

    let fingerprint: string | null = null;
    if (asset.hash !== null && asset.hash !== undefined) {
        if (!Array.isArray(asset.hash)) throw new Error('provider_state_invalid');
        const hashes = asset.hash.map((entry) => requireObject(entry, 'provider_state_invalid'));
        const sha256 = hashes.find((entry) => entry.algorithm === 'sha256');
        if (sha256) {
            if (typeof sha256.hash !== 'string' || !SHA256_PATTERN.test(sha256.hash)) {
                throw new Error('provider_state_invalid');
            }
            fingerprint = sha256.hash;
        }
    }
    return {
        job_id: job.jobId,
        generation: job.generation,
        creator_id: job.creator,
        expected_source_bytes: job.expectedSourceBytes,
        profile_id: job.profileId,
        profile_config_sha256: job.profileConfigSha256,
        asset_id_hash: await sha256Hex(job.assetId),
        playback_id: job.playbackId,
        project_id_hash: await sha256Hex(job.projectId),
        verified_source_bytes: job.expectedSourceBytes,
        provider_source_fingerprint: fingerprint,
        ready_at_ms: String(assetStatus.updatedAt),
        availability: 'ACTIVE',
    };
}

async function providerJson(env: Env, path: string): Promise<JsonObject> {
    let response: Response;
    try {
        response = await fetch(`${LIVEPEER_API_BASE}${path}`, {
            headers: { Authorization: `Bearer ${env.LIVEPEER_API_KEY}` },
            signal: AbortSignal.timeout(5_000),
        });
    } catch {
        throw new Error('provider_unavailable');
    }
    if (response.status === 404) {
        throw new Error(path.startsWith('/asset/') ? 'provider_asset_missing' : 'provider_playback_missing');
    }
    if (response.status === 429 || response.status >= 500 || !response.ok) {
        throw new Error('provider_unavailable');
    }
    try {
        return requireObject(await response.json(), 'provider_state_invalid');
    } catch {
        throw new Error('provider_state_invalid');
    }
}

function hlsManifestKind(body: string): 'error' | 'playable' | 'unknown' {
    const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines[0] !== '#EXTM3U') return 'unknown';
    const playable = lines.some((line) => /(?:^|,)URI="[^"]+"/.test(line))
        || lines.some((line, index) => (
            (line.startsWith('#EXT-X-STREAM-INF:') || line.startsWith('#EXTINF:'))
            && index + 1 < lines.length
            && !lines[index + 1].startsWith('#')
        ));
    const error = lines.some((line) => line === '#EXT-X-ERROR' || line.startsWith('#EXT-X-ERROR:'));
    if (error && !playable) return 'error';
    return playable ? 'playable' : 'unknown';
}

async function hlsPlaybackDenied(response: Response): Promise<boolean> {
    if ([401, 403].includes(response.status)) return true;
    if (response.status !== 200) return false;
    try {
        return hlsManifestKind(await response.text()) === 'error';
    } catch {
        return false;
    }
}

async function requireHlsPlaybackDenied(url: string): Promise<void> {
    const invalidTokens = [
        null,
        'invalid.invalid.invalid',
        'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ3cm9uZyJ9.invalid',
        'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjF9.invalid',
    ];
    for (const token of invalidTokens) {
        const headers = new Headers();
        if (token) headers.set('Livepeer-Jwt', token);
        let response: Response;
        try {
            response = await fetch(url, {
                method: 'GET',
                headers,
                redirect: 'manual',
                signal: AbortSignal.timeout(5_000),
            });
        } catch {
            throw new Error('provider_unavailable');
        }
        if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
        if (!await hlsPlaybackDenied(response)) throw new Error('provider_playback_exposed');
    }
}

async function requireAnonymousPlaybackDenied(url: string): Promise<void> {
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'GET',
            redirect: 'manual',
            signal: AbortSignal.timeout(5_000),
        });
    } catch {
        throw new Error('provider_unavailable');
    }
    if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
    if (![401, 403].includes(response.status)) throw new Error('provider_playback_exposed');
}

function vttReferences(body: string): string[] | null {
    const lines = body.split(/\r?\n/).map((line) => line.trim());
    if (lines[0] !== 'WEBVTT') return null;
    const references: string[] = [];
    for (let index = 1; index < lines.length; index += 1) {
        if (!/^(?:(?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+(?:(?:\d{2}:)?\d{2}:\d{2}\.\d{3})(?:\s+.*)?$/.test(lines[index])) {
            continue;
        }
        const cue: string[] = [];
        while (index + 1 < lines.length && lines[index + 1]) {
            index += 1;
            cue.push(lines[index]);
        }
        if (cue.length !== 1) return null;
        references.push(cue[0]);
    }
    return references;
}

function vttReferenceUrl(parentUrl: string, reference: string): string {
    try {
        const url = new URL(reference, parentUrl);
        if (!validPlaybackUrl(url.toString())) throw new Error('invalid');
        return url.toString();
    } catch {
        throw new Error('provider_playback_mismatch');
    }
}

async function vttThumbnailUrls(vttUrls: string[], token: string): Promise<string[]> {
    const thumbnails = new Set<string>();
    for (const vttUrl of vttUrls) {
        let response: Response;
        try {
            response = await fetch(vttUrl, {
                method: 'GET',
                headers: { 'Livepeer-Jwt': token },
                redirect: 'manual',
                signal: AbortSignal.timeout(5_000),
            });
        } catch {
            throw new Error('provider_unavailable');
        }
        if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
        if (response.status !== 200) throw new Error('provider_playback_mismatch');
        let references: string[] | null;
        try {
            references = vttReferences(await response.text());
        } catch {
            throw new Error('provider_playback_mismatch');
        }
        if (!references) throw new Error('provider_playback_mismatch');
        for (const reference of references) {
            thumbnails.add(vttReferenceUrl(vttUrl, reference));
            if (thumbnails.size > MAX_THUMBNAIL_REFERENCE_PROBES) {
                throw new Error('provider_playback_mismatch');
            }
        }
    }
    return [...thumbnails];
}

function validPlaybackUrl(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && !url.port
            && !url.username
            && !url.password
            && url.pathname.length > 1
            && (url.hostname === 'playback.livepeer.studio'
                || url.hostname === 'livepeercdn.com'
                || url.hostname === 'livepeercdn.studio'
                || url.hostname === 'asset-cdn.lp-playback.com'
                || url.hostname.endsWith('.lp-playback.studio'));
    } catch {
        return false;
    }
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
            if (existing.payloadSha256 !== input.payloadSha256) throw new Error('outbox_conflict');
            return existing;
        }
        const created: OperatorRecord = {
            schema: 'youtick.livepeer-operator-outbox.v1',
            state: 'PENDING',
            ...input,
            createdAtMs: Date.now(),
        };
        await transaction.put(key, created);
        return created;
    });

    if (await isConfirmed()) {
        record = { ...record, state: 'CONFIRMED' };
        await state.storage.put(key, record);
        return { confirmed: true, txHash: record.txHash || null, status: 200 };
    }

    if (record.state === 'BROADCAST' && record.txHash) {
        const status = await queryTransaction(env, record.txHash);
        if (await isConfirmed()) {
            record = { ...record, state: 'CONFIRMED' };
            await state.storage.put(key, record);
            return { confirmed: true, txHash: record.txHash || null, status: 200 };
        }
        if (status === 'failed') throw new Error('near_finalize_failed');
        if (status === 'invalid_nonce') {
            record = clearSignedTransaction(record);
            await state.storage.put(key, record);
        }
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
        record = { ...record, state: 'CONFIRMED' };
        await state.storage.put(key, record);
        return { confirmed: true, txHash: record.txHash || null, status: 200 };
    }
    if (broadcast === 'failed') throw new Error('near_finalize_failed');
    if (broadcast === 'invalid_nonce') {
        await state.storage.put(key, clearSignedTransaction(record));
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
    const payload = await nearRpcRaw(env, 'tx', {
        tx_hash: txHash,
        sender_account_id: env.NEAR_OPERATOR_ACCOUNT_ID,
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

async function nearRpcRaw(env: Env, method: string, params: JsonObject): Promise<JsonObject> {
    let response: Response;
    try {
        response = await fetch(env.NEAR_RPC_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: `paid-media-livepeer-v1-${method}`, method, params }),
            signal: AbortSignal.timeout(5_000),
        });
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

function validWebhookConfig(env: Env): boolean {
    return typeof env.LIVEPEER_WEBHOOK_SECRET === 'string'
        && env.LIVEPEER_WEBHOOK_SECRET.length >= 16
        && (env.LIVEPEER_WEBHOOK_SECRET_PREVIOUS === undefined
            || env.LIVEPEER_WEBHOOK_SECRET_PREVIOUS.length >= 16)
        && validProviderVerificationConfig(env)
        && validOperatorConfig(env);
}

function validAdmissionConfig(env: Env): boolean {
    return creatorAllowlist(env).size > 0;
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

function validCreatorFeeQuoteConfig(env: Env): boolean {
    return env.LIVEPEER_NEAR_CREATOR_FEE_ENABLED === 'true'
        && ['testnet', 'mainnet'].includes(env.NEAR_NETWORK || '')
        && isHttpsUrl(env.NEAR_RPC_URL)
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && typeof env.CREATOR_FEE_QUOTE_PRIVATE_KEY === 'string'
        && env.CREATOR_FEE_QUOTE_PRIVATE_KEY.length >= 64
        && /^[1-9][0-9]{0,9}$/.test(env.CREATOR_FEE_QUOTE_KEY_VERSION || '')
        && Number(env.CREATOR_FEE_QUOTE_KEY_VERSION) <= 0xffff_ffff;
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

function isLivepeerTusEndpoint(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.port && url.hostname === 'origin.livepeer.com';
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

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function errorStatus(code: string): number {
    if (code === 'internal_error') return 500;
    if (code === 'creator_fee_quote_rate_limited') return 429;
    if (code === 'origin_denied'
        || code === 'device_key_not_authorized'
        || code === 'invalid_webhook_signature'
        || code === 'admission_reopen_denied'
        || code === 'operator_unauthorized'
        || code === 'playback_denied') return 403;
    if (code.includes('conflict')
        || code === 'admission_denied'
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
        || code === 'provider_create_pending') return 409;
    if (code.startsWith('near_')
        || code === 'admission_closed'
        || code === 'runtime_not_configured'
        || code === 'playback_authorization_unavailable'
        || code === 'rate_source_invalid'
        || code === 'rate_source_stale'
        || code === 'rate_source_unavailable'
        || code === 'provider_unavailable'
        || code === 'provider_admission_closed'
        || code === 'provider_create_ambiguous') return 503;
    return 400;
}

function safeErrorCode(error: unknown): string {
    return error instanceof Error && SAFE_ERROR_CODES.has(error.message)
        ? error.message
        : 'internal_error';
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
