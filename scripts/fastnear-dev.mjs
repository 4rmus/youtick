// Dev only: imported by the local runner/tests, never by a deployed Worker.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseNeardataMarketBlock } from './fetch-neardata-market-block.mjs';
import { canonicalMarketEventJson, normalizeFinalMarketEvents, rebuildMarketReadModel } from './rebuild-market-read-model.mjs';

const ROOT = 'https://tx.test.fastnear.com';
const HASH = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const TABLES = ['media_jobs', 'publications', 'viewer_entitlements', 'sale_ledger', 'withdrawal_history', 'governance_audit'];
const LIMIT = 20;
const MAX_RECORDS = 1000;

export async function initializeDevDatabase(db) {
    const initialized = await db.prepare("SELECT name FROM sqlite_master WHERE name='dev_fastnear_state'").first();
    if (initialized) return;
    assert(!(await db.prepare("SELECT name FROM sqlite_master WHERE name='publications'").first()), 'dev_database_must_be_fresh');
    const schema = await readFile(new URL('../read-model/d1/0001_initial.sql', import.meta.url), 'utf8');
    await db.batch(schema.split(';').map(s => s.trim()).filter(Boolean).map(sql => db.prepare(sql)));
    await db.batch([
        db.prepare('CREATE TABLE dev_fastnear_state (contract_id TEXT PRIMARY KEY, state_json TEXT NOT NULL)'),
        ...['dev_fastnear_events', 'dev_reference_events'].map(table => db.prepare(
            `CREATE TABLE ${table} (contract_id TEXT NOT NULL, event_key TEXT NOT NULL, record_json TEXT NOT NULL, PRIMARY KEY(contract_id,event_key))`)),
    ]);
}

function validateContract(contractId) {
    assert(typeof contractId === 'string' && /^[a-z0-9][a-z0-9._-]{0,55}\.testnet$/.test(contractId), 'dev_testnet_contract_required');
}

export async function restartDevScan(db, contractId) {
    validateContract(contractId);
    // A lost/expired token restarts discovery, preserving all verified records.
    await db.prepare('DELETE FROM dev_fastnear_state WHERE contract_id=?').bind(contractId).run();
}

