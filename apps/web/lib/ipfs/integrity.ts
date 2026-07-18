/**
 * IPFS content-address integrity verification.
 *
 * Legacy media may be encrypted with unauthenticated AES-CTR: a malicious or
 * compromised gateway could return tampered ciphertext that decrypts to
 * corrupted playback without detection. For CIDv1 raw-codec blocks
 * ("bafkrei..."), the CID *is* the sha2-256 digest of the raw bytes, so we can
 * re-verify any gateway response against the content address before using it.
 *
 * Verification only applies to bare single-block raw-sha256 CIDs. CIDv0,
 * dag-pb/UnixFS roots and directory sub-paths are not a flat hash of the
 * request CID, so those refs pass through unverified instead of being blocked.
 */

const RAW_CODEC = 0x55;
const SHA2_256_CODE = 0x12;
const SHA2_256_LENGTH = 32;
const BASE32_LOWER_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function decodeBase32Lower(input: string): Uint8Array | null {
    let bits = 0;
    let value = 0;
    const output: number[] = [];
    for (const char of input) {
        const index = BASE32_LOWER_ALPHABET.indexOf(char);
        if (index === -1) {
            return null;
        }
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            output.push((value >> bits) & 0xff);
        }
    }
    return Uint8Array.from(output);
}

function readUvarint(bytes: Uint8Array, offset: number): { value: number; next: number } | null {
    let result = 0;
    let shift = 0;
    let pos = offset;
    while (pos < bytes.length) {
        const byte = bytes[pos];
        pos += 1;
        result |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) {
            return { value: result >>> 0, next: pos };
        }
        shift += 7;
        if (shift > 35) {
            return null;
        }
    }
    return null;
}

/**
 * Return the 32-byte sha2-256 digest embedded in a CIDv1 raw-codec CID,
 * or null when the CID is any other shape (CIDv0, dag-pb, other hashes).
 */
function parseRawSha256CidDigest(cid: string): Uint8Array | null {
    if (!cid.startsWith('b')) {
        return null;
    }
    const bytes = decodeBase32Lower(cid.slice(1));
    if (!bytes) {
        return null;
    }
    const version = readUvarint(bytes, 0);
    if (!version || version.value !== 1) {
        return null;
    }
    const codec = readUvarint(bytes, version.next);
    if (!codec || codec.value !== RAW_CODEC) {
        return null;
    }
    const hashCode = readUvarint(bytes, codec.next);
    if (!hashCode || hashCode.value !== SHA2_256_CODE) {
        return null;
    }
    const hashLength = readUvarint(bytes, hashCode.next);
    if (!hashLength || hashLength.value !== SHA2_256_LENGTH) {
        return null;
    }
    const digest = bytes.slice(hashLength.next, hashLength.next + SHA2_256_LENGTH);
    return digest.length === SHA2_256_LENGTH ? digest : null;
}

/**
 * Normalize an IPFS ref and return it only when it is a bare, content-address
 * verifiable raw-sha256 CID. Returns null for `ipfs://` directory sub-paths,
 * CIDv0 and non-raw codecs.
 */
export function rawSha256CidFromRef(ref: string): string | null {
    const normalized = ref.replace(/^ipfs:\/\//, '').replace(/^\/+/, '');
    if (!normalized || normalized.includes('/')) {
        return null;
    }
    return parseRawSha256CidDigest(normalized) ? normalized : null;
}

/**
 * Verify that bytes match the content address of a raw-sha256 CID ref.
 * Returns true for refs that are not verifiable (so callers never block
 * content that cannot be address-checked).
 */
export async function verifyRawCidContent(
    ref: string,
    bytes: ArrayBuffer | Uint8Array,
): Promise<boolean> {
    const cid = rawSha256CidFromRef(ref);
    if (!cid) {
        return true;
    }
    const expected = parseRawSha256CidDigest(cid);
    if (!expected) {
        return true;
    }
    const actual = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
    if (actual.length !== expected.length) {
        return false;
    }
    let diff = 0;
    for (let i = 0; i < actual.length; i += 1) {
        diff |= actual[i] ^ expected[i];
    }
    return diff === 0;
}
