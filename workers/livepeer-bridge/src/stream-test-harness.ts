// Test-only harness for Cloudflare Stream flows: a Durable Object state double, a Market V2
// Stream-only env, signed control requests, and a mock Stream backend (REST, tus, delivery)
// that replays the redacted fixtures and enforces the spike's per-surface status matrix.
import { KeyPair } from 'near-api-js';
import vectors from '../../../protocol/paid-media-livepeer-v1/golden-vectors.json';
import { STREAM_PROFILE_HASH } from './media-provider';
import type { Env } from './index';
import { STREAM_TEST_VALUES as V, streamJson, streamText } from './stream-test-fixtures';

export const RPC_URL = 'https://rpc.testnet.near.org';
export const CONTRACT_ID = 'paid-media-livepeer-v1.testnet';
export const CREATOR = 'creator.testnet';
export const ORIGIN = 'https://app.youtick.net';
export const API = `https://api.cloudflare.com/client/v4/accounts/${V.ACCOUNT_ID}/stream`;
export const TUS_URL = `https://upload.cloudflarestream.com/tus/${V.UID}?tusv2=true`;
export const DELIVERY_HOST = `customer-${V.CUSTOMER_CODE}.cloudflarestream.com`;
export const STREAM_API_TOKEN = 'test-stream-api-token-0001';
export const STREAM_WEBHOOK_SECRET = 'test-stream-webhook-secret';
export const STREAM_KEY_ID = 'feedfacefeedfacefeedfacefeedface';
export const OPERATOR_TOKEN = 'test-paid-media-operator-token-32-bytes';
const OPERATOR_PRIVATE_KEY = KeyPair.fromRandom('ed25519').toString();
const BLOCK_HASH = '11111111111111111111111111111111';

export type StreamKeys = {
    privatePem: string;
    publicPem: string;
    publicKey: CryptoKey;
    requestKey: CryptoKeyPair;
    requestPublicKey: string;
};

export async function createStreamKeys(): Promise<StreamKeys> {
    const pair = await crypto.subtle.generateKey(
        { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['sign', 'verify'],
    ) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer);
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey) as ArrayBuffer);
    const requestKey = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair;
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', requestKey.publicKey) as ArrayBuffer);
    return {
        privatePem: `-----BEGIN PRIVATE KEY-----\n${base64(pkcs8)}\n-----END PRIVATE KEY-----\n`,
        publicPem: `-----BEGIN PUBLIC KEY-----\n${base64(spki)}\n-----END PUBLIC KEY-----\n`,
        publicKey: pair.publicKey,
        requestKey,
        requestPublicKey: `ed25519:${base58(raw)}`,
    };
}

export type TestState = { state: DurableObjectState; values: Map<string, unknown>; alarms: number[] };

export function createState(): TestState {
    const values = new Map<string, unknown>();
    const alarms: number[] = [];
    let tail = Promise.resolve();
    const get = async <T>(key: string) => structuredClone(values.get(key)) as T | undefined;
    const put = async (key: string, value: unknown) => { values.set(key, structuredClone(value)); };
    const remove = async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        return keys.reduce((count, entry) => count + Number(values.delete(entry)), 0);
    };
    const list = async (options?: { prefix?: string; startAfter?: string; limit?: number }) => new Map(
        [...values.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .filter(([key]) => !options?.prefix || key.startsWith(options.prefix))
            .filter(([key]) => !options?.startAfter || key > options.startAfter)
            .slice(0, options?.limit ?? values.size),
    );
    const storage = {
        get, put, delete: remove, list,
        setAlarm: async (at: number | Date) => { alarms.push(Number(at)); },
        transaction: async <T>(callback: (transaction: { get: typeof get; put: typeof put; list: typeof list }) => Promise<T>) => {
            const run = tail.then(() => callback({ get, put, list }));
            tail = run.then(() => undefined, () => undefined);
            return run;
        },
    };
    return { state: { storage } as unknown as DurableObjectState, values, alarms };
}

