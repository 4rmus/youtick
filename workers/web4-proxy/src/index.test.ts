import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Cloudflare Workers globals
const createMockCache = () => {
    const store = new Map<string, Response>();
    return {
        match: vi.fn(async (req: Request) => store.get(req.url) || undefined),
        put: vi.fn(async (req: Request, res: Response) => { store.set(req.url, res); }),
        delete: vi.fn(async () => true),
    };
};

// We need to import the handler after setting up mocks
const importHandler = async () => {
    const mod = await import('./index');
    return mod.default;
};

describe('web4-proxy', () => {
    let mockCache: ReturnType<typeof createMockCache>;
    let handler: ExportedHandler<Env>;

    const createEnv = (): Env => ({
        WEB4_ORIGIN: 'https://youtick.near.page',
        WEB4_FALLBACK_ORIGIN: 'https://fallback.youtick.near.page',
        ALLOWED_DOMAINS: 'youtick.net,www.youtick.net',
        CACHE_TTL: '300',
        CACHE_VERSION: 'v1',
    });

    beforeEach(async () => {
        mockCache = createMockCache();
        (globalThis as any).caches = { default: mockCache };
        handler = await importHandler();
    });

    it('returns 421 for disallowed hostnames', async () => {
        const request = new Request('https://evil.com/some-path');
        const env = createEnv();
        const response = await handler.fetch(request, env, {} as ExecutionContext);
        expect(response.status).toBe(421);
        const text = await response.text();
        expect(text).toContain('Host is not allowed');
    });

    it('redirects www.youtick.net to youtick.net with 308', async () => {
        const request = new Request('https://www.youtick.net/some-path?query=1');
        const env = createEnv();
        const response = await handler.fetch(request, env, {} as ExecutionContext);
        expect(response.status).toBe(308);
        expect(response.headers.get('Location')).toBe('https://youtick.net/some-path?query=1');
    });

    it('returns health check JSON at /__health', async () => {
        const request = new Request('https://youtick.net/__health');
        const env = createEnv();
        const response = await handler.fetch(request, env, {} as ExecutionContext);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/json');
        const body = await response.json() as Record<string, unknown>;
        expect(body.status).toBe('ok');
        expect(body.proxy).toBe('web4-proxy');
        expect(body.origin).toBe(env.WEB4_ORIGIN);
        expect(body.canonicalHost).toBe('youtick.net');
        expect(body.timestamp).toBeTruthy();
    });

    it('skips cache for /__health', async () => {
        const request = new Request('https://youtick.net/__health');
        const env = createEnv();
        await handler.fetch(request, env, {} as ExecutionContext);
        expect(mockCache.match).not.toHaveBeenCalled();
    });

    it('returns 502 when all origins fail', async () => {
        globalThis.fetch = vi.fn(async () => {
            throw new Error('Network error');
        });

        const request = new Request('https://youtick.net/some-page');
        const env = createEnv();
        const response = await handler.fetch(request, env, {} as ExecutionContext);
        expect(response.status).toBe(502);
        expect(response.headers.get('Content-Type')).toContain('text/html');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        const text = await response.text();
        expect(text).toContain('Temporarily Unavailable');
    });

    it('sets security headers on proxied responses', async () => {
        globalThis.fetch = vi.fn(async () => {
            return new Response('<html></html>', {
                status: 200,
                headers: { 'Content-Type': 'text/html' },
            });
        });

        const request = new Request('https://youtick.net/');
        const env = createEnv();
        const response = await handler.fetch(request, env, {
            waitUntil: vi.fn(),
        } as unknown as ExecutionContext);

        expect(response.status).toBe(200);
        expect(response.headers.get('X-Proxy')).toBe('youtick-web4');
        expect(response.headers.get('X-Web4-Origin')).toBe(env.WEB4_ORIGIN);
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(response.headers.get('X-Frame-Options')).toBe('DENY');
        expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    });

    it('sets long cache headers for static hashed assets', async () => {
        globalThis.fetch = vi.fn(async () => {
            return new Response('console.log(1)', {
                status: 200,
                headers: { 'Content-Type': 'application/javascript' },
            });
        });

        const request = new Request('https://youtick.net/_next/static/chunk-abc123.js');
        const env = createEnv();
        const response = await handler.fetch(request, env, {
            waitUntil: vi.fn(),
        } as unknown as ExecutionContext);

        expect(response.status).toBe(200);
        const cc = response.headers.get('Cache-Control');
        expect(cc).toContain('immutable');
        expect(cc).toContain('max-age=31536000');
    });

    it('sets short cache headers for HTML pages', async () => {
        globalThis.fetch = vi.fn(async () => {
            return new Response('<html></html>', {
                status: 200,
                headers: { 'Content-Type': 'text/html' },
            });
        });

        const request = new Request('https://youtick.net/watch/some-event');
        const env = createEnv();
        const response = await handler.fetch(request, env, {
            waitUntil: vi.fn(),
        } as unknown as ExecutionContext);

        expect(response.status).toBe(200);
        const cc = response.headers.get('Cache-Control');
        expect(cc).toContain('max-age=0');
        expect(cc).toContain('must-revalidate');
    });

    it('tries fallback origin when primary returns 5xx', async () => {
        const fetchMock = vi.fn();
        fetchMock.mockImplementationOnce(async () => {
            return new Response('Error', { status: 503 });
        });
        fetchMock.mockImplementationOnce(async () => {
            return new Response('OK', { status: 200 });
        });
        globalThis.fetch = fetchMock;

        const request = new Request('https://youtick.net/');
        const env = createEnv();
        const response = await handler.fetch(request, env, {
            waitUntil: vi.fn(),
        } as unknown as ExecutionContext);

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
