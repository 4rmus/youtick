/**
 * NOVA Authentication Module
 *
 * Handles NOVA authentication via SDK-managed session tokens.
 * The Nova SDK manages its own auth lifecycle — no NEAR signature needed.
 */

import { NovaAuthToken, NovaError, NovaAuthResponse } from './types';
import { NOVA_CONSTANTS, hasApiKey, getNovaSdk } from './config';
import { verifyAttestation, getCachedAttestation } from './attestation';

/**
 * Token cache (in-memory)
 * Key: accountId
 * Value: NovaAuthToken
 */
const tokenCache = new Map<string, NovaAuthToken>();

/**
 * Generate NOVA authentication token via SDK-managed session
 *
 * The Nova SDK handles auth internally via API key + session tokens.
 * No NEAR signature is needed — the SDK manages its own lifecycle.
 *
 * @param accountId - NEAR account ID
 * @returns NovaAuthToken with expiry
 * @throws NovaError if auth fails or API key missing
 */
export async function generateNovaAuthToken(
  accountId: string
): Promise<NovaAuthToken> {
  // 1. Check cache first
  const cached = getFromCache(accountId);
  if (cached && !isExpired(cached)) {
    return cached;
  }

  try {
    // 2. Authenticate via SDK session
    const authResponse = await authenticateWithNOVA();

    // 3. Non-blocking attestation verification
    const attestResult = await verifyAttestation().catch((err: Error) => {
      console.warn('[NOVA Auth] Attestation check skipped:', err.message);
      return null;
    });

    if (attestResult && !attestResult.verified) {
      if (!attestResult.error?.includes('not available')) {
        console.warn('[NOVA Auth] TEE attestation did not pass:', attestResult.error);
      }
    }

    // 4. Create token object
    const cachedAttest = getCachedAttestation();
    const token: NovaAuthToken = {
      authToken: authResponse.token,
      accountId,
      expiresAt: authResponse.expiresAt,
      teeAttestation: cachedAttest?.attestation ?? authResponse.attestation
    };

    // 5. Cache token
    tokenCache.set(accountId, token);

    console.log('[DECENTRALIZATION_METRIC] nova_auth_token_generated', {
      accountId,
      method: 'sdk_session',
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
 * Authenticate via Nova SDK session token
 *
 * The SDK manages its own session token lifecycle via API key.
 * authStatus() validates the current session; refreshToken() renews it.
 *
 * @returns Authentication response
 */
async function authenticateWithNOVA(): Promise<NovaAuthResponse> {
  if (!hasApiKey()) {
    throw new NovaError(
      'INVALID_CONFIG',
      'Nova API key not configured. Set NOVA_API_KEY (server) and NEXT_PUBLIC_NOVA_API_KEY=enabled (client).'
    );
  }

  const sdk = await getNovaSdk();

  // SDK manages its own session token lifecycle.
  // authStatus() validates the current session and triggers a refresh if needed.
  const status = await sdk.authStatus();

  if (!status.authenticated) {
    await sdk.refreshToken();
    const retryStatus = await sdk.authStatus();
    if (!retryStatus.authenticated) {
      throw new NovaError('AUTH_FAILED', 'Nova SDK authentication failed after token refresh');
    }
  }

  return {
    token: `nova-session-${Date.now()}`,
    expiresAt: Date.now() + NOVA_CONSTANTS.AUTH_TOKEN_CACHE_DURATION,
    attestation: undefined,
  };
}

/**
 * Clear cached tokens
 *
 * @param accountId - Optional account ID to clear specific token
 */
export function clearNovaAuthCache(accountId?: string): void {
  if (accountId) {
    tokenCache.delete(accountId);
  } else {
    tokenCache.clear();
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
