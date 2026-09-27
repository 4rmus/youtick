import assert from 'node:assert/strict';
import { createRequire, builtinModules } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, Response as LocalResponse, Log, LogLevel } from 'miniflare';
import { build } from 'esbuild';
import { KeyPair, baseEncode, decodeSignedTransaction, encodeTransaction } from 'near-api-js';

const uploadMode = process.argv.includes('--upload');
const purpose = uploadMode ? 'upload' : 'ticket';
// LOCAL_TEST only. No live credentials, browser profile, external RPC, or deploy.
const bridge = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(bridge, '../..'), web = resolve(root, 'apps/web');
const webRequire = createRequire(resolve(web, 'package.json'));
const { EncryptJWT, SignJWT, generateKeyPair, exportJWK } = await import(webRequire.resolve('jose'));
await mkdir(resolve(root, 'tmp'), { recursive: true });
const output = await mkdtemp(resolve(root, `tmp/near-auth-${purpose}-runtime-`));
const persist = resolve(output, 'durable-objects');
const origin = 'https://runtime.test.invalid', market = 'market.testnet';
const usdc = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
const issuer = 'https://login.testnet.fast-auth.com/', subject = 'google-oauth2|runtime-synthetic';
const sessionSecret = '11'.repeat(32), clientId = 'runtime-synthetic-client';
const user = KeyPair.fromRandom('ed25519'), sponsor = KeyPair.fromRandom('ed25519');
const quoteKeys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const quotePrivateKey = Buffer.from(await crypto.subtle.exportKey('pkcs8', quoteKeys.privateKey)).toString('base64');
const accountId = Buffer.from(user.getPublicKey().data).toString('hex');
const block = baseEncode(new Uint8Array(32).fill(7));
const sha = bytes => createHash('sha256').update(bytes).digest();
const rsa = await generateKeyPair('RS256'), jwk = await exportJWK(rsa.publicKey);
const certificate = { account_id: accountId, authorization_duration_ms: '2592000000', contract_id: market,
    domain: 'youtick.device-session', network: 'testnet', origin_hash: sha(origin).toString('hex'), scopes: ['play'],
    session_public_key: user.getPublicKey().toString(), version: '3' };
const device = { session_public_key: certificate.session_public_key, certificate_sha256: sha(JSON.stringify(certificate)).toString('hex'),
    authorization_duration_ms: '2592000000' };
const publicEnv = { NEXT_PUBLIC_NEAR_NETWORK: 'testnet', NEXT_PUBLIC_VIDEO_ENVIRONMENT: 'public-testnet',
    NEXT_PUBLIC_MARKET_CONTRACT_ID: market, NEXT_PUBLIC_ACCESS_CONTRACT_ID: 'access.testnet', NEXT_PUBLIC_USDC_CONTRACT_ID: usdc,
    NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2: 'true', NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1: 'true',
    NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS: 'true', NEXT_PUBLIC_LIVEPEER_BRIDGE_URL: 'https://bridge.test.invalid' };
const webEnv = { ...publicEnv, NODE_ENV: 'production', NEAR_AUTH_LAB_ENABLED: 'false', NEAR_AUTH_V1_ENABLED: 'true',
    NEAR_AUTH_V1_CLIENT_ID: clientId, NEAR_AUTH_V1_SESSION_SECRET: sessionSecret, NEAR_AUTH_V1_ORIGIN: origin,
    NEAR_AUTH_V1_MPC_ACCOUNT_ID: 'mpc.testnet' };
const quotePublicKey = Buffer.from(await crypto.subtle.exportKey('raw', quoteKeys.publicKey)).toString('base64');
const bridgeEnv = { CREATOR_FEE_QUOTE_PUBLIC_KEY: quotePublicKey, CREATOR_FEE_QUOTE_KEY_VERSION: '1', NEAR_NETWORK: 'testnet', VIDEO_ENVIRONMENT: 'public-testnet', MARKET_CONTRACT_ID: market,
    NEAR_AUTH_MPC_ACCOUNT_ID: 'mpc.testnet', NEAR_AUTH_MPC_PRIVATE_KEY: sponsor.toString(), NEAR_AUTH_MPC_KEY_EPOCH: '1',
    NEAR_AUTH_MPC_OPERATION_YOCTO: '350000000000000000000000', NEAR_AUTH_MPC_DAILY_YOCTO: '700000000000000000000000',
    NEAR_AUTH_MPC_ACCOUNT_DAILY_ATTEMPTS: '2', NEAR_AUTH_MPC_MIN_BALANCE_YOCTO: '50000000000000000000000' };
