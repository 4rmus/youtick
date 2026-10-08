#!/usr/bin/env node
// V2 testnet release for the relayer and payment-service Workers (docs/v2-testnet-runbook.md, Workers).
// Run only by .github/workflows/deploy-v2-testnet.yml:
//   write-config <component> <dry-run-outdir>       prepare job, no secrets
//   deploy <sha> <release-dir> <receipt> <mode>     deploy job, environment v2-testnet
// The Worker bytes come from `wrangler deploy --dry-run --outdir` in the prepare job; this script never bundles.
import { createPrivateKey, createPublicKey, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

export const WRANGLER_VERSION = '4.147.0';
export const MODES = Object.freeze(['closed', 'acceptance']);
const PARENT = 'youtick-dev-v3.testnet';
const MARKET_V2 = `v2-market-261007.${PARENT}`;
const RELAYER = `v2-relayer-261007.${PARENT}`;
const CKD_GATE = `v2-ckd-gate-261007.${PARENT}`;
// The shared NEAR Auth testnet client only allows this origin (docs/v2-testnet-runbook.md).
export const ACCEPTANCE_ORIGIN = 'http://localhost:3000';
const DENIED_ORIGIN = 'https://release-smoke.invalid';
const VAT_KEY_VERSION = '1';

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
        secrets: Object.freeze(['NEAR_RPC_URL', 'VAT_SIGNER_PRIVATE_KEY']),
        smokePath: '/v1/vat-attestations',
        disabledError: 'payment_service_disabled',
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
export function sanitizeWranglerConfig(source, component) {
    const spec = COMPONENTS[component] ?? fail('component_unknown');
    const lines = source.split('\n');
    let section = '';
    let mainSeen = false;
    const out = [];
    for (const line of lines) {
        const header = /^\s*\[+([^\]]+)\]+\s*$/.exec(line);
        if (header) section = header[1].trim();
        if (!section && /^main\s*=/.test(line)) {
            out.push('main = "index.js"', 'workers_dev = false', 'preview_urls = false');
            mainSeen = true;
            continue;
        }
        if (!section && /^(workers_dev|preview_urls|routes|route)\s*=/.test(line)) fail('config_routing_unexpected');
        if (section === 'vars') {
            const entry = /^([A-Z0-9_]+)\s*=\s*"(.*)"\s*$/.exec(line);
            if (entry?.[1] === 'NEAR_RPC_URL') continue;
            if (entry && /<[^>]*>/.test(entry[2]) && !Object.hasOwn(spec.vars, entry[1])) fail(`config_placeholder_${entry[1]}`);
            if (entry && (spec.secrets.includes(entry[1]))) fail(`config_secret_in_vars_${entry[1]}`);
        }
        out.push(line);
    }
    if (!mainSeen) fail('config_main_missing');
    return out.join('\n');
}

export function releaseVars(component, mode) {
    const spec = COMPONENTS[component] ?? fail('component_unknown');
    if (!MODES.includes(mode)) fail('mode_invalid');
    const flags = Object.fromEntries(spec.flags.map((flag) => [flag, mode === 'acceptance' ? 'true' : 'false']));
    return { ...spec.vars, ...flags };
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
export function releaseSecrets(env) {
    if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? '') || !env.CLOUDFLARE_API_TOKEN?.trim()) fail('cloudflare_credentials_invalid');
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(env.RELAYER_ADMIN_TOKEN ?? '')) fail('relayer_admin_token_invalid');
    const rpc = validateRpcUrl(env.NEAR_RPC_URL ?? '');
    return {
        cloudflare: { accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN },
        rpc,
        relayerPublicKey: nearPublicKey(env.RELAYER_PRIVATE_KEY),
        vatPublicKey: nearPublicKey(env.VAT_SIGNER_PRIVATE_KEY),
        relayer: { NEAR_RPC_URL: rpc, RELAYER_PRIVATE_KEY: env.RELAYER_PRIVATE_KEY, RELAYER_ADMIN_TOKEN: env.RELAYER_ADMIN_TOKEN },
        'payment-service': { NEAR_RPC_URL: rpc, VAT_SIGNER_PRIVATE_KEY: env.VAT_SIGNER_PRIVATE_KEY },
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
}

