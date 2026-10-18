import { describe, expect, it, vi } from 'vitest';
import vectors from '../../../../protocol/youtick-market-v2/golden-vectors.json';
import { hexDecode } from '@/lib/crypto/codec';
import { NEAR_AUTH_PROVIDERS } from '@/lib/near-auth/config';
import { deriveRootKey, ticketKey } from '@/lib/ticket-keys/keys';
import { PublicKey } from 'near-api-js';
import { ticketMessage } from '@/lib/ticket-keys/messages';
import { INSTANT_ACCESS_CONSENT_VERSION } from '@/components/v2/instant-access-consent';
import { cardPriceLabel, cardRailFromEnv, openCardOrder, waitForCardTicket, type CardOrder } from '@/lib/v2/card-checkout';
import type { V2Config } from '@/lib/v2/config';
import type { DeviceKey } from '@/lib/v2/device-key';

vi.unmock('near-api-js');

const MARKET = 'v2-market-261007.youtick-dev-v3.testnet';
const SERVICE = 'https://payments.test';
const NOW = 1_792_005_000_000;
const config: V2Config = {
    auth: { network: 'testnet', clientId: 'client-1', provider: NEAR_AUTH_PROVIDERS.testnet! },
    marketContractId: MARKET, gateAccountId: 'ckd-gate.testnet', relayerUrl: 'https://relayer.test', bridgeUrl: 'https://bridge.test',
    paymentServiceUrl: SERVICE,
};
const ckdKey = hexDecode(vectors.key_derivation.ckd_key_hex);
const root = deriveRootKey(ckdKey);
const device: DeviceKey = {
    sessionPublicKey: vectors.ticket_signatures.purchase_device.fields.session_public_key,
    certificate: '{}', certificateSha256: vectors.fixture.certificate_sha256, sign: async () => '',
};
const HMAC = 'e'.repeat(64);
const checkout = { provider: 'cleeng', environment: 'sandbox', publisher_id: '123456789', offer_id: 'S229081230_US', jwt: 'jwt', refresh_token: 'refresh' };

function orderBody(ticketId: string, overrides: Record<string, unknown> = {}) {
    return {
        order_id: '0'.repeat(31) + '1', status: 'created', ticket_id: ticketId, publication_id: 'lp-job', payment_reference_hmac: HMAC,
        gross_minor: '500', currency: 'USD', needs_signature: true, ...overrides,
    };
}

function service(handler: (url: string, method: string, body: Record<string, unknown> | undefined) => Response) {
    const calls: { url: string; method: string; body?: Record<string, unknown> }[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
        calls.push({ url: String(input), method: init?.method ?? 'GET', body });
        return handler(String(input), init?.method ?? 'GET', body);
    }) as typeof fetch;
    return { calls, fetcher };
}

describe('card rail flag', () => {
    it('is off unless set to sandbox', () => {
        expect(cardRailFromEnv(undefined)).toBeNull();
        expect(cardRailFromEnv('production')).toBeNull();
        expect(cardRailFromEnv('true')).toBeNull();
        expect(cardRailFromEnv('sandbox')).toBe('sandbox');
    });

    it('shows the card price in dollars only for whole cents', () => {
        expect(cardPriceLabel('5000000')).toBe('$5.00');
        expect(cardPriceLabel('12340000')).toBe('$12.34');
        expect(cardPriceLabel('5000001')).toBeNull();
        expect(cardPriceLabel('-1')).toBeNull();
    });
});

