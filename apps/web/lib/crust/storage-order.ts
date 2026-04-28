/**
 * Crust Storage Order Module
 *
 * Places on-chain storage orders via Crust's IPFS Pinning Service API (PSA).
 * Uses W3Auth (NEAR Session Key) for authentication - no Polkadot SDK required.
 *
 * This ensures files have economic incentive for long-term persistence on Crust chain.
 */

import { CrustPsaPinResult } from './types';
import { CRUST_CONSTANTS } from './config';
import { generateW3AuthToken, ensureFreshW3AuthToken } from './w3auth';
import type { UploadedAsset } from './cid-collector';
import { recordMetric } from '../decentralization-metrics';

/** Result of a batch storage order operation */
export interface StorageOrderBatchResult {
  total: number;
  succeeded: number;
  failed: number;
  results: CrustPsaPinResult[];
}

/** Result of a batch verification operation */
export interface StorageOrderVerifyResult {
  verified: number;
  pending: number;
  failed: number;
}

/**
 * Place a Crust storage order via the Pinning Service API
 *
 * Uses W3Auth token (NEAR Session Key) for authentication.
 * This creates an on-chain storage order that incentivizes Crust nodes
 * to store and replicate the file.
 *
 * @param cid - IPFS CID to pin
 * @param fileSize - File size in bytes (for order pricing)
 * @param accountId - NEAR account ID (for W3Auth)
 * @returns CrustPsaPinResult with pin request status
 */
