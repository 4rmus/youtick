import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { type Env } from './index';

const RPC_URL = 'https://rpc.testnet.near.org';
const MARKET_ID = 'paid-media-livepeer-v1.testnet';
const ACCESS_ID = 'access.testnet';
const API_KEY = 'test-livepeer-api-key';
const JOB_ID = 'job-001';
const PLAYBACK_ID = 'playback-123';
const VTT_URL = `https://asset-cdn.lp-playback.com/hls/${PLAYBACK_ID}/thumbnails.vtt`;
const JPEG_URL = `https://asset-cdn.lp-playback.com/hls/${PLAYBACK_ID}/keyframes_0.jpg`;
const PNG_URL = `https://asset-cdn.lp-playback.com/hls/${PLAYBACK_ID}/keyframes_0.png`;
const COVER_URL = `https://bridge.youtick.test/v1/publication-covers/${JOB_ID}/1`;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const PNG = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),
    (character) => character.charCodeAt(0),
);

type FetchOptions = {
    availability?: string;
    generation?: number;
    vttUrl?: string;
    vttBody?: string;
    imageUrl?: string;
    imageResponse?: Response;
    reflectJwt?: boolean;
};

async function createEnv(): Promise<Env> {
    const pair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
    ) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer);
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey) as ArrayBuffer);
    const privatePem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----`;
    const publicPem = `-----BEGIN PUBLIC KEY-----\n${btoa(String.fromCharCode(...spki))}\n-----END PUBLIC KEY-----`;
    return {
        CF_VERSION_METADATA: {
            id: 'worker-version-test',
            tag: 'test',
            timestamp: '2026-08-08T00:00:00.000Z',
        },
        LIVEPEER_BRIDGE_ENABLED: 'true',
        LIVEPEER_API_KEY: API_KEY,
        NEAR_NETWORK: 'testnet',
        NEAR_RPC_URL: RPC_URL,
        MARKET_CONTRACT_ID: MARKET_ID,
        ACCESS_CONTRACT_ID: ACCESS_ID,
        LIVEPEER_JWT_PRIVATE_KEY: btoa(privatePem),
        LIVEPEER_JWT_PUBLIC_KEY: btoa(publicPem),
        LIVEPEER_JWT_ISSUER: 'https://youtick.test',
    };
}

function publication(options: FetchOptions = {}) {
    return {
        publication_id: JOB_ID,
        generation: options.generation ?? 1,
        playback_id: PLAYBACK_ID,
        availability: options.availability ?? 'ACTIVE',
    };
}

function providerPlayback(vttUrl = VTT_URL) {
    return {
        type: 'vod',
        meta: {
            playbackPolicy: { type: 'jwt' },
            source: [{ type: 'text/vtt', url: vttUrl }],
        },
    };
}

function rpcResponse(value: unknown): Response {
    return Response.json({
        jsonrpc: '2.0',
        result: { result: [...new TextEncoder().encode(JSON.stringify(value))] },
    });
}

function requestUrl(input: RequestInfo | URL): string {
    return typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
}

function requestHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
    return new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
}

function mockUpstreams(options: FetchOptions = {}) {
    const imageUrl = options.imageUrl ?? JPEG_URL;
    const imageName = imageUrl.slice(imageUrl.lastIndexOf('/') + 1);
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url === RPC_URL) return rpcResponse(publication(options));
        if (url === `https://livepeer.studio/api/playback/${PLAYBACK_ID}`) {
            expect(requestHeaders(input, init).get('Authorization')).toBe(`Bearer ${API_KEY}`);
            return Response.json(providerPlayback(options.vttUrl));
        }
        if (url === VTT_URL) {
            expect(requestHeaders(input, init).get('Livepeer-Jwt')).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
            return new Response(options.vttBody ?? `WEBVTT\n\n00:00:00.000 --> 00:00:03.000\n${imageName}\n`);
        }
        if (url === imageUrl) {
            const token = requestHeaders(input, init).get('Livepeer-Jwt');
            expect(token).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
            if (options.reflectJwt) {
                return new Response(new Blob([
                    new Uint8Array([0xff, 0xd8, 0xff]),
                    token!,
                    new Uint8Array([0xff, 0xd9]),
                ]), { headers: { 'Content-Type': 'image/jpeg' } });
            }
            return options.imageResponse ?? new Response(JPEG, {
                headers: { 'Content-Type': 'image/jpeg' },
            });
        }
        throw new Error(`Unexpected fetch: ${url}`);
    });
}

function createCache() {
    const entries = new Map<string, Response>();
    return {
        default: {
            match: vi.fn(async (request: Request) => entries.get(request.url)?.clone()),
            put: vi.fn(async (request: Request, response: Response) => {
                entries.set(request.url, response.clone());
            }),
        },
    };
}

