// Card path (roadmap E8): the payment operator's transaction sender. It writes `issue_card_ticket`
// for `paid` orders and `void_card_ticket` for `void_pending` orders, one at a time, from a single
// Durable Object so that two sends never race for the same access key nonce. Every transaction is
// recorded in D1 before it is sent. An unknown outcome is settled by reading the ticket from final
// state, never by resending blindly, and the contract refuses a second ticket for the same key or
// payment reference anyway.
import { Account, JsonRpcProvider, KeyPairSigner, actions, baseEncode, encodeTransaction } from 'near-api-js';
import type { View } from './market';

// Neither call takes a deposit (gate E8.0): the ticket's storage comes from the Market's reserve
// headroom, so the operator key is a function-call key that can sign nothing else.
export const CARD_OPERATOR_GAS = 100_000_000_000_000n;
/** The contract's refusal when the Market account cannot pay for another ticket's storage. */
export const RESERVE_HEADROOM_REFUSAL = 'Card ticket storage exceeds the operational reserve headroom';
/** After this many sends an order stops and waits for the operator (README, "Card path"). */
export const MAX_SEND_ATTEMPTS = 5;
/** The signature must still be valid when the transaction lands; block time trails the clock. */
const DEVICE_EXPIRY_MARGIN_MS = 2 * 60 * 1000;
const BATCH = 10;

/** `reserve_exhausted` is a confirmed failure that is the Market's to fix, not the order's. */
export type SendOutcome = 'success' | 'failure' | 'unknown' | 'reserve_exhausted';

export interface SignedCall {
    hash: string;
    send(): Promise<SendOutcome>;
}

/** Signs one call to Market V2 as the payment operator. Separate from sending so the hash is stored first. */
export type SignCall = (method: 'issue_card_ticket' | 'void_card_ticket', args: Record<string, unknown>, deposit: bigint) => Promise<SignedCall>;

/** The final outcome of a sent transaction; `unknown` while the chain does not know it (yet). */
export type TxStatus = (hash: string) => Promise<SendOutcome>;

export interface OperatorDeps {
    db: D1Database;
    view: View;
    sign: SignCall;
    txStatus: TxStatus;
    contractId: string;
    now: () => number;
}

interface OrderRow {
    order_id: string;
    payment_reference_hmac: string;
    publication_id: string;
    ticket_id: string;
    ticket_public_key: string;
    gross_minor: number;
    currency: string;
    session_public_key: string | null;
    certificate_sha256: string | null;
    device_expires_at_ms: number | null;
    device_signature: string | null;
    status: 'paid' | 'void_pending';
    void_reason: 'refund' | 'chargeback' | null;
    pending_tx_hash: string | null;
    issue_tx_hash: string | null;
    attempts: number;
}

interface ChainTicket {
    ticket_id: string;
    rail: string;
    status: string;
    card?: { payment_reference_hmac?: string } | null;
}

/** Fixed codes stored in `last_error`; never provider or RPC text. */
export type OperatorError = 'device_signature_missing' | 'device_signature_expired' | 'ticket_conflict' | 'send_failed'
    | 'outcome_unknown' | 'ticket_not_voidable' | 'rpc_unavailable' | 'reserve_exhausted';

export function outcomeOf(response: unknown): SendOutcome {
    const status = (response as { status?: unknown }).status;
    if (!status || typeof status !== 'object' || !Object.hasOwn(status, 'Failure')) return 'success';
    // The execution error carries the contract's panic text ("Smart contract panicked: …").
    return JSON.stringify((status as { Failure: unknown }).Failure).includes(RESERVE_HEADROOM_REFUSAL) ? 'reserve_exhausted' : 'failure';
}

function failed(outcome: SendOutcome): boolean {
    return outcome === 'failure' || outcome === 'reserve_exhausted';
}

