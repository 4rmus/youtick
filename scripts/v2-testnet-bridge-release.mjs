#!/usr/bin/env node
// V2 testnet release for the Livepeer Bridge on Market V2 (docs/v2-testnet-runbook.md, Bridge).
// Run only by .github/workflows/deploy-v2-testnet-bridge.yml:
//   write-config <dry-run-outdir>                   prepare job, no secrets
//   check <release-dir> <sha> <mode>                 prepare job, wrangler dry run, no secrets
//   deploy <sha> <release-dir> <receipt> <mode>     deploy job, environment v2-testnet
// The Worker bytes come from `wrangler deploy --dry-run --outdir` in the prepare job; this script never bundles.
// Uploads open only for the named creators; the webhook Queue, D1 archives, sponsored uploads, multi-asset
// payments and the 30-day release_expired job stay off (W3 owns the read model and release).
// M1.5: the Bridge deploys to the media Cloudflare account and serves from its workers.dev host
// (docs/v2-testnet-runbook.md, Media account).
// OD19 (M2-G6): the V2 Bridge is Stream-only. Cloudflare Stream lives in the same media account; no
// Livepeer Studio secret, webhook or signing key is deployed or checked (Studio stays for V1 only).
// The Stream adapter is switched per release (MEDIA_PROVIDER_STREAM_ENABLED, docs/v2-testnet-runbook.md,
// Stream cutover inputs).
import { createPrivateKey, createPublicKey, timingSafeEqual } from 'node:crypto';
import { appendFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import {
    ACCEPTANCE_ORIGIN, DENIED_ORIGIN, MARKET_V2, MODES, PARENT, SMOKE_DELAYS_MS,
    MEDIA_ACCOUNT, mediaAccount, mediaAccountId, nearPublicKey, request, retry, runProcess, validateRpcUrl, workersDevHost, wranglerRunner,
} from './v2-testnet-release.mjs';

export const BRIDGE = Object.freeze({
    dir: 'workers/livepeer-bridge',
    worker: 'youtick-livepeer-bridge-v2-testnet',
});

/** The Bridge's workers.dev host in the media account; fails media_account_unconfigured until it is registered. */
export function bridgeHost() {
    return workersDevHost(BRIDGE.worker);
}
const BRIDGE_ACCOUNT = `v2-bridge-261007.${PARENT}`;
// Function-call key of the Bridge account from v2-testnet-bootstrap-policy.json (bridge_operator.keys[1]).
const OPERATOR_PUBLIC_KEY = 'ed25519:BDyHUFs1wbkaQJQ2Tq4AcyJWHanaC8j4spLQRwAKiYed';
// The function-call key's method list. `neutral` is the post-MC set; `legacy` is the set the testnet key
// carries until the on-chain MC cutover (docs/v2-testnet-runbook.md, MC cutover). The owner moves the
// Bridge to the media account (M1.5-G3) before that cutover, so the release accepts either set.
export const OPERATOR_KEY_METHOD_SETS = Object.freeze({
    neutral: Object.freeze(['finalize_publication', 'suspend_sales', 'mark_watched', 'release_expired']),
    legacy: Object.freeze(['finalize_livepeer_publication', 'suspend_livepeer_sales', 'mark_watched', 'release_expired']),
});
export const OPERATOR_METHODS = OPERATOR_KEY_METHOD_SETS.neutral;
// Which set a release accepts: OPERATOR_KEY_SET in the deploy job. `any` is the transition default; the
// cutover run pins `neutral`. After the cutover the default goes back to `neutral` (one-line follow-up).
export const OPERATOR_KEY_SETS = Object.freeze(['any', 'neutral', 'legacy']);
export const DEFAULT_OPERATOR_KEY_SET = 'any';

export function operatorKeySetPolicy(value = DEFAULT_OPERATOR_KEY_SET) {
    if (!OPERATOR_KEY_SETS.includes(value)) fail('operator_key_set_invalid');
    return value;
}

/** The name of the set the on-chain method list equals exactly, or null for any other list. */
export function operatorKeySetOf(methodNames) {
    const sorted = [...(methodNames ?? [])].sort().join();
    return Object.keys(OPERATOR_KEY_METHOD_SETS).find((name) => [...OPERATOR_KEY_METHOD_SETS[name]].sort().join() === sorted) ?? null;
}
// Market V2 quote key as bootstrapped (v2-testnet-bootstrap-policy.json market.quote_public_key_base64).
const QUOTE_PUBLIC_KEY_BASE64 = 'YYvahur/L80hl0moUnEBLkHjv1jNjzIgXQFMs/jkSf4=';
const QUOTE_KEY_VERSION = '1';
/** The public halves every deploy secret must match; tests pass their own. The Stream key is in STREAM. */
export const EXPECTED_KEYS = Object.freeze({ operator: OPERATOR_PUBLIC_KEY, quote: QUOTE_PUBLIC_KEY_BASE64 });

// Cloudflare Stream in the media account (OD19). Public values only; the API token, the webhook secret and
// the signing key's private half are GitHub `v2-testnet` secrets. Each sentinel is replaced by a one-line
// commit when the owner has the value (docs/v2-testnet-runbook.md, Stream cutover inputs); a release with
// the Stream flag on refuses any sentinel, a release with it off writes the value as empty.
export const STREAM_SENTINELS = Object.freeze({
    customerCode: '<record-after-first-upload>',
    signingKey: '<create-with-post-stream-keys>',
});
export const STREAM = Object.freeze({
    // customer-<code>.cloudflarestream.com of the media account, read from the first upload's playback URL
    // (the M0-P1 probe records it). Cloudflare does not document how to read it before an upload exists.
    customerCode: STREAM_SENTINELS.customerCode,
    // `id` of POST /accounts/{id}/stream/keys; the private `pem` goes to V2_STREAM_SIGNING_KEY_PEM.
    signingKeyId: STREAM_SENTINELS.signingKey,
    // Base64 of the SPKI PEM public half of that key (openssl pkey -pubout), committed like the other keys.
    signingPublicKey: STREAM_SENTINELS.signingKey,
    // Owner decision OD3: 2-hour cap, one open 2-hour reservation, the Starter Bundle's 1,000 minutes.
    maxDurationSeconds: '7200',
    storageMinutesCapacity: '1000',
    reservationSecondsBudget: '7200',
    // A Stream job still at pctComplete 0 after 15 minutes counts as stuck (failed and deleted). Not
    // measured: M0-P7 records the ready timing of a long 1080p source and may move it.
    stuckTimeoutMs: '900000',
});
const STREAM_CUSTOMER_CODE = /^[a-z0-9]{8,64}$/;
const STREAM_KEY_ID = /^[a-f0-9]{32}$/;
const STREAM_MAX_DURATION_LIMIT = 36000;
let streamOverride = null;

/** Tests only: replaces fields of STREAM for this process (null restores it); validated like STREAM. */
export function setStreamOverride(fields) {
    streamOverride = fields ? Object.freeze({ ...STREAM, ...fields }) : null;
}

function streamConstants() {
    return streamOverride ?? STREAM;
}

/** The URL the media account's single Stream webhook must name (one webhook per Cloudflare account). */
export function streamWebhookUrl() {
    return `https://${bridgeHost()}/v1/stream-webhooks`;
}
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
    // Studio-only values (OD19): empty, so the V2 Bridge sees no Studio adapter configuration.
    LIVEPEER_PROJECT_ID: '',
    LIVEPEER_API_TOKEN_NAME: '',
    LIVEPEER_CREATOR_ALLOWLIST: CREATOR_ALLOWLIST.join(','),
    LIVEPEER_OPERATOR_JOB_ID: '',
    LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS: '20000000',
    LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS: '2000000',
    LIVEPEER_PAID_MEDIA_OPERATOR_ID: 'youtick-v2-testnet-operator',
    LIVEPEER_JWT_PUBLIC_KEY: '',
    LIVEPEER_JWT_ISSUER: '',
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
    // Cloudflare Stream (OD19). The flag is set per release from the workflow input stream_enabled (never a
    // FLAGS entry: acceptance mode forces every FLAGS entry on); bridgeVars() writes the deployed values.
    MEDIA_PROVIDER_STREAM_ENABLED: 'false',
    STREAM_ACCOUNT_ID: MEDIA_ACCOUNT.accountId,
    STREAM_CUSTOMER_CODE: STREAM.customerCode,
    STREAM_SIGNING_KEY_ID: STREAM.signingKeyId,
    STREAM_SIGNING_PUBLIC_KEY: STREAM.signingPublicKey,
    STREAM_MAX_DURATION_SECONDS: STREAM.maxDurationSeconds,
    STREAM_STORAGE_MINUTES_CAPACITY: STREAM.storageMinutesCapacity,
    STREAM_RESERVATION_SECONDS_BUDGET: STREAM.reservationSecondsBudget,
    STREAM_STUCK_TIMEOUT_MS: STREAM.stuckTimeoutMs,
});

