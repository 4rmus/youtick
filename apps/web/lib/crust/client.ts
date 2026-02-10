/**
 * Crust Client Module
 *
 * Handles file uploads to Crust IPFS and pin operations.
 * Uses W3Auth (NEAR Session Key) for authentication.
 */

import { CrustUploadResult, CrustPinResult, CrustError } from './types';
import { CRUST_CONSTANTS } from './config';
import { generateW3AuthToken } from './w3auth';
import { getGatewayUrl } from './gateway';

/**
 * Upload a file to Crust IPFS
 *
 * @param file - File or Blob to upload
 * @param accountId - NEAR account ID (for W3Auth)
 * @param options - Optional upload options
 * @returns CrustUploadResult with CID and size
 * @throws CrustError if upload fails
 */
export async function uploadToCrust(
  file: Blob,
  accountId: string,
  options?: {
    onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void;
    timeout?: number;
  }
): Promise<CrustUploadResult> {
  try {
    // Generate W3Auth token
    const authToken = await generateW3AuthToken(accountId);

    // Build FormData
    const formData = new FormData();
    formData.append('file', file);

    const timeout = options?.timeout || CRUST_CONSTANTS.UPLOAD_TIMEOUT;

    // Use XMLHttpRequest for progress tracking
    const result = await new Promise<CrustUploadResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const timer = setTimeout(() => {
        xhr.abort();
        reject(new CrustError('TIMEOUT', `Upload timed out after ${timeout}ms`));
      }, timeout);

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && options?.onProgress) {
          options.onProgress({
            loaded: event.loaded,
            total: event.total,
            percentage: Math.round((event.loaded / event.total) * 100),
          });
        }
      });

      xhr.addEventListener('load', () => {
        clearTimeout(timer);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve({
              cid: response.Hash,
              size: Number(response.Size) || file.size,
            });
          } catch (err) {
            reject(new CrustError('UPLOAD_FAILED', `Invalid response from Crust: ${xhr.responseText}`));
          }
        } else {
          reject(new CrustError('UPLOAD_FAILED', `Crust upload returned HTTP ${xhr.status}: ${xhr.responseText}`));
        }
      });

      xhr.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new CrustError('UPLOAD_FAILED', 'Network error during Crust upload'));
      });

      xhr.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new CrustError('TIMEOUT', 'Crust upload aborted'));
      });

      xhr.open('POST', CRUST_CONSTANTS.UPLOAD_ENDPOINT);
      xhr.setRequestHeader('Authorization', authToken.header);
      xhr.send(formData);
    });

    console.log('[DECENTRALIZATION_METRIC] crust_upload_success', {
      accountId,
      cid: result.cid,
      size: result.size,
    });

    return result;
  } catch (error: unknown) {
    if (error instanceof CrustError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new CrustError(
      'UPLOAD_FAILED',
      `Crust upload failed: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Verify a CID is pinned on Crust by checking the Crust API
 *
 * Since we upload directly to Crust (crustipfs.xyz/api/v0/add),
 * the file is already pinned. This just confirms availability
 * via the Crust read endpoint (POST /api/v0/cat).
 *
 * @param cid - IPFS CID to verify
 * @param _accountId - NEAR account ID (unused, kept for API compat)
 * @returns CrustPinResult with status
 */
export async function pinOnCrust(
  cid: string,
  _accountId: string
): Promise<CrustPinResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CRUST_CONSTANTS.FETCH_TIMEOUT);

    // HEAD-like check via Crust API — file was already uploaded, just verify it's available
    const response = await fetch(`${CRUST_CONSTANTS.READ_ENDPOINT}?arg=${cid}`, {
      method: 'POST',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (response.ok) {
      // Consume and discard the body to release the connection
      await response.blob();
      return { cid, status: 'pinned', gateway: 'crustipfs.xyz' };
    }

    console.warn('[CRUST Pin] CID not yet available on Crust:', cid, response.status);
    return { cid, status: 'failed', gateway: 'crustipfs.xyz' };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[CRUST Pin] Verification skipped (non-blocking):', errorMessage);
    return { cid, status: 'failed', gateway: 'crustipfs.xyz' };
  }
}

/**
 * Verify that a CID is available on Crust gateways
 *
 * @param cid - IPFS CID to verify
 * @returns true if accessible
 */
export async function verifyCrustAvailability(cid: string): Promise<boolean> {
  try {
    const url = getGatewayUrl(cid);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CRUST_CONSTANTS.FETCH_TIMEOUT);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}
