// Card path (roadmap E8): the boundary to the card provider (merchant of record). An adapter makes
// the provider order and turns an authenticated webhook into youtick events; nothing else in the
// service knows the provider's API. The Cleeng adapter (src/cleeng.ts) is written from the public
// documentation and has not met the sandbox (roadmap X1), so the card path stays disabled (README,
// "Card path").
import type { CardEvent } from './card-events';

/** What the buyer's page needs to pay one order in the provider's checkout; never stored. */
export interface CheckoutSession {
    provider: string;
    [field: string]: string;
}

export interface CardProvider {
    /** Stored with each order; also the key of its events. */
    readonly name: string;
    /**
     * Makes the provider order for one publication at a fixed price. `country` is the buyer's
     * country from the request's IP (Cloudflare), used by the provider for tax and never stored.
     */
    createOrder(input: { orderId: string; publicationId: string; grossMinor: number; currency: string; country: string | null }): Promise<{ providerOrderId: string; checkout?: CheckoutSession }>;
    /** A fresh checkout session for an order that is still open, when the provider's expires. */
    checkoutSession?(orderId: string, providerOrderId: string): Promise<CheckoutSession>;
    /**
     * Authenticates one webhook delivery and maps it to events. Throws `invalid_webhook` for a
     * delivery that fails authentication; returns [] for a topic the card path does not use. The
     * adapter resolves `providerOrderId` to the id `createOrder` returned. `providerEventId` must be
     * unique per event, not per delivery (e.g. `<delivery id>:<index>`). A refund that arrived by
     * webhook is not imported again from a report; `card-orders.mjs reconcile` flags a double one.
     */
    parseWebhook(request: Request): Promise<CardEvent[]>;
}

function base64(bytes: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function constantTimeEqual(a: string, b: string): boolean {
    const left = new TextEncoder().encode(a);
    const right = new TextEncoder().encode(b);
    let diff = left.length ^ right.length;
    for (let i = 0; i < right.length; i += 1) diff |= right[i] ^ (left[i] ?? 0);
    return diff === 0;
}

/**
 * Cleeng's documented webhook signature (developers.cleeng.com/docs/webhooks-configuration, read
 * 2026-10-15): header `X-Webhook-Signature` = Base64(HMAC-SHA256(endpoint secret, raw body)). No
 * timestamp is signed, so replays are stopped by storing each `X-Webhook-Delivery-Id` once
 * (card_events). Not yet checked against a sandbox delivery (EXTERNAL_NOT_RUN).
 */
export async function verifyCleengSignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
    if (!header || secret.length < 16) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return constantTimeEqual(header.trim(), base64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))));
}
