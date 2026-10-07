import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { applyFinalMarketBlock } from './apply-market-read-model-d1.mjs';
import { parseNeardataMarketBlock } from './fetch-neardata-market-block.mjs';
import { rebuildMarketReadModel } from './rebuild-market-read-model.mjs';

const vectors = JSON.parse(await readFile(new URL('../protocol/youtick-market-v2/golden-vectors.json', import.meta.url), 'utf8'));
const CONTRACT_ID = vectors.fixture.contract_id;
const BLOCK_HASH = 'B6oE1UWkynBdztjt3CDPHv5er7q9PVqtYNUWBcC57SPX';
const TIMESTAMP_MS = 1_791_360_000_000;
const CRYPTO_TICKET = vectors.events.ticket_purchased.data[0].ticket_id;
const CARD_TICKET = vectors.events.card_ticket_issued.data[0].ticket_id;

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function receiptId(height, index) {
    return `3zJTATjCZGHh3879mgT1XZTssqfkGku6zcbBG2dizT${BASE58[height % 58]}${BASE58[index % 58]}`;
}

function neardataBlock(height, events, predecessor = 'bridge.testnet') {
    return {
        block: { header: { height, hash: BLOCK_HASH, timestamp_nanosec: String((TIMESTAMP_MS + height) * 1_000_000) } },
        shards: [{
            receipt_execution_outcomes: events.map((value, index) => {
                const id = receiptId(height, index + 1);
                return {
                    execution_outcome: {
                        block_hash: BLOCK_HASH,
                        id,
                        outcome: { executor_id: CONTRACT_ID, logs: [`EVENT_JSON:${JSON.stringify(value)}`], status: { SuccessValue: '' } },
                    },
                    receipt: { predecessor_id: predecessor, receiver_id: CONTRACT_ID, receipt_id: id },
                };
            }),
        }],
    };
}

function parsed(height, events) {
    return parseNeardataMarketBlock(neardataBlock(height, events), { network: 'testnet', contractId: CONTRACT_ID, blockHeight: height });
}

