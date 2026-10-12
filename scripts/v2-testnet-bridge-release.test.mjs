import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
    BRIDGE, CREATOR_ALLOWLIST, FIXED_VARS, FLAGS, JWT_PUBLIC_KEY, NEAR_AUTH_CREATOR_ALLOWLIST, OPERATOR_METHODS, RATE_LIMIT_NAMESPACE, SECRETS,
    WALLET_CREATOR_ALLOWLIST,
    deployRelease, jwtKeyMatches, quotePublicKey, releaseSecrets, releaseVars, sanitizeBridgeConfig, wranglerArgs,
} from './v2-testnet-bridge-release.mjs';
import { ACCEPTANCE_ORIGIN, MARKET_V2, base58Encode } from './v2-testnet-release.mjs';

const SHA = 'b'.repeat(40);

function nearKeyPair() {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const seed = Buffer.from(privateKey.export({ format: 'jwk' }).d, 'base64url');
    const pub = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
    return { secret: `ed25519:${base58Encode(Buffer.concat([seed, pub]))}`, public: `ed25519:${base58Encode(pub)}` };
}

/** Livepeer Studio hands out both halves as base64 of a PEM document. */
function livepeerSigningKey() {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const encode = (pem) => Buffer.from(pem).toString('base64');
    return {
        private: encode(privateKey.export({ format: 'pem', type: 'pkcs8' })),
        public: encode(publicKey.export({ format: 'pem', type: 'spki' })),
    };
}

function quoteKey() {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    return {
        private: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
        public: publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64'),
    };
}

const operator = nearKeyPair();
const jwt = livepeerSigningKey();
const quote = quoteKey();
const expected = { operator: operator.public, jwt: jwt.public, quote: quote.public };

function env(overrides = {}) {
    return {
        CLOUDFLARE_ACCOUNT_ID: 'c'.repeat(32), CLOUDFLARE_API_TOKEN: 'cf-token',
        NEAR_RPC_URL: 'https://rpc.testnet.example-provider.net/key',
        LIVEPEER_API_KEY: 'livepeer-api-key-value', LIVEPEER_WEBHOOK_SECRET: 'webhook-secret-value',
        LIVEPEER_JWT_PRIVATE_KEY: jwt.private, LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN: 'T'.repeat(64),
        NEAR_OPERATOR_PRIVATE_KEY: operator.secret, CREATOR_FEE_QUOTE_PRIVATE_KEY: quote.private,
        ...overrides,
    };
}

