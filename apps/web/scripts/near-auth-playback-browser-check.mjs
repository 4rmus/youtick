import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

// LOCAL_TEST: real React, V2 request signing, IndexedDB and BroadcastChannel.
// Isolated Brave context; Auth0, NEAR, token replies and the media surface are fixtures.
const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const account = 'ab'.repeat(32);
const entry = `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {NearAuthLab} from './components/NearAuthLab';
import {preparePlaybackDevice,getDeviceSession} from './lib/device-session';
window.fixture={mode:new URLSearchParams(location.search).get('case')||'valid',deviceReads:0};
window.fixture.device=await preparePlaybackDevice('${account}');
window.fixture.deviceKey=async()=>{const d=await getDeviceSession('${account}');return d?{key:d.certificate.session_public_key,extractable:d.privateKey.extractable}:null};
createRoot(document.getElementById('root')).render(<React.StrictMode><NearAuthLab clientId="synthetic-client"/></React.StrictMode>);
`;
const stubs = {
    'constants.ts': `export const FEATURE_FLAGS={publicTestnetVideoV1:true,enablePlaybackAuthorizerV2:new URLSearchParams(location.search).get('case')!=='v2-off',enablePaidMediaLivepeerV1:true};
        export const NEAR_CONFIG={marketContractId:'market.testnet'};export const NEAR_NETWORK='testnet';
        export const APP_CONFIG={publicAppUrl:location.origin,livepeerBridgeUrl:'https://bridge.test.invalid'};export const GAS_CONSTANTS={mediumGas:100000000000000n,sessionKeyAllowance:'0.1'};`,
    'near.ts': `export const getProvider=()=>({});export const viewContract=async(_p,_c,method,args)=>{
        const f=window.fixture;
        if(method==='get_publication') {
            if(f.mode==='provider-error')throw Error('synthetic provider unavailable');
            if(f.mode==='late')await new Promise(resolve=>f.finishRead=resolve);
            return {publication_id:args.publication_id,creator_id:f.mode==='wrong-owner'?'another.testnet':'${account}',
                title:'Synthetic creator video',price_usdc:'2000000',generation:1,playback_id:'playback_001',
                availability:f.mode==='takedown'?'TAKEDOWN':'ACTIVE',published_at_ms:1};
        }
        if(method==='get_playback_device') {
            f.deviceReads++;
            if(f.mode==='missing-device')return null;
            const start=Date.now()-1000-(f.mode==='expired-device'?2592000000:0);
            return {...f.device,certificate_sha256:f.mode==='wrong-device'?'0'.repeat(64):f.device.certificate_sha256,
                authorized_at_ms:String(start),expires_at_ms:String(start+2592000000)};
        }
        throw Error('unexpected chain read: '+method);
    };`,
    'livepeer-player-media.ts': `export const playbackMode=async()=>'hls';`,
};
const bundle = await build({ stdin:{contents:entry,loader:'tsx',resolveDir:web},bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',
    alias:{util:createRequire(import.meta.url).resolve('next/dist/compiled/util')},
    define:{'process.env.NODE_ENV':'"development"','process.env':'{}',global:'globalThis',__dirname:'"/"'},
    plugins:[{name:'local-fixtures',setup(b){
        b.onLoad({filter:/lib\/(constants|near|livepeer-player-media)\.ts$/},({path})=>({loader:'js',contents:stubs[path.split('/').pop()]}));
        b.onLoad({filter:/components\/NearAuth(Signing|Upload|Funding)\.tsx$/},({path})=>({loader:'js',contents:`export const ${path.split('/').pop().replace('.tsx','')}=()=>null;`}));
        b.onLoad({filter:/components\/providers\/WalletProvider\.tsx$/},()=>({loader:'js',contents:`export const useWallet=()=>{throw Error('unexpected wallet context')};`}));
        b.onLoad({filter:/components\/LivepeerPlayerSurface\.tsx$/},()=>({loader:'jsx',contents:`import React from 'react';export const LivepeerPlayerSurface=({input,retry})=><div data-testid="player-opened" data-account={input.accountId} data-job={input.jobId}>Local V2 session<button onClick={retry}>Retry playback</button></div>;`}));
        b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));
        b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',resolveDir:web,contents:`import {useSyncExternalStore} from 'react';
            const subscribe=fn=>{addEventListener('popstate',fn);return()=>removeEventListener('popstate',fn)};
            export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search,()=>''));
            export const useRouter=()=>({replace:url=>{history.replaceState(null,'',url);dispatchEvent(new PopStateEvent('popstate'))}});`}));
        b.onResolve({filter:/^@auth0\/auth0-spa-js$/},()=>({path:'auth0',namespace:'auth-fixture'}));
        b.onLoad({filter:/.*/,namespace:'auth-fixture'},()=>({loader:'js',contents:`export class Auth0Client {
            async logout(){};async loginWithPopup(){throw Error('unexpected Google popup')};
            async getTokenWithPopup(){throw Error('unexpected Google signing')};
        }`}));
    }}],
});

let authenticated=true, currentAccount=account;
const tokens=[], errors=[], requests=[];
const tokenReply=request=>{
    tokens.push(request);
    return {schema:'youtick.livepeer-playback-token.v2',playback_id:'playback_001',token:'synthetic.header.signature',
        expires_at_ms:String(Date.now()+31000),hls_url:'https://playback.livepeer.studio/asset/hls/playback_001/index.m3u8'};
};
const server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    if(url.pathname==='/api/auth-lab/session') {
        if(req.method==='DELETE')authenticated=false;
        return json({authenticated});
    }
    if(url.pathname==='/api/auth-lab/account') {
        const job=url.searchParams.get('publication');requests.push({job,authenticated});
        if(!authenticated)return json({error:'session_required'},401);
        return json(job?{accountId:currentAccount,marketContractId:'market.testnet',publicationId:job,blockHeight:1,
            availability:'ACTIVE',entitled:true,reason:'entitled',playbackVerified:false}
            :{implicitAccount:currentAccount,accounts:[currentAccount]});
    }
    if(url.pathname.startsWith('/api/')||req.method!=='GET'){errors.push('unexpected API: '+req.url);return json({},400);}
    res.setHeader('content-type',url.pathname==='/app.js'?'text/javascript':'text/html');
    res.end(url.pathname==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><meta charset="utf-8"><title>Local Google playback check</title><div id="root"></div><script type="module" src="/app.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const scenarios=[];
try {
    browser=await chromium.launch({executablePath:'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',headless:true});
    const context=await browser.newContext({locale:'tr-TR'});
    const origin=`http://localhost:${server.address().port}`;
    await context.route('**/*',route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.origin===origin)return route.continue();
        if(url.href==='https://bridge.test.invalid/v2/playback-tokens') {
            const headers={'access-control-allow-origin':origin,'access-control-allow-headers':'content-type','access-control-allow-methods':'POST, OPTIONS'};
            if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
            assert.equal(request.method(),'POST');
            return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(tokenReply(request.postDataJSON()))});
        }
        return route.abort();
    });
    context.on('page',page=>page.on('pageerror',error=>errors.push(error.stack ?? error.message)));
    context.setDefaultTimeout(10_000);
    const page=await context.newPage();
    const opened=p=>p.getByTestId('player-opened');
    const check=p=>p.getByRole('button',{name:'Bu video için hakkımı kontrol et',exact:true});
    await page.goto(`${origin}/auth-lab?job=job-001`);
    await opened(page).waitFor();
    assert.equal(await opened(page).getAttribute('data-account'),account);
    const key=await page.evaluate(()=>window.fixture.deviceKey());
    assert.equal(key.extractable,false);
    await page.waitForResponse(response=>response.url()==='https://bridge.test.invalid/v2/playback-tokens'&&response.request().method()==='POST');
    assert.ok(tokens.length>=2,'real V2 renewal should use the same device without a wallet');
    assert.ok(tokens.every(t=>t.certificate.session_public_key===key.key&&t.request.account_id===account&&t.request_signature.length===88));
    scenarios.push('creator session and V2 renewal without WalletProvider');

    await page.reload();await opened(page).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.fixture.deviceKey()),key);
    scenarios.push('reload retains the same non-extractable V3 key');

    authenticated=false;
    await page.getByRole('button',{name:'Retry playback',exact:true}).click();
    await opened(page).waitFor({state:'detached'});
    await page.getByRole('button',{name:'NEAR Auth ile giriş yap',exact:true}).waitFor();
    scenarios.push('retry rechecks the server session and stops on 401');

    authenticated=true;
    await page.reload();await opened(page).waitFor();
    const other=await context.newPage();await other.goto(`${origin}/auth-lab?job=job-001`);await opened(other).waitFor();
    await page.getByRole('button',{name:'Deneme oturumundan çık',exact:true}).click();
    await opened(page).waitFor({state:'detached'});await opened(other).waitFor({state:'detached'});
    const stopped=tokens.length;
    await other.waitForTimeout(1300);
    assert.equal(tokens.length,stopped,'logout must stop refresh timers in both tabs');
    assert.deepEqual(await other.evaluate(()=>window.fixture.deviceKey()),key);
    await check(other).click();await other.getByRole('button',{name:'NEAR Auth ile giriş yap',exact:true}).waitFor();
    assert.equal(tokens.length,stopped);
    scenarios.push('cross-tab logout stops playback and renewal but keeps the device key');
    await other.close();

    for(const mode of ['wrong-owner','takedown','missing-device','expired-device','wrong-device','v2-off','provider-error']) {
        authenticated=true;const count=tokens.length;
        await page.goto(`${origin}/auth-lab?job=job-001&case=${mode}`);
        await page.getByRole('alert').waitFor();
        assert.equal(await opened(page).count(),0);assert.equal(tokens.length,count);
        assert.equal(await page.getByRole('button',{name:'Bu cihazı doğrula',exact:true}).count(),0);
        scenarios.push(mode+' fails closed without new device activation');
    }

    authenticated=true;await page.goto(`${origin}/auth-lab?job=job-001`);await opened(page).waitFor();
    currentAccount='cd'.repeat(32);
    const count=tokens.length;await check(page).click();
    await opened(page).waitFor({state:'detached'});await page.getByRole('alert').waitFor();
    assert.equal(tokens.length,count);
    currentAccount=account;
    scenarios.push('account change invalidates the old playback');

    await page.goto(`${origin}/auth-lab?job=job-001&case=late`);
    await page.waitForFunction(()=>Boolean(window.fixture.finishRead));
    const closing=await context.newPage();await closing.goto(`${origin}/auth-lab`);
    await closing.getByRole('button',{name:'Deneme oturumundan çık',exact:true}).click();
    await page.getByRole('alert').waitFor();
    const beforeLate=tokens.length;await page.evaluate(()=>window.fixture.finishRead());
    await page.waitForTimeout(150);
    assert.equal(await opened(page).count(),0);assert.equal(tokens.length,beforeLate);
    scenarios.push('late publication read cannot revive a logged-out session');
    await closing.close();

    authenticated=true;await page.goto(`${origin}/auth-lab?job=job-001`);await opened(page).waitFor();
    await page.evaluate(()=>{history.pushState(null,'','/auth-lab?job=job-002');dispatchEvent(new PopStateEvent('popstate'));});
    await page.waitForFunction(()=>document.querySelector('[data-testid="player-opened"]')?.getAttribute('data-job')==='job-002');
    assert.equal(requests.at(-1).job,'job-002');
    scenarios.push('job navigation loads the new publication without leaving the lab');
    await page.getByLabel('Video yayın kimliği').fill('job-manual');await check(page).click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="player-opened"]')?.getAttribute('data-job')==='job-manual');
    assert.equal(new URL(page.url()).searchParams.get('job'),'job-manual');
    await page.reload();await opened(page).waitFor();
    assert.equal(await opened(page).getAttribute('data-job'),'job-manual');
    scenarios.push('manual publication selection survives reload');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',evidence:'LOCAL_TEST',scenarios,realWallet:false,realProvider:false,
        realMedia:false,sameDeviceKey:true,nonExtractableKey:true,tokenRequests:tokens.length}));
} catch (error) {
    const pages=browser?.contexts().flatMap(context=>context.pages())??[];
    console.error(JSON.stringify({pageErrors:errors,requests,tokenRequests:tokens.length,
        pages:await Promise.all(pages.map(page=>page.locator('body').innerText().catch(()=>'')))}));throw error;
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
