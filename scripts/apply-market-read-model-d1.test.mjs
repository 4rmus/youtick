import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
    applyFinalMarketBlock,
    applyFinalMarketEventBatch,
} from './apply-market-read-model-d1.mjs';
import { runMarketReadModelOnce } from './run-market-read-model-once.mjs';
import {
    fetchNearFinalBlockHeight,
    ingestMarketReadModelBatch,
    marketReadModelWorker,
} from '../read-model/worker.mjs';

function event(blockHeight, eventName, idempotencyKey, data, eventIndex = 0) {
    return {
        network: 'testnet', finality: 'final', block_height: blockHeight,
        block_hash: `block_hash_${String(blockHeight).padStart(24, '0')}`,
        receipt_id: `receipt_${String(blockHeight).padStart(27, '0')}`,
        event_index: eventIndex,
        event: { standard: 'youtick_market', version: '1.0.0', event: eventName, data: [{
            contract_id: 'market.testnet', predecessor_account_id: 'bridge.testnet',
            block_height: String(blockHeight),
            block_timestamp_ms: String(1_785_600_000_000 + blockHeight),
            idempotency_key: idempotencyKey, ...data,
        }] },
    };
}

async function database() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(await readFile(new URL('../read-model/d1/0001_initial.sql', import.meta.url), 'utf8'));
    sqlite.exec(await readFile(new URL('../read-model/d1/0002_contiguous_watermark.sql', import.meta.url), 'utf8'));
    sqlite.exec(await readFile(new URL('../read-model/d1/0003_upload_job_archives.sql', import.meta.url), 'utf8'));
    sqlite.exec(await readFile(new URL('../read-model/d1/0004_operator_outbox_archives.sql', import.meta.url), 'utf8'));
    return {
        sqlite,
        prepare(sql) {
            return { bind: (...values) => ({
                sql,
                values,
                first() {
                    const row = sqlite.prepare(sql).get(...values);
                    return Promise.resolve(row ? { ...row } : null);
                },
            }) };
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

test('D1 upload archive keeps a bounded terminal summary and 14 day boundary', async () => {
    const db = await database();
    const terminalAtMs = 1_785_600_000_000;
    const cleanupEligibleAtMs = terminalAtMs + 14 * 24 * 60 * 60 * 1000;
    db.sqlite.prepare(`
        INSERT INTO upload_job_archives (
            network, contract_id, job_id, generation, creator_id,
            terminal_state, terminal_at_ms, expected_source_bytes,
            source_fingerprint_sha256, asset_id_sha256, project_id_sha256,
            archive_requested_at_ms, cleanup_eligible_at_ms, archive_sha256
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        'testnet', 'market.testnet', 'job-archive', 1, 'creator.testnet',
        'CANCELLED', terminalAtMs, '1000', 'a'.repeat(64), null, null,
        terminalAtMs, cleanupEligibleAtMs, 'b'.repeat(64),
    );
    assert.deepEqual(
        { ...db.sqlite.prepare(`
            SELECT terminal_state, cleanup_eligible_at_ms
            FROM upload_job_archives
        `).get() },
        { terminal_state: 'CANCELLED', cleanup_eligible_at_ms: cleanupEligibleAtMs },
    );
    assert.throws(() => db.sqlite.prepare(`
        INSERT INTO upload_job_archives (
            network, contract_id, job_id, generation, creator_id,
            terminal_state, terminal_at_ms, expected_source_bytes,
            archive_requested_at_ms, cleanup_eligible_at_ms, archive_sha256
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        'testnet', 'market.testnet', 'job-too-early', 1, 'creator.testnet',
        'CANCELLED', terminalAtMs, '1000', terminalAtMs,
        cleanupEligibleAtMs - 1, 'c'.repeat(64),
    ), /CHECK constraint failed/);
});

test('D1 operator archive keeps a bounded confirmed summary and 90 day boundary', async () => {
    const db = await database();
    const createdAtMs = 1_785_599_999_000;
    const confirmedAtMs = 1_785_600_000_000;
    const cleanupEligibleAtMs = confirmedAtMs + 90 * 24 * 60 * 60 * 1000;
    const insert = db.sqlite.prepare(`
        INSERT INTO operator_outbox_archives (
            network, contract_id, operator_account_id, operator_key_epoch,
            idempotency_key, method, payload_sha256, tx_hash, created_at_ms,
            confirmed_at_ms, archive_requested_at_ms, cleanup_eligible_at_ms,
            archive_sha256
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
        'testnet', 'market.testnet', 'operator.testnet', 1,
        'job-archive:1:finalize', 'finalize_livepeer_publication',
        'a'.repeat(64), 'public-transaction-hash', createdAtMs, confirmedAtMs,
        confirmedAtMs, cleanupEligibleAtMs, 'b'.repeat(64),
    );
    assert.deepEqual(
        { ...db.sqlite.prepare(`
            SELECT method, cleanup_eligible_at_ms
            FROM operator_outbox_archives
        `).get() },
        {
            method: 'finalize_livepeer_publication',
            cleanup_eligible_at_ms: cleanupEligibleAtMs,
        },
    );
    assert.throws(() => insert.run(
        'testnet', 'market.testnet', 'operator.testnet', 2,
        'job-too-early:1:finalize', 'finalize_livepeer_publication',
        'c'.repeat(64), null, createdAtMs, confirmedAtMs,
        confirmedAtMs, cleanupEligibleAtMs - 1, 'd'.repeat(64),
    ), /CHECK constraint failed/);
    db.sqlite.close();
});

const authorized = event(100, 'media_job_authorized', 'job:job-1:1:authorized', {
    account_id: 'creator.testnet', job_id: 'job-1', generation: 1,
    expected_source_bytes: '1000000', asset: 'USDC', amount: '500000',
});
const finalized = event(101, 'publication_finalized', 'publication:job-1:1:finalized', {
    account_id: 'creator.testnet', publication_id: 'job-1', generation: 1,
    title: 'Paid video', playback_id: 'playback_job_1',
    published_at_ms: 1_785_600_000_101,
    amount: '2000000', availability: 'ACTIVE',
});

test('D1 final block batch atomically applies events, projections and watermark', async () => {
    const db = await database();
    await applyFinalMarketEventBatch(db, [authorized]);
    await applyFinalMarketEventBatch(db, [finalized]);
    await applyFinalMarketEventBatch(db, [finalized]);

    assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM chain_events').get().count, 2);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM media_jobs').get().count, 1);
    assert.deepEqual(
        { ...db.sqlite.prepare('SELECT title, playback_id, published_at_ms, availability, source_block_height FROM publications').get() },
        {
            title: 'Paid video', playback_id: 'playback_job_1',
            published_at_ms: 1_785_600_000_101,
            availability: 'ACTIVE', source_block_height: 101,
        },
    );
    assert.deepEqual(
        { ...db.sqlite.prepare('SELECT block_height, block_hash FROM finality_watermarks').get() },
        { block_height: 101, block_hash: 'block_hash_000000000000000000000101' },
    );
    db.sqlite.close();
});

test('D1 withdrawal projection keeps the exact terminal event status', async () => {
    const db = await database();
    const withdrawalId = 'creator-withdrawal:creator.testnet:1960000:1785600000100';
    const withdrawal = (blockHeight, eventName) => event(
        blockHeight,
        eventName,
        withdrawalId,
        {
            account_id: 'creator.testnet', asset: 'USDC', amount: '1960000',
            withdrawal_id: withdrawalId,
        },
    );
    await applyFinalMarketEventBatch(db, [withdrawal(100, 'creator_balance_withdrawal_started')]);
    await applyFinalMarketEventBatch(db, [withdrawal(101, 'creator_balance_withdrawal_succeeded')]);

    assert.equal(
        db.sqlite.prepare('SELECT status FROM withdrawal_history').get().status,
        'creator_balance_withdrawal_succeeded',
    );
    db.sqlite.close();
});

test('D1 records purchase pause as governance audit', async () => {
    const db = await database();
    await applyFinalMarketEventBatch(db, [event(
        100,
        'new_purchases_paused',
        'governance:new-purchases:paused:100',
        { actor_id: 'guardian.testnet' },
    )]);

    assert.deepEqual(
        { ...db.sqlite.prepare('SELECT event_name, idempotency_key FROM governance_audit').get() },
        {
            event_name: 'new_purchases_paused',
            idempotency_key: 'governance:new-purchases:paused:100',
        },
    );
    db.sqlite.close();
});

test('D1 batch rolls back a conflicting business idempotency key', async () => {
    const db = await database();
    await applyFinalMarketEventBatch(db, [authorized]);
    const conflict = structuredClone(authorized);
    conflict.block_height = 102;
    conflict.block_hash = 'block_hash_000000000000000000000102';
    conflict.receipt_id = 'receipt_000000000000000000000000102';
    conflict.event.data[0].block_height = '102';
    conflict.event.data[0].amount = '600000';

    await assert.rejects(() => applyFinalMarketEventBatch(db, [conflict]));
    assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM chain_events').get().count, 1);
    assert.equal(db.sqlite.prepare('SELECT fee_amount FROM media_jobs').get().fee_amount, '500000');
    assert.equal(db.sqlite.prepare('SELECT block_height FROM finality_watermarks').get().block_height, 100);
    db.sqlite.close();
});

test('D1 batch rejects mixed blocks before preparing a write', async () => {
    const db = await database();
    await assert.rejects(
        () => applyFinalMarketEventBatch(db, [authorized, finalized]),
        /mixed_d1_final_block_batch/,
    );
    assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM chain_events').get().count, 0);
    db.sqlite.close();
});

test('D1 advances the finality watermark for a complete block with no market events', async () => {
    const db = await database();
    await applyFinalMarketBlock(db, {
        network: 'testnet',
        contract_id: 'market.testnet',
        finality: 'final',
        block_height: 99,
        block_hash: 'block_hash_000000000000000000000099',
        events: [],
    });

    assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM chain_events').get().count, 0);
    assert.deepEqual(
        { ...db.sqlite.prepare('SELECT block_height, block_hash FROM finality_watermarks').get() },
        { block_height: 99, block_hash: 'block_hash_000000000000000000000099' },
    );
    db.sqlite.close();
});

test('D1 halts without a watermark when a complete block exceeds the pilot event cap', async () => {
    const db = await database();
    await assert.rejects(() => applyFinalMarketBlock(db, {
        network: 'testnet', contract_id: 'market.testnet', finality: 'final',
        block_height: 99, block_hash: 'block_hash_000000000000000000000099',
        events: Array.from({ length: 17 }, () => ({})),
    }), /d1_final_block_event_limit_exceeded/);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM chain_events').get().count, 0);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM finality_watermarks').get().count, 0);
    db.sqlite.close();
});

test('D1 accepts only the next block or an exact replay and rolls back cursor violations', async () => {
    const db = await database();
    const emptyBlock = (blockHeight, blockHash = `block_hash_${String(blockHeight).padStart(24, '0')}`) => ({
        network: 'testnet', contract_id: 'market.testnet', finality: 'final',
        block_height: blockHeight, block_hash: blockHash, events: [],
    });
    await applyFinalMarketBlock(db, emptyBlock(100));
    await applyFinalMarketBlock(db, emptyBlock(100));
    const gap = event(102, 'media_job_authorized', 'job:gap:1:authorized', {
        account_id: 'creator.testnet', job_id: 'gap', generation: 1,
        expected_source_bytes: '1000', asset: 'USDC', amount: '500000',
    });
    await assert.rejects(() => applyFinalMarketEventBatch(db, [gap]),
        /non_contiguous_finality_watermark/);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM chain_events').get().count, 0);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM media_jobs').get().count, 0);
    await assert.rejects(() => applyFinalMarketBlock(db, emptyBlock(100, 'different_hash_000000000000000000')));
    await assert.rejects(() => applyFinalMarketBlock(db, emptyBlock(99)),
        /non_contiguous_finality_watermark/);
    await applyFinalMarketBlock(db, emptyBlock(101));
    assert.deepEqual(
        { ...db.sqlite.prepare('SELECT block_height, block_hash FROM finality_watermarks').get() },
        { block_height: 101, block_hash: 'block_hash_000000000000000000000101' },
    );
    db.sqlite.close();
});

test('single-step runner starts at deployment and then advances exactly one block', async () => {
    const db = await database();
    const requested = [];
    const fetchBlock = async (input) => {
        requested.push(input.blockHeight);
        return {
            schema: 'youtick.market-final-block.v1',
            network: input.network,
            contract_id: input.contractId,
            finality: 'final',
            block_height: input.blockHeight,
            block_hash: `block_hash_${String(input.blockHeight).padStart(24, '0')}`,
            events: [],
        };
    };
    const config = {
        network: 'testnet', contractId: 'market.testnet', startBlockHeight: 100,
    };
    assert.equal((await runMarketReadModelOnce(db, config, fetchBlock)).block_height, 100);
    assert.equal((await runMarketReadModelOnce(db, config, fetchBlock)).block_height, 101);
    assert.deepEqual(requested, [100, 101]);
    db.sqlite.close();
});

test('single-step runner fails before fetch on invalid config or watermark', async () => {
    const db = await database();
    let fetched = false;
    const fetchBlock = async () => {
        fetched = true;
        throw new Error('unexpected_fetch');
    };
    await assert.rejects(
        () => runMarketReadModelOnce(db, {
            network: 'testnet', contractId: 'market.testnet', startBlockHeight: 0,
        }, fetchBlock),
        /invalid_read_model_runner_config/,
    );
    db.sqlite.prepare('INSERT INTO finality_watermarks VALUES (?, ?, ?, ?, ?)').run(
        'testnet', 'market.testnet', 99, 'block_hash_000000000000000000000099', Date.now(),
    );
    await assert.rejects(
        () => runMarketReadModelOnce(db, {
            network: 'testnet', contractId: 'market.testnet', startBlockHeight: 100,
        }, fetchBlock),
        /invalid_read_model_watermark/,
    );
    assert.equal(fetched, false);
    db.sqlite.close();
});

test('scheduled ingestion is inert while its independent runtime gate is closed', async () => {
    let fetched = false;
    const result = await ingestMarketReadModelBatch({
        READ_MODEL_INGESTION_ENABLED: 'false',
    }, {
        fetchBlock: async () => {
            fetched = true;
            throw new Error('unexpected_fetch');
        },
        fetchFinalHeight: async () => {
            fetched = true;
            throw new Error('unexpected_fetch');
        },
    });
    assert.deepEqual(result, {
        schema: 'youtick.read-model-ingestion.v1', status: 'disabled',
    });
    assert.equal(fetched, false);
});

test('scheduled Worker applies one testnet block and rejects unsafe activation config', async () => {
    const db = await database();
    const env = {
        READ_MODEL_INGESTION_ENABLED: 'true',
        READ_MODEL_NETWORK: 'testnet',
        READ_MODEL_CONTRACT_ID: 'market.testnet',
        READ_MODEL_START_BLOCK_HEIGHT: '100',
        READ_MODEL_MAX_BLOCKS_PER_RUN: '180',
        READ_MODEL_NEAR_RPC_URL: 'https://test.rpc.fastnear.com',
        MARKET_READ_MODEL: db,
    };
    const fetchBlock = async (input) => ({
        schema: 'youtick.market-final-block.v1',
        network: input.network,
        contract_id: input.contractId,
        finality: 'final',
        block_height: input.blockHeight,
        block_hash: `block_hash_${String(input.blockHeight).padStart(24, '0')}`,
        events: [],
    });
    const waits = [];
    const logs = [];
    const dependencies = {
        fetchBlock,
        fetchFinalHeight: async () => 100,
        logger: { log: (value) => logs.push(value), error: (value) => logs.push(value) },
    };
    marketReadModelWorker.scheduled(
        {}, env, { waitUntil: (promise) => waits.push(promise) }, dependencies,
    );
    assert.equal(waits.length, 1);
    assert.deepEqual(await waits[0], {
        schema: 'youtick.read-model-ingestion.v1', status: 'applied',
        block_count: 1, final_block_height: 100, remaining_blocks: 0, block_height: 100,
        block_hash: 'block_hash_000000000000000000000100', event_count: 0,
    });
    assert.deepEqual(JSON.parse(logs[0]), {
        schema: 'youtick.read-model-ingestion.v1', status: 'applied',
        block_count: 1, final_block_height: 100, remaining_blocks: 0, block_height: 100,
        block_hash: 'block_hash_000000000000000000000100', event_count: 0,
    });
    const requested = [];
    const caughtUp = await ingestMarketReadModelBatch(env, {
        fetchFinalHeight: async () => 102,
        fetchBlock: async (input) => {
            requested.push(input.blockHeight);
            return fetchBlock(input);
        },
    });
    assert.deepEqual(requested, [101, 102]);
    assert.deepEqual(caughtUp, {
        schema: 'youtick.read-model-ingestion.v1', status: 'applied',
        block_count: 2, final_block_height: 102, remaining_blocks: 0, block_height: 102,
        block_hash: 'block_hash_000000000000000000000102', event_count: 0,
    });
    await assert.rejects(() => ingestMarketReadModelBatch({
        ...env, READ_MODEL_NETWORK: 'mainnet',
    }, dependencies), /invalid_read_model_ingestion_config/);
    const errors = [];
    const failedWaits = [];
    marketReadModelWorker.scheduled(
        {}, { ...env, READ_MODEL_NETWORK: 'mainnet' },
        { waitUntil: (promise) => failedWaits.push(promise) },
        {
            ...dependencies,
            logger: { log: () => {}, error: (value) => errors.push(value) },
        },
    );
    await assert.rejects(() => failedWaits[0], /invalid_read_model_ingestion_config/);
    assert.deepEqual(JSON.parse(errors[0]), {
        schema: 'youtick.read-model-ingestion.v1',
        status: 'failed',
        error_code: 'invalid_read_model_ingestion_config',
    });
    db.sqlite.close();
});

test('scheduled ingestion emits and throws only a bounded D1 failure code', async () => {
    const waits = [];
    const logs = [];
    marketReadModelWorker.scheduled({}, {
        READ_MODEL_INGESTION_ENABLED: 'true',
        READ_MODEL_NETWORK: 'testnet',
        READ_MODEL_CONTRACT_ID: 'market.testnet',
        READ_MODEL_START_BLOCK_HEIGHT: '100',
        READ_MODEL_MAX_BLOCKS_PER_RUN: '180',
        READ_MODEL_NEAR_RPC_URL: 'https://test.rpc.fastnear.com',
        MARKET_READ_MODEL: {
            prepare() {
                throw new Error('token_secret_value');
            },
        },
    }, { waitUntil: (promise) => waits.push(promise) }, {
        fetchFinalHeight: async () => 100,
        logger: { log: (value) => logs.push(value), error: (value) => logs.push(value) },
    });

    await assert.rejects(() => waits[0], /^Error: read_model_ingestion_failed$/);
    assert.deepEqual(JSON.parse(logs[0]), {
        schema: 'youtick.read-model-ingestion.v1',
        status: 'failed',
        error_code: 'read_model_ingestion_failed',
    });
    assert.doesNotMatch(`${logs.join('\n')} ${await waits[0].catch((error) => error.message)}`,
        /token_secret_value/);
});

test('scheduled ingestion is bounded to 180 sequential blocks per paid-plan run', async () => {
    const db = await database();
    const requested = [];
    const result = await ingestMarketReadModelBatch({
        READ_MODEL_INGESTION_ENABLED: 'true',
        READ_MODEL_NETWORK: 'testnet',
        READ_MODEL_CONTRACT_ID: 'market.testnet',
        READ_MODEL_START_BLOCK_HEIGHT: '100',
        READ_MODEL_MAX_BLOCKS_PER_RUN: '180',
        READ_MODEL_NEAR_RPC_URL: 'https://test.rpc.fastnear.com',
        MARKET_READ_MODEL: db,
    }, {
        fetchFinalHeight: async () => 350,
        fetchBlock: async (input) => {
            requested.push(input.blockHeight);
            return {
                network: input.network, contract_id: input.contractId, finality: 'final',
                block_height: input.blockHeight,
                block_hash: `block_hash_${String(input.blockHeight).padStart(24, '0')}`,
                events: [],
            };
        },
    });
    assert.equal(result.block_count, 180);
    assert.equal(result.block_height, 279);
    assert.deepEqual([requested[0], requested.at(-1)], [100, 279]);
    db.sqlite.close();
});

test('Queue backfill is closed by default and retries without reading', async () => {
    let fetched = false;
    let acked = 0;
    let retried = 0;
    const logs = [];
    await marketReadModelWorker.queue({
        messages: [{
            body: {},
            ack: () => { acked += 1; },
            retry: () => { retried += 1; },
        }],
    }, { READ_MODEL_BACKFILL_ENABLED: 'false' }, {}, {
        fetchBlock: async () => { fetched = true; },
        fetchFinalHeight: async () => { fetched = true; },
        logger: { log: (value) => logs.push(value), error: (value) => logs.push(value) },
    });

    assert.equal(fetched, false);
    assert.equal(acked, 0);
    assert.equal(retried, 1);
    assert.deepEqual(JSON.parse(logs[0]), {
        schema: 'youtick.read-model-backfill.v1', status: 'disabled',
    });

    const configErrors = [];
    await marketReadModelWorker.queue({
        messages: [{ body: {}, ack: () => {}, retry: () => { retried += 1; } }],
    }, {
        READ_MODEL_BACKFILL_ENABLED: 'true',
        READ_MODEL_NETWORK: 'testnet',
        READ_MODEL_CONTRACT_ID: 'market.testnet',
        READ_MODEL_START_BLOCK_HEIGHT: '100',
        READ_MODEL_MAX_BLOCKS_PER_RUN: '180',
        READ_MODEL_NEAR_RPC_URL: 'https://test.rpc.fastnear.com',
        MARKET_READ_MODEL: { prepare: () => { throw new Error('unexpected_read'); } },
    }, {}, {
        logger: { log: () => {}, error: (value) => configErrors.push(value) },
    });
    assert.equal(retried, 2);
    assert.deepEqual(JSON.parse(configErrors[0]), {
        schema: 'youtick.read-model-backfill.v1',
        status: 'failed',
        error_code: 'invalid_read_model_backfill_config',
    });
});

test('Queue backfill bounds work, repairs a failed continuation and rejects a gap', async () => {
    const db = await database();
    const requested = [];
    const sendAttempts = [];
    const logs = [];
    let queueUnavailable = true;
    const env = {
        READ_MODEL_BACKFILL_ENABLED: 'true',
        READ_MODEL_NETWORK: 'testnet',
        READ_MODEL_CONTRACT_ID: 'market.testnet',
        READ_MODEL_START_BLOCK_HEIGHT: '100',
        READ_MODEL_MAX_BLOCKS_PER_RUN: '180',
        READ_MODEL_NEAR_RPC_URL: 'https://test.rpc.fastnear.com',
        MARKET_READ_MODEL: db,
        READ_MODEL_BACKFILL_QUEUE: {
            async send(body, options) {
                sendAttempts.push({ body, options });
                if (queueUnavailable) throw new Error('provider_secret_value');
            },
        },
    };
    const dependencies = {
        fetchFinalHeight: async () => 350,
        fetchBlock: async (input) => {
            requested.push(input.blockHeight);
            return {
                network: input.network, contract_id: input.contractId, finality: 'final',
                block_height: input.blockHeight,
                block_hash: `block_hash_${String(input.blockHeight).padStart(24, '0')}`,
                events: [],
            };
        },
        logger: { log: (value) => logs.push(value), error: (value) => logs.push(value) },
    };
    const message = (nextBlockHeight) => {
        let acked = 0;
        let retried = 0;
        return {
            body: {
                schema: 'youtick.read-model-backfill-message.v1',
                next_block_height: nextBlockHeight,
            },
            ack: () => { acked += 1; },
            retry: () => { retried += 1; },
            counts: () => ({ acked, retried }),
        };
    };

    const first = message(100);
    await marketReadModelWorker.queue({ messages: [first] }, env, {}, dependencies);
    assert.deepEqual(first.counts(), { acked: 0, retried: 1 });
    assert.equal(requested.length, 180);
    assert.deepEqual([requested[0], requested.at(-1)], [100, 279]);
    assert.deepEqual(sendAttempts[0], {
        body: {
            schema: 'youtick.read-model-backfill-message.v1',
            next_block_height: 280,
        },
        options: { contentType: 'json' },
    });
    assert.deepEqual(JSON.parse(logs[0]), {
        schema: 'youtick.read-model-backfill.v1',
        status: 'failed',
        error_code: 'read_model_backfill_queue_unavailable',
    });
    assert.doesNotMatch(logs.join('\n'), /provider_secret_value/);

    queueUnavailable = false;
    const replay = message(100);
    await marketReadModelWorker.queue({ messages: [replay] }, env, {}, dependencies);
    assert.deepEqual(replay.counts(), { acked: 1, retried: 0 });
    assert.equal(requested.length, 180);
    assert.deepEqual(sendAttempts[1], sendAttempts[0]);
    assert.deepEqual(JSON.parse(logs[1]), {
        schema: 'youtick.read-model-backfill.v1',
        status: 'stale_requeued',
        next_block_height: 280,
    });

    const gap = message(281);
    await marketReadModelWorker.queue({ messages: [gap] }, env, {}, dependencies);
    assert.deepEqual(gap.counts(), { acked: 0, retried: 1 });
    assert.equal(requested.length, 180);
    assert.equal(sendAttempts.length, 2);
    assert.deepEqual(JSON.parse(logs[2]), {
        schema: 'youtick.read-model-backfill.v1',
        status: 'failed',
        error_code: 'read_model_backfill_gap',
    });

    const malformed = message(280);
    malformed.body.next_block_height = '280';
    await marketReadModelWorker.queue({ messages: [malformed] }, env, {}, dependencies);
    assert.deepEqual(malformed.counts(), { acked: 0, retried: 1 });
    assert.equal(requested.length, 180);
    assert.equal(sendAttempts.length, 2);
    assert.deepEqual(JSON.parse(logs[3]), {
        schema: 'youtick.read-model-backfill.v1',
        status: 'failed',
        error_code: 'invalid_read_model_backfill_message',
    });
    db.sqlite.close();
});

test('final-height RPC is bounded and requires the exact final block response', async () => {
    let request;
    const height = await fetchNearFinalBlockHeight({
        READ_MODEL_NEAR_RPC_URL: 'https://test.rpc.fastnear.com',
    }, async (url, init) => {
        request = { url, init };
        return Response.json({
            jsonrpc: '2.0', id: 'youtick-read-model-final',
            result: { header: { height: 250 } },
        });
    });
    assert.equal(height, 250);
    assert.equal(request.url, 'https://test.rpc.fastnear.com/');
    assert.deepEqual(JSON.parse(request.init.body).params, { finality: 'final' });
    await assert.rejects(() => fetchNearFinalBlockHeight({
        READ_MODEL_NEAR_RPC_URL: 'https://test.rpc.fastnear.com',
    }, async () => Response.json({
        jsonrpc: '2.0', id: 'wrong', result: { header: { height: 250 } },
    })), /invalid_read_model_final_rpc/);
});
