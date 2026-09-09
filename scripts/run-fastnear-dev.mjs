#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { devSource, initializeDevDatabase, restartDevScan, runDevPage } from './fastnear-dev.mjs';

async function main() {
    const args = process.argv.slice(2);
    assert(args.every(arg => /^--(?:contract=|pages=|restart$|inspect$)/.test(arg)), 'unknown_dev_argument');
    const contract = args.find(arg => arg.startsWith('--contract='))?.slice(11);
    assert(contract && /^[a-z0-9][a-z0-9._-]{0,55}\.testnet$/.test(contract), 'usage: --contract=account.testnet [--pages=1] [--restart] [--inspect]');
    const pages = Number(args.find(arg => arg.startsWith('--pages='))?.slice(8) ?? 1);
    assert(Number.isSafeInteger(pages) && pages >= 1 && pages <= 10, 'dev_pages_limit');
    const repo = fileURLToPath(new URL('../', import.meta.url));
    const local = resolve(repo, '.wrangler/fastnear-dev');
    const require = createRequire(new URL('../workers/livepeer-bridge/package.json', import.meta.url));
    const { Miniflare } = require('miniflare'); // Reuse Wrangler's installed local D1 runtime.
    const mf = new Miniflare({ modules: true, scriptPath: resolve(repo, 'read-model/api.mjs'),
        compatibilityDate: '2026-05-14', host: '127.0.0.1', port: 0,
        d1Databases: { MARKET_READ_MODEL: 'FASTNEAR_DEV_ONLY' }, d1Persist: resolve(local, 'd1'),
        bindings: { READ_MODEL_ENABLED: 'true', READ_MODEL_NETWORK: 'testnet',
            READ_MODEL_CONTRACT_ID: contract, READ_MODEL_WEB_ORIGIN: 'https://dev.youtick.test' } });
    const report = { scope: 'LOCAL_D1 + READ_ONLY_TESTNET', contract, started_at: new Date().toISOString(),
        completeness: 'UNPROVEN', pages: [] };
    const source = devSource();
    try {
        const db = await mf.getD1Database('MARKET_READ_MODEL');
        await initializeDevDatabase(db);
        if (args.includes('--restart')) await restartDevScan(db, contract);
        if (!args.includes('--inspect')) {
            for (let i = 0; i < pages; i++) {
                const started = performance.now();
                const result = await runDevPage(db, contract, source);
                report.pages.push({ complete: result.complete, events: result.events, ms: Math.round(performance.now() - started) });
                if (result.complete) break;
            }
        }
        report.tables = {};
        for (const table of ['dev_fastnear_events', 'dev_reference_events', 'media_jobs', 'publications', 'viewer_entitlements', 'sale_ledger', 'withdrawal_history', 'governance_audit']) {
            report.tables[table] = (await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE contract_id=?`).bind(contract).first()).n;
        }
        const started = performance.now();
        const response = await mf.dispatchFetch('http://localhost/v1/publications?limit=24');
        const value = await response.json();
        report.discover = { status: response.status, ms: Math.round(performance.now() - started), items: value.items?.length ?? 0 };
        report.status = report.pages.at(-1)?.complete ? 'COMPLETED_WITH_WARNINGS' : 'PARTIAL_OR_INSPECT_ONLY';
    } catch (error) {
        report.status = 'FAILED'; report.error = error.message;
        report.error_source = error.source ?? null;
        report.retry_after_seconds = error.retryAfterSeconds ?? null;
        process.exitCode = 1;
    } finally {
        report.source = source.metrics;
        report.finished_at = new Date().toISOString();
        await mkdir(resolve(local, 'evidence'), { recursive: true });
        const path = resolve(local, 'evidence', `${Date.now()}.json`);
        await writeFile(path, JSON.stringify(report, null, 2) + '\n');
        await mf.dispose();
        console.log(JSON.stringify({ report: path, ...report }, null, 2));
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
    console.error(error.message); process.exitCode = 1;
});
