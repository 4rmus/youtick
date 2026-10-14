import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { applyFinalMarketBlock, applyFinalMarketBlockBatch } from './apply-market-read-model-d1.mjs';
import {
    discoverMarketEventBlocks, fetchFastnearIndexHead, MAX_ACCOUNT_PAGES, TRANSACTIONS_PER_REQUEST,
} from './fastnear-market-discovery.mjs';
import { parseNeardataMarketBlock } from './fetch-neardata-market-block.mjs';
import { ingestMarketReadModelBatch } from '../read-model/worker.mjs';

const vectors = JSON.parse(await readFile(new URL('../protocol/youtick-market-v2/golden-vectors.json', import.meta.url), 'utf8'));
const CONTRACT_ID = vectors.fixture.contract_id;
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const TIMESTAMP_MS = 1_791_360_000_000;

// Deterministic 44-character base58 strings for hashes and receipt ids.
function b58(seed) {
    let value = '';
    let n = seed * 7919 + 13;
    for (let i = 0; i < 44; i += 1) {
        value += BASE58[n % 58];
        n = Math.floor(n / 58) + seed + i * 31;
    }
    return value;
}

function hashOf(height) {
    return b58(height);
}

function neardataBlock(height, events, prevHeight = height - 1) {
    return {
        block: { header: { height, hash: hashOf(height), prev_height: prevHeight, prev_hash: hashOf(prevHeight),
            timestamp_nanosec: String((TIMESTAMP_MS + height) * 1_000_000) } },
        shards: [{
            receipt_execution_outcomes: events.map((value, index) => {
                const id = b58(height * 100 + index + 1);
                return {
                    execution_outcome: { block_hash: hashOf(height), id,
                        outcome: { executor_id: CONTRACT_ID, logs: [`EVENT_JSON:${JSON.stringify(value)}`], status: { SuccessValue: '' } } },
                    receipt: { predecessor_id: 'buyer.testnet', receiver_id: CONTRACT_ID, receipt_id: id },
                };
            }),
        }],
    };
}

function eventBlock(height, events) {
    return parseNeardataMarketBlock(neardataBlock(height, events),
        { network: 'testnet', contractId: CONTRACT_ID, blockHeight: height, requirePredecessor: true });
}

async function database() {
    const sqlite = new DatabaseSync(':memory:');
    for (const file of ['0001_initial.sql', '0002_contiguous_watermark.sql', '0005_predecessor_watermark.sql',
        '0006_scan_cursor.sql', '0010_market_v2_tickets.sql']) {
        sqlite.exec(await readFile(new URL(`../read-model/d1/${file}`, import.meta.url), 'utf8'));
    }
    return {
        sqlite,
        prepare(sql) {
            return { bind: (...values) => ({ sql, values, first() {
                const row = sqlite.prepare(sql).get(...values);
                return Promise.resolve(row ? { ...row } : null);
            }, all() {
                return Promise.resolve({ results: sqlite.prepare(sql).all(...values).map((row) => ({ ...row })) });
            } }) };
        },
        batch(statements) {
            sqlite.exec('BEGIN');
            try {
                for (const statement of statements) sqlite.prepare(statement.sql).run(...statement.values);
                sqlite.exec('COMMIT');
                return Promise.resolve(statements.map(() => ({ success: true })));
            } catch (error) {
                sqlite.exec('ROLLBACK');
                return Promise.reject(error);
            }
        },
    };
}

// A crypto purchase with a ticket id of its own, so many blocks can each carry one.
function purchaseAt(height) {
    const vector = vectors.events.ticket_purchased;
    return { ...vector, data: [{ ...vector.data[0], ticket_id: height.toString(16).padStart(64, '0') }] };
}

function linkedEmptyBlock(height, prevHeight = height - 1) {
    return { network: 'testnet', contract_id: CONTRACT_ID, finality: 'final', block_height: height,
        block_hash: hashOf(height), prev_block_height: prevHeight, prev_block_hash: hashOf(prevHeight), events: [] };
}

