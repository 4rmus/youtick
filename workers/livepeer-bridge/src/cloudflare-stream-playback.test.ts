import { KeyPair } from 'near-api-js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import handler, { LivepeerControl, type Env } from './index';
import { STREAM_PROFILE_HASH } from './media-provider';
import { canonicalPlaybackV3Message } from './playback-v3';
import { STREAM_TEST_VALUES as V } from './stream-test-fixtures';
import {
    API,
    CONTRACT_ID,
    DELIVERY_HOST,
    ORIGIN,
    controlNamespace,
    createState,
    createStreamKeys,
    rpcValue,
    signedStreamWebhook,
    streamBackend,
    streamEnv,
    streamVideo,
    verifiedClaims,
    type StreamBackend,
    type StreamKeys,
} from './stream-test-harness';

const TICKET_ID = 'a'.repeat(64);
const STUDIO_HASH = '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77';
let keys: StreamKeys;
beforeAll(async () => { keys = await createStreamKeys(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function base64(value: Uint8Array): string {
    return btoa(String.fromCharCode(...value));
}

async function v3(options: {
    status?: string;
    hash?: string;
    video?: Record<string, unknown> | null;
    env?: Partial<Env>;
} = {}) {
    const backend: StreamBackend = await streamBackend(keys, options.video === undefined ? {} : { video: options.video });
    const device = KeyPair.fromRandom('ed25519');
    const session = device.getPublicKey().toString();
    const views: string[] = [];
    backend.state.rpc = (body) => {
        views.push(String(body.params.method_name));
        if (body.params.method_name === 'get_ticket') {
            return rpcValue({
                ticket_id: TICKET_ID, publication_id: 'job-001', status: options.status ?? 'watched',
                devices: [{ session_public_key: session, expires_at_ms: String(Date.now() + 86_400_000) }],
            });
        }
        if (body.params.method_name === 'get_publication') {
            return rpcValue({
                publication_id: 'job-001', availability: 'ACTIVE', playback_id: V.UID,
                profile_id: 'paid-media-v1', profile_config_sha256: options.hash ?? STREAM_PROFILE_HASH,
            });
        }
        return null;
    };
    vi.stubGlobal('fetch', backend.fetch);
    const markWatched = vi.fn(async (_request: Request) => Response.json({ accepted: true, watched: true }));
    const env = streamEnv(keys, {
        CF_VERSION_METADATA: { id: `worker-version-stream-${Math.random()}`, tag: 'test', timestamp: '2026-10-22T00:00:00.000Z' },
        LIVEPEER_CONTROL: controlNamespace({ operator: markWatched }).namespace,
        ...options.env,
    });
    const request = {
        network: 'testnet', contract_id: CONTRACT_ID, ticket_id: TICKET_ID, session_public_key: session,
        origin: ORIGIN, device_nonce: '0123456789abcdef0123456789abcdef', expires_at_ms: String(Date.now() + 60_000),
    };
    const signature = base64(device.sign(new TextEncoder().encode(canonicalPlaybackV3Message(request))).signature);
    const call = () => handler.fetch(new Request('https://bridge.test/v3/playback-tokens', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ request, signature }),
    }), env);
    return { call, markWatched, backend, views, env };
}

