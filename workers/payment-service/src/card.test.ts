import { KeyPair } from 'near-api-js';
import vectors from '../../../protocol/youtick-market-v2/golden-vectors.json';
import { describe, expect, it } from 'vitest';
import type { CardEvent } from './card-events';
import { applyCardEvent } from './card-events';
import { MAX_SEND_ATTEMPTS, RESERVE_HEADROOM_REFUSAL, outcomeOf, runCardOperator, type SendOutcome, type SignCall, type TxStatus } from './card-operator';
import { cardPurchaseMessage, paymentReferenceHmac, ticketIdOf } from './card-orders';
import { verifyCleengSignature, type CardProvider } from './card-provider';
import { handle, type Env } from './index';
import type { View } from './market';
import { sqliteD1 } from './test-support/sqlite-d1.mjs';

const MARKET = 'v2-market-261007.youtick-dev-v3.testnet';
const ORIGIN = 'http://localhost:3000';
const NOW = 1_792_005_000_000;
const ADMIN_TOKEN = 'a'.repeat(40);
const SECRET = vectors.fixture.payment_reference_key_hex;
const TX = '9DnzFAJjxjX2xsi6K3ZbESRUjp2RKxvLu45ntYAUzngf';

const vatKey = KeyPair.fromRandom('ed25519');
const operatorKey = KeyPair.fromRandom('ed25519');
const sessionKey = KeyPair.fromRandom('ed25519').getPublicKey().toString();
const CERT = 'c'.repeat(64);
const CONSENT = 'instant-access-en-2026-10-18';

function b64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
}

interface ChainTicket { ticket_id: string; rail: string; status: string; card: { payment_reference_hmac: string } }

function harness(options: { price?: string; cardEnabled?: boolean; provider?: boolean } = {}) {
    const db = sqliteD1();
    const tickets = new Map<string, ChainTicket>();
    const events: CardEvent[][] = [];
    let wakes = 0;
    let orderCount = 0;
    const view: View = async <T,>(_contract: string, method: string, args: Record<string, unknown>) => {
        if (method === 'get_publication') {
            return { publication_id: 'lp-job', price_usdc: options.price ?? '5000000', availability: 'ACTIVE', creator_id: 'creator.testnet' } as T;
        }
        if (method === 'get_ticket') return (tickets.get(String(args.ticket_id)) ?? null) as T;
        throw new Error(`unexpected ${method}`);
    };
    const provider: CardProvider = {
        name: 'test',
        createOrder: async () => ({ providerOrderId: `po-${++orderCount}` }),
        parseWebhook: async (request) => {
            if (request.headers.get('x-test-signature') !== 'ok') throw new Error('invalid_webhook');
            return events.shift() ?? [];
        },
    };
    const env: Env = {
        PAYMENT_SERVICE_ENABLED: 'true', NEAR_NETWORK: 'testnet', NEAR_RPC_URL: 'https://rpc.example', MARKET_V2_CONTRACT_ID: MARKET,
        VAT_POLICY: 'fixed-testnet', VAT_RATE_BPS: '2000', VAT_KEY_VERSION: '1', VAT_SIGNER_PRIVATE_KEY: vatKey.toString(),
        ALLOWED_ORIGINS: ORIGIN, REFUNDS: db, REFUND_ADMIN_TOKEN: ADMIN_TOKEN,
        CARD_PATH_ENABLED: options.cardEnabled === false ? 'false' : 'true', PAYMENT_OPERATOR_ID: 'v2-payments.testnet',
        PAYMENT_OPERATOR_PRIVATE_KEY: operatorKey.toString(), CARD_REFERENCE_SECRET: SECRET,
        CARD_OPERATOR: {} as DurableObjectNamespace,
    };
    const deps = {
        view, now: () => NOW, cardProvider: options.provider === false ? undefined : provider,
        wakeCardOperator: async () => { wakes += 1; },
    };
    const call = (path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) => handle(new Request(`https://pay.example${path}`, {
        method: init.method ?? 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }), env, deps);
    return { db, tickets, events, view, env, deps, call, wakes: () => wakes };
}

