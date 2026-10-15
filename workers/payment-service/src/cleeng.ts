// Card path (roadmap E8.1): the Cleeng adapter. Written from Cleeng's public documentation (read
// 2026-10-15); nothing here has met the sandbox yet (EXTERNAL_NOT_RUN), so every field mapping is a
// documented shape, not an observed one.
//
// Cleeng's webhooks carry no order id, so each youtick order gets its own `vod` offer at the
// order's price and the offer id is the provider order id: `transactionCreated` and
// `paymentRefunded` both name the offer. Each order also gets its own customer under an `.invalid`
// address (`<order id>@buyers.youtick.invalid`, externalId = order id), so youtick never sends or
// stores a buyer's e-mail and no ticket is tied to a person. The buyer pays in Cleeng's hosted
// checkout with that customer's short-lived session, which goes to the browser and is not stored.
import type { CardEvent } from './card-events';
import { verifyCleengSignature, type CardProvider, type CheckoutSession } from './card-provider';

export const CLEENG_HOSTS = {
    sandbox: { core: 'https://api.sandbox.cleeng.com/3.1', mediastore: 'https://mediastoreapi-sandbox.cleeng.com' },
    production: { core: 'https://api.cleeng.com/3.1', mediastore: 'https://mediastoreapi.cleeng.com' },
} as const;

export interface CleengConfig {
    environment: keyof typeof CLEENG_HOSTS;
    /** The broadcaster id every webhook envelope must name. */
    publisherId: string;
    /** Secret. `X-Publisher-Token` for the Core and MediaStore APIs. */
    publisherToken: string;
    /** Secret. The endpoint's signing secret (`whsec_…`). */
    webhookSecret: string;
}

const OFFER_ID = /^[A-Z][0-9]{6,12}(_[A-Z]{2})?$/;
const DELIVERY_ID = /^[A-Za-z0-9-]{8,64}$/;
const COUNTRY = /^[A-Z]{2}$/;
/** Never a real country: unknown, Tor and Cloudflare's own codes. */
const NOT_A_COUNTRY = new Set(['XX', 'T1', 'A1', 'A2', 'O1', 'EU', 'AP']);
/** Cleeng's Refunds webhook names no currency; the ledger keeps the amount under ISO 4217 `XXX` until the report import (E8.4). */
export const UNKNOWN_CURRENCY = 'XXX';
const REQUEST_TIMEOUT_MS = 10_000;

function fail(code: string): never {
    throw new Error(code);
}

export function buyerEmail(orderId: string): string {
    return `${orderId}@buyers.youtick.invalid`;
}

/** A Cleeng amount (major units, number or string such as "10.0000") as whole minor units, or null. */
export function minorUnits(value: unknown): number | null {
    const text = typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(4) : '') : typeof value === 'string' ? value.trim() : '';
    const match = /^([0-9]{1,9})(?:\.([0-9]{1,6}))?$/.exec(text);
    if (!match) return null;
    const fraction = (match[2] ?? '').padEnd(6, '0');
    // Only whole cents: a fraction of a cent is a mapping error, not a rounding question.
    if (fraction.slice(2) !== '0000') return null;
    return Number(match[1]) * 100 + Number(fraction.slice(0, 2));
}

function seconds(value: unknown, fallbackMs: number): number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value * 1000 : fallbackMs;
}

