// Sends a buyer's refund request to the payment service inbox (workers/payment-service, "Refund
// requests"). The ticket key has already signed `refund_ticket`; the service checks the request
// against Market V2 and youtick answers within 72 hours.
import type { buildRefundArgs } from '../ticket-keys/messages';

export type RefundArgs = ReturnType<typeof buildRefundArgs>;

export interface RefundReceipt {
    requestId: string;
    answerByMs: number;
}

const ERRORS: Record<string, string> = {
    refund_request_pending: 'A refund request for this ticket is already waiting for an answer.',
    ticket_not_refundable: 'This ticket can no longer be refunded.',
    refund_window_closed: 'The 30-day refund period for this ticket has ended.',
    invalid_reason: 'Please describe the problem in 10 to 1,000 characters.',
    rate_limited: 'Too many requests. Please try again in a minute.',
};

export function refundErrorMessage(code: string): string {
    return ERRORS[code] ?? 'The request could not be sent. You can send it by e-mail instead.';
}

export async function submitRefundRequest(paymentServiceUrl: string, args: RefundArgs, reason: string,
    fetcher: typeof fetch = (...input) => fetch(...input)): Promise<RefundReceipt> {
    let response: Response;
    try {
        response = await fetcher(`${paymentServiceUrl}/v1/refund-requests`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...args, reason: reason.trim() }),
        });
    } catch {
        throw new Error('refund_service_unreachable');
    }
    const body = await response.json().catch(() => ({})) as { request_id?: string; answer_by_ms?: string; error?: string };
    if (response.status !== 201 || typeof body.request_id !== 'string' || !/^[0-9a-f]{32}$/.test(body.request_id)
        || !/^[0-9]{1,16}$/.test(body.answer_by_ms ?? '')) {
        throw new Error(typeof body.error === 'string' ? body.error : 'refund_request_failed');
    }
    return { requestId: body.request_id, answerByMs: Number(body.answer_by_ms) };
}
