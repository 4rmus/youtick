/**
 * Client-side AES-256-GCM Encryption Module
 *
 * Replicates Nova SDK's encryption format using Web Crypto API.
 * Format: IV (12 bytes) + ciphertext + authTag (16 bytes)
 *
 * Critical: Returns raw Uint8Array (NOT base64) to avoid the 33%
 * inflation that caused 413 errors with Nova's upload endpoint.
 */

const IV_LENGTH = 12;
const KEY_LENGTH = 32; // 256 bits

/**
 * Generate a random AES-256-GCM encryption key
 *
 * @returns Base64-encoded 32-byte key
 */
export async function generateEncryptionKey(): Promise<string> {
  const keyBytes = crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
  return uint8ToBase64(keyBytes);
}

/**
 * Encrypt data with AES-256-GCM
 *
 * Output format: IV(12) + ciphertext + authTag(16)
 * Same format as Nova SDK for compatibility.
 *
 * @param data - Plaintext data to encrypt
 * @param keyB64 - Base64-encoded 32-byte AES key
 * @returns Encrypted data as Uint8Array (IV + ciphertext + authTag)
 */
export async function encryptFile(
  data: Uint8Array,
  keyB64: string,
): Promise<Uint8Array> {
  const keyBytes = base64ToUint8(keyB64);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Web Crypto API appends the 16-byte authTag to the ciphertext
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data.buffer as ArrayBuffer,
  );

  // Combine: IV + (ciphertext + authTag)
  const encryptedBytes = new Uint8Array(encrypted);
  const result = new Uint8Array(IV_LENGTH + encryptedBytes.length);
  result.set(iv, 0);
  result.set(encryptedBytes, IV_LENGTH);

  return result;
}

/**
 * Decrypt data with AES-256-GCM
 *
 * Input format: IV(12) + ciphertext + authTag(16)
 *
 * @param encrypted - Encrypted data (IV + ciphertext + authTag)
 * @param keyB64 - Base64-encoded 32-byte AES key
 * @returns Decrypted plaintext data
 */
export async function decryptFile(
  encrypted: Uint8Array,
  keyB64: string,
): Promise<Uint8Array> {
  if (encrypted.length < IV_LENGTH + 16) {
    throw new Error('Encrypted data too short (missing IV or authTag)');
  }

  const keyBytes = base64ToUint8(keyB64);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const iv = encrypted.slice(0, IV_LENGTH);
  const ciphertextWithTag = encrypted.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertextWithTag.buffer as ArrayBuffer,
  );

  return new Uint8Array(decrypted);
}

// ============================================================================
// Base64 Helpers
// ============================================================================

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  // Browser fallback
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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
