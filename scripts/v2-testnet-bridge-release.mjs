#!/usr/bin/env node
// V2 testnet release for the Livepeer Bridge on Market V2 (docs/v2-testnet-runbook.md, Bridge).
// Run only by .github/workflows/deploy-v2-testnet-bridge.yml:
//   write-config <dry-run-outdir>                   prepare job, no secrets
//   check <release-dir> <sha> <mode>                 prepare job, wrangler dry run, no secrets
//   deploy <sha> <release-dir> <receipt> <mode>     deploy job, environment v2-testnet
// The Worker bytes come from `wrangler deploy --dry-run --outdir` in the prepare job; this script never bundles.
// Uploads open only for the named creators; the webhook Queue, D1 archives, sponsored uploads, multi-asset
// payments and the 30-day release_expired job stay off (W3 owns the read model and release).
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import {
    ACCEPTANCE_ORIGIN, DENIED_ORIGIN, MARKET_V2, MODES, PARENT, SMOKE_DELAYS_MS,
    nearPublicKey, request, retry, runProcess, validateRpcUrl, wranglerRunner,
} from './v2-testnet-release.mjs';

export const BRIDGE = Object.freeze({
    dir: 'workers/livepeer-bridge',
    worker: 'youtick-livepeer-bridge-v2-testnet',
    domain: 'bridge-v2-testnet.youtick.net',
});
const BRIDGE_ACCOUNT = `v2-bridge-261007.${PARENT}`;
// Function-call key of the Bridge account from v2-testnet-bootstrap-policy.json (bridge_operator.keys[1]).
const OPERATOR_PUBLIC_KEY = 'ed25519:BDyHUFs1wbkaQJQ2Tq4AcyJWHanaC8j4spLQRwAKiYed';
export const OPERATOR_METHODS = Object.freeze(['finalize_publication', 'suspend_sales', 'mark_watched', 'release_expired']);
// Market V2 quote key as bootstrapped (v2-testnet-bootstrap-policy.json market.quote_public_key_base64).
const QUOTE_PUBLIC_KEY_BASE64 = 'YYvahur/L80hl0moUnEBLkHjv1jNjzIgXQFMs/jkSf4=';
const QUOTE_KEY_VERSION = '1';
// Livepeer project youtick-paid-media-canary; V2 has its own API key, signing key and webhook in it.
const LIVEPEER_PROJECT_ID = '53baeeda-930d-45be-bda6-a41090e6d25e';
// The V2 Bridge's webhook (youtick-v2-testnet-bridge). Its signing secret cannot be revealed in the
// Livepeer dashboard, so the release reads it through the API and refuses a Bridge secret that
// differs: on 2026-10-13 a mismatch made the Bridge answer every delivery with 403.
export const LIVEPEER_WEBHOOK_ID = 'f7a3992a-4f19-4716-8f86-2af1df7a016e';
export const LIVEPEER_WEBHOOK_URL = `https://${BRIDGE.domain}/v1/livepeer-webhooks`;
// Public half of the V2 signing key youtick-v2-testnet-bridge (Livepeer Studio, 2026-10-12).
export const JWT_PUBLIC_KEY = 'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUZrd0V3WUhLb1pJemowQ0FRWUlLb1pJemowREFRY0RRZ0FFVloycGFyMkxFSnZ3Nll4N2M2VVlFMkdjOHBkZAp1bkRVdmRiTHpzMGsrUkNKamZQUHpIYXBiTGxyNFhOblZrTzFBdmZ4N1BjMFk3WHBnRWZzZVlxWEJ3PT0KLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg==';
/** The public halves every deploy secret must match; tests pass their own. */
export const EXPECTED_KEYS = Object.freeze({ operator: OPERATOR_PUBLIC_KEY, jwt: JWT_PUBLIC_KEY, quote: QUOTE_PUBLIC_KEY_BASE64 });
// Owner-named wallet creators allowed to upload (2026-10-12); never a wildcard.
export const WALLET_CREATOR_ALLOWLIST = Object.freeze(['ticks.testnet', 'soteri.testnet', 'utick.testnet']);
// NEAR Auth creators (E5b.3, decision D11): the implicit account of each invited creator, added here
// after the invite code is redeemed and checked with the relayer's /internal/invited-accounts/<id>.
// Each entry is a 64-character hex account id; a deploy follows every change.
// 2026-10-12: owner's Google test account; invite paid in 2em5fQA65TnPYSE22mKzsU1hyPZiXYi5ygLJzk1GLyrU.
export const NEAR_AUTH_CREATOR_ALLOWLIST = Object.freeze(['37729f76f581ce6e2cc9cc08e48b9f098158cf4bd044d62fe2a9f4bfd06c23d9']);
export const CREATOR_ALLOWLIST = Object.freeze([...WALLET_CREATOR_ALLOWLIST, ...NEAR_AUTH_CREATOR_ALLOWLIST]);
// Unused by any other Worker (1001-2002 web, 3001 Bridge, 3101/3201 V2 Workers, 5001-5003 public-testnet).
export const RATE_LIMIT_NAMESPACE = '6003';

