// CKD over NEAR Auth spike (testnet and localhost only). Not production code.
// Option A: Google login -> fast-auth implicit account -> request_app_private_key delegate action
//   -> Google approval (fatxn) -> sponsor fast-auth.testnet.sign -> relayer SignedDelegate -> decrypt/verify.
// Option C / C2: ckd-gate proxy contract, login only (id_token nonce bound to the ephemeral key).
// The sponsor key is read from the local legacy keychain at runtime; nothing secret lives in this file.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createPublicKey, verify as edVerify } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { actions, baseDecode, buildDelegateAction, createTransaction, encodeDelegateAction, encodeTransaction,
    KeyPair, PublicKey, Signature, SignedTransaction } from 'near-api-js';
import { sha256 } from '@noble/hashes/sha2.js';
import { decodeG2, decryptAndDerive, fingerprint, generateEphemeralKeyPV, requestArgs } from './ckd.mjs';

const PORT = Number(process.env.PORT ?? 3000);
const RPC = process.env.NEAR_RPC ?? 'https://test.rpc.fastnear.com/';
const CLIENT_ID = 'np8paqIpMWmNbzT4xAvOOapZBjsOpptl'; // docs.auth.near.org/resources/networks: public shared testnet demo client
const ISSUER = 'https://login.testnet.fast-auth.com/';
const SIGNING_AUDIENCE = 'auth0.jwt.fast-auth.testnet';
const FAST_AUTH = 'fast-auth.testnet';
const MPC = 'v1.signer-prod.testnet';
const CKD_DOMAIN = 2;
const DERIVATION_PATH = process.env.CKD_PATH ?? 'v1';
const SPONSOR = process.env.SPONSOR ?? 'dev-youtick-1770146451.testnet';
const FUND_YOCTO = 20_000_000_000_000_000_000_000n; // 0.02 testnet NEAR: account creation + 1 yocto deposits
const CKD_GAS = 50_000_000_000_000n;
const SIGN_GAS = 300_000_000_000_000n;
const KEYS = createRemoteJWKSet(new URL('.well-known/jwks.json', ISSUER));

