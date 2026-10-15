import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
    ACCEPTANCE_ORIGIN, CLEENG_SANDBOX_PUBLISHER_ID, COMPONENTS, PAYMENT_OPERATOR, READ_MODEL_D1_NAME, READ_MODEL_START_BLOCK_HEIGHT, base58Decode, base58Encode, deployRelease,
    nearPublicKey, paymentsD1Id, readModelD1Id, releaseSecrets, releaseVars, sanitizeWranglerConfig, validateRpcUrl, wranglerArgs,
} from './v2-testnet-release.mjs';

const SHA = 'a'.repeat(40);
const D1_ID = '0123abcd-4567-89ef-0123-456789abcdef';
const MARKET_V2 = COMPONENTS['read-model'].vars.READ_MODEL_CONTRACT_ID;

function nearKeyPair() {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const seed = Buffer.from(privateKey.export({ format: 'jwk' }).d, 'base64url');
    const pub = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
    return { secret: `ed25519:${base58Encode(Buffer.concat([seed, pub]))}`, public: `ed25519:${base58Encode(pub)}`, seed, pub };
}

const relayerKey = nearKeyPair();
const vatKey = nearKeyPair();
const cardKey = nearKeyPair();
const CARD_SECRETS = {
    PAYMENT_OPERATOR_PRIVATE_KEY: cardKey.secret, CARD_REFERENCE_SECRET: 'f'.repeat(64),
    CLEENG_PUBLISHER_TOKEN: 'cleeng-publisher-token-value', CLEENG_WEBHOOK_SECRET: 'whsec_PkPHH0UXY0ynbFB8jcyBjgI6VwN/y2vh+JdxD7QZtSA=',
};
const CARD_KEY_SCOPE = { FunctionCall: { allowance: '1000000000000000000000000', receiver_id: 'v2-market-261007.youtick-dev-v3.testnet', method_names: ['issue_card_ticket', 'void_card_ticket'] } };

function env(overrides = {}) {
    return {
        CLOUDFLARE_ACCOUNT_ID: 'c'.repeat(32), CLOUDFLARE_API_TOKEN: 'cf-token',
        NEAR_RPC_URL: 'https://rpc.testnet.example-provider.net/key',
        RELAYER_PRIVATE_KEY: relayerKey.secret, RELAYER_ADMIN_TOKEN: 'A'.repeat(48), REFUND_ADMIN_TOKEN: 'B'.repeat(48), VAT_SIGNER_PRIVATE_KEY: vatKey.secret,
        ...overrides,
    };
}

