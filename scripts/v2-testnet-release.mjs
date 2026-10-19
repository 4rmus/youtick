#!/usr/bin/env node
// V2 testnet release for the relayer and payment-service Workers (docs/v2-testnet-runbook.md, Workers).
// Run only by .github/workflows/deploy-v2-testnet.yml:
//   write-config <component> <dry-run-outdir>              prepare job, no secrets
//   check <release-dir> <sha> <mode> [card]                prepare job, dry run
//   deploy <sha> <release-dir> <receipt> <mode> [card]     deploy job, environment v2-testnet
// The Worker bytes come from `wrangler deploy --dry-run --outdir` in the prepare job; this script never bundles.
import { createPrivateKey, createPublicKey, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

export const WRANGLER_VERSION = '4.147.0';
export const MODES = Object.freeze(['closed', 'acceptance']);
/** The payment service's card path (roadmap E8.3): `off`, or on with the Cleeng sandbox (acceptance only). */
export const CARD_PATHS = Object.freeze(['off', 'sandbox']);
export const PARENT = 'youtick-dev-v3.testnet';
export const MARKET_V2 = `v2-market-261007.${PARENT}`;
const RELAYER = `v2-relayer-261007.${PARENT}`;
const CKD_GATE = `v2-ckd-gate-261007.${PARENT}`;
export const PAYMENT_OPERATOR = `v2-payments-261007.${PARENT}`;
/** The only methods the card path's function-call key may call (gate E8.0); never a full-access key. */
export const CARD_OPERATOR_METHODS = Object.freeze(['issue_card_ticket', 'void_card_ticket']);
/** Cleeng sandbox publisher (broadcaster) id, public; created by the owner on 2026-10-15. */
export const CLEENG_SANDBOX_PUBLISHER_ID = '154746265';
// The shared NEAR Auth testnet client only allows this origin (docs/v2-testnet-runbook.md).
export const ACCEPTANCE_ORIGIN = 'http://localhost:3000';
export const DENIED_ORIGIN = 'https://release-smoke.invalid';
const VAT_KEY_VERSION = '1';
// W3: the V2 read model. Market V2's first job, publication and ticket events are after this block
// (2026-10-13, 15:40 UTC); the Bridge's release job needs tickets and publications, not the bootstrap-only
// governance events before it. The D1 database is created by the owner and its id is the repository
// variable V2_READ_MODEL_D1_ID (docs/v2-testnet-runbook.md, W3).
export const READ_MODEL_START_BLOCK_HEIGHT = '272905000';
export const READ_MODEL_D1_NAME = 'youtick-market-read-model-v2-testnet';
export const READ_MODEL_D1_BINDING = 'MARKET_READ_MODEL';
const V1_READ_MODEL_D1_ID = '50b1e14f-2b06-444b-98cf-b828f11277ef';
const D1_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function readModelD1Id(value) {
    if (!D1_ID.test(value ?? '')) fail('read_model_d1_id_invalid');
    if (value === V1_READ_MODEL_D1_ID) fail('read_model_d1_is_v1');
    return value;
}

// The payment service's refund request inbox. Created by the owner like the read model's database; its
// id is the repository variable V2_PAYMENTS_D1_ID. The repository config carries an all-zero placeholder.
export const PAYMENTS_D1_NAME = 'youtick-payments-v2-testnet';
export const PAYMENTS_D1_BINDING = 'REFUNDS';

export function paymentsD1Id(value) {
    if (!D1_ID.test(value ?? '') || /^[0-]+$/.test(value)) fail('payments_d1_id_invalid');
    if (value === V1_READ_MODEL_D1_ID) fail('payments_d1_is_v1_read_model');
    return value;
}

export const COMPONENTS = Object.freeze({
    relayer: Object.freeze({
        dir: 'workers/relayer',
        worker: 'youtick-relayer-v2-testnet',
        domain: 'relayer-v2-testnet.youtick.net',
        flags: Object.freeze(['RELAYER_ENABLED', 'RELAYER_MUTATIONS_ENABLED']),
        vars: Object.freeze({
            NEAR_NETWORK: 'testnet',
            RELAYER_ACCOUNT_ID: RELAYER,
            NEAR_AUTH_CLIENT_ID: 'np8paqIpMWmNbzT4xAvOOapZBjsOpptl',
            CKD_GATE_ACCOUNT_IDS: CKD_GATE,
            MARKET_V2_CONTRACT_ID: MARKET_V2,
            ALLOWED_ORIGINS: ACCEPTANCE_ORIGIN,
            // Device links (`add_device`, decision O12): without both the device routes answer devices_disabled.
            // Renewals are charged per ticket only; at most 30 TGas each.
            DAILY_DEVICE_LIMIT: '1000',
            TICKET_DAILY_DEVICE_LIMIT: '6',
        }),
        secrets: Object.freeze(['NEAR_RPC_URL', 'RELAYER_PRIVATE_KEY', 'RELAYER_ADMIN_TOKEN']),
        smokePath: '/v1/ckd',
        disabledError: 'relayer_disabled',
    }),
    'payment-service': Object.freeze({
        dir: 'workers/payment-service',
        worker: 'youtick-payment-service-v2-testnet',
        domain: 'pay-v2-testnet.youtick.net',
        flags: Object.freeze(['PAYMENT_SERVICE_ENABLED']),
        vars: Object.freeze({
            NEAR_NETWORK: 'testnet',
            MARKET_V2_CONTRACT_ID: MARKET_V2,
            VAT_KEY_VERSION,
            ALLOWED_ORIGINS: ACCEPTANCE_ORIGIN,
        }),
        secrets: Object.freeze(['NEAR_RPC_URL', 'VAT_SIGNER_PRIVATE_KEY', 'REFUND_ADMIN_TOKEN']),
        smokePath: '/v1/vat-attestations',
        disabledError: 'payment_service_disabled',
        d1: Object.freeze({ binding: PAYMENTS_D1_BINDING, name: PAYMENTS_D1_NAME, idEnv: 'PAYMENTS_D1_ID', validate: paymentsD1Id }),
    }),
    // W3: the derived read model of Market V2; the Bridge's 30-day release job reads its D1 directly.
    'read-model': Object.freeze({
        dir: 'read-model',
        worker: 'youtick-market-read-model-v2-testnet',
        domain: 'read-v2-testnet.youtick.net',
        flags: Object.freeze(['READ_MODEL_ENABLED', 'READ_MODEL_INGESTION_ENABLED']),
        vars: Object.freeze({
            VIDEO_ENVIRONMENT: 'v2-testnet',
            MARKET_CONTRACT_ID: MARKET_V2,
            READ_MODEL_NETWORK: 'testnet',
            READ_MODEL_CONTRACT_ID: MARKET_V2,
            READ_MODEL_START_BLOCK_HEIGHT,
            READ_MODEL_MAX_BLOCKS_PER_RUN: '180',
            READ_MODEL_WEB_ORIGIN: ACCEPTANCE_ORIGIN,
            READ_MODEL_CURRENT_CATALOG_ENABLED: 'false',
            READ_MODEL_BACKFILL_ENABLED: 'false',
            READ_MODEL_BACKFILL_CONTINUE_ENABLED: 'false',
        }),
        secrets: Object.freeze(['READ_MODEL_NEAR_RPC_URL']),
        smokePath: '/__health',
        disabledError: null,
        d1: Object.freeze({ binding: READ_MODEL_D1_BINDING, name: READ_MODEL_D1_NAME, idEnv: 'READ_MODEL_D1_ID', validate: readModelD1Id }),
    }),
});

function fail(message) {
    throw new Error(`v2_testnet_release_${message}`);
}

/**
 * The deployed config is the repository wrangler.toml with three changes: the bundled `index.js` as entry,
 * no workers.dev or preview URLs (only the custom domain serves), and NEAR_RPC_URL removed from [vars]
 * because it is uploaded as a secret. Every remaining placeholder must be overridden by the release vars.
 */
export function sanitizeWranglerConfig(source, component, { d1Id } = {}) {
    const spec = COMPONENTS[component] ?? fail('component_unknown');
    const lines = source.split('\n');
    let section = '';
    let mainSeen = false;
    let d1Seen = false;
    const out = [];
    for (const line of lines) {
        const header = /^\s*\[+([^\]]+)\]+\s*$/.exec(line);
        if (header) section = header[1].trim();
        if (!section && /^main\s*=/.test(line)) {
            out.push('main = "index.js"', 'workers_dev = false', 'preview_urls = false');
            mainSeen = true;
            continue;
        }
        // The read model's config already turns these off; the sanitizer writes them next to `main`.
        if (!section && /^(workers_dev|preview_urls)\s*=\s*false\s*$/.test(line)) continue;
        if (!section && /^(workers_dev|preview_urls|routes|route)\s*=/.test(line)) fail('config_routing_unexpected');
        if (section === 'd1_databases') {
            // Each V2 component has its own database; the repository config names a V1 or placeholder one.
            if (!spec.d1) fail('config_binding_unexpected');
            const entry = /^(binding|database_name|database_id)\s*=/.exec(line);
            if (entry?.[1] === 'binding') out.push(`binding = ${JSON.stringify(spec.d1.binding)}`);
            else if (entry?.[1] === 'database_name') out.push(`database_name = ${JSON.stringify(spec.d1.name)}`);
            else if (entry?.[1] === 'database_id') {
                out.push(`database_id = ${JSON.stringify(spec.d1.validate(d1Id))}`);
                d1Seen = true;
            } else out.push(line);
            continue;
        }
        if (section === 'vars') {
            const entry = /^([A-Z0-9_]+)\s*=\s*"(.*)"\s*$/.exec(line);
            if (entry?.[1] === 'NEAR_RPC_URL') continue;
            if (entry && /<[^>]*>/.test(entry[2]) && !Object.hasOwn(spec.vars, entry[1])) fail(`config_placeholder_${entry[1]}`);
            if (entry && (spec.secrets.includes(entry[1]))) fail(`config_secret_in_vars_${entry[1]}`);
        }
        out.push(line);
    }
    if (!mainSeen) fail('config_main_missing');
    if (spec.d1 && !d1Seen) fail('config_d1_missing');
    return out.join('\n');
}

