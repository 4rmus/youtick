import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { ingestMarketReadModelBatch } from '../read-model/worker.mjs';
import { devSource, initializeDevDatabase, applyDevPage, runDevPage, restartDevScan } from './fastnear-dev.mjs';
import { rebuildMarketReadModel } from './rebuild-market-read-model.mjs';

async function database() {
    const sqlite = new DatabaseSync(':memory:');
    const db = { sqlite, prepare(sql) {
        const bound = values => ({ sql, values, bind: (...next) => bound(next),
            first: async () => { const r = sqlite.prepare(sql).get(...values); return r ? { ...r } : null; },
            all: async () => ({ results: sqlite.prepare(sql).all(...values).map(r => ({ ...r })) }),
            run: async () => ({ success: true, meta: sqlite.prepare(sql).run(...values) }) });
        return bound([]);
    }, async batch(statements) {
        sqlite.exec('BEGIN');
        try { for (const s of statements) sqlite.prepare(s.sql).run(...s.values); sqlite.exec('COMMIT'); return []; }
        catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    } };
    await initializeDevDatabase(db);
    return db;
}

function event(name, height, receipt, data, execution_index = 0) {
    return { network: 'testnet', finality: 'final', block_height: height, block_hash: 'H'.repeat(44),
        receipt_id: receipt.repeat(44), event_index: 0, execution_index,
        event: { standard: 'youtick_market', version: '1.0.0', event: name, data: [{
            contract_id: 'market.testnet', predecessor_account_id: 'creator.testnet', block_height: String(height),
            block_timestamp_ms: '1785600000000', idempotency_key: `${name}:${receipt}`, ...data }] } };
}
const authorized = event('media_job_authorized', 100, 'z', {
    account_id: 'creator.testnet', job_id: 'job-1', generation: 1, expected_source_bytes: '1000', asset: 'USDC', amount: '500000',
});
const replaced = event('media_job_upload_key_replaced', 100, 'A', {
    job_id: 'job-1', generation: 1, upload_public_key_sha256: 'a'.repeat(64),
}, 1);
const published = event('publication_finalized', 102, 'P', {
    account_id: 'creator.testnet', publication_id: 'job-1', generation: 1, title: 'Dev video',
    playback_id: 'playback_dev', amount: '2000000', availability: 'ACTIVE', published_at_ms: 1785600000000,
});
const state = (complete, cursor = null) => ({ complete, cursor, upper: 200, count: 1 });
const page = (events, complete = true) => ({ events, reference: events, state: state(complete, complete ? null : 'saved-token') });

test('dev D1 stages partial pages and resumes, applying same-block execution order and >16 events', async t => {
    const db = await database(); t.after(() => db.sqlite.close());
    await applyDevPage(db, 'market.testnet', page([replaced], false));
    assert.equal((await db.prepare('SELECT count(*) AS n FROM media_jobs').first()).n, 0);
    const purchases = Array.from({ length: 20 }, (_, i) => event('entitlement_purchased', 103, String.fromCharCode(67 + i), {
        account_id: `buyer${i}.testnet`, creator_id: 'creator.testnet', publication_id: 'job-1',
        asset: 'USDC', amount: '2000000', creator_amount: '1960000', platform_amount: '40000',
        idempotency_key: `purchase:${i}`,
    }, i));
    const source = { async page(_contract, saved) {
        assert.equal(saved.cursor, 'saved-token');
        return page([published, authorized, ...purchases.reverse()]);
    } };
    const result = await runDevPage(db, 'market.testnet', source);
    assert.equal(result.events, 23);
    assert.equal((await db.prepare('SELECT * FROM media_jobs').first()).upload_public_key_sha256, 'a'.repeat(64));
    assert.equal((await db.prepare('SELECT count(*) AS n FROM sale_ledger').first()).n, 20);
    await applyDevPage(db, 'market.testnet', page([authorized, replaced, published, ...purchases]));
    assert.equal((await db.prepare('SELECT count(*) AS n FROM sale_ledger').first()).n, 20);
    await restartDevScan(db, 'market.testnet');
    assert.equal(await db.prepare('SELECT * FROM dev_fastnear_state').first(), null);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM dev_fastnear_events').first()).n, 23);
});

