import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
const BLOCK_HASH = '11111111111111111111111111111111';
const TUS_ENDPOINT = 'https://origin.livepeer.com/api/asset/upload/tus?token=secret';
const TUS_UPLOAD_URL = 'https://origin.livepeer.com/api/asset/upload/tus/upload-123';
let requestKey: CryptoKeyPair;
let requestPublicKey: string;
let nonceCounter = 0;

type TestState = {
    state: DurableObjectState;
    values: Map<string, unknown>;
};

function createState(): TestState {
    const values = new Map<string, unknown>();
    let transactionTail = Promise.resolve();
    const get = async <T>(key: string) => structuredClone(values.get(key)) as T | undefined;
    const put = async (key: string, value: unknown) => {
        values.set(key, structuredClone(value));
    };
    const storage = {
        get,
        put,
        transaction: async <T>(callback: (transaction: {
            get: typeof get;
            put: typeof put;
        }) => Promise<T>) => {
            const run = transactionTail.then(() => callback({ get, put }));
            transactionTail = run.then(() => undefined, () => undefined);
            return run;
        },
    };
    return {
        state: { storage } as unknown as DurableObjectState,
        values,
    };
}

function createEnv(overrides?: Partial<Env>): Env {
    return {
        LIVEPEER_BRIDGE_ENABLED: 'false',
        ALLOWED_ORIGINS: ORIGIN,
        NEAR_NETWORK: 'testnet',
        NEAR_RPC_URL: RPC_URL,
        MARKET_CONTRACT_ID: CONTRACT_ID,
        LIVEPEER_API_KEY: API_KEY,
        ...overrides,
    };
}

