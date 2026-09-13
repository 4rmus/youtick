import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

// LOCAL_TEST: real React component, activation helper and transaction encoder.
// Wallet, final chain reads and token issuance are fixtures; no external requests are allowed.
const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = await mkdtemp(resolve(tmpdir(), 'youtick-device-ui-'));
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {LivepeerPlayer} from './components/LivepeerPlayer';
window.fixture={calls:0,authorized:false,mode:'success',denyToken:false};
createRoot(document.getElementById('root')).render(<LivepeerPlayer accountId="buyer.testnet" jobId="job-001" generation={1} playbackId="playback_001" title="Test video"/>);`;
const stubs = {
    'constants.ts': `export const FEATURE_FLAGS={publicTestnetVideoV1:true,enablePlaybackAuthorizerV2:true};export const NEAR_CONFIG={marketContractId:'market.testnet'};export const NEAR_NETWORK='testnet';export const APP_CONFIG={};export const GAS_CONSTANTS={mediumGas:100000000000000n,sessionKeyAllowance:'0.1'};`,
    'near.ts': `export const getProvider=()=>({});export const viewContract=async()=>({bridge_frozen:false});`,
    'livepeer-publication.ts': `export const hasLivepeerEntitlement=async()=>true;export const readLivepeerPublication=async()=>({generation:1,playback_id:'playback_001',availability:'ACTIVE'});`,
    'device-session.ts': `const listeners=new Set();window.clearAuth=()=>{for(const listener of listeners)listener()};export const onDeviceSessionCleared=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};export const preparePlaybackDevice=async()=>({session_public_key:'ed25519:device',certificate_sha256:'a'.repeat(64),authorization_duration_ms:'2592000000'});export const getDeviceSession=async()=>window.fixture.authorized?{certificate:{session_public_key:'ed25519:device'}}:null;export const ensureDeviceSession=async()=>{throw Error('unexpected identity signature')};`,
    'livepeer-player-media.ts': `export const playbackMode=async()=>'hls';`,
    'livepeer-playback.ts': `export const startLivepeerPlaybackSession=async(input,callbacks)=>{if(!window.fixture.authorized)throw Error('device_session_required');if(window.fixture.denyToken)throw Error('playback_denied');callbacks.onAccess({token:'aaa.bbb.ccc',hlsUrl:'https://playback.livepeer.studio/asset/hls/playback_001/index.m3u8'});return{destroy(){}}};`,
};
const bundle = await build({ stdin:{contents:entry,loader:'tsx',resolveDir:web},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',
    alias:{util:createRequire(import.meta.url).resolve('next/dist/compiled/util')}, define:{'process.env.NODE_ENV':'"development"','process.env':'{}',global:'globalThis',__dirname:'"/"'},
    plugins:[{name:'local-fixtures',setup(b){
        b.onLoad({filter:/lib\/(constants|near|livepeer-publication|device-session|livepeer-player-media|livepeer-playback)\.ts$/},({path})=>({loader:'js',contents:stubs[path.split('/').pop()]}));
        b.onLoad({filter:/components\/providers\/WalletProvider\.tsx$/},()=>({loader:'js',contents:`const wallet={getAccounts:async()=>[{accountId:'buyer.testnet'}],signAndSendTransaction:async tx=>{window.fixture.calls++;const action=tx.actions[0].functionCall;window.fixture.action={receiver:tx.receiverId,method:action.methodName,deposit:String(action.deposit),args:JSON.parse(new TextDecoder().decode(action.args))};if(window.fixture.mode==='pending')throw Error('reply_missing');if(window.fixture.mode==='wait')await new Promise(resolve=>window.finishWallet=resolve);window.fixture.authorized=true;if(window.fixture.mode==='lost')throw Error('reply_missing');return{}}};const getWallet=async()=>wallet;export const useWallet=()=>({getWallet});`}));
        b.onLoad({filter:/components\/LivepeerPlayerSurface\.tsx$/},()=>({loader:'jsx',contents:`import React from 'react';export const LivepeerPlayerSurface=()=> <div data-testid="player-opened">Player opened after token issuance</div>;`}));
    }}],
});
const compiler = await compile('@import "tailwindcss"; @theme { --color-near-green: #00ec97; }', { base: web, onDependency() {} });
const css = compiler.build(new Scanner({ sources: [{ base: web, pattern: 'components/**/*.tsx', negated: false }] }).scan());
const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'?'text/javascript':req.url==='/style.css'?'text/css':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:req.url==='/style.css'?css:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body style="margin:0;background:#09090b;color:white;font-family:system-ui"><div id="root"></div><script src="/app.js"></script>')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
    browser=await chromium.launch({executablePath:'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',headless:true});
    const context=await browser.newContext({locale:'tr-TR',viewport:{width:320,height:650}});
    await context.route('**/*',route=>new URL(route.request().url()).hostname==='localhost'?route.continue():route.abort());
    const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const url=`http://localhost:${server.address().port}`;
    for(const mode of ['success','lost','token-denied','cancelled','pending']) {
        await page.goto(url);
        await page.getByRole('button',{name:'Bu cihazı doğrula',exact:true}).waitFor();
        if(mode==='success') {
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=320));
            await page.screenshot({path:resolve(output,'activation-mobile.png')});
        }
        assert.equal(await page.evaluate(()=>window.fixture.calls),0);
        await page.evaluate(mode=>{window.fixture.mode=mode==='cancelled'?'wait':mode;window.fixture.denyToken=mode==='token-denied'},mode);
        await page.getByRole('button',{name:'Bu cihazı doğrula',exact:true}).click();
        if(mode==='cancelled') {
            await page.waitForFunction(()=>Boolean(window.finishWallet));
            await page.evaluate(()=>{window.clearAuth();window.finishWallet()});
            await page.getByRole('button',{name:'Tekrar dene',exact:true}).waitFor();
        } else if(mode==='pending') {
            await page.getByRole('button',{name:'Tekrar kontrol et',exact:true}).waitFor();
            await page.getByRole('button',{name:'Tekrar kontrol et',exact:true}).click();
            await page.getByRole('button',{name:'Tekrar kontrol et',exact:true}).waitFor();
        } else if(mode==='token-denied') {
            await page.getByRole('button',{name:'Tekrar dene',exact:true}).waitFor();
            await page.getByRole('button',{name:'Tekrar dene',exact:true}).click();
            await page.getByRole('button',{name:'Tekrar dene',exact:true}).waitFor();
        } else await page.getByTestId('player-opened').waitFor();
        assert.equal(await page.evaluate(()=>window.fixture.calls),1);
        assert.equal(await page.getByTestId('player-opened').count(),['success','lost'].includes(mode)?1:0);
        assert.deepEqual(await page.evaluate(()=>window.fixture.action),{receiver:'market.testnet',method:'activate_playback_device',deposit:'1',args:{publication_id:'job-001',playback_session:{session_public_key:'ed25519:device',certificate_sha256:'a'.repeat(64),authorization_duration_ms:'2592000000'}}});
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',evidence:'LOCAL_TEST',scenarios:5,walletTransactionsPerScenario:1,realWallet:false,realChain:false,output}));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
