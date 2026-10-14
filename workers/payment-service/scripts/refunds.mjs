#!/usr/bin/env node
// Operator tool for the V2 USDC refund inbox (README, "Operator tool"). Runs on the operator's own
// machine: it reads pending requests from the payment service, re-checks each ticket on Market V2,
// and for an approved request sends `refund_ticket` signed with the payment operator key from a
// local key file. The key is read only by `approve` and never printed or sent anywhere but the
// signed transaction.
//
//   node scripts/refunds.mjs list [--status pending|refunded|declined]
//   node scripts/refunds.mjs approve <request_id> --key-file <path> [--yes]
//   node scripts/refunds.mjs approve-takedowns --key-file <path> [--yes]  refund every pending request of a taken-down video
//   node scripts/refunds.mjs record <request_id> --tx <hash>        record a refund already on chain
//   node scripts/refunds.mjs decline <request_id> --note "<why>"
//
// Environment: REFUND_ADMIN_TOKEN (required), PAYMENT_SERVICE_URL, NEAR_RPC_URL,
// MARKET_V2_CONTRACT_ID, PAYMENT_OPERATOR_ID.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

export const DEFAULTS = Object.freeze({
    PAYMENT_SERVICE_URL: 'https://pay-v2-testnet.youtick.net',
    NEAR_RPC_URL: 'https://rpc.testnet.near.org',
    MARKET_V2_CONTRACT_ID: 'v2-market-261007.youtick-dev-v3.testnet',
    PAYMENT_OPERATOR_ID: 'v2-payments-261007.youtick-dev-v3.testnet',
});
export const ANSWER_WITHIN_MS = 72 * 60 * 60 * 1000;
export const REFUND_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
// Margin between the operator's clock and block time when a window is about to close.
const WINDOW_MARGIN_MS = 5 * 60 * 1000;
export const REFUND_GAS = 100_000_000_000_000n;
const REQUEST_ID = /^[0-9a-f]{32}$/;
const TX_HASH = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;
const REFUNDABLE = new Set(['purchased', 'watched_in_escrow']);

function fail(code) {
    throw new Error(code);
}

export function settings(env) {
    const token = env.REFUND_ADMIN_TOKEN;
    if (!token || token.length < 32) fail('refund_admin_token_missing');
    const value = (name) => env[name] || DEFAULTS[name];
    for (const name of ['PAYMENT_SERVICE_URL', 'NEAR_RPC_URL']) if (!value(name).startsWith('https://')) fail(`${name.toLowerCase()}_not_https`);
    return {
        token, service: value('PAYMENT_SERVICE_URL').replace(/\/$/, ''), rpcUrl: value('NEAR_RPC_URL'),
        market: value('MARKET_V2_CONTRACT_ID'), operator: value('PAYMENT_OPERATOR_ID'),
    };
}

export function parseArgs(argv) {
    const [command, ...rest] = argv;
    const options = { positional: [] };
    for (let i = 0; i < rest.length; i += 1) {
        const arg = rest[i];
        if (arg === '--yes') options.yes = true;
        else if (['--status', '--key-file', '--note', '--tx'].includes(arg)) {
            if (rest[i + 1] === undefined) fail(`missing_value_${arg.slice(2)}`);
            options[arg.slice(2).replace('-', '_')] = rest[i + 1];
            i += 1;
        } else if (arg.startsWith('--')) fail(`unknown_option_${arg}`);
        else options.positional.push(arg);
    }
    return { command, options };
}

async function service(cfg, fetcher, path, init = {}) {
    const response = await fetcher(`${cfg.service}${path}`, {
        ...init, headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) fail(`service_${body.error ?? response.status}`);
    return body;
}

export function rpcView(rpcUrl, fetcher) {
    return async (contractId, method, args) => {
        const response = await fetcher(rpcUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 'refunds', method: 'query', params: {
                request_type: 'call_function', finality: 'final', account_id: contractId, method_name: method,
                args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
            } }),
        });
        const body = await response.json().catch(() => null);
        if (!body?.result?.result) fail('rpc_unavailable');
        return JSON.parse(Buffer.from(body.result.result).toString('utf8'));
    };
}