function sparseEnv(db) {
    return { VIDEO_ENVIRONMENT: 'v2-testnet', MARKET_CONTRACT_ID: CONTRACT_ID, READ_MODEL_INGESTION_ENABLED: 'true',
        READ_MODEL_NETWORK: 'testnet', READ_MODEL_CONTRACT_ID: CONTRACT_ID, READ_MODEL_START_BLOCK_HEIGHT: '100',
        READ_MODEL_MAX_BLOCKS_PER_RUN: '180', READ_MODEL_NEAR_RPC_URL: 'https://test.rpc.fastnear.com', MARKET_READ_MODEL: db };
}

function header(height) {
    return { height, hash: hashOf(height), prev_height: height - 1, prev_hash: hashOf(height - 1) };
}

function watermark(db) {
    return { ...db.sqlite.prepare('SELECT block_height, block_hash, prev_block_height, scan_height FROM finality_watermarks').get() };
}

// A linked-scan database as W3.4 left it: watermark at 120 with a tentative scan cursor.
async function linkedDatabase() {
    const db = await database();
    await applyFinalMarketBlock(db, linkedEmptyBlock(120, 119));
    db.sqlite.prepare('UPDATE finality_watermarks SET scan_height = 140, scan_revision = 1').run();
    return db;
}

function sparseDeps(blocks, overrides = {}) {
    const fetched = [];
    const discovered = [];
    return {
        fetched, discovered,
        deps: {
            now: () => 0, sleepFn: async () => {}, logger: { log() {}, error() {} },
            fetchFinalHeight: async () => 1_000, fetchIndexHead: async () => 998,
            discoverEventBlocks: async (input) => {
                discovered.push(input);
                return Object.keys(blocks).map(Number)
                    .filter((h) => h >= input.minBlockHeight && h <= input.maxBlockHeight).sort((a, b) => a - b);
            },
            fetchBlock: async ({ blockHeight, requirePredecessor }) => {
                assert.equal(requirePredecessor, true);
                fetched.push(blockHeight);
                return eventBlock(blockHeight, blocks[blockHeight]);
            },
            fetchBlockHeader: async (height) => header(height),
            fetchEscrowBalance: async () => '0',
            ...overrides,
        },
    };
}

test('discovery keeps only successful, event-logging receipts of the contract inside the window', async () => {
    const hashes = Array.from({ length: 25 }, (_, i) => b58(5_000 + i));
    const receipts = (hash, i) => [
        { execution_outcome: { block_height: 300 + i, outcome: { executor_id: 'buyer.testnet', logs: ['EVENT_JSON:{}'], status: { SuccessValue: '' } } } },
        { execution_outcome: { block_height: 301 + i, outcome: { executor_id: CONTRACT_ID, logs: ['EVENT_JSON:{}'],
            status: i === 3 ? { Failure: {} } : { SuccessValue: '' } } } },
        { execution_outcome: { block_height: 302 + i, outcome: { executor_id: CONTRACT_ID, logs: ['plain log'], status: { SuccessValue: '' } } } },
    ];
    const calls = [];
    const fetchImpl = async (url, init) => {
        const body = JSON.parse(init.body);
        calls.push({ path: new URL(url).pathname, body });
        if (url.endsWith('/v0/account')) {
            const first = !body.resume_token;
            return Response.json({ account_txs: (first ? hashes.slice(0, 20) : hashes.slice(20)).map((transaction_hash, i) => ({
                account_id: CONTRACT_ID, transaction_hash, tx_block_height: 300 + i })), ...(first ? { resume_token: 'next' } : {}) });
        }
        return Response.json({ transactions: body.tx_hashes.map((hash) => ({ transaction: { hash },
            receipts: receipts(hash, hashes.indexOf(hash)) })) });
    };
    const heights = await discoverMarketEventBlocks({ network: 'testnet', contractId: CONTRACT_ID,
        fromTxHeight: 250, toTxHeight: 400, minBlockHeight: 305, maxBlockHeight: 320 }, fetchImpl);
    // Contract receipts at 301+i; i = 3 failed; heights outside 305..320 are dropped.
    assert.deepEqual(heights, Array.from({ length: 16 }, (_, i) => 305 + i));
    const accountCalls = calls.filter((call) => call.path === '/v0/account');
    assert.equal(accountCalls.length, 2);
    assert.deepEqual(accountCalls[0].body, { account_id: CONTRACT_ID, from_tx_block_height: 250, to_tx_block_height: 400,
        desc: false, limit: 200 });
    assert.equal(accountCalls[1].body.resume_token, 'next');
    assert.deepEqual(calls.filter((call) => call.path === '/v0/transactions').map((call) => call.body.tx_hashes.length),
        [TRANSACTIONS_PER_REQUEST, 5]);
});

