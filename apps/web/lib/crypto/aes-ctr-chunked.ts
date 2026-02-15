/**
 * Chunk-based AES-256-CTR Encryption Module
 *
 * Streaming-friendly encryption for large video files. Unlike AES-GCM which
 * requires the entire file in memory, CTR mode allows chunked processing
 * and random-access decryption.
 *
 * Format:
 *   [MAGIC: 4 bytes "YTCK"] [VERSION: 1 byte] [CHUNK_SIZE: 4 bytes uint32]
 *   [IV: 16 bytes] [HMAC: 32 bytes] [encrypted chunks...]
 *
 * Security:
 *   - AES-256-CTR for confidentiality (counter per chunk for uniqueness)
 *   - HMAC-SHA256 over all encrypted data for integrity (CTR has no built-in auth)
 *   - Random 16-byte IV per encryption operation
 */

const IV_LENGTH = 16; // AES block size for CTR
const KEY_LENGTH = 32; // 256 bits
const HMAC_LENGTH = 32; // SHA-256 output

/** Magic bytes identifying the chunked format: "YTCK" */
export const CHUNKED_MAGIC = new Uint8Array([0x59, 0x54, 0x43, 0x4b]); // "YTCK"

/** Current format version */
export const CHUNKED_VERSION = 1;

/** Default chunk size: 1 MB */
export const DEFAULT_CHUNK_SIZE = 1024 * 1024;

/** Total header size: magic(4) + version(1) + chunkSize(4) + IV(16) + HMAC(32) = 57 */
export const HEADER_SIZE = 4 + 1 + 4 + IV_LENGTH + HMAC_LENGTH; // 57 bytes

/**
 * Detect whether encrypted data uses the chunked CTR format.
 *
 * Checks for the "YTCK" magic bytes at the start of the buffer.
 *
 * @param data - Encrypted data to inspect
 * @returns true if the data starts with the chunked magic header
 */
export function isChunkedFormat(data: Uint8Array): boolean {
  if (data.length < HEADER_SIZE) return false;
  return (
    data[0] === CHUNKED_MAGIC[0] &&
    data[1] === CHUNKED_MAGIC[1] &&
    data[2] === CHUNKED_MAGIC[2] &&
    data[3] === CHUNKED_MAGIC[3]
  );
}

/**
 * Encrypt data with AES-256-CTR in chunks, with HMAC-SHA256 integrity.
 *
 * Processes the input in configurable chunks (default 1 MB) to avoid loading
 * the entire ciphertext into a single Web Crypto operation. Each chunk uses
 * a unique counter derived from the base IV + chunk index.
 *
 * @param data - Plaintext data to encrypt
 * @param keyB64 - Base64-encoded 32-byte AES key
 * @param chunkSize - Bytes per chunk (default 1 MB)
 * @returns Encrypted data with header: MAGIC + VERSION + CHUNK_SIZE + IV + HMAC + ciphertext
 */