test('missing prerequisite, cross-contract or conflicting events cannot publish or advance', async t => {
    const db = await database(); t.after(() => db.sqlite.close());
    await assert.rejects(() => applyDevPage(db, 'market.testnet', page([replaced])), /projection_job_missing/);
    assert.equal(await db.prepare('SELECT * FROM dev_fastnear_state').first(), null);
    await applyDevPage(db, 'market.testnet', page([authorized, published]));
    const conflict = structuredClone(published); conflict.event.data[0].title = 'Changed payload';
    await assert.rejects(() => applyDevPage(db, 'market.testnet', page([conflict])), /conflicting_event/);
    await assert.rejects(() => applyDevPage(db, 'other.testnet', page([published])), /dev_scope_mismatch/);
    const takedown = event('publication_takedown', 104, 'C', { publication_id: 'job-1', availability: 'TAKEDOWN' });
    await applyDevPage(db, 'market.testnet', page([takedown]));
    await applyDevPage(db, 'market.testnet', page([published]));
    assert.equal((await db.prepare('SELECT availability FROM publications').first()).availability, 'TAKEDOWN');
    const unordered = { ...published }; delete unordered.execution_index;
    assert.throws(() => rebuildMarketReadModel([authorized, unordered]), /mixed_execution_order_evidence/);
    assert.throws(() => rebuildMarketReadModel([{ ...authorized, execution_index: -1 }]), /invalid_final_event_envelope/);
});

test('a D1 commit failure rolls back projection, staged events and cursor together', async t => {
    const db = await database(); t.after(() => db.sqlite.close());
    await applyDevPage(db, 'market.testnet', page([authorized], false));
    db.sqlite.exec("CREATE TRIGGER fail_checkpoint BEFORE INSERT ON dev_fastnear_state BEGIN SELECT RAISE(ABORT,'injected_failure'); END");
    await assert.rejects(() => applyDevPage(db, 'market.testnet', page([published])), /injected_failure/);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM publications').first()).n, 0);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM dev_fastnear_events').first()).n, 1);
    assert.equal(JSON.parse((await db.prepare('SELECT state_json FROM dev_fastnear_state').first()).state_json).cursor, 'saved-token');
});

function fixtures({ finality = 'FINAL', status = { SuccessValue: '' }, otherReceiver = false } = {}) {
    const logs = ['EVENT_JSON:' + JSON.stringify(authorized.event)];
    const item = { receipt: { receiver_id: otherReceiver ? 'other.testnet' : 'market.testnet', predecessor_id: 'creator.testnet', receipt_id: authorized.receipt_id },
        execution_outcome: { id: authorized.receipt_id, block_height: 100, block_hash: authorized.block_hash,
            outcome: { executor_id: 'market.testnet', logs, status } } };
    const tx = { transaction: { hash: 'T'.repeat(44), signer_id: 'creator.testnet', receiver_id: 'usdc.testnet' }, receipts: [item] };
    const raw = { block: { header: { height: 100, hash: authorized.block_hash, timestamp_nanosec: '1785600000000000000' } },
        shards: [{ receipt_execution_outcomes: [item] }] };
    const calls = [];
    const fetchImpl = async (url, init) => {
        const body = init.body ? JSON.parse(init.body) : null;
        calls.push({ url, body });
        if (body?.method === 'block') return Response.json({ result: { header: { height: 110, hash: 'H'.repeat(44) } } });
        if (url.endsWith('/v0/account')) return Response.json({ account_txs: [{ account_id: 'market.testnet', transaction_hash: tx.transaction.hash,
            tx_block_height: 99, tx_index: 0, is_receiver: true }] });
        if (url.endsWith('/v0/transactions')) return Response.json({ transactions: [tx] });
        if (body?.method === 'tx') return Response.json({ result: { transaction: tx.transaction, final_execution_status: finality, receipts_outcome: [item.execution_outcome] } });
        if (url.includes('/v0/block/')) return Response.json(raw);
        throw new Error('unexpected_fetch');
    };
    return { fetchImpl, calls };
}

test('source discovers an internal Market receipt, validates FINAL and uses explicit ascending inclusive bounds', async () => {
    const mock = fixtures();
    const source = devSource(mock.fetchImpl);
    const result = await source.page('market.testnet', null);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].execution_index, 0);
    const request = mock.calls.find(c => c.url.endsWith('/v0/account')).body;
    assert.equal(request.desc, false); assert.equal(request.to_tx_block_height, 110);
    assert.equal(request.is_receiver, true); assert.equal(request.is_success, undefined);
    assert.equal(result.state.complete, true);
    for (const input of [{ finality: 'EXECUTED' }, { otherReceiver: true }]) {
        await assert.rejects(() => devSource(fixtures(input).fetchImpl).page('market.testnet', null));
    }
    assert.equal((await devSource(fixtures({ status: { Failure: {} } }).fetchImpl).page('market.testnet', null)).events.length, 0);
    await assert.rejects(() => source.page('market.near', null), /dev_testnet_contract_required/);
});

