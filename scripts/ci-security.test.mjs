import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflows = [
    'ci.yml',
    'codeql.yml',
    'deploy-preview.yml',
    'deploy-public-testnet.yml',
    'bootstrap-public-testnet.yml',
    'preview-market-code-update.yml',
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

test('testnet Market code update stays exact-main, one-shot and protected', async () => {
    const [ci, workflow, helper, policy] = await Promise.all([
        readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
        readFile(new URL('../.github/workflows/preview-market-code-update.yml', import.meta.url), 'utf8'),
        readFile(new URL('../workers/livepeer-bridge/scripts/market-code-update.mjs', import.meta.url), 'utf8'),
        readFile(new URL('../workers/livepeer-bridge/scripts/market-code-update-policy.json', import.meta.url), 'utf8'),
    ]);
    const triggers = workflow.slice(workflow.indexOf('on:'), workflow.indexOf('concurrency:'));

    assert.match(triggers, /\n  workflow_dispatch:\n/);
    assert.doesNotMatch(triggers, /\n  (?:pull_request|push|workflow_run|workflow_call|repository_dispatch|schedule):/);
    assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
    assert.match(workflow, /concurrency:\n  group: deploy-preview/);
    assert.match(workflow, /name: Preview/);
    assert.match(workflow, /UPDATE_EXISTING_TESTNET_MARKET_CODE/);
    assert.match(workflow, /\.event == "push"/);
    assert.match(workflow, /\.head_branch == "main"/);
    assert.match(workflow, /\.head_sha == \$sha/);
    assert.match(workflow, /market-contract-\$\{REQUESTED_SHA\}/);
    assert.match(workflow, /sha256sum contracts\/nft-ticket\/Cargo\.lock/);
    assert.match(workflow, /--signer-workflow "\$\{GITHUB_REPOSITORY\}\/\.github\/workflows\/ci\.yml"/);
    assert.match(workflow, /--source-digest "\$\{REQUESTED_SHA\}"/);
    assert.match(workflow, /PREVIEW_MARKET_DEPLOY_PRIVATE_KEY/);
    assert.match(workflow, /NEAR_RPC_URL: \$\{\{ secrets\.NEAR_RPC_URL \}\}/);
    assert.equal((workflow.match(/ref: main/g) ?? []).length, 2);
    assert.match(workflow, /\.stage == "DISABLED"/);
    assert.match(workflow, /\.providerMutationEnabled == false/);
    assert.match(workflow, /\.newUploadReady == false/);
    assert.match(workflow, /\.sponsoredUploadQuoteReady == false/);
    assert.match(workflow, /\.sponsoredUploadRelayReady == false/);
    assert.match(workflow, /if: always\(\)\n        with:\n          name: preview-market-code-update/);
    assert.match(workflow, /if-no-files-found: ignore/);
    assert.doesNotMatch(workflow, /PREVIEW_NEAR_OPERATOR_PRIVATE_KEY|SPONSOR_RELAYER|QUOTE_PRIVATE_KEY/);
    assert.doesNotMatch(triggers, /account|target|rpc|method|init|migrate/i);

    assert.match(ci, /name: market-runtime-candidate-\$\{\{ github\.sha \}\}/);
    assert.match(ci, /name: market-contract-\$\{\{ github\.sha \}\}/);
    assert.match(ci, /workers\/livepeer-bridge\/scripts\/market-code-update\*\)\n\s+bridge=true\n\s+contracts=true\n\s+;;/);
    assert.ok(
        ci.indexOf('workers/livepeer-bridge/scripts/market-code-update*)')
            < ci.indexOf('workers/livepeer-bridge/*)'),
        'Market update paths must precede the general Bridge path rule',
    );
    assert.match(ci, /github\.event_name == 'push'/);
    assert.match(ci, /github\.ref == 'refs\/heads\/main'/);
    assert.match(ci, /Attest exact Market runtime provenance/);
    assert.match(ci, /name: Retain exact Market runtime artifact\n/);
    assert.match(ci, /retention-days: 30/);
    assert.match(ci.slice(ci.indexOf('  ci-gate:')), /\n      - market-runtime-artifact\n/);

    assert.match(helper, /actions: \[actions\.deployContract\(wasmBytes\)\]/);
    assert.match(helper, /receiverId: targetContractId/);
    assert.match(helper, /new JsonRpcProvider\(\{ url: rpcUrl \}, \{ retries: 1 \}\)/);
    assert.match(helper, /createSignedTransaction/);
    assert.match(helper, /encodeTransaction\(signedTransaction\)/);
    assert.match(helper, /sendTransactionUntil\(signedTransaction, 'FINAL'\)/);
    assert.doesNotMatch(helper, /signAndSendTransaction/);
    assert.match(helper, /broadcast_error_code/);
    assert.match(helper, /provider_error_code/);
    const providerClassifier = helper.slice(
        helper.indexOf('function safeProviderErrorCode'),
        helper.indexOf('async function query'),
    );
    assert.match(providerClassifier, /rpc_http_/);
    assert.doesNotMatch(providerClassifier, /\.message/);
    assert.doesNotMatch(helper, /actions\.(?:functionCall|transfer|addKey|deleteKey|createAccount|deleteAccount)/);
    assert.match(helper, /market_code_update_state_changed/);
    assert.match(helper, /market_code_update_reconcile_required/);
    assert.match(helper, /request_type: 'view_code'/);
    assert.match(helper, /market_code_update_deploy_key_set_mismatch/);
    assert.match(helper, /permission\.allowance === expected\.allowance/);
    assert.match(helper, /market_code_update_reserve_insufficient/);
    assert.match(helper, /status: 'POSTCHECK_FAILED'/);
    assert.doesNotMatch(helper, /https:\/\/rpc\.testnet\.near\.org/);

    const parsedPolicy = JSON.parse(policy);
    assert.equal(parsedPolicy.target_contract_id, 'lp-arch-market-v2-260809.youtick-dev-v3.testnet');
    assert.equal(parsedPolicy.expected_governance.new_purchases_paused, true);
    assert.equal(parsedPolicy.expected_access_state.market_contract_id, parsedPolicy.target_contract_id);
    assert.match(parsedPolicy.max_deploy_cost_yocto, /^[1-9][0-9]*$/);
    assert.match(parsedPolicy.expected_bridge_key.allowance, /^[1-9][0-9]*$/);
    assert.equal(Object.hasOwn(parsedPolicy, 'rpc_url'), false);
});

