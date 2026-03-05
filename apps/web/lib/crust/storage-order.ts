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
import { generateW3AuthToken } from './w3auth';

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
  const timer = setTimeout(() => controller.abort(), CRUST_CONSTANTS.UPLOAD_TIMEOUT);

  try {
    // Generate W3Auth token (reuses cached token if valid)
    const authToken = await generateW3AuthToken(accountId);

    const response = await fetch(CRUST_CONSTANTS.PSA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': authToken.header,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cid,
        name: `youtick-${cid.slice(0, 12)}`,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CRUST Storage Order] 🚨 CRITICAL FAILURE: PSA request to ${CRUST_CONSTANTS.PSA_ENDPOINT} returned ${response.status}`, errorText);
      console.error(`[CRUST Storage Order] This means CID ${cid} may be lost to garbage collection soon!`);
      return {
        requestId: '',
        status: 'failed',
        cid,
        createdAt: Date.now(),
      };
    }

    const data = await response.json();

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
    clearTimeout(timer);
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[CRUST Storage Order] Failed (non-blocking):', msg);

    return {
      requestId: '',
      status: 'failed',
      cid,
      createdAt: Date.now(),
    };
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
        'Authorization': authToken.header,
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
