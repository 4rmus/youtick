// youtick payment service (roadmap E7; E8 adds the card path). It issues VAT attestations for V2
// crypto purchases, counts checkout funnel steps and keeps USDC refund requests until youtick
// decides (src/refunds.ts). It never moves money. The card path (src/card-*.ts, off until a
// provider adapter exists) writes and voids card tickets as the payment operator. For a refund request it stores the buyer's text
// and the refund account (a pseudonymous NEAR account tied to the ticket); no e-mail or IP.
import { CardOperator, wakeCardOperator } from './card-operator-object';
import type { CardProvider } from './card-provider';
import { handleCardInternal, handleCardPublic, handleCardWebhook, isCardPublicPath, type CardContext } from './card-routes';
import { cardConfig, paymentConfig, type Env, type PaymentConfig } from './env';
import { parseFunnelEvent, recordFunnelEvent } from './funnel';
import { readPurchasablePublication, rpcView, type View } from './market';
import {
    adminAuthorized, ANSWER_WITHIN_MS, decideRefundRequest, listRefundRequests, parseDecision, parseRefundRequest,
    storeRefundRequest, verifyRefundRequest,
} from './refunds';
import { attestVat } from './vat';

export type { Env } from './env';
export { CardOperator };

export interface PaymentDeps {
    view?: View;
    now?: () => number;
    /** The card provider adapter. None exists in production yet, so the card path stays off. */
    cardProvider?: CardProvider;
    wakeCardOperator?: () => Promise<void>;
}

/** Everything the card routes need, or null while the card path is off. */
function cardContext(env: Env, config: PaymentConfig, deps: PaymentDeps): CardContext | null {
    const card = cardConfig(env);
    if (!card || !deps.cardProvider || !env.REFUNDS) return null;
    return {
        db: env.REFUNDS, view: deps.view ?? rpcView(config.rpcUrl), provider: deps.cardProvider, config, card,
        nowMs: (deps.now ?? Date.now)(), wake: deps.wakeCardOperator ?? (() => wakeCardOperator(env)),
    };
}

const KEY_CHECK_TTL_MS = 60_000;
let keyCheck: { key: string; checkedAt: number } | null = null;

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

/** Refuses to sign with a key the Market does not hold for this version (revoked or rotated). */
async function assertKeyRegistered(view: View, config: PaymentConfig, nowMs: number): Promise<void> {
    const cacheKey = `${config.marketContractId}|${config.keyVersion}|${config.publicKey}`;
    if (keyCheck?.key === cacheKey && nowMs - keyCheck.checkedAt < KEY_CHECK_TTL_MS) return;
    const registered = await view<string | null>(config.marketContractId, 'get_vat_public_key', { key_version: config.keyVersion });
    if (registered !== config.publicKey) {
        keyCheck = null;
        throw new Error('vat_key_not_registered');
    }
    keyCheck = { key: cacheKey, checkedAt: nowMs };
}

const PUBLIC_PATHS = ['/v1/vat-attestations', '/v1/funnel', '/v1/refund-requests'];
const REFUND_ERRORS: Record<string, number> = {
    invalid_request: 400, invalid_reason: 400, invalid_signature: 400, signature_expired: 400, signature_expiry_too_far: 400,
    ticket_not_found: 404, ticket_not_refundable: 409, refund_window_closed: 409, refund_request_pending: 409,
    refund_request_not_found: 404, refund_request_decided: 409, ticket_not_refunded: 409, rpc_unavailable: 503,
};

function refundError(error: unknown, headers: Record<string, string> = {}): Response {
    const code = error instanceof Error ? error.message : '';
    if (REFUND_ERRORS[code]) return json({ error: code }, REFUND_ERRORS[code], headers);
    console.error(JSON.stringify({ event: 'refund_request_failed' }));
    return json({ error: 'internal_error' }, 500, headers);
}

