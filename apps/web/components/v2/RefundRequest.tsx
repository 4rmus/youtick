'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildRefundArgs, refundRequestExpiry, type MarketBinding } from '@/lib/ticket-keys/messages';
import type { TicketKey } from '@/lib/ticket-keys/keys';
import { refundErrorMessage, submitRefundRequest, type RefundReceipt } from '@/lib/v2/refunds';

export const REFUND_REQUEST_ADDRESS = 'contact@youtick.net';

/** The e-mail fallback when the request inbox cannot be reached. The signed arguments only allow a refund to the buyer's account. */
export function refundRequestMailto(input: { ticketId: string; reason: string; args: ReturnType<typeof buildRefundArgs> }): string {
    const subject = `Refund request ${input.ticketId.slice(0, 8)}`;
    const body = [
        'What went wrong:',
        input.reason.trim(),
        '',
        'Signed refund request (do not edit):',
        JSON.stringify(input.args),
    ].join('\n');
    return `mailto:${REFUND_REQUEST_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Refunds follow the card provider's rule: technical problems, content not as described or a
 * takedown, not a change of mind. The ticket key signs `refund_ticket` to the buyer's own account,
 * so youtick cannot redirect the money; the request goes to the payment service inbox and youtick
 * answers within 72 hours. Without the inbox, the signed request is sent by e-mail.
 */
export function RefundRequest(props: { binding: MarketBinding; ticket: TicketKey; accountId: string; paymentServiceUrl: string | null }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const [receipt, setReceipt] = useState<RefundReceipt | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [mailto, setMailto] = useState<string | null>(null);

    if (!open) {
        return <Button variant="outline" className="min-h-11" onClick={() => setOpen(true)}>Request a refund</Button>;
    }

    if (state === 'sent' && receipt) {
        return <p className="rounded border border-white/15 p-4 text-sm text-white/80" role="status">
            Your refund request was received. We will answer by {new Date(receipt.answerByMs).toLocaleString()}. An approved refund
            returns the full price to your youtick balance.
        </p>;
    }

    async function send() {
        const args = buildRefundArgs({
            binding: props.binding,
            ticket: props.ticket,
            refundTo: props.accountId,
            expiresAtMs: refundRequestExpiry(Date.now()),
        });
        const fallback = refundRequestMailto({ ticketId: props.ticket.ticketId, reason, args });
        if (!props.paymentServiceUrl) {
            setMailto(fallback);
            return;
        }
        setState('sending');
        setError(null);
        try {
            setReceipt(await submitRefundRequest(props.paymentServiceUrl, args, reason));
            setState('sent');
        } catch (cause) {
            const code = cause instanceof Error ? cause.message : '';
            setError(refundErrorMessage(code));
            setMailto(['refund_request_failed', 'refund_service_unreachable', 'internal_error', 'refund_inbox_unavailable'].includes(code) ? fallback : null);
            setState('error');
        }
    }

    return <div className="space-y-3 rounded border border-white/15 p-4">
        <p className="text-sm text-white/80">
            Refunds are for technical problems: the video does not play, keeps failing, or is not as described.
            A change of mind is not refunded. We reply within 72 hours, and an approved refund returns the full
            price to your youtick balance.
        </p>
        <label className="block space-y-1 text-sm">
            <span>What went wrong?</span>
            <textarea className="min-h-24 w-full rounded border border-white/20 bg-transparent p-2" value={reason}
                maxLength={1000} onChange={(event) => { setReason(event.target.value); setMailto(null); setError(null); }} />
        </label>
        {!mailto && <Button className="min-h-11 gap-2" disabled={reason.trim().length < 10 || state === 'sending'} onClick={() => void send()}>
            {state === 'sending' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Send the request
        </Button>}
        {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
        {mailto && <>
            <Button asChild className="min-h-11"><a href={mailto}>Send the request by e-mail</a></Button>
            <p className="text-xs text-white/60">
                Your e-mail app opens with the request to {REFUND_REQUEST_ADDRESS}. The signed part only allows a refund to
                your own account and expires in 7 days.
            </p>
        </>}
    </div>;
}