function jsonResponse(status, body, headers = {}) {
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

const HEALTHY = {
    status: 'ok', compactUpload: { version: 1, network: 'testnet', market: MARKET_V2 }, stage: 'ENABLED',
    newUploadReady: true, controlPlaneReady: true, playbackReady: true, operatorMutationEnabled: true,
    playbackV2Ready: false, webhookQueueReady: false, sponsoredUploadQuoteReady: false,
    uploadJobArchiveReady: false, operatorOutboxArchiveReady: false,
};

/** A chain and the deployed Bridge; `bridge` overrides what /__health reports. */
function fakeFetch({ methods = OPERATOR_METHODS, receiver = MARKET_V2, quoteVersion = 1, chainId = 'testnet', bridge = {}, v3Status = 400 } = {}) {
    const calls = [];
    const impl = async (url, init = {}) => {
        calls.push({ url, init });
        if (url.startsWith('https://rpc.')) {
            const body = JSON.parse(init.body);
            if (body.method === 'status') return jsonResponse(200, { result: { chain_id: chainId } });
            if (body.params.request_type === 'view_access_key') {
                return jsonResponse(200, body.params.public_key === operator.public && body.params.account_id === 'v2-bridge-261007.youtick-dev-v3.testnet'
                    ? { result: { permission: { FunctionCall: { receiver_id: receiver, method_names: methods, allowance: '1' } } } }
                    : { error: { cause: { name: 'UNKNOWN_ACCESS_KEY' } } });
            }
            return jsonResponse(200, { result: { result: [...Buffer.from(JSON.stringify(quoteVersion))] } });
        }
        const { pathname } = new URL(url);
        if (pathname === '/__health') return jsonResponse(200, { versionId: 'v-1', ...HEALTHY, ...bridge });
        const origin = init.headers?.Origin;
        if (origin !== ACCEPTANCE_ORIGIN) return jsonResponse(403, { error: 'origin_denied' });
        if (init.method === 'OPTIONS') return jsonResponse(204, undefined, { 'Access-Control-Allow-Origin': origin });
        return jsonResponse(v3Status, { error: 'invalid_request' }, { 'Access-Control-Allow-Origin': origin });
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

const deploy = (options) => deployRelease({ sha: SHA, releaseDir: '/r', sleep: async () => {}, expected, env: env(), ...options });

test('the repository Bridge config sanitizes to Market V2 vars with no Queue, D1 or shared rate-limit namespace', async () => {
    const source = await readFile(new URL(`../${BRIDGE.dir}/wrangler.toml`, import.meta.url), 'utf8');
    const config = sanitizeBridgeConfig(source);
    assert.match(config, /^main = "index\.js"\nworkers_dev = false\npreview_urls = false$/m);
    assert.doesNotMatch(config, /^NEAR_RPC_URL\s*=/m);
    assert.doesNotMatch(config, /<replace|queues|d1_databases|database_id|youtick-market-read-model/);
    assert.match(config, new RegExp(`^namespace_id = "${RATE_LIMIT_NAMESPACE}"$`, 'm'));
    assert.doesNotMatch(config, /namespace_id = "3001"/);
    for (const [key, value] of Object.entries(FIXED_VARS)) {
        const lines = config.split('\n').filter((line) => line.startsWith(`${key} = `));
        assert.deepEqual(lines, [`${key} = ${JSON.stringify(value)}`], key);
    }
    assert.match(config, /^MARKET_PROTOCOL = "v2"$/m);
    assert.match(config, /^VIDEO_ENVIRONMENT = "v2-testnet"$/m);
    assert.match(config, /^MARKET_V2_RELEASE_ENABLED = "false"$/m);
    assert.match(config, /^LIVEPEER_WEBHOOK_QUEUE_ENABLED = "false"$/m);
    assert.match(config, /^MULTI_ASSET_PAYMENTS_MODE = "off"$/m);
    assert.ok(config.includes(`LIVEPEER_CREATOR_ALLOWLIST = ${JSON.stringify(CREATOR_ALLOWLIST.join(','))}\n`));
    assert.match(config, /^LIVEPEER_CREATOR_ALLOWLIST = "ticks\.testnet,soteri\.testnet,utick\.testnet[^"]*"$/m);
    assert.match(config, /\[\[durable_objects\.bindings\]\]\nname = "LIVEPEER_CONTROL"/);
    assert.throws(() => sanitizeBridgeConfig('main = "x"\n[vars]\nNEW_ID = "<replace-me>"\n[[ratelimits]]\nnamespace_id = "1"\n'), /config_placeholder_NEW_ID/);
    assert.throws(() => sanitizeBridgeConfig('main = "x"\n[vars]\nLIVEPEER_API_KEY = "k"\n[[ratelimits]]\nnamespace_id = "1"\n'), /config_secret_in_vars/);
    assert.throws(() => sanitizeBridgeConfig('main = "x"\nroute = "y"\n'), /config_routing_unexpected/);
    assert.throws(() => sanitizeBridgeConfig('main = "x"\n[vars]\n'), /config_rate_limit_missing/);
    assert.throws(() => sanitizeBridgeConfig('main = "x"\n[[ratelimits]]\nnamespace_id = "1"\n'), /config_vars_missing/);
    // [vars] as the last section still receives every fixed value.
    const last = sanitizeBridgeConfig('main = "x"\n[[ratelimits]]\nnamespace_id = "1"\n[vars]\nNEAR_NETWORK = "mainnet"\n');
    for (const [key, value] of Object.entries(FIXED_VARS)) assert.ok(last.includes(`${key} = ${JSON.stringify(value)}`), key);
});

test('the allowlist names accounts only and never a wildcard', () => {
    assert.ok(CREATOR_ALLOWLIST.length > 0);
    for (const account of CREATOR_ALLOWLIST) assert.match(account, /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/);
});

test('NEAR Auth creators are implicit accounts listed once, after the wallet accounts', () => {
    for (const account of NEAR_AUTH_CREATOR_ALLOWLIST) assert.match(account, /^[0-9a-f]{64}$/);
    for (const account of WALLET_CREATOR_ALLOWLIST) assert.doesNotMatch(account, /^[0-9a-f]{64}$/);
    assert.deepEqual([...CREATOR_ALLOWLIST], [...WALLET_CREATOR_ALLOWLIST, ...NEAR_AUTH_CREATOR_ALLOWLIST]);
    assert.equal(new Set(CREATOR_ALLOWLIST).size, CREATOR_ALLOWLIST.length);
});

test('closed turns every Bridge flag off and acceptance turns them on; only flags travel as --var', () => {
    assert.deepEqual(Object.values(releaseVars('closed')), FLAGS.map(() => 'false'));
    assert.deepEqual(Object.values(releaseVars('acceptance')), FLAGS.map(() => 'true'));
    assert.ok(FLAGS.includes('LIVEPEER_PLAYBACK_V3_ENABLED'));
    for (const off of ['LIVEPEER_SPONSORED_UPLOADS_ENABLED', 'LIVEPEER_WEBHOOK_QUEUE_ENABLED', 'MARKET_V2_RELEASE_ENABLED']) {
        assert.ok(!FLAGS.includes(off), off);
    }
    assert.throws(() => releaseVars('open'), /mode_invalid/);
    const args = wranglerArgs('/r', SHA, 'acceptance');
    assert.deepEqual(args.slice(0, 9), ['deploy', '/r/index.js', '--no-bundle', '--config', '/r/wrangler.toml',
        '--name', 'youtick-livepeer-bridge-v2-testnet', '--domain', 'bridge-v2-testnet.youtick.net']);
    assert.ok(args.includes('LIVEPEER_BRIDGE_ENABLED:true'));
    assert.ok(!args.some((arg) => SECRETS.some((name) => arg.startsWith(`${name}:`))));
});

test('key checks: the Livepeer signing key pair, the quote key and the committed JWT public key', () => {
    assert.ok(jwtKeyMatches(jwt.private, jwt.public));
    assert.ok(!jwtKeyMatches(livepeerSigningKey().private, jwt.public));
    assert.ok(!jwtKeyMatches('not-a-key', jwt.public));
    assert.equal(quotePublicKey(quote.private), quote.public);
    assert.throws(() => quotePublicKey(jwt.private), /quote_key_invalid/);
    // The committed public key is a P-256 SPKI PEM, as the Bridge expects.
    assert.match(Buffer.from(JWT_PUBLIC_KEY, 'base64').toString(), /^-----BEGIN PUBLIC KEY-----\n[\s\S]+-----END PUBLIC KEY-----\n$/);
});

test('secrets: every value is checked against its expected public half before anything runs', () => {
    assert.deepEqual(Object.keys(releaseSecrets(env(), expected).worker).sort(), [...SECRETS].sort());
    for (const [overrides, error] of [
        [{ CLOUDFLARE_ACCOUNT_ID: 'x' }, /cloudflare_credentials_invalid/],
        [{ NEAR_RPC_URL: 'https://rpc.testnet.near.org' }, /near_rpc_url_invalid/],
        [{ LIVEPEER_API_KEY: 'short' }, /livepeer_api_key_invalid/],
        [{ LIVEPEER_WEBHOOK_SECRET: '15-bytes-secret' }, /livepeer_webhook_secret_invalid/],
        [{ LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN: 'short' }, /operator_token_invalid/],
        [{ LIVEPEER_JWT_PRIVATE_KEY: livepeerSigningKey().private }, /jwt_key_mismatch/],
        [{ NEAR_OPERATOR_PRIVATE_KEY: nearKeyPair().secret }, /operator_key_mismatch/],
        [{ CREATOR_FEE_QUOTE_PRIVATE_KEY: quoteKey().private }, /quote_key_mismatch/],
    ]) {
        assert.throws(() => releaseSecrets(env(overrides), expected), error, JSON.stringify(Object.keys(overrides)));
    }
});

test('acceptance deploy: preflight, one deploy with all seven secrets, smoke and a PASS receipt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v2-bridge-release-test-'));
    const receiptPath = join(dir, 'receipt.json');
    const record = [];
    const receipt = await deploy({ receiptPath, mode: 'acceptance', fetchImpl: fakeFetch().impl, makeRunner: fakeRunner(record) });
    assert.equal(receipt.status, 'PASS');
    assert.equal(receipt.version_id, 'v-1');
    assert.deepEqual(receipt.smoke, {
        health_status: 200, stage: 'ENABLED', allowed_origin_status: 204, denied_origin_status: 403, empty_v3_status: 400,
    });
    assert.equal(record.length, 1);
    assert.deepEqual(Object.keys(record[0].secrets).sort(), [...SECRETS].sort());
    const written = await readFile(receiptPath, 'utf8');
    for (const secret of [operator.secret, jwt.private, quote.private, 'T'.repeat(64), 'webhook-secret-value', 'livepeer-api-key-value', 'cf-token', 'example-provider']) {
        assert.ok(!written.includes(secret));
    }
    await assert.rejects(readdir(record[0].tempRoot), /ENOENT/);
});

