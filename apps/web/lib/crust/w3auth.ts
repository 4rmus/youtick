/**
 * Crust W3Auth Module
 *
 * Generates W3Auth tokens from NEAR Session Keys for Crust IPFS uploads.
 * Uses the same BrowserKeyStore as Nova auth for signless UX.
 *
 * W3Auth format: Basic base64("near-{pubkey}:{signature_hex}")
 * where pubkey = ed25519 public key (no prefix)
 * and signature = sign(pubkey) with session key
 */

import { BrowserKeyStore } from '../keystore-v7';
import { NEAR_CONFIG } from '../constants';
import { CrustAuthToken, CrustError } from './types';
import { CRUST_CONSTANTS } from './config';

/**
 * Token cache (in-memory, follows nova/auth.ts pattern)
 * Key: accountId
 * Value: CrustAuthToken
 */
const tokenCache = new Map<string, CrustAuthToken>();

/**
 * Generate W3Auth token using NEAR Session Key
 *
 * @param accountId - NEAR account ID
 * @returns CrustAuthToken with Authorization header
 * @throws CrustError if Session Key missing
 */
export async function generateW3AuthToken(accountId: string): Promise<CrustAuthToken> {
  // Check cache first
  const cached = getCachedW3AuthToken(accountId);
  if (cached) {
    return cached;
  }

  try {
    // Retrieve Session Key from localStorage
    const keyStore = new BrowserKeyStore();
    const sessionKey = await keyStore.getKey(NEAR_CONFIG.networkId, accountId);

    if (!sessionKey) {
      throw new CrustError(
        'NO_SESSION_KEY',
        'Session Key not found in localStorage. Please create a Session Key first.'
      );
    }

    // Get public key and strip ed25519: prefix
    const publicKeyStr = sessionKey.getPublicKey().toString();
    const address = publicKeyStr.replace('ed25519:', '');

    // Sign the address (public key bytes) with session key
    const message = Buffer.from(address);
    const signResult = await sessionKey.sign(message);
    const signatureHex = Buffer.from(signResult.signature).toString('hex');

    // Build W3Auth payload: near-{address}:{signature_hex}
    const payload = `near-${address}:${signatureHex}`;
    const header = `Basic ${Buffer.from(payload).toString('base64')}`;

    const now = Date.now();
    const token: CrustAuthToken = {
      header,
      accountId,
      createdAt: now,
      expiresAt: now + CRUST_CONSTANTS.AUTH_CACHE_DURATION,
    };

    // Cache token
    tokenCache.set(accountId, token);

    console.log('[DECENTRALIZATION_METRIC] crust_w3auth_generated', {
      accountId,
      method: 'session_key',
      signless: true,
    });

    return token;
  } catch (error: unknown) {
    if (error instanceof CrustError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new CrustError(
      'AUTH_FAILED',
      `W3Auth token generation failed: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Get cached W3Auth token (if valid)
 *
 * @param accountId - NEAR account ID
 * @returns Cached token or undefined
 */
export function getCachedW3AuthToken(accountId: string): CrustAuthToken | undefined {
  const cached = tokenCache.get(accountId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached;
  }
  // Remove expired token
  if (cached) {
    tokenCache.delete(accountId);
  }
  return undefined;
}

/**
 * Clear W3Auth token cache
 *
 * @param accountId - Optional account to clear (clears all if omitted)
 */
export function clearW3AuthCache(accountId?: string): void {
  if (accountId) {
    tokenCache.delete(accountId);
  } else {
    tokenCache.clear();
  }
}
