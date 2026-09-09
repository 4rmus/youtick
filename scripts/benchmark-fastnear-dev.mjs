#!/usr/bin/env node
// No provider traffic: real local D1/API, synthetic history and explicitly modelled network time.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { applyDevPage, devSource, initializeDevDatabase, runDevPage } from './fastnear-dev.mjs';

const CONTRACT = 'benchmark.testnet';
const hash = (prefix, i) => (prefix + String(i).replaceAll('0', 'a')).padEnd(44, 'Z');
const percentile = (xs, q) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * q) - 1];
const round = x => Math.round(x * 100) / 100;

function history(size) {
    const txs = [], blocks = new Map();
    const model = { clock: 0, last: new Map(), calls: 0, fault: null };
    function receipt(i, override) {
        const group = Math.floor(i / 4), job = `video-${group}`, creator = `creator${group % 5}.testnet`;
        const definitions = [
            ['media_job_authorized', { account_id: creator, job_id: job, generation: 1, expected_source_bytes: '1000000', asset: 'USDC', amount: '500000' }],
            ['publication_finalized', { account_id: creator, publication_id: job, generation: 1, title: `Video ${group}`, playback_id: `playback_${group}`, amount: '2000000', availability: 'ACTIVE', published_at_ms: 1788900000000 + i }],
            ['entitlement_purchased', { account_id: `buyer${group}.testnet`, creator_id: creator, publication_id: job, asset: 'USDC', amount: '2000000', creator_amount: '1960000', platform_amount: '40000' }],
            ['media_job_upload_key_replaced', { job_id: job, generation: 1, upload_public_key_sha256: 'a'.repeat(64) }],
        ];
        const [eventName, data] = override ?? definitions[i % 4];
        const height = 10000 + i;
        const event = { standard: 'youtick_market', version: '1.0.0', event: eventName, data: [{
            contract_id: CONTRACT, predecessor_account_id: creator, block_height: String(height),
            block_timestamp_ms: String(1788900000000 + i), idempotency_key: `event:${i}`, ...data,
        }] };
        const item = { receipt: { receiver_id: CONTRACT, predecessor_id: creator, receipt_id: hash('R', i) },
            execution_outcome: { id: hash('R', i), block_height: height, block_hash: hash('H', i),
                outcome: { executor_id: CONTRACT, logs: ['EVENT_JSON:' + JSON.stringify(event)], status: { SuccessValue: '' } } } };
        blocks.set(height, { block: { header: { height, hash: hash('H', i), timestamp_nanosec: String(BigInt(1788900000000 + i) * 1000000n) } },
            shards: [{ receipt_execution_outcomes: [item] }] });
        return item;
    }
    for (let i = 0; i < size; i++) txs.push({ transaction: { hash: hash('T', i), signer_id: 'creator.testnet', receiver_id: 'usdc.testnet' }, tx_block_height: 9999 + i, receipts: [receipt(i)] });
    const lateReceipt = () => receipt(10000, ['publication_sales_suspended', { publication_id: 'video-0', availability: 'SALES_SUSPENDED' }]);
    // A finalized transaction cannot acquire another receipt. Model a previously unindexed transaction instead.
    model.addLate = () => txs.unshift({ transaction: { hash: hash('T', 10000), signer_id: 'creator.testnet', receiver_id: CONTRACT },
        tx_block_height: 9998, receipts: [lateReceipt()] });
    model.extraEvent = () => {
        const item = lateReceipt();
        return { network: 'testnet', finality: 'final', block_height: item.execution_outcome.block_height,
            block_hash: item.execution_outcome.block_hash, receipt_id: item.receipt.receipt_id, event_index: 0, execution_index: 0,
            event: JSON.parse(item.execution_outcome.outcome.logs[0].slice('EVENT_JSON:'.length)) };
    };
    model.fetch = async (url, init) => {
        const target = new URL(url), body = init.body ? JSON.parse(init.body) : null;
        assert(['tx.test.fastnear.com', 'rpc.testnet.fastnear.com', 'archival-rpc.testnet.fastnear.com', 'testnet.neardata.xyz'].includes(target.host));
        // Model the existing CLI's 2.1s host pacing plus an assumed 200ms transport, without sleeping.
        model.clock = Math.max(model.clock, (model.last.get(target.host) ?? -2100) + 2100);
        model.last.set(target.host, model.clock); model.clock += 200; model.calls++;
        if (model.fault) {
            const fault = model.fault; model.fault = null;
            if (fault === 'timeout') throw new DOMException('Simulated timeout', 'TimeoutError');
            return new Response('', { status: 429, headers: { 'Retry-After': '30' } });
        }
        if (body?.method === 'block') return Response.json({ result: { header: { height: 30000, hash: hash('H', 30000) } } });
        if (target.pathname === '/v0/account') {
            assert.equal(body.desc, false); assert.equal(body.is_receiver, true); assert.equal(body.to_tx_block_height, 30000);
            const remaining = txs.filter(tx => !body.resume_token || tx.tx_block_height > Number(body.resume_token.slice(5)));
            const rows = remaining.slice(0, body.limit).map(tx => ({ account_id: CONTRACT, transaction_hash: tx.transaction.hash,
                tx_block_height: tx.tx_block_height, tx_index: 0, is_receiver: true }));
            return Response.json({ account_txs: rows, ...(rows.length < remaining.length ? { resume_token: `page-${rows.at(-1).tx_block_height}` } : {}) });
        }
        if (target.pathname === '/v0/transactions') return Response.json({ transactions: body.tx_hashes.map(h => txs.find(tx => tx.transaction.hash === h)).reverse() });
        if (body?.method === 'tx') {
            const tx = txs.find(tx => tx.transaction.hash === body.params.tx_hash);
            return Response.json({ result: { transaction: tx.transaction, final_execution_status: 'FINAL', receipts_outcome: tx.receipts.map(r => r.execution_outcome) } });
        }
        if (target.pathname.startsWith('/v0/block/')) return Response.json(blocks.get(Number(target.pathname.split('/').at(-1))));
        throw new Error('unexpected_synthetic_request');
    };
    return model;
}