async function openOrder(h: ReturnType<typeof harness>, ticket = KeyPair.fromRandom('ed25519')) {
    const response = await h.call('/v1/card-orders', { body: { publication_id: 'lp-job', ticket_public_key: ticket.getPublicKey().toString(), consent_version: CONSENT } });
    return { response, ticket, order: await response.json() as Record<string, string> };
}

function signDevice(ticket: KeyPair, order: Record<string, string>, expiresAtMs = NOW + 50 * 60 * 1000) {
    const device = { session_public_key: sessionKey, certificate_sha256: CERT, expires_at_ms: String(expiresAtMs), signature: '' };
    const message = cardPurchaseMessage({
        network: 'testnet', contractId: MARKET, ticketId: order.ticket_id, device, publicationId: order.publication_id,
        paymentReferenceHmac: order.payment_reference_hmac, grossMinor: Number(order.gross_minor), currency: order.currency,
    });
    return { ...device, signature: b64(ticket.sign(new TextEncoder().encode(message)).signature) };
}

function purchase(id: string, providerOrderId: string, amountMinor = 500, currency = 'USD'): CardEvent {
    return { providerEventId: id, kind: 'purchase', providerOrderId, amountMinor, currency, occurredAtMs: NOW };
}

function chainSigner(h: ReturnType<typeof harness>, outcomes: SendOutcome[] = []): { sign: SignCall; sent: { method: string; args: Record<string, unknown>; deposit: bigint }[] } {
    const sent: { method: string; args: Record<string, unknown>; deposit: bigint }[] = [];
    const sign: SignCall = async (method, args, deposit) => ({
        hash: TX,
        send: async () => {
            sent.push({ method, args, deposit });
            const outcome = outcomes.shift() ?? 'success';
            if (outcome === 'failure' || outcome === 'reserve_exhausted') return outcome;
            if (method === 'issue_card_ticket') {
                const ticketId = await ticketIdOf(String(args.ticket_public_key));
                h.tickets.set(ticketId, { ticket_id: ticketId, rail: 'card', status: 'purchased', card: { payment_reference_hmac: String(args.payment_reference_hmac) } });
            } else {
                h.tickets.get(String(args.ticket_id))!.status = 'voided';
            }
            return outcome;
        },
    });
    return { sign, sent };
}

async function operate(h: ReturnType<typeof harness>, sign: SignCall, now = NOW, txStatus: TxStatus = async () => 'unknown') {
    return runCardOperator({ db: h.db, view: h.view, sign, txStatus, contractId: MARKET, now: () => now });
}

async function status(h: ReturnType<typeof harness>, orderId: string) {
    return h.db.prepare('SELECT status, last_error, attempts, issue_tx_hash, void_tx_hash, void_reason FROM card_orders WHERE order_id = ?')
        .bind(orderId).first<Record<string, unknown>>();
}

describe('card path protocol', () => {
    it('reproduces the golden payment reference and card_purchase message', async () => {
        const signature = vectors.ticket_signatures.card_purchase;
        expect(await paymentReferenceHmac(SECRET, vectors.fixture.card_payment_reference)).toBe(signature.fields.payment_reference_hmac);
        expect(await ticketIdOf(signature.signer_public_key)).toBe(signature.ticket_id);
        const device = vectors.card_ticket.issue_card_ticket_args.device;
        expect(cardPurchaseMessage({
            network: 'testnet', contractId: vectors.fixture.contract_id, ticketId: signature.ticket_id, device,
            publicationId: signature.fields.publication_id, paymentReferenceHmac: signature.fields.payment_reference_hmac,
            grossMinor: Number(signature.fields.gross_minor), currency: signature.fields.currency,
        })).toBe(signature.message);
    });

    it('checks a Cleeng-style signature over the raw body', async () => {
        const body = '{"topic":"transactionCreated"}';
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('s'.repeat(32)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const header = b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))));
        expect(await verifyCleengSignature(body, header, 's'.repeat(32))).toBe(true);
        expect(await verifyCleengSignature(`${body} `, header, 's'.repeat(32))).toBe(false);
        expect(await verifyCleengSignature(body, null, 's'.repeat(32))).toBe(false);
    });
});