async function database() {
    const sqlite = new DatabaseSync(':memory:');
    for (const file of ['0001_initial.sql', '0002_contiguous_watermark.sql', '0010_market_v2_tickets.sql']) {
        sqlite.exec(await readFile(new URL(`../read-model/d1/${file}`, import.meta.url), 'utf8'));
    }
    return {
        sqlite,
        prepare(sql) {
            return { bind: (...values) => ({ sql, values }) };
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

test('V2 ticket events are accepted with context derived from the receipt', () => {
    const block = parsed(500, [vectors.events.ticket_purchased, vectors.events.device_added]);
    assert.equal(block.events.length, 2);
    const [purchase] = block.events;
    assert.equal(purchase.event.version, '2.0.0');
    assert.deepEqual(
        Object.fromEntries(['contract_id', 'predecessor_account_id', 'block_height', 'block_timestamp_ms']
            .map((key) => [key, purchase.event.data[0][key]])),
        {
            contract_id: CONTRACT_ID,
            predecessor_account_id: 'bridge.testnet',
            block_height: '500',
            block_timestamp_ms: String(TIMESTAMP_MS + 500),
        },
    );
    assert.match(purchase.event.data[0].idempotency_key, /^v2:[A-Za-z0-9]+:0$/);
    // The protocol fields are kept unchanged.
    assert.equal(purchase.event.data[0].ticket_id, CRYPTO_TICKET);
    assert.equal(purchase.event.data[0].creator_usdc_micro, vectors.events.ticket_purchased.data[0].creator_usdc_micro);
});

test('V2 envelopes only carry V2 events, and V1 envelopes only V1 events', () => {
    const unknown = { ...vectors.events.ticket_purchased, event: 'ticket_teleported' };
    const v1Name = { ...vectors.events.ticket_purchased, event: 'media_job_authorized' };
    const v1Envelope = { ...vectors.events.ticket_purchased, version: '1.0.0' };
    for (const value of [unknown, v1Name, v1Envelope]) {
        assert.throws(() => parsed(501, [value]), /invalid_neardata_event/);
    }
    const revoked = {
        standard: 'youtick_market', version: '1.0.0', event: 'vat_key_revoked',
        data: [{ contract_id: CONTRACT_ID, predecessor_account_id: 'guardian.testnet', block_height: '502',
            block_timestamp_ms: String(TIMESTAMP_MS + 502), idempotency_key: 'governance:vat_key_revoked:guardian.testnet:1',
            key_version: 1 }],
    };
    const block = parseNeardataMarketBlock(neardataBlock(502, [revoked], 'guardian.testnet'),
        { network: 'testnet', contractId: CONTRACT_ID, blockHeight: 502 });
    assert.equal(block.events[0].event.event, 'vat_key_revoked');
});

test('the reducer projects ticket lifecycles without devices or buyer accounts', () => {
    const records = [
        ...parsed(600, [vectors.events.ticket_purchased, vectors.events.card_ticket_issued, vectors.events.device_added]).events,
        ...parsed(601, [vectors.events.ticket_watched, vectors.events.creator_payout_credited]).events,
        ...parsed(602, [vectors.events.card_ticket_voided, vectors.events.device_revoked]).events,
    ];
    const model = rebuildMarketReadModel(records);
    const tickets = Object.fromEntries(model.market_v2_tickets.map((row) => [row.ticket_id, row]));
    assert.deepEqual(Object.keys(tickets).sort(), [CRYPTO_TICKET, CARD_TICKET].sort());
    assert.equal(tickets[CRYPTO_TICKET].status, 'watched');
    assert.equal(tickets[CRYPTO_TICKET].settled_at_ms, TIMESTAMP_MS + 601);
    assert.equal(tickets[CRYPTO_TICKET].payout_credited_to_balance, 1);
    assert.equal(tickets[CRYPTO_TICKET].gross_amount, vectors.fixture.gross_usdc_micro);
    assert.equal(tickets[CARD_TICKET].status, 'voided');
    assert.equal(tickets[CARD_TICKET].rail, 'card');
    assert.equal(tickets[CARD_TICKET].currency, 'USD');
    assert.ok(!JSON.stringify(model.market_v2_tickets).includes(vectors.fixture.buyer_id));
    assert.equal(model.governance_audit.length, 0);
    // A status event for a ticket purchased before indexing started is skipped, as in D1.
    assert.equal(rebuildMarketReadModel(parsed(603, [vectors.events.ticket_refunded]).events).market_v2_tickets, undefined);
});

test('D1 projections match the reducer and stay ordered by block height', async () => {
    const db = await database();
    await applyFinalMarketBlock(db, parsed(700, [vectors.events.ticket_purchased, vectors.events.card_ticket_issued, vectors.events.device_added]));
    await applyFinalMarketBlock(db, parsed(701, [vectors.events.ticket_released]));
    await applyFinalMarketBlock(db, parsed(702, [vectors.events.card_ticket_voided, vectors.events.device_revoked]));
    const rows = db.sqlite.prepare('SELECT * FROM market_v2_tickets ORDER BY rail').all();
    assert.equal(rows.length, 2);
    const [card, crypto] = rows;
    assert.equal(card.status, 'voided');
    assert.equal(card.gross_amount, '500');
    assert.equal(card.vat_usdc_micro, '0');
    assert.equal(crypto.status, 'released');
    assert.equal(crypto.settled_at_ms, TIMESTAMP_MS + 701);
    assert.equal(crypto.purchased_at_ms, TIMESTAMP_MS + 700);
    assert.equal(crypto.creator_usdc_micro, vectors.events.ticket_released.data[0].creator_usdc_micro);
    // Device events reach chain_events only.
    const events = db.sqlite.prepare('SELECT event_name, event_version FROM chain_events ORDER BY block_height, event_index, receipt_id').all();
    assert.ok(events.some((row) => row.event_name === 'device_added' && row.event_version === '2.0.0'));
    assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM governance_audit').get().n, 0);
    db.sqlite.close();
});

test('D1 rows equal the reducer output for the same final blocks, including replays', async () => {
    const blocks = [
        parsed(800, [vectors.events.ticket_purchased, vectors.events.card_ticket_issued]),
        parsed(801, [vectors.events.ticket_watched, vectors.events.ticket_purchased]),
        parsed(802, [vectors.events.creator_payout_credited, vectors.events.card_ticket_voided]),
        parsed(803, [vectors.events.ticket_refunded]),
    ];
    // A refund for a ticket D1 never saw (and the reducer skips) must not create a row.
    blocks[3].events[0].event.data[0].ticket_id = 'c'.repeat(64);
    const db = await database();
    for (const block of blocks) await applyFinalMarketBlock(db, block);
    const columns = ['ticket_id', 'publication_id', 'creator_id', 'rail', 'status', 'gross_amount', 'currency',
        'vat_usdc_micro', 'platform_usdc_micro', 'creator_usdc_micro', 'purchased_at_ms', 'settled_at_ms',
        'payout_credited_to_balance', 'source_block_height'];
    const fromD1 = db.sqlite.prepare(`SELECT ${columns.join(', ')} FROM market_v2_tickets ORDER BY ticket_id`).all()
        .map((row) => ({ ...row }));
    const fromReducer = rebuildMarketReadModel(blocks.flatMap((block) => block.events)).market_v2_tickets
        .map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])))
        .sort((left, right) => left.ticket_id.localeCompare(right.ticket_id));
    assert.deepEqual(fromD1, fromReducer);
    assert.equal(fromD1.length, 2);
    db.sqlite.close();
});

