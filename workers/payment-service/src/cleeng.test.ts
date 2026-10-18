import { KeyPair } from 'near-api-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import vectors from '../../../protocol/youtick-market-v2/golden-vectors.json';
import { buyerEmail, cleengProvider, minorUnits, UNKNOWN_CURRENCY, type CleengConfig } from './cleeng';
import { handle, type Env } from './index';
import type { View } from './market';
import { sqliteD1 } from './test-support/sqlite-d1.mjs';

// Payload shapes follow Cleeng's documented examples (developers.cleeng.com, read 2026-10-15), with
// the missing commas of the published transactionCreated example restored. They are not captured
// sandbox deliveries.
const CONFIG: CleengConfig = { environment: 'sandbox', publisherId: '123456789', publisherToken: 'publisher-token-0123456789', webhookSecret: 'whsec_0123456789abcdef' };
const NOW = 1_792_005_000_000;
const ORDER_ID = '0123456789abcdef0123456789abcdef';
const OFFER = 'S229081230_US';

interface Sent { url: string; headers: Record<string, string>; body: Record<string, unknown> }

function cleengFetch(overrides: Partial<Record<'offers' | 'customers' | 'sso', Response>> = {}) {
    const sent: Sent[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        sent.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: JSON.parse(String(init?.body)) });
        if (url.endsWith('/3.1/offers')) return overrides.offers ?? Response.json({ id: OFFER, longId: OFFER, type: 'vod' });
        if (url.endsWith('/3.1/customers')) return overrides.customers ?? Response.json({ success: true, data: { id: 332442553, externalId: ORDER_ID } });
        if (url.endsWith('/sso/auths')) return overrides.sso ?? Response.json({ responseData: { jwt: 'jwt-value', refreshToken: 'refresh-value' }, errors: [] });
        return new Response('not found', { status: 404 });
    }) as typeof fetch;
    return { sent, fetcher };
}

async function signed(body: unknown, options: { secret?: string; deliveryId?: string } = {}): Promise<Request> {
    const raw = JSON.stringify(body);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(options.secret ?? CONFIG.webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))));
    return new Request('https://pay.example/webhooks/card', {
        method: 'POST', body: raw,
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signature, 'X-Webhook-Delivery-Id': options.deliveryId ?? '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' },
    });
}

function transactionCreated(data: Record<string, unknown> = {}) {
    return {
        broadcasterId: 123456789, topic: 'transactionCreated',
        data: {
            offerId: OFFER, transactionId: 'T111333222', transactionCountry: 'GB', taxRate: '0.2000', transactionCurrency: 'GBP',
            transactionDate: 1628085830, externalData: '862628085828720A', transactionPriceExclTax: '3.3300', transactionPriceInclTax: '4.0000',
            applicableTax: '0.6700', appliedExchangeRate: '0.8000', customerId: 332442553, paymentId: 1536331075, offerPrice: 5,
            offerCurrency: 'USD', discountRate: null, discountValue: '0', subscriptionPlanId: null, customerEmail: buyerEmail(ORDER_ID),
            customerExternalId: ORDER_ID, paymentGateway: 'adyen', merchantOfRecord: 'Cleeng', ...data,
        },
    };
}

function paymentRefunded(data: Record<string, unknown> = {}) {
    return {
        broadcasterId: 123456789, topic: 'paymentRefunded',
        data: { paymentId: 1536331075, paymentGateway: 'adyen', externalPaymentId: 'ABC123', customerId: 332442553, amount: 4, offerId: OFFER, ...data },
    };
}

describe('Cleeng amounts', () => {
    it('reads major units as whole cents only', () => {
        expect(minorUnits(5)).toBe(500);
        expect(minorUnits(5.25)).toBe(525);
        expect(minorUnits('10.0000')).toBe(1000);
        expect(minorUnits('5.01')).toBe(501);
        expect(minorUnits('5.015')).toBeNull();
        expect(minorUnits(-1)).toBeNull();
        expect(minorUnits('1e3')).toBeNull();
        expect(minorUnits(null)).toBeNull();
    });
});