function jsonResponse(status, body, headers = {}) {
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

/** A chain and two deployed Workers; `workers` decides how each domain answers. */
function fakeFetch({ vatOnChain = vatKey.public, relayerKeyOnChain = true, chainId = 'testnet', workers = 'acceptance', card = 'off', cardPermission = CARD_KEY_SCOPE } = {}) {
    const calls = [];
    const impl = async (url, init = {}) => {
        calls.push({ url, init });
        if (url.startsWith('https://rpc.')) {
            const body = JSON.parse(init.body);
            if (body.method === 'status') return jsonResponse(200, { result: { chain_id: chainId } });
            if (body.params.request_type === 'view_access_key' && body.params.account_id === PAYMENT_OPERATOR) {
                return jsonResponse(200, cardPermission && body.params.public_key === cardKey.public
                    ? { result: { permission: cardPermission } } : { error: { cause: { name: 'UNKNOWN_ACCESS_KEY' } } });
            }
            if (body.params.request_type === 'view_access_key') {
                return jsonResponse(200, relayerKeyOnChain && body.params.public_key === relayerKey.public
                    ? { result: { permission: 'FullAccess' } } : { error: { cause: { name: 'UNKNOWN_ACCESS_KEY' } } });
            }
            return jsonResponse(200, { result: { result: [...Buffer.from(JSON.stringify(vatOnChain))] } });
        }
        const { hostname } = new URL(url);
        const component = Object.keys(COMPONENTS).find((name) => COMPONENTS[name].domain === hostname);
        if (component === 'read-model') {
            return jsonResponse(200, workers === 'closed' ? { status: 'ok', stage: 'DISABLED' } : {
                status: 'ok', stage: 'ENABLED', versionId: 'v-3', network: 'testnet', contractId: MARKET_V2,
                startBlockHeight: READ_MODEL_START_BLOCK_HEIGHT, ingestionEnabled: true, backfillEnabled: false,
            });
        }
        if (workers === 'closed') return jsonResponse(503, { error: COMPONENTS[component].disabledError });
        if (new URL(url).pathname === '/webhooks/card') {
            return card === 'sandbox' ? jsonResponse(401, { error: 'invalid_webhook' }) : jsonResponse(503, { error: 'card_path_disabled' });
        }
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
        const config = sanitizeWranglerConfig(source, component, { d1Id: D1_ID });
        assert.match(config, /^main = "index\.js"\nworkers_dev = false\npreview_urls = false$/m);
        assert.doesNotMatch(config, /^NEAR_RPC_URL\s*=/m);
        assert.doesNotMatch(config, /src\/index\.ts|worker\.mjs/);
        // Every remaining placeholder is replaced by a release var.
        for (const [, key] of config.matchAll(/^([A-Z0-9_]+)\s*=\s*"[^"]*<[^"]*"$/gm)) assert.ok(Object.hasOwn(spec.vars, key), key);
        if (component === 'read-model') {
            // The V2 instance keeps the one-minute cron and gets its own database, never the V1 testnet one.
            assert.match(config, /^crons = \["\* \* \* \* \*"\]$/m);
            assert.match(config, /^binding = "MARKET_READ_MODEL"$/m);
            assert.match(config, new RegExp(`^database_name = "${READ_MODEL_D1_NAME}"$`, 'm'));
            assert.match(config, new RegExp(`^database_id = "${D1_ID}"$`, 'm'));
            assert.doesNotMatch(config, /50b1e14f|read-model-v1-testnet/);
        } else if (component === 'payment-service') {
            // The refund inbox gets the V2 payments database; the all-zero placeholder never ships.
            assert.match(config, /^binding = "REFUNDS"$/m);
            assert.match(config, /^database_name = "youtick-payments-v2-testnet"$/m);
            assert.match(config, new RegExp(`^database_id = "${D1_ID}"$`, 'm'));
            assert.match(config, /^migrations_dir = "migrations"$/m);
            // The card operator ships with every release; it does nothing until the card path is on.
            assert.match(config, /^\[\[durable_objects\.bindings\]\]\nname = "CARD_OPERATOR"\nclass_name = "CardOperator"$/m);
            assert.match(config, /^new_sqlite_classes = \["CardOperator"\]$/m);
            assert.match(config, /^crons = \["\*\/5 \* \* \* \*"\]$/m);
            assert.doesNotMatch(config, /00000000-0000/);
        } else {
            assert.doesNotMatch(config, /d1_databases/);
        }
    }
    const readModel = await readFile(new URL('../read-model/wrangler.toml', import.meta.url), 'utf8');
    assert.throws(() => sanitizeWranglerConfig(readModel, 'read-model'), /read_model_d1_id_invalid/);
    assert.throws(() => sanitizeWranglerConfig(readModel, 'read-model', { d1Id: '50b1e14f-2b06-444b-98cf-b828f11277ef' }), /read_model_d1_is_v1/);
    assert.throws(() => sanitizeWranglerConfig('main = "x"\n[[d1_databases]]\nbinding = "X"\n', 'relayer'), /config_binding_unexpected/);
    assert.throws(() => sanitizeWranglerConfig('main = "x"\n[vars]\n', 'read-model', { d1Id: D1_ID }), /config_d1_missing/);
    assert.equal(readModelD1Id(D1_ID), D1_ID);
    const payments = await readFile(new URL('../workers/payment-service/wrangler.toml', import.meta.url), 'utf8');
    assert.throws(() => sanitizeWranglerConfig(payments, 'payment-service'), /payments_d1_id_invalid/);
    assert.throws(() => sanitizeWranglerConfig(payments, 'payment-service', { d1Id: '00000000-0000-0000-0000-000000000000' }), /payments_d1_id_invalid/);
    assert.throws(() => paymentsD1Id('50b1e14f-2b06-444b-98cf-b828f11277ef'), /payments_d1_is_v1_read_model/);
    assert.equal(paymentsD1Id(D1_ID), D1_ID);
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
    assert.deepEqual(releaseVars('read-model', 'acceptance'), {
        ...COMPONENTS['read-model'].vars, READ_MODEL_ENABLED: 'true', READ_MODEL_INGESTION_ENABLED: 'true',
    });
    assert.equal(releaseVars('read-model', 'closed').READ_MODEL_INGESTION_ENABLED, 'false');
    assert.equal(COMPONENTS['read-model'].vars.READ_MODEL_WEB_ORIGIN, ACCEPTANCE_ORIGIN);
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
    assert.throws(() => releaseSecrets(env({ REFUND_ADMIN_TOKEN: undefined })), /refund_admin_token_invalid/);
    assert.throws(() => releaseSecrets(env({ REFUND_ADMIN_TOKEN: 'A'.repeat(48) })), /admin_tokens_must_differ/);
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
        ['youtick-market-read-model-v2-testnet', 'VERIFIED', 'v-3'],
    ]);
    assert.equal(receipt.workers[1].smoke.unknown_publication_status, 404);
    assert.equal(receipt.workers[1].smoke.card_webhook_status, 503);
    assert.equal(receipt.card, 'off');
    assert.deepEqual(receipt.workers[2].smoke, { health_status: 200, stage: 'ENABLED', ingestion_enabled: true });
    assert.deepEqual(Object.keys(record[0].secrets).sort(), ['NEAR_RPC_URL', 'RELAYER_ADMIN_TOKEN', 'RELAYER_PRIVATE_KEY']);
    assert.deepEqual(Object.keys(record[1].secrets).sort(), ['NEAR_RPC_URL', 'REFUND_ADMIN_TOKEN', 'VAT_SIGNER_PRIVATE_KEY']);
    assert.deepEqual(record[2].secrets, { READ_MODEL_NEAR_RPC_URL: 'https://rpc.testnet.example-provider.net/key' });
    const written = await readFile(receiptPath, 'utf8');
    for (const secret of [relayerKey.secret, vatKey.secret, 'A'.repeat(48), 'B'.repeat(48), 'cf-token', 'example-provider']) assert.ok(!written.includes(secret));
    await assert.rejects(readdir(record[0].tempRoot), /ENOENT/);
});

