import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/near-rpc/route';

describe('/api/near-rpc route', () => {
    afterEach(() => {
        vi.restoreAllMocks();
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
});
