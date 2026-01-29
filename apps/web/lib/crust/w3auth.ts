/**
 * Crust W3Auth Token Generation
 *
 * Generates W3Auth authentication tokens using NEAR Session Keys.
 * This enables 100% client-side, signless uploads to Crust IPFS.
 *
 * W3Auth Format: Bearer base64("near-{address}:{hexSignature}")
 *
 * IMPORTANT: Crust expects:
 * - Address: Public key WITHOUT "ed25519:" prefix
 * - Signature: Hex format (NOT base64)
 * - Message: The address itself (UTF-8 encoded)
 *
 * @see https://wiki.crust.network/docs/en/buildIPFSW3AuthPin
 * @see https://github.com/RoyTimes/crust-workshop/blob/master/src/near.ts
 */

import { BrowserKeyStore } from '../keystore-v7';
import type { W3AuthToken } from './types';
import { CrustError } from './types';

// Cache for W3Auth tokens (valid for 30 minutes)
// W3Auth tokens are long-lived, so we cache them longer to reduce signing overhead
const TOKEN_CACHE_DURATION = 30 * 60 * 1000;
const tokenCache = new Map<string, { token: W3AuthToken; expires: number }>();

/**
 * Convert Uint8Array to hex string
 */
function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Generate Crust W3Auth token using NEAR Session Key
 *
 * This function creates a W3Auth authentication token by signing
 * the address (public key without prefix) with the stored session key.
 * This is completely client-side and incurs no gas costs.
 *
 * @param accountId - NEAR account ID
 * @returns W3Auth token with authorization header
 * @throws CrustError if no session key is found
 */
export async function generateW3AuthToken(
    accountId: string
): Promise<W3AuthToken> {
    // Check cache first
    const cacheKey = accountId;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
        console.log('[W3Auth] Using cached token for:', accountId);
        return cached.token;
    }

    const keyStore = new BrowserKeyStore();
    const networkId = process.env.NEXT_PUBLIC_NEAR_NETWORK || 'testnet';

    // Get session key from local storage
    const keyPair = await keyStore.getKey(networkId, accountId);

    if (!keyPair) {
        throw new CrustError(
            'NO_SESSION_KEY',
            `No session key found for ${accountId}. Please setup your account first.`
        );
    }

    // Get public key in string format (ed25519:...)
    const publicKeyFull = keyPair.getPublicKey().toString();

    // Extract address: Remove "ed25519:" prefix
    // Crust expects just the base58 public key without curve prefix
    const address = publicKeyFull.startsWith('ed25519:')
        ? publicKeyFull.substring(8)
        : publicKeyFull;

    // Sign the ADDRESS string (not the raw bytes!)
    // Crust expects: sign(Buffer.from(address))
    const messageToSign = Buffer.from(address);
    const signResult = keyPair.sign(messageToSign);

    // Convert signature to HEX (not base64!)
    // Crust expects hex-encoded signature
    const signatureHex = toHex(signResult.signature);

    // Construct W3Auth authorization string
    // Format: near-{address}:{hexSignature}
    const authString = `near-${address}:${signatureHex}`;

    // Create Bearer auth header (not Basic!)
    const authHeader = `Bearer ${Buffer.from(authString).toString('base64')}`;

    const token: W3AuthToken = {
        authHeader,
        publicKey: publicKeyFull,
        accountId,
        generatedAt: Date.now()
    };

    // Cache the token
    tokenCache.set(cacheKey, {
        token,
        expires: Date.now() + TOKEN_CACHE_DURATION
    });

    console.log('[W3Auth] Generated new token for:', accountId);
    console.log('[W3Auth] Address (without prefix):', address);
    console.log('[DECENTRALIZATION_METRIC] w3auth_token_generated', {
        accountId,
        method: 'session_key'
    });

    return token;
}

/**
 * Clear cached W3Auth token for an account
 *
 * @param accountId - NEAR account ID to clear cache for
 */
export function clearW3AuthCache(accountId?: string): void {
    if (accountId) {
        tokenCache.delete(accountId);
        console.log('[W3Auth] Cache cleared for:', accountId);
    } else {
        tokenCache.clear();
        console.log('[W3Auth] All cache cleared');
    }
}

/**
 * Check if a valid W3Auth token exists in cache
 *
 * @param accountId - NEAR account ID to check
 * @returns true if valid cached token exists
 */
export function hasValidW3AuthToken(accountId: string): boolean {
    const cached = tokenCache.get(accountId);
    return cached !== undefined && cached.expires > Date.now();
}
