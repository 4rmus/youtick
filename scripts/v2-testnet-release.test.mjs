import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
    ACCEPTANCE_ORIGIN, COMPONENTS, base58Decode, base58Encode, deployRelease, nearPublicKey, releaseSecrets,
    releaseVars, sanitizeWranglerConfig, validateRpcUrl, wranglerArgs,
} from './v2-testnet-release.mjs';

const SHA = 'a'.repeat(40);

function nearKeyPair() {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const seed = Buffer.from(privateKey.export({ format: 'jwk' }).d, 'base64url');
    const pub = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
    return { secret: `ed25519:${base58Encode(Buffer.concat([seed, pub]))}`, public: `ed25519:${base58Encode(pub)}`, seed, pub };
}

const relayerKey = nearKeyPair();
const vatKey = nearKeyPair();

function env(overrides = {}) {
    return {
        CLOUDFLARE_ACCOUNT_ID: 'c'.repeat(32), CLOUDFLARE_API_TOKEN: 'cf-token',
        NEAR_RPC_URL: 'https://rpc.testnet.example-provider.net/key',
        RELAYER_PRIVATE_KEY: relayerKey.secret, RELAYER_ADMIN_TOKEN: 'A'.repeat(48), VAT_SIGNER_PRIVATE_KEY: vatKey.secret,
        ...overrides,
    };
}

function jsonResponse(status, body, headers = {}) {
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

/** A chain and two deployed Workers; `workers` decides how each domain answers. */
function fakeFetch({ vatOnChain = vatKey.public, relayerKeyOnChain = true, chainId = 'testnet', workers = 'acceptance' } = {}) {
    const calls = [];
    const impl = async (url, init = {}) => {
        calls.push({ url, init });
        if (url.startsWith('https://rpc.')) {
            const body = JSON.parse(init.body);
            if (body.method === 'status') return jsonResponse(200, { result: { chain_id: chainId } });
            if (body.params.request_type === 'view_access_key') {
                return jsonResponse(200, relayerKeyOnChain && body.params.public_key === relayerKey.public
                    ? { result: { permission: 'FullAccess' } } : { error: { cause: { name: 'UNKNOWN_ACCESS_KEY' } } });
            }
            return jsonResponse(200, { result: { result: [...Buffer.from(JSON.stringify(vatOnChain))] } });
        }
        const { hostname } = new URL(url);
        const component = Object.keys(COMPONENTS).find((name) => COMPONENTS[name].domain === hostname);
        if (workers === 'closed') return jsonResponse(503, { error: COMPONENTS[component].disabledError });
        const origin = init.headers?.Origin;
        if (origin !== ACCEPTANCE_ORIGIN) return jsonResponse(403, { error: 'origin_denied' });
        if (init.method === 'OPTIONS') return jsonResponse(204, undefined, { 'Access-Control-Allow-Origin': origin });
        return jsonResponse(404, { error: 'publication_not_found' }, { 'Access-Control-Allow-Origin': origin });
    };
    return { impl, calls };
}

function fakeRunner(record) {
    return (_cloudflare, tempRoot) => async (args) => {
        const secretsFile = args[args.indexOf('--secrets-file') + 1];
        record.push({ args, secrets: JSON.parse(await readFile(secretsFile, 'utf8')), tempRoot });
        return { type: 'deploy', worker_name: args[args.indexOf('--name') + 1], version_id: `v-${record.length}` };
    };
}

test('the repository wrangler configs sanitize to index.js, no workers.dev and no RPC URL var', async () => {
    for (const [component, spec] of Object.entries(COMPONENTS)) {
        const source = await readFile(new URL(`../${spec.dir}/wrangler.toml`, import.meta.url), 'utf8');
        const config = sanitizeWranglerConfig(source, component);
        assert.match(config, /^main = "index\.js"\nworkers_dev = false\npreview_urls = false$/m);
        assert.doesNotMatch(config, /^NEAR_RPC_URL\s*=/m);
        assert.doesNotMatch(config, /src\/index\.ts/);
        // Every remaining placeholder is replaced by a release var.
        for (const [, key] of config.matchAll(/^([A-Z0-9_]+)\s*=\s*"[^"]*<[^"]*"$/gm)) assert.ok(Object.hasOwn(spec.vars, key), key);
    }
    assert.throws(() => sanitizeWranglerConfig('main = "x"\n[vars]\nNEW_ID = "<replace-me>"\n', 'relayer'), /config_placeholder_NEW_ID/);
    assert.throws(() => sanitizeWranglerConfig('main = "x"\n[vars]\nRELAYER_PRIVATE_KEY = "ed25519:x"\n', 'relayer'), /config_secret_in_vars/);
    assert.throws(() => sanitizeWranglerConfig('main = "x"\nworkers_dev = true\n', 'relayer'), /config_routing_unexpected/);
    assert.throws(() => sanitizeWranglerConfig('[vars]\n', 'relayer'), /config_main_missing/);
});

test('closed mode turns every Worker flag off and acceptance turns it on; public vars are fixed', () => {
    assert.deepEqual(releaseVars('relayer', 'closed'), {
        ...COMPONENTS.relayer.vars, RELAYER_ENABLED: 'false', RELAYER_MUTATIONS_ENABLED: 'false',
    });
    assert.equal(releaseVars('payment-service', 'acceptance').PAYMENT_SERVICE_ENABLED, 'true');
    assert.equal(COMPONENTS.relayer.vars.CKD_GATE_ACCOUNT_IDS, 'v2-ckd-gate-261007.youtick-dev-v3.testnet');
    assert.throws(() => releaseVars('relayer', 'open'), /mode_invalid/);
    const args = wranglerArgs('relayer', '/r', SHA, 'acceptance');
    assert.deepEqual(args.slice(0, 9), ['deploy', '/r/relayer/index.js', '--no-bundle', '--config', '/r/relayer/wrangler.toml',
        '--name', 'youtick-relayer-v2-testnet', '--domain', 'relayer-v2-testnet.youtick.net']);
    assert.ok(args.includes(`ALLOWED_ORIGINS:${ACCEPTANCE_ORIGIN}`));
    assert.ok(!args.some((arg) => /PRIVATE_KEY|ADMIN_TOKEN|NEAR_RPC_URL/.test(arg)));
});

test('NEAR keys: base58 round trip, public key derived from the seed, mismatched halves refused', () => {
    assert.deepEqual([...base58Decode(base58Encode(Uint8Array.from([0, 0, 1, 255])))], [0, 0, 1, 255]);
    assert.equal(nearPublicKey(relayerKey.secret), relayerKey.public);
    const forged = `ed25519:${base58Encode(Buffer.concat([relayerKey.seed, vatKey.pub]))}`;
    assert.throws(() => nearPublicKey(forged), /near_secret_key_mismatch/);
    assert.throws(() => nearPublicKey('ed25519:short'), /near_secret_key_invalid/);
});

test('secrets: Cloudflare, admin token and RPC URL are validated', () => {
    assert.equal(releaseSecrets(env()).relayerPublicKey, relayerKey.public);
    assert.throws(() => releaseSecrets(env({ CLOUDFLARE_ACCOUNT_ID: 'x' })), /cloudflare_credentials_invalid/);
    assert.throws(() => releaseSecrets(env({ RELAYER_ADMIN_TOKEN: 'short' })), /relayer_admin_token_invalid/);
    for (const url of ['http://rpc.example.net', 'https://<replace-with-rpc>', 'https://rpc.testnet.near.org', 'https://u:p@rpc.x.net']) {
        assert.throws(() => validateRpcUrl(url), /near_rpc_url_invalid/, url);
    }
});

test('acceptance deploy: preflight, one deploy per Worker with its own secrets, smoke and a PASS receipt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v2-release-test-'));
    const receiptPath = join(dir, 'receipt.json');
    const record = [];
    const { impl } = fakeFetch();
    const receipt = await deployRelease({
        sha: SHA, releaseDir: '/r', receiptPath, mode: 'acceptance', env: env(), fetchImpl: impl,
        sleep: async () => {}, makeRunner: fakeRunner(record),
    });
    assert.equal(receipt.status, 'PASS');
    assert.deepEqual(receipt.workers.map((w) => [w.worker, w.status, w.version_id]), [
        ['youtick-relayer-v2-testnet', 'VERIFIED', 'v-1'], ['youtick-payment-service-v2-testnet', 'VERIFIED', 'v-2'],
    ]);
    assert.equal(receipt.workers[1].smoke.unknown_publication_status, 404);
    assert.deepEqual(Object.keys(record[0].secrets).sort(), ['NEAR_RPC_URL', 'RELAYER_ADMIN_TOKEN', 'RELAYER_PRIVATE_KEY']);
    assert.deepEqual(Object.keys(record[1].secrets).sort(), ['NEAR_RPC_URL', 'VAT_SIGNER_PRIVATE_KEY']);
    const written = await readFile(receiptPath, 'utf8');
    for (const secret of [relayerKey.secret, vatKey.secret, 'A'.repeat(48), 'cf-token', 'example-provider']) assert.ok(!written.includes(secret));
    await assert.rejects(readdir(record[0].tempRoot), /ENOENT/);
});

