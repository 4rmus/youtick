// Card path (roadmap E8): pending card orders. The buyer's ticket key never leaves the browser; the
// order holds its public key and, once signed, the `card_purchase` device binding that names the
// payment reference and the charged amount. The price comes from Market V2, never from the request.
import { PublicKey } from 'near-api-js';
import type { CardProvider } from './card-provider';
import { readPurchasablePublication, type View } from './market';
import { TICKET_SIGNATURE_DOMAIN } from './refunds';

/** The contract accepts a ticket signature at most one hour ahead of block time. */
export const MAX_DEVICE_SIGNATURE_TTL_MS = 60 * 60 * 1000;
/** USDC has 6 decimals and USD cents 2: one cent is 10,000 micro USDC. */
const MICRO_PER_CENT = 10_000n;

const ORDER_ID = /^[0-9a-f]{32}$/;
const KEY = /^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/;
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const DECIMAL = /^[1-9][0-9]{0,15}$/;
const SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;

export interface CardOrderRow {
    order_id: string;
    provider: string;
    provider_order_id: string;
    payment_reference_hmac: string;
    publication_id: string;
    creator_id: string;
    ticket_id: string;
    ticket_public_key: string;
    gross_minor: number;
    currency: string;
    session_public_key: string | null;
    certificate_sha256: string | null;
    device_expires_at_ms: number | null;
    device_signature: string | null;
    status: string;
    void_reason: string | null;
    pending_tx_hash: string | null;
    issue_tx_hash: string | null;
    void_tx_hash: string | null;
    attempts: number;
    last_error: string | null;
    created_at_ms: number;
    updated_at_ms: number;
    paid_at_ms: number | null;
}

export interface DeviceInput {
    session_public_key: string;
    certificate_sha256: string;
    expires_at_ms: string;
    signature: string;
}

function fail(code: string): never {
    throw new Error(code);
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * `payment_reference_hmac`: HMAC-SHA256 of the provider order id (protocol README, "Card tickets"),
 * keyed by the 32 bytes the hex secret encodes, as the protocol golden vector computes it.
 */
export async function paymentReferenceHmac(secretHex: string, providerOrderId: string): Promise<string> {
    if (!/^[0-9a-f]{64}$/.test(secretHex)) fail('card_reference_secret_invalid');
    const raw = Uint8Array.from(secretHex.match(/../g)!, (pair) => parseInt(pair, 16));
    const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(providerOrderId)));
}

/** `ticket_id = sha256(ticket public key bytes)`, as the contract derives it. */
export async function ticketIdOf(ticketPublicKey: string): Promise<string> {
    return hex(await crypto.subtle.digest('SHA-256', PublicKey.from(ticketPublicKey).data));
}

/** The card price in USD cents; refused unless the USDC price is a whole number of cents. */
export function grossMinorOf(priceUsdcMicro: bigint): number {
    if (priceUsdcMicro % MICRO_PER_CENT !== 0n) fail('price_not_whole_cents');
    return Number(priceUsdcMicro / MICRO_PER_CENT);
}

export function cardPurchaseMessage(input: {
    network: string; contractId: string; ticketId: string; device: DeviceInput; publicationId: string;
    paymentReferenceHmac: string; grossMinor: number; currency: string;
}): string {
    return [TICKET_SIGNATURE_DOMAIN, input.network, input.contractId, 'card_purchase', input.ticketId, input.device.expires_at_ms,
        input.publicationId, input.device.session_public_key, input.device.certificate_sha256, input.paymentReferenceHmac,
        String(input.grossMinor), input.currency].join('\n');
}

export function parseOrderRequest(body: Record<string, unknown>): { publication_id: string; ticket_public_key: string } {
    if (Object.keys(body).sort().join(',') !== 'publication_id,ticket_public_key'
        || typeof body.publication_id !== 'string' || !IDENTIFIER.test(body.publication_id)
        || typeof body.ticket_public_key !== 'string' || !KEY.test(body.ticket_public_key)) {
        fail('invalid_request');
    }
    return { publication_id: body.publication_id, ticket_public_key: body.ticket_public_key };
}

export function parseDevice(body: Record<string, unknown>): DeviceInput {
    if (Object.keys(body).sort().join(',') !== 'certificate_sha256,expires_at_ms,session_public_key,signature'
        || typeof body.session_public_key !== 'string' || !KEY.test(body.session_public_key)
        || typeof body.certificate_sha256 !== 'string' || !HEX64.test(body.certificate_sha256)
        || typeof body.expires_at_ms !== 'string' || !DECIMAL.test(body.expires_at_ms)
        || typeof body.signature !== 'string' || !SIGNATURE.test(body.signature)) {
        fail('invalid_request');
    }
    return {
        session_public_key: body.session_public_key, certificate_sha256: body.certificate_sha256,
        expires_at_ms: body.expires_at_ms, signature: body.signature,
    };
}

function randomId(): string {
    return hex(crypto.getRandomValues(new Uint8Array(16)));
}

interface Context {
    db: D1Database;
    view: View;
    provider: CardProvider;
    contractId: string;
    referenceSecret: string;
    nowMs: number;
}

/**
 * Opens a card order for one ticket key: reads the price, makes the provider order and stores its
 * reference. The web then has the ticket key sign `card_purchase` over the returned fields.
 */
