// Reads V2 tickets from the Market contract (final state) and runs the recovery scan.
import { scanTickets } from '../ticket-keys/recovery';
import type { TicketKey } from '../ticket-keys/keys';

// `watched_in_escrow`: a crypto ticket watched while its money is still in escrow (refundable
// through youtick for 30 days). `watched`: a card ticket, or a testnet crypto ticket the earlier
// contract settled on watch.
export type TicketStatus = 'purchased' | 'watched' | 'watched_in_escrow' | 'refunded' | 'released' | 'voided';

export interface TicketDevice {
    session_public_key: string;
    certificate_sha256: string;
    authorized_at_ms: string;
    expires_at_ms: string;
}

export interface MarketTicket {
    ticket_id: string;
    ticket_public_key: string;
    publication_id: string;
    creator_id: string;
    rail: 'crypto' | 'card';
    status: TicketStatus;
    gross_usdc_micro: string;
    purchased_at_ms: string;
    device_epoch: number;
    devices: TicketDevice[];
}

export type ViewContract = <T>(contractId: string, method: string, args: Record<string, unknown>) => Promise<T>;

const STATUSES: TicketStatus[] = ['purchased', 'watched', 'watched_in_escrow', 'refunded', 'released', 'voided'];
const DECIMAL = /^(0|[1-9][0-9]{0,38})$/;

/** Accepts only the fields this page uses, in the shapes the contract returns. */
export function parseTicket(value: unknown, ticketId: string): MarketTicket | null {
    if (value === null) return null;
    const ticket = value as Partial<MarketTicket> | undefined;
    if (!ticket || typeof ticket !== 'object' || ticket.ticket_id !== ticketId
        || typeof ticket.publication_id !== 'string' || typeof ticket.creator_id !== 'string'
        || typeof ticket.ticket_public_key !== 'string' || (ticket.rail !== 'crypto' && ticket.rail !== 'card')
        || !STATUSES.includes(ticket.status as TicketStatus)
        || typeof ticket.gross_usdc_micro !== 'string' || !DECIMAL.test(ticket.gross_usdc_micro)
        || typeof ticket.purchased_at_ms !== 'string' || !DECIMAL.test(ticket.purchased_at_ms)
        || !Number.isSafeInteger(ticket.device_epoch) || !Array.isArray(ticket.devices)
        || !ticket.devices.every((device) => device && typeof device.session_public_key === 'string'
            && typeof device.expires_at_ms === 'string' && DECIMAL.test(device.expires_at_ms))) {
        throw new Error('invalid_ticket');
    }
    return ticket as MarketTicket;
}

export function readTicket(view: ViewContract, contractId: string, ticketId: string): Promise<MarketTicket | null> {
    return view<unknown>(contractId, 'get_ticket', { ticket_id: ticketId }).then((value) => parseTicket(value, ticketId));
}

export interface OwnedTicket {
    key: TicketKey;
    ticket: MarketTicket;
}

export async function findOwnedTickets(view: ViewContract, contractId: string, ckdKey: Uint8Array) {
    const result = await scanTickets(ckdKey, (ticketId) => readTicket(view, contractId, ticketId));
    return {
        tickets: result.tickets.map(({ key, ticket }) => ({ key, ticket })) as OwnedTicket[],
        nextIndex: result.nextIndex,
    };
}

export function deviceIsListed(ticket: MarketTicket, sessionPublicKey: string, nowMs: number): boolean {
    return ticket.devices.some((device) => device.session_public_key === sessionPublicKey && Number(device.expires_at_ms) > nowMs);
}

/** Statuses the Bridge plays: purchased (marked watched first), watched, watched_in_escrow and released. */
export function playableStatus(status: TicketStatus): boolean {
    return status === 'purchased' || status === 'watched' || status === 'watched_in_escrow' || status === 'released';
}

/** The contract's refund window: 30 days after purchase (takedowns are handled by youtick). */
export const REFUND_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** youtick's answer time. A request must leave it before the window closes and the escrow releases. */
export const REFUND_DECISION_MS = 72 * 60 * 60 * 1000;

/** A crypto ticket whose money is still in escrow, requested early enough for a decision in the window. */
export function refundRequestable(ticket: MarketTicket, nowMs: number): boolean {
    return ticket.rail === 'crypto' && (ticket.status === 'purchased' || ticket.status === 'watched_in_escrow')
        && Number(ticket.purchased_at_ms) + REFUND_WINDOW_MS - REFUND_DECISION_MS > nowMs;
}
