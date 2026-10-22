import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
    BASE_SECRETS, BRIDGE, CREATOR_ALLOWLIST, DEFAULT_OPERATOR_KEY_SET, FIXED_VARS, FLAGS, NEAR_AUTH_CREATOR_ALLOWLIST, OPERATOR_KEY_METHOD_SETS,
    OPERATOR_METHODS, OPTIONAL_STREAM_SECRETS, RATE_LIMIT_NAMESPACE, READ_MODEL_D1_NAME, RELEASE_CRON, RETIRED_SECRETS, SECRETS, STREAM,
    STREAM_SECRETS, STREAM_SENTINELS, WALLET_CREATOR_ALLOWLIST,
    bridgeHost, bridgeVars, deployRelease, preflightStreamWebhook, webhookSecretPreflight, quotePublicKey, releaseSecrets, releaseStream, releaseVars, rsaKeyMatches,
    sanitizeBridgeConfig, setStreamOverride, streamFlag, streamSigningKeyFormat, streamWebhookUrl, wranglerArgs,
} from './v2-testnet-bridge-release.mjs';
import { ACCEPTANCE_ORIGIN, MARKET_V2, MEDIA_ACCOUNT, base58Encode, setMediaAccountOverride } from './v2-testnet-release.mjs';

const SHA = 'b'.repeat(40);
const D1_ID = '0123abcd-4567-89ef-0123-456789abcdef';
// Tests stand in a registered subdomain and check the sentinel on its own.
const MEDIA_SUBDOMAIN = 'youtick-media-test';
const BRIDGE_HOST = `youtick-livepeer-bridge-v2-testnet.${MEDIA_SUBDOMAIN}.workers.dev`;
setMediaAccountOverride({ workersSubdomain: MEDIA_SUBDOMAIN });

function nearKeyPair() {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const seed = Buffer.from(privateKey.export({ format: 'jwk' }).d, 'base64url');
    const pub = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
    return { secret: `ed25519:${base58Encode(Buffer.concat([seed, pub]))}`, public: `ed25519:${base58Encode(pub)}` };
}

