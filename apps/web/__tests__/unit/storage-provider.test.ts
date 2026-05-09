import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadedAsset } from '@/lib/crust/cid-collector';
import type { CrustPsaPinResult } from '@/lib/crust/types';

const {
  mockUploadDirectoryToCrust,
  mockPlaceCrustStorageOrders,
  mockVerifyCrustStorageOrders,
} = vi.hoisted(() => ({
  mockUploadDirectoryToCrust: vi.fn(),
  mockPlaceCrustStorageOrders: vi.fn(),
  mockVerifyCrustStorageOrders: vi.fn(),
}));

vi.mock('@/lib/crust/client', () => ({
  uploadDirectoryToCrust: mockUploadDirectoryToCrust,
}));

vi.mock('@/lib/crust/storage-order', () => ({
  placeStorageOrders: mockPlaceCrustStorageOrders,
  verifyStorageOrders: mockVerifyCrustStorageOrders,
}));

describe('storage provider adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    mockUploadDirectoryToCrust.mockReset();
    mockPlaceCrustStorageOrders.mockReset();
    mockVerifyCrustStorageOrders.mockReset();
  });

  it('uses Crust as the active provider for directory uploads', async () => {
    mockUploadDirectoryToCrust.mockResolvedValue({
      cid: 'bafyRoot',
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
      cid: 'bafyRoot',
      size: 123,
      entries: [],
      provider: 'crust',
    });
  });

  it('delegates storage order placement and verification to Crust', async () => {
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