export function nearSigner(input: { rpcUrl: string; operatorId: string; privateKey: string; contractId: string }): { sign: SignCall; txStatus: TxStatus } {
    const provider = new JsonRpcProvider({ url: input.rpcUrl }, { retries: 1 });
    const account = new Account(input.operatorId, provider, KeyPairSigner.fromSecretKey(input.privateKey as `ed25519:${string}`));
    const txStatus: TxStatus = async (hash) => {
        try {
            return outcomeOf(await provider.viewTransactionStatus({ txHash: hash, accountId: input.operatorId, waitUntil: 'FINAL' }));
        } catch {
            // Not (yet) known to the node, or the RPC failed: either way nothing is decided.
            return 'unknown';
        }
    };
    const sign: SignCall = async (method, args, deposit) => {
        const signed = await account.createSignedTransaction({
            receiverId: input.contractId, actions: [actions.functionCall(method, args, CARD_OPERATOR_GAS, deposit)],
        });
        // A NEAR transaction hash is sha256 of the Borsh-encoded unsigned transaction.
        const digest = await crypto.subtle.digest('SHA-256', encodeTransaction(signed.transaction));
        return {
            hash: baseEncode(new Uint8Array(digest)),
            send: async () => {
                try {
                    return outcomeOf(await provider.sendTransactionUntil(signed, 'FINAL'));
                } catch {
                    return 'unknown';
                }
            },
        };
    };
    return { sign, txStatus };
}

async function readTicket(deps: OperatorDeps, ticketId: string): Promise<ChainTicket | null> {
    return deps.view<ChainTicket | null>(deps.contractId, 'get_ticket', { ticket_id: ticketId });
}

/** Updates the order only if its status is still the one read; returns whether it did. */
async function update(deps: OperatorDeps, order: OrderRow, fields: Record<string, string | number | null>): Promise<boolean> {
    const names = Object.keys(fields);
    const result = await deps.db.prepare(`UPDATE card_orders SET ${names.map((name) => `${name} = ?`).join(', ')}, updated_at_ms = ?
        WHERE order_id = ? AND status = ?`).bind(...names.map((name) => fields[name]), deps.now(), order.order_id, order.status).run();
    return Boolean(result.meta?.changes);
}

function ours(ticket: ChainTicket | null, order: OrderRow): boolean {
    return ticket?.rail === 'card' && ticket.card?.payment_reference_hmac === order.payment_reference_hmac;
}

async function issue(deps: OperatorDeps, order: OrderRow): Promise<'issued' | unknown> {
    const before = await readTicket(deps, order.ticket_id);
    if (before) {
        if (!ours(before, order)) return update(deps, order, { last_error: 'ticket_conflict', attempts: MAX_SEND_ATTEMPTS });
        // A refund raced the issue: the ticket is ours, so it now needs a void.
        return update(deps, order, { status: 'issued', issue_tx_hash: order.pending_tx_hash, pending_tx_hash: null, last_error: null });
    }
    if (order.pending_tx_hash) {
        // An earlier send's outcome is unknown: resend only once the chain says it failed.
        if (!failed(await deps.txStatus(order.pending_tx_hash))) return update(deps, order, { last_error: 'outcome_unknown' });
        if (!(await update(deps, order, { pending_tx_hash: null }))) return;
        order = { ...order, pending_tx_hash: null };
    }
    if (!order.device_signature || !order.session_public_key || !order.certificate_sha256 || order.device_expires_at_ms === null) {
        return update(deps, order, { last_error: 'device_signature_missing' });
    }
    if (order.device_expires_at_ms - DEVICE_EXPIRY_MARGIN_MS <= deps.now()) {
        // The buyer's page asks the ticket key to sign again (POST /v1/card-orders/<id>/device).
        return update(deps, order, { last_error: 'device_signature_expired' });
    }
    const call = await deps.sign('issue_card_ticket', {
        ticket_public_key: order.ticket_public_key, publication_id: order.publication_id,
        device: {
            session_public_key: order.session_public_key, certificate_sha256: order.certificate_sha256,
            expires_at_ms: String(order.device_expires_at_ms), signature: order.device_signature,
        },
        payment_reference_hmac: order.payment_reference_hmac, gross_minor: String(order.gross_minor), currency: order.currency,
    }, 0n);
    // A refund that arrived meanwhile moved the order on; then nothing is sent.
    if (!(await update(deps, order, { pending_tx_hash: call.hash, attempts: order.attempts + 1 }))) return;
    // From here a refund turns the order into void_pending (src/card-events.ts), never cancelled.
    const outcome = await call.send();
    const after = await readTicket(deps, order.ticket_id);
    if (ours(after, order)) {
        await update(deps, order, { status: 'issued', issue_tx_hash: call.hash, pending_tx_hash: null, last_error: null });
        return 'issued';
    }
    // A confirmed failure with no ticket on chain releases the order (a refund may cancel it and the
    // buyer may sign again); an unknown outcome keeps the hash until the ticket is read again.
    if (outcome === 'unknown') return update(deps, order, { last_error: 'outcome_unknown' });
    if (outcome === 'reserve_exhausted') {
        // The Market account cannot pay for the ticket's storage: nothing about this order is wrong,
        // so the send is not counted and the order waits for the cron until the owner tops up the
        // Market (README, "Card path"). Each retry still burns the operator's gas on a failed call.
        return update(deps, order, { last_error: 'reserve_exhausted', pending_tx_hash: null, attempts: order.attempts });
    }
    await update(deps, order, { last_error: 'send_failed', pending_tx_hash: null });
}

