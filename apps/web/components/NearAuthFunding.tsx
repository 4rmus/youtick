'use client';

import { useRef, useState } from 'react';
import { Button } from './ui/button';
import { connectFundingWallet, fundingAttemptKey, readFundingReview, requestFundingApproval, type FundingReview } from '@/lib/near-auth-funding';

export function NearAuthFunding({ review, cspNonce, disabled, onBusyChange }: {
    review: FundingReview; cspNonce?: string; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
    const [sender, setSender] = useState<Awaited<ReturnType<typeof connectFundingWallet>> | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [attempted, setAttempted] = useState(() => Boolean(localStorage.getItem(fundingAttemptKey(review.implicitAccount))));
    const working = useRef(false);

    async function run(action: 'connect' | 'approve' | 'verify') {
        if (disabled || working.current) return;
        working.current = true; setBusy(true); onBusyChange?.(true); setMessage('');
        try {
            if (action === 'connect') {
                setConfirmed(false); setSender(null);
                setSender(await connectFundingWallet(cspNonce));
            } else if (action === 'approve') {
                if (!sender || !confirmed) return;
                await requestFundingApproval(sender.wallet, sender.accountId, review);
                setMessage('Cüzdandan yanıt alındı. Hesap durumunu doğrulayın; yeniden transfer yapmayın.');
            } else {
                const current = await readFundingReview();
                if (current.publicKey !== review.publicKey || current.implicitAccount !== review.implicitAccount) {
                    throw new Error('funding_review_changed');
                }
                setMessage(current.accounts.includes(review.implicitAccount)
                    ? 'Hesap ve Google kimliğinden türetilen anahtarın tam yetkisi NEAR üzerinde doğrulandı. Google ile imza atma henüz test edilmedi.'
                    : 'Hesap henüz doğrulanamadı. Bir işlem başlattıysanız önce o işlemin sonucunu kontrol edin; yeniden transfer yapmayın.');
            }
        } catch (error) {
            setMessage(error instanceof Error && error.message === 'session_expired'
                ? 'Oturum süresi doldu. Yeniden giriş yapıp hesap kontrolünü tekrarlayın.'
                : action === 'approve'
                    ? 'Onay tamamlanamadı veya kontroller değişti. Cüzdanda işlem başladıysa durumunu kontrol edin; yeniden transfer yapmayın.'
                    : 'Bu adım tamamlanamadı. Giriş ve cüzdan hesabını kontrol edin.');
        } finally {
            try { setAttempted(Boolean(localStorage.getItem(fundingAttemptKey(review.implicitAccount)))); }
            finally { working.current = false; setBusy(false); onBusyChange?.(false); }
        }
    }

    return <section className="space-y-3 rounded-xl border border-emerald-400/20 p-4" aria-busy={busy}>
        <h2 className="font-semibold">Test hesabını hazırla</h2>
        <p className="text-sm">Ağ: NEAR testnet · Gönderilecek: <strong>0,1 test NEAR</strong></p>
        <p className="text-sm">Bütçe sınırı: giderler dahil <strong>0,12 test NEAR</strong>. Ağ giderleri önceden kontrol edilir; cüzdanda toplam daha yüksekse onaylamayın.</p>
        <p className="text-xs text-zinc-400">Oluşturulacak hesap adresi</p>
        <p className="break-all font-mono text-xs">{review.implicitAccount}</p>
        <details className="text-xs"><summary>Google kimliğinden türetilen açık anahtar</summary><p className="break-all">{review.publicKey}</p></details>
        {!review.funding?.allowed && <p role="status" className="text-sm">{review.funding?.reason === 'account_exists'
            ? 'Mevcut bir hesap tespit edildi. Yeni hesap için transfer hazırlanmadı.'
            : 'Ağ giderleri bütçe içinde doğrulanamadı. Transfer hazırlanmadı.'}</p>}
        {review.funding?.allowed && !attempted && <>
            <Button variant="outline" disabled={busy} onClick={() => void run('connect')}>Meteor testnet cüzdanını seç</Button>
            {sender && <>
                <p className="break-all text-sm">Gönderen cüzdan: <strong>{sender.accountId}</strong></p>
                <p className="text-xs text-zinc-400">Bu cüzdan yalnız test bakiyesini gönderir; Google hesabınız değildir.</p>
                <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy}
                    onChange={(event) => setConfirmed(event.target.checked)} />Hedef adresi, göndereni ve 0,12 test NEAR toplam bütçeyi kontrol ettim.</label>
                <Button variant="near" disabled={busy || !confirmed} onClick={() => void run('approve')}>0,1 test NEAR için cüzdan onayını aç</Button>
            </>}
        </>}
        {attempted && <p className="text-sm">Bu adres için bir onay denemesi başlatıldı. Tekrar gönderim kapalı; önce işlem sonucunu kontrol edin.</p>}
        <Button variant="ghost" disabled={busy} onClick={() => void run('verify')}>Hesabın durumunu doğrula</Button>
        {message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}
        {busy && <p role="status" className="text-sm">Lütfen bekleyin…</p>}
    </section>;
}