export function cardPath(mode, card = 'off') {
    if (!CARD_PATHS.includes(card)) fail('card_path_invalid');
    if (card !== 'off' && mode !== 'acceptance') fail('card_path_requires_acceptance');
    return card;
}

export function releaseVars(component, mode, card = 'off') {
    const spec = COMPONENTS[component] ?? fail('component_unknown');
    if (!MODES.includes(mode)) fail('mode_invalid');
    const flags = Object.fromEntries(spec.flags.map((flag) => [flag, mode === 'acceptance' ? 'true' : 'false']));
    if (component !== 'payment-service') return { ...spec.vars, ...flags };
    // The card path is its own switch: an acceptance release without it keeps every card route at 503.
    const cardVars = cardPath(mode, card) === 'sandbox'
        ? { CARD_PATH_ENABLED: 'true', PAYMENT_OPERATOR_ID: PAYMENT_OPERATOR, CLEENG_ENVIRONMENT: 'sandbox', CLEENG_PUBLISHER_ID: CLEENG_SANDBOX_PUBLISHER_ID }
        : { CARD_PATH_ENABLED: 'false' };
    return { ...spec.vars, ...flags, ...cardVars };
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Decode(value) {
    if (typeof value !== 'string' || !value || [...value].some((char) => !B58.includes(char))) fail('base58_invalid');
    let number = 0n;
    for (const char of value) number = number * 58n + BigInt(B58.indexOf(char));
    const bytes = [];
    while (number > 0n) {
        bytes.unshift(Number(number % 256n));
        number /= 256n;
    }
    for (const char of value) {
        if (char !== '1') break;
        bytes.unshift(0);
    }
    return Uint8Array.from(bytes);
}

export function base58Encode(bytes) {
    let number = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
    let out = '';
    while (number > 0n) {
        out = B58[Number(number % 58n)] + out;
        number /= 58n;
    }
    for (const byte of bytes) {
        if (byte !== 0) break;
        out = `1${out}`;
    }
    return out;
}

const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/** NEAR `ed25519:<base58 seed||public>` secret key -> `ed25519:<base58 public>`, checking both halves agree. */
export function nearPublicKey(secret) {
    if (typeof secret !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(secret)) fail('near_secret_key_invalid');
    const bytes = base58Decode(secret.slice('ed25519:'.length));
    if (bytes.length !== 64) fail('near_secret_key_invalid');
    const derived = createPublicKey(createPrivateKey({
        key: Buffer.concat([ED25519_PKCS8_PREFIX, bytes.subarray(0, 32)]), format: 'der', type: 'pkcs8',
    })).export({ format: 'jwk' }).x;
    if (Buffer.from(derived, 'base64url').compare(Buffer.from(bytes.subarray(32))) !== 0) fail('near_secret_key_mismatch');
    return `ed25519:${base58Encode(bytes.subarray(32))}`;
}

export function validateRpcUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        fail('near_rpc_url_invalid');
    }
    if (value !== value.trim() || /[<>\s]|replace|placeholder/i.test(value) || url.protocol !== 'https:'
        || url.username || url.password || url.hash || url.hostname === 'rpc.testnet.near.org') fail('near_rpc_url_invalid');
    return value;
}

