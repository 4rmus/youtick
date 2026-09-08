import { publicTestnetFlags, PUBLIC_TESTNET_READ_MODEL } from './release-metadata.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, scryptSync } from 'node:crypto';
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
import {
    deployRelease,
    writeBridgeArtifactWrangler,
    writeReadModelArtifactWrangler,
} from './cloudflare-release.mjs';

const SHA = 'a'.repeat(40);
const ACCOUNT_ID = '1'.repeat(32);
const ZONE_ID = '2'.repeat(32);
const API_TOKEN = 'fixture-api-token';
const NEAR_RPC_SECRET = 'release-test-secret';
const NEAR_RPC_URL = `https://rpc.fastnear.com/v1/${NEAR_RPC_SECRET}`;
const NEAR_RPC_SHA256 = createHash('sha256').update(NEAR_RPC_URL).digest('hex');
const ONECLICK_API_KEY = `eyJx${'a'.repeat(266)}.${'b'.repeat(266)}.sig`;
const ONECLICK_API_KEY_SCRYPT_SALT = 'youtick-release-test-v1';
const LIVEPEER_API_KEY = 'b6edb9db-f02e-4a8d-989b-4718f7090d76';
const LIVEPEER_WEBHOOK_SECRET = 'a'.repeat(64);
const LIVEPEER_JWT_PRIVATE_KEY = 'b'.repeat(128);
const LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN = 'c'.repeat(64);
const NEAR_OPERATOR_PRIVATE_KEY = `ed25519:${'1'.repeat(88)}`;
const CREATOR_FEE_QUOTE_PRIVATE_KEY = 'd'.repeat(88);
const NEAR_SPONSOR_RELAYER_PRIVATE_KEY = `ed25519:${'2'.repeat(88)}`;
const PREVIEW_SECRET_INPUTS = {
    livepeerApiKey: LIVEPEER_API_KEY,
    livepeerWebhookSecret: LIVEPEER_WEBHOOK_SECRET,
    livepeerJwtPrivateKey: LIVEPEER_JWT_PRIVATE_KEY,
    paidMediaOperatorToken: LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN,
    nearOperatorPrivateKey: NEAR_OPERATOR_PRIVATE_KEY,
    creatorFeeQuotePrivateKey: CREATOR_FEE_QUOTE_PRIVATE_KEY,
    nearSponsorRelayerPrivateKey: NEAR_SPONSOR_RELAYER_PRIVATE_KEY,
};
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
    'public-testnet': {
        web: { worker: 'youtick-web-public-testnet', domain: 'public-testnet.youtick.net' },
        bridge: { worker: 'youtick-livepeer-bridge-public-testnet', domain: 'bridge-public-testnet.youtick.net' },
    },
};
const READ_MODEL_WORKER = 'youtick-market-read-model-testnet';
const PREVIEW_READ_MODEL_ORIGIN = 'https://read-preview.youtick.net';

function transientWebPropagationError() {
    return new Error([
        'release_smoke_browser_errors',
        '/:console:Failed to load resource: the server responded with a status of 404 ()',
        '/:console:ChunkLoadError: Loading chunk 142 failed.',
        '(error: https://preview.youtick.net/_next/static/chunks/142-fixture.js)',
        '/tr:console:Loading the script https://static.cloudflareinsights.com/beacon.min.js violates the following Content Security Policy directive: "script-src \'self\' \'unsafe-inline\'".',
    ].join('\n'));
}

