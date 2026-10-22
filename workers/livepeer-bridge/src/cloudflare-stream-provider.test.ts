import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    CloudflareStreamProvider,
    STREAM_CAPABILITIES,
    streamUploadMetadata,
    streamWebhookRoute,
    type CloudflareStreamOptions,
} from './cloudflare-stream-provider';
import { STREAM_PROFILE_HASH } from './media-provider';
import { STREAM_TEST_VALUES as V, rawStreamFixture, streamJson } from './stream-test-fixtures';

const API = `https://api.cloudflare.com/client/v4/accounts/${V.ACCOUNT_ID}/stream`;
const TUS_URL = `https://upload.cloudflarestream.com/tus/${V.UID}?tusv2=true`;
const API_TOKEN = 'test-stream-api-token-0001';
const WEBHOOK_SECRET = 'test-stream-webhook-secret';
const PREVIOUS_SECRET = 'test-stream-webhook-previous';
const KEY_ID = 'feedfacefeedfacefeedfacefeedface';
const JOB_ID = 'job-001';

let keys: { privatePem: string; publicKey: CryptoKey; pkcs1Base64: string; pkcs1PublicKey: CryptoKey; jwkBase64: string };

beforeAll(async () => {
    const pair = await crypto.subtle.generateKey(
        { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['sign', 'verify'],
    ) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer);
    const privatePem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----\n`;
    const nodeCrypto = await import(/* @vite-ignore */ ['node', 'crypto'].join(':')) as {
        generateKeyPairSync(type: 'rsa', options: { modulusLength: number }): {
            privateKey: { export(options: { type?: string; format: string }): string | object };
            publicKey: { export(options: { type: string; format: string }): Uint8Array };
        };
    };
    // The shape `POST /stream/keys` may return (base64 of a PKCS1 PEM, as the probe mock assumes).
    const nodePair = nodeCrypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pkcs1Pem = nodePair.privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
    const spki = nodePair.publicKey.export({ type: 'spki', format: 'der' });
    const pkcs1PublicKey = await crypto.subtle.importKey(
        'spki', new Uint8Array(spki), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    );
    const jwk = nodePair.privateKey.export({ format: 'jwk' }) as object;
    keys = {
        privatePem,
        publicKey: pair.publicKey,
        pkcs1Base64: btoa(pkcs1Pem),
        pkcs1PublicKey,
        jwkBase64: btoa(JSON.stringify({ ...jwk, kid: KEY_ID, alg: 'RS256' })),
    };
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function provider(overrides: Partial<CloudflareStreamOptions> = {}): CloudflareStreamProvider {
    return new CloudflareStreamProvider({
        accountId: V.ACCOUNT_ID,
        apiToken: API_TOKEN,
        customerCode: V.CUSTOMER_CODE,
        signingKeyId: KEY_ID,
        signingKey: keys.privatePem,
        webhookSecrets: [WEBHOOK_SECRET, PREVIOUS_SECRET],
        webhookToleranceMs: 5 * 60 * 1000,
        maxDurationSeconds: 7200,
        requireEndList: true,
        readySegmentProbe: false,
        readyPendingWindowMs: 30 * 60 * 1000,
        verificationTokenTtlSeconds: 120,
        sha256: async (value) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))),
        isValidJobId: (value) => /^[A-Za-z0-9._:-]{1,128}$/.test(value),
        readyVerificationEnabled: true,
        ...overrides,
    });
}

function hex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const uploadInput = {
    jobId: JOB_ID,
    generation: 1,
    expectedSourceBytes: V.LENGTH,
    profileConfigSha256: STREAM_PROFILE_HASH,
    sourceType: 'mov' as const,
    uploadExpiresAtMs: Date.UTC(2026, 9, 22, 12, 30),
};

async function headResponse(name: string, values?: Record<string, string>): Promise<Response> {
    const fixture = await streamJson<{ status: number; headers: Record<string, string> }>(name, values);
    return new Response(null, { status: fixture.status, headers: fixture.headers });
}

async function createResponse(headers?: Record<string, string>): Promise<Response> {
    const fixture = await streamJson<{ status: number; headers: Record<string, string> }>('create-201.json');
    return new Response(null, { status: fixture.status, headers: { ...fixture.headers, ...headers } });
}

function decodeMetadata(header: string): Record<string, string | null> {
    return Object.fromEntries(header.split(',').map((pair) => {
        const [key, value] = pair.split(' ');
        return [key, value === undefined ? null : atob(value)];
    }));
}

/** Mock transport replaying fixtures: create → HEAD → GET, with overridable steps. */
function transport(steps: {
    create?: () => Promise<Response> | Response;
    head?: () => Promise<Response> | Response;
    video?: () => Promise<Response> | Response;
    del?: () => Promise<Response> | Response;
} = {}) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === `${API}?direct_user=true` && method === 'POST') return steps.create ? steps.create() : createResponse();
        if (url === TUS_URL && method === 'HEAD') return steps.head ? steps.head() : headResponse('head-created.json');
        if (url === `${API}/${V.UID}` && method === 'GET') {
            return steps.video ? steps.video() : Response.json(await streamJson('video-pendingupload.json'));
        }
        if (url === `${API}/${V.UID}` && method === 'DELETE') {
            return steps.del ? steps.del() : Response.json(await streamJson('delete-200.json'));
        }
        return new Response(null, { status: 599 });
    });
}

async function pendingVideo(overrides: Record<string, unknown> = {}): Promise<Response> {
    const fixture = await streamJson<{ result: Record<string, unknown> }>('video-pendingupload.json');
    return Response.json({ ...fixture, result: { ...fixture.result, ...overrides } });
}

describe('Cloudflare Stream adapter: upload', () => {
    it('creates a bound direct creator upload and returns the UID as asset, playback and project ids', async () => {
        const fetchMock = transport();
        vi.stubGlobal('fetch', fetchMock);
        const result = await provider().createUpload(uploadInput);
        expect(result).toEqual({ assetId: V.UID, playbackId: V.UID, projectId: V.ACCOUNT_ID, tusEndpoint: TUS_URL });
        const [, init] = fetchMock.mock.calls[0];
        const headers = new Headers(init?.headers);
        expect(headers.get('Authorization')).toBe(`Bearer ${API_TOKEN}`);
        expect(headers.get('Tus-Resumable')).toBe('1.0.0');
        expect(headers.get('Upload-Length')).toBe(V.LENGTH);
        const metadata = decodeMetadata(headers.get('Upload-Metadata')!);
        expect(metadata).toEqual({
            name: 'youtick-job-001-g1',
            requiresignedurls: null,
            maxDurationSeconds: '7200',
            expiry: '2026-10-22T12:30:00.000Z',
            filename: 'source.mov',
            filetype: 'video/quicktime',
            jobid: JOB_ID,
            generation: '1',
            meta: '{"jobId":"job-001","generation":1}',
        });
        expect(fetchMock.mock.calls.map(([url, request]) => `${request?.method ?? 'GET'} ${String(url)}`)).toEqual([
            `POST ${API}?direct_user=true`,
            `HEAD ${TUS_URL}`,
            `GET ${API}/${V.UID}`,
        ]);
        // The tus HEAD is a capability URL: no API token travels with it.
        expect(new Headers(fetchMock.mock.calls[1][1]?.headers).has('Authorization')).toBe(false);
    });

    it.each([
        ['another host', { location: `https://upload.example.com/tus/${V.UID}` }],
        ['a port', { location: `https://upload.cloudflarestream.com:8443/tus/${V.UID}` }],
        ['plain http', { location: `http://upload.cloudflarestream.com/tus/${V.UID}` }],
        ['a non-hex uid', { 'stream-media-id': 'NOT-A-UID' }],
        ['a short uid', { 'stream-media-id': 'abc123' }],
    ])('refuses a 201 with %s', async (_label, headers) => {
        vi.stubGlobal('fetch', transport({ create: () => createResponse(headers) }));
        await expect(provider().createUpload(uploadInput)).rejects.toThrow('provider_create_ambiguous');
    });

    it('requires Upload-Length == expected and offset 0 after creation, deleting the refused UID', async () => {
        const fetchMock = transport({ head: () => headResponse('head-created.json', { LENGTH: '19999999' }) });
        vi.stubGlobal('fetch', fetchMock);
        await expect(provider().createUpload(uploadInput)).rejects.toThrow('provider_create_ambiguous');
        expect(fetchMock.mock.calls.some(([url, init]) => init?.method === 'DELETE' && String(url) === `${API}/${V.UID}`)).toBe(true);
    });

    it('asserts the echoed maxDurationSeconds, signed URLs and meta routing before leaving creation', async () => {
        for (const video of [
            () => pendingVideo({ maxDurationSeconds: 36000 }),
            () => pendingVideo({ maxDurationSeconds: undefined }),
            () => pendingVideo({ requireSignedURLs: false }),
            () => pendingVideo({ meta: { name: 'youtick-other-g1' } }),
        ]) {
            const fetchMock = transport({ video });
            vi.stubGlobal('fetch', fetchMock);
            await expect(provider().createUpload(uploadInput)).rejects.toThrow('provider_create_ambiguous');
            expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
        }
    });

    it('maps storage exhaustion to provider_admission_closed and other limits to provider_unavailable', async () => {
        const exhausted = await streamJson('storage-exhausted-413.json');
        const cases: [Response, string][] = [
            [Response.json(exhausted, { status: 413 }), 'provider_admission_closed'],
            [Response.json(exhausted, { status: 429 }), 'provider_admission_closed'],
            [Response.json({ success: false, errors: [{ code: 971, message: 'Rate limited' }] }, { status: 429 }), 'provider_unavailable'],
            [new Response('upstream', { status: 503 }), 'provider_unavailable'],
            [new Response(null, { status: 400 }), 'provider_create_ambiguous'],
        ];
        for (const [response, code] of cases) {
            vi.stubGlobal('fetch', transport({ create: () => response }));
            await expect(provider().createUpload(uploadInput)).rejects.toThrow(code);
        }
    });

    it('refuses to create without a valid cap, account or token, or for a Studio hash', async () => {
        vi.stubGlobal('fetch', transport());
        await expect(provider({ maxDurationSeconds: 7201 }).createUpload(uploadInput)).rejects.toThrow('runtime_not_configured');
        await expect(provider({ accountId: 'x' }).createUpload(uploadInput)).rejects.toThrow('runtime_not_configured');
        await expect(provider({ apiToken: 'short' }).createUpload(uploadInput)).rejects.toThrow('runtime_not_configured');
        await expect(provider().createUpload({
            ...uploadInput, profileConfigSha256: '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77',
        })).rejects.toThrow('runtime_not_configured');
    });

    it('omits expiry when no lease deadline is known', () => {
        const { uploadExpiresAtMs: _omit, ...input } = uploadInput;
        expect(Object.keys(decodeMetadata(streamUploadMetadata(input, 60)))).not.toContain('expiry');
    });
});

