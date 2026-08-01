import { base58Decode } from '../../shared/src/base58';

export interface Env {
    LIVEPEER_BRIDGE_ENABLED?: string;
    LIVEPEER_API_KEY?: string;
    ALLOWED_ORIGINS?: string;
    NEAR_NETWORK?: string;
    NEAR_RPC_URL?: string;
    MARKET_CONTRACT_ID?: string;
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
    state: 'CREATE_PENDING' | 'CREATE_AMBIGUOUS' | 'UPLOAD_READY';
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

const PUBLIC_CONTROL_REQUESTS_IMPLEMENTED = true;
const MAX_CONTROL_BODY_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 20_000_000_000n;
const LIVEPEER_TUS_CHUNK_BYTES = 8 * 1024 * 1024;
const LIVEPEER_API_BASE = 'https://livepeer.studio/api';
const PROFILE_CONFIG_SHA256 = '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77';
const SESSION_METHOD = 'create_paid_job';
const CONTROL_MAX_FUTURE_MS = 5 * 60 * 1000;
const JOB_KEY = 'job:v1';
const DEFAULT_ALLOWED_ORIGINS = 'https://youtick.net,https://www.youtick.net';
const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const JOB_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SESSION_KEY_PATTERN = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{1,192}$/;
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
    'invalid_outbox',
    'invalid_upload_intent',
    'near_job_not_found',
    'near_job_query_failed',
    'near_job_response_invalid',
    'on_chain_job_mismatch',
    'origin_denied',
    'outbox_conflict',
    'protocol_binding_mismatch',
    'provider_create_ambiguous',
    'provider_create_pending',
    'reservation_conflict',
    'runtime_not_configured',
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
                    && validApiKey(env.LIVEPEER_API_KEY),
            });
        }

        if (request.method === 'OPTIONS' && url.pathname === '/v1/upload-intents') {
            const origin = request.headers.get('Origin') || '';
            if (!allowedOrigins(env).has(origin)) return json({ error: 'origin_denied' }, 403);
            return withCors(new Response(null, { status: 204 }), origin);
        }

        if (request.method === 'POST' && url.pathname === '/v1/upload-intents') {
            const origin = request.headers.get('Origin') || '';
            const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
            if (!PUBLIC_CONTROL_REQUESTS_IMPLEMENTED || env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
                return withCors(json({ error: 'control_plane_disabled' }, 503), corsOrigin);
            }
            if (!validApiKey(env.LIVEPEER_API_KEY) || !env.LIVEPEER_CONTROL) {
                return withCors(json({ error: 'runtime_not_configured' }, 503), corsOrigin);
            }
            return forwardUploadIntent(request, env);
        }

        return json({ error: 'not_found', endpoints: ['/__health'] }, 404);
    },
};

export class LivepeerControl {
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
        || !functionCall.method_names.includes(SESSION_METHOD)
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
    return {
        assetId: asset.id,
        playbackId: asset.playbackId,
        projectId: asset.projectId,
        tusEndpoint: value.tusEndpoint,
    };
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
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
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
    if (code === 'origin_denied' || code === 'device_key_not_authorized') return 403;
    if (code.includes('conflict')
        || code === 'on_chain_job_mismatch'
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
