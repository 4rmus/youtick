/**
 * NOVA TEE Attestation Verification Module
 *
 * Level 1 attestation verification: structure, freshness, enclave hash.
 * Follows the costs.ts caching pattern (cache interface, TTL, hasApiKey guard).
 *
 * In simulation mode (no API key, non-production) all checks return { verified: true }.
 * Attestation failures are non-blocking by default — callers decide whether to throw.
 */

import {
  TEEAttestation,
  AttestationVerificationResult,
  AttestationVerifyOptions,
} from './types';
import {
  NOVA_CONSTANTS,
  hasApiKey,
  getExpectedEnclaveHash,
} from './config';

// ============================================================================
// Cache
// ============================================================================

interface AttestationCache {
  attestation: TEEAttestation;
  result: AttestationVerificationResult;
  timestamp: number;
}

let attestationCache: AttestationCache | null = null;

/**
 * Track whether the attestation endpoint is known to be unavailable.
 * After a 404, we skip fetch calls for ATTESTATION_CACHE_DURATION to
 * avoid browser console noise (red 404 log from fetch).
 */
let endpointUnavailableUntil = 0;

// ============================================================================
// Fetch
// ============================================================================

/**
 * Fetch attestation data from the Nova proxy endpoint.
 *
 * In simulation mode returns synthetic attestation data.
 *
 * @returns TEEAttestation object
 */
