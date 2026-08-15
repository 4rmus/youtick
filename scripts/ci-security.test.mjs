import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflows = [
    'ci.yml',
    'codeql.yml',
    'deploy-preview.yml',
    'promote-production.yml',
];

test('every third-party GitHub Action is pinned to a full commit SHA', async () => {
    for (const workflow of workflows) {
        const source = await readFile(new URL(`../.github/workflows/${workflow}`, import.meta.url), 'utf8');
        const uses = [...source.matchAll(/\buses:\s+([^\s#]+)@([^\s#]+)/g)];
        assert.ok(uses.length > 0, `${workflow} has no action references`);
        for (const [, action, ref] of uses) {
            assert.match(ref, /^[0-9a-f]{40}$/, `${action} in ${workflow} is not SHA-pinned`);
        }
    }
});

test('release provenance and runtime SBOM attestations stay mandatory', async () => {
    const source = await readFile(
        new URL('../.github/workflows/deploy-preview.yml', import.meta.url),
        'utf8',
    );
    const assemble = source.slice(source.indexOf('  assemble:'));

    assert.match(assemble, /attestations: write/);
    assert.match(assemble, /id-token: write/);
    assert.match(source, /npm sbom --omit=dev --sbom-format=spdx/);
    assert.match(assemble, /subject-checksums: \$\{\{ runner\.temp \}\}\/release\/SHA256SUMS/);
    assert.match(assemble, /sbom-path: \$\{\{ runner\.temp \}\}\/components\/preview\/web\.spdx\.json/);
    assert.match(assemble, /sbom-path: \$\{\{ runner\.temp \}\}\/components\/bridge\/bridge\.spdx\.json/);
});

test('normal-WASM contract SBOM artifacts stay mandatory', async () => {
    const source = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
    const audit = source.slice(
        source.indexOf('  rust-wasm-audit:'),
        source.indexOf('  detect-changes:'),
    );
    assert.match(audit, /cargo metadata/);
    assert.match(audit, /--filter-platform wasm32-unknown-unknown/);
    assert.match(audit, /generate-contract-spdx\.mjs/);
    assert.match(audit, /name: contract-sbom-\$\{\{ github\.sha \}\}/);
    assert.match(audit, /retention-days: 30/);
});

test('required CI Gate waits for the reusable CodeQL workflow', async () => {
    const [ci, codeql] = await Promise.all([
        readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
        readFile(new URL('../.github/workflows/codeql.yml', import.meta.url), 'utf8'),
    ]);
    const codeqlJob = ci.slice(ci.indexOf('  codeql:'), ci.indexOf('  ci-gate:'));
    const ciGate = ci.slice(ci.indexOf('  ci-gate:'));

    assert.match(codeqlJob, /uses: \.\/\.github\/workflows\/codeql\.yml/);
    assert.match(codeqlJob, /security-events: write/);
    assert.match(ciGate, /\n      - codeql\n/);
    assert.match(ciGate, /scripts\/apply-market-read-model-d1\.test\.mjs/);
    assert.match(ciGate, /scripts\/market-read-api\.test\.mjs/);
    assert.match(codeql, /\n  workflow_call:\n/);
    assert.doesNotMatch(codeql, /\n  pull_request:\n|\n  push:\n/);
    assert.match(codeql, /\n  schedule:\n/);
});

test('testnet read model binding stays dark with only the finality probe cron', async () => {
    const source = await readFile(new URL('../read-model/wrangler.toml', import.meta.url), 'utf8');

    assert.match(source, /name = "youtick-market-read-model-testnet"/);
    assert.match(source, /compatibility_flags = \["nodejs_compat"\]/);
    assert.match(source, /workers_dev = false/);
    assert.match(source, /preview_urls = false/);
    assert.match(source, /\[triggers\]\ncrons = \["\* \* \* \* \*"\]/);
    assert.match(source, /\[observability\]\nenabled = true\nhead_sampling_rate = 1/);
    assert.match(source, /READ_MODEL_ENABLED = "false"/);
    assert.match(source, /READ_MODEL_INGESTION_ENABLED = "false"/);
    assert.match(source, /READ_MODEL_BACKFILL_ENABLED = "false"/);
    assert.match(source, /READ_MODEL_BACKFILL_CONTINUE_ENABLED = "false"/);
    assert.match(source, /binding = "MARKET_READ_MODEL"/);
    assert.match(source, /database_name = "youtick-market-read-model-v1-testnet"/);
    assert.match(source, /database_id = "50b1e14f-2b06-444b-98cf-b828f11277ef"/);
    assert.match(source, /migrations_dir = "d1"/);
    assert.doesNotMatch(source, /\bqueues\b|READ_MODEL_NEAR_RPC_URL/);
});

test('Preview publication API is read-only and bound to the exact Web origin', async () => {
    const [config, deploy, promote] = await Promise.all([
        readFile(new URL('../read-model/wrangler.preview.toml', import.meta.url), 'utf8'),
        readFile(new URL('../.github/workflows/deploy-preview.yml', import.meta.url), 'utf8'),
        readFile(new URL('../.github/workflows/promote-production.yml', import.meta.url), 'utf8'),
    ]);

    assert.match(config, /name = "youtick-market-read-model-preview"/);
    assert.match(config, /workers_dev = false/);
    assert.match(config, /preview_urls = false/);
    assert.match(config, /routes = \[\{ pattern = "read-preview\.youtick\.net", custom_domain = true \}\]/);
    assert.match(config, /READ_MODEL_ENABLED = "true"/);
    assert.match(config, /READ_MODEL_INGESTION_ENABLED = "false"/);
    assert.match(config, /READ_MODEL_BACKFILL_ENABLED = "false"/);
    assert.match(config, /READ_MODEL_BACKFILL_CONTINUE_ENABLED = "false"/);
    assert.match(config, /READ_MODEL_WEB_ORIGIN = "https:\/\/preview\.youtick\.net"/);
    assert.match(config, /database_id = "50b1e14f-2b06-444b-98cf-b828f11277ef"/);
    assert.doesNotMatch(config, /\[triggers\]|\bqueues\b|READ_MODEL_NEAR_RPC_URL/);
    for (const workflow of [deploy, promote]) {
        assert.match(workflow, /PREVIEW_NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL: \$\{\{ vars\.PREVIEW_NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL \}\}/);
        assert.match(workflow, /PREVIEW_NEXT_PUBLIC_MARKET_READ_MODEL_URL: \$\{\{ vars\.PREVIEW_NEXT_PUBLIC_MARKET_READ_MODEL_URL \}\}/);
        assert.match(workflow, /PRODUCTION_NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL: "false"/);
    }
});

test('testnet Livepeer Queue binding stays closed with the pilot policy', async () => {
    const source = await readFile(new URL('../workers/livepeer-bridge/wrangler.toml', import.meta.url), 'utf8');

    assert.match(source, /LIVEPEER_WEBHOOK_QUEUE_ENABLED = "false"/);
    assert.match(source, /\[\[queues\.producers\]\]\nbinding = "LIVEPEER_EVENTS"\nqueue = "youtick-livepeer-events-testnet"/);
    assert.match(source, /\[\[queues\.consumers\]\]\nqueue = "youtick-livepeer-events-testnet"/);
    assert.match(source, /max_batch_size = 10/);
    assert.match(source, /max_batch_timeout = 5/);
    assert.match(source, /max_retries = 3/);
    assert.match(source, /max_concurrency = 1/);
    assert.match(source, /dead_letter_queue = "youtick-livepeer-events-dlq-testnet"/);
    assert.equal((source.match(/\[\[queues\.producers\]\]/g) ?? []).length, 1);
    assert.equal((source.match(/\[\[queues\.consumers\]\]/g) ?? []).length, 1);
});