test('429 and empty ranges leave checkpoint safe without a block-per-height scan', async t => {
    const db = await database(); t.after(() => db.sqlite.close());
    await applyDevPage(db, 'market.testnet', page([authorized], false));
    const limited = devSource(async () => new Response('', { status: 429, headers: { 'Retry-After': '30' } }));
    await assert.rejects(() => runDevPage(db, 'market.testnet', limited), error => error.message === 'fastnear_rate_limited' && error.retryAfterSeconds === 30);
    assert.equal(JSON.parse((await db.prepare('SELECT state_json FROM dev_fastnear_state').first()).state_json).cursor, 'saved-token');
    const requests = [];
    const empty = devSource(async (url, init) => {
        requests.push(url);
        return Response.json(JSON.parse(init.body).method === 'block'
            ? { result: { header: { height: 10000, hash: 'H'.repeat(44) } } } : { account_txs: [] });
    });
    const value = await empty.page('market.testnet', null);
    assert.equal(value.events.length, 0); assert.equal(requests.length, 2);
    assert(!requests.some(url => url.includes('neardata')));
});

test('source rejects changed bounds, duplicate positions and cyclic cursors; a completed sweep rescans old heights', async () => {
    for (const mutate of [
        page => { page.account_txs[0].tx_block_height = 111; },
        page => { page.account_txs.push(page.account_txs[0]); },
        page => { page.resume_token = 'saved-token'; },
    ]) {
        const mock = fixtures();
        const source = devSource(async (url, init) => {
            const response = await mock.fetchImpl(url, init);
            if (!url.endsWith('/v0/account')) return response;
            const value = await response.json(); mutate(value); return Response.json(value);
        });
        await assert.rejects(() => source.page('market.testnet', { upper: 110, cursor: 'saved-token', count: 0, complete: false }));
    }
    const mock = fixtures();
    await devSource(mock.fetchImpl).page('market.testnet', { upper: 100, cursor: 'old-token', count: 5, complete: true });
    const request = mock.calls.find(c => c.url.endsWith('/v0/account')).body;
    assert.equal(request.resume_token, undefined); assert.equal(request.from_tx_block_height, undefined);
});

test('10,000 empty blocks: existing scanner fetches each block, account discovery uses two reads', async t => {
    const db = await database(); t.after(() => db.sqlite.close());
    for (const name of ['0002_contiguous_watermark.sql', '0003_upload_job_archives.sql', '0004_operator_outbox_archives.sql', '0005_predecessor_watermark.sql']) {
        db.sqlite.exec(await readFile(new URL('../read-model/d1/' + name, import.meta.url), 'utf8'));
    }
    db.sqlite.prepare('INSERT INTO finality_watermarks(network,contract_id,block_height,block_hash,updated_at_ms) VALUES (?,?,?,?,?)')
        .run('testnet', 'market.testnet', 1, 'H'.repeat(44), 1);
    let fetched = 0, simulatedMs = 0, runs = 0;
    const env = { VIDEO_ENVIRONMENT: 'public-testnet', MARKET_CONTRACT_ID: 'market.testnet', MARKET_READ_MODEL: db,
        READ_MODEL_INGESTION_ENABLED: 'true', READ_MODEL_NETWORK: 'testnet', READ_MODEL_CONTRACT_ID: 'market.testnet',
        READ_MODEL_START_BLOCK_HEIGHT: '1', READ_MODEL_MAX_BLOCKS_PER_RUN: '180', READ_MODEL_NEAR_RPC_URL: 'https://rpc.testnet.invalid' };
    while (fetched < 10000) {
        assert(++runs < 100);
        await ingestMarketReadModelBatch(env, { now: () => simulatedMs, sleepFn: async ms => { simulatedMs += ms; },
            fetchFinalHeight: async () => 10001, fetchBlock: async ({ blockHeight }) => {
                fetched++;
                return { network: 'testnet', contract_id: 'market.testnet', finality: 'final', block_height: blockHeight,
                    block_hash: 'H'.repeat(44), prev_block_height: blockHeight - 1, prev_block_hash: 'H'.repeat(44), events: [] };
            } });
    }
    const source = devSource(async (_url, init) => Response.json(JSON.parse(init.body).method === 'block'
        ? { result: { header: { height: 10001, hash: 'H'.repeat(44) } } } : { account_txs: [] }));
    const next = await source.page('market.testnet', null);
    assert.equal(fetched, 10000); assert.equal(source.metrics.requests, 2); assert.equal(next.events.length, 0);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM publications').first()).n, 0);
});

