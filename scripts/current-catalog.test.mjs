import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fetchCurrentCatalog, applyCurrentCatalog, readCurrentCatalog } from '../read-model/current-catalog.mjs';
import { runScheduledIngestion } from '../read-model/worker.mjs';
import { marketReadApi } from '../read-model/api.mjs';

const now = 1790690400000;
const hash = 'B6oE1UWkynBdztjt3CDPHv5er7q9PVqtYNUWBcC57SPX';
const publication = (id = 'pub-a') => ({ publication_id: id, creator_id: 'creator.testnet', title: id,
    generation: 1, price_usdc: '2000000', playback_id: `playback_${id}`, availability: 'ACTIVE', published_at_ms: now - 60000 });
const input = { network: 'testnet', contractId: 'market.testnet', rpcUrl: 'https://rpc.invalid' };
function provider(items, height = 100, timestamp = now, change = x => x) {
    return async (_url, init) => {
        const q = JSON.parse(init.body);
        assert.ok(init.signal);
        const result = q.method === 'block'
            ? { header: { height, hash, timestamp_nanosec: String(BigInt(timestamp) * 1000000n) } }
            : { block_height: height, block_hash: hash, result: [...Buffer.from(JSON.stringify(
                q.params.method_name === 'get_publications_count' ? items.length : items))] };
        if (q.method === 'query') assert.equal(q.params.block_id, hash);
        return Response.json(change({ jsonrpc: '2.0', id: q.id, result }, q));
    };
}
async function database(t) {
    const sql = new DatabaseSync(':memory:');
    for (const file of ['0001_initial.sql', '0002_contiguous_watermark.sql', '0003_upload_job_archives.sql', '0004_operator_outbox_archives.sql', '0005_predecessor_watermark.sql', '0006_scan_cursor.sql', '0008_current_catalog.sql']) {
        sql.exec(await readFile(new URL(`../read-model/d1/${file}`, import.meta.url), 'utf8'));
    }
    t.after(() => sql.close());
    const db = { sql, queries: 0, failAt: -1,
        prepare(query) { return { bind: (...values) => ({ query, values, async first() { db.queries++; return sql.prepare(query).get(...values) ?? null; } }) }; },
        async batch(statements) {
            db.queries += statements.length;
            sql.exec('BEGIN');
            try {
                const results = statements.map(({ query, values }, index) => {
                    if (index === db.failAt) throw new Error('injected failure');
                    return { results: sql.prepare(query).all(...values), success: true };
                });
                sql.exec('COMMIT'); return results;
            } catch (error) { sql.exec('ROLLBACK'); throw error; }
        },
    };
    return db;
}
const snapshot = (items, height = 100, timestamp = now) => fetchCurrentCatalog(input, provider(items, height, timestamp), () => now);

test('same final block, bounded full snapshot, safe timestamps and consistent RPC identity', async () => {
    for (const n of [0, 18, 48]) {
        const result = await snapshot(Array.from({ length: n }, (_, i) => publication(`pub-${i}`)));
        assert.equal(result.publications.length, n);
        assert.equal(result.source_block_timestamp_ms, now);
    }
    await assert.rejects(snapshot(Array.from({ length: 49 }, (_, i) => publication(`pub-${i}`))));
    await assert.rejects(snapshot([publication(), publication()]));
    await assert.rejects(snapshot([publication()], 100, now + 5001));
    await assert.rejects(fetchCurrentCatalog(input, provider([publication()], 100, now, (r, q) => {
        if (q.method === 'query') r.result.block_height++;
        return r;
    }), () => now));
});

