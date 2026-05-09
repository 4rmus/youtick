import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
    'NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE',
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
});
