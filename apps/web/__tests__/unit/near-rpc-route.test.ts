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
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
        await expect(response.json()).resolves.toEqual({ jsonrpc: '2.0', result: 'ok' });
    });
});
