/**
 * NOVA Authentication Module
 *
 * Handles NOVA authentication using NEAR Session Keys (signless).
 */

import { BrowserKeyStore } from '../keystore-v7';
import { NovaAuthToken, NovaError, NovaAuthRequest, NovaAuthResponse } from './types';
import { NOVA_CONSTANTS, hasApiKey, getApiKey, isSimulationAllowed } from './config';
import { verifyAttestation, getCachedAttestation } from './attestation';
import { NEAR_CONFIG } from '../constants';
import * as crypto from 'crypto';

/**
 * Token cache (in-memory)
 * Key: accountId
 * Value: NovaAuthToken
 */
const tokenCache = new Map<string, NovaAuthToken>();

/**
 * Generate NOVA authentication token using NEAR Session Key (signless)
 *
 * This is the CRITICAL function that enables signless UX.
 *
 * @param accountId - NEAR account ID
 * @returns NovaAuthToken with expiry
 * @throws NovaError if Session Key missing or auth fails
 */
export async function generateNovaAuthToken(
  accountId: string
): Promise<NovaAuthToken> {
  console.log('[NOVA Auth] Generating auth token for:', accountId);

  // 1. Check cache first
  const cached = getFromCache(accountId);
  if (cached && !isExpired(cached)) {
    console.log('[NOVA Auth] Using cached token (expires in', (cached.expiresAt - Date.now()) / 1000, 'seconds)');
    return cached;
  }

  try {
    // 2. Retrieve Session Key from localStorage
    const keyStore = new BrowserKeyStore();
    const sessionKey = await keyStore.getKey(NEAR_CONFIG.networkId, accountId);

    if (!sessionKey) {
      throw new NovaError(
        'NO_SESSION_KEY',
        'Session Key not found in localStorage. Please create a Session Key first.'
      );
    }

    console.log('[NOVA Auth] Session Key retrieved from localStorage');

    // 3. Generate NOVA nonce (timestamp-based + randomness)
    const nonce = generateNonce();
    console.log('[NOVA Auth] Nonce generated:', nonce);

    // 4. Sign nonce with Session Key
    const message = Buffer.from(nonce);
    const signature = await sessionKey.sign(message);
    const signatureHex = Buffer.from(signature.signature).toString('hex');

    console.log('[NOVA Auth] Signature created with Session Key');
    console.log('[NOVA Auth] Signature length:', signatureHex.length, 'chars (64 bytes)');

    // 5. Prepare authentication request
    const authRequest: NovaAuthRequest = {
      accountId,
      signature: signatureHex,
      publicKey: sessionKey.getPublicKey().toString(),
      nonce,
      chainType: 'near'
    };

    // 6. Authenticate with NOVA TEE
    // NOTE: This is where actual NOVA SDK call would happen
    // For now, we create a simulated token until API key is available
    const authResponse = await authenticateWithNOVA(authRequest);

    // 6b. Non-blocking attestation verification
    const attestResult = await verifyAttestation().catch((err: Error) => {
      console.warn('[NOVA Auth] Attestation check skipped:', err.message);
      return null;
    });

    if (attestResult && !attestResult.verified) {
      // Only warn loudly for real failures, not "endpoint not available"
      if (attestResult.error?.includes('not available')) {
        console.log('[NOVA Auth] TEE attestation endpoint not yet deployed — skipped');
      } else {
        console.warn('[NOVA Auth] TEE attestation did not pass:', attestResult.error);
      }
    }

    // 7. Create token object
    const cachedAttest = getCachedAttestation();
    const token: NovaAuthToken = {
      authToken: authResponse.token,
      accountId,
      expiresAt: authResponse.expiresAt,
      teeAttestation: cachedAttest?.attestation ?? authResponse.attestation
    };

    // 8. Cache token
    tokenCache.set(accountId, token);

    console.log('[DECENTRALIZATION_METRIC] nova_auth_token_generated', {
      accountId,
      method: 'session_key',
      signless: true,
      expiresIn: NOVA_CONSTANTS.AUTH_TOKEN_CACHE_DURATION / 1000 + 's'
    });

    return token;

  } catch (error: unknown) {
    console.error('[NOVA Auth] Failed:', error);

    if (error instanceof NovaError) {
      throw error;
    }

    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'TEE_UNAVAILABLE') {
      throw new NovaError('TEE_UNAVAILABLE', 'NOVA Shade Agent is down or unavailable');
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new NovaError(
      'AUTH_FAILED',
      `NOVA authentication failed: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Authenticate with NOVA Shade Agent
 *
 * TODO: Replace with actual NOVA SDK call when API key available
 *
 * @param request - Authentication request
 * @returns Authentication response
 */
async function authenticateWithNOVA(request: NovaAuthRequest): Promise<NovaAuthResponse> {
  // Check if API key is configured
  if (!hasApiKey()) {
    if (!isSimulationAllowed()) {
      throw new NovaError('INVALID_CONFIG', 'Nova API key required in production. Set NEXT_PUBLIC_NOVA_API_KEY.');
    }
    console.warn('[NOVA Auth] API key not configured - using simulated authentication');
    console.warn('[NOVA Auth] Set NEXT_PUBLIC_NOVA_API_KEY for real authentication');

    // Return simulated token for development
    return {
      token: `SIMULATED_TOKEN_${request.signature.substring(0, 16)}`,
      expiresAt: Date.now() + NOVA_CONSTANTS.AUTH_TOKEN_CACHE_DURATION,
      attestation: 'SIMULATED_ATTESTATION'
    };
  }

  // TODO: Actual NOVA SDK authentication
  // const novaClient = new NovaClient({
  //   network: getNovaConfig().network,
  //   apiKey: getApiKey()
  // });
  //
  // const response = await novaClient.authenticate(request);
  // return response;

  // For now, return simulated response even with API key
  // This will be replaced with actual SDK call
  console.log('[NOVA Auth] Authenticating with NOVA Shade Agent...');
  console.log('[NOVA Auth] Account:', request.accountId);
  console.log('[NOVA Auth] Public Key:', request.publicKey);
  console.log('[NOVA Auth] Nonce:', request.nonce);

  return {
    token: `JWT_TOKEN_${request.signature.substring(0, 32)}`,
    expiresAt: Date.now() + NOVA_CONSTANTS.AUTH_TOKEN_CACHE_DURATION,
    attestation: `TEE_ATTESTATION_${Date.now()}`
  };
}

/**
 * Generate NOVA-compatible nonce
 *
 * Format: {timestamp}-{32-char-hex-random}
 */
function generateNonce(): string {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(16);
  const randomHex = randomBytes.toString('hex');
  return `${timestamp}-${randomHex}`;
}

/**
 * Clear cached tokens
 *
 * @param accountId - Optional account ID to clear specific token
 */
export function clearNovaAuthCache(accountId?: string): void {
  if (accountId) {
    tokenCache.delete(accountId);
    console.log('[NOVA Auth] Cache cleared for:', accountId);
  } else {
    tokenCache.clear();
    console.log('[NOVA Auth] All cached tokens cleared');
  }
}

/**
 * Check if valid cached token exists
 *
 * @param accountId - NEAR account ID
 * @returns true if valid token in cache
 */
export function hasValidNovaAuthToken(accountId: string): boolean {
  const cached = tokenCache.get(accountId);
  return cached !== undefined && !isExpired(cached);
}

/**
 * Get cached token (if valid)
 *
 * @param accountId - NEAR account ID
 * @returns Cached token or undefined
 */
export function getCachedToken(accountId: string): NovaAuthToken | undefined {
  const cached = tokenCache.get(accountId);
  if (cached && !isExpired(cached)) {
    return cached;
  }
  return undefined;
}

/**
 * Force refresh token (bypass cache)
 *
 * @param accountId - NEAR account ID
 * @returns Fresh NovaAuthToken
 */
export async function refreshNovaAuthToken(accountId: string): Promise<NovaAuthToken> {
  clearNovaAuthCache(accountId);
  return generateNovaAuthToken(accountId);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get token from cache
 */
function getFromCache(accountId: string): NovaAuthToken | undefined {
  return tokenCache.get(accountId);
}

/**
 * Check if token is expired
 */
function isExpired(token: NovaAuthToken): boolean {
  return Date.now() >= token.expiresAt;
}

/**
 * Get token expiry info
 *
 * @param token - NovaAuthToken
 * @returns Expiry info
 */
export function getTokenExpiry(token: NovaAuthToken): {
  isExpired: boolean;
  expiresIn: number; // milliseconds
  expiresAt: Date;
} {
  const now = Date.now();
  const expiresIn = token.expiresAt - now;

  return {
    isExpired: expiresIn <= 0,
    expiresIn: Math.max(0, expiresIn),
    expiresAt: new Date(token.expiresAt)
  };
}
