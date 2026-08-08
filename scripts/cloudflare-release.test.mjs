import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    appendFileSync,
    chmodSync,
    existsSync,
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { deployRelease, writeBridgeArtifactWrangler } from './cloudflare-release.mjs';

const SHA = 'a'.repeat(40);
const ACCOUNT_ID = '1'.repeat(32);
const ZONE_ID = '2'.repeat(32);
const API_TOKEN = 'fixture-api-token';
const NEAR_RPC_URL = 'https://rpc.fastnear.com/v1/release-test-secret';
const NEAR_RPC_SHA256 = createHash('sha256').update(NEAR_RPC_URL).digest('hex');
const ONECLICK_API_KEY = `eyJx${'a'.repeat(266)}.${'b'.repeat(266)}.sig`;
const TARGETS = {
    preview: {
        web: { worker: 'youtick-web-preview', domain: 'preview.youtick.net' },
        bridge: {
            worker: 'youtick-livepeer-bridge-preview',
            domain: 'bridge-preview.youtick.net',
        },
    },
    production: {
        web: { worker: 'youtick-web', domain: 'app.youtick.net' },
        bridge: { worker: 'youtick-livepeer-bridge', domain: 'bridge.youtick.net' },
    },
};

function canonicalJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

function record(path) {
    const bytes = readFileSync(path);
    return {
        path: path.split('/').at(-1),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
    };
}

function makeConfig(target) {
    const expected = TARGETS[target];
    return {
        schemaVersion: 1,
        environment: target,
        targets: structuredClone(expected),
        web: {
            NEXT_PUBLIC_NEAR_NETWORK: 'testnet',
            NEXT_PUBLIC_MARKET_CONTRACT_ID: 'market.testnet',
            NEXT_PUBLIC_ACCESS_CONTRACT_ID: 'access.testnet',
            NEXT_PUBLIC_APP_URL: `https://${expected.web.domain}`,
            NEXT_PUBLIC_LIVEPEER_BRIDGE_URL: `https://${expected.bridge.domain}`,
            NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1: 'false',
            NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE: 'false',
            NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE: 'off',
        },
        bridge: {
            ACCESS_CONTRACT_ID: 'access.testnet',
            ALLOWED_ORIGINS: `https://${expected.web.domain}`,
            CREATOR_FEE_QUOTE_KEY_VERSION: '1',
            LIVEPEER_API_TOKEN_NAME: 'release-token',
            LIVEPEER_BRIDGE_ENABLED: 'false',
            LIVEPEER_CREATOR_ALLOWLIST: '',
            LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS: '',
            LIVEPEER_JWT_ISSUER: `https://${expected.web.domain}`,
            LIVEPEER_JWT_PUBLIC_KEY: 'public-key',
            LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS: '',
            LIVEPEER_NEAR_CREATOR_FEE_ENABLED: 'false',
            LIVEPEER_PAID_MEDIA_OPERATOR_ID: 'operator.testnet',
            LIVEPEER_PROJECT_ID: 'project-id',
            MARKET_CONTRACT_ID: 'market.testnet',
            NEAR_NETWORK: 'testnet',
            NEAR_OPERATOR_ACCOUNT_ID: 'bridge.testnet',
            NEAR_OPERATOR_KEY_EPOCH: '1',
            MULTI_ASSET_PAYMENTS_MODE: 'off',
            MULTI_ASSET_PAYMENT_ASSET_IDS: '',
        },
    };
}

function createTar(source, output) {
    execFileSync('tar', ['-czf', output, '-C', source, '.']);
}

