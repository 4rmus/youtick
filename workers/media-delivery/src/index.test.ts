import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from './index';

type TestHandler = {
    fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
};

function createMockCache() {
    const store = new Map<string, Response>();
    return {
        match: vi.fn(async (request: Request) => store.get(request.url)),
        put: vi.fn(async (request: Request, response: Response) => {
            store.set(request.url, response);
        }),
    };
}

async function importHandler(): Promise<TestHandler> {
    const mod = await import('./index');
    return mod.default as TestHandler;
}

function createEnv(overrides?: Partial<Env>): Env {
    return {
        ALLOWED_ORIGINS: 'https://youtick.net,http://localhost:3000,http://localhost:3001',
        CRUST_READ_ENDPOINT: '',
        IPFS_GATEWAY_BASES: 'https://gateway-a.example/ipfs,https://gateway-b.example/ipfs',
        CACHE_TTL_SECONDS: '120',
        CACHE_VERSION: 'v1',
        ...overrides,
    };
}

describe('media-delivery', () => {
    let cache: ReturnType<typeof createMockCache>;
    let waitUntil: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        cache = createMockCache();
        waitUntil = vi.fn();
        (globalThis as unknown as { caches: { default: typeof cache } }).caches = { default: cache };
    });

    it('returns health without using the media cache', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://media.youtick.net/__health', {
                headers: { Origin: 'https://youtick.net' },
            }),
            createEnv(),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://youtick.net');
        expect(cache.match).not.toHaveBeenCalled();

        const body = await response.json() as Record<string, unknown>;
        expect(body.status).toBe('ok');
        expect(body.service).toBe('media-delivery');
        expect(body.gateways).toBe(2);
    });

    it('fetches an IPFS asset from the first healthy gateway and caches it', async () => {
        const fetchMock = vi.fn(async () => new Response('encrypted-manifest', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://media.youtick.net/ipfs/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/manifest.json'),
            createEnv(),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('encrypted-manifest');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://gateway-a.example/ipfs/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/manifest.json',
            expect.objectContaining({ method: 'GET' }),
        );
        expect(response.headers.get('X-Media-Delivery-Cache')).toBe('MISS');
        expect(response.headers.get('X-Media-Delivery-Upstream')).toBe('https://gateway-a.example/ipfs');
        expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=120');
        expect(cache.put).toHaveBeenCalledOnce();
        expect(waitUntil).toHaveBeenCalledOnce();
    });

    it('uses the Lighthouse gateway first by default', async () => {
        const fetchMock = vi.fn(async () => new Response('lighthouse-manifest', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://media.youtick.net/ipfs/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/manifest.json'),
            createEnv({ CRUST_READ_ENDPOINT: undefined, IPFS_GATEWAY_BASES: undefined }),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://gateway.lighthouse.storage/ipfs/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/manifest.json',
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('uses the Crust read API before public gateways when configured', async () => {
        const fetchMock = vi.fn(async () => new Response('fresh-manifest', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://media.youtick.net/ipfs/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/manifest.json'),
            createEnv({ CRUST_READ_ENDPOINT: 'https://crust.example/api/v0/cat' }),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('fresh-manifest');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://crust.example/api/v0/cat?arg=bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja%2Fmanifest.json',
            expect.objectContaining({ method: 'POST' }),
        );
        expect(response.headers.get('X-Media-Delivery-Upstream')).toBe('https://crust.example/api/v0/cat');
    });

    it('serves cached non-Range GET responses before calling upstream', async () => {
        const cached = new Response('cached-segment', {
            status: 200,
            headers: { 'Content-Type': 'application/octet-stream' },
        });
        await cache.put(
            new Request('https://media.youtick.net/ipfs/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/segments/0001.bin?__cv=v1'),
            cached,
        );
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://media.youtick.net/ipfs/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/segments/0001.bin'),
            createEnv(),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('cached-segment');
        expect(response.headers.get('X-Media-Delivery-Cache')).toBe('HIT');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('forwards Range requests and bypasses cache writes', async () => {
        const fetchMock = vi.fn(async () => new Response('partial', {
            status: 206,
            headers: {
                'Content-Range': 'bytes 0-6/100',
                'Accept-Ranges': 'bytes',
            },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://media.youtick.net/ipfs/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/segments/0001.bin', {
                headers: { Range: 'bytes=0-6' },
            }),
            createEnv(),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(206);
        expect(response.headers.get('Content-Range')).toBe('bytes 0-6/100');
        expect(response.headers.get('X-Media-Delivery-Cache')).toBe('BYPASS');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://gateway-a.example/ipfs/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/segments/0001.bin',
            expect.objectContaining({
                method: 'GET',
                headers: expect.any(Headers) as Headers,
            }),
        );
        const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
        const requestInit = calls[0][1];
        expect((requestInit.headers as Headers).get('Range')).toBe('bytes=0-6');
        expect(cache.put).not.toHaveBeenCalled();
    });

    it('falls back to the next gateway when the first one fails', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.startsWith('https://gateway-a.example')) {
                return new Response('missing', { status: 504 });
            }
            return new Response('ok-from-b', { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://media.youtick.net/ipfs/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/manifest.json'),
            createEnv(),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('ok-from-b');
        expect(response.headers.get('X-Media-Delivery-Upstream')).toBe('https://gateway-b.example/ipfs');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('times out a slow gateway before trying the next one', async () => {
        const fetchMock = vi.fn((url: string, init?: RequestInit) => {
            if (url.startsWith('https://gateway-a.example')) {
                return new Promise<Response>((_resolve, reject) => {
                    const signal = init?.signal;
                    signal?.addEventListener('abort', () => {
                        reject(new DOMException('The operation was aborted.', 'AbortError'));
                    }, { once: true });
                });
            }

            return Promise.resolve(new Response('fast-fallback', { status: 200 }));
        });
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://media.youtick.net/ipfs/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/manifest.json'),
            createEnv({ UPSTREAM_TIMEOUT_MS: '5' }),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('fast-fallback');
        expect(response.headers.get('X-Media-Delivery-Upstream')).toBe('https://gateway-b.example/ipfs');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('verifies and serves a raw-CID block whose bytes match the content address', async () => {
        // bafkrei... = CIDv1 raw sha2-256 of the exact bytes "hello-segment".
        const rawCid = 'bafkreiarrg3lo7wwgsxigewmyxxl2k2nuxwfkiljttyfw5rlnyt2dpoykm';
        const fetchMock = vi.fn(async () => new Response('hello-segment', {
            status: 200,
            headers: { 'Content-Type': 'application/octet-stream' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request(`https://media.youtick.net/ipfs/${rawCid}`),
            createEnv(),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('hello-segment');
        expect(cache.put).toHaveBeenCalledOnce();
    });

    it('rejects a raw-CID block when the gateway returns tampered bytes', async () => {
        const rawCid = 'bafkreiarrg3lo7wwgsxigewmyxxl2k2nuxwfkiljttyfw5rlnyt2dpoykm';
        const fetchMock = vi.fn(async () => new Response('tampered-bytes', {
            status: 200,
            headers: { 'Content-Type': 'application/octet-stream' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request(`https://media.youtick.net/ipfs/${rawCid}`),
            createEnv(),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(502);
        expect(await response.json()).toMatchObject({ error: 'cid_integrity_mismatch', cid: rawCid });
        expect(cache.put).not.toHaveBeenCalled();
    });

    it('skips integrity verification for sub-path requests under a raw CID', async () => {
        const rawCid = 'bafkreiarrg3lo7wwgsxigewmyxxl2k2nuxwfkiljttyfw5rlnyt2dpoykm';
        const fetchMock = vi.fn(async () => new Response('child-block-bytes', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request(`https://media.youtick.net/ipfs/${rawCid}/segments/0001.bin`),
            createEnv(),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('child-block-bytes');
    });

    it('passes through dag-pb CIDs without integrity verification', async () => {
        const fetchMock = vi.fn(async () => new Response('dag-pb-bytes', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://media.youtick.net/ipfs/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja'),
            createEnv(),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('dag-pb-bytes');
    });

    it('honours VERIFY_CID_INTEGRITY=false as an escape hatch', async () => {
        const rawCid = 'bafkreiarrg3lo7wwgsxigewmyxxl2k2nuxwfkiljttyfw5rlnyt2dpoykm';
        const fetchMock = vi.fn(async () => new Response('tampered-bytes', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request(`https://media.youtick.net/ipfs/${rawCid}`),
            createEnv({ VERIFY_CID_INTEGRITY: 'false' }),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('tampered-bytes');
    });

    it('rejects invalid CID paths before upstream fetch', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://media.youtick.net/ipfs/not-a-cid/manifest.json'),
            createEnv(),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'invalid_cid' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('handles CORS preflight for Range requests from allowed origins', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://media.youtick.net/ipfs/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/manifest.json', {
                method: 'OPTIONS',
                headers: { Origin: 'http://localhost:3000' },
            }),
            createEnv(),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
        expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Range');
    });

    it('does not allow localhost from production defaults', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://media.youtick.net/ipfs/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/manifest.json', {
                method: 'OPTIONS',
                headers: { Origin: 'http://localhost:3000' },
            }),
            createEnv({ ALLOWED_ORIGINS: undefined }),
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
});
