import assert from 'node:assert/strict';
import test from 'node:test';
import {
    fetchNeardataMarketBlock,
    parseNeardataMarketBlock,
} from './fetch-neardata-market-block.mjs';

const HEIGHT = 263_118_001;
const BLOCK_HASH = 'B6oE1UWkynBdztjt3CDPHv5er7q9PVqtYNUWBcC57SPX';
const RECEIPT_ID = '3zJTATjCZGHh3879mgT1XZTssqfkGku6zcbBG2dizT4u';
const CONTRACT_ID = 'lp-arch-market-v2-260809.youtick-dev-v3.testnet';
const TIMESTAMP_NS = '1786271808560000000';

function marketEvent() {
    return {
        standard: 'youtick_market',
        version: '1.0.0',
        event: 'media_job_authorized',
        data: [{
            contract_id: CONTRACT_ID,
            predecessor_account_id: 'creator.testnet',
            block_height: String(HEIGHT),
            block_timestamp_ms: '1786271808560',
            idempotency_key: 'job:job-1:1:authorized',
            account_id: 'creator.testnet',
            job_id: 'job-1',
            generation: 1,
            expected_source_bytes: '1000',
            asset: 'USDC',
            amount: '500000',
        }],
    };
}

function block(logs = [`EVENT_JSON:${JSON.stringify(marketEvent())}`]) {
    return {
        block: { header: { height: HEIGHT, hash: BLOCK_HASH, timestamp_nanosec: TIMESTAMP_NS } },
        shards: [{
            receipt_execution_outcomes: [{
                execution_outcome: {
                    block_hash: BLOCK_HASH,
                    id: RECEIPT_ID,
                    outcome: {
                        executor_id: CONTRACT_ID,
                        logs,
                        status: { SuccessValue: '' },
                    },
                },
                receipt: {
                    predecessor_id: 'creator.testnet',
                    receiver_id: CONTRACT_ID,
                    receipt_id: RECEIPT_ID,
                },
                tx_hash: '49N5Fe7Cf9grnRDCuZUcRDSsXiXsDzK5czZZDzHdXFha',
            }],
        }],
    };
}

const expected = { network: 'testnet', contractId: CONTRACT_ID, blockHeight: HEIGHT };

test('extracts successful market EVENT_JSON logs into stable final event envelopes', () => {
    const value = parseNeardataMarketBlock(block(['plain log',
        `EVENT_JSON:${JSON.stringify(marketEvent())}`]), expected);
    assert.equal(value.schema, 'youtick.market-final-block.v1');
    assert.equal(value.finality, 'final');
    assert.equal(value.events.length, 1);
    assert.deepEqual(value.events[0], {
        network: 'testnet',
        finality: 'final',
        block_height: HEIGHT,
        block_hash: BLOCK_HASH,
        receipt_id: RECEIPT_ID,
        event_index: 1,
        event: marketEvent(),
    });
});

test('accepts purchase pause governance events with common context', () => {
    const event = marketEvent();
    event.event = 'new_purchases_paused';
    event.data[0] = {
        contract_id: CONTRACT_ID,
        predecessor_account_id: 'creator.testnet',
        block_height: String(HEIGHT),
        block_timestamp_ms: '1786271808560',
        idempotency_key: 'governance:new-purchases:paused:1786271808560',
        actor_id: 'creator.testnet',
    };
    const value = parseNeardataMarketBlock(block([
        `EVENT_JSON:${JSON.stringify(event)}`,
    ]), expected);

    assert.equal(value.events[0].event.event, 'new_purchases_paused');
});

test('returns a complete empty block and ignores logs from failed receipts', () => {
    const value = block();
    value.shards[0].receipt_execution_outcomes[0].execution_outcome.outcome.status = {
        Failure: { ActionError: {} },
    };
    assert.deepEqual(parseNeardataMarketBlock(value, expected).events, []);
    assert.deepEqual(parseNeardataMarketBlock({
        block: value.block,
        shards: [{ receipt_execution_outcomes: [] }],
    }, expected).events, []);
});

test('enriches legacy testnet governance events from immutable receipt context', () => {
    const legacy = {
        standard: 'youtick_market',
        version: '1.0.0',
        event: 'bridge_frozen',
        data: [{ actor_id: 'creator.testnet', active_bridge_account_id: 'bridge.testnet' }],
    };
    const value = parseNeardataMarketBlock(block([
        `EVENT_JSON:${JSON.stringify(legacy)}`,
    ]), expected);
    assert.deepEqual(value.events[0].event.data[0], {
        contract_id: CONTRACT_ID,
        predecessor_account_id: 'creator.testnet',
        block_height: String(HEIGHT),
        block_timestamp_ms: '1786271808560',
        idempotency_key: `legacy:${RECEIPT_ID}:0`,
        actor_id: 'creator.testnet',
        active_bridge_account_id: 'bridge.testnet',
    });
});

test('rejects a block, receipt or event that is not bound to the requested source', () => {
    assert.throws(() => parseNeardataMarketBlock(block(), {
        ...expected, blockHeight: HEIGHT + 1,
    }), /invalid_neardata_block/);
    const wrongPredecessor = block();
    wrongPredecessor.shards[0].receipt_execution_outcomes[0].receipt.predecessor_id = 'other.testnet';
    assert.throws(
        () => parseNeardataMarketBlock(wrongPredecessor, expected),
        /invalid_neardata_event/,
    );
    const incompleteEconomic = marketEvent();
    delete incompleteEconomic.data[0].contract_id;
    assert.throws(() => parseNeardataMarketBlock(block([
        `EVENT_JSON:${JSON.stringify(incompleteEconomic)}`,
    ]), expected), /invalid_neardata_event/);
});

test('fetches only the exact network and height with a bounded response', async () => {
    let observedUrl = '';
    const value = await fetchNeardataMarketBlock(expected, async (url) => {
        observedUrl = String(url);
        return Response.json(block());
    });
    assert.equal(observedUrl, `https://testnet.neardata.xyz/v0/block/${HEIGHT}`);
    assert.equal(value.block_hash, BLOCK_HASH);

    await assert.rejects(() => fetchNeardataMarketBlock(expected, async () => new Response(
        '{}', { headers: { 'Content-Length': String(16 * 1024 * 1024 + 1) } },
    )), /neardata_unavailable/);
});