test('market-v2 producer and the indexer share the V2 catalog', async () => {
    const [contract, neardata, rebuild, schema] = await Promise.all([
        readFile(new URL('../contracts/market-v2/src/lib.rs', import.meta.url), 'utf8'),
        readFile(new URL('./fetch-neardata-market-block.mjs', import.meta.url), 'utf8'),
        readFile(new URL('./rebuild-market-read-model.mjs', import.meta.url), 'utf8'),
        readFile(new URL('../protocol/youtick-market-v2/schema.json', import.meta.url), 'utf8'),
    ]);
    const sorted = (values) => [...new Set(values)].sort();
    const setValues = (source, name) => sorted([...source.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`))[1]
        .matchAll(/'([a-z][a-z0-9_]*)'/g)].map((match) => match[1]));
    const emittedV2 = sorted([...contract.matchAll(/emit_market_v2_event\(\s*"([a-z][a-z0-9_]*)"/g)].map((match) => match[1]));
    const emittedV1 = sorted([...contract.matchAll(/emit_(?:market|governance)_event\(\s*"([a-z][a-z0-9_]*)"/g)].map((match) => match[1]));
    const protocolEvents = sorted(JSON.parse(schema).$defs.event.properties.event.enum);
    assert.deepEqual(emittedV2, protocolEvents);
    assert.deepEqual(setValues(neardata, 'MARKET_V2_EVENT_CATALOG'), protocolEvents);
    assert.deepEqual(setValues(rebuild, 'MARKET_V2_CATALOG'), protocolEvents);
    // Every 1.0.0 event the V2 contract emits is accepted by both consumers.
    const acceptedV1 = sorted([...setValues(neardata, 'EVENT_CATALOG'), ...setValues(neardata, 'MARKET_V2_V1_ENVELOPE_EVENTS')]);
    assert.deepEqual(emittedV1.filter((name) => !acceptedV1.includes(name)), []);
    assert.deepEqual(setValues(rebuild, 'MARKET_V2_V1_ENVELOPE_EVENTS'), setValues(neardata, 'MARKET_V2_V1_ENVELOPE_EVENTS'));
});