export async function fetchAttestation(): Promise<TEEAttestation> {
  if (!hasApiKey()) {
    throw new Error('Nova API key required for attestation fetch. Set NOVA_API_KEY.');
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    NOVA_CONSTANTS.ATTESTATION_FETCH_TIMEOUT,
  );

  try {
    const response = await fetch('/api/nova-proxy/attestation', {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`Attestation fetch failed: ${response.status} ${response.statusText}`);
    }

    const data: TEEAttestation = await response.json();
    return data;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

// ============================================================================
// Verification (pure, synchronous)
// ============================================================================

/**
 * Verify attestation data — **pure function, no side-effects**.
 *
 * Checks:
 * 1. **Structure**: All required fields present and correct types
 * 2. **Freshness**: `timestamp` within maxAge, `valid_until` not expired
 * 3. **Enclave hash**: Matches expected hash (if configured)
 *
 * @param attestation - TEEAttestation data to verify
 * @param options - Verification options (maxAge, expectedEnclaveHash)
 * @returns AttestationVerificationResult
 */
export function verifyAttestationData(
  attestation: TEEAttestation,
  options?: AttestationVerifyOptions,
): AttestationVerificationResult {
  const maxAge = options?.maxAge ?? NOVA_CONSTANTS.ATTESTATION_MAX_AGE;
  const expectedHash = options?.expectedEnclaveHash ?? getExpectedEnclaveHash();
  const now = Date.now();

  // --- 1. Structure check ---
  if (
    typeof attestation.platform !== 'string' ||
    typeof attestation.enclave_hash !== 'string' ||
    typeof attestation.quote !== 'string' ||
    typeof attestation.report !== 'string' ||
    typeof attestation.timestamp !== 'number' ||
    typeof attestation.valid_until !== 'number'
  ) {
    return {
      verified: false,
      error: 'Invalid attestation structure: missing or wrong-typed fields',
      failedCheck: 'structure',
    };
  }

  if (
    !attestation.platform.length ||
    !attestation.enclave_hash.length ||
    !attestation.quote.length ||
    !attestation.report.length
  ) {
    return {
      verified: false,
      error: 'Invalid attestation structure: empty required fields',
      failedCheck: 'structure',
    };
  }

  // --- 2. Freshness check ---
  const age = now - attestation.timestamp;
  if (age > maxAge) {
    return {
      verified: false,
      platform: attestation.platform,
      enclaveHash: attestation.enclave_hash,
      attestedAt: attestation.timestamp,
      validUntil: attestation.valid_until,
      error: `Attestation too old: ${Math.round(age / 1000)}s (max ${Math.round(maxAge / 1000)}s)`,
      failedCheck: 'freshness',
    };
  }

  if (attestation.valid_until < now) {
    return {
      verified: false,
      platform: attestation.platform,
      enclaveHash: attestation.enclave_hash,
      attestedAt: attestation.timestamp,
      validUntil: attestation.valid_until,
      error: `Attestation expired at ${new Date(attestation.valid_until).toISOString()}`,
      failedCheck: 'freshness',
    };
  }

  // --- 3. Enclave hash check (only if expected hash is configured) ---
  if (expectedHash && attestation.enclave_hash !== expectedHash) {
    return {
      verified: false,
      platform: attestation.platform,
      enclaveHash: attestation.enclave_hash,
      attestedAt: attestation.timestamp,
      validUntil: attestation.valid_until,
      error: `Enclave hash mismatch: got "${attestation.enclave_hash}", expected "${expectedHash}"`,
      failedCheck: 'enclave_hash',
    };
  }

  // --- All checks passed ---
  return {
    verified: true,
    platform: attestation.platform,
    enclaveHash: attestation.enclave_hash,
    attestedAt: attestation.timestamp,
    validUntil: attestation.valid_until,
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Verify TEE attestation (fetch + verify + cache).
 *
 * Uses a 10-minute cache. In simulation mode returns `{ verified: true, platform: 'simulation' }`.
 *
 * @param options - Verification options
 * @returns AttestationVerificationResult
 */
export async function verifyAttestation(
  options?: AttestationVerifyOptions,
): Promise<AttestationVerificationResult> {
  if (!hasApiKey()) {
    return {
      verified: false,
      error: 'Nova API key not configured. Set NOVA_API_KEY.',
    };
  }

  // Return cached result if fresh
  if (
    !options?.forceFresh &&
    attestationCache &&
    Date.now() - attestationCache.timestamp < NOVA_CONSTANTS.ATTESTATION_CACHE_DURATION
  ) {
    return attestationCache.result;
  }

  // If endpoint was recently 404, skip fetch entirely (avoids browser red 404 log)
  if (!options?.forceFresh && Date.now() < endpointUnavailableUntil) {
    return {
      verified: false,
      error: 'Attestation endpoint not available yet',
    };
  }

  try {
    const attestation = await fetchAttestation();
    const result = verifyAttestationData(attestation, options);

    // Reset unavailable flag on success
    endpointUnavailableUntil = 0;

    // Cache regardless of pass/fail (prevents spamming upstream on repeated failures)
    attestationCache = {
      attestation,
      result,
      timestamp: Date.now(),
    };

    if (!result.verified) {
      console.warn('[NOVA Attestation] Verification FAILED:', result.error);
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const is404 = errorMessage.includes('404');

    if (is404) {
      // Mark endpoint as unavailable — suppress future fetch attempts
      endpointUnavailableUntil = Date.now() + NOVA_CONSTANTS.ATTESTATION_CACHE_DURATION;
      console.warn('[NOVA Attestation] Attestation endpoint not available (404) — will retry in 10 min');
    } else {
      console.warn('[NOVA Attestation] Fetch/verify error:', errorMessage);
    }

    const result: AttestationVerificationResult = {
      verified: false,
      error: is404
        ? 'Attestation endpoint not available yet'
        : `Attestation unavailable: ${errorMessage}`,
    };

    return result;
  }
}

/**
 * Get the currently cached attestation data (if any).
 *
 * @returns Cached attestation and result, or null
 */
export function getCachedAttestation(): AttestationCache | null {
  if (
    attestationCache &&
    Date.now() - attestationCache.timestamp < NOVA_CONSTANTS.ATTESTATION_CACHE_DURATION
  ) {
    return attestationCache;
  }
  return null;
}

/**
 * Invalidate the attestation cache so next call fetches fresh data.
 */
export function invalidateAttestationCache(): void {
  attestationCache = null;
  endpointUnavailableUntil = 0;
}

/**
 * Check if attestation is stale (older than maxAge).
 *
 * @param attestation - TEEAttestation to check
 * @param maxAge - Max age in milliseconds (default: ATTESTATION_MAX_AGE)
 * @returns true if stale
 */
export function isAttestationStale(
  attestation: TEEAttestation,
  maxAge?: number,
): boolean {
  const limit = maxAge ?? NOVA_CONSTANTS.ATTESTATION_MAX_AGE;
  return Date.now() - attestation.timestamp > limit;
}