describe('Cloudflare Stream adapter: tus offset', () => {
    it('reads offset and length before and after completion', async () => {
        vi.stubGlobal('fetch', transport({ head: () => headResponse('head-created.json') }));
        expect(await provider().readTusOffset(TUS_URL)).toEqual({ offsetBytes: '0', lengthBytes: V.LENGTH });
        vi.stubGlobal('fetch', transport({ head: () => headResponse('head-complete.json') }));
        expect(await provider().readTusOffset(TUS_URL)).toEqual({ offsetBytes: V.LENGTH, lengthBytes: V.LENGTH });
    });

    it('fails closed on overflow, expiry, a foreign host and transients', async () => {
        vi.stubGlobal('fetch', transport({ head: () => headResponse('head-overflow.json') }));
        await expect(provider().readTusOffset(TUS_URL)).rejects.toThrow('provider_tus_state_invalid');
        for (const status of [404, 410]) {
            vi.stubGlobal('fetch', transport({ head: () => new Response(null, { status }) }));
            await expect(provider().readTusOffset(TUS_URL)).rejects.toThrow('provider_tus_url_expired');
        }
        vi.stubGlobal('fetch', transport({ head: () => new Response(null, { status: 503 }) }));
        await expect(provider().readTusOffset(TUS_URL)).rejects.toThrow('provider_unavailable');
        const fetchMock = transport();
        vi.stubGlobal('fetch', fetchMock);
        await expect(provider().readTusOffset('https://origin.example.com/tus/x')).rejects.toThrow('provider_tus_state_invalid');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('Cloudflare Stream adapter: reads and deletes', () => {
    it.each([
        ['video-queued.json', 'processing', 'stream:queued'],
        ['video-inprogress.json', 'processing', 'stream:inprogress'],
        ['video-ready-33.json', 'ready', 'vod'],
        ['video-ready.json', 'ready', 'vod'],
        ['video-inprogress-lagging.json', 'processing', 'stream:inprogress'],
    ])('normalizes %s from one GET', async (name, phase, kind) => {
        const body = await streamJson(name);
        vi.stubGlobal('fetch', transport({ video: () => Response.json(body) }));
        const asset = await provider().readAsset(V.UID);
        expect(asset).toMatchObject({ id: V.UID, playbackId: V.UID, projectId: V.ACCOUNT_ID, policy: 'jwt', phase });
        expect(asset.sizeBytes).toBeUndefined();
        expect(asset.stream?.route).toEqual({ jobId: JOB_ID, generation: 1 });
        const playback = await provider().readPlayback(V.UID);
        expect(playback.kind).toBe(kind);
        expect(playback.sources).toEqual([expect.objectContaining({
            kind: 'hls', url: `https://customer-${V.CUSTOMER_CODE}.cloudflarestream.com/${V.UID}/manifest/video.m3u8`,
        })]);
    });

    it('maps 404 to provider_asset_missing and transients to provider_unavailable', async () => {
        vi.stubGlobal('fetch', transport({ video: async () => Response.json(await streamJson('not-found-404.json'), { status: 404 }) }));
        await expect(provider().readAsset(V.UID)).rejects.toThrow('provider_asset_missing');
        vi.stubGlobal('fetch', transport({ video: () => new Response(null, { status: 502 }) }));
        await expect(provider().readAsset(V.UID)).rejects.toThrow('provider_unavailable');
    });

    it('deletes: 200 deleted, 404 missing, anything else ambiguous', async () => {
        vi.stubGlobal('fetch', transport());
        expect(await provider().deleteAsset(V.UID)).toBe('deleted');
        vi.stubGlobal('fetch', transport({ del: () => new Response(null, { status: 404 }) }));
        expect(await provider().deleteAsset(V.UID)).toBe('missing');
        vi.stubGlobal('fetch', transport({ del: () => new Response(null, { status: 500 }) }));
        await expect(provider().deleteAsset(V.UID)).rejects.toThrow('provider_delete_ambiguous');
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
        await expect(provider().deleteAsset(V.UID)).rejects.toThrow('provider_delete_ambiguous');
    });

    it('reads storage usage', async () => {
        const body = await streamJson('storage-usage.json');
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => (
            String(url) === `${API}/storage-usage` ? Response.json(body) : new Response(null, { status: 599 })
        )));
        expect(await provider().readStorageUsage()).toEqual({ totalStorageMinutes: 3, totalStorageMinutesLimit: 1000 });
    });
});

async function signedWebhook(
    name: string,
    options: { secret?: string; timeSeconds?: number; body?: Record<string, unknown> } = {},
): Promise<{ raw: Uint8Array; headers: Headers }> {
    const fixture = await streamJson<{ headers: Record<string, string>; body: Record<string, unknown> }>(name);
    const raw = new TextEncoder().encode(JSON.stringify(options.body ?? fixture.body));
    const time = String(options.timeSeconds ?? Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(options.secret ?? WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const signed = new Uint8Array([...new TextEncoder().encode(`${time}.`), ...raw]);
    const sig = hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, signed)));
    return { raw, headers: new Headers({ ...fixture.headers, 'webhook-signature': `time=${time},sig1=${sig}` }) };
}

describe('Cloudflare Stream adapter: webhooks', () => {
    it('verifies time.body with the current or previous secret and normalizes ready, error and inprogress', async () => {
        const ready = await signedWebhook('webhook-ready.json');
        const event = await provider().verifyWebhook(ready.raw, ready.headers, Date.now());
        expect(event).toMatchObject({
            provider: 'stream', event: 'ready', phase: 'ready', providerEvent: 'stream.ready',
            assetId: V.UID, route: { jobId: JOB_ID, generation: 1 },
        });
        expect(event!.digest).toMatch(/^[0-9a-f]{64}$/);
        const previous = await signedWebhook('webhook-error-duration.json', { secret: PREVIOUS_SECRET });
        expect(await provider().verifyWebhook(previous.raw, previous.headers, Date.now())).toMatchObject({
            event: 'failed', phase: 'failed', failureCode: 'ERR_DURATION_EXCEED_CONSTRAINT',
        });
        const progress = await signedWebhook('webhook-inprogress.json');
        expect(await provider().verifyWebhook(progress.raw, progress.headers, Date.now())).toMatchObject({
            event: 'processing', phase: 'processing',
        });
    });

    it('refuses a wrong secret, a tampered body, a stale time and a malformed header', async () => {
        const wrong = await signedWebhook('webhook-ready.json', { secret: 'some-other-secret-value' });
        await expect(provider().verifyWebhook(wrong.raw, wrong.headers, Date.now())).rejects.toThrow('invalid_webhook_signature');
        const tampered = await signedWebhook('webhook-ready.json');
        tampered.raw[tampered.raw.length - 2] ^= 1;
        await expect(provider().verifyWebhook(tampered.raw, tampered.headers, Date.now())).rejects.toThrow('invalid_webhook_signature');
        const stale = await signedWebhook('webhook-ready.json', { timeSeconds: Math.floor(Date.now() / 1000) - 301 });
        await expect(provider().verifyWebhook(stale.raw, stale.headers, Date.now())).rejects.toThrow('webhook_expired');
        for (const header of ['', 'time=abc,sig1=00', `sig1=${'0'.repeat(64)}`, `time=${Math.floor(Date.now() / 1000)}`]) {
            await expect(provider().verifyWebhook(stale.raw, new Headers({ 'webhook-signature': header }), Date.now()))
                .rejects.toThrow('invalid_webhook_signature');
        }
        await expect(provider({ webhookSecrets: [undefined, ''] }).verifyWebhook(
            (await signedWebhook('webhook-ready.json')).raw, (await signedWebhook('webhook-ready.json')).headers, Date.now(),
        )).rejects.toThrow('invalid_webhook_signature');
    });

    it('routes by whichever meta shape appears, with a 128-character job id, and drops conflicts', async () => {
        const variants = await streamJson<Record<string, Record<string, unknown>>>('meta-variants.json');
        const valid = (value: string) => /^[A-Za-z0-9._:-]{1,128}$/.test(value);
        for (const shape of ['plain', 'json', 'object', 'nameOnly']) {
            expect(streamWebhookRoute(variants[shape], valid), shape).toEqual({ jobId: JOB_ID, generation: 1 });
        }
        expect(streamWebhookRoute(variants.conflict, valid)).toBeNull();
        expect(streamWebhookRoute({}, valid)).toBeNull();
        const longJob = `j${'x'.repeat(127)}`;
        const long = await streamJson<Record<string, Record<string, unknown>>>('meta-variants.json', { JOB_ID: longJob });
        expect(streamWebhookRoute(long.plain, valid)).toEqual({ jobId: longJob, generation: 1 });
        expect(streamWebhookRoute(long.json, valid)).toEqual({ jobId: longJob, generation: 1 });
        const tooLong = await streamJson<Record<string, Record<string, unknown>>>('meta-variants.json', { JOB_ID: `${longJob}y` });
        expect(streamWebhookRoute(tooLong.plain, valid)).toBeNull();
    });

    it('folds the signed time into the digest on both the ingress and the job-object parse', async () => {
        const ready = await signedWebhook('webhook-ready.json', { timeSeconds: 1_790_000_000 });
        const verified = await provider().verifyWebhook(ready.raw, ready.headers, 1_790_000_000_000);
        const parsed = await provider().parseWebhook(ready.raw, { timestampMs: 1_790_000_000_000 });
        expect(parsed!.digest).toBe(verified!.digest);
        expect(parsed!.timestampMs).toBe(1_790_000_000_000);
        expect((await provider().parseWebhook(ready.raw))!.digest).not.toBe(verified!.digest);
        await expect(provider().parseWebhook(new TextEncoder().encode('{"uid":"x"}'))).rejects.toThrow('invalid_webhook');
    });
});

function decodeSegment(segment: string): Record<string, unknown> {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(padded + '='.repeat((4 - padded.length % 4) % 4)));
}

