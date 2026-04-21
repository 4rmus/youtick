import { describe, expect, it } from 'vitest';
import {
    decryptShareRecord,
    encryptShareRecord,
    importShareCipherKeyFromSecret,
    type Env,
    type StoredShareRecord,
} from '../src/index';

type TestEnv = Partial<Env>;

function envWithSecrets(current: string, previous?: string): Env {
    return {
        VIDEO_KEYS: {} as Env['VIDEO_KEYS'],
        RATE_LIMIT: {} as Env['RATE_LIMIT'],
        ACCESS_CACHE: {} as Env['ACCESS_CACHE'],
        ALLOWED_ORIGINS: '',
        NEAR_CONTRACT_ID: 'youtick.near',
        NEAR_NETWORK: 'testnet',
        OPERATOR_SHARE_SECRET: current,
        OPERATOR_SHARE_SECRET_PREVIOUS: previous,
    } as Env;
}

const SECRET_A = 'a'.repeat(48);
const SECRET_B = 'b'.repeat(48);
const SECRET_C = 'c'.repeat(48);

describe('importShareCipherKeyFromSecret (HKDF)', () => {
    it('derives a CryptoKey', async () => {
        const key = await importShareCipherKeyFromSecret(SECRET_A);
        expect(key.algorithm.name).toBe('AES-GCM');
        expect(key.usages).toContain('encrypt');
        expect(key.usages).toContain('decrypt');
    });

    it('same secret derives equivalent key (roundtrip succeeds)', async () => {
        const env1 = envWithSecrets(SECRET_A);
        const env2 = envWithSecrets(SECRET_A);
        const stored = await encryptShareRecord(env1, {
            shareId: 1,
            shareB64: 'aGVsbG8td29ybGQ=',
            totalShares: 5,
            requiredShares: 3,
            scheme: 'shamir-v1',
        });
        const decrypted = await decryptShareRecord(env2, stored);
        expect(decrypted).toBe('aGVsbG8td29ybGQ=');
    });

    it('different secrets produce incompatible keys', async () => {
        const envEnc = envWithSecrets(SECRET_A);
        const envDec = envWithSecrets(SECRET_B);
        const stored = await encryptShareRecord(envEnc, {
            shareId: 2,
            shareB64: 'dGVzdA==',
            totalShares: 5,
            requiredShares: 3,
            scheme: 'shamir-v1',
        });
        await expect(decryptShareRecord(envDec, stored)).rejects.toBeDefined();
    });
});

describe('encryptShareRecord / decryptShareRecord roundtrip', () => {
    it('encrypts to non-deterministic ciphertext (unique nonce)', async () => {
        const env = envWithSecrets(SECRET_A);
        const input = {
            shareId: 1,
            shareB64: 'c2hhcmUtZGF0YQ==',
            totalShares: 5,
            requiredShares: 3,
            scheme: 'shamir-v1' as const,
        };
        const a = await encryptShareRecord(env, input);
        const b = await encryptShareRecord(env, input);
        expect(a.nonceB64).not.toBe(b.nonceB64);
        expect(a.ciphertextB64).not.toBe(b.ciphertextB64);
    });

    it('preserves metadata through roundtrip', async () => {
        const env = envWithSecrets(SECRET_A);
        const stored = await encryptShareRecord(env, {
            shareId: 3,
            shareB64: 'ZmluYWwtc2hhcmU=',
            totalShares: 5,
            requiredShares: 3,
            scheme: 'shamir-v1',
        });
        expect(stored.shareId).toBe(3);
        expect(stored.totalShares).toBe(5);
        expect(stored.requiredShares).toBe(3);
        expect(stored.scheme).toBe('shamir-v1');
    });

    it('rejects tampered ciphertext (AES-GCM auth tag)', async () => {
        const env = envWithSecrets(SECRET_A);
        const stored = await encryptShareRecord(env, {
            shareId: 1,
            shareB64: 'aGVsbG8=',
            totalShares: 5,
            requiredShares: 3,
            scheme: 'shamir-v1',
        });
        // Flip a bit in the ciphertext by altering the first base64 char to a
        // different valid character — guarantees tampering regardless of contents.
        const first = stored.ciphertextB64.charAt(0);
        const swapped = first === 'A' ? 'B' : 'A';
        const tampered: StoredShareRecord = {
            ...stored,
            ciphertextB64: swapped + stored.ciphertextB64.slice(1),
        };
        await expect(decryptShareRecord(env, tampered)).rejects.toBeDefined();
    });
});

describe('decryptShareRecord dual-key rotation fallback', () => {
    it('falls back to PREVIOUS when current cannot decrypt', async () => {
        // Encrypt with SECRET_A (old)
        const oldEnv = envWithSecrets(SECRET_A);
        const stored = await encryptShareRecord(oldEnv, {
            shareId: 1,
            shareB64: 'b2xkLXNoYXJl',
            totalShares: 5,
            requiredShares: 3,
            scheme: 'shamir-v1',
        });

        // Now rotate: SECRET_B is current, SECRET_A is previous
        const rotatedEnv = envWithSecrets(SECRET_B, SECRET_A);
        const decrypted = await decryptShareRecord(rotatedEnv, stored);
        expect(decrypted).toBe('b2xkLXNoYXJl');
    });

    it('throws original error when PREVIOUS not configured', async () => {
        const oldEnv = envWithSecrets(SECRET_A);
        const stored = await encryptShareRecord(oldEnv, {
            shareId: 1,
            shareB64: 'dGVzdA==',
            totalShares: 5,
            requiredShares: 3,
            scheme: 'shamir-v1',
        });

        const wrongEnv = envWithSecrets(SECRET_B);
        await expect(decryptShareRecord(wrongEnv, stored)).rejects.toBeDefined();
    });

    it('throws when neither current nor PREVIOUS can decrypt', async () => {
        const origEnv = envWithSecrets(SECRET_A);
        const stored = await encryptShareRecord(origEnv, {
            shareId: 1,
            shareB64: 'dGVzdA==',
            totalShares: 5,
            requiredShares: 3,
            scheme: 'shamir-v1',
        });

        // Neither B nor C match A
        const badEnv = envWithSecrets(SECRET_B, SECRET_C);
        await expect(decryptShareRecord(badEnv, stored)).rejects.toBeDefined();
    });

    it('uses current key first (no fallback needed when it works)', async () => {
        // Encrypt with current, verify we dont need PREVIOUS
        const env = envWithSecrets(SECRET_A, SECRET_B);
        const stored = await encryptShareRecord(env, {
            shareId: 1,
            shareB64: 'Y3VycmVudA==',
            totalShares: 5,
            requiredShares: 3,
            scheme: 'shamir-v1',
        });
        const decrypted = await decryptShareRecord(env, stored);
        expect(decrypted).toBe('Y3VycmVudA==');
    });
});
