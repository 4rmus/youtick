import assert from 'node:assert/strict';
import test from 'node:test';
import { ledgerByCreator, reconcileOrder, run, STUCK_AFTER_MS } from './card-orders.mjs';

const NOW = 1_792_005_000_000;
const HMAC = 'a'.repeat(64);

function order(overrides = {}) {
    return {
        order_id: '1'.repeat(32), ticket_id: 'b'.repeat(64), payment_reference_hmac: HMAC, gross_minor: 500, currency: 'USD',
        status: 'issued', last_error: null, created_at_ms: NOW - 1000, updated_at_ms: NOW - 1000, ...overrides,
    };
}
const ticket = (status, hmac = HMAC) => ({ ticket_id: 'b'.repeat(64), rail: 'card', status, card: { payment_reference_hmac: hmac } });
const sale = { kind: 'sale', amount_minor: 500 };
const refund = { kind: 'refund', amount_minor: -500 };

test('a matching issued or voided order has no findings', () => {
    assert.deepEqual(reconcileOrder(order(), ticket('purchased'), [sale], NOW), []);
    assert.deepEqual(reconcileOrder(order({ status: 'voided' }), ticket('voided'), [sale, refund], NOW), []);
    assert.deepEqual(reconcileOrder(order({ status: 'awaiting_payment' }), null, [], NOW), []);
});

test('book and chain disagreements are reported', () => {
    const codes = (...args) => reconcileOrder(...args).map((finding) => finding.code);
    assert.deepEqual(codes(order(), null, [sale], NOW), ['issued_but_chain_missing']);
    assert.deepEqual(codes(order({ status: 'voided' }), ticket('purchased'), [sale, refund], NOW), ['voided_but_chain_purchased']);
    assert.deepEqual(codes(order({ status: 'cancelled' }), ticket('purchased'), [sale, refund], NOW), ['cancelled_but_ticket_on_chain']);
    assert.deepEqual(codes(order({ status: 'awaiting_payment' }), ticket('purchased', 'c'.repeat(64)), [], NOW), ['ticket_id_taken_by_other']);
    assert.deepEqual(codes(order(), ticket('purchased'), [], NOW), ['sales_0', 'ledger_net_not_gross']);
    assert.deepEqual(codes(order({ status: 'paid', last_error: 'device_signature_expired', updated_at_ms: NOW - STUCK_AFTER_MS - 1 }), null, [sale], NOW),
        ['stuck_paid_device_signature_expired']);
});

test('the ledger sums one UTC month per creator and currency without a split', () => {
    const at = (iso) => Date.parse(iso);
    const rows = ledgerByCreator([
        { creator_id: 'b.testnet', currency: 'USD', kind: 'sale', amount_minor: 500, occurred_at_ms: at('2026-11-01T00:00:00Z') },
        { creator_id: 'b.testnet', currency: 'USD', kind: 'refund', amount_minor: -500, occurred_at_ms: at('2026-11-30T23:59:59Z') },
        { creator_id: 'a.testnet', currency: 'USD', kind: 'sale', amount_minor: 900, occurred_at_ms: at('2026-11-15T12:00:00Z') },
        { creator_id: 'a.testnet', currency: 'USD', kind: 'sale', amount_minor: 900, occurred_at_ms: at('2026-12-01T00:00:00Z') },
    ], '2026-11');
    assert.deepEqual(rows, [
        { creator_id: 'a.testnet', currency: 'USD', sales_minor: 900, returns_minor: 0, sales: 1 },
        { creator_id: 'b.testnet', currency: 'USD', sales_minor: 500, returns_minor: -500, sales: 1 },
    ]);
    assert.throws(() => ledgerByCreator([], '2026-13'), /month_invalid/);
});

test('reconcile pages through every status and reads each ticket', async () => {
    const out = [];
    const paths = [];
    const fetcher = async (url, init) => {
        assert.equal(init.headers.Authorization, `Bearer ${'t'.repeat(40)}`);
        paths.push(new URL(url).pathname + new URL(url).search);
        if (String(url).includes('/internal/card-ledger')) return Response.json({ entries: [{ order_id: '1'.repeat(32), ...sale }] });
        return Response.json({ orders: String(url).includes('status=issued') ? [order()] : [] });
    };
    const findings = await run(['reconcile'], {
        env: { REFUND_ADMIN_TOKEN: 't'.repeat(40) }, fetch: fetcher, now: () => NOW, out: (text) => out.push(text),
        view: async (_contract, method) => (method === 'get_ticket' ? ticket('watched') : null),
    });
    assert.deepEqual(findings, []);
    assert.equal(paths.filter((path) => path.startsWith('/internal/card-orders')).length, 7);
    assert.equal(out[0], '1 card order(s), 0 finding(s).');
});
