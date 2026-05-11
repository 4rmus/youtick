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
            uploadsEnabled: false,
            uploadBase: 'https://upload.lighthouse.storage',
            maxUploadBytes: 104857600,
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
            createEnv({ LIGHTHOUSE_API_KEY: '"secret-value"' }),
        );

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.lighthouse.storage/api/lighthouse/file_info?cid=bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            expect.objectContaining({
                method: 'GET',
                headers: expect.any(Headers) as Headers,
            }),
        );
        const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
        expect((calls[0][1].headers as Headers).get('Authorization')).toBe('Bearer secret-value');

        const body = await response.json() as Record<string, unknown>;
        expect(body).toMatchObject({
            provider: 'lighthouse',
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            found: true,
            upstreamCid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            fileName: 'manifest-root',
            fileSizeInBytes: '1234',
            mimeType: 'application/octet-stream',
            encryption: false,
            txHash: '',
            upstreamStatus: 200,
        });
        expect(typeof body.checkedAt).toBe('string');
    });

    it('normalizes Lighthouse upload-style fields during status checks', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            data: {
                Hash: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
                Size: '5678',
                Name: 'delivery-root',
            },
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })));

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/status'),
            createEnv(),
        );

        const body = await response.json() as Record<string, unknown>;
        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            provider: 'lighthouse',
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            found: true,
            upstreamCid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            fileName: 'delivery-root',
            fileSizeInBytes: '5678',
            upstreamStatus: 200,
        });
        expect(typeof body.checkedAt).toBe('string');
    });

    it('reads top-level Lighthouse file info for pin status', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            fileSizeInBytes: 421,
            fileName: 'storage-api-smoke.txt',
            mimeType: 'text/plain',
            encryption: false,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })));

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/status'),
            createEnv(),
        );

        const body = await response.json() as Record<string, unknown>;
        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            provider: 'lighthouse',
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            found: true,
            upstreamCid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            fileName: 'storage-api-smoke.txt',
            fileSizeInBytes: 421,
            mimeType: 'text/plain',
            encryption: false,
            upstreamStatus: 200,
        });
        expect(typeof body.checkedAt).toBe('string');
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
        const body = await response.json() as Record<string, unknown>;
        expect(body).toMatchObject({
            provider: 'lighthouse',
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            found: false,
            upstreamStatus: 404,
        });
        expect(typeof body.checkedAt).toBe('string');
    });

    it('returns a large-video upload intent without exposing provider secrets', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: 'concert.mov',
                    sizeBytes: 20 * 1024 * 1024 * 1024,
                    contentType: 'video/quicktime',
                }),
            }),
            createEnv({
                LIGHTHOUSE_API_KEY: 'secret-value',
                ENABLE_LIGHTHOUSE_UPLOADS: 'true',
                MAX_UPLOAD_BYTES: String(100 * 1024 * 1024),
            }),
        );

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body).toMatchObject({
            provider: 'lighthouse',
            fileName: 'concert.mov',
            sizeBytes: 20 * 1024 * 1024 * 1024,
            contentType: 'video/quicktime',
            uploadsEnabled: true,
            providerReady: true,
            directUpload: {
                available: false,
                reason: 'scoped_direct_upload_token_unavailable',
            },
            workerProxy: {
                available: true,
                uploadUrl: '/uploads/file',
                maxPartBytes: 100 * 1024 * 1024,
                recommendedPartBytes: 4 * 1024 * 1024,
                requiresChunking: true,
            },
        });
        expect(JSON.stringify(body)).not.toContain('secret-value');
    });

    it('keeps upload intent available as guidance when uploads are disabled', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: 'film.mp4',
                    sizeBytes: 1024,
                }),
            }),
            createEnv({ LIGHTHOUSE_API_KEY: 'secret-value' }),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            provider: 'lighthouse',
            fileName: 'film.mp4',
            contentType: 'application/octet-stream',
            uploadsEnabled: false,
            providerReady: true,
            workerProxy: {
                available: false,
                requiresChunking: false,
            },
        });
    });

    it('rejects invalid upload intent requests before provider calls', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: '../bad.mp4',
                    sizeBytes: 0,
                }),
            }),
            createEnv({ LIGHTHOUSE_API_KEY: 'secret-value' }),
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'invalid_file_name' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uploads a directory through Lighthouse when primary uploads are explicitly enabled', async () => {
        const fetchMock = vi.fn(async () => new Response([
            '{"Name":"manifest.json","Hash":"bafyManifest","Size":"64"}',
            '{"Name":"segments/000000.m4s","Hash":"bafySegment","Size":"8"}',
            '{"Name":"segments","Hash":"bafySegmentsDir","Size":"72"}',
            '{"Name":"","Hash":"bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja","Size":"180"}',
        ].join('\n'), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const formData = new FormData();
        formData.append('file', new File(['{}'], 'manifest.json', { type: 'application/json' }));
        formData.append('file', new File(['segment'], 'segments/000000.m4s'));

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/directory', {
                method: 'POST',
                body: formData,
            }),
            createEnv({
                LIGHTHOUSE_API_KEY: '"secret-value"',
                ENABLE_LIGHTHOUSE_UPLOADS: 'true',
            }),
        );

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://upload.lighthouse.storage/api/v0/add?wrap-with-directory=true&cid-version=1',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer secret-value',
                    Accept: 'application/json',
                }) as HeadersInit,
                body: expect.any(FormData) as FormData,
            }),
        );

        const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
        const upstreamForm = calls[0][1].body as FormData;
        expect(Array.from(upstreamForm.entries()).map(([, value]) => (value as unknown as File).name)).toEqual([
            'manifest.json',
            'segments/000000.m4s',
        ]);

        expect(await response.json()).toMatchObject({
            provider: 'lighthouse',
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            size: 9,
            entries: [
                { path: 'manifest.json', cid: 'bafyManifest', size: 64 },
                { path: 'segments/000000.m4s', cid: 'bafySegment', size: 8 },
                { path: 'segments', cid: 'bafySegmentsDir', size: 72 },
                { path: '', cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja', size: 180 },
            ],
        });
    });

    it('uploads a single file through Lighthouse when primary uploads are explicitly enabled', async () => {
        const fetchMock = vi.fn(async () => new Response(
            '{"Name":"segments/000000.m4s.part00000","Hash":"bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja","Size":"7"}',
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            },
        ));
        vi.stubGlobal('fetch', fetchMock);

        const formData = new FormData();
        formData.append('file', new File(['segment'], 'segments/000000.m4s.part00000'));

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/file', {
                method: 'POST',
                body: formData,
            }),
            createEnv({
                LIGHTHOUSE_API_KEY: 'secret-value',
                ENABLE_LIGHTHOUSE_UPLOADS: 'true',
            }),
        );

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://upload.lighthouse.storage/api/v0/add?cid-version=1',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer secret-value',
                    Accept: 'application/json',
                }) as HeadersInit,
                body: expect.any(FormData) as FormData,
            }),
        );
        const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
        const upstreamForm = calls[0][1].body as FormData;
        expect(Array.from(upstreamForm.entries()).map(([, value]) => (value as unknown as File).name)).toEqual([
            '000000.m4s.part00000',
        ]);

        expect(await response.json()).toMatchObject({
            provider: 'lighthouse',
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            path: 'segments/000000.m4s.part00000',
            size: 7,
        });
    });

    it('keeps Lighthouse primary uploads disabled unless explicitly enabled', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const formData = new FormData();
        formData.append('file', new File(['{}'], 'manifest.json'));

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/directory', {
                method: 'POST',
                body: formData,
            }),
            createEnv({ LIGHTHOUSE_API_KEY: 'secret-value' }),
        );

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
            error: 'uploads_disabled',
            reason: 'enable_lighthouse_uploads_required',
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects Lighthouse primary uploads above the configured worker cap', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const formData = new FormData();
        formData.append('file', new File(['too-large'], 'manifest.json'));

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/directory', {
                method: 'POST',
                body: formData,
            }),
            createEnv({
                LIGHTHOUSE_API_KEY: 'secret-value',
                ENABLE_LIGHTHOUSE_UPLOADS: 'true',
                MAX_UPLOAD_BYTES: '4',
            }),
        );

        expect(response.status).toBe(413);
        expect(await response.json()).toEqual({
            error: 'upload_too_large',
            maxUploadBytes: 4,
        });
        expect(fetchMock).not.toHaveBeenCalled();
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
            endpoints: ['/__health', '/provider-health', '/pins', '/pins/:cid/status', '/uploads/intent', '/uploads/file', '/uploads/directory'],
        });
    });
});
