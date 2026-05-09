import { uploadDirectoryToCrust } from '../crust/client';
import type { UploadedAsset } from '../crust/cid-collector';
import {
  placeStorageOrders as placeCrustStorageOrders,
  verifyStorageOrders as verifyCrustStorageOrders,
  type StorageOrderBatchResult,
  type StorageOrderVerifyResult,
} from '../crust/storage-order';
import type { CrustDirectoryUploadResult } from '../crust/types';

export type StorageProviderId = 'crust';

export interface StorageUploadOptions {
  onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void;
  timeout?: number;
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

export function getActiveStorageProvider(): StorageProvider {
  return crustStorageProvider;
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
