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
import { NOVA_CONSTANTS, getGatewayUrl, hasApiKey, getNovaSdk, createNovaGroup } from './config';
import { getRegisterGroupFee } from './costs';
import { verifyAttestation } from './attestation';
import { uploadToCrust, fetchFromGateways, pinOnCrust } from '../crust';

import { placeStorageOrder } from '../crust/storage-order';
import { generateEncryptionKey, decryptFile } from '../crypto/aes-gcm';
import { isChunkedFormat, decryptFileChunked, encryptFileFromBlob } from '../crypto/aes-ctr-chunked';
import { storeEncryptionKey, retrieveEncryptionKey } from './key-storage';

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

    // 1b. Opt-in attestation verification
    if (options?.verifyAttestation) {
      const attestResult = await verifyAttestation();
      if (!attestResult.verified) {
        throw new NovaError(
          'ATTESTATION_FAILED',
          `TEE attestation failed before upload: ${attestResult.error}`
        );
      }
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

    // Non-blocking Crust pin (fire-and-forget)
    pinOnCrust(uploadResult.cid, accountId).then(result => {
      console.log('[DECENTRALIZATION_METRIC] crust_pin_success', {
        cid: uploadResult.cid, status: result.status
      });
    }).catch(err => {
      console.warn('[CRUST] Non-blocking pin failed:', err instanceof Error ? err.message : String(err));
      console.log('[DECENTRALIZATION_METRIC] crust_pin_failed', {
        cid: uploadResult.cid, error: err instanceof Error ? err.message : String(err)
      });
    });

    // Non-blocking: Place Crust storage order for on-chain persistence
    placeStorageOrder(uploadResult.cid, file.size, accountId).then(orderResult => {
      console.log('[DECENTRALIZATION_METRIC] crust_storage_order_result', {
        cid: uploadResult.cid, status: orderResult.status, requestId: orderResult.requestId
      });
    }).catch(err => {
      console.warn('[CRUST] Non-blocking storage order failed:', err instanceof Error ? err.message : String(err));
    });

    return {
      cid: uploadResult.cid,
      groupId: uploadResult.groupId,
      keyCid: uploadResult.keyCid || '',
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
/**
 * Hybrid upload: Client-side AES encrypt → Crust storage → Nova key store
 *
 * Instead of sending the entire file through Nova (which causes 413 errors),
 * we encrypt client-side, upload the binary to Crust, and only store the
 * tiny AES key (~44 bytes) in Nova for TEE-protected access control.
 */
async function uploadToNOVA(
  file: Blob,
  authToken: string,
  accountId: string,
  options?: NovaUploadOptions
): Promise<{ cid: string; groupId: string; keyCid?: string }> {
  if (!hasApiKey()) {
    throw new NovaError('INVALID_CONFIG', 'Nova API key required. Set NOVA_API_KEY.');
  }

  try {
    const onStage = options?.onStageChange;
    const tempGroupId = `video_${Date.now()}`;

    // 1. Create Nova group (for access control)
    // Fee is already transferred to Nova sub-account via fund_nova_platform() before this call
    onStage?.('group');
    const groupId = await createNovaGroup(tempGroupId);

    // 1b. Add uploader as group member (group is owned by the Nova platform account,
    // so the uploader must be explicitly added to access their own content)
    const sdk = await getNovaSdk();
    await sdk.addGroupMember(groupId, accountId);

    // 2. Client-side AES-256-CTR chunked encryption (memory-efficient via file.slice())
    onStage?.('encrypt');
    const aesKey = await generateEncryptionKey();
    const encrypted = await encryptFileFromBlob(file, aesKey);

    // 3. Upload encrypted binary to Crust (no base64 inflation!)
    onStage?.('upload');
    const encryptedBlob = new Blob([encrypted.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const crustResult = await uploadToCrust(encryptedBlob, accountId, {
      onProgress: options?.onProgress,
    });

    // 4. Store tiny AES key in Nova (TEE-protected, ~44 bytes)
    onStage?.('key');
    const keyCid = await storeEncryptionKey(groupId, aesKey, accountId);

    return {
      cid: crustResult.cid,
      groupId,
      keyCid,
    };

  } catch (error: unknown) {
    console.error('[NOVA Upload] Hybrid upload failed:', error);

    if (error instanceof NovaError) throw error;

    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('balance') || errorMessage.includes('cost') || errorMessage.includes('Insufficient')) {
      const fee = await getRegisterGroupFee();
      throw new NovaError(
        'UPLOAD_FAILED',
        `Nova group registration failed. Required: ~${fee.toFixed(2)} NEAR. ` +
        `Ensure fund_nova_platform() was called before upload.`
      );
    }

    if (errorMessage.includes('not found')) {
      throw new NovaError('UPLOAD_FAILED', 'NOVA account not found - create one at nova-sdk.com');
    }

    throw new NovaError('UPLOAD_FAILED', `Hybrid upload failed: ${errorMessage}`, error instanceof Error ? error : undefined);
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
  if (!options?.groupId) {
    throw new NovaError('FETCH_FAILED', 'groupId is required in fetch options');
  }

  try {
    // 1. Generate auth token
    const authToken = await generateNovaAuthToken(accountId);

    // 1b. Opt-in attestation verification
    if (options?.verifyAttestation) {
      const attestResult = await verifyAttestation();
      if (!attestResult.verified) {
        throw new NovaError(
          'ATTESTATION_FAILED',
          `TEE attestation failed before fetch: ${attestResult.error}`
        );
      }
    }

    // 2. Fetch encrypted data from Crust, decrypt with Nova key
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
 * Fetch and decrypt file via Crust+Nova hybrid flow.
 *
 * Fetch encrypted binary from Crust → retrieve AES key from Nova TEE → decrypt client-side.
 */
async function fetchFromNOVA(
  cid: string,
  authToken: string,
  requester: string,
  groupId: string,
  options: NovaFetchOptions
): Promise<Uint8Array> {
  if (!hasApiKey()) {
    throw new NovaError('INVALID_CONFIG', 'Nova API key required. Set NOVA_API_KEY.');
  }

  try {
    // 1. Retrieve AES key from Nova (TEE-protected)
    const aesKey = await retrieveEncryptionKey(groupId, options.keyCid, requester);

    // 2. Fetch encrypted binary from Crust gateways
    const response = await fetchFromGateways(cid);
    const encryptedBuffer = await response.arrayBuffer();
    const encrypted = new Uint8Array(encryptedBuffer);

    // 3. Decrypt client-side (auto-detect format)
    let decrypted: Uint8Array;
    if (isChunkedFormat(encrypted)) {
      decrypted = await decryptFileChunked(encrypted, aesKey);
    } else {
      decrypted = await decryptFile(encrypted, aesKey);
    }

    return decrypted;
  } catch (error: unknown) {
    if (error instanceof NovaError) throw error;

    const msg = error instanceof Error ? error.message : String(error);
    throw new NovaError('FETCH_FAILED', `Fetch failed: ${msg}`, error instanceof Error ? error : undefined);
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
  const uploadPromises = files.map((file, index) =>
    uploadFile(file, accountId, {
      ...options,
      filename: options?.filename ? `${options.filename}_${index}` : undefined
    })
  );

  try {
    const results = await Promise.all(uploadPromises);
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

