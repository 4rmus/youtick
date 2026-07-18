import { describe, expect, it } from 'vitest';
import { encryptBufferAuthenticated } from '@/lib/kms/encryption';
import { base64Decode, base64Encode } from '@/lib/crypto/codec';

describe('authenticated media encryption', () => {
    it('decrypts valid AES-GCM payloads and rejects tampering', async () => {
        const keyBytes = crypto.getRandomValues(new Uint8Array(32));
        const keyB64 = base64Encode(keyBytes.buffer);
        const plaintext = new TextEncoder().encode('authenticated segment');
        const encrypted = await encryptBufferAuthenticated(plaintext, keyB64);
        const key = await crypto.subtle.importKey(
            'raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt'],
        );
        const algorithm = {
            name: 'AES-GCM',
            iv: base64Decode(encrypted.ivB64),
            tagLength: 128,
        } as AesGcmParams;

        const decrypted = await crypto.subtle.decrypt(algorithm, key, encrypted.ciphertext);
        expect(new TextDecoder().decode(decrypted)).toBe('authenticated segment');

        const tampered = new Uint8Array(encrypted.ciphertext);
        tampered[0] ^= 1;
        await expect(crypto.subtle.decrypt(algorithm, key, tampered)).rejects.toThrow();
    });
});
