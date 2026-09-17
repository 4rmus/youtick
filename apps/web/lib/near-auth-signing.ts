import { NEAR_AUTH_TESTNET_RPC, NEAR_AUTH_SIGNING_CHECK_ERRORS } from './near-auth-lab';
import type { NearWalletBase } from '@hot-labs/near-connect';
import type { prepareGoogleSigning, authorizeGoogleSigning, completeGoogleSigning } from './near-auth-signing-server';
import { isPinnedMeteorManifest } from './pinned-wallet-manifest';
import { selectedWalletAccount } from './wallet-account';
import { onDeviceSessionCleared, preparePlaybackDevice, suspendDeviceSession } from './device-session';
import { FEATURE_FLAGS, NEAR_CONFIG, NEAR_NETWORK } from './constants';

export type SigningReview = Awaited<ReturnType<typeof prepareGoogleSigning>>;
type ApprovedCall = Awaited<ReturnType<typeof authorizeGoogleSigning>>;
type SignedReply = Awaited<ReturnType<typeof completeGoogleSigning>>;
export const signingAttemptKey = (account: string) => `youtick:auth-lab:signing:testnet:${account}`;
export const reviewAttemptKey = (review: SigningReview) => review.purchase
    ? `youtick:auth-lab:ticket:testnet:${review.purchase.marketContractId}:${review.accountId}` : signingAttemptKey(review.accountId);

export async function prepareGooglePurchase(publicationId: string, sponsor: string): Promise<SigningReview> {
    if (NEAR_NETWORK !== 'testnet' || !FEATURE_FLAGS.publicTestnetVideoV1 || !FEATURE_FLAGS.enablePlaybackAuthorizerV2) throw new Error('ticket_disabled');
    const response = await fetch('/api/auth-lab/account', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) await suspendDeviceSession();
    if (!response.ok) throw new Error(response.status === 401 ? 'session_expired' : 'account_required');
    const account = await response.json();
    if (typeof account.implicitAccount !== 'string' || !/^[a-f0-9]{64}$/.test(account.implicitAccount)
        || !Array.isArray(account.accounts) || !account.accounts.includes(account.implicitAccount)) throw new Error('account_required');
    const playbackSession = await preparePlaybackDevice(account.implicitAccount);
    const review = await signingApi<SigningReview>({ action: 'prepare-purchase', sponsor, publicationId, playbackSession });
    if (review.accountId !== account.implicitAccount || review.purchase?.publicationId !== publicationId) throw new Error('account_changed');
    await assertSigningDevice(review);
    return review;
}

export async function assertSigningDevice(review: SigningReview) {
    if (!review.purchase) return;
    if (NEAR_NETWORK !== 'testnet' || !FEATURE_FLAGS.publicTestnetVideoV1 || !FEATURE_FLAGS.enablePlaybackAuthorizerV2
        || review.purchase.marketContractId !== NEAR_CONFIG.marketContractId || review.purchase.usdcContractId !== NEAR_CONFIG.usdcContractId) throw new Error('ticket_disabled');
    const device = await preparePlaybackDevice(review.accountId);
    const expected = review.purchase.playbackSession;
    if (device.session_public_key !== expected.session_public_key || device.certificate_sha256 !== expected.certificate_sha256
        || device.authorization_duration_ms !== expected.authorization_duration_ms) throw new Error('device_changed');
}

export async function signingApi<T>(body: object): Promise<T> {
    const response = await fetch('/api/auth-lab/signing', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
        if (result?.error === 'unapproved_claims') throw new Error('unapproved_claims');
        if (response.status === 401) { await suspendDeviceSession(); throw new Error('session_expired'); }
        const phase = result?.action;
        if (phase === 'authorize' && result?.reason === 'authorization_expired') throw new Error('authorization_expired');
        const detail = NEAR_AUTH_SIGNING_CHECK_ERRORS.has(result?.reason)
            && ['prepare-upload', 'authorize-upload', 'complete-upload'].includes(phase) ? `: ${phase} / ${result.reason}` : '';
        throw new Error(`signing_check_failed${detail}`);
    }
    return result as T;
}

export async function runGoogleSigning(wallet: NearWalletBase, review: SigningReview, token: string) {
    if (!navigator.locks || !isPinnedMeteorManifest(wallet.manifest)) throw new Error('wallet_unavailable');
    return navigator.locks.request('youtick-auth-lab-signing', { ifAvailable: true }, async (lock) => {
        const storageKey = reviewAttemptKey(review);
        if (!lock || localStorage.getItem(storageKey)) throw new Error('signing_already_started');
        const previous = review.purchase && localStorage.getItem(signingAttemptKey(review.accountId));
        if (previous && JSON.parse(previous).state !== 'verified') throw new Error('signing_already_started');
        if (!Number.isSafeInteger(review.expiresAt) || review.expiresAt <= Date.now()) throw new Error('review_expired');
        const active = new AbortController();
        const unsubscribe = onDeviceSessionCleared(() => active.abort());
        try {
            await assertSigningDevice(review);
            active.signal.throwIfAborted();
            const { approvalExpiresAtMs, ...call } = await signingApi<ApprovedCall>({ action: 'authorize', ticket: review.ticket, token });
            const sender = selectedWalletAccount(wallet, await wallet.getAccounts({ network: 'testnet' }));
            if (sender?.accountId !== review.sponsor) throw new Error('wallet_changed');
            await assertSigningDevice(review);
            active.signal.throwIfAborted();
            if (review.expiresAt <= Date.now()) throw new Error('review_expired');
            if (!Number.isSafeInteger(approvalExpiresAtMs) || approvalExpiresAtMs <= Date.now()) throw new Error('authorization_expired');
            // ponytail: a single attempt in this local lab; cancelled/uncertain replies require manual reconciliation.
            localStorage.setItem(storageKey, JSON.stringify({ state: 'outer_pending', innerHash: review.transactionHash }));
            const outcome = await wallet.signAndSendTransaction({ network: 'testnet', signerId: review.sponsor, ...call })
                .catch(() => { throw new Error('outer_unknown'); });
            const outerHash = outcome?.transaction?.hash;
            if (typeof outerHash !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(outerHash)) throw new Error('outer_unknown');
            localStorage.setItem(storageKey, JSON.stringify({ state: 'outer_submitted', outerHash, innerHash: review.transactionHash }));
            const signed = await signingApi<SignedReply>({ action: 'complete', ticket: review.ticket, outerHash });
            if (signed.transactionHash !== review.transactionHash || signed.accountId !== review.accountId) throw new Error('signed_transaction_changed');
            await assertSigningDevice(review);
            active.signal.throwIfAborted();
            localStorage.setItem(storageKey, JSON.stringify({ state: 'inner_pending', outerHash, innerHash: review.transactionHash }));
            // Never retry broadcast after a timeout. Reconcile this exact hash first.
            const response = await fetch(NEAR_AUTH_TESTNET_RPC, { method: 'POST', signal: AbortSignal.timeout(20_000),
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'auth-lab-signed',
                    method: 'broadcast_tx_commit', params: [signed.signedTransaction] }),
            });
            const result = await response.json();
            if (!response.ok || result.error) throw new Error('inner_unknown');
            const verified = await signingApi<{ verified: boolean; transactionHash: string }>({ action: 'verify', ticket: review.ticket });
            if (!verified.verified || verified.transactionHash !== review.transactionHash) throw new Error('inner_unknown');
            localStorage.setItem(storageKey, JSON.stringify({ state: 'verified', outerHash, innerHash: review.transactionHash }));
            return verified;
        } finally { unsubscribe(); }
    });
}
