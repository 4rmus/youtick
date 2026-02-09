/**
 * NOVA Client Module
 *
 * Handles file upload/download with TEE encryption.
 */

import { generateNovaAuthToken } from './auth';
import { createGroup } from './groups';
import {
  NovaUploadResult,
  NovaUploadOptions,
  NovaFetchOptions,
  NovaError,
  UploadProgress
} from './types';
import { NOVA_CONSTANTS, getGatewayUrl, hasApiKey, getNovaSdk, isSimulationAllowed } from './config';
import { canRegisterNewGroup, getRegisterGroupFee, getNovaPlatformBalance } from './costs';
import { verifyAttestation } from './attestation';

/**
 * Upload file to NOVA with automatic TEE encryption
 *
 * NOVA handles both encryption (via TEE) and IPFS upload in one operation.
 *
 * @param file - File or Blob to upload
 * @param accountId - NEAR account (becomes group owner)
 * @param options - Upload options (filename, progress callback, timeout)
 * @returns NovaUploadResult with CID and group ID
 * @throws NovaError if upload fails
 */
export async function uploadFile(
  file: Blob,
  accountId: string,
  options?: NovaUploadOptions
): Promise<NovaUploadResult> {
  console.log('[NOVA Upload] Starting upload...', {
    size: file.size,
    type: file.type,
    accountId,
    filename: options?.filename
  });

  // Validate file size
  if (file.size > NOVA_CONSTANTS.MAX_FILE_SIZE) {
    throw new NovaError(
      'UPLOAD_FAILED',
      `File size ${file.size} bytes exceeds maximum ${NOVA_CONSTANTS.MAX_FILE_SIZE} bytes`
    );
  }

  try {
    // 1. Generate auth token (signless via Session Key)
    const authToken = await generateNovaAuthToken(accountId);
    console.log('[NOVA Upload] Auth token generated');

    // 1b. Opt-in attestation verification
    if (options?.verifyAttestation) {
      const attestResult = await verifyAttestation();
      if (!attestResult.verified) {
        throw new NovaError(
          'ATTESTATION_FAILED',
          `TEE attestation failed before upload: ${attestResult.error}`
        );
      }
      console.log('[NOVA Upload] TEE attestation verified');
    }

    // 2. Upload to NOVA (auto-encrypts with TEE, creates group)
    const uploadResult = await uploadToNOVA(file, authToken.authToken, accountId, options);

    console.log('[DECENTRALIZATION_METRIC] nova_upload_success', {
      accountId,
      cid: uploadResult.cid,
      groupId: uploadResult.groupId,
      size: file.size,
      method: 'tee_encryption',
      signless: true
    });

    return {
      cid: uploadResult.cid,
      groupId: uploadResult.groupId,
      size: file.size,
      teeEncrypted: true
    };

  } catch (error: unknown) {
    console.error('[NOVA Upload] Failed:', error);

    if (error instanceof NovaError) {
      throw error;
    }

    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'TEE_UNAVAILABLE') {
      throw new NovaError('TEE_UNAVAILABLE', 'NOVA Shade Agent is unavailable');
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new NovaError(
      'UPLOAD_FAILED',
      `NOVA upload failed: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Upload to NOVA IPFS with real SDK integration
 *
 * @param file - File to upload
 * @param authToken - NOVA auth token (not used directly - SDK manages auth)
 * @param options - Upload options
 * @returns Upload result with CID
 */
async function uploadToNOVA(
  file: Blob,
  authToken: string,
  accountId: string,
  options?: NovaUploadOptions
): Promise<{ cid: string; groupId: string }> {
  if (!hasApiKey()) {
    if (!isSimulationAllowed()) {
      throw new NovaError('INVALID_CONFIG', 'Nova API key required in production. Set NEXT_PUBLIC_NOVA_API_KEY.');
    }
    console.warn('[NOVA Upload] API key not configured - simulating upload');

    // Simulate upload with progress
    if (options?.onProgress) {
      for (let i = 0; i <= 100; i += 10) {
        const loaded = (file.size * i) / 100;
        options.onProgress({
          loaded,
          total: file.size,
          percentage: i
        });
        await sleep(100);
      }
    }

    // Return simulated CID (real IPFS CID format)
    const simulatedCid = `Qm${Math.random().toString(36).substring(2, 46).toUpperCase()}`;
    const simulatedGroupId = `group_${Date.now()}`;
    console.log('[NOVA Upload] Simulated upload complete:', simulatedCid);

    return { cid: simulatedCid, groupId: simulatedGroupId };
  }

  try {
    const sdk = getNovaSdk();

    // Generate group ID from CID (will be known after upload)
    const filename = options?.filename || 'video.mp4';
    const tempGroupId = `video_${Date.now()}`;

    // Pre-flight: check if Nova platform has enough balance for group registration
    const canRegister = await canRegisterNewGroup();
    if (!canRegister) {
      const [fee, balance] = await Promise.all([getRegisterGroupFee(), getNovaPlatformBalance()]);
      throw new NovaError(
        'UPLOAD_FAILED',
        `Nova platform has insufficient balance for group registration. ` +
        `Required: ~${fee.toFixed(2)} NEAR, Available: ${balance.toFixed(4)} NEAR. ` +
        `Please contact support or try again later.`
      );
    }

    // Register group first
    console.log('[NOVA Upload] Registering group:', tempGroupId);
    await sdk.registerGroup(tempGroupId);

    // Convert Blob to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload file to NOVA
    console.log('[NOVA Upload] Uploading file to NOVA...', {
      size: file.size,
      filename,
      groupId: tempGroupId
    });

    const result = await sdk.upload(tempGroupId, buffer, filename);

    console.log('[NOVA Upload] Upload successful:', {
      cid: result.cid,
      transId: result.trans_id,
      fileHash: result.file_hash
    });

    return {
      cid: result.cid,
      groupId: tempGroupId
    };

  } catch (error: unknown) {
    console.error('[NOVA Upload] SDK upload failed:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Map NOVA SDK errors to our error types
    if (errorMessage.includes('balance') || errorMessage.includes('cost') || errorMessage.includes('Insufficient')) {
      throw new NovaError(
        'UPLOAD_FAILED',
        'Nova platform has insufficient balance for group registration. ' +
        'The upload requires ~0.67 NEAR for Nova group setup. ' +
        'Please try again later or contact support.'
      );
    }

    if (errorMessage.includes('not found')) {
      throw new NovaError('UPLOAD_FAILED', 'NOVA account not found - create one at nova-sdk.com');
    }

    throw new NovaError('UPLOAD_FAILED', `NOVA SDK upload failed: ${errorMessage}`, error instanceof Error ? error : undefined);
  }
}

/**
 * Fetch and decrypt file from NOVA
 *
 * NOVA handles both IPFS retrieval and TEE decryption in one operation.
 *
 * @param cid - IPFS CID of encrypted file
 * @param accountId - NEAR account requesting access
 * @param options - Fetch options (must include groupId)
 * @returns Decrypted file data
 * @throws NovaError if fetch fails or access denied
 */
export async function fetchFile(
  cid: string,
  accountId: string,
  options: NovaFetchOptions
): Promise<Uint8Array> {
  console.log('[NOVA Fetch] Fetching file...', { cid, accountId, groupId: options.groupId });

  if (!options?.groupId) {
    throw new NovaError('FETCH_FAILED', 'groupId is required in fetch options');
  }

  try {
    // 1. Generate auth token
    const authToken = await generateNovaAuthToken(accountId);
    console.log('[NOVA Fetch] Auth token generated');

    // 1b. Opt-in attestation verification
    if (options?.verifyAttestation) {
      const attestResult = await verifyAttestation();
      if (!attestResult.verified) {
        throw new NovaError(
          'ATTESTATION_FAILED',
          `TEE attestation failed before fetch: ${attestResult.error}`
        );
      }
      console.log('[NOVA Fetch] TEE attestation verified');
    }

    // 2. Fetch from NOVA (auto-decrypts with TEE if authorized)
    const decryptedData = await fetchFromNOVA(
      cid,
      authToken.authToken,
      accountId,
      options.groupId,
      options
    );

    console.log('[DECENTRALIZATION_METRIC] nova_decrypt_success', {
      accountId,
      cid,
      groupId: options.groupId,
      size: decryptedData.byteLength,
      method: 'tee_decryption'
    });

    return decryptedData;

  } catch (error: unknown) {
    console.error('[NOVA Fetch] Failed:', error);

    if (error instanceof NovaError) {
      throw error;
    }

    const errorCode = error && typeof error === 'object' && 'code' in error ? (error as { code: string }).code : undefined;

    if (errorCode === 'UNAUTHORIZED') {
      throw new NovaError('ACCESS_DENIED', `Not authorized to access ${cid}`);
    }

    if (errorCode === 'NOT_FOUND') {
      throw new NovaError('NOT_FOUND', `File ${cid} not found on NOVA IPFS`);
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new NovaError(
      'FETCH_FAILED',
      `NOVA fetch failed: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Fetch from NOVA IPFS with real SDK integration
 *
 * @param cid - IPFS CID
 * @param authToken - NOVA auth token (not used directly - SDK manages auth)
 * @param requester - NEAR account requesting access
 * @param groupId - NOVA group ID for the file
 * @param options - Fetch options
 * @returns Decrypted file data
 */
async function fetchFromNOVA(
  cid: string,
  authToken: string,
  requester: string,
  groupId: string,
  options?: NovaFetchOptions
): Promise<Uint8Array> {
  if (!hasApiKey()) {
    if (!isSimulationAllowed()) {
      throw new NovaError('INVALID_CONFIG', 'Nova API key required in production. Set NEXT_PUBLIC_NOVA_API_KEY.');
    }
    console.warn('[NOVA Fetch] API key not configured - simulating fetch');

    // Return simulated decrypted data
    const simulatedData = new TextEncoder().encode(
      `SIMULATED_DECRYPTED_VIDEO_DATA_FOR_${cid}_REQUESTED_BY_${requester}`
    );

    console.log('[NOVA Fetch] Simulated fetch complete:', simulatedData.byteLength, 'bytes');
    return simulatedData;
  }

  try {
    const sdk = getNovaSdk();

    // Check authorization first
    const isAuthorized = await sdk.isAuthorized(groupId, requester);
    if (!isAuthorized) {
      throw new NovaError('ACCESS_DENIED', `Account ${requester} not authorized for group ${groupId}`);
    }

    console.log('[NOVA Fetch] Retrieving file from NOVA...', {
      cid,
      groupId,
      requester
    });

    // Retrieve and decrypt file
    const result = await sdk.retrieve(groupId, cid);

    console.log('[NOVA Fetch] Retrieval successful:', {
      size: result.data.byteLength,
      ipfsHash: result.ipfs_hash
    });

    // Convert Buffer to Uint8Array
    return new Uint8Array(result.data);

  } catch (error: unknown) {
    console.error('[NOVA Fetch] SDK retrieval failed:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Map NOVA SDK errors to our error types
    if (errorMessage.includes('not authorized')) {
      throw new NovaError('ACCESS_DENIED', `Not authorized to access ${cid}`);
    }

    if (errorMessage.includes('not found')) {
      throw new NovaError('NOT_FOUND', `File ${cid} not found on NOVA IPFS`);
    }

    throw new NovaError('FETCH_FAILED', `NOVA SDK retrieval failed: ${errorMessage}`, error instanceof Error ? error : undefined);
  }
}

/**
 * Get NOVA gateway URL for CID
 *
 * Useful for thumbnail previews (public content).
 * For encrypted content, must use fetchFile() instead.
 *
 * @param cid - IPFS CID
 * @returns Full gateway URL
 */
export function getContentUrl(cid: string): string {
  const gatewayUrl = getGatewayUrl();
  return `${gatewayUrl}/${cid}`;
}

/**
 * Check if file exists on NOVA IPFS
 *
 * @param cid - IPFS CID
 * @returns true if file exists
 */
export async function checkFileExists(cid: string): Promise<boolean> {
  try {
    const url = getContentUrl(cid);
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error: unknown) {
    console.error('[NOVA] File existence check failed:', error);
    return false;
  }
}

/**
 * Upload multiple files in parallel
 *
 * @param files - Array of files to upload
 * @param accountId - NEAR account
 * @param options - Upload options
 * @returns Array of upload results
 */
export async function uploadFiles(
  files: Blob[],
  accountId: string,
  options?: NovaUploadOptions
): Promise<NovaUploadResult[]> {
  console.log('[NOVA Upload] Uploading', files.length, 'files in parallel');

  const uploadPromises = files.map((file, index) =>
    uploadFile(file, accountId, {
      ...options,
      filename: options?.filename ? `${options.filename}_${index}` : undefined
    })
  );

  try {
    const results = await Promise.all(uploadPromises);
    console.log('[NOVA Upload] All files uploaded successfully');
    return results;
  } catch (error: unknown) {
    console.error('[NOVA Upload] Batch upload failed:', error);
    throw error;
  }
}

/**
 * Upload JSON data to NOVA
 *
 * Helper for uploading metadata.
 *
 * @param data - JSON data to upload
 * @param accountId - NEAR account
 * @param filename - Optional filename
 * @returns Upload result
 */
export async function uploadJson(
  data: unknown,
  accountId: string,
  filename?: string
): Promise<NovaUploadResult> {
  const jsonString = JSON.stringify(data);
  const blob = new Blob([jsonString], { type: 'application/json' });

  return uploadFile(blob, accountId, {
    filename: filename || 'metadata.json'
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sleep helper for simulations
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