export const FLAGS = Object.freeze([
    'LIVEPEER_BRIDGE_ENABLED',
    'LIVEPEER_NEW_UPLOADS_ENABLED',
    'LIVEPEER_PROVIDER_MUTATIONS_ENABLED',
    'LIVEPEER_OPERATOR_MUTATIONS_ENABLED',
    'LIVEPEER_PLAYBACK_ISSUANCE_ENABLED',
    'LIVEPEER_PLAYBACK_V3_ENABLED',
    'LIVEPEER_NEAR_CREATOR_FEE_ENABLED',
    // W3: the 30-day release_expired job, driven by the cron and the V2 read-model database.
    'MARKET_V2_RELEASE_ENABLED',
]);

/** Written into [vars] of the deployed config; empty values are allowed here and never passed as --var. */
export const FIXED_VARS = Object.freeze({
    VIDEO_ENVIRONMENT: 'v2-testnet',
    MARKET_PROTOCOL: 'v2',
    NEAR_NETWORK: 'testnet',
    MARKET_CONTRACT_ID: MARKET_V2,
    // Only the V1 /v1/playback-tokens path reads it; Market V2 has no session grants, so that path fails closed.
    ACCESS_CONTRACT_ID: MARKET_V2,
    ALLOWED_ORIGINS: ACCEPTANCE_ORIGIN,
    LIVEPEER_PROJECT_ID,
    LIVEPEER_API_TOKEN_NAME: 'youtick-v2-testnet-bridge',
    LIVEPEER_CREATOR_ALLOWLIST: CREATOR_ALLOWLIST.join(','),
    LIVEPEER_OPERATOR_JOB_ID: '',
    LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS: '20000000',
    LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS: '2000000',
    LIVEPEER_PAID_MEDIA_OPERATOR_ID: 'youtick-v2-testnet-operator',
    LIVEPEER_JWT_PUBLIC_KEY: JWT_PUBLIC_KEY,
    LIVEPEER_JWT_ISSUER: 'https://youtick.net',
    NEAR_OPERATOR_ACCOUNT_ID: BRIDGE_ACCOUNT,
    NEAR_OPERATOR_KEY_EPOCH: '1',
    NEAR_SPONSOR_RELAYER_ACCOUNT_ID: '',
    CREATOR_FEE_QUOTE_KEY_VERSION: QUOTE_KEY_VERSION,
    LIVEPEER_PLAYBACK_V2_ENABLED: 'false',
    LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED: 'false',
    LIVEPEER_WEBHOOK_QUEUE_ENABLED: 'false',
    UPLOAD_JOB_ARCHIVE_ENABLED: 'false',
    OPERATOR_OUTBOX_ARCHIVE_ENABLED: 'false',
    LIVEPEER_SPONSORED_UPLOADS_ENABLED: 'false',
    LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED: 'false',
    MULTI_ASSET_PAYMENTS_MODE: 'off',
});

