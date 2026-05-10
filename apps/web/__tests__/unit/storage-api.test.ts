import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
    'NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE',
    'NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PRIMARY_UPLOAD',
    'NEXT_PUBLIC_STORAGE_API_URL',
] as const;

function resetEnv(): void {
    for (const key of ENV_KEYS) {
        delete process.env[key];
    }
}

describe('storage-api client', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        resetEnv();
    });

    it('skips pinning when the pilot flag is disabled', async () => {
        resetEnv();
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { isLighthousePersistencePilotEnabled, pinCidWithStorageApi } = await import('@/lib/storage/storage-api');
        const result = await pinCidWithStorageApi({ cid: 'bafyRoot', fileName: 'delivery-root' });

        expect(isLighthousePersistencePilotEnabled()).toBe(false);
        expect(result).toEqual({ status: 'skipped', reason: 'disabled' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('skips pinning when the Storage API URL is missing', async () => {
        process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE = 'true';
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { isLighthousePersistencePilotEnabled, pinCidWithStorageApi } = await import('@/lib/storage/storage-api');
        const result = await pinCidWithStorageApi({ cid: 'bafyRoot' });

        expect(isLighthousePersistencePilotEnabled()).toBe(false);
        expect(result).toEqual({ status: 'skipped', reason: 'missing_url' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('pins a CID through the configured Storage API URL', async () => {
        process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE = 'true';
        process.env.NEXT_PUBLIC_STORAGE_API_URL = 'https://storage-api.example/';
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            provider: 'lighthouse',
            cid: 'bafyRoot',
            pinned: true,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const { isLighthousePersistencePilotEnabled, pinCidWithStorageApi } = await import('@/lib/storage/storage-api');
        const result = await pinCidWithStorageApi({ cid: 'bafyRoot', fileName: 'delivery-root' });

        expect(isLighthousePersistencePilotEnabled()).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith('https://storage-api.example/pins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cid: 'bafyRoot', fileName: 'delivery-root' }),
        });
        expect(result).toEqual({
            status: 'pinned',
            cid: 'bafyRoot',
            provider: 'lighthouse',
        });
    });

    it('uploads a directory through the Storage API when Lighthouse primary upload is enabled', async () => {
        process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PRIMARY_UPLOAD = 'true';
        process.env.NEXT_PUBLIC_STORAGE_API_URL = 'https://storage-api.example/';
        let openedUrl = '';
        let sentBody: XMLHttpRequestBodyInit | null = null;

        class MockXMLHttpRequest extends EventTarget {
            status = 200;
            responseText = JSON.stringify({
                cid: 'bafyRoot',
                size: 9,
                entries: [
                    { path: 'manifest.json', cid: 'bafyManifest', size: 2 },
                    { path: '', cid: 'bafyRoot', size: 9 },
                ],
            });
            upload = new EventTarget();

            open(_method: string, url: string) {
                openedUrl = url;
            }

            send(body: XMLHttpRequestBodyInit) {
                sentBody = body;
                queueMicrotask(() => this.dispatchEvent(new Event('load')));
            }

            abort() {
                this.dispatchEvent(new Event('abort'));
            }
        }

        vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);

        const { isLighthousePrimaryUploadEnabled, uploadDirectoryWithStorageApi } = await import('@/lib/storage/storage-api');
        const result = await uploadDirectoryWithStorageApi([
            { path: 'manifest.json', file: new Blob(['{}'], { type: 'application/json' }) },
            { path: 'segments/000000.m4s', file: new Blob(['segment']) },
        ]);

        expect(isLighthousePrimaryUploadEnabled()).toBe(true);
        expect(openedUrl).toBe('https://storage-api.example/uploads/directory');
        expect(Array.from((sentBody as FormData).entries()).map(([, value]) => (value as File).name)).toEqual([
            'manifest.json',
            'segments/000000.m4s',
        ]);
        expect(result).toEqual({
            cid: 'bafyRoot',
            size: 9,
            entries: [
                { path: 'manifest.json', cid: 'bafyManifest', size: 2 },
                { path: '', cid: 'bafyRoot', size: 9 },
            ],
        });
    });

    it('uploads one file through the Storage API when Lighthouse primary upload is enabled', async () => {
        process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PRIMARY_UPLOAD = 'true';
        process.env.NEXT_PUBLIC_STORAGE_API_URL = 'https://storage-api.example/';
        let openedUrl = '';
        let sentBody: XMLHttpRequestBodyInit | null = null;

        class MockXMLHttpRequest extends EventTarget {
            status = 200;
            responseText = JSON.stringify({
                cid: 'bafyPart',
                path: 'segments/000000.m4s.part00000',
                size: 7,
            });
            upload = new EventTarget();

            open(_method: string, url: string) {
                openedUrl = url;
            }

            send(body: XMLHttpRequestBodyInit) {
                sentBody = body;
                queueMicrotask(() => this.dispatchEvent(new Event('load')));
            }

            abort() {
                this.dispatchEvent(new Event('abort'));
            }
        }

        vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);

        const { uploadFileWithStorageApi } = await import('@/lib/storage/storage-api');
        const result = await uploadFileWithStorageApi(
            'segments/000000.m4s.part00000',
            new Blob(['segment']),
        );

        expect(openedUrl).toBe('https://storage-api.example/uploads/file');
        expect(Array.from((sentBody as FormData).entries()).map(([, value]) => (value as File).name)).toEqual([
            'segments/000000.m4s.part00000',
        ]);
        expect(result).toEqual({
            cid: 'bafyPart',
            path: 'segments/000000.m4s.part00000',
            size: 7,
        });
    });

    it('rejects Storage API uploads when Lighthouse primary upload is disabled', async () => {
        process.env.NEXT_PUBLIC_STORAGE_API_URL = 'https://storage-api.example';
        process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PRIMARY_UPLOAD = 'false';

        const { isLighthousePrimaryUploadEnabled, uploadDirectoryWithStorageApi } = await import('@/lib/storage/storage-api');

        expect(isLighthousePrimaryUploadEnabled()).toBe(false);
        await expect(uploadDirectoryWithStorageApi([
            { path: 'manifest.json', file: new Blob(['{}']) },
        ])).rejects.toThrow('Lighthouse primary upload is disabled');
    });

    it('returns a failed outcome instead of throwing when the Storage API rejects the pin', async () => {
        process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE = 'true';
        process.env.NEXT_PUBLIC_STORAGE_API_URL = 'https://storage-api.example';
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            error: 'provider_pin_failed',
        }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
        })));

        const { pinCidWithStorageApi } = await import('@/lib/storage/storage-api');
        const result = await pinCidWithStorageApi({ cid: 'bafyRoot' });

        expect(result).toEqual({
            status: 'failed',
            cid: 'bafyRoot',
            reason: 'provider_pin_failed',
            httpStatus: 502,
        });
    });

    it('reads CID pin status through the configured Storage API URL', async () => {
        process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE = 'true';
        process.env.NEXT_PUBLIC_STORAGE_API_URL = 'https://storage-api.example/';
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            provider: 'lighthouse',
            cid: 'bafyRoot',
            found: true,
            fileName: 'delivery-root',
            fileSizeInBytes: '1234',
            upstreamCid: 'bafyRoot',
            upstreamStatus: 200,
            checkedAt: '2026-05-10T00:00:00.000Z',
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const { getCidPinStatusFromStorageApi } = await import('@/lib/storage/storage-api');
        const result = await getCidPinStatusFromStorageApi('bafyRoot');

        expect(fetchMock).toHaveBeenCalledWith('https://storage-api.example/pins/bafyRoot/status');
        expect(result).toEqual({
            status: 'found',
            cid: 'bafyRoot',
            provider: 'lighthouse',
            fileName: 'delivery-root',
            fileSizeInBytes: '1234',
            upstreamCid: 'bafyRoot',
            upstreamStatus: 200,
            checkedAt: '2026-05-10T00:00:00.000Z',
        });
    });

    it('normalizes missing CID pin status', async () => {
        process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE = 'true';
        process.env.NEXT_PUBLIC_STORAGE_API_URL = 'https://storage-api.example';
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            provider: 'lighthouse',
            cid: 'bafyRoot',
            found: false,
            upstreamStatus: 404,
            checkedAt: '2026-05-10T00:00:00.000Z',
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })));

        const { getCidPinStatusFromStorageApi } = await import('@/lib/storage/storage-api');
        const result = await getCidPinStatusFromStorageApi('bafyRoot');

        expect(result).toEqual({
            status: 'missing',
            cid: 'bafyRoot',
            provider: 'lighthouse',
            upstreamStatus: 404,
            checkedAt: '2026-05-10T00:00:00.000Z',
        });
    });
});
