// USDC refund request inbox (owner decision 2026-10-10: technical failure, not as described or
// takedown; no change of mind). The buyer's ticket key signs `refund_ticket`; this service checks the
// request against Market V2 and keeps it until youtick decides. It never signs or sends a refund:
// the payment operator does that from its own machine (scripts/refunds.mjs), and a request is
// marked `refunded` only after the chain says so.
import { PublicKey } from 'near-api-js';
import type { View } from './market';

export const TICKET_SIGNATURE_DOMAIN = 'youtick.market-v2.ticket-sig.v1';
/** The contract's refund window. */
export const REFUND_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** A `refund_ticket` signature may be up to 7 days ahead of block time. */
export const MAX_REFUND_SIGNATURE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** youtick's answer time. */
export const ANSWER_WITHIN_MS = 72 * 60 * 60 * 1000;

const TICKET_ID = /^[0-9a-f]{64}$/;
const ACCOUNT_ID = /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const DECIMAL = /^[1-9][0-9]{0,15}$/;
const SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;
const REQUEST_ID = /^[0-9a-f]{32}$/;
const TX_HASH = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;

export interface RefundRequestInput {
    ticket_id: string;
    refund_to: string;
    expires_at_ms: string;
    signature: string;
    reason: string;
}

export interface TicketView {
    ticket_id: string;
    ticket_public_key: string;
    publication_id: string;
    rail: string;
    status: string;
    purchased_at_ms: string;
}

export interface RefundRow {
    request_id: string;
    ticket_id: string;
    publication_id: string;
    refund_to: string;
    expires_at_ms: number;
    signature: string;
    reason: string;
    status: 'pending' | 'refunded' | 'declined';
    created_at_ms: number;
    decided_at_ms: number | null;
    decision_note: string | null;
    tx_hash: string | null;
}

function fail(code: string): never {
    throw new Error(code);
}

/** Trims and checks the buyer's text: 10-1000 characters, no control characters except line breaks. */
export function cleanReason(value: unknown): string {
    if (typeof value !== 'string') fail('invalid_request');
    const reason = value.replace(/\r\n?/g, '\n').trim();
    // eslint-disable-next-line no-control-regex
    if (reason.length < 10 || reason.length > 1000 || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(reason)) fail('invalid_reason');
    return reason;
}

export function parseRefundRequest(body: Record<string, unknown>): RefundRequestInput {
    const keys = Object.keys(body).sort().join(',');
    if (keys !== 'expires_at_ms,reason,refund_to,signature,ticket_id'
        || typeof body.ticket_id !== 'string' || !TICKET_ID.test(body.ticket_id)
        || typeof body.refund_to !== 'string' || !ACCOUNT_ID.test(body.refund_to)
        || typeof body.expires_at_ms !== 'string' || !DECIMAL.test(body.expires_at_ms)
        || typeof body.signature !== 'string' || !SIGNATURE.test(body.signature)) {
        fail('invalid_request');
    }
    return {
        ticket_id: body.ticket_id, refund_to: body.refund_to, expires_at_ms: body.expires_at_ms,
        signature: body.signature, reason: cleanReason(body.reason),
    };
}

export function refundMessage(input: { network: string; contractId: string; ticketId: string; expiresAtMs: string; refundTo: string }): string {
    return [TICKET_SIGNATURE_DOMAIN, input.network, input.contractId, 'refund_ticket', input.ticketId, input.expiresAtMs, input.refundTo].join('\n');
}

