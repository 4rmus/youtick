/**
 * Shared Base58 utilities for Cloudflare Workers
 * 
 * Single source of truth for base58 decoding used across all workers.
 */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Decode a base58-encoded string to a Uint8Array.
 * Handles NEAR's `ed25519:` prefix automatically.
 */
export function base58Decode(value: string): Uint8Array {
  const clean = value.replace(/^ed25519:/, '');

  const bytes: number[] = [0];
  for (const char of clean) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx < 0) {
      throw new Error(`Invalid base58 character: ${char}`);
    }

    let carry = idx;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Handle leading zeros
  for (const char of clean) {
    if (char !== '1') break;
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}
