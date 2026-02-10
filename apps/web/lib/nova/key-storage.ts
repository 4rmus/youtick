/**
 * Nova Key Storage Module
 *
 * Uses Nova SDK to store/retrieve tiny AES encryption keys (~44 bytes).
 * Nova's TEE-based access control ensures only group members can
 * retrieve the key, preserving the security model.
 *
 * This replaces sending the entire encrypted file through Nova,
 * which caused 413 errors for large files.
 */

import { getNovaSdk, hasApiKey } from './config';
import { NovaError } from './types';

/**
 * Store an AES encryption key in Nova (TEE-protected)
 *
 * The key is tiny (~44 bytes base64), well under any upload limit.
 * Only members of the specified group can retrieve it.
 *
 * @param groupId - Nova group ID (controls who can access the key)
 * @param aesKeyB64 - Base64-encoded AES-256 key
 * @param accountId - NEAR account performing the store
 * @returns CID of the stored key
 */
export async function storeEncryptionKey(
  groupId: string,
  aesKeyB64: string,
  accountId: string,
): Promise<string> {
  if (!hasApiKey()) {
    throw new NovaError('INVALID_CONFIG', 'Nova API key required. Set NOVA_API_KEY.');
  }

  const sdk = await getNovaSdk();
  const keyBuffer = Buffer.from(aesKeyB64, 'utf-8');
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [2000, 4000, 6000];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await sdk.upload(groupId, keyBuffer, 'key.bin');
      return result.cid;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const isTransient = msg.includes('not exist') || msg.includes('500') || msg.includes('503') || msg.includes('timeout');

      if (isTransient && attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(
          `[Nova KeyStorage] Upload attempt ${attempt + 1}/${MAX_RETRIES} failed. ` +
          `Retrying in ${delay}ms...`, msg
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      console.error('[Nova KeyStorage] Failed to store key:', msg);
      throw new NovaError(
        'UPLOAD_FAILED',
        `Failed to store encryption key in Nova: ${msg}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  throw new NovaError('UPLOAD_FAILED', `Failed to store key after ${MAX_RETRIES} attempts`);
}

/**
 * Retrieve an AES encryption key from Nova (TEE-protected)
 *
 * Only succeeds if the requester is a member of the group.
 *
 * @param groupId - Nova group ID
 * @param keyCid - CID of the stored key
 * @param accountId - NEAR account requesting the key
 * @returns Base64-encoded AES-256 key
 */
export async function retrieveEncryptionKey(
  groupId: string,
  keyCid: string,
  accountId: string,
): Promise<string> {
  if (!hasApiKey()) {
    throw new NovaError('INVALID_CONFIG', 'Nova API key required. Set NOVA_API_KEY.');
  }

  try {
    const sdk = await getNovaSdk();

    // Verify authorization first
    const isAuthorized = await sdk.isAuthorized(groupId, accountId);
    if (!isAuthorized) {
      throw new NovaError('ACCESS_DENIED', `Account ${accountId} not authorized for group ${groupId}`);
    }

    const result = await sdk.retrieve(groupId, keyCid);
    const aesKeyB64 = Buffer.from(result.data).toString('utf-8');
    return aesKeyB64;
  } catch (error: unknown) {
    if (error instanceof NovaError) throw error;

    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Nova KeyStorage] Failed to retrieve key:', msg);

    if (msg.includes('not authorized')) {
      throw new NovaError('ACCESS_DENIED', `Not authorized to access key ${keyCid}`);
    }
    if (msg.includes('not found')) {
      throw new NovaError('NOT_FOUND', `Key ${keyCid} not found`);
    }

    throw new NovaError(
      'FETCH_FAILED',
      `Failed to retrieve encryption key: ${msg}`,
      error instanceof Error ? error : undefined,
    );
  }
}