export async function encryptFileChunked(
  data: Uint8Array,
  keyB64: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<Uint8Array> {
  const keyBytes = base64ToUint8(keyB64);
  if (keyBytes.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${keyBytes.length}`);
  }

  // Import the AES key for CTR encryption
  const aesKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-CTR' },
    false,
    ['encrypt'],
  );

  // Import the same key material for HMAC (derive a separate purpose via HMAC key import)
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // Generate a random 16-byte IV (base counter)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Calculate total number of chunks
  const totalChunks = Math.ceil(data.length / chunkSize) || 1;

  // Encrypt each chunk with a unique counter = baseIV + chunkIndex
  const encryptedChunks: Uint8Array[] = [];
  let totalEncryptedSize = 0;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, data.length);
    const chunk = data.subarray(start, end);

    // Derive per-chunk counter: base IV with chunk index added to the last 4 bytes
    const counter = buildChunkCounter(iv, i);

    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-CTR',
        counter: counter.buffer as ArrayBuffer,
        length: 64, // Counter bits (64 of 128 used for counting)
      },
      aesKey,
      chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer,
    );

    const encChunk = new Uint8Array(encrypted);
    encryptedChunks.push(encChunk);
    totalEncryptedSize += encChunk.length;
  }

  // Compute HMAC-SHA256 over all encrypted chunks
  const allEncrypted = concatenateChunks(encryptedChunks, totalEncryptedSize);
  const hmacSignature = await crypto.subtle.sign('HMAC', hmacKey, allEncrypted.buffer as ArrayBuffer);
  const hmacBytes = new Uint8Array(hmacSignature);

  // Build the output: header + encrypted data
  const output = new Uint8Array(HEADER_SIZE + totalEncryptedSize);
  let offset = 0;

  // Magic bytes
  output.set(CHUNKED_MAGIC, offset);
  offset += 4;

  // Version
  output[offset] = CHUNKED_VERSION;
  offset += 1;

  // Chunk size (uint32 big-endian)
  const chunkSizeView = new DataView(output.buffer, offset, 4);
  chunkSizeView.setUint32(0, chunkSize, false); // big-endian
  offset += 4;

  // IV
  output.set(iv, offset);
  offset += IV_LENGTH;

  // HMAC
  output.set(hmacBytes, offset);
  offset += HMAC_LENGTH;

  // Encrypted data
  output.set(allEncrypted, offset);

  return output;
}

/**
 * Decrypt AES-256-CTR chunked data, verifying HMAC-SHA256 integrity first.
 *
 * Reads the header to recover IV, chunk size, and HMAC, then verifies
 * integrity before decrypting each chunk independently.
 *
 * @param encrypted - Encrypted data with chunked header
 * @param keyB64 - Base64-encoded 32-byte AES key
 * @returns Decrypted plaintext data
 * @throws Error if HMAC verification fails or data is malformed
 */
export async function decryptFileChunked(
  encrypted: Uint8Array,
  keyB64: string,
): Promise<Uint8Array> {
  if (encrypted.length < HEADER_SIZE) {
    throw new Error(`Data too short for chunked format: ${encrypted.length} < ${HEADER_SIZE} bytes`);
  }

  // Parse header
  if (!isChunkedFormat(encrypted)) {
    throw new Error('Invalid chunked format: missing YTCK magic bytes');
  }

  let offset = 4; // skip magic

  const version = encrypted[offset];
  if (version !== CHUNKED_VERSION) {
    throw new Error(`Unsupported chunked format version: ${version}`);
  }
  offset += 1;

  // Chunk size (uint32 big-endian)
  const chunkSizeView = new DataView(
    encrypted.buffer,
    encrypted.byteOffset + offset,
    4,
  );
  const chunkSize = chunkSizeView.getUint32(0, false); // big-endian
  offset += 4;

  // IV
  const iv = encrypted.slice(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;

  // HMAC
  const storedHmac = encrypted.slice(offset, offset + HMAC_LENGTH);
  offset += HMAC_LENGTH;

  // Encrypted payload
  const ciphertext = encrypted.subarray(offset);

  const keyBytes = base64ToUint8(keyB64);
  if (keyBytes.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${keyBytes.length}`);
  }

  // Import HMAC key and verify integrity BEFORE decryption
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const hmacValid = await crypto.subtle.verify(
    'HMAC',
    hmacKey,
    storedHmac.buffer.slice(
      storedHmac.byteOffset,
      storedHmac.byteOffset + storedHmac.byteLength,
    ) as ArrayBuffer,
    ciphertext.buffer.slice(
      ciphertext.byteOffset,
      ciphertext.byteOffset + ciphertext.byteLength,
    ) as ArrayBuffer,
  );

  if (!hmacValid) {
    throw new Error('HMAC verification failed: data may be corrupted or tampered with');
  }

  // Import AES key for CTR decryption
  const aesKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-CTR' },
    false,
    ['decrypt'],
  );

  // Decrypt each chunk
  const totalChunks = Math.ceil(ciphertext.length / chunkSize) || 1;
  const decryptedChunks: Uint8Array[] = [];
  let totalDecryptedSize = 0;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, ciphertext.length);
    const chunk = ciphertext.subarray(start, end);

    const counter = buildChunkCounter(iv, i);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-CTR',
        counter: counter.buffer as ArrayBuffer,
        length: 64,
      },
      aesKey,
      chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer,
    );

    const decChunk = new Uint8Array(decrypted);
    decryptedChunks.push(decChunk);
    totalDecryptedSize += decChunk.length;
  }

  return concatenateChunks(decryptedChunks, totalDecryptedSize);
}