const state = { sub: null, accountId: null, publicKey: null, pending: null, runs: [] };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function rpc(method, params) {
    const res = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'ckd-spike', method, params }), signal: AbortSignal.timeout(120_000) });
    const body = await res.json();
    if (body.error) throw new Error(`rpc ${method}: ${JSON.stringify(body.error).slice(0, 400)}`);
    return body.result;
}
const query = (params, allowMissing = false) => rpc('query', { finality: 'final', ...params }).catch((e) => {
    if (allowMissing && /UNKNOWN_ACCOUNT|UNKNOWN_ACCESS_KEY|does not exist/.test(e.message)) return null;
    throw e;
});
async function view(accountId, method, args = {}) {
    const r = await query({ request_type: 'call_function', account_id: accountId, method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
    return JSON.parse(Buffer.from(r.result).toString());
}

async function loadSponsor() {
    const file = JSON.parse(await readFile(`${homedir()}/.near-credentials/testnet/${SPONSOR}.json`, 'utf8'));
    const keyPair = KeyPair.fromString(file.private_key ?? file.secret_key);
    const key = await query({ request_type: 'view_access_key', account_id: SPONSOR, public_key: keyPair.getPublicKey().toString() });
    if (key.permission !== 'FullAccess') throw new Error('sponsor key is not FullAccess');
    return keyPair;
}
const sponsorKey = await loadSponsor();
const mpcState = await view(MPC, 'state');
const ckdKey = mpcState.Running.keyset.domains.find((d) => d.domain_id === CKD_DOMAIN).key.Bls12381.public_key;
const mpcPublicKey = decodeG2(ckdKey);
log(`sponsor=${SPONSOR} mpc=${MPC} ckd_domain=${CKD_DOMAIN} path=${DERIVATION_PATH}`);

async function sendSponsorTx(receiverId, actionList) {
    const pk = sponsorKey.getPublicKey();
    const key = await query({ request_type: 'view_access_key', account_id: SPONSOR, public_key: pk.toString() });
    const tx = createTransaction(SPONSOR, pk, receiverId, BigInt(key.nonce) + 1n, actionList, baseDecode(key.block_hash));
    const bytes = encodeTransaction(tx);
    const { signature } = sponsorKey.sign(sha256(bytes));
    const signed = new SignedTransaction({ transaction: tx, signature: new Signature({ keyType: 0, data: signature }) });
    const started = Date.now();
    const outcome = await rpc('send_tx', { signed_tx_base64: Buffer.from(encodeTransaction(signed)).toString('base64'), wait_until: 'FINAL' });
    return { outcome, ms: Date.now() - started };
}
const failure = (outcome) => [outcome.status, ...outcome.receipts_outcome.map((r) => r.outcome.status)].find((s) => s && 'Failure' in s);

async function verifyIdToken(idToken) {
    const { payload } = await jwtVerify(idToken, KEYS, { issuer: ISSUER, audience: CLIENT_ID });
    return payload.sub;
}

async function account(idToken) {
    const sub = await verifyIdToken(idToken);
    const [paused, mpcAddress, domain] = await Promise.all([view(FAST_AUTH, 'paused'), view(FAST_AUTH, 'mpc_address'), view(FAST_AUTH, 'mpc_domain_id')]);
    if (paused !== false || mpcAddress !== MPC || domain !== 1) throw new Error('fast-auth configuration changed');
    const derived = await view(MPC, 'derived_public_key', { path: `jwt#${ISSUER}#${sub}`, predecessor: FAST_AUTH, domain_id: 1 });
    const publicKey = PublicKey.fromString(derived);
    Object.assign(state, { sub, publicKey: derived, accountId: Buffer.from(publicKey.data).toString('hex'), pending: null });
    return status();
}

async function status() {
    if (!state.accountId) return { loggedIn: false };
    const acc = await query({ request_type: 'view_account', account_id: state.accountId }, true);
    return { loggedIn: true, accountId: state.accountId, publicKey: state.publicKey, exists: !!acc,
        balanceNear: acc ? Number(BigInt(acc.amount) / 10n ** 18n) / 1e6 : 0, path: DERIVATION_PATH, runs: state.runs };
}

async function fund() {
    if (!state.accountId) throw new Error('login first');
    if ((await status()).exists) return status();
    const { outcome } = await sendSponsorTx(state.accountId, [actions.transfer(FUND_YOCTO)]);
    if (failure(outcome)) throw new Error(`fund failed: ${JSON.stringify(failure(outcome))}`);
    log(`funded ${state.accountId} tx=${outcome.transaction.hash}`);
    return status();
}

async function prepare() {
    if (!state.accountId) throw new Error('login first');
    const key = await query({ request_type: 'view_access_key', account_id: state.accountId, public_key: state.publicKey });
    if (key.permission !== 'FullAccess') throw new Error('implicit account key is not FullAccess');
    const eph = generateEphemeralKeyPV();
    const delegate = buildDelegateAction({ senderId: state.accountId, receiverId: MPC, publicKey: PublicKey.fromString(state.publicKey),
        nonce: BigInt(key.nonce) + 1n, maxBlockHeight: BigInt(key.block_height) + 1200n,
        actions: [actions.functionCall('request_app_private_key',
            requestArgs({ derivationPath: DERIVATION_PATH, domainId: CKD_DOMAIN, pk1: eph.pk1, pk2: eph.pk2 }), CKD_GAS, 1n)] });
    const bytes = encodeDelegateAction(delegate);
    state.pending = { delegate, bytes, scalar: eph.scalar, createdAt: Date.now() };
    return { delegateAction: Array.from(bytes), size: bytes.length, maxBlockHeight: delegate.maxBlockHeight.toString() };
}

async function execute(token) {
    const p = state.pending;
    if (!p) throw new Error('prepare first');
    // Approval token: same user, signing audience, and exactly the bytes we will sign.
    const { payload } = await jwtVerify(token, KEYS, { issuer: ISSUER, audience: SIGNING_AUDIENCE });
    if (payload.sub !== state.sub || payload.azp !== CLIENT_ID || !Array.isArray(payload.fatxn)
        || !Buffer.from(payload.fatxn).equals(Buffer.from(p.bytes))) throw new Error('approval token does not match the prepared delegate');
    state.pending = null;
    const run = { startedAt: new Date().toISOString() };

    const signCall = await sendSponsorTx(FAST_AUTH, [actions.functionCall('sign', { guard_id: `jwt#${ISSUER}`, verify_payload: token,
        sign_payload: Array.from(p.bytes), algorithm: 'eddsa' }, SIGN_GAS, 1n)]);
    run.signTx = signCall.outcome.transaction.hash; run.signMs = signCall.ms;
    if (failure(signCall.outcome)) throw Object.assign(new Error(`fast-auth sign failed: ${JSON.stringify(failure(signCall.outcome)).slice(0, 600)}`), { run });
    const mpcReply = JSON.parse(Buffer.from(signCall.outcome.status.SuccessValue, 'base64').toString());
    const signature = Buffer.from(mpcReply.signature);
    const userKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(PublicKey.fromString(state.publicKey).data)]), format: 'der', type: 'spki' });
    if (signature.length !== 64 || !edVerify(null, sha256(p.bytes), userKey, signature)) throw Object.assign(new Error('MPC signature does not verify'), { run });
    log(`fast-auth sign ok tx=${run.signTx} ${run.signMs}ms`);

    const relay = await sendSponsorTx(state.accountId, [actions.signedDelegate({ delegateAction: p.delegate,
        signature: new Signature({ keyType: 0, data: signature }) })]);
    run.relayTx = relay.outcome.transaction.hash; run.relayMs = relay.ms;
    if (failure(relay.outcome)) throw Object.assign(new Error(`relay failed: ${JSON.stringify(failure(relay.outcome)).slice(0, 600)}`), { run });
    const ckdReceipt = relay.outcome.receipts_outcome.find((r) => {
        const v = r.outcome.status?.SuccessValue;
        if (!v || r.outcome.executor_id !== MPC) return false;
        try { return 'big_c' in JSON.parse(Buffer.from(v, 'base64').toString()); } catch { return false; }
    });
    if (!ckdReceipt) throw Object.assign(new Error('CKD response not found in relay receipts'), { run });
    const response = JSON.parse(Buffer.from(ckdReceipt.outcome.status.SuccessValue, 'base64').toString());
    const predecessorLog = relay.outcome.receipts_outcome.flatMap((r) => r.outcome.logs).find((l) => l.startsWith('request_app_private_key'));
    run.predecessorIsUser = !!predecessorLog?.includes(`AccountId("${state.accountId}")`);
    const key = decryptAndDerive({ response, scalar: p.scalar, accountId: state.accountId, path: DERIVATION_PATH, mpcPublicKey });
    run.verified = true;
    run.fingerprint = fingerprint(key);
    state.runs.push(run);
    log(`ckd ok relay=${run.relayTx} ${run.relayMs}ms fingerprint=${run.fingerprint} predecessorIsUser=${run.predecessorIsUser}`);
    return run;
}