async function controlRequest(overrides?: {
    body?: Record<string, unknown>;
    envelope?: Record<string, unknown>;
    signature?: Uint8Array;
}): Promise<Request> {
    const input = structuredClone(vectors.upload_intent) as {
        body: Record<string, unknown>;
        envelope: Record<string, unknown>;
    };
    const body = { ...input.body, ...overrides?.body };
    const bodyHash = await sha256Hex(canonicalJson(body));
    nonceCounter += 1;
    const envelope: Record<string, unknown> = {
        ...input.envelope,
        session_public_key: requestPublicKey,
        device_nonce: base64UrlEncode(new Uint8Array(32).fill(nonceCounter)),
        expires_at_ms: String(Date.now() + 5 * 60 * 1000),
        body_sha256: bodyHash,
        ...overrides?.envelope,
    };
    const signature = overrides?.signature ?? new Uint8Array(await crypto.subtle.sign(
        'Ed25519',
        requestKey.privateKey,
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

function rpcResponse(): Response {
    const body = vectors.upload_intent.body;
    const job = {
        job_id: body.job_id,
        creator_id: vectors.upload_intent.envelope.account_id,
        profile_id: body.profile_id,
        profile_config_sha256: body.profile_config_sha256,
        expected_source_bytes: body.expected_source_bytes,
        generation: body.generation,
        status: 'Authorized',
    };
    return Response.json({
        result: {
            block_hash: BLOCK_HASH,
            result: Array.from(new TextEncoder().encode(JSON.stringify(job))),
        },
    });
}

function accessKeyResponse(methodNames = ['create_paid_job']): Response {
    return Response.json({
        result: {
            block_hash: BLOCK_HASH,
            permission: {
                FunctionCall: {
                    allowance: '100000000000000000000000',
                    receiver_id: CONTRACT_ID,
                    method_names: methodNames,
                },
            },
        },
    });
}

function providerResponse(): Response {
    return Response.json({
        tusEndpoint: TUS_ENDPOINT,
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
    unauthorizedKey?: boolean;
    tusLengthMismatch?: boolean;
    methodNames?: string[];
}) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === RPC_URL) {
            const rpcBody = JSON.parse(String(init?.body)) as {
                params: { request_type: string; finality?: string; block_id?: string };
            };
            if (rpcBody.params.request_type === 'view_access_key') {
                expect(rpcBody.params.block_id).toBe(BLOCK_HASH);
                if (options?.unauthorizedKey) {
                    return Response.json({ result: { permission: 'FullAccess' } });
                }
                return accessKeyResponse(options?.methodNames);
            }
            expect(rpcBody.params.finality).toBe('final');
            return rpcResponse();
        }
        if (url === 'https://livepeer.studio/api/asset/request-upload') {
            await options?.providerGate;
            if (options?.providerFailure) return Response.json({ error: 'failed' }, { status: 503 });
            return providerResponse();
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
                    'Upload-Offset': '0',
                },
            });
        }
        throw new Error(`unexpected_fetch:${url}`);
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
            stage: 'DISABLED',
            publicControlImplemented: true,
            providerMutationEnabled: false,
            controlPlaneReady: false,
        });

        const response = await handler.fetch(
            await controlRequest(),
            createEnv(),
        );
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'control_plane_disabled' });

        const preflight = await handler.fetch(new Request(
            'https://bridge.youtick.net/v1/upload-intents',
            { method: 'OPTIONS', headers: { Origin: ORIGIN } },
        ), createEnv());
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
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
        expect(testState.values.get('job:v1')).toMatchObject({ state: 'CREATE_PENDING' });

        const second = await control.fetch(await controlRequest());
        expect(second.status).toBe(409);
        expect(await second.json()).toEqual({ error: 'provider_create_pending' });
        releaseFetch();

        const created = await first;
        expect(created.status).toBe(201);
        expect(await created.json()).toMatchObject({
            schema: 'youtick.livepeer-upload-intent.v1',
            chunk_bytes: 8 * 1024 * 1024,
            created: true,
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
        const firstInstance = new LivepeerControl(testState.state, createEnv());
        const request = await controlRequest();
        const repeatedNonce = request.clone();
        const created = await firstInstance.fetch(request);
        expect(created.status).toBe(201);

        const restartedInstance = new LivepeerControl(testState.state, createEnv());
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
    });

    it('fails closed on invalid device proof and ambiguous provider create', async () => {
        const testState = createState();
        const control = new LivepeerControl(testState.state, createEnv());
        vi.stubGlobal('fetch', backendFetch());

        const invalidProof = await control.fetch(await controlRequest({ signature: new Uint8Array(64) }));
        expect(invalidProof.status).toBe(400);
        expect(await invalidProof.json()).toEqual({ error: 'invalid_control_request' });

        vi.stubGlobal('fetch', backendFetch({ unauthorizedKey: true }));
        const unauthorizedKey = await control.fetch(await controlRequest());
        expect(unauthorizedKey.status).toBe(403);
        expect(await unauthorizedKey.json()).toEqual({ error: 'device_key_not_authorized' });

        vi.stubGlobal('fetch', backendFetch({ methodNames: ['create_paid_job', 'withdraw'] }));
        const overbroadKey = await control.fetch(await controlRequest());
        expect(overbroadKey.status).toBe(403);
        expect(await overbroadKey.json()).toEqual({ error: 'device_key_not_authorized' });

        const failingFetch = backendFetch({ providerFailure: true });
        vi.stubGlobal('fetch', failingFetch);
        const failed = await control.fetch(await controlRequest());
        expect(failed.status).toBe(503);
        expect(await failed.json()).toEqual({ error: 'provider_create_ambiguous' });

        vi.stubGlobal('fetch', backendFetch());
        const retry = await control.fetch(await controlRequest());
        expect(retry.status).toBe(503);
        expect(await retry.json()).toEqual({ error: 'provider_create_ambiguous' });
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
            nested: { privateKey: 'key', jobId: 'job-001' },
        });
        expect(log).not.toContain('Bearer secret');
        expect(log).not.toContain('tus.example');
        expect(log).not.toContain('signed-bytes');
        expect(log).not.toContain('"key"');
        expect(log).toContain('job-001');
    });
});