export function cleengProvider(config: CleengConfig, options: { fetcher?: typeof fetch; now?: () => number } = {}): CardProvider {
    const hosts = CLEENG_HOSTS[config.environment];
    const fetcher = options.fetcher ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    const now = options.now ?? Date.now;

    async function call<T>(url: string, body: unknown): Promise<T> {
        let response: Response;
        try {
            response = await fetcher(url, {
                method: 'POST', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), body: JSON.stringify(body),
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Publisher-Token': config.publisherToken },
            });
        } catch {
            fail('provider_unavailable');
        }
        if (!response.ok) {
            // The status alone: Cleeng's error body may echo customer fields.
            console.error(JSON.stringify({ event: 'cleeng_request_failed', path: new URL(url).pathname.replace(/[0-9]+/g, ':n'), status: response.status }));
            fail('provider_unavailable');
        }
        try {
            return await response.json() as T;
        } catch {
            fail('provider_unavailable');
        }
    }

    async function session(orderId: string): Promise<CheckoutSession> {
        const auth = await call<{ responseData?: { jwt?: unknown; refreshToken?: unknown } }>(`${hosts.mediastore}/sso/auths`, { email: buyerEmail(orderId) });
        const jwt = auth.responseData?.jwt;
        const refreshToken = auth.responseData?.refreshToken;
        if (typeof jwt !== 'string' || typeof refreshToken !== 'string' || jwt.length > 4_096 || refreshToken.length > 4_096) fail('provider_unavailable');
        return { provider: 'cleeng', environment: config.environment, publisher_id: config.publisherId, jwt, refresh_token: refreshToken };
    }

    return {
        name: 'cleeng',

        async createOrder(input) {
            if (!COUNTRY.test(input.country ?? '') || NOT_A_COUNTRY.has(input.country!)) fail('buyer_country_unknown');
            if (!Number.isSafeInteger(input.grossMinor) || input.grossMinor <= 0 || input.currency !== 'USD') fail('invalid_request');
            const offer = await call<{ id?: unknown }>(`${hosts.core}/offers`, {
                title: `youtick ticket ${input.publicationId}`.slice(0, 70),
                type: 'vod',
                price: { amount: input.grossMinor / 100, currency: input.currency },
                // Access is the ticket on NEAR; Cleeng's own entitlement is not used. The documented
                // minimum unit for `vod` is an hour.
                entitlement: { duration: { periodUnit: 'hour', amount: 1 } },
                externalProperties: { order_id: input.orderId, publication_id: input.publicationId },
            });
            if (typeof offer.id !== 'string' || !OFFER_ID.test(offer.id)) fail('provider_unavailable');
            const customer = await call<{ data?: { id?: unknown } }>(`${hosts.core}/customers`, {
                email: buyerEmail(input.orderId), externalId: input.orderId, locale: 'en_US', country: input.country, currency: input.currency,
            });
            if (!Number.isSafeInteger(customer.data?.id)) fail('provider_unavailable');
            return { providerOrderId: offer.id, checkout: { ...await session(input.orderId), offer_id: offer.id } };
        },

        async checkoutSession(orderId, providerOrderId) {
            return { ...await session(orderId), offer_id: providerOrderId };
        },

        async parseWebhook(request) {
            const raw = await request.text();
            if (raw.length > 64 * 1024 || !await verifyCleengSignature(raw, request.headers.get('x-webhook-signature'), config.webhookSecret)) {
                fail('invalid_webhook');
            }
            const deliveryId = request.headers.get('x-webhook-delivery-id') ?? '';
            let envelope: { broadcasterId?: unknown; topic?: unknown; data?: Record<string, unknown> };
            try {
                envelope = JSON.parse(raw);
            } catch {
                fail('invalid_webhook');
            }
            if (!DELIVERY_ID.test(deliveryId) || String(envelope.broadcasterId) !== config.publisherId || typeof envelope.data !== 'object' || !envelope.data) {
                fail('invalid_webhook');
            }
            const data = envelope.data;
            const offerId = typeof data.offerId === 'string' && OFFER_ID.test(data.offerId) ? data.offerId : null;
            const base = { providerEventId: `${deliveryId}:0`, providerOrderId: offerId ?? '' };
            if (envelope.topic === 'transactionCreated') {
                // The offer's own price and currency are what the ticket key signed; the charged
                // amount may be in the buyer's currency and include tax (transactionPriceInclTax).
                const amountMinor = minorUnits(data.offerPrice);
                const currency = typeof data.offerCurrency === 'string' ? data.offerCurrency : '';
                if (!offerId || amountMinor === null || amountMinor <= 0 || !/^[A-Z]{3}$/.test(currency)) fail('invalid_webhook');
                return [{ ...base, kind: 'purchase', amountMinor, currency, occurredAtMs: seconds(data.transactionDate, now()) } satisfies CardEvent];
            }
            if (envelope.topic === 'paymentRefunded') {
                const amountMinor = minorUnits(data.amount);
                if (!offerId || amountMinor === null || amountMinor <= 0) fail('invalid_webhook');
                return [{ ...base, kind: 'refund', amountMinor, currency: UNKNOWN_CURRENCY, occurredAtMs: now() } satisfies CardEvent];
            }
            // Every other topic is acknowledged and ignored; chargebacks have no webhook at all.
            return [];
        },
    };
}