/** Reads and checks the deploy job's environment; nothing here is echoed. */
export function releaseSecrets(env, card = 'off') {
    if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? '') || !env.CLOUDFLARE_API_TOKEN?.trim()) fail('cloudflare_credentials_invalid');
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(env.RELAYER_ADMIN_TOKEN ?? '')) fail('relayer_admin_token_invalid');
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(env.REFUND_ADMIN_TOKEN ?? '')) fail('refund_admin_token_invalid');
    if (env.REFUND_ADMIN_TOKEN === env.RELAYER_ADMIN_TOKEN) fail('admin_tokens_must_differ');
    const rpc = validateRpcUrl(env.NEAR_RPC_URL ?? '');
    const payment = { NEAR_RPC_URL: rpc, VAT_SIGNER_PRIVATE_KEY: env.VAT_SIGNER_PRIVATE_KEY, REFUND_ADMIN_TOKEN: env.REFUND_ADMIN_TOKEN };
    let cardOperatorPublicKey = null;
    if (card === 'sandbox') {
        cardOperatorPublicKey = nearPublicKey(env.PAYMENT_OPERATOR_PRIVATE_KEY);
        if (!/^[0-9a-f]{64}$/.test(env.CARD_REFERENCE_SECRET ?? '')) fail('card_reference_secret_invalid');
        if (!/^[\x21-\x7e]{16,4096}$/.test(env.CLEENG_PUBLISHER_TOKEN ?? '')) fail('cleeng_publisher_token_invalid');
        if (!/^whsec_[A-Za-z0-9+/=_-]{16,200}$/.test(env.CLEENG_WEBHOOK_SECRET ?? '')) fail('cleeng_webhook_secret_invalid');
        Object.assign(payment, {
            PAYMENT_OPERATOR_PRIVATE_KEY: env.PAYMENT_OPERATOR_PRIVATE_KEY, CARD_REFERENCE_SECRET: env.CARD_REFERENCE_SECRET,
            CLEENG_PUBLISHER_TOKEN: env.CLEENG_PUBLISHER_TOKEN, CLEENG_WEBHOOK_SECRET: env.CLEENG_WEBHOOK_SECRET,
        });
    }
    return {
        cloudflare: { accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN },
        rpc,
        relayerPublicKey: nearPublicKey(env.RELAYER_PRIVATE_KEY),
        vatPublicKey: nearPublicKey(env.VAT_SIGNER_PRIVATE_KEY),
        cardOperatorPublicKey,
        relayer: { NEAR_RPC_URL: rpc, RELAYER_PRIVATE_KEY: env.RELAYER_PRIVATE_KEY, RELAYER_ADMIN_TOKEN: env.RELAYER_ADMIN_TOKEN },
        'payment-service': payment,
        'read-model': { READ_MODEL_NEAR_RPC_URL: rpc },
    };
}

