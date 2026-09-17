import { NEAR_AUTH_TESTNET_RPC } from './near-auth-lab';
import type { NearWalletBase, WalletManifest } from '@hot-labs/near-connect';
import type { nearAuthAccountPreflight } from './near-auth-account-preflight';
import { PINNED_WALLET_MANIFEST, isPinnedMeteorManifest } from './pinned-wallet-manifest';
import { selectedWalletAccount } from './wallet-account';
import { suspendDeviceSession } from './device-session';

export type FundingReview = Awaited<ReturnType<typeof nearAuthAccountPreflight>>;
export const fundingAttemptKey = (target: string) => `youtick:auth-lab:funding:testnet:${target}`;

export async function readFundingReview(): Promise<FundingReview> {
    const response = await fetch('/api/auth-lab/account?prepare=funding', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
    });
    if (response.status === 401) await suspendDeviceSession();
    if (!response.ok) throw new Error(response.status === 401 ? 'session_expired' : 'funding_check_failed');
    return response.json();
}

export async function connectFundingWallet(cspNonce?: string) {
    const { NearConnector } = await import('@hot-labs/near-connect');
    const storage = new Map<string, string>();
    const connector = new NearConnector({ network: 'testnet', autoConnect: false,
        cspNonce: cspNonce ?? document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce,
        manifest: PINNED_WALLET_MANIFEST as unknown as { version: string; wallets: WalletManifest[] },
        storage: { get: async (key) => storage.get(key) ?? null,
            set: async (key, value) => { storage.set(key, value); }, remove: async (key) => { storage.delete(key); } },
        providers: { mainnet: [], testnet: [NEAR_AUTH_TESTNET_RPC] }, footerBranding: null,
    });
    await connector.whenManifestLoaded;
    const wallet = connector.wallets.find((candidate) => isPinnedMeteorManifest(candidate.manifest));
    if (!wallet) throw new Error('funding_wallet_unavailable');
    await wallet.signIn({ network: 'testnet' });
    const account = selectedWalletAccount(wallet, await wallet.getAccounts({ network: 'testnet' }));
    if (!account) throw new Error('funding_wallet_unavailable');
    return { wallet, accountId: account.accountId };
}

export async function requestFundingApproval(wallet: NearWalletBase, accountId: string, reviewed: FundingReview) {
    if (!navigator.locks || !isPinnedMeteorManifest(wallet.manifest)) throw new Error('funding_wallet_unavailable');
    return navigator.locks.request('youtick-auth-lab-funding', { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error('funding_already_started');
        const key = fundingAttemptKey(reviewed.implicitAccount);
        if (localStorage.getItem(key)) throw new Error('funding_already_started');
        const current = await readFundingReview();
        if (!current.funding?.allowed || current.funding.reason !== 'ready' || current.accounts.length
            || current.implicitAccount !== reviewed.implicitAccount || current.publicKey !== reviewed.publicKey
            || !/^[a-f0-9]{64}$/.test(current.implicitAccount)
            || Date.now() - current.funding.checkedAt > 30_000 || current.funding.checkedAt > Date.now() + 1000) {
            throw new Error('funding_review_changed');
        }
        const selected = selectedWalletAccount(wallet, await wallet.getAccounts({ network: 'testnet' }));
        if (selected?.accountId !== accountId || accountId === current.implicitAccount) throw new Error('funding_wallet_changed');
        // ponytail: one attempt per target in this lab. Uncertain/cancelled wallet replies require manual reconciliation.
        localStorage.setItem(key, JSON.stringify({ state: 'pending', startedAt: Date.now() }));
        const outcome = await wallet.signAndSendTransaction({ network: 'testnet', signerId: accountId,
            receiverId: current.implicitAccount,
            actions: [{ type: 'Transfer', params: { deposit: '100000000000000000000000' } }],
        });
        const hash = outcome?.transaction?.hash;
        if (typeof hash === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(hash)) {
            localStorage.setItem(key, JSON.stringify({ state: 'submitted', hash }));
        }
        return outcome;
    });
}
