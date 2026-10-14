'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { buildRefundArgs, refundRequestExpiry, type MarketBinding } from '@/lib/ticket-keys/messages';
import type { TicketKey } from '@/lib/ticket-keys/keys';

export const REFUND_REQUEST_ADDRESS = 'contact@youtick.net';

/** The e-mail a buyer sends to request a refund. The signed arguments let youtick refund only to the buyer's account. */
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
 * takedown, not a change of mind. youtick decides within 72 hours and submits `refund_ticket`;
 * the ticket key fixes the recipient to the buyer's own account, so youtick cannot redirect it.
 */
export function RefundRequest(props: { binding: MarketBinding; ticket: TicketKey; accountId: string }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [href, setHref] = useState<string | null>(null);

    if (!open) {
        return <Button variant="outline" className="min-h-11" onClick={() => setOpen(true)}>Request a refund</Button>;
    }

    function prepare() {
        const args = buildRefundArgs({
            binding: props.binding,
            ticket: props.ticket,
            refundTo: props.accountId,
            expiresAtMs: refundRequestExpiry(Date.now()),
        });
        setHref(refundRequestMailto({ ticketId: props.ticket.ticketId, reason, args }));
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
                maxLength={1000} onChange={(event) => { setReason(event.target.value); setHref(null); }} />
        </label>
        {href
            ? <Button asChild className="min-h-11"><a href={href}>Send the request by e-mail</a></Button>
            : <Button className="min-h-11" disabled={reason.trim().length < 10} onClick={prepare}>Prepare the request</Button>}
        {href && <p className="text-xs text-white/60">
            Your e-mail app opens with the request to {REFUND_REQUEST_ADDRESS}. The signed part only allows a refund to
            your own account and expires in 7 days.
        </p>}
    </div>;
}