export function wranglerArgs(component, releaseDir, sha, mode) {
    const spec = COMPONENTS[component] ?? fail('component_unknown');
    const dir = join(releaseDir, component);
    return [
        'deploy', join(dir, 'index.js'), '--no-bundle', '--config', join(dir, 'wrangler.toml'),
        '--name', spec.worker, '--domain', spec.domain,
        ...Object.entries(releaseVars(component, mode)).flatMap(([key, value]) => ['--var', `${key}:${value}`]),
        '--tag', sha, '--message', `YouTick v2-testnet ${mode} ${sha}`,
    ];
}

function runProcess(command, args, env) {
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

async function request(fetchImpl, url, init) {
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
export async function smoke(component, mode, fetchImpl) {
    const spec = COMPONENTS[component];
    const url = `https://${spec.domain}${spec.smokePath}`;
    const allowed = await request(fetchImpl, url, { method: 'OPTIONS', headers: { Origin: ACCEPTANCE_ORIGIN } });
    if (mode === 'closed') {
        if (allowed.status !== 503 || allowed.body?.error !== spec.disabledError) fail(`${component}_smoke_closed`);
        return { closed_status: allowed.status };
    }
    if (allowed.status !== 204 || allowed.origin !== ACCEPTANCE_ORIGIN) fail(`${component}_smoke_cors_${allowed.status}`);
    const denied = await request(fetchImpl, url, { method: 'OPTIONS', headers: { Origin: DENIED_ORIGIN } });
    if (denied.status !== 403 || denied.body?.error !== 'origin_denied') fail(`${component}_smoke_denied_${denied.status}`);
    const result = { allowed_origin_status: allowed.status, denied_origin_status: denied.status };
    if (component === 'payment-service') {
        const vat = await request(fetchImpl, url, {
            method: 'POST', headers: { Origin: ACCEPTANCE_ORIGIN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket_id: randomBytes(32).toString('hex'), publication_id: 'release-smoke' }),
        });
        if (vat.status !== 404 || vat.body?.error !== 'publication_not_found') fail(`payment-service_smoke_vat_${vat.status}`);
        result.unknown_publication_status = vat.status;
    }
    return result;
}

async function retry(fn, delays, sleep) {
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
const SMOKE_DELAYS_MS = [0, 5_000, 10_000, 15_000, 30_000, 30_000, 60_000];

export async function deployRelease({
    sha, releaseDir, receiptPath, mode, env = process.env, fetchImpl = fetch,
    sleep = (ms) => new Promise((done) => setTimeout(done, ms)), makeRunner,
}) {
    if (!/^[a-f0-9]{40}$/.test(sha ?? '')) fail('sha_invalid');
    if (!MODES.includes(mode)) fail('mode_invalid');
    const secrets = releaseSecrets(env);
    await preflight(secrets, fetchImpl);
    const receipt = { schema: 'youtick.v2-testnet-workers-receipt.v1', sha, mode, status: 'IN_PROGRESS', workers: [] };
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
                event = await run([...wranglerArgs(component, releaseDir, sha, mode), '--secrets-file', secretsFile]);
            } finally {
                await rm(secretsFile, { force: true });
            }
            if (event.worker_name !== spec.worker || typeof event.version_id !== 'string') fail(`${component}_deploy_output_invalid`);
            entry.version_id = event.version_id;
            entry.status = 'DEPLOYED';
            await save();
            entry.smoke = await retry(() => smoke(component, mode, fetchImpl), SMOKE_DELAYS_MS, sleep);
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
        await writeFile(join(outdir, 'wrangler.toml'), sanitizeWranglerConfig(source, component), { flag: 'wx', mode: 0o644 });
        return;
    }
    if (command === 'check' && args.length === 3) {
        // Prepare job: the exact deploy invocation, as a dry run with no Cloudflare credentials.
        const [releaseDir, sha, mode] = args;
        const binary = resolve('workers/relayer/node_modules/.bin/wrangler');
        for (const component of Object.keys(COMPONENTS)) {
            const result = await runProcess(binary, [...wranglerArgs(component, resolve(releaseDir), sha, mode), '--dry-run'], {
                PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', WRANGLER_SEND_METRICS: 'false',
            });
            if (result.code !== 0) fail(`${component}_dry_run_failed`);
        }
        return;
    }
    if (command === 'deploy' && args.length === 4) {
        const [sha, releaseDir, receiptPath, mode] = args;
        const receipt = await deployRelease({ sha, releaseDir: resolve(releaseDir), receiptPath, mode });
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