const cfPackage = resolve(dirname(webRequire.resolve('@opennextjs/cloudflare')), '../..');
const initFile = resolve(cfPackage, 'dist/cli/templates/init.js');
const contextFile = resolve(cfPackage, 'dist/api/cloudflare-context.js');
const sharedBuild = { bundle: true, write: false, format: 'esm', platform: 'browser', mainFields: ['browser', 'module', 'main'], conditions: ['workerd', 'browser'], target: 'es2022',
    external: ['cloudflare:workers', 'node:*', ...builtinModules], logLevel: 'silent',
    banner: { js: "import {createRequire as runtimeRequire} from 'node:module'; const require = runtimeRequire('file:///runtime.js');" } };
const bridgeBundle = await build({ ...sharedBuild, entryPoints: [resolve(bridge, 'src/index.ts')] });
const webBundle = await build({ ...sharedBuild,
    stdin: { contents: `import {runWithCloudflareRequestContext} from ${JSON.stringify(initFile)};
        import {POST} from './app/api/auth/${purpose}/route';
        export default {async fetch(request, env, ctx) { try {return await runWithCloudflareRequestContext(request, env, ctx, () => POST(request));} catch(error) {return Response.json({error:'runtime_wrapper_failure', runtimeStack:error.stack}, {status:500});} }};`,
        resolveDir: web, loader: 'ts' },
    define: { 'process.env.NODE_ENV': '"production"', ...Object.fromEntries(Object.entries(publicEnv).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)])),
        __BUILD_TIMESTAMP_MS__: '0', __NEXT_BASE_PATH__: '""', __ASSETS_RUN_WORKER_FIRST__: 'false', __TRAILING_SLASH__: 'false', __DEPLOYMENT_ID__: '""' },
    plugins: [{ name: 'installed-opennext-context', setup(builder) {
        // Use the installed implementation, not a mocked getCloudflareContext.
        builder.onResolve({ filter: /^@opennextjs\/cloudflare$/ }, () => ({ path: contextFile }));
        builder.onResolve({ filter: /^\.\/next-env\.mjs$/ }, args => args.importer === initFile ? { path: 'next-env', namespace: 'fixture' } : undefined);
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: 'export const production = {};' }));
    } }],
});
// Persist only bundles without credentials. Secrets enter transient Worker bindings below.
await writeFile(resolve(output, 'web.mjs'), webBundle.outputFiles[0].text);
await writeFile(resolve(output, 'bridge.mjs'), bridgeBundle.outputFiles[0].text);
// Use the installed Worker compiler's Node compatibility shims, as the release does.
const runtimeBundles = {};
for (const [name, compatibility_date] of [['web', '2025-03-25'], ['bridge', '2024-09-23']]) {
    const config = resolve(output, `${name}.json`), outdir = resolve(output, `${name}-worker`);
    await writeFile(config, JSON.stringify({ name: `runtime-${name}`, main: `./${name}.mjs`, compatibility_date,
        compatibility_flags: ['nodejs_compat'], workers_dev: false }));
    const log = execFileSync(process.execPath, [resolve(bridge, 'node_modules/wrangler/bin/wrangler.js'),
        'deploy', '--dry-run', '--config', config, '--outdir', outdir], {
        cwd: output, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' },
    });
    await writeFile(resolve(output, `${name}-build.log`), log);
    const entries = (await readdir(outdir)).filter(file => /\.m?js$/.test(file));
    assert.equal(entries.length, 1); runtimeBundles[name] = resolve(outdir, entries[0]);
}
let mf, outerCount = 0, innerCount = 0, entitled = false, outerVisible = false, innerVisible = false;
let outerResult, innerResult, approvalToken, review, uploadJob = null, uploadMessage;
const unexpected = [], fixtureErrors = [], checks = [];
function pass(name) { checks.push(name); console.log(`${name}: PASS`); }
const receipt = () => ({ outcome: { status: { SuccessValue: '' }, tokens_burnt: '10', logs: [] } });
const json = body => new LocalResponse(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
async function outbound(request) {
    const url = new URL(request.url);
    if (url.href === `${issuer}.well-known/jwks.json`) return json({ keys: [{ ...jwk, kid: 'runtime', alg: 'RS256', use: 'sig' }] });
    if (url.href === `https://test.api.fastnear.com/v0/public_key/${encodeURIComponent(user.getPublicKey().toString())}`) {
        return json({ public_key: user.getPublicKey().toString(), account_ids: [accountId] });
    }
    if (url.href === 'https://bridge.test.invalid/__health') return json({ status: 'ok', service: 'livepeer-bridge',
        compactUpload: { version: 1, network: 'testnet', market }, sponsoredUploadRelayReady: true, newUploadReady: true });
    if (url.href !== 'https://test.rpc.fastnear.com/') { unexpected.push(`${url.origin}${url.pathname}`); return new LocalResponse('unexpected outbound blocked', { status: 500 }); }
    const { method, params } = await request.json();
    let result;
    if (method === 'broadcast_tx_async') {
        const signed = decodeSignedTransaction(Buffer.from(params[0], 'base64')), tx = signed.transaction;
        const hash = baseEncode(sha(encodeTransaction(tx))), call = tx.actions[0].functionCall;
        if (tx.signerId === 'mpc.testnet') {
            outerCount++; assert.equal(tx.receiverId, 'fast-auth.testnet');
            assert.equal(sponsor.verify(sha(encodeTransaction(tx)), new Uint8Array(signed.signature.ed25519Signature.data)), true);
            const args = JSON.parse(Buffer.from(call.args).toString());
            assert.equal(args.verify_payload, approvalToken); assert.deepEqual(args.sign_payload, uploadMode ? review.delegate : review.transaction);
            const signature = user.sign(sha(Buffer.from(args.sign_payload))).signature;
            outerResult = { final_execution_status: 'FINAL', status: { SuccessValue: Buffer.from(JSON.stringify({ signature: [...signature] })).toString('base64') },
                transaction: { hash, signer_id: tx.signerId, public_key: sponsor.getPublicKey().toString(), nonce: String(tx.nonce), receiver_id: tx.receiverId,
                    actions: [{ FunctionCall: { method_name: call.methodName, gas: String(call.gas), deposit: String(call.deposit), args: Buffer.from(call.args).toString('base64') } }] },
                transaction_outcome: receipt(), receipts_outcome: [receipt()] };
        } else {
            innerCount++; assert.equal(tx.signerId, accountId); assert.equal(tx.receiverId, usdc);
            assert.equal(user.verify(sha(encodeTransaction(tx)), new Uint8Array(signed.signature.ed25519Signature.data)), true);
            const event = receipt(); event.outcome.executor_id = market;
            event.outcome.logs = ['EVENT_JSON:' + JSON.stringify({ standard: 'youtick_market', version: '1.0.0', event: 'entitlement_purchased',
                data: [{ account_id: accountId, contract_id: market, publication_id: 'runtime-video', asset: 'USDC', amount: '2000000' }] })];
            innerResult = { final_execution_status: 'FINAL', status: { SuccessValue: Buffer.from(JSON.stringify('2000000')).toString('base64') },
                transaction: { hash, signer_id: accountId, public_key: user.getPublicKey().toString(), nonce: String(tx.nonce), receiver_id: tx.receiverId,
                    actions: [{ FunctionCall: { method_name: call.methodName, gas: String(call.gas), deposit: String(call.deposit), args: Buffer.from(call.args).toString('base64') } }] },
                transaction_outcome: receipt(), receipts_outcome: [event] };
        }
        // The node saw the exact signed transaction; the sender cannot know this from its lost response.
        return new LocalResponse('synthetic lost broadcast response', { status: 503 });
    }
    if (method === 'tx') {
        result = params.sender_account_id === 'mpc.testnet' ? outerVisible && outerResult : innerVisible && innerResult;
        return json(result ? { result } : { error: { cause: { name: 'UNKNOWN_TRANSACTION' } } });
    }
    if (method === 'EXPERIMENTAL_protocol_config') result = { protocol_version: 87, runtime_config: {
        min_gas_purchase_price: '1000000000', storage_amount_per_byte: '10000000000000000000' } };
    else if (method === 'block') result = { header: { height: 1000, hash: block } };
    else if (method === 'gas_price') result = { gas_price: '1000000000' };
    else if (method === 'query') {
        const common = { block_hash: block, block_height: 1000 };
        if (params.request_type === 'view_access_key') result = { ...common, permission: 'FullAccess', nonce: params.account_id === 'mpc.testnet' ? outerCount : innerCount };
        else if (params.request_type === 'view_account') result = { ...common, amount: '10000000000000000000000000', locked: '0', storage_usage: 200 };
        else if (params.request_type === 'view_state') result = { ...common, values: [] };
        else if (params.request_type === 'call_function') {
            const views = { paused: false, mpc_address: 'v1.signer-prod.testnet', mpc_domain_id: 1, derived_public_key: user.getPublicKey().toString(),
                get_publication: { publication_id: 'runtime-video', generation: 1, availability: 'ACTIVE', title: 'Runtime fixture', price_usdc: '2000000' },
                get_media_job: uploadJob, get_quote_key_version: 1, get_compact_upload_version: 1,
                get_governance_state: { bridge_frozen: false, new_purchases_paused: false }, has_entitlement: entitled,
                get_usdc_contract_id: usdc, ft_metadata: { decimals: 6 }, storage_balance_of: { total: '1250000000000000000000' },
                ft_balance_of: '2000000', get_playback_device: { ...device, authorizing_public_key: uploadMode ? null : user.getPublicKey().toString(),
                    authorized_at_ms: String(Date.now() - 1000), expires_at_ms: String(Date.now() - 1000 + 2592000000) } };
            if (!(params.method_name in views)) throw new Error('unexpected_view');
            result = { ...common, result: [...Buffer.from(JSON.stringify(views[params.method_name]))] };
        }
    }
    if (!result) { unexpected.push(method); return json({ error: 'unsupported_fixture_request' }); }
    return json({ result });
}
async function isolatedOutbound(request) {
    try { return await outbound(request); }
    catch (error) {
        fixtureErrors.push({ type: error.name, at: error.stack?.split('\n').find(line => line.includes('near-auth-ticket-runtime.mjs:')) });
        return new LocalResponse('fixture failure', { status: 500 });
    }
}
async function start({ enabled = false, bound = true, bridgeEnabled = enabled, limits = true, publicQuoteKey = quotePublicKey, quoteVersion = '1' } = {}) {
    await mf?.dispose();
    const configuredBridge = { ...bridgeEnv, NEAR_AUTH_MPC_ENABLED: String(bridgeEnabled), NEAR_AUTH_TICKET_ENABLED: String(bridgeEnabled), NEAR_AUTH_UPLOAD_ENABLED: String(bridgeEnabled) };
    if (!limits) delete configuredBridge.NEAR_AUTH_MPC_DAILY_YOCTO;
    assert.equal('CREATOR_FEE_QUOTE_PRIVATE_KEY' in configuredBridge, false);
    if (publicQuoteKey === null) delete configuredBridge.CREATOR_FEE_QUOTE_PUBLIC_KEY;
    else configuredBridge.CREATOR_FEE_QUOTE_PUBLIC_KEY = publicQuoteKey;
    configuredBridge.CREATOR_FEE_QUOTE_KEY_VERSION = quoteVersion;
    mf = new Miniflare({ host: '127.0.0.1', port: 0, log: new Log(LogLevel.ERROR), durableObjectsPersist: persist,
        workers: [
            { name: 'runtime-web', modules: [{ type: 'ESModule', path: runtimeBundles.web }], compatibilityDate: '2025-03-25', compatibilityFlags: ['nodejs_compat'],
                bindings: { ...webEnv, NEAR_AUTH_V1_MPC_ENABLED: String(enabled), NEAR_AUTH_V1_TICKET_ENABLED: String(enabled), NEAR_AUTH_V1_UPLOAD_ENABLED: String(enabled) },
                serviceBindings: bound ? { NEAR_AUTH_MPC: { name: 'runtime-bridge', entrypoint: 'NearAuthMpcSponsor' } } : {}, outboundService: isolatedOutbound },
            { name: 'runtime-bridge', modules: [{ type: 'ESModule', path: runtimeBundles.bridge }], compatibilityDate: '2024-09-23', compatibilityFlags: ['nodejs_compat'],
                bindings: { ...configuredBridge, CF_VERSION_METADATA: { id: 'runtime-synthetic' } }, durableObjects: { LIVEPEER_CONTROL: { className: 'LivepeerControl', useSQLite: true } }, outboundService: isolatedOutbound },
        ] });
    await mf.ready;
}
async function session() {
    return new EncryptJWT({ identity_issuer: issuer, client_id: clientId }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setIssuer('youtick-auth-v1').setAudience(origin).setSubject(subject).setIssuedAt().setExpirationTime('1h')
        .encrypt(Buffer.from(sessionSecret, 'hex'));
}
let cookie = await session();
async function call(body, expected = 200, headers = {}) {
    const response = await mf.dispatchFetch(`${origin}/api/auth/${purpose}`, { method: 'POST', headers: {
        'Content-Type': 'application/json', Origin: origin, Cookie: `youtick_auth_v1=${cookie}`, ...headers }, body: JSON.stringify(body) });
    const raw = await response.text();
    let value;
    try { value = JSON.parse(raw); } catch { throw new Error(`runtime_non_json_response: ${raw.slice(0, 1800)}`); }
    assert.deepEqual(fixtureErrors, [], 'fixture must not silently turn an assertion into an unknown chain result');
    if (value.runtimeStack) console.log(value.runtimeStack);
    assert.equal(response.status, expected, `unexpected route status (${body.action}, safe code ${value.error || 'none'})`);
    return value;
}
async function approval(bytes, changes = {}) {
    return new SignJWT({ sub: subject, azp: clientId, scope: 'transaction:sign', fatxn: bytes, ...changes })
        .setProtectedHeader({ alg: 'RS256', kid: 'runtime' }).setIssuer(issuer).setAudience('auth0.jwt.fast-auth.testnet')
        .setIssuedAt().setExpirationTime(changes.exp ?? '60s').sign(rsa.privateKey);
}
async function preparation(invalidSignature = false) {
    if (!uploadMode) return { action: 'prepare', publicationId: 'runtime-video', playbackSession: device, expectedPrice: '2000000' };
    const issued = Date.now() - 1000;
    const request = { creator_id: accountId, job_id: 'runtime-upload', title: 'Runtime upload', price_usdc: '2000000', expected_source_bytes: '9452298',
        profile_id: 'paid-media-livepeer-v1', profile_config_sha256: '28ba12452dd2cc55e64baf73a3dbf665784eeb8fd87892163818513165bbd3b2',
        upload_public_key: user.getPublicKey().toString(), upload_key_expires_at_ms: String(issued + 86400000) };
    const quote = { domain: 'youtick.sponsored-upload-quote', version: '1', network: 'testnet', contract_id: market, creator_id: accountId,
        job_id: request.job_id, request_sha256: sha(JSON.stringify(request)).toString('hex'), expected_source_bytes: request.expected_source_bytes,
        upload_fee_usdc: '500000', sponsor_fee_usdc: '100000', total_fee_usdc: '600000', delegate_receiver_id: usdc,
        delegate_method: 'ft_transfer_call', delegate_gas: '100000000000000', delegate_deposit_yocto: '1', issued_at_ms: String(issued),
        quote_block_height: '1000', max_delegate_block_height: '1200', expires_at_ms: String(issued + 120000), quote_key_version: 1 };
    quote.quote_id = sha(Object.values(quote).join('\n')).toString('hex');
    const canonical = Object.entries(quote).filter(([field]) => field !== 'quote_id').map(([, value]) => String(value)).join('\n');
    const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', quoteKeys.privateKey, new TextEncoder().encode(canonical)));
    if (invalidSignature) signature[0] ^= 1;
    uploadMessage = { action: 'create_paid_job', ...request, playback_session: device, sponsor_quote: quote, sponsor_quote_signature: Buffer.from(signature).toString('base64') };
    return { action: 'prepare', encodedArgs: Buffer.from(JSON.stringify({ receiver_id: market, amount: '600000', memo: 'YouTick creator upload fee', msg: JSON.stringify(uploadMessage) })).toString('base64') };
}
async function filesAt(path) {
    const entries = await readdir(path, { withFileTypes: true });
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? filesAt(resolve(path, entry.name)) : [resolve(path, entry.name)]))).flat();
}
try {
    await start();
    assert.equal((await call({ action: 'status', operationId: '' })).enabled, false);
    await call(uploadMode ? { action: 'prepare', encodedArgs: '' } : { action: 'execute', operationId: 'a'.repeat(64) }, 503);
    await call({ action: 'status', operationId: '' }, 401, { Cookie: '' });
    await call({ action: 'status', operationId: '' }, 403, { Origin: 'https://wrong.invalid' });
    assert.equal(outerCount + innerCount, 0); pass('closed-default-and-real-session-origin-validation');
    await start({ enabled: true, bound: false });
    assert.equal((await call({ action: 'status', operationId: '' })).enabled, false); pass('missing-binding-closed');
    await start({ enabled: true });
    if (uploadMode) {
        const invalid = (await call(await preparation(true))).review;
        await call({ action: 'submit', review: invalid.ticket, approvalToken: await approval(invalid.delegate) }, 422);
        assert.equal(outerCount, 0); pass('invalid-relay-quote-cannot-spend-mpc-budget');
    }
    review = (await call(await preparation())).review;
    assert.equal(review.accountId, accountId); assert.equal(uploadMode ? review.totalFeeUsdc : review.purchase.priceUsdc, uploadMode ? '600000' : '2000000');
    const bytes = uploadMode ? review.delegate : review.transaction;
    await call({ action: 'submit', review: review.ticket, approvalToken: await approval(bytes, { sub: 'wrong-subject' }) }, 422);
    await call({ action: 'submit', review: review.ticket, approvalToken: await approval(bytes, { exp: 1 }) }, 422);
    assert.equal(outerCount, 0); pass('actual-web-review-and-jwks-approval-validation');
    approvalToken = await approval(bytes);
    if (uploadMode) {
        for (const options of [{ publicQuoteKey: null }, { publicQuoteKey: '*' },
            { publicQuoteKey: Buffer.alloc(32).toString('base64') }, { quoteVersion: '2' }]) {
            await start({ enabled: true, ...options });
            await call({ action: 'submit', review: review.ticket, approvalToken }, 422);
            assert.equal(outerCount, 0);
        }
        pass('public-quote-key-missing-malformed-wrong-version-reject-before-spending');
    }

    await start({ enabled: true, bridgeEnabled: false });
    await call({ action: 'submit', review: review.ticket, approvalToken }, 422);
    await start({ enabled: true, limits: false });
    await call({ action: 'submit', review: review.ticket, approvalToken }, 422);
    assert.equal(outerCount, 0); pass('bridge-disabled-and-missing-budget-closed');
    await start({ enabled: true });
    const submitted = await Promise.all([call({ action: 'submit', review: review.ticket, approvalToken }), call({ action: 'submit', review: review.ticket, approvalToken })]);
    assert.equal(outerCount, 1); assert.equal(submitted[0].payment.operationId, submitted[1].payment.operationId);
    const op = submitted[0].payment.operationId;
    const pending = (await call({ action: 'status', operationId: op })).payment;
    assert.equal(pending.state, 'SUBMITTED'); assert.ok(pending.outerHash); pass('native-rpc-sqlite-concurrency-one-outer-send');
    await start({ enabled: true }); cookie = await session();
    const restored = (await call({ action: 'status', operationId: '' })).payment;
    assert.equal(restored.outerHash, pending.outerHash); assert.equal(restored.operationId, op); assert.equal(outerCount, 1);
    pass('runtime-restart-restores-unknown-outer-without-review');
    outerVisible = true;
    assert.equal((await call({ action: 'status', operationId: op })).payment.state, 'MPC_VERIFIED'); assert.equal(innerCount, 0);
    if (uploadMode) {
        const signed = (await call({ action: 'status', operationId: op })).payment;
        assert.ok(signed.upload.signedDelegateBase64); assert.equal(signed.upload.request.job_id, 'runtime-upload');
        assert.equal(innerCount, 0); pass('stored-legacy-delegate-recovery-without-inner-send');
        await start(); cookie = await session();
        const restored = (await call({ action: 'status', operationId: '' })).payment;
        assert.equal(restored.operationId, op); assert.equal(restored.upload.signedDelegateBase64, signed.upload.signedDelegateBase64);
        pass('flag-off-restart-preserves-upload-signature');
        uploadJob = { ...signed.upload.request, generation: 1, status: 'Authorized', fee_asset: 'USDC', fee_amount: 'wrong',
            fee_usd_micro: '600000', fee_quote_hash: uploadMessage.sponsor_quote.quote_id };
        await call({ action: 'status', operationId: op }, 422);
        uploadJob.fee_amount = '600000';
        assert.equal((await call({ action: 'status', operationId: op })).payment.state, 'UPLOAD_SETTLED');
        await start(); cookie = await session();
        assert.equal((await call({ action: 'status', operationId: '' })).payment.state, 'UPLOAD_SETTLED');
        assert.equal(outerCount, 1); assert.equal(innerCount, 0); pass('exact-final-job-device-proof-and-terminal-restart');
        await start({ enabled: true }); await call(await preparation(), 422);
        assert.equal(outerCount, 1); pass('existing-job-cannot-charge-again');
    } else {
    const inner = await Promise.all([call({ action: 'execute', operationId: op }), call({ action: 'execute', operationId: op })]);
    assert.equal(innerCount, 1); assert.equal(inner[0].payment.innerHash, inner[1].payment.innerHash); pass('verified-signature-one-inner-send');
    await start(); cookie = await session();
    const innerRestored = (await call({ action: 'status', operationId: '' })).payment;
    assert.equal(innerRestored.state, 'TICKET_SUBMITTED'); assert.equal(innerRestored.innerHash, inner[0].payment.innerHash);
    await call({ action: 'execute', operationId: op }, 503); assert.equal(innerCount, 1); pass('restart-and-kill-switch-preserve-inner-status');
    innerVisible = true;
    await call({ action: 'status', operationId: op }, 422); // Payment receipt alone is not entitlement.
    entitled = true;
    assert.equal((await call({ action: 'status', operationId: op })).payment.state, 'TICKET_SETTLED');
    await start(); cookie = await session();
    assert.equal((await call({ action: 'status', operationId: '' })).payment.state, 'TICKET_SETTLED');
    assert.equal(outerCount, 1); assert.equal(innerCount, 1); pass('final-entitlement-device-proof-and-terminal-restart');
    await start({ enabled: true });
    await call({ action: 'prepare', publicationId: 'runtime-video', playbackSession: device, expectedPrice: '2000000' }, 422);
    assert.equal(outerCount, 1); assert.equal(innerCount, 1); pass('owned-ticket-cannot-charge-again');
    }
    const publicBridge = await mf.getWorker('runtime-bridge');
    for (const path of ['/internal/mpc/submit', '/internal/mpc/status', '/internal/mpc/ticket']) {
        assert.notEqual((await publicBridge.fetch(`https://bridge.test.invalid${path}`, { method: 'POST', body: '{}' })).status, 200);
    }
    pass('no-public-mpc-http-route');
    await mf.dispose(); mf = undefined;
    const files = await filesAt(persist); assert.ok(files.length > 0);
    for (const file of files) {
        const contents = await readFile(file);
        for (const secret of [approvalToken, sponsor.toString(), quotePrivateKey, sessionSecret, subject]) assert.equal(contents.includes(Buffer.from(secret)), false, 'sensitive value persisted');
    }
    assert.deepEqual(unexpected, []); pass('persisted-records-contain-no-raw-credentials');
    const report = { result: 'PASS', evidence: 'LOCAL_TEST', nativeWorkerRpc: true, nativeSqliteDO: true,
        purpose, quoteVerificationPublicOnly: true, uploadRelayExecuted: false, realWebRoute: true, installedOpenNextInit: true, isolatedPort: true, liveProvider: false, liveChain: false,
        realNextServer: false, outerCount, innerCount, checks, output };
    await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await mf?.dispose(); }
