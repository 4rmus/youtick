#!/usr/bin/env node
// Operator tool for the card path (roadmap E8; README, "Card path"). Read-only: it lists card
// orders from the payment service, compares them with Market V2 and sums the card ledger per
// creator. It holds no key and sends nothing; the Worker's card operator writes and voids tickets.
//
//   node scripts/card-orders.mjs reconcile                 every order against its ticket on chain
//   node scripts/card-orders.mjs ledger --month 2026-11   per creator and currency, provider facts only
//
// Environment: REFUND_ADMIN_TOKEN (the operator tool token, required), PAYMENT_SERVICE_URL,
// NEAR_RPC_URL, MARKET_V2_CONTRACT_ID.
import { pathToFileURL } from 'node:url';
import { rpcView, settings } from './refunds.mjs';

/** An order still waiting for the chain after this long is reported. */
export const STUCK_AFTER_MS = 15 * 60 * 1000;
const STATUSES = ['created', 'awaiting_payment', 'paid', 'issued', 'void_pending', 'voided', 'cancelled'];

function fail(code) {
    throw new Error(code);
}

/**
 * One finding per order whose book entry and chain ticket disagree, or that waits too long.
 * The ledger check: a sold order has exactly one sale; a closed one nets to zero or below.
 */
export function reconcileOrder(order, ticket, ledger, nowMs) {
    const ours = ticket?.rail === 'card' && ticket.card?.payment_reference_hmac === order.payment_reference_hmac;
    const findings = [];
    const add = (code) => findings.push({ order_id: order.order_id, code });
    if (order.status === 'issued' && !(ours && ['purchased', 'watched'].includes(ticket.status))) add(`issued_but_chain_${ticket ? ticket.status : 'missing'}`);
    if (order.status === 'voided' && !(ours && ticket.status === 'voided')) add(`voided_but_chain_${ticket ? ticket.status : 'missing'}`);
    if (['created', 'awaiting_payment', 'cancelled'].includes(order.status) && ours) add(`${order.status}_but_ticket_on_chain`);
    if (ticket && !ours) add('ticket_id_taken_by_other');
    if (['paid', 'void_pending'].includes(order.status) && nowMs - order.updated_at_ms > STUCK_AFTER_MS) {
        add(`stuck_${order.status}${order.last_error ? `_${order.last_error}` : ''}`);
    }
    const sales = ledger.filter((entry) => entry.kind === 'sale').length;
    // A refund taken from both a webhook and a report would be counted twice.
    const returns = ledger.length - sales;
    if (returns > 1) add(`returns_${returns}`);
    const net = ledger.reduce((sum, entry) => sum + entry.amount_minor, 0);
    if (['paid', 'issued', 'void_pending', 'voided'].includes(order.status) && sales !== 1) add(`sales_${sales}`);
    if (order.status === 'issued' && net !== order.gross_minor) add('ledger_net_not_gross');
    if (order.status === 'voided' && net > 0) add('ledger_net_positive_after_void');
    return findings;
}

/** Sums provider facts per creator and currency for one calendar month (UTC). No split is applied. */
export function ledgerByCreator(entries, month) {
    if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month ?? '')) fail('month_invalid');
    const start = Date.parse(`${month}-01T00:00:00Z`);
    const next = new Date(start);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const totals = new Map();
    for (const entry of entries) {
        if (entry.occurred_at_ms < start || entry.occurred_at_ms >= next.getTime()) continue;
        const key = `${entry.creator_id}|${entry.currency}`;
        const total = totals.get(key) ?? { creator_id: entry.creator_id, currency: entry.currency, sales_minor: 0, returns_minor: 0, sales: 0 };
        if (entry.kind === 'sale') {
            total.sales_minor += entry.amount_minor;
            total.sales += 1;
        } else {
            total.returns_minor += entry.amount_minor;
        }
        totals.set(key, total);
    }
    return [...totals.values()].sort((a, b) => a.creator_id.localeCompare(b.creator_id) || a.currency.localeCompare(b.currency));
}

async function service(cfg, fetcher, path) {
    const response = await fetcher(`${cfg.service}${path}`, { headers: { Authorization: `Bearer ${cfg.token}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) fail(`service_${body.error ?? response.status}`);
    return body;
}

async function allOrders(cfg, fetcher) {
    const orders = [];
    for (const status of STATUSES) {
        let after = 0;
        for (;;) {
            const page = await service(cfg, fetcher, `/internal/card-orders?status=${status}&after=${after}`);
            orders.push(...page.orders);
            if (page.orders.length < 100) break;
            after = page.orders.at(-1).created_at_ms;
        }
    }
    return orders;
}

export async function run(argv, deps = {}) {
    const env = deps.env ?? process.env;
    const fetcher = deps.fetch ?? fetch;
    const out = deps.out ?? ((text) => console.log(text));
    const now = deps.now ?? Date.now;
    const [command, ...rest] = argv;
    const cfg = settings(env);
    const view = deps.view ?? rpcView(cfg.rpcUrl, fetcher);

    if (command === 'reconcile') {
        const orders = await allOrders(cfg, fetcher);
        const { entries } = await service(cfg, fetcher, '/internal/card-ledger');
        const findings = [];
        for (const order of orders) {
            const ticket = await view(cfg.market, 'get_ticket', { ticket_id: order.ticket_id });
            findings.push(...reconcileOrder(order, ticket, entries.filter((entry) => entry.order_id === order.order_id), now()));
        }
        out(`${orders.length} card order(s), ${findings.length} finding(s).`);
        for (const finding of findings) out(`${finding.order_id}  ${finding.code}`);
        return findings;
    }
    if (command === 'ledger') {
        if (rest[0] !== '--month') fail('usage: ledger --month YYYY-MM');
        const { entries } = await service(cfg, fetcher, '/internal/card-ledger');
        const rows = ledgerByCreator(entries, rest[1]);
        out('creator_id,currency,sales,sales_minor,returns_minor,net_minor');
        for (const row of rows) out([row.creator_id, row.currency, row.sales, row.sales_minor, row.returns_minor, row.sales_minor + row.returns_minor].join(','));
        return rows;
    }
    fail('usage: reconcile | ledger --month YYYY-MM');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    run(process.argv.slice(2)).catch((error) => {
        console.error(`card-orders: ${error instanceof Error ? error.message : 'failed'}`);
        process.exitCode = 1;
    });
}