test('FINAL cache skips details/RPC/block revalidation and unchanged projections are never rewritten', async t => {
    const db = await database(); t.after(() => db.sqlite.close());
    await runDevPage(db, 'market.testnet', devSource(fixtures().fetchImpl));
    const saved = JSON.parse((await db.prepare('SELECT state_json FROM dev_fastnear_state').first()).state_json);
    assert.deepEqual(saved.verified_transactions, ['T'.repeat(44)]);
    assert.equal(saved.event_count, 1); assert.equal(saved.projection_dirty, false);
    for (const table of ['dev_fastnear_events', 'dev_reference_events', 'media_jobs', 'publications', 'viewer_entitlements', 'sale_ledger', 'withdrawal_history', 'governance_audit', 'finality_watermarks']) {
        for (const operation of ['INSERT', 'UPDATE', 'DELETE']) db.sqlite.exec(
            `CREATE TRIGGER no_${table}_${operation} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'unexpected_data_write'); END`);
    }
    const mock = fixtures();
    const result = await runDevPage(db, 'market.testnet', devSource(mock.fetchImpl));
    assert.equal(result.events, 1); assert.equal(result.projection, undefined);
    assert.equal(mock.calls.length, 2);
    assert(mock.calls.every(call => call.body.method === 'block' || call.url.endsWith('/v0/account')));
    // Explicit event replay still validates identity, without rewriting unchanged tables.
    const stored = JSON.parse((await db.prepare('SELECT record_json FROM dev_fastnear_events').first()).record_json);
    await applyDevPage(db, 'market.testnet', { ...page([stored]), state: saved });
});

test('failed atomic checkpoint never caches a transaction whose events were rolled back', async t => {
    const db = await database(); t.after(() => db.sqlite.close());
    db.sqlite.exec("CREATE TRIGGER fail_cache BEFORE INSERT ON dev_fastnear_state BEGIN SELECT RAISE(ABORT,'cache_failure'); END");
    await assert.rejects(() => runDevPage(db, 'market.testnet', devSource(fixtures().fetchImpl)), /cache_failure/);
    assert.equal(await db.prepare('SELECT state_json FROM dev_fastnear_state').first(), null);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM dev_fastnear_events').first()).n, 0);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM media_jobs').first()).n, 0);
    db.sqlite.exec('DROP TRIGGER fail_cache');
    const mock = fixtures();
    await runDevPage(db, 'market.testnet', devSource(mock.fetchImpl));
    assert(mock.calls.some(call => call.body?.method === 'tx'));
    assert.equal((await db.prepare('SELECT count(*) AS n FROM media_jobs').first()).n, 1);
});

test('an empty last page publishes pending events and old checkpoint formats can rebuild the cache', async t => {
    const db = await database(); t.after(() => db.sqlite.close());
    await applyDevPage(db, 'market.testnet', page([authorized], false));
    const result = await applyDevPage(db, 'market.testnet', page([]));
    assert.equal(result.projection.media_jobs.length, 1);
    // Old dev state has no verified cache, event_count or pending flag: retain data and reverify once.
    await db.prepare('UPDATE dev_fastnear_state SET state_json=?').bind(JSON.stringify(state(true))).run();
    const mock = fixtures();
    await runDevPage(db, 'market.testnet', devSource(mock.fetchImpl));
    const saved = JSON.parse((await db.prepare('SELECT state_json FROM dev_fastnear_state').first()).state_json);
    assert.equal(saved.event_count, 1); assert.equal(saved.verified_transactions.length, 1);
    await assert.rejects(() => devSource(mock.fetchImpl).page('market.testnet', { verified_transactions: ['invalid'] }), /invalid_verified_transactions/);
});

test('one publication change leaves job, entitlement, sale and governance tables untouched', async t => {
    const db = await database(); t.after(() => db.sqlite.close());
    await applyDevPage(db, 'market.testnet', page([authorized, published]));
    for (const table of ['media_jobs', 'viewer_entitlements', 'sale_ledger', 'withdrawal_history', 'governance_audit']) {
        for (const operation of ['INSERT', 'DELETE', 'UPDATE']) db.sqlite.exec(
            `CREATE TRIGGER immutable_${table}_${operation} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'unrelated_table_write'); END`);
    }
    const takedown = event('publication_takedown', 104, 'C', { publication_id: 'job-1', availability: 'TAKEDOWN' });
    await applyDevPage(db, 'market.testnet', page([takedown]));
    assert.equal((await db.prepare('SELECT availability FROM publications').first()).availability, 'TAKEDOWN');
});
