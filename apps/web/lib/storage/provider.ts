import { uploadDirectoryToCrust } from '../crust/client';
import type { UploadedAsset } from '../crust/cid-collector';
import { APP_CONFIG, FEATURE_FLAGS } from '../constants';
import { getCidPinStatusFromStorageApi, uploadDirectoryWithStorageApi, type StorageApiAuthSigner } from './storage-api';
import {
  placeStorageOrders as placeCrustStorageOrders,
  verifyStorageOrders as verifyCrustStorageOrders,
  type StorageOrderBatchResult,
  type StorageOrderVerifyResult,
} from '../crust/storage-order';
import type { CrustDirectoryUploadResult } from '../crust/types';

export type StorageProviderId = 'crust' | 'lighthouse';

export interface StorageUploadOptions {
  onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void;
  timeout?: number;
  authSigner?: StorageApiAuthSigner;
}

export interface StorageDirectoryUploadResult extends CrustDirectoryUploadResult {
  provider: StorageProviderId;
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

const crustStorageProvider: StorageProvider = {
  id: 'crust',
  async uploadDirectory(files, accountId, options) {
    const result = await uploadDirectoryToCrust(files, accountId, options);
    return { ...result, provider: 'crust' };
  },
  placeStorageOrders: placeCrustStorageOrders,
  verifyStorageOrders: verifyCrustStorageOrders,
};

const lighthouseStorageProvider: StorageProvider = {
  id: 'lighthouse',
  async uploadDirectory(files, _accountId, options) {
    if (!options?.authSigner) {
      throw new Error('Storage auth signer is required for Lighthouse storage uploads');
    }

    try {
      const result = await uploadDirectoryWithStorageApi(files, _accountId, options.authSigner, options);
      return { ...result, provider: 'lighthouse' };
    } catch (error) {
      if (!FEATURE_FLAGS.enableCrustUploadFallback) {
        throw error;
      }

      console.warn('[Storage] Lighthouse primary upload failed, falling back to Crust', {
        reason: error instanceof Error ? error.message : String(error),
      });
      const result = await uploadDirectoryToCrust(files, _accountId, options);
      return { ...result, provider: 'crust' };
    }
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
  if (isLighthouseUploadProviderActive()) {
    return lighthouseStorageProvider;
  }

  return crustStorageProvider;
}

export function isLighthouseUploadProviderActive(): boolean {
  if (
    APP_CONFIG.storageUploadProvider === 'lighthouse'
    && FEATURE_FLAGS.enableLighthousePrimaryUpload
  ) {
    return true;
  }

  return false;
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
