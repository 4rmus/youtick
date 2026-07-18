import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Account, KeyPair } from 'near-api-js';
import type { Env } from './index';
import { createAtomicNamespace } from '../../shared/test/atomic-namespace';

// Mock Cloudflare Workers globals
const createMockCache = () => {
    const store = new Map<string, Response>();
    return {
        match: vi.fn(async (req: Request) => store.get(req.url) || undefined),
        put: vi.fn(async (req: Request, res: Response) => { store.set(req.url, res); }),
        delete: vi.fn(async () => true),
    };
};

type TestHandler = {
    fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
};

// We need to import the handler after setting up mocks
const importHandler = async () => {
    const mod = await import('./index');
    return mod.default as unknown as TestHandler;
};

describe('web4-proxy', () => {
    let mockCache: ReturnType<typeof createMockCache>;
    let handler: TestHandler;

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
        expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
        const text = await response.text();
        expect(text).toContain('Temporarily Unavailable');
    });

    it('sets security headers on proxied responses', async () => {
        globalThis.fetch = vi.fn(async () => {
            return new Response('<html><script>self.__next_f = []</script></html>', {
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
        expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
        expect(response.headers.get('Content-Security-Policy')).not.toContain("script-src 'self' 'unsafe-inline'");
        expect(response.headers.get('Content-Security-Policy')).not.toMatch(/connect-src[^;]*\shttps:(?:\s|;)/);
        expect(response.headers.get('Content-Security-Policy')).toContain('https://challenges.cloudflare.com');
        expect(response.headers.get('Content-Security-Policy')).toContain('frame-src https://challenges.cloudflare.com');
        expect(response.headers.get('Content-Security-Policy')).toContain('https://static.cloudflareinsights.com');
        expect(response.headers.get('Content-Security-Policy')).toContain('https://rsms.me');
        expect(response.headers.get('Content-Security-Policy')).toContain('https://fonts.cdnfonts.com');
        expect(response.headers.get('Content-Security-Policy')).toContain('font-src \'self\' data:');
        expect(response.headers.get('Content-Security-Policy')).toMatch(/'nonce-[a-f0-9]+'/);
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

    it('never distributes onboarding private keys', async () => {
        globalThis.fetch = vi.fn();
        const response = await handler.fetch(
            new Request('https://youtick.net/api/onboarding-key'),
            { ...createEnv(), ONBOARDING_KEYS: KeyPair.fromRandom('ed25519').toString() },
            {} as ExecutionContext,
        );

        expect(response.status).toBe(410);
        expect(await response.text()).not.toContain('ed25519:');
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('fails closed when Turnstile is not configured', async () => {
        globalThis.fetch = vi.fn();
        const response = await handler.fetch(
            new Request('https://youtick.net/api/onboarding-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'claim_free_ticket_direct',
                    args: { receiver_id: 'alice.near', encrypted_cid: 'bafy-test' },
                    turnstileToken: 'verified',
                }),
            }),
            { ...createEnv(), ONBOARDING_KEYS: 'ed25519:test-key' },
            { waitUntil: vi.fn() } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(503);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('returns a clear onboarding error when no key is configured', async () => {
        const request = new Request('https://youtick.net/api/onboarding-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'claim_free_ticket_direct',
                args: { receiver_id: 'alice.near', encrypted_cid: 'bafy-test' },
                turnstileToken: 'verified',
            }),
        });
        const response = await handler.fetch(request, createEnv(), {
            waitUntil: vi.fn(),
        } as unknown as ExecutionContext);

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'Onboarding key not configured' });
    });

    it('relays an allowlisted onboarding action without exposing the signer', async () => {
        const signerKey = KeyPair.fromRandom('ed25519').toString();
        const sign = vi.spyOn(Account.prototype, 'signAndSendTransaction').mockResolvedValue({
            transaction: { hash: 'relay-tx-hash' },
        } as Awaited<ReturnType<Account['signAndSendTransaction']>>);
        globalThis.fetch = vi.fn(async () => Response.json({ success: true }));

        const response = await handler.fetch(
            new Request('https://youtick.net/api/onboarding-key', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'CF-Connecting-IP': '203.0.113.10',
                },
                body: JSON.stringify({
                    action: 'claim_free_ticket_direct',
                    args: { receiver_id: 'alice.near', encrypted_cid: 'bafy-test' },
                    turnstileToken: 'verified',
                }),
            }),
            {
                ...createEnv(),
                ONBOARDING_KEYS: signerKey,
                TURNSTILE_SECRET_KEY: 'turnstile-secret',
                ATOMIC_STATE: createAtomicNamespace(),
            },
            {} as ExecutionContext,
        );

        expect(response.status).toBe(200);
        const payload = await response.text();
        expect(JSON.parse(payload)).toEqual({ ok: true, transactionHash: 'relay-tx-hash' });
        expect(payload).not.toContain(signerKey);
        expect(sign).toHaveBeenCalledOnce();
        sign.mockRestore();
    });

    it('handles NEAR RPC preflight without hitting the origin', async () => {
        globalThis.fetch = vi.fn();

        const request = new Request('https://youtick.net/api/near-rpc/', {
            method: 'OPTIONS',
            headers: {
                origin: 'https://youtick.net',
                'access-control-request-method': 'POST',
                'access-control-request-headers': 'content-type',
            },
        });
        const response = await handler.fetch(request, createEnv(), {
            waitUntil: vi.fn(),
        } as unknown as ExecutionContext);

        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
        expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
        expect(response.headers.get('Access-Control-Allow-Headers')).toContain('content-type');
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('proxies NEAR RPC POST requests with no-store CORS headers', async () => {
        const body = JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'status', params: [] });
        const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
            expect(input).toBe('https://free.rpc.fastnear.com/');
            expect(init?.method).toBe('POST');
            expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
            expect(init?.body).toBe(body);
            return new Response(JSON.stringify({ result: { chain_id: 'mainnet' } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const request = new Request('https://youtick.net/api/near-rpc', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
        });
        const response = await handler.fetch(request, createEnv(), {
            waitUntil: vi.fn(),
        } as unknown as ExecutionContext);

        expect(response.status).toBe(200);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.get('X-Near-Rpc-Cache')).toBe('MISS');
        expect(response.headers.get('X-Near-Rpc-Upstream')).toBe('free.rpc.fastnear.com');
        expect(await response.json()).toEqual({ result: { chain_id: 'mainnet' } });
    });

    it('strips upstream body encoding headers from NEAR RPC responses', async () => {
        const body = JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'status', params: [] });
        const fetchMock = vi.fn(async () => {
            return new Response(JSON.stringify({ result: { chain_id: 'mainnet' } }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Encoding': 'gzip',
                    'Content-Length': '999',
                    'Transfer-Encoding': 'chunked',
                },
            });
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const response = await handler.fetch(new Request('https://youtick.net/api/near-rpc', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
        }), createEnv(), {
            waitUntil: vi.fn(),
        } as unknown as ExecutionContext);

        expect(response.status).toBe(200);
        expect(response.headers.get('content-encoding')).toBeNull();
        expect(response.headers.get('content-length')).toBeNull();
        expect(response.headers.get('transfer-encoding')).toBeNull();
        expect(await response.json()).toEqual({ result: { chain_id: 'mainnet' } });
    });

    it('tries another NEAR RPC upstream when the first is rate limited', async () => {
        const body = JSON.stringify({
            jsonrpc: '2.0',
            id: '1',
            method: 'query',
            params: {
                request_type: 'call_function',
                finality: 'final',
                account_id: 'youtick.near',
                method_name: 'get_event',
                args_base64: 'e30=',
            },
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'rate limited' }), {
                status: 429,
                headers: { 'Content-Type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ result: { result: [] } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const response = await handler.fetch(new Request('https://youtick.net/api/near-rpc', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
        }), createEnv(), {
            waitUntil: vi.fn(),
        } as unknown as ExecutionContext);

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0]).toBe('https://free.rpc.fastnear.com/');
        expect(fetchMock.mock.calls[1][0]).toBe('https://rpc.mainnet.near.org/');
        expect(response.headers.get('X-Near-Rpc-Upstream')).toBe('rpc.mainnet.near.org');
    });

    it('caches allowlisted NEAR view RPC calls briefly', async () => {
        const body = JSON.stringify({
            jsonrpc: '2.0',
            id: '1',
            method: 'query',
            params: {
                request_type: 'call_function',
                finality: 'final',
                account_id: 'youtick.near',
                method_name: 'get_event',
                args_base64: 'e30=',
            },
        });
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ result: { result: [] } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const waitUntil = vi.fn((promise: Promise<unknown>) => promise);
        const ctx = { waitUntil } as unknown as ExecutionContext;
        const requestInit = {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
        };

        const first = await handler.fetch(new Request('https://youtick.net/api/near-rpc', requestInit), createEnv(), ctx);
        await Promise.all(waitUntil.mock.calls.map(([promise]) => promise));
        const second = await handler.fetch(new Request('https://youtick.net/api/near-rpc', requestInit), createEnv(), ctx);

        expect(first.headers.get('X-Near-Rpc-Cache')).toBe('MISS');
        expect(second.headers.get('X-Near-Rpc-Cache')).toBe('HIT');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rejects non-view RPC methods and unknown contracts', async () => {
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;

        for (const body of [
            { jsonrpc: '2.0', id: '1', method: 'broadcast_tx_commit', params: [] },
            {
                jsonrpc: '2.0', id: '2', method: 'query',
                params: { request_type: 'call_function', account_id: 'attacker.near', method_name: 'get_event' },
            },
        ]) {
            const response = await handler.fetch(new Request('https://youtick.net/api/near-rpc', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            }), createEnv(), ctx);
            expect(response.status).toBe(403);
        }

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('allows the bounded account queries and signed transaction methods used by managed wallets', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ result: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;

        for (const body of [
            {
                jsonrpc: '2.0', id: '1', method: 'query',
                params: {
                    request_type: 'view_access_key', finality: 'optimistic',
                    account_id: 'alice.near', public_key: `ed25519:${'a'.repeat(44)}`,
                },
            },
            {
                jsonrpc: '2.0', id: '2', method: 'query',
                params: { request_type: 'view_account', finality: 'final', account_id: 'alice.near' },
            },
            {
                jsonrpc: '2.0', id: '3', method: 'send_tx',
                params: { signed_tx_base64: 'dHJhbnNhY3Rpb24=', wait_until: 'EXECUTED_OPTIMISTIC' },
            },
        ]) {
            const response = await handler.fetch(new Request('https://youtick.net/api/near-rpc', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            }), createEnv(), ctx);
            expect(response.status).toBe(200);
            expect(response.headers.get('X-Near-Rpc-Cache')).toBe('BYPASS');
        }

        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('rejects oversized relay bodies before upstream fetch', async () => {
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const response = await handler.fetch(new Request('https://youtick.net/api/near-rpc', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: 'x'.repeat(64 * 1024 + 1),
        }), createEnv(), { waitUntil: vi.fn() } as unknown as ExecutionContext);

        expect(response.status).toBe(413);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns gone for retired storage proxy requests without calling upstream', async () => {
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const request = new Request('https://youtick.net/api/crust/psa/pins?limit=1', {
            method: 'POST',
            headers: {
                authorization: 'Bearer token',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ cid: 'QmTest' }),
        });
        const response = await handler.fetch(request, createEnv(), {
            waitUntil: vi.fn(),
        } as unknown as ExecutionContext);

        expect(response.status).toBe(410);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await response.json()).toEqual({
            error: 'storage_proxy_removed',
            message: 'This storage proxy surface has been retired. Use the Storage API and IPFS gateway read paths.',
        });
    });
});
