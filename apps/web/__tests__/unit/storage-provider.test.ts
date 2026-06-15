import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadedAsset } from '@/lib/storage/cid-collector';

const {
  mockUploadDirectoryWithStorageApi,
  mockGetCidPinStatusFromStorageApi,
} = vi.hoisted(() => ({
  mockUploadDirectoryWithStorageApi: vi.fn(),
  mockGetCidPinStatusFromStorageApi: vi.fn(),
}));

const mockAuthSigner = {} as never;

vi.mock('@/lib/storage/storage-api', () => ({
  getCidPinStatusFromStorageApi: mockGetCidPinStatusFromStorageApi,
  uploadDirectoryWithStorageApi: mockUploadDirectoryWithStorageApi,
}));

describe('storage provider adapter', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PRIMARY_UPLOAD;
    vi.resetModules();
    mockGetCidPinStatusFromStorageApi.mockReset();
    mockUploadDirectoryWithStorageApi.mockReset();
  });

  it('uses Lighthouse as the active provider for directory uploads by default', async () => {
    mockUploadDirectoryWithStorageApi.mockResolvedValue({
      cid: 'bafyLighthouseRoot',
      size: 123,
      entries: [],
    });

    const { getActiveStorageProvider, uploadDirectoryToStorage } = await import('@/lib/storage/provider');
    const options = { timeout: 10_000, authSigner: mockAuthSigner };
    const files = [{ path: 'manifest.json', file: new Blob(['{}']) }];
    const result = await uploadDirectoryToStorage(files, 'uploader.near', options);

    expect(getActiveStorageProvider().id).toBe('lighthouse');
    expect(mockUploadDirectoryWithStorageApi).toHaveBeenCalledWith(files, 'uploader.near', mockAuthSigner, options);
    expect(result).toEqual({
      cid: 'bafyLighthouseRoot',
      size: 123,
      entries: [],
      provider: 'lighthouse',
    });
  });

  it('requires an auth signer for Lighthouse uploads', async () => {
    const { uploadDirectoryToStorage } = await import('@/lib/storage/provider');
    const files = [{ path: 'manifest.json', file: new Blob(['{}']) }];

    await expect(uploadDirectoryToStorage(files, 'uploader.near', { timeout: 10_000 }))
      .rejects.toThrow('Storage auth signer is required');
    expect(mockUploadDirectoryWithStorageApi).not.toHaveBeenCalled();
  });

  it('propagates Lighthouse upload failures without a fallback path', async () => {
    mockUploadDirectoryWithStorageApi.mockRejectedValue(new Error('provider_upload_failed'));

    const { uploadDirectoryToStorage } = await import('@/lib/storage/provider');
    const options = { timeout: 10_000, authSigner: mockAuthSigner };
    const files = [{ path: 'manifest.json', file: new Blob(['{}']) }];

    await expect(uploadDirectoryToStorage(files, 'uploader.near', options)).rejects.toThrow('provider_upload_failed');
    expect(mockUploadDirectoryWithStorageApi).toHaveBeenCalledWith(files, 'uploader.near', mockAuthSigner, options);
  });

  it('verifies Lighthouse uploads through the Storage API status endpoint', async () => {
    const assets: UploadedAsset[] = [{ cid: 'bafyRoot', size: 123, type: 'delivery-root' }];
    mockGetCidPinStatusFromStorageApi.mockResolvedValue({
      status: 'found',
      cid: 'bafyRoot',
      provider: 'lighthouse',
    });

    const { placeStorageOrders, verifyStorageOrders } = await import('@/lib/storage/provider');
    const batch = await placeStorageOrders(assets, 'uploader.near', { concurrency: 1 });
    const verify = await verifyStorageOrders(batch.results, 'uploader.near', { timeoutMs: 100 });

    expect(batch).toEqual({
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [{
        requestId: '',
        status: 'queued',
        cid: 'bafyRoot',
        createdAt: expect.any(Number),
      }],
    });
    expect(mockGetCidPinStatusFromStorageApi).toHaveBeenCalledWith('bafyRoot');
    expect(verify).toEqual({
      verified: 1,
      pending: 0,
      failed: 0,
    });
  });

  it('treats missing Lighthouse status as failed verification', async () => {
    const assets: UploadedAsset[] = [{ cid: 'bafyRoot', size: 123, type: 'delivery-root' }];
    mockGetCidPinStatusFromStorageApi.mockResolvedValue({
      status: 'missing',
      cid: 'bafyRoot',
      provider: 'lighthouse',
    });

    const { placeStorageOrders, verifyStorageOrders } = await import('@/lib/storage/provider');
    const batch = await placeStorageOrders(assets, 'uploader.near', { concurrency: 1 });
    const verify = await verifyStorageOrders(batch.results, 'uploader.near', { timeoutMs: 100 });

    expect(verify).toEqual({
      verified: 0,
      pending: 0,
      failed: 1,
    });
  });

  it('reports the Lighthouse upload path as inactive only when explicitly disabled', async () => {
    process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PRIMARY_UPLOAD = 'false';

    const { getActiveStorageProvider, isLighthouseUploadProviderActive } = await import('@/lib/storage/provider');

    expect(getActiveStorageProvider().id).toBe('lighthouse');
    expect(isLighthouseUploadProviderActive()).toBe(false);
  });
});