test('Access artifacts retain same-run provenance and reject altered or incomplete bytes', async () => {
    const source = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
    const shellStep = (name) => source.split(`- name: ${name}\n`)[1]
        .split(/\n      - /)[0].split('run: |\n')[1].replace(/^          /gm, '').trim();
    const packageStep = shellStep('Package exact Access runtime artifact');
    const verifyStep = shellStep('Verify same-run Access runtime candidate');
    const directory = await mkdtemp(join(tmpdir(), 'access-runtime-'));
    const env = {
        ...process.env, RUNNER_TEMP: directory, GITHUB_WORKSPACE: directory,
        GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1',
    };
    const run = (script, overrides = {}) => execFileSync('bash', ['-euo', 'pipefail', '-c', script], {
        cwd: directory, env: { ...env, ...overrides }, stdio: 'pipe',
    });
    try {
        const contract = join(directory, 'contracts/access-control');
        await mkdir(join(contract, 'target/near'), { recursive: true });
        await writeFile(join(contract, 'target/near/youtick_access_control.wasm'), '\0asm');
        await writeFile(join(contract, 'target/near/youtick_access_control_abi.json'), '{}');
        await writeFile(join(contract, 'Cargo.lock'), '# test lockfile\n');
        run(packageStep);
        run(verifyStep);
        assert.throws(() => run(verifyStep, { GITHUB_SHA: 'b'.repeat(40) }));
        assert.throws(() => run(verifyStep, { GITHUB_RUN_ID: '124' }));
        assert.throws(() => run(verifyStep, { GITHUB_RUN_ATTEMPT: '2' }));
        await writeFile(join(directory, 'access-runtime/youtick_access_control.wasm'), 'changed');
        assert.throws(() => run(verifyStep));
        run(packageStep);
        await rm(join(directory, 'access-runtime/youtick_access_control_abi.json'));
        assert.throws(() => run(verifyStep));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
    const retained = source.slice(source.indexOf('\n  market-runtime-artifact:'), source.indexOf('\n  protocol:'));
    assert.match(retained, /github\.event_name == 'push'/);
    assert.match(retained, /github\.ref == 'refs\/heads\/main'/);
    assert.match(retained, /needs\.contracts\.result == 'success'/);
    assert.match(retained, /name: access-runtime-candidate-\$\{\{ github\.sha \}\}/);
    assert.match(retained, /subject-checksums: \$\{\{ runner\.temp \}\}\/access-runtime\/SHA256SUMS/);
    assert.match(retained, /name: access-contract-\$\{\{ github\.sha \}\}[\s\S]*retention-days: 30/);
    assert.ok(retained.indexOf('Verify same-run Access') < retained.indexOf('Attest exact Access'));
});

test('fresh public-testnet bootstrap is reviewed, durable before send and never auto-rerun', async () => {
    const [source, helper] = await Promise.all([
        readFile(new URL('../.github/workflows/bootstrap-public-testnet.yml', import.meta.url), 'utf8'),
        readFile(new URL('../workers/livepeer-bridge/scripts/public-testnet-bootstrap.mjs', import.meta.url), 'utf8'),
    ]);
    const triggers = source.slice(source.indexOf('\non:'), source.indexOf('\nconcurrency:'));
    assert.match(triggers, /workflow_dispatch:/);
    assert.doesNotMatch(triggers, /\n  (?:push|pull_request|schedule|workflow_run|workflow_call):/);
    assert.match(source, /group: public-testnet-video\n  cancel-in-progress: false/);
    assert.equal((source.match(/github\.run_attempt == 1/g) ?? []).length, 2);
    assert.match(source, /environment:\n      name: public-testnet/);
    assert.match(source, /--source-digest "\$SOURCE_SHA"/);
    assert.match(source, /--source-ref refs\/heads\/main --deny-self-hosted-runners/);
    assert.match(source, /verificationResult\.signature\.certificate\.runInvocationURI/);
    assert.match(source, /metadata\['digest'\]/);
    assert.match(source, /set\(z\.namelist\(\)\) == names/);
    assert.match(source, /select\(\.name == \$name\)\] \| length == 0/);
    assert.match(source, /PUBLIC_DEPLOY" == false && "\$PREVIEW_DEPLOY" == false/);
    assert.ok(source.indexOf('Verify artifacts before accessing the parent secret') < source.indexOf('secrets.PUBLIC_TESTNET_BOOTSTRAP_PARENT_PRIVATE_KEY'));
    assert.ok(source.indexOf('Persist public transaction hashes before any broadcast') < source.indexOf('Send each transaction once'));
    const uploadPaths = [...source.matchAll(/\n          path: ([^\n]+)/g)].map((m) => m[1]);
    assert.equal(uploadPaths.length, 4);
    assert.ok(uploadPaths.every((p) => !/parent\.json|signed\//.test(p)));
    assert.equal((helper.match(/await rpc\('send_tx'/g) ?? []).length, 1);
    assert.match(helper, /await rpc\('tx', \{ tx_hash: txHash, sender_account_id: parent/);
    assert.match(helper, /signer\.signTransaction\(tx\)/);
    assert.match(helper, /baseEncode\(txHash\)/);
    assert.doesNotMatch(helper, /runMarketCodeUpdate|sendTransactionUntil|signAndSendTransaction/);
});

test('web CI verifies the immutable sponsored-wallet executor', async () => {
    const source = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
    const web = source.slice(source.indexOf('  web:'), source.indexOf('  livepeer-bridge:'));

    assert.match(web, /npm run test:wallet-provenance/);
    assert.match(web, /npm run lint/);
    assert.match(web, /npm test -- --run/);
    assert.match(web, /npm run build/);
});

test('Preview operator mutations follow only the sponsored canary gate', async () => {
    const source = await readFile(
        new URL('../.github/workflows/deploy-preview.yml', import.meta.url),
        'utf8',
    );

    assert.match(
        source,
        /PREVIEW_LIVEPEER_OPERATOR_MUTATIONS_ENABLED: \$\{\{ vars\.PREVIEW_SPONSORED_UPLOAD_CANARY_ENABLED == 'true' && 'true' \|\| 'false' \}\}/,
    );
    assert.match(source, /PRODUCTION_LIVEPEER_OPERATOR_MUTATIONS_ENABLED: "false"/);
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
    assert.match(ciGate, /scripts\/fastnear-dev\.test\.mjs/);
    assert.match(ciGate, /scripts\/fetch-neardata-market-block\.test\.mjs/);
    assert.match(ciGate, /scripts\/rebuild-market-read-model\.test\.mjs/);
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

test('Preview operator outbox status workflow is protected and GET-only', async () => {
    const source = await readFile(
        new URL('../.github/workflows/operator-outbox-status.yml', import.meta.url),
        'utf8',
    );

    assert.match(source, /\n  workflow_dispatch:\n/);
    assert.match(source, /\npermissions: \{\}\n/);
    assert.match(source, /if: github\.ref == 'refs\/heads\/main'/);
    assert.match(source, /name: Preview/);
    assert.match(source, /\$\{\{ secrets\.PREVIEW_LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN \}\}/);
    assert.match(source, /\$\{#OPERATOR_TOKEN\}/);
    assert.match(source, /--request GET/);
    assert.match(source, /\/v1\/operations\/operator-outbox-status/);
    assert.match(source, /youtick\.livepeer-operator-outbox-status\.v1/);
    assert.match(source, /GITHUB_STEP_SUMMARY/);
    assert.doesNotMatch(source, /^\s+-?\s*uses:/m);
    assert.doesNotMatch(source, /--request POST|operator-outbox-archive-scan|wrangler|gh api/);
    assert.doesNotMatch(source, /set -x|echo .*OPERATOR_TOKEN|printenv/);
    assert.doesNotMatch(source, /\\\$\{/);
});

test('Preview operator archive scan workflow is exact-one and single-POST', async () => {
    const source = await readFile(
        new URL('../.github/workflows/operator-outbox-archive-scan.yml', import.meta.url),
        'utf8',
    );

    assert.match(source, /\n  workflow_dispatch:\n/);
    assert.match(source, /\npermissions: \{\}\n/);
    assert.match(source, /if: github\.ref == 'refs\/heads\/main'/);
    assert.match(source, /name: Preview/);
    assert.match(source, /\$\{\{ secrets\.PREVIEW_LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN \}\}/);
    assert.match(source, /\/v1\/operations\/operator-outbox-status/);
    assert.match(source, /\/v1\/operations\/operator-outbox-archive-scan/);
    assert.match(source, /\.totalRecords == 1/);
    assert.match(source, /\.invalidRecords == 0/);
    assert.match(source, /\.confirmedRecords == 1/);
    assert.match(source, /\.pendingRecords == 1/);
    assert.match(source, /\.retryRecords == 0/);
    assert.match(source, /\.committedRecords == 0/);
    assert.match(source, /\.uncommittedRecords == 1/);
    assert.match(source, /\.eligibleRecords == 1/);
    assert.match(source, /\.scanActive == false/);
    assert.match(source, /operator_outbox_archive_scan_http_\$\{scan_http\}/);
    assert.match(source, /"youtick\.livepeer-operator-outbox-archive-scan-start\.v1"/);
    assert.equal((source.match(/--request GET/g) ?? []).length, 1);
    assert.equal((source.match(/--request POST/g) ?? []).length, 1);
    assert.equal((source.match(/^\s+curl \\/gm) ?? []).length, 2);
    assert.equal((source.match(/--retry 0/g) ?? []).length, 2);
    assert.doesNotMatch(source, /^\s+-?\s*uses:/m);
    assert.doesNotMatch(source, /--request (?:PUT|PATCH|DELETE)|--data|--form|--upload-file/);
    assert.doesNotMatch(source, /wrangler|gh api|set -x|echo .*OPERATOR_TOKEN|printenv/);
    assert.doesNotMatch(source, /\b(?:for|while)\b/);
    assert.doesNotMatch(source, /\\\$\{/);
});


test('public testnet builds a reviewed isolated artifact before its protected deploy', async () => {
    const source = await readFile(new URL('../.github/workflows/deploy-public-testnet.yml', import.meta.url), 'utf8');
    const prepare = source.slice(source.indexOf('  prepare:'), source.indexOf('  deploy:'));
    const deploy = source.slice(source.indexOf('  deploy:'));
    assert.match(source, /workflow_dispatch:/);
    assert.doesNotMatch(source, /workflow_run:|pull_request_target:/);
    assert.match(source, /default: closed/);
    assert.match(source, /cancel-in-progress: false/);
    assert.match(prepare, /github.ref == 'refs\/heads\/main'/);
    assert.match(prepare, /\.head_sha == \$sha/);
    assert.match(prepare, /\.event == "push"/);
    assert.match(prepare, /\.conclusion == "success"/);
    assert.match(prepare, /compare\/\$\{REQUESTED_SHA\}\.\.\.main/);
    assert.match(prepare, /--environment public-testnet/);
    assert.match(prepare, /--mode "\$RELEASE_MODE"/);
    assert.match(prepare, /npm sbom --omit=dev --sbom-format=spdx/);
    assert.match(prepare, /sbom-path:/);
    assert.doesNotMatch(prepare, /secrets\./);
    assert.match(deploy, /vars.DEPLOY_PUBLIC_TESTNET_ENABLED == 'true'/);
    assert.match(deploy, /name: public-testnet/);
    assert.match(deploy, /required_reviewers/);
    assert.match(deploy, /gh attestation verify/);
    assert.match(deploy, /attestations: read/);
    assert.doesNotMatch(deploy, /attestations: write|id-token: write/);
    assert.match(deploy, /--signer-workflow/);
    assert.match(deploy, /reviewed_mode_mismatch/);
    assert.match(deploy, /cloudflare-release.mjs deploy public-testnet/);
    assert.doesNotMatch(deploy, /secrets\.(PREVIEW_|PRODUCTION_)|near .*call|d1 execute|workflow run/);
});


test('public Market code update is manual, exact-target and isolated from Preview', async () => {
    const workflow = await readFile(new URL('../.github/workflows/public-testnet-market-code-update.yml', import.meta.url), 'utf8');
    assert.match(workflow, /workflow_dispatch:/);
    assert.doesNotMatch(workflow, /workflow_run:|pull_request_target:|workflow_call:/);
    assert.match(workflow, /group: public-testnet-video/);
    assert.match(workflow, /name: public-testnet/);
    assert.match(workflow, /github.run_attempt == 1/);
    assert.match(workflow, /UPDATE_EXISTING_PUBLIC_TESTNET_MARKET_CODE/);
    assert.match(workflow, /--arg name "public-testnet-market-contract-\$\{REQUESTED_SHA\}"/);
    assert.match(workflow, /--target public-testnet/);
    assert.match(workflow, /PUBLIC_TESTNET_MARKET_DEPLOY_PRIVATE_KEY/);
    assert.match(workflow, /secrets.PUBLIC_TESTNET_NEAR_RPC_URL/);
    assert.match(workflow, /EXPECTED_POLICY_SHA256/);
    assert.match(workflow, /required_reviewers/);
    assert.match(workflow, /deployment_branch_policy.protected_branches/);
    assert.match(workflow, /--source-digest/);
    assert.match(workflow, /\.head_sha == \$sha/);
    assert.match(workflow, /\.event == "push"/);
    assert.match(workflow, /\.stage == "DISABLED"/);
    assert.match(workflow, /\.playbackReady == false/);
    assert.match(workflow, /\.webhookQueueReady == false/);
    assert.match(workflow, /\.operatorMutationEnabled == false/);
    assert.doesNotMatch(workflow, /PREVIEW_|PRODUCTION_|PARENT_PRIVATE_KEY|SPONSOR_RELAYER_PRIVATE_KEY|QUOTE_PRIVATE_KEY|bootstrap-public-testnet|new_public_testnet/);
    assert.equal((workflow.match(/market-code-update.mjs deploy /g) ?? []).length, 1);
    const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
    assert.match(ci, /artifact --target public-testnet/);
    assert.match(ci, /verify-artifact --target public-testnet/);
    assert.match(ci, /name: public-testnet-market-contract-\$\{\{ github.sha \}\}/);
    assert.match(ci, /subject-checksums: .*public-testnet-market-runtime\/SHA256SUMS/);
    assert.match(ci, /name: market-contract-\$\{\{ github.sha \}\}/);
});
