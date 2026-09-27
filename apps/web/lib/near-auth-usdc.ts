import type { NearWalletBase } from '@hot-labs/near-connect';
import type { authorizeGoogleUsdc, prepareGoogleUsdc, verifyGoogleUsdc } from './near-auth-usdc-server';
import { signingApi } from './near-auth-signing';
import { isPinnedMeteorManifest } from './pinned-wallet-manifest';
import { selectedWalletAccount } from './wallet-account';

export type UsdcReview = Awaited<ReturnType<typeof prepareGoogleUsdc>>;
export const usdcAttemptKey = (accountId: string) => `youtick:auth-lab:usdc:testnet:${accountId}`;

export async function requestUsdcFunding(wallet: NearWalletBase, review: UsdcReview) {
    if (!navigator.locks || !isPinnedMeteorManifest(wallet.manifest)) throw new Error('funding_wallet_unavailable');
    return navigator.locks.request('youtick-auth-lab-funding', { ifAvailable: true }, async (lock) => {
        const key = usdcAttemptKey(review.accountId);
        if (!lock || localStorage.getItem(key)) throw new Error('funding_already_started');
        if (!review.allowed || !review.ticket || review.expiresAt <= Date.now()) throw new Error('review_expired');
        const call = await signingApi<Awaited<ReturnType<typeof authorizeGoogleUsdc>>>({ action: 'authorize-usdc', ticket: review.ticket });
        const selected = selectedWalletAccount(wallet, await wallet.getAccounts({ network: 'testnet' }));
        if (selected?.accountId !== review.sender || call.sender !== review.sender || call.accountId !== review.accountId
            || call.receiverId !== review.tokenContractId || JSON.stringify(call.actions) !== JSON.stringify(review.actions)) throw new Error('funding_review_changed');
        if (review.expiresAt <= Date.now()) throw new Error('review_expired');
        // ponytail: one funding attempt per Google account in this lab; unknown results never trigger another transfer.
        localStorage.setItem(key, JSON.stringify({ state: 'pending' }));
        const result = await wallet.signAndSendTransaction({ network: 'testnet', signerId: review.sender,
            receiverId: call.receiverId, actions: call.actions });
        const txHash = result?.transaction?.hash;
        if (typeof txHash !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(txHash)) throw new Error('funding_unknown');
        localStorage.setItem(key, JSON.stringify({ state: 'submitted', transactionHash: txHash }));
        const verified = await signingApi<Awaited<ReturnType<typeof verifyGoogleUsdc>>>({ action: 'verify-usdc', ticket: review.ticket, txHash });
        if (!verified.verified || verified.transactionHash !== txHash || verified.accountId !== review.accountId) throw new Error('funding_unknown');
        localStorage.setItem(key, JSON.stringify({ state: 'verified', transactionHash: txHash }));
        return verified;
    });
}
