// Card path (roadmap E8) HTTP routes. Public: open an order, sign it, read its state. Provider:
// one webhook endpoint the adapter authenticates. Internal (operator tool token): list orders and
// the ledger, and apply an event taken from a provider report (chargebacks have no webhook).
import { applyCardEvent, validCardEvent, type CardEvent } from './card-events';
import { createCardOrder, parseDevice, parseOrderRequest, publicOrderView, signCardOrder, type CardOrderRow } from './card-orders';
import type { CardProvider } from './card-provider';
import type { CardConfig, PaymentConfig } from './env';
import type { View } from './market';

export interface CardContext {
    db: D1Database;
    view: View;
    provider: CardProvider;
    config: PaymentConfig;
    card: CardConfig;
    nowMs: number;
    /** Wakes the card operator after an order became payable or voidable. */
    wake: () => Promise<void>;
}

const ERRORS: Record<string, number> = {
    invalid_request: 400, invalid_signature: 400, signature_expired: 400, signature_expiry_too_far: 400, invalid_event: 400,
    publication_not_found: 404, card_order_not_found: 404, publication_not_available: 409, price_below_minimum: 409,
    price_not_whole_cents: 409, ticket_exists: 409, ticket_key_used: 409, card_order_closed: 409,
    invalid_webhook: 401, rpc_unavailable: 503, provider_unavailable: 503,
};

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function cardError(error: unknown, headers: Record<string, string> = {}): Response {
    const code = error instanceof Error ? error.message : '';
    if (ERRORS[code]) return json({ error: code }, ERRORS[code], headers);
    console.error(JSON.stringify({ event: 'card_request_failed' }));
    return json({ error: 'internal_error' }, 500, headers);
}

export function isCardPublicPath(pathname: string): boolean {
    return pathname === '/v1/card-orders' || /^\/v1\/card-orders\/[0-9a-f]{32}(\/device)?$/.test(pathname);
}

/** Public routes; origin, CORS and rate limit are checked by the caller. */
export async function handleCardPublic(request: Request, url: URL, body: Record<string, unknown> | null, context: CardContext, cors: Record<string, string>): Promise<Response> {
    try {
        if (request.method === 'POST' && url.pathname === '/v1/card-orders') {
            const order = await createCardOrder({
                db: context.db, view: context.view, provider: context.provider, contractId: context.config.marketContractId,
                referenceSecret: context.card.referenceSecret, nowMs: context.nowMs,
            }, parseOrderRequest(body ?? {}));
            return json(publicOrderView(order), 201, cors);
        }
        const match = /^\/v1\/card-orders\/([0-9a-f]{32})(\/device)?$/.exec(url.pathname);
        if (match && request.method === 'POST' && match[2]) {
            const order = await signCardOrder({ db: context.db, contractId: context.config.marketContractId, network: context.config.network, nowMs: context.nowMs },
                match[1], parseDevice(body ?? {}));
            // A paid order that waited for a fresh signature can be issued now.
            if (order.status === 'paid') await context.wake();
            return json(publicOrderView(order), 200, cors);
        }
        if (match && request.method === 'GET' && !match[2]) {
            const order = await context.db.prepare(`SELECT * FROM card_orders WHERE order_id = ?`).bind(match[1]).first<CardOrderRow>();
            if (!order) throw new Error('card_order_not_found');
            return json(publicOrderView(order), 200, cors);
        }
    } catch (error) {
        return cardError(error, cors);
    }
    return json({ error: 'method_not_allowed' }, 405, cors);
}

/**
 * The provider's webhook. A delivery that fails authentication gets 401, which the provider does
 * not retry; a storage or RPC failure gets 500, which it does.
 */
export async function handleCardWebhook(request: Request, context: CardContext): Promise<Response> {
    let events: CardEvent[];
    try {
        events = await context.provider.parseWebhook(request);
    } catch (error) {
        return cardError(error instanceof Error && error.message === 'invalid_webhook' ? error : new Error('invalid_webhook'));
    }
    try {
        let wake = false;
        for (const event of events) {
            const outcome = await applyCardEvent(context.db, context.provider.name, event, context.nowMs);
            // Only fixed codes are logged: no provider ids, amounts or customer fields.
            console.log(JSON.stringify({ event: 'card_event', kind: event.kind, outcome }));
            if (outcome === 'applied') wake = true;
        }
        if (wake) await context.wake();
        return json({ received: events.length });
    } catch (error) {
        return cardError(error);
    }
}

function parseReportEvent(body: Record<string, unknown>): CardEvent {
    const event = {
        providerEventId: body.provider_event_id, kind: body.kind, providerOrderId: body.provider_order_id,
        amountMinor: body.amount_minor, currency: body.currency, occurredAtMs: body.occurred_at_ms,
    } as CardEvent;
    if (Object.keys(body).sort().join(',') !== 'amount_minor,currency,kind,occurred_at_ms,provider_event_id,provider_order_id'
        || !validCardEvent(event) || !String(event.providerEventId).startsWith('report:') || event.kind === 'purchase') {
        throw new Error('invalid_event');
    }
    return event;
}

/** Internal routes behind the operator tool token (checked by the caller). */
export async function handleCardInternal(request: Request, url: URL, readBody: () => Promise<Record<string, unknown>>, context: CardContext): Promise<Response> {
    try {
        if (request.method === 'GET' && url.pathname === '/internal/card-orders') {
            const status = url.searchParams.get('status') ?? 'paid';
            const after = Number(url.searchParams.get('after') ?? '0');
            if (!['created', 'awaiting_payment', 'paid', 'issued', 'void_pending', 'voided', 'cancelled'].includes(status) || !Number.isSafeInteger(after)) {
                throw new Error('invalid_request');
            }
            const result = await context.db.prepare(`SELECT order_id, provider, provider_order_id, payment_reference_hmac, publication_id, creator_id,
                ticket_id, gross_minor, currency, status, void_reason, pending_tx_hash, issue_tx_hash, void_tx_hash, attempts, last_error,
                created_at_ms, updated_at_ms, paid_at_ms FROM card_orders WHERE status = ? AND created_at_ms > ? ORDER BY created_at_ms LIMIT 100`)
                .bind(status, after).all();
            return json({ orders: result.results ?? [] });
        }
        if (request.method === 'GET' && url.pathname === '/internal/card-ledger') {
            const result = await context.db.prepare(`SELECT * FROM card_ledger ORDER BY occurred_at_ms LIMIT 10001`).all();
            const entries = result.results ?? [];
            // The operator tool refuses a partial ledger rather than reconcile against it.
            if (entries.length > 10_000) return json({ error: 'ledger_too_large' }, 507);
            return json({ entries });
        }
        if (request.method === 'POST' && url.pathname === '/internal/card-events') {
            // Refunds and chargebacks read from the provider's refunds report by the operator.
            const outcome = await applyCardEvent(context.db, context.provider.name, parseReportEvent(await readBody()), context.nowMs);
            if (outcome === 'applied') await context.wake();
            return json({ outcome });
        }
    } catch (error) {
        return cardError(error);
    }
    return json({ error: 'not_found' }, 404);
}