async function voidTicket(deps: OperatorDeps, order: OrderRow): Promise<unknown> {
    const before = await readTicket(deps, order.ticket_id);
    if (!before && !order.issue_tx_hash) {
        // No ticket yet. With no send outstanding nothing can land, so the order is cancelled. An
        // issue whose outcome was unknown may still land: cancel only once the chain says it failed.
        if (!order.pending_tx_hash || failed(await deps.txStatus(order.pending_tx_hash))) {
            return update(deps, order, { status: 'cancelled', pending_tx_hash: null, last_error: null });
        }
        return update(deps, order, { last_error: 'outcome_unknown' });
    }
    if (before?.status === 'voided' && ours(before, order)) {
        return update(deps, order, { status: 'voided', void_tx_hash: order.pending_tx_hash, pending_tx_hash: null, last_error: null });
    }
    if (!ours(before, order) || !['purchased', 'watched'].includes(before!.status)) {
        return update(deps, order, { last_error: 'ticket_not_voidable', attempts: MAX_SEND_ATTEMPTS });
    }
    const call = await deps.sign('void_card_ticket', { ticket_id: order.ticket_id, reason: order.void_reason ?? 'refund' }, 0n);
    if (!(await update(deps, order, { pending_tx_hash: call.hash, attempts: order.attempts + 1 }))) return;
    const outcome = await call.send();
    const after = await readTicket(deps, order.ticket_id);
    if (after?.status === 'voided') {
        await update(deps, order, { status: 'voided', void_tx_hash: call.hash, pending_tx_hash: null, last_error: null });
        return;
    }
    await update(deps, order, { last_error: outcome === 'unknown' ? 'outcome_unknown' : 'send_failed' });
}

/**
 * Works through orders waiting for the chain, oldest first. Returns how many still wait, so the
 * caller can schedule another run. An RPC failure leaves the order as it was.
 */
export async function runCardOperator(deps: OperatorDeps): Promise<{ processed: number; waiting: number }> {
    const rows = (await deps.db.prepare(`SELECT * FROM card_orders WHERE status IN ('paid', 'void_pending') AND attempts < ?
        ORDER BY updated_at_ms LIMIT ?`).bind(MAX_SEND_ATTEMPTS, BATCH).all<OrderRow>()).results ?? [];
    let processed = 0;
    let issued = false;
    for (const order of rows) {
        try {
            if (order.status === 'paid') issued = (await issue(deps, order)) === 'issued' || issued;
            else await voidTicket(deps, order);
            processed += 1;
        } catch {
            await update(deps, order, { last_error: 'rpc_unavailable' }).catch(() => undefined);
        }
    }
    // Orders that wait for the buyer, the chain or the Market's NEAR are left to the cron. Once a
    // ticket was issued again the Market can pay, so a backlog of `reserve_exhausted` orders is
    // drained batch by batch instead of ten per cron tick.
    const parked = ['device_signature_missing', 'device_signature_expired', 'outcome_unknown', ...(issued ? [] : ['reserve_exhausted'])];
    const waiting = await deps.db.prepare(`SELECT COUNT(*) AS n FROM card_orders WHERE status IN ('paid', 'void_pending') AND attempts < ?
        AND (last_error IS NULL OR last_error NOT IN (${parked.map(() => '?').join(', ')}))`)
        .bind(MAX_SEND_ATTEMPTS, ...parked).first<{ n: number }>();
    return { processed, waiting: Number(waiting?.n ?? 0) };
}