export async function placeStorageOrder(
  cid: string,
  fileSize: number,
  accountId: string
): Promise<CrustPsaPinResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CRUST_CONSTANTS.FETCH_TIMEOUT);

  try {
    // Generate W3Auth token (reuses cached token if valid)
    const authToken = await generateW3AuthToken(accountId);

    const response = await fetch(CRUST_CONSTANTS.PSA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': authToken.header.replace('Basic ', 'Bearer '),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cid,
        name: `youtick-${cid.slice(0, 12)}`,
        meta: {
          file_size: String(fileSize),
          app_id: 'youtick',
        },
      }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterMs = retryAfter
        ? (Number(retryAfter) || 0) * 1000
        : 10_000;
      recordMetric('crust_storage_order_rate_limited');
      return {
        requestId: '',
        status: 'rate_limited',
        cid,
        createdAt: Date.now(),
        retryAfterMs,
      };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CRUST Storage Order] 🚨 CRITICAL FAILURE: PSA request to ${CRUST_CONSTANTS.PSA_ENDPOINT} returned ${response.status}`, errorText);
      console.error(`[CRUST Storage Order] This means CID ${cid} may be lost to garbage collection soon!`);
      recordMetric('crust_storage_order_failed');
      return {
        requestId: '',
        status: 'failed',
        cid,
        createdAt: Date.now(),
      };
    }

    const data = await response.json();

    recordMetric('crust_storage_order_placed');

    console.log('[DECENTRALIZATION_METRIC] crust_storage_order_placed', {
      cid,
      fileSize,
      accountId,
      requestId: data.requestid || data.requestId || '',
      status: data.status || 'queued',
    });

    return {
      requestId: data.requestid || data.requestId || '',
      status: mapPsaStatus(data.status),
      cid,
      createdAt: Date.now(),
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[CRUST Storage Order] Failed (non-blocking):', msg);
    recordMetric('crust_storage_order_failed');

    return {
      requestId: '',
      status: 'failed',
      cid,
      createdAt: Date.now(),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check the status of a Crust storage order
 *
 * @param requestId - PSA pin request ID
 * @param accountId - NEAR account ID (for W3Auth)
 * @returns Updated status of the storage order
 */
export async function checkStorageOrderStatus(
  requestId: string,
  accountId: string
): Promise<CrustPsaPinResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CRUST_CONSTANTS.FETCH_TIMEOUT);

  try {
    const authToken = await generateW3AuthToken(accountId);

    const response = await fetch(`${CRUST_CONSTANTS.PSA_ENDPOINT}/${requestId}`, {
      method: 'GET',
      headers: {
        'Authorization': authToken.header.replace('Basic ', 'Bearer '),
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      return {
        requestId,
        status: 'failed',
        cid: '',
        createdAt: Date.now(),
      };
    }

    const data = await response.json();

    return {
      requestId: data.requestid || data.requestId || requestId,
      status: mapPsaStatus(data.status),
      cid: data.pin?.cid || '',
      createdAt: new Date(data.created || Date.now()).getTime(),
    };
  } catch (error: unknown) {
    clearTimeout(timer);
    console.warn('[CRUST] Storage order status check failed:', error instanceof Error ? error.message : String(error));

    return {
      requestId,
      status: 'failed',
      cid: '',
      createdAt: Date.now(),
    };
  }
}

/**
 * Place storage orders for all uploaded assets in parallel with retry.
 *
 * @param assets - All CID + size pairs collected during upload
 * @param accountId - NEAR account ID (for W3Auth)
 * @param options - Concurrency and retry settings
 * @returns Aggregated batch result
 */
export async function placeStorageOrders(
  assets: UploadedAsset[],
  accountId: string,
  options?: { concurrency?: number; retries?: number; retryBaseMs?: number },
): Promise<StorageOrderBatchResult> {
  await ensureFreshW3AuthToken(accountId);

  const concurrency = options?.concurrency ?? 3;
  const maxRetries = options?.retries ?? 3;
  const retryBaseMs = options?.retryBaseMs ?? 1_000;
  const results: CrustPsaPinResult[] = new Array(assets.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, assets.length || 1) },
    async () => {
      while (nextIndex < assets.length) {
        const current = nextIndex;
        nextIndex += 1;
        results[current] = await placeWithRetry(
          assets[current],
          accountId,
          maxRetries,
          retryBaseMs,
        );
      }
    },
  );

  await Promise.all(workers);

  const succeeded = results.filter((r) => r.status !== 'failed' && r.status !== 'rate_limited').length;
  const failed = results.filter((r) => r.status === 'failed' || r.status === 'rate_limited').length;

  console.log('[DECENTRALIZATION_METRIC] crust_storage_orders_batch', {
    total: assets.length,
    succeeded,
    failed,
    accountId,
  });

  return { total: assets.length, succeeded, failed, results };
}

/**
 * Verify that storage orders have reached "pinning" or "pinned" status.
 *
 * Only polls orders that are still "queued". Returns once all are resolved
 * or the timeout expires.
 *
 * @param results - Results from placeStorageOrders
 * @param accountId - NEAR account ID (for W3Auth)
 * @param options - Timeout and poll interval
 */
export async function verifyStorageOrders(
  results: CrustPsaPinResult[],
  accountId: string,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<StorageOrderVerifyResult> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 5_000;

  const trackable = results.filter(
    (r) => r.status === 'queued' && r.requestId,
  );

  if (trackable.length === 0) {
    const verified = results.filter(
      (r) => r.status === 'pinned' || r.status === 'pinning',
    ).length;
    const failed = results.filter((r) => r.status === 'failed').length;
    return { verified, pending: 0, failed };
  }

  const statuses = new Map(
    trackable.map((r) => [r.requestId, r.status]),
  );
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    await ensureFreshW3AuthToken(accountId);

    const queued = [...statuses.entries()].filter(
      ([, status]) => status === 'queued',
    );

    if (queued.length === 0) break;

    await Promise.all(
      queued.map(async ([requestId]) => {
        const updated = await checkStorageOrderStatus(requestId, accountId);
        if (updated.status !== 'queued') {
          statuses.set(requestId, updated.status);
        }
      }),
    );
  }

  let verified = 0;
  let pending = 0;
  let failed = 0;

  for (const r of results) {
    const finalStatus = statuses.get(r.requestId) ?? r.status;
    if (finalStatus === 'pinned' || finalStatus === 'pinning') {
      verified += 1;
      recordMetric('crust_storage_status_found');
    } else if (finalStatus === 'failed') {
      failed += 1;
      recordMetric('crust_storage_status_missing');
    } else {
      pending += 1;
    }
  }

  console.log('[DECENTRALIZATION_METRIC] crust_storage_orders_verified', {
    verified,
    pending,
    failed,
    accountId,
  });

  return { verified, pending, failed };
}

async function placeWithRetry(
  asset: UploadedAsset,
  accountId: string,
  maxRetries: number,
  retryBaseMs: number = 1_000,
): Promise<CrustPsaPinResult> {
  let lastResult: CrustPsaPinResult | null = null;
  let rateLimitedCount = 0;
  const maxRateLimitedRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0 && lastResult?.status !== 'rate_limited') {
      const delayMs = Math.pow(2, attempt) * retryBaseMs;
      await sleep(delayMs);
    }

    // SO-1 fix: Cap rate-limited retries to prevent infinite loop
    if (lastResult?.status === 'rate_limited') {
      rateLimitedCount++;
      if (rateLimitedCount > maxRateLimitedRetries) {
        console.warn(`[STORAGE] Rate-limited ${rateLimitedCount} times, giving up`);
        break;
      }
      const waitMs = lastResult.retryAfterMs ?? Math.pow(2, attempt) * retryBaseMs;
      await sleep(waitMs);
    }

    lastResult = await placeStorageOrder(asset.cid, asset.size, accountId);

    if (lastResult.status !== 'failed' && lastResult.status !== 'rate_limited') {
      return lastResult;
    }

    console.warn(
      `[DECENTRALIZATION_METRIC] crust_storage_order_retry`,
      { cid: asset.cid, type: asset.type, attempt: attempt + 1, maxRetries, status: lastResult?.status ?? 'unknown' },
    );
  }

  return lastResult ?? {
    requestId: '',
    status: 'failed',
    cid: asset.cid,
    createdAt: Date.now(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map PSA status string to our enum
 */
function mapPsaStatus(status: string | undefined): CrustPsaPinResult['status'] {
  switch (status?.toLowerCase()) {
    case 'pinned': return 'pinned';
    case 'pinning': return 'pinning';
    case 'queued': return 'queued';
    case 'failed': return 'failed';
    default: return 'queued';
  }
}