async function rpcQuery(fetchImpl, rpc, params) {
    const response = await fetchImpl(rpc, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'v2-testnet-release', method: 'query', params: { finality: 'final', ...params } }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) fail('rpc_unavailable');
    return body;
}

/** Refuses to deploy keys the chain does not already hold: relayer full access, VAT key version 1 on Market V2. */
export async function preflight(secrets, fetchImpl) {
    const status = await (await fetchImpl(secrets.rpc, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'v2-testnet-release', method: 'status', params: [] }),
    })).json().catch(() => null);
    if (status?.result?.chain_id !== 'testnet') fail('rpc_network');
    const key = await rpcQuery(fetchImpl, secrets.rpc, {
        request_type: 'view_access_key', account_id: RELAYER, public_key: secrets.relayerPublicKey,
    });
    if (key.result?.permission !== 'FullAccess') fail('relayer_key_not_on_chain');
    const vat = await rpcQuery(fetchImpl, secrets.rpc, {
        request_type: 'call_function', account_id: MARKET_V2, method_name: 'get_vat_public_key',
        args_base64: Buffer.from(JSON.stringify({ key_version: Number(VAT_KEY_VERSION) })).toString('base64'),
    });
    let registered = null;
    try {
        registered = JSON.parse(Buffer.from(vat.result.result).toString());
    } catch {
        fail('vat_key_unreadable');
    }
    if (registered !== secrets.vatPublicKey) fail('vat_key_not_registered');
    if (!secrets.cardOperatorPublicKey) return;
    // The card key must be the E8.0 function-call key: Market V2 only, exactly the two card methods.
    const card = await rpcQuery(fetchImpl, secrets.rpc, {
        request_type: 'view_access_key', account_id: PAYMENT_OPERATOR, public_key: secrets.cardOperatorPublicKey,
    });
    const call = card.result?.permission?.FunctionCall;
    if (!call) fail(card.result?.permission === 'FullAccess' ? 'card_operator_key_full_access' : 'card_operator_key_not_on_chain');
    if (call.receiver_id !== MARKET_V2 || [...(call.method_names ?? [])].sort().join(',') !== [...CARD_OPERATOR_METHODS].sort().join(',')) {
        fail('card_operator_key_scope');
    }
}