test('closed deploy expects 503 from both Workers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v2-release-test-'));
    const { impl } = fakeFetch({ workers: 'closed' });
    const receipt = await deployRelease({
        sha: SHA, releaseDir: '/r', receiptPath: join(dir, 'r.json'), mode: 'closed', env: env(), fetchImpl: impl,
        sleep: async () => {}, makeRunner: fakeRunner([]),
    });
    assert.deepEqual(receipt.workers.map((w) => w.smoke.closed_status), [503, 503, 200]);
    assert.equal(receipt.workers[2].smoke.stage, 'DISABLED');
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

test('the card path is its own switch, acceptance only, with the sandbox publisher and the operator', () => {
    assert.equal(releaseVars('payment-service', 'acceptance').CARD_PATH_ENABLED, 'false');
    assert.equal(releaseVars('payment-service', 'closed').CARD_PATH_ENABLED, 'false');
    assert.deepEqual(releaseVars('payment-service', 'acceptance', 'sandbox'), {
        ...COMPONENTS['payment-service'].vars, PAYMENT_SERVICE_ENABLED: 'true', CARD_PATH_ENABLED: 'true',
        PAYMENT_OPERATOR_ID: 'v2-payments-261007.youtick-dev-v3.testnet', CLEENG_ENVIRONMENT: 'sandbox', CLEENG_PUBLISHER_ID: CLEENG_SANDBOX_PUBLISHER_ID,
    });
    assert.equal(releaseVars('relayer', 'acceptance', 'sandbox').CARD_PATH_ENABLED, undefined);
    assert.throws(() => releaseVars('payment-service', 'closed', 'sandbox'), /card_path_requires_acceptance/);
    assert.throws(() => releaseVars('payment-service', 'acceptance', 'production'), /card_path_invalid/);
    const args = wranglerArgs('payment-service', '/r', SHA, 'acceptance', 'sandbox');
    assert.ok(args.includes('CARD_PATH_ENABLED:true'));
    assert.ok(!args.some((arg) => /whsec_|cleeng-publisher-token|PRIVATE_KEY:/.test(arg)));
    // Card secrets are required only with the card path, and checked.
    assert.equal(releaseSecrets(env()).cardOperatorPublicKey, null);
    assert.equal(releaseSecrets(env(CARD_SECRETS), 'sandbox').cardOperatorPublicKey, cardKey.public);
    assert.throws(() => releaseSecrets(env(), 'sandbox'), /near_secret_key_invalid/);
    for (const [key, value, error] of [
        ['CARD_REFERENCE_SECRET', 'F'.repeat(64), /card_reference_secret_invalid/],
        ['CLEENG_PUBLISHER_TOKEN', 'short', /cleeng_publisher_token_invalid/],
        ['CLEENG_WEBHOOK_SECRET', 'not-a-whsec-value-at-all', /cleeng_webhook_secret_invalid/],
    ]) assert.throws(() => releaseSecrets(env({ ...CARD_SECRETS, [key]: value }), 'sandbox'), error, key);
});