async function verifyJwt(token: string, key: CryptoKey): Promise<boolean> {
    const [header, payload, signature] = token.split('.');
    const bytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - signature.length % 4) % 4)), (c) => c.charCodeAt(0));
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes, new TextEncoder().encode(`${header}.${payload}`));
}

describe('Cloudflare Stream adapter: RS256 path tokens', () => {
    it('signs exactly {sub, kid, exp, nbf} with header {alg, kid} and puts the token in the path', async () => {
        const signed = await provider().signPlayback(V.UID, 180, 1_790_000_000);
        const [header, payload] = signed.token.split('.');
        expect(decodeSegment(header)).toEqual({ alg: 'RS256', kid: KEY_ID });
        expect(decodeSegment(payload)).toEqual({ sub: V.UID, kid: KEY_ID, exp: 1_790_000_180, nbf: 1_789_999_940 });
        expect(Object.keys(decodeSegment(payload))).not.toContain('downloadable');
        expect(await verifyJwt(signed.token, keys.publicKey)).toBe(true);
        expect(signed.expiresAtSeconds).toBe(1_790_000_180);
        expect(signed.hlsUrl).toBe(`https://customer-${V.CUSTOMER_CODE}.cloudflarestream.com/${signed.token}/manifest/video.m3u8`);
        expect(signed.previewVttUrl).toBeUndefined();
    });

    it('enforces 1 s..24 h lifetimes and a UID subject', async () => {
        await expect(provider().signPlayback(V.UID, 86_401)).rejects.toThrow('runtime_not_configured');
        await expect(provider().signPlayback(V.UID, 0)).rejects.toThrow('runtime_not_configured');
        await expect(provider().signPlayback('playback-123', 180)).rejects.toThrow('runtime_not_configured');
        expect((await provider().signPlayback(V.UID, 86_400)).expiresAtSeconds).toBeGreaterThan(0);
        await expect(provider({ signingKey: 'not-a-key'.repeat(10) }).signPlayback(V.UID, 180)).rejects.toThrow('runtime_not_configured');
        await expect(provider({ customerCode: 'Bad.Code' }).signPlayback(V.UID, 180)).rejects.toThrow('runtime_not_configured');
    });

    it('detects the key by prefix: PKCS8 PEM, base64 PEM, base64 PKCS1 PEM, JWK JSON and base64 JWK', async () => {
        for (const signingKey of [keys.privatePem, `  ${btoa(keys.privatePem)}\n`]) {
            expect(await verifyJwt((await provider({ signingKey }).signPlayback(V.UID, 180)).token, keys.publicKey)).toBe(true);
        }
        for (const signingKey of [keys.pkcs1Base64, keys.jwkBase64, atob(keys.jwkBase64)]) {
            expect(await verifyJwt((await provider({ signingKey }).signPlayback(V.UID, 180)).token, keys.pkcs1PublicKey)).toBe(true);
        }
    });
});

