/**
 * Youtick KMS Client
 *
 * Frontend module for communicating with the Youtick KMS Cloudflare Worker.
 * Uses a direct, fast Edge API for key storage/retrieval.
 *
 * Features:
 *   - Ed25519 signature generation for authenticated requests
 *   - Store/retrieve AES encryption keys via KMS Worker
 *   - Session key support for signless (popup-free) operations
 */

// ============================================================================
// Configuration
// ============================================================================

/** KMS Worker URL — configure via environment variable */
const KMS_BASE_URL =
    process.env.NEXT_PUBLIC_KMS_URL ||
    (typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:8787'
        : 'https://youtick-kms.araafatsum.workers.dev');

// ============================================================================
// Types
// ============================================================================

export interface KMSStoreResult {
    videoId: string;
    stored: boolean;
}

export interface KMSRetrieveResult {
    aesKeyB64: string;
}

export class KMSError extends Error {
    constructor(
        public code: string,
        message: string,
        public cause?: Error,
    ) {
        super(message);
        this.name = 'KMSError';
    }
}

// ============================================================================
// Signing Helpers
// ============================================================================

/**
 * Sign a payload with an Ed25519 key pair.
 * Uses the Web Crypto API (available in modern browsers).
 *
 * @param payload - String payload to sign
 * @param privateKey - CryptoKey (Ed25519 private key)
 * @returns Hex-encoded signature
 */
export async function signPayload(
    payload: string,
    privateKey: CryptoKey,
): Promise<string> {
    const payloadBytes = new TextEncoder().encode(payload);
    const signature = await crypto.subtle.sign('Ed25519', privateKey, payloadBytes);
    return bytesToHex(new Uint8Array(signature));
}

/**
 * Generate a new Ed25519 key pair for session signing.
 * This key pair is used for signless (popup-free) operations.
 */
export async function generateSessionKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
}

/**
 * Export the public key as base58 string (NEAR-compatible format).
 */
export async function exportPublicKeyBase58(publicKey: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey('raw', publicKey);
    return 'ed25519:' + base58Encode(new Uint8Array(raw));
}

// ============================================================================
// KMS API Client
// ============================================================================

/**
 * Store an AES encryption key in the KMS.
 * Only the content owner (NFT holder) can store keys.
 *
 * @param videoId - The video/token ID
 * @param aesKeyB64 - Base64-encoded AES-256 key
 * @param accountId - NEAR account ID of the content owner
 * @param privateKey - Ed25519 private key for signing
 * @param publicKeyB58 - Base58-encoded public key
 */
export async function storeEncryptionKey(
    videoId: string,
    aesKeyB64: string,
    accountId: string,
    privateKey: CryptoKey,
    publicKeyB58: string,
): Promise<KMSStoreResult> {
    const timestamp = Date.now();

    const payload = JSON.stringify({
        action: 'store',
        videoId,
        accountId,
        timestamp,
    });

    const signature = await signPayload(payload, privateKey);

    let response;
    try {
        response = await fetch(`${KMS_BASE_URL}/store`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'store',
                videoId,
                aesKeyB64,
                accountId,
                timestamp,
                signature,
                publicKey: publicKeyB58,
            }),
        });
    } catch (fetchError) {
        throw new KMSError(
            'NETWORK_ERROR',
            `KMS Connection failed (${KMS_BASE_URL}). Ensure worker is running.`,
            fetchError as Error
        );
    }

    const result = await response.json() as { ok: boolean; error?: string; data?: KMSStoreResult };

    if (!result.ok) {
        throw new KMSError(
            response.status === 403 ? 'ACCESS_DENIED' : 'STORE_FAILED',
            result.error || 'Failed to store key',
        );
    }

    return result.data as KMSStoreResult;
}

/**
 * Retrieve an AES encryption key from the KMS.
 * Only users with a valid ticket can retrieve keys.
 *
 * @param videoId - The video/token ID
 * @param accountId - NEAR account ID of the viewer
 * @param privateKey - Ed25519 private key for signing
 * @param publicKeyB58 - Base58-encoded public key
 */
export async function retrieveEncryptionKey(
    videoId: string,
    accountId: string,
    privateKey: CryptoKey,
    publicKeyB58: string,
): Promise<string> {
    const timestamp = Date.now();

    const payload = JSON.stringify({
        action: 'retrieve',
        videoId,
        accountId,
        timestamp,
    });

    const signature = await signPayload(payload, privateKey);

    let response;
    try {
        response = await fetch(`${KMS_BASE_URL}/retrieve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'retrieve',
                videoId,
                accountId,
                timestamp,
                signature,
                publicKey: publicKeyB58,
            }),
        });
    } catch (fetchError) {
        throw new KMSError(
            'NETWORK_ERROR',
            `KMS Connection failed (${KMS_BASE_URL}). Ensure worker is running.`,
            fetchError as Error
        );
    }

    const result = await response.json() as { ok: boolean; error?: string; data?: KMSRetrieveResult };

    if (!result.ok) {
        if (response.status === 403) {
            throw new KMSError('ACCESS_DENIED', result.error || 'No valid ticket');
        }
        if (response.status === 404) {
            throw new KMSError('NOT_FOUND', result.error || 'Key not found');
        }
        throw new KMSError('RETRIEVE_FAILED', result.error || 'Failed to retrieve key');
    }

    return (result.data as KMSRetrieveResult).aesKeyB64;
}

// ============================================================================
// Base58 Encoding (NEAR-compatible)
// ============================================================================

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes: Uint8Array): string {
    const digits = [0];
    for (const byte of bytes) {
        let carry = byte;
        for (let j = 0; j < digits.length; j++) {
            carry += digits[j] << 8;
            digits[j] = carry % 58;
            carry = (carry / 58) | 0;
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = (carry / 58) | 0;
        }
    }

    let str = '';
    for (const byte of bytes) {
        if (byte !== 0) break;
        str += '1';
    }
    for (let i = digits.length - 1; i >= 0; i--) {
        str += BASE58_ALPHABET[digits[i]];
    }
    return str;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
