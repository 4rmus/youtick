import { describe, expect, it } from 'vitest';
import {
    buildShareIntegrityCommitments,
    reconstructSecretFromShares,
    selectSharesForReconstruction,
    splitSecretIntoShares,
} from '@/lib/kms/shares';

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

    it('selects only shares that match the shared integrity commitments', async () => {
        const secret = btoa('0123456789abcdef0123456789abcdef');
        const shares = splitSecretIntoShares(secret, 5, 3);
        const commitments = await buildShareIntegrityCommitments('video-1', shares, 5, 3);
        const selected = await selectSharesForReconstruction('video-1', [
            {
                ...shares[0],
                shareB64: btoa('corrupted-share'),
                totalShares: 5,
                requiredShares: 3,
                scheme: 'shamir-v1',
                shareCommitments: commitments,
            },
            {
                ...shares[1],
                totalShares: 5,
                requiredShares: 3,
                scheme: 'shamir-v1',
                shareCommitments: commitments,
            },
            {
                ...shares[2],
                totalShares: 5,
                requiredShares: 3,
                scheme: 'shamir-v1',
                shareCommitments: commitments,
            },
            {
                ...shares[3],
                totalShares: 5,
                requiredShares: 3,
                scheme: 'shamir-v1',
                shareCommitments: commitments,
            },
        ], 3);

        expect(selected?.map((share) => share.shareId)).toEqual([2, 3, 4]);
        expect(reconstructSecretFromShares(selected || [], 3)).toBe(secret);
    });

    it('does not let an invalid duplicate share hide a valid share with the same id', async () => {
        const secret = btoa('duplicate-share-check');
        const shares = splitSecretIntoShares(secret, 4, 3);
        const commitments = await buildShareIntegrityCommitments('video-1', shares, 4, 3);
        const withMetadata = shares.map((share) => ({
            ...share,
            totalShares: 4,
            requiredShares: 3,
            scheme: 'shamir-v1',
            shareCommitments: commitments,
        }));
        const selected = await selectSharesForReconstruction('video-1', [
            {
                ...withMetadata[1],
                shareB64: btoa('bad-duplicate'),
            },
            withMetadata[0],
            withMetadata[1],
            withMetadata[2],
        ], 3);

        expect(selected?.map((share) => share.shareId)).toEqual([1, 2, 3]);
        expect(reconstructSecretFromShares(selected || [], 3)).toBe(secret);
    });
});