export function wranglerArgs(component, releaseDir, sha, mode, card = 'off') {
    const spec = COMPONENTS[component] ?? fail('component_unknown');
    const dir = join(releaseDir, component);
    return [
        'deploy', join(dir, 'index.js'), '--no-bundle', '--config', join(dir, 'wrangler.toml'),
        '--name', spec.worker, '--domain', spec.domain,
        ...Object.entries(releaseVars(component, mode, card)).flatMap(([key, value]) => ['--var', `${key}:${value}`]),
        '--tag', sha, '--message', `YouTick v2-testnet ${mode}${card === 'off' ? '' : ` card-${card}`} ${sha}`,
    ];
}

export function runProcess(command, args, env) {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        child.stdout.on('data', (chunk) => process.stdout.write(chunk));
        child.stderr.on('data', (chunk) => {
            stderr += chunk;
            process.stderr.write(chunk);
        });
        child.once('error', rejectPromise);
        child.once('close', (code) => resolvePromise({ code, stderr }));
    });
}

/** Runs wrangler with only the Cloudflare credentials in its environment and returns the `deploy` output event. */
export function wranglerRunner(binary, cloudflare, tempRoot) {
    let call = 0;
    return async (args) => {
        call += 1;
        const output = join(tempRoot, `wrangler-${call}.ndjson`);
        const env = {
            PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', WRANGLER_SEND_METRICS: 'false',
            WRANGLER_OUTPUT_FILE_PATH: output,
            CLOUDFLARE_ACCOUNT_ID: cloudflare.accountId, CLOUDFLARE_API_TOKEN: cloudflare.apiToken,
        };
        const result = await runProcess(binary, args, env);
        if (result.code !== 0) fail(`wrangler_failed_${call}`);
        const events = (await readFile(output, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
        const deploys = events.filter((event) => event.type === 'deploy');
        if (deploys.length !== 1) fail('wrangler_deploy_output_invalid');
        return deploys[0];
    };
}

export async function request(fetchImpl, url, init) {
    try {
        const response = await fetchImpl(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = null;
        }
        return { status: response.status, origin: response.headers.get('access-control-allow-origin'), body };
    } catch {
        return { status: 0, origin: null, body: null };
    }
}

/**
 * Closed: every route answers 503 with the Worker's disabled error.
 * Acceptance: the allowed origin gets a CORS preflight, another origin is refused, and the payment
 * service reaches the chain with a registered VAT key (an unknown publication returns 404, not 503).
 */
export async function smoke(component, mode, fetchImpl, card = 'off') {
    const spec = COMPONENTS[component];
    const url = `https://${spec.domain}${spec.smokePath}`;
    if (component === 'read-model') {
        // The read model has no POST route to probe; its health names the instance it serves.
        const health = await request(fetchImpl, url, { method: 'GET' });
        if (health.status !== 200) fail(`read-model_smoke_health_${health.status}`);
        if (mode === 'closed') {
            if (health.body?.stage !== 'DISABLED') fail('read-model_smoke_closed');
            return { closed_status: health.status, stage: health.body.stage };
        }
        if (health.body?.stage !== 'ENABLED' || health.body.network !== 'testnet' || health.body.contractId !== MARKET_V2
            || health.body.startBlockHeight !== READ_MODEL_START_BLOCK_HEIGHT || health.body.ingestionEnabled !== true) {
            fail('read-model_smoke_identity');
        }
        return { health_status: health.status, stage: health.body.stage, ingestion_enabled: true };
    }
    const allowed = await request(fetchImpl, url, { method: 'OPTIONS', headers: { Origin: ACCEPTANCE_ORIGIN } });
    if (mode === 'closed') {
        if (allowed.status !== 503 || allowed.body?.error !== spec.disabledError) fail(`${component}_smoke_closed`);
        return { closed_status: allowed.status };
    }
    if (allowed.status !== 204 || allowed.origin !== ACCEPTANCE_ORIGIN) fail(`${component}_smoke_cors_${allowed.status}`);
    const denied = await request(fetchImpl, url, { method: 'OPTIONS', headers: { Origin: DENIED_ORIGIN } });
    if (denied.status !== 403 || denied.body?.error !== 'origin_denied') fail(`${component}_smoke_denied_${denied.status}`);
    const result = { allowed_origin_status: allowed.status, denied_origin_status: denied.status };
    if (component === 'relayer') {
        // The device routes are on: an unknown link id is 404, not 503 devices_disabled. Nothing is signed.
        const device = await request(fetchImpl, `https://${spec.domain}/v1/devices/status`, {
            method: 'POST', headers: { Origin: ACCEPTANCE_ORIGIN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_request_id: randomBytes(32).toString('hex') }),
        });
        if (device.status !== 404 || device.body?.error !== 'device_request_not_found') fail(`relayer_smoke_devices_${device.status}`);
        result.unknown_device_request_status = device.status;
    }
    if (component === 'payment-service') {
        const vat = await request(fetchImpl, url, {
            method: 'POST', headers: { Origin: ACCEPTANCE_ORIGIN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket_id: randomBytes(32).toString('hex'), publication_id: 'release-smoke' }),
        });
        if (vat.status !== 404 || vat.body?.error !== 'publication_not_found') fail(`payment-service_smoke_vat_${vat.status}`);
        result.unknown_publication_status = vat.status;
        // An unsigned webhook: 503 while the card path is off, 401 from the Cleeng adapter once it is on.
        const webhook = await request(fetchImpl, `https://${spec.domain}/webhooks/card`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        });
        const expected = card === 'sandbox' ? [401, 'invalid_webhook'] : [503, 'card_path_disabled'];
        if (webhook.status !== expected[0] || webhook.body?.error !== expected[1]) fail(`payment-service_smoke_card_${webhook.status}`);
        result.card_webhook_status = webhook.status;
    }
    return result;
}

