import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { rebuildMarketReadModel } from './rebuild-market-read-model.mjs';

const contractId = 'market.testnet';

function record(block, eventName, idempotencyKey, data, eventIndex = 0) {
    return {
        network: 'testnet',
        finality: 'final',
        block_height: block,
        block_hash: `block_hash_${String(block).padStart(24, '0')}`,
        receipt_id: `receipt_${String(block).padStart(27, '0')}`,
        event_index: eventIndex,
        event: {
            standard: 'youtick_market',
            version: '1.0.0',
            event: eventName,
            data: [{
                contract_id: contractId,
                predecessor_account_id: 'bridge.testnet',
                block_height: String(block),
                block_timestamp_ms: String(1_785_600_000_000 + block),
                idempotency_key: idempotencyKey,
                ...data,
            }],
        },
    };
}

const events = [
    record(100, 'media_job_authorized', 'job:job-1:1:authorized', {
        account_id: 'creator.testnet', job_id: 'job-1', generation: 1,
        expected_source_bytes: '1000000', asset: 'USDC', amount: '500000',
    }),
    record(101, 'publication_finalized', 'publication:job-1:1:finalized', {
        account_id: 'creator.testnet', publication_id: 'job-1', job_id: 'job-1',
        generation: 1, title: 'Paid video', playback_id: 'playback_job_1',
        published_at_ms: 1_785_600_000_101,
        asset: 'USDC', amount: '2000000', availability: 'ACTIVE',
    }),
    record(102, 'entitlement_purchased', 'entitlement:buyer.testnet:job-1', {
        account_id: 'buyer.testnet', creator_id: 'creator.testnet', publication_id: 'job-1',
        asset: 'USDC', amount: '2000000', creator_amount: '1960000', platform_amount: '40000',
    }),
    record(103, 'publication_sales_suspended', 'publication:job-1:sales-suspended', {
        account_id: 'creator.testnet', publication_id: 'job-1', generation: 1,
        availability: 'SALES_SUSPENDED',
    }),
];

test('rebuild is deterministic, final-only and idempotent', () => {
    const snapshot = rebuildMarketReadModel([events[3], events[1], events[0], events[2], events[0]]);
    const replayed = rebuildMarketReadModel([...events, ...events]);

    assert.deepEqual(snapshot, replayed);
    assert.equal(snapshot.events_applied, 4);
    assert.deepEqual(snapshot.watermarks, [{
        network: 'testnet', contract_id: contractId, block_height: 103,
        block_hash: 'block_hash_000000000000000000000103',
    }]);
    assert.equal(snapshot.media_jobs.length, 1);
    assert.equal(snapshot.publications[0].availability, 'SALES_SUSPENDED');
    assert.equal(snapshot.publications[0].title, 'Paid video');
    assert.equal(snapshot.publications[0].playback_id, 'playback_job_1');
    assert.equal(snapshot.viewer_entitlements.length, 1);
    assert.equal(snapshot.sale_ledger[0].amount, '2000000');
});

test('rebuild rejects non-final input and conflicting idempotency payloads', () => {
    assert.throws(
        () => rebuildMarketReadModel([{ ...events[0], finality: 'optimistic' }]),
        /invalid_final_event_envelope/,
    );
    const conflict = structuredClone(events[0]);
    conflict.block_height = 104;
    conflict.block_hash = 'block_hash_000000000000000000000104';
    conflict.receipt_id = 'receipt_000000000000000000000000104';
    conflict.event.data[0].block_height = '104';
    conflict.event.data[0].amount = '600000';
    assert.throws(
        () => rebuildMarketReadModel([events[0], conflict]),
        /event_idempotency_conflict/,
    );
});

test('rebuild and D1 use the same withdrawal lifecycle status', () => {
    const withdrawalId = 'creator-withdrawal:creator.testnet:1960000:1785600000104';
    const snapshot = rebuildMarketReadModel([
        record(104, 'creator_balance_withdrawal_started', withdrawalId, {
            account_id: 'creator.testnet', asset: 'USDC', amount: '1960000',
            withdrawal_id: withdrawalId,
        }),
        record(105, 'creator_balance_withdrawal_succeeded', withdrawalId, {
            account_id: 'creator.testnet', asset: 'USDC', amount: '1960000',
            withdrawal_id: withdrawalId,
        }),
    ]);

    assert.equal(snapshot.withdrawal_history[0].status,
        'creator_balance_withdrawal_succeeded');
});

test('rebuild keeps purchase pause and unpause in governance audit', () => {
    const snapshot = rebuildMarketReadModel([
        record(106, 'new_purchases_paused', 'governance:new-purchases:paused:106', {
            actor_id: 'guardian.testnet',
        }),
        record(107, 'new_purchases_unpaused', 'governance:new-purchases:unpaused:107', {
            actor_id: 'admin.testnet',
        }),
    ]);

    assert.deepEqual(
        snapshot.governance_audit.map(({ event_name: eventName }) => eventName),
        ['new_purchases_paused', 'new_purchases_unpaused'],
    );
});

test('D1 schema keeps final event identity, watermark and derived projections separate', async () => {
    const sql = await readFile(new URL('../read-model/d1/0001_initial.sql', import.meta.url), 'utf8');
    for (const table of [
        'chain_events', 'finality_watermarks', 'media_jobs', 'publications',
        'viewer_entitlements', 'sale_ledger', 'withdrawal_history', 'governance_audit',
    ]) {
        assert.match(sql, new RegExp(`CREATE TABLE ${table} \\(`));
    }
    assert.match(sql, /PRIMARY KEY \(network, contract_id, block_height, receipt_id, event_index\)/);
    assert.match(sql, /UNIQUE \(network, contract_id, event_name, idempotency_key\)/);
});
