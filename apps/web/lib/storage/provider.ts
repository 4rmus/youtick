import { FEATURE_FLAGS } from '../constants';
import type { UploadedAsset } from './cid-collector';
import { getCidPinStatusFromStorageApi, uploadDirectoryWithStorageApi, type StorageApiAuthSigner } from './storage-api';

export type StorageProviderId = 'lighthouse';

export interface StorageUploadOptions {
  onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void;
  timeout?: number;
  authSigner?: StorageApiAuthSigner;
}

export interface StorageDirectoryUploadEntry {
  path: string;
  cid: string;
  size: number;
}

export interface StorageDirectoryUploadResult {
  cid: string;
  size: number;
  entries: StorageDirectoryUploadEntry[];
  provider: StorageProviderId;
}

export interface StoragePinStatusResult {
  requestId: string;
  status: 'queued' | 'pinning' | 'pinned' | 'failed' | 'rate_limited';
  cid: string;
  createdAt: number;
  retryAfterMs?: number;
}

/** Result of a batch persistence tracking operation. */
export interface StorageOrderBatchResult {
  total: number;
  succeeded: number;
  failed: number;
  results: StoragePinStatusResult[];
}

/** Result of a batch persistence verification operation. */
export interface StorageOrderVerifyResult {
  verified: number;
  pending: number;
  failed: number;
}

export interface StorageProvider {
  id: StorageProviderId;
  uploadDirectory(
    files: Array<{ path: string; file: Blob }>,
    accountId: string,
    options?: StorageUploadOptions,
  ): Promise<StorageDirectoryUploadResult>;
  placeStorageOrders(
    assets: UploadedAsset[],
    accountId: string,
    options?: { concurrency?: number; retries?: number; retryBaseMs?: number },
  ): Promise<StorageOrderBatchResult>;
  verifyStorageOrders(
    results: StorageOrderBatchResult['results'],
    accountId: string,
    options?: { timeoutMs?: number; pollIntervalMs?: number },
  ): Promise<StorageOrderVerifyResult>;
}

const lighthouseStorageProvider: StorageProvider = {
  id: 'lighthouse',
  async uploadDirectory(files, _accountId, options) {
    if (!options?.authSigner) {
      throw new Error('Storage auth signer is required for Lighthouse storage uploads');
    }

    const result = await uploadDirectoryWithStorageApi(files, _accountId, options.authSigner, options);
    return { ...result, provider: 'lighthouse' };
  },
  async placeStorageOrders(assets) {
    const results = assets.map((asset) => ({
      requestId: '',
      status: 'queued' as const,
      cid: asset.cid,
      createdAt: Date.now(),
    }));

    return {
      total: assets.length,
      succeeded: assets.length,
      failed: 0,
      results,
    };
  },
  async verifyStorageOrders(results) {
    const statuses = await Promise.all(results.map(async (result) => {
      const status = await getCidPinStatusFromStorageApi(result.cid);
      if (status.status === 'found') return 'verified';
      if (status.status === 'missing' || status.status === 'failed' || status.status === 'skipped') return 'failed';
      return 'pending';
    }));

    return {
      verified: statuses.filter((status) => status === 'verified').length,
      pending: statuses.filter((status) => status === 'pending').length,
      failed: statuses.filter((status) => status === 'failed').length,
    };
  },
};

export function getActiveStorageProvider(): StorageProvider {
  return lighthouseStorageProvider;
}

export function isLighthouseUploadProviderActive(): boolean {
  return FEATURE_FLAGS.enableLighthousePrimaryUpload;
}

export async function uploadDirectoryToStorage(
  files: Array<{ path: string; file: Blob }>,
  accountId: string,
  options?: StorageUploadOptions,
): Promise<StorageDirectoryUploadResult> {
  return await getActiveStorageProvider().uploadDirectory(files, accountId, options);
}

export async function placeStorageOrders(
  assets: UploadedAsset[],
  accountId: string,
  options?: { concurrency?: number; retries?: number; retryBaseMs?: number },
): Promise<StorageOrderBatchResult> {
  return await getActiveStorageProvider().placeStorageOrders(assets, accountId, options);
}

export async function verifyStorageOrders(
  results: StorageOrderBatchResult['results'],
  accountId: string,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<StorageOrderVerifyResult> {
  return await getActiveStorageProvider().verifyStorageOrders(results, accountId, options);
}