/** Always deployed. */
export const BASE_SECRETS = Object.freeze([
    'NEAR_RPC_URL', 'LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN', 'NEAR_OPERATOR_PRIVATE_KEY', 'CREATOR_FEE_QUOTE_PRIVATE_KEY',
]);
/** Deployed and checked only when the release turns the Stream adapter on. */
export const STREAM_SECRETS = Object.freeze(['STREAM_API_TOKEN', 'STREAM_WEBHOOK_SECRET', 'STREAM_SIGNING_KEY_PEM']);
/** Optional with the Stream flag on; deployed only when set. */
export const OPTIONAL_STREAM_SECRETS = Object.freeze(['STREAM_WEBHOOK_SECRET_PREVIOUS']);
export const SECRETS = Object.freeze([...BASE_SECRETS, ...STREAM_SECRETS, ...OPTIONAL_STREAM_SECRETS]);
/** Studio secrets the V2 release no longer deploys (OD19); still refused as [vars] entries. */
export const RETIRED_SECRETS = Object.freeze(['LIVEPEER_API_KEY', 'LIVEPEER_WEBHOOK_SECRET', 'LIVEPEER_JWT_PRIVATE_KEY']);
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

/** The per-release Stream flag: the literal 'true' or 'false' (workflow input stream_enabled). */
export function streamFlag(value = 'false') {
    if (value !== 'true' && value !== 'false') fail('stream_flag_invalid');
    return value === 'true';
}

