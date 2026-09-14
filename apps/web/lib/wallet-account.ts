import type { Account } from '@hot-labs/near-connect';
import { NEAR_NETWORK } from './constants';
import { isPinnedMeteorManifest } from './pinned-wallet-manifest';

// The pinned Meteor executor reads this same public record when choosing a signer.
export const METEOR_ACCOUNT_STORAGE_KEY = 'meteor-wallet:meteor-account-data';

export function selectedWalletAccount(wallet: { manifest: unknown }, accounts: Account[]): Account | null {
    const unavailable = () => new Error('wallet_account_selection_required');
    if (!Array.isArray(accounts) || accounts.some(account => !account
        || typeof account.accountId !== 'string' || account.accountId.length < 2 || account.accountId.length > 64
        || (account.publicKey !== undefined && typeof account.publicKey !== 'string')
        || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(account.accountId))) throw unavailable();
    if (accounts.length === 0) return null;
    if (!isPinnedMeteorManifest(wallet.manifest)) {
        if (accounts.length !== 1) throw unavailable();
        return accounts[0];
    }
    try {
        const raw = localStorage.getItem(METEOR_ACCOUNT_STORAGE_KEY);
        if (!raw || raw.length > 4096) throw unavailable();
        const selection = JSON.parse(raw);
        if (!selection?.account || selection.identifier?.blockchain !== 'near'
            || (selection.account.publicKey !== undefined && typeof selection.account.publicKey !== 'string')
            || selection.identifier.network !== NEAR_NETWORK
            || selection.identifier.accountId !== selection.account.accountId) throw unavailable();
        const matches = accounts.filter(account => account.accountId === selection.account.accountId
            && (account.publicKey === undefined || account.publicKey === selection.account.publicKey));
        // Meteor appends a row on each login; compatible repeats identify the same account.
        if (matches.length === 0) throw unavailable();
        return matches[0];
    } catch {
        throw unavailable();
    }
}