/** A Cloudflare Stream signing key: POST /stream/keys hands out base64 of the private PEM and of a JWK. */
function streamSigningKey(modulusLength = 2048) {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength });
    const encode = (text) => Buffer.from(text).toString('base64');
    return {
        pkcs8: encode(privateKey.export({ format: 'pem', type: 'pkcs8' })),
        pkcs8Text: privateKey.export({ format: 'pem', type: 'pkcs8' }),
        pkcs1: encode(privateKey.export({ format: 'pem', type: 'pkcs1' })),
        jwk: encode(JSON.stringify(privateKey.export({ format: 'jwk' }))),
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
const quote = quoteKey();
const signing = streamSigningKey();
const expected = { operator: operator.public, quote: quote.public };
const CUSTOMER_CODE = 'f33zs165nr7gyfy4';
const KEY_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const STREAM_TOKEN = 'S'.repeat(40);
const WEBHOOK_SECRET = 'stream-webhook-secret-0123456789abcdef';
// The committed STREAM carries sentinels until the owner's commits; tests stand in filled-in constants.
const CONFIGURED_STREAM = { customerCode: CUSTOMER_CODE, signingKeyId: KEY_ID, signingPublicKey: signing.public };
setStreamOverride(CONFIGURED_STREAM);

function withStream(fields, run) {
    setStreamOverride({ ...CONFIGURED_STREAM, ...fields });
    try {
        return run();
    } finally {
        setStreamOverride(CONFIGURED_STREAM);
    }
}

function env(overrides = {}) {
    return {
        CLOUDFLARE_ACCOUNT_ID: MEDIA_ACCOUNT.accountId, CLOUDFLARE_API_TOKEN: 'cf-token',
        NEAR_RPC_URL: 'https://rpc.testnet.example-provider.net/key',
        LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN: 'T'.repeat(64),
        NEAR_OPERATOR_PRIVATE_KEY: operator.secret, CREATOR_FEE_QUOTE_PRIVATE_KEY: quote.private,
        STREAM_API_TOKEN: STREAM_TOKEN, STREAM_WEBHOOK_SECRET: WEBHOOK_SECRET, STREAM_SIGNING_KEY_PEM: signing.pkcs8,
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
    streamConfigured: true, stream: { openReservedSeconds: 0, reservationBudgetSeconds: 7200, storageMinutesCapacity: 1000 },
};
const STREAM_WEBHOOK_API = `https://api.cloudflare.com/client/v4/accounts/${MEDIA_ACCOUNT.accountId}/stream/webhook`;

/** A chain, the media account's Stream API and the deployed Bridge; `bridge` overrides /__health. */
function fakeFetch({
    methods = OPERATOR_METHODS, receiver = MARKET_V2, quoteVersion = 1, chainId = 'testnet', bridge = {}, v3Status = 400,
    webhook = {}, webhookStatus = 200, webhookSuccess = true,
} = {}) {
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
        if (url.startsWith('https://api.cloudflare.com/')) {
            if (url !== STREAM_WEBHOOK_API) return jsonResponse(404, { success: false });
            if (init.headers?.Authorization !== `Bearer ${STREAM_TOKEN}`) return jsonResponse(403, { success: false, errors: [{ code: 10000 }] });
            return jsonResponse(webhookStatus, {
                success: webhookSuccess, errors: [], messages: [],
                result: { notificationUrl: streamWebhookUrl(), modified: '2026-10-22T18:00:00.000000Z', ...webhook },
            });
        }
        // The Bridge answers only on its workers.dev host in the media account.
        const { hostname, pathname } = new URL(url);
        if (hostname !== BRIDGE_HOST) throw new TypeError(`fetch failed: unknown host ${hostname}`);
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
const acceptance = (options) => deploy({ mode: 'acceptance', streamEnabled: true, ...options });

test('the repository Bridge config sanitizes to Market V2 vars with no Queue, D1 or shared rate-limit namespace', async () => {
    const source = await readFile(new URL(`../${BRIDGE.dir}/wrangler.toml`, import.meta.url), 'utf8');
    const config = sanitizeBridgeConfig(source, { d1Id: D1_ID });
    // M1.5: the Bridge serves from the media account's workers.dev host, never from a route or preview URL.
    assert.match(config, /^main = "index\.js"\nworkers_dev = true\npreview_urls = false$/m);
    assert.equal(config.match(/^workers_dev\s*=/gm).length, 1);
    assert.doesNotMatch(config, /^routes?\s*=/m);
    assert.doesNotMatch(config, /^NEAR_RPC_URL\s*=/m);
    assert.doesNotMatch(config, /<replace|<record|<create|queues|50b1e14f|read-model-v1-testnet/);
    // W3: the V2 read-model database and the release cron, nothing from the V1 testnet.
    assert.equal(config.match(/\[\[d1_databases\]\]/g).length, 1);
    assert.match(config, /^binding = "MARKET_READ_MODEL"$/m);
    assert.match(config, new RegExp(`^database_name = "${READ_MODEL_D1_NAME}"$`, 'm'));
    assert.match(config, new RegExp(`^database_id = "${D1_ID}"$`, 'm'));
    assert.match(config, new RegExp(`^crons = \\["${RELEASE_CRON.replace(/\*/g, '\\*')}"\\]$`, 'm'));
    assert.throws(() => sanitizeBridgeConfig(source), /read_model_d1_id_invalid/);
    assert.throws(() => sanitizeBridgeConfig(source, { d1Id: '50b1e14f-2b06-444b-98cf-b828f11277ef' }), /read_model_d1_is_v1/);
    assert.match(config, new RegExp(`^namespace_id = "${RATE_LIMIT_NAMESPACE}"$`, 'm'));
    assert.doesNotMatch(config, /namespace_id = "3001"/);
    for (const [key, value] of Object.entries(bridgeVars())) {
        const lines = config.split('\n').filter((line) => line.startsWith(`${key} = `));
        assert.deepEqual(lines, [`${key} = ${JSON.stringify(value)}`], key);
    }
    assert.match(config, /^MARKET_PROTOCOL = "v2"$/m);
    assert.match(config, /^VIDEO_ENVIRONMENT = "v2-testnet"$/m);
    // W3: the release flag travels as a mode flag, not a fixed var.
    assert.doesNotMatch(config, /^MARKET_V2_RELEASE_ENABLED\s*=/m);
    assert.match(config, /^LIVEPEER_WEBHOOK_QUEUE_ENABLED = "false"$/m);
    assert.match(config, /^MULTI_ASSET_PAYMENTS_MODE = "off"$/m);
    assert.ok(config.includes(`LIVEPEER_CREATOR_ALLOWLIST = ${JSON.stringify(CREATOR_ALLOWLIST.join(','))}\n`));
    assert.match(config, /^LIVEPEER_CREATOR_ALLOWLIST = "ticks\.testnet,soteri\.testnet,utick\.testnet[^"]*"$/m);
    assert.match(config, /\[\[durable_objects\.bindings\]\]\nname = "LIVEPEER_CONTROL"/);
    // OD19: no Studio adapter configuration on the V2 Bridge; the Stream flag is off unless the release says so.
    for (const key of ['LIVEPEER_PROJECT_ID', 'LIVEPEER_API_TOKEN_NAME', 'LIVEPEER_JWT_PUBLIC_KEY', 'LIVEPEER_JWT_ISSUER']) {
        assert.match(config, new RegExp(`^${key} = ""$`, 'm'), key);
    }
    assert.match(config, /^MEDIA_PROVIDER_STREAM_ENABLED = "false"$/m);
    assert.match(config, new RegExp(`^STREAM_ACCOUNT_ID = "${MEDIA_ACCOUNT.accountId}"$`, 'm'));
    const on = sanitizeBridgeConfig(source, { d1Id: D1_ID, streamEnabled: true });
    assert.match(on, /^MEDIA_PROVIDER_STREAM_ENABLED = "true"$/m);
    assert.match(on, new RegExp(`^STREAM_CUSTOMER_CODE = "${CUSTOMER_CODE}"$`, 'm'));
    assert.match(on, new RegExp(`^STREAM_SIGNING_KEY_ID = "${KEY_ID}"$`, 'm'));
    assert.match(on, /^STREAM_MAX_DURATION_SECONDS = "7200"$/m);
    assert.throws(() => sanitizeBridgeConfig('main = "x"\n[vars]\nNEW_ID = "<replace-me>"\n[[ratelimits]]\nnamespace_id = "1"\n'), /config_placeholder_NEW_ID/);
    // NEAR_RPC_URL is dropped from [vars] and uploaded as a secret; every other secret name is refused there.
    for (const secret of [...SECRETS, ...RETIRED_SECRETS].filter((name) => name !== 'NEAR_RPC_URL')) {
        assert.throws(() => sanitizeBridgeConfig(`main = "x"\n[vars]\n${secret} = "k"\n[[ratelimits]]\nnamespace_id = "1"\n`), /config_secret_in_vars/, secret);
    }
    assert.throws(() => sanitizeBridgeConfig('main = "x"\nroute = "y"\n'), /config_routing_unexpected/);
    assert.throws(() => sanitizeBridgeConfig('main = "x"\nworkers_dev = false\n'), /config_routing_unexpected/);
    assert.throws(() => sanitizeBridgeConfig('main = "x"\n[vars]\n'), /config_rate_limit_missing/);
    assert.throws(() => sanitizeBridgeConfig('main = "x"\n[[ratelimits]]\nnamespace_id = "1"\n'), /config_vars_missing/);
    // [vars] as the last section still receives every fixed value.
    const last = sanitizeBridgeConfig('main = "x"\n[[ratelimits]]\nnamespace_id = "1"\n[vars]\nNEAR_NETWORK = "mainnet"\n', { d1Id: D1_ID });
    for (const [key, value] of Object.entries(bridgeVars())) assert.ok(last.includes(`${key} = ${JSON.stringify(value)}`), key);
});

test('STREAM_* placeholders in [vars] are FIXED_VARS keys or refused (correction 8)', () => {
    const stub = (vars) => `main = "x"\n[vars]\n${vars}\n[[ratelimits]]\nnamespace_id = "1"\n`;
    const streamKeys = Object.keys(FIXED_VARS).filter((key) => key.startsWith('STREAM_'));
    assert.deepEqual(streamKeys, [
        'STREAM_ACCOUNT_ID', 'STREAM_CUSTOMER_CODE', 'STREAM_SIGNING_KEY_ID', 'STREAM_SIGNING_PUBLIC_KEY', 'STREAM_MAX_DURATION_SECONDS',
        'STREAM_STORAGE_MINUTES_CAPACITY', 'STREAM_RESERVATION_SECONDS_BUDGET', 'STREAM_STUCK_TIMEOUT_MS',
    ]);
    // The placeholders the Bridge's wrangler.toml carries are replaced by the release values.
    const placeholders = streamKeys.map((key) => `${key} = "<replace-with-${key.toLowerCase()}>"`).join('\n');
    const config = sanitizeBridgeConfig(stub(`MEDIA_PROVIDER_STREAM_ENABLED = "false"\n${placeholders}`), { d1Id: D1_ID, streamEnabled: true });
    for (const [key, value] of Object.entries(bridgeVars({ streamEnabled: true }))) {
        assert.deepEqual(config.split('\n').filter((line) => line.startsWith(`${key} = `)), [`${key} = ${JSON.stringify(value)}`], key);
    }
    assert.doesNotMatch(config, /<replace/);
    // A Stream key the release does not know is a placeholder left behind.
    assert.throws(() => sanitizeBridgeConfig(stub('STREAM_WEBHOOK_URL = "<replace-with-stream-webhook-url>"'), { d1Id: D1_ID }),
        /config_placeholder_STREAM_WEBHOOK_URL/);
});

test('the Stream flag is a FIXED_VARS value set per release, never a mode flag; OD3 values', () => {
    assert.equal(FIXED_VARS.MEDIA_PROVIDER_STREAM_ENABLED, 'false');
    assert.ok(!FLAGS.includes('MEDIA_PROVIDER_STREAM_ENABLED'));
    assert.equal(releaseVars('acceptance').MEDIA_PROVIDER_STREAM_ENABLED, undefined);
    assert.equal(bridgeVars().MEDIA_PROVIDER_STREAM_ENABLED, 'false');
    assert.equal(bridgeVars({ streamEnabled: true }).MEDIA_PROVIDER_STREAM_ENABLED, 'true');
    assert.deepEqual([STREAM.maxDurationSeconds, STREAM.storageMinutesCapacity, STREAM.reservationSecondsBudget, STREAM.stuckTimeoutMs],
        ['7200', '1000', '7200', '900000']);
    // Stream lives in the media account (OD19): the same id as the Worker's account.
    assert.equal(FIXED_VARS.STREAM_ACCOUNT_ID, MEDIA_ACCOUNT.accountId);
    assert.equal(streamFlag('true'), true);
    assert.equal(streamFlag('false'), false);
    assert.equal(streamFlag(), false);
    for (const value of ['TRUE', '1', 'yes', '']) assert.throws(() => streamFlag(value), /stream_flag_invalid/, value);
    assert.throws(() => releaseStream('acceptance', false), /acceptance_requires_stream/);
    assert.equal(releaseStream('closed', false), false);
    assert.equal(releaseStream('closed', true), true);
    assert.throws(() => releaseStream('open', true), /mode_invalid/);
});

test('Stream constants: sentinels are empty with the flag off and refused with it on; filled values must be well-formed', () => {
    // The committed constants: the customer code is filled (dashboard read of 2026-10-22); the signing key
    // sentinels stay until the owner's one-line commit.
    assert.equal(STREAM.customerCode, '7v4my51gigdqb5jn');
    assert.equal(STREAM.signingKeyId, STREAM_SENTINELS.signingKey);
    assert.equal(STREAM.signingPublicKey, STREAM_SENTINELS.signingKey);
    withStream({ customerCode: STREAM.customerCode, signingKeyId: STREAM.signingKeyId, signingPublicKey: STREAM.signingPublicKey }, () => {
        const off = bridgeVars();
        assert.deepEqual([off.STREAM_CUSTOMER_CODE, off.STREAM_SIGNING_KEY_ID, off.STREAM_SIGNING_PUBLIC_KEY], ['7v4my51gigdqb5jn', '', '']);
        assert.throws(() => bridgeVars({ streamEnabled: true }), /stream_signing_key_unconfigured/);
    });
    for (const [fields, pattern] of [
        [{ customerCode: STREAM_SENTINELS.customerCode }, /stream_customer_code_unconfigured/],
        [{ signingKeyId: STREAM_SENTINELS.signingKey, signingPublicKey: STREAM_SENTINELS.signingKey }, /stream_signing_key_unconfigured/],
        [{ signingPublicKey: STREAM_SENTINELS.signingKey }, /stream_signing_public_key_unconfigured/],
    ]) {
        withStream(fields, () => assert.throws(() => bridgeVars({ streamEnabled: true }), pattern, JSON.stringify(fields)));
    }
    for (const [fields, pattern] of [
        [{ customerCode: 'Customer-Code' }, /stream_customer_code_invalid/],
        [{ signingKeyId: 'KEY' }, /stream_signing_key_invalid/],
        [{ signingPublicKey: 'not-a-key' }, /stream_signing_public_key_invalid/],
        // An EC or short RSA public half is not a Stream key.
        [{ signingPublicKey: Buffer.from(generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'pem', type: 'spki' })).toString('base64') },
            /stream_signing_public_key_invalid/],
        [{ signingPublicKey: Buffer.from(generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ format: 'pem', type: 'spki' })).toString('base64') },
            /stream_signing_public_key_invalid/],
        // 1..7200: the descriptor cap the Bridge enforces (OD3), not Stream's own 36000.
        [{ maxDurationSeconds: '7201' }, /stream_max_duration_invalid/],
        [{ maxDurationSeconds: '36000' }, /stream_max_duration_invalid/],
        [{ maxDurationSeconds: '0' }, /stream_max_duration_invalid/],
        [{ storageMinutesCapacity: '' }, /stream_storage_capacity_invalid/],
        [{ reservationSecondsBudget: '-1' }, /stream_reservation_budget_invalid/],
        [{ stuckTimeoutMs: '1.5' }, /stream_stuck_timeout_invalid/],
        // One upload at the cap must fit the reservation budget and the prepaid storage.
        [{ reservationSecondsBudget: '7199' }, /stream_limits_inconsistent/],
        [{ storageMinutesCapacity: '119' }, /stream_limits_inconsistent/],
    ]) {
        for (const streamEnabled of [false, true]) {
            withStream(fields, () => assert.throws(() => bridgeVars({ streamEnabled }), pattern, JSON.stringify(fields)));
        }
    }
    // Only one half of the key committed: refused with the flag off too (with it on the sentinel stops first).
    withStream({ signingKeyId: STREAM_SENTINELS.signingKey }, () => {
        assert.throws(() => bridgeVars(), /stream_signing_key_incomplete/);
        assert.throws(() => bridgeVars({ streamEnabled: true }), /stream_signing_key_unconfigured/);
    });
});