function transientAsset404Error() {
    return new Error([
        'release_smoke_browser_errors',
        '/:console:Failed to load resource: the server responded with a status of 404 ()',
    ].join('\n'));
}

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
            ...(target === 'public-testnet' ? { NEXT_PUBLIC_VIDEO_ENVIRONMENT: target, NEXT_PUBLIC_USDC_CONTRACT_ID: '' } : {}),
            NEXT_PUBLIC_NEAR_NETWORK: 'testnet',
            NEXT_PUBLIC_MARKET_CONTRACT_ID: target === 'public-testnet' ? 'public-video-market.testnet' : 'market.testnet',
            NEXT_PUBLIC_ACCESS_CONTRACT_ID: target === 'public-testnet' ? 'public-video-access.testnet' : 'access.testnet',
            NEXT_PUBLIC_APP_URL: `https://${expected.web.domain}`,
            NEXT_PUBLIC_LIVEPEER_BRIDGE_URL: `https://${expected.bridge.domain}`,
            NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1: 'false',
            NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE: 'false',
            NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS: 'false',
            NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2: 'false',
            NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2: 'false',
            NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL: 'false',
            NEXT_PUBLIC_MARKET_READ_MODEL_URL: '',
            NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE: 'off',
        },
        bridge: {
            ...(target === 'public-testnet' ? {
                VIDEO_ENVIRONMENT: target,
                LIVEPEER_QUEUE_NAME: 'youtick-livepeer-events-public-testnet',
                LIVEPEER_DLQ_NAME: 'youtick-livepeer-events-dlq-public-testnet',
                MARKET_READ_MODEL_DATABASE_NAME: 'youtick-market-read-model-public-testnet',
                MARKET_READ_MODEL_DATABASE_ID: 'a1111111-2222-3333-4444-555555555555',
                READ_MODEL_START_BLOCK_HEIGHT: '310000000',
            } : {}),
            ACCESS_CONTRACT_ID: target === 'public-testnet' ? 'public-video-access.testnet' : 'access.testnet',
            ALLOWED_ORIGINS: `https://${expected.web.domain}`,
            CREATOR_FEE_QUOTE_KEY_VERSION: '1',
            LIVEPEER_API_TOKEN_NAME: 'release-token',
            LIVEPEER_BRIDGE_ENABLED: 'false',
            LIVEPEER_NEW_UPLOADS_ENABLED: 'false',
            LIVEPEER_PLAYBACK_ISSUANCE_ENABLED: 'false',
            LIVEPEER_PLAYBACK_V2_ENABLED: 'false',
            LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED: 'false',
            LIVEPEER_WEBHOOK_QUEUE_ENABLED: 'false',
            LIVEPEER_PROVIDER_MUTATIONS_ENABLED: 'false',
            LIVEPEER_OPERATOR_MUTATIONS_ENABLED: 'false',
            LIVEPEER_OPERATOR_JOB_ID: '',
            UPLOAD_JOB_ARCHIVE_ENABLED: 'false',
            OPERATOR_OUTBOX_ARCHIVE_ENABLED: 'false',
            LIVEPEER_CREATOR_ALLOWLIST: '',
            LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS: '',
            LIVEPEER_JWT_ISSUER: `https://${expected.web.domain}`,
            LIVEPEER_JWT_PUBLIC_KEY: 'public-key',
            LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS: '',
            LIVEPEER_NEAR_CREATOR_FEE_ENABLED: 'false',
            LIVEPEER_SPONSORED_UPLOADS_ENABLED: 'false',
            LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED: 'false',
            LIVEPEER_PAID_MEDIA_OPERATOR_ID: 'operator.testnet',
            LIVEPEER_PROJECT_ID: 'project-id',
            MARKET_CONTRACT_ID: target === 'public-testnet' ? 'public-video-market.testnet' : 'market.testnet',
            NEAR_NETWORK: 'testnet',
            NEAR_OPERATOR_ACCOUNT_ID: 'bridge.testnet',
            NEAR_OPERATOR_KEY_EPOCH: '1',
            NEAR_SPONSOR_RELAYER_ACCOUNT_ID: '',
            NEAR_SPONSOR_RELAYER_KEY_EPOCH: '',
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
    const readModelRoot = join(root, 'read-model');
    mkdirSync(join(webRoot, '.open-next', 'assets'), { recursive: true });
    mkdirSync(bridgeRoot, { recursive: true });
    mkdirSync(readModelRoot, { recursive: true });
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
                ratelimits: [
                    { name: 'NEAR_RPC_READ_RATE_LIMITER', namespace_id: '1001', simple: { limit: 60, period: 60 } },
                    { name: 'NEAR_RPC_BROADCAST_RATE_LIMITER', namespace_id: '1002', simple: { limit: 10, period: 60 } },
                ],
                routes: [{ pattern: TARGETS.preview.web.domain, custom_domain: true }],
            },
            production: {
                name: TARGETS.production.web.worker,
                ratelimits: [
                    { name: 'NEAR_RPC_READ_RATE_LIMITER', namespace_id: '2001', simple: { limit: 60, period: 60 } },
                    { name: 'NEAR_RPC_BROADCAST_RATE_LIMITER', namespace_id: '2002', simple: { limit: 10, period: 60 } },
                ],
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
        'LIVEPEER_NEW_UPLOADS_ENABLED = "false"',
        'LIVEPEER_PLAYBACK_ISSUANCE_ENABLED = "false"',
        'LIVEPEER_PLAYBACK_V2_ENABLED = "false"',
        'LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED = "false"',
        'LIVEPEER_WEBHOOK_QUEUE_ENABLED = "false"',
        'LIVEPEER_PROVIDER_MUTATIONS_ENABLED = "false"',
        'LIVEPEER_OPERATOR_MUTATIONS_ENABLED = "false"',
        'LIVEPEER_OPERATOR_JOB_ID = ""',
        'UPLOAD_JOB_ARCHIVE_ENABLED = "false"',
        'OPERATOR_OUTBOX_ARCHIVE_ENABLED = "false"',
        'LIVEPEER_NEAR_CREATOR_FEE_ENABLED = "false"',
        'LIVEPEER_SPONSORED_UPLOADS_ENABLED = "false"',
        'LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED = "false"',
        'MULTI_ASSET_PAYMENTS_MODE = "off"',
        'MULTI_ASSET_PAYMENT_ASSET_IDS = ""',
        '',
        '[version_metadata]',
        'binding = "CF_VERSION_METADATA"',
        '',
        '[[ratelimits]]',
        'name = "PUBLIC_BETA_RATE_LIMITER"',
        'namespace_id = "3001"',
        'simple = { limit = 30, period = 60 }',
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
    writeFileSync(join(readModelRoot, 'worker.js'), 'export default { fetch() {} };\n');
    writeFileSync(join(readModelRoot, 'wrangler.toml'), [
        'name = "youtick-market-read-model-testnet"',
        'main = "worker.mjs"',
        'compatibility_date = "2026-08-10"',
        'compatibility_flags = ["nodejs_compat"]',
        'workers_dev = false',
        'preview_urls = false',
        '',
        '[triggers]',
        'crons = ["* * * * *"]',
        '',
        '[observability]',
        'enabled = true',
        'head_sampling_rate = 1',
        '',
        '[vars]',
        'READ_MODEL_ENABLED = "false"',
        'READ_MODEL_INGESTION_ENABLED = "false"',
        'READ_MODEL_BACKFILL_ENABLED = "false"',
        'READ_MODEL_BACKFILL_CONTINUE_ENABLED = "false"',
        'READ_MODEL_NETWORK = "testnet"',
        'READ_MODEL_CONTRACT_ID = "lp-arch-market-v2-260809.youtick-dev-v3.testnet"',
        'READ_MODEL_START_BLOCK_HEIGHT = "263118001"',
        'READ_MODEL_MAX_BLOCKS_PER_RUN = "180"',
        'READ_MODEL_WEB_ORIGIN = "https://preview.youtick.net"',
        '',
        '[[d1_databases]]',
        'binding = "MARKET_READ_MODEL"',
        'database_name = "youtick-market-read-model-v1-testnet"',
        'database_id = "50b1e14f-2b06-444b-98cf-b828f11277ef"',
        'migrations_dir = "d1"',
        '',
    ].join('\n'));

    mkdirSync(artifactDir, { recursive: true });
    const configName = `${target}-config.json`;
    const webName = `web-${target}.tar.gz`;
    const configPath = join(artifactDir, configName);
    const webPath = join(artifactDir, webName);
    const bridgePath = join(artifactDir, 'bridge.tar.gz');
    const readModelPath = join(artifactDir, 'read-model.tar.gz');
    writeFileSync(configPath, canonicalJson(makeConfig(target)));
    createTar(webRoot, webPath);
    createTar(bridgeRoot, bridgePath);
    createTar(readModelRoot, readModelPath);

    const emptyRecord = { path: 'unused', sha256: '0'.repeat(64), bytes: 1 };
    const manifest = {
        schemaVersion: 1,
        sha: SHA,
        ci: { runId: '1', runAttempt: '1' },
        targets: structuredClone(target === 'public-testnet' ? TARGETS : { preview: TARGETS.preview, production: TARGETS.production }),
        lockfiles: { web: emptyRecord, bridge: emptyRecord },
        configs: {
            ...(target === 'public-testnet' ? { 'public-testnet': record(configPath) } : {}),
            preview: target === 'preview' ? record(configPath) : emptyRecord,
            production: target === 'production' ? record(configPath) : emptyRecord,
        },
        bundles: {
            ...(target === 'public-testnet' ? { webPublicTestnet: record(webPath) } : {}),
            webPreview: target === 'preview' ? record(webPath) : emptyRecord,
            webProduction: target === 'production' ? record(webPath) : emptyRecord,
            bridge: record(bridgePath),
            readModel: record(readModelPath),
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
        readModelRoot,
        readModelPath,
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
  const oneClickHash = crypto.scryptSync(
    parsed.ONECLICK_API_KEY || '',
    'youtick-release-test-v1',
    32,
  ).toString('hex');
  const previewKeys = process.env.FAKE_PREVIEW_CREDENTIALS === 'true'
    ? [
      'LIVEPEER_API_KEY',
      'LIVEPEER_WEBHOOK_SECRET',
      'LIVEPEER_JWT_PRIVATE_KEY',
      'LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN',
      'NEAR_OPERATOR_PRIVATE_KEY',
    ]
    : [];
  if (process.env.FAKE_PREVIEW_SPONSOR_CREDENTIALS === 'true') {
    previewKeys.push('CREATOR_FEE_QUOTE_PRIVATE_KEY', 'NEAR_SPONSOR_RELAYER_PRIVATE_KEY');
  }
  const expectedKeys = [
    'NEAR_RPC_URL',
    ...(process.env.FAKE_ONECLICK_API_KEY_SCRYPT ? ['ONECLICK_API_KEY'] : []),
    ...previewKeys,
  ];
  if (mode !== 0o600 || JSON.stringify(keys) !== JSON.stringify(expectedKeys)
      || hash !== process.env.FAKE_NEAR_RPC_SHA256
      || (process.env.FAKE_ONECLICK_API_KEY_SCRYPT
        && oneClickHash !== process.env.FAKE_ONECLICK_API_KEY_SCRYPT)
      || (process.env.FAKE_PREVIEW_CREDENTIALS === 'true'
        && (parsed.LIVEPEER_API_KEY !== process.env.FAKE_LIVEPEER_API_KEY
          || parsed.LIVEPEER_WEBHOOK_SECRET !== process.env.FAKE_LIVEPEER_WEBHOOK_SECRET
          || parsed.LIVEPEER_JWT_PRIVATE_KEY !== process.env.FAKE_LIVEPEER_JWT_PRIVATE_KEY
          || parsed.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN
            !== process.env.FAKE_LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN
          || parsed.NEAR_OPERATOR_PRIVATE_KEY !== process.env.FAKE_NEAR_OPERATOR_PRIVATE_KEY))
      || (process.env.FAKE_PREVIEW_SPONSOR_CREDENTIALS === 'true'
        && (parsed.CREATOR_FEE_QUOTE_PRIVATE_KEY
          !== process.env.FAKE_CREATOR_FEE_QUOTE_PRIVATE_KEY
          || parsed.NEAR_SPONSOR_RELAYER_PRIVATE_KEY
            !== process.env.FAKE_NEAR_SPONSOR_RELAYER_PRIVATE_KEY))
      || process.env.NEAR_RPC_URL || process.env.ONECLICK_API_KEY
      || process.env.LIVEPEER_API_KEY || process.env.LIVEPEER_WEBHOOK_SECRET
      || process.env.LIVEPEER_JWT_PRIVATE_KEY
      || process.env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN
      || process.env.NEAR_OPERATOR_PRIVATE_KEY
      || process.env.CREATOR_FEE_QUOTE_PRIVATE_KEY
      || process.env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY) {
    throw new Error('invalid fake Wrangler secret contract');
  }
  fs.appendFileSync(process.env.FAKE_WRANGLER_SECRET_LOG, JSON.stringify({
    command: args.slice(0, 2), worker: args[args.indexOf('--name') + 1], mode, keys,
  }) + '\n');
}
const value = (flag) => args[args.indexOf(flag) + 1];
const worker = value('--name');
const configText = () => fs.readFileSync(value('--config'), 'utf8');
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
  if (state.staleTraffic?.[worker]?.remaining > 0) {
    const stale = state.staleTraffic[worker];
    stale.remaining -= 1;
    save();
    process.stdout.write(JSON.stringify({ versions: stale.traffic }));
    process.exit(0);
  }
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
  const text = configText();
  if (worker === 'youtick-market-read-model-public-testnet') {
    const config = JSON.parse(text);
    if (config.vars.READ_MODEL_CONTRACT_ID !== 'public-video-market.testnet'
        || config.vars.MARKET_CONTRACT_ID !== config.vars.READ_MODEL_CONTRACT_ID
        || config.vars.READ_MODEL_START_BLOCK_HEIGHT !== '310000000'
        || config.vars.READ_MODEL_INGESTION_ENABLED !== String(state.publicMode && state.publicMode !== 'closed' || false) || config.vars.READ_MODEL_ENABLED !== String(state.publicMode && state.publicMode !== 'closed' || false)
        || config.triggers.crons.join() !== '* * * * *'
        || config.d1_databases[0].database_id !== 'a1111111-2222-3333-4444-555555555555'
        || text.includes('50b1e14f-2b06-444b-98cf-b828f11277ef') || config.workers_dev !== false) {
      throw new Error('public read model binding mismatch');
    }
  }
  if (worker === 'youtick-livepeer-bridge-public-testnet'
      && (!text.includes('queue = "youtick-livepeer-events-public-testnet"')
        || !text.includes('database_id = "a1111111-2222-3333-4444-555555555555"')
        || !text.includes('namespace_id = "5003"')
        || !text.includes('LIVEPEER_WEBHOOK_QUEUE_BATCH_SIZE = "10"')
        || !text.includes('LIVEPEER_WEBHOOK_QUEUE_BATCH_TIMEOUT_SECONDS = "5"')
        || !text.includes('LIVEPEER_WEBHOOK_QUEUE_MAX_RETRIES = "3"')
        || !text.includes('LIVEPEER_WEBHOOK_QUEUE_MAX_CONCURRENCY = "1"')
        || !text.includes('LIVEPEER_WEBHOOK_QUEUE_RETENTION_SECONDS = "86400"')
        || !text.includes('LIVEPEER_WEBHOOK_QUEUE_DLQ = "youtick-livepeer-events-dlq-public-testnet"')
        || text.includes('50b1e14f-2b06-444b-98cf-b828f11277ef')
        || text.includes('queues.consumers'))) {
    throw new Error('public testnet resource binding mismatch');
  }
  if (worker === 'youtick-livepeer-bridge-preview'
      && (!text.includes('[[queues.producers]]')
        || !text.includes('binding = "LIVEPEER_EVENTS"')
        || !text.includes('[[d1_databases]]')
        || !text.includes('binding = "MARKET_READ_MODEL"')
        || !text.includes('database_name = "youtick-market-read-model-v1-testnet"')
        || !text.includes('database_id = "50b1e14f-2b06-444b-98cf-b828f11277ef"')
        || (text.match(/binding = "MARKET_READ_MODEL"/g) || []).length !== 1
        || text.includes('queues.consumers'))) {
    throw new Error('invalid preview Bridge candidate binding config');
  }
  if (worker === 'youtick-livepeer-bridge'
      && (text.includes('queues.') || text.includes('binding = "MARKET_READ_MODEL"'))) {
    throw new Error('production Bridge must not bind Preview testnet resources');
  }
  if (worker === 'youtick-market-read-model-testnet'
      && (!text.includes('workers_dev = false')
        || !text.includes('READ_MODEL_ENABLED = "false"')
        || !text.includes('READ_MODEL_INGESTION_ENABLED = "false"')
        || !text.includes('READ_MODEL_BACKFILL_ENABLED = "false"')
        || !text.includes('READ_MODEL_BACKFILL_CONTINUE_ENABLED = "false"')
        || !text.includes('binding = "MARKET_READ_MODEL"')
        || !text.includes('[triggers]\ncrons = ["* * * * *"]')
        || !text.includes('[observability]\nenabled = true\nhead_sampling_rate = 1')
        || /\bqueues\b/.test(text))) {
    throw new Error('invalid dark read model config');
  }
  const id = worker.includes('web')
    ? 'web-new'
    : worker.startsWith('youtick-market-read-model-') ? 'read-model-new' : 'bridge-new';
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
  const text = configText();
  if (worker.includes('livepeer-bridge') && text.includes('queues.')) {
    throw new Error('Bridge bootstrap must not attach Queue bindings');
  }
  if (worker === 'youtick-market-read-model-testnet'
      && (!text.includes('workers_dev = false')
        || !text.includes('preview_urls = false')
        || !text.includes('READ_MODEL_BACKFILL_ENABLED = "false"')
        || !text.includes('READ_MODEL_BACKFILL_CONTINUE_ENABLED = "false"')
        || !text.includes('[triggers]\ncrons = ["* * * * *"]')
        || !text.includes('[observability]\nenabled = true\nhead_sampling_rate = 1')
        || /\bqueues\b/.test(text))) {
    throw new Error('read model bootstrap is not dark');
  }
  const id = worker.includes('web')
    ? 'web-bootstrap'
    : worker === 'youtick-market-read-model-testnet' ? 'read-model-bootstrap' : 'bridge-bootstrap';
  state.noDeployments = state.noDeployments?.filter((name) => name !== worker);
  state.workers[worker] = { traffic: [{ version_id: id, percentage: 100 }] };
  save();
  output({
    type: 'deploy',
    version: 1,
    worker_name: worker,
    version_id: id,
    targets: worker === 'youtick-market-read-model-testnet'
      ? []
      : ['https://' + worker + '.account.workers.dev'],
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
  if (state.staleAfterDeploy?.[worker] && traffic.length === 1) {
    state.staleTraffic ??= {};
    state.staleTraffic[worker] = { traffic: state.workers[worker].traffic, remaining: state.staleAfterDeploy[worker] };
  }
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
                .find((entry) => entry.worker === worker)
                ?? (worker === PUBLIC_TESTNET_READ_MODEL.worker ? PUBLIC_TESTNET_READ_MODEL : null);
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
        if (url.pathname === `/client/v4/accounts/${ACCOUNT_ID}/queues` && method === 'GET') {
            const name = url.searchParams.get('name');
            return response(200, { success: true, result: [{ queue_name: name,
                queue_id: name.includes('dlq') ? '5'.repeat(32) : '4'.repeat(32) }] });
        }
        if (url.pathname === `/client/v4/accounts/${ACCOUNT_ID}/queues/${'4'.repeat(32)}/consumers` && method === 'GET') {
            return response(200, { success: true, result: current.queueConsumers ?? (current.queueMissing ? [] : [{ type: 'worker',
                script_name: TARGETS['public-testnet'].bridge.worker, dead_letter_queue: 'youtick-livepeer-events-dlq-public-testnet',
                settings: { batch_size: 10, max_concurrency: 1, max_retries: 3, max_wait_time_ms: 5000 } }]) });
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

async function withFakeEnvironment(
    fake,
    callback,
    { oneClickApiKey = null, previewCredentials = false, sponsorCredentials = false } = {},
) {
    const previousState = process.env.FAKE_WRANGLER_STATE;
    const previousLog = process.env.FAKE_WRANGLER_LOG;
    const previousSecretLog = process.env.FAKE_WRANGLER_SECRET_LOG;
    const previousNearRpcHash = process.env.FAKE_NEAR_RPC_SHA256;
    const previousOneClickHash = process.env.FAKE_ONECLICK_API_KEY_SCRYPT;
    const previousNearRpcUrl = process.env.NEAR_RPC_URL;
    const previousOneClickApiKey = process.env.ONECLICK_API_KEY;
    const previousPreviewCredentials = process.env.FAKE_PREVIEW_CREDENTIALS;
    const previousLivepeerApiKey = process.env.LIVEPEER_API_KEY;
    const previousLivepeerWebhookSecret = process.env.LIVEPEER_WEBHOOK_SECRET;
    const previousLivepeerJwtPrivateKey = process.env.LIVEPEER_JWT_PRIVATE_KEY;
    const previousPaidMediaOperatorToken = process.env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN;
    const previousNearOperatorPrivateKey = process.env.NEAR_OPERATOR_PRIVATE_KEY;
    const previousCreatorFeeQuotePrivateKey = process.env.CREATOR_FEE_QUOTE_PRIVATE_KEY;
    const previousNearSponsorRelayerPrivateKey = process.env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY;
    process.env.FAKE_WRANGLER_STATE = fake.statePath;
    process.env.FAKE_WRANGLER_LOG = fake.logPath;
    process.env.FAKE_WRANGLER_SECRET_LOG = fake.secretLogPath;
    process.env.FAKE_NEAR_RPC_SHA256 = NEAR_RPC_SHA256;
    process.env.NEAR_RPC_URL = NEAR_RPC_URL;
    if (oneClickApiKey) {
        process.env.FAKE_ONECLICK_API_KEY_SCRYPT = scryptSync(
            oneClickApiKey,
            ONECLICK_API_KEY_SCRYPT_SALT,
            32,
        ).toString('hex');
    } else {
        delete process.env.FAKE_ONECLICK_API_KEY_SCRYPT;
    }
    delete process.env.ONECLICK_API_KEY;
    if (previewCredentials) {
        process.env.FAKE_PREVIEW_CREDENTIALS = 'true';
        process.env.FAKE_LIVEPEER_API_KEY = LIVEPEER_API_KEY;
        process.env.FAKE_LIVEPEER_WEBHOOK_SECRET = LIVEPEER_WEBHOOK_SECRET;
        process.env.FAKE_LIVEPEER_JWT_PRIVATE_KEY = LIVEPEER_JWT_PRIVATE_KEY;
        process.env.FAKE_LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN = LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN;
        process.env.FAKE_NEAR_OPERATOR_PRIVATE_KEY = NEAR_OPERATOR_PRIVATE_KEY;
        process.env.LIVEPEER_API_KEY = LIVEPEER_API_KEY;
        process.env.LIVEPEER_WEBHOOK_SECRET = LIVEPEER_WEBHOOK_SECRET;
        process.env.LIVEPEER_JWT_PRIVATE_KEY = LIVEPEER_JWT_PRIVATE_KEY;
        process.env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN = LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN;
        process.env.NEAR_OPERATOR_PRIVATE_KEY = NEAR_OPERATOR_PRIVATE_KEY;
    } else {
        delete process.env.FAKE_PREVIEW_CREDENTIALS;
    }
    if (sponsorCredentials) {
        process.env.FAKE_PREVIEW_SPONSOR_CREDENTIALS = 'true';
        process.env.FAKE_CREATOR_FEE_QUOTE_PRIVATE_KEY = CREATOR_FEE_QUOTE_PRIVATE_KEY;
        process.env.FAKE_NEAR_SPONSOR_RELAYER_PRIVATE_KEY = NEAR_SPONSOR_RELAYER_PRIVATE_KEY;
        process.env.CREATOR_FEE_QUOTE_PRIVATE_KEY = CREATOR_FEE_QUOTE_PRIVATE_KEY;
        process.env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY = NEAR_SPONSOR_RELAYER_PRIVATE_KEY;
    } else {
        delete process.env.FAKE_PREVIEW_SPONSOR_CREDENTIALS;
    }
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
        if (previousOneClickHash === undefined) delete process.env.FAKE_ONECLICK_API_KEY_SCRYPT;
        else process.env.FAKE_ONECLICK_API_KEY_SCRYPT = previousOneClickHash;
        if (previousNearRpcUrl === undefined) delete process.env.NEAR_RPC_URL;
        else process.env.NEAR_RPC_URL = previousNearRpcUrl;
        if (previousOneClickApiKey === undefined) delete process.env.ONECLICK_API_KEY;
        else process.env.ONECLICK_API_KEY = previousOneClickApiKey;
        if (previousPreviewCredentials === undefined) delete process.env.FAKE_PREVIEW_CREDENTIALS;
        else process.env.FAKE_PREVIEW_CREDENTIALS = previousPreviewCredentials;
        delete process.env.FAKE_LIVEPEER_API_KEY;
        delete process.env.FAKE_LIVEPEER_WEBHOOK_SECRET;
        delete process.env.FAKE_LIVEPEER_JWT_PRIVATE_KEY;
        delete process.env.FAKE_LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN;
        delete process.env.FAKE_NEAR_OPERATOR_PRIVATE_KEY;
        delete process.env.FAKE_PREVIEW_SPONSOR_CREDENTIALS;
        delete process.env.FAKE_CREATOR_FEE_QUOTE_PRIVATE_KEY;
        delete process.env.FAKE_NEAR_SPONSOR_RELAYER_PRIVATE_KEY;
        if (previousLivepeerApiKey === undefined) delete process.env.LIVEPEER_API_KEY;
        else process.env.LIVEPEER_API_KEY = previousLivepeerApiKey;
        if (previousLivepeerWebhookSecret === undefined) delete process.env.LIVEPEER_WEBHOOK_SECRET;
        else process.env.LIVEPEER_WEBHOOK_SECRET = previousLivepeerWebhookSecret;
        if (previousLivepeerJwtPrivateKey === undefined) delete process.env.LIVEPEER_JWT_PRIVATE_KEY;
        else process.env.LIVEPEER_JWT_PRIVATE_KEY = previousLivepeerJwtPrivateKey;
        if (previousPaidMediaOperatorToken === undefined) {
            delete process.env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN;
        } else {
            process.env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN = previousPaidMediaOperatorToken;
        }
        if (previousNearOperatorPrivateKey === undefined) delete process.env.NEAR_OPERATOR_PRIVATE_KEY;
        else process.env.NEAR_OPERATOR_PRIVATE_KEY = previousNearOperatorPrivateKey;
        if (previousCreatorFeeQuotePrivateKey === undefined) {
            delete process.env.CREATOR_FEE_QUOTE_PRIVATE_KEY;
        } else process.env.CREATOR_FEE_QUOTE_PRIVATE_KEY = previousCreatorFeeQuotePrivateKey;
        if (previousNearSponsorRelayerPrivateKey === undefined) {
            delete process.env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY;
        } else process.env.NEAR_SPONSOR_RELAYER_PRIVATE_KEY = previousNearSponsorRelayerPrivateKey;
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
        nearRpcUrl = NEAR_RPC_URL, oneClickApiKey = target === 'public-testnet' ? null : ONECLICK_API_KEY,
        livepeerApiKey = target !== 'production' ? LIVEPEER_API_KEY : undefined,
        livepeerWebhookSecret = target !== 'production' ? LIVEPEER_WEBHOOK_SECRET : undefined,
        livepeerJwtPrivateKey = target !== 'production' ? LIVEPEER_JWT_PRIVATE_KEY : undefined,
        paidMediaOperatorToken = target !== 'production'
            ? LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN
            : undefined,
        nearOperatorPrivateKey = target !== 'production' ? NEAR_OPERATOR_PRIVATE_KEY : undefined,
        creatorFeeQuotePrivateKey = target !== 'production'
            ? CREATOR_FEE_QUOTE_PRIVATE_KEY
            : undefined,
        nearSponsorRelayerPrivateKey = target !== 'production'
            ? NEAR_SPONSOR_RELAYER_PRIVATE_KEY
            : undefined,
        sleepFn,
    } = {},
) {
    return withFakeEnvironment(fake, () => deployRelease({
        target,
        sha: SHA,
        artifactDir: release.artifactDir,
        receiptOutput: release.receipt,
        repoRoot: release.root,
        wranglerPaths: { web: fake.binary, bridge: fake.binary, readModel: fake.binary },
        smokeFn,
        echoWrangler: false,
        rollbackTest,
        cloudflareFetch: fake.apiFetch,
        cloudflareAccountId: ACCOUNT_ID,
        cloudflareApiToken: API_TOKEN,
        cloudflareZoneId: zoneId,
        nearRpcUrl,
        oneClickApiKey,
        livepeerApiKey,
        livepeerWebhookSecret,
        livepeerJwtPrivateKey,
        paidMediaOperatorToken,
        nearOperatorPrivateKey,
        creatorFeeQuotePrivateKey,
        nearSponsorRelayerPrivateKey,
        sleepFn,
    }), {
        oneClickApiKey,
        previewCredentials: target !== 'production',
        sponsorCredentials: target !== 'production'
            && (JSON.parse(readFileSync(release.configPath, 'utf8')).bridge.LIVEPEER_SPONSORED_UPLOADS_ENABLED === 'true'
                || (target === 'public-testnet' && JSON.parse(readFileSync(release.configPath, 'utf8')).bridge.LIVEPEER_OPERATOR_MUTATIONS_ENABLED === 'true')),
    });
}

test('Bridge artifact writer emits the exact disabled release config once', async (t) => {
    const root = mkdtempSync(join(tmpdir(), 'bridge-artifact-wrangler-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const output = join(root, 'wrangler.toml');

    await writeBridgeArtifactWrangler(output);

    const text = readFileSync(output, 'utf8');
    assert.match(text, /MULTI_ASSET_PAYMENTS_MODE = "off"/);
    assert.match(text, /LIVEPEER_NEW_UPLOADS_ENABLED = "false"/);
    assert.match(text, /LIVEPEER_PLAYBACK_ISSUANCE_ENABLED = "false"/);
    assert.match(text, /LIVEPEER_PLAYBACK_V2_ENABLED = "false"/);
    assert.match(text, /LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED = "false"/);
    assert.match(text, /LIVEPEER_WEBHOOK_QUEUE_ENABLED = "false"/);
    assert.match(text, /LIVEPEER_PROVIDER_MUTATIONS_ENABLED = "false"/);
    assert.match(text, /LIVEPEER_OPERATOR_MUTATIONS_ENABLED = "false"/);
    assert.match(text, /LIVEPEER_OPERATOR_JOB_ID = ""/);
    assert.match(text, /name = "PUBLIC_BETA_RATE_LIMITER"[\s\S]*limit = 30, period = 60/);
    assert.match(text, /MULTI_ASSET_PAYMENT_ASSET_IDS = ""/);
    assert.doesNotMatch(text, /NEAR_RPC_URL|ALLOWED_ORIGINS|MARKET_CONTRACT_ID/);
    assert.doesNotMatch(text, /queues\.producers|queues\.consumers|LIVEPEER_EVENTS|MARKET_READ_MODEL/);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    await assert.rejects(writeBridgeArtifactWrangler(output), /EEXIST/);
});

test('read-model artifact writer emits one route-free finality-probe-only config', async (t) => {
    const root = mkdtempSync(join(tmpdir(), 'read-model-artifact-wrangler-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const output = join(root, 'wrangler.toml');

    await writeReadModelArtifactWrangler(output);

    const text = readFileSync(output, 'utf8');
    assert.match(text, /name = "youtick-market-read-model-testnet"/);
    assert.match(text, /workers_dev = false/);
    assert.match(text, /preview_urls = false/);
    assert.match(text, /\[triggers\]\ncrons = \["\* \* \* \* \*"\]/);
    assert.match(text, /\[observability\]\nenabled = true\nhead_sampling_rate = 1/);
    assert.match(text, /READ_MODEL_ENABLED = "false"/);
    assert.match(text, /READ_MODEL_INGESTION_ENABLED = "false"/);
    assert.match(text, /READ_MODEL_BACKFILL_ENABLED = "false"/);
    assert.match(text, /READ_MODEL_BACKFILL_CONTINUE_ENABLED = "false"/);
    assert.match(text, /binding = "MARKET_READ_MODEL"/);
    assert.doesNotMatch(text, /\bqueues\b|READ_MODEL_NEAR_RPC_URL/);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    await assert.rejects(writeReadModelArtifactWrangler(output), /EEXIST/);
});

test('public-testnet uses isolated closed Workers and never touches beta read-model resources', async (t) => {
    const target = 'public-testnet';
    const release = makeRelease(t, target);
    const fake = makeFakeWrangler(release, {
        workers: {
            [TARGETS[target].web.worker]: { traffic: [{ version_id: 'web-old', percentage: 100 }] },
            [TARGETS[target].bridge.worker]: { traffic: [{ version_id: 'bridge-old', percentage: 100 }] },
        },
        uploadFailures: {},
    });
    const receipt = await deployFixture(release, fake, async () => ({ ok: true }), { target });
    assert.equal(receipt.environment, target);
    assert.equal(receipt.web.worker, TARGETS[target].web.worker);
    assert.equal(receipt.bridge.worker, TARGETS[target].bridge.worker);
    assert.equal(receipt.readModel.worker, 'youtick-market-read-model-public-testnet');
    assert.equal(calls(fake).some((args) => args.includes(READ_MODEL_WORKER)), false);
    assert.equal(calls(fake).some((args) => args.includes('--env')), false);
    assert.ok(calls(fake).some((args) => args.includes('VIDEO_ENVIRONMENT:public-testnet')));
    assert.ok(calls(fake).some((args) => args.includes('LIVEPEER_BRIDGE_ENABLED:false')));
    assert.equal(JSON.stringify(secretCalls(fake)).includes('ONECLICK_API_KEY'), false);
});

test('Preview release keeps the Queue consumer detached and bootstraps the dark read model', async (t) => {
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

    const receipt = await deployFixture(release, fake);

    assert.deepEqual(receipt.readModel, {
        worker: READ_MODEL_WORKER,
        previousVersionId: 'read-model-bootstrap',
        versionId: 'read-model-new',
        bootstrap: true,
    });
    assert.equal(calls(fake).some((args) => args[0] === 'triggers'), false);
    const readModelCalls = calls(fake).filter((args) => args.includes(READ_MODEL_WORKER));
    assert.ok(readModelCalls.some((args) => args[0] === 'deploy'));
    assert.ok(readModelCalls.every((args) => !args.includes('--env')));
});

test('Preview recovery replaces zero-percent residue from a failed candidate', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, {
        workers: {
            [TARGETS.preview.web.worker]: {
                traffic: [{ version_id: 'web-old', percentage: 100 }],
            },
            [TARGETS.preview.bridge.worker]: {
                traffic: [
                    { version_id: 'bridge-old', percentage: 100 },
                    { version_id: 'bridge-residue', percentage: 0 },
                ],
            },
            [READ_MODEL_WORKER]: {
                traffic: [
                    { version_id: 'read-model-old', percentage: 100 },
                    { version_id: 'read-model-residue', percentage: 0 },
                ],
            },
        },
        uploadFailures: {},
    });

    const receipt = await deployFixture(release, fake);
    assert.equal(receipt.bridge.previousVersionId, 'bridge-old');
    assert.equal(receipt.readModel.previousVersionId, 'read-model-old');
    const state = JSON.parse(readFileSync(fake.statePath, 'utf8'));
    assert.deepEqual(state.workers[TARGETS.preview.bridge.worker].traffic, [
        { version_id: 'bridge-new', percentage: 100 },
    ]);
    assert.deepEqual(state.workers[READ_MODEL_WORKER].traffic, [
        { version_id: 'read-model-new', percentage: 100 },
    ]);
});

test('candidate smoke failure leaves zero-percent staging without a rollback deploy', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, {
        workers: {
            [TARGETS.preview.web.worker]: {
                traffic: [{ version_id: 'web-old', percentage: 100 }],
            },
            [TARGETS.preview.bridge.worker]: {
                traffic: [{ version_id: 'bridge-old', percentage: 100 }],
            },
            [READ_MODEL_WORKER]: {
                traffic: [{ version_id: 'read-model-old', percentage: 100 }],
            },
        },
        uploadFailures: {},
    });
    let smokeCalls = 0;
    await assert.rejects(deployFixture(release, fake, async () => {
        smokeCalls += 1;
        if (smokeCalls === 2) throw new Error('candidate smoke failed');
        return { ok: true };
    }), /candidate smoke failed/);

    const deployments = calls(fake)
        .filter((args) => args[0] === 'versions' && args[1] === 'deploy')
        .map((args) => args.filter((entry) => /^[A-Za-z0-9-]+@[0-9]+$/.test(entry)));
    assert.deepEqual(deployments, [
        ['read-model-old@100', 'read-model-new@0'],
        ['bridge-old@100', 'bridge-new@0'],
    ]);
    const state = JSON.parse(readFileSync(fake.statePath, 'utf8'));
    assert.deepEqual(state.workers[TARGETS.preview.web.worker].traffic, [
        { version_id: 'web-old', percentage: 100 },
    ]);
    assert.deepEqual(state.workers[TARGETS.preview.bridge.worker].traffic, [
        { version_id: 'bridge-old', percentage: 100 },
        { version_id: 'bridge-new', percentage: 0 },
    ]);
    assert.deepEqual(state.workers[READ_MODEL_WORKER].traffic, [
        { version_id: 'read-model-old', percentage: 100 },
        { version_id: 'read-model-new', percentage: 0 },
    ]);
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
            assert.ok(bootstrap.includes('LIVEPEER_NEW_UPLOADS_ENABLED:false'));
            assert.ok(bootstrap.includes('LIVEPEER_PLAYBACK_ISSUANCE_ENABLED:false'));
            assert.ok(bootstrap.includes('LIVEPEER_PROVIDER_MUTATIONS_ENABLED:false'));
            assert.ok(bootstrap.includes('LIVEPEER_OPERATOR_MUTATIONS_ENABLED:false'));
            assert.ok(bootstrap.includes('LIVEPEER_NEAR_CREATOR_FEE_ENABLED:false'));
            assert.ok(bootstrap.includes('LIVEPEER_SPONSORED_UPLOADS_ENABLED:false'));
            assert.ok(bootstrap.includes('LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED:false'));
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
        playbackV2: input.includePlaybackV2,
    })), [
        { expected: 'bridge-bootstrap', override: undefined, bootstrap: true, playbackV2: false },
        { expected: 'bridge-new', override: 'bridge-new', bootstrap: undefined, playbackV2: undefined },
        { expected: 'bridge-new', override: undefined, bootstrap: undefined, playbackV2: undefined },
    ]);
    assert.deepEqual(smokeInputs.map((input) => input.includeProviderAssetDelete), [
        false, undefined, undefined,
    ]);
    assert.equal(receipt.web.previousVersionId, 'web-bootstrap');
    assert.equal(receipt.bridge.previousVersionId, 'bridge-bootstrap');

    const deploys = calls(fake).filter((args) => args[0] === 'deploy');
    assert.equal(deploys.length, 3);
    const bridgeDeploy = deploys.find((args) => args.includes(TARGETS.preview.bridge.worker));
    assert.ok(deploys.every((args) => !args.includes('--domain')));
    assert.ok(deploys.filter((args) => !args.includes(READ_MODEL_WORKER))
        .every((args) => args.at(args.indexOf('--config') + 1).includes('bootstrap')));
    assert.ok(bridgeDeploy.includes('LIVEPEER_BRIDGE_ENABLED:false'));
    assert.ok(bridgeDeploy.includes('LIVEPEER_NEW_UPLOADS_ENABLED:false'));
    assert.ok(bridgeDeploy.includes('LIVEPEER_PLAYBACK_ISSUANCE_ENABLED:false'));
    assert.ok(bridgeDeploy.includes('LIVEPEER_PROVIDER_MUTATIONS_ENABLED:false'));
    assert.ok(bridgeDeploy.includes('LIVEPEER_OPERATOR_MUTATIONS_ENABLED:false'));
    assert.ok(bridgeDeploy.includes('LIVEPEER_NEAR_CREATOR_FEE_ENABLED:false'));
    assert.ok(bridgeDeploy.includes('LIVEPEER_SPONSORED_UPLOADS_ENABLED:false'));
    assert.ok(bridgeDeploy.includes('LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED:false'));
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
        keys: [
            'NEAR_RPC_URL',
            'ONECLICK_API_KEY',
            'LIVEPEER_API_KEY',
            'LIVEPEER_WEBHOOK_SECRET',
            'LIVEPEER_JWT_PRIVATE_KEY',
            'LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN',
            'NEAR_OPERATOR_PRIVATE_KEY',
        ],
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
        assert.ok(!readFileSync(path, 'utf8').includes(NEAR_RPC_SECRET));
        assert.ok(!readFileSync(path, 'utf8').includes(LIVEPEER_JWT_PRIVATE_KEY));
        assert.ok(!readFileSync(path, 'utf8').includes(LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN));
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
            JSON.stringify(call.keys) === JSON.stringify([
                'NEAR_RPC_URL',
                'ONECLICK_API_KEY',
                'LIVEPEER_API_KEY',
                'LIVEPEER_WEBHOOK_SECRET',
                'LIVEPEER_JWT_PRIVATE_KEY',
                'LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN',
                'NEAR_OPERATOR_PRIVATE_KEY',
            ])
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

test('Preview JWT private key is required before mutation', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, { workers: {}, uploadFailures: {} });

    await assert.rejects(
        deployFixture(release, fake, undefined, { livepeerJwtPrivateKey: null }),
        /cloudflare_release_livepeer_jwt_private_key_invalid/,
    );
    assert.deepEqual(fake.apiCalls, []);
    assert.deepEqual(calls(fake), []);
    assert.deepEqual(secretCalls(fake), []);
});