test('discovery fails instead of advancing on a missing transaction, an endless index or a bad response', async () => {
    const hash = b58(6_000);
    const input = { network: 'testnet', contractId: CONTRACT_ID, fromTxHeight: 1, toTxHeight: 10, minBlockHeight: 1, maxBlockHeight: 10 };
    const account = () => Response.json({ account_txs: [{ account_id: CONTRACT_ID, transaction_hash: hash, tx_block_height: 5 }] });
    await assert.rejects(() => discoverMarketEventBlocks(input, async (url) => url.endsWith('/v0/account')
        ? account() : Response.json({ transactions: [] })), /fastnear_discovery_incomplete/);
    let pages = 0;
    await assert.rejects(() => discoverMarketEventBlocks(input, async () => {
        pages += 1;
        return Response.json({ account_txs: [], resume_token: 'more' });
    }), /fastnear_discovery_limit/);
    assert.equal(pages, MAX_ACCOUNT_PAGES);
    await assert.rejects(() => discoverMarketEventBlocks(input, async () => Response.json({ account_txs: [
        { account_id: CONTRACT_ID, transaction_hash: hash, tx_block_height: 99 }] })), /invalid_fastnear_discovery/);
    await assert.rejects(() => discoverMarketEventBlocks(input, async () => new Response('busy', { status: 429 })),
        /fastnear_discovery_unavailable/);
    await assert.rejects(() => discoverMarketEventBlocks({ ...input, network: 'devnet' }, fetch), /invalid_fastnear_discovery_request/);
    assert.equal(await fetchFastnearIndexHead('testnet', async () => Response.json({ blocks: [{ block_height: 7 }, { block_height: 9 }] })), 9);
    await assert.rejects(() => fetchFastnearIndexHead('testnet', async () => Response.json({ blocks: [] })), /invalid_fastnear_discovery/);
});