test('the Stream cap equals the descriptor cap once protocol/paid-media-v1 lands', {
    skip: !existsSync(new URL('../protocol/paid-media-v1/stream-profile.json', import.meta.url)) && 'descriptor written by the Bridge gate of M2',
}, () => {
    const descriptor = JSON.parse(readFileSync(new URL('../protocol/paid-media-v1/stream-profile.json', import.meta.url), 'utf8'));
    assert.equal(String(descriptor.stream.maxDurationSecondsCap), STREAM.maxDurationSeconds);
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
    assert.ok(FLAGS.includes('MARKET_V2_RELEASE_ENABLED'));
    assert.equal(releaseVars('acceptance').MARKET_V2_RELEASE_ENABLED, 'true');
    for (const off of ['LIVEPEER_SPONSORED_UPLOADS_ENABLED', 'LIVEPEER_WEBHOOK_QUEUE_ENABLED', 'MEDIA_PROVIDER_STREAM_ENABLED']) {
        assert.ok(!FLAGS.includes(off), off);
    }
    assert.throws(() => releaseVars('open'), /mode_invalid/);
    const args = wranglerArgs('/r', SHA, 'acceptance');
    assert.deepEqual(args.slice(0, 8), ['deploy', '/r/index.js', '--no-bundle', '--config', '/r/wrangler.toml',
        '--name', 'youtick-livepeer-bridge-v2-testnet', '--var']);
    assert.ok(!args.includes('--domain'));
    assert.ok(args.includes('LIVEPEER_BRIDGE_ENABLED:true'));
    assert.ok(!args.some((arg) => SECRETS.some((name) => arg.startsWith(`${name}:`))));
});