test('Preview paid-media operator token is required before mutation', async (t) => {
    const release = makeRelease(t);
    const fake = makeFakeWrangler(release, { workers: {}, uploadFailures: {} });

    await assert.rejects(
        deployFixture(release, fake, undefined, { paidMediaOperatorToken: null }),
        /cloudflare_release_paid_media_operator_token_invalid/,
    );
    assert.deepEqual(fake.apiCalls, []);
    assert.deepEqual(calls(fake), []);
    assert.deepEqual(secretCalls(fake), []);
});

test('target allowlist and guarded release flags are fail closed', async (t) => {
    await t.test('rejects a forbidden manifest target', async (subtest) => {
        const release = makeRelease(subtest);
        release.manifest.targets.preview.bridge.worker = 'youtick-livepeer-bridge-c3-4ea2011';
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        await assert.rejects(deployRelease({
            target: 'preview', sha: SHA, artifactDir: release.artifactDir, receiptOutput: release.receipt,
            nearRpcUrl: NEAR_RPC_URL, oneClickApiKey: ONECLICK_API_KEY, ...PREVIEW_SECRET_INPUTS,
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
            nearRpcUrl: NEAR_RPC_URL, oneClickApiKey: ONECLICK_API_KEY, ...PREVIEW_SECRET_INPUTS,
        }), /preview_livepeer_canary_flags_invalid/);
    });

    await t.test('rejects a standalone Preview operator mutation flag', async (subtest) => {
        const release = makeRelease(subtest);
        const config = JSON.parse(readFileSync(release.configPath, 'utf8'));
        config.bridge.LIVEPEER_OPERATOR_MUTATIONS_ENABLED = 'true';
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.preview = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        await assert.rejects(deployRelease({
            target: 'preview', sha: SHA, artifactDir: release.artifactDir, receiptOutput: release.receipt,
            nearRpcUrl: NEAR_RPC_URL, oneClickApiKey: ONECLICK_API_KEY, ...PREVIEW_SECRET_INPUTS,
        }), /preview_sponsor_canary_flags_invalid/);
    });

    await t.test('accepts the complete Preview multi-creator upload canary packet', async (subtest) => {
        const release = makeRelease(subtest);
        const config = JSON.parse(readFileSync(release.configPath, 'utf8'));
        config.web.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = 'true';
        config.bridge.LIVEPEER_BRIDGE_ENABLED = 'true';
        config.bridge.LIVEPEER_NEW_UPLOADS_ENABLED = 'true';
        config.bridge.LIVEPEER_PROVIDER_MUTATIONS_ENABLED = 'true';
        config.bridge.LIVEPEER_CREATOR_ALLOWLIST = 'creator-one.testnet,creator-two.testnet';
        config.bridge.LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS = '20000000';
        config.bridge.LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS = '2000000';
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.preview = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        const fake = makeFakeWrangler(release, { workers: {}, uploadFailures: {} });
        const smokeInputs = [];

        await deployFixture(release, fake, async (input) => {
            smokeInputs.push(input);
            return { ok: true };
        });

        assert.deepEqual(smokeInputs.map((input) => ({
            bridge: input.expectedBridgeEnabled,
            sponsored: input.expectedSponsoredUploadReady,
        })), [
            { bridge: null, sponsored: null },
            { bridge: true, sponsored: false },
            { bridge: true, sponsored: false },
        ]);

        const bridgeCommands = calls(fake).filter((args) => (
            args.includes(TARGETS.preview.bridge.worker)
            && (args[0] === 'deploy' || (args[0] === 'versions' && args[1] === 'upload'))
        ));
        assert.equal(bridgeCommands.length, 2);
        assert.ok(bridgeCommands.every((args) => (
            args.includes('LIVEPEER_BRIDGE_ENABLED:true')
            && args.includes('LIVEPEER_NEW_UPLOADS_ENABLED:true')
            && args.includes('LIVEPEER_PROVIDER_MUTATIONS_ENABLED:true')
            && args.includes('LIVEPEER_OPERATOR_MUTATIONS_ENABLED:false')
        )));
    });

    await t.test('accepts the complete Preview playback-only canary packet', async (subtest) => {
        const release = makeRelease(subtest);
        const config = JSON.parse(readFileSync(release.configPath, 'utf8'));
        config.web.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = 'true';
        config.web.NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2 = 'true';
        config.bridge.LIVEPEER_BRIDGE_ENABLED = 'true';
        config.bridge.LIVEPEER_PLAYBACK_ISSUANCE_ENABLED = 'true';
        config.bridge.LIVEPEER_PLAYBACK_V2_ENABLED = 'true';
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.preview = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        const fake = makeFakeWrangler(release, { workers: {}, uploadFailures: {} });
        const smokeInputs = [];

        await deployFixture(release, fake, async (input) => {
            smokeInputs.push(input);
            return { ok: true };
        });

        assert.deepEqual(smokeInputs.map((input) => ({
            bridge: input.expectedBridgeEnabled,
            upload: input.expectedUploadReady,
            playback: input.expectedPlaybackReady,
        })), [
            { bridge: null, upload: undefined, playback: undefined },
            { bridge: true, upload: false, playback: true },
            { bridge: true, upload: false, playback: true },
        ]);
        const bridgeCommands = calls(fake).filter((args) => (
            args.includes(TARGETS.preview.bridge.worker)
            && (args[0] === 'deploy' || (args[0] === 'versions' && args[1] === 'upload'))
        ));
        assert.equal(bridgeCommands.length, 2);
        assert.ok(bridgeCommands.every((args) => (
            args.includes('LIVEPEER_BRIDGE_ENABLED:true')
            && args.includes('LIVEPEER_NEW_UPLOADS_ENABLED:false')
            && args.includes('LIVEPEER_PROVIDER_MUTATIONS_ENABLED:false')
            && args.includes('LIVEPEER_PLAYBACK_ISSUANCE_ENABLED:true')
            && args.includes('LIVEPEER_PLAYBACK_V2_ENABLED:true')
        )));
    });

    await t.test('rejects a Production playback canary packet', async (subtest) => {
        const release = makeRelease(subtest, 'production');
        const config = JSON.parse(readFileSync(release.configPath, 'utf8'));
        config.web.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = 'true';
        config.web.NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2 = 'true';
        config.bridge.LIVEPEER_BRIDGE_ENABLED = 'true';
        config.bridge.LIVEPEER_PLAYBACK_ISSUANCE_ENABLED = 'true';
        config.bridge.LIVEPEER_PLAYBACK_V2_ENABLED = 'true';
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.production = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        await assert.rejects(deployRelease({
            target: 'production', sha: SHA, artifactDir: release.artifactDir,
            receiptOutput: release.receipt, nearRpcUrl: NEAR_RPC_URL,
        }), /production_livepeer_canary_flags_not_false/);
    });

    await t.test('accepts the complete Preview sponsored upload canary packet', async (subtest) => {
        const release = makeRelease(subtest);
        const config = JSON.parse(readFileSync(release.configPath, 'utf8'));
        config.web.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = 'true';
        config.web.NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS = 'true';
        config.bridge.LIVEPEER_BRIDGE_ENABLED = 'true';
        config.bridge.LIVEPEER_NEW_UPLOADS_ENABLED = 'true';
        config.bridge.LIVEPEER_PROVIDER_MUTATIONS_ENABLED = 'true';
        config.bridge.LIVEPEER_OPERATOR_MUTATIONS_ENABLED = 'true';
        config.bridge.LIVEPEER_SPONSORED_UPLOADS_ENABLED = 'true';
        config.bridge.LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED = 'true';
        config.bridge.NEAR_SPONSOR_RELAYER_ACCOUNT_ID = 'sponsor-relayer.testnet';
        config.bridge.NEAR_SPONSOR_RELAYER_KEY_EPOCH = '1';
        config.bridge.LIVEPEER_CREATOR_ALLOWLIST = 'creator-one.testnet';
        config.bridge.LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS = '20000000';
        config.bridge.LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS = '2000000';
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.preview = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        const missingScope = makeFakeWrangler(release, { workers: {}, uploadFailures: {} });
        await assert.rejects(
            deployFixture(release, missingScope),
            /preview_operator_job_invalid/,
        );
        assert.deepEqual(missingScope.apiCalls, []);
        assert.deepEqual(calls(missingScope), []);
        config.bridge.LIVEPEER_OPERATOR_JOB_ID = 'job-recovery';
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.preview = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        for (const [overrides, error] of [
            [{ creatorFeeQuotePrivateKey: null }, /creator_fee_quote_private_key_invalid/],
            [{ creatorFeeQuotePrivateKey: 'd'.repeat(16) }, /creator_fee_quote_private_key_invalid/],
            [{ nearSponsorRelayerPrivateKey: null }, /near_sponsor_relayer_private_key_invalid/],
        ]) {
            const denied = makeFakeWrangler(release, { workers: {}, uploadFailures: {} });
            await assert.rejects(deployFixture(release, denied, undefined, overrides), error);
            assert.deepEqual(denied.apiCalls, []);
            assert.deepEqual(calls(denied), []);
        }
        const fake = makeFakeWrangler(release, { workers: {}, uploadFailures: {} });
        const smokeInputs = [];

        await deployFixture(release, fake, async (input) => {
            smokeInputs.push(input);
            return { ok: true };
        });

        assert.deepEqual(smokeInputs.map((input) => input.expectedSponsoredUploadReady), [
            null,
            true,
            true,
        ]);

        const bridgeCommands = calls(fake).filter((args) => (
            args.includes(TARGETS.preview.bridge.worker)
            && (args[0] === 'deploy' || (args[0] === 'versions' && args[1] === 'upload'))
        ));
        assert.ok(bridgeCommands.every((args) => (
            args.includes('LIVEPEER_SPONSORED_UPLOADS_ENABLED:true')
            && args.includes('LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED:true')
            && args.includes('LIVEPEER_OPERATOR_MUTATIONS_ENABLED:true')
            && args.includes('LIVEPEER_OPERATOR_JOB_ID:job-recovery')
            && args.includes('NEAR_SPONSOR_RELAYER_ACCOUNT_ID:sponsor-relayer.testnet')
            && args.includes('NEAR_SPONSOR_RELAYER_KEY_EPOCH:1')
        )));
        assert.ok(secretCalls(fake).filter(({ worker }) => worker === TARGETS.preview.bridge.worker)
            .every(({ keys }) => keys.includes('CREATOR_FEE_QUOTE_PRIVATE_KEY')
                && keys.includes('NEAR_SPONSOR_RELAYER_PRIVATE_KEY')));
    });

    await t.test('accepts the combined Preview public-beta packet', async (subtest) => {
        const release = makeRelease(subtest);
        const config = JSON.parse(readFileSync(release.configPath, 'utf8'));
        config.web.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = 'true';
        config.web.NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS = 'true';
        config.web.NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2 = 'true';
        config.bridge.LIVEPEER_BRIDGE_ENABLED = 'true';
        config.bridge.LIVEPEER_NEW_UPLOADS_ENABLED = 'true';
        config.bridge.LIVEPEER_PLAYBACK_ISSUANCE_ENABLED = 'true';
        config.bridge.LIVEPEER_PLAYBACK_V2_ENABLED = 'true';
        config.bridge.LIVEPEER_PROVIDER_MUTATIONS_ENABLED = 'true';
        config.bridge.LIVEPEER_OPERATOR_MUTATIONS_ENABLED = 'true';
        config.bridge.LIVEPEER_SPONSORED_UPLOADS_ENABLED = 'true';
        config.bridge.LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED = 'true';
        config.bridge.NEAR_SPONSOR_RELAYER_ACCOUNT_ID = 'sponsor-relayer.testnet';
        config.bridge.NEAR_SPONSOR_RELAYER_KEY_EPOCH = '1';
        config.bridge.LIVEPEER_CREATOR_ALLOWLIST = '*';
        config.bridge.LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS = '20000000';
        config.bridge.LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS = '2000000';
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.preview = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        const fake = makeFakeWrangler(release, { workers: {}, uploadFailures: {} });
        const smokeInputs = [];

        await deployFixture(release, fake, async (input) => {
            smokeInputs.push(input);
            return { ok: true };
        });

        assert.deepEqual(smokeInputs.slice(1).map((input) => ({
            upload: input.expectedUploadReady,
            playback: input.expectedPlaybackReady,
            sponsored: input.expectedSponsoredUploadReady,
        })), [
            { upload: true, playback: true, sponsored: true },
            { upload: true, playback: true, sponsored: true },
        ]);
        const bridgeCommands = calls(fake).filter((args) => (
            args.includes(TARGETS.preview.bridge.worker)
            && (args[0] === 'deploy' || (args[0] === 'versions' && args[1] === 'upload'))
        ));
        assert.ok(bridgeCommands.every((args) => (
            args.includes('LIVEPEER_CREATOR_ALLOWLIST:*')
            && args.includes('LIVEPEER_OPERATOR_JOB_ID:')
            && args.includes('LIVEPEER_PLAYBACK_V2_ENABLED:true')
            && args.includes('LIVEPEER_SPONSORED_UPLOADS_ENABLED:true')
        )));
    });

    await t.test('accepts the Preview publication read origin', async (subtest) => {
        const release = makeRelease(subtest);
        const config = JSON.parse(readFileSync(release.configPath, 'utf8'));
        config.web.NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL = 'true';
        config.web.NEXT_PUBLIC_MARKET_READ_MODEL_URL = PREVIEW_READ_MODEL_ORIGIN;
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.preview = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        const fake = makeFakeWrangler(release, { workers: {}, uploadFailures: {} });
        await deployFixture(release, fake);
    });

    await t.test('accepts the Preview operator archive flag', async (subtest) => {
        const release = makeRelease(subtest);
        const config = JSON.parse(readFileSync(release.configPath, 'utf8'));
        config.bridge.OPERATOR_OUTBOX_ARCHIVE_ENABLED = 'true';
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.preview = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        const fake = makeFakeWrangler(release, { workers: {}, uploadFailures: {} });

        await deployFixture(release, fake);

        const bridgeCommands = calls(fake).filter((args) => (
            args.includes(TARGETS.preview.bridge.worker)
            && (args[0] === 'deploy' || (args[0] === 'versions' && args[1] === 'upload'))
        ));
        assert.equal(bridgeCommands.length, 2);
        assert.ok(bridgeCommands.every((args) => (
            args.includes('OPERATOR_OUTBOX_ARCHIVE_ENABLED:true')
        )));
    });

    await t.test('rejects the Production operator archive flag', async (subtest) => {
        const release = makeRelease(subtest, 'production');
        const config = JSON.parse(readFileSync(release.configPath, 'utf8'));
        config.bridge.OPERATOR_OUTBOX_ARCHIVE_ENABLED = 'true';
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.production = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        await assert.rejects(deployRelease({
            target: 'production', sha: SHA, artifactDir: release.artifactDir,
            receiptOutput: release.receipt, nearRpcUrl: NEAR_RPC_URL,
            oneClickApiKey: ONECLICK_API_KEY,
        }), /operator_outbox_archive_enabled_not_false/);
    });

    await t.test('rejects the Production operator mutation flag', async (subtest) => {
        const release = makeRelease(subtest, 'production');
        const config = JSON.parse(readFileSync(release.configPath, 'utf8'));
        config.bridge.LIVEPEER_OPERATOR_MUTATIONS_ENABLED = 'true';
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.production = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        await assert.rejects(deployRelease({
            target: 'production', sha: SHA, artifactDir: release.artifactDir,
            receiptOutput: release.receipt, nearRpcUrl: NEAR_RPC_URL,
            oneClickApiKey: ONECLICK_API_KEY,
        }), /production_sponsor_canary_flags_not_false/);
    });

    await t.test('rejects a Production operator job', async (subtest) => {
        const release = makeRelease(subtest, 'production');
        const config = JSON.parse(readFileSync(release.configPath, 'utf8'));
        config.bridge.LIVEPEER_OPERATOR_JOB_ID = 'job-recovery';
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.production = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        await assert.rejects(deployRelease({
            target: 'production', sha: SHA, artifactDir: release.artifactDir,
            receiptOutput: release.receipt, nearRpcUrl: NEAR_RPC_URL,
            oneClickApiKey: ONECLICK_API_KEY,
        }), /operator_job_not_empty/);
    });

    await t.test('rejects a Production wildcard creator allowlist', async (subtest) => {
        const release = makeRelease(subtest, 'production');
        const config = JSON.parse(readFileSync(release.configPath, 'utf8'));
        config.bridge.LIVEPEER_CREATOR_ALLOWLIST = '*';
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.production = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        await assert.rejects(deployRelease({
            target: 'production', sha: SHA, artifactDir: release.artifactDir,
            receiptOutput: release.receipt, nearRpcUrl: NEAR_RPC_URL,
        }), /creator_allowlist_wildcard_invalid/);
    });

    await t.test('rejects another Preview read origin', async (subtest) => {
        const release = makeRelease(subtest);
        const config = JSON.parse(readFileSync(release.configPath, 'utf8'));
        config.web.NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL = 'true';
        config.web.NEXT_PUBLIC_MARKET_READ_MODEL_URL = 'https://other.youtick.net';
        writeFileSync(release.configPath, canonicalJson(config));
        release.manifest.configs.preview = record(release.configPath);
        writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
        await assert.rejects(deployRelease({
            target: 'preview', sha: SHA, artifactDir: release.artifactDir, receiptOutput: release.receipt,
            nearRpcUrl: NEAR_RPC_URL, oneClickApiKey: ONECLICK_API_KEY, ...PREVIEW_SECRET_INPUTS,
        }), /next_public_market_read_model_url_invalid/);
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
            nearRpcUrl: NEAR_RPC_URL, oneClickApiKey: ONECLICK_API_KEY, ...PREVIEW_SECRET_INPUTS,
        }), /bridge_wrangler_config_invalid/);
    });
});

