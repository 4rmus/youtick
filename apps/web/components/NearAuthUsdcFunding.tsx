'use client';

import { useRef, useState } from 'react';
import { connectFundingWallet } from '@/lib/near-auth-funding';
import { signingApi } from '@/lib/near-auth-signing';
import { requestUsdcFunding, usdcAttemptKey, type UsdcReview } from '@/lib/near-auth-usdc';
import { Button } from './ui/button';

function amount(value: string, decimals: number) {
    const scale = 10n ** BigInt(decimals); const n = BigInt(value);
    const fraction = (n % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${n / scale}${fraction ? `,${fraction}` : ''}`;
}

export function NearAuthUsdcFunding({ disabled, onBusyChange }: { disabled: boolean; onBusyChange: (busy: boolean) => void }) {
    const [sender, setSender] = useState<Awaited<ReturnType<typeof connectFundingWallet>> | null>(null);
    const [review, setReview] = useState<UsdcReview | null>(null);
    const [consent, setConsent] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const working = useRef(false);

    async function run(action: 'prepare' | 'send' | 'check') {
        if (disabled || working.current) return;
        working.current = true; setBusy(true); onBusyChange(true); setMessage('');
        let reviewedAccount = review?.accountId;
        try {
            if (action === 'send') {
                if (!sender || !review || !consent) return;
                const result = await requestUsdcFunding(sender.wallet, review);
                setAttempted(true); setConsent(false);
                setReview({ ...review, ready: true, allowed: false, registered: true, recipientBalance: result.balanceMicro });
                setMessage(`Kayıt ve aktarım kesinleşti. Aynı video taslağında “Check payment options” ile devam edebilirsin. İşlem: ${result.transactionHash}`);
            } else {
                setConsent(false);
                const selected = action === 'prepare' ? await connectFundingWallet() : sender;
                if (!selected) return;
                setReview(null); setSender(selected);
                const current = await signingApi<UsdcReview>({ action: 'prepare-usdc', sender: selected.accountId });
                reviewedAccount = current.accountId;
                setReview(current); setAttempted(Boolean(localStorage.getItem(usdcAttemptKey(current.accountId))));
                if (current.ready) setMessage('USDC kaydı ve yeterli test bakiyesi doğrulandı. Yeni aktarım gerekmez; aynı video taslağında ödeme seçeneklerini tekrar kontrol edebilirsin.');
            }
        } catch (error) {
            setConsent(false);
            setMessage(error instanceof Error && error.message === 'session_expired' ? 'Google oturumunun süresi doldu. Yeniden giriş yapın.'
                : action === 'send' ? 'Aktarım tamamlanamadı veya sonucu belirsiz. Yeniden göndermeyin; mevcut işlem ve bakiyeyi kontrol edin.'
                    : 'Hesap ve ücret kontrolü tamamlanamadı. Transfer hazırlanmadı.');
        } finally {
            try {
                if (reviewedAccount) setAttempted(Boolean(localStorage.getItem(usdcAttemptKey(reviewedAccount))));
            } finally { working.current = false; setBusy(false); onBusyChange(false); }
        }
    }

    return <section className="space-y-3 rounded-xl border border-emerald-400/20 p-4" aria-busy={busy}>
        <h3 className="font-semibold">Test bakiyesini hazırla</h3>
        <p className="text-sm">Seçeceğin cüzdandan Google hesabına 0,60 test USDC aktarılır. USDC kaydı yoksa aynı işlemde hazırlanır. Bu adım video yüklemez; imzayı sen verirsin.</p>
        <Button variant="outline" disabled={disabled || busy} onClick={() => void run('prepare')}>Gönderen cüzdanı seç ve bakiyeyi kontrol et</Button>
        {review && <div className="space-y-3 text-sm">
            <p className="break-all">Gönderen: {review.sender}</p>
            <p className="break-all">Hedef Google hesabı: {review.accountId}</p>
            <p>Google hesabındaki bakiye: {amount(review.recipientBalance, 6)} test USDC.</p>
            {!review.ready && <>
                <p>Gönderilecek: <strong>0,60 test USDC</strong>. Kayıt depozitosu: {amount(review.storageDepositYocto, 24)} test NEAR{review.registered ? ' (kayıt zaten var)' : ''}.</p>
                <p>Gönderenin NEAR gider sınırı, kayıt dahil: <strong>0,08 test NEAR</strong>. Cüzdanda daha yüksek tutar görünürse reddet. Bu, sonraki yükleme/imza giderinden ayrıdır.</p>
                {!review.allowed && <p role="status">{review.reason === 'sender_storage_required' ? 'Gönderen cüzdanın bu test USDC için kaydı yok.'
                    : review.reason === 'sender_usdc_required' ? 'Gönderen cüzdanda en az 0,60 test USDC gerekiyor.'
                        : 'Gönderenin kullanılabilir NEAR bakiyesi gider sınırını karşılamıyor.'}</p>}
                {review.allowed && !attempted && <>
                    <p>İnceleme 5 dakika geçerlidir. İmzadan önce hesap ve ücretler yeniden kontrol edilir.</p>
                    <label className="flex gap-2"><input type="checkbox" checked={consent} disabled={disabled || busy}
                        onChange={(event) => setConsent(event.target.checked)} />Göndereni, hedefi, 0,60 test USDC tutarını ve 0,08 test NEAR gider sınırını kontrol ettim.</label>
                    <Button variant="near" disabled={disabled || busy || !consent} onClick={() => void run('send')}>Cüzdan onayını aç</Button>
                </>}
            </>}
            <details className="break-all"><summary>Kontrol ayrıntıları</summary>
                <p>Ağ: NEAR testnet</p><p>Token sözleşmesi: {review.tokenContractId}</p>
                <p>Gönderenin USDC bakiyesi: {amount(review.senderBalance, 6)}</p><p>NEAR blok: {review.blockHeight}</p>
            </details>
            {attempted && !review.ready && <p>Bu hesap için aktarım denemesi başladı. Tekrar gönderim kapalı; önce mevcut sonucu kontrol et.</p>}
        </div>}
        {sender && <Button variant="ghost" disabled={disabled || busy} onClick={() => void run('check')}>Bakiyeyi tekrar kontrol et</Button>}
        {message && <p role="status" aria-live="polite" className="break-all text-sm">{message}</p>}
        {busy && <p role="status">Hesap ve işlem durumu kontrol ediliyor…</p>}
    </section>;
}