describe('/v3/playback-tokens on a Stream publication', () => {
    it('signs an RS256 path token with the unchanged 180 s TTL and keeps schema v3', async () => {
        const now = Math.floor(Date.now() / 1000) * 1000;
        const run = await v3();
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const response = await run.call();
        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, string>;
        expect(Object.keys(body)).toEqual(['schema', 'playback_id', 'token', 'expires_at_ms', 'hls_url', 'provider']);
        expect(body).toMatchObject({
            schema: 'youtick.livepeer-playback-token.v3',
            playback_id: V.UID,
            expires_at_ms: String((now / 1000 + 180) * 1000),
            provider: 'cloudflare-stream',
        });
        const hls = new URL(body.hls_url);
        expect(hls.hostname).toBe(DELIVERY_HOST);
        expect(hls.pathname).toBe(`/${body.token}/manifest/video.m3u8`);
        vi.restoreAllMocks();
        const claims = await verifiedClaims(keys, body.token);
        expect(claims).toEqual({ sub: V.UID, kid: 'feedfacefeedfacefeedfacefeedface', exp: now / 1000 + 180, nbf: now / 1000 - 60 });
        // One provider policy read (GET /stream/{uid}); no Studio host.
        expect(run.backend.calls.filter((call) => call.url === `${API}/${V.UID}`)).toHaveLength(1);
        expect(run.backend.calls.some((call) => call.url.includes('livepeer'))).toBe(false);
    });

    it('finalizes mark_watched before the first Stream token', async () => {
        const run = await v3({ status: 'purchased' });
        const response = await run.call();
        expect(response.status).toBe(200);
        expect(run.markWatched).toHaveBeenCalledOnce();
        const order = run.backend.calls.map((call) => call.url);
        expect(order.indexOf(`${API}/${V.UID}`)).toBeGreaterThan(-1);
    });

    it.each([
        ['unsigned', { requireSignedURLs: false }],
        ['not ready to stream', { readyToStream: false }],
    ])('denies a Stream video that is %s', async (_case, overrides) => {
        const run = await v3({ video: await streamVideo('video-ready.json', overrides) });
        const response = await run.call();
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'playback_denied' });
    });

    it('denies a missing Stream video and maps a Stream outage to 503', async () => {
        const missing = await v3({ video: null });
        expect((await missing.call()).status).toBe(403);
        const outage = await v3();
        const original = outage.backend.fetch;
        vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => (
            String(input) === `${API}/${V.UID}` ? new Response(null, { status: 503 }) : original(input, init)
        ));
        expect((await outage.call()).status).toBe(503);
    });

    it('fails closed for a Studio publication on a Stream-only Market V2', async () => {
        const run = await v3({ hash: STUDIO_HASH });
        const response = await run.call();
        expect(response.status).toBeGreaterThanOrEqual(400);
    });
});

