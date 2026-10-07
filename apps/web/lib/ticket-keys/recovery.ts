// Recovery scan (protocol/youtick-market-v2 "Ticket keys", step 4): derive n = 0, 1, 2, … and read
// `get_ticket`; stop after 20 consecutive missing tickets. The contract never deletes a ticket, so
// refunded, voided and released tickets still mark their index as used.
import { deriveRootKey, ticketKey, type TicketKey } from './keys';

export const RECOVERY_GAP = 20;

export interface RecoveredTicket<T> {
    key: TicketKey;
    ticket: T;
}

export interface RecoveryResult<T> {
    tickets: RecoveredTicket<T>[];
    /**
     * The first index after the last ticket found. It ignores purchases still in flight, so the
     * caller must reserve an index locally and retry with `n + 1` after a collision.
     */
    nextIndex: number;
}

/**
 * Scans one CKD key. `getTicket` must return `null` only for a ticket the contract does not have
 * and throw on RPC errors, so a transient failure never looks like a gap.
 */
export async function scanTickets<T>(
    ckdKey: Uint8Array,
    getTicket: (ticketId: string) => Promise<T | null>,
    options: { gap?: number; maxIndex?: number } = {},
): Promise<RecoveryResult<T>> {
    const gap = options.gap ?? RECOVERY_GAP;
    const maxIndex = options.maxIndex ?? 10_000;
    if (!Number.isInteger(gap) || gap < 1) throw new Error('invalid_recovery_gap');
    const root = deriveRootKey(ckdKey);
    const tickets: RecoveredTicket<T>[] = [];
    let nextIndex = 0;
    for (let index = 0; index < nextIndex + gap; index += 1) {
        if (index > maxIndex) throw new Error('recovery_scan_limit');
        const key = ticketKey(root, index);
        const ticket = await getTicket(key.ticketId);
        if (ticket === undefined) throw new Error('invalid_ticket_lookup');
        if (ticket !== null) {
            tickets.push({ key, ticket });
            nextIndex = index + 1;
        }
    }
    return { tickets, nextIndex };
}
