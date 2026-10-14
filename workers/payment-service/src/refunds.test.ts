import { KeyPair } from 'near-api-js';
import { beforeEach, describe, expect, it } from 'vitest';
import { handle, resetKeyCheckForTests, type Env } from './index';
import type { View } from './market';
import { adminAuthorized, cleanReason, refundMessage } from './refunds';
import { sqliteD1 } from './test-support/sqlite-d1.mjs';

const MARKET = 'v2-market-261007.youtick-dev-v3.testnet';
const ORIGIN = 'http://localhost:3000';
const NOW = 1_792_005_000_000;
const DAY = 24 * 60 * 60 * 1000;
const ADMIN_TOKEN = 'a'.repeat(40);
const TX = '9DnzFAJjxjX2xsi6K3ZbESRUjp2RKxvLu45ntYAUzngf';

const d1 = sqliteD1;

const ticketKey = KeyPair.fromRandom('ed25519');
const vatKey = KeyPair.fromRandom('ed25519');
const TICKET_ID = 'b'.repeat(64);

function sign(input: { expiresAtMs: string; refundTo: string; key?: KeyPair; ticketId?: string }): string {
    const message = refundMessage({ network: 'testnet', contractId: MARKET, ticketId: input.ticketId ?? TICKET_ID,
        expiresAtMs: input.expiresAtMs, refundTo: input.refundTo });
    const { signature } = (input.key ?? ticketKey).sign(new TextEncoder().encode(message));
    return btoa(String.fromCharCode(...signature));
}

function chain(overrides: { status?: string; rail?: string; purchasedAtMs?: number; availability?: string } = {}) {
    const state = {
        status: overrides.status ?? 'watched_in_escrow', rail: overrides.rail ?? 'crypto',
        purchasedAtMs: overrides.purchasedAtMs ?? NOW - DAY, availability: overrides.availability ?? 'ACTIVE',
    };
    const view: View = async <T,>(_contract: string, method: string, args: Record<string, unknown>) => {
        if (method === 'get_ticket') {
            return (args.ticket_id === TICKET_ID ? {
                ticket_id: TICKET_ID, ticket_public_key: ticketKey.getPublicKey().toString(), publication_id: 'lp-job',
                rail: state.rail, status: state.status, purchased_at_ms: String(state.purchasedAtMs),
            } : null) as T;
        }
        if (method === 'get_publication') return { publication_id: 'lp-job', availability: state.availability } as T;
        throw new Error(`unexpected ${method}`);
    };
    return { state, view };
}

function env(refunds: D1Database | null = d1()): Env {
    return {
        PAYMENT_SERVICE_ENABLED: 'true', NEAR_NETWORK: 'testnet', NEAR_RPC_URL: 'https://rpc.example', MARKET_V2_CONTRACT_ID: MARKET,
        VAT_POLICY: 'fixed-testnet', VAT_RATE_BPS: '2000', VAT_KEY_VERSION: '1', VAT_SIGNER_PRIVATE_KEY: vatKey.toString(),
        ALLOWED_ORIGINS: ORIGIN, REFUNDS: refunds ?? undefined, REFUND_ADMIN_TOKEN: ADMIN_TOKEN,
    };
}

function body(overrides: Record<string, unknown> = {}) {
    const expires = String(NOW + 7 * DAY - 5 * 60 * 1000);
    return {
        ticket_id: TICKET_ID, refund_to: 'fan.testnet', expires_at_ms: expires,
        signature: sign({ expiresAtMs: expires, refundTo: 'fan.testnet' }), reason: 'The video stops after a minute.', ...overrides,
    };
}

function post(value: unknown, origin = ORIGIN) {
    return new Request('https://pay.example/v1/refund-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(value),
    });
}