async function readJson(request: Request, limit: number): Promise<Record<string, unknown>> {
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new Error('invalid_request');
    const text = await request.text();
    if (text.length > limit) throw new Error('invalid_request');
    const body = JSON.parse(text) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_request');
    return body as Record<string, unknown>;
}

/** The operator tool's endpoints: no browser origin, a bearer token instead. */
async function handleInternal(request: Request, env: Env, config: PaymentConfig, url: URL, deps: PaymentDeps): Promise<Response> {
    if (!adminAuthorized(request.headers.get('authorization'), env.REFUND_ADMIN_TOKEN)) return json({ error: 'unauthorized' }, 401);
    if (url.pathname.startsWith('/internal/card-')) {
        const card = cardContext(env, config, deps);
        if (!card) return json({ error: 'card_path_disabled' }, 503);
        return handleCardInternal(request, url, () => readJson(request, 2_048).catch(() => { throw new Error('invalid_request'); }), card);
    }
    if (!env.REFUNDS) return json({ error: 'refund_inbox_unavailable' }, 503);
    try {
        if (request.method === 'GET' && url.pathname === '/internal/refund-requests') {
            return json({ requests: await listRefundRequests(env.REFUNDS, url.searchParams.get('status') ?? 'pending') });
        }
        const decision = /^\/internal\/refund-requests\/([0-9a-f]{32})\/decision$/.exec(url.pathname);
        if (request.method === 'POST' && decision) {
            const view = deps.view ?? rpcView(config.rpcUrl);
            const row = await decideRefundRequest(env.REFUNDS, view, config.marketContractId, decision[1],
                parseDecision(await readJson(request, 1_024).catch(() => { throw new Error('invalid_request'); })), (deps.now ?? Date.now)());
            return json({ request: row });
        }
    } catch (error) {
        return refundError(error);
    }
    return json({ error: 'not_found' }, 404);
}