function meter(raw) {
    const stats = { statements: 0, batches: 0, rows_read: 0, rows_written: 0, missing_row_metrics: 0 };
    function record(result) {
        stats.statements++;
        if (typeof result.meta?.rows_read !== 'number' || typeof result.meta?.rows_written !== 'number') stats.missing_row_metrics++;
        else { stats.rows_read += result.meta.rows_read; stats.rows_written += result.meta.rows_written; }
        return result;
    }
    return { stats, prepare(sql) {
        const bound = values => {
            const statement = raw.prepare(sql).bind(...values);
            return { statement, bind: (...next) => bound(next),
                all: async () => record(await statement.all()),
                first: async () => (record(await statement.all()).results[0] ?? null),
                run: async () => record(await statement.run()) };
        };
        return bound([]);
    }, async batch(statements) {
        stats.batches++;
        return (await raw.batch(statements.map(s => s.statement))).map(record);
    } };
}
const difference = (after, before) => Object.fromEntries(Object.keys(after).map(key => [key, after[key] - before[key]]));
async function snapshot(db) {
    const rows = {};
    for (const table of ['media_jobs', 'publications', 'viewer_entitlements', 'sale_ledger', 'withdrawal_history', 'governance_audit']) {
        rows[table] = (await db.prepare(`SELECT * FROM ${table}`).all()).results;
    }
    return rows;
}
async function step(db, model) {
    model.last.clear(); // One default CLI invocation per page, including its existing per-run request budget.
    const started = performance.now();
    const value = await runDevPage(db, CONTRACT, devSource(model.fetch));
    model.clock += performance.now() - started;
    return value;
}
async function sweep(db, model) {
    const before = { ...db.stats }, started = performance.now(), clock = model.clock, calls = model.calls;
    let pageCount = 0, value;
    do { assert(++pageCount <= 51); value = await step(db, model); } while (!value.complete);
    return { pages: pageCount, events: value.events, local_wall_ms: round(performance.now() - started),
        source_requests: model.calls - calls, modelled_transport_and_pacing_ms: round(model.clock - clock),
        d1: difference(db.stats, before) };
}