describe('card order', () => {
    it('skips a ticket key an unpaid order holds and signs card_purchase with the next one', async () => {
        const second = ticketKey(root, 4);
        const { calls, fetcher } = service((url, _method, body) => {
            if (url.endsWith('/v1/card-orders')) {
                return body?.ticket_public_key === ticketKey(root, 3).publicKey
                    ? Response.json({ error: 'ticket_key_used' }, { status: 409 })
                    : Response.json({ ...orderBody(second.ticketId), checkout }, { status: 201 });
            }
            return Response.json(orderBody(second.ticketId, { status: 'awaiting_payment', needs_signature: false }));
        });
        const result = await openCardOrder({
            config, paymentServiceUrl: SERVICE, rail: 'sandbox', ckdKey, startIndex: 3, publicationId: 'lp-job', device, consentVersion: INSTANT_ACCESS_CONSENT_VERSION,
            deps: { view: async () => null as never, fetch: fetcher, now: () => NOW },
        });
        expect(result.ticketIndex).toBe(4);
        expect(result.order.status).toBe('awaiting_payment');
        expect(result.checkout).toEqual({ provider: 'cleeng', environment: 'sandbox', publisherId: '123456789', offerId: 'S229081230_US', jwt: 'jwt', refreshToken: 'refresh' });

        // Every order attempt carries the consent version the buyer ticked.
        expect(calls.slice(0, 2).map((call) => call.body?.consent_version)).toEqual([INSTANT_ACCESS_CONSENT_VERSION, INSTANT_ACCESS_CONSENT_VERSION]);
        const signed = calls[2];
        expect(signed.url).toBe(`${SERVICE}/v1/card-orders/${'0'.repeat(31)}1/device`);
        expect(Number(signed.body!.expires_at_ms) - NOW).toBeLessThanOrEqual(60 * 60 * 1000);
        // The signature is the protocol's card_purchase message over the order's reference and price.
        const message = ticketMessage({ network: 'testnet', contractId: MARKET }, 'card_purchase', second.ticketId, String(signed.body!.expires_at_ms), {
            publication_id: 'lp-job', session_public_key: device.sessionPublicKey, certificate_sha256: device.certificateSha256,
            payment_reference_hmac: HMAC, gross_minor: '500', currency: 'USD',
        });
        const signature = Uint8Array.from(atob(String(signed.body!.signature)), (char) => char.charCodeAt(0));
        expect(PublicKey.from(second.publicKey).verify(new TextEncoder().encode(message), signature)).toBe(true);
    });

    it('refuses a checkout session from another environment or provider', async () => {
        const ticket = ticketKey(root, 0);
        for (const bad of [{ ...checkout, environment: 'production' }, { ...checkout, provider: 'other' }, { ...checkout, offer_id: 'x' }, undefined]) {
            const { fetcher } = service(() => Response.json({ ...orderBody(ticket.ticketId), checkout: bad }, { status: 201 }));
            await expect(openCardOrder({
                config, paymentServiceUrl: SERVICE, rail: 'sandbox', ckdKey, startIndex: 0, publicationId: 'lp-job', device, consentVersion: INSTANT_ACCESS_CONSENT_VERSION,
                deps: { view: async () => null as never, fetch: fetcher, now: () => NOW },
            })).rejects.toThrow('checkout_unavailable');
        }
    });

    it('passes the service error code through', async () => {
        const { fetcher } = service(() => Response.json({ error: 'buyer_country_unknown' }, { status: 403 }));
        await expect(openCardOrder({
            config, paymentServiceUrl: SERVICE, rail: 'sandbox', ckdKey, startIndex: 0, publicationId: 'lp-job', device, consentVersion: INSTANT_ACCESS_CONSENT_VERSION,
            deps: { view: async () => null as never, fetch: fetcher, now: () => NOW },
        })).rejects.toThrow('buyer_country_unknown');
    });
});

describe('waiting for the card ticket', () => {
    const ticket = ticketKey(root, 0);
    const order: CardOrder = {
        orderId: '0'.repeat(31) + '1', status: 'awaiting_payment', ticketId: ticket.ticketId, publicationId: 'lp-job',
        paymentReferenceHmac: HMAC, grossMinor: '500', currency: 'USD', needsSignature: false,
    };
    const chainTicket = {
        ticket_id: ticket.ticketId, publication_id: 'lp-job', creator_id: 'creator.testnet', ticket_public_key: ticket.publicKey, rail: 'card',
        status: 'purchased', gross_usdc_micro: '5000000', purchased_at_ms: String(NOW), device_epoch: 0, devices: [],
    };

    it('signs again after a late payment and returns only once the ticket is on chain', async () => {
        const states = [
            orderBody(ticket.ticketId, { status: 'paid', needs_signature: true }),
            orderBody(ticket.ticketId, { status: 'issued', needs_signature: false }),
            orderBody(ticket.ticketId, { status: 'issued', needs_signature: false }),
        ];
        const { calls, fetcher } = service((url) => url.endsWith('/device')
            ? Response.json(orderBody(ticket.ticketId, { status: 'paid', needs_signature: false }))
            : Response.json(states.shift() ?? states[0]));
        let onChain: unknown = null;
        const view = vi.fn(async () => { const value = onChain; onChain = chainTicket; return value; });
        let clock = NOW;
        const result = await waitForCardTicket({
            config, paymentServiceUrl: SERVICE, order, ticket, device,
            deps: { view: view as never, fetch: fetcher, now: () => clock, sleep: async () => { clock += 4_000; } },
        });
        expect(result.rail).toBe('card');
        expect(calls.filter((call) => call.url.endsWith('/device'))).toHaveLength(1);
        expect(view).toHaveBeenCalledTimes(2);
    });

    it('ends on a refund, a timeout or a left page', async () => {
        const cancelled = service(() => Response.json(orderBody(ticket.ticketId, { status: 'cancelled', needs_signature: false })));
        await expect(waitForCardTicket({
            config, paymentServiceUrl: SERVICE, order, ticket, device, deps: { view: async () => null as never, fetch: cancelled.fetcher, now: () => NOW, sleep: async () => undefined },
        })).rejects.toThrow('card_payment_cancelled');

        let clock = NOW;
        const waiting = service(() => Response.json(orderBody(ticket.ticketId, { status: 'awaiting_payment', needs_signature: false })));
        await expect(waitForCardTicket({
            config, paymentServiceUrl: SERVICE, order, ticket, device, timeoutMs: 20_000,
            deps: { view: async () => null as never, fetch: waiting.fetcher, now: () => clock, sleep: async () => { clock += 4_000; } },
        })).rejects.toThrow('card_payment_timeout');

        const controller = new AbortController();
        controller.abort();
        await expect(waitForCardTicket({
            config, paymentServiceUrl: SERVICE, order, ticket, device, signal: controller.signal,
            deps: { view: async () => null as never, fetch: waiting.fetcher, now: () => NOW, sleep: async () => undefined },
        })).rejects.toThrow('checkout_left');
    });
});