export async function handle(request: Request, env: Env, deps: PaymentDeps = {}): Promise<Response> {
    const config = paymentConfig(env);
    if (!config) return json({ error: 'payment_service_disabled' }, 503);
    const url = new URL(request.url);
    if (url.pathname.startsWith('/internal/')) return handleInternal(request, env, config, url, deps);
    if (url.pathname === '/webhooks/card') {
        // Server to server: no browser origin; the provider adapter authenticates the delivery.
        if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
        const card = cardContext(env, config, deps);
        if (!card) return json({ error: 'card_path_disabled' }, 503);
        return handleCardWebhook(request, card);
    }
    const isCard = isCardPublicPath(url.pathname);
    if (!PUBLIC_PATHS.includes(url.pathname) && !isCard) return json({ error: 'not_found' }, 404);
    const origin = request.headers.get('origin') ?? '';
    if (!config.allowedOrigins.includes(origin)) return json({ error: 'origin_denied' }, 403);
    const cors = {
        'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': isCard ? 'GET, POST, OPTIONS' : 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST' && !(isCard && request.method === 'GET')) return json({ error: 'method_not_allowed' }, 405, cors);
    if (env.PAYMENT_RATE_LIMITER) {
        const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
        // The IP is only a limiter key here; it is never written anywhere.
        const scope = isCard ? 'card' : url.pathname === '/v1/funnel' ? 'funnel' : url.pathname === '/v1/refund-requests' ? 'refund' : 'vat';
        if (!(await env.PAYMENT_RATE_LIMITER.limit({ key: `${scope}:ip:${ip}` })).success) return json({ error: 'rate_limited' }, 429, cors);
    }

    if (isCard) {
        const card = cardContext(env, config, deps);
        if (!card) return json({ error: 'card_path_disabled' }, 503, cors);
        let cardBody: Record<string, unknown> | null = null;
        if (request.method === 'POST') {
            try {
                cardBody = await readJson(request, 2_048);
            } catch {
                return json({ error: 'invalid_request' }, 400, cors);
            }
        }
        return handleCardPublic(request, url, cardBody, card, cors);
    }

    let body: Record<string, unknown>;
    try {
        // A refund request carries up to 1,000 characters of the buyer's text (escaped in JSON).
        body = await readJson(request, url.pathname === '/v1/refund-requests' ? 8_192 : 2_048);
    } catch {
        return json({ error: 'invalid_request' }, 400, cors);
    }
    if (url.pathname === '/v1/refund-requests') {
        if (!env.REFUNDS) return json({ error: 'refund_inbox_unavailable' }, 503, cors);
        const nowMs = (deps.now ?? Date.now)();
        try {
            const input = parseRefundRequest(body);
            const { ticket, windowClosesAtMs } = await verifyRefundRequest(deps.view ?? rpcView(config.rpcUrl), input, {
                network: config.network, contractId: config.marketContractId, nowMs,
            });
            const row = await storeRefundRequest(env.REFUNDS, input, ticket.publication_id, nowMs);
            // The answer must come while the contract still accepts the refund.
            const answerBy = windowClosesAtMs === null ? nowMs + ANSWER_WITHIN_MS : Math.min(nowMs + ANSWER_WITHIN_MS, windowClosesAtMs);
            return json({
                request_id: row.request_id, status: row.status, answer_by_ms: String(answerBy),
                refund_window_closes_at_ms: windowClosesAtMs === null ? null : String(windowClosesAtMs),
            }, 201, cors);
        } catch (error) {
            return refundError(error, cors);
        }
    }
    if (url.pathname === '/v1/funnel') {
        try {
            const event = parseFunnelEvent(body);
            if (env.FUNNEL) recordFunnelEvent(env.FUNNEL, event);
        } catch {
            return json({ error: 'invalid_request' }, 400, cors);
        }
        return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', ...cors } });
    }
    // No buyer location or identity is accepted: the testnet policy is one fixed rate (X3 pending).
    const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort() : [];
    if (keys.join(',') !== 'publication_id,ticket_id' || typeof body.ticket_id !== 'string' || !/^[0-9a-f]{64}$/.test(body.ticket_id)
        || typeof body.publication_id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(body.publication_id)) {
        return json({ error: 'invalid_request' }, 400, cors);
    }

    const view = deps.view ?? rpcView(config.rpcUrl);
    const nowMs = (deps.now ?? Date.now)();
    try {
        await assertKeyRegistered(view, config, nowMs);
        const gross = await readPurchasablePublication(view, config.marketContractId, body.publication_id);
        // An existing ticket_id would be refunded by the contract; do not attest it.
        if (await view<unknown>(config.marketContractId, 'get_ticket', { ticket_id: body.ticket_id }) !== null) {
            return json({ error: 'ticket_exists' }, 409, cors);
        }
        const attestation = attestVat({
            network: config.network, contractId: config.marketContractId, ticketId: body.ticket_id, publicationId: body.publication_id,
            grossUsdcMicro: gross, rateBps: config.rateBps, keyVersion: config.keyVersion, nowMs,
        }, config.signer);
        return json(attestation, 200, cors);
    } catch (error) {
        const code = error instanceof Error ? error.message : '';
        const known: Record<string, number> = {
            publication_not_found: 404, publication_not_available: 409, price_below_minimum: 409,
            vat_key_not_registered: 503, rpc_unavailable: 503,
        };
        if (known[code]) return json({ error: code }, known[code], cors);
        console.error(JSON.stringify({ event: 'vat_attestation_failed' }));
        return json({ error: 'internal_error' }, 500, cors);
    }
}

export function resetKeyCheckForTests(): void {
    keyCheck = null;
}

export default {
    fetch: (request: Request, env: Env) => handle(request, env),
    // A safety net for the card operator's own alarm (wrangler.toml cron).
    scheduled: async (_controller: ScheduledController, env: Env) => {
        if (cardConfig(env)) await wakeCardOperator(env);
    },
};
