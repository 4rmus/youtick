#!/usr/bin/env node
// Operator tool for the V2 USDC refund inbox (README, "Operator tool"). Runs on the operator's own
// machine: it reads pending requests from the payment service, re-checks each ticket on Market V2,
// and for an approved request sends `refund_ticket` signed with the payment operator key from a
// local key file. The key is read only by `approve` and never printed or sent anywhere but the
// signed transaction.
//
//   node scripts/refunds.mjs list [--status pending|refunded|declined]
//   node scripts/refunds.mjs approve <request_id> --key-file <path> [--yes]
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

/** Signs and sends `refund_ticket`, waiting for the final outcome. Returns the transaction hash. */
export async function sendRefund({ rpcUrl, operator, market, privateKey, args }) {
    const { Account, JsonRpcProvider, KeyPairSigner, actions } = await import('near-api-js');
    const provider = new JsonRpcProvider({ url: rpcUrl }, { retries: 1 });
    const account = new Account(operator, provider, KeyPairSigner.fromSecretKey(privateKey));
    const signed = await account.createSignedTransaction({
        receiverId: market, actions: [actions.functionCall('refund_ticket', args, REFUND_GAS, 0n)],
    });
    const outcome = await provider.sendTransactionUntil(signed, 'FINAL');
    const hash = outcome?.transaction?.hash ?? outcome?.transaction_outcome?.id;
    if (outcome?.status && typeof outcome.status === 'object' && Object.hasOwn(outcome.status, 'Failure')) {
        fail(`refund_transaction_failed${hash ? `:${hash}` : ''}`);
    }
    if (!hash) fail('refund_transaction_hash_missing');
    return hash;
}

function line(row, ticketStatus, nowMs) {
    const answerBy = row.created_at_ms + ANSWER_WITHIN_MS;
    const due = row.status === 'pending' ? (nowMs > answerBy ? 'OVERDUE' : `answer by ${new Date(answerBy).toISOString()}`) : row.status;
    const reason = row.reason.replace(/\s+/g, ' ').slice(0, 200);
    return [
        `${row.request_id}  ${new Date(row.created_at_ms).toISOString()}  ${due}`,
        `  ticket ${row.ticket_id.slice(0, 12)}…  chain: ${ticketStatus}  publication ${row.publication_id}`,
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
    const ticketStatus = async (ticketId) => (await view(cfg.market, 'get_ticket', { ticket_id: ticketId }))?.status ?? 'missing';
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
        for (const row of requests) out(line(row, await ticketStatus(row.ticket_id), now()));
        return requests;
    }
    if (command === 'approve') {
        if (!options.key_file) fail('key_file_required');
        const row = await pendingRequest(cfg, fetcher, options.positional[0]);
        const status = await ticketStatus(row.ticket_id);
        if (!REFUNDABLE.has(status)) fail(`ticket_not_refundable:${status}`);
        if (row.expires_at_ms <= now() + 60_000) fail('request_signature_expired');
        const privateKey = (deps.readKeyFile ?? readKeyFile)(options.key_file);
        const { KeyPairSigner } = await import('near-api-js');
        const publicKey = (await KeyPairSigner.fromSecretKey(privateKey).getPublicKey()).toString();
        if (!(await (deps.hasAccessKey ?? hasAccessKey)(cfg.rpcUrl, fetcher, cfg.operator, publicKey))) fail('key_not_on_payment_operator');
        out(line(row, status, now()));
        out(`Refund the full ticket price to ${row.refund_to} from ${cfg.market}, signed by ${cfg.operator}.`);
        if (!options.yes) {
            const confirm = deps.confirm ?? (async (question) => {
                const rl = createInterface({ input: process.stdin, output: process.stdout });
                try { return (await rl.question(question)).trim(); } finally { rl.close(); }
            });
            if ((await confirm('Type REFUND to send: ')) !== 'REFUND') fail('cancelled');
        }
        const txHash = await (deps.sendRefund ?? sendRefund)({
            rpcUrl: cfg.rpcUrl, operator: cfg.operator, market: cfg.market, privateKey,
            args: { ticket_id: row.ticket_id, refund_to: row.refund_to, expires_at_ms: String(row.expires_at_ms), signature: row.signature },
        });
        out(`Sent: ${txHash}`);
        const after = await ticketStatus(row.ticket_id);
        // A failed USDC transfer restores the ticket in the callback; nothing is recorded then.
        if (after !== 'refunded') fail(`ticket_not_refunded_after_tx:${txHash}:${after}`);
        const request = await record(row.request_id, txHash);
        out(`Recorded ${request.request_id} as refunded.`);
        return request;
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
    fail('usage: list | approve <id> --key-file <path> | record <id> --tx <hash> | decline <id> --note <text>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    run(process.argv.slice(2)).catch((error) => {
        console.error(`refunds: ${error instanceof Error ? error.message : 'failed'}`);
        process.exitCode = 1;
    });
}
