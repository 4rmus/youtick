import { base58Decode } from '../../shared/src/base58';
import {
    KeyPairSigner,
    actions,
    baseDecode,
    baseEncode,
    createTransaction,
} from 'near-api-js';

export interface Env {
    LIVEPEER_BRIDGE_ENABLED?: string;
    LIVEPEER_API_KEY?: string;
    LIVEPEER_PROJECT_ID?: string;
    LIVEPEER_API_TOKEN_NAME?: string;
    LIVEPEER_WEBHOOK_SECRET?: string;
    ALLOWED_ORIGINS?: string;
    NEAR_NETWORK?: string;
    NEAR_RPC_URL?: string;
    MARKET_CONTRACT_ID?: string;
    NEAR_OPERATOR_ACCOUNT_ID?: string;
    NEAR_OPERATOR_PRIVATE_KEY?: string;
    NEAR_OPERATOR_KEY_EPOCH?: string;
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
type ControlEnvelope = {
    domain: 'youtick.paid-media-livepeer-v1.control';
    version: '1';
    method: 'POST';
    route: '/v1/upload-intents';
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
type OnChainJob = {
    job_id?: unknown;
    creator_id?: unknown;
    profile_id?: unknown;
    profile_config_sha256?: unknown;
    expected_source_bytes?: unknown;
    generation?: unknown;
    status?: unknown;
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
    assetId?: string;
    playbackId?: string;
    projectId?: string;
    tusEndpoint?: string;
    publication?: FinalizePublication;
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
    state: 'PENDING';
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
type OperatorRecord = FinalizeInput & {
    schema: 'youtick.livepeer-operator-outbox.v1';
    state: 'PENDING' | 'RESERVED' | 'SIGNED' | 'BROADCAST' | 'CONFIRMED';
    createdAtMs: number;
    nonce?: string;
    blockHash?: string;
    signedTxBase64?: string;
    txHash?: string;
};

const PUBLIC_CONTROL_REQUESTS_IMPLEMENTED = true;
const MAX_CONTROL_BODY_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 20_000_000_000n;
const LIVEPEER_TUS_CHUNK_BYTES = 8 * 1024 * 1024;
const LIVEPEER_API_BASE = 'https://livepeer.studio/api';
const LIVEPEER_TUS_VERSION = '1.0.0';
const PROFILE_CONFIG_SHA256 = '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77';
const SESSION_METHOD = 'create_paid_job';
const CONTROL_MAX_FUTURE_MS = 5 * 60 * 1000;
const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;
const FINALIZE_GAS = 50_000_000_000_000n;
const JOB_KEY = 'job:v1';
const DEFAULT_ALLOWED_ORIGINS = 'https://youtick.net,https://www.youtick.net';
const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const JOB_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SESSION_KEY_PATTERN = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{1,192}$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,192}$/;
const OUTBOX_METHODS = new Set<OutboxMethod>([
    'finalize_livepeer_publication',
    'suspend_livepeer_sales',
]);
const SENSITIVE_LOG_KEY = /authorization|secret|token|tus|upload.*url|signed.*transaction|private.*key/i;
const SAFE_ERROR_CODES = new Set([
    'control_body_too_large',
    'control_request_expired',
    'device_key_not_authorized',
    'device_nonce_replayed',
    'deployment_binding_mismatch',
    'invalid_control_envelope',
    'invalid_control_request',
    'invalid_json',
    'invalid_finalize_request',
    'invalid_outbox',
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
    'outbox_conflict',
    'provider_identity_mismatch',
    'provider_playback_exposed',
    'provider_playback_mismatch',
    'provider_state_invalid',
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
                    && validWebhookConfig(env),
            });
        }

