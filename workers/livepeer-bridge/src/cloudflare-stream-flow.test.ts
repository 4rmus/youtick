import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import handler, { LivepeerControl, forwardUploadIntent, jobObjectName, type Env } from './index';
import { STREAM_PROFILE_HASH } from './media-provider';
import { STREAM_TEST_VALUES as V } from './stream-test-fixtures';
import {
    CONTRACT_ID,
    TUS_URL,
    controlNamespace,
    createState,
    createStreamKeys,
    finalJobRpc,
    signedStreamWebhook,
    streamBackend,
    streamEnv,
    streamIntentBody,
    streamIntentRequest,
    streamJobRecord,
    streamVideo,
    type StreamKeys,
} from './stream-test-harness';

const STUDIO_HASH = '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77';
let keys: StreamKeys;

beforeAll(async () => { keys = await createStreamKeys(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function forwardingEnv(overrides: Partial<Env> = {}) {
    const forwarded = vi.fn(async () => Response.json({ accepted: true }));
    const env = streamEnv(keys, {
        LIVEPEER_CONTROL: {
            idFromName: (name: string) => ({ toString: () => name }),
            get: () => ({ fetch: forwarded }),
        } as unknown as DurableObjectNamespace,
        ...overrides,
    });
    return { env, forwarded };
}

describe('Stream intents: provider selection', () => {
    it.each([
        ['flag off refuses the Stream hash', { MEDIA_PROVIDER_STREAM_ENABLED: 'false' }, STREAM_PROFILE_HASH, false],
        ['flag absent refuses the Stream hash', { MEDIA_PROVIDER_STREAM_ENABLED: undefined }, STREAM_PROFILE_HASH, false],
        ['flag on accepts the Stream hash', {}, STREAM_PROFILE_HASH, true],
        ['flag on makes Market V2 Stream-only', {}, STUDIO_HASH, false],
        ['flag off keeps Studio hashes on Market V2', { MEDIA_PROVIDER_STREAM_ENABLED: 'false' }, STUDIO_HASH, true],
        ['an unknown hash stays refused', {}, '0'.repeat(64), false],
    ] as const)('%s', async (_case, overrides, hash, accepted) => {
        const { env, forwarded } = forwardingEnv(overrides as Partial<Env>);
        const response = await forwardUploadIntent(
            await streamIntentRequest(keys, streamIntentBody({ profile_config_sha256: hash })), env,
        );
        if (accepted) {
            expect(response.status).toBe(200);
            expect(forwarded).toHaveBeenCalledOnce();
        } else {
            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ error: 'invalid_upload_intent' });
            expect(forwarded).not.toHaveBeenCalled();
        }
    });

    it('creates a Stream job without any Studio configuration and records provider stream', async () => {
        const backend = await streamBackend(keys, { video: null });
        backend.state.rpc = (body) => body.params.method_name === 'get_media_job' ? finalJobRpc(keys) : null;
        vi.stubGlobal('fetch', backend.fetch);
        const admissionState = createState();
        const jobState = createState();
        let admission!: LivepeerControl;
        const { namespace } = controlNamespace({ admission: { fetch: (request) => admission.fetch(request) } });
        const env = streamEnv(keys, { LIVEPEER_CONTROL: namespace });
        admission = new LivepeerControl(admissionState.state, env);
        const control = new LivepeerControl(jobState.state, env);

        const before = Date.now();
        const response = await control.fetch(await streamIntentRequest(keys));
        const after = Date.now();
        expect(response.status).toBe(201);
        const body = await response.json() as Record<string, unknown>;
        expect(body).toMatchObject({ schema: 'youtick.livepeer-upload-intent.v2', tus_endpoint: TUS_URL, created: true });
        const job = jobState.values.get('job:v1') as Record<string, unknown>;
        expect(job).toMatchObject({
            state: 'UPLOAD_READY', provider: 'stream', assetId: V.UID, playbackId: V.UID, projectId: V.ACCOUNT_ID,
            tusEndpoint: TUS_URL, profileId: 'paid-media-v1', profileConfigSha256: STREAM_PROFILE_HASH,
        });
        expect(job).not.toHaveProperty('apiTokenName');
        const create = backend.calls.find((call) => call.method === 'POST' && call.url.endsWith('?direct_user=true'))!;
        const metadata = Object.fromEntries(create.headers.get('Upload-Metadata')!.split(',').map((pair) => {
            const [key, value] = pair.split(' ');
            return [key, value === undefined ? null : atob(value)];
        }));
        // The tus expiry is creation + 6 h (Stream's maximum), never the 30-minute admission lease.
        const expiry = Date.parse(String(metadata.expiry));
        expect(expiry).toBeGreaterThanOrEqual(before + 6 * 60 * 60 * 1000);
        expect(expiry).toBeLessThanOrEqual(after + 6 * 60 * 60 * 1000);
        expect(expiry).toBeGreaterThan(Number(job.leaseExpiresAtMs));
        expect(metadata.maxDurationSeconds).toBe('7200');
        expect(backend.calls.some((call) => call.url.startsWith('https://livepeer.studio'))).toBe(false);
    });
});

describe('Stream webhook ingress', () => {
    function ingress(overrides: Partial<Env> = {}) {
        const jobFetch = vi.fn(async (_request: Request) => Response.json({ accepted: true }));
        const jobs = new Map([[jobObjectName('testnet', CONTRACT_ID, 'job-001', 1), { fetch: jobFetch }]]);
        const { namespace } = controlNamespace({ jobs });
        return { env: streamEnv(keys, { LIVEPEER_CONTROL: namespace, ...overrides }), jobFetch };
    }

    it('authenticates, routes by meta and forwards the raw body with the Stream adapter and signed time', async () => {
        const { env, jobFetch } = ingress();
        const body = await streamVideo('webhook-ready.json');
        const time = Math.floor(Date.now() / 1000);
        const response = await handler.fetch(await signedStreamWebhook(body, {
            timeSeconds: time, extraHeaders: { 'X-YouTick-Provider': 'studio', 'X-YouTick-Webhook-Time': '1' },
        }), env);
        expect(response.status).toBe(200);
        expect(jobFetch).toHaveBeenCalledOnce();
        const forwarded = jobFetch.mock.calls[0][0];
        expect(new URL(forwarded.url).pathname).toBe('/internal/livepeer-webhook');
        expect(forwarded.headers.get('X-YouTick-Provider')).toBe('stream');
        expect(forwarded.headers.get('X-YouTick-Webhook-Time')).toBe(String(time * 1000));
        expect(await forwarded.text()).toBe(JSON.stringify(body));
    });

    it('refuses bad signatures, ignores unroutable bodies and needs the Stream config', async () => {
        const { env, jobFetch } = ingress();
        const body = await streamVideo('webhook-ready.json');
        const forged = await handler.fetch(await signedStreamWebhook(body, { secret: 'not-the-stream-secret' }), env);
        expect(forged.status).toBe(403);
        const unroutable = await handler.fetch(await signedStreamWebhook({ ...body, meta: {} }), env);
        expect(unroutable.status).toBe(202);
        expect(await unroutable.json()).toEqual({ accepted: true, ignored: true });
        expect(jobFetch).not.toHaveBeenCalled();
        const missing = ingress({ STREAM_WEBHOOK_SECRET: undefined });
        expect((await handler.fetch(await signedStreamWebhook(body), missing.env)).status).toBe(503);
        const disabled = ingress({ LIVEPEER_BRIDGE_ENABLED: 'false' });
        expect((await handler.fetch(await signedStreamWebhook(body), disabled.env)).status).toBe(503);
    });

    it('never lets a Studio-signed body through the Stream route or a Stream body through the Studio route', async () => {
        const { env, jobFetch } = ingress({ LIVEPEER_WEBHOOK_SECRET: 'test-livepeer-webhook-secret' });
        const body = await streamVideo('webhook-ready.json');
        const studioRoute = await handler.fetch(await signedStreamWebhook(body, {
            url: 'https://bridge.youtick.net/v1/livepeer-webhooks',
        }), env);
        expect(studioRoute.status).toBeGreaterThanOrEqual(400);
        expect(jobFetch).not.toHaveBeenCalled();
    });

    it('moves an uploading Stream job to PROCESSING on an inprogress webhook', async () => {
        const jobState = createState();
        jobState.values.set('job:v1', streamJobRecord({ state: 'UPLOADING' }));
        const { namespace } = controlNamespace({});
        const env = streamEnv(keys, { LIVEPEER_CONTROL: namespace });
        const jobs = new Map([[jobObjectName('testnet', CONTRACT_ID, 'job-001', 1), new LivepeerControl(jobState.state, env)]]);
        const ingressEnv = streamEnv(keys, { LIVEPEER_CONTROL: controlNamespace({ jobs }).namespace });
        const response = await handler.fetch(await signedStreamWebhook(await streamVideo('webhook-inprogress.json')), ingressEnv);
        expect(response.status).toBe(200);
        expect(jobState.values.get('job:v1')).toMatchObject({ state: 'PROCESSING', provider: 'stream' });
    });
});
