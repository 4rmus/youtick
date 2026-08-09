import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/near-rpc/route';
import { POST as BROADCAST } from '@/app/api/near-rpc/broadcast/route';

describe('/api/near-rpc route', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        delete process.env.NEAR_RPC_PRIMARY_URL;
        delete process.env.NEAR_RPC_PRIMARY_AUTHORIZATION;
    });

    it('strips upstream body encoding headers before returning the proxied response', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ jsonrpc: '2.0', result: 'ok' }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Encoding': 'gzip',
                'Content-Length': '999',
                'Transfer-Encoding': 'chunked',
                'Access-Control-Allow-Origin': '*',
            },
        })));

        const response = await POST(new Request('http://localhost:3001/api/near-rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'status', params: [] }),
        }));

        expect(response.status).toBe(200);
        expect(response.headers.get('content-encoding')).toBeNull();
        expect(response.headers.get('content-length')).toBeNull();
        expect(response.headers.get('transfer-encoding')).toBeNull();
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
        await expect(response.json()).resolves.toEqual({ jsonrpc: '2.0', result: 'ok' });
    });

    it('rejects media bodies before forwarding them to NEAR RPC', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const response = await POST(new Request('http://localhost:3001/api/near-rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'video/mp4' },
            body: new Uint8Array(1024),
        }));

        expect(response.status).toBe(415);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects oversized JSON bodies before forwarding them to NEAR RPC', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const response = await POST(new Request('http://localhost:3001/api/near-rpc', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': String(64 * 1024 + 1),
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'query', params: {} }),
        }));

        expect(response.status).toBe(413);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('stops oversized JSON streams without a declared content length', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const response = await POST(new Request('http://localhost:3001/api/near-rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: '1',
                method: 'query',
                params: { media: 'x'.repeat(70 * 1024) },
            }),
        }));

        expect(response.status).toBe(413);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects unsupported JSON-RPC methods', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const response = await POST(new Request('http://localhost:3001/api/near-rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'unsafe_method', params: [] }),
        }));

        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('removes experimental methods and separates read from broadcast', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        for (const method of ['EXPERIMENTAL_changes', 'broadcast_tx_commit']) {
            const response = await POST(new Request('http://localhost:3001/api/near-rpc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params: [] }),
            }));
            expect(response.status).toBe(400);
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never replays a broadcast to another upstream', async () => {
        const fetchMock = vi.fn(async () => new Response('unavailable', { status: 503 }));
        vi.stubGlobal('fetch', fetchMock);

        const response = await BROADCAST(new Request('http://localhost:3001/api/near-rpc/broadcast', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CF-Connecting-IP': '203.0.113.10',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'broadcast-1',
                method: 'broadcast_tx_commit',
                params: ['signed-transaction'],
            }),
        }));

        expect(response.status).toBe(503);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('falls back for reads and sends dedicated primary authorization', async () => {
        process.env.NEAR_RPC_PRIMARY_URL = 'https://dedicated-rpc.example.test/';
        process.env.NEAR_RPC_PRIMARY_AUTHORIZATION = 'Bearer test-credential';
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('busy', { status: 503 }))
            .mockResolvedValueOnce(Response.json({ jsonrpc: '2.0', result: 'ok' }));
        vi.stubGlobal('fetch', fetchMock);

        const response = await POST(new Request('http://localhost:3001/api/near-rpc', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CF-Connecting-IP': '203.0.113.11',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 'read-1', method: 'status', params: [] }),
        }));

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const firstInit = fetchMock.mock.calls[0][1] as RequestInit;
        expect(new Headers(firstInit.headers).get('Authorization')).toBe('Bearer test-credential');
        const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
        expect(new Headers(secondInit.headers).get('Authorization')).toBeNull();
    });

    it('returns a bounded error when every read upstream is transiently unavailable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })));

        const response = await POST(new Request('http://localhost:3001/api/near-rpc', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CF-Connecting-IP': '203.0.113.14',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 'all-busy', method: 'status', params: [] }),
        }));

        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toEqual({ error: 'NEAR RPC unavailable' });
    });

    it('stops calling a read upstream after three transient failures', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_900_000_000_000);
        process.env.NEAR_RPC_PRIMARY_URL = 'https://dedicated-rpc.example.test/';
        process.env.NEAR_RPC_PRIMARY_AUTHORIZATION = 'Bearer test-credential';
        let dedicatedHealthy = true;
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            if (String(input) === process.env.NEAR_RPC_PRIMARY_URL) {
                return dedicatedHealthy
                    ? Response.json({ jsonrpc: '2.0', result: 'ok' })
                    : new Response('busy', { status: 503 });
            }
            return Response.json({ jsonrpc: '2.0', result: 'fallback' });
        });
        vi.stubGlobal('fetch', fetchMock);
        const request = (id: string) => POST(new Request('http://localhost:3001/api/near-rpc', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CF-Connecting-IP': '203.0.113.15',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id, method: 'status', params: [] }),
        }));

        expect((await request('reset')).status).toBe(200);
        dedicatedHealthy = false;
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            expect((await request(`failure-${attempt}`)).status).toBe(200);
        }

        const urls = fetchMock.mock.calls.map(([url]) => String(url));
        expect(urls.filter((url) => url === process.env.NEAR_RPC_PRIMARY_URL)).toHaveLength(4);
        expect(urls.filter((url) => url !== process.env.NEAR_RPC_PRIMARY_URL)).toHaveLength(4);
    });

    it('caps upstream response bodies', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
            status: 200,
        })));

        const response = await POST(new Request('http://localhost:3001/api/near-rpc', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CF-Connecting-IP': '203.0.113.12',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 'large', method: 'status', params: [] }),
        }));

        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toEqual({ error: 'NEAR RPC response too large' });
    });

    it('applies a bounded per-IP read rate limit', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => Response.json({ jsonrpc: '2.0', result: 'ok' })));

        let response: Response | null = null;
        for (let index = 0; index <= 60; index += 1) {
            response = await POST(new Request('http://localhost:3001/api/near-rpc', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'CF-Connecting-IP': '203.0.113.60',
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: index, method: 'status', params: [] }),
            }));
        }

        expect(response?.status).toBe(429);
        expect(response?.headers.get('Retry-After')).toBe('60');
    });

    it('applies a bounded per-account read rate limit across IPs', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => Response.json({ jsonrpc: '2.0', result: 'ok' })));

        let response: Response | null = null;
        for (let index = 0; index <= 60; index += 1) {
            response = await POST(new Request('http://localhost:3001/api/near-rpc', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'CF-Connecting-IP': `198.51.100.${index + 1}`,
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: index,
                    method: 'query',
                    params: {
                        request_type: 'view_account',
                        account_id: 'rate-limit.testnet',
                        finality: 'final',
                    },
                }),
            }));
        }

        expect(response?.status).toBe(429);
    });

    it('applies the lower broadcast rate limit', async () => {
        const fetchMock = vi.fn(async () => Response.json({ jsonrpc: '2.0', result: 'ok' }));
        vi.stubGlobal('fetch', fetchMock);

        let response: Response | null = null;
        for (let index = 0; index <= 10; index += 1) {
            response = await BROADCAST(new Request('http://localhost:3001/api/near-rpc/broadcast', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'CF-Connecting-IP': '203.0.113.70',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: index,
                    method: 'send_tx',
                    params: { signed_tx_base64: 'signed', wait_until: 'NONE' },
                }),
            }));
        }

        expect(response?.status).toBe(429);
        expect(fetchMock).toHaveBeenCalledTimes(10);
    });

    it('aborts a slow upstream before falling back', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn()
            .mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
                init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
            }))
            .mockResolvedValueOnce(Response.json({ jsonrpc: '2.0', result: 'ok' }));
        vi.stubGlobal('fetch', fetchMock);

        const responsePromise = POST(new Request('http://localhost:3001/api/near-rpc', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CF-Connecting-IP': '203.0.113.13',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 'slow', method: 'status', params: [] }),
        }));
        await vi.advanceTimersByTimeAsync(2_501);

        await expect(responsePromise).resolves.toMatchObject({ status: 200 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