        if (request.method === 'OPTIONS' && url.pathname === '/v1/upload-intents') {
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

        if (request.method === 'POST' && url.pathname === '/v1/upload-intents') {
            const origin = request.headers.get('Origin') || '';
            const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
            if (!PUBLIC_CONTROL_REQUESTS_IMPLEMENTED || env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
                return withCors(json({ error: 'control_plane_disabled' }, 503), corsOrigin);
            }
            if (!env.LIVEPEER_CONTROL || !validWebhookConfig(env)) {
                return withCors(json({ error: 'runtime_not_configured' }, 503), corsOrigin);
            }
            return forwardUploadIntent(request, env);
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

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        try {
            if (request.method === 'POST' && url.pathname === '/v1/upload-intents') {
                return await this.reserveUploadIntent(request);
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
        const { job: chainJob, blockHash } = await readFinalMediaJob(this.env, input.body.job_id);
        requireExactChainJob(input, chainJob);
        await requireFinalAccessKey(this.env, input.envelope, blockHash);

        const candidate = jobRecord(input);
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
        } catch {
            await this.state.storage.put(JOB_KEY, { ...candidate, state: 'CREATE_AMBIGUOUS' });
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
        return uploadIntentResponse(ready, true);
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
        if (!asset || webhook.event !== 'asset.ready') {
            return json({ accepted: true, ignored: true }, 202);
        }
        const existing = await this.state.storage.get<JobRecord>(JOB_KEY);
        if (!existing || asset.id !== existing.assetId) {
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
            return json({ accepted: true, duplicate: Boolean(seen), finalized: true });
        }
        if (!record.publication) throw new Error('provider_state_invalid');
        const response = await forwardFinalize(this.env, record.publication);
        if (response.ok) {
            const result = await response.clone().json() as { finalized?: unknown };
            record = {
                ...record,
                state: result.finalized === true ? 'ONCHAIN_PUBLISHED' : 'FINALIZE_QUEUED',
            };
            await this.state.storage.put(JOB_KEY, record);
        }
        return response;
    }

    private async finalizePublication(request: Request): Promise<Response> {
        const input = await parseFinalizeInput(await readJsonObject(request));
        return processFinalizeOutbox(this.state, this.env, input);
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

export async function forwardLivepeerWebhook(request: Request, env: Env): Promise<Response> {
    try {
        if (!env.LIVEPEER_CONTROL || !validWebhookConfig(env)) {
            throw new Error('runtime_not_configured');
        }
        const rawBody = new Uint8Array(await request.arrayBuffer());
        if (rawBody.byteLength > MAX_CONTROL_BODY_BYTES) throw new Error('control_body_too_large');
        const webhook = await verifyAndParseWebhook(
            rawBody,
            request.headers.get('Livepeer-Signature') || '',
            env.LIVEPEER_WEBHOOK_SECRET!,
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

    if (envelope.body_sha256 !== bodySha256
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
        || envelope.version !== '1'
        || envelope.method !== 'POST'
        || envelope.route !== '/v1/upload-intents'
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
        || !isHttpsOrigin(envelope.origin)
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

async function requireFinalAccessKey(
    env: Env,
    envelope: ControlEnvelope,
    blockHash: string,
): Promise<void> {
    let response: Response;
    let payload: { result?: unknown; error?: unknown };
    try {
        response = await fetch(env.NEAR_RPC_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'paid-media-livepeer-v1-device-key',
                method: 'query',
                params: {
                    request_type: 'view_access_key',
                    block_id: blockHash,
                    account_id: envelope.account_id,
                    public_key: envelope.session_public_key,
                },
            }),
            signal: AbortSignal.timeout(2_500),
        });
        payload = await response.json() as typeof payload;
    } catch {
        throw new Error('near_job_query_failed');
    }
    if (!response.ok || payload.error || !payload.result) throw new Error('device_key_not_authorized');
    const result = requireObject(payload.result, 'device_key_not_authorized');
    const permission = requireObject(result.permission, 'device_key_not_authorized');
    const functionCall = requireObject(permission.FunctionCall, 'device_key_not_authorized');
    if (functionCall.receiver_id !== envelope.contract_id
        || !Array.isArray(functionCall.method_names)
        || functionCall.method_names.length !== 1
        || functionCall.method_names[0] !== SESSION_METHOD
        || typeof functionCall.allowance !== 'string'
        || !/^[1-9][0-9]*$/.test(functionCall.allowance)) {
        throw new Error('device_key_not_authorized');
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
        || job.status !== 'Authorized') {
        throw new Error('on_chain_job_mismatch');
    }
}

function jobRecord(input: UploadIntentRequest): JobRecord {
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
    };
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
    return asset && typeof asset === 'object' && !Array.isArray(asset)
        ? asset as JsonObject
        : null;
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
        || asset.createdByTokenName !== env.LIVEPEER_API_TOKEN_NAME
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
    const sources = playbackMeta.source.map((source) => requireObject(source, 'provider_playback_mismatch'));
    const hls = sources.find((source) => source.type === 'html5/application/vnd.apple.mpegurl');
    const mp4 = sources.find((source) => source.type === 'html5/video/mp4'
        && source.width === 1280
        && source.height === 720
        && typeof source.bitrate === 'number'
        && source.bitrate > 0);
    if (!hls || !mp4
        || !validPlaybackUrl(hls.url, job.playbackId)
        || !validPlaybackUrl(mp4.url, job.playbackId)
        || !validPlaybackUrl(asset.downloadUrl, job.playbackId)) {
        throw new Error('provider_playback_mismatch');
    }
    await requirePlaybackDenied(String(hls.url));
    await requirePlaybackDenied(String(mp4.url));
    await requirePlaybackDenied(String(asset.downloadUrl));

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
        throw new Error('provider_state_invalid');
    }
    if (!response.ok) throw new Error('provider_state_invalid');
    try {
        return requireObject(await response.json(), 'provider_state_invalid');
    } catch {
        throw new Error('provider_state_invalid');
    }
}

async function requirePlaybackDenied(url: string): Promise<void> {
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
            throw new Error('provider_playback_mismatch');
        }
        if (![401, 403].includes(response.status)) throw new Error('provider_playback_exposed');
    }
}

function validPlaybackUrl(value: unknown, playbackId: string): boolean {
    if (typeof value !== 'string') return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && (url.hostname === 'playback.livepeer.studio'
                || url.hostname === 'livepeercdn.com'
                || url.hostname === 'livepeercdn.studio'
                || url.hostname.endsWith('.lp-playback.studio'))
            && url.pathname.split('/').includes(playbackId);
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

    if (await finalPublicationMatches(env, input.submission)) {
        record = { ...record, state: 'CONFIRMED' };
        await state.storage.put(key, record);
        return json({ accepted: true, finalized: true, tx_hash: record.txHash || null });
    }

    if (record.state === 'BROADCAST' && record.txHash) {
        const status = await queryTransaction(env, record.txHash);
        if (await finalPublicationMatches(env, input.submission)) {
            record = { ...record, state: 'CONFIRMED' };
            await state.storage.put(key, record);
            return json({ accepted: true, finalized: true, tx_hash: record.txHash });
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
                'finalize_livepeer_publication',
                { submission: input.submission },
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
    if (await finalPublicationMatches(env, input.submission)) {
        record = { ...record, state: 'CONFIRMED' };
        await state.storage.put(key, record);
        return json({ accepted: true, finalized: true, tx_hash: record.txHash });
    }
    if (broadcast === 'failed') throw new Error('near_finalize_failed');
    if (broadcast === 'invalid_nonce') {
        await state.storage.put(key, clearSignedTransaction(record));
    }
    return json({ accepted: true, finalized: false, tx_hash: record.txHash }, 202);
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
    const payload = await nearRpc(env, {
        request_type: 'call_function',
        finality: 'final',
        account_id: env.MARKET_CONTRACT_ID,
        method_name: 'get_publication',
        args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify({
            publication_id: submission.job_id,
        }))),
    });
    const result = requireObject(payload.result, 'near_finalize_pending');
    if (!Array.isArray(result.result)) throw new Error('near_finalize_pending');
    const raw = new TextDecoder().decode(new Uint8Array(result.result as number[]));
    if (!raw || raw === 'null') return false;
    let publication: unknown;
    try {
        publication = JSON.parse(raw);
    } catch {
        throw new Error('near_finalize_mismatch');
    }
    const value = requireObject(publication, 'near_finalize_mismatch');
    const matches = value.publication_id === submission.job_id
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
    if (!matches) throw new Error('near_finalize_mismatch');
    return true;
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
        && validProviderVerificationConfig(env)
        && validOperatorConfig(env);
}

function validProviderVerificationConfig(env: Env): boolean {
    return validApiKey(env.LIVEPEER_API_KEY)
        && typeof env.LIVEPEER_PROJECT_ID === 'string'
        && PROVIDER_ID_PATTERN.test(env.LIVEPEER_PROJECT_ID)
        && typeof env.LIVEPEER_API_TOKEN_NAME === 'string'
        && env.LIVEPEER_API_TOKEN_NAME.length >= 1
        && env.LIVEPEER_API_TOKEN_NAME.length <= 128;
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
        return url.protocol === 'https:' && url.hostname === 'origin.livepeer.com';
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
    if (code === 'origin_denied'
        || code === 'device_key_not_authorized'
        || code === 'invalid_webhook_signature') return 403;
    if (code.includes('conflict')
        || code === 'on_chain_job_mismatch'
        || code === 'near_finalize_failed'
        || code === 'near_finalize_mismatch'
        || code === 'provider_identity_mismatch'
        || code === 'provider_playback_exposed'
        || code === 'provider_playback_mismatch'
        || code === 'provider_state_invalid'
        || code === 'device_nonce_replayed'
        || code === 'provider_create_pending') return 409;
    if (code.startsWith('near_')
        || code === 'runtime_not_configured'
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
