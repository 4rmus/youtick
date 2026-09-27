import type { Action } from 'near-api-js';
import type { NearWalletBase } from '@hot-labs/near-connect';
import type { createNearAuthLab } from './near-auth-lab';
import type { authorizeGoogleUpload, completeGoogleUpload, prepareGoogleUpload } from './near-auth-upload-server';
import type { WalletInstance } from './types';
import { signingApi } from './near-auth-signing';
import { NEAR_CONFIG } from './constants';
import { isPinnedMeteorManifest } from './pinned-wallet-manifest';
import { selectedWalletAccount } from './wallet-account';
import { onDeviceSessionCleared, preparePlaybackDevice, suspendDeviceSession } from './device-session';
import { base64Encode, hexEncode } from './crypto/codec';
import { assertLivepeerUploadDraftReady } from './livepeer-upload';
import { googleUploadAttemptKey } from './near-auth-upload-attempt';

export function createGoogleUploadWallet(accountId: string, sponsor: { accountId: string; wallet: NearWalletBase },
    auth: ReturnType<typeof createNearAuthLab>, signal: AbortSignal): WalletInstance {
    const unsupported = async (): Promise<never> => { throw new Error('google_upload_action_unsupported'); };
    const checkAccount = async () => {
        signal.throwIfAborted();
        const response = await fetch('/api/auth-lab/account', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
        if (response.status === 401) await suspendDeviceSession();
        if (!response.ok) throw new Error('session_expired');
        const result = await response.json();
        signal.throwIfAborted();
        if (result.implicitAccount !== accountId || !Array.isArray(result.accounts) || !result.accounts.includes(accountId)) throw new Error('account_changed');
        return [{ accountId }];
    };
    return {
        getAccounts: checkAccount, signAndSendTransaction: unsupported, signAndSendTransactions: unsupported,
        async signDelegateActions(input) {
            if (!navigator.locks || !isPinnedMeteorManifest(sponsor.wallet.manifest) || input.blockHeightTtl !== 200
                || input.delegateActions.length !== 1 || input.delegateActions[0].receiverId !== NEAR_CONFIG.usdcContractId
                || input.delegateActions[0].actions.length !== 1) throw new Error('invalid_upload_action');
            const action = input.delegateActions[0].actions[0] as Action;
            const call = action?.functionCall;
            if (!call || Object.keys(action).some((key) => !['enum', 'functionCall'].includes(key))
                || call.methodName !== 'ft_transfer_call' || call.gas !== 100_000_000_000_000n || call.deposit !== 1n
                || !(call.args instanceof Uint8Array)) throw new Error('invalid_upload_action');
            return navigator.locks.request('youtick-auth-lab-signing', { ifAvailable: true }, async (lock) => {
                if (!lock) throw new Error('signing_already_started');
                const active = new AbortController();
                const lifetime = AbortSignal.any([signal, active.signal]);
                const unsubscribe = onDeviceSessionCleared(() => active.abort());
                try {
                    await checkAccount();
                    const review = await signingApi<Awaited<ReturnType<typeof prepareGoogleUpload>>>({ action: 'prepare-upload',
                        sponsor: sponsor.accountId, encodedArgs: base64Encode(call.args) });
                    if (review.accountId !== accountId || review.sponsor !== sponsor.accountId) throw new Error('account_changed');
                    const key = googleUploadAttemptKey(NEAR_CONFIG.marketContractId, accountId, review.jobId);
                    if (localStorage.getItem(key) !== null) throw new Error('signing_already_started');
                    const attempt = { accountId, sponsor: sponsor.accountId, jobId: review.jobId,
                        delegateSha256: hexEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(review.delegate)))) };
                    const checkDevice = async () => {
                        lifetime.throwIfAborted();
                        const device = await preparePlaybackDevice(accountId);
                        if (device.session_public_key !== review.playbackSession.session_public_key
                            || device.certificate_sha256 !== review.playbackSession.certificate_sha256) throw new Error('device_changed');
                        if (review.expiresAt <= Date.now()) throw new Error('review_expired');
                        lifetime.throwIfAborted();
                    };
                    await checkDevice();
                    const amount = BigInt(review.totalFeeUsdc);
                    const price = BigInt(review.priceUsdc);
                    if (!window.confirm(`${review.title}\nDosya: ${review.sourceBytes} bayt\nYükleme bedeli: ${amount / 1_000_000n}.${(amount % 1_000_000n).toString().padStart(6, '0')} test USDC\nBilet fiyatı: ${price / 1_000_000n}.${(price % 1_000_000n).toString().padStart(6, '0')} test USDC\nGoogle hesabı: ${accountId}\nİmza sponsoru: ${sponsor.accountId}\nSponsor imza bütçesi: en fazla 0,35 test NEAR.\nBu cihaz 30 gün yetkilendirilecek. Kimlik referansınızı içeren onay tokenı testnet zincirinde herkese açık ve kalıcı olacak.\nGoogle ekranında ayrıntılar kodlanmış görünebilir; başlık ve ücretler için bu özeti kontrol edin.\nGoogle onayı ve sponsor imzasıyla devam edilsin mi?`)) throw new Error('upload_cancelled');
                    const token = await auth.requestSigningAuthorization(review.delegate, 'delegateAction');
                    const { approvalExpiresAtMs, ...approved } = await signingApi<Awaited<ReturnType<typeof authorizeGoogleUpload>>>({ action: 'authorize-upload', ticket: review.ticket, token });
                    const selected = selectedWalletAccount(sponsor.wallet, await sponsor.wallet.getAccounts({ network: 'testnet' }));
                    if (selected?.accountId !== sponsor.accountId) throw new Error('wallet_changed');
                    await checkDevice();
                    if (!Number.isSafeInteger(approvalExpiresAtMs) || approvalExpiresAtMs <= Date.now()) throw new Error('authorization_expired');
                    assertLivepeerUploadDraftReady(accountId, review.jobId);
                    // ponytail: one MPC attempt per upload job; uncertain results require reconciliation, not another fee.
                    localStorage.setItem(key, JSON.stringify({ ...attempt, state: 'outer_pending' }));
                    const result = await sponsor.wallet.signAndSendTransaction({ network: 'testnet', signerId: sponsor.accountId, ...approved })
                        .catch(() => { throw new Error('outer_unknown'); });
                    const outerHash = result?.transaction?.hash;
                    if (typeof outerHash !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(outerHash)) throw new Error('outer_unknown');
                    localStorage.setItem(key, JSON.stringify({ ...attempt, state: 'outer_submitted', outerHash }));
                    try {
                        const signed = await signingApi<Awaited<ReturnType<typeof completeGoogleUpload>>>({ action: 'complete-upload', ticket: review.ticket, outerHash });
                        if (signed.accountId !== accountId || signed.jobId !== review.jobId) throw new Error('account_changed');
                        await checkDevice();
                        localStorage.setItem(key, JSON.stringify({ ...attempt, state: 'mpc_verified', outerHash }));
                        // Only the existing uploader's persisted proof establishes relay readiness.
                        return { signedDelegateActions: [signed.signedDelegate] };
                    } catch (error) {
                        const expired = error instanceof Error && (error.message === 'review_expired'
                            || error.message === 'signing_check_failed: complete-upload / authorization_expired');
                        throw new Error(expired ? 'google_upload_completion_expired' : 'google_upload_completion_pending');
                    }
                } finally { unsubscribe(); }
            });
        },
    };
}