test('atomic current state leaves economics untouched and rejects missing, old and reopened publications', async t => {
    const db = await database(t);
    const first = await snapshot([publication()]);
    await applyCurrentCatalog(db, first, now);
    await assert.rejects(applyCurrentCatalog(db, { ...first, block_hash: 'C'.repeat(44) }, now));
    await assert.rejects(applyCurrentCatalog(db, { ...first, content_revision: 'f'.repeat(64) }, now));
    const suspended = { ...publication(), availability: 'TAKEDOWN' };
    await applyCurrentCatalog(db, await snapshot([suspended], 101), now);
    await assert.rejects(applyCurrentCatalog(db, first, now));
    await assert.rejects(applyCurrentCatalog(db, await snapshot([publication()], 102), now));
    await assert.rejects(applyCurrentCatalog(db, await snapshot([], 102), now));
    assert.equal((await readCurrentCatalog(db, input)).publications[0].availability, 'TAKEDOWN');
    for (const table of ['publications', 'finality_watermarks', 'chain_events', 'sale_ledger', 'viewer_entitlements']) {
        assert.equal(db.sql.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
    }
    db.failAt = 1;
    await assert.rejects(applyCurrentCatalog(db, await snapshot([suspended, publication('pub-b')], 102), now));
    db.failAt = -1;
    assert.equal((await readCurrentCatalog(db, input)).state.verified_block_height, 101);
});

test('no publication writes for unchanged content and at most 100 statements for the largest snapshot', async t => {
    const db = await database(t);
    const items = Array.from({ length: 48 }, (_, i) => publication(`pub-${i}`));
    await applyCurrentCatalog(db, await snapshot(items), now);
    assert.ok(db.queries <= 100);
    db.sql.exec("CREATE TRIGGER reject_rewrite BEFORE UPDATE ON current_publications BEGIN SELECT RAISE(ABORT, 'unexpected rewrite'); END");
    const old = (await readCurrentCatalog(db, input)).state;
    await applyCurrentCatalog(db, await snapshot(items, 101), now);
    const current = (await readCurrentCatalog(db, input)).state;
    assert.equal(current.content_revision, old.content_revision);
    assert.equal(current.verified_block_height, 101);
});

test('v2 is gated, paginates stable publication time, rejects changed/foreign cursors and expires old chain state', async t => {
    const db = await database(t);
    const env = { MARKET_READ_MODEL: db, READ_MODEL_ENABLED: 'true', READ_MODEL_NETWORK: 'testnet',
        READ_MODEL_CONTRACT_ID: 'market.testnet', MARKET_CONTRACT_ID: 'market.testnet', VIDEO_ENVIRONMENT: 'public-testnet',
        READ_MODEL_WEB_ORIGIN: 'https://app.test' };
    const clock = t.mock.method(Date, 'now', () => now);
    const get = path => marketReadApi(new Request(`https://read.test${path}`), env);
    assert.equal((await get('/v2/publications')).status, 503);
    env.READ_MODEL_CURRENT_CATALOG_ENABLED = 'true';
    assert.equal((await get('/v2/publications')).status, 503);
    await applyCurrentCatalog(db, await snapshot([publication('pub-a'), publication('pub-b')]), now);
    const page = await get('/v2/publications?limit=1');
    assert.equal(page.headers.get('Cache-Control'), 'no-store');
    const a = await page.json();
    assert.equal(a.items[0].publication_id, 'pub-b');
    assert.equal(a.source, 'current-state');
    const tail = await get(`/v2/publications?limit=1&cursor=${a.next_cursor}`);
    assert.equal((await tail.json()).items[0].publication_id, 'pub-a');
    assert.equal((await get(`/v2/creators/creator.testnet/publications?cursor=${a.next_cursor}`)).status, 400);
    await applyCurrentCatalog(db, await snapshot([publication('pub-a'), publication('pub-b'), publication('pub-c')], 101), now);
    assert.equal((await get(`/v2/publications?cursor=${a.next_cursor}`)).status, 409);
    clock.mock.mockImplementation(() => now + 90001);
    assert.equal((await (await get('/v2/publications')).json()).freshness, 'stale');
    clock.mock.mockImplementation(() => now + 180001);
    assert.equal((await get('/v2/publications')).status, 503);
});


test('concurrent refresh cannot partially overwrite a winning snapshot; ambiguous commit is read back without resending', async t => {
    const db = await database(t);
    await applyCurrentCatalog(db, await snapshot([publication()]), now);
    const write = db.batch.bind(db);
    let blocked, release;
    const paused = new Promise(resolve => { blocked = resolve; });
    const resume = new Promise(resolve => { release = resolve; });
    let intercept = true;
    db.batch = async statements => {
        if (intercept && statements[0].query.startsWith('INSERT INTO current_catalog_state')) {
            intercept = false; blocked(); await resume;
        }
        return write(statements);
    };
    const loser = applyCurrentCatalog(db, await snapshot([publication(), publication('loser')], 101), now);
    await paused;
    const winner = await snapshot([{ ...publication(), availability: 'TAKEDOWN' }, publication('winner')], 102);
    await applyCurrentCatalog(db, winner, now);
    release(); await assert.rejects(loser);
    assert.deepEqual((await readCurrentCatalog(db, input)).publications.map(row => row.publication_id), ['pub-a', 'winner']);
    let writes = 0;
    db.batch = async statements => {
        const result = await write(statements);
        if (statements[0].query.startsWith('INSERT INTO current_catalog_state')) { writes++; throw new Error('lost response'); }
        return result;
    };
    await applyCurrentCatalog(db, { ...winner, block_height: 103 }, now);
    assert.equal(writes, 1);
    assert.equal((await readCurrentCatalog(db, input)).state.verified_block_height, 103);
});

test('one scheduled invocation shares its query and time budgets; snapshot failure does not stop history', async t => {
    const db = await database(t);
    const env = { MARKET_READ_MODEL: db, VIDEO_ENVIRONMENT: 'public-testnet', MARKET_CONTRACT_ID: 'market.testnet',
        READ_MODEL_CONTRACT_ID: 'market.testnet', READ_MODEL_NETWORK: 'testnet', READ_MODEL_NEAR_RPC_URL: 'https://rpc.invalid',
        READ_MODEL_ENABLED: 'true', READ_MODEL_CURRENT_CATALOG_ENABLED: 'true', READ_MODEL_INGESTION_ENABLED: 'true',
        READ_MODEL_START_BLOCK_HEIGHT: '100', READ_MODEL_MAX_BLOCKS_PER_RUN: '180' };
    let clock = now;
    const heights = [];
    const deps = { now: () => clock, sleepFn: async ms => { clock += ms; }, logger: { log() {}, error() {} },
        fetchImpl: provider(Array.from({ length: 48 }, (_, i) => publication(`pub-${i}`))),
        fetchFinalHeight: async () => 300,
        fetchBlock: async ({ blockHeight }) => { heights.push(blockHeight); return { network: 'testnet', contract_id: 'market.testnet',
            finality: 'final', block_height: blockHeight, block_hash: `block_hash_${String(blockHeight).padStart(24, '0')}`,
            prev_block_height: blockHeight - 1, prev_block_hash: `block_hash_${String(blockHeight - 1).padStart(24, '0')}`, events: [] }; },
    };
    const originalFetch = deps.fetchImpl;
    deps.fetchImpl = async (...args) => { const value = await originalFetch(...args); clock += 4000; return value; };
    const first = await runScheduledIngestion(env, deps);
    assert.ok(db.queries <= 1000);
    assert.ok(first.block_count > 0 && first.block_count < 115); // The first 12 seconds belonged to the snapshot.
    assert.ok(clock - now <= 50000);
    clock = now; db.queries = 0;
    deps.fetchImpl = async () => { throw new Error('RPC unavailable'); };
    const second = await runScheduledIngestion(env, deps);
    assert.ok(second.block_count > 0);
    assert.ok(db.queries <= 1000);
    assert.equal((await readCurrentCatalog(db, input)).publications.length, 48);
    env.READ_MODEL_CURRENT_CATALOG_ENABLED = 'false';
    deps.fetchImpl = async () => { throw new Error('must not fetch snapshot'); };
    await runScheduledIngestion(env, deps);
});


test('dense history leaves the reserved catalogue budget intact', async t => {
    const db = await database(t);
    const env = { MARKET_READ_MODEL: db, VIDEO_ENVIRONMENT: 'public-testnet', MARKET_CONTRACT_ID: 'market.testnet',
        READ_MODEL_CONTRACT_ID: 'market.testnet', READ_MODEL_NETWORK: 'testnet', READ_MODEL_NEAR_RPC_URL: 'https://rpc.invalid',
        READ_MODEL_ENABLED: 'true', READ_MODEL_CURRENT_CATALOG_ENABLED: 'true', READ_MODEL_INGESTION_ENABLED: 'true',
        READ_MODEL_START_BLOCK_HEIGHT: '100', READ_MODEL_MAX_BLOCKS_PER_RUN: '180' };
    const blockHash = height => `block_hash_${String(height).padStart(24, '0')}`;
    let clock = now;
    const result = await runScheduledIngestion(env, { now: () => clock, sleepFn: async ms => { clock += ms; },
        logger: { log() {}, error() {} }, fetchImpl: provider(Array.from({ length: 48 }, (_, i) => publication(`pub-${i}`))),
        fetchFinalHeight: async () => 300,
        fetchBlock: async ({ blockHeight: height }) => ({ network: 'testnet', contract_id: 'market.testnet', finality: 'final',
            block_height: height, block_hash: blockHash(height), prev_block_height: height - 1, prev_block_hash: blockHash(height - 1),
            events: Array.from({ length: 16 }, (_, i) => ({ network: 'testnet', finality: 'final', block_height: height,
                block_hash: blockHash(height), receipt_id: `receipt_${String(height).padStart(27, '0')}`, event_index: i,
                event: { standard: 'youtick_market', version: '1.0.0', event: 'entitlement_purchased', data: [{
                    contract_id: 'market.testnet', predecessor_account_id: 'bridge.testnet', block_height: String(height),
                    block_timestamp_ms: String(now), idempotency_key: `purchase:${height}:${i}`, account_id: `buyer-${height}-${i}.testnet`,
                    creator_id: 'creator.testnet', publication_id: 'film', asset: 'USDC', amount: '2000000',
                    creator_amount: '1900000', platform_amount: '100000' }] } })) }),
    });
    assert.equal(result.block_count, 18);
    assert.ok(db.queries <= 1000, `${db.queries} statements`);
    assert.equal(db.sql.prepare('SELECT count(*) n FROM sale_ledger').get().n, 18 * 16);
});