function makeRelease(t, target = 'preview') {
    const root = mkdtempSync(join(tmpdir(), 'cloudflare-release-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const artifactDir = join(root, 'artifact');
    const webRoot = join(root, 'web');
    const bridgeRoot = join(root, 'bridge');
    mkdirSync(join(webRoot, '.open-next', 'assets'), { recursive: true });
    mkdirSync(bridgeRoot, { recursive: true });
    writeFileSync(join(webRoot, '.open-next', 'worker.js'), 'export default { fetch() {} };\n');
    writeFileSync(join(webRoot, '.open-next', 'assets', 'index.txt'), 'asset\n');
    writeFileSync(join(webRoot, 'wrangler.jsonc'), canonicalJson({
        $schema: 'node_modules/wrangler/config-schema.json',
        name: 'youtick-web',
        main: '.open-next/worker.js',
        compatibility_date: '2025-03-25',
        compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
        assets: { directory: '.open-next/assets', binding: 'ASSETS' },
        preview_urls: true,
        env: {
            preview: {
                name: TARGETS.preview.web.worker,
                routes: [{ pattern: TARGETS.preview.web.domain, custom_domain: true }],
            },
            production: {
                name: TARGETS.production.web.worker,
                routes: [{ pattern: TARGETS.production.web.domain, custom_domain: true }],
            },
        },
    }));
    writeFileSync(join(bridgeRoot, 'index.js'), 'export default { fetch() {} };\n');
    writeFileSync(join(bridgeRoot, 'wrangler.toml'), [
        'name = "youtick-livepeer-bridge"',
        'main = "src/index.ts"',
        'compatibility_date = "2024-09-23"',
        'compatibility_flags = ["nodejs_compat"]',
        '',
        '[vars]',
        'LIVEPEER_BRIDGE_ENABLED = "false"',
        'LIVEPEER_NEAR_CREATOR_FEE_ENABLED = "false"',
        'MULTI_ASSET_PAYMENTS_MODE = "off"',
        'MULTI_ASSET_PAYMENT_ASSET_IDS = ""',
        '',
        '[version_metadata]',
        'binding = "CF_VERSION_METADATA"',
        '',
        '[[durable_objects.bindings]]',
        'name = "LIVEPEER_CONTROL"',
        'class_name = "LivepeerControl"',
        '',
        '[[migrations]]',
        'tag = "v1"',
        'new_sqlite_classes = ["LivepeerControl"]',
        '',
    ].join('\n'));

    mkdirSync(artifactDir, { recursive: true });
    const configName = `${target}-config.json`;
    const webName = `web-${target}.tar.gz`;
    const configPath = join(artifactDir, configName);
    const webPath = join(artifactDir, webName);
    const bridgePath = join(artifactDir, 'bridge.tar.gz');
    writeFileSync(configPath, canonicalJson(makeConfig(target)));
    createTar(webRoot, webPath);
    createTar(bridgeRoot, bridgePath);

    const emptyRecord = { path: 'unused', sha256: '0'.repeat(64), bytes: 1 };
    const manifest = {
        schemaVersion: 1,
        sha: SHA,
        ci: { runId: '1', runAttempt: '1' },
        targets: structuredClone(TARGETS),
        lockfiles: { web: emptyRecord, bridge: emptyRecord },
        configs: {
            preview: target === 'preview' ? record(configPath) : emptyRecord,
            production: target === 'production' ? record(configPath) : emptyRecord,
        },
        bundles: {
            webPreview: target === 'preview' ? record(webPath) : emptyRecord,
            webProduction: target === 'production' ? record(webPath) : emptyRecord,
            bridge: record(bridgePath),
        },
    };
    writeFileSync(join(artifactDir, 'manifest.json'), canonicalJson(manifest));
    return {
        root,
        artifactDir,
        receipt: join(root, 'receipt.json'),
        manifest,
        configPath,
        bridgeRoot,
        bridgePath,
    };
}

const FAKE_WRANGLER = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const crypto = require('node:crypto');
const args = process.argv.slice(2);
if (args[0] === '--version') {
  process.stdout.write('4.90.0\n');
  process.exit(0);
}
const statePath = process.env.FAKE_WRANGLER_STATE;
const logPath = process.env.FAKE_WRANGLER_LOG;
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
fs.appendFileSync(logPath, JSON.stringify(args) + '\n');
const secretsIndex = args.indexOf('--secrets-file');
if (secretsIndex >= 0) {
  const secretsPath = args[secretsIndex + 1];
  const raw = fs.readFileSync(secretsPath, 'utf8');
  const parsed = JSON.parse(raw);
  const mode = fs.statSync(secretsPath).mode & 0o777;
  const keys = Object.keys(parsed);
  const hash = crypto.createHash('sha256').update(parsed.NEAR_RPC_URL || '').digest('hex');
  const oneClickHash = crypto.createHash('sha256').update(parsed.ONECLICK_API_KEY || '').digest('hex');
  const expectedKeys = process.env.FAKE_ONECLICK_API_KEY_SHA256
    ? ['NEAR_RPC_URL', 'ONECLICK_API_KEY']
    : ['NEAR_RPC_URL'];
  if (mode !== 0o600 || JSON.stringify(keys) !== JSON.stringify(expectedKeys)
      || hash !== process.env.FAKE_NEAR_RPC_SHA256
      || (process.env.FAKE_ONECLICK_API_KEY_SHA256
        && oneClickHash !== process.env.FAKE_ONECLICK_API_KEY_SHA256)
      || process.env.NEAR_RPC_URL || process.env.ONECLICK_API_KEY) {
    throw new Error('invalid fake Wrangler secret contract');
  }
  fs.appendFileSync(process.env.FAKE_WRANGLER_SECRET_LOG, JSON.stringify({
    command: args.slice(0, 2), worker: args[args.indexOf('--name') + 1], mode, keys,
  }) + '\n');
}
const value = (flag) => args[args.indexOf(flag) + 1];
const worker = value('--name');
const output = (entry) => fs.appendFileSync(
  process.env.WRANGLER_OUTPUT_FILE_PATH,
  JSON.stringify({ ...entry, timestamp: new Date(0).toISOString() }) + '\n',
);
const save = () => fs.writeFileSync(statePath, JSON.stringify(state));
const failed = (code, message = 'fixture failure') => {
  output({ type: 'command-failed', version: 1, ...(code === undefined ? {} : { code }), message });
  process.exit(1);
};
if (args[0] === 'deployments' && args[1] === 'status') {
  const statusCode = state.statusFailures?.[worker];
  if (statusCode) failed(statusCode);
  if (state.noDeployments?.includes(worker)) {
    failed(undefined, 'The Worker ' + worker + ' has no deployments.');
  }
  const current = state.workers[worker];
  if (!current) failed(10007);
  process.stdout.write(JSON.stringify({ versions: current.traffic }));
  process.exit(0);
}
if (args[0] === 'versions' && args[1] === 'upload') {
  const code = state.uploadFailures?.[worker];
  if (code) {
    delete state.uploadFailures[worker];
    save();
    failed(code);
  }
  const id = worker.includes('web') ? 'web-new' : 'bridge-new';
  output({
    type: 'version-upload',
    version: 1,
    worker_name: worker,
    version_id: id,
    preview_url: worker.includes('web')
      ? (state.omitWebPreview
        ? null
        : state.badWebPreview || 'https://' + id.slice(0, 8) + '-' + worker + '.account.workers.dev')
      : null,
  });
  process.exit(0);
}
if (args[0] === 'deploy') {
  const id = worker.includes('web') ? 'web-bootstrap' : 'bridge-bootstrap';
  state.noDeployments = state.noDeployments?.filter((name) => name !== worker);
  state.workers[worker] = { traffic: [{ version_id: id, percentage: 100 }] };
  save();
  output({
    type: 'deploy',
    version: 1,
    worker_name: worker,
    version_id: id,
    targets: ['https://' + worker + '.account.workers.dev'],
  });
  process.exit(0);
}
if (args[0] === 'versions' && args[1] === 'deploy') {
  const traffic = args
    .filter((entry) => /^[A-Za-z0-9-]+@[0-9]+$/.test(entry))
    .map((entry) => {
      const [version_id, percentage] = entry.split('@');
      return { version_id, percentage: Number(percentage) };
    });
  state.noDeployments = state.noDeployments?.filter((name) => name !== worker);
  state.workers[worker] = { traffic };
  save();
  output({ type: 'version-deploy', version: 1, worker_name: worker });
  process.exit(0);
}
if (args[0] === 'triggers' && args[1] === 'deploy') process.exit(0);
failed(99999);
`;

function makeFakeWrangler(release, state) {
    const binary = join(release.root, 'wrangler');
    const statePath = join(release.root, 'wrangler-state.json');
    const logPath = join(release.root, 'wrangler-log.ndjson');
    const secretLogPath = join(release.root, 'wrangler-secret-log.ndjson');
    writeFileSync(binary, FAKE_WRANGLER);
    chmodSync(binary, 0o755);
    if (!Object.hasOwn(state, 'domains')) {
        state.domains = {};
        for (const worker of Object.keys(state.workers)) {
            const target = Object.values(TARGETS)
                .flatMap((environment) => Object.values(environment))
                .find((entry) => entry.worker === worker);
            if (!target) continue;
            state.domains[target.domain] = {
                id: `domain-${worker}`,
                hostname: target.domain,
                service: worker,
                ...(state.omitDomainEnvironment ? {} : { environment: 'production' }),
                zone_id: ZONE_ID,
            };
        }
    }
    state.routes ??= [];
    writeFileSync(statePath, JSON.stringify(state));
    writeFileSync(logPath, '');
    writeFileSync(secretLogPath, '');
    const apiCalls = [];
    const apiFetch = async (value, init = {}) => {
        assert.equal(init.headers.Authorization, `Bearer ${API_TOKEN}`);
        const url = new URL(value);
        const current = JSON.parse(readFileSync(statePath, 'utf8'));
        const method = init.method || 'GET';
        apiCalls.push({ method, path: `${url.pathname}${url.search}`, body: init.body || null });
        const response = (status, body) => new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
        if (current.failApiStatus) {
            return response(current.failApiStatus, { success: false, result: null });
        }
        if (url.pathname === `/client/v4/accounts/${ACCOUNT_ID}/workers/domains` && method === 'GET') {
            let result = Object.values(current.domains);
            for (const key of ['hostname', 'service']) {
                if (url.searchParams.has(key)) {
                    result = result.filter((entry) => entry[key] === url.searchParams.get(key));
                }
            }
            return response(200, {
                success: true,
                result,
                result_info: { total_count: result.length },
            });
        }
        if (url.pathname === `/client/v4/accounts/${ACCOUNT_ID}/workers/subdomain` && method === 'GET') {
            return response(200, { success: true, result: { subdomain: 'account' } });
        }
        const scriptSubdomainPrefix = `/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/`;
        if (url.pathname.startsWith(scriptSubdomainPrefix)
            && url.pathname.endsWith('/subdomain') && method === 'GET') {
            const worker = decodeURIComponent(url.pathname.slice(
                scriptSubdomainPrefix.length,
                -'/subdomain'.length,
            ));
            return response(200, {
                success: true,
                result: {
                    enabled: Boolean(current.workers[worker]),
                    previews_enabled: worker.includes('web'),
                },
            });
        }
        if (url.pathname === `/client/v4/accounts/${ACCOUNT_ID}/workers/domains` && method === 'PUT') {
            const body = JSON.parse(init.body);
            assert.deepEqual(Object.keys(body).sort(), ['environment', 'hostname', 'service', 'zone_id']);
            assert.equal(body.environment, 'production');
            assert.equal(body.zone_id, ZONE_ID);
            if (current.failAttachService === body.service) {
                return response(409, { success: false, errors: [{ code: 1000 }], result: null });
            }
            if (current.domains[body.hostname]
                || Object.values(current.domains).some((entry) => entry.service === body.service)) {
                return response(409, { success: false, errors: [{ code: 1001 }], result: null });
            }
            const domain = {
                id: `domain-${body.service}`,
                hostname: body.hostname,
                service: body.service,
                ...(current.omitDomainEnvironment ? {} : { environment: body.environment }),
                zone_id: ZONE_ID,
            };
            current.domains[body.hostname] = domain;
            writeFileSync(statePath, JSON.stringify(current));
            if (current.commitThenThrowService === body.service) {
                throw new Error('fixture lost Domains API response');
            }
            return response(200, { success: true, result: domain });
        }
        const domainPrefix = `/client/v4/accounts/${ACCOUNT_ID}/workers/domains/`;
        if (url.pathname.startsWith(domainPrefix) && method === 'DELETE') {
            const id = url.pathname.slice(domainPrefix.length);
            const domain = Object.values(current.domains).find((entry) => entry.id === id);
            if (!domain) return response(404, { success: false, result: null });
            delete current.domains[domain.hostname];
            writeFileSync(statePath, JSON.stringify(current));
            return response(200, { success: true, result: null });
        }
        if (url.pathname === `/client/v4/zones/${ZONE_ID}/workers/routes` && method === 'GET') {
            return response(200, {
                success: true,
                result: current.routes,
                result_info: { total_count: current.routes.length },
            });
        }
        return response(404, { success: false, result: null });
    };
    return { binary, statePath, logPath, secretLogPath, apiCalls, apiFetch };
}

async function withFakeEnvironment(fake, callback, oneClickApiKey = null) {
    const previousState = process.env.FAKE_WRANGLER_STATE;
    const previousLog = process.env.FAKE_WRANGLER_LOG;
    const previousSecretLog = process.env.FAKE_WRANGLER_SECRET_LOG;
    const previousNearRpcHash = process.env.FAKE_NEAR_RPC_SHA256;
    const previousOneClickHash = process.env.FAKE_ONECLICK_API_KEY_SHA256;
    const previousNearRpcUrl = process.env.NEAR_RPC_URL;
    const previousOneClickApiKey = process.env.ONECLICK_API_KEY;
    process.env.FAKE_WRANGLER_STATE = fake.statePath;
    process.env.FAKE_WRANGLER_LOG = fake.logPath;
    process.env.FAKE_WRANGLER_SECRET_LOG = fake.secretLogPath;
    process.env.FAKE_NEAR_RPC_SHA256 = NEAR_RPC_SHA256;
    process.env.NEAR_RPC_URL = NEAR_RPC_URL;
    if (oneClickApiKey) {
        process.env.FAKE_ONECLICK_API_KEY_SHA256 = createHash('sha256')
            .update(oneClickApiKey)
            .digest('hex');
    } else {
        delete process.env.FAKE_ONECLICK_API_KEY_SHA256;
    }
    delete process.env.ONECLICK_API_KEY;
    try {
        return await callback();
    } finally {
        if (previousState === undefined) delete process.env.FAKE_WRANGLER_STATE;
        else process.env.FAKE_WRANGLER_STATE = previousState;
        if (previousLog === undefined) delete process.env.FAKE_WRANGLER_LOG;
        else process.env.FAKE_WRANGLER_LOG = previousLog;
        if (previousSecretLog === undefined) delete process.env.FAKE_WRANGLER_SECRET_LOG;
        else process.env.FAKE_WRANGLER_SECRET_LOG = previousSecretLog;
        if (previousNearRpcHash === undefined) delete process.env.FAKE_NEAR_RPC_SHA256;
        else process.env.FAKE_NEAR_RPC_SHA256 = previousNearRpcHash;
        if (previousOneClickHash === undefined) delete process.env.FAKE_ONECLICK_API_KEY_SHA256;
        else process.env.FAKE_ONECLICK_API_KEY_SHA256 = previousOneClickHash;
        if (previousNearRpcUrl === undefined) delete process.env.NEAR_RPC_URL;
        else process.env.NEAR_RPC_URL = previousNearRpcUrl;
        if (previousOneClickApiKey === undefined) delete process.env.ONECLICK_API_KEY;
        else process.env.ONECLICK_API_KEY = previousOneClickApiKey;
    }
}

function calls(fake) {
    return readFileSync(fake.logPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

function secretCalls(fake) {
    return readFileSync(fake.secretLogPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

function deployFixture(
    release,
    fake,
    smokeFn = async () => ({ ok: true }),
    {
        target = 'preview', rollbackTest = 'false', zoneId = ZONE_ID,
        nearRpcUrl = NEAR_RPC_URL, oneClickApiKey = ONECLICK_API_KEY,
    } = {},
) {
    return withFakeEnvironment(fake, () => deployRelease({
        target,
        sha: SHA,
        artifactDir: release.artifactDir,
        receiptOutput: release.receipt,
        repoRoot: release.root,
        wranglerPaths: { web: fake.binary, bridge: fake.binary },
        smokeFn,
        echoWrangler: false,
        rollbackTest,
        cloudflareFetch: fake.apiFetch,
        cloudflareAccountId: ACCOUNT_ID,
        cloudflareApiToken: API_TOKEN,
        cloudflareZoneId: zoneId,
        nearRpcUrl,
        oneClickApiKey,
    }), oneClickApiKey);
}

test('Bridge artifact writer emits the exact disabled release config once', async (t) => {
    const root = mkdtempSync(join(tmpdir(), 'bridge-artifact-wrangler-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const output = join(root, 'wrangler.toml');

    await writeBridgeArtifactWrangler(output);

    const text = readFileSync(output, 'utf8');
    assert.match(text, /MULTI_ASSET_PAYMENTS_MODE = "off"/);
    assert.match(text, /MULTI_ASSET_PAYMENT_ASSET_IDS = ""/);
    assert.doesNotMatch(text, /NEAR_RPC_URL|ALLOWED_ORIGINS|MARKET_CONTRACT_ID/);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    await assert.rejects(writeBridgeArtifactWrangler(output), /EEXIST/);
});

test('a successful first upload without traffic is bootstrapped before its candidate', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, {
        workers: {},
        noDeployments: [TARGETS.preview.web.worker, TARGETS.preview.bridge.worker],
        uploadFailures: {},
    });
    const receipt = await deployFixture(release, fake, async () => ({ ok: true }));

    assert.equal(receipt.web.bootstrap, true);
    assert.equal(receipt.bridge.bootstrap, true);
    assert.equal(receipt.web.previousVersionId, 'web-bootstrap');
    assert.equal(receipt.bridge.previousVersionId, 'bridge-bootstrap');
    for (const worker of [TARGETS.preview.web.worker, TARGETS.preview.bridge.worker]) {
        const bootstrapCalls = calls(fake).filter((args) => (
            args.includes(worker)
            && (args[0] === 'deploy' || (args[0] === 'versions' && args[1] === 'upload'))
        ));
        const expectedCalls = worker.includes('bridge')
            ? ['deploy', 'versions upload']
            : ['versions upload', 'deploy', 'versions upload'];
        assert.deepEqual(bootstrapCalls.map((args) => (
            args[0] === 'deploy' ? 'deploy' : 'versions upload'
        )), expectedCalls);
    }
});

test('a proven first Bridge deployment applies its Durable Object migration before candidate upload', async (t) => {
    for (const [name, noDeployments] of [
        ['missing Worker', []],
        ['Worker without deployments', [TARGETS.preview.bridge.worker]],
    ]) {
        await t.test(name, async (subtest) => {
            const release = makeRelease(subtest);
            const fake = makeFakeWrangler(release, {
                workers: {
                    [TARGETS.preview.web.worker]: {
                        traffic: [{ version_id: 'web-old', percentage: 100 }],
                    },
                },
                noDeployments,
                uploadFailures: {},
            });

            const receipt = await deployFixture(release, fake);

            assert.equal(receipt.bridge.bootstrap, true);
            assert.equal(receipt.bridge.previousVersionId, 'bridge-bootstrap');
            assert.equal(receipt.bridge.versionId, 'bridge-new');
            const bridgeMutations = calls(fake).filter((args) => (
                args.includes(TARGETS.preview.bridge.worker)
                && (args[0] === 'deploy' || (args[0] === 'versions' && args[1] === 'upload'))
            ));
            assert.deepEqual(bridgeMutations.map((args) => (
                args[0] === 'deploy' ? 'deploy' : 'versions upload'
            )), ['deploy', 'versions upload']);
            const bootstrap = bridgeMutations[0];
            assert.ok(bootstrap.includes('--no-bundle'));
            assert.ok(bootstrap.includes('LIVEPEER_BRIDGE_ENABLED:false'));
            assert.ok(bootstrap.includes('LIVEPEER_NEAR_CREATOR_FEE_ENABLED:false'));
            assert.ok(!bootstrap.includes('--domain'));
        });
    }
});

test('Durable Object bootstrap fallback is limited to a proven first Bridge deployment', async (t) => {
    await t.test('stable Bridge traffic never falls back to deploy', async (subtest) => {
        const release = makeRelease(subtest);
        const fake = makeFakeWrangler(release, {
            workers: {
                [TARGETS.preview.web.worker]: {
                    traffic: [{ version_id: 'web-old', percentage: 100 }],
                },
                [TARGETS.preview.bridge.worker]: {
                    traffic: [{ version_id: 'bridge-old', percentage: 100 }],
                },
            },
            uploadFailures: { [TARGETS.preview.bridge.worker]: 10211 },
        });

        await assert.rejects(deployFixture(release, fake), /bridge_upload_failed_10211/);
        assert.equal(calls(fake).filter((args) => args[0] === 'deploy').length, 0);
    });

    await t.test('Web never treats 10211 as a bootstrap signal', async (subtest) => {
        const release = makeRelease(subtest);
        const fake = makeFakeWrangler(release, {
            workers: {},
            uploadFailures: { [TARGETS.preview.web.worker]: 10211 },
        });

        await assert.rejects(deployFixture(release, fake), /web_upload_failed_10211/);
        assert.equal(calls(fake).filter((args) => args[0] === 'deploy').length, 0);
    });

    await t.test('a candidate upload error never triggers a second Bridge deploy', async (subtest) => {
        const release = makeRelease(subtest);
        const fake = makeFakeWrangler(release, {
            workers: {
                [TARGETS.preview.web.worker]: {
                    traffic: [{ version_id: 'web-old', percentage: 100 }],
                },
            },
            uploadFailures: { [TARGETS.preview.bridge.worker]: 10212 },
        });

        await assert.rejects(deployFixture(release, fake), /wrangler_command_failed/);
        assert.equal(calls(fake).filter((args) => args[0] === 'deploy').length, 1);
        const state = JSON.parse(readFileSync(fake.statePath, 'utf8'));
        assert.deepEqual(state.workers[TARGETS.preview.bridge.worker].traffic, [
            { version_id: 'bridge-bootstrap', percentage: 100 },
        ]);
        assert.equal(state.domains[TARGETS.preview.bridge.domain], undefined);
    });
});

test('a failed first Bridge candidate resumes from its bootstrap without another direct deploy', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, {
        workers: {
            [TARGETS.preview.web.worker]: {
                traffic: [{ version_id: 'web-old', percentage: 100 }],
            },
        },
        domains: {},
        uploadFailures: { [TARGETS.preview.bridge.worker]: 10212 },
    });

    await assert.rejects(deployFixture(release, fake), /wrangler_command_failed/);
    const receipt = await deployFixture(release, fake);

    assert.equal(receipt.bridge.bootstrap, false);
    assert.equal(receipt.bridge.previousVersionId, 'bridge-bootstrap');
    assert.equal(calls(fake).filter((args) => (
        args[0] === 'deploy' && args.includes(TARGETS.preview.bridge.worker)
    )).length, 1);
    const state = JSON.parse(readFileSync(fake.statePath, 'utf8'));
    assert.equal(state.domains[TARGETS.preview.web.domain].service, TARGETS.preview.web.worker);
    assert.equal(state.domains[TARGETS.preview.bridge.domain].service, TARGETS.preview.bridge.worker);
});

test('an unverified deployment status fails before upload or deploy', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, {
        workers: {},
        statusFailures: { [TARGETS.preview.web.worker]: 10090 },
        uploadFailures: {},
    });

    await assert.rejects(deployFixture(release, fake), /web_previous_deployment_unverified/);
    assert.equal(calls(fake).some((args) => (
        args[0] === 'deploy' || (args[0] === 'versions' && args[1] === 'upload')
    )), false);
});

test('an unverified Bridge status cannot enter the direct bootstrap path', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, {
        workers: {
            [TARGETS.preview.web.worker]: {
                traffic: [{ version_id: 'web-old', percentage: 100 }],
            },
        },
        statusFailures: { [TARGETS.preview.bridge.worker]: 10090 },
        uploadFailures: {},
    });

    await assert.rejects(deployFixture(release, fake), /bridge_previous_deployment_unverified/);
    assert.equal(calls(fake).some((args) => (
        args[0] === 'deploy' && args.includes(TARGETS.preview.bridge.worker)
    )), false);
});

test('only structured error 10007 permits workers.dev bootstrap before safe domain attach', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, {
        workers: {},
        uploadFailures: {
            [TARGETS.preview.web.worker]: 10007,
        },
    });
    const smokeInputs = [];
    const receipt = await deployFixture(release, fake, async (input) => {
        smokeInputs.push(input);
        return { ok: true };
    });
    assert.equal(receipt.web.bootstrap, true);
    assert.equal(receipt.bridge.bootstrap, true);
    assert.deepEqual(smokeInputs.map((input) => ({
        expected: input.expectedBridgeVersion,
        override: input.overrideVersion,
        bootstrap: input.bridgeBootstrap,
    })), [
        { expected: 'bridge-bootstrap', override: undefined, bootstrap: true },
        { expected: 'bridge-new', override: 'bridge-new', bootstrap: undefined },
        { expected: 'bridge-new', override: undefined, bootstrap: undefined },
    ]);
    assert.equal(receipt.web.previousVersionId, 'web-bootstrap');
    assert.equal(receipt.bridge.previousVersionId, 'bridge-bootstrap');

    const deploys = calls(fake).filter((args) => args[0] === 'deploy');
    assert.equal(deploys.length, 2);
    const bridgeDeploy = deploys.find((args) => args.includes(TARGETS.preview.bridge.worker));
    assert.ok(deploys.every((args) => !args.includes('--domain')));
    assert.ok(deploys.every((args) => args.at(args.indexOf('--config') + 1).includes('bootstrap')));
    assert.ok(bridgeDeploy.includes('LIVEPEER_BRIDGE_ENABLED:false'));
    assert.ok(bridgeDeploy.includes('LIVEPEER_NEAR_CREATOR_FEE_ENABLED:false'));
    assert.ok(bridgeDeploy.includes('--no-bundle'));
    assert.ok(!deploys.find((args) => args.includes(TARGETS.preview.web.worker)).includes('--no-bundle'));
    const secretCommands = calls(fake).filter((args) => (
        args.includes(TARGETS.preview.bridge.worker)
        && (args[0] === 'deploy' || (args[0] === 'versions' && args[1] === 'upload'))
    ));
    assert.equal(secretCommands.length, 2);
    assert.ok(secretCommands.every((args) => args.includes('--secrets-file')));
    assert.ok(calls(fake).filter((args) => args.includes(TARGETS.preview.web.worker))
        .every((args) => !args.includes('--secrets-file')));
    assert.deepEqual(secretCalls(fake), secretCommands.map((args) => ({
        command: args.slice(0, 2),
        worker: TARGETS.preview.bridge.worker,
        mode: 0o600,
        keys: ['NEAR_RPC_URL', 'ONECLICK_API_KEY'],
    })));
    const secretPaths = secretCommands.map((args) => args[args.indexOf('--secrets-file') + 1]);
    assert.equal(new Set(secretPaths).size, 1);
    assert.equal(existsSync(secretPaths[0]), false);
    const state = JSON.parse(readFileSync(fake.statePath, 'utf8'));
    assert.equal(state.domains[TARGETS.preview.web.domain].service, TARGETS.preview.web.worker);
    assert.equal(state.domains[TARGETS.preview.bridge.domain].service, TARGETS.preview.bridge.worker);
    assert.deepEqual(fake.apiCalls.filter((call) => call.method === 'PUT').map((call) => (
        JSON.parse(call.body).hostname
    )), [TARGETS.preview.bridge.domain, TARGETS.preview.web.domain]);
    assert.deepEqual(JSON.parse(readFileSync(release.receipt, 'utf8')), receipt);
    for (const path of [fake.logPath, fake.secretLogPath, release.receipt]) {
        assert.ok(!readFileSync(path, 'utf8').includes(NEAR_RPC_URL));
    }
});

test('a Domains API response may omit its deprecated environment field', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, {
        workers: {},
        uploadFailures: {
            [TARGETS.preview.web.worker]: 10007,
        },
        omitDomainEnvironment: true,
    });
    const receipt = await deployFixture(release, fake);
    assert.equal(receipt.web.domain, TARGETS.preview.web.domain);
    assert.equal(receipt.bridge.domain, TARGETS.preview.bridge.domain);
    const putBodies = fake.apiCalls
        .filter((call) => call.method === 'PUT')
        .map((call) => JSON.parse(call.body));
    assert.equal(putBodies.length, 2);
    assert.ok(putBodies.every((body) => body.environment === 'production'));
    const state = JSON.parse(readFileSync(fake.statePath, 'utf8'));
    assert.equal('environment' in state.domains[TARGETS.preview.web.domain], false);
    assert.equal('environment' in state.domains[TARGETS.preview.bridge.domain], false);
});

test('a non-10007 upload error never falls back to deploy', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, {
        workers: {},
        uploadFailures: { [TARGETS.preview.web.worker]: 10008 },
    });
    await assert.rejects(deployFixture(release, fake), /web_upload_failed_10008/);
    assert.equal(calls(fake).filter((args) => args[0] === 'deploy').length, 0);
});

test('invalid NEAR_RPC_URL fails before Cloudflare API or Wrangler mutation', async (t) => {
    const invalidValues = [
        ['missing', null],
        ['non-HTTPS', 'http://rpc.provider.net/v1/key'],
        ['credentials', 'https://user:password@rpc.provider.net/v1/key'],
        ['whitespace', ' https://rpc.provider.net/v1/key'],
        ['control character', 'https://rpc.provider.net/v1/key\n'],
        ['placeholder', 'https://placeholder.provider.net/v1/key'],
        ['example', 'https://rpc.example.com/v1/key'],
        ['generic public RPC', 'https://rpc.testnet.near.org'],
    ];
    for (const [name, nearRpcUrl] of invalidValues) {
        await t.test(name, async (subtest) => {
            const release = makeRelease(subtest);
            const fake = makeFakeWrangler(release, { workers: {}, uploadFailures: {} });
            await assert.rejects(
                deployFixture(release, fake, undefined, { nearRpcUrl }),
                (error) => {
                    assert.equal(error.message, 'cloudflare_release_near_rpc_url_invalid');
                    if (typeof nearRpcUrl === 'string') assert.ok(!error.message.includes(nearRpcUrl));
                    return true;
                },
            );
            assert.deepEqual(fake.apiCalls, []);
            assert.deepEqual(calls(fake), []);
            assert.deepEqual(secretCalls(fake), []);
            assert.equal(existsSync(release.receipt), false);
        });
    }
});

test('1Click secret is required for quote-disabled status recovery', async (t) => {
    await t.test('off mode forwards an available key for status polling', async (subtest) => {
        const release = makeRelease(subtest);
        const fake = makeFakeWrangler(release, {
            workers: {
                [TARGETS.preview.web.worker]: {
                    traffic: [{ version_id: 'web-old', percentage: 100 }],
                },
                [TARGETS.preview.bridge.worker]: {
                    traffic: [{ version_id: 'bridge-old', percentage: 100 }],
                },
            },
            uploadFailures: {},
        });

        await deployFixture(release, fake, undefined, { oneClickApiKey: ONECLICK_API_KEY });

        assert.ok(secretCalls(fake).length > 0);
        assert.ok(secretCalls(fake).every((call) => (
            JSON.stringify(call.keys) === JSON.stringify(['NEAR_RPC_URL', 'ONECLICK_API_KEY'])
        )));
        for (const path of [fake.logPath, fake.secretLogPath, release.receipt]) {
            assert.ok(!readFileSync(path, 'utf8').includes(ONECLICK_API_KEY));
        }
    });

    await t.test('off mode rejects a missing key before mutation', async (subtest) => {
        const release = makeRelease(subtest);
        const fake = makeFakeWrangler(release, { workers: {}, uploadFailures: {} });

        await assert.rejects(
            deployFixture(release, fake, undefined, { oneClickApiKey: null }),
            /cloudflare_release_oneclick_api_key_missing/,
        );
        assert.deepEqual(fake.apiCalls, []);
        assert.deepEqual(calls(fake), []);
        assert.deepEqual(secretCalls(fake), []);
    });

    await t.test('preview mode rejects a missing key before mutation', async (subtest) => {
        const release = makeRelease(subtest);
        const config = JSON.parse(readFileSync(release.configPath, 'utf8'));
        config.web.NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE = 'preview';
        config.bridge.MULTI_ASSET_PAYMENTS_MODE = 'preview';
        config.bridge.MULTI_ASSET_PAYMENT_ASSET_IDS = 'nep141:wrap.near';
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.preview = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        const fake = makeFakeWrangler(release, { workers: {}, uploadFailures: {} });

        await assert.rejects(
            deployFixture(release, fake, undefined, { oneClickApiKey: null }),
            /cloudflare_release_oneclick_api_key_missing/,
        );
        assert.deepEqual(fake.apiCalls, []);
        assert.deepEqual(calls(fake), []);
        assert.deepEqual(secretCalls(fake), []);
    });
});

test('target allowlist and disabled release flags are fail closed', async (t) => {
    await t.test('rejects a forbidden manifest target', async (subtest) => {
        const release = makeRelease(subtest);
        release.manifest.targets.preview.bridge.worker = 'youtick-livepeer-bridge-c3-4ea2011';
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        await assert.rejects(deployRelease({
            target: 'preview', sha: SHA, artifactDir: release.artifactDir, receiptOutput: release.receipt,
            nearRpcUrl: NEAR_RPC_URL, oneClickApiKey: ONECLICK_API_KEY,
        }), /manifest_targets_invalid|forbidden_target/);
    });

    await t.test('rejects an enabled mutation flag', async (subtest) => {
        const release = makeRelease(subtest);
        const config = JSON.parse(readFileSync(release.configPath, 'utf8'));
        config.bridge.LIVEPEER_BRIDGE_ENABLED = 'true';
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.preview = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        await assert.rejects(deployRelease({
            target: 'preview', sha: SHA, artifactDir: release.artifactDir, receiptOutput: release.receipt,
            nearRpcUrl: NEAR_RPC_URL, oneClickApiKey: ONECLICK_API_KEY,
        }), /livepeer_bridge_enabled_not_false/);
    });

    await t.test('rejects extra Bridge migrations and bindings', async (subtest) => {
        const release = makeRelease(subtest);
        appendFileSync(join(release.bridgeRoot, 'wrangler.toml'), [
            '[[kv_namespaces]]',
            'binding = "EXTRA_BINDING"',
            'id = "00000000000000000000000000000000"',
            '',
            '[[migrations]]',
            'tag = "v2"',
            'deleted_classes = ["LivepeerControl"]',
            '',
        ].join('\n'));
        createTar(release.bridgeRoot, release.bridgePath);
        release.manifest.bundles.bridge = record(release.bridgePath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        await assert.rejects(deployRelease({
            target: 'preview', sha: SHA, artifactDir: release.artifactDir, receiptOutput: release.receipt,
            nearRpcUrl: NEAR_RPC_URL, oneClickApiKey: ONECLICK_API_KEY,
        }), /bridge_wrangler_config_invalid/);
    });
});

test('candidate promotion failure restores both previous 100 percent versions', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, {
        workers: {
            [TARGETS.preview.web.worker]: {
                traffic: [{ version_id: 'web-old', percentage: 100 }],
            },
            [TARGETS.preview.bridge.worker]: {
                traffic: [{ version_id: 'bridge-old', percentage: 100 }],
            },
        },
        uploadFailures: {},
    });
    let smokeCalls = 0;
    await assert.rejects(deployFixture(release, fake, async () => {
        smokeCalls += 1;
        if (smokeCalls === 3) throw new Error('live smoke failed');
        return { ok: true };
    }), /live smoke failed/);

    const deployments = calls(fake)
        .filter((args) => args[0] === 'versions' && args[1] === 'deploy')
        .map((args) => args.filter((entry) => /^[A-Za-z0-9-]+@[0-9]+$/.test(entry)));
    assert.deepEqual(deployments, [
        ['bridge-old@100', 'bridge-new@0'],
        ['bridge-new@100'],
        ['web-new@100'],
        ['bridge-old@100'],
        ['web-old@100'],
    ]);
    const finalState = JSON.parse(readFileSync(fake.statePath, 'utf8'));
    assert.deepEqual(finalState.workers[TARGETS.preview.web.worker].traffic, [
        { version_id: 'web-old', percentage: 100 },
    ]);
    assert.deepEqual(finalState.workers[TARGETS.preview.bridge.worker].traffic, [
        { version_id: 'bridge-old', percentage: 100 },
    ]);
    assert.equal(calls(fake).filter((args) => args[0] === 'triggers').length, 0);
    assert.equal(statSync(release.artifactDir).isDirectory(), true);
});

test('production rollback test changes traffic only and restores Bridge before Web', async (t) => {
    const release = makeRelease(t, 'production');
    const fake = makeFakeWrangler(release, {
        workers: {
            [TARGETS.production.web.worker]: {
                traffic: [{ version_id: 'web-old', percentage: 100 }],
            },
            [TARGETS.production.bridge.worker]: {
                traffic: [{ version_id: 'bridge-old', percentage: 100 }],
            },
        },
        uploadFailures: {},
    });
    const smokeInputs = [];
    const receipt = await deployFixture(release, fake, async (input) => {
        smokeInputs.push(input);
        return { ok: true };
    }, { target: 'production', rollbackTest: 'true' });
    assert.deepEqual(receipt.rollbackTest, { requested: true, performed: true });
    assert.deepEqual(smokeInputs.map((input) => ({
        expected: input.expectedBridgeVersion,
        override: input.overrideVersion,
        bootstrap: input.bridgeBootstrap,
    })), [
        { expected: 'bridge-old', override: undefined, bootstrap: false },
        { expected: 'bridge-new', override: 'bridge-new', bootstrap: undefined },
        { expected: 'bridge-new', override: undefined, bootstrap: undefined },
        { expected: 'bridge-old', override: undefined, bootstrap: undefined },
        { expected: 'bridge-new', override: undefined, bootstrap: undefined },
    ]);
    const deployments = calls(fake)
        .filter((args) => args[0] === 'versions' && args[1] === 'deploy')
        .map((args) => args.filter((entry) => /^[A-Za-z0-9-]+@[0-9]+$/.test(entry)));
    assert.deepEqual(deployments, [
        ['bridge-old@100', 'bridge-new@0'],
        ['bridge-new@100'],
        ['web-new@100'],
        ['bridge-old@100'],
        ['web-old@100'],
        ['bridge-new@100'],
        ['web-new@100'],
    ]);
});

test('a partial first domain attach is detached before the failed release returns', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, {
        workers: {},
        uploadFailures: {
            [TARGETS.preview.web.worker]: 10007,
        },
        failAttachService: TARGETS.preview.web.worker,
    });
    await assert.rejects(deployFixture(release, fake), /cloudflare_api_status_409/);
    const state = JSON.parse(readFileSync(fake.statePath, 'utf8'));
    assert.deepEqual(state.domains, {});
    assert.equal(fake.apiCalls.filter((call) => call.method === 'PUT').length, 2);
    assert.equal(fake.apiCalls.filter((call) => call.method === 'DELETE').length, 1);
    assert.equal(existsSync(release.receipt), false);
});

test('a committed domain with a lost PUT response is reconciled and later detached', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, {
        workers: {},
        uploadFailures: {
            [TARGETS.preview.web.worker]: 10007,
        },
        commitThenThrowService: TARGETS.preview.bridge.worker,
        failAttachService: TARGETS.preview.web.worker,
    });
    await assert.rejects(deployFixture(release, fake), /cloudflare_api_status_409/);
    const state = JSON.parse(readFileSync(fake.statePath, 'utf8'));
    assert.deepEqual(state.domains, {});
    assert.equal(fake.apiCalls.filter((call) => call.method === 'PUT').length, 2);
    const deletes = fake.apiCalls.filter((call) => call.method === 'DELETE');
    assert.equal(deletes.length, 1);
    assert.ok(deletes[0].path.endsWith(`/domain-${TARGETS.preview.bridge.worker}`));
    assert.equal(existsSync(release.receipt), false);
});

test('production bootstrap creates v1 previous and promotes v2 with rollback proof in one run', async (t) => {
    const release = makeRelease(t, 'production');
    const fake = makeFakeWrangler(release, {
        workers: {},
        uploadFailures: {
            [TARGETS.production.web.worker]: 10007,
        },
    });
    const receipt = await deployFixture(
        release,
        fake,
        async () => ({ ok: true }),
        { target: 'production', rollbackTest: 'true' },
    );
    assert.equal(receipt.web.bootstrap, true);
    assert.equal(receipt.bridge.bootstrap, true);
    assert.equal(receipt.web.previousVersionId, 'web-bootstrap');
    assert.equal(receipt.bridge.previousVersionId, 'bridge-bootstrap');
    assert.deepEqual(receipt.rollbackTest, { requested: true, performed: true });
});

test('an existing Worker with no domain uses workers.dev until safe attach completes', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, {
        workers: {
            [TARGETS.preview.web.worker]: {
                traffic: [{ version_id: 'web-old', percentage: 100 }],
            },
            [TARGETS.preview.bridge.worker]: {
                traffic: [{ version_id: 'bridge-old', percentage: 100 }],
            },
        },
        uploadFailures: {},
        domains: {},
    });
    const smokeInputs = [];
    await deployFixture(release, fake, async (input) => {
        smokeInputs.push(input);
        return { ok: true };
    });
    assert.equal(smokeInputs[0].bridgeUrl, `https://${TARGETS.preview.bridge.worker}.account.workers.dev`);
    assert.equal(smokeInputs[1].bridgeUrl, `https://${TARGETS.preview.bridge.worker}.account.workers.dev`);
    assert.equal(smokeInputs.at(-1).bridgeUrl, `https://${TARGETS.preview.bridge.domain}`);
    const state = JSON.parse(readFileSync(fake.statePath, 'utf8'));
    assert.equal(state.domains[TARGETS.preview.web.domain].service, TARGETS.preview.web.worker);
    assert.equal(state.domains[TARGETS.preview.bridge.domain].service, TARGETS.preview.bridge.worker);
});

