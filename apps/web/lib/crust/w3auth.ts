/**
 * Crust W3Auth Module
 *
 * Generates W3Auth tokens from NEAR Session Keys for Crust IPFS uploads.
 * Uses the same BrowserKeyStore flow as session-key auth for signless UX.
 *
 * W3Auth format: Basic base64("near-{pubkey}:{signature_hex}")
 * where pubkey = ed25519 public key (no prefix)
 * and signature = sign(pubkey) with session key
 */

import { BrowserKeyStore } from '../keystore-v7';
import { NEAR_CONFIG } from '../constants';
import { getActiveUploadSessionKey } from '../upload-session-manager';
import { CrustAuthToken, CrustError } from './types';
import { CRUST_CONSTANTS } from './config';

/**
 * Token cache (in-memory)
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
    // Upload-session keys are kept in memory; legacy session keys live in localStorage.
    const activeUploadSessionKey = getActiveUploadSessionKey(accountId);
    const sessionKey =
      activeUploadSessionKey ??
      await new BrowserKeyStore().getKey(NEAR_CONFIG.networkId, accountId);

    if (!sessionKey) {
      throw new CrustError(
        'NO_SESSION_KEY',
        'Session Key not found in the active upload session or localStorage. Please create a Session Key first.'
      );
    }

    // Get public key and strip ed25519: prefix
    const publicKeyStr = sessionKey.getPublicKey().toString();
    const address = publicKeyStr.replace('ed25519:', '');

    // Sign the address (public key bytes) with session key
    const message = new TextEncoder().encode(address);
    const signResult = await sessionKey.sign(message);
    const signatureHex = Array.from(new Uint8Array(signResult.signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Build W3Auth payload: near-{address}:{signature_hex}
    const payload = `near-${address}:${signatureHex}`;
    const header = `Basic ${btoa(payload)}`;

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

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Return a token that is guaranteed to be valid for at least TOKEN_REFRESH_BUFFER_MS.
 * If the cached token is close to expiry, it is evicted and regenerated.
 */
export async function ensureFreshW3AuthToken(accountId: string): Promise<CrustAuthToken> {
  const cached = tokenCache.get(accountId);
  if (cached && Date.now() < cached.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return cached;
  }
  tokenCache.delete(accountId);
  return generateW3AuthToken(accountId);
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
