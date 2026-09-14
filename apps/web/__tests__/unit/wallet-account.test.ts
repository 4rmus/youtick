import { afterEach, describe, expect, it, vi } from 'vitest';
import { METEOR_ACCOUNT_STORAGE_KEY, selectedWalletAccount } from '@/lib/wallet-account';
import { PINNED_WALLET_MANIFEST } from '@/lib/pinned-wallet-manifest';

const wallet = { manifest: PINNED_WALLET_MANIFEST.wallets[0] };
const accounts = [{ accountId: 'utick2.testnet', publicKey: 'key-a' }, { accountId: 'soteri.testnet', publicKey: 'key-b' }];
const selection = () => ({ account: accounts[1], identifier: { accountId: 'soteri.testnet', blockchain: 'near', network: 'testnet' } });

describe('selected wallet account', () => {
    afterEach(() => vi.restoreAllMocks());

    it('uses the existing Meteor signer record regardless of list order, without writing storage', () => {
        localStorage.setItem(METEOR_ACCOUNT_STORAGE_KEY, JSON.stringify(selection()));
        vi.mocked(localStorage.setItem).mockClear();
        expect(selectedWalletAccount(wallet, accounts)).toEqual(accounts[1]);
        expect(selectedWalletAccount(wallet, [...accounts].reverse())).toEqual(accounts[1]);
        expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it.each([
        null, '', '{bad', 'null', '[]', '{}', ' '.repeat(4097),
        JSON.stringify({ ...selection(), identifier: { ...selection().identifier, network: 'mainnet' } }),
        JSON.stringify({ ...selection(), identifier: { ...selection().identifier, blockchain: 'other' } }),
        JSON.stringify({ ...selection(), identifier: { ...selection().identifier, accountId: 'utick2.testnet' } }),
        JSON.stringify({ ...selection(), account: { ...accounts[1], publicKey: 'wrong-key' } }),
        JSON.stringify({ ...selection(), account: { ...accounts[1], publicKey: null } }),
    ])('rejects missing or invalid selection %j instead of choosing the first linked account', raw => {
        if (raw !== null) localStorage.setItem(METEOR_ACCOUNT_STORAGE_KEY, raw);
        expect(() => selectedWalletAccount(wallet, accounts)).toThrow('wallet_account_selection_required');
    });

    it('requires selected membership and rejects duplicate or malformed linked accounts', () => {
        localStorage.setItem(METEOR_ACCOUNT_STORAGE_KEY, JSON.stringify(selection()));
        expect(() => selectedWalletAccount(wallet, [accounts[0]])).toThrow('wallet_account_selection_required');
        expect(() => selectedWalletAccount(wallet, [accounts[1], accounts[1]])).toThrow('wallet_account_selection_required');
        expect(() => selectedWalletAccount(wallet, [{ accountId: '../bad' }])).toThrow('wallet_account_selection_required');
        expect(selectedWalletAccount(wallet, [])).toBeNull();
    });

    it('accepts an account-only combined proof while still requiring the selected identity', () => {
        localStorage.setItem(METEOR_ACCOUNT_STORAGE_KEY, JSON.stringify(selection()));
        expect(selectedWalletAccount(wallet, [{ accountId: 'soteri.testnet' }])).toEqual({ accountId: 'soteri.testnet' });
        expect(() => selectedWalletAccount(wallet, [{ accountId: 'utick2.testnet' }])).toThrow('wallet_account_selection_required');
    });

    it('fails closed on unavailable storage without exposing its error', () => {
        vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('private detail'); });
        expect(() => selectedWalletAccount(wallet, accounts)).toThrow('wallet_account_selection_required');
    });

    it('keeps unambiguous other-wallet accounts and rejects ambiguous lists', () => {
        const other = { manifest: { id: 'other-wallet' } };
        expect(selectedWalletAccount(other, [accounts[0]])).toEqual(accounts[0]);
        expect(() => selectedWalletAccount(other, accounts)).toThrow('wallet_account_selection_required');
    });
});