test('bootstrap fails before attach when Web v2 has no preview URL', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, {
        workers: {},
        uploadFailures: {
            [TARGETS.preview.web.worker]: 10007,
        },
        omitWebPreview: true,
    });
    await assert.rejects(deployFixture(release, fake), /web_preview_url_invalid/);
    assert.equal(fake.apiCalls.filter((call) => call.method === 'PUT').length, 0);
    assert.equal(existsSync(release.receipt), false);
});

test('Web v2 preview URL must match the candidate, worker, and account', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, {
        workers: {},
        uploadFailures: {
            [TARGETS.preview.web.worker]: 10007,
        },
        badWebPreview: 'https://web-new-another-worker.account.workers.dev',
    });
    await assert.rejects(deployFixture(release, fake), /web_preview_url_invalid/);
    assert.equal(fake.apiCalls.filter((call) => call.method === 'PUT').length, 0);
    assert.equal(existsSync(release.receipt), false);
});

test('Cloudflare governance preflight fails before any Wrangler mutation', async (t) => {
    await t.test('invalid zone id', async (subtest) => {
        const release = makeRelease(subtest);
        const fake = makeFakeWrangler(release, { workers: {}, uploadFailures: {} });
        await assert.rejects(
            deployFixture(release, fake, undefined, { zoneId: 'invalid' }),
            /cloudflare_zone_id_invalid/,
        );
        assert.deepEqual(calls(fake), []);
    });

    await t.test('missing API read permission', async (subtest) => {
        const release = makeRelease(subtest);
        const fake = makeFakeWrangler(release, {
            workers: {}, uploadFailures: {}, failApiStatus: 403,
        });
        await assert.rejects(deployFixture(release, fake), /cloudflare_api_status_403/);
        assert.deepEqual(calls(fake), []);
    });

    await t.test('classic route drift', async (subtest) => {
        const release = makeRelease(subtest);
        const fake = makeFakeWrangler(release, {
            workers: {
                [TARGETS.preview.web.worker]: {
                    traffic: [{ version_id: 'web-old', percentage: 100 }],
                },
                [TARGETS.preview.bridge.worker]: {
                    traffic: [{ version_id: 'bridge-old', percentage: 100 }],
                },
            },
            uploadFailures: {},
            routes: [{ pattern: 'youtick.net/*', script: TARGETS.preview.web.worker }],
        });
        await assert.rejects(deployFixture(release, fake), /worker_classic_route_forbidden/);
        assert.deepEqual(calls(fake), []);
    });

    await t.test('wrong service environment', async (subtest) => {
        const release = makeRelease(subtest);
        const fake = makeFakeWrangler(release, {
            workers: {
                [TARGETS.preview.web.worker]: {
                    traffic: [{ version_id: 'web-old', percentage: 100 }],
                },
                [TARGETS.preview.bridge.worker]: {
                    traffic: [{ version_id: 'bridge-old', percentage: 100 }],
                },
            },
            uploadFailures: {},
        });
        const state = JSON.parse(readFileSync(fake.statePath, 'utf8'));
        state.domains[TARGETS.preview.web.domain].environment = 'staging';
        writeFileSync(fake.statePath, JSON.stringify(state));
        await assert.rejects(deployFixture(release, fake), /worker_domain_record_invalid/);
        assert.deepEqual(calls(fake), []);
    });
});