// --- Option C (v1): ckd-gate proxy, path = hash(sub); login only, nonce = sha256(ephemeral key) ---
const GATE = process.env.CKD_GATE ?? `ckd-gate-1.${SPONSOR}`;
const GATE_GAS = 150_000_000_000_000n;
const gateRuns = [];
let gatePending = null;
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

function gatePrepare() {
    const eph = generateEphemeralKeyPV();
    const app = requestArgs({ derivationPath: '', domainId: CKD_DOMAIN, pk1: eph.pk1, pk2: eph.pk2 }).request.app_public_key.AppPublicKeyPV;
    const nonce = b64url(sha256(new TextEncoder().encode(`ckd-gate-v1|${app.pk1}|${app.pk2}`)));
    gatePending = { scalar: eph.scalar, app, nonce };
    return { nonce, clientId: CLIENT_ID, issuer: ISSUER, gate: GATE };
}

async function gateExecute(idToken) {
    const p = gatePending;
    if (!p) throw new Error('prepare first');
    gatePending = null;
    // Diagnostic check only; the authoritative verification happens on chain inside ckd-gate.
    const { payload } = await jwtVerify(idToken, KEYS, { issuer: ISSUER, audience: CLIENT_ID });
    if (payload.nonce !== p.nonce) throw new Error('id_token nonce does not match the ephemeral key');
    const run = { startedAt: new Date().toISOString(), idTokenBytes: idToken.length };
    const relay = await sendSponsorTx(GATE, [actions.functionCall('request_key', { jwt: idToken, app_public_key: p.app }, GATE_GAS, 0n)]);
    run.tx = relay.outcome.transaction.hash; run.ms = relay.ms;
    if (failure(relay.outcome)) throw Object.assign(new Error(`ckd-gate failed: ${JSON.stringify(failure(relay.outcome)).slice(0, 800)}`), { run });
    run.gasBurntTGas = Math.round(relay.outcome.receipts_outcome.reduce((s, r) => s + r.outcome.gas_burnt, relay.outcome.transaction_outcome.outcome.gas_burnt) / 1e10) / 100;
    const result = JSON.parse(Buffer.from(relay.outcome.status.SuccessValue, 'base64').toString());
    const mpcLog = relay.outcome.receipts_outcome.flatMap((r) => r.outcome.logs).find((l) => l.startsWith('request_app_private_key'));
    run.predecessorIsGate = !!mpcLog?.includes(`AccountId("${GATE}")`);
    run.derivationPath = result.derivation_path;
    const key = decryptAndDerive({ response: result.response, scalar: p.scalar, accountId: GATE, path: result.derivation_path, mpcPublicKey });
    run.verified = true;
    run.fingerprint = fingerprint(key);
    gateRuns.push(run);
    log(`gate ok tx=${run.tx} ${run.ms}ms gas=${run.gasBurntTGas}TGas fingerprint=${run.fingerprint}`);
    return { ...run, runs: gateRuns };
}