export async function createCardOrder(context: Context, input: { publication_id: string; ticket_public_key: string }): Promise<CardOrderRow> {
    const ticketId = await ticketIdOf(input.ticket_public_key);
    const price = await readPurchasablePublication(context.view, context.contractId, input.publication_id);
    const publication = await context.view<{ creator_id?: string } | null>(context.contractId, 'get_publication', { publication_id: input.publication_id });
    if (typeof publication?.creator_id !== 'string') fail('rpc_unavailable');
    if (await context.view<unknown>(context.contractId, 'get_ticket', { ticket_id: ticketId }) !== null) fail('ticket_exists');
    const existing = await context.db.prepare(`SELECT order_id FROM card_orders WHERE ticket_id = ?`).bind(ticketId).first();
    // A ticket key belongs to one order; the web makes a new key for a new attempt.
    if (existing) fail('ticket_key_used');
    const grossMinor = grossMinorOf(price);
    const orderId = randomId();
    const providerOrder = await context.provider.createOrder({ orderId, publicationId: input.publication_id, grossMinor, currency: 'USD' });
    if (!IDENTIFIER.test(providerOrder.providerOrderId)) fail('provider_unavailable');
    const row: CardOrderRow = {
        order_id: orderId, provider: context.provider.name, provider_order_id: providerOrder.providerOrderId,
        payment_reference_hmac: await paymentReferenceHmac(context.referenceSecret, providerOrder.providerOrderId),
        publication_id: input.publication_id, creator_id: publication.creator_id, ticket_id: ticketId, ticket_public_key: input.ticket_public_key,
        gross_minor: grossMinor, currency: 'USD', session_public_key: null, certificate_sha256: null, device_expires_at_ms: null,
        device_signature: null, status: 'created', void_reason: null, pending_tx_hash: null, issue_tx_hash: null, void_tx_hash: null,
        attempts: 0, last_error: null, created_at_ms: context.nowMs, updated_at_ms: context.nowMs, paid_at_ms: null,
    };
    try {
        await context.db.prepare(`INSERT INTO card_orders (order_id, provider, provider_order_id, payment_reference_hmac, publication_id,
            creator_id, ticket_id, ticket_public_key, gross_minor, currency, status, created_at_ms, updated_at_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?)`)
            .bind(row.order_id, row.provider, row.provider_order_id, row.payment_reference_hmac, row.publication_id, row.creator_id,
                row.ticket_id, row.ticket_public_key, row.gross_minor, row.currency, context.nowMs, context.nowMs).run();
    } catch (error) {
        if (error instanceof Error && /UNIQUE/i.test(error.message)) fail('ticket_key_used');
        throw error;
    }
    return row;
}

/**
 * Stores the ticket key's `card_purchase` signature after checking it as the contract will. It may
 * be signed again while the ticket is not on chain yet, which is how a payment that lands after
 * the one-hour signature limit still becomes a ticket.
 */
export async function signCardOrder(context: Omit<Context, 'provider' | 'referenceSecret' | 'view'> & { network: string }, orderId: string, device: DeviceInput): Promise<CardOrderRow> {
    if (!ORDER_ID.test(orderId)) fail('card_order_not_found');
    const order = await context.db.prepare(`SELECT * FROM card_orders WHERE order_id = ?`).bind(orderId).first<CardOrderRow>();
    if (!order) fail('card_order_not_found');
    if (!['created', 'awaiting_payment', 'paid'].includes(order.status) || order.pending_tx_hash) fail('card_order_closed');
    const expires = Number(device.expires_at_ms);
    if (expires <= context.nowMs) fail('signature_expired');
    if (expires - context.nowMs > MAX_DEVICE_SIGNATURE_TTL_MS) fail('signature_expiry_too_far');
    let valid = false;
    try {
        valid = PublicKey.from(order.ticket_public_key).verify(new TextEncoder().encode(cardPurchaseMessage({
            network: context.network, contractId: context.contractId, ticketId: order.ticket_id, device, publicationId: order.publication_id,
            paymentReferenceHmac: order.payment_reference_hmac, grossMinor: order.gross_minor, currency: order.currency,
        })), Uint8Array.from(atob(device.signature), (char) => char.charCodeAt(0)));
    } catch {
        valid = false;
    }
    if (!valid) fail('invalid_signature');
    const next = order.status === 'created' ? 'awaiting_payment' : order.status;
    const updated = await context.db.prepare(`UPDATE card_orders SET session_public_key = ?, certificate_sha256 = ?, device_expires_at_ms = ?,
        device_signature = ?, status = ?, last_error = NULL, updated_at_ms = ? WHERE order_id = ? AND status = ? AND pending_tx_hash IS NULL`)
        .bind(device.session_public_key, device.certificate_sha256, expires, device.signature, next, context.nowMs, orderId, order.status).run();
    if (!updated.meta?.changes) fail('card_order_closed');
    return { ...order, session_public_key: device.session_public_key, certificate_sha256: device.certificate_sha256,
        device_expires_at_ms: expires, device_signature: device.signature, status: next, last_error: null, updated_at_ms: context.nowMs };
}

/** What the buyer's page may read: the order's state, nothing about the provider customer. */
export function publicOrderView(order: CardOrderRow) {
    return {
        order_id: order.order_id, status: order.status, ticket_id: order.ticket_id, publication_id: order.publication_id,
        payment_reference_hmac: order.payment_reference_hmac, gross_minor: String(order.gross_minor), currency: order.currency,
        needs_signature: order.status === 'created' || (order.status === 'paid' && order.last_error === 'device_signature_expired'),
    };
}