export async function retry(fn, delays, sleep) {
    let last;
    for (const delay of delays) {
        if (delay) await sleep(delay);
        try {
            return await fn();
        } catch (error) {
            last = error;
        }
    }
    throw last;
}

// A new custom domain needs DNS and a certificate before it answers.
export const SMOKE_DELAYS_MS = [0, 5_000, 10_000, 15_000, 30_000, 30_000, 60_000];

export async function deployRelease({
    sha, releaseDir, receiptPath, mode, card = 'off', env = process.env, fetchImpl = fetch,
    sleep = (ms) => new Promise((done) => setTimeout(done, ms)), makeRunner,
}) {
    if (!/^[a-f0-9]{40}$/.test(sha ?? '')) fail('sha_invalid');
    if (!MODES.includes(mode)) fail('mode_invalid');
    cardPath(mode, card);
    const secrets = releaseSecrets(env, card);
    await preflight(secrets, fetchImpl);
    const receipt = { schema: 'youtick.v2-testnet-workers-receipt.v1', sha, mode, card, status: 'IN_PROGRESS', workers: [] };
    const save = () => writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o644 });
    const tempRoot = await mkdtemp(join(tmpdir(), 'youtick-v2-testnet-release-'));
    try {
        const run = makeRunner ? makeRunner(secrets.cloudflare, tempRoot) : wranglerRunner(
            resolve('workers/relayer/node_modules/.bin/wrangler'), secrets.cloudflare, tempRoot,
        );
        for (const component of Object.keys(COMPONENTS)) {
            const spec = COMPONENTS[component];
            const entry = { component, worker: spec.worker, domain: spec.domain, status: 'DEPLOYING' };
            receipt.workers.push(entry);
            await save();
            const secretsFile = join(tempRoot, `${component}-secrets.json`);
            await writeFile(secretsFile, JSON.stringify(secrets[component]), { flag: 'wx', mode: 0o600 });
            if (((await stat(secretsFile)).mode & 0o777) !== 0o600) fail('secrets_file_mode_invalid');
            let event;
            try {
                event = await run([...wranglerArgs(component, releaseDir, sha, mode, card), '--secrets-file', secretsFile]);
            } finally {
                await rm(secretsFile, { force: true });
            }
            if (event.worker_name !== spec.worker || typeof event.version_id !== 'string') fail(`${component}_deploy_output_invalid`);
            entry.version_id = event.version_id;
            entry.status = 'DEPLOYED';
            await save();
            entry.smoke = await retry(() => smoke(component, mode, fetchImpl, card), SMOKE_DELAYS_MS, sleep);
            entry.status = 'VERIFIED';
            await save();
        }
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
    if (command === 'write-config' && args.length === 2) {
        const [component, outdir] = args;
        const spec = COMPONENTS[component] ?? fail('component_unknown');
        await stat(join(outdir, 'index.js'));
        const source = await readFile(join(spec.dir, 'wrangler.toml'), 'utf8');
        const options = spec.d1 ? { d1Id: process.env[spec.d1.idEnv] } : {};
        if (spec.d1 && process.env.PAYMENTS_D1_ID && process.env.PAYMENTS_D1_ID === process.env.READ_MODEL_D1_ID) fail('d1_ids_must_differ');
        await writeFile(join(outdir, 'wrangler.toml'), sanitizeWranglerConfig(source, component, options), { flag: 'wx', mode: 0o644 });
        return;
    }
    if (command === 'check' && (args.length === 3 || args.length === 4)) {
        // Prepare job: the exact deploy invocation, as a dry run with no Cloudflare credentials.
        const [releaseDir, sha, mode, card = 'off'] = args;
        cardPath(mode, card);
        const binary = resolve('workers/relayer/node_modules/.bin/wrangler');
        for (const component of Object.keys(COMPONENTS)) {
            const result = await runProcess(binary, [...wranglerArgs(component, resolve(releaseDir), sha, mode, card), '--dry-run'], {
                PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', WRANGLER_SEND_METRICS: 'false',
            });
            if (result.code !== 0) fail(`${component}_dry_run_failed`);
        }
        return;
    }
    if (command === 'deploy' && (args.length === 4 || args.length === 5)) {
        const [sha, releaseDir, receiptPath, mode, card = 'off'] = args;
        const receipt = await deployRelease({ sha, releaseDir: resolve(releaseDir), receiptPath, mode, card });
        console.log(JSON.stringify({ status: receipt.status, workers: receipt.workers.map(({ worker, version_id }) => ({ worker, version_id })) }));
        return;
    }
    fail('usage');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(error instanceof Error ? error.message : 'v2_testnet_release_failed');
        process.exitCode = 1;
    });
}
