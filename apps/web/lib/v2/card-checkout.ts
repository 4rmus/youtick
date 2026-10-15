// V2 card checkout (roadmap E8.2) against the payment service's card path. The ticket key is
// derived in the browser exactly as for a crypto purchase; the payment service only sees its public
// key and the `card_purchase` signature over the provider reference and the price. The buyer pays
// in the card provider's hosted checkout (Cleeng, merchant of record). A redirect or a widget
// message is never proof: the ticket counts only when `get_ticket` shows it on chain.
import { deriveRootKey, ticketKey, type TicketKey } from '../ticket-keys/keys';
import { buildCardPurchaseDevice, signatureExpiry } from '../ticket-keys/messages';
import type { V2Config } from './config';
import type { DeviceKey } from './device-key';
import { CheckoutError } from './purchase';
import { readTicket, type MarketTicket, type ViewContract } from './tickets';

/** The card rail's provider environment; off unless set. Production waits for its own gate (E8.3). */
export type CardRail = 'sandbox';

export function cardRailFromEnv(value: string | undefined = process.env.NEXT_PUBLIC_V2_CARD_RAIL): CardRail | null {
    return value?.trim() === 'sandbox' ? 'sandbox' : null;
}

/**
 * The card price in US dollars as the payment service charges it (one cent = 10,000 micro USDC), or
 * null when the USDC price is not a whole number of cents (the service refuses such an order).
 */