/** Acceptance opens uploads and playback, which a Stream-only V2 Bridge cannot serve without Stream. */
export function releaseStream(mode, streamEnabled) {
    if (!MODES.includes(mode)) fail('mode_invalid');
    if (mode === 'acceptance' && !streamEnabled) fail('acceptance_requires_stream');
    return streamEnabled;
}

function positiveInteger(value, max, code) {
    if (!/^[1-9][0-9]{0,15}$/.test(value ?? '') || Number(value) > max) fail(code);
    return value;
}

/**
 * The [vars] the release writes: FIXED_VARS with the per-release Stream flag. A Stream constant that is
 * still a sentinel is written as empty with the flag off and refused with it on; a filled-in constant must
 * be well-formed either way.
 */
export function bridgeVars({ streamEnabled = false } = {}) {
    const stream = streamConstants();
    const constant = (value, sentinel, valid, name) => {
        if (value === sentinel) {
            if (streamEnabled) fail(`stream_${name}_unconfigured`);
            return '';
        }
        if (!valid(value)) fail(`stream_${name}_invalid`);
        return value;
    };
    const customerCode = constant(stream.customerCode, STREAM_SENTINELS.customerCode, (value) => STREAM_CUSTOMER_CODE.test(value ?? ''), 'customer_code');
    const signingKeyId = constant(stream.signingKeyId, STREAM_SENTINELS.signingKey, (value) => STREAM_KEY_ID.test(value ?? ''), 'signing_key');
    const signingPublicKey = constant(stream.signingPublicKey, STREAM_SENTINELS.signingKey, rsaPublicKeyValid, 'signing_public_key');
    // A key id without its public half (or the reverse) is a half-finished commit.
    if (Boolean(signingKeyId) !== Boolean(signingPublicKey)) fail('stream_signing_key_incomplete');
    const maxDuration = positiveInteger(stream.maxDurationSeconds, STREAM_MAX_DURATION_LIMIT, 'stream_max_duration_invalid');
    const capacity = positiveInteger(stream.storageMinutesCapacity, 10_000_000, 'stream_storage_capacity_invalid');
    const budget = positiveInteger(stream.reservationSecondsBudget, 10_000_000, 'stream_reservation_budget_invalid');
    // One upload at the cap must fit both the reservation budget and the prepaid storage.
    if (Number(budget) < Number(maxDuration) || Number(capacity) * 60 < Number(maxDuration)) fail('stream_limits_inconsistent');
    return Object.freeze({
        ...FIXED_VARS,
        MEDIA_PROVIDER_STREAM_ENABLED: streamEnabled ? 'true' : 'false',
        STREAM_ACCOUNT_ID: mediaAccountId(),
        STREAM_CUSTOMER_CODE: customerCode,
        STREAM_SIGNING_KEY_ID: signingKeyId,
        STREAM_SIGNING_PUBLIC_KEY: signingPublicKey,
        STREAM_MAX_DURATION_SECONDS: maxDuration,
        STREAM_STORAGE_MINUTES_CAPACITY: capacity,
        STREAM_RESERVATION_SECONDS_BUDGET: budget,
        STREAM_STUCK_TIMEOUT_MS: positiveInteger(stream.stuckTimeoutMs, 86_400_000, 'stream_stuck_timeout_invalid'),
    });
}

