import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import { chromium } from '@playwright/test';

// LOCAL_TEST only: real components, client upload, device keys and attempt locks.
// Identity, wallet, chain, Bridge and TUS responses are local fixtures.
const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(web, '../..');
await mkdir(resolve(root, 'tmp'), { recursive: true });
const output = await mkdtemp(resolve(root, 'tmp/near-auth-ux-run-'));
const near = createRequire(import.meta.url)('near-api-js');
const profiles = JSON.parse(await readFile(resolve(root, 'protocol/paid-media-livepeer-v1/profiles.json'), 'utf8'));
const codecBundle = await build({ entryPoints: [resolve(root, 'protocol/paid-media-livepeer-v1/compact-upload.ts')], bundle: true, write: false, platform: 'node', format: 'esm' });
const { packCompactUpload } = await import('data:text/javascript;base64,' + Buffer.from(codecBundle.outputFiles[0].text).toString('base64'));
const owner = generateKeyPairSync('ed25519');
const publicBytes = owner.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
const account = publicBytes.toString('hex');
const publicKey = `ed25519:${near.baseEncode(publicBytes)}`;
const usdc = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
const sha = value => createHash('sha256').update(value).digest('hex');
const video = resolve(output, 'local-ux.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=0.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', video]);
const source = await readFile(video);
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {NearAuthLab} from './components/NearAuthLab';
createRoot(document.getElementById('root')).render(<React.StrictMode><NearAuthLab clientId="synthetic-client"/></React.StrictMode>);`;
const stubs = {
    'constants.ts': `export const FEATURE_FLAGS={publicTestnetVideoV1:true,publicTestnetBeta:false,enablePlaybackAuthorizerV2:true,enablePaidMediaLivepeerV1:true,enableSponsoredLivepeerUploads:true,enableLivepeerNearCreatorFee:false,enableDerivedReadModel:false};
        export const NEAR_CONFIG={marketContractId:'market.testnet',accessContractId:'access.testnet',usdcContractId:'${usdc}'};export const NEAR_NETWORK='testnet';
        export const APP_CONFIG={publicAppUrl:location.origin,livepeerBridgeUrl:'https://bridge.test.invalid'};
        export const MEDIA_UPLOAD_POLICY={paidSourceMaxBytes:5000000000,livepeerTusChunkBytes:4194304};
        export const GAS_CONSTANTS={mediumGas:100000000000000n,sessionKeyAllowance:'0.1'};`,
    'near.ts': `const read=async(path,body)=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('fixture_read_failed');return r.json()};
        export const getProvider=()=>({query:args=>read('/fixture/query',args)});export const viewContract=(_p,contract,method,args)=>read('/fixture/view',{contract,method,args});`,
    'near-auth-funding.ts': `import {PINNED_WALLET_MANIFEST} from './pinned-wallet-manifest';import {METEOR_ACCOUNT_STORAGE_KEY} from './wallet-account';
        const wallet={manifest:PINNED_WALLET_MANIFEST.wallets[0],getAccounts:async()=>[{accountId:'sponsor.testnet'}],signAndSendTransaction:async call=>{
            const r=await fetch('/fixture/sponsor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(call)});if(!r.ok)throw Error('reply unavailable');return r.json()}};
        export async function connectFundingWallet(){localStorage.setItem(METEOR_ACCOUNT_STORAGE_KEY,JSON.stringify({account:{accountId:'sponsor.testnet'},identifier:{blockchain:'near',network:'testnet',accountId:'sponsor.testnet'}}));return{wallet,accountId:'sponsor.testnet'}};
        export const readFundingReview=async()=>{throw Error('funding outside UX scope')};export const requestFundingApproval=readFundingReview;export const fundingAttemptKey=a=>'fixture-funding:'+a;`,
};
const bundle = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: web }, bundle: true, write: false, platform: 'browser', format: 'esm', jsx: 'automatic',
    alias: { util: createRequire(import.meta.url).resolve('next/dist/compiled/util') },
    define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_LIVEPEER_CREATOR_FEE_GAS_RESERVE_YOCTO': '"1000000000000000000000"', 'process.env': '{}', global: 'globalThis', __dirname: '"/"' },
    plugins: [{ name: 'external-fixtures', setup(b) {
        b.onLoad({ filter: /lib\/(constants|near|near-auth-funding)\.ts$/ }, ({ path }) => ({ loader: 'js', contents: stubs[path.split('/').pop()] }));
        b.onLoad({ filter: /components\/providers\/WalletProvider\.tsx$/ }, () => ({ loader: 'js', contents: `export const useWallet=()=>{throw Error('unexpected ordinary wallet')};` }));
        b.onLoad({ filter: /components\/LivepeerPlayerSurface\.tsx$/ }, () => ({ loader: 'jsx', contents: `import React from 'react';export const LivepeerPlayerSurface=()=> <div>Fixture media surface</div>;` }));
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
        b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'jsx', resolveDir: web, contents: path === 'link'
            ? `import React from 'react';export default function Link(props){return <a {...props}/>}`
            : `import {useSyncExternalStore} from 'react';const subscribe=fn=>{addEventListener('popstate',fn);return()=>removeEventListener('popstate',fn)};export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search,()=>''));export const useRouter=()=>({replace:url=>{history.replaceState(null,'',url);dispatchEvent(new PopStateEvent('popstate'))}});` }));
        b.onResolve({ filter: /^@auth0\/auth0-spa-js$/ }, () => ({ path: 'auth0', namespace: 'identity' }));
        b.onLoad({ filter: /.*/, namespace: 'identity' }, () => ({ loader: 'js', contents: `export class Auth0Client {
            async getTokenWithPopup(input){const r=await fetch('/fixture/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const v=await r.json();if(v.error){const e=new Error(v.error);e.error=v.error;throw e}return 'synthetic-token'}
            async logout(){};async loginWithPopup(){throw Error('unexpected real login')};
        }` }));
    } }],
});
const compiler = await compile(await readFile(resolve(web, 'app/globals.css'), 'utf8'), { base: web, onDependency() {} });
const css = compiler.build(new Scanner({ sources: [{ base: web, pattern: 'components/**/*.tsx', negated: false }] }).scan());
let state;
const errors = [], blocked = [], scenarios = [], failures = [], dialogs = [];
const reset = mode => { state = { mode, google: 0, sponsor: 0, broadcast: 0, relay: 0, patches: 0, review: null, job: null, published: false, authenticated: true }; };
reset('success');

async function fixture(path, body, method = 'POST', search = '') {
    const ok = value => ({ status: 200, value });
    if (path === '/api/auth-lab/session') { if (method === 'DELETE') state.authenticated = false; return ok({ authenticated: state.authenticated }); }
    if (path === '/api/auth-lab/account') {
        if (new URLSearchParams(search).has('publication')) return ok({ accountId: account, marketContractId: 'market.testnet', publicationId: new URLSearchParams(search).get('publication'), reason: 'entitlement_required', entitled: false, availability: 'ACTIVE', blockHeight: 1000 });
        return ok({ implicitAccount: account, accounts: [account], publicKey, blockHeight: 1000 });
    }
    if (path === '/fixture/google') { state.google++; return ok(['google-cancel', 'google-timeout'].includes(state.mode) ? { error: state.mode === 'google-cancel' ? 'cancelled' : 'timeout' } : {}); }
    if (path === '/fixture/sponsor') {
        state.sponsor++;
        if (state.mode === 'pending') return { status: 503, value: { error: 'unknown' } };
        if (state.mode === 'wait') await new Promise(resolve => { state.release = resolve; });
        return ok({ transaction: { hash: '3'.repeat(44) } });
    }
    if (path === '/fixture/query') return ok({ amount: '1000000000000000000000000', locked: '0' });
    if (path === '/fixture/view') {
        if (body.method === 'ft_balance_of') return ok('3000000');
        if (body.method === 'get_media_job') return ok(state.job);
        if (body.method === 'get_publication') return ok(state.published ? { publication_id: state.job.job_id, creator_id: account, title: state.job.title, price_usdc: state.job.price_usdc, generation: 1, playback_id: 'playback_001', availability: 'ACTIVE', published_at_ms: Date.now() } : null);
        if (body.method === 'get_governance_state') return ok({ bridge_frozen: false });
        if (body.method === 'get_public_upload_policy') return ok({ environment: 'public-testnet', network: 'testnet', market_contract_id: 'market.testnet', version: 1, max_source_bytes: '5000000000', job_ttl_ms: '86400000', signed_quote_required: true, profiles: [profiles.adaptive, profiles.legacy].map(p => ({ profile_id: 'paid-media-livepeer-v1', profile_config_sha256: p.hash })) });
        if (body.method === 'get_playback_device') return ok(state.job ? { ...state.review.playbackSession, authorized_at_ms: String(Date.now() - 1000), expires_at_ms: String(Date.now() + 2591999000), authorizing_public_key: null } : null);
    }
    if (path === '/api/auth-lab/signing') {
        const fail = reason => ({ status: 422, value: { error: 'signing_check_failed', action: body.action, reason } });
        if (body.action.startsWith('prepare')) {
            if (state.mode === 'purchase-balance-required' && body.action === 'prepare-purchase') return fail('ticket_balance_required');
            if (state.mode === 'deployment-missing') return fail('compact_upload_unavailable');
            if (body.action === 'prepare-upload') {
                const args = JSON.parse(Buffer.from(body.encodedArgs, 'base64')); const m = JSON.parse(args.msg);
                const compact = await packCompactUpload(m, k => near.PublicKey.fromString(k).data, { network: 'testnet', market: 'market.testnet', creator: account, usdc, keyString: b => `ed25519:${near.baseEncode(b)}` });
                state.delegate = near.buildDelegateAction({ senderId: account, receiverId: usdc, publicKey: near.PublicKey.fromString(publicKey), nonce: 11n, maxBlockHeight: 1200n,
                    actions: [near.actions.functionCall('ft_transfer_call', { receiver_id: 'market.testnet', amount: args.amount, msg: compact }, 100000000000000n, 1n)] });
                state.request = m;
                state.review = { ticket: 'synthetic-ticket', accountId: account, sponsor: 'sponsor.testnet', jobId: m.job_id, title: m.title, sourceBytes: m.expected_source_bytes,
                    priceUsdc: m.price_usdc, totalFeeUsdc: args.amount, playbackSession: m.playback_session, delegate: [...near.encodeDelegateAction(state.delegate)], expiresAt: Math.min(Date.now() + 120000, Number(m.sponsor_quote.expires_at_ms)) };
            } else state.review = { ticket: 'synthetic-ticket', accountId: account, sponsor: 'sponsor.testnet', publicKey, transaction: [1, 2, 3], transactionHash: '4'.repeat(44), expiresAt: Date.now() + (state.mode === 'review-expired' ? -1 : 300000),
                ...(body.action === 'prepare-purchase' ? { purchase: { marketContractId: 'market.testnet', usdcContractId: usdc, publicationId: body.publicationId, title: 'Yerel test bileti', priceUsdc: '2250000', playbackSession: body.playbackSession } } : {}) };
            return ok(state.review);
        }
        if (body.action.startsWith('authorize')) {
            if (state.mode === 'approval-expired') return fail('authorization_expired');
            return ok({ receiverId: 'fast-auth.testnet', actions: [], approvalExpiresAtMs: Date.now() + 60000 });
        }
        if (body.action === 'complete-upload') {
            const signature = sign(null, createHash('sha256').update(near.encodeDelegateAction(state.delegate)).digest(), owner.privateKey);
            return ok({ accountId: account, jobId: state.request.job_id, signedDelegate: Buffer.from(near.encodeSignedDelegate({ delegateAction: state.delegate, signature: new near.Signature({ keyType: 0, data: signature }) })).toString('base64') });
        }
        if (body.action === 'complete') return ok({ accountId: account, transactionHash: '4'.repeat(44), signedTransaction: 'synthetic-signed-transaction' });
        if (body.action === 'verify') return ok({ verified: true, transactionHash: '4'.repeat(44) });
    }
    if (path === '/rpc') { assert.equal(body.method, 'broadcast_tx_commit'); state.broadcast++; return ok({ result: {} }); }
    if (path === '/v1/upload-preflight') return ok({ available: true });
    if (path === '/v1/sponsored-upload-quotes') {
        const r = body.request, fee = ((BigInt(r.expected_source_bytes) * 3n + 9999n) / 10000n);
        const upload = fee > 500000n ? fee : 500000n;
        const issuedAt = Date.now();
        const q = { domain: 'youtick.sponsored-upload-quote', version: '1', network: 'testnet', contract_id: 'market.testnet', creator_id: r.creator_id, job_id: r.job_id,
            request_sha256: sha(JSON.stringify(r)), expected_source_bytes: r.expected_source_bytes, upload_fee_usdc: String(upload), sponsor_fee_usdc: '100000', total_fee_usdc: String(upload + 100000n),
            delegate_receiver_id: usdc, delegate_method: 'ft_transfer_call', delegate_gas: '100000000000000', delegate_deposit_yocto: '1', issued_at_ms: String(issuedAt),
            quote_block_height: '1000', max_delegate_block_height: '1200', expires_at_ms: String(issuedAt + 120000), quote_key_version: 1 };
        q.quote_id = sha(Object.values(q).map(String).join('\n'));
        return ok({ request: r, quote: q, signature: Buffer.alloc(64, 7).toString('base64'), public_key_version: 1 });
    }
    if (path === '/v1/sponsored-upload-relays') {
        state.relay++;
        const r = state.request;
        state.job = { ...r, status: 'Authorized', generation: 1, created_at_ms: Date.now(), fee_asset: 'USDC', fee_quote_hash: r.sponsor_quote.quote_id };
        return ok({ accepted: true, relayed: true, job_id: r.job_id });
    }
    if (path === '/v1/upload-intents') {
        if (body.body.recovery) return ok({ job_id: state.job.job_id, generation: 1, state: state.published ? 'ONCHAIN_PUBLISHED' : 'PROCESSING' });
        return ok({ schema: 'youtick.livepeer-upload-intent.v2', job_id: body.body.job_id, generation: 1, expected_source_bytes: body.body.expected_source_bytes, source_type: 'mp4', chunk_bytes: 4194304,
            tus_endpoint: 'https://origin.livepeer.com/api/asset/upload/tus?token=synthetic', lease_id: '00000000-0000-4000-8000-000000000001', lease_expires_at_ms: String(Date.now() + 300000), heartbeat_interval_ms: 300000, created: true });
    }
    throw Error(`Unexpected fixture request ${path} ${body?.method || body?.action || ''}`);
}

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
            res.setHeader('content-type', url.pathname === '/app.js' ? 'text/javascript' : url.pathname === '/style.css' ? 'text/css' : 'text/html');
            return res.end(url.pathname === '/app.js' ? bundle.outputFiles[0].text : url.pathname === '/style.css' ? css : '<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local NEAR Auth UX</title><link rel="stylesheet" href="/style.css"><body style="margin:0;font-family:system-ui"><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
        }
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
        const reply = await fixture(url.pathname, body, req.method, url.search);
        res.writeHead(reply.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(reply.value));
    } catch (error) { errors.push(error.message); res.writeHead(500); res.end('{}'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://localhost:${server.address().port}`;
let browser;
const signing = page => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Google ile imza denemesi', exact: true }) }).last();
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function run(name, work, mode = 'success', width = 1100) {
    reset(mode);
    const context = await browser.newContext({ locale: 'tr-TR', viewport: { width, height: 850 } });
    context.setDefaultTimeout(10000);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin === origin) return route.continue();
        const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST,OPTIONS,HEAD,PATCH', 'access-control-expose-headers': 'Upload-Offset,Upload-Length,Tus-Resumable' };
        if (['https://bridge.test.invalid', 'https://test.rpc.fastnear.com'].includes(url.origin)) {
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
            try { const reply = await fixture(url.origin.includes('fastnear') ? '/rpc' : url.pathname, req.postDataJSON()); return route.fulfill({ status: reply.status, headers, contentType: 'application/json', body: JSON.stringify(reply.value) }); }
            catch (error) { errors.push(error.message); return route.fulfill({ status: 500, headers, body: '{}' }); }
        }
        if (url.origin === 'https://origin.livepeer.com' && url.pathname === '/api/asset/upload/tus') {
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
            if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { ...headers, 'Upload-Offset': '0', 'Upload-Length': String(source.length), 'Tus-Resumable': '1.0.0' } });
            if (req.method() === 'PATCH') { state.patches++; state.published = state.mode !== 'processing'; return route.fulfill({ status: 204, headers: { ...headers, 'Upload-Offset': String(source.length), 'Tus-Resumable': '1.0.0' } }); }
        }
        blocked.push(url.origin + url.pathname); return route.abort();
    });
    try {
        await page.goto(`${origin}/auth-lab`);
        await button(page, 'Sponsor cüzdanını seç ve işlemi hazırla').waitFor();
        await work(page);
        scenarios.push({ name, result: 'PASS', google: state.google, sponsor: state.sponsor, broadcast: state.broadcast, relay: state.relay, patches: state.patches });
    } catch (error) {
        failures.push({ name, error: error.message, text: await page.locator('body').innerText().catch(() => '') });
        await page.screenshot({ path: resolve(output, `${name}-failure.png`), fullPage: true }).catch(() => {});
    } finally { state.release?.(); await context.close(); console.log(name, failures.some(f => f.name === name) ? 'FAILED' : 'PASS'); }
}
async function prepareSigning(page) {
    await button(page, 'Sponsor cüzdanını seç ve işlemi hazırla').click();
    await signing(page).getByRole('checkbox').waitFor();
    assert.equal(state.google, 0); assert.equal(state.sponsor, 0);
    assert.equal(await button(page, 'Google ile bu işleme onay ver').isDisabled(), true);
    await signing(page).getByRole('checkbox').check();
}
async function approveSigning(page) {
    await button(page, 'Google ile bu işleme onay ver').click();
    await page.getByText('Google onayı doğrulandı. Zincire henüz işlem gönderilmedi.', { exact: true }).waitFor();
}
async function prepareUpload(page, again = false) {
    await button(page, 'İmza sponsorunu seç ve yükleme formunu aç').click();
    await page.locator('input[type=file]').setInputFiles(video);
    if (!again) { await page.getByLabel('Title', { exact: true }).fill('Türkçe UX denemesi'); await page.getByLabel('Ticket price in USDC').fill('2.25'); }
    const rights = page.getByLabel('I own the rights required to publish this video.');
    if (await rights.isEnabled()) await rights.check();
    const check = button(page, 'Check payment options');
    if (await check.count()) { await check.click(); await button(page, 'Pay and upload').waitFor(); }
}