export function cardPriceLabel(priceUsdc: string): string | null {
    if (!/^[1-9][0-9]{0,30}$/.test(priceUsdc)) return null;
    const micro = BigInt(priceUsdc);
    if (micro % 10_000n !== 0n) return null;
    const cents = micro / 10_000n;
    return `$${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

export const CLEENG_WIDGET_SCRIPT: Record<CardRail, string> = {
    sandbox: 'https://widgets.sandbox.cleeng.com/cleeng.js',
};

/** What the payment service returns for a new order; the session is not stored anywhere. */
export interface CardCheckoutSession {
    provider: 'cleeng';
    environment: CardRail;
    publisherId: string;
    offerId: string;
    jwt: string;
    refreshToken: string;
}

export interface CardOrder {
    orderId: string;
    status: 'created' | 'awaiting_payment' | 'paid' | 'issued' | 'void_pending' | 'voided' | 'cancelled';
    ticketId: string;
    publicationId: string;
    paymentReferenceHmac: string;
    grossMinor: string;
    currency: string;
    needsSignature: boolean;
}

export interface CardCheckoutDeps {
    view: ViewContract;
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
}

const STATUSES: CardOrder['status'][] = ['created', 'awaiting_payment', 'paid', 'issued', 'void_pending', 'voided', 'cancelled'];
/** Ticket keys tried when an earlier, unpaid order already holds the next one. */
const MAX_KEY_ATTEMPTS = 5;
const POLL_MS = 4_000;

function fetcherOf(deps: CardCheckoutDeps): typeof fetch {
    return deps.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
}

async function request(fetcher: typeof fetch, url: string, method: 'GET' | 'POST', body?: unknown): Promise<{ status: number; value: Record<string, unknown> }> {
    let response: Response;
    try {
        response = await fetcher(url, {
            method, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(30_000),
            ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        });
    } catch {
        throw new CheckoutError('checkout_unavailable');
    }
    const value = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { status: response.status, value };
}

function errorCode(value: Record<string, unknown>, fallback: string): string {
    return typeof value.error === 'string' && /^[a-z_]{1,64}$/.test(value.error) ? value.error : fallback;
}

export function parseCardOrder(value: Record<string, unknown>): CardOrder {
    const order = {
        orderId: value.order_id, status: value.status, ticketId: value.ticket_id, publicationId: value.publication_id,
        paymentReferenceHmac: value.payment_reference_hmac, grossMinor: value.gross_minor, currency: value.currency,
        needsSignature: value.needs_signature,
    };
    if (typeof order.orderId !== 'string' || !/^[0-9a-f]{32}$/.test(order.orderId)
        || !STATUSES.includes(order.status as CardOrder['status'])
        || typeof order.ticketId !== 'string' || !/^[0-9a-f]{64}$/.test(order.ticketId)
        || typeof order.publicationId !== 'string' || typeof order.paymentReferenceHmac !== 'string' || !/^[0-9a-f]{64}$/.test(order.paymentReferenceHmac)
        || typeof order.grossMinor !== 'string' || !/^[1-9][0-9]{0,15}$/.test(order.grossMinor)
        || typeof order.currency !== 'string' || !/^[A-Z]{3}$/.test(order.currency) || typeof order.needsSignature !== 'boolean') {
        throw new CheckoutError('checkout_unavailable');
    }
    return order as CardOrder;
}

export function parseCheckoutSession(value: unknown, rail: CardRail): CardCheckoutSession {
    const session = value as Record<string, unknown> | null;
    if (!session || session.provider !== 'cleeng' || session.environment !== rail
        || typeof session.publisher_id !== 'string' || !/^[0-9]{1,20}$/.test(session.publisher_id)
        || typeof session.offer_id !== 'string' || !/^[A-Z][0-9]{6,12}(_[A-Z]{2})?$/.test(session.offer_id)
        || typeof session.jwt !== 'string' || typeof session.refresh_token !== 'string') {
        throw new CheckoutError('checkout_unavailable');
    }
    return {
        provider: 'cleeng', environment: rail, publisherId: session.publisher_id, offerId: session.offer_id,
        jwt: session.jwt, refreshToken: session.refresh_token,
    };
}

/** Signs `card_purchase` with the ticket key for this order and stores it with the payment service. */
export async function signCardOrder(input: {
    config: V2Config; paymentServiceUrl: string; order: CardOrder; ticket: TicketKey; device: DeviceKey; deps: CardCheckoutDeps;
}): Promise<CardOrder> {
    const { order, ticket } = input;
    if (ticket.ticketId !== order.ticketId) throw new CheckoutError('checkout_unavailable');
    const device = buildCardPurchaseDevice({
        binding: { network: input.config.auth.network, contractId: input.config.marketContractId }, ticket, publicationId: order.publicationId,
        device: { sessionPublicKey: input.device.sessionPublicKey, certificateSha256: input.device.certificateSha256 },
        paymentReferenceHmac: order.paymentReferenceHmac, grossMinor: order.grossMinor, currency: order.currency,
        expiresAtMs: signatureExpiry((input.deps.now ?? Date.now)()),
    });
    const signed = await request(fetcherOf(input.deps), `${input.paymentServiceUrl}/v1/card-orders/${order.orderId}/device`, 'POST', device);
    if (signed.status !== 200) throw new CheckoutError(errorCode(signed.value, 'checkout_unavailable'));
    return parseCardOrder(signed.value);
}

/**
 * Opens a card order with the first unused ticket key from `startIndex` and signs it. `startIndex`
 * comes from the recovery scan; an index held by an earlier unpaid order is skipped.
 */
export async function openCardOrder(input: {
    config: V2Config; paymentServiceUrl: string; rail: CardRail; ckdKey: Uint8Array; startIndex: number;
    publicationId: string; device: DeviceKey; deps: CardCheckoutDeps;
}): Promise<{ order: CardOrder; ticket: TicketKey; ticketIndex: number; checkout: CardCheckoutSession }> {
    const root = deriveRootKey(input.ckdKey);
    const fetcher = fetcherOf(input.deps);
    for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt += 1) {
        const ticketIndex = input.startIndex + attempt;
        const ticket = ticketKey(root, ticketIndex);
        const created = await request(fetcher, `${input.paymentServiceUrl}/v1/card-orders`, 'POST', {
            publication_id: input.publicationId, ticket_public_key: ticket.publicKey,
        });
        if (created.status === 409 && (created.value.error === 'ticket_key_used' || created.value.error === 'ticket_exists')) continue;
        if (created.status !== 201) throw new CheckoutError(errorCode(created.value, 'checkout_unavailable'));
        const checkout = parseCheckoutSession(created.value.checkout, input.rail);
        const order = await signCardOrder({ ...input, order: parseCardOrder(created.value), ticket });
        return { order, ticket, ticketIndex, checkout };
    }
    throw new CheckoutError('ticket_exists');
}

/** A new provider session for an order that is still open (the provider's expires after minutes). */
export async function refreshCardCheckout(input: { paymentServiceUrl: string; rail: CardRail; orderId: string; deps: CardCheckoutDeps }): Promise<CardCheckoutSession> {
    const refreshed = await request(fetcherOf(input.deps), `${input.paymentServiceUrl}/v1/card-orders/${input.orderId}/checkout`, 'POST', {});
    if (refreshed.status !== 200) throw new CheckoutError(errorCode(refreshed.value, 'checkout_unavailable'));
    return parseCheckoutSession(refreshed.value.checkout, input.rail);
}

/**
 * Follows an order until its ticket is on chain. A payment that lands after the ticket key's
 * signature expired is signed again; a refunded or cancelled order ends the wait. `signal` stops it
 * (the buyer left the page); the order then continues on the service and the ticket still appears
 * in My tickets once issued.
 */
export async function waitForCardTicket(input: {
    config: V2Config; paymentServiceUrl: string; order: CardOrder; ticket: TicketKey; device: DeviceKey; deps: CardCheckoutDeps;
    signal?: AbortSignal; timeoutMs?: number; onStatus?: (status: CardOrder['status']) => void;
}): Promise<MarketTicket> {
    const sleep = input.deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    const now = input.deps.now ?? Date.now;
    const deadline = now() + (input.timeoutMs ?? 30 * 60 * 1000);
    const fetcher = fetcherOf(input.deps);
    let order = input.order;
    while (now() < deadline) {
        if (input.signal?.aborted) throw new CheckoutError('checkout_left');
        if (order.status === 'issued') {
            const onChain = await readTicket(input.deps.view, input.config.marketContractId, order.ticketId);
            if (onChain && onChain.rail === 'card') return onChain;
        } else if (order.status === 'cancelled' || order.status === 'void_pending' || order.status === 'voided') {
            throw new CheckoutError('card_payment_cancelled');
        } else if (order.needsSignature) {
            order = await signCardOrder({ ...input, order });
            input.onStatus?.(order.status);
            continue;
        }
        await sleep(POLL_MS);
        const read = await request(fetcher, `${input.paymentServiceUrl}/v1/card-orders/${order.orderId}`, 'GET');
        if (read.status === 200) {
            order = parseCardOrder(read.value);
            input.onStatus?.(order.status);
        }
    }
    throw new CheckoutError('card_payment_timeout');
}
