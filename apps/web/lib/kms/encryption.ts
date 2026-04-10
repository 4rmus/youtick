/**
 * Youtick AES-CTR Encryption Module
 *
 * Handles video encryption and decryption using AES-CTR mode.
 * CTR mode enables random-access decryption (seek support),
 * unlike AES-GCM which requires processing the entire file.
 *
 * Features:
 *   - AES-256-CTR encryption/decryption
 *   - Chunked processing (1MB chunks) for low memory usage
 *   - Random-access decryption for instant seek
 *   - Web Crypto API — zero dependencies
 */

import { base64Decode, base64Encode } from '../crypto/codec';

// ============================================================================
// Constants
// ============================================================================

/** Default chunk size: 1MB */
export const CHUNK_SIZE = 1 * 1024 * 1024;

/** AES key length in bits */
const AES_KEY_BITS = 256;

/** CTR counter length in bytes (standard: 16 bytes = 128 bits) */
const CTR_LENGTH = 64; // bits used for counter portion

// ============================================================================
// Types
// ============================================================================

export interface EncryptedChunk {
    /** Chunk index (0-based) */
    index: number;
    /** Encrypted data bytes */
    data: Uint8Array;
}

export interface VideoManifest {
    /** Total number of chunks */
    totalChunks: number;
    /** Original file size in bytes */
    originalSize: number;
    /** Chunk size used during encryption */
    chunkSize: number;
    /** Base64-encoded initial counter (IV) */
    counterB64: string;
    /** Content type of the original file */
    contentType: string;
}

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate a new AES-256-CTR key.
 * @returns Base64-encoded key string
 */
export async function generateAESKey(): Promise<string> {
    const key = await crypto.subtle.generateKey(
        { name: 'AES-CTR', length: AES_KEY_BITS },
        true, // extractable
        ['encrypt', 'decrypt'],
    );
    const rawKey = await crypto.subtle.exportKey('raw', key);
    return base64Encode(rawKey);
}

/**
 * Import a Base64-encoded AES key for use with Web Crypto.
 */
export async function importAESKey(keyB64: string): Promise<CryptoKey> {
    const keyBytes = base64Decode(keyB64);
    return await crypto.subtle.importKey(
        'raw',
        keyBytes as BufferSource,
        { name: 'AES-CTR', length: AES_KEY_BITS },
        false,
        ['encrypt', 'decrypt'],
    );
}

/**
 * Generate a random 16-byte counter (IV) for AES-CTR.
 */
export function generateCounter(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Encode a counter as base64 for manifest transport.
 */
export function encodeCounter(counter: Uint8Array): string {
    return base64Encode(counter.buffer.slice(counter.byteOffset, counter.byteOffset + counter.byteLength) as ArrayBuffer);
}

/**
 * Decode a base64 counter value from a manifest.
 */
export function decodeCounter(counterB64: string): Uint8Array {
    return base64Decode(counterB64);
}

/**
 * Encrypt an arbitrary buffer with AES-CTR using a fresh counter by default.
 */
export async function encryptBufferWithCounter(
    plaintext: Uint8Array,
    keyB64: string,
    counter: Uint8Array = generateCounter(),
): Promise<{ ciphertext: Uint8Array; counterB64: string }> {
    const key = await importAESKey(keyB64);
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-CTR', counter: counter as unknown as BufferSource, length: CTR_LENGTH },
        key,
        plaintext as unknown as BufferSource,
    );

    return {
        ciphertext: new Uint8Array(ciphertext),
        counterB64: encodeCounter(counter),
    };
}

/**
 * Decrypt an arbitrary buffer with AES-CTR using an explicit counter value.
 */
export async function decryptBufferWithCounter(
    encryptedData: Uint8Array,
    keyB64: string,
    counterB64: string,
): Promise<Uint8Array> {
    const key = await importAESKey(keyB64);
    const counter = decodeCounter(counterB64);
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-CTR', counter: counter as unknown as BufferSource, length: CTR_LENGTH },
        key,
        encryptedData as unknown as BufferSource,
    );

    return new Uint8Array(plaintext);
}

// ============================================================================
// Chunked Encryption (Upload Flow)
// ============================================================================