describe('Cloudflare Stream adapter: shape', () => {
    it('declares the Stream capabilities, hosts and profile', () => {
        const adapter = provider();
        expect(adapter.id).toBe('stream');
        expect(adapter.capabilities).toEqual({
            storyboard: false, mp4: false, sourceHash: false, deleteWebhook: false, customLadder: false,
            sourceBytesProof: 'tus-offset', tokenPlacement: 'path',
        });
        expect(STREAM_CAPABILITIES).toBe(adapter.capabilities);
        expect(adapter.hostAllowlist()).toEqual({
            exact: [`customer-${V.CUSTOMER_CODE}.cloudflarestream.com`], suffixes: [],
        });
        expect(provider({ customerCode: undefined }).hostAllowlist().exact).toEqual([]);
        expect(adapter.supportsProfile(STREAM_PROFILE_HASH)).toBe(true);
        expect(adapter.supportsProfile('96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77')).toBe(false);
    });

    it('binds identity to uid == asset == playback, the account and the meta route', async () => {
        vi.stubGlobal('fetch', transport({ video: async () => Response.json(await streamJson('video-ready.json')) }));
        const asset = await provider().readAsset(V.UID);
        const expected = { jobId: JOB_ID, generation: 1, assetId: V.UID, playbackId: V.UID, projectId: V.ACCOUNT_ID };
        expect(provider().identityMatches(asset, expected)).toBe(true);
        expect(provider().identityMatches(asset, { ...expected, generation: 2 })).toBe(false);
        expect(provider().identityMatches(asset, { ...expected, playbackId: 'other' })).toBe(false);
        expect(provider().identityMatches(asset, { ...expected, projectId: 'f'.repeat(32) })).toBe(false);
        expect(provider().identityMatches({ ...asset, policy: 'public' }, expected)).toBe(false);
    });

    it('names no Studio host or header and logs no credential', async () => {
        const source = await (await import(/* @vite-ignore */ ['node', 'fs/promises'].join(':')) as {
            readFile(path: URL, encoding: 'utf8'): Promise<string>;
        }).readFile(new URL('./cloudflare-stream-provider.ts', (import.meta as unknown as { url: string }).url), 'utf8');
        expect(source).not.toMatch(/livepeer|lp-playback|Livepeer-Jwt|Livepeer-Signature/i);
        const logs: string[] = [];
        vi.spyOn(console, 'info').mockImplementation((line: string) => { logs.push(String(line)); });
        vi.spyOn(console, 'error').mockImplementation((line: string) => { logs.push(String(line)); });
        vi.stubGlobal('fetch', transport());
        await provider().createUpload(uploadInput);
        const signed = await provider().signPlayback(V.UID, 180);
        expect(logs.length).toBeGreaterThan(0);
        for (const line of logs) {
            expect(line).not.toContain(API_TOKEN);
            expect(line).not.toContain(signed.token.split('.')[0] + '.');
            expect(line).not.toContain(TUS_URL);
            expect(line).not.toContain(V.UID);
        }
        expect(await rawStreamFixture('create-201.json')).toContain('<UID>');
    });
});