describe('publication cover endpoint', () => {
    beforeEach(() => {
        vi.stubGlobal('caches', createCache());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('returns a bounded JPEG without exposing provider credentials or private URLs', async () => {
        const fetchMock = mockUpstreams();
        vi.stubGlobal('fetch', fetchMock);

        const response = await handler.fetch(new Request(COVER_URL), await createEnv());

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('image/jpeg');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);
        const publicHeaders = JSON.stringify([...response.headers]);
        expect(publicHeaders).not.toContain(API_KEY);
        expect(publicHeaders).not.toContain('Livepeer-Jwt');
        expect(publicHeaders).not.toContain(VTT_URL);
        expect(publicHeaders).not.toContain(JPEG_URL);
    });

    it('rechecks the final publication before serving a cache hit', async () => {
        const fetchMock = mockUpstreams();
        vi.stubGlobal('fetch', fetchMock);
        const env = await createEnv();

        expect((await handler.fetch(new Request(COVER_URL), env)).status).toBe(200);
        expect((await handler.fetch(new Request(COVER_URL), env)).status).toBe(200);

        expect(fetchMock.mock.calls.filter(([input]) => requestUrl(input) === RPC_URL)).toHaveLength(2);
        expect(fetchMock.mock.calls.filter(([input]) => (
            requestUrl(input) === `https://livepeer.studio/api/playback/${PLAYBACK_ID}`
        ))).toHaveLength(1);
    });

    it('returns and caches a Livepeer PNG with its verified content type', async () => {
        const fetchMock = mockUpstreams({
            imageUrl: PNG_URL,
            imageResponse: new Response(PNG, { headers: { 'Content-Type': 'image/png' } }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const env = await createEnv();

        const first = await handler.fetch(new Request(COVER_URL), env);
        const second = await handler.fetch(new Request(COVER_URL), env);

        expect(first.status).toBe(200);
        expect(first.headers.get('Content-Type')).toBe('image/png');
        expect(new Uint8Array(await first.arrayBuffer())).toEqual(PNG);
        expect(second.status).toBe(200);
        expect(second.headers.get('Content-Type')).toBe('image/png');
        expect(new Uint8Array(await second.arrayBuffer())).toEqual(PNG);
        expect(fetchMock.mock.calls.filter(([input]) => requestUrl(input) === PNG_URL)).toHaveLength(1);
    });

    it('uses the first frame when a VTT contains more than the verification probe limit', async () => {
        const cues = Array.from({ length: 40 }, (_, index) => (
            `00:00:${String(index).padStart(2, '0')}.000 --> 00:00:${String(index + 1).padStart(2, '0')}.000\nkeyframes_${index}.jpg`
        )).join('\n\n');
        const fetchMock = mockUpstreams({ vttBody: `WEBVTT\n\n${cues}\n` });
        vi.stubGlobal('fetch', fetchMock);

        const response = await handler.fetch(new Request(COVER_URL), await createEnv());

        expect(response.status).toBe(200);
        expect(fetchMock.mock.calls.filter(([input]) => requestUrl(input) === JPEG_URL)).toHaveLength(1);
    });

    it.each([
        ['TAKEDOWN', 1],
        ['ACTIVE', 2],
    ])('returns no cover for availability %s and generation %s', async (availability, generation) => {
        const fetchMock = mockUpstreams({ availability, generation });
        vi.stubGlobal('fetch', fetchMock);

        const response = await handler.fetch(new Request(COVER_URL), await createEnv());

        expect(response.status).toBe(404);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rejects a VTT URL outside the playback allowlist', async () => {
        const fetchMock = mockUpstreams({ vttUrl: 'https://example.com/private.vtt' });
        vi.stubGlobal('fetch', fetchMock);

        const response = await handler.fetch(new Request(COVER_URL), await createEnv());

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: 'publication_cover_unavailable' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('rejects an upstream JPEG that reflects the short-lived JWT', async () => {
        vi.stubGlobal('fetch', mockUpstreams({ reflectJwt: true }));

        const response = await handler.fetch(new Request(COVER_URL), await createEnv());

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: 'publication_cover_unavailable' });
    });

    it.each([
        ['denied', new Response(null, { status: 403 }), 'publication_cover_image_denied'],
        ['redirect', new Response(null, { status: 302, headers: { Location: JPEG_URL } }), 'publication_cover_image_redirected'],
        ['not found', new Response(null, { status: 404 }), 'publication_cover_image_status'],
        ['PNG MIME with JPEG bytes', new Response(JPEG, {
            headers: { 'Content-Type': 'image/png' },
        }), 'publication_cover_image_type'],
        ['JPEG MIME with PNG bytes', new Response(PNG, {
            headers: { 'Content-Type': 'image/jpeg' },
        }), 'publication_cover_image_type'],
        ['oversized JPEG', new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
            headers: { 'Content-Type': 'image/jpeg' },
        }), 'publication_cover_image_size'],
        ['invalid JPEG', new Response(new Uint8Array([0, 1, 2, 3]), {
            headers: { 'Content-Type': 'image/jpeg' },
        }), 'publication_cover_image_invalid'],
        ['truncated PNG', new Response(PNG.slice(0, -1), {
            headers: { 'Content-Type': 'image/png' },
        }), 'publication_cover_image_invalid'],
    ])('rejects a %s thumbnail response', async (_name, imageResponse, expectedCode) => {
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const fetchMock = mockUpstreams({ imageResponse });
        vi.stubGlobal('fetch', fetchMock);

        const response = await handler.fetch(new Request(COVER_URL), await createEnv());

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: 'publication_cover_unavailable' });
        expect(errorLog).toHaveBeenCalledWith(JSON.stringify({
            event: 'publication_cover_failed',
            details: { code: expectedCode },
        }));
    });
});