describe('Cleeng orders', () => {
    it('makes an offer, a per-order customer and a checkout session', async () => {
        const { sent, fetcher } = cleengFetch();
        const result = await cleengProvider(CONFIG, { fetcher }).createOrder({ orderId: ORDER_ID, publicationId: 'lp-job', grossMinor: 500, currency: 'USD', country: 'GB' });
        expect(result).toEqual({ providerOrderId: OFFER, checkout: { provider: 'cleeng', environment: 'sandbox', publisher_id: CONFIG.publisherId, jwt: 'jwt-value', refresh_token: 'refresh-value', offer_id: OFFER } });
        expect(sent.map((request) => request.url)).toEqual([
            'https://api.sandbox.cleeng.com/3.1/offers', 'https://api.sandbox.cleeng.com/3.1/customers', 'https://mediastoreapi-sandbox.cleeng.com/sso/auths',
        ]);
        expect(sent.every((request) => request.headers['x-publisher-token'] === CONFIG.publisherToken)).toBe(true);
        expect(sent[0].body).toMatchObject({ type: 'vod', price: { amount: 5, currency: 'USD' }, externalProperties: { order_id: ORDER_ID, publication_id: 'lp-job' } });
        expect(sent[1].body).toEqual({ email: `${ORDER_ID}@buyers.youtick.invalid`, externalId: ORDER_ID, locale: 'en_US', country: 'GB', currency: 'USD' });
        expect(sent[2].body).toEqual({ email: `${ORDER_ID}@buyers.youtick.invalid` });
    });

    it('refuses an unknown buyer country before calling Cleeng', async () => {
        for (const country of [null, 'XX', 'T1', 'gb']) {
            const { sent, fetcher } = cleengFetch();
            await expect(cleengProvider(CONFIG, { fetcher }).createOrder({ orderId: ORDER_ID, publicationId: 'lp-job', grossMinor: 500, currency: 'USD', country }))
                .rejects.toThrow('buyer_country_unknown');
            expect(sent).toHaveLength(0);
        }
    });

    it('reports a failed or malformed Cleeng answer as provider_unavailable', async () => {
        const input = { orderId: ORDER_ID, publicationId: 'lp-job', grossMinor: 500, currency: 'USD', country: 'GB' };
        for (const overrides of [
            { offers: new Response('{}', { status: 500 }) }, { offers: Response.json({ id: 'not-an-offer' }) },
            { customers: Response.json({ success: false }) }, { sso: Response.json({ responseData: {} }) },
        ]) {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            await expect(cleengProvider(CONFIG, { fetcher: cleengFetch(overrides).fetcher }).createOrder(input)).rejects.toThrow('provider_unavailable');
            spy.mockRestore();
        }
    });
});

describe('Cleeng webhooks', () => {
    const provider = cleengProvider(CONFIG, { fetcher: cleengFetch().fetcher, now: () => NOW });

    it('maps transactionCreated to a purchase at the offer price', async () => {
        expect(await provider.parseWebhook(await signed(transactionCreated()))).toEqual([{
            providerEventId: '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d:0', kind: 'purchase', providerOrderId: OFFER,
            amountMinor: 500, currency: 'USD', occurredAtMs: 1_628_085_830_000,
        }]);
    });

    it('maps paymentRefunded to a refund whose currency the report settles later', async () => {
        expect(await provider.parseWebhook(await signed(paymentRefunded()))).toEqual([{
            providerEventId: '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d:0', kind: 'refund', providerOrderId: OFFER,
            amountMinor: 400, currency: UNKNOWN_CURRENCY, occurredAtMs: NOW,
        }]);
    });

    it('ignores topics the card path does not use', async () => {
        expect(await provider.parseWebhook(await signed({ broadcasterId: 123456789, topic: 'customerRegistered', data: { customerId: 1 } }))).toEqual([]);
    });

    it('refuses a bad signature, another broadcaster, a missing delivery id or a malformed event', async () => {
        const cases = [
            await signed(transactionCreated(), { secret: 'whsec_another_secret_000' }),
            await signed({ ...transactionCreated(), broadcasterId: 987654321 }),
            await signed(transactionCreated(), { deliveryId: '' }),
            await signed(transactionCreated({ offerId: undefined })),
            await signed(transactionCreated({ offerPrice: 5.001 })),
            await signed(paymentRefunded({ amount: 0 })),
        ];
        for (const request of cases) await expect(provider.parseWebhook(request)).rejects.toThrow('invalid_webhook');
    });
});

