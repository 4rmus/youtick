import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyPair } from 'near-api-js';
import vectors from '../../../protocol/paid-media-livepeer-v1/golden-vectors.json';
import handler, {
    LivepeerControl,
    formatLog,
    forwardUploadIntent,
    jobObjectName,
    operatorObjectName,
    type Env,
} from './index';

const ORIGIN = 'https://app.youtick.net';
const RPC_URL = 'https://rpc.testnet.near.org';
const CONTRACT_ID = 'paid-media-livepeer-v1.testnet';
const API_KEY = 'test-livepeer-api-key';
const OPERATOR_ID = 'paid-media-operator.testnet';
const OPERATOR_TOKEN = 'test-paid-media-operator-token-32-bytes';
const OPERATOR_TOKEN_PREVIOUS = 'previous-paid-media-operator-token-32-bytes';
const OPERATOR_PRIVATE_KEY = KeyPair.fromRandom('ed25519').toString();
const BLOCK_HASH = '11111111111111111111111111111111';
const TUS_ENDPOINT = 'https://origin.livepeer.com/api/asset/upload/tus?token=secret';
const TUS_UPLOAD_URL = 'https://origin.livepeer.com/api/asset/upload/tus/upload-123';
let requestKey: CryptoKeyPair;
let requestPublicKey: string;
let quoteKey: CryptoKeyPair;
let quotePrivateKey: string;
let nonceCounter = 0;

type TestState = {
    state: DurableObjectState;
    values: Map<string, unknown>;
    alarms: number[];
};

function createState(): TestState {
    const values = new Map<string, unknown>();
    const alarms: number[] = [];
    let transactionTail = Promise.resolve();
    const get = async <T>(key: string) => structuredClone(values.get(key)) as T | undefined;
    const put = async (key: string, value: unknown) => {
        values.set(key, structuredClone(value));
    };
    const remove = async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        return keys.reduce((count, entry) => count + Number(values.delete(entry)), 0);
    };
    const list = async (options?: { prefix?: string; limit?: number }) => new Map(
        [...values.entries()]
            .filter(([key]) => !options?.prefix || key.startsWith(options.prefix))
            .slice(0, options?.limit ?? values.size),
    );
    const storage = {
        get,
        put,
        delete: remove,
        deleteAll: async () => values.clear(),
        list,
        setAlarm: async (at: number | Date) => alarms.push(Number(at)),
        transaction: async <T>(callback: (transaction: {
            get: typeof get;
            put: typeof put;
            list: typeof list;
        }) => Promise<T>) => {
            const run = transactionTail.then(() => callback({ get, put, list }));
            transactionTail = run.then(() => undefined, () => undefined);
            return run;
        },
    };
    return {
        state: { storage } as unknown as DurableObjectState,
        values,
        alarms,
    };
}

function createEnv(overrides?: Partial<Env>): Env {
    return {
        CF_VERSION_METADATA: {
            id: 'worker-version-test',
            tag: 'test',
            timestamp: '2026-08-08T00:00:00.000Z',
        },
        LIVEPEER_BRIDGE_ENABLED: 'false',
        LIVEPEER_NEW_UPLOADS_ENABLED: 'true',
        LIVEPEER_PROVIDER_MUTATIONS_ENABLED: 'true',
        LIVEPEER_OPERATOR_MUTATIONS_ENABLED: 'true',
        ALLOWED_ORIGINS: ORIGIN,
        NEAR_NETWORK: 'testnet',
        NEAR_RPC_URL: RPC_URL,
        MARKET_CONTRACT_ID: CONTRACT_ID,
        LIVEPEER_API_KEY: API_KEY,
        LIVEPEER_API_TOKEN_NAME: 'paid-media-test',
        LIVEPEER_CREATOR_ALLOWLIST: String(vectors.upload_intent.envelope.account_id),
        LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS: '1000000000',
        LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS: '100000000',
        LIVEPEER_WEBHOOK_QUEUE_BATCH_SIZE: '10',
        LIVEPEER_WEBHOOK_QUEUE_BATCH_TIMEOUT_SECONDS: '5',
        LIVEPEER_WEBHOOK_QUEUE_MAX_RETRIES: '3',
        LIVEPEER_WEBHOOK_QUEUE_MAX_CONCURRENCY: '1',
        LIVEPEER_WEBHOOK_QUEUE_RETENTION_SECONDS: '345600',
        LIVEPEER_WEBHOOK_QUEUE_DLQ: 'youtick-livepeer-events-dlq-testnet',
        LIVEPEER_CONTROL: {
            idFromName: (name: string) => ({ toString: () => name }),
            get: () => ({ fetch: async () => Response.json({
                accepted: true,
                lease_id: '00000000-0000-4000-8000-000000000001',
                expires_at_ms: '999999999999999',
                heartbeat_interval_ms: 5 * 60 * 1000,
            }) }),
        } as unknown as DurableObjectNamespace,
        ...overrides,
    };
}

function createArchiveDatabase(): {
    database: D1Database;
    rows: Map<string, Record<string, unknown>>;
} {
    const rows = new Map<string, Record<string, unknown>>();
    const statement = (sql: string, values: unknown[] = []): D1PreparedStatement => ({
        bind: (...next: unknown[]) => statement(sql, next),
        run: async () => {
            if (!sql.includes('INSERT INTO upload_job_archives')) throw new Error('unexpected_d1_run');
            const key = JSON.stringify(values.slice(0, 4));
            if (!rows.has(key)) {
                rows.set(key, {
                    creator_id: values[4],
                    terminal_state: values[5],
                    terminal_at_ms: values[6],
                    expected_source_bytes: values[7],
                    source_fingerprint_sha256: values[8],
                    asset_id_sha256: values[9],
                    project_id_sha256: values[10],
                    archive_requested_at_ms: values[11],
                    cleanup_eligible_at_ms: values[12],
                    archive_sha256: values[13],
                });
            }
            return { success: true } as D1Result;
        },
        first: async <T>() => rows.get(JSON.stringify(values)) as T | undefined || null,
    }) as unknown as D1PreparedStatement;
    return {
        database: { prepare: (sql: string) => statement(sql) } as D1Database,
        rows,
    };
}

function quoteRequest(body?: Record<string, unknown>): Request {
    return new Request('https://bridge.youtick.net/v1/creator-fee-quotes/near', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({
            creator_id: 'creator.testnet',
            job_id: 'job-near',
            expected_source_bytes: '1000000000',
            ...body,
        }),
    });
}

function uploadPreflightRequest(
    body?: Record<string, unknown>,
    origin = ORIGIN,
): Request {
    return new Request('https://bridge.youtick.net/v1/upload-preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({
            creator_id: String(vectors.upload_intent.envelope.account_id),
            job_id: 'job-preflight',
            generation: 1,
            expected_source_bytes: '1000',
            ...body,
        }),
    });
}

function quoteRuntime(overrides?: Partial<Env>): { env: Env; state: TestState } {
    const state = createState();
    let control: LivepeerControl;
    const env = createEnv({
        LIVEPEER_BRIDGE_ENABLED: 'true',
        LIVEPEER_NEAR_CREATOR_FEE_ENABLED: 'true',
        CREATOR_FEE_QUOTE_PRIVATE_KEY: quotePrivateKey,
        CREATOR_FEE_QUOTE_KEY_VERSION: '1',
        LIVEPEER_CONTROL: {
            idFromName: (name: string) => ({ toString: () => name }),
            get: () => ({ fetch: (request: Request) => control.fetch(request) }),
        } as unknown as DurableObjectNamespace,
        ...overrides,
    });
    control = new LivepeerControl(state.state, env);
    return { env, state };
}

function oracleRpcResponse(
    price: unknown = { multiplier: '500000099', decimals: 8 },
    timestamp = '1785589300000000000',
    assetId = 'wrap.near',
    recencyDurationSec = 60,
): Response {
    const value = JSON.stringify({
        timestamp,
        recency_duration_sec: recencyDurationSec,
        prices: [{ asset_id: assetId, price }],
    });
    return Response.json({
        result: {
            block_hash: BLOCK_HASH,
            block_height: 1,
            logs: [],
            result: [...new TextEncoder().encode(value)],
        },
    });
}

async function controlRequest(overrides?: {
    body?: Record<string, unknown>;
    envelope?: Record<string, unknown>;
    signature?: Uint8Array;
    keyPair?: CryptoKeyPair;
}): Promise<Request> {
    const input = structuredClone(vectors.upload_intent) as {
        body: Record<string, unknown>;
        envelope: Record<string, unknown>;
    };
    const body = { ...input.body, ...overrides?.body };
    const bodyHash = await sha256Hex(canonicalJson(body));
    const keyPair = overrides?.keyPair ?? requestKey;
    const rawPublicKey = new Uint8Array(
        await crypto.subtle.exportKey('raw', keyPair.publicKey) as ArrayBuffer,
    );
    nonceCounter += 1;
    const envelope: Record<string, unknown> = {
        ...input.envelope,
        session_public_key: `ed25519:${base58Encode(rawPublicKey)}`,
        device_nonce: base64UrlEncode(new Uint8Array(32).fill(nonceCounter)),
        expires_at_ms: String(Date.now() + 5 * 60 * 1000),
        body_sha256: bodyHash,
        ...overrides?.envelope,
    };
    const signature = overrides?.signature ?? new Uint8Array(await crypto.subtle.sign(
        'Ed25519',
        keyPair.privateKey,
        new TextEncoder().encode(canonicalControlMessage(envelope)),
    ));
    return new Request('https://bridge.youtick.net/v1/upload-intents', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Origin: String(envelope.origin),
            'X-Youtick-Signature': base64Encode(signature),
        },
        body: JSON.stringify({ body, envelope }),
    });
}

async function uploadHeartbeatRequest(leaseId: string): Promise<Request> {
    const body = {
        job_id: vectors.upload_intent.body.job_id,
        generation: vectors.upload_intent.body.generation,
        lease_id: leaseId,
    };
    nonceCounter += 1;
    const envelope = {
        ...vectors.upload_intent.envelope,
        version: '2',
        route: '/v1/upload-heartbeats',
        session_public_key: requestPublicKey,
        device_nonce: base64UrlEncode(new Uint8Array(32).fill(nonceCounter)),
        expires_at_ms: String(Date.now() + 5 * 60 * 1000),
        body_sha256: await sha256Hex(canonicalJson(body)),
    };
    const signature = new Uint8Array(await crypto.subtle.sign(
        'Ed25519',
        requestKey.privateKey,
        new TextEncoder().encode(canonicalControlMessage(envelope)),
    ));
    return new Request('https://bridge.youtick.net/v1/upload-heartbeats', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Origin: String(envelope.origin),
            'X-Youtick-Signature': base64Encode(signature),
        },
        body: JSON.stringify({ body, envelope }),
    });
}

async function uploadCancellationRequest(): Promise<Request> {
    const body = {
        job_id: vectors.upload_intent.body.job_id,
        generation: vectors.upload_intent.body.generation,
    };
    nonceCounter += 1;
    const envelope = {
        ...vectors.upload_intent.envelope,
        version: '2',
        route: '/v1/upload-cancellations',
        session_public_key: requestPublicKey,
        device_nonce: base64UrlEncode(new Uint8Array(32).fill(nonceCounter)),
        expires_at_ms: String(Date.now() + 5 * 60 * 1000),
        body_sha256: await sha256Hex(canonicalJson(body)),
    };
    const signature = new Uint8Array(await crypto.subtle.sign(
        'Ed25519',
        requestKey.privateKey,
        new TextEncoder().encode(canonicalControlMessage(envelope)),
    ));
    return new Request('https://bridge.youtick.net/v1/upload-cancellations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Origin: String(envelope.origin),
            'X-Youtick-Signature': base64Encode(signature),
        },
        body: JSON.stringify({ body, envelope }),
    });
}

function rpcResponse(uploadPublicKey = requestPublicKey, expiresAtMs = String(Date.now() + 600_000)): Response {
    const body = vectors.upload_intent.body;
    const job = {
        job_id: body.job_id,
        creator_id: vectors.upload_intent.envelope.account_id,
        profile_id: body.profile_id,
        profile_config_sha256: body.profile_config_sha256,
        expected_source_bytes: body.expected_source_bytes,
        generation: body.generation,
        status: 'Authorized',
        upload_public_key: uploadPublicKey,
        upload_key_expires_at_ms: expiresAtMs,
    };
    return Response.json({
        result: {
            block_hash: BLOCK_HASH,
            result: Array.from(new TextEncoder().encode(JSON.stringify(job))),
        },
    });
}

function providerResponse(tusEndpoint = TUS_ENDPOINT): Response {
    return Response.json({
        tusEndpoint,
        asset: {
            id: 'asset-123',
            playbackId: 'playback-123',
            projectId: 'project-123',
            playbackPolicy: { type: 'jwt' },
        },
    });
}