/**
 * The deployed config is the repository wrangler.toml with: the bundled `index.js` as entry, the media
 * account's workers.dev host and no preview URLs, no Queue binding, the V2 read-model D1 binding and the
 * release cron in place of the V1 ones, its own rate-limit namespace, NEAR_RPC_URL moved to secrets and
 * every FIXED_VARS value written into [vars]. Any placeholder left after that is refused.
 */
export function sanitizeBridgeConfig(source, { d1Id, streamEnabled = false } = {}) {
    const vars = bridgeVars({ streamEnabled });
    let section = '';
    let mainSeen = false;
    let namespaceSeen = false;
    let varsSeen = false;
    const written = new Set();
    const out = [];
    const appendMissingVars = () => {
        for (const [key, value] of Object.entries(vars)) {
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
            out.push('main = "index.js"', 'workers_dev = true', 'preview_urls = false');
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
            if (entry && (SECRETS.includes(entry[1]) || RETIRED_SECRETS.includes(entry[1]))) fail(`config_secret_in_vars_${entry[1]}`);
            if (entry && Object.hasOwn(vars, entry[1])) {
                out.push(`${entry[1]} = ${JSON.stringify(vars[entry[1]])}`);
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

// Cloudflare Stream signing keys are RSA (RS256); the release refuses anything shorter than 2048 bits.
const RSA_MIN_BITS = 2048;

function rsaPublicKeyValid(value) {
    try {
        const key = createPublicKey({ key: pemBody(value, 'PUBLIC KEY'), format: 'der', type: 'spki' });
        return key.asymmetricKeyType === 'rsa' && key.asymmetricKeyDetails.modulusLength >= RSA_MIN_BITS;
    } catch {
        return false;
    }
}

/** A secret holding PEM or JSON text, as stored or base64 of it (POST /stream/keys returns base64). */
function keyText(value) {
    const raw = String(value ?? '').trim();
    if (raw.startsWith('-----BEGIN') || raw.startsWith('{')) return raw;
    return Buffer.from(raw, 'base64').toString('utf8').trim();
}

/**
 * The form of STREAM_SIGNING_KEY_PEM: `pkcs8` (PEM "BEGIN PRIVATE KEY"), `jwk` (an RSA private JWK, the
 * fallback when the returned pem cannot be imported), `pkcs1` ("BEGIN RSA PRIVATE KEY", which Web Crypto
 * in the Bridge cannot import) or null. Which form POST /stream/keys returns is UNPROVEN until M0-P8.
 */
export function streamSigningKeyFormat(value) {
    const text = keyText(value);
    if (/^-----BEGIN PRIVATE KEY-----/.test(text)) return 'pkcs8';
    if (/^-----BEGIN RSA PRIVATE KEY-----/.test(text)) return 'pkcs1';
    if (text.startsWith('{')) return 'jwk';
    return null;
}

/**
 * The Bridge signs Stream tokens with RS256: the private key (PKCS8 PEM, or an RSA JWK if the PEM does not
 * import) must derive the committed STREAM_SIGNING_PUBLIC_KEY. PKCS1 is refused, because Web Crypto cannot
 * import it; convert it with `openssl pkcs8 -topk8 -nocrypt` or store the returned JWK instead.
 */
export function rsaKeyMatches(privateKeyValue, publicKeyValue) {
    try {
        const format = streamSigningKeyFormat(privateKeyValue);
        const text = keyText(privateKeyValue);
        let key;
        if (format === 'pkcs8') key = createPrivateKey({ key: pemBody(text, 'PRIVATE KEY'), format: 'der', type: 'pkcs8' });
        else if (format === 'jwk') {
            const jwk = JSON.parse(text);
            if (jwk?.kty !== 'RSA' || typeof jwk.d !== 'string') return false;
            key = createPrivateKey({ key: jwk, format: 'jwk' });
        } else return false;
        if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < RSA_MIN_BITS) return false;
        return createPublicKey(key).export({ format: 'der', type: 'spki' }).equals(pemBody(publicKeyValue, 'PUBLIC KEY'));
    } catch {
        return false;
    }
}

function sameSecret(left, right) {
    const a = Buffer.from(String(left));
    const b = Buffer.from(String(right));
    return a.length === b.length && timingSafeEqual(a, b);
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

// Printable ASCII without spaces; the exact formats of Cloudflare's token and webhook secret are not documented.
const OPAQUE_SECRET = /^[\x21-\x7e]+$/;

function opaqueSecret(value) {
    return value.length >= 16 && value.length <= 512 && OPAQUE_SECRET.test(value);
}

/**
 * Reads and checks the deploy job's environment; nothing here is echoed. The Stream secrets are read only
 * with the Stream flag on: then all three are required and the signing key must match the committed key.
 */
export function releaseSecrets(env, expected = EXPECTED_KEYS, { streamEnabled = false } = {}) {
    if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? '') || !env.CLOUDFLARE_API_TOKEN?.trim()) fail('cloudflare_credentials_invalid');
    // The Bridge deploys only to the media account (M1.5); mediaAccount() also refuses an unregistered subdomain.
    mediaAccount();
    if (env.CLOUDFLARE_ACCOUNT_ID !== mediaAccountId()) fail('cloudflare_account_not_media');
    const rpc = validateRpcUrl(env.NEAR_RPC_URL ?? '');
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN ?? '')) fail('operator_token_invalid');
    const operatorPublicKey = nearPublicKey(env.NEAR_OPERATOR_PRIVATE_KEY);
    if (operatorPublicKey !== expected.operator) fail('operator_key_mismatch');
    if (quotePublicKey(env.CREATOR_FEE_QUOTE_PRIVATE_KEY ?? '') !== expected.quote) fail('quote_key_mismatch');
    const names = [...BASE_SECRETS];
    let stream = null;
    if (streamEnabled) {
        // The deployed constants first: a sentinel stops here, before any secret is compared.
        const vars = bridgeVars({ streamEnabled });
        const apiToken = env.STREAM_API_TOKEN ?? '';
        if (apiToken.length < 32 || !opaqueSecret(apiToken)) fail('stream_api_token_invalid');
        const webhookSecret = env.STREAM_WEBHOOK_SECRET ?? '';
        if (!opaqueSecret(webhookSecret)) fail('stream_webhook_secret_invalid');
        const previous = env.STREAM_WEBHOOK_SECRET_PREVIOUS ?? '';
        if (previous && (!opaqueSecret(previous) || previous === webhookSecret)) fail('stream_webhook_secret_previous_invalid');
        if (streamSigningKeyFormat(env.STREAM_SIGNING_KEY_PEM) === 'pkcs1') fail('stream_signing_key_pkcs1');
        if (!rsaKeyMatches(env.STREAM_SIGNING_KEY_PEM ?? '', vars.STREAM_SIGNING_PUBLIC_KEY)) fail('stream_signing_key_mismatch');
        names.push(...STREAM_SECRETS, ...(previous ? OPTIONAL_STREAM_SECRETS : []));
        stream = { accountId: vars.STREAM_ACCOUNT_ID, apiToken, webhookSecret };
    }
    return {
        cloudflare: { accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN },
        rpc,
        operatorPublicKey,
        stream,
        worker: Object.fromEntries(names.map((name) => [name, name === 'NEAR_RPC_URL' ? rpc : env[name]])),
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

/**
 * Refuses to deploy unless the chain holds the operator key for Market V2 with exactly one of the operator
 * method sets that `policy` allows, and quote key v1. Returns the name of the set that matched.
 */
export async function preflight(secrets, fetchImpl, policy = DEFAULT_OPERATOR_KEY_SET) {
    operatorKeySetPolicy(policy);
    const status = await rpcCall(fetchImpl, secrets.rpc, 'status', []);
    if (status?.result?.chain_id !== 'testnet') fail('rpc_network');
    const key = await rpcCall(fetchImpl, secrets.rpc, 'query', {
        finality: 'final', request_type: 'view_access_key', account_id: BRIDGE_ACCOUNT, public_key: secrets.operatorPublicKey,
    });
    const call = key.result?.permission?.FunctionCall;
    const keySet = call?.receiver_id === MARKET_V2 ? operatorKeySetOf(call.method_names) : null;
    if (!keySet) fail('operator_key_not_on_chain');
    // A known set that this release does not allow, e.g. the legacy key on the cutover run pinned to neutral.
    if (policy !== 'any' && keySet !== policy) fail(`operator_key_set_mismatch_${keySet}`);
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
    return keySet;
}

/**
 * The media account's Stream webhook must point at this Bridge: GET /accounts/{id}/stream/webhook with the
 * Stream token. The secret is compared only if the response carries one; whether GET returns it is not
 * documented (M0-P4 UNPROVEN). Without it the post-deploy webhook canary is the only proof that Stream
 * signs with STREAM_WEBHOOK_SECRET, and the receipt says so. A returned value that differs fails hard;
 * because Stream may return a masked or stale value (also M0-P4), the owner can choose the workflow
 * input stream_webhook_secret_preflight=skip (deploy env STREAM_WEBHOOK_SECRET_PREFLIGHT, attested in
 * the manifest): the URL binding is still required and the receipt records `secret-not-compared`.
 */
export const WEBHOOK_SECRET_PREFLIGHT_MODES = Object.freeze(['compare', 'skip']);

export function webhookSecretPreflight(value) {
    const mode = value || 'compare';
    if (!WEBHOOK_SECRET_PREFLIGHT_MODES.includes(mode)) fail('stream_webhook_secret_preflight_invalid');
    return mode;
}

export async function preflightStreamWebhook(stream, fetchImpl, { secretPreflight = 'compare' } = {}) {
    webhookSecretPreflight(secretPreflight);
    let body;
    try {
        const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${stream.accountId}/stream/webhook`, {
            headers: { Authorization: `Bearer ${stream.apiToken}` },
            signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) fail(`stream_webhook_unreadable_${response.status}`);
        body = await response.json();
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('v2_testnet_bridge_release_')) throw error;
        fail('stream_webhook_unreadable');
    }
    const result = body?.success === true ? body.result : null;
    if (!result || typeof result !== 'object') fail('stream_webhook_unreadable');
    if (result.notificationUrl !== streamWebhookUrl()) fail('stream_webhook_binding_mismatch');
    if (secretPreflight === 'skip') {
        return { binding: 'matched', secret: 'secret-not-compared', proof: 'post-deploy webhook canary (stream-canary webhook)' };
    }
    if (typeof result.secret === 'string' && result.secret !== '') {
        // Either the GitHub secret is not the one Stream signs with, or GET returns a masked value (M0-P4).
        if (!sameSecret(result.secret, stream.webhookSecret)) fail('stream_webhook_secret_mismatch_or_masked');
        return { binding: 'matched', secret: 'matched' };
    }
    return { binding: 'matched', secret: 'not_returned', proof: 'post-deploy webhook canary (stream-canary webhook)' };
}

export function wranglerArgs(releaseDir, sha, mode) {
    return [
        'deploy', join(releaseDir, 'index.js'), '--no-bundle', '--config', join(releaseDir, 'wrangler.toml'),
        '--name', BRIDGE.worker,
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
 * Closed: the Bridge reports DISABLED (and no Stream configuration when the flag is off). Acceptance:
 * uploads, webhooks, playback and operator mutations are ready, Stream is configured with its health block
 * present, and everything W2 keeps off is not; /v3/playback-tokens passes its flag gate (4xx for an empty
 * body, not 503) and the CORS preflight admits only the acceptance origin.
 */
export async function smoke(mode, versionId, fetchImpl, { streamEnabled = false } = {}) {
    const base = `https://${bridgeHost()}`;
    const health = await request(fetchImpl, `${base}/__health`, { method: 'GET' });
    if (health.status !== 200 || health.body?.versionId !== versionId) fail(`smoke_version_${health.status}`);
    if (health.body?.compactUpload?.market !== MARKET_V2 || health.body?.compactUpload?.network !== 'testnet') fail('smoke_market');
    // A configured Stream adapter on a release that turned it off means the flag did not land.
    if (!streamEnabled && health.body.streamConfigured === true) fail('smoke_stream_flag');
    if (streamEnabled) {
        // In both modes: the adapter is configured and its health block echoes the deployed limits.
        const vars = bridgeVars({ streamEnabled });
        const block = health.body.stream;
        if (health.body.streamConfigured !== true) fail('smoke_health_streamConfigured');
        if (!block || typeof block !== 'object' || Array.isArray(block)) fail('smoke_health_stream');
        if (block.reservationBudgetSeconds !== Number(vars.STREAM_RESERVATION_SECONDS_BUDGET)) fail('smoke_health_stream_reservation_budget');
        if (block.storageMinutesCapacity !== Number(vars.STREAM_STORAGE_MINUTES_CAPACITY)) fail('smoke_health_stream_storage_capacity');
    }
    if (mode === 'closed') {
        if (health.body.stage !== 'DISABLED') fail('smoke_closed');
        return { health_status: health.status, stage: health.body.stage, stream_configured: health.body.streamConfigured ?? null };
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
        health_status: health.status, stage: health.body.stage, stream_configured: health.body.streamConfigured ?? null,
        allowed_origin_status: allowed.status, denied_origin_status: denied.status, empty_v3_status: v3.status,
    };
}

export async function deployRelease({
    sha, releaseDir, receiptPath, mode, env = process.env, fetchImpl = fetch,
    sleep = (ms) => new Promise((done) => setTimeout(done, ms)), makeRunner, expected = EXPECTED_KEYS,
    operatorKeySet = DEFAULT_OPERATOR_KEY_SET, streamEnabled = false, secretPreflight = 'compare',
}) {
    if (!/^[a-f0-9]{40}$/.test(sha ?? '')) fail('sha_invalid');
    if (!MODES.includes(mode)) fail('mode_invalid');
    operatorKeySetPolicy(operatorKeySet);
    releaseStream(mode, streamEnabled);
    webhookSecretPreflight(secretPreflight);
    const secrets = releaseSecrets(env, expected, { streamEnabled });
    const keySet = await preflight(secrets, fetchImpl, operatorKeySet);
    const streamWebhook = streamEnabled ? await preflightStreamWebhook(secrets.stream, fetchImpl, { secretPreflight }) : null;
    const receipt = {
        schema: 'youtick.v2-testnet-bridge-receipt.v1', sha, mode, status: 'IN_PROGRESS',
        worker: BRIDGE.worker, host: bridgeHost(), operatorKeySetPolicy: operatorKeySet, operatorKeySet: keySet,
        streamEnabled, streamWebhookSecretPreflight: secretPreflight, streamWebhook,
    };
    // Visible in the receipt and the step summary: acceptance opens uploads without a secret comparison.
    if (streamEnabled && secretPreflight === 'skip' && mode === 'acceptance') {
        receipt.warnings = ['stream_webhook_secret_not_compared: acceptance ran with stream_webhook_secret_preflight=skip; '
            + 'run the stream-canary webhook check before any upload'];
    }
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
        receipt.smoke = await retry(() => smoke(mode, event.version_id, fetchImpl, { streamEnabled }), SMOKE_DELAYS_MS, sleep);
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
        const streamEnabled = streamFlag(process.env.MEDIA_PROVIDER_STREAM_ENABLED || 'false');
        await writeFile(join(outdir, 'wrangler.toml'), sanitizeBridgeConfig(source, { d1Id: process.env.READ_MODEL_D1_ID, streamEnabled }), { flag: 'wx', mode: 0o644 });
        return;
    }
    if (command === 'check' && args.length === 3) {
        // Prepare job: the exact deploy invocation, as a dry run with no Cloudflare credentials.
        const [releaseDir, sha, mode] = args;
        // The Bridge's host needs the registered workers.dev subdomain; stop the prepare job here.
        mediaAccount();
        releaseStream(mode, streamFlag(process.env.MEDIA_PROVIDER_STREAM_ENABLED || 'false'));
        const result = await runProcess(resolve(BRIDGE.dir, 'node_modules/.bin/wrangler'),
            [...wranglerArgs(resolve(releaseDir), sha, mode), '--dry-run'],
            { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', WRANGLER_SEND_METRICS: 'false' });
        if (result.code !== 0) fail('dry_run_failed');
        return;
    }
    if (command === 'deploy' && args.length === 4) {
        const [sha, releaseDir, receiptPath, mode] = args;
        const operatorKeySet = process.env.OPERATOR_KEY_SET || DEFAULT_OPERATOR_KEY_SET;
        const streamEnabled = streamFlag(process.env.MEDIA_PROVIDER_STREAM_ENABLED || 'false');
        const secretPreflight = webhookSecretPreflight(process.env.STREAM_WEBHOOK_SECRET_PREFLIGHT);
        const receipt = await deployRelease({
            sha, releaseDir: resolve(releaseDir), receiptPath, mode, operatorKeySet, streamEnabled, secretPreflight,
        });
        const summary = {
            status: receipt.status, worker: receipt.worker, version_id: receipt.version_id,
            operatorKeySetPolicy: receipt.operatorKeySetPolicy, operatorKeySet: receipt.operatorKeySet,
            streamEnabled: receipt.streamEnabled, streamWebhookSecretPreflight: receipt.streamWebhookSecretPreflight,
            streamWebhook: receipt.streamWebhook, ...(receipt.warnings ? { warnings: receipt.warnings } : {}),
        };
        for (const warning of receipt.warnings ?? []) console.log(`WARNING ${warning}`);
        console.log(JSON.stringify(summary));
        if (process.env.GITHUB_STEP_SUMMARY) {
            await appendFile(process.env.GITHUB_STEP_SUMMARY, `V2 testnet Bridge deploy: ${JSON.stringify(summary)}\n`);
        }
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
