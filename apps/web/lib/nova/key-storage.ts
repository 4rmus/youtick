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
  const MAX_RETRIES = 4;
  const RETRY_DELAYS = [3000, 5000, 8000, 12000];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await sdk.upload(groupId, keyBuffer, 'key.bin');
      return result.cid;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const isTransient =
        msg.includes('not exist') ||
        msg.includes('500') ||
        msg.includes('503') ||
        msg.includes('timeout') ||
        msg.includes('Key not found') ||
        msg.includes('key fetch failed') ||
        msg.includes('Shade key') ||
        msg.includes('RPC not available') ||
        msg.includes('signing account') ||
        msg.includes('PROXY_TIMEOUT') ||
        msg.includes('PROXY_NETWORK_ERROR');

      if (isTransient && attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt];

        // If TEE doesn't know the group key, re-trigger group registration
        // to complete the TEE part (on-chain part is idempotent via recovery)
        if (msg.includes('Key not found') || msg.includes('Shade key')) {
          console.warn(
            `[Nova KeyStorage] TEE key missing for group "${groupId}". ` +
            `Re-triggering registerGroup to complete TEE registration...`
          );
          try {
            await sdk.registerGroup(groupId);
            console.log(`[Nova KeyStorage] registerGroup re-call succeeded for "${groupId}"`);
          } catch {
            // Expected: balance error if group already exists on-chain.
            // TEE registration may still have completed before the error.
            console.warn(`[Nova KeyStorage] registerGroup re-call threw (expected if on-chain exists), continuing with retry...`);
          }
        }

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

    // Skip isAuthorized pre-check — sdk.retrieve() enforces auth at TEE level.
    // The pre-check can return stale results after a recent addGroupMember,
    // causing false ACCESS_DENIED errors due to TEE propagation delay.
    const result = await sdk.retrieve(groupId, keyCid);
    const aesKeyB64 = Buffer.from(result.data).toString('utf-8');
    return aesKeyB64;
  } catch (error: unknown) {
    if (error instanceof NovaError) throw error;

    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Nova KeyStorage] Failed to retrieve key:', msg);

    if (msg.includes('not authorized') || msg.includes('ACCESS_DENIED')) {
      throw new NovaError('ACCESS_DENIED', `Account ${accountId} not authorized for group ${groupId}`);
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