describe('card orders', () => {
    it('stays off without the flag or a provider adapter', async () => {
        for (const h of [harness({ cardEnabled: false }), harness({ provider: false })]) {
            expect((await openOrder(h)).response.status).toBe(503);
            expect((await h.call('/webhooks/card', { body: {} })).status).toBe(503);
            expect((await h.call('/internal/card-orders', { method: 'GET', headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } })).status).toBe(503);
        }
    });

    it('prices the order from the chain in cents and binds the reference', async () => {
        const h = harness();
        const { response, ticket, order } = await openOrder(h);
        expect(response.status).toBe(201);
        expect(order).toMatchObject({ status: 'created', gross_minor: '500', currency: 'USD', needs_signature: true });
        expect(order.ticket_id).toBe(await ticketIdOf(ticket.getPublicKey().toString()));
        expect(order.payment_reference_hmac).toBe(await paymentReferenceHmac(SECRET, 'po-1'));
        // One order per ticket key.
        expect((await openOrder(h, ticket)).response.status).toBe(409);
    });

    it('needs the instant-access consent version and stores it on the order', async () => {
        const h = harness();
        const key = () => KeyPair.fromRandom('ed25519').getPublicKey().toString();
        for (const body of [
            { publication_id: 'lp-job', ticket_public_key: key() },
            { publication_id: 'lp-job', ticket_public_key: key(), consent_version: '' },
            { publication_id: 'lp-job', ticket_public_key: key(), consent_version: 'Instant Access' },
            { publication_id: 'lp-job', ticket_public_key: key(), consent_version: 'a'.repeat(65) },
            { publication_id: 'lp-job', ticket_public_key: key(), consent_version: true },
        ]) {
            const refused = await h.call('/v1/card-orders', { body });
            expect(refused.status).toBe(400);
            expect(await refused.json()).toEqual({ error: 'invalid_request' });
        }
        expect(await h.db.prepare(`SELECT count(*) AS n FROM card_orders`).first()).toMatchObject({ n: 0 });
        const { order } = await openOrder(h);
        expect(order).not.toHaveProperty('consent_version');
        expect(await h.db.prepare(`SELECT consent_version FROM card_orders WHERE order_id = ?`).bind(order.order_id).first())
            .toEqual({ consent_version: CONSENT });
    });

    it('refuses a price that is not whole cents and a ticket that exists', async () => {
        expect((await openOrder(harness({ price: '5000001' }))).order).toEqual({ error: 'price_not_whole_cents' });
        const h = harness();
        const ticket = KeyPair.fromRandom('ed25519');
        const id = await ticketIdOf(ticket.getPublicKey().toString());
        h.tickets.set(id, { ticket_id: id, rail: 'crypto', status: 'purchased', card: { payment_reference_hmac: '' } });
        expect((await openOrder(h, ticket)).response.status).toBe(409);
    });

    it('accepts only a valid card_purchase signature within one hour', async () => {
        const h = harness();
        const { ticket, order } = await openOrder(h);
        const path = `/v1/card-orders/${order.order_id}/device`;
        expect((await h.call(path, { body: signDevice(KeyPair.fromRandom('ed25519'), order) })).status).toBe(400);
        expect((await h.call(path, { body: signDevice(ticket, order, NOW + 61 * 60 * 1000) })).status).toBe(400);
        const signed = await h.call(path, { body: signDevice(ticket, order) });
        expect(signed.status).toBe(200);
        expect(await signed.json()).toMatchObject({ status: 'awaiting_payment', needs_signature: false });
        const read = await h.call(`/v1/card-orders/${order.order_id}`, { method: 'GET' });
        expect(await read.json()).toMatchObject({ status: 'awaiting_payment' });
    });
});

