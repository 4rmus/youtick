import type { AccountTicket } from '@/lib/market-read-model';
import type { LivepeerPublication } from '@/lib/livepeer-publication';
import type { WatchPosition } from '@/lib/watch-progress';

export type TicketState = 'watchable' | 'paused' | 'removed';

/** Same rule as ticketAccessView: sales pause keeps viewing, a takedown stops it. */
export function ticketState(availability: LivepeerPublication['availability']): TicketState {
    return availability === 'TAKEDOWN' ? 'removed' : availability === 'SALES_SUSPENDED' ? 'paused' : 'watchable';
}

export type ContinueItem = { ticket: AccountTicket & { publication: LivepeerPublication }; position: WatchPosition };

/** Watchable tickets with a resumable position on this device, most recently watched first. */
export function continueWatching(tickets: readonly AccountTicket[], positions: ReadonlyMap<string, WatchPosition>, limit = 3): ContinueItem[] {
    return tickets
        .filter((ticket): ticket is AccountTicket & { publication: LivepeerPublication } => ticket.publication !== null
            && ticketState(ticket.publication.availability) !== 'removed' && positions.has(ticket.publicationId))
        .map((ticket) => ({ ticket, position: positions.get(ticket.publicationId)! }))
        .sort((a, b) => b.position.updatedAt - a.position.updatedAt)
        .slice(0, limit);
}