export const SECRETS = Object.freeze([
    'NEAR_RPC_URL', 'LIVEPEER_API_KEY', 'LIVEPEER_WEBHOOK_SECRET', 'LIVEPEER_JWT_PRIVATE_KEY',
    'LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN', 'NEAR_OPERATOR_PRIVATE_KEY', 'CREATOR_FEE_QUOTE_PRIVATE_KEY',
]);
// Bindings the V2 Bridge must not carry: the V1 testnet Queue/DLQ and the V1 read-model database.
const DROPPED_SECTIONS = new Set(['queues.producers', 'queues.consumers', 'd1_databases']);
// W3: the V2 read-model database (created by the owner; id in the repository variable V2_READ_MODEL_D1_ID)
// feeds the scheduled release_expired scan, which the cron runs every 15 minutes.
export const READ_MODEL_D1_NAME = 'youtick-market-read-model-v2-testnet';
export const RELEASE_CRON = '*/15 * * * *';
const V1_READ_MODEL_D1_ID = '50b1e14f-2b06-444b-98cf-b828f11277ef';
const D1_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function readModelD1Id(value) {
    if (!D1_ID.test(value ?? '')) fail('read_model_d1_id_invalid');
    if (value === V1_READ_MODEL_D1_ID) fail('read_model_d1_is_v1');
    return value;
}

function fail(message) {
    throw new Error(`v2_testnet_bridge_release_${message}`);
}

/**
 * The deployed config is the repository wrangler.toml with: the bundled `index.js` as entry, no workers.dev
 * or preview URLs, no Queue binding, the V2 read-model D1 binding and the release cron in place of the V1
 * ones, its own rate-limit namespace, NEAR_RPC_URL moved to secrets and every FIXED_VARS value written
 * into [vars]. Any placeholder left after that is refused.
 */
export function sanitizeBridgeConfig(source, { d1Id } = {}) {
    let section = '';
    let mainSeen = false;
    let namespaceSeen = false;
    let varsSeen = false;
    const written = new Set();
    const out = [];
    const appendMissingVars = () => {
        for (const [key, value] of Object.entries(FIXED_VARS)) {
            if (!written.has(key)) out.push(`${key} = ${JSON.stringify(value)}`);
        }
    };
    for (const line of source.split('\n')) {
        const header = /^\s*\[+([^\]]+)\]+\s*$/.exec(line);
        if (header) {
            if (section === 'vars') appendMissingVars();
            section = header[1].trim();
            if (section === 'vars') varsSeen = true;
        }
        if (DROPPED_SECTIONS.has(section)) continue;
        if (!section && /^main\s*=/.test(line)) {
            out.push('main = "index.js"', 'workers_dev = false', 'preview_urls = false');
            mainSeen = true;
            continue;
        }
        if (!section && /^(workers_dev|preview_urls|routes|route)\s*=/.test(line)) fail('config_routing_unexpected');
        if (section === 'ratelimits' && /^namespace_id\s*=/.test(line)) {
            out.push(`namespace_id = "${RATE_LIMIT_NAMESPACE}"`);
            namespaceSeen = true;
            continue;
        }
        if (section === 'vars') {
            const entry = /^([A-Z0-9_]+)\s*=\s*"(.*)"\s*$/.exec(line);
            if (entry?.[1] === 'NEAR_RPC_URL') continue;
            if (entry && SECRETS.includes(entry[1])) fail(`config_secret_in_vars_${entry[1]}`);
            if (entry && Object.hasOwn(FIXED_VARS, entry[1])) {
                out.push(`${entry[1]} = ${JSON.stringify(FIXED_VARS[entry[1]])}`);
                written.add(entry[1]);
                continue;
            }
            if (entry && /<[^>]*>/.test(entry[2])) fail(`config_placeholder_${entry[1]}`);
        }
        out.push(line);
    }
    if (section === 'vars') appendMissingVars();
    if (!mainSeen) fail('config_main_missing');
    if (!varsSeen) fail('config_vars_missing');
    if (!namespaceSeen) fail('config_rate_limit_missing');
    if (/queues|d1_databases|database_id|\[triggers\]/.test(out.join('\n'))) fail('config_binding_unexpected');
    out.push('', '[triggers]', `crons = [${JSON.stringify(RELEASE_CRON)}]`, '', '[[d1_databases]]', 'binding = "MARKET_READ_MODEL"',
        `database_name = ${JSON.stringify(READ_MODEL_D1_NAME)}`, `database_id = ${JSON.stringify(readModelD1Id(d1Id))}`, '');
    return out.join('\n');
}

export function releaseVars(mode) {
    if (!MODES.includes(mode)) fail('mode_invalid');
    return Object.fromEntries(FLAGS.map((flag) => [flag, mode === 'acceptance' ? 'true' : 'false']));
}

