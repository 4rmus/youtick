'use client';
import React from 'react';
import Link from 'next/link';
import { Button } from './ui/button';
import { formatUsdc } from '@/lib/livepeer-publication';
import { approveTicket, continueTicket, prepareTicket, ticketStatus } from '@/lib/near-auth-ticket-client';
import type { SigningReview } from '@/lib/near-auth-signing';
import { isMpcSettled, type MpcStatus } from '../../../protocol/paid-media-livepeer-v1/mpc-sponsor';

export function NearAuthTicketPayment({ accountId, publicationId, price, title, disabled, authorize, onSettled }: {
    accountId: string; publicationId: string; price: string; title: string; disabled: boolean;
    authorize?: (bytes: number[]) => Promise<string>; onSettled: (operationId: string, refresh?: boolean) => void;
}) {
    const [enabled, setEnabled] = React.useState(false), [busy, setBusy] = React.useState(false);
    const [awaitingRecord, setAwaitingRecord] = React.useState(false);
    const [payment, setPayment] = React.useState<MpcStatus | null>(null);
    const [review, setReview] = React.useState<SigningReview | null>(null), [message, setMessage] = React.useState('Checking payment availability…');
    const controller = React.useRef<AbortController | null>(null);
    const settled = React.useRef(onSettled); settled.current = onSettled;
    React.useEffect(() => {
        const next = new AbortController(); controller.current = next;
        void ticketStatus(next.signal).then(value => {
            if (next.signal.aborted) return;
            setEnabled(value.enabled); setPayment(value.payment);
            setMessage(value.enabled ? '' : 'Google / Passkey payments are not available yet.');
            if (value.payment?.state === 'TICKET_SETTLED' && value.payment.accountId === accountId && value.payment.resourceId === publicationId) settled.current(value.payment.operationId);
        }).catch(() => { if (!next.signal.aborted) setMessage('Payment status could not be checked. Try checking again.'); });
        return () => next.abort();
    }, [accountId, publicationId]);
    const pending = payment && !isMpcSettled(payment);
    const matches = payment?.accountId === accountId && payment.purpose === 'ticket' && payment.resourceId === publicationId;
    const run = async (action: 'prepare' | 'approve' | 'check' | 'continue') => {
        const signal = controller.current?.signal; if (!signal || signal.aborted || busy) return;
        setBusy(true); setMessage('');
        try {
            if (action === 'prepare') { setReview(await prepareTicket(accountId, publicationId, price, signal)); return; }
            if (action === 'approve') {
                if (!review || !authorize) return;
                const selected = review; setReview(null);
                const reply = await approveTicket(selected, authorize, signal, () => setAwaitingRecord(true));
                signal.throwIfAborted(); setPayment(reply.payment); setAwaitingRecord(false);
            }
            // Poll only while completing a user-started approval; page load/check are read-only.
            for (let step = 0; step < (action === 'approve' ? 8 : 1); step++) {
                signal.throwIfAborted();
                const value = await ticketStatus(signal);
                signal.throwIfAborted(); setEnabled(value.enabled); setPayment(value.payment);
                if (value.payment) setAwaitingRecord(false);
                let current = value.payment;
                if (current?.state === 'MPC_VERIFIED' && ['approve', 'continue'].includes(action)) {
                    current = (await continueTicket(current, accountId, publicationId, signal)).payment;
                    signal.throwIfAborted(); setPayment(current);
                }
                if (current?.state === 'TICKET_SETTLED' && current.accountId === accountId && current.resourceId === publicationId) {
                    settled.current(current.operationId, action === 'check'); return;
                }
                if (step < 7 && action === 'approve') await new Promise(resolve => setTimeout(resolve, 2000));
            }
            setMessage('Status checked. If your payment is still pending, check again shortly.');
        } catch {
            if (!signal.aborted) setMessage('Payment could not be completed. Check its status before starting another payment.');
        } finally { if (!signal.aborted) setBusy(false); }
    };
    return <div className="mt-4 space-y-3">
        {review ? <>
            <p>{title} · {formatUsdc(review.purchase!.priceUsdc)} USDC</p>
            <p className="break-all text-xs text-zinc-400">Account: {accountId}</p>
            <Button disabled={disabled || busy || !authorize} onClick={() => void run('approve')}>Approve with Google / Passkey</Button>
            <Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Cancel</Button>
        </> : pending ? <>
            <p role="status">{payment.purpose === 'device' ? 'Device verification is pending. Check it before starting a purchase.' : payment.state === 'MPC_VERIFIED' ? 'Approval received. Complete your purchase.' : 'Your payment is being checked. Please do not pay again.'}</p>
            {matches && payment.state === 'MPC_VERIFIED' && <Button disabled={!enabled || disabled || busy} onClick={() => void run('continue')}>Complete purchase</Button>}
            {!matches && payment.purpose === 'device' && <Link href={`/watch?job=${encodeURIComponent(payment.resourceId)}`} className="underline">Open pending device verification</Link>}
            {!matches && payment.purpose === 'ticket' && <Link href={`/watch?job=${encodeURIComponent(payment.resourceId)}`} className="underline">Open the video for this payment</Link>}
        </> : matches && payment?.state === 'TICKET_SETTLED' ? <p role="status">Purchase confirmed. Checking video access…</p> : <Button disabled={!enabled || disabled || busy || !authorize || awaitingRecord} onClick={() => void run('prepare')}>Buy for {formatUsdc(price)} USDC</Button>}
        <Button variant="outline" disabled={busy} onClick={() => void run('check')}>{busy ? 'Checking…' : 'Check payment status'}</Button>
        {message && <p role="status" className="text-sm text-zinc-300">{message}</p>}
    </div>;
}
