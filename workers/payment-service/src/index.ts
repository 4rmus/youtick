// youtick payment service (roadmap E7; E8 adds the card path). For now it issues VAT attestations
// for V2 crypto purchases and counts checkout funnel steps. It never moves money and stores no
// personal data.
import { paymentConfig, type Env, type PaymentConfig } from './env';
import { parseFunnelEvent, recordFunnelEvent } from './funnel';
import { readPurchasablePublication, rpcView, type View } from './market';
import { attestVat } from './vat';

export type { Env } from './env';

export interface PaymentDeps {
    view?: View;
    now?: () => number;
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

export async function handle(request: Request, env: Env, deps: PaymentDeps = {}): Promise<Response> {
    const config = paymentConfig(env);
    if (!config) return json({ error: 'payment_service_disabled' }, 503);
    const url = new URL(request.url);
    if (url.pathname !== '/v1/vat-attestations' && url.pathname !== '/v1/funnel') return json({ error: 'not_found' }, 404);
    const origin = request.headers.get('origin') ?? '';
    if (!config.allowedOrigins.includes(origin)) return json({ error: 'origin_denied' }, 403);
    const cors = {
        'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
    if (env.PAYMENT_RATE_LIMITER) {
        const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
        // The IP is only a limiter key here; it is never written anywhere.
        const scope = url.pathname === '/v1/funnel' ? 'funnel' : 'vat';
        if (!(await env.PAYMENT_RATE_LIMITER.limit({ key: `${scope}:ip:${ip}` })).success) return json({ error: 'rate_limited' }, 429, cors);
    }

    let body: Record<string, unknown>;
    try {
        if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new Error('invalid_request');
        const text = await request.text();
        if (text.length > 2_048) throw new Error('invalid_request');
        body = JSON.parse(text) as Record<string, unknown>;
    } catch {
        return json({ error: 'invalid_request' }, 400, cors);
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
};