async function hasAccessKey(rpcUrl, fetcher, accountId, publicKey) {
    const response = await fetcher(rpcUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'refunds', method: 'query', params: {
            request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKey,
        } }),
    });
    const body = await response.json().catch(() => null);
    return Boolean(body?.result && !body.error);
}

/** Reads `private_key` from a key file (keygen or ~/.near-credentials format); never logs it. */
export function readKeyFile(path) {
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        fail('key_file_unreadable');
    }
    const key = parsed?.private_key ?? parsed?.secret_key;
    if (typeof key !== 'string' || !key.startsWith('ed25519:')) fail('key_file_invalid');
    return key;
}

/**
 * Signs and sends `refund_ticket`, waiting for the final outcome. The hash is announced before
 * sending, so a timeout still leaves the operator what `record` needs. Returns the hash.
 */
export async function sendRefund({ rpcUrl, operator, market, privateKey, args, announce = () => {} }) {
    const { Account, JsonRpcProvider, KeyPairSigner, actions, baseEncode, encodeTransaction } = await import('near-api-js');
    const { createHash } = await import('node:crypto');
    const provider = new JsonRpcProvider({ url: rpcUrl }, { retries: 1 });
    const account = new Account(operator, provider, KeyPairSigner.fromSecretKey(privateKey));
    const signed = await account.createSignedTransaction({
        receiverId: market, actions: [actions.functionCall('refund_ticket', args, REFUND_GAS, 0n)],
    });
    // A NEAR transaction hash is sha256 of the Borsh-encoded unsigned transaction.
    const hash = baseEncode(createHash('sha256').update(encodeTransaction(signed.transaction)).digest());
    announce(hash);
    let outcome;
    try {
        outcome = await provider.sendTransactionUntil(signed, 'FINAL');
    } catch {
        fail(`refund_transaction_outcome_unknown:${hash}`);
    }
    if (outcome?.status && typeof outcome.status === 'object' && Object.hasOwn(outcome.status, 'Failure')) {
        fail(`refund_transaction_failed:${hash}`);
    }
    return hash;
}

/** When the contract stops accepting the refund; null after a takedown (no limit). */
export function windowClosesAt(ticket, publication) {
    if (publication?.availability === 'TAKEDOWN') return null;
    const purchased = Number(ticket?.purchased_at_ms);
    return Number.isSafeInteger(purchased) ? purchased + REFUND_WINDOW_MS : null;
}

function line(row, ticketStatus, nowMs, closesAt = null) {
    const answerBy = closesAt === null ? row.created_at_ms + ANSWER_WITHIN_MS : Math.min(row.created_at_ms + ANSWER_WITHIN_MS, closesAt);
    const due = row.status === 'pending' ? (nowMs > answerBy ? 'OVERDUE' : `answer by ${new Date(answerBy).toISOString()}`) : row.status;
    const window = closesAt === null ? 'no time limit: TAKEDOWN, refund without review (approve-takedowns)'
        : `${closesAt - nowMs <= ANSWER_WITHIN_MS ? 'WINDOW CLOSES ' : 'window closes '}${new Date(closesAt).toISOString()}`;
    const reason = row.reason.replace(/\s+/g, ' ').slice(0, 200);
    return [
        `${row.request_id}  ${new Date(row.created_at_ms).toISOString()}  ${due}`,
        `  ticket ${row.ticket_id.slice(0, 12)}…  chain: ${ticketStatus}  publication ${row.publication_id}`,
        ...(row.status === 'pending' ? [`  refund ${window}`] : []),
        `  refund to ${row.refund_to}  signature valid until ${new Date(row.expires_at_ms).toISOString()}`,
        `  "${reason}"`,
        ...(row.decision_note ? [`  note: ${row.decision_note}`] : []),
        ...(row.tx_hash ? [`  tx: ${row.tx_hash}`] : []),
    ].join('\n');
}