describe('Cleeng adapter in the service', () => {
    afterEach(() => vi.unstubAllGlobals());

    function service(cleeng: Partial<Env> = {}) {
        const db = sqliteD1();
        const view: View = async <T,>(_contract: string, method: string) => {
            if (method === 'get_publication') return { publication_id: 'lp-job', price_usdc: '5000000', availability: 'ACTIVE', creator_id: 'creator.testnet' } as T;
            if (method === 'get_ticket') return null as T;
            throw new Error(`unexpected ${method}`);
        };
        const env: Env = {
            PAYMENT_SERVICE_ENABLED: 'true', NEAR_NETWORK: 'testnet', NEAR_RPC_URL: 'https://rpc.example', MARKET_V2_CONTRACT_ID: 'market.testnet',
            VAT_POLICY: 'fixed-testnet', VAT_RATE_BPS: '2000', VAT_KEY_VERSION: '1', VAT_SIGNER_PRIVATE_KEY: KeyPair.fromRandom('ed25519').toString(),
            ALLOWED_ORIGINS: 'http://localhost:3000', REFUNDS: db, REFUND_ADMIN_TOKEN: 'a'.repeat(40), CARD_PATH_ENABLED: 'true',
            PAYMENT_OPERATOR_ID: 'v2-payments.testnet', PAYMENT_OPERATOR_PRIVATE_KEY: KeyPair.fromRandom('ed25519').toString(),
            CARD_REFERENCE_SECRET: vectors.fixture.payment_reference_key_hex, CARD_OPERATOR: {} as DurableObjectNamespace,
            CLEENG_ENVIRONMENT: 'sandbox', CLEENG_PUBLISHER_ID: CONFIG.publisherId, CLEENG_PUBLISHER_TOKEN: CONFIG.publisherToken,
            CLEENG_WEBHOOK_SECRET: CONFIG.webhookSecret, ...cleeng,
        };
        let wakes = 0;
        const deps = { view, now: () => NOW, wakeCardOperator: async () => { wakes += 1; } };
        const open = (country: string | null = 'GB') => {
            const request = new Request('https://pay.example/v1/card-orders', {
                method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
                body: JSON.stringify({ publication_id: 'lp-job', ticket_public_key: KeyPair.fromRandom('ed25519').getPublicKey().toString(), consent_version: 'instant-access-en-2026-10-18' }),
            });
            if (country) Object.defineProperty(request, 'cf', { value: { country } });
            return handle(request, env, deps);
        };
        return { db, env, deps, open, wakes: () => wakes };
    }

    it('stays off without a sandbox configuration', async () => {
        for (const cleeng of [{ CLEENG_ENVIRONMENT: 'production' }, { CLEENG_ENVIRONMENT: undefined }, { CLEENG_WEBHOOK_SECRET: 'short' }]) {
            vi.stubGlobal('fetch', cleengFetch().fetcher);
            expect((await service(cleeng).open()).status).toBe(503);
        }
    });

    it('opens an order with a checkout session and applies the signed purchase and refund', async () => {
        vi.stubGlobal('fetch', cleengFetch().fetcher);
        const s = service();
        const created = await s.open();
        expect(created.status).toBe(201);
        const order = await created.json() as Record<string, unknown>;
        expect(order).toMatchObject({ status: 'created', gross_minor: '500', checkout: { provider: 'cleeng', offer_id: OFFER, jwt: 'jwt-value' } });
        const stored = await s.db.prepare('SELECT * FROM card_orders WHERE order_id = ?').bind(order.order_id).first<Record<string, unknown>>();
        expect(stored).toMatchObject({ provider: 'cleeng', provider_order_id: OFFER });
        // Nothing of the provider session or the buyer's address is stored.
        expect(JSON.stringify(stored)).not.toMatch(/jwt-value|refresh-value|invalid/);

        const refreshed = await handle(new Request(`https://pay.example/v1/card-orders/${order.order_id}/checkout`, {
            method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' }, body: '{}',
        }), s.env, s.deps);
        expect(await refreshed.json()).toMatchObject({ order_id: order.order_id, checkout: { offer_id: OFFER, jwt: 'jwt-value' } });

        const paid = await handle(await signed(transactionCreated(), { deliveryId: 'a0000000-0000-4000-8000-000000000001' }), s.env, s.deps);
        expect(await paid.json()).toEqual({ received: 1 });
        expect(await s.db.prepare('SELECT status FROM card_orders WHERE order_id = ?').bind(order.order_id).first()).toEqual({ status: 'paid' });

        const refunded = await handle(await signed(paymentRefunded(), { deliveryId: 'a0000000-0000-4000-8000-000000000002' }), s.env, s.deps);
        expect(refunded.status).toBe(200);
        // Paid but never sent: the refund cancels the order.
        expect(await s.db.prepare('SELECT status, void_reason FROM card_orders WHERE order_id = ?').bind(order.order_id).first())
            .toEqual({ status: 'cancelled', void_reason: 'refund' });
        const ledger = await s.db.prepare('SELECT kind, amount_minor, currency FROM card_ledger ORDER BY occurred_at_ms').all();
        expect(ledger.results).toEqual([{ kind: 'sale', amount_minor: 500, currency: 'USD' }, { kind: 'refund', amount_minor: -400, currency: 'XXX' }]);

        const closed = await handle(new Request(`https://pay.example/v1/card-orders/${order.order_id}/checkout`, {
            method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' }, body: '{}',
        }), s.env, s.deps);
        expect(closed.status).toBe(409);
    });

    it('refuses an order without a buyer country', async () => {
        vi.stubGlobal('fetch', cleengFetch().fetcher);
        const response = await service().open(null);
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'buyer_country_unknown' });
    });
});