function internal(path: string, init: RequestInit = {}, token = ADMIN_TOKEN) {
    return new Request(`https://pay.example${path}`, {
        ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
}

describe('refund request inbox', () => {
    beforeEach(() => resetKeyCheckForTests());

    it('accepts a ticket-key-signed request for a watched ticket in escrow and lists it for the operator', async () => {
        const e = env();
        const { view } = chain();
        const response = await handle(post(body()), e, { view, now: () => NOW });
        expect(response.status).toBe(201);
        expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
        const created = await response.json() as { request_id: string; status: string; answer_by_ms: string };
        expect(created).toMatchObject({ status: 'pending', answer_by_ms: String(NOW + 72 * 60 * 60 * 1000) });
        expect(created.request_id).toMatch(/^[0-9a-f]{32}$/);

        const list = await handle(internal('/internal/refund-requests'), e, { view, now: () => NOW });
        const { requests } = await list.json() as { requests: { request_id: string; reason: string; publication_id: string }[] };
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({ request_id: created.request_id, reason: 'The video stops after a minute.', publication_id: 'lp-job' });

        // One open request per ticket.
        expect((await handle(post(body()), e, { view, now: () => NOW })).status).toBe(409);
    });

    it('refuses requests the contract would refuse', async () => {
        const cases: [Record<string, unknown>, ReturnType<typeof chain>, string][] = [
            [{ signature: sign({ expiresAtMs: body().expires_at_ms, refundTo: 'fan.testnet', key: KeyPair.fromRandom('ed25519') }) }, chain(), 'invalid_signature'],
            [{ refund_to: 'attacker.testnet' }, chain(), 'invalid_signature'],
            [{}, chain({ status: 'watched' }), 'ticket_not_refundable'],
            [{}, chain({ status: 'released' }), 'ticket_not_refundable'],
            [{}, chain({ rail: 'card' }), 'ticket_not_refundable'],
            [{}, chain({ purchasedAtMs: NOW - 30 * DAY }), 'refund_window_closed'],
            [{ ticket_id: 'c'.repeat(64), signature: sign({ expiresAtMs: body().expires_at_ms, refundTo: 'fan.testnet', ticketId: 'c'.repeat(64) }) }, chain(), 'ticket_not_found'],
            [{ expires_at_ms: String(NOW), signature: sign({ expiresAtMs: String(NOW), refundTo: 'fan.testnet' }) }, chain(), 'signature_expired'],
            [{ expires_at_ms: String(NOW + 7 * DAY + 1), signature: sign({ expiresAtMs: String(NOW + 7 * DAY + 1), refundTo: 'fan.testnet' }) }, chain(), 'signature_expiry_too_far'],
            [{ reason: 'short' }, chain(), 'invalid_reason'],
            [{ reason: 'bad\u0007control text' }, chain(), 'invalid_reason'],
            [{ extra: 1 }, chain(), 'invalid_request'],
        ];
        for (const [overrides, { view }, code] of cases) {
            const response = await handle(post(body(overrides)), env(), { view, now: () => NOW });
            expect(await response.json(), code).toEqual({ error: code });
        }
        // After a takedown the window stays open.
        const takedown = chain({ purchasedAtMs: NOW - 90 * DAY, availability: 'TAKEDOWN' });
        expect((await handle(post(body()), env(), { view: takedown.view, now: () => NOW })).status).toBe(201);
        expect((await handle(post(body(), 'https://evil.example'), env(), { view: chain().view, now: () => NOW })).status).toBe(403);
        expect((await handle(post(body()), env(null), { view: chain().view, now: () => NOW })).status).toBe(503);
    });

    it('records a refund only when the chain shows it, and a decline with a note', async () => {
        const e = env();
        const { state, view } = chain();
        const { request_id: first } = await (await handle(post(body()), e, { view, now: () => NOW })).json() as { request_id: string };
        const decide = (id: string, value: unknown) => handle(internal(`/internal/refund-requests/${id}/decision`, {
            method: 'POST', body: JSON.stringify(value),
        }), e, { view, now: () => NOW + 1000 });

        expect(await (await decide(first, { decision: 'refunded', tx_hash: TX })).json()).toEqual({ error: 'ticket_not_refunded' });
        state.status = 'refunded';
        const refunded = await (await decide(first, { decision: 'refunded', tx_hash: TX })).json() as { request: Record<string, unknown> };
        expect(refunded.request).toMatchObject({ status: 'refunded', tx_hash: TX, decided_at_ms: NOW + 1000 });
        expect(await (await decide(first, { decision: 'declined', note: 'late' })).json()).toEqual({ error: 'refund_request_decided' });

        // A new request after a decline is allowed (the ticket is back in escrow in this fake chain).
        state.status = 'purchased';
        const { request_id: second } = await (await handle(post(body()), e, { view, now: () => NOW })).json() as { request_id: string };
        const declined = await (await decide(second, { decision: 'declined', note: 'The video plays normally; change of mind.' })).json() as { request: Record<string, unknown> };
        expect(declined.request).toMatchObject({ status: 'declined', decision_note: 'The video plays normally; change of mind.' });
        expect(await (await decide('f'.repeat(32), { decision: 'declined', note: 'none' })).json()).toEqual({ error: 'refund_request_not_found' });
        expect((await decide(second, { decision: 'approved' })).status).toBe(400);
    });

    it('guards the operator endpoints with the admin token', async () => {
        const e = env();
        const { view } = chain();
        expect((await handle(internal('/internal/refund-requests', {}, 'b'.repeat(40)), e, { view })).status).toBe(401);
        expect((await handle(new Request('https://pay.example/internal/refund-requests'), e, { view })).status).toBe(401);
        expect((await handle(internal('/internal/refund-requests'), { ...e, REFUND_ADMIN_TOKEN: 'short' }, { view })).status).toBe(401);
        expect((await handle(internal('/internal/refund-requests?status=everything'), e, { view })).status).toBe(400);
        expect(adminAuthorized(`Bearer ${ADMIN_TOKEN}`, ADMIN_TOKEN)).toBe(true);
        expect(adminAuthorized(`Bearer ${ADMIN_TOKEN}x`, ADMIN_TOKEN)).toBe(false);
        expect(cleanReason('  line one\r\nline two  ')).toBe('line one\nline two');
    });
});