try {
    browser = await chromium.launch({ executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: true });
    await run('sign-success', async page => {
        await prepareSigning(page); await page.screenshot({ path: resolve(output, 'sign-review-desktop.png'), fullPage: true });
        await approveSigning(page); await button(page, 'Sponsor onayını aç ve imzalı testi gönder').click();
        await page.getByText('Google imzasıyla işlem kesinleşti.', { exact: false }).waitFor();
        assert.equal(state.sponsor, 1); assert.equal(state.broadcast, 1);
    });
    await run('mobile-fit', async page => {
        await prepareSigning(page); await page.screenshot({ path: resolve(output, 'sign-review-mobile.png'), fullPage: true });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile page must not overflow');
        const overflow = await page.locator('button').evaluateAll(list => list.filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent));
        assert.deepEqual(overflow, [], 'button text must fit');
    }, 'success', 320);
    for (const mode of ['google-cancel', 'google-timeout', 'review-expired']) await run(mode, async page => {
        await prepareSigning(page); await button(page, 'Google ile bu işleme onay ver').click();
        await signing(page).getByRole('status').filter({ hasNotText: 'Lütfen bekleyin' }).waitFor();
        assert.match(await signing(page).innerText(), /ödeme.*(?:başlatılmadı|istenmedi)/i);
        assert.equal(state.sponsor, 0); assert.equal(state.broadcast, 0);
    }, mode);
    await run('approval-expired', async page => {
        await prepareSigning(page); await approveSigning(page); state.mode = 'approval-expired';
        await button(page, 'Sponsor onayını aç ve imzalı testi gönder').click();
        await signing(page).getByRole('status').filter({ hasNotText: 'Lütfen bekleyin' }).waitFor();
        assert.match(await signing(page).innerText(), /ödeme.*(?:başlatılmadı|istenmedi)/i);
        assert.equal(state.sponsor, 0);
    });
    await run('pending-reload', async page => {
        await prepareSigning(page); await approveSigning(page); await button(page, 'Sponsor onayını aç ve imzalı testi gönder').click();
        await page.getByText('İşlem tamamlanamadı veya sonucu belirsiz.', { exact: false }).waitFor();
        await page.reload(); await button(page, 'Sponsor cüzdanını seç ve işlemi hazırla').click();
        await page.getByText('Kontrol kodu: signing_already_started', { exact: false }).waitFor();
        assert.equal(await button(page, 'Sponsor cüzdanını seç ve işlemi hazırla').isDisabled(), true);
        assert.equal(state.sponsor, 1); assert.equal(state.broadcast, 0); assert.equal(state.google, 1);
    }, 'pending');
    await run('busy-lock', async page => {
        await prepareSigning(page); await approveSigning(page); await button(page, 'Sponsor onayını aç ve imzalı testi gönder').click();
        await page.waitForFunction(() => document.querySelector('section[aria-busy="true"]'));
        assert.equal(await button(page, 'İmza sponsorunu seç ve yükleme formunu aç').isDisabled(), true);
        assert.equal(await button(page, 'Deneme oturumundan çık').isDisabled(), true);
        for (let i = 0; !state.release && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(typeof state.release, 'function');
        state.release(); await page.getByText('Google imzasıyla işlem kesinleşti.', { exact: false }).waitFor();
        assert.equal(state.sponsor, 1);
    }, 'wait');
    await run('upload-cancel', async page => {
        await prepareUpload(page); page.once('dialog', async dialog => { dialogs.push({ case: 'cancel', text: dialog.message() }); await dialog.dismiss(); });
        await button(page, 'Pay and upload').click(); await page.getByRole('alert').filter({ hasText: 'Upload approval cancelled' }).waitFor();
        assert.equal(state.google, 0); assert.equal(state.sponsor, 0); assert.equal(state.relay, 0);
    });
    await run('upload-deployment-missing', async page => {
        await prepareUpload(page); await button(page, 'Pay and upload').click();
        await page.getByRole('alert').filter({ hasText: 'compatible upload service' }).waitFor();
        assert.equal(state.google, 0); assert.equal(state.sponsor, 0);
    }, 'deployment-missing');
    for (const mode of ['google-cancel', 'google-timeout', 'approval-expired']) await run(`upload-${mode}`, async page => {
        await prepareUpload(page); page.on('dialog', dialog => dialog.accept());
        await button(page, 'Pay and upload').click();
        await page.getByRole('alert').waitFor();
        assert.match(await page.getByRole('alert').innerText(), /No sponsor payment|authorization_expired/);
        assert.equal(state.sponsor, 0); assert.equal(state.relay, 0);
    }, mode);
    await run('upload-mobile-fit', async page => {
        await prepareUpload(page);
        await page.screenshot({ path: resolve(output, 'upload-review-mobile.png'), fullPage: true });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile upload must not overflow');
        assert.deepEqual(await page.locator('button').evaluateAll(list => list.filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent)), []);
    }, 'success', 320);
    await run('upload-processing-reload', async page => {
        await prepareUpload(page); page.on('dialog', dialog => dialog.accept());
        await button(page, 'Pay and upload').click();
        await button(page, 'Waiting for publication').waitFor();
        const jobId = state.job.job_id;
        await page.reload(); await button(page, 'İmza sponsorunu seç ve yükleme formunu aç').click();
        await page.locator('input[type=file]').setInputFiles(video);
        await button(page, 'Resume / check existing upload').click();
        await button(page, 'Waiting for publication').waitFor();
        assert.equal(state.job.job_id, jobId);
        assert.equal(state.google, 1); assert.equal(state.sponsor, 1); assert.equal(state.relay, 1); assert.equal(state.patches, 1);
        await page.screenshot({ path: resolve(output, 'upload-processing-reload.png'), fullPage: true });
    }, 'processing');
    await run('purchase-existing-record', async page => {
        const key = `youtick:auth-lab:ticket:testnet:market.testnet:${account}:lp-local-ux-ticket`;
        await page.evaluate(key => localStorage.setItem(key, '{"state":"outer_pending"}'), key);
        await page.getByLabel('Video yayın kimliği').fill('lp-local-ux-ticket');
        await button(page, 'Bu video için hakkımı kontrol et').click();
        const purchase = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Google ile test bileti satın al', exact: true }) }).last();
        await purchase.getByText('Kontrol kodu: signing_already_started', { exact: false }).waitFor();
        assert.equal(await purchase.getByRole('button', { name: 'Sponsor cüzdanını seç ve işlemi hazırla', exact: true }).isDisabled(), true);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), key), '{"state":"outer_pending"}');
        assert.equal(state.google, 0); assert.equal(state.sponsor, 0); assert.equal(state.broadcast, 0);
    });
    await run('purchase-balance-required', async page => {
        await page.getByLabel('Video yayın kimliği').fill('lp-local-ux-ticket');
        await button(page, 'Bu video için hakkımı kontrol et').click();
        const purchase = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Google ile test bileti satın al', exact: true }) }).last();
        await purchase.getByRole('button', { name: 'Sponsor cüzdanını seç ve işlemi hazırla', exact: true }).click();
        await purchase.getByText('Kontrol kodu: ticket_balance_required', { exact: false }).waitFor();
        assert.equal(state.google, 0); assert.equal(state.sponsor, 0); assert.equal(state.broadcast, 0);
    }, 'purchase-balance-required');
    await run('purchase-review', async page => {
        const demoKey = `youtick:auth-lab:signing:testnet:${account}`;
        await page.evaluate(key => localStorage.setItem(key, '{"state":"outer_pending"}'), demoKey);
        await page.getByLabel('Video yayın kimliği').fill('lp-local-ux-ticket');
        await button(page, 'Bu video için hakkımı kontrol et').click();
        const purchase = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Google ile test bileti satın al', exact: true }) }).last();
        await purchase.getByRole('button', { name: 'Sponsor cüzdanını seç ve işlemi hazırla', exact: true }).click();
        await purchase.getByText('Bilet bedeli: 2.250000 test USDC', { exact: true }).waitFor();
        assert.equal(state.google, 0); assert.equal(state.sponsor, 0);
        assert.equal(await purchase.getByRole('button', { name: 'Google ile bu işleme onay ver', exact: true }).isDisabled(), true);
        await purchase.getByRole('checkbox').check();
        await page.screenshot({ path: resolve(output, 'purchase-review.png'), fullPage: true });
        await purchase.getByRole('button', { name: 'Google ile bu işleme onay ver', exact: true }).click();
        await purchase.getByText('Google onayı doğrulandı. Zincire henüz işlem gönderilmedi.', { exact: true }).waitFor();
        await purchase.getByRole('button', { name: 'Sponsor onayını aç ve imzalı testi gönder', exact: true }).click();
        await purchase.getByText('Satın alma ve bu cihazın yetkisi doğrulandı.', { exact: false }).waitFor();
        assert.equal(state.sponsor, 1); assert.equal(state.broadcast, 1);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), demoKey), '{"state":"outer_pending"}');
    });
    await run('upload-pending-reload', async page => {
        await prepareUpload(page); page.on('dialog', dialog => dialog.accept());
        await button(page, 'Pay and upload').click();
        await page.getByRole('alert').filter({ hasText: 'result is uncertain' }).waitFor();
        assert.equal(state.sponsor, 1); await page.reload(); await prepareUpload(page, true); await button(page, 'Pay and upload').click();
        await page.getByRole('alert').filter({ hasText: 'already started' }).waitFor();
        assert.equal(state.sponsor, 1); assert.equal(state.google, 1); assert.equal(state.relay, 0);
    }, 'pending');
    await run('upload-success-reload', async page => {
        await prepareUpload(page); page.once('dialog', async dialog => {
            const message = dialog.message(); dialogs.push({ case: 'success', text: message });
            assert.ok(message.includes('Türkçe UX denemesi') && message.includes('0.600000 test USDC') && message.includes('2.250000 test USDC'));
            assert.ok(!message.includes('yt:u1:')); await dialog.accept();
        });
        await button(page, 'Pay and upload').click(); await page.getByRole('link', { name: 'Open publication', exact: true }).waitFor();
        assert.equal(state.sponsor, 1); assert.equal(state.relay, 1); assert.equal(state.patches, 1);
        assert.deepEqual(await page.locator('ol[aria-label="Publication progress"] li').evaluateAll(list => list.filter(item => item.scrollWidth > item.clientWidth + 1).map(item => item.textContent)), [], 'progress labels must fit their columns');
        await page.screenshot({ path: resolve(output, 'upload-published.png'), fullPage: true });
        await page.reload(); await button(page, 'İmza sponsorunu seç ve yükleme formunu aç').click();
        await page.getByRole('link', { name: 'Open publication', exact: true }).waitFor();
        assert.equal(state.sponsor, 1); assert.equal(state.relay, 1);
    });
    const report = { result: failures.length || errors.length || blocked.length ? 'FAILED' : 'PASS', evidence: 'LOCAL_TEST', browser: await browser.version(),
        executable: 'Brave Browser', isolatedContext: true, realWallet: false, realProvider: false, realMediaDelivery: false, scenarios, failures, errors, blocked, output };
    await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2)); await writeFile(resolve(output, 'dialogs.json'), JSON.stringify(dialogs, null, 2));
    console.log(JSON.stringify(report)); assert.equal(report.result, 'PASS');
} finally { state.release?.(); await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