function pemBody(value, label) {
    const pem = value.startsWith('-----BEGIN') ? value : Buffer.from(value, 'base64').toString('utf8');
    const match = new RegExp(`^-----BEGIN ${label}-----([A-Za-z0-9+/=\\s]+)-----END ${label}-----\\s*$`).exec(pem.trim());
    if (!match) fail(`${label.toLowerCase().replace(' ', '_')}_invalid`);
    return Buffer.from(match[1].replace(/\s/g, ''), 'base64');
}

/** The Bridge signs Livepeer JWTs with ES256; the private key must belong to the published JWT_PUBLIC_KEY. */
export function jwtKeyMatches(privateKeyValue, publicKeyValue) {
    let derived;
    try {
        const key = createPrivateKey({ key: pemBody(privateKeyValue, 'PRIVATE KEY'), format: 'der', type: 'pkcs8' });
        if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return false;
        derived = createPublicKey(key).export({ format: 'der', type: 'spki' });
    } catch {
        return false;
    }
    return derived.equals(pemBody(publicKeyValue, 'PUBLIC KEY'));
}

/** Base64 PKCS8 Ed25519 (the Bridge's CREATOR_FEE_QUOTE_PRIVATE_KEY) -> base64 raw public key. */
export function quotePublicKey(value) {
    try {
        const key = createPrivateKey({ key: Buffer.from(value, 'base64'), format: 'der', type: 'pkcs8' });
        if (key.asymmetricKeyType !== 'ed25519') fail('quote_key_invalid');
        return createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
    } catch {
        fail('quote_key_invalid');
    }
}

/** Reads and checks the deploy job's environment; nothing here is echoed. */
export function releaseSecrets(env, expected = EXPECTED_KEYS) {
    if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? '') || !env.CLOUDFLARE_API_TOKEN?.trim()) fail('cloudflare_credentials_invalid');
    const rpc = validateRpcUrl(env.NEAR_RPC_URL ?? '');
    const apiKey = env.LIVEPEER_API_KEY ?? '';
    if (apiKey.length < 16 || /\s/.test(apiKey)) fail('livepeer_api_key_invalid');
    const webhookSecret = env.LIVEPEER_WEBHOOK_SECRET ?? '';
    if (webhookSecret.length < 16 || /[\r\n]/.test(webhookSecret)) fail('livepeer_webhook_secret_invalid');
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN ?? '')) fail('operator_token_invalid');
    if (!jwtKeyMatches(env.LIVEPEER_JWT_PRIVATE_KEY ?? '', expected.jwt)) fail('jwt_key_mismatch');
    const operatorPublicKey = nearPublicKey(env.NEAR_OPERATOR_PRIVATE_KEY);
    if (operatorPublicKey !== expected.operator) fail('operator_key_mismatch');
    if (quotePublicKey(env.CREATOR_FEE_QUOTE_PRIVATE_KEY ?? '') !== expected.quote) fail('quote_key_mismatch');
    return {
        cloudflare: { accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN },
        rpc,
        operatorPublicKey,
        worker: Object.fromEntries(SECRETS.map((name) => [name, name === 'NEAR_RPC_URL' ? rpc : env[name]])),
    };
}

async function rpcCall(fetchImpl, rpc, method, params) {
    const response = await fetchImpl(rpc, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'v2-testnet-bridge-release', method, params }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) fail('rpc_unavailable');
    return body;
}

/** Refuses to deploy unless the chain holds the operator key with exactly the V2 outbox methods and quote key v1. */
export async function preflight(secrets, fetchImpl) {
    const status = await rpcCall(fetchImpl, secrets.rpc, 'status', []);
    if (status?.result?.chain_id !== 'testnet') fail('rpc_network');
    const key = await rpcCall(fetchImpl, secrets.rpc, 'query', {
        finality: 'final', request_type: 'view_access_key', account_id: BRIDGE_ACCOUNT, public_key: secrets.operatorPublicKey,
    });
    const call = key.result?.permission?.FunctionCall;
    if (call?.receiver_id !== MARKET_V2 || [...(call.method_names ?? [])].sort().join() !== [...OPERATOR_METHODS].sort().join()) {
        fail('operator_key_not_on_chain');
    }
    const version = await rpcCall(fetchImpl, secrets.rpc, 'query', {
        finality: 'final', request_type: 'call_function', account_id: MARKET_V2, method_name: 'get_quote_key_version',
        args_base64: Buffer.from('{}').toString('base64'),
    });
    let onChain = null;
    try {
        onChain = JSON.parse(Buffer.from(version.result.result).toString());
    } catch {
        fail('quote_key_version_unreadable');
    }
    if (String(onChain) !== QUOTE_KEY_VERSION) fail('quote_key_version_mismatch');
    await preflightWebhookSecret(secrets.worker, fetchImpl);
}