test('key checks: the Stream RS256 key (PKCS8 or JWK, never PKCS1) and the quote key', () => {
    assert.ok(rsaKeyMatches(signing.pkcs8, signing.public));
    assert.ok(rsaKeyMatches(signing.pkcs8Text, signing.public));
    // JWK fallback: the JWK POST /stream/keys returns, base64 or plain.
    assert.ok(rsaKeyMatches(signing.jwk, signing.public));
    assert.ok(rsaKeyMatches(Buffer.from(signing.jwk, 'base64').toString(), signing.public));
    assert.deepEqual([signing.pkcs8, signing.pkcs1, signing.jwk, 'garbage'].map(streamSigningKeyFormat), ['pkcs8', 'pkcs1', 'jwk', null]);
    assert.ok(!rsaKeyMatches(signing.pkcs1, signing.public));
    assert.ok(!rsaKeyMatches(streamSigningKey().pkcs8, signing.public));
    assert.ok(!rsaKeyMatches(streamSigningKey(1024).pkcs8, streamSigningKey(1024).public));
    const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    assert.ok(!rsaKeyMatches(Buffer.from(ec.privateKey.export({ format: 'pem', type: 'pkcs8' })).toString('base64'),
        Buffer.from(ec.publicKey.export({ format: 'pem', type: 'spki' })).toString('base64')));
    const publicJwk = Buffer.from(JSON.stringify(generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'jwk' }))).toString('base64');
    assert.ok(!rsaKeyMatches(publicJwk, signing.public));
    assert.ok(!rsaKeyMatches('not-a-key', signing.public));
    assert.ok(!rsaKeyMatches(signing.pkcs8, STREAM_SENTINELS.signingKey));
    assert.equal(quotePublicKey(quote.private), quote.public);
    assert.throws(() => quotePublicKey(signing.pkcs8), /quote_key_invalid/);
});

