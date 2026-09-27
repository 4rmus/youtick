import { isMpcSettled, type MpcStatus } from '../../../protocol/paid-media-livepeer-v1/mpc-sponsor';
import { assertSigningDevice, signingAttemptBlockReason, type SigningReview } from './near-auth-signing';
import { preparePlaybackDevice } from './device-session';
import { NEAR_CONFIG } from './constants';

export async function ticketApi<T>(body: object, signal?: AbortSignal): Promise<T> {
    const response = await fetch('/api/auth/ticket', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const value = await response.json();
    if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : 'ticket_check_failed');
    return value as T;
}
export function ticketStatus(signal?: AbortSignal) {
    return ticketApi<{ enabled: boolean; payment: MpcStatus | null }>({ action: 'status', operationId: '' }, signal);
}
export async function prepareTicket(accountId: string, publicationId: string, expectedPrice: string, signal: AbortSignal) {
    const current = await ticketStatus(signal);
    if (!current.enabled || current.payment && !isMpcSettled(current.payment)) throw new Error('mpc_pending');
    const blocked = signingAttemptBlockReason({ accountId, purchase: { marketContractId: NEAR_CONFIG.marketContractId, publicationId } });
    if (blocked) throw new Error(blocked);
    const playbackSession = await preparePlaybackDevice(accountId);
    signal.throwIfAborted();
    const { review } = await ticketApi<{ review: SigningReview }>({ action: 'prepare', publicationId, playbackSession, expectedPrice }, signal);
    if (review.accountId !== accountId || review.purchase?.publicationId !== publicationId || review.purchase.priceUsdc !== expectedPrice) throw new Error('account_changed');
    await assertSigningDevice(review); signal.throwIfAborted();
    return review;
}
export async function approveTicket(review: SigningReview, authorize: (bytes: number[]) => Promise<string>, signal: AbortSignal, onSubmit: () => void = () => {}) {
    await assertSigningDevice(review); signal.throwIfAborted();
    const token = await authorize(review.transaction);
    signal.throwIfAborted(); await assertSigningDevice(review); signal.throwIfAborted();
    onSubmit();
    return ticketApi<{ payment: MpcStatus }>({ action: 'submit', review: review.ticket, approvalToken: token }, signal);
}
// Status never sends funds. Only an explicit continuation of the user's approved purchase calls execute.
export async function continueTicket(payment: MpcStatus, accountId: string, publicationId: string, signal: AbortSignal) {
    if (payment.accountId !== accountId || payment.purpose !== 'ticket' || payment.resourceId !== publicationId) throw new Error('account_changed');
    signal.throwIfAborted();
    if (payment.state === 'MPC_VERIFIED') return ticketApi<{ payment: MpcStatus }>({ action: 'execute', operationId: payment.operationId }, signal);
    return { payment };
}
