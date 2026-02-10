/**
 * Crust Storage Status Module
 *
 * Queries Crust chain for on-chain storage status of uploaded CIDs.
 * Non-blocking, informational - used to verify persistence guarantees.
 */

import { CrustStorageStatus, CrustError } from './types';
import { CRUST_CONSTANTS } from './config';

/**
 * Query Crust chain for storage status of a CID
 *
 * Uses the Crust Subscan API to check if a file has on-chain storage orders
 * and how many replicas exist. This is a read-only, non-blocking query.
 *
 * @param cid - IPFS CID to check
 * @returns CrustStorageStatus with replica count and order info
 */
export async function queryStorageStatus(cid: string): Promise<CrustStorageStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CRUST_CONSTANTS.STORAGE_STATUS_TIMEOUT);

  try {
    const response = await fetch(CRUST_CONSTANTS.STORAGE_STATUS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: cid }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      return emptyStatus(cid);
    }

    const data = await response.json();

    // Subscan returns file info if the CID has a storage order
    if (data.code === 0 && data.data) {
      const fileInfo = data.data;
      return {
        cid,
        replicas: fileInfo.reported_replica_count || fileInfo.replica_count || 0,
        fileSize: fileInfo.file_size || 0,
        expireAt: fileInfo.expired_at || 0,
        queriedAt: Date.now(),
        hasStorageOrder: true,
      };
    }

    // No storage order found
    return emptyStatus(cid);
  } catch (error: unknown) {
    clearTimeout(timer);

    // Non-blocking: return empty status on any failure
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[CRUST Storage Status] Query failed (non-blocking):', msg);
    return emptyStatus(cid);
  }
}

/**
 * Return an empty storage status (no on-chain order found)
 */
function emptyStatus(cid: string): CrustStorageStatus {
  return {
    cid,
    replicas: 0,
    fileSize: 0,
    expireAt: 0,
    queriedAt: Date.now(),
    hasStorageOrder: false,
  };
}