test('closed deploy expects 503 from both Workers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v2-release-test-'));
    const { impl } = fakeFetch({ workers: 'closed' });
    const receipt = await deployRelease({
        sha: SHA, releaseDir: '/r', receiptPath: join(dir, 'r.json'), mode: 'closed', env: env(), fetchImpl: impl,
        sleep: async () => {}, makeRunner: fakeRunner([]),
    });
    assert.deepEqual(receipt.workers.map((w) => w.smoke.closed_status), [503, 503]);
});

test('preflight refuses keys the chain does not hold, before any wrangler call', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v2-release-test-'));
    for (const [options, error] of [
        [{ vatOnChain: nearKeyPair().public }, /vat_key_not_registered/],
        [{ relayerKeyOnChain: false }, /relayer_key_not_on_chain/],
        [{ chainId: 'mainnet' }, /rpc_network/],
    ]) {
        const record = [];
        await assert.rejects(deployRelease({
            sha: SHA, releaseDir: '/r', receiptPath: join(dir, 'r.json'), mode: 'acceptance', env: env(),
            fetchImpl: fakeFetch(options).impl, sleep: async () => {}, makeRunner: fakeRunner(record),
        }), error);
        assert.equal(record.length, 0);
    }
});

test('a failing smoke marks the receipt FAILED and stops before the next Worker', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v2-release-test-'));
    const receiptPath = join(dir, 'r.json');
    const record = [];
    await assert.rejects(deployRelease({
        sha: SHA, releaseDir: '/r', receiptPath, mode: 'acceptance', env: env(),
        fetchImpl: fakeFetch({ workers: 'closed' }).impl, sleep: async () => {}, makeRunner: fakeRunner(record),
    }), /relayer_smoke_cors_503/);
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    assert.equal(receipt.status, 'FAILED');
    assert.deepEqual(receipt.workers.map((w) => w.status), ['DEPLOYED']);
    assert.equal(record.length, 1);
});