function backendFetch(options?: {
    providerGate?: Promise<void>;
    providerFailure?: boolean;
    providerThrows?: boolean;
    providerStatus?: number;
    jobPublicKey?: string;
    uploadKeyExpiresAtMs?: string;
    tusLengthMismatch?: boolean;
    tusOffset?: string;
    tusEndpoint?: string;
}) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === RPC_URL) {
            const rpcBody = JSON.parse(String(init?.body)) as {
                params: { request_type: string; finality?: string; block_id?: string };
            };
            expect(rpcBody.params.finality).toBe('final');
            return rpcResponse(options?.jobPublicKey, options?.uploadKeyExpiresAtMs);
        }
        if (url === 'https://livepeer.studio/api/asset/request-upload') {
            await options?.providerGate;
            if (options?.providerThrows) throw new Error('provider timeout');
            if (options?.providerStatus) {
                return Response.json({ error: 'closed' }, { status: options.providerStatus });
            }
            if (options?.providerFailure) return Response.json({ error: 'failed' }, { status: 503 });
            return providerResponse(options?.tusEndpoint);
        }
        if (url === TUS_ENDPOINT && init?.method === 'POST') {
            return new Response(null, {
                status: 201,
                headers: { Location: TUS_UPLOAD_URL },
            });
        }
        if (url === TUS_UPLOAD_URL && init?.method === 'HEAD') {
            return new Response(null, {
                status: 200,
                headers: {
                    'Upload-Length': options?.tusLengthMismatch
                        ? '20000000001'
                        : String(vectors.upload_intent.body.expected_source_bytes),
                    'Upload-Offset': options?.tusOffset ?? '0',
                },
            });
        }
        throw new Error(`unexpected_fetch:${url}`);
    });
}

