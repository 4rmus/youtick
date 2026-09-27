import type { Action } from 'near-api-js';
import { isMpcSettled, type MpcStatus } from '../../../protocol/paid-media-livepeer-v1/mpc-sponsor';
import type { prepareGoogleUpload } from './near-auth-upload-server';
import type { WalletInstance } from './types';
import { readProductAccount } from './near-auth-product';
import { NEAR_CONFIG } from './constants';
import { onDeviceSessionCleared, preparePlaybackDevice } from './device-session';
import { assertLivepeerUploadDraftReady, resumeSponsoredUploadPayment } from './livepeer-upload';
import { googleUploadAttemptKey, productUploadAttemptKey } from './near-auth-upload-attempt';
import { base64Encode, hexEncode } from './crypto/codec';

type Review = Awaited<ReturnType<typeof prepareGoogleUpload>>;
export async function uploadApi<T>(body: object, signal?: AbortSignal): Promise<T> {
    const response = await fetch('/api/auth/upload', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const value = await response.json();
    if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : 'upload_check_failed');
    return value as T;
}
export const uploadStatus = (signal?: AbortSignal) =>
    uploadApi<{ enabled: boolean; payment: MpcStatus | null }>({ action: 'status', operationId: '' }, signal);

async function checkAccount(accountId: string, signal: AbortSignal) {
    const account = await readProductAccount(signal);
    signal.throwIfAborted();
    if (!account.accountReady || account.accountId !== accountId) throw new Error('account_changed');
    return [{ accountId }];
}
function checkPayment(payment: MpcStatus | null, accountId: string, jobId: string, payloadHash?: string): asserts payment is MpcStatus {
    if (!payment || payment.accountId !== accountId || payment.purpose !== 'upload' || payment.resourceId !== jobId
        || payment.network !== 'testnet' || payment.market !== NEAR_CONFIG.marketContractId
        || (payloadHash && payment.payloadHash !== payloadHash)) throw new Error('account_changed');
}
export async function continueUploadPayment(accountId: string, operationId: string, signal: AbortSignal) {
    await checkAccount(accountId, signal);
    const value = await uploadStatus(signal);
    const payment = value.payment;
    if (!payment || payment.operationId !== operationId) throw new Error('account_changed');
    checkPayment(payment, accountId, payment.resourceId);
    if (payment.state === 'UPLOAD_SETTLED') return;
    if (!value.enabled || payment.state !== 'MPC_VERIFIED' || !payment.upload) throw new Error('mpc_pending');
    if (localStorage.getItem(googleUploadAttemptKey(NEAR_CONFIG.marketContractId, accountId, payment.resourceId)) !== null) throw new Error('signing_already_started');
    await resumeSponsoredUploadPayment(accountId, payment.resourceId, payment.upload, signal);
}