/** The Bridge verifies Livepeer's HMAC with LIVEPEER_WEBHOOK_SECRET; Livepeer signs with the webhook's sharedSecret. */
export async function preflightWebhookSecret(worker, fetchImpl) {
    let webhook;
    try {
        const response = await fetchImpl(`https://livepeer.studio/api/webhook/${LIVEPEER_WEBHOOK_ID}`, {
            headers: { Authorization: `Bearer ${worker.LIVEPEER_API_KEY}` },
        });
        if (!response.ok) fail(`webhook_unreadable_${response.status}`);
        webhook = await response.json();
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('v2_testnet_bridge_release_')) throw error;
        fail('webhook_unreadable');
    }
    if (webhook?.id !== LIVEPEER_WEBHOOK_ID || webhook.url !== LIVEPEER_WEBHOOK_URL || webhook.projectId !== LIVEPEER_PROJECT_ID) {
        fail('webhook_binding_mismatch');
    }
    if (typeof webhook.sharedSecret !== 'string' || webhook.sharedSecret !== worker.LIVEPEER_WEBHOOK_SECRET) fail('webhook_secret_mismatch');
}

export function wranglerArgs(releaseDir, sha, mode) {
    return [
        'deploy', join(releaseDir, 'index.js'), '--no-bundle', '--config', join(releaseDir, 'wrangler.toml'),
        '--name', BRIDGE.worker, '--domain', BRIDGE.domain,
        ...Object.entries(releaseVars(mode)).flatMap(([key, value]) => ['--var', `${key}:${value}`]),
        '--tag', sha, '--message', `YouTick v2-testnet bridge ${mode} ${sha}`,
    ];
}

const ACCEPTANCE_HEALTH = Object.freeze({
    stage: 'ENABLED',
    newUploadReady: true,
    controlPlaneReady: true,
    playbackReady: true,
    operatorMutationEnabled: true,
    playbackV2Ready: false,
    webhookQueueReady: false,
    sponsoredUploadQuoteReady: false,
    uploadJobArchiveReady: false,
    operatorOutboxArchiveReady: false,
});

/**
 * Health must come from the version just deployed and point at Market V2.
 * Closed: the Bridge reports DISABLED. Acceptance: uploads, webhooks, playback and operator mutations are
 * ready and everything W2 keeps off is not; /v3/playback-tokens passes its flag gate (4xx for an empty
 * body, not 503) and the CORS preflight admits only the acceptance origin.
 */