test('secrets with the Stream flag off: the base set only, Stream values ignored', () => {
    const secrets = releaseSecrets(env({ STREAM_API_TOKEN: 'x', STREAM_SIGNING_KEY_PEM: 'x' }), expected);
    assert.deepEqual(Object.keys(secrets.worker).sort(), [...BASE_SECRETS].sort());
    assert.equal(secrets.stream, null);
    // The retired Studio secrets are never deployed, even when the environment still holds them.
    const legacy = releaseSecrets(env({ LIVEPEER_API_KEY: 'livepeer-api-key-value', LIVEPEER_JWT_PRIVATE_KEY: 'x' }), expected);
    for (const name of RETIRED_SECRETS) assert.ok(!(name in legacy.worker), name);
    for (const [overrides, error] of [
        [{ CLOUDFLARE_ACCOUNT_ID: 'x' }, /cloudflare_credentials_invalid/],
        // The Bridge deploys only into the media account, never the default V2 account.
        [{ CLOUDFLARE_ACCOUNT_ID: 'c'.repeat(32) }, /cloudflare_account_not_media/],
        [{ NEAR_RPC_URL: 'https://rpc.testnet.near.org' }, /near_rpc_url_invalid/],
        [{ LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN: 'short' }, /operator_token_invalid/],
        [{ NEAR_OPERATOR_PRIVATE_KEY: nearKeyPair().secret }, /operator_key_mismatch/],
        [{ CREATOR_FEE_QUOTE_PRIVATE_KEY: quoteKey().private }, /quote_key_mismatch/],
    ]) {
        assert.throws(() => releaseSecrets(env(overrides), expected), error, JSON.stringify(Object.keys(overrides)));
    }
});

test('secrets with the Stream flag on: all three required, the signing key matches the committed public half', () => {
    const secrets = releaseSecrets(env(), expected, { streamEnabled: true });
    assert.deepEqual(Object.keys(secrets.worker).sort(), [...BASE_SECRETS, ...STREAM_SECRETS].sort());
    assert.deepEqual(secrets.stream, { accountId: MEDIA_ACCOUNT.accountId, apiToken: STREAM_TOKEN, webhookSecret: WEBHOOK_SECRET });
    const withPrevious = releaseSecrets(env({ STREAM_WEBHOOK_SECRET_PREVIOUS: 'previous-stream-secret-value' }), expected, { streamEnabled: true });
    assert.deepEqual(Object.keys(withPrevious.worker).sort(), [...BASE_SECRETS, ...STREAM_SECRETS, ...OPTIONAL_STREAM_SECRETS].sort());
    assert.equal(releaseSecrets(env({ STREAM_SIGNING_KEY_PEM: signing.jwk }), expected, { streamEnabled: true }).worker.STREAM_SIGNING_KEY_PEM, signing.jwk);
    for (const [overrides, error] of [
        [{ STREAM_API_TOKEN: undefined }, /stream_api_token_invalid/],
        [{ STREAM_API_TOKEN: 'short-token' }, /stream_api_token_invalid/],
        [{ STREAM_API_TOKEN: `${'S'.repeat(40)} ` }, /stream_api_token_invalid/],
        [{ STREAM_WEBHOOK_SECRET: undefined }, /stream_webhook_secret_invalid/],
        [{ STREAM_WEBHOOK_SECRET: '15-bytes-secret' }, /stream_webhook_secret_invalid/],
        [{ STREAM_WEBHOOK_SECRET: 'secret-with\nnewline-0123' }, /stream_webhook_secret_invalid/],
        [{ STREAM_WEBHOOK_SECRET_PREVIOUS: 'short' }, /stream_webhook_secret_previous_invalid/],
        [{ STREAM_WEBHOOK_SECRET_PREVIOUS: WEBHOOK_SECRET }, /stream_webhook_secret_previous_invalid/],
        [{ STREAM_SIGNING_KEY_PEM: undefined }, /stream_signing_key_mismatch/],
        [{ STREAM_SIGNING_KEY_PEM: signing.pkcs1 }, /stream_signing_key_pkcs1/],
        [{ STREAM_SIGNING_KEY_PEM: streamSigningKey().pkcs8 }, /stream_signing_key_mismatch/],
    ]) {
        assert.throws(() => releaseSecrets(env(overrides), expected, { streamEnabled: true }), error, JSON.stringify(overrides).slice(0, 80));
    }
    // A sentinel in the committed constants stops the release before any secret is compared.
    withStream({ customerCode: STREAM_SENTINELS.customerCode }, () => {
        assert.throws(() => releaseSecrets(env(), expected, { streamEnabled: true }), /stream_customer_code_unconfigured/);
    });
    withStream({ signingKeyId: STREAM_SENTINELS.signingKey, signingPublicKey: STREAM_SENTINELS.signingKey }, () => {
        assert.throws(() => releaseSecrets(env(), expected, { streamEnabled: true }), /stream_signing_key_unconfigured/);
    });
});