/**
 * Encrypt a Blob/File with AES-256-CTR in chunks via file.slice().
 *
 * Memory-efficient alternative to encryptFileChunked: reads 1 MB at a time
 * from the Blob instead of requiring the entire plaintext in memory.
 *
 * Peak RAM: ~fileSize + chunkSize (output buffer + one chunk read)
 * vs encryptFileChunked: ~2×fileSize (full plaintext + full output)
 *
 * Output format is identical to encryptFileChunked and fully compatible
 * with decryptFileChunked.
 *
 * @param file - Blob or File to encrypt
 * @param keyB64 - Base64-encoded 32-byte AES key
 * @param chunkSize - Bytes per chunk (default 1 MB)
 * @returns Encrypted data with header: MAGIC + VERSION + CHUNK_SIZE + IV + HMAC + ciphertext
 */
export async function encryptFileFromBlob(
  file: Blob,
  keyB64: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<Uint8Array> {
  const keyBytes = base64ToUint8(keyB64);
  if (keyBytes.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${keyBytes.length}`);
  }

  const aesKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-CTR' },
    false,
    ['encrypt'],
  );

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const totalChunks = Math.ceil(file.size / chunkSize) || 1;

  // CTR mode: ciphertext length === plaintext length (no padding)
  const totalEncryptedSize = file.size;

  // Pre-allocate single output buffer: header + encrypted data
  const output = new Uint8Array(HEADER_SIZE + totalEncryptedSize);
  let offset = 0;

  // Write header fields (HMAC placeholder filled after encryption)
  output.set(CHUNKED_MAGIC, offset);
  offset += 4;

  output[offset] = CHUNKED_VERSION;
  offset += 1;

  const chunkSizeView = new DataView(output.buffer, offset, 4);
  chunkSizeView.setUint32(0, chunkSize, false); // big-endian
  offset += 4;

  output.set(iv, offset);
  offset += IV_LENGTH;

  const hmacOffset = offset; // 25 — will write HMAC here after encryption
  // offset += HMAC_LENGTH; // skip past HMAC placeholder

  // Encrypt each chunk via file.slice() — only 1 chunk in memory at a time
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);

    // Read only this chunk from the Blob (full file never loaded into memory)
    const chunkBlob = file.slice(start, end);
    const chunkBuffer = await chunkBlob.arrayBuffer();

    const counter = buildChunkCounter(iv, i);

    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-CTR',
        counter: counter.buffer as ArrayBuffer,
        length: 64,
      },
      aesKey,
      chunkBuffer,
    );

    // Write encrypted chunk directly to output buffer (no intermediate array)
    output.set(new Uint8Array(encrypted), HEADER_SIZE + start);
  }

  // Compute HMAC-SHA256 over the encrypted portion (subarray = view, no copy)
  const encryptedPortion = output.subarray(HEADER_SIZE);
  const hmacSignature = await crypto.subtle.sign('HMAC', hmacKey, encryptedPortion);
  output.set(new Uint8Array(hmacSignature), hmacOffset);

  return output;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Build a per-chunk counter block by adding the chunk index to the base IV.
 *
 * The chunk index is added to the last 4 bytes of the 16-byte IV, treated as
 * a big-endian uint32. This gives each chunk a unique starting counter while
 * keeping the upper 12 bytes as a nonce.
 *
 * With 64-bit counter length in Web Crypto, each chunk can encrypt up to
 * 2^64 blocks (far more than needed for a 1 MB chunk).
 */
function buildChunkCounter(baseIv: Uint8Array, chunkIndex: number): Uint8Array {
  const counter = new Uint8Array(IV_LENGTH);
  counter.set(baseIv);

  // Add chunkIndex to the last 4 bytes (big-endian)
  const view = new DataView(counter.buffer, counter.byteOffset + 12, 4);
  const base = view.getUint32(0, false);
  view.setUint32(0, (base + chunkIndex) >>> 0, false); // unsigned wrap

  return counter;
}

/**
 * Concatenate an array of Uint8Array chunks into a single Uint8Array.
 */
function concatenateChunks(chunks: Uint8Array[], totalSize: number): Uint8Array {
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// ============================================================================
// Base64 Helpers (same pattern as aes-gcm.ts)
// ============================================================================

function base64ToUint8(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  // Browser fallback
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