test('post-promotion smoke retries transient stable Web asset propagation', async (t) => {
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
    const delays = [];
    let smokeCalls = 0;
    const receipt = await deployFixture(release, fake, async () => {
        smokeCalls += 1;
        if (smokeCalls === 3) throw transientWebPropagationError();
        return { ok: true };
    }, { sleepFn: async (delay) => delays.push(delay) });

    assert.equal(smokeCalls, 4);
    assert.deepEqual(delays, [1_000]);
    assert.equal(receipt.web.versionId, 'web-new');
});

test('post-promotion smoke retries a standalone transient asset 404', async (t) => {
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
    const delays = [];
    let smokeCalls = 0;
    const receipt = await deployFixture(release, fake, async () => {
        smokeCalls += 1;
        if (smokeCalls === 3) throw transientAsset404Error();
        return { ok: true };
    }, { sleepFn: async (delay) => delays.push(delay) });

    assert.equal(smokeCalls, 4);
    assert.deepEqual(delays, [1_000]);
    assert.equal(receipt.web.versionId, 'web-new');
});

test('post-promotion smoke does not retry a non-transient browser error', async (t) => {
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
    const delays = [];
    let smokeCalls = 0;
    await assert.rejects(deployFixture(release, fake, async () => {
        smokeCalls += 1;
        if (smokeCalls === 3) {
            const error = transientWebPropagationError();
            error.message += '\n/tr:console:ReferenceError: fixture';
            throw error;
        }
        return { ok: true };
    }, { sleepFn: async (delay) => delays.push(delay) }), /ReferenceError: fixture/);

    assert.equal(smokeCalls, 3);
    assert.deepEqual(delays, []);
});

