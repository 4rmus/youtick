'use client';

import { useRef, useState } from 'react';
import type { createNearAuthLab } from '@/lib/near-auth-lab';
import { connectFundingWallet } from '@/lib/near-auth-funding';
import { assertSigningDevice, hasBlockingSigningAttempt, prepareGooglePurchase, runGoogleSigning, signingApi, signingAttemptBlockReason, signingPreparationMessage, type SigningReview } from '@/lib/near-auth-signing';
import { NEAR_CONFIG } from '@/lib/constants';
import { Button } from './ui/button';

export function NearAuthSigning({ auth, disabled = false, onBusyChange, publicationId, accountId }: {
    auth: ReturnType<typeof createNearAuthLab>; disabled?: boolean; onBusyChange?: (value: boolean) => void; publicationId?: string; accountId?: string;
}) {
    const [sponsor, setSponsor] = useState<Awaited<ReturnType<typeof connectFundingWallet>> | null>(null);
    const [review, setReview] = useState<SigningReview | null>(null);
    const [consent, setConsent] = useState(false);
    const [token, setToken] = useState<string | null>(null);
    const [attempted, setAttempted] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const working = useRef(false);
    const recordBlock = publicationId && accountId ? signingAttemptBlockReason({ accountId,
        purchase: { marketContractId: NEAR_CONFIG.marketContractId, publicationId } }) : null;
    const attemptBlocked = attempted || Boolean(recordBlock);

    async function run(action: 'prepare' | 'google' | 'send') {
        if (working.current || disabled) return;
        working.current = true; setBusy(true); onBusyChange?.(true); setMessage('');
        try {
            if (action === 'prepare') {
                setReview(null); setSponsor(null); setToken(null); setConsent(false);
                const selected = await connectFundingWallet();
                const prepared = publicationId ? await prepareGooglePurchase(publicationId, selected.accountId)
                    : await signingApi<SigningReview>({ action: 'prepare', sponsor: selected.accountId });
                setSponsor(selected); setReview(prepared);
                setAttempted(hasBlockingSigningAttempt(prepared));
            } else if (action === 'google' && review && consent) {
                if (review.expiresAt <= Date.now()) throw new Error('review_expired');
                await assertSigningDevice(review);
                setToken(null);
                const approved = await auth.requestSigningAuthorization(review.transaction);
                await signingApi({ action: 'authorize', ticket: review.ticket, token: approved });
                setToken(approved);
                setMessage('Google onayı doğrulandı. Zincire henüz işlem gönderilmedi.');
            } else if (action === 'send' && sponsor && review && token && consent) {
                const approved = token; setToken(null);
                const result = await runGoogleSigning(sponsor.wallet, review, approved);
                setMessage(`${review.purchase ? 'Satın alma ve bu cihazın yetkisi doğrulandı. İzlemek için video hakkını kontrol edin.' : 'Google imzasıyla işlem kesinleşti.'} İşlem: ${result.transactionHash}`);
            }
        } catch (error) {
            setToken(null);
            const reason = error instanceof Error ? error.message : '';
            setMessage((['review_expired', 'authorization_expired'].includes(reason) || (action === 'google' && reason === 'signing_approval_timeout'))
                ? 'İnceleme veya Google onayının süresi doldu. Sponsor ödemesi başlatılmadı. İşlemi yeniden hazırlayın.'
                : action === 'google' && reason === 'signing_approval_cancelled'
                    ? 'Google onayı iptal edildi. Sponsor ödemesi başlatılmadı.'
                    : reason === 'unapproved_claims'
                        ? 'Onay tokenında bu deneme için izin verilmeyen alanlar var. Zincire gönderilmedi.'
                        : reason === 'session_expired'
                            ? 'Oturum süresi doldu. Yeniden giriş yapın.'
                            : action === 'prepare'
                                ? signingPreparationMessage(reason)
                            : action === 'send'
                                ? 'İşlem tamamlanamadı veya sonucu belirsiz. Yeniden imza/ödeme başlatmayın; mevcut işlemi kontrol edelim.'
                                : 'Hazırlık veya Google onayı tamamlanamadı. Hesap, bakiye, satış durumu, ilk cihaz koşulu veya onay süresi kontrollerinden biri geçmedi.');
        } finally {
            if (review) setAttempted(hasBlockingSigningAttempt(review));
            working.current = false; setBusy(false); onBusyChange?.(false);
        }
    }

    return <section className="space-y-3 rounded-xl border border-white/15 p-4" aria-busy={busy}>
        <h2 className="font-semibold">{publicationId ? 'Google ile test bileti satın al' : 'Google ile imza denemesi'}</h2>
        <p className="text-sm">{publicationId ? 'Tek bilet ödemesiyle bu cihaz için 30 günlük izleme yetkisi hazırlanır. İlk cihaz veya mevcut geçerli cihaz kullanılabilir; otomatik bakiye yüklenmez.' : 'Google hesabı kendisine 1 yoctoNEAR (NEAR’ın en küçük birimi) gönderecek.'} Sponsor cüzdanı yalnız imza isteğinin ücretini karşılar.</p>
        <p className="text-sm">Bütçe: sponsordan en fazla 0,35 test NEAR; Google hesabından ücret dahil en fazla {publicationId ? '0,12' : '0,002'} test NEAR.{publicationId ? ' Bilet bedeli ayrıca test USDC olarak gösterilir.' : ''} Son tutarı cüzdanda da kontrol edin; fazlaysa reddedin.</p>
        <Button variant="outline" disabled={busy || disabled || attemptBlocked} onClick={() => void run('prepare')}>Sponsor cüzdanını seç ve işlemi hazırla</Button>
        {review && <div className="space-y-3 text-sm">
            <p className="break-all">Sponsor: {review.sponsor}</p>
            <p className="break-all">Google hesabı{review.purchase ? '' : ' · gönderen ve alıcı'}: {review.accountId}</p>
            {review.purchase && <>
                <p>{review.purchase.title}</p>
                <p>Bilet bedeli: {(BigInt(review.purchase.priceUsdc) / 1_000_000n).toString()}.{(BigInt(review.purchase.priceUsdc) % 1_000_000n).toString().padStart(6, '0')} test USDC</p>
                <p className="break-all">Video: {review.purchase.publicationId}</p>
                <p className="break-all">Satış sözleşmesi: {review.purchase.marketContractId}</p>
                <p className="break-all">Ödeme sözleşmesi: {review.purchase.usdcContractId}</p>
            </>}
            <p>İnceleme 5 dakika geçerlidir. Bu süre dolarsa imza başlamadan yeniden hazırlayın.</p>
            <p className="text-amber-200">Bu denemede kimlik referansınızı içeren onay tokenı ve işlem bilgisi testnet zincirinde herkese açık ve kalıcı olacaktır.</p>
            <label className="flex gap-2"><input type="checkbox" checked={consent} disabled={busy || disabled || attemptBlocked}
                onChange={(event) => { setConsent(event.target.checked); setToken(null); }} />İşlemi,{review.purchase ? ' bilet bedelini, bu cihazın yetkilendirilmesini,' : ''} iki bütçeyi ve kimlik referansımın zincirde yayımlanmasını kabul ediyorum.</label>
            {!attemptBlocked && <>
                <Button variant="outline" disabled={busy || disabled || !consent} onClick={() => void run('google')}>Google ile bu işleme onay ver</Button>
                <Button variant="near" disabled={busy || disabled || !token || !consent} onClick={() => void run('send')}>Sponsor onayını aç ve imzalı testi gönder</Button>
            </>}
        </div>}
        {attemptBlocked && <p role="status" className="text-sm">{signingPreparationMessage(recordBlock || 'signing_already_started')}</p>}
        {busy && <p role="status">Lütfen bekleyin…</p>}
        {message && <p role="status" aria-live="polite" className="break-all text-sm">{message}</p>}
    </section>;
}