describe('card events and operator', () => {
    async function paidOrder(h: ReturnType<typeof harness>) {
        const { ticket, order } = await openOrder(h);
        await h.call(`/v1/card-orders/${order.order_id}/device`, { body: signDevice(ticket, order) });
        const providerOrderId = 'po-1';
        h.events.push([purchase(`evt-${order.order_id}`, providerOrderId)]);
        const response = await h.call('/webhooks/card', { body: {}, headers: { 'x-test-signature': 'ok' } });
        return { ticket, order, providerOrderId, response };
    }

    it('rejects an unauthenticated webhook without changing anything', async () => {
        const h = harness();
        const { order } = await openOrder(h);
        h.events.push([purchase('evt-1', 'po-1')]);
        expect((await h.call('/webhooks/card', { body: {} })).status).toBe(401);
        expect(await status(h, order.order_id)).toMatchObject({ status: 'created' });
    });

    it('issues a ticket once after a verified purchase and ignores a redelivery', async () => {
        const h = harness();
        const { order, response } = await paidOrder(h);
        expect(response.status).toBe(200);
        expect(await status(h, order.order_id)).toMatchObject({ status: 'paid' });
        expect(h.wakes()).toBe(1);
        h.events.push([purchase(`evt-${order.order_id}`, 'po-1')]);
        await h.call('/webhooks/card', { body: {}, headers: { 'x-test-signature': 'ok' } });
        expect(h.wakes()).toBe(1);

        const chain = chainSigner(h);
        expect(await operate(h, chain.sign)).toEqual({ processed: 1, waiting: 0 });
        expect(chain.sent).toHaveLength(1);
        expect(chain.sent[0].method).toBe('issue_card_ticket');
        expect(chain.sent[0].args).toMatchObject({ payment_reference_hmac: order.payment_reference_hmac, gross_minor: '500', currency: 'USD' });
        // A function-call key signs it: no deposit, the Market pays the storage from its headroom.
        expect(chain.sent[0].deposit).toBe(0n);
        expect(await status(h, order.order_id)).toMatchObject({ status: 'issued', issue_tx_hash: TX });
        await operate(h, chain.sign);
        expect(chain.sent).toHaveLength(1);
        const ledger = await h.db.prepare('SELECT kind, amount_minor FROM card_ledger').all();
        expect(ledger.results).toEqual([{ kind: 'sale', amount_minor: 500 }]);
    });

    it('never issues for an amount the ticket key did not sign', async () => {
        const h = harness();
        const { ticket, order } = await openOrder(h);
        await h.call(`/v1/card-orders/${order.order_id}/device`, { body: signDevice(ticket, order) });
        h.events.push([purchase('evt-x', 'po-1', 400)]);
        await h.call('/webhooks/card', { body: {}, headers: { 'x-test-signature': 'ok' } });
        expect(await status(h, order.order_id)).toMatchObject({ status: 'awaiting_payment' });
    });

    it('waits for a fresh signature when the payment lands after the signature expired', async () => {
        const h = harness();
        const { ticket, order } = await paidOrder(h);
        const chain = chainSigner(h);
        const later = NOW + 55 * 60 * 1000;
        expect(await operate(h, chain.sign, later)).toEqual({ processed: 1, waiting: 0 });
        expect(chain.sent).toHaveLength(0);
        expect(await status(h, order.order_id)).toMatchObject({ status: 'paid', last_error: 'device_signature_expired' });
        // The signature route checks against the real clock of the request; the test harness uses NOW.
        expect((await h.call(`/v1/card-orders/${order.order_id}`, { method: 'GET' }).then((r) => r.json()))).toMatchObject({ needs_signature: true });
        await h.call(`/v1/card-orders/${order.order_id}/device`, { body: signDevice(ticket, order, NOW + 59 * 60 * 1000) });
        expect(h.wakes()).toBe(2);
    });

    it('settles an unknown outcome by reading the ticket, not by resending', async () => {
        const h = harness();
        const { order } = await paidOrder(h);
        const chain = chainSigner(h, ['unknown']);
        await operate(h, chain.sign);
        expect(await status(h, order.order_id)).toMatchObject({ status: 'issued' });
        expect(chain.sent).toHaveLength(1);
    });

    it('stops after the attempt limit when the contract keeps refusing', async () => {
        const h = harness();
        const { order } = await paidOrder(h);
        const chain = chainSigner(h, Array(MAX_SEND_ATTEMPTS + 2).fill('failure'));
        for (let i = 0; i < MAX_SEND_ATTEMPTS + 2; i += 1) await operate(h, chain.sign);
        expect(chain.sent).toHaveLength(MAX_SEND_ATTEMPTS);
        expect(await status(h, order.order_id)).toMatchObject({ status: 'paid', last_error: 'send_failed', attempts: MAX_SEND_ATTEMPTS });
    });

    it('waits without counting attempts while the Market cannot pay for ticket storage', async () => {
        const h = harness();
        const { order } = await paidOrder(h);
        const chain = chainSigner(h, Array(MAX_SEND_ATTEMPTS + 2).fill('reserve_exhausted'));
        for (let i = 0; i < MAX_SEND_ATTEMPTS + 2; i += 1) {
            // Left to the cron: the Durable Object's 30-second alarm would only burn gas.
            expect(await operate(h, chain.sign)).toEqual({ processed: 1, waiting: 0 });
        }
        expect(chain.sent).toHaveLength(MAX_SEND_ATTEMPTS + 2);
        expect(await status(h, order.order_id)).toMatchObject({ status: 'paid', last_error: 'reserve_exhausted', attempts: 0 });
        // The owner topped up the Market: the next run issues the ticket.
        await operate(h, chain.sign);
        expect(await status(h, order.order_id)).toMatchObject({ status: 'issued', issue_tx_hash: TX, last_error: null, attempts: 1 });
        // A refund meanwhile cancels the waiting order, as a plain failure would allow.
        const other = harness();
        const second = await paidOrder(other);
        const dry = chainSigner(other, ['reserve_exhausted']);
        await operate(other, dry.sign);
        await applyCardEvent(other.db, 'test', { ...purchase('evt-r3', 'po-1'), kind: 'refund' }, NOW);
        await operate(other, dry.sign);
        expect(await status(other, second.order.order_id)).toMatchObject({ status: 'cancelled' });
    });

    it('drains a reserve_exhausted backlog once the Market pays again', async () => {
        const h = harness();
        const orders: string[] = [];
        for (let i = 1; i <= 3; i += 1) {
            const { ticket, order } = await openOrder(h);
            await h.call(`/v1/card-orders/${order.order_id}/device`, { body: signDevice(ticket, order) });
            h.events.push([purchase(`evt-${i}`, `po-${i}`)]);
            await h.call('/webhooks/card', { body: {}, headers: { 'x-test-signature': 'ok' } });
            orders.push(order.order_id);
        }
        const dry = chainSigner(h, ['reserve_exhausted', 'reserve_exhausted', 'reserve_exhausted']);
        expect(await operate(h, dry.sign)).toEqual({ processed: 3, waiting: 0 });
        // Topped up: the first ticket goes through, so the rest are retried by the alarm, not the cron.
        const partial = chainSigner(h, ['success', 'reserve_exhausted', 'reserve_exhausted']);
        expect(await operate(h, partial.sign)).toEqual({ processed: 3, waiting: 2 });
        expect(await status(h, orders[0])).toMatchObject({ status: 'issued' });
        expect(await operate(h, chainSigner(h).sign)).toEqual({ processed: 2, waiting: 0 });
        for (const orderId of orders) expect(await status(h, orderId)).toMatchObject({ status: 'issued' });
    });

    it('reads the headroom refusal out of a final execution outcome', () => {
        const panicked = { status: { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError:
            `Smart contract panicked: ${RESERVE_HEADROOM_REFUSAL} (1 > 0 yoctoNEAR)` } } } } } };
        expect(outcomeOf(panicked)).toBe('reserve_exhausted');
        expect(outcomeOf({ status: { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked: Ticket already exists' } } } } } })).toBe('failure');
        expect(outcomeOf({ status: { SuccessValue: '' } })).toBe('success');
    });

    it('cancels a refunded order before issue and voids an issued one', async () => {
        const before = harness();
        const first = await paidOrder(before);
        before.events.push([{ ...purchase('evt-r', first.providerOrderId), kind: 'refund' }]);
        await before.call('/webhooks/card', { body: {}, headers: { 'x-test-signature': 'ok' } });
        expect(await status(before, first.order.order_id)).toMatchObject({ status: 'cancelled', void_reason: 'refund' });
        const idle = chainSigner(before);
        await operate(before, idle.sign);
        expect(idle.sent).toHaveLength(0);

        const after = harness();
        const second = await paidOrder(after);
        const chain = chainSigner(after);
        await operate(after, chain.sign);
        after.events.push([{ ...purchase('evt-r', second.providerOrderId), kind: 'refund' }]);
        await after.call('/webhooks/card', { body: {}, headers: { 'x-test-signature': 'ok' } });
        expect(await status(after, second.order.order_id)).toMatchObject({ status: 'void_pending', void_reason: 'refund' });
        await operate(after, chain.sign);
        expect(chain.sent.map((entry) => entry.method)).toEqual(['issue_card_ticket', 'void_card_ticket']);
        expect(chain.sent[1].args).toEqual({ ticket_id: second.order.ticket_id, reason: 'refund' });
        expect(await status(after, second.order.order_id)).toMatchObject({ status: 'voided', void_tx_hash: TX });
        const net = await after.db.prepare('SELECT SUM(amount_minor) AS net FROM card_ledger').first<{ net: number }>();
        expect(net?.net).toBe(0);
    });

    it('voids, not cancels, when a refund arrives while the issue is being sent', async () => {
        const h = harness();
        const { order } = await paidOrder(h);
        const chain = chainSigner(h);
        const racing: SignCall = async (method, args, deposit) => {
            const call = await chain.sign(method, args, deposit);
            return { hash: call.hash, send: async () => {
                // The webhook reads the order after the operator stored its send.
                await applyCardEvent(h.db, 'test', { ...purchase('evt-race', 'po-1'), kind: 'refund' }, NOW);
                return call.send();
            } };
        };
        await operate(h, racing);
        expect(await status(h, order.order_id)).toMatchObject({ status: 'void_pending', void_reason: 'refund' });
        await operate(h, chain.sign);
        expect(chain.sent.map((entry) => entry.method)).toEqual(['issue_card_ticket', 'void_card_ticket']);
        expect(await status(h, order.order_id)).toMatchObject({ status: 'voided' });
    });

    it('cancels after an unknown send only once the chain says it failed', async () => {
        const h = harness();
        const { order } = await paidOrder(h);
        const lost: SignCall = async () => ({ hash: TX, send: async () => 'unknown' });
        await operate(h, lost);
        expect(await status(h, order.order_id)).toMatchObject({ status: 'paid', last_error: 'outcome_unknown' });
        // No resend while the outcome is unknown.
        const chain = chainSigner(h);
        expect(await operate(h, chain.sign)).toEqual({ processed: 1, waiting: 0 });
        expect(chain.sent).toHaveLength(0);
        await applyCardEvent(h.db, 'test', { ...purchase('evt-r2', 'po-1'), kind: 'refund' }, NOW);
        expect(await status(h, order.order_id)).toMatchObject({ status: 'void_pending' });
        await operate(h, chain.sign);
        expect(await status(h, order.order_id)).toMatchObject({ status: 'void_pending', last_error: 'outcome_unknown' });
        await operate(h, chain.sign, NOW, async () => 'failure');
        expect(await status(h, order.order_id)).toMatchObject({ status: 'cancelled' });
        expect(chain.sent).toHaveLength(0);
    });

    it('applies a chargeback from the provider report through the operator token only', async () => {
        const h = harness();
        const { order, providerOrderId } = await paidOrder(h);
        await operate(h, chainSigner(h).sign);
        const event = { provider_event_id: 'report:C-1', kind: 'chargeback_lost', provider_order_id: providerOrderId, amount_minor: 500, currency: 'USD', occurred_at_ms: NOW };
        expect((await h.call('/internal/card-events', { body: event })).status).toBe(401);
        const auth = { Authorization: `Bearer ${ADMIN_TOKEN}` };
        expect((await h.call('/internal/card-events', { body: { ...event, provider_event_id: 'C-1' }, headers: auth })).status).toBe(400);
        const applied = await h.call('/internal/card-events', { body: event, headers: auth });
        expect(await applied.json()).toEqual({ outcome: 'applied' });
        expect(await status(h, order.order_id)).toMatchObject({ status: 'void_pending', void_reason: 'chargeback' });
        const again = await h.call('/internal/card-events', { body: event, headers: auth });
        expect(await again.json()).toEqual({ outcome: 'duplicate' });
        const listed = await h.call('/internal/card-orders?status=void_pending', { method: 'GET', headers: auth });
        const { orders } = await listed.json() as { orders: Record<string, unknown>[] };
        expect(orders).toHaveLength(1);
        expect(orders[0]).toMatchObject({ consent_version: CONSENT });
        expect(orders[0]).not.toHaveProperty('ticket_public_key');
        expect(orders[0]).not.toHaveProperty('device_signature');
    });
});
