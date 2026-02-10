/**
 * Crust Storage Order Module
 *
 * Places on-chain storage orders via Crust's IPFS Pinning Service API (PSA).
 * Uses W3Auth (NEAR Session Key) for authentication - no Polkadot SDK required.
 *
 * This ensures files have economic incentive for long-term persistence on Crust chain.
 */

import { CrustPsaPinResult, CrustError } from './types';
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
      console.warn('[CRUST Storage Order] PSA request failed:', response.status, errorText);
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
 * Map PSA status string to our enum
 */
function mapPsaStatus(status: string | undefined): CrustPsaPinResult['status'] {
  switch (status?.toLowerCase()) {
    case 'pinned': return 'pinned';
    case 'pinning': return 'pinning';
    case 'queued': return 'queued';
    default: return 'queued';
  }
}
