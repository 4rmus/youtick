// Card path (roadmap E8): applies verified card provider events to the order book. Only an event a
// provider adapter has authenticated reaches this module; a browser redirect never does. Each
// transition is a conditional update, so a redelivered or reordered event cannot move an order
// backwards, and each event is stored once under the provider's own id.

export type CardEventKind = 'purchase' | 'refund' | 'chargeback_opened' | 'chargeback_lost' | 'chargeback_won';

/** A provider event after authentication, in youtick's terms (src/card-provider.ts). */
export interface CardEvent {
    providerEventId: string;
    kind: CardEventKind;
    providerOrderId: string;
    /** What the provider charged or returned, in minor units; positive. */
    amountMinor: number;
    currency: string;
    occurredAtMs: number;
}

export type EventOutcome = 'applied' | 'recorded' | 'duplicate' | 'unknown_order' | 'amount_mismatch' | 'order_not_open' | 'already_closed';

interface OrderRow {
    order_id: string;
    publication_id: string;
    creator_id: string;
    gross_minor: number;
    currency: string;
    status: string;
    pending_tx_hash: string | null;
}

const EVENT_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function validCardEvent(event: CardEvent): boolean {
    return EVENT_ID.test(event.providerEventId) && EVENT_ID.test(event.providerOrderId)
        && ['purchase', 'refund', 'chargeback_opened', 'chargeback_lost', 'chargeback_won'].includes(event.kind)
        && Number.isSafeInteger(event.amountMinor) && event.amountMinor > 0 && /^[A-Z]{3}$/.test(event.currency)
        && Number.isSafeInteger(event.occurredAtMs) && event.occurredAtMs > 0;
}

async function transition(db: D1Database, orderId: string, from: string[], fields: Record<string, string | number | null>, nowMs: number,
    also: 'pending_tx_hash IS NULL' | null = null): Promise<boolean> {
    const names = Object.keys(fields);
    const result = await db.prepare(`UPDATE card_orders SET ${names.map((name) => `${name} = ?`).join(', ')}, updated_at_ms = ?
        WHERE order_id = ? AND status IN (${from.map(() => '?').join(', ')})${also ? ` AND ${also}` : ''}`)
        .bind(...names.map((name) => fields[name]), nowMs, orderId, ...from).run();
    return Boolean(result.meta?.changes);
}

async function ledger(db: D1Database, provider: string, event: CardEvent, order: OrderRow, kind: 'sale' | 'refund' | 'chargeback'): Promise<void> {
    await db.prepare(`INSERT OR IGNORE INTO card_ledger (provider, provider_event_id, order_id, kind, amount_minor, currency, publication_id,
        creator_id, occurred_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(provider, event.providerEventId, order.order_id, kind, kind === 'sale' ? event.amountMinor : -event.amountMinor,
            event.currency, order.publication_id, order.creator_id, event.occurredAtMs).run();
}

/** Refund or lost chargeback: before any send the order is cancelled; after one the ticket must be voided. */
async function close(db: D1Database, order: OrderRow, reason: 'refund' | 'chargeback', nowMs: number): Promise<boolean> {
    if (order.status === 'created' || order.status === 'awaiting_payment' || (order.status === 'paid' && !order.pending_tx_hash)) {
        // `pending_tx_hash IS NULL` in the update itself: the operator may store a send between the
        // read above and this write, and then the order must be voided, not cancelled.
        if (await transition(db, order.order_id, [order.status], { status: 'cancelled', void_reason: reason }, nowMs, 'pending_tx_hash IS NULL')) return true;
    }
    // A send may be in flight or done: the operator voids whatever lands (src/card-operator.ts).
    return transition(db, order.order_id, ['paid', 'issued'], { status: 'void_pending', void_reason: reason, attempts: 0, last_error: null }, nowMs);
}

export async function applyCardEvent(db: D1Database, provider: string, event: CardEvent, nowMs: number): Promise<EventOutcome> {
    if (!validCardEvent(event)) throw new Error('invalid_event');
    const seen = await db.prepare(`SELECT outcome FROM card_events WHERE provider = ? AND provider_event_id = ?`)
        .bind(provider, event.providerEventId).first();
    if (seen) return 'duplicate';
    const order = await db.prepare(`SELECT order_id, publication_id, creator_id, gross_minor, currency, status, pending_tx_hash FROM card_orders
        WHERE provider = ? AND provider_order_id = ?`).bind(provider, event.providerOrderId).first<OrderRow>();
    let outcome: EventOutcome;
    if (!order) {
        outcome = 'unknown_order';
    } else if (event.kind === 'purchase') {
        if (event.amountMinor !== order.gross_minor || event.currency !== order.currency) {
            // Never issue a ticket for a different amount than the ticket key signed.
            outcome = 'amount_mismatch';
        } else {
            await ledger(db, provider, event, order, 'sale');
            outcome = await transition(db, order.order_id, ['created', 'awaiting_payment'], { status: 'paid', paid_at_ms: event.occurredAtMs }, nowMs)
                ? 'applied' : 'order_not_open';
        }
    } else if (event.kind === 'refund' || event.kind === 'chargeback_lost') {
        await ledger(db, provider, event, order, event.kind === 'refund' ? 'refund' : 'chargeback');
        outcome = await close(db, order, event.kind === 'refund' ? 'refund' : 'chargeback', nowMs) ? 'applied' : 'already_closed';
    } else {
        // An opened or won chargeback changes no ticket; it is kept for reconciliation.
        outcome = 'recorded';
    }
    await db.prepare(`INSERT OR IGNORE INTO card_events (provider, provider_event_id, kind, order_id, outcome, received_at_ms)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(provider, event.providerEventId, event.kind, order?.order_id ?? null, outcome, nowMs).run();
    return outcome;
}