test('the V2 testnet reads only event blocks, jumps the watermark to the coverage height and reconciles escrow', async () => {
    const db = await linkedDatabase();
    const purchased = vectors.events.ticket_purchased;
    const { deps, fetched, discovered } = sparseDeps({ 300: [purchased], 650: [] }, {
        fetchEscrowBalance: async (height) => { assert.equal(height, 878); return purchased.data[0].gross_usdc_micro; },
    });
    const errors = [];
    deps.logger = { log() {}, error: (line) => errors.push(line) };
    const result = await ingestMarketReadModelBatch(sparseEnv(db), deps);
    assert.deepEqual(discovered, [{ network: 'testnet', contractId: CONTRACT_ID, fromTxHeight: 100, toTxHeight: 878,
        minBlockHeight: 100, maxBlockHeight: 878 }]);
    assert.deepEqual(fetched, [300, 650]);
    assert.equal(result.mode, 'sparse');
    assert.equal(result.status, 'applied');
    assert.equal(result.block_count, 2);
    // min(final 1000, index 998) - 120 safety blocks.
    assert.equal(result.coverage_block_height, 878);
    assert.deepEqual(result.escrow, { chain_usdc_micro: '5000000', read_model_usdc_micro: '5000000', matched: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(watermark(db), { block_height: 878, block_hash: hashOf(878), prev_block_height: 877, scan_height: null });
    assert.equal(db.sqlite.prepare('SELECT status FROM market_v2_tickets').get().status, 'purchased');
    db.sqlite.close();
});

test('a run within the safety margin does nothing, and the next run starts after the watermark', async () => {
    const db = await linkedDatabase();
    const { deps } = sparseDeps({});
    await ingestMarketReadModelBatch(sparseEnv(db), deps);
    assert.equal(watermark(db).block_height, 878);
    let called = false;
    const idle = await ingestMarketReadModelBatch(sparseEnv(db), { ...deps, discoverEventBlocks: async () => { called = true; return []; } });
    assert.equal(idle.status, 'caught_up');
    assert.equal(called, false);
    const next = sparseDeps({ 900: [vectors.events.ticket_purchased] }, { fetchFinalHeight: async () => 1_200, fetchIndexHead: async () => 1_200 });
    const result = await ingestMarketReadModelBatch(sparseEnv(db), next.deps);
    assert.deepEqual(next.discovered[0], { network: 'testnet', contractId: CONTRACT_ID, fromTxHeight: 279, toTxHeight: 1_080,
        minBlockHeight: 279, maxBlockHeight: 1_080 });
    assert.equal(result.block_height, 1_080);
    assert.equal(result.escrow.matched, false);
    db.sqlite.close();
});

test('more event blocks than a run takes leave the watermark on the last one written', async () => {
    const db = await linkedDatabase();
    const blocks = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [200 + i * 10, [purchaseAt(200 + i * 10)]]));
    const first = sparseDeps(blocks);
    const result = await ingestMarketReadModelBatch(sparseEnv(db), first.deps);
    assert.equal(result.status, 'catching_up');
    assert.equal(result.block_count, 20);
    assert.equal(first.fetched.length, 20);
    assert.equal(watermark(db).block_height, 390);
    const second = sparseDeps(blocks);
    const done = await ingestMarketReadModelBatch(sparseEnv(db), second.deps);
    assert.deepEqual(second.fetched, [400, 410, 420, 430, 440]);
    assert.equal(done.status, 'applied');
    // The blocks re-discovered below the watermark are all written.
    assert.equal(done.missed_event_blocks, undefined);
    assert.equal(watermark(db).block_height, 878);
    db.sqlite.close();
});

test('a skipped coverage height falls back to the nearest earlier block header', async () => {
    const db = await linkedDatabase();
    const { deps } = sparseDeps({}, { fetchBlockHeader: async (height) => (height >= 877 ? null : header(height)) });
    const result = await ingestMarketReadModelBatch(sparseEnv(db), deps);
    assert.equal(result.block_height, 876);
    assert.equal(watermark(db).block_height, 876);
    db.sqlite.close();
});

test('an escrow read failure reports without undoing the written blocks', async () => {
    const db = await linkedDatabase();
    const { deps } = sparseDeps({ 300: [vectors.events.ticket_purchased] }, {
        fetchEscrowBalance: async () => { throw new Error('read_model_rpc_unavailable'); },
    });
    const result = await ingestMarketReadModelBatch(sparseEnv(db), deps);
    assert.deepEqual(result.escrow, { matched: null, error_code: 'read_model_rpc_unavailable' });
    assert.equal(watermark(db).block_height, 878);
    db.sqlite.close();
});

test('a watermark changed by another writer aborts the replacement and writes nothing', async () => {
    const db = await linkedDatabase();
    const { deps } = sparseDeps({ 300: [vectors.events.ticket_purchased] }, {
        fetchBlock: async ({ blockHeight }) => {
            // Another writer moves the watermark between the read and the write.
            await applyFinalMarketBlock(db, linkedEmptyBlock(121, 120));
            return eventBlock(blockHeight, [vectors.events.ticket_purchased]);
        },
    });
    await assert.rejects(() => ingestMarketReadModelBatch(sparseEnv(db), deps), /read_model_watermark_conflict/);
    assert.equal(watermark(db).block_height, 121);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM market_v2_tickets').get().n, 0);
    db.sqlite.close();
});

