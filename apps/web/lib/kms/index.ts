/**
 * Youtick KMS Module
 *
 * Key management and video encryption module.
 * Uses Cloudflare Edge KMS + AES-256-CTR for zero-latency video streaming.
 */

// KMS Client (key storage/retrieval via Cloudflare Worker)
export {
    storeEncryptionKey,
    retrieveEncryptionKey,
    clearKmsAuthCache,
    KMSError,
    type KMSStoreResult,
    type KMSRetrieveResult,
} from './client';

// Authenticated AES-GCM upload and legacy AES-CTR compatibility helpers
export {
    generateAESKey,
    importAESKey,
    generateCounter,
    encodeCounter,
    decodeCounter,
    encryptFileChunked,
    encryptBufferWithCounter,
    decryptChunk,
    decryptBufferWithCounter,
    decryptFull,
    CHUNK_SIZE,
    type EncryptedChunk,
    type VideoManifest,
} from './encryption';
