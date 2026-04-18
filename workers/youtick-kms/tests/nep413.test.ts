import { describe, expect, it } from 'vitest';
import {
    bytesToBase64,
    concatBytes,
    encodeOptionStringBorsh,
    encodeStringBorsh,
    encodeU32LE,
    serializeNep413Hash,
    verifyNep413Signature,
} from '../src/index';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes: Uint8Array): string {
    if (bytes.length === 0) return '';
    let digits: number[] = [0];
    for (let i = 0; i < bytes.length; i++) {
        let carry = bytes[i];
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
    let leading = 0;
    while (leading < bytes.length && bytes[leading] === 0) leading++;
    return '1'.repeat(leading) + digits.reverse().map((d) => BASE58_ALPHABET[d]).join('');
}

describe('Borsh encoding primitives', () => {
    it('encodeU32LE writes little-endian 32-bit integer', () => {
        expect(Array.from(encodeU32LE(0))).toEqual([0, 0, 0, 0]);
        expect(Array.from(encodeU32LE(1))).toEqual([1, 0, 0, 0]);
        expect(Array.from(encodeU32LE(256))).toEqual([0, 1, 0, 0]);
        expect(Array.from(encodeU32LE(0xdeadbeef))).toEqual([0xef, 0xbe, 0xad, 0xde]);
    });

    it('encodeStringBorsh prefixes length and encodes utf-8', () => {
        const out = encodeStringBorsh('abc');
        expect(Array.from(out.slice(0, 4))).toEqual([3, 0, 0, 0]);
        expect(Array.from(out.slice(4))).toEqual([97, 98, 99]);
    });

    it('encodeStringBorsh handles empty string', () => {
        const out = encodeStringBorsh('');
        expect(Array.from(out)).toEqual([0, 0, 0, 0]);
    });

    it('encodeOptionStringBorsh emits 0 tag for undefined', () => {
        expect(Array.from(encodeOptionStringBorsh(undefined))).toEqual([0]);
    });

    it('encodeOptionStringBorsh emits 1 tag + string for defined value', () => {
        const out = encodeOptionStringBorsh('hi');
        expect(out[0]).toBe(1);
        expect(Array.from(out.slice(1, 5))).toEqual([2, 0, 0, 0]);
        expect(Array.from(out.slice(5))).toEqual([104, 105]);
    });

    it('concatBytes joins arrays in order', () => {
        const out = concatBytes(new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5]));
        expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
    });

    it('concatBytes handles empty input', () => {
        const out = concatBytes();
        expect(out.length).toBe(0);
    });
});

describe('serializeNep413Hash', () => {
    const nonce = new Uint8Array(32);
    for (let i = 0; i < 32; i++) nonce[i] = i;

    it('produces 32-byte SHA-256 digest', async () => {
        const hash = await serializeNep413Hash({
            message: 'test',
            nonce,
            recipient: 'youtick.near',
        });
        expect(hash).toBeInstanceOf(Uint8Array);
        expect(hash.length).toBe(32);
    });

    it('rejects nonce != 32 bytes', async () => {
        const badNonce = new Uint8Array(16);
        await expect(
            serializeNep413Hash({ message: 'x', nonce: badNonce, recipient: 'r' }),
        ).rejects.toThrow(/32 bytes/);
    });

    it('is deterministic for same input', async () => {
        const a = await serializeNep413Hash({ message: 'm', nonce, recipient: 'r' });
        const b = await serializeNep413Hash({ message: 'm', nonce, recipient: 'r' });
        expect(Array.from(a)).toEqual(Array.from(b));
    });

    it('differs for different messages', async () => {
        const a = await serializeNep413Hash({ message: 'm1', nonce, recipient: 'r' });
        const b = await serializeNep413Hash({ message: 'm2', nonce, recipient: 'r' });
        expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    it('differs when callbackUrl changes', async () => {
        const a = await serializeNep413Hash({ message: 'm', nonce, recipient: 'r' });
        const b = await serializeNep413Hash({
            message: 'm',
            nonce,
            recipient: 'r',
            callbackUrl: 'https://youtick.net',
        });
        expect(Array.from(a)).not.toEqual(Array.from(b));
    });
});

describe('verifyNep413Signature', () => {
    const nonce = new Uint8Array(32);
    crypto.getRandomValues(nonce);
    const payload = {
        message: 'youtick-kms-auth-v1',
        nonce,
        recipient: 'kms.youtick.near',
    };

    it('returns true for a valid Ed25519 signature', async () => {
        const keyPair = await crypto.subtle.generateKey(
            { name: 'Ed25519' },
            true,
            ['sign', 'verify'],
        ) as CryptoKeyPair;

        const hash = await serializeNep413Hash(payload);
        const sigBuf = await crypto.subtle.sign({ name: 'Ed25519' }, keyPair.privateKey, hash);
        const sigB64 = bytesToBase64(new Uint8Array(sigBuf));

        const rawPub = await crypto.subtle.exportKey('raw', keyPair.publicKey);
        const pubB58 = base58Encode(new Uint8Array(rawPub));

        const result = await verifyNep413Signature(payload, sigB64, pubB58);
        expect(result).toBe(true);
    });

    it('returns false for signature over a different message', async () => {
        const keyPair = await crypto.subtle.generateKey(
            { name: 'Ed25519' },
            true,
            ['sign', 'verify'],
        ) as CryptoKeyPair;

        const wrongHash = await serializeNep413Hash({ ...payload, message: 'other' });
        const sigBuf = await crypto.subtle.sign({ name: 'Ed25519' }, keyPair.privateKey, wrongHash);
        const sigB64 = bytesToBase64(new Uint8Array(sigBuf));

        const rawPub = await crypto.subtle.exportKey('raw', keyPair.publicKey);
        const pubB58 = base58Encode(new Uint8Array(rawPub));

        const result = await verifyNep413Signature(payload, sigB64, pubB58);
        expect(result).toBe(false);
    });

    it('returns false for signature from a different key', async () => {
        const kp1 = await crypto.subtle.generateKey(
            { name: 'Ed25519' },
            true,
            ['sign', 'verify'],
        ) as CryptoKeyPair;
        const kp2 = await crypto.subtle.generateKey(
            { name: 'Ed25519' },
            true,
            ['sign', 'verify'],
        ) as CryptoKeyPair;

        const hash = await serializeNep413Hash(payload);
        const sigBuf = await crypto.subtle.sign({ name: 'Ed25519' }, kp1.privateKey, hash);
        const sigB64 = bytesToBase64(new Uint8Array(sigBuf));

        const rawPub2 = await crypto.subtle.exportKey('raw', kp2.publicKey);
        const pubB58 = base58Encode(new Uint8Array(rawPub2));

        const result = await verifyNep413Signature(payload, sigB64, pubB58);
        expect(result).toBe(false);
    });

    it('returns false for malformed signature', async () => {
        const keyPair = await crypto.subtle.generateKey(
            { name: 'Ed25519' },
            true,
            ['sign', 'verify'],
        ) as CryptoKeyPair;
        const rawPub = await crypto.subtle.exportKey('raw', keyPair.publicKey);
        const pubB58 = base58Encode(new Uint8Array(rawPub));

        const result = await verifyNep413Signature(payload, 'not-base64!!!', pubB58);
        expect(result).toBe(false);
    });

    it('returns false for malformed public key', async () => {
        const result = await verifyNep413Signature(payload, 'AAAA', 'not-base58-0OIl');
        expect(result).toBe(false);
    });
});
