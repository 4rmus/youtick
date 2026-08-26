import { describe, expect, it } from 'vitest';
import {
    PINNED_METEOR_EXECUTOR_SHA256,
    PINNED_WALLET_MANIFEST,
    isPinnedMeteorManifest,
} from '@/lib/pinned-wallet-manifest';

describe('pinned sponsored wallet manifest', () => {
    it('contains one immutable Meteor executor with an exact digest', () => {
        expect(PINNED_WALLET_MANIFEST.wallets).toHaveLength(1);
        const wallet = PINNED_WALLET_MANIFEST.wallets[0];
        expect(wallet).toMatchObject({
            id: 'meteor-wallet',
            type: 'sandbox',
            version: '1.1.0',
            features: { signDelegateActions: true, testnet: true },
        });
        expect(wallet.executor).toMatch(
            /^https:\/\/raw\.githubusercontent\.com\/Meteor-Wallet\/meteor_wallet_sdk\/[0-9a-f]{40}\/storage\/meteor-near-connect-latest\.js$/,
        );
        expect(wallet.executor).not.toContain('/refs/heads/');
        expect(wallet.executor).not.toContain('/data-storage/');
        expect(PINNED_METEOR_EXECUTOR_SHA256).toMatch(/^[0-9a-f]{64}$/);
        expect(isPinnedMeteorManifest(wallet)).toBe(true);
    });

    it('rejects moving, debug, injected and lookalike manifests', () => {
        const wallet = PINNED_WALLET_MANIFEST.wallets[0];
        expect(isPinnedMeteorManifest({ ...wallet, debug: true })).toBe(false);
        expect(isPinnedMeteorManifest({ ...wallet, type: 'injected' })).toBe(false);
        expect(isPinnedMeteorManifest({
            ...wallet,
            executor: 'https://raw.githubusercontent.com/Meteor-Wallet/meteor_wallet_sdk/data-storage/storage/meteor-near-connect-latest.js',
        })).toBe(false);
        expect(isPinnedMeteorManifest({ ...wallet, id: 'meteor-wallet-lookalike' })).toBe(false);
    });
});
