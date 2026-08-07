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
const OPERATOR_ID = 'paid-media-operator.testnet';
const OPERATOR_TOKEN = 'test-paid-media-operator-token-32-bytes';
const OPERATOR_TOKEN_PREVIOUS = 'previous-paid-media-operator-token-32-bytes';
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
    const storage = {
        get,
        put,
        setAlarm: async (at: number | Date) => alarms.push(Number(at)),
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
        alarms,
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
        LIVEPEER_API_TOKEN_NAME: 'paid-media-test',
        LIVEPEER_CREATOR_ALLOWLIST: String(vectors.upload_intent.envelope.account_id),
        LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS: '200000000',
        LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS: '100000000',
        LIVEPEER_CONTROL: {
            idFromName: (name: string) => ({ toString: () => name }),
            get: () => ({ fetch: async () => Response.json({ accepted: true }) }),
        } as unknown as DurableObjectNamespace,
        ...overrides,
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
    providerStatus?: number;
    jobPublicKey?: string;
    uploadKeyExpiresAtMs?: string;
    tusLengthMismatch?: boolean;
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
                    'Upload-Offset': '0',
                },
            });
        }
        throw new Error(`unexpected_fetch:${url}`);
    });
}

function admissionRequest(
    path: 'reserve' | 'mark' | 'reopen',
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

        const reopen = await handler.fetch(new Request(
            'https://bridge.youtick.net/v1/operations/admission-reopen',
            { method: 'POST', body: '{}' },
        ), createEnv());
        expect(reopen.status).toBe(503);
        expect(await reopen.json()).toEqual({ error: 'control_plane_disabled' });

        const preflight = await handler.fetch(new Request(
            'https://bridge.youtick.net/v1/upload-intents',
            { method: 'OPTIONS', headers: { Origin: ORIGIN } },
        ), createEnv());
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
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
            fee_usd_micro: '300000',
            near_usd_micro: '5000000',
            fee_near_yocto: '60000000000000000000000',
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
        vi.spyOn(Date, 'now').mockReturnValue(1_785_589_310_000);
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
            windowStartedAtMs: 1_785_589_310_000,
            count: 5,
        });
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
        expect(testState.values.get('job:v1')).toMatchObject({ state: 'CREATE_PENDING' });
        expect(testState.values.get('job:v1')).toMatchObject({ apiTokenName: 'paid-media-test' });

        const second = await control.fetch(await controlRequest());
        expect(second.status).toBe(409);
        expect(await second.json()).toEqual({ error: 'provider_create_pending' });
        releaseFetch();

        const created = await first;
        expect(created.status).toBe(201);
        expect(await created.json()).toMatchObject({
            schema: 'youtick.livepeer-upload-intent.v1',
            chunk_bytes: 32 * 1024 * 1024,
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
        const admissionFetch = vi.fn(async (_request: Request) => Response.json({ accepted: true }));
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

    it('fails closed before Livepeer when the creator allowlist is empty', async () => {
        const admissionState = createState();
        let admission!: LivepeerControl;
        const namespace = {
            idFromName: (name: string) => ({ toString: () => name }),
            get: () => ({ fetch: (request: Request) => admission.fetch(request) }),
        } as unknown as DurableObjectNamespace;
        const env = createEnv({ LIVEPEER_CREATOR_ALLOWLIST: '', LIVEPEER_CONTROL: namespace });
        admission = new LivepeerControl(admissionState.state, env);
        const control = new LivepeerControl(createState().state, env);
        const fetchMock = backendFetch();
        vi.stubGlobal('fetch', fetchMock);

        const response = await control.fetch(await controlRequest());

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'admission_closed' });
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/asset/request-upload'))).toBe(false);
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
        expect(admissionState.values.get('admission:v1')).toMatchObject({
            status: 'AUTO_CLOSED',
            closure: { code: 'provider_budget_or_inventory' },
        });
    });

    it('enforces one active job and two UTC-day attempts in the admission object', async () => {
        const creator = String(vectors.upload_intent.envelope.account_id);
        const control = new LivepeerControl(createState().state, createEnv());
        const reserve = (jobId: string) => control.fetch(admissionRequest('reserve', {
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

        expect((await reserve('job-a')).status).toBe(200);
        const activeLimit = await reserve('job-b');
        expect(activeLimit.status).toBe(409);
        expect(await activeLimit.json()).toEqual({ error: 'admission_denied' });
        expect((await release('job-a')).status).toBe(200);
        expect((await release('job-a')).status).toBe(200);
        expect((await reserve('job-b')).status).toBe(200);
        expect((await release('job-b')).status).toBe(200);
        const dailyLimit = await reserve('job-c');
        expect(dailyLimit.status).toBe(409);
        expect(await dailyLimit.json()).toEqual({ error: 'admission_denied' });
    });

    it('fails closed without a production budget and auto-closes on USD budget overflow', async () => {
        const creator = String(vectors.upload_intent.envelope.account_id);
        let now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const budgetState = createState();
        const missingBudget = new LivepeerControl(createState().state, createEnv({
            LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS: '',
            LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS: '',
        }));
        expect((await missingBudget.fetch(admissionRequest('reserve', {
            jobId: 'job-no-budget',
            generation: 1,
            creator,
            expectedSourceBytes: '1',
        }))).status).toBe(503);

        const budgetControl = new LivepeerControl(budgetState.state, createEnv({
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

        expect((await reserve(budgetControl, 'job-budget-a', '20000000000')).status).toBe(200);
        expect((await budgetControl.fetch(admissionRequest('mark', {
            jobId: 'job-budget-a', generation: 1, state: 'ONCHAIN_PUBLISHED',
        }))).status).toBe(200);
        const overflow = await reserve(budgetControl, 'job-budget-b', '1');
        expect(overflow.status).toBe(503);
        expect(await overflow.json()).toEqual({ error: 'admission_closed' });
        expect(budgetState.values.get('admission:v1')).toMatchObject({
            status: 'AUTO_CLOSED',
            closure: { code: 'monthly_budget_exceeded' },
        });

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
            status: 'AUTO_CLOSED',
            closure: { code: 'create_ambiguous_timeout' },
        });
    });

    it('reopens AUTO_CLOSED only with operator auth, matching closure evidence and idempotency', async () => {
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

        const replay = await handler.fetch(request(body, OPERATOR_TOKEN), env);
        expect(replay.status).toBe(200);
        expect(await replay.json()).toEqual({ accepted: true, reopened: true, replayed: true });
        const conflict = await handler.fetch(request({
            ...body,
            evidence_sha256: 'b'.repeat(64),
        }, OPERATOR_TOKEN), env);
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toEqual({ error: 'admission_reopen_conflict' });
    });
});