const require = createRequire(new URL('../workers/livepeer-bridge/package.json', import.meta.url));
const { Miniflare, Log, LogLevel } = require('miniflare');
const root = fileURLToPath(new URL('../', import.meta.url));
const report = { schema: 'youtick.fastnear-dev-load.v1', classification: 'LOCAL_TEST_SYNTHETIC_SOURCE_REAL_LOCAL_D1',
    started_at: new Date().toISOString(), external_provider_requests: 0,
    assumptions: { source_response_ms: 200, per_host_spacing_ms: 2100, source_invocation_pages: 1,
        discovery_poll_interval_ms: 60000, http_cache_budget_ms: 15000, network_time_is_simulated: true }, cases: [] };
try {
    for (const size of [100, 500, 1000]) {
        const mf = new Miniflare({ modules: true, scriptPath: root + 'read-model/api.mjs', compatibilityDate: '2026-05-14',
            host: '127.0.0.1', port: 0, log: new Log(LogLevel.ERROR), d1Databases: { MARKET_READ_MODEL: `DEV_BENCHMARK_${size}` }, d1Persist: false,
            bindings: { READ_MODEL_ENABLED: 'true', READ_MODEL_NETWORK: 'testnet', READ_MODEL_CONTRACT_ID: CONTRACT, READ_MODEL_WEB_ORIGIN: 'https://dev.youtick.test' } });
        const entry = { size };
        report.cases.push(entry);
        try {
            const raw = await mf.getD1Database('MARKET_READ_MODEL');
            const db = meter(raw);
            await initializeDevDatabase(db);
            const model = history(size);
            entry.initial = await sweep(db, model);
            const before = await snapshot(raw);
            assert.equal(before.publications.length, size / 4); assert.equal(before.sale_ledger.length, size / 4);
            entry.unchanged_replay = await sweep(db, model);
            assert.deepEqual(await snapshot(raw), before, 'unchanged_replay_data_difference');
            entry.api = [];
            for (const concurrency of [1, 10, 50]) {
                const durations = [], started = performance.now();
                for (let offset = 0; offset < 100; offset += concurrency) {
                    await Promise.all(Array.from({ length: concurrency }, async () => {
                        const start = performance.now();
                        const response = await mf.dispatchFetch('http://localhost/v1/publications?limit=24');
                        const body = await response.json();
                        assert.equal(response.status, 200); assert.equal(body.items.length, 24);
                        durations.push(performance.now() - start);
                    }));
                }
                entry.api.push({ concurrency, requests: durations.length, failures: 0,
                    p50_ms: round(percentile(durations, .5)), p95_ms: round(percentile(durations, .95)), p99_ms: round(percentile(durations, .99)),
                    wall_ms: round(performance.now() - started) });
            }
            const sweepMs = entry.unchanged_replay.modelled_transport_and_pacing_ms;
            entry.freshness_model = [0, 10000, 60000, 180000].map(indexDelay => {
                const samples = Array.from({ length: 100 }, (_, phase) => indexDelay + phase * 600 + sweepMs + 15000);
                return { scope: 'UNCHANGED_SCAN_BUDGET_NOT_NEW_EVENT_VISIBILITY', assumed_index_delay_ms: indexDelay, samples: samples.length, modelled_p95_ms: round(percentile(samples, .95)),
                    meets_90000_ms: percentile(samples, .95) <= 90000 };
            });
            entry.outage_recovery_model = { assumed_outage_ms: 3600000, backlog_transactions: size,
                modelled_catchup_ms: entry.initial.modelled_transport_and_pacing_ms,
                meets_600000_ms: entry.initial.modelled_transport_and_pacing_ms <= 600000 };
            if (size === 100) {
                // Previously undiscovered transaction is indexed behind an already advanced cursor.
                await step(db, model);
                const progress = await raw.prepare('SELECT state_json FROM dev_fastnear_state').first();
                for (const fault of ['429', 'timeout']) {
                    model.fault = fault;
                    await assert.rejects(() => step(db, model));
                    assert.deepEqual(await raw.prepare('SELECT state_json FROM dev_fastnear_state').first(), progress);
                    assert.deepEqual(await snapshot(raw), before);
                }
                model.addLate();
                const start = model.clock;
                entry.late_current_sweep = await sweep(db, model);
                assert.equal((await raw.prepare("SELECT availability FROM publications WHERE publication_id='video-0'").first()).availability, 'ACTIVE');
                entry.late_next_sweep = await sweep(db, model);
                assert.equal((await raw.prepare("SELECT availability FROM publications WHERE publication_id='video-0'").first()).availability, 'SALES_SUSPENDED');
                entry.late_receipt = { recovered: true, only_after_next_sweep: true, observed_in_model_ms: round(model.clock - start), failures_preserved_checkpoint: true };
            }
            if (size === 1000) {
                // Fail a real local-D1 transaction at the final checkpoint write; retain the old published snapshot.
                for (let i = 0; i < 49; i++) assert.equal((await step(db, model)).complete, false);
                const progress = await raw.prepare('SELECT state_json FROM dev_fastnear_state').first();
                assert.equal(JSON.parse(progress.state_json).count, 980);
                await raw.prepare("CREATE TRIGGER bench_fail BEFORE INSERT ON dev_fastnear_state BEGIN SELECT RAISE(ABORT,'injected_batch_failure'); END").run();
                await assert.rejects(() => step(db, model), /injected_batch_failure/);
                assert.deepEqual(await raw.prepare('SELECT state_json FROM dev_fastnear_state').first(), progress);
                assert.deepEqual(await snapshot(raw), before);
                await raw.prepare('DROP TRIGGER bench_fail').run();
                entry.failure_recovery = await sweep(db, model);
                assert.equal(entry.failure_recovery.pages, 1);
                assert.deepEqual(await snapshot(raw), before);
                const completeProgress = await raw.prepare('SELECT state_json FROM dev_fastnear_state').first();
                const extra = model.extraEvent();
                await assert.rejects(() => applyDevPage(db, CONTRACT,
                    { events: [extra], reference: [extra], state: JSON.parse(completeProgress.state_json) }), /dev_event_limit/);
                assert.deepEqual(await raw.prepare('SELECT state_json FROM dev_fastnear_state').first(), completeProgress);
                assert.deepEqual(await snapshot(raw), before);
                entry.event_limit_1001 = 'REJECTED_WITHOUT_CHANGING_PUBLISHED_DATA';
            }
            entry.status = 'PASS';
        } catch (error) { entry.status = 'FAILED'; entry.error = error.message; process.exitCode = 1; }
        finally { await mf.dispose(); }
        console.log(JSON.stringify({ size, status: entry.status, initial: entry.initial, replay: entry.unchanged_replay, error: entry.error }));
    }
} finally {
    report.finished_at = new Date().toISOString();
    report.status = report.cases.every(c => c.status === 'PASS') ? 'COMPLETED_WITH_WARNINGS' : 'FAILED';
    const dir = root + '.wrangler/fastnear-dev-load/evidence/';
    await mkdir(dir, { recursive: true });
    const path = dir + Date.now() + '.json';
    await writeFile(path, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ report: path, status: report.status }));
}