/**
 * Encrypt a file in chunks using AES-256-CTR.
 *
 * Yields encrypted chunks one-by-one to enable streaming upload
 * without loading the entire file into memory.
 *
 * @param file - File or Blob to encrypt
 * @param keyB64 - Base64-encoded AES-256 key
 * @param chunkSize - Size of each chunk in bytes (default: 1MB)
 * @returns AsyncGenerator yielding encrypted chunks + final manifest
 */
export async function* encryptFileChunked(
    file: File | Blob,
    keyB64: string,
    chunkSize: number = CHUNK_SIZE,
): AsyncGenerator<{ chunk: EncryptedChunk; manifest?: VideoManifest }> {
    const key = await importAESKey(keyB64);
    const baseCounter = generateCounter();
    const totalChunks = Math.ceil(file.size / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const slice = file.slice(start, end);
        const plaintext = new Uint8Array(await slice.arrayBuffer());

        // Calculate the counter for this chunk.
        // Each chunk offsets the counter by (chunkIndex * blocksPerChunk).
        // AES block = 16 bytes, so blocksPerChunk = chunkSize / 16.
        const chunkCounter = offsetCounter(baseCounter, i * Math.ceil(chunkSize / 16));

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-CTR', counter: chunkCounter as unknown as BufferSource, length: CTR_LENGTH },
            key,
            plaintext as unknown as BufferSource,
        );

        const isLast = i === totalChunks - 1;

        yield {
            chunk: { index: i, data: new Uint8Array(ciphertext) },
            manifest: isLast
                ? {
                    totalChunks,
                    originalSize: file.size,
                    chunkSize,
                    counterB64: encodeCounter(baseCounter),
                    contentType: file instanceof File ? file.type : 'video/mp4',
                }
                : undefined,
        };
    }
}

// ============================================================================
// Chunked Decryption (Playback Flow)
// ============================================================================

/**
 * Decrypt a single chunk using AES-256-CTR.
 *
 * This is the core of random-access decryption:
 * given a chunk index, we calculate the correct counter offset
 * and decrypt just that chunk — no need to process preceding chunks.
 *
 * @param encryptedData - The encrypted chunk bytes
 * @param keyB64 - Base64-encoded AES-256 key
 * @param manifest - Video manifest (contains base counter and chunk size)
 * @param chunkIndex - Which chunk to decrypt (0-based)
 * @returns Decrypted plaintext bytes
 */
export async function decryptChunk(
    encryptedData: Uint8Array,
    keyB64: string,
    manifest: VideoManifest,
    chunkIndex: number,
): Promise<Uint8Array> {
    const key = await importAESKey(keyB64);
    const baseCounter = decodeCounter(manifest.counterB64);

    // Calculate the correct counter for this chunk
    const blocksPerChunk = Math.ceil(manifest.chunkSize / 16);
    const chunkCounter = offsetCounter(baseCounter, chunkIndex * blocksPerChunk);

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-CTR', counter: chunkCounter as unknown as BufferSource, length: CTR_LENGTH },
        key,
        encryptedData as unknown as BufferSource,
    );

    return new Uint8Array(plaintext);
}

/**
 * Decrypt an entire encrypted blob (for small files or backward compat).
 *
 * @param encryptedData - Full encrypted file bytes
 * @param keyB64 - Base64-encoded AES-256 key
 * @param counterB64 - Base64-encoded initial counter
 * @returns Decrypted plaintext
 */
export async function decryptFull(
    encryptedData: Uint8Array,
    keyB64: string,
    counterB64: string,
): Promise<Uint8Array> {
    const key = await importAESKey(keyB64);
    const counter = decodeCounter(counterB64);

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-CTR', counter: counter as unknown as BufferSource, length: CTR_LENGTH },
        key,
        encryptedData as unknown as BufferSource,
    );

    return new Uint8Array(plaintext);
}

// ============================================================================
// Counter Arithmetic
// ============================================================================

/**
 * Offset a 16-byte AES-CTR counter by a given number of blocks.
 * Treats the counter as a 128-bit big-endian integer and adds the offset.
 */
function offsetCounter(baseCounter: Uint8Array, blockOffset: number): Uint8Array {
    const counter = new Uint8Array(baseCounter);

    // Add blockOffset to the counter (big-endian addition)
    let carry = blockOffset;
    for (let i = 15; i >= 0 && carry > 0; i--) {
        const sum = counter[i] + (carry & 0xff);
        counter[i] = sum & 0xff;
        carry = (carry >> 8) + (sum >> 8);
    }

    return counter;
}