test('Stream webhook preflight: the media account webhook names this Bridge; the secret is compared only when returned', async () => {
    const stream = { accountId: MEDIA_ACCOUNT.accountId, apiToken: STREAM_TOKEN, webhookSecret: WEBHOOK_SECRET };
    assert.equal(streamWebhookUrl(), `https://${BRIDGE_HOST}/v1/stream-webhooks`);
    // M0-P4 UNPROVEN: GET may not return the secret; then the post-deploy webhook canary is the proof.
    assert.deepEqual(await preflightStreamWebhook(stream, fakeFetch().impl),
        { binding: 'matched', secret: 'not_returned', proof: 'post-deploy webhook canary (stream-canary webhook)' });
    assert.deepEqual(await preflightStreamWebhook(stream, fakeFetch({ webhook: { secret: WEBHOOK_SECRET } }).impl), { binding: 'matched', secret: 'matched' });
    const { impl, calls } = fakeFetch();
    await preflightStreamWebhook(stream, impl);
    assert.deepEqual(calls.map((call) => [call.url, call.init.headers.Authorization]), [[STREAM_WEBHOOK_API, `Bearer ${STREAM_TOKEN}`]]);
    for (const [options, pattern] of [
        [{ webhook: { secret: 'another-stream-secret-value' } }, /stream_webhook_secret_mismatch_or_masked/],
        [{ webhook: { notificationUrl: `https://${BRIDGE_HOST}/v1/livepeer-webhooks` } }, /stream_webhook_binding_mismatch/],
        [{ webhook: { notificationUrl: 'https://bridge-v2-testnet.youtick.net/v1/stream-webhooks' } }, /stream_webhook_binding_mismatch/],
        [{ webhook: { notificationUrl: undefined } }, /stream_webhook_binding_mismatch/],
        [{ webhookStatus: 404 }, /stream_webhook_unreadable_404/],
        [{ webhookSuccess: false }, /stream_webhook_unreadable/],
    ]) {
        await assert.rejects(preflightStreamWebhook(stream, fakeFetch(options).impl), pattern, JSON.stringify(options));
    }
    await assert.rejects(preflightStreamWebhook({ ...stream, apiToken: 'wrong-token-value-0123456789abcdef' }, fakeFetch().impl), /stream_webhook_unreadable_403/);
    // The documented override: the binding is still required, the (possibly masked) secret is not compared.
    assert.deepEqual(await preflightStreamWebhook(stream, fakeFetch({ webhook: { secret: '****' } }).impl, { secretPreflight: 'skip' }),
        { binding: 'matched', secret: 'secret-not-compared', proof: 'post-deploy webhook canary (stream-canary webhook)' });
    await assert.rejects(preflightStreamWebhook(stream, fakeFetch({ webhook: { notificationUrl: 'https://x.invalid/' } }).impl, { secretPreflight: 'skip' }),
        /stream_webhook_binding_mismatch/);
    assert.equal(webhookSecretPreflight(undefined), 'compare');
    assert.equal(webhookSecretPreflight(''), 'compare');
    assert.equal(webhookSecretPreflight('skip'), 'skip');
    assert.throws(() => webhookSecretPreflight('off'), /stream_webhook_secret_preflight_invalid/);
    await assert.rejects(preflightStreamWebhook(stream, async () => {
        throw new TypeError('fetch failed');
    }), /stream_webhook_unreadable$/);
});

test('media account: the Bridge host and the Stream webhook URL derive from the registered workers.dev subdomain', () => {
    assert.equal(BRIDGE.domain, undefined);
    assert.equal(bridgeHost(), BRIDGE_HOST);
    try {
        setMediaAccountOverride({ workersSubdomain: '<register-on-the-media-account>' });
        assert.throws(() => bridgeHost(), /media_account_unconfigured/);
        assert.throws(() => streamWebhookUrl(), /media_account_unconfigured/);
        assert.throws(() => releaseSecrets(env(), expected), /media_account_unconfigured/);
    } finally {
        setMediaAccountOverride({ workersSubdomain: MEDIA_SUBDOMAIN });
    }
});

test('the sentinel subdomain stops a Bridge deploy before preflight and wrangler', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v2-bridge-release-test-'));
    const record = [];
    const { impl, calls } = fakeFetch();
    try {
        setMediaAccountOverride({ workersSubdomain: '<register-on-the-media-account>' });
        await assert.rejects(deploy({ receiptPath: join(dir, 'r.json'), mode: 'closed', fetchImpl: impl, makeRunner: fakeRunner(record) }),
            /media_account_unconfigured/);
    } finally {
        setMediaAccountOverride({ workersSubdomain: MEDIA_SUBDOMAIN });
    }
    assert.equal(record.length, 0);
    assert.equal(calls.length, 0);
});