function base64Bytes(value: string): Uint8Array {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

/**
 * The checks the contract makes when the operator submits, done now so that youtick only reviews
 * requests that can still be refunded: a crypto ticket in escrow, inside the window (or taken
 * down), signed by its own ticket key, with a signature that lives long enough for a decision.
 */
export async function verifyRefundRequest(view: View, input: RefundRequestInput, context: {
    network: string; contractId: string; nowMs: number;
}): Promise<{ ticket: TicketView }> {
    const expires = Number(input.expires_at_ms);
    if (expires <= context.nowMs) fail('signature_expired');
    if (expires - context.nowMs > MAX_REFUND_SIGNATURE_TTL_MS) fail('signature_expiry_too_far');
    const ticket = await view<TicketView | null>(context.contractId, 'get_ticket', { ticket_id: input.ticket_id });
    if (!ticket || ticket.ticket_id !== input.ticket_id) fail('ticket_not_found');
    if (ticket.rail !== 'crypto') fail('ticket_not_refundable');
    if (ticket.status !== 'purchased' && ticket.status !== 'watched_in_escrow') fail('ticket_not_refundable');
    const publication = await view<{ availability?: string } | null>(context.contractId, 'get_publication', { publication_id: ticket.publication_id });
    const takenDown = publication?.availability === 'TAKEDOWN';
    if (!takenDown && Number(ticket.purchased_at_ms) + REFUND_WINDOW_MS <= context.nowMs) fail('refund_window_closed');
    let valid = false;
    try {
        valid = PublicKey.from(ticket.ticket_public_key).verify(new TextEncoder().encode(refundMessage({
            network: context.network, contractId: context.contractId, ticketId: input.ticket_id,
            expiresAtMs: input.expires_at_ms, refundTo: input.refund_to,
        })), base64Bytes(input.signature));
    } catch {
        valid = false;
    }
    if (!valid) fail('invalid_signature');
    return { ticket };
}

function randomId(): string {
    return [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function storeRefundRequest(db: D1Database, input: RefundRequestInput, publicationId: string, nowMs: number): Promise<RefundRow> {
    const existing = await db.prepare(`SELECT request_id, created_at_ms FROM refund_requests WHERE ticket_id = ? AND status = 'pending'`)
        .bind(input.ticket_id).first<{ request_id: string; created_at_ms: number }>();
    if (existing) fail('refund_request_pending');
    const row: RefundRow = {
        request_id: randomId(), ticket_id: input.ticket_id, publication_id: publicationId, refund_to: input.refund_to,
        expires_at_ms: Number(input.expires_at_ms), signature: input.signature, reason: input.reason, status: 'pending',
        created_at_ms: nowMs, decided_at_ms: null, decision_note: null, tx_hash: null,
    };
    try {
        await db.prepare(`INSERT INTO refund_requests (request_id, ticket_id, publication_id, refund_to, expires_at_ms, signature, reason,
            status, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
            .bind(row.request_id, row.ticket_id, row.publication_id, row.refund_to, row.expires_at_ms, row.signature, row.reason, nowMs).run();
    } catch {
        // The partial unique index refuses a second open request for the same ticket.
        fail('refund_request_pending');
    }
    return row;
}

export async function listRefundRequests(db: D1Database, status: string): Promise<RefundRow[]> {
    if (!['pending', 'refunded', 'declined'].includes(status)) fail('invalid_request');
    const result = await db.prepare(`SELECT * FROM refund_requests WHERE status = ? ORDER BY created_at_ms LIMIT 100`).bind(status).all<RefundRow>();
    return result.results ?? [];
}

export interface Decision {
    decision: 'refunded' | 'declined';
    note: string | null;
    tx_hash: string | null;
}

export function parseDecision(body: Record<string, unknown>): Decision {
    const keys = Object.keys(body).sort().join(',');
    if (body.decision === 'declined' && (keys === 'decision,note')) {
        if (typeof body.note !== 'string' || body.note.trim().length < 3 || body.note.length > 500) fail('invalid_request');
        return { decision: 'declined', note: body.note.trim(), tx_hash: null };
    }
    if (body.decision === 'refunded' && keys === 'decision,tx_hash' && typeof body.tx_hash === 'string' && TX_HASH.test(body.tx_hash)) {
        return { decision: 'refunded', note: null, tx_hash: body.tx_hash };
    }
    fail('invalid_request');
}

/** Records a decision on a pending request. `refunded` needs the chain to show the ticket refunded. */
export async function decideRefundRequest(db: D1Database, view: View, contractId: string, requestId: string, decision: Decision, nowMs: number): Promise<RefundRow> {
    if (!REQUEST_ID.test(requestId)) fail('invalid_request');
    const row = await db.prepare(`SELECT * FROM refund_requests WHERE request_id = ?`).bind(requestId).first<RefundRow>();
    if (!row) fail('refund_request_not_found');
    if (row.status !== 'pending') fail('refund_request_decided');
    if (decision.decision === 'refunded') {
        const ticket = await view<TicketView | null>(contractId, 'get_ticket', { ticket_id: row.ticket_id });
        if (ticket?.status !== 'refunded') fail('ticket_not_refunded');
    }
    const updated = await db.prepare(`UPDATE refund_requests SET status = ?, decided_at_ms = ?, decision_note = ?, tx_hash = ?
        WHERE request_id = ? AND status = 'pending'`)
        .bind(decision.decision, nowMs, decision.note, decision.tx_hash, requestId).run();
    if (!updated.meta?.changes) fail('refund_request_decided');
    return { ...row, status: decision.decision, decided_at_ms: nowMs, decision_note: decision.note, tx_hash: decision.tx_hash };
}

/** Constant-time comparison of the admin bearer token. */
export function adminAuthorized(header: string | null, token: string | undefined): boolean {
    if (!token || token.length < 32 || !header?.startsWith('Bearer ')) return false;
    const given = new TextEncoder().encode(header.slice('Bearer '.length));
    const expected = new TextEncoder().encode(token);
    let diff = given.length ^ expected.length;
    for (let i = 0; i < expected.length; i += 1) diff |= expected[i] ^ (given[i] ?? 0);
    return diff === 0;
}