function admissionRequest(
    path: 'preflight' | 'reserve' | 'mark' | 'heartbeat' | 'reopen',
    body: Record<string, unknown>,
): Request {
    return new Request(`https://object/internal/admission/${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

function base58Encode(value: Uint8Array): string {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let number = BigInt(`0x${hexEncode(value)}`);
    let encoded = '';
    while (number > 0n) {
        encoded = alphabet[Number(number % 58n)] + encoded;
        number /= 58n;
    }
    for (const byte of value) {
        if (byte !== 0) break;
        encoded = `1${encoded}`;
    }
    return encoded;
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const object = value as Record<string, unknown>;
        return `{${Object.keys(object).sort().map((key) => (
            `${JSON.stringify(key)}:${canonicalJson(object[key])}`
        )).join(',')}}`;
    }
    return JSON.stringify(value);
}

function canonicalControlMessage(envelope: Record<string, unknown>): string {
    return [
        'domain', 'version', 'method', 'route', 'network', 'contract_id', 'account_id',
        'resource', 'session_public_key', 'origin', 'device_nonce', 'expires_at_ms', 'body_sha256',
    ].map((key) => String(envelope[key])).join('\n');
}

async function sha256Hex(value: string): Promise<string> {
    return hexEncode(new Uint8Array(await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(value),
    )));
}

function base64Encode(value: Uint8Array): string {
    return btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(''));
}

function base64UrlEncode(value: Uint8Array): string {
    return base64Encode(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hexEncode(value: Uint8Array): string {
    return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('Livepeer bridge PR-3 upload intent', () => {
    beforeAll(async () => {
        requestKey = await crypto.subtle.generateKey(
            'Ed25519', true, ['sign', 'verify'],
        ) as CryptoKeyPair;
        const rawPublicKey = new Uint8Array(
            await crypto.subtle.exportKey('raw', requestKey.publicKey) as ArrayBuffer,
        );
        requestPublicKey = `ed25519:${base58Encode(rawPublicKey)}`;
        quoteKey = await crypto.subtle.generateKey(
            'Ed25519', true, ['sign', 'verify'],
        ) as CryptoKeyPair;
        quotePrivateKey = base64Encode(new Uint8Array(
            await crypto.subtle.exportKey('pkcs8', quoteKey.privateKey) as ArrayBuffer,
        ));
    });

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps the implemented public control route disabled by default', async () => {
        const health = await handler.fetch(
            new Request('https://bridge.youtick.net/__health'),
            createEnv(),
        );
        expect(await health.json()).toMatchObject({
            versionId: 'worker-version-test',
            stage: 'DISABLED',
            publicControlImplemented: true,
            providerMutationEnabled: false,
            operatorMutationEnabled: false,
            newUploadReady: false,
            controlPlaneReady: false,
            playbackShadowV2Ready: false,
            uploadJobArchiveReady: false,
            operatorOutboxArchiveReady: false,
        });

        const response = await handler.fetch(
            await controlRequest(),
            createEnv(),
        );
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'control_plane_disabled' });

        const reopen = await handler.fetch(new Request(
            'https://bridge.youtick.net/v1/operations/admission-reopen',
            { method: 'POST', body: '{}' },
        ), createEnv());
        expect(reopen.status).toBe(503);
        expect(await reopen.json()).toEqual({ error: 'control_plane_disabled' });

        for (const route of ['/v1/upload-preflight', '/v1/upload-intents']) {
            const preflight = await handler.fetch(new Request(
                `https://bridge.youtick.net${route}`,
                { method: 'OPTIONS', headers: { Origin: ORIGIN } },
            ), createEnv());
            expect(preflight.status).toBe(204);
            expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
        }
    });

    it('requires playback signing config before reporting new uploads ready', async () => {
        const missingSigningConfig = await handler.fetch(
            new Request('https://bridge.youtick.net/__health'),
            createEnv({ LIVEPEER_BRIDGE_ENABLED: 'true' }),
        );
        expect(await missingSigningConfig.json()).toMatchObject({ newUploadReady: false });

        const configured = await handler.fetch(
            new Request('https://bridge.youtick.net/__health'),
            createEnv({
                LIVEPEER_BRIDGE_ENABLED: 'true',
                ACCESS_CONTRACT_ID: 'paid-media-access.testnet',
                LIVEPEER_JWT_PRIVATE_KEY: 'a'.repeat(64),
                LIVEPEER_JWT_PUBLIC_KEY: 'b'.repeat(32),
                LIVEPEER_JWT_ISSUER: ORIGIN,
            }),
        );
        expect(await configured.json()).toMatchObject({ newUploadReady: true });
    });

    it('logs bounded request completion fields without the query string', async () => {
        vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_012);
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const request = new Request('https://bridge.youtick.net/__health?token=secret', {
            headers: { 'CF-Ray': 'ray-test' },
        });
        Object.defineProperty(request, 'cf', { value: {} });

        expect((await handler.fetch(request, createEnv())).status).toBe(200);
        expect(info).toHaveBeenCalledOnce();
        const log = JSON.parse(String(info.mock.calls[0][0]));
        expect(log).toEqual({
            event: 'edge_request_completed',
            details: {
                requestId: 'ray-test',
                environment: 'testnet',
                releaseVersion: 'worker-version-test',
                route: '/__health',
                method: 'GET',
                httpCode: 200,
                latencyMs: 12,
                coldStart: true,
            },
        });
        expect(info.mock.calls[0][0]).not.toContain('secret');
    });

    it('marks only the first edge request in a fresh isolate as a cold start', async () => {
        vi.resetModules();
        const { default: freshHandler } = await import('./index');
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const requests = [1, 2].map((suffix) => {
            const request = new Request(`https://bridge.youtick.net/__health?request=${suffix}`);
            Object.defineProperty(request, 'cf', { value: {} });
            return request;
        });

        expect((await freshHandler.fetch(requests[0], createEnv())).status).toBe(200);
        expect((await freshHandler.fetch(requests[1], createEnv())).status).toBe(200);

        const logs = info.mock.calls.map(([value]) => JSON.parse(String(value)));
        expect(logs.map((entry) => entry.details.coldStart)).toEqual([true, false]);
    });

    it('logs bounded NEAR and Livepeer dependency completion fields', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        vi.stubGlobal('fetch', backendFetch());
        const control = new LivepeerControl(createState().state, createEnv());

        expect((await control.fetch(await controlRequest())).status).toBe(201);

        const logs = info.mock.calls.map(([value]) => JSON.parse(String(value)));
        expect(logs).toEqual(expect.arrayContaining([
            {
                event: 'dependency_request_completed',
                details: {
                    dependency: 'near_rpc',
                    operation: 'get_media_job',
                    httpCode: 200,
                    latencyMs: expect.any(Number),
                },
            },
            {
                event: 'dependency_request_completed',
                details: {
                    dependency: 'livepeer_api',
                    operation: 'request_upload',
                    httpCode: 200,
                    latencyMs: expect.any(Number),
                },
            },
            {
                event: 'upload_intent_control_completed',
                details: {
                    outcome: 'CREATE_PENDING',
                    providerCalls: 0,
                    latencyMs: expect.any(Number),
                },
            },
        ]));
        expect(JSON.stringify(logs)).not.toContain(API_KEY);
        expect(JSON.stringify(logs)).not.toContain(RPC_URL);
        expect(JSON.stringify(logs)).not.toContain(TUS_ENDPOINT);

        info.mockClear();
        vi.stubGlobal('fetch', backendFetch({ providerFailure: true }));
        const failed = await new LivepeerControl(createState().state, createEnv())
            .fetch(await controlRequest());
        expect(failed.status).toBe(503);
        expect(info.mock.calls.map(([value]) => JSON.parse(String(value))))
            .toContainEqual({
                event: 'dependency_request_completed',
                details: {
                    dependency: 'livepeer_api',
                    operation: 'request_upload',
                    httpCode: 503,
                    latencyMs: expect.any(Number),
                },
            });
    });

    it('logs upload job state transitions without job or provider identifiers', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        vi.stubGlobal('fetch', backendFetch());

        expect((await new LivepeerControl(createState().state, createEnv())
            .fetch(await controlRequest())).status).toBe(201);

        const transitions = info.mock.calls
            .map(([value]) => JSON.parse(String(value)))
            .filter((entry) => entry.event === 'state_transition');
        expect(transitions).toEqual([
            {
                event: 'state_transition',
                details: {
                    stateKind: 'upload_job',
                    fromState: 'NONE',
                    toState: 'AUTHORIZED',
                },
            },
            {
                event: 'state_transition',
                details: {
                    stateKind: 'upload_job',
                    fromState: 'AUTHORIZED',
                    toState: 'LEASED',
                },
            },
            {
                event: 'state_transition',
                details: {
                    stateKind: 'upload_job',
                    fromState: 'LEASED',
                    toState: 'PROVIDER_CREATE_PENDING',
                },
            },
            {
                event: 'state_transition',
                details: {
                    stateKind: 'upload_job',
                    fromState: 'PROVIDER_CREATE_PENDING',
                    toState: 'UPLOAD_READY',
                },
            },
        ]);
        expect(JSON.stringify(transitions)).not.toContain('job-001');
        expect(JSON.stringify(transitions)).not.toContain('asset-123');
    });

    it('returns a signed integer-only Outlayer NEAR creator-fee quote', async () => {
        const now = 1_785_589_310_000;
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const oracleFetch = vi.fn().mockResolvedValue(oracleRpcResponse());
        vi.stubGlobal('fetch', oracleFetch);
        const { env } = quoteRuntime();

        const response = await handler.fetch(quoteRequest(), env);
        expect(response.status).toBe(200);
        const result = await response.json() as {
            quote: Record<string, unknown>;
            signature: string;
            public_key_version: number;
        };
        expect(result.quote).toEqual({
            domain: 'youtick.creator-fee-quote',
            version: '1',
            network: 'testnet',
            contract_id: CONTRACT_ID,
            creator_id: 'creator.testnet',
            job_id: 'job-near',
            expected_source_bytes: '1000000000',
            fee_usd_micro: '500000',
            near_usd_micro: '5000000',
            fee_near_yocto: '100000000000000000000000',
            rate_source: 'outlayer-price-oracle-wrap-near-v1',
            rate_timestamp_ms: '1785589300000',
            expires_at_ms: '1785589420000',
            quote_key_version: 1,
            quote_id: expect.stringMatching(/^[0-9a-f]{64}$/),
        });
        expect(result.public_key_version).toBe(1);
        const valid = await crypto.subtle.verify(
            'Ed25519',
            quoteKey.publicKey,
            Uint8Array.from(atob(result.signature), (character) => character.charCodeAt(0)),
            new TextEncoder().encode([
                'domain', 'version', 'network', 'contract_id', 'creator_id', 'job_id',
                'expected_source_bytes', 'fee_usd_micro', 'near_usd_micro',
                'fee_near_yocto', 'rate_source', 'rate_timestamp_ms', 'expires_at_ms',
                'quote_key_version',
            ].map((key) => String(result.quote[key])).join('\n')),
        );
        expect(valid).toBe(true);
        expect(oracleFetch).toHaveBeenCalledWith(RPC_URL, expect.objectContaining({ method: 'POST' }));
        const rpcRequest = JSON.parse(String(oracleFetch.mock.calls[0]![1]!.body));
        expect(rpcRequest).toEqual({
            jsonrpc: '2.0',
            id: 'creator-fee-near-usd',
            method: 'query',
            params: {
                request_type: 'call_function',
                finality: 'final',
                account_id: 'price-oracle.testnet',
                method_name: 'get_price_data',
                args_base64: btoa(JSON.stringify({ asset_ids: ['wrap.near'] })),
            },
        });
    });

    it('keeps the NEAR quote endpoint disabled behind its server-side flag', async () => {
        const oracleFetch = vi.fn();
        vi.stubGlobal('fetch', oracleFetch);
        const { env } = quoteRuntime({ LIVEPEER_NEAR_CREATOR_FEE_ENABLED: 'false' });

        const response = await handler.fetch(quoteRequest(), env);
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'runtime_not_configured' });
        expect(oracleFetch).not.toHaveBeenCalled();
    });

    it('reads the mainnet Outlayer contract on mainnet', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_785_589_310_000);
        const oracleFetch = vi.fn().mockResolvedValue(oracleRpcResponse());
        vi.stubGlobal('fetch', oracleFetch);
        const { env } = quoteRuntime();
        env.NEAR_NETWORK = 'mainnet';
        env.MARKET_CONTRACT_ID = 'paid-media-livepeer-v1.near';

        expect((await handler.fetch(quoteRequest(), env)).status).toBe(200);
        const rpcRequest = JSON.parse(String(oracleFetch.mock.calls[0]![1]!.body));
        expect(rpcRequest.params.account_id).toBe('price-oracle.near');
    });

    it.each([
        {
            name: 'stale',
            response: oracleRpcResponse(
                { multiplier: '500000000', decimals: 8 },
                '1785589249000000000',
            ),
            error: 'rate_source_stale',
        },
        {
            name: 'future',
            response: oracleRpcResponse(
                { multiplier: '500000000', decimals: 8 },
                '1785589311000000000',
            ),
            error: 'rate_source_invalid',
        },
        {
            name: 'empty',
            response: oracleRpcResponse(null),
            error: 'rate_source_unavailable',
        },
        {
            name: 'wrong asset',
            response: oracleRpcResponse(
                { multiplier: '500000000', decimals: 8 },
                '1785589300000000000',
                'aurora',
            ),
            error: 'rate_source_invalid',
        },
        {
            name: 'invalid decimals',
            response: oracleRpcResponse({ multiplier: '500000000', decimals: 31 }),
            error: 'rate_source_invalid',
        },
        {
            name: 'unsafe recency window',
            response: oracleRpcResponse(
                { multiplier: '500000000', decimals: 8 },
                '1785589300000000000',
                'wrap.near',
                300,
            ),
            error: 'rate_source_stale',
        },
        {
            name: 'zero price',
            response: oracleRpcResponse({ multiplier: '0', decimals: 8 }),
            error: 'rate_source_invalid',
        },
        {
            name: 'RPC error',
            response: Response.json({ error: { code: -32000, message: 'oracle unavailable' } }),
            error: 'rate_source_unavailable',
        },
        {
            name: 'unavailable',
            response: Response.json({ error: 'unavailable' }, { status: 503 }),
            error: 'rate_source_unavailable',
        },
    ])('fails closed when the Outlayer rate is $name', async ({ response, error }) => {
        vi.spyOn(Date, 'now').mockReturnValue(1_785_589_310_000);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
        const { env } = quoteRuntime();

        const result = await handler.fetch(quoteRequest(), env);
        expect(result.status).toBe(503);
        expect(await result.json()).toEqual({ error });
    });

    it('fails closed when the Outlayer RPC request times out', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')));
        const { env } = quoteRuntime();

        const result = await handler.fetch(quoteRequest(), env);
        expect(result.status).toBe(503);
        expect(await result.json()).toEqual({ error: 'rate_source_unavailable' });
    });

    it('rejects invalid quote input before the Outlayer lookup', async () => {
        const oracleFetch = vi.fn();
        vi.stubGlobal('fetch', oracleFetch);
        const { env } = quoteRuntime();

        const result = await handler.fetch(quoteRequest({ expected_source_bytes: '20000000001' }), env);
        expect(result.status).toBe(400);
        expect(await result.json()).toEqual({ error: 'invalid_creator_fee_quote_request' });
        expect(oracleFetch).not.toHaveBeenCalled();
    });

    it('rate-limits quote requests without storing quote or wallet data', async () => {
        const now = 1_785_589_310_000;
        vi.spyOn(Date, 'now').mockReturnValue(now);
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => oracleRpcResponse(
            { multiplier: '500000000', decimals: 8 },
        )));
        const { env, state } = quoteRuntime();

        for (let attempt = 0; attempt < 5; attempt += 1) {
            expect((await handler.fetch(quoteRequest(), env)).status).toBe(200);
        }
        const limited = await handler.fetch(quoteRequest(), env);
        expect(limited.status).toBe(429);
        expect(await limited.json()).toEqual({ error: 'creator_fee_quote_rate_limited' });
        expect([...state.values.keys()]).toEqual(['quote-rate:v1']);
        expect(state.values.get('quote-rate:v1')).toEqual({
            windowStartedAtMs: now,
            count: 5,
        });
        expect(state.alarms.at(-1)).toBe(now + 60_000);

        vi.spyOn(Date, 'now').mockReturnValue(now + 60_000);
        await new LivepeerControl(state.state, env).alarm();
        expect(state.values.size).toBe(0);
    });

    it('routes the locked identity to one named job object', async () => {
        const fetchStub = vi.fn(async () => Response.json({ state: 'UPLOAD_READY' }));
        const idFromName = vi.fn(() => ({ toString: () => 'object-id' }));
        const get = vi.fn(() => ({ fetch: fetchStub }));
        const response = await forwardUploadIntent(await controlRequest(), createEnv({
            LIVEPEER_CONTROL: { idFromName, get } as unknown as DurableObjectNamespace,
        }));

        expect(response.status).toBe(200);
        expect(idFromName).toHaveBeenCalledWith(
            'job:testnet:paid-media-livepeer-v1.testnet:job-001:1',
        );
        expect(fetchStub).toHaveBeenCalledOnce();
        expect(jobObjectName('testnet', CONTRACT_ID, 'job-001', 1))
            .toBe('job:testnet:paid-media-livepeer-v1.testnet:job-001:1');
        expect(operatorObjectName('testnet', 'ed25519:key', 2))
            .toBe('operator:testnet:ed25519:key:2');
    });

    it('accepts a configured localhost control origin', async () => {
        const fetchStub = vi.fn(async () => Response.json({ state: 'UPLOAD_READY' }));
        const response = await forwardUploadIntent(await controlRequest({
            envelope: { origin: 'http://localhost:3000' },
        }), createEnv({
            ALLOWED_ORIGINS: 'http://localhost:3000',
            LIVEPEER_CONTROL: {
                idFromName: () => ({ toString: () => 'object-id' }),
                get: () => ({ fetch: fetchStub }),
            } as unknown as DurableObjectNamespace,
        }));

        expect(response.status).toBe(200);
        expect(fetchStub).toHaveBeenCalledOnce();
    });

    it('accepts exact 20 GB and rejects one byte more before provider forwarding', async () => {
        const fetchStub = vi.fn(async () => Response.json({ state: 'UPLOAD_READY' }));
        const idFromName = vi.fn(() => ({ toString: () => 'object-id' }));
        const get = vi.fn(() => ({ fetch: fetchStub }));
        const env = createEnv({
            LIVEPEER_CONTROL: { idFromName, get } as unknown as DurableObjectNamespace,
        });

        const exact = await forwardUploadIntent(await controlRequest({
            body: { expected_source_bytes: '20000000000' },
        }), env);
        expect(exact.status).toBe(200);

        const tooLarge = await forwardUploadIntent(await controlRequest({
            body: { expected_source_bytes: '20000000001' },
        }), env);
        expect(tooLarge.status).toBe(400);
        expect(await tooLarge.json()).toEqual({ error: 'invalid_upload_intent' });
        expect(fetchStub).toHaveBeenCalledOnce();
    });

    it.each([
        ['mp4', 'source.mp4', 'video/mp4'],
        ['mov', 'source.mov', 'video/quicktime'],
        ['avi', 'source.avi', 'video/x-msvideo'],
        ['webm', 'source.webm', 'video/webm'],
        ['wmv', 'source.wmv', 'video/x-ms-wmv'],
        ['mkv', 'source.mkv', 'video/x-matroska'],
        ['flv', 'source.flv', 'video/x-flv'],
    ])('binds %s metadata to the provider TUS resource', async (sourceType, filename, mime) => {
        const fetchMock = backendFetch();
        vi.stubGlobal('fetch', fetchMock);
        const control = new LivepeerControl(createState().state, createEnv());

        const response = await control.fetch(await controlRequest({ body: { source_type: sourceType } }));

        expect(response.status).toBe(201);
        const tusCreate = fetchMock.mock.calls.find(([url]) => String(url) === TUS_ENDPOINT);
        expect((tusCreate?.[1]?.headers as Record<string, string>)['Upload-Metadata'])
            .toBe(`filename ${btoa(filename)},filetype ${btoa(mime)}`);
    });

    it('rejects a source type outside the Livepeer Studio allowlist', async () => {
        const response = await forwardUploadIntent(await controlRequest({
            body: { source_type: 'mpeg' },
        }), createEnv());

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'invalid_upload_intent' });
    });

    it('accepts one concurrent reservation winner after final NEAR reads', async () => {
        const testState = createState();
        const control = new LivepeerControl(testState.state, createEnv());
        let releaseFetch!: () => void;
        const gate = new Promise<void>((resolve) => {
            releaseFetch = resolve;
        });
        const fetchMock = backendFetch({ providerGate: gate });
        vi.stubGlobal('fetch', fetchMock);

        const first = control.fetch(await controlRequest());
        await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url]) => (
            String(url).includes('/asset/request-upload')
        ))).toBe(true));
        expect(testState.values.get('job:v1')).toMatchObject({
            state: 'PROVIDER_CREATE_PENDING',
            stateChangedAtMs: expect.any(Number),
            providerCreate: {
                attempts: 1,
                lastAttemptAtMs: expect.any(Number),
                retryPolicy: 'RECONCILE_ONLY',
            },
        });
        expect(testState.values.get('job:v1')).toMatchObject({ apiTokenName: 'paid-media-test' });

        const second = await control.fetch(await controlRequest());
        expect(second.status).toBe(409);
        expect(await second.json()).toEqual({ error: 'provider_create_pending' });
        releaseFetch();

        const created = await first;
        expect(created.status).toBe(201);
        expect(await created.json()).toMatchObject({
            schema: 'youtick.livepeer-upload-intent.v2',
            chunk_bytes: 32 * 1024 * 1024,
            created: true,
        });
        expect(testState.values.get('job:v1')).toMatchObject({
            state: 'UPLOAD_READY',
            stateChangedAtMs: expect.any(Number),
            providerCreate: {
                attempts: 1,
                retryPolicy: 'RECONCILE_ONLY',
                completedAtMs: expect.any(Number),
            },
        });
        const providerCalls = fetchMock.mock.calls.filter(([url]) => (
            String(url).includes('/asset/request-upload')
        ));
        expect(providerCalls).toHaveLength(1);
        const providerRequest = providerCalls[0][1] as RequestInit;
        expect((providerRequest.headers as Record<string, string>).Authorization)
            .toBe(`Bearer ${API_KEY}`);
        expect(JSON.parse(String(providerRequest.body))).toMatchObject({
            playbackPolicy: { type: 'jwt' },
            creatorId: { type: 'unverified', value: 'job-001:1' },
            profiles: [{ name: '720p', width: 1280, height: 720 }],
        });
        const tusCreate = fetchMock.mock.calls.find(([url]) => String(url) === TUS_ENDPOINT);
        expect(tusCreate?.[1]).toMatchObject({
            method: 'POST',
            headers: expect.objectContaining({
                'Tus-Resumable': '1.0.0',
                'Upload-Length': String(vectors.upload_intent.body.expected_source_bytes),
            }),
        });
    });

    it('preserves and reuses one provider intent across object restart or eviction', async () => {
        const fetchMock = backendFetch();
        vi.stubGlobal('fetch', fetchMock);
        const testState = createState();
        const admissionFetch = vi.fn(async (_request: Request) => Response.json({
            accepted: true,
            lease_id: '00000000-0000-4000-8000-000000000002',
            expires_at_ms: '999999999999999',
            heartbeat_interval_ms: 5 * 60 * 1000,
        }));
        const env = createEnv({
            LIVEPEER_CONTROL: {
                idFromName: (name: string) => ({ toString: () => name }),
                get: () => ({ fetch: admissionFetch }),
            } as unknown as DurableObjectNamespace,
        });
        const firstInstance = new LivepeerControl(testState.state, env);
        const request = await controlRequest();
        const repeatedNonce = request.clone();
        const created = await firstInstance.fetch(request);
        expect(created.status).toBe(201);

        const restartedInstance = new LivepeerControl(testState.state, env);
        const replayedNonce = await restartedInstance.fetch(repeatedNonce);
        expect(replayedNonce.status).toBe(409);
        expect(await replayedNonce.json()).toEqual({ error: 'device_nonce_replayed' });

        const replay = await restartedInstance.fetch(await controlRequest());
        expect(replay.status).toBe(200);
        expect(await replay.json()).toMatchObject({
            tus_endpoint: TUS_UPLOAD_URL,
            created: false,
        });
        expect(fetchMock.mock.calls.filter(([url]) => (
            String(url).includes('/asset/request-upload')
        ))).toHaveLength(1);
        expect(admissionFetch.mock.calls.filter(([request]) => (
            new URL(request.url).pathname === '/internal/admission/reserve'
        ))).toHaveLength(1);
    });

    it('closes new upload intents while preserving an existing TUS recovery', async () => {
        const fetchMock = backendFetch();
        vi.stubGlobal('fetch', fetchMock);
        const env = createEnv({ LIVEPEER_BRIDGE_ENABLED: 'true' });
        const state = createState();
        const control = new LivepeerControl(state.state, env);

        expect((await control.fetch(await controlRequest())).status).toBe(201);
        env.LIVEPEER_NEW_UPLOADS_ENABLED = 'false';
        env.LIVEPEER_PROVIDER_MUTATIONS_ENABLED = 'false';

        const preflight = await handler.fetch(uploadPreflightRequest(), env);
        expect(preflight.status).toBe(503);
        expect(await preflight.json()).toEqual({ error: 'admission_closed' });

        const recovered = await control.fetch(await controlRequest());
        expect(recovered.status).toBe(200);
        expect(await recovered.json()).toMatchObject({
            tus_endpoint: TUS_UPLOAD_URL,
            created: false,
        });

        const freshState = createState();
        const denied = await new LivepeerControl(freshState.state, env)
            .fetch(await controlRequest());
        expect(denied.status).toBe(503);
        expect(await denied.json()).toEqual({ error: 'admission_closed' });
        expect(freshState.values.has('job:v1')).toBe(false);
        expect(fetchMock.mock.calls.filter(([url]) => (
            String(url).includes('/asset/request-upload')
        ))).toHaveLength(1);
    });

    it('blocks provider create while keeping the authorized job recoverable', async () => {
        const fetchMock = backendFetch();
        vi.stubGlobal('fetch', fetchMock);
        const env = createEnv({ LIVEPEER_PROVIDER_MUTATIONS_ENABLED: 'false' });
        const state = createState();
        const control = new LivepeerControl(state.state, env);

        const denied = await control.fetch(await controlRequest());
        expect(denied.status).toBe(503);
        expect(await denied.json()).toEqual({ error: 'provider_mutations_disabled' });
        expect(state.values.get('job:v1')).toMatchObject({ state: 'AUTHORIZED' });
        expect(fetchMock.mock.calls.filter(([url]) => (
            String(url).includes('/asset/request-upload')
        ))).toHaveLength(0);

        env.LIVEPEER_PROVIDER_MUTATIONS_ENABLED = 'true';
        const resumed = await control.fetch(await controlRequest());
        expect(resumed.status).toBe(201);
        expect(fetchMock.mock.calls.filter(([url]) => (
            String(url).includes('/asset/request-upload')
        ))).toHaveLength(1);
    });

    it('binds recovery to the first signed source fingerprint', async () => {
        const fetchMock = backendFetch();
        vi.stubGlobal('fetch', fetchMock);
        const state = createState();
        const admissionFetch = vi.fn(async (_request: Request) => Response.json({
            accepted: true,
            lease_id: '00000000-0000-4000-8000-000000000009',
            expires_at_ms: '999999999999999',
            heartbeat_interval_ms: 5 * 60 * 1000,
        }));
        const env = createEnv({
            LIVEPEER_CONTROL: {
                idFromName: (name: string) => ({ toString: () => name }),
                get: () => ({ fetch: admissionFetch }),
            } as unknown as DurableObjectNamespace,
        });
        const control = new LivepeerControl(state.state, env);

        expect((await control.fetch(await controlRequest())).status).toBe(201);
        const conflict = await control.fetch(await controlRequest({
            body: { source_fingerprint_sha256: 'b'.repeat(64) },
        }));

        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toEqual({ error: 'reservation_conflict' });
        expect(state.values.get('job:v1')).toMatchObject({
            sourceFingerprintSha256: 'a'.repeat(64),
        });
        expect(fetchMock.mock.calls.filter(([url]) => (
            String(url).includes('/asset/request-upload')
        ))).toHaveLength(1);
    });

    it('requires upload control v3 while keeping other control routes on v2', async () => {
        const fetchMock = backendFetch();
        vi.stubGlobal('fetch', fetchMock);
        const control = new LivepeerControl(createState().state, createEnv());

        const response = await control.fetch(await controlRequest({ envelope: { version: '2' } }));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'protocol_binding_mismatch' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reacquires an expired lease without creating another provider resource', async () => {
        let now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const fetchMock = backendFetch();
        vi.stubGlobal('fetch', fetchMock);
        const state = createState();
        let reserveCount = 0;
        const admissionFetch = vi.fn(async (request: Request) => {
            if (new URL(request.url).pathname !== '/internal/admission/reserve') {
                return Response.json({ accepted: true });
            }
            reserveCount += 1;
            return Response.json({
                accepted: true,
                lease_id: `00000000-0000-4000-8000-${String(reserveCount).padStart(12, '0')}`,
                expires_at_ms: String(now + 30 * 60 * 1000),
                heartbeat_interval_ms: 5 * 60 * 1000,
            });
        });
        const env = createEnv({
            LIVEPEER_CONTROL: {
                idFromName: (name: string) => ({ toString: () => name }),
                get: () => ({ fetch: admissionFetch }),
            } as unknown as DurableObjectNamespace,
        });
        const control = new LivepeerControl(state.state, env);
        const created = await control.fetch(await controlRequest());
        const first = await created.json() as { lease_id: string };

        now += 31 * 60 * 1000;
        const recovered = await control.fetch(await controlRequest());
        const second = await recovered.json() as { lease_id: string; tus_endpoint: string };

        expect(recovered.status).toBe(200);
        expect(second.tus_endpoint).toBe(TUS_UPLOAD_URL);
        expect(second.lease_id).not.toBe(first.lease_id);
        expect(reserveCount).toBe(2);
        expect(fetchMock.mock.calls.filter(([url]) => (
            String(url).includes('/asset/request-upload')
        ))).toHaveLength(1);
    });

    it('recovers the same TUS resource after browser key replacement and object restart', async () => {
        const state = createState();
        const backendOptions = { jobPublicKey: requestPublicKey };
        const fetchMock = backendFetch(backendOptions);
        vi.stubGlobal('fetch', fetchMock);
        const admissionFetch = vi.fn(async (_request: Request) => Response.json({
            accepted: true,
            lease_id: '00000000-0000-4000-8000-000000000003',
            expires_at_ms: '999999999999999',
            heartbeat_interval_ms: 5 * 60 * 1000,
        }));
        const env = createEnv({
            LIVEPEER_CONTROL: {
                idFromName: (name: string) => ({ toString: () => name }),
                get: () => ({ fetch: admissionFetch }),
            } as unknown as DurableObjectNamespace,
        });

        const created = await new LivepeerControl(state.state, env).fetch(await controlRequest());
        expect(created.status).toBe(201);
        const replacementKey = await crypto.subtle.generateKey(
            'Ed25519',
            true,
            ['sign', 'verify'],
        ) as CryptoKeyPair;
        const replacementPublicKey = `ed25519:${base58Encode(new Uint8Array(
            await crypto.subtle.exportKey('raw', replacementKey.publicKey) as ArrayBuffer,
        ))}`;
        backendOptions.jobPublicKey = replacementPublicKey;

        const recovered = await new LivepeerControl(state.state, env).fetch(await controlRequest({
            keyPair: replacementKey,
        }));

        expect(recovered.status).toBe(200);
        expect(await recovered.json()).toMatchObject({
            schema: 'youtick.livepeer-upload-intent.v2',
            tus_endpoint: TUS_UPLOAD_URL,
            created: false,
        });
        expect(fetchMock.mock.calls.filter(([url]) => (
            String(url).includes('/asset/request-upload')
        ))).toHaveLength(1);
        expect(admissionFetch.mock.calls.filter(([request]) => (
            new URL(request.url).pathname === '/internal/admission/reserve'
        ))).toHaveLength(1);
    });

    it('uses the first signed heartbeat as UPLOADING and keeps the same TUS recovery URL', async () => {
        const leaseId = '00000000-0000-4000-8000-000000000004';
        const fetchMock = backendFetch();
        vi.stubGlobal('fetch', fetchMock);
        const state = createState();
        const admissionFetch = vi.fn(async (_request: Request) => Response.json({
            accepted: true,
            lease_id: leaseId,
            expires_at_ms: '999999999999999',
            heartbeat_interval_ms: 5 * 60 * 1000,
        }));
        const env = createEnv({
            LIVEPEER_CONTROL: {
                idFromName: (name: string) => ({ toString: () => name }),
                get: () => ({ fetch: admissionFetch }),
            } as unknown as DurableObjectNamespace,
        });
        const control = new LivepeerControl(state.state, env);
        expect((await control.fetch(await controlRequest())).status).toBe(201);

        const heartbeatRequest = await uploadHeartbeatRequest(leaseId);
        const replayRequest = heartbeatRequest.clone();
        const heartbeat = await control.fetch(heartbeatRequest);

        expect(heartbeat.status).toBe(200);
        expect(state.values.get('job:v1')).toMatchObject({
            state: 'UPLOADING',
            stateChangedAtMs: expect.any(Number),
        });
        const replay = await control.fetch(replayRequest);
        expect(replay.status).toBe(409);
        expect(await replay.json()).toEqual({ error: 'device_nonce_replayed' });
        expect(admissionFetch.mock.calls.filter(([request]) => (
            new URL(request.url).pathname === '/internal/admission/heartbeat'
        ))).toHaveLength(1);
        const recovered = await control.fetch(await controlRequest());
        expect(recovered.status).toBe(200);
        expect(await recovered.json()).toMatchObject({
            tus_endpoint: TUS_UPLOAD_URL,
            created: false,
        });
        expect(fetchMock.mock.calls.filter(([url]) => (
            String(url).includes('/asset/request-upload')
        ))).toHaveLength(1);
    });

    it('purges expired control nonces without deleting the upload job', async () => {
        vi.stubGlobal('fetch', backendFetch());
        const state = createState();
        const control = new LivepeerControl(state.state, createEnv());
        const legacyCreatedAtMs = Date.now();

        expect((await control.fetch(await controlRequest())).status).toBe(201);
        state.values.set('nonce:legacy', legacyCreatedAtMs);
        const nonceKeys = [...state.values.keys()].filter((key) => key.startsWith('nonce:'));
        const expiry = Math.max(...nonceKeys.map((key) => {
            const value = state.values.get(key) as number | { expiresAtMs: number };
            return typeof value === 'number' ? value + 5 * 60 * 1000 : value.expiresAtMs;
        }));
        vi.spyOn(Date, 'now').mockReturnValue(expiry);

        await control.alarm();

        expect([...state.values.keys()].filter((key) => key.startsWith('nonce:'))).toEqual([]);
        expect(state.values.get('job:v1')).toMatchObject({ state: 'UPLOAD_READY' });
    });

    it('continues expired control nonce cleanup in bounded 128-record batches', async () => {
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const state = createState();
        for (let index = 0; index < 129; index += 1) {
            state.values.set(`nonce:${String(index).padStart(3, '0')}`, { expiresAtMs: now });
        }
        const control = new LivepeerControl(state.state, createEnv());

        await control.alarm();
        expect([...state.values.keys()].filter((key) => key.startsWith('nonce:'))).toHaveLength(1);
        expect(state.alarms.at(-1)).toBe(now);

        await control.alarm();
        expect([...state.values.keys()].filter((key) => key.startsWith('nonce:'))).toEqual([]);
    });

    it('marks an upload expired only after the coordinator denies its valid lease heartbeat', async () => {
        const leaseId = '00000000-0000-4000-8000-000000000005';
        const fetchMock = backendFetch();
        vi.stubGlobal('fetch', fetchMock);
        const state = createState();
        const admissionFetch = vi.fn(async (request: Request) => {
            const path = new URL(request.url).pathname;
            if (path === '/internal/admission/heartbeat') {
                return Response.json({ error: 'admission_denied' }, { status: 409 });
            }
            return Response.json({
                accepted: true,
                lease_id: leaseId,
                expires_at_ms: '999999999999999',
                heartbeat_interval_ms: 5 * 60 * 1000,
            });
        });
        const env = createEnv({
            LIVEPEER_CONTROL: {
                idFromName: (name: string) => ({ toString: () => name }),
                get: () => ({ fetch: admissionFetch }),
            } as unknown as DurableObjectNamespace,
        });
        const control = new LivepeerControl(state.state, env);
        expect((await control.fetch(await controlRequest())).status).toBe(201);

        const heartbeat = await control.fetch(await uploadHeartbeatRequest(leaseId));

        expect(heartbeat.status).toBe(409);
        expect(await heartbeat.json()).toEqual({ error: 'admission_denied' });
        expect(state.values.get('job:v1')).toMatchObject({
            state: 'UPLOAD_EXPIRED',
            stateChangedAtMs: expect.any(Number),
            terminalAtMs: expect.any(Number),
        });
        expect(admissionFetch.mock.calls.map(([request]) => new URL(request.url).pathname))
            .toContain('/internal/admission/mark');
        expect(fetchMock.mock.calls.filter(([url]) => (
            String(url).includes('/asset/request-upload')
        ))).toHaveLength(1);
    });

    it('does not expire an upload when its heartbeat coordinator is unavailable', async () => {
        const leaseId = '00000000-0000-4000-8000-000000000006';
        vi.stubGlobal('fetch', backendFetch());
        const state = createState();
        const admissionFetch = vi.fn(async (request: Request) => (
            new URL(request.url).pathname === '/internal/admission/heartbeat'
                ? Response.json({ error: 'admission_closed' }, { status: 503 })
                : Response.json({
                    accepted: true,
                    lease_id: leaseId,
                    expires_at_ms: '999999999999999',
                    heartbeat_interval_ms: 5 * 60 * 1000,
                })
        ));
        const env = createEnv({
            LIVEPEER_CONTROL: {
                idFromName: (name: string) => ({ toString: () => name }),
                get: () => ({ fetch: admissionFetch }),
            } as unknown as DurableObjectNamespace,
        });
        const control = new LivepeerControl(state.state, env);
        expect((await control.fetch(await controlRequest())).status).toBe(201);

        const heartbeat = await control.fetch(await uploadHeartbeatRequest(leaseId));

        expect(heartbeat.status).toBe(503);
        expect(await heartbeat.json()).toEqual({ error: 'admission_closed' });
        expect(state.values.get('job:v1')).toMatchObject({ state: 'UPLOAD_READY' });
        const marks = admissionFetch.mock.calls.filter(([request]) => (
            new URL(request.url).pathname === '/internal/admission/mark'
        ));
        expect(marks).toHaveLength(1);
        expect(await marks[0][0].clone().json()).toMatchObject({ state: 'UPLOAD_READY' });
    });

    it('fails closed on invalid device proof and ambiguous provider create', async () => {
        const testState = createState();
        const control = new LivepeerControl(testState.state, createEnv());
        vi.stubGlobal('fetch', backendFetch());

        const invalidProof = await control.fetch(await controlRequest({ signature: new Uint8Array(64) }));
        expect(invalidProof.status).toBe(400);
        expect(await invalidProof.json()).toEqual({ error: 'invalid_control_request' });

        const wrongKeyFetch = backendFetch({ jobPublicKey: String(vectors.upload_intent.envelope.session_public_key) });
        vi.stubGlobal('fetch', wrongKeyFetch);
        const wrongKey = await control.fetch(await controlRequest());
        expect(wrongKey.status).toBe(409);
        expect(await wrongKey.json()).toEqual({ error: 'on_chain_job_mismatch' });
        expect(wrongKeyFetch.mock.calls.some(([url]) => String(url).includes('/asset/request-upload'))).toBe(false);

        const expiredKeyFetch = backendFetch({ uploadKeyExpiresAtMs: String(Date.now() - 1) });
        vi.stubGlobal('fetch', expiredKeyFetch);
        const expiredKey = await control.fetch(await controlRequest());
        expect(expiredKey.status).toBe(409);
        expect(await expiredKey.json()).toEqual({ error: 'on_chain_job_mismatch' });
        expect(expiredKeyFetch.mock.calls.some(([url]) => String(url).includes('/asset/request-upload'))).toBe(false);

        const failingFetch = backendFetch({ providerFailure: true });
        vi.stubGlobal('fetch', failingFetch);
        const failed = await control.fetch(await controlRequest());
        expect(failed.status).toBe(503);
        expect(await failed.json()).toEqual({ error: 'provider_create_ambiguous' });
        expect(testState.values.get('job:v1')).toMatchObject({
            state: 'CREATE_AMBIGUOUS',
            providerCreate: {
                attempts: 1,
                retryPolicy: 'RECONCILE_ONLY',
                lastErrorCode: 'provider_unavailable',
                ambiguousAtMs: expect.any(Number),
            },
        });

        const retryFetch = backendFetch();
        vi.stubGlobal('fetch', retryFetch);
        const retry = await control.fetch(await controlRequest());
        expect(retry.status).toBe(503);
        expect(await retry.json()).toEqual({ error: 'provider_create_ambiguous' });
        expect(testState.values.get('job:v1')).toMatchObject({
            providerCreate: { attempts: 1 },
        });
        expect(retryFetch.mock.calls.some(([url]) => String(url).includes('/asset/request-upload'))).toBe(false);
    });

    it('classifies a provider transport timeout without retrying create', async () => {
        const state = createState();
        const control = new LivepeerControl(state.state, createEnv());
        const fetchMock = backendFetch({ providerThrows: true });
        vi.stubGlobal('fetch', fetchMock);

        const response = await control.fetch(await controlRequest());

        expect(response.status).toBe(503);
        expect(state.values.get('job:v1')).toMatchObject({
            state: 'CREATE_AMBIGUOUS',
            providerCreate: {
                attempts: 1,
                retryPolicy: 'RECONCILE_ONLY',
                lastErrorCode: 'provider_unavailable',
            },
        });
        expect(fetchMock.mock.calls.filter(([url]) => (
            String(url).includes('/asset/request-upload')
        ))).toHaveLength(1);
    });

    it('fails closed when the provider does not bind the requested upload length', async () => {
        const testState = createState();
        const control = new LivepeerControl(testState.state, createEnv());
        vi.stubGlobal('fetch', backendFetch({ tusLengthMismatch: true }));

        const response = await control.fetch(await controlRequest());

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'provider_create_ambiguous' });
        expect(testState.values.get('job:v1')).toMatchObject({ state: 'CREATE_AMBIGUOUS' });
    });

    it('fails closed when a newly created TUS resource has a nonzero offset', async () => {
        const testState = createState();
        const control = new LivepeerControl(testState.state, createEnv());
        vi.stubGlobal('fetch', backendFetch({ tusOffset: '1' }));

        const response = await control.fetch(await controlRequest());

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'provider_create_ambiguous' });
        expect(testState.values.get('job:v1')).toMatchObject({ state: 'CREATE_AMBIGUOUS' });
    });

    it('rejects a TUS endpoint with a nondefault HTTPS port before POST', async () => {
        const testState = createState();
        const control = new LivepeerControl(testState.state, createEnv());
        const unsafeEndpoint = 'https://origin.livepeer.com:8443/api/asset/upload/tus';
        const fetchMock = backendFetch({ tusEndpoint: unsafeEndpoint });
        vi.stubGlobal('fetch', fetchMock);

        const response = await control.fetch(await controlRequest());
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'provider_create_ambiguous' });
        expect(fetchMock.mock.calls.some(([url]) => String(url) === unsafeEndpoint)).toBe(false);
    });

    it('persists one idempotent outbox record and rejects a conflict', async () => {
        const testState = createState();
        const control = new LivepeerControl(testState.state, createEnv());
        const outbox = {
            idempotencyKey: 'job-001:1:finalize',
            method: 'finalize_livepeer_publication',
            jobId: 'job-001',
            generation: 1,
            payloadSha256: 'b'.repeat(64),
        };
        const request = (payload = outbox) => new Request('https://object/internal/outbox', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        expect((await control.fetch(request())).status).toBe(201);
        const replay = await control.fetch(request());
        expect(replay.status).toBe(200);
        expect(await replay.json()).toMatchObject({ created: false, state: 'PENDING' });

        const conflict = await control.fetch(request({ ...outbox, payloadSha256: 'c'.repeat(64) }));
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toEqual({ error: 'outbox_conflict' });
    });

    it('rejects a new persistent record above the 256-record object ceiling', async () => {
        const testState = createState();
        for (let index = 0; index < 256; index += 1) {
            testState.values.set(`existing:${String(index).padStart(3, '0')}`, { index });
        }
        const control = new LivepeerControl(testState.state, createEnv());
        const payload = {
            idempotencyKey: 'job-001:1:finalize',
            method: 'finalize_livepeer_publication',
            jobId: 'job-001',
            generation: 1,
            payloadSha256: 'b'.repeat(64),
        };
        const request = () => new Request('https://object/internal/outbox', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        const response = await control.fetch(request());

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'durable_object_record_limit' });
        expect(testState.values.size).toBe(256);
        expect(testState.values.has('outbox:job-001:1:finalize')).toBe(false);

        testState.values.delete('existing:000');
        testState.values.set('outbox:job-001:1:finalize', {
            schema: 'youtick.livepeer-control-outbox.v1',
            state: 'PENDING',
            ...payload,
            createdAtMs: Date.now(),
        });
        const replay = await control.fetch(request());
        expect(replay.status).toBe(200);
        expect(await replay.json()).toMatchObject({ created: false, state: 'PENDING' });
        expect(testState.values.size).toBe(256);
    });

    it('rejects protocol drift and redacts sensitive log fields', async () => {
        const invalid = await forwardUploadIntent(await controlRequest({
            envelope: { body_sha256: '0'.repeat(64) },
        }), createEnv({
            LIVEPEER_CONTROL: {} as DurableObjectNamespace,
        }));
        expect(invalid.status).toBe(400);

        const log = formatLog('failed', {
            authorization: 'Bearer secret',
            url: 'https://tus.example/upload/1',
            signedTransaction: 'signed-bytes',
            nested: {
                privateKey: 'key',
                [`upload${'upload'.repeat(1_000)}Url`]: 'slow-pattern-secret',
                jobId: 'job-001',
            },
        });
        expect(log).not.toContain('Bearer secret');
        expect(log).not.toContain('tus.example');
        expect(log).not.toContain('signed-bytes');
        expect(log).not.toContain('"key"');
        expect(log).not.toContain('slow-pattern-secret');
        expect(log).toContain('job-001');
    });

    it('fails closed before Livepeer when the creator allowlist is empty', async () => {
        const admissionState = createState();
        let admission!: LivepeerControl;
        const namespace = {
            idFromName: (name: string) => ({ toString: () => name }),
            get: () => ({ fetch: (request: Request) => admission.fetch(request) }),
        } as unknown as DurableObjectNamespace;
        const env = createEnv({ LIVEPEER_CREATOR_ALLOWLIST: '', LIVEPEER_CONTROL: namespace });
        admission = new LivepeerControl(admissionState.state, env);
        const controlState = createState();
        const control = new LivepeerControl(controlState.state, env);
        const fetchMock = backendFetch();
        vi.stubGlobal('fetch', fetchMock);

        const response = await control.fetch(await controlRequest());

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'admission_closed' });
        expect(controlState.values.get('job:v1')).toMatchObject({
            state: 'AUTHORIZED',
            stateChangedAtMs: expect.any(Number),
        });
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/asset/request-upload'))).toBe(false);

        env.LIVEPEER_CREATOR_ALLOWLIST = 'creator.testnet';
        const retry = await control.fetch(await controlRequest());
        expect(retry.status).toBe(201);
        expect(controlState.values.get('job:v1')).toMatchObject({ state: 'UPLOAD_READY' });
    });

    it('lets the creator cancel an authorized job without a refund before provider creation', async () => {
        const admissionState = createState();
        let admission!: LivepeerControl;
        const namespace = {
            idFromName: (name: string) => ({ toString: () => name }),
            get: () => ({ fetch: (request: Request) => admission.fetch(request) }),
        } as unknown as DurableObjectNamespace;
        const env = createEnv({ LIVEPEER_CREATOR_ALLOWLIST: '', LIVEPEER_CONTROL: namespace });
        admission = new LivepeerControl(admissionState.state, env);
        const controlState = createState();
        const control = new LivepeerControl(controlState.state, env);
        const fetchMock = backendFetch();
        vi.stubGlobal('fetch', fetchMock);

        expect((await control.fetch(await controlRequest())).status).toBe(503);
        const cancellationRequest = await uploadCancellationRequest();
        const replayRequest = cancellationRequest.clone();
        const cancelled = await control.fetch(cancellationRequest);

        expect(cancelled.status).toBe(200);
        expect(await cancelled.json()).toEqual({
            cancelled: true,
            duplicate: false,
            refundable: false,
        });
        expect(controlState.values.get('job:v1')).toMatchObject({
            state: 'CANCELLED',
            terminalAtMs: expect.any(Number),
        });
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/asset/request-upload'))).toBe(false);

        const replay = await control.fetch(replayRequest);
        expect(replay.status).toBe(409);
        expect(await replay.json()).toEqual({ error: 'device_nonce_replayed' });

        const duplicate = await control.fetch(await uploadCancellationRequest());
        expect(duplicate.status).toBe(200);
        expect(await duplicate.json()).toEqual({
            cancelled: true,
            duplicate: true,
            refundable: false,
        });
    });

    it('rejects cancellation after provider creation has started', async () => {
        vi.stubGlobal('fetch', backendFetch());
        const state = createState();
        const control = new LivepeerControl(state.state, createEnv());

        expect((await control.fetch(await controlRequest())).status).toBe(201);
        const cancelled = await control.fetch(await uploadCancellationRequest());

        expect(cancelled.status).toBe(409);
        expect(await cancelled.json()).toEqual({ error: 'upload_cancel_denied' });
        expect(state.values.get('job:v1')).toMatchObject({ state: 'UPLOAD_READY' });
    });

    it('archives a terminal job in D1 without scheduling destructive cleanup', async () => {
        const admissionState = createState();
        let admission!: LivepeerControl;
        const namespace = {
            idFromName: (name: string) => ({ toString: () => name }),
            get: () => ({ fetch: (request: Request) => admission.fetch(request) }),
        } as unknown as DurableObjectNamespace;
        const archive = createArchiveDatabase();
        const env = createEnv({
            LIVEPEER_CREATOR_ALLOWLIST: '',
            LIVEPEER_CONTROL: namespace,
            UPLOAD_JOB_ARCHIVE_ENABLED: 'true',
            MARKET_READ_MODEL: archive.database,
        });
        admission = new LivepeerControl(admissionState.state, env);
        const state = createState();
        const control = new LivepeerControl(state.state, env);
        vi.stubGlobal('fetch', backendFetch());

        expect((await control.fetch(await controlRequest())).status).toBe(503);
        expect((await control.fetch(await uploadCancellationRequest())).status).toBe(200);
        await control.alarm();

        const job = state.values.get('job:v1') as {
            terminalAtMs: number;
            terminalArchive: Record<string, unknown>;
        };
        expect(job.terminalArchive).toMatchObject({
            status: 'COMMITTED',
            attempts: 1,
            archiveSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
            committedAtMs: expect.any(Number),
            cleanupEligibleAtMs: job.terminalAtMs + 14 * 24 * 60 * 60 * 1000,
        });
        expect(archive.rows.size).toBe(1);
        expect([...archive.rows.values()][0]).toMatchObject({
            terminal_state: 'CANCELLED',
            cleanup_eligible_at_ms: job.terminalAtMs + 14 * 24 * 60 * 60 * 1000,
        });
        expect(JSON.stringify([...archive.rows.values()][0])).not.toContain(requestPublicKey);
        expect(state.values.has('job:v1')).toBe(true);
        await control.alarm();
        expect(archive.rows.size).toBe(1);
        expect(state.values.has('job:v1')).toBe(true);
    });

    it('keeps a terminal job and backs off when the D1 archive is unavailable', async () => {
        const admissionState = createState();
        let admission!: LivepeerControl;
        const namespace = {
            idFromName: (name: string) => ({ toString: () => name }),
            get: () => ({ fetch: (request: Request) => admission.fetch(request) }),
        } as unknown as DurableObjectNamespace;
        const env = createEnv({
            LIVEPEER_CREATOR_ALLOWLIST: '',
            LIVEPEER_CONTROL: namespace,
            UPLOAD_JOB_ARCHIVE_ENABLED: 'true',
        });
        admission = new LivepeerControl(admissionState.state, env);
        const state = createState();
        const control = new LivepeerControl(state.state, env);
        vi.stubGlobal('fetch', backendFetch());

        expect((await control.fetch(await controlRequest())).status).toBe(503);
        expect((await control.fetch(await uploadCancellationRequest())).status).toBe(200);
        await control.alarm();

        const job = state.values.get('job:v1') as {
            terminalArchive: { status: string; attempts: number; nextAttemptAtMs: number };
        };
        expect(job.terminalArchive).toMatchObject({
            status: 'RETRY',
            attempts: 1,
            nextAttemptAtMs: expect.any(Number),
        });
        expect(state.alarms.at(-1)).toBe(job.terminalArchive.nextAttemptAtMs);
        expect(state.values.has('job:v1')).toBe(true);
    });

    it('rejects a non-allowlisted preflight without state or provider mutation', async () => {
        const admissionState = createState();
        let admission!: LivepeerControl;
        const namespace = {
            idFromName: (name: string) => ({ toString: () => name }),
            get: () => ({ fetch: (request: Request) => admission.fetch(request) }),
        } as unknown as DurableObjectNamespace;
        const env = createEnv({
            LIVEPEER_BRIDGE_ENABLED: 'true',
            LIVEPEER_CONTROL: namespace,
        });
        admission = new LivepeerControl(admissionState.state, env);
        const externalFetch = vi.fn();
        vi.stubGlobal('fetch', externalFetch);

        const response = await handler.fetch(uploadPreflightRequest({
            creator_id: 'soteri.testnet',
        }), env);

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'admission_closed' });
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
        expect(admissionState.values.size).toBe(0);
        expect(externalFetch).not.toHaveBeenCalled();
    });

    it('checks active capacity without reserving the preflight job', async () => {
        const admissionState = createState();
        let admission!: LivepeerControl;
        const namespace = {
            idFromName: (name: string) => ({ toString: () => name }),
            get: () => ({ fetch: (request: Request) => admission.fetch(request) }),
        } as unknown as DurableObjectNamespace;
        const env = createEnv({
            LIVEPEER_BRIDGE_ENABLED: 'true',
            LIVEPEER_CONTROL: namespace,
        });
        admission = new LivepeerControl(admissionState.state, env);

        const available = await handler.fetch(uploadPreflightRequest(), env);
        expect(available.status).toBe(200);
        expect(await available.json()).toEqual({ available: true });
        expect(admissionState.values.size).toBe(0);

        expect((await admission.fetch(admissionRequest('reserve', {
            jobId: 'job-active',
            generation: 1,
            creator: String(vectors.upload_intent.envelope.account_id),
            expectedSourceBytes: '1000',
        }))).status).toBe(200);
        const before = structuredClone(admissionState.values.get('admission:v1'));
        const blocked = await handler.fetch(uploadPreflightRequest({ job_id: 'job-next' }), env);

        expect(blocked.status).toBe(409);
        expect(await blocked.json()).toEqual({ error: 'admission_denied' });
        expect(admissionState.values.get('admission:v1')).toEqual(before);
    });

    it('does not create an admission record above the object ceiling', async () => {
        const admissionState = createState();
        for (let index = 0; index < 256; index += 1) {
            admissionState.values.set(`existing:${String(index).padStart(3, '0')}`, { index });
        }
        const admission = new LivepeerControl(admissionState.state, createEnv());

        const response = await admission.fetch(admissionRequest('reserve', {
            jobId: 'job-at-capacity',
            generation: 1,
            creator: String(vectors.upload_intent.envelope.account_id),
            expectedSourceBytes: '1000',
        }));

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'durable_object_record_limit' });
        expect(admissionState.values.size).toBe(256);
        expect(admissionState.values.has('admission:v1')).toBe(false);
    });

    it('rejects an active-job quota overflow before Livepeer', async () => {
        const admissionState = createState();
        let admission!: LivepeerControl;
        const namespace = {
            idFromName: (name: string) => ({ toString: () => name }),
            get: () => ({ fetch: (request: Request) => admission.fetch(request) }),
        } as unknown as DurableObjectNamespace;
        const env = createEnv({ LIVEPEER_CONTROL: namespace });
        admission = new LivepeerControl(admissionState.state, env);
        expect((await admission.fetch(admissionRequest('reserve', {
            jobId: 'other-job',
            generation: 1,
            creator: String(vectors.upload_intent.envelope.account_id),
            expectedSourceBytes: '1000',
        }))).status).toBe(200);
        const control = new LivepeerControl(createState().state, env);
        const fetchMock = backendFetch();
        vi.stubGlobal('fetch', fetchMock);

        const response = await control.fetch(await controlRequest());

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'admission_denied' });
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/asset/request-upload'))).toBe(false);
    });

    it('auto-closes admission after a provider 429 response', async () => {
        const admissionState = createState();
        let admission!: LivepeerControl;
        const namespace = {
            idFromName: (name: string) => ({ toString: () => name }),
            get: () => ({ fetch: (request: Request) => admission.fetch(request) }),
        } as unknown as DurableObjectNamespace;
        const env = createEnv({ LIVEPEER_CONTROL: namespace });
        admission = new LivepeerControl(admissionState.state, env);
        const jobState = createState();
        const control = new LivepeerControl(jobState.state, env);
        vi.stubGlobal('fetch', backendFetch({ providerStatus: 429 }));

        const response = await control.fetch(await controlRequest());

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'provider_create_ambiguous' });
        expect(jobState.values.get('job:v1')).toMatchObject({ state: 'CREATE_AMBIGUOUS' });
        expect(jobState.values.get('job:v1')).toMatchObject({
            providerCreate: {
                attempts: 1,
                retryPolicy: 'RECONCILE_ONLY',
                lastErrorCode: 'provider_admission_closed',
                ambiguousAtMs: expect.any(Number),
            },
        });
        expect(admissionState.values.get('admission:v1')).toMatchObject({
            status: 'AUTO_CLOSED',
            closure: { code: 'provider_budget_or_inventory' },
        });
    });

    it('opens the provider circuit only after two independent transient failures', async () => {
        const now = 1_785_589_310_000;
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const creators = ['creator-a.testnet', 'creator-b.testnet', 'creator-c.testnet'];
        const state = createState();
        const control = new LivepeerControl(state.state, createEnv({
            LIVEPEER_CREATOR_ALLOWLIST: creators.join(','),
        }));
        const reserve = (jobId: string, creator: string) => control.fetch(admissionRequest('reserve', {
            jobId,
            generation: 1,
            creator,
            expectedSourceBytes: '1000',
        }));
        const markUnavailable = (jobId: string) => control.fetch(admissionRequest('mark', {
            jobId,
            generation: 1,
            state: 'PROVIDER_UNAVAILABLE',
        }));

        expect((await reserve('job-provider-a', creators[0])).status).toBe(200);
        expect((await markUnavailable('job-provider-a')).status).toBe(200);
        expect((await markUnavailable('job-provider-a')).status).toBe(200);
        expect(state.values.get('admission:v1')).toMatchObject({
            status: 'OPEN',
            providerFailures: { count: 1 },
        });
        expect((await control.fetch(admissionRequest('preflight', {
            jobId: 'job-provider-b',
            generation: 1,
            creator: creators[1],
            expectedSourceBytes: '1000',
        }))).status).toBe(200);

        expect((await reserve('job-provider-b', creators[1])).status).toBe(200);
        expect((await markUnavailable('job-provider-b')).status).toBe(200);
        expect(state.values.get('admission:v1')).toMatchObject({
            status: 'AUTO_CLOSED',
            providerFailures: {
                count: 2,
                firstObservedAtMs: now,
                lastObservedAtMs: now,
            },
            closure: { code: 'provider_unavailable', observedAtMs: now },
        });
        const blocked = await control.fetch(admissionRequest('preflight', {
            jobId: 'job-provider-c',
            generation: 1,
            creator: creators[2],
            expectedSourceBytes: '1000',
        }));
        expect(blocked.status).toBe(503);
        expect(await blocked.json()).toEqual({ error: 'admission_closed' });

        const reopen = {
            idempotencyKey: 'provider-circuit-reopen-001',
            operatorId: 'operator-v1',
            closureCode: 'provider_unavailable',
            closureObservedAtMs: now,
            incidentId: 'provider-incident-001',
            evidenceSha256: 'a'.repeat(64),
            resolutionCode: 'INVENTORY_RECONCILED',
            jobId: null,
            generation: null,
        };
        const wrongResolution = await control.fetch(admissionRequest('reopen', {
            ...reopen,
            resolutionCode: 'BUDGET_WINDOW_ROLLED',
        }));
        expect(wrongResolution.status).toBe(400);
        expect(await wrongResolution.json()).toEqual({ error: 'invalid_admission_reopen' });
        const reopened = await control.fetch(admissionRequest('reopen', reopen));
        expect(reopened.status).toBe(201);
        expect(state.values.get('admission:v1')).toMatchObject({
            status: 'OPEN',
            reservations: {},
        });
        expect((await reserve('job-provider-c', creators[2])).status).toBe(200);
    });

    it('enforces one active job and two UTC-day attempts per creator', async () => {
        const creator = String(vectors.upload_intent.envelope.account_id);
        const control = new LivepeerControl(createState().state, createEnv());
        const reserve = (jobId: string) => control.fetch(admissionRequest('reserve', {
            jobId,
            generation: 1,
            creator,
            expectedSourceBytes: '1000',
        }));
        const release = (jobId: string, state = 'ONCHAIN_PUBLISHED') => control.fetch(admissionRequest('mark', {
            jobId,
            generation: 1,
            state,
        }));

        expect((await reserve('job-a')).status).toBe(200);
        const activeLimit = await reserve('job-b');
        expect(activeLimit.status).toBe(409);
        expect(await activeLimit.json()).toEqual({ error: 'admission_denied' });
        expect((await release('job-a', 'UPLOAD_EXPIRED')).status).toBe(200);
        expect((await release('job-a', 'UPLOAD_EXPIRED')).status).toBe(200);
        expect((await reserve('job-b')).status).toBe(200);
        expect((await release('job-b', 'PROVIDER_FAILED')).status).toBe(200);
        expect((await release('job-b', 'PROVIDER_FAILED')).status).toBe(200);
        const dailyLimit = await reserve('job-c');
        expect(dailyLimit.status).toBe(409);
        expect(await dailyLimit.json()).toEqual({ error: 'admission_denied' });
    });

    it('admits two different creators concurrently and rejects a third', async () => {
        let now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const creators = [
            String(vectors.upload_intent.envelope.account_id),
            'soteri.testnet',
            'terenti.testnet',
        ];
        const state = createState();
        const control = new LivepeerControl(state.state, createEnv({
            LIVEPEER_CREATOR_ALLOWLIST: creators.join(','),
        }));
        const reserve = (jobId: string, creator: string) => control.fetch(admissionRequest('reserve', {
            jobId,
            generation: 1,
            creator,
            expectedSourceBytes: '1000',
        }));

        expect((await reserve('job-concurrent-a', creators[0])).status).toBe(200);
        now += 5 * 60 * 1000;
        expect((await reserve('job-concurrent-b', creators[1])).status).toBe(200);
        const third = await reserve('job-concurrent-c', creators[2]);

        expect(third.status).toBe(409);
        expect(await third.json()).toEqual({ error: 'admission_denied' });
        expect(Object.keys((state.values.get('admission:v1') as {
            reservations: Record<string, unknown>;
        }).reservations)).toHaveLength(2);
        expect(state.alarms.at(-1)).toBe(1_785_600_000_000 + 30 * 60 * 1000);
    });

    it('renews a normal lease every five minutes and releases it after thirty', async () => {
        let now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const creator = String(vectors.upload_intent.envelope.account_id);
        const state = createState();
        const control = new LivepeerControl(state.state, createEnv());
        const reserved = await control.fetch(admissionRequest('reserve', {
            jobId: 'job-leased', generation: 1, creator, expectedSourceBytes: '1000',
        }));
        const lease = await reserved.json() as {
            lease_id: string;
            expires_at_ms: string;
            heartbeat_interval_ms: number;
        };
        expect(lease.lease_id).toMatch(/^[0-9a-f-]{36}$/);
        expect(lease.expires_at_ms).toBe(String(now + 30 * 60 * 1000));
        expect(lease.heartbeat_interval_ms).toBe(5 * 60 * 1000);

        now += 5 * 60 * 1000;
        const wrongLease = await control.fetch(admissionRequest('heartbeat', {
            jobId: 'job-leased', generation: 1,
            leaseId: '00000000-0000-4000-8000-000000000099',
        }));
        expect(wrongLease.status).toBe(409);
        const heartbeat = await control.fetch(admissionRequest('heartbeat', {
            jobId: 'job-leased', generation: 1, leaseId: lease.lease_id,
        }));
        expect(await heartbeat.json()).toMatchObject({
            lease_id: lease.lease_id,
            expires_at_ms: String(now + 30 * 60 * 1000),
            heartbeat_interval_ms: 5 * 60 * 1000,
        });
        expect(state.values.get('admission:v1')).toMatchObject({
            reservations: {
                'job-leased:1': {
                    state: 'UPLOADING',
                    expiresAtMs: now + 30 * 60 * 1000,
                    lastHeartbeatAtMs: now,
                },
            },
        });

        now += 29 * 60 * 1000;
        await control.alarm();
        expect((state.values.get('admission:v1') as { reservations: object }).reservations)
            .toHaveProperty('job-leased:1');
        now += 60 * 1000;
        await control.alarm();
        expect(state.values.get('admission:v1')).toMatchObject({ reservations: {} });
        expect((await control.fetch(admissionRequest('reserve', {
            jobId: 'job-after-lease', generation: 1, creator, expectedSourceBytes: '1000',
        }))).status).toBe(200);
    });

    it('does not let one allowlisted creator exhaust another creator daily quota', async () => {
        const firstCreator = String(vectors.upload_intent.envelope.account_id);
        const secondCreator = 'soteri.testnet';
        const control = new LivepeerControl(createState().state, createEnv({
            LIVEPEER_CREATOR_ALLOWLIST: `${firstCreator},${secondCreator}`,
        }));
        const reserve = (jobId: string, creator: string) => control.fetch(admissionRequest('reserve', {
            jobId,
            generation: 1,
            creator,
            expectedSourceBytes: '1000',
        }));
        const release = (jobId: string) => control.fetch(admissionRequest('mark', {
            jobId,
            generation: 1,
            state: 'ONCHAIN_PUBLISHED',
        }));

        expect((await reserve('job-first-a', firstCreator)).status).toBe(200);
        expect((await release('job-first-a')).status).toBe(200);
        expect((await reserve('job-first-b', firstCreator)).status).toBe(200);
        expect((await release('job-first-b')).status).toBe(200);

        const available = await control.fetch(admissionRequest('preflight', {
            jobId: 'job-second-a',
            generation: 1,
            creator: secondCreator,
            expectedSourceBytes: '1000',
        }));
        expect(available.status).toBe(200);
        expect(await available.json()).toEqual({ available: true });
        expect((await reserve('job-second-a', secondCreator)).status).toBe(200);
    });

    it('fails closed without budgets and enforces the monthly provider cap', async () => {
        const creator = String(vectors.upload_intent.envelope.account_id);
        let now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const missingReservation = new LivepeerControl(createState().state, createEnv({
            LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS: '',
        }));
        expect((await missingReservation.fetch(admissionRequest('reserve', {
            jobId: 'job-no-budget',
            generation: 1,
            creator,
            expectedSourceBytes: '1',
        }))).status).toBe(503);

        const missingMonthlyBudget = new LivepeerControl(createState().state, createEnv({
            LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS: '',
        }));
        expect((await missingMonthlyBudget.fetch(admissionRequest('reserve', {
            jobId: 'job-no-monthly-budget',
            generation: 1,
            creator,
            expectedSourceBytes: '1',
        }))).status).toBe(503);
        expect(await (await missingMonthlyBudget.fetch(new Request(
            'https://object/internal/admission/status',
        ))).json()).toMatchObject({
            monthly: { configuredBudgetUsdMicros: null },
        });

        const admissionState = createState();
        const admissionControl = new LivepeerControl(admissionState.state, createEnv({
            LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS: '100000000',
            LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS: '60000000',
        }));
        const reserve = (control: LivepeerControl, jobId: string, expectedSourceBytes: string) => (
            control.fetch(admissionRequest('reserve', {
                jobId,
                generation: 1,
                creator,
                expectedSourceBytes,
            }))
        );

        expect((await reserve(admissionControl, 'job-budget-a', '20000000000')).status).toBe(200);
        expect((await admissionControl.fetch(admissionRequest('mark', {
            jobId: 'job-budget-a', generation: 1, state: 'ONCHAIN_PUBLISHED',
        }))).status).toBe(200);
        expect((await reserve(admissionControl, 'job-budget-b', '1')).status).toBe(503);
        expect(admissionState.values.get('admission:v1')).toMatchObject({
            status: 'AUTO_CLOSED',
            monthly: { reservedBudgetUsdMicros: '60000000' },
            closure: { code: 'monthly_budget_exceeded' },
        });
        const status = await admissionControl.fetch(new Request('https://object/internal/admission/status'));
        expect(await status.json()).toMatchObject({
            limits: {
                globalConcurrency: 2,
                creatorConcurrency: 1,
                creatorDailyAttempts: 2,
                ambiguousTimeoutMs: 15 * 60 * 1000,
                leaseTtlMs: 30 * 60 * 1000,
                leaseHeartbeatMs: 5 * 60 * 1000,
            },
            monthly: {
                configuredBudgetUsdMicros: '100000000',
                configuredJobReservationUsdMicros: '60000000',
            },
        });

        now += 32 * 24 * 60 * 60 * 1000;
        expect((await reserve(admissionControl, 'job-budget-c', '1')).status).toBe(200);
        expect(admissionState.values.get('admission:v1')).toMatchObject({
            status: 'OPEN',
            monthly: { reservedBudgetUsdMicros: '60000000' },
        });

        expect((await admissionControl.fetch(admissionRequest('mark', {
            jobId: 'job-budget-c', generation: 1, state: 'ONCHAIN_PUBLISHED',
        }))).status).toBe(200);

        const ambiguousState = createState();
        const ambiguousControl = new LivepeerControl(ambiguousState.state, createEnv());
        expect((await reserve(ambiguousControl, 'job-ambiguous', '1000')).status).toBe(200);
        now += 5 * 60 * 1000;
        expect((await ambiguousControl.fetch(admissionRequest('mark', {
            jobId: 'job-ambiguous', generation: 1, state: 'CREATE_AMBIGUOUS',
        }))).status).toBe(200);
        expect(ambiguousState.alarms.at(-1)).toBe(now + 15 * 60 * 1000);
        const stillReserved = await reserve(ambiguousControl, 'job-after-ambiguous', '1000');
        expect(stillReserved.status).toBe(409);
        expect(await stillReserved.json()).toEqual({ error: 'admission_denied' });
        now += 10 * 60 * 1000;
        await ambiguousControl.alarm();
        expect(ambiguousState.values.get('admission:v1')).toMatchObject({ status: 'OPEN' });
        expect(ambiguousState.alarms.at(-1)).toBe(now + 5 * 60 * 1000);
        now += 5 * 60 * 1000;
        await ambiguousControl.alarm();
        expect(ambiguousState.values.get('admission:v1')).toMatchObject({
            status: 'OPEN',
            reservations: {},
        });
        expect((await reserve(ambiguousControl, 'job-after-ambiguous', '1000')).status).toBe(200);
    });

    it('reopens AUTO_CLOSED only with operator auth, matching closure evidence and idempotency', async () => {
        const now = 1_785_589_310_000;
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const creator = String(vectors.upload_intent.envelope.account_id);
        const admissionState = createState();
        let admission!: LivepeerControl;
        const admissionFetch = vi.fn((request: Request) => admission.fetch(request));
        const namespace = {
            idFromName: (name: string) => ({ toString: () => name }),
            get: () => ({ fetch: admissionFetch }),
        } as unknown as DurableObjectNamespace;
        const env = createEnv({
            LIVEPEER_BRIDGE_ENABLED: 'true',
            LIVEPEER_PAID_MEDIA_OPERATOR_ID: OPERATOR_ID,
            LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN: OPERATOR_TOKEN,
            LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN_PREVIOUS: OPERATOR_TOKEN_PREVIOUS,
            LIVEPEER_CONTROL: namespace,
        });
        admission = new LivepeerControl(admissionState.state, env);
        expect((await admission.fetch(admissionRequest('reserve', {
            jobId: 'job-reopen', generation: 1, creator, expectedSourceBytes: '1000',
        }))).status).toBe(200);
        expect((await admission.fetch(admissionRequest('mark', {
            jobId: 'job-reopen', generation: 1, state: 'CREATE_AMBIGUOUS',
        }))).status).toBe(200);
        expect((await admission.fetch(admissionRequest('mark', {
            jobId: 'job-reopen', generation: 1, state: 'AUTO_CLOSED',
        }))).status).toBe(200);
        const closure = (admissionState.values.get('admission:v1') as {
            closure: { code: string; observedAtMs: number };
        }).closure;
        const body = {
            idempotency_key: 'reopen-incident-001',
            network: 'testnet',
            contract_id: CONTRACT_ID,
            closure_code: closure.code,
            closure_observed_at_ms: String(closure.observedAtMs),
            incident_id: 'incident-001',
            evidence_sha256: 'a'.repeat(64),
            resolution_code: 'TUS_TERMINATION_CONFIRMED',
            job_id: 'job-reopen',
            generation: 1,
        };
        const request = (requestBody: Record<string, unknown>, token?: string) => new Request(
            'https://bridge.youtick.net/v1/operations/admission-reopen',
            {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                body: JSON.stringify(requestBody),
            },
        );

        const unauthorized = await handler.fetch(request(body), env);
        expect(unauthorized.status).toBe(403);
        expect(await unauthorized.json()).toEqual({ error: 'operator_unauthorized' });

        const stale = await handler.fetch(request({
            ...body,
            closure_observed_at_ms: String(closure.observedAtMs - 1),
        }, OPERATOR_TOKEN), env);
        expect(stale.status).toBe(403);
        expect(await stale.json()).toEqual({ error: 'admission_reopen_denied' });

        const reopened = await handler.fetch(request(body, OPERATOR_TOKEN_PREVIOUS), env);
        expect(reopened.status).toBe(201);
        expect(await reopened.json()).toEqual({ accepted: true, reopened: true, replayed: false });
        expect(admissionState.values.get('admission:v1')).toMatchObject({
            status: 'OPEN',
            reservations: {},
        });
        expect(admissionState.values.get('admission:reopen:reopen-incident-001')).toMatchObject({
            schema: 'youtick.livepeer-admission-reopen.v1',
            operatorId: OPERATOR_ID,
            incidentId: 'incident-001',
            evidenceSha256: 'a'.repeat(64),
        });
        expect(admissionState.alarms.at(-1)).toBe(now + 90 * 24 * 60 * 60 * 1000);

        const replay = await handler.fetch(request(body, OPERATOR_TOKEN), env);
        expect(replay.status).toBe(200);
        expect(await replay.json()).toEqual({ accepted: true, reopened: true, replayed: true });
        const conflict = await handler.fetch(request({
            ...body,
            evidence_sha256: 'b'.repeat(64),
        }, OPERATOR_TOKEN), env);
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toEqual({ error: 'admission_reopen_conflict' });

        vi.spyOn(Date, 'now').mockReturnValue(now + 90 * 24 * 60 * 60 * 1000);
        await admission.alarm();
        expect(admissionState.values.has('admission:reopen:reopen-incident-001')).toBe(false);
        expect(admissionState.values.has('admission:v1')).toBe(true);
    });

    it('exposes read-only admission status only to the operator', async () => {
        const admissionState = createState();
        const now = Date.now();
        admissionState.values.set('admission:v1', {
            schema: 'youtick.livepeer-admission.v2',
            status: 'AUTO_CLOSED',
            reservations: {
                'job-status:1': {
                    creator: 'creator.testnet',
                    expectedSourceBytes: '1000',
                    estimatedProviderCostUsdMicros: '100000000',
                    state: 'CREATE_AMBIGUOUS',
                    createdAtMs: now - 1000,
                    ambiguousAtMs: now,
                },
            },
            daily: {
                utcDay: '2026-08-07',
                globalAttempts: 1,
                creatorAttempts: { 'creator.testnet': 1 },
            },
            monthly: { utcMonth: '2026-08', reservedBudgetUsdMicros: '100000000' },
            closure: { code: 'create_ambiguous_timeout', observedAtMs: now },
        });
        let admission!: LivepeerControl;
        const env = createEnv({
            LIVEPEER_BRIDGE_ENABLED: 'true',
            LIVEPEER_PAID_MEDIA_OPERATOR_ID: OPERATOR_ID,
            LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN: OPERATOR_TOKEN,
            LIVEPEER_CONTROL: {
                idFromName: (name: string) => ({ toString: () => name }),
                get: () => ({ fetch: (request: Request) => admission.fetch(request) }),
            } as unknown as DurableObjectNamespace,
        });
        admission = new LivepeerControl(admissionState.state, env);
        const request = (token?: string) => new Request(
            'https://bridge.youtick.net/v1/operations/admission-status',
            { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
        );

        const unauthorized = await handler.fetch(request(), env);
        expect(unauthorized.status).toBe(403);
        expect(await unauthorized.json()).toEqual({ error: 'operator_unauthorized' });

        const response = await handler.fetch(request(OPERATOR_TOKEN), env);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({
            schema: 'youtick.livepeer-admission-status.v1',
            status: 'AUTO_CLOSED',
            limits: {
                globalConcurrency: 2,
                creatorConcurrency: 1,
                creatorDailyAttempts: 2,
                ambiguousTimeoutMs: 15 * 60 * 1000,
                leaseTtlMs: 30 * 60 * 1000,
                leaseHeartbeatMs: 5 * 60 * 1000,
                providerFailureLimit: 2,
                providerFailureWindowMs: 60 * 1000,
            },
            closure: { code: 'create_ambiguous_timeout', observedAtMs: now },
            providerFailures: null,
            reservations: {
                'job-status:1': {
                    creator: 'creator.testnet',
                    expectedSourceBytes: '1000',
                    estimatedProviderCostUsdMicros: '100000000',
                    state: 'CREATE_AMBIGUOUS',
                    createdAtMs: now - 1000,
                    ambiguousAtMs: now,
                },
            },
            daily: {
                utcDay: '2026-08-07',
                globalAttempts: 1,
                creatorAttempts: { 'creator.testnet': 1 },
            },
            monthly: {
                current: { utcMonth: '2026-08', reservedBudgetUsdMicros: '100000000' },
                configuredBudgetUsdMicros: '1000000000',
                configuredJobReservationUsdMicros: '100000000',
            },
        });
        expect(JSON.stringify(body)).not.toContain(OPERATOR_TOKEN);
    });

    it('keeps operator-outbox status read-only while runtime flags are disabled', async () => {
        const operatorState = createState();
        const now = Date.now();
        operatorState.values.set('outbox:archive-status-1', {
            schema: 'youtick.livepeer-operator-outbox.v1',
            state: 'CONFIRMED',
            method: 'finalize_livepeer_publication',
            idempotencyKey: 'archive-status-1',
            payloadSha256: 'a'.repeat(64),
            createdAtMs: now - 2_000,
            txHash: 'sensitive-test-transaction',
            confirmedAtMs: now - 1_000,
            archive: {
                status: 'PENDING',
                attempts: 0,
                createdAtMs: now - 1_000,
                nextAttemptAtMs: now - 1_000,
            },
        });
        let control!: LivepeerControl;
        const env = createEnv({
            LIVEPEER_BRIDGE_ENABLED: 'false',
            OPERATOR_OUTBOX_ARCHIVE_ENABLED: 'false',
            LIVEPEER_PAID_MEDIA_OPERATOR_ID: OPERATOR_ID,
            LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN: OPERATOR_TOKEN,
            NEAR_OPERATOR_ACCOUNT_ID: OPERATOR_ID,
            NEAR_OPERATOR_PRIVATE_KEY: OPERATOR_PRIVATE_KEY,
            NEAR_OPERATOR_KEY_EPOCH: '1',
            LIVEPEER_CONTROL: {
                idFromName: (name: string) => ({ toString: () => name }),
                get: () => ({ fetch: (request: Request) => control.fetch(request) }),
            } as unknown as DurableObjectNamespace,
        });
        control = new LivepeerControl(operatorState.state, env);
        const request = (token?: string) => new Request(
            'https://bridge.youtick.net/v1/operations/operator-outbox-status',
            { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
        );
        const before = structuredClone([...operatorState.values]);

        delete env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN;
        const unconfigured = await handler.fetch(request(OPERATOR_TOKEN), env);
        expect(unconfigured.status).toBe(503);
        expect(await unconfigured.json()).toEqual({ error: 'runtime_not_configured' });
        env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN = OPERATOR_TOKEN;

        const unauthorized = await handler.fetch(request(), env);
        expect(unauthorized.status).toBe(403);
        expect(await unauthorized.json()).toEqual({ error: 'operator_unauthorized' });

        const response = await handler.fetch(request(OPERATOR_TOKEN), env);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({
            schema: 'youtick.livepeer-operator-outbox-status.v1',
            totalRecords: 1,
            invalidRecords: 0,
            confirmedRecords: 1,
            pendingRecords: 1,
            retryRecords: 0,
            committedRecords: 0,
            uncommittedRecords: 1,
            eligibleRecords: 1,
            scanActive: false,
        });
        expect([...operatorState.values]).toEqual(before);
        expect(operatorState.alarms).toEqual([]);
        expect(JSON.stringify(body)).not.toContain(OPERATOR_TOKEN);
        expect(JSON.stringify(body)).not.toContain(env.NEAR_OPERATOR_PRIVATE_KEY);
        expect(JSON.stringify(body)).not.toContain('sensitive-test-transaction');
    });

    it('does not archive a preexisting operator record without an explicit scan marker', async () => {
        const operatorState = createState();
        const now = Date.now();
        const record = {
            schema: 'youtick.livepeer-operator-outbox.v1',
            state: 'CONFIRMED',
            method: 'finalize_livepeer_publication',
            idempotencyKey: 'archive-marker-required-1',
            payloadSha256: 'a'.repeat(64),
            createdAtMs: now - 2_000,
            confirmedAtMs: now - 1_000,
            archive: {
                status: 'PENDING',
                attempts: 0,
                createdAtMs: now - 1_000,
                nextAttemptAtMs: now - 1_000,
            },
        };
        operatorState.values.set(`outbox:${record.idempotencyKey}`, record);
        let d1Calls = 0;
        const control = new LivepeerControl(operatorState.state, createEnv({
            OPERATOR_OUTBOX_ARCHIVE_ENABLED: 'true',
            MARKET_READ_MODEL: {
                prepare: () => {
                    d1Calls += 1;
                    throw new Error('unexpected_d1_access');
                },
            } as unknown as D1Database,
        }));

        await control.alarm();

        expect(operatorState.values.get(`outbox:${record.idempotencyKey}`)).toEqual(record);
        expect(operatorState.values.has('operator:archive-scan:v1')).toBe(false);
        expect(operatorState.alarms).toEqual([]);
        expect(d1Calls).toBe(0);
    });

    it('starts an operator-outbox archive scan only for exactly one eligible record', async () => {
        const operatorState = createState();
        const now = Date.now();
        const record = (idempotencyKey: string) => ({
            schema: 'youtick.livepeer-operator-outbox.v1',
            state: 'CONFIRMED',
            method: 'finalize_livepeer_publication',
            idempotencyKey,
            payloadSha256: 'a'.repeat(64),
            createdAtMs: now - 2_000,
            confirmedAtMs: now - 1_000,
            archive: {
                status: 'PENDING',
                attempts: 0,
                createdAtMs: now - 1_000,
                nextAttemptAtMs: now - 1_000,
            },
        });
        let d1Calls = 0;
        let control!: LivepeerControl;
        const env = createEnv({
            LIVEPEER_BRIDGE_ENABLED: 'false',
            OPERATOR_OUTBOX_ARCHIVE_ENABLED: 'false',
            LIVEPEER_PAID_MEDIA_OPERATOR_ID: OPERATOR_ID,
            LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN: OPERATOR_TOKEN,
            NEAR_OPERATOR_ACCOUNT_ID: OPERATOR_ID,
            NEAR_OPERATOR_PRIVATE_KEY: OPERATOR_PRIVATE_KEY,
            NEAR_OPERATOR_KEY_EPOCH: '1',
            MARKET_READ_MODEL: {
                prepare: () => {
                    d1Calls += 1;
                    throw new Error('unexpected_d1_access');
                },
            } as unknown as D1Database,
            LIVEPEER_CONTROL: {
                idFromName: (name: string) => ({ toString: () => name }),
                get: () => ({ fetch: (request: Request) => control.fetch(request) }),
            } as unknown as DurableObjectNamespace,
        });
        control = new LivepeerControl(operatorState.state, env);
        const request = () => new Request(
            'https://bridge.youtick.net/v1/operations/operator-outbox-archive-scan',
            { method: 'POST', headers: { Authorization: `Bearer ${OPERATOR_TOKEN}` } },
        );

        const disabled = await handler.fetch(request(), env);
        expect(disabled.status).toBe(503);
        expect(await disabled.json()).toEqual({ error: 'runtime_not_configured' });
        expect(operatorState.alarms).toEqual([]);

        env.OPERATOR_OUTBOX_ARCHIVE_ENABLED = 'true';
        const empty = await handler.fetch(request(), env);
        expect(empty.status).toBe(409);
        expect(await empty.json()).toEqual({ error: 'operator_archive_eligible_count_invalid' });
        expect(operatorState.alarms).toEqual([]);

        operatorState.values.set('outbox:archive-scan-1', record('archive-scan-1'));
        operatorState.values.set('outbox:archive-scan-2', record('archive-scan-2'));
        const ambiguous = await handler.fetch(request(), env);
        expect(ambiguous.status).toBe(409);
        expect(await ambiguous.json()).toEqual({ error: 'operator_archive_eligible_count_invalid' });
        expect(operatorState.alarms).toEqual([]);

        operatorState.values.delete('outbox:archive-scan-2');
        const accepted = await handler.fetch(request(), env);
        expect(accepted.status).toBe(202);
        expect(await accepted.json()).toEqual({ accepted: true, eligibleRecords: 1 });
        expect(operatorState.values.get('operator:archive-scan:v1')).toEqual({});
        expect(operatorState.alarms).toHaveLength(1);
        expect(d1Calls).toBe(0);

        const duplicate = await handler.fetch(request(), env);
        expect(duplicate.status).toBe(409);
        expect(await duplicate.json()).toEqual({ error: 'operator_archive_scan_active' });
        expect(operatorState.alarms).toHaveLength(1);
        expect(d1Calls).toBe(0);

        await control.alarm();
        expect(d1Calls).toBe(1);
        expect(operatorState.values.get('outbox:archive-scan-1')).toMatchObject({
            archive: { status: 'RETRY', attempts: 1 },
        });
    });
});