/** Market V2 with the Stream flag on: no LIVEPEER_API_KEY, no Studio JWT key, no Studio webhook secret. */
export function streamEnv(keys: StreamKeys, overrides: Partial<Env> = {}): Env {
    return {
        CF_VERSION_METADATA: { id: 'worker-version-test', tag: 'test', timestamp: '2026-10-22T00:00:00.000Z' },
        MARKET_PROTOCOL: 'v2',
        LIVEPEER_BRIDGE_ENABLED: 'true',
        LIVEPEER_NEW_UPLOADS_ENABLED: 'true',
        LIVEPEER_PLAYBACK_ISSUANCE_ENABLED: 'true',
        LIVEPEER_PLAYBACK_V3_ENABLED: 'true',
        LIVEPEER_PROVIDER_MUTATIONS_ENABLED: 'true',
        LIVEPEER_OPERATOR_MUTATIONS_ENABLED: 'true',
        LIVEPEER_CREATOR_ALLOWLIST: CREATOR,
        LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS: '1000000000',
        LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS: '100000000',
        LIVEPEER_PAID_MEDIA_OPERATOR_ID: 'paid-media-operator',
        LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN: OPERATOR_TOKEN,
        ALLOWED_ORIGINS: ORIGIN,
        NEAR_NETWORK: 'testnet',
        NEAR_RPC_URL: RPC_URL,
        MARKET_CONTRACT_ID: CONTRACT_ID,
        ACCESS_CONTRACT_ID: 'paid-media-access.testnet',
        NEAR_OPERATOR_ACCOUNT_ID: 'livepeer-bridge.testnet',
        NEAR_OPERATOR_PRIVATE_KEY: OPERATOR_PRIVATE_KEY,
        NEAR_OPERATOR_KEY_EPOCH: '1',
        MEDIA_PROVIDER_STREAM_ENABLED: 'true',
        STREAM_ACCOUNT_ID: V.ACCOUNT_ID,
        STREAM_API_TOKEN: STREAM_API_TOKEN,
        STREAM_CUSTOMER_CODE: V.CUSTOMER_CODE,
        STREAM_SIGNING_KEY_ID: STREAM_KEY_ID,
        STREAM_SIGNING_PUBLIC_KEY: btoa(keys.publicPem),
        STREAM_SIGNING_KEY_PEM: btoa(keys.privatePem),
        STREAM_WEBHOOK_SECRET: STREAM_WEBHOOK_SECRET,
        STREAM_MAX_DURATION_SECONDS: '7200',
        STREAM_STORAGE_MINUTES_CAPACITY: '1000',
        STREAM_RESERVATION_SECONDS_BUDGET: '7200',
        STREAM_STUCK_TIMEOUT_MS: String(30 * 60 * 1000),
        ...overrides,
    };
}

/** LIVEPEER_CONTROL double: admission and job objects are real; the operator answers `finalized`. */
export function controlNamespace(objects: {
    admission?: { fetch(request: Request): Promise<Response> };
    jobs?: Map<string, { fetch(request: Request): Promise<Response> }>;
    operator?: (request: Request) => Promise<Response>;
}) {
    const operatorCalls: Request[] = [];
    const namespace = {
        idFromName: (name: string) => ({ toString: () => name, name }),
        get: (id: { name: string }) => ({
            fetch: async (request: Request) => {
                if (id.name.startsWith('admission:') && objects.admission) return objects.admission.fetch(request);
                if (id.name.startsWith('job:') && objects.jobs?.has(id.name)) return objects.jobs.get(id.name)!.fetch(request);
                operatorCalls.push(request.clone());
                return objects.operator ? objects.operator(request) : Response.json({ accepted: true, finalized: true });
            },
        }),
    } as unknown as DurableObjectNamespace;
    return { namespace, operatorCalls };
}

export function streamIntentBody(overrides: Record<string, unknown> = {}) {
    return {
        ...vectors.upload_intent.body,
        expected_source_bytes: V.LENGTH,
        profile_id: 'paid-media-v1',
        profile_config_sha256: STREAM_PROFILE_HASH,
        ...overrides,
    };
}

