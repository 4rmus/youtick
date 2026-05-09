import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from './index';

type TestHandler = {
    fetch(request: Request, env: Env): Promise<Response>;
};

async function importHandler(): Promise<TestHandler> {
    const mod = await import('./index');
    return mod.default as TestHandler;
}

function createEnv(overrides?: Partial<Env>): Env {
    return {
        ALLOWED_ORIGINS: 'https://youtick.net,http://localhost:3000,http://localhost:3001',
        STORAGE_PROVIDER: 'lighthouse',
        LIGHTHOUSE_API_BASE: 'https://api.lighthouse.storage',
        ...overrides,
    };
}

describe('storage-api', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns service health without exposing secrets', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/__health', {
                headers: { Origin: 'https://youtick.net' },
            }),
            createEnv({ LIGHTHOUSE_API_KEY: 'secret-value' }),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://youtick.net');
        expect(response.headers.get('Cache-Control')).toBe('no-store');

        const body = await response.json() as Record<string, unknown>;
        expect(body.status).toBe('ok');
        expect(body.service).toBe('storage-api');
        expect(body.provider).toBe('lighthouse');
        expect(JSON.stringify(body)).not.toContain('secret-value');
    });

    it('reports provider not ready when the Lighthouse secret is missing', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/provider-health'),
            createEnv(),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            provider: 'lighthouse',
            ready: false,
            reason: 'lighthouse_api_key_missing',
            apiBase: 'https://api.lighthouse.storage',
        });
    });

    it('reports provider ready when the Lighthouse secret is configured', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/provider-health'),
            createEnv({ LIGHTHOUSE_API_KEY: 'secret-value' }),
        );

        expect(await response.json()).toEqual({
            provider: 'lighthouse',
            ready: true,
            apiBase: 'https://api.lighthouse.storage',
        });
    });

    it('pins an existing CID through Lighthouse without exposing the API key', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
                    fileName: 'manifest-root',
                }),
            }),
            createEnv({ LIGHTHOUSE_API_KEY: '"secret-value"' }),
        );

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.lighthouse.storage/api/lighthouse/pin',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer secret-value',
                    'Content-Type': 'application/json',
                }) as HeadersInit,
            }),
        );

        const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
        const upstreamRequest = calls[0][1];
        const upstreamBody = JSON.parse(upstreamRequest.body as string);
        expect(upstreamBody).toEqual({
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            fileName: 'manifest-root',
        });

        const body = await response.json() as Record<string, unknown>;
        expect(body.pinned).toBe(true);
        expect(JSON.stringify(body)).not.toContain('secret-value');
    });

    it('rejects pin requests when provider secret is missing', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja' }),
            }),
            createEnv(),
        );

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({
            error: 'provider_not_configured',
            reason: 'lighthouse_api_key_missing',
        });
    });

    it('rejects invalid CIDs before calling Lighthouse', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cid: 'not-a-cid' }),
            }),
            createEnv({ LIGHTHOUSE_API_KEY: 'secret-value' }),
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'invalid_cid' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reads Lighthouse file info for pin status', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            data: {
                cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
                fileSizeInBytes: '1234',
                fileName: 'manifest-root',
                mimeType: 'application/octet-stream',
                encryption: false,
                txHash: '',
            },
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/status'),
            createEnv(),
        );

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.lighthouse.storage/api/lighthouse/file_info?cid=bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            expect.objectContaining({ method: 'GET' }),
        );
        expect(await response.json()).toEqual({
            provider: 'lighthouse',
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            found: true,
            fileName: 'manifest-root',
            fileSizeInBytes: '1234',
            mimeType: 'application/octet-stream',
            encryption: false,
            txHash: '',
        });
    });

    it('normalizes missing Lighthouse file info as found false', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            error: { code: 404, message: 'Not Found' },
        }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        })));

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/status'),
            createEnv(),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            provider: 'lighthouse',
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            found: false,
            upstreamStatus: 404,
        });
    });

    it('handles CORS preflight for allowed origins', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/provider-health', {
                method: 'OPTIONS',
                headers: { Origin: 'http://localhost:3000' },
            }),
            createEnv(),
        );

        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
        expect(response.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
    });

    it('allows the secondary local dev port used for parallel smoke tests', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins', {
                method: 'OPTIONS',
                headers: { Origin: 'http://localhost:3001' },
            }),
            createEnv(),
        );

        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3001');
    });

    it('does not reflect disallowed origins', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/__health', {
                headers: { Origin: 'https://example.com' },
            }),
            createEnv(),
        );

        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('returns JSON 404 for unknown routes', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/unknown'),
            createEnv(),
        );

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
            error: 'not_found',
            endpoints: ['/__health', '/provider-health', '/pins', '/pins/:cid/status'],
        });
    });
});
