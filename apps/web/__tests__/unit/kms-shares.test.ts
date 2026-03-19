import { describe, expect, it } from 'vitest';
import { reconstructSecretFromShares, splitSecretIntoShares } from '@/lib/kms/shares';

describe('kms shares', () => {
    it('reconstructs a secret from any threshold-sized subset', () => {
        const secret = btoa('0123456789abcdef0123456789abcdef');
        const shares = splitSecretIntoShares(secret, 5, 3);

        const reconstructedA = reconstructSecretFromShares(
            [shares[0], shares[1], shares[2]],
            3,
        );
        const reconstructedB = reconstructSecretFromShares(
            [shares[0], shares[3], shares[4]],
            3,
        );

        expect(reconstructedA).toBe(secret);
        expect(reconstructedB).toBe(secret);
    });
});
