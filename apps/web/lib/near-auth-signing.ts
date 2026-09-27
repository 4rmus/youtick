import { NEAR_AUTH_TESTNET_RPC, NEAR_AUTH_SIGNING_CHECK_ERRORS, safeSigningDiagnostic } from './near-auth-lab';
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
export const reviewAttemptKey = (review: { accountId: string; purchase?: { marketContractId: string; publicationId: string } }) => review.purchase
    ? `youtick:auth-lab:ticket:testnet:${review.purchase.marketContractId}:${review.accountId}:${review.purchase.publicationId}` : signingAttemptKey(review.accountId);

export function signingPreparationMessage(reason: string): string {
    const code = reason.replace(/^signing_check_failed: prepare(?:-purchase)? \/ /, '');
    const messages: Record<string, string> = {
        signing_already_started: 'Bu bileti veya hesabın önceki işlemini etkileyen bir deneme kaydı var. Kayıt korundu; yeni ödeme başlatılmadı.',
        signing_storage_unavailable: 'Tarayıcı işlem kayıtlarını okuyamıyor. Yeni ödeme başlatılmadı; kayıtlar silinmedi.',
        account_required: 'Bu girişe bağlı kullanılabilir bir NEAR hesabı doğrulanamadı.',
        account_changed: 'Hesap veya imza anahtarı değişti. Giriş yaptığınız hesabı kontrol edin.',
        ticket_balance_required: 'Bilet için USDC bakiyesi veya USDC hesap kaydı yeterli değil.',
        budget_not_verified: 'Alıcı veya sponsor hesabının NEAR gider bütçesi doğrulanamadı.',
        ticket_first_device_only: 'Bu cihazın mevcut izleme kaydı doğrulanamadı. Cihaz kaydı değiştirilmedi.',
        ticket_not_available: 'Bu biletin satış, fiyat veya mevcut izleme hakkı kontrolü geçmedi.',
        ticket_disabled: 'Bu ortamda bilet satın alma yolu açık değil.',
        ticket_unavailable: 'Bilet bilgileri zincirden okunamadı.',
        invalid_ticket_device: 'Cihazın bu hesap ve siteyle eşleşmesi doğrulanamadı.',
        device_changed: 'Hazırlık sırasında cihaz anahtarı değişti.',
        device_session_storage_unavailable: 'Tarayıcı cihaz kaydına erişemiyor.',
        device_session_crypto_unavailable: 'Tarayıcı cihaz anahtarını hazırlayamadı.',
        device_session_cancelled: 'Oturum veya cihaz durumu değiştiği için hazırlık durdu.',
        wallet_unavailable: 'Sponsor cüzdanı doğrulanamadı.',
        invalid_sponsor: 'Sponsor hesabı geçerli değil.',
    };
    if (Object.hasOwn(messages, code)) return `${messages[code]} Kontrol kodu: ${code}`;
    if (NEAR_AUTH_SIGNING_CHECK_ERRORS.has(code)) return `Hazırlık tamamlanamadı. Yeni ödeme başlatılmadı. Kontrol kodu: ${code}`;
    return 'Hazırlık tamamlanamadı. Yeni ödeme başlatılmadı.';
}

export function hasBlockingSigningAttempt(review: Parameters<typeof reviewAttemptKey>[0]): boolean {
    return signingAttemptBlockReason(review) !== null;
}

export function signingAttemptBlockReason(review: Parameters<typeof reviewAttemptKey>[0]): 'signing_already_started' | 'signing_storage_unavailable' | null {
    try {
        if (localStorage.getItem(reviewAttemptKey(review)) !== null) return 'signing_already_started';
        if (!review.purchase) return null;
        const verified = (value: string | null) => {
            if (value === null) return true;
            try {
                const record = JSON.parse(value);
                return record?.state === 'verified' && typeof record.innerHash === 'string' && typeof record.outerHash === 'string'
                    && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(record.innerHash) && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(record.outerHash);
            } catch { return false; }
        };
        const prefix = `youtick:auth-lab:ticket:testnet:${review.purchase.marketContractId}:${review.accountId}`;
        // The 1-yocto self-transfer demo has its own lock; ticket records and fresh server nonce checks still apply.
        if (!verified(localStorage.getItem(prefix))) return 'signing_already_started';
        // ponytail: scan scoped ticket keys in localStorage; use an indexed store if purchase history makes this costly.
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(`${prefix}:`) && !verified(localStorage.getItem(key))) return 'signing_already_started';
        }
        return null;
    } catch { return 'signing_storage_unavailable'; }
}

export async function prepareGooglePurchase(publicationId: string, sponsor: string): Promise<SigningReview> {
    if (NEAR_NETWORK !== 'testnet' || !FEATURE_FLAGS.publicTestnetVideoV1 || !FEATURE_FLAGS.enablePlaybackAuthorizerV2) throw new Error('ticket_disabled');
    const response = await fetch('/api/auth-lab/account', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) await suspendDeviceSession();
    if (!response.ok) throw new Error(response.status === 401 ? 'session_expired' : 'account_required');
    const account = await response.json();
    if (typeof account.implicitAccount !== 'string' || !/^[a-f0-9]{64}$/.test(account.implicitAccount)
        || !Array.isArray(account.accounts) || !account.accounts.includes(account.implicitAccount)) throw new Error('account_required');
    const blocked = signingAttemptBlockReason({ accountId: account.implicitAccount,
        purchase: { marketContractId: NEAR_CONFIG.marketContractId, publicationId } });
    if (blocked) throw new Error(blocked);
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
        let detail = NEAR_AUTH_SIGNING_CHECK_ERRORS.has(result?.reason)
            && ['prepare', 'prepare-purchase', 'prepare-upload', 'authorize-upload', 'complete-upload'].includes(phase) ? `: ${phase} / ${result.reason}` : '';
        if (!detail && phase === 'authorize-upload') {
            const diagnostic = Object.entries(safeSigningDiagnostic(result?.diagnostic)).map(([key, value]) => `${key}=${value}`).join(', ');
            if (diagnostic) detail = `: ${phase} / ${diagnostic}`;
        }
        throw new Error(`signing_check_failed${detail}`);
    }
    return result as T;
}

export async function runGoogleSigning(wallet: NearWalletBase, review: SigningReview, token: string) {
    if (!navigator.locks || !isPinnedMeteorManifest(wallet.manifest)) throw new Error('wallet_unavailable');
    return navigator.locks.request('youtick-auth-lab-signing', { ifAvailable: true }, async (lock) => {
        const storageKey = reviewAttemptKey(review);
        if (!lock || hasBlockingSigningAttempt(review)) throw new Error('signing_already_started');
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
            if (hasBlockingSigningAttempt(review)) throw new Error('signing_already_started');
            // Cancelled/uncertain replies keep their record and require reconciliation, never a second payment.
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