test('closed deploy expects a DISABLED Bridge on the new version', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v2-bridge-release-test-'));
    const receipt = await deploy({
        receiptPath: join(dir, 'r.json'), mode: 'closed', fetchImpl: fakeFetch({ bridge: { stage: 'DISABLED' } }).impl, makeRunner: fakeRunner([]),
    });
    assert.deepEqual(receipt.smoke, { health_status: 200, stage: 'DISABLED' });
});

test('preflight refuses a chain without the exact operator key or quote key version, before wrangler', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v2-bridge-release-test-'));
    for (const [options, error] of [
        [{ methods: [...OPERATOR_METHODS, 'withdraw_creator_balance'] }, /operator_key_not_on_chain/],
        [{ methods: OPERATOR_METHODS.slice(1) }, /operator_key_not_on_chain/],
        [{ receiver: 'other.testnet' }, /operator_key_not_on_chain/],
        [{ quoteVersion: 2 }, /quote_key_version_mismatch/],
        [{ chainId: 'mainnet' }, /rpc_network/],
    ]) {
        const record = [];
        await assert.rejects(deploy({
            receiptPath: join(dir, 'r.json'), mode: 'acceptance', fetchImpl: fakeFetch(options).impl, makeRunner: fakeRunner(record),
        }), error);
        assert.equal(record.length, 0);
    }
});

test('a smoke that sees an old version, a wrong market, an open off-switch or a closed V3 gate fails the receipt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v2-bridge-release-test-'));
    for (const [options, error] of [
        [{ bridge: { versionId: 'v-old' } }, /smoke_version_200/],
        [{ bridge: { compactUpload: { network: 'testnet', market: 'v1.testnet' } } }, /smoke_market/],
        [{ bridge: { webhookQueueReady: true } }, /smoke_health_webhookQueueReady/],
        [{ bridge: { operatorMutationEnabled: false } }, /smoke_health_operatorMutationEnabled/],
        [{ v3Status: 503 }, /smoke_v3_503/],
    ]) {
        const receiptPath = join(dir, 'r.json');
        await assert.rejects(deploy({ receiptPath, mode: 'acceptance', fetchImpl: fakeFetch(options).impl, makeRunner: fakeRunner([]) }), error);
        assert.equal(JSON.parse(await readFile(receiptPath, 'utf8')).status, 'FAILED');
    }
});