async function pendingRequest(cfg, fetcher, requestId) {
    if (!REQUEST_ID.test(requestId ?? '')) fail('request_id_invalid');
    const { requests } = await service(cfg, fetcher, '/internal/refund-requests?status=pending');
    return requests.find((row) => row.request_id === requestId) ?? fail('request_not_pending');
}

export async function run(argv, deps = {}) {
    const env = deps.env ?? process.env;
    const fetcher = deps.fetch ?? fetch;
    const out = deps.out ?? ((text) => console.log(text));
    const now = deps.now ?? Date.now;
    const { command, options } = parseArgs(argv);
    const cfg = settings(env);
    const view = deps.view ?? rpcView(cfg.rpcUrl, fetcher);
    const chainState = async (ticketId) => {
        const ticket = await view(cfg.market, 'get_ticket', { ticket_id: ticketId });
        if (!ticket) return { status: 'missing', closesAt: null };
        const publication = await view(cfg.market, 'get_publication', { publication_id: ticket.publication_id });
        return { status: ticket.status, closesAt: windowClosesAt(ticket, publication) };
    };
    const ticketStatus = async (ticketId) => (await chainState(ticketId)).status;
    const record = async (requestId, txHash) => {
        const { request } = await service(cfg, fetcher, `/internal/refund-requests/${requestId}/decision`, {
            method: 'POST', body: JSON.stringify({ decision: 'refunded', tx_hash: txHash }),
        });
        return request;
    };

    if (command === 'list') {
        const status = options.status ?? 'pending';
        const { requests } = await service(cfg, fetcher, `/internal/refund-requests?status=${encodeURIComponent(status)}`);
        if (requests.length === 0) out(`No ${status} refund requests.`);
        const rows = [];
        for (const row of requests) rows.push({ row, ...(await chainState(row.ticket_id)) });
        // The request whose refund window closes first comes first.
        rows.sort((a, b) => (a.closesAt ?? Infinity) - (b.closesAt ?? Infinity) || a.row.created_at_ms - b.row.created_at_ms);
        for (const { row, status: chain, closesAt } of rows) out(line(row, chain, now(), closesAt));
        return rows.map(({ row }) => row);
    }
    const operatorKey = async () => {
        if (!options.key_file) fail('key_file_required');
        const privateKey = (deps.readKeyFile ?? readKeyFile)(options.key_file);
        const { KeyPairSigner } = await import('near-api-js');
        const publicKey = (await KeyPairSigner.fromSecretKey(privateKey).getPublicKey()).toString();
        if (!(await (deps.hasAccessKey ?? hasAccessKey)(cfg.rpcUrl, fetcher, cfg.operator, publicKey))) fail('key_not_on_payment_operator');
        return privateKey;
    };
    const confirmed = async (question) => {
        if (options.yes) return;
        const confirm = deps.confirm ?? (async (text) => {
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            try { return (await rl.question(text)).trim(); } finally { rl.close(); }
        });
        if ((await confirm(question)) !== 'REFUND') fail('cancelled');
    };
    // Sends one refund and records it only after the chain shows the ticket refunded.
    const refundOne = async (row, privateKey) => {
        const txHash = await (deps.sendRefund ?? sendRefund)({
            rpcUrl: cfg.rpcUrl, operator: cfg.operator, market: cfg.market, privateKey,
            args: { ticket_id: row.ticket_id, refund_to: row.refund_to, expires_at_ms: String(row.expires_at_ms), signature: row.signature },
            announce: (hash) => out(`Sending ${hash} (if this run stops, check it on an explorer and use: record ${row.request_id} --tx ${hash})`),
        });
        out(`Sent: ${txHash}`);
        const after = await ticketStatus(row.ticket_id);
        // A failed USDC transfer restores the ticket in the callback; nothing is recorded then.
        if (after !== 'refunded') fail(`ticket_not_refunded_after_tx:${txHash}:${after}`);
        const request = await record(row.request_id, txHash);
        out(`Recorded ${request.request_id} as refunded.`);
        return request;
    };

    if (command === 'approve') {
        if (!options.key_file) fail('key_file_required');
        const row = await pendingRequest(cfg, fetcher, options.positional[0]);
        const { status, closesAt } = await chainState(row.ticket_id);
        if (!REFUNDABLE.has(status)) fail(`ticket_not_refundable:${status}`);
        if (closesAt !== null && closesAt <= now() + WINDOW_MARGIN_MS) fail('refund_window_closed');
        if (row.expires_at_ms <= now() + 60_000) fail('request_signature_expired');
        const privateKey = await operatorKey();
        out(line(row, status, now(), closesAt));
        out(`Refund the full ticket price to ${row.refund_to} from ${cfg.market}, signed by ${cfg.operator}.`);
        await confirmed('Type REFUND to send: ');
        return refundOne(row, privateKey);
    }
    if (command === 'approve-takedowns') {
        // A takedown needs no review: the video is gone, so every pending request for it is refunded.
        // The contract allows it during a purchase pause and with no time limit.
        const { requests } = await service(cfg, fetcher, '/internal/refund-requests?status=pending');
        const due = [];
        for (const row of requests) {
            const { status, closesAt } = await chainState(row.ticket_id);
            if (closesAt === null && REFUNDABLE.has(status) && row.expires_at_ms > now() + 60_000) due.push({ row, status });
        }
        if (due.length === 0) {
            out('No pending refund requests for taken-down videos.');
            return [];
        }
        const privateKey = await operatorKey();
        for (const { row, status } of due) out(line(row, status, now(), null));
        out(`Refund ${due.length} taken-down ticket(s) in full, signed by ${cfg.operator}.`);
        await confirmed(`Type REFUND to send ${due.length} refund(s): `);
        const done = [];
        const failed = [];
        for (const { row } of due) {
            try {
                done.push(await refundOne(row, privateKey));
            } catch (error) {
                // One failure does not stop the others; the request stays pending for the next run.
                failed.push(row.request_id);
                out(`Not refunded ${row.request_id}: ${error instanceof Error ? error.message : 'failed'}`);
            }
        }
        out(`Refunded ${done.length}, not refunded ${failed.length}.`);
        if (failed.length > 0) fail(`takedown_refunds_incomplete:${failed.join(',')}`);
        return done;
    }
    if (command === 'record') {
        if (!TX_HASH.test(options.tx ?? '')) fail('tx_hash_invalid');
        const row = await pendingRequest(cfg, fetcher, options.positional[0]);
        const request = await record(row.request_id, options.tx);
        out(`Recorded ${request.request_id} as refunded.`);
        return request;
    }
    if (command === 'decline') {
        if (!options.note || options.note.trim().length < 3) fail('note_required');
        const row = await pendingRequest(cfg, fetcher, options.positional[0]);
        const { request } = await service(cfg, fetcher, `/internal/refund-requests/${row.request_id}/decision`, {
            method: 'POST', body: JSON.stringify({ decision: 'declined', note: options.note.trim() }),
        });
        out(`Declined ${request.request_id}. Tell the buyer why; nothing was sent on chain.`);
        return request;
    }
    fail('usage: list | approve <id> --key-file <path> | approve-takedowns --key-file <path> | record <id> --tx <hash> | decline <id> --note <text>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    run(process.argv.slice(2)).catch((error) => {
        console.error(`refunds: ${error instanceof Error ? error.message : 'failed'}`);
        process.exitCode = 1;
    });
}
