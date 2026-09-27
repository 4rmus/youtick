'use client';
import React from 'react';
import { Button } from './ui/button';
import { approveDeviceRecovery, continueDeviceRecovery, deviceStatus, prepareDeviceRecovery, type DeviceReview } from '@/lib/near-auth-device-client';
import { getDeviceSession, onDeviceSessionCleared } from '@/lib/device-session';
import { isMpcSettled, type MpcStatus } from '../../../protocol/paid-media-livepeer-v1/mpc-sponsor';
import type { LivepeerPlaybackInput } from '@/lib/livepeer-playback';
import type { PlayerLanguage } from '@/lib/player-copy';

export function NearAuthDeviceRecovery({ input, authorize, onActivated, language }: {
    input: LivepeerPlaybackInput; authorize: (bytes: number[]) => Promise<string>; onActivated: () => void; language: PlayerLanguage;
}) {
    const tr = language === 'tr';
    const [enabled, setEnabled] = React.useState(false), [busy, setBusy] = React.useState(false);
    const [payment, setPayment] = React.useState<MpcStatus | null>(null), [review, setReview] = React.useState<DeviceReview | null>(null);
    const [message, setMessage] = React.useState(''), [awaitingRecord, setAwaitingRecord] = React.useState(false);
    const controller = React.useRef<AbortController | null>(null), running = React.useRef(false);
    const pending = payment && !isMpcSettled(payment);
    const matches = payment?.purpose === 'device' && payment.accountId === input.accountId && payment.resourceId === input.jobId;
    React.useEffect(() => {
        const next = new AbortController(); controller.current = next;
        const unsubscribe = onDeviceSessionCleared(() => { next.abort(); setEnabled(false); setReview(null); });
        void deviceStatus(next.signal).then(value => { if (!next.signal.aborted) { setEnabled(value.enabled); setPayment(value.payment); } })
            .catch(() => { if (!next.signal.aborted) setEnabled(false); });
        return () => { next.abort(); unsubscribe(); };
    }, [input.accountId, input.jobId]);
    const run = async (action: 'prepare' | 'approve' | 'check' | 'continue') => {
        const signal = controller.current?.signal; if (!signal || signal.aborted || running.current) return;
        running.current = true; setBusy(true); setMessage('');
        try {
            if (action === 'prepare') {
                const prepared = await prepareDeviceRecovery(input, signal);
                signal.throwIfAborted(); setReview(prepared);
                if (!prepared) onActivated();
                return;
            }
            if (action === 'approve') {
                if (!review) return;
                const selected = review; setReview(null);
                const value = await approveDeviceRecovery(selected, authorize, signal, () => setAwaitingRecord(true));
                signal.throwIfAborted(); setPayment(value.payment); setAwaitingRecord(false);
            }
            for (let i = 0; i < (action === 'approve' ? 8 : 1); i++) {
                const value = await deviceStatus(signal); signal.throwIfAborted();
                setEnabled(value.enabled); setPayment(value.payment); if (value.payment) setAwaitingRecord(false);
                let current = value.payment;
                if (current?.purpose === 'device' && current.accountId === input.accountId && current.resourceId === input.jobId
                    && current.state === 'MPC_VERIFIED' && (action === 'approve' || action === 'continue')) {
                    current = (await continueDeviceRecovery(current, input, signal)).payment;
                    signal.throwIfAborted(); setPayment(current);
                }
                // Current playback access is separate from the historical operation result.
                if (await getDeviceSession(input.accountId)) { signal.throwIfAborted(); onActivated(); return; }
                signal.throwIfAborted();
                if (i < 7 && action === 'approve') await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (error) {
            if (!signal.aborted) setMessage(error instanceof Error && error.message === 'device_slots_full'
                ? tr ? 'Üç cihaz yuvası dolu. Bu adım başka bir cihazın erişimini kaldırmaz.' : 'All three device slots are full. This step does not replace another device.'
                : tr ? 'İşlem tamamlanamadı. Yeni onay vermeden önce durumu kontrol et.' : 'Could not complete verification. Check status before approving again.');
        } finally { running.current = false; if (!signal.aborted) setBusy(false); }
    };
    return <div className="mt-3 space-y-3 text-sm">
        <p>{tr ? 'Biletin korunur. Google / Passkey onayı bu cihazı 30 gün etkinleştirir. USDC alınmaz; hesabından 1 yoctoNEAR ve ağ gideri kullanılır. En fazla 3 cihaz; doluysa bu adım durur.'
            : 'Keep your ticket. Google / Passkey approval activates this device for 30 days. No USDC charge; your account pays 1 yoctoNEAR and network fees. Up to 3 devices; this step stops if full.'}</p>
        {!enabled && <p role="status">{tr ? 'Cihaz doğrulaması şu anda kapalı.' : 'Device verification is currently unavailable.'}</p>}
        {review ? <>
            <Button disabled={busy || !enabled} onClick={() => void run('approve')}>{tr ? 'Google / Passkey ile onayla' : 'Approve with Google / Passkey'}</Button>
            <Button disabled={busy} variant="outline" onClick={() => setReview(null)}>{tr ? 'İptal' : 'Cancel'}</Button>
        </> : pending ? <>
            <p role="status">{tr ? 'Önceki işlem bekliyor. Yeni işlem başlatma.' : 'An earlier operation is pending. Do not start another.'}</p>
            {matches && payment.state === 'MPC_VERIFIED' && <Button disabled={busy || !enabled} onClick={() => void run('continue')}>{tr ? 'Onaylanan cihaz işlemini tamamla' : 'Complete approved device verification'}</Button>}
        </> : <Button disabled={busy || !enabled || awaitingRecord} onClick={() => void run('prepare')}>{tr ? 'Bu cihazı doğrula' : 'Verify this device'}</Button>}
        <Button disabled={busy} variant="outline" onClick={() => void run('check')}>{tr ? 'Durumu kontrol et' : 'Check status'}</Button>
        {message && <p role="status">{message}</p>}
    </div>;
}