test('only a forward replacement is accepted, and linked writers keep the contiguity trigger', async () => {
    const db = await linkedDatabase();
    const current = { block_height: 120, block_hash: hashOf(120) };
    await assert.rejects(() => applyFinalMarketBlockBatch(db, [linkedEmptyBlock(120, 119)], undefined,
        { replaceWatermark: current }), /invalid_read_model_watermark/);
    await assert.rejects(() => applyFinalMarketBlockBatch(db, [linkedEmptyBlock(200, 199)]), /non_contiguous_finality_watermark/);
    await applyFinalMarketBlockBatch(db, [linkedEmptyBlock(200, 199)], undefined, { replaceWatermark: current });
    assert.equal(watermark(db).block_height, 200);
    db.sqlite.close();
});

test('a window wider than one run reports catching_up until the coverage reaches its target', async () => {
    const db = await linkedDatabase();
    const { deps } = sparseDeps({}, { fetchFinalHeight: async () => 250_000, fetchIndexHead: async () => 250_000 });
    const first = await ingestMarketReadModelBatch(sparseEnv(db), deps);
    assert.equal(first.status, 'catching_up');
    assert.equal(first.coverage_block_height, 100_120);
    assert.equal(first.remaining_blocks, 249_880 - 100_120);
    const second = await ingestMarketReadModelBatch(sparseEnv(db), deps);
    assert.equal(second.coverage_block_height, 200_120);
    const third = await ingestMarketReadModelBatch(sparseEnv(db), deps);
    assert.equal(third.status, 'applied');
    assert.equal(third.remaining_blocks, 0);
    assert.equal(watermark(db).block_height, 249_880);
    db.sqlite.close();
});

test('an event block the index adds below the watermark raises an alarm instead of being dropped silently', async () => {
    const db = await linkedDatabase();
    const first = sparseDeps({ 300: [purchaseAt(300)] }, { fetchEscrowBalance: async () => '5000000' });
    await ingestMarketReadModelBatch(sparseEnv(db), first.deps);
    // The index now also returns 500, which the watermark (878) has already passed.
    const errors = [];
    const late = sparseDeps({ 300: [purchaseAt(300)], 500: [purchaseAt(500)] }, {
        fetchFinalHeight: async () => 1_100, fetchIndexHead: async () => 1_100, fetchEscrowBalance: async () => '10000000',
    });
    late.deps.logger = { log() {}, error: (line) => errors.push(JSON.parse(line)) };
    const result = await ingestMarketReadModelBatch(sparseEnv(db), late.deps);
    assert.deepEqual(result.missed_event_blocks, [500]);
    assert.deepEqual(late.fetched, []);
    assert.equal(result.escrow.matched, false);
    assert.deepEqual(errors.map((line) => line.status), ['missed_event_blocks', 'escrow_mismatch']);
    db.sqlite.close();
});

test('a window busier than the index page limit halves until it fits', async () => {
    const db = await linkedDatabase();
    const windows = [];
    const { deps } = sparseDeps({}, {
        fetchFinalHeight: async () => 9_000, fetchIndexHead: async () => 9_000,
        discoverEventBlocks: async (input) => {
            windows.push(input.toTxHeight);
            if (input.toTxHeight > 2_000) throw new Error('fastnear_discovery_limit');
            return [];
        },
    });
    const result = await ingestMarketReadModelBatch(sparseEnv(db), deps);
    assert.deepEqual(windows, [8_880, 4_500, 2_310, 1_215]);
    assert.equal(result.status, 'catching_up');
    assert.equal(watermark(db).block_height, 1_215);
    db.sqlite.close();
});

test('the query budget keeps room for the final watermark write and the escrow read', async () => {
    const db = await linkedDatabase();
    // Each one-event block costs 3 + 1 watermark + 1 delete = 5; 13 - 3 reserved leaves room for two.
    const { deps, fetched } = sparseDeps({ 300: [purchaseAt(300)], 310: [purchaseAt(310)], 320: [purchaseAt(320)] },
        { queryBudget: 13 });
    const result = await ingestMarketReadModelBatch(sparseEnv(db), deps);
    assert.deepEqual(fetched, [300, 310, 320]);
    assert.equal(result.status, 'catching_up');
    assert.equal(result.block_count, 2);
    assert.equal(watermark(db).block_height, 310);
    db.sqlite.close();
});