describe('/__health with the Stream adapter', () => {
    it('reports ready with only the Stream config on Market V2 and exposes the stream block', async () => {
        const admissionState = createState();
        let admission!: LivepeerControl;
        const { namespace } = controlNamespace({ admission: { fetch: (request) => admission.fetch(request) } });
        const env = streamEnv(keys, {
            LIVEPEER_CONTROL: namespace,
            LIVEPEER_PROJECT_ID: '', LIVEPEER_API_TOKEN_NAME: '', LIVEPEER_JWT_PUBLIC_KEY: '', LIVEPEER_JWT_ISSUER: '',
        });
        admission = new LivepeerControl(admissionState.state, env);
        const backend = await streamBackend(keys);
        vi.stubGlobal('fetch', backend.fetch);

        // A signed delivery without routing metadata (the webhook canary) is accepted and advances lastWebhookAtMs.
        const canary = await streamVideo('webhook-error-nonvideo.json', { meta: {} });
        const before = Date.now();
        const accepted = await handler.fetch(await signedStreamWebhook(canary), env);
        expect(accepted.status).toBe(202);
        expect(await accepted.json()).toEqual({ accepted: true, ignored: true });
        const forged = await handler.fetch(await signedStreamWebhook(canary, { secret: 'wrong-secret-wrong-secret' }), env);
        expect(forged.status).toBe(403);

        const response = await handler.fetch(new Request('https://bridge.test/__health'), env);
        const health = await response.json() as Record<string, any>;
        expect(health).toMatchObject({
            newUploadReady: true,
            controlPlaneReady: true,
            playbackReady: true,
            streamConfigured: true,
            mediaProvider: { kind: 'stream' },
        });
        expect(Object.keys(health.stream).sort()).toEqual([
            'lastWebhookAtMs', 'openReservedSeconds', 'reservationBudgetSeconds',
            'storageMinutesCapacity', 'storageMinutesUsed', 'stuckProcessingJobs',
        ]);
        expect(health.stream).toMatchObject({
            openReservedSeconds: 0, reservationBudgetSeconds: 7200, storageMinutesCapacity: 1000, stuckProcessingJobs: 0,
        });
        expect(health.stream.lastWebhookAtMs).toBeGreaterThanOrEqual(before);
        const lastAccepted = health.stream.lastWebhookAtMs;
        await handler.fetch(await signedStreamWebhook(canary, { secret: 'wrong-secret-wrong-secret' }), env);
        const again = await (await handler.fetch(new Request('https://bridge.test/__health'), env)).json() as Record<string, any>;
        expect(again.stream.lastWebhookAtMs).toBe(lastAccepted);
        // The health block names no secret, token, account id or customer code.
        const raw = JSON.stringify(health);
        for (const value of [V.ACCOUNT_ID, V.CUSTOMER_CODE, 'test-stream-api-token-0001', 'test-stream-webhook-secret']) {
            expect(raw).not.toContain(value);
        }
    });

    it('never reports streamConfigured with the flag off, and empty Stream values are not an error', async () => {
        const base = streamEnv(keys);
        const env: Env = {
            ...base,
            MEDIA_PROVIDER_STREAM_ENABLED: 'false',
            STREAM_ACCOUNT_ID: '', STREAM_CUSTOMER_CODE: '', STREAM_SIGNING_KEY_ID: '', STREAM_SIGNING_PUBLIC_KEY: '',
            STREAM_MAX_DURATION_SECONDS: '', STREAM_STORAGE_MINUTES_CAPACITY: '', STREAM_RESERVATION_SECONDS_BUDGET: '',
            STREAM_STUCK_TIMEOUT_MS: '', STREAM_API_TOKEN: undefined, STREAM_WEBHOOK_SECRET: undefined, STREAM_SIGNING_KEY_PEM: undefined,
        };
        const response = await handler.fetch(new Request('https://bridge.test/__health'), env);
        expect(response.status).toBe(200);
        const health = await response.json() as Record<string, any>;
        expect(health.streamConfigured).toBe(false);
        expect(health.stream).toEqual({
            openReservedSeconds: null, reservationBudgetSeconds: null, storageMinutesUsed: null,
            storageMinutesCapacity: null, lastWebhookAtMs: null, stuckProcessingJobs: null,
        });
        // A full Stream config with the flag off is still not "configured".
        const flagOff = await (await handler.fetch(new Request('https://bridge.test/__health'), {
            ...base, MEDIA_PROVIDER_STREAM_ENABLED: 'false',
        })).json() as Record<string, unknown>;
        expect(flagOff.streamConfigured).toBe(false);
    });

    it.each([
        ['account id', { STREAM_ACCOUNT_ID: 'not-hex' }],
        ['short webhook secret', { STREAM_WEBHOOK_SECRET: 'short' }],
        ['cap above the descriptor', { STREAM_MAX_DURATION_SECONDS: '7201' }],
        ['zero capacity', { STREAM_STORAGE_MINUTES_CAPACITY: '0' }],
        ['public key that is not SPKI', { STREAM_SIGNING_PUBLIC_KEY: btoa('-----BEGIN PRIVATE KEY-----\n' + 'A'.repeat(80)) }],
        ['missing PEM', { STREAM_SIGNING_KEY_PEM: undefined }],
        ['customer code placeholder', { STREAM_CUSTOMER_CODE: '<replace-with-stream-customer-code>' }],
    ])('reports not configured on a bad %s', async (_case, overrides) => {
        const env = streamEnv(keys, overrides as Partial<Env>);
        const health = await (await handler.fetch(new Request('https://bridge.test/__health'), env)).json() as Record<string, unknown>;
        expect(health.streamConfigured).toBe(false);
        expect(health.newUploadReady).toBe(false);
    });
});