test('card deploy: the operator key must be the function-call key, and the webhook answers 401 unsigned', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v2-release-test-'));
    const record = [];
    const receipt = await deployRelease({
        sha: SHA, releaseDir: '/r', receiptPath: join(dir, 'r.json'), mode: 'acceptance', card: 'sandbox', env: env(CARD_SECRETS),
        fetchImpl: fakeFetch({ card: 'sandbox' }).impl, sleep: async () => {}, makeRunner: fakeRunner(record),
    });
    assert.equal(receipt.status, 'PASS');
    assert.equal(receipt.workers[1].smoke.card_webhook_status, 401);
    assert.deepEqual(Object.keys(record[1].secrets).sort(), [
        'CARD_REFERENCE_SECRET', 'CLEENG_PUBLISHER_TOKEN', 'CLEENG_WEBHOOK_SECRET', 'NEAR_RPC_URL', 'PAYMENT_OPERATOR_PRIVATE_KEY',
        'REFUND_ADMIN_TOKEN', 'VAT_SIGNER_PRIVATE_KEY',
    ]);
    assert.ok(!Object.hasOwn(record[0].secrets, 'CLEENG_PUBLISHER_TOKEN'));
    const written = await readFile(join(dir, 'r.json'), 'utf8');
    for (const secret of Object.values(CARD_SECRETS)) assert.ok(!written.includes(secret));

    for (const [cardPermission, error] of [
        ['FullAccess', /card_operator_key_full_access/],
        [null, /card_operator_key_not_on_chain/],
        [{ FunctionCall: { ...CARD_KEY_SCOPE.FunctionCall, method_names: ['issue_card_ticket', 'void_card_ticket', 'refund_ticket'] } }, /card_operator_key_scope/],
        [{ FunctionCall: { ...CARD_KEY_SCOPE.FunctionCall, receiver_id: 'other.testnet' } }, /card_operator_key_scope/],
    ]) {
        const none = [];
        await assert.rejects(deployRelease({
            sha: SHA, releaseDir: '/r', receiptPath: join(dir, 'r2.json'), mode: 'acceptance', card: 'sandbox', env: env(CARD_SECRETS),
            fetchImpl: fakeFetch({ card: 'sandbox', cardPermission }).impl, sleep: async () => {}, makeRunner: fakeRunner(none),
        }), error);
        assert.equal(none.length, 0);
    }
    await assert.rejects(deployRelease({
        sha: SHA, releaseDir: '/r', receiptPath: join(dir, 'r3.json'), mode: 'closed', card: 'sandbox', env: env(CARD_SECRETS),
        fetchImpl: fakeFetch().impl, sleep: async () => {}, makeRunner: fakeRunner([]),
    }), /card_path_requires_acceptance/);
});