export function devSource(fetchImpl = fetch) {
    const metrics = { requests: 0, bytes: 0, durations_ms: [], methods: {} };
    const lastRequest = new Map();
    async function json(url, body) {
        assert(metrics.requests < 250, 'dev_request_budget');
        const host = new URL(url).host;
        // ponytail: local per-host pacing, not an account-wide quota guarantee.
        if (fetchImpl === fetch) await sleep(Math.max(0, 2100 - (Date.now() - (lastRequest.get(host) ?? 0))));
        lastRequest.set(host, Date.now());
        metrics.requests++;
        const route = new URL(url).pathname;
        const method = body?.method ?? route;
        metrics.methods[method] = (metrics.methods[method] ?? 0) + 1;
        const started = performance.now();
        const response = await fetchImpl(url, { method: body ? 'POST' : 'GET',
            headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) });
        if (!response.ok) {
            const error = new Error(response.status === 429 ? 'fastnear_rate_limited' : 'fastnear_read_failed');
            const retry = response.headers.get('Retry-After');
            const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : Math.ceil((Date.parse(retry) - Date.now()) / 1000);
            error.retryAfterSeconds = Number.isSafeInteger(seconds) ? Math.max(0, seconds) : null;
            error.source = `${host}:${method}`;
            throw error;
        }
        assert(Number(response.headers.get('Content-Length') || 0) <= 16 * 1024 * 1024, 'dev_response_too_large');
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 16 * 1024 * 1024) { await reader.cancel(); throw new Error('dev_response_too_large'); }
            chunks.push(value);
        }
        const text = Buffer.concat(chunks).toString('utf8');
        metrics.bytes += size;
        metrics.durations_ms.push(Math.round(performance.now() - started));
        const value = JSON.parse(text);
        assert(!value.error, 'fastnear_rpc_error');
        return value;
    }
    const rpc = (method, params) => json(`https://${method === 'tx' ? 'archival-rpc' : 'rpc'}.testnet.fastnear.com`,
        { jsonrpc: '2.0', id: 'fastnear-dev-readonly', method, params }).then(v => v.result);
    return { metrics, async page(contractId, state) {
        validateContract(contractId);
        const cached = state?.verified_transactions ?? [];
        assert(Array.isArray(cached) && cached.length <= MAX_RECORDS && cached.every(h => typeof h === 'string' && HASH.test(h)), 'invalid_verified_transactions');
        const verified = new Set(cached);
        if (!state || state.complete) {
            const header = (await rpc('block', { finality: 'final' })).header;
            assert(Number.isSafeInteger(header?.height) && header.height > 0 && HASH.test(header.hash), 'invalid_final_block');
            state = { ...state, upper: header.height, cursor: null, count: 0, complete: false, last: undefined };
        }
        const page = await json(ROOT + '/v0/account', { account_id: contractId, is_receiver: true, desc: false,
            to_tx_block_height: state.upper, limit: LIMIT, ...(state.cursor ? { resume_token: state.cursor } : {}) });
        assert(Array.isArray(page.account_txs) && page.account_txs.length <= LIMIT, 'invalid_account_page');
        assert(page.resume_token == null || (typeof page.resume_token === 'string'
            && page.resume_token.length > 0 && page.resume_token.length <= 4096 && page.resume_token !== state.cursor), 'invalid_resume_token');
        const rows = page.account_txs;
        const hashes = rows.map((row, i) => {
            assert(row.account_id === contractId && row.is_receiver === true && HASH.test(row.transaction_hash)
                && Number.isSafeInteger(row.tx_block_height) && row.tx_block_height > 0 && row.tx_block_height <= state.upper
                && Number.isSafeInteger(row.tx_index) && row.tx_index >= 0, 'invalid_account_row');
            const previous = i ? rows[i - 1] : state.last;
            assert(!previous || row.tx_block_height > previous.tx_block_height
                || (row.tx_block_height === previous.tx_block_height && row.tx_index > previous.tx_index), 'invalid_account_order');
            return row.transaction_hash;
        });
        assert(new Set(hashes).size === hashes.length && state.count + rows.length <= MAX_RECORDS, 'dev_history_limit');
        const unseen = hashes.filter(hash => !verified.has(hash));
        const transactions = unseen.length ? (await json(ROOT + '/v0/transactions', { tx_hashes: unseen })).transactions : [];
        assert(Array.isArray(transactions) && transactions.length === unseen.length
            && new Set(transactions.map(tx => tx.transaction?.hash)).size === unseen.length
            && transactions.every(tx => unseen.includes(tx.transaction?.hash)), 'missing_or_extra_transaction');
        const events = [], reference = [], blocks = new Map();
        for (const tx of transactions) {
            assert(Array.isArray(tx.receipts), 'invalid_transaction_receipts');
            const canonical = await rpc('tx', { tx_hash: tx.transaction.hash, sender_account_id: tx.transaction.signer_id, wait_until: 'FINAL' });
            assert(canonical?.final_execution_status === 'FINAL' && canonical.transaction?.hash === tx.transaction.hash
                && Array.isArray(canonical.receipts_outcome), 'transaction_not_final');
            const candidates = tx.receipts.filter(item => item.receipt?.receiver_id === contractId);
            const canonicalIds = canonical.receipts_outcome.filter(r => r.outcome?.executor_id === contractId).map(r => r.id).sort();
            assert.deepEqual(candidates.map(r => r.receipt.receipt_id).sort(), canonicalIds, 'missing_market_receipt');
            for (const item of candidates) {
                const execution = item.execution_outcome;
                const proof = canonical.receipts_outcome.find(r => r.id === item.receipt.receipt_id);
                assert(execution?.id === item.receipt.receipt_id && execution.outcome?.executor_id === contractId
                    && proof.block_hash === execution.block_hash, 'invalid_market_receipt');
                assert.deepEqual(execution.outcome.logs, proof.outcome.logs, 'receipt_log_mismatch');
                assert.deepEqual(execution.outcome.status, proof.outcome.status, 'receipt_status_mismatch');
                if (!proof.outcome.logs.some(log => log.startsWith('EVENT_JSON:'))) continue;
                const height = execution.block_height;
                assert(Number.isSafeInteger(height) && height > 0, 'invalid_execution_height');
                if (!blocks.has(height)) blocks.set(height, await json(`https://testnet.neardata.xyz/v0/block/${height}`));
                const raw = blocks.get(height);
                const expected = { network: 'testnet', contractId, blockHeight: height };
                const positions = raw.shards.flatMap(s => s.receipt_execution_outcomes).map(r => r.execution_outcome.id);
                const ordered = record => {
                    const execution_index = positions.indexOf(record.receipt_id);
                    assert(execution_index >= 0, 'missing_execution_position');
                    return { ...record, execution_index };
                };
                const actual = parseNeardataMarketBlock({ block: raw.block, shards: [{ receipt_execution_outcomes: [item] }] }, expected).events.map(ordered);
                const original = parseNeardataMarketBlock(raw, expected).events.map(ordered);
                for (const record of actual) assert.deepEqual(record, original.find(r => eventKey(r) === eventKey(record)), 'archive_event_mismatch');
                events.push(...actual);
                reference.push(...original);
            }
            // FINAL includes all receipts; persist this cache only with the verified events and page checkpoint.
            verified.add(tx.transaction.hash);
        }
        assert(verified.size <= MAX_RECORDS, 'dev_history_limit');
        return { events, reference, state: { ...state, verified_transactions: [...verified], cursor: page.resume_token ?? null,
            count: state.count + rows.length, last: rows.at(-1) ?? state.last, complete: !page.resume_token } };
    } };
}