test('post-promotion smoke exhaustion still restores every previous version', async (t) => {
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
    const delays = [];
    let smokeCalls = 0;
    await assert.rejects(deployFixture(release, fake, async () => {
        smokeCalls += 1;
        if (smokeCalls >= 3) throw transientWebPropagationError();
        return { ok: true };
    }, { sleepFn: async (delay) => delays.push(delay) }), /ChunkLoadError/);

    assert.equal(smokeCalls, 9);
    assert.deepEqual(delays, [1_000, 2_000, 4_000, 8_000, 15_000, 30_000]);
    const finalState = JSON.parse(readFileSync(fake.statePath, 'utf8'));
    assert.deepEqual(finalState.workers[TARGETS.preview.web.worker].traffic, [
        { version_id: 'web-old', percentage: 100 },
    ]);
    assert.deepEqual(finalState.workers[TARGETS.preview.bridge.worker].traffic, [
        { version_id: 'bridge-old', percentage: 100 },
    ]);
    assert.deepEqual(finalState.workers[READ_MODEL_WORKER].traffic, [
        { version_id: 'read-model-bootstrap', percentage: 100 },
    ]);
    assert.equal(existsSync(release.receipt), false);
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
        ['read-model-bootstrap@100', 'read-model-new@0'],
        ['bridge-old@100', 'bridge-new@0'],
        ['read-model-new@100'],
        ['bridge-new@100'],
        ['web-new@100'],
        ['read-model-bootstrap@100'],
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
    assert.deepEqual(finalState.workers[READ_MODEL_WORKER].traffic, [
        { version_id: 'read-model-bootstrap', percentage: 100 },
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
    assert.equal('readModel' in receipt, false);
    assert.equal(calls(fake).some((args) => args.includes(READ_MODEL_WORKER)), false);
    assert.deepEqual(receipt.rollbackTest, { requested: true, performed: true });
    assert.deepEqual(smokeInputs.map((input) => ({
        expected: input.expectedBridgeVersion,
        override: input.overrideVersion,
        bootstrap: input.bridgeBootstrap,
        playbackV2: input.includePlaybackV2,
    })), [
        { expected: 'bridge-old', override: undefined, bootstrap: false, playbackV2: false },
        { expected: 'bridge-new', override: 'bridge-new', bootstrap: undefined, playbackV2: undefined },
        { expected: 'bridge-new', override: undefined, bootstrap: undefined, playbackV2: undefined },
        { expected: 'bridge-old', override: undefined, bootstrap: undefined, playbackV2: false },
        { expected: 'bridge-new', override: undefined, bootstrap: undefined, playbackV2: undefined },
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


function publicModeRelease(t, mode) {
    const release = makeRelease(t, 'public-testnet');
    const config = JSON.parse(readFileSync(release.configPath));
    const flags = publicTestnetFlags(mode);
    for (const section of [config.web, config.bridge]) {
        for (const key of Object.keys(section)) if (key in flags) section[key] = flags[key];
    }
    config.web.NEXT_PUBLIC_MARKET_READ_MODEL_URL = `https://${PUBLIC_TESTNET_READ_MODEL.domain}`;
    Object.assign(config.bridge, { LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS: '5000000',
        LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS: '1000000',
        NEAR_SPONSOR_RELAYER_ACCOUNT_ID: 'public-relayer.testnet', NEAR_SPONSOR_RELAYER_KEY_EPOCH: '1' });
    writeFileSync(release.configPath, canonicalJson(config));
    release.manifest.targets = { 'public-testnet': TARGETS['public-testnet'] };
    release.manifest.configs = { 'public-testnet': record(release.configPath) };
    delete release.manifest.bundles.webPreview;
    delete release.manifest.bundles.webProduction;
    writeFileSync(join(release.artifactDir, 'manifest.json'), canonicalJson(release.manifest));
    return release;
}

for (const mode of ['acceptance', 'drain', 'closed']) test(`public ${mode} keeps the three workers isolated and verifies the exact packet`, async (t) => {
    const release = publicModeRelease(t, mode);
    const fake = makeFakeWrangler(release, { publicMode: mode, workers: {
        [TARGETS['public-testnet'].web.worker]: { traffic: [{ version_id: 'web-old', percentage: 100 }] },
        [TARGETS['public-testnet'].bridge.worker]: { traffic: [{ version_id: 'bridge-old', percentage: 100 }] },
        [PUBLIC_TESTNET_READ_MODEL.worker]: { traffic: [{ version_id: 'read-model-old', percentage: 100 }] },
    } });
    const smokeInputs = [];
    const receipt = await deployFixture(release, fake, async (input) => { smokeInputs.push(input); return { ok: true }; }, { target: 'public-testnet' });
    assert.equal(receipt.mode, mode);
    assert.equal(receipt.readModel.worker, PUBLIC_TESTNET_READ_MODEL.worker);
    assert.equal(smokeInputs.at(-1).publicTestnetMode, mode);
    assert.equal(smokeInputs.at(-1).expectedReadModel.enabled, mode !== 'closed');
    assert.equal(smokeInputs.at(-1).expectedPublicBetaRateLimitReady, true);
    assert.equal(smokeInputs.at(-1).expectedUploadReady, mode === 'acceptance');
    assert.ok(calls(fake).every((args) => !args.includes(READ_MODEL_WORKER)));
    assert.ok(fake.apiCalls.filter((call) => call.path.includes('/queues')).every((call) => call.method === 'GET'));
});

test('public activation requires an already closed deployment and provisioned queue consumer', async (t) => {
    const release = publicModeRelease(t, 'acceptance');
    for (const queueMissing of [true, false]) {
        const fake = makeFakeWrangler(release, { publicMode: 'acceptance', queueMissing, workers: {} });
        await assert.rejects(() => deployFixture(release, fake, async () => ({}), { target: 'public-testnet' }),
            queueMissing ? /public_queue_consumer_unproven/ : /public_testnet_closed_bootstrap_required/);
        assert.equal(calls(fake).some((args) => ['deploy', 'versions'].includes(args[0])), false);
    }
});

for (const mode of ['closed', 'drain']) test(`failed public ${mode} does not silently restore an accepting version`, async (t) => {
    const release = publicModeRelease(t, mode);
    const fake = makeFakeWrangler(release, { publicMode: mode, workers: {
        [TARGETS['public-testnet'].web.worker]: { traffic: [{ version_id: 'web-open', percentage: 100 }] },
        [TARGETS['public-testnet'].bridge.worker]: { traffic: [{ version_id: 'bridge-open', percentage: 100 }] },
        [PUBLIC_TESTNET_READ_MODEL.worker]: { traffic: [{ version_id: 'read-model-open', percentage: 100 }] },
    } });
    let probes = 0;
    await assert.rejects(() => deployFixture(release, fake, async () => {
        if (++probes === 1) throw new Error('closing_smoke_failed');
        return {};
    }, { target: 'public-testnet' }), /closing_smoke_failed/);
    const state = JSON.parse(readFileSync(fake.statePath));
    assert.equal(state.workers[TARGETS['public-testnet'].bridge.worker].traffic[0].version_id, 'bridge-new');
    assert.equal(existsSync(release.receipt), false);
});


for (const staleReads of [1, 5]) test(`public drain bounds stale traffic reads (${staleReads}) without repeating deployment`, async (t) => {
    const release = publicModeRelease(t, 'drain');
    const bridge = TARGETS['public-testnet'].bridge.worker;
    const workers = Object.fromEntries([
        TARGETS['public-testnet'].web.worker, bridge, PUBLIC_TESTNET_READ_MODEL.worker,
    ].map((worker) => [worker, { traffic: [{ version_id: 'previous', percentage: 100 }] }]));
    const fake = makeFakeWrangler(release, { publicMode: 'drain', workers, staleAfterDeploy: { [bridge]: staleReads } });
    const deploy = () => deployFixture(release, fake, async () => ({}), { target: 'public-testnet' });
    if (staleReads === 1) {
        assert.equal((await deploy()).mode, 'drain');
    } else {
        await assert.rejects(deploy, /youtick-livepeer-bridge-public-testnet_traffic_invalid/);
        assert.equal(existsSync(release.receipt), false);
    }
    assert.equal(JSON.parse(readFileSync(fake.statePath, 'utf8')).staleTraffic[bridge].remaining, 0);
    const promotions = calls(fake).filter(args => args[0] === 'versions' && args[1] === 'deploy'
        && args[args.indexOf('--name') + 1] === bridge && args.includes('bridge-new@100'));
    assert.equal(promotions.length, 1);
});

test('new public domains wait for DNS propagation without repeating deployment', async (t) => {
    const release = publicModeRelease(t, 'closed');
    const workers = Object.fromEntries([
        TARGETS['public-testnet'].web.worker, TARGETS['public-testnet'].bridge.worker,
        PUBLIC_TESTNET_READ_MODEL.worker,
    ].map((worker) => [worker, { traffic: [{ version_id: 'previous', percentage: 100 }] }]));
    const fake = makeFakeWrangler(release, { publicMode: 'closed', workers, domains: {} });
    const hosts = [TARGETS['public-testnet'].web.domain, TARGETS['public-testnet'].bridge.domain, PUBLIC_TESTNET_READ_MODEL.domain];
    const delays = [];
    let probes = 0;
    const receipt = await deployFixture(release, fake, async () => {
        const hostname = hosts[probes++];
        if (hostname) throw new TypeError('fetch failed', { cause: Object.assign(new Error('DNS pending'), { code: 'ENOTFOUND', hostname }) });
        return {};
    }, { target: 'public-testnet', sleepFn: async (delay) => delays.push(delay) });
    assert.equal(receipt.mode, 'closed');
    assert.equal(probes, 4);
    assert.deepEqual(delays, [1_000, 2_000, 4_000]);
    assert.equal(fake.apiCalls.filter((call) => call.method === 'PUT' && call.path.endsWith('/workers/domains')).length, 3);
    assert.equal(fake.apiCalls.filter((call) => call.method === 'DELETE').length, 0);
});

for (const scenario of ['unrelated host', 'existing domain', 'TLS failure', 'persistent DNS']) {
    test(`new public domain DNS retry stops for ${scenario}`, async (t) => {
        const release = publicModeRelease(t, 'closed');
        const workers = Object.fromEntries([
            TARGETS['public-testnet'].web.worker, TARGETS['public-testnet'].bridge.worker,
            PUBLIC_TESTNET_READ_MODEL.worker,
        ].map((worker) => [worker, { traffic: [{ version_id: 'previous', percentage: 100 }] }]));
        const fake = makeFakeWrangler(release, { publicMode: 'closed', workers,
            ...(scenario === 'existing domain' ? {} : { domains: {} }) });
        const delays = [];
        let probes = 0;
        const error = new TypeError('fetch failed', { cause: Object.assign(new Error('network failure'), {
            code: scenario === 'TLS failure' ? 'CERT_HAS_EXPIRED' : 'ENOTFOUND',
            hostname: scenario === 'unrelated host' ? 'unrelated.invalid' : TARGETS['public-testnet'].web.domain,
        }) });
        await assert.rejects(deployFixture(release, fake, async () => { probes += 1; throw error; },
            { target: 'public-testnet', sleepFn: async (delay) => delays.push(delay) }), /fetch failed/);
        assert.equal(probes, scenario === 'persistent DNS' ? 7 : 1);
        assert.deepEqual(delays, scenario === 'persistent DNS' ? [1_000, 2_000, 4_000, 8_000, 15_000, 30_000] : []);
        assert.equal(existsSync(release.receipt), false);
        const state = JSON.parse(readFileSync(fake.statePath));
        if (scenario !== 'existing domain') assert.deepEqual(state.domains, {});
        assert.equal(state.workers[TARGETS['public-testnet'].bridge.worker].traffic[0].version_id, 'bridge-new');
    });
}


for (const [name, fields, accepted] of [
    ['live script field', { script: TARGETS['public-testnet'].bridge.worker }, true],
    ['documented script_name', { script_name: TARGETS['public-testnet'].bridge.worker }, true],
    ['matching fields', { script: TARGETS['public-testnet'].bridge.worker, script_name: TARGETS['public-testnet'].bridge.worker }, true],
    ['conflicting fields', { script: 'wrong-worker', script_name: TARGETS['public-testnet'].bridge.worker }, false],
    ['wrong worker', { script: 'wrong-worker' }, false],
    ['missing fields', {}, false],
    ['null field', { script: TARGETS['public-testnet'].bridge.worker, script_name: null }, false],
]) test(`public queue consumer identity handles ${name}`, async (t) => {
    const release = publicModeRelease(t, 'acceptance');
    const workers = Object.fromEntries([
        TARGETS['public-testnet'].web.worker, TARGETS['public-testnet'].bridge.worker,
        PUBLIC_TESTNET_READ_MODEL.worker,
    ].map((worker) => [worker, { traffic: [{ version_id: 'previous', percentage: 100 }] }]));
    const fake = makeFakeWrangler(release, { publicMode: 'acceptance', workers, queueConsumers: [{
        type: 'worker', ...fields, dead_letter_queue: 'youtick-livepeer-events-dlq-public-testnet',
        settings: { batch_size: 10, max_concurrency: 1, max_retries: 3, max_wait_time_ms: 5000 },
    }] });
    const deploy = () => deployFixture(release, fake, async () => ({}), { target: 'public-testnet' });
    if (accepted) {
        assert.equal((await deploy()).mode, 'acceptance');
    } else {
        await assert.rejects(deploy, /public_queue_consumer_unproven/);
        assert.deepEqual(calls(fake), []);
    }
});