let nonce = 0;

export async function streamIntentRequest(keys: StreamKeys, body = streamIntentBody()): Promise<Request> {
    nonce += 1;
    const envelope: Record<string, unknown> = {
        ...vectors.upload_intent.envelope,
        session_public_key: keys.requestPublicKey,
        device_nonce: base64Url(new Uint8Array(32).fill(nonce % 250 + 1)).slice(0, 43),
        expires_at_ms: String(Date.now() + 5 * 60 * 1000),
        body_sha256: await sha256Hex(canonicalJson(body)),
    };
    const signature = new Uint8Array(await crypto.subtle.sign(
        'Ed25519', keys.requestKey.privateKey, new TextEncoder().encode(canonicalControlMessage(envelope)),
    ));
    return new Request(`https://bridge.youtick.net${String(envelope.route)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Youtick-Signature': base64(signature) },
        body: JSON.stringify({ body, envelope }),
    });
}

export function finalJobRpc(keys: StreamKeys, body = streamIntentBody()): Response {
    return rpcValue({
        job_id: body.job_id,
        creator_id: CREATOR,
        profile_id: body.profile_id,
        profile_config_sha256: body.profile_config_sha256,
        expected_source_bytes: body.expected_source_bytes,
        generation: body.generation,
        status: 'Authorized',
        upload_public_key: keys.requestPublicKey,
        upload_key_expires_at_ms: String(Date.now() + 600_000),
    });
}

export function rpcValue(value: unknown): Response {
    return Response.json({
        result: { block_hash: BLOCK_HASH, result: Array.from(new TextEncoder().encode(JSON.stringify(value))) },
    });
}

export function streamJobRecord(overrides: Record<string, unknown> = {}) {
    const now = Date.now();
    return {
        schema: 'youtick.livepeer-control-job.v2',
        state: 'UPLOAD_READY',
        network: 'testnet',
        contractId: CONTRACT_ID,
        jobId: 'job-001',
        generation: 1,
        creator: CREATOR,
        expectedSourceBytes: V.LENGTH,
        sourceFingerprintSha256: 'a'.repeat(64),
        sourceType: 'mp4',
        profileId: 'paid-media-v1',
        profileConfigSha256: STREAM_PROFILE_HASH,
        createdAtMs: now - 60_000,
        stateChangedAtMs: now - 60_000,
        provider: 'stream',
        leaseId: '00000000-0000-4000-8000-000000000001',
        leaseExpiresAtMs: now + 30 * 60_000,
        assetId: V.UID,
        playbackId: V.UID,
        projectId: V.ACCOUNT_ID,
        tusEndpoint: TUS_URL,
        providerCreate: { attempts: 1, lastAttemptAtMs: now - 60_000, retryPolicy: 'RECONCILE_ONLY', completedAtMs: now - 60_000 },
        ...overrides,
    };
}

export type StreamBackend = {
    fetch: ReturnType<typeof makeFetch>;
    calls: { method: string; url: string; headers: Headers }[];
    state: {
        video: Record<string, unknown> | null;
        head: { status: number; offset: string; length: string };
        ladder: 'full' | 'partial' | 'open';
        storageMinutes: number;
        createStatus: number;
        createBody?: unknown;
        deleteStatus: number;
        // Surface path → status served to anonymous/forged/expired credentials (exposure tests).
        anonymousOverride: Record<string, number>;
        thumbnail: Uint8Array;
        rpc?: (body: { method: string; params: Record<string, unknown> }) => Response | Promise<Response> | null;
    };
};

const VARIANT_HEIGHTS: Record<string, string> = { t1: 'audio', t2: '240', t3: '360', t4: '480', t5: '720', t6: '1080' };
const PARTIAL_HEIGHTS = new Set(['audio', '240', '360', '480']);

export async function streamBackend(keys: StreamKeys, initial: Partial<StreamBackend['state']> = {}): Promise<StreamBackend> {
    const ready = await streamJson<{ result: Record<string, unknown> }>('video-ready.json');
    const backend = {
        calls: [] as StreamBackend['calls'],
        state: {
            video: ready.result,
            head: { status: 200, offset: V.LENGTH, length: V.LENGTH },
            ladder: 'full' as const,
            storageMinutes: 3,
            createStatus: 201,
            deleteStatus: 200,
            anonymousOverride: {},
            thumbnail: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]),
            ...initial,
        } as StreamBackend['state'],
    } as StreamBackend;
    backend.fetch = makeFetch(keys, backend);
    return backend;
}

export async function streamVideo(name: string, overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const fixture = await streamJson<{ result?: Record<string, unknown>; body?: Record<string, unknown> }>(name);
    return { ...(fixture.result ?? fixture.body)!, ...overrides };
}

function makeFetch(keys: StreamKeys, backend: StreamBackend) {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = new URL(String(input));
        const method = init?.method ?? 'GET';
        const headers = new Headers(init?.headers);
        backend.calls.push({ method, url: url.toString(), headers });
        const state = backend.state;
        if (String(input) === RPC_URL) {
            const body = JSON.parse(String(init?.body)) as { method: string; params: Record<string, unknown> };
            const answer = await state.rpc?.(body);
            if (answer) return answer;
            return rpcValue(null);
        }
        if (url.origin === 'https://api.cloudflare.com') {
            if (headers.get('Authorization') !== `Bearer ${STREAM_API_TOKEN}`) return new Response(null, { status: 403 });
            const path = url.pathname.slice(new URL(API).pathname.length);
            if (path === '' && method === 'POST') {
                if (state.createStatus !== 201) return Response.json(state.createBody ?? {}, { status: state.createStatus });
                const created = await streamJson<{ headers: Record<string, string> }>('create-201.json');
                state.video = await streamVideo('video-pendingupload.json');
                state.head = { status: 200, offset: '0', length: headers.get('Upload-Length') || '' };
                return new Response(null, { status: 201, headers: created.headers });
            }
            if (path === '/storage-usage') {
                return Response.json({ result: { creator: null, totalStorageMinutes: state.storageMinutes, totalStorageMinutesLimit: 1000, videoCount: 1 }, success: true });
            }
            if (path === `/${V.UID}` && method === 'GET') {
                return state.video ? Response.json({ result: state.video, success: true }) : new Response(null, { status: 404 });
            }
            if (path === `/${V.UID}` && method === 'DELETE') {
                if (state.deleteStatus === 200) state.video = null;
                return new Response(null, { status: state.deleteStatus });
            }
            return new Response(null, { status: 599 });
        }
        if (url.hostname === 'upload.cloudflarestream.com') {
            if (method !== 'HEAD') return new Response(null, { status: 599 });
            if (state.head.status !== 200) return new Response(null, { status: state.head.status });
            return new Response(null, {
                status: 200,
                headers: { 'Upload-Offset': state.head.offset, 'Upload-Length': state.head.length, 'Tus-Resumable': '1.0.0' },
            });
        }
        if (url.hostname === DELIVERY_HOST) return delivery(keys, backend, url, headers);
        return new Response(null, { status: 599 });
    };
}

async function delivery(keys: StreamKeys, backend: StreamBackend, url: URL, headers: Headers): Promise<Response> {
    if (headers.has('Authorization')) return new Response(null, { status: 400 });
    const [, credential, ...rest] = url.pathname.split('/');
    const path = rest.join('/');
    if (path.startsWith('video/')) {
        // Segments carry the signed p/s query, never the JWT; a stripped query is 404.
        return credential === V.UID && url.searchParams.get('p') === V.P && url.searchParams.get('s') === V.S
            ? new Response(new Uint8Array([0]), { status: 206 })
            : new Response(null, { status: 404 });
    }
    const claims = credential === V.UID ? null : await verifiedClaims(keys, credential);
    if (!claims) {
        const forced = backend.state.anonymousOverride[path];
        return new Response(forced === 200 ? '#EXTM3U\n' : null, { status: forced ?? 401 });
    }
    if (claims.sub !== V.UID) {
        if (path === 'iframe') return new Response('<html></html>', { status: 200 });
        if (path === 'watch') return new Response(null, { status: 500 });
        return new Response(null, { status: 404 });
    }
    if (path === 'manifest/video.m3u8') {
        return new Response(await streamText(backend.state.ladder === 'partial' ? 'master-partial.m3u8' : 'master.m3u8'));
    }
    const variant = /^manifest\/stream_(t\d)\.m3u8$/.exec(path);
    if (variant) {
        const height = VARIANT_HEIGHTS[variant[1]];
        if (!height || backend.state.ladder === 'partial' && !PARTIAL_HEIGHTS.has(height)) return new Response(null, { status: 404 });
        const text = await streamText(backend.state.ladder === 'open' && height === '1080' ? 'variant-open.m3u8' : 'variant.m3u8', { HEIGHT: height });
        return new Response(text);
    }
    if (path === 'manifest/video.mpd') return new Response('<MPD/>');
    if (path === 'thumbnails/thumbnail.jpg') {
        return new Response(backend.state.thumbnail, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(backend.state.thumbnail.byteLength) } });
    }
    if (path === 'thumbnails/thumbnail.gif') return new Response('GIF89a');
    if (path === 'iframe' || path === 'watch') return new Response('<html></html>');
    if (path === 'downloads/default.mp4') return new Response(null, { status: claims.downloadable ? 302 : 403 });
    return new Response(null, { status: 404 });
}

export async function verifiedClaims(keys: StreamKeys, token: string): Promise<Record<string, unknown> | null> {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        const valid = await crypto.subtle.verify(
            'RSASSA-PKCS1-v1_5', keys.publicKey, base64UrlDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
        );
        if (!valid) return null;
        const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as Record<string, unknown>;
        const now = Math.floor(Date.now() / 1000);
        if (typeof claims.exp !== 'number' || claims.exp < now) return null;
        if (typeof claims.nbf === 'number' && claims.nbf > now) return null;
        return claims;
    } catch {
        return null;
    }
}

export async function signedStreamWebhook(
    body: Record<string, unknown>,
    options: { secret?: string; timeSeconds?: number; url?: string; extraHeaders?: Record<string, string> } = {},
): Promise<Request> {
    const raw = JSON.stringify(body);
    const time = String(options.timeSeconds ?? Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(options.secret ?? STREAM_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${time}.${raw}`))));
    return new Request(options.url ?? 'https://bridge.youtick.net/v1/stream-webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Webhook-Signature': `time=${time},sig1=${sig}`, ...options.extraHeaders },
        body: raw,
    });
}

/** The DO-internal form the ingress forwards (provider header and signed time). */
export function internalStreamWebhook(body: Record<string, unknown>, timeMs = Date.now()): Request {
    return new Request('https://object/internal/livepeer-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-YouTick-Provider': 'stream', 'X-YouTick-Webhook-Time': String(timeMs) },
        body: JSON.stringify(body),
    });
}

export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const object = value as Record<string, unknown>;
        return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function canonicalControlMessage(envelope: Record<string, unknown>): string {
    return [
        'domain', 'version', 'method', 'route', 'network', 'contract_id', 'account_id',
        'resource', 'session_public_key', 'origin', 'device_nonce', 'expires_at_ms', 'body_sha256',
    ].map((key) => String(envelope[key])).join('\n');
}

export async function sha256Hex(value: string): Promise<string> {
    return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

export function hex(value: Uint8Array): string {
    return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64(value: Uint8Array): string {
    let binary = '';
    for (const byte of value) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64Url(value: Uint8Array): string {
    return base64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): Uint8Array {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)), (c) => c.charCodeAt(0));
}

function base58(value: Uint8Array): string {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let number = BigInt(`0x${hex(value)}`);
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