const eventKey = record => `${record.block_height}:${record.receipt_id}:${record.event_index}`;
async function records(db, table, contractId) {
    return (await db.prepare(`SELECT record_json FROM ${table} WHERE contract_id=?`).bind(contractId).all()).results.map(r => JSON.parse(r.record_json));
}

export async function applyDevPage(db, contractId, page) {
    validateContract(contractId);
    const saved = await db.prepare('SELECT state_json FROM dev_fastnear_state WHERE contract_id=?').bind(contractId).first();
    const previous = saved ? JSON.parse(saved.state_json) : null;
    let dirty = previous?.projection_dirty ?? false;
    let eventCount = previous?.event_count;
    const projectionHashes = { ...previous?.projection_hashes };
    const statements = [], merged = [];
    const needsRecords = page.events.length > 0 || page.reference.length > 0
        || eventCount === undefined || (page.state.complete && dirty);
    for (const [table, incoming] of needsRecords ? [['dev_fastnear_events', page.events], ['dev_reference_events', page.reference]] : []) {
        const map = new Map((await records(db, table, contractId)).map(r => [eventKey(r), r]));
        for (const record of normalizeFinalMarketEvents(incoming)) {
            assert(record.network === 'testnet' && record.event.data[0].contract_id === contractId, 'dev_scope_mismatch');
            const key = eventKey(record);
            if (map.has(key)) {
                assert.equal(canonicalMarketEventJson(map.get(key)), canonicalMarketEventJson(record), 'conflicting_event');
                continue;
            }
            dirty = true;
            map.set(key, record);
            statements.push(db.prepare(`INSERT OR IGNORE INTO ${table} VALUES (?,?,?)`).bind(contractId, key, JSON.stringify(record)));
        }
        assert(map.size <= MAX_RECORDS, 'dev_event_limit');
        merged.push([...map.values()]);
    }
    if (needsRecords) eventCount = merged[0].length;
    let projection;
    if (page.state.complete && dirty) {
        // ponytail: rebuild <=1000 events in memory, replacing only changed tables; per-entity writes if those dominate.
        projection = rebuildMarketReadModel(merged[0]);
        assert.deepEqual(projection, rebuildMarketReadModel(merged[1]), 'reference_projection_mismatch');
        for (const table of TABLES) {
            const digest = createHash('sha256').update(canonicalMarketEventJson(projection[table])).digest('hex');
            if (projectionHashes[table] === digest) continue;
            projectionHashes[table] = digest;
            statements.push(db.prepare(`DELETE FROM ${table} WHERE network='testnet' AND contract_id=?`).bind(contractId));
            for (const original of projection[table]) {
                const row = { ...original };
                if (table === 'governance_audit') { row.payload_json = JSON.stringify(row.payload); delete row.payload; }
                const columns = Object.keys(row);
                statements.push(db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...Object.values(row)));
            }
        }
        // This private dev snapshot watermark is the last observed event, NOT a contiguous chain checkpoint.
        statements.push(db.prepare("DELETE FROM finality_watermarks WHERE network='testnet' AND contract_id=?").bind(contractId));
        for (const watermark of projection.watermarks) statements.push(db.prepare(
            'INSERT INTO finality_watermarks VALUES (?,?,?,?,?)').bind(watermark.network, contractId, watermark.block_height, watermark.block_hash, Date.now()));
    }
    statements.push(db.prepare('INSERT OR REPLACE INTO dev_fastnear_state VALUES (?,?)').bind(contractId,
        JSON.stringify({ ...page.state, event_count: eventCount, projection_hashes: projectionHashes, projection_dirty: dirty && !page.state.complete })));
    await db.batch(statements);
    return { complete: page.state.complete, events: eventCount, ...(projection ? { projection } : {}) };
}

export async function runDevPage(db, contractId, source) {
    validateContract(contractId);
    const row = await db.prepare('SELECT state_json FROM dev_fastnear_state WHERE contract_id=?').bind(contractId).first();
    return applyDevPage(db, contractId, await source.page(contractId, row ? JSON.parse(row.state_json) : null));
}
