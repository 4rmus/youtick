import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadedAsset } from '@/lib/crust/cid-collector';
import type { CrustPsaPinResult } from '@/lib/crust/types';

const {
  mockUploadDirectoryToCrust,
  mockUploadDirectoryWithStorageApi,
  mockPlaceCrustStorageOrders,
  mockVerifyCrustStorageOrders,
} = vi.hoisted(() => ({
  mockUploadDirectoryToCrust: vi.fn(),
  mockUploadDirectoryWithStorageApi: vi.fn(),
  mockPlaceCrustStorageOrders: vi.fn(),
  mockVerifyCrustStorageOrders: vi.fn(),
}));

vi.mock('@/lib/crust/client', () => ({
  uploadDirectoryToCrust: mockUploadDirectoryToCrust,
}));

vi.mock('@/lib/storage/storage-api', () => ({
  uploadDirectoryWithStorageApi: mockUploadDirectoryWithStorageApi,
}));

vi.mock('@/lib/crust/storage-order', () => ({
  placeStorageOrders: mockPlaceCrustStorageOrders,
  verifyStorageOrders: mockVerifyCrustStorageOrders,
}));

describe('storage provider adapter', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PRIMARY_UPLOAD;
    delete process.env.NEXT_PUBLIC_ENABLE_CRUST_UPLOAD_FALLBACK;
    delete process.env.NEXT_PUBLIC_STORAGE_UPLOAD_PROVIDER;
    vi.resetModules();
    mockUploadDirectoryToCrust.mockReset();
    mockUploadDirectoryWithStorageApi.mockReset();
    mockPlaceCrustStorageOrders.mockReset();
    mockVerifyCrustStorageOrders.mockReset();
  });

  it('uses Lighthouse as the active provider for directory uploads by default', async () => {
    mockUploadDirectoryWithStorageApi.mockResolvedValue({
      cid: 'bafyLighthouseRoot',
      size: 123,
      entries: [],
    });

    const { getActiveStorageProvider, uploadDirectoryToStorage } = await import('@/lib/storage/provider');
    const options = { timeout: 10_000 };
    const files = [{ path: 'manifest.json', file: new Blob(['{}']) }];
    const result = await uploadDirectoryToStorage(files, 'uploader.near', options);

    expect(getActiveStorageProvider().id).toBe('lighthouse');
    expect(mockUploadDirectoryWithStorageApi).toHaveBeenCalledWith(files, options);
    expect(mockUploadDirectoryToCrust).not.toHaveBeenCalled();
    expect(result).toEqual({
      cid: 'bafyLighthouseRoot',
      size: 123,
      entries: [],
      provider: 'lighthouse',
    });
  });

  it('can still use Crust when explicitly selected for legacy diagnostics', async () => {
    process.env.NEXT_PUBLIC_STORAGE_UPLOAD_PROVIDER = 'crust';
    mockUploadDirectoryToCrust.mockResolvedValue({
      cid: 'bafyCrustRoot',
      size: 123,
      entries: [],
    });

    const { getActiveStorageProvider, uploadDirectoryToStorage } = await import('@/lib/storage/provider');
    const options = { timeout: 10_000 };
    const files = [{ path: 'manifest.json', file: new Blob(['{}']) }];
    const result = await uploadDirectoryToStorage(files, 'uploader.near', options);

    expect(getActiveStorageProvider().id).toBe('crust');
    expect(mockUploadDirectoryToCrust).toHaveBeenCalledWith(files, 'uploader.near', options);
    expect(result).toEqual({
      cid: 'bafyCrustRoot',
      size: 123,
      entries: [],
      provider: 'crust',
    });
  });

  it('uses Lighthouse as the primary upload provider when explicitly selected', async () => {
    mockUploadDirectoryWithStorageApi.mockResolvedValue({
      cid: 'bafyLighthouseRoot',
      size: 123,
      entries: [],
    });

    const { getActiveStorageProvider, uploadDirectoryToStorage } = await import('@/lib/storage/provider');
    const options = { timeout: 10_000 };
    const files = [{ path: 'manifest.json', file: new Blob(['{}']) }];
    const result = await uploadDirectoryToStorage(files, 'uploader.near', options);

    expect(getActiveStorageProvider().id).toBe('lighthouse');
    expect(mockUploadDirectoryWithStorageApi).toHaveBeenCalledWith(files, options);
    expect(mockUploadDirectoryToCrust).not.toHaveBeenCalled();
    expect(result).toEqual({
      cid: 'bafyLighthouseRoot',
      size: 123,
      entries: [],
      provider: 'lighthouse',
    });
  });

  it('does not fall back to Crust when Lighthouse primary upload fails', async () => {
    mockUploadDirectoryWithStorageApi.mockRejectedValue(new Error('provider_upload_failed'));
    mockUploadDirectoryToCrust.mockResolvedValue({
      cid: 'bafyCrustRoot',
      size: 123,
      entries: [],
    });

    const { uploadDirectoryToStorage } = await import('@/lib/storage/provider');
    const options = { timeout: 10_000 };
    const files = [{ path: 'manifest.json', file: new Blob(['{}']) }];

    await expect(uploadDirectoryToStorage(files, 'uploader.near', options)).rejects.toThrow('provider_upload_failed');

    expect(mockUploadDirectoryWithStorageApi).toHaveBeenCalledWith(files, options);
    expect(mockUploadDirectoryToCrust).not.toHaveBeenCalled();
  });

  it('can opt into Crust fallback for emergency diagnostics', async () => {
    process.env.NEXT_PUBLIC_ENABLE_CRUST_UPLOAD_FALLBACK = 'true';
    mockUploadDirectoryWithStorageApi.mockRejectedValue(new Error('provider_upload_failed'));
    mockUploadDirectoryToCrust.mockResolvedValue({
      cid: 'bafyCrustRoot',
      size: 123,
      entries: [],
    });

    const { uploadDirectoryToStorage } = await import('@/lib/storage/provider');
    const options = { timeout: 10_000 };
    const files = [{ path: 'manifest.json', file: new Blob(['{}']) }];
    const result = await uploadDirectoryToStorage(files, 'uploader.near', options);

    expect(mockUploadDirectoryWithStorageApi).toHaveBeenCalledWith(files, options);
    expect(mockUploadDirectoryToCrust).toHaveBeenCalledWith(files, 'uploader.near', options);
    expect(result.provider).toBe('crust');
  });

  it('skips Crust storage order placement and verification for Lighthouse uploads', async () => {
    const assets: UploadedAsset[] = [{ cid: 'bafyRoot', size: 123, type: 'delivery-root' }];

    const { placeStorageOrders, verifyStorageOrders } = await import('@/lib/storage/provider');
    const batch = await placeStorageOrders(assets, 'uploader.near', { concurrency: 1 });
    const verify = await verifyStorageOrders(batch.results, 'uploader.near', { timeoutMs: 100 });

    expect(mockPlaceCrustStorageOrders).not.toHaveBeenCalled();
    expect(mockVerifyCrustStorageOrders).not.toHaveBeenCalled();
    expect(batch).toEqual({
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [],
    });
    expect(verify).toEqual({
      verified: 0,
      pending: 0,
      failed: 0,
    });
  });

  it('delegates storage order placement and verification to Crust only when Crust is active', async () => {
    process.env.NEXT_PUBLIC_STORAGE_UPLOAD_PROVIDER = 'crust';
    const assets: UploadedAsset[] = [{ cid: 'bafyRoot', size: 123, type: 'delivery-root' }];
    const results: CrustPsaPinResult[] = [{ requestId: 'req-1', status: 'queued', cid: 'bafyRoot', createdAt: 1 }];

    mockPlaceCrustStorageOrders.mockResolvedValue({
      total: 1,
      succeeded: 1,
      failed: 0,
      results,
    });
    mockVerifyCrustStorageOrders.mockResolvedValue({
      verified: 1,
      pending: 0,
      failed: 0,
    });

    const { placeStorageOrders, verifyStorageOrders } = await import('@/lib/storage/provider');
    const batch = await placeStorageOrders(assets, 'uploader.near', { concurrency: 1 });
    const verify = await verifyStorageOrders(batch.results, 'uploader.near', { timeoutMs: 100 });

    expect(mockPlaceCrustStorageOrders).toHaveBeenCalledWith(assets, 'uploader.near', { concurrency: 1 });
    expect(mockVerifyCrustStorageOrders).toHaveBeenCalledWith(results, 'uploader.near', { timeoutMs: 100 });
    expect(batch.succeeded).toBe(1);
    expect(verify.verified).toBe(1);
  });
});
