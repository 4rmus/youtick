export interface Env {
    LIVEPEER_BRIDGE_ENABLED?: string;
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
    state: 'INTENT_RESERVED';
    network: 'testnet' | 'mainnet';
    contractId: string;
    jobId: string;
    generation: number;
    creator: string;
    expectedSourceBytes: string;
    profileId: 'paid-media-livepeer-v1';
    profileConfigSha256: string;
    createdAtMs: number;
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

const PUBLIC_CONTROL_REQUESTS_IMPLEMENTED = false;
const MAX_CONTROL_BODY_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 20_000_000_000n;
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

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        if (request.method === 'GET' && url.pathname === '/__health') {
            return json({
                status: 'ok',
                service: 'livepeer-bridge',
                stage: 'DISABLED',
                publicControlImplemented: PUBLIC_CONTROL_REQUESTS_IMPLEMENTED,
                providerMutationEnabled: false,
                controlPlaneReady: false,
            });
        }

        if (request.method === 'POST' && url.pathname === '/v1/upload-intents') {
            if (!PUBLIC_CONTROL_REQUESTS_IMPLEMENTED || env.LIVEPEER_BRIDGE_ENABLED !== 'true') {
                return json({ error: 'control_plane_disabled' }, 503);
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
            const code = error instanceof Error ? error.message : 'internal_error';
            console.error(formatLog('livepeer_control_request_failed', { code }));
            return json({ error: code }, errorStatus(code));
        }
    }

    private async reserveUploadIntent(request: Request): Promise<Response> {
        const input = await parseUploadIntentRequest(request, this.env);
        const chainJob = await readFinalMediaJob(this.env, input.body.job_id);
        requireExactChainJob(input, chainJob);

        const candidate = jobRecord(input);
        const created = await this.state.storage.transaction(async (transaction) => {
            const existing = await transaction.get<JobRecord>(JOB_KEY);
            if (existing) {
                if (!sameJob(existing, candidate)) throw new Error('reservation_conflict');
                return false;
            }
            await transaction.put(JOB_KEY, candidate);
            return true;
        });

        return json({ ...candidate, created }, created ? 201 : 200);
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
        return object.fetch(forwardingRequest);
    } catch (error) {
        const code = error instanceof Error ? error.message : 'internal_error';
        console.error(formatLog('livepeer_bridge_route_failed', { code }));
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
    if (BigInt(envelope.expires_at_ms) <= BigInt(Date.now())) throw new Error('control_request_expired');
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
        || typeof body.profile_config_sha256 !== 'string'
        || !SHA256_PATTERN.test(body.profile_config_sha256)) {
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

async function readFinalMediaJob(env: Env, jobId: string): Promise<OnChainJob> {
    if (!isHttpsUrl(env.NEAR_RPC_URL) || !ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')) {
        throw new Error('runtime_not_configured');
    }
    let response: Response;
    let payload: { result?: { result?: number[] }; error?: unknown };
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
    if (!response.ok || payload.error || !Array.isArray(payload.result?.result)) {
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
    return job as OnChainJob;
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
        state: 'INTENT_RESERVED',
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

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function errorStatus(code: string): number {
    if (code === 'origin_denied') return 403;
    if (code.includes('conflict') || code === 'on_chain_job_mismatch') return 409;
    if (code.startsWith('near_') || code === 'runtime_not_configured') return 503;
    return 400;
}

function json(body: JsonObject, status = 200): Response {
    return Response.json(body, {
        status,
        headers: { 'Cache-Control': 'no-store' },
    });
}