export async function smoke(mode, versionId, fetchImpl) {
    const base = `https://${BRIDGE.domain}`;
    const health = await request(fetchImpl, `${base}/__health`, { method: 'GET' });
    if (health.status !== 200 || health.body?.versionId !== versionId) fail(`smoke_version_${health.status}`);
    if (health.body?.compactUpload?.market !== MARKET_V2 || health.body?.compactUpload?.network !== 'testnet') fail('smoke_market');
    if (mode === 'closed') {
        if (health.body.stage !== 'DISABLED') fail('smoke_closed');
        return { health_status: health.status, stage: health.body.stage };
    }
    for (const [field, expected] of Object.entries(ACCEPTANCE_HEALTH)) {
        if (health.body[field] !== expected) fail(`smoke_health_${field}`);
    }
    const url = `${base}/v3/playback-tokens`;
    const allowed = await request(fetchImpl, url, { method: 'OPTIONS', headers: { Origin: ACCEPTANCE_ORIGIN } });
    if (allowed.status !== 204 || allowed.origin !== ACCEPTANCE_ORIGIN) fail(`smoke_cors_${allowed.status}`);
    const denied = await request(fetchImpl, url, { method: 'OPTIONS', headers: { Origin: DENIED_ORIGIN } });
    if (denied.status !== 403 || denied.body?.error !== 'origin_denied') fail(`smoke_denied_${denied.status}`);
    const v3 = await request(fetchImpl, url, {
        method: 'POST', headers: { Origin: ACCEPTANCE_ORIGIN, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (v3.status < 400 || v3.status >= 500) fail(`smoke_v3_${v3.status}`);
    return {
        health_status: health.status, stage: health.body.stage,
        allowed_origin_status: allowed.status, denied_origin_status: denied.status, empty_v3_status: v3.status,
    };
}

export async function deployRelease({
    sha, releaseDir, receiptPath, mode, env = process.env, fetchImpl = fetch,
    sleep = (ms) => new Promise((done) => setTimeout(done, ms)), makeRunner, expected = EXPECTED_KEYS,
}) {
    if (!/^[a-f0-9]{40}$/.test(sha ?? '')) fail('sha_invalid');
    if (!MODES.includes(mode)) fail('mode_invalid');
    const secrets = releaseSecrets(env, expected);
    await preflight(secrets, fetchImpl);
    const receipt = {
        schema: 'youtick.v2-testnet-bridge-receipt.v1', sha, mode, status: 'IN_PROGRESS',
        worker: BRIDGE.worker, domain: BRIDGE.domain,
    };
    const save = () => writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o644 });
    const tempRoot = await mkdtemp(join(tmpdir(), 'youtick-v2-testnet-bridge-release-'));
    try {
        const run = makeRunner ? makeRunner(secrets.cloudflare, tempRoot) : wranglerRunner(
            resolve(BRIDGE.dir, 'node_modules/.bin/wrangler'), secrets.cloudflare, tempRoot,
        );
        receipt.status = 'DEPLOYING';
        await save();
        const secretsFile = join(tempRoot, 'bridge-secrets.json');
        await writeFile(secretsFile, JSON.stringify(secrets.worker), { flag: 'wx', mode: 0o600 });
        if (((await stat(secretsFile)).mode & 0o777) !== 0o600) fail('secrets_file_mode_invalid');
        let event;
        try {
            event = await run([...wranglerArgs(releaseDir, sha, mode), '--secrets-file', secretsFile]);
        } finally {
            await rm(secretsFile, { force: true });
        }
        if (event.worker_name !== BRIDGE.worker || typeof event.version_id !== 'string') fail('deploy_output_invalid');
        receipt.version_id = event.version_id;
        receipt.status = 'DEPLOYED';
        await save();
        receipt.smoke = await retry(() => smoke(mode, event.version_id, fetchImpl), SMOKE_DELAYS_MS, sleep);
        receipt.status = 'PASS';
        await save();
        return receipt;
    } catch (error) {
        receipt.status = 'FAILED';
        receipt.error = error instanceof Error ? error.message : 'unknown';
        await save();
        throw error;
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
}

async function main(argv) {
    const [command, ...args] = argv;
    if (command === 'write-config' && args.length === 1) {
        const [outdir] = args;
        await stat(join(outdir, 'index.js'));
        const source = await readFile(join(BRIDGE.dir, 'wrangler.toml'), 'utf8');
        await writeFile(join(outdir, 'wrangler.toml'), sanitizeBridgeConfig(source, { d1Id: process.env.READ_MODEL_D1_ID }), { flag: 'wx', mode: 0o644 });
        return;
    }
    if (command === 'check' && args.length === 3) {
        // Prepare job: the exact deploy invocation, as a dry run with no Cloudflare credentials.
        const [releaseDir, sha, mode] = args;
        const result = await runProcess(resolve(BRIDGE.dir, 'node_modules/.bin/wrangler'),
            [...wranglerArgs(resolve(releaseDir), sha, mode), '--dry-run'],
            { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', WRANGLER_SEND_METRICS: 'false' });
        if (result.code !== 0) fail('dry_run_failed');
        return;
    }
    if (command === 'deploy' && args.length === 4) {
        const [sha, releaseDir, receiptPath, mode] = args;
        const receipt = await deployRelease({ sha, releaseDir: resolve(releaseDir), receiptPath, mode });
        console.log(JSON.stringify({ status: receipt.status, worker: receipt.worker, version_id: receipt.version_id }));
        return;
    }
    fail('usage');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(error instanceof Error ? error.message : 'v2_testnet_bridge_release_failed');
        process.exitCode = 1;
    });
}