test('acceptance deploy on Stream: preflight, webhook check, one deploy with the Stream secrets, smoke and a PASS receipt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v2-bridge-release-test-'));
    const receiptPath = join(dir, 'receipt.json');
    const record = [];
    const { impl, calls } = fakeFetch();
    const receipt = await acceptance({ receiptPath, fetchImpl: impl, makeRunner: fakeRunner(record) });
    assert.equal(receipt.status, 'PASS');
    assert.equal(receipt.version_id, 'v-1');
    assert.equal(receipt.host, BRIDGE_HOST);
    assert.equal(receipt.operatorKeySet, 'neutral');
    assert.equal(receipt.operatorKeySetPolicy, 'any');
    assert.equal(receipt.streamEnabled, true);
    assert.deepEqual(receipt.streamWebhook, { binding: 'matched', secret: 'not_returned', proof: 'post-deploy webhook canary (stream-canary webhook)' });
    const saved = JSON.parse(await readFile(receiptPath, 'utf8'));
    assert.equal(saved.operatorKeySet, 'neutral');
    assert.equal(saved.streamEnabled, true);
    assert.deepEqual(receipt.smoke, {
        health_status: 200, stage: 'ENABLED', stream_configured: true, allowed_origin_status: 204, denied_origin_status: 403, empty_v3_status: 400,
    });
    assert.equal(record.length, 1);
    assert.deepEqual(Object.keys(record[0].secrets).sort(), [...BASE_SECRETS, ...STREAM_SECRETS].sort());
    // No Livepeer Studio endpoint is called by a V2 release any more.
    assert.ok(!calls.some((call) => call.url.includes('livepeer.studio')));
    const written = await readFile(receiptPath, 'utf8');
    for (const secret of [operator.secret, quote.private, 'T'.repeat(64), WEBHOOK_SECRET, STREAM_TOKEN, signing.pkcs8, 'cf-token', 'example-provider']) {
        assert.ok(!written.includes(secret));
    }
    await assert.rejects(readdir(record[0].tempRoot), /ENOENT/);
    const matched = await acceptance({ receiptPath, fetchImpl: fakeFetch({ webhook: { secret: WEBHOOK_SECRET } }).impl, makeRunner: fakeRunner([]) });
    assert.deepEqual(matched.streamWebhook, { binding: 'matched', secret: 'matched' });
    const skipped = await acceptance({
        receiptPath, secretPreflight: 'skip', fetchImpl: fakeFetch({ webhook: { secret: 'masked' } }).impl, makeRunner: fakeRunner([]),
    });
    assert.equal(skipped.streamWebhook.secret, 'secret-not-compared');
    assert.equal(skipped.streamWebhookSecretPreflight, 'skip');
    const savedSkip = JSON.parse(await readFile(receiptPath, 'utf8'));
    assert.equal(savedSkip.streamWebhook.secret, 'secret-not-compared');
    // An acceptance run without the comparison carries a visible warning; a compare run carries none.
    assert.match(savedSkip.warnings.join('\n'), /^stream_webhook_secret_not_compared: /);
    assert.equal(matched.warnings, undefined);
    assert.equal(matched.streamWebhookSecretPreflight, 'compare');
    const closedSkip = await deploy({
        receiptPath, mode: 'closed', streamEnabled: true, secretPreflight: 'skip',
        fetchImpl: fakeFetch({ bridge: { stage: 'DISABLED' } }).impl, makeRunner: fakeRunner([]),
    });
    assert.equal(closedSkip.warnings, undefined);
    await assert.rejects(acceptance({ receiptPath, secretPreflight: 'off', fetchImpl: fakeFetch().impl, makeRunner: fakeRunner([]) }),
        /stream_webhook_secret_preflight_invalid/);
});

test('acceptance without Stream is refused before any call; the Stream preflight refuses before wrangler', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v2-bridge-release-test-'));
    const { impl, calls } = fakeFetch();
    const record = [];
    await assert.rejects(deploy({ receiptPath: join(dir, 'r.json'), mode: 'acceptance', fetchImpl: impl, makeRunner: fakeRunner(record) }),
        /acceptance_requires_stream/);
    assert.equal(calls.length, 0);
    for (const [options, pattern] of [
        [{ webhook: { secret: 'another-stream-secret-value' } }, /stream_webhook_secret_mismatch/],
        [{ webhook: { notificationUrl: 'https://bridge-v2-testnet.youtick.net/v1/stream-webhooks' } }, /stream_webhook_binding_mismatch/],
        [{ webhookStatus: 404 }, /stream_webhook_unreadable_404/],
    ]) {
        await assert.rejects(acceptance({ receiptPath: join(dir, 'r.json'), fetchImpl: fakeFetch(options).impl, makeRunner: fakeRunner(record) }), pattern);
    }
    await assert.rejects(acceptance({
        receiptPath: join(dir, 'r.json'), env: env({ STREAM_SIGNING_KEY_PEM: streamSigningKey().pkcs8 }), fetchImpl: fakeFetch().impl, makeRunner: fakeRunner(record),
    }), /stream_signing_key_mismatch/);
    assert.equal(record.length, 0);
});

test('closed deploy without Stream: base secrets only, no Stream API call, DISABLED on the new version', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v2-bridge-release-test-'));
    const record = [];
    const { impl, calls } = fakeFetch({ bridge: { stage: 'DISABLED', streamConfigured: false } });
    const receipt = await deploy({ receiptPath: join(dir, 'r.json'), mode: 'closed', fetchImpl: impl, makeRunner: fakeRunner(record) });
    assert.deepEqual(receipt.smoke, { health_status: 200, stage: 'DISABLED', stream_configured: false });
    assert.equal(receipt.streamEnabled, false);
    assert.equal(receipt.streamWebhook, null);
    assert.deepEqual(Object.keys(record[0].secrets).sort(), [...BASE_SECRETS].sort());
    assert.ok(!calls.some((call) => call.url.startsWith('https://api.cloudflare.com/')));
    // A Bridge that reports Stream configured although the release turned it off did not get the flag.
    await assert.rejects(deploy({
        receiptPath: join(dir, 'r.json'), mode: 'closed', fetchImpl: fakeFetch({ bridge: { stage: 'DISABLED', streamConfigured: true } }).impl, makeRunner: fakeRunner([]),
    }), /smoke_stream_flag/);
    // Closed with Stream on checks the webhook and deploys the Stream secrets.
    const on = [];
    const closedOn = await deploy({
        receiptPath: join(dir, 'r.json'), mode: 'closed', streamEnabled: true, fetchImpl: fakeFetch({ bridge: { stage: 'DISABLED' } }).impl, makeRunner: fakeRunner(on),
    });
    assert.equal(closedOn.streamWebhook.binding, 'matched');
    assert.equal(closedOn.smoke.stream_configured, true);
    // Closed with Stream on still requires a configured adapter whose health block echoes the deployed limits.
    for (const [bridge, pattern] of [
        [{ stage: 'DISABLED', streamConfigured: false }, /smoke_health_streamConfigured/],
        [{ stage: 'DISABLED', stream: { reservationBudgetSeconds: 3600, storageMinutesCapacity: 1000 } }, /smoke_health_stream_reservation_budget/],
        [{ stage: 'DISABLED', stream: { reservationBudgetSeconds: 7200, storageMinutesCapacity: '1000' } }, /smoke_health_stream_storage_capacity/],
    ]) {
        await assert.rejects(deploy({
            receiptPath: join(dir, 'r.json'), mode: 'closed', streamEnabled: true, fetchImpl: fakeFetch({ bridge }).impl, makeRunner: fakeRunner([]),
        }), pattern);
    }
    assert.deepEqual(Object.keys(on[0].secrets).sort(), [...BASE_SECRETS, ...STREAM_SECRETS].sort());
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
        await assert.rejects(acceptance({ receiptPath: join(dir, 'r.json'), fetchImpl: fakeFetch(options).impl, makeRunner: fakeRunner(record) }), error);
        assert.equal(record.length, 0);
    }
});

