import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LivepeerControl, type Env } from './index';
import { STREAM_PROFILE_HASH } from './media-provider';
import { STREAM_TEST_VALUES as V } from './stream-test-fixtures';
import { STREAM_READY_SEGMENT_PROBE, STREAM_REQUIRE_END_LIST } from './cloudflare-stream-verification';
import {
    API,
    DELIVERY_HOST,
    controlNamespace,
    createState,
    createStreamKeys,
    internalStreamWebhook,
    rpcValue,
    sha256Hex,
    streamBackend,
    streamEnv,
    streamJobRecord,
    streamVideo,
    type StreamBackend,
    type StreamKeys,
} from './stream-test-harness';

let keys: StreamKeys;
beforeAll(async () => { keys = await createStreamKeys(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const READY_AT_MS = Date.parse('2026-10-21T13:58:12.000000Z');

async function runtime(options: {
    backend?: Partial<StreamBackend['state']>;
    job?: Record<string, unknown>;
    env?: Partial<Env>;
} = {}) {
    const backend = await streamBackend(keys, options.backend);
    vi.stubGlobal('fetch', backend.fetch);
    const jobState = createState();
    jobState.values.set('job:v1', streamJobRecord(options.job));
    const { namespace, operatorCalls } = controlNamespace({});
    const env = streamEnv(keys, { LIVEPEER_CONTROL: namespace, ...options.env });
    const control = new LivepeerControl(jobState.state, env);
    const finalizeCalls = () => operatorCalls.filter((request) => new URL(request.url).pathname === '/internal/finalize');
    const job = () => jobState.values.get('job:v1') as Record<string, unknown>;
    const calls = (predicate: (call: StreamBackend['calls'][number]) => boolean) => backend.calls.filter(predicate);
    return { backend, jobState, control, env, finalizeCalls, operatorCalls, job, calls };
}

const isHead = (call: { method: string; url: string }) => call.method === 'HEAD';
const isDelete = (call: { method: string; url: string }) => call.method === 'DELETE' && call.url === `${API}/${V.UID}`;
const deliveryPath = (call: { url: string }) => {
    const url = new URL(call.url);
    return url.hostname === DELIVERY_HOST ? url.pathname.split('/').slice(2).join('/') : null;
};

describe('Stream readiness (option A)', () => {
    it('keeps a ready-at-33% webhook pending, then finalizes the full ladder with the tus offset as the byte proof', async () => {
        const run = await runtime({
            backend: { ladder: 'partial', video: await streamVideo('video-ready-33.json') },
        });
        const first = await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-ready.json')));
        expect(first.status).toBe(202);
        expect(await first.json()).toEqual({ accepted: true, processing: true });
        expect(run.job()).toMatchObject({ state: 'UPLOAD_READY', providerVerification: { nextThumbnail: 0 } });
        expect(run.jobState.values.get('reconcile:v1')).toMatchObject({ status: 'PROVIDER_UNKNOWN' });
        // The pending look-again is 15 s, not the 1 s continuation of a storyboard checkpoint.
        expect(run.jobState.alarms.at(-1)! - Date.now()).toBeGreaterThan(10_000);
        expect(run.finalizeCalls()).toHaveLength(0);

        run.backend.state.ladder = 'full';
        run.backend.state.video = await streamVideo('video-ready.json');
        await run.control.alarm();

        const job = run.job();
        expect(job.state).toBe('ONCHAIN_PUBLISHED');
        expect(job).not.toHaveProperty('tusEndpoint');
        expect(job).not.toHaveProperty('providerVerification');
        expect(job.publication).toEqual({
            job_id: 'job-001',
            generation: 1,
            creator_id: 'creator.testnet',
            expected_source_bytes: V.LENGTH,
            profile_id: 'paid-media-v1',
            profile_config_sha256: STREAM_PROFILE_HASH,
            asset_id_hash: await sha256Hex(V.UID),
            playback_id: V.UID,
            project_id_hash: await sha256Hex(V.ACCOUNT_ID),
            verified_source_bytes: V.LENGTH,
            provider_source_fingerprint: null,
            ready_at_ms: String(READY_AT_MS),
            availability: 'ACTIVE',
        });
        expect(job.sourceBytesEvidence).toEqual({
            method: 'tus-offset', offsetBytes: V.LENGTH, lengthBytes: V.LENGTH,
            observedAtMs: expect.any(Number), readyAtMs: String(READY_AT_MS),
        });
        expect(run.finalizeCalls()).toHaveLength(1);
    });

    it('never fetches a listed p/s segment URL anonymously and never sends an API token to delivery', async () => {
        const run = await runtime();
        expect((await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-ready.json')))).status).toBe(200);
        const segmentCalls = run.calls((call) => deliveryPath(call)?.startsWith('video/') ?? false);
        expect(segmentCalls.length).toBeGreaterThan(0);
        for (const call of segmentCalls) {
            expect(new URL(call.url).search).toBe('');
            expect(call.headers.get('Range')).toBe('bytes=0-0');
        }
        for (const call of run.calls((call) => deliveryPath(call) !== null)) {
            expect(call.headers.has('Authorization')).toBe(false);
        }
        expect(run.calls(isHead)).toHaveLength(1);
        // Every denial surface of the matrix was probed.
        const paths = new Set(run.calls((call) => deliveryPath(call) !== null).map(deliveryPath));
        for (const path of ['manifest/video.mpd', 'thumbnails/thumbnail.jpg', 'thumbnails/thumbnail.gif', 'iframe', 'watch', 'downloads/default.mp4']) {
            expect(paths, path).toContain(path);
        }
    });

    it('never reads a signed segment, even at readiness (the probe is a constant false)', async () => {
        expect(STREAM_READY_SEGMENT_PROBE).toBe(false);
        expect(STREAM_REQUIRE_END_LIST).toBe(true);
        const run = await runtime();
        expect((await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-ready.json')))).status).toBe(200);
        const signed = run.calls((call) => deliveryPath(call)?.startsWith('video/') === true && new URL(call.url).searchParams.has('p'));
        expect(signed).toHaveLength(0);
    });

    it('verifies the dashboard-recorded ladder without an audio group', async () => {
        const run = await runtime({ backend: { ladder: 'dashboard' } });
        expect((await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-ready.json')))).status).toBe(200);
        expect(run.job().state).toBe('ONCHAIN_PUBLISHED');
    });

    it('fails an overflow upload, deletes the UID and never finalizes', async () => {
        const run = await runtime({ backend: { head: { status: 200, offset: '15466496', length: '10400529' } } });
        const response = await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-ready.json')));
        expect(response.status).toBe(202);
        expect(await response.json()).toMatchObject({ provider_failed: true, code: 'provider_tus_state_invalid' });
        expect(run.job()).toMatchObject({ state: 'PROVIDER_FAILED', providerDelete: { outcome: 'DELETED' } });
        expect(run.calls(isDelete)).toHaveLength(1);
        expect(run.finalizeCalls()).toHaveLength(0);
        // A second ready delivery is ignored as terminal: no HEAD, no second DELETE.
        await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-ready.json')));
        expect(run.calls(isDelete)).toHaveLength(1);
    });

    it.each([
        ['a short upload', { status: 200, offset: '19999999', length: V.LENGTH }],
        ['a foreign length', { status: 200, offset: '30000000', length: '30000000' }],
    ])('fails %s at readiness', async (_case, head) => {
        const run = await runtime({ backend: { head } });
        await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-ready.json')));
        expect(run.job().state).toBe('PROVIDER_FAILED');
        expect(run.finalizeCalls()).toHaveLength(0);
    });

    it('expires a job whose upload URL is past 24 h without a HEAD, and deletes the UID', async () => {
        const created = Date.now() - 24 * 60 * 60 * 1000 - 1;
        const run = await runtime({ job: { providerCreate: { attempts: 1, lastAttemptAtMs: created, retryPolicy: 'RECONCILE_ONLY', completedAtMs: created } } });
        const response = await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-ready.json')));
        expect(await response.json()).toMatchObject({ code: 'provider_tus_url_expired' });
        expect(run.job().state).toBe('UPLOAD_EXPIRED');
        expect(run.calls(isHead)).toHaveLength(0);
        expect(run.calls(isDelete)).toHaveLength(1);
    });

    it('expires a job whose upload URL answers 404 at readiness', async () => {
        const run = await runtime({ backend: { head: { status: 404, offset: '', length: '' } } });
        await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-ready.json')));
        expect(run.job().state).toBe('UPLOAD_EXPIRED');
        expect(run.calls(isDelete)).toHaveLength(1);
    });

    it('treats a signed ERR_DURATION_EXCEED_CONSTRAINT webhook as terminal while GET still says inprogress', async () => {
        const run = await runtime({ backend: { video: await streamVideo('video-inprogress-lagging.json') }, job: { state: 'PROCESSING' } });
        const response = await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-error-duration.json')));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ accepted: true, provider_failed: true });
        expect(run.job()).toMatchObject({ state: 'PROVIDER_FAILED', providerDelete: { outcome: 'DELETED' } });
        expect(run.calls(isDelete)).toHaveLength(1);
        expect(run.calls((call) => call.method === 'GET' && call.url === `${API}/${V.UID}`)).toHaveLength(0);
    });

    it('keeps the UID when provider mutations are off', async () => {
        const run = await runtime({ env: { LIVEPEER_PROVIDER_MUTATIONS_ENABLED: 'false' } });
        await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-error-nonvideo.json')));
        expect(run.job().state).toBe('PROVIDER_FAILED');
        expect(run.job()).not.toHaveProperty('providerDelete');
        expect(run.calls(isDelete)).toHaveLength(0);
    });

    it.each([
        'manifest/video.m3u8',
        'manifest/video.mpd',
        'thumbnails/thumbnail.jpg',
        'thumbnails/thumbnail.gif',
        'iframe',
        'watch',
        'downloads/default.mp4',
    ])('fails verification when %s answers 200 to an anonymous request', async (path) => {
        const run = await runtime({ backend: { anonymousOverride: { [path]: 200 } } });
        const response = await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-ready.json')));
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'provider_playback_exposed' });
        expect(run.job().state).toBe('UPLOAD_READY');
        expect(run.finalizeCalls()).toHaveLength(0);
    });

    it('accepts 403 as a refusal and fails closed on any other status', async () => {
        const accepted = await runtime({ backend: { anonymousOverride: { iframe: 403, 'manifest/video.m3u8': 403 } } });
        expect((await accepted.control.fetch(internalStreamWebhook(await streamVideo('webhook-ready.json')))).status).toBe(200);
        vi.unstubAllGlobals();
        const run = await runtime({ backend: { anonymousOverride: { iframe: 404 } } });
        const response = await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-ready.json')));
        expect(await response.json()).toEqual({ error: 'provider_playback_mismatch' });
    });

    it('fails a full ladder that misses a rendition once pctComplete is 100', async () => {
        const run = await runtime({ backend: { ladder: 'partial' } });
        const response = await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-ready.json')));
        expect(response.status).toBe(409);
        expect(run.job()).not.toHaveProperty('providerVerification');
    });

    it('turns a pending ladder into provider_verification_incomplete after the stuck window', async () => {
        const now = Date.now();
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const run = await runtime({ backend: { ladder: 'partial', video: await streamVideo('video-ready-33.json') } });
        await run.control.fetch(internalStreamWebhook(await streamVideo('webhook-ready.json')));
        expect(run.job()).toHaveProperty('providerVerification');
        // The pending window is max(STREAM_STUCK_TIMEOUT_MS, 60 minutes).
        vi.spyOn(Date, 'now').mockImplementation(() => now + 59 * 60 * 1000);
        await run.control.alarm();
        expect(run.job()).toHaveProperty('providerVerification');
        vi.spyOn(Date, 'now').mockImplementation(() => now + 60 * 60 * 1000 + 1);
        await expect(run.control.alarm()).rejects.toThrow('provider_verification_incomplete');
        expect(run.job()).not.toHaveProperty('providerVerification');
        expect(run.job().state).toBe('UPLOAD_READY');
    });
});

async function publishedRuntime(options: { evidence?: boolean; backend?: Partial<StreamBackend['state']> } = {}) {
    const readyAtMs = String(READY_AT_MS);
    const publication = {
        job_id: 'job-001', generation: 1, creator_id: 'creator.testnet', expected_source_bytes: V.LENGTH,
        profile_id: 'paid-media-v1', profile_config_sha256: STREAM_PROFILE_HASH,
        asset_id_hash: await sha256Hex(V.UID), playback_id: V.UID, project_id_hash: await sha256Hex(V.ACCOUNT_ID),
        verified_source_bytes: V.LENGTH, provider_source_fingerprint: null, ready_at_ms: readyAtMs, availability: 'ACTIVE',
    };
    const run = await runtime({
        backend: options.backend,
        job: {
            state: 'ONCHAIN_PUBLISHED',
            tusEndpoint: undefined,
            publication,
            ...(options.evidence === false ? {} : {
                sourceBytesEvidence: { method: 'tus-offset', offsetBytes: V.LENGTH, lengthBytes: V.LENGTH, observedAtMs: 1, readyAtMs },
            }),
        },
    });
    run.backend.state.rpc = (body) => body.params.method_name === 'get_publication'
        ? rpcValue({ publication_id: 'job-001', ...publication, published_availability: 'ACTIVE' }) : null;
    run.jobState.values.set('reconcile:v1', {
        schema: 'youtick.livepeer-reconcile.v1', status: 'HEALTHY', consecutiveErrors: 0, nextReconcileAtMs: Date.now(),
    });
    return { ...run, publication };
}

describe('Stream published re-verification', () => {
    it('never HEADs, never fetches a signed segment, and reproduces the stored publication', async () => {
        const run = await publishedRuntime();
        // Even a later modification time does not move ready_at_ms.
        run.backend.state.video = await streamVideo('video-ready.json', { modified: '2026-11-01T00:00:00.000000Z', readyToStreamAt: undefined });
        await run.control.alarm();
        expect(run.jobState.values.get('reconcile:v1')).toMatchObject({ status: 'HEALTHY' });
        expect(run.calls(isHead)).toHaveLength(0);
        expect(run.calls((call) => deliveryPath(call)?.startsWith('video/') === true && new URL(call.url).search !== '')).toHaveLength(0);
        expect(run.job().publication).toEqual(run.publication);
    });

    it('keeps a job without stored evidence blocked without a drift code', async () => {
        const run = await publishedRuntime({ evidence: false });
        await run.control.alarm();
        expect(run.jobState.values.get('reconcile:v1')).toMatchObject({ status: 'PROVIDER_UNKNOWN' });
        expect(run.operatorCalls.filter((request) => new URL(request.url).pathname === '/internal/outbox')).toHaveLength(0);
    });

    it('maps a 503 to provider_unavailable (unknown, not drift)', async () => {
        const run = await publishedRuntime();
        run.backend.state.video = null;
        const original = run.backend.fetch;
        vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => (
            String(input) === `${API}/${V.UID}` ? new Response(null, { status: 503 }) : original(input, init)
        ));
        await run.control.alarm();
        expect(run.jobState.values.get('reconcile:v1')).toMatchObject({ status: 'PROVIDER_UNKNOWN' });
    });

    it('records drift when the UID is gone', async () => {
        const run = await publishedRuntime({ backend: { video: null } });
        await run.control.alarm();
        expect(run.jobState.values.get('reconcile:v1')).toMatchObject({
            status: 'DRIFT_BLOCKED', lastDrift: { code: 'provider_asset_missing' },
        });
    });
});