// --- Option C2: ckd-gate v2; path = v1/<NEAR account>; rules (a) token's own account, (b) linked identity, (c) the account itself ---
const GATE2 = process.env.CKD_GATE2 ?? `ckd-gate-2.${SPONSOR}`;
const LINK_DEPOSIT = 10_000_000_000_000_000_000_000n; // 0.01 NEAR; the excess is refunded
let gate2Pending = null;
const hex = (s) => Buffer.from(sha256(new TextEncoder().encode(s))).toString('hex');
function appKey() {
    const eph = generateEphemeralKeyPV();
    return { scalar: eph.scalar, app: requestArgs({ derivationPath: '', domainId: CKD_DOMAIN, pk1: eph.pk1, pk2: eph.pk2 }).request.app_public_key.AppPublicKeyPV };
}
const gate2Nonce = (app) => b64url(sha256(new TextEncoder().encode(`ckd-gate|${GATE2}|${app.pk1}|${app.pk2}`)));
const panicOf = (outcome) => {
    const f = failure(outcome);
    if (!f) return null;
    const s = JSON.stringify(f);
    return s.match(/Smart contract panicked: ([^"\\]+)/)?.[1] ?? s.slice(0, 300);
};

function gate2Prepare() {
    gate2Pending = appKey();
    return { nonce: gate2Nonce(gate2Pending.app), clientId: CLIENT_ID, issuer: ISSUER, gate: GATE2 };
}

async function gate2Call(method, args, deposit = 0n) {
    const r = await sendSponsorTx(GATE2, [actions.functionCall(method, args, GATE_GAS, deposit)]);
    const gas = Math.round(r.outcome.receipts_outcome.reduce((s, x) => s + x.outcome.gas_burnt, r.outcome.transaction_outcome.outcome.gas_burnt) / 1e10) / 100;
    const error = panicOf(r.outcome);
    const value = !error && r.outcome.status.SuccessValue ? JSON.parse(Buffer.from(r.outcome.status.SuccessValue, 'base64').toString() || 'null') : null;
    return { tx: r.outcome.transaction.hash, ms: r.ms, gasTGas: gas, error, value };
}

async function gate2Execute(idToken) {
    const p = gate2Pending;
    if (!p) throw new Error('prepare first');
    gate2Pending = null;
    const { payload } = await jwtVerify(idToken, KEYS, { issuer: ISSUER, audience: CLIENT_ID });
    if (payload.nonce !== gate2Nonce(p.app)) throw new Error('id_token nonce does not match the ephemeral key');
    const derived = await view(MPC, 'derived_public_key', { path: `jwt#${ISSUER}#${payload.sub}`, predecessor: FAST_AUTH, domain_id: 1 });
    const expectedAccount = Buffer.from(PublicKey.fromString(derived).data).toString('hex');
    const identity = hex(`ckd-gate-identity|${ISSUER}|${payload.sub}`);
    const steps = [];
    const step = async (name, expect, fn) => {
        const r = await fn();
        const ok = expect === 'ok' ? !r.error : !!r.error && r.error.includes(expect);
        steps.push({ name, ok, expect, ...r, value: undefined, account: r.value?.account_id, fingerprint: r.fingerprint });
        log(`gate2 ${ok ? 'PASS' : 'FAIL'} ${name} tx=${r.tx} ${r.ms}ms ${r.error ?? r.value?.account_id ?? ''}`);
        return r;
    };
    const decrypt = (r, scalar) => {
        if (r.error) return r;
        const key = decryptAndDerive({ response: r.value.response, scalar, accountId: GATE2, path: r.value.derivation_path, mpcPublicKey });
        return { ...r, fingerprint: fingerprint(key) };
    };
    const other = appKey();
    const a = await step('a: own account', 'ok', async () => decrypt(await gate2Call('request_key', { jwt: idToken, app_public_key: p.app }), p.scalar));
    await step('replay: same token, different ephemeral key', 'nonce does not bind app key',
        () => gate2Call('request_key', { jwt: idToken, app_public_key: other.app }));
    await step('unlinked account', 'identity is not linked', () => gate2Call('request_key', { jwt: idToken, app_public_key: p.app, account_id: SPONSOR }));
    await step('link: sponsor account accepts this identity', 'ok', () => gate2Call('link_identity', { identity_hash: identity }, LINK_DEPOSIT));
    const b = await step('b: sponsor account via linked identity', 'ok', async () => decrypt(await gate2Call('request_key', { jwt: idToken, app_public_key: p.app, account_id: SPONSOR }), p.scalar));
    const c = await step('c: sponsor account itself', 'ok', async () => { const k = appKey(); return decrypt(await gate2Call('request_key_as_account', { app_public_key: k.app }), k.scalar); });
    await step('unlink', 'ok', () => gate2Call('unlink_identity', { identity_hash: identity }));
    await step('b after unlink', 'identity is not linked', () => gate2Call('request_key', { jwt: idToken, app_public_key: p.app, account_id: SPONSOR }));
    return {
        allPassed: steps.every((s) => s.ok),
        expectedAccount, accountFromRuleA: a.value?.account_id, ruleAMatchesFastAuthAccount: a.value?.account_id === expectedAccount,
        fingerprintA: a.fingerprint, fingerprintB: b.fingerprint, fingerprintC: c.fingerprint, ruleBEqualsRuleC: !!b.fingerprint && b.fingerprint === c.fingerprint,
        steps,
    };
}

async function gate2Forged() {
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const k = appKey();
    const jwt = `${enc({ alg: 'RS256' })}.${enc({ iss: ISSUER, sub: 'x', aud: CLIENT_ID, exp: 9999999999, nonce: gate2Nonce(k.app) })}.${Buffer.alloc(256, 7).toString('base64url')}`;
    const r = await gate2Call('request_key', { jwt, app_public_key: k.app });
    return { ...r, ok: r.error === 'bad signature' };
}

const routes = { 'POST /api/account': (b) => account(b.idToken), 'GET /api/status': status, 'POST /api/fund': fund,
    'POST /api/gate2/prepare': gate2Prepare, 'POST /api/gate2/execute': (b) => gate2Execute(b.idToken), 'POST /api/gate2/forged': gate2Forged,
    'POST /api/prepare': prepare, 'POST /api/execute': (b) => execute(b.token),
    'POST /api/gate/prepare': gatePrepare, 'POST /api/gate/execute': (b) => gateExecute(b.idToken) };
const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/gate': ['gate.html', 'text/html; charset=utf-8'],
    '/auth0.js': ['node_modules/@auth0/auth0-spa-js/dist/auth0-spa-js.production.js', 'text/javascript'] };

createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    try {
        if (req.method === 'GET' && files[url.pathname]) {
            const [file, type] = files[url.pathname];
            res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
            return res.end(await readFile(new URL(file, import.meta.url)));
        }
        const route = routes[`${req.method} ${url.pathname}`];
        if (!route) { res.writeHead(404); return res.end(); }
        if (req.method === 'POST' && req.headers.origin !== `http://localhost:${PORT}`) { res.writeHead(403); return res.end(); }
        let body = '';
        for await (const chunk of req) body += chunk;
        const result = await route(body ? JSON.parse(body) : {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
    } catch (error) {
        log('error', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message, run: error.run }));
    }
}).listen(PORT, 'localhost', () => log(`http://localhost:${PORT}`));