export function createProductUploadWallet(accountId: string, authorize: (bytes: number[]) => Promise<string>, signal: AbortSignal): WalletInstance {
    const unsupported = async (): Promise<never> => { throw new Error('google_upload_action_unsupported'); };
    return {
        getAccounts: () => checkAccount(accountId, signal), signAndSendTransaction: unsupported, signAndSendTransactions: unsupported,
        async signDelegateActions(input) {
            if (!navigator.locks || input.blockHeightTtl !== 200 || input.delegateActions.length !== 1
                || input.delegateActions[0].receiverId !== NEAR_CONFIG.usdcContractId || input.delegateActions[0].actions.length !== 1) throw new Error('invalid_upload_action');
            const action = input.delegateActions[0].actions[0] as Action, call = action?.functionCall;
            if (!call || Object.keys(action).some(key => !['enum', 'functionCall'].includes(key)) || call.methodName !== 'ft_transfer_call'
                || call.gas !== 100_000_000_000_000n || call.deposit !== 1n || !(call.args instanceof Uint8Array)) throw new Error('invalid_upload_action');
            return navigator.locks.request('youtick-auth-v1-upload', { ifAvailable: true }, async lock => {
                if (!lock) throw new Error('signing_already_started');
                const active = new AbortController(), lifetime = AbortSignal.any([signal, active.signal]);
                const unsubscribe = onDeviceSessionCleared(() => active.abort());
                try {
                    await checkAccount(accountId, lifetime);
                    const current = await uploadStatus(lifetime);
                    if (!current.enabled || current.payment && !isMpcSettled(current.payment)) throw new Error('mpc_pending');
                    const args = JSON.parse(new TextDecoder().decode(call.args)), expected = JSON.parse(args.msg);
                    if (expected.creator_id !== accountId || typeof expected.job_id !== 'string') throw new Error('invalid_upload_action');
                    const key = productUploadAttemptKey(NEAR_CONFIG.marketContractId, accountId, expected.job_id);
                    if ([key, googleUploadAttemptKey(NEAR_CONFIG.marketContractId, accountId, expected.job_id)]
                        .some(item => localStorage.getItem(item) !== null)) throw new Error('signing_already_started');
                    assertLivepeerUploadDraftReady(accountId, expected.job_id);
                    const { review } = await uploadApi<{ review: Review }>({ action: 'prepare', encodedArgs: base64Encode(call.args) }, lifetime);
                    if (review.accountId !== accountId || review.jobId !== expected.job_id || review.title !== expected.title
                        || review.sourceBytes !== expected.expected_source_bytes || review.priceUsdc !== expected.price_usdc
                        || review.totalFeeUsdc !== args.amount) throw new Error('account_changed');
                    const checkDevice = async () => {
                        const device = await preparePlaybackDevice(accountId);
                        lifetime.throwIfAborted();
                        if (device.session_public_key !== review.playbackSession.session_public_key
                            || device.certificate_sha256 !== review.playbackSession.certificate_sha256) throw new Error('device_changed');
                        if (review.expiresAt <= Date.now()) throw new Error('review_expired');
                    };
                    await checkDevice();
                    const amount = BigInt(review.totalFeeUsdc), price = BigInt(review.priceUsdc);
                    if (!window.confirm(`${review.title}\nDosya: ${review.sourceBytes} bayt\nYükleme bedeli: ${amount / 1000000n}.${(amount % 1000000n).toString().padStart(6, '0')} test USDC\nBilet fiyatı: ${price / 1000000n}.${(price % 1000000n).toString().padStart(6, '0')} test USDC\nHesap: ${accountId}\nBu cihaz 30 gün yetkilendirilecek. Kimlik referansınızı içeren onay tokenı testnet zincirinde herkese açık ve kalıcı olacak.\nGoogle / Passkey ile onaylansın mı?`)) throw new Error('upload_cancelled');
                    const token = await authorize(review.delegate);
                    await checkAccount(accountId, lifetime); await checkDevice();
                    assertLivepeerUploadDraftReady(accountId, review.jobId);
                    const payloadHash = hexEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(review.delegate))));
                    lifetime.throwIfAborted();
                    // One job attempt survives lost submit responses. Status, never a new quote, resolves it.
                    const attempt = JSON.stringify({ accountId, jobId: review.jobId, payloadHash });
                    localStorage.setItem(key, attempt);
                    if (localStorage.getItem(key) !== attempt) throw new Error('livepeer_draft_write_failed');
                    await uploadApi({ action: 'submit', review: review.ticket, approvalToken: token }, lifetime);
                    for (let step = 0; step < 8; step++) {
                        const { payment } = await uploadStatus(lifetime);
                        checkPayment(payment, accountId, review.jobId, payloadHash);
                        if (payment.state === 'MPC_VERIFIED' && payment.upload) {
                            await checkAccount(accountId, lifetime); await checkDevice();
                            return { signedDelegateActions: [payment.upload.signedDelegateBase64] };
                        }
                        if (step < 7) await new Promise(resolve => setTimeout(resolve, 2000));
                        lifetime.throwIfAborted();
                    }
                    throw new Error('google_upload_completion_pending');
                } finally { unsubscribe(); }
            });
        },
    };
}