test('a smoke that sees an old version, a wrong market, an open off-switch, no Stream or a closed V3 gate fails the receipt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v2-bridge-release-test-'));
    for (const [options, error] of [
        [{ bridge: { versionId: 'v-old' } }, /smoke_version_200/],
        [{ bridge: { compactUpload: { network: 'testnet', market: 'v1.testnet' } } }, /smoke_market/],
        [{ bridge: { webhookQueueReady: true } }, /smoke_health_webhookQueueReady/],
        [{ bridge: { operatorMutationEnabled: false } }, /smoke_health_operatorMutationEnabled/],
        [{ bridge: { streamConfigured: false } }, /smoke_health_streamConfigured/],
        [{ bridge: { streamConfigured: undefined } }, /smoke_health_streamConfigured/],
        [{ bridge: { stream: undefined } }, /smoke_health_stream$/],
        [{ bridge: { stream: [] } }, /smoke_health_stream$/],
        [{ v3Status: 503 }, /smoke_v3_503/],
    ]) {
        const receiptPath = join(dir, 'r.json');
        await assert.rejects(acceptance({ receiptPath, fetchImpl: fakeFetch(options).impl, makeRunner: fakeRunner([]) }), error);
        assert.equal(JSON.parse(await readFile(receiptPath, 'utf8')).status, 'FAILED');
    }
});

test('operator key sets: neutral and legacy during the transition, each pinnable, nothing else', async () => {
    assert.equal(DEFAULT_OPERATOR_KEY_SET, 'any');
    assert.deepEqual([...OPERATOR_KEY_METHOD_SETS.neutral], ['finalize_publication', 'suspend_sales', 'mark_watched', 'release_expired']);
    assert.deepEqual([...OPERATOR_KEY_METHOD_SETS.legacy], ['finalize_livepeer_publication', 'suspend_livepeer_sales', 'mark_watched', 'release_expired']);
    const neutral = [...OPERATOR_KEY_METHOD_SETS.neutral];
    const legacy = [...OPERATOR_KEY_METHOD_SETS.legacy];
    const cases = [
        // [methods on chain, policy, expected key set or error]
        [legacy, 'any', 'legacy'], [legacy, 'legacy', 'legacy'], [legacy, 'neutral', /operator_key_set_mismatch_legacy/],
        [neutral, 'any', 'neutral'], [neutral, 'neutral', 'neutral'], [neutral, 'legacy', /operator_key_set_mismatch_neutral/],
        // Order on chain does not matter.
        [[...legacy].reverse(), 'any', 'legacy'],
    ];
    // Mixed, partial or widened sets are refused under every policy.
    for (const methods of [
        ['finalize_publication', 'suspend_livepeer_sales', 'mark_watched', 'release_expired'],
        ['finalize_livepeer_publication', 'suspend_sales', 'mark_watched', 'release_expired'],
        legacy.slice(1), neutral.slice(0, 3), [...neutral, ...legacy.slice(0, 2)], [...legacy, 'withdraw_creator_balance'], [],
    ]) {
        for (const policy of ['any', 'neutral', 'legacy']) cases.push([methods, policy, /operator_key_not_on_chain/]);
    }
    for (const [methods, policy, outcome] of cases) {
        const dir = await mkdtemp(join(tmpdir(), 'v2-bridge-keyset-'));
        const receiptPath = join(dir, 'r.json');
        const record = [];
        const run = acceptance({ receiptPath, operatorKeySet: policy, fetchImpl: fakeFetch({ methods }).impl, makeRunner: fakeRunner(record) });
        const label = `${policy}: ${methods.join(',')}`;
        if (typeof outcome === 'string') {
            const receipt = await run;
            assert.equal(receipt.status, 'PASS', label);
            assert.equal(receipt.operatorKeySet, outcome, label);
            assert.equal(receipt.operatorKeySetPolicy, policy, label);
            assert.equal(JSON.parse(await readFile(receiptPath, 'utf8')).operatorKeySet, outcome, label);
        } else {
            await assert.rejects(run, outcome, label);
            assert.equal(record.length, 0, label);
        }
    }
    await assert.rejects(deploy({
        receiptPath: join(await mkdtemp(join(tmpdir(), 'v2-bridge-keyset-')), 'r.json'), mode: 'closed', operatorKeySet: 'both',
        fetchImpl: fakeFetch().impl, makeRunner: fakeRunner([]),
    }), /operator_key_set_invalid/);
});