describe('Cloudflare Stream adapter: cover', () => {
    it('reads thumbnail.jpg with a 120 s path token and no header, keeping the cover rules', async () => {
        const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(jpeg, {
            headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(jpeg.byteLength) },
        }));
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
        const cover = await provider().readCover(V.UID);
        expect(cover).toEqual({ bytes: jpeg, contentType: 'image/jpeg' });
        const [input, init] = fetchMock.mock.calls[0];
        const url = new URL(String(input));
        expect(url.hostname).toBe(`customer-${V.CUSTOMER_CODE}.cloudflarestream.com`);
        const [, token, ...rest] = url.pathname.split('/');
        expect(rest.join('/')).toBe('thumbnails/thumbnail.jpg');
        expect(decodeSegment(token.split('.')[1])).toEqual({ sub: V.UID, kid: KEY_ID, exp: 1_790_000_120, nbf: 1_789_999_940 });
        expect([...new Headers(init?.headers).keys()]).toEqual([]);
        expect(init?.redirect).toBe('manual');

        fetchMock.mockImplementationOnce(async () => new Response(null, { status: 401 }));
        await expect(provider().readCover(V.UID)).rejects.toThrow('publication_cover_image_denied');
        fetchMock.mockImplementationOnce(async () => new Response('x', { headers: { 'Content-Type': 'text/html' } }));
        await expect(provider().readCover(V.UID)).rejects.toThrow('publication_cover_image_type');
        // Bytes that echo the API token are refused (the sensitive-byte scan covers the token and the key).
        const echo = new Uint8Array([0xff, 0xd8, 0xff, ...new TextEncoder().encode(API_TOKEN), 0xff, 0xd9]);
        fetchMock.mockImplementationOnce(async () => new Response(echo, { headers: { 'Content-Type': 'image/jpeg' } }));
        await expect(provider().readCover(V.UID)).rejects.toThrow('provider_playback_mismatch');
    });
});
