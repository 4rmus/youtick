import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Manual LOCAL_TEST: actual Brave IDB/WebCrypto, isolated localhost and mock wallet.
// No wallet account, provider, upload, payment or network API is used.
const require = createRequire(import.meta.url);
const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../lib/device-session.ts', import.meta.url))],
    bundle: true, platform: 'browser', format: 'iife', globalName: 'DeviceSessions', write: false,
    define: { __dirname: '"/"', 'process.env': '{}', global: 'globalThis' },
    alias: { util: require.resolve('next/dist/compiled/util') },
    plugins: [{ name: 'local-test-constants', setup(builder) {
        builder.onLoad({ filter: /lib\/near\.ts$/ }, () => ({
            contents: `export const getProvider=()=>({}); export const viewContract=async()=>globalThis.deviceRecord ?? null;`, loader:'js',
        }));
        builder.onLoad({ filter: /lib\/constants\.ts$/ }, () => ({
            contents: `export const APP_CONFIG={publicAppUrl:'http://localhost'};
                export const NEAR_CONFIG={marketContractId:'market.testnet'};
                export const NEAR_NETWORK='testnet';`, loader: 'js',
        }));
    } }],
});
(async () => {
 const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/session.js'?'text/javascript':'text/html');res.end(req.url==='/session.js'?bundle.outputFiles[0].text:'<!doctype html><title>Local device session check</title><script src="/session.js"></script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try {
 browser=await chromium.launch({executablePath:'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',headless:true});
  const context=await browser.newContext(); const page=await context.newPage();
  const url=`http://localhost:${server.address().port}`;
  await page.goto(url);
  const initial=await page.evaluate(async()=>{
    window.calls=0;
    window.wallet={signMessage:async()=>{window.calls++;return {accountId:'buyer.testnet',publicKey:'ed25519:11111111111111111111111111111111',signature:btoa(String.fromCharCode(...new Uint8Array(64).fill(7)))}}};
    const [s,t]=await Promise.all([DeviceSessions.ensureDeviceSession(wallet,'buyer.testnet'),DeviceSessions.ensureDeviceSession(wallet,'buyer.testnet')]);
    let exportRejected=false;try{await crypto.subtle.exportKey('pkcs8',s.privateKey)}catch{exportRejected=true}
    return {calls, same:s===t, exportRejected, extractable:s.privateKey.extractable, cert:JSON.stringify(s.certificate)};
  });
  assert.equal(initial.calls,1); assert.equal(initial.same,true); assert.equal(initial.exportRejected,true); assert.equal(initial.extractable,false);
  await page.reload();
  const restored=await page.evaluate(async()=>{
    const s=await DeviceSessions.ensureDeviceSession({signMessage:()=>{throw Error('unexpected wallet')}},'buyer.testnet');
    let exportRejected=false;try{await crypto.subtle.exportKey('jwk',s.privateKey)}catch{exportRejected=true}
    return {cert:JSON.stringify(s.certificate),exportRejected,privateType:s.privateKey.type,other:await DeviceSessions.getDeviceSession('other.testnet')};
  });
  assert.equal(restored.cert,initial.cert);assert.equal(restored.exportRejected,true);assert.equal(restored.privateType,'private');assert.equal(restored.other,null);
  await page.evaluate(()=>{window.cleared=0;DeviceSessions.onDeviceSessionCleared(()=>window.cleared++)});
  const other=await context.newPage();await other.goto(url);await other.evaluate(()=>DeviceSessions.clearDeviceSession());
  await page.waitForFunction(()=>window.cleared>0);
  assert.equal(await page.evaluate(()=>DeviceSessions.getDeviceSession('buyer.testnet')),null);
  await page.evaluate(()=>{
    window.pending=DeviceSessions.ensureDeviceSession({signMessage:()=>new Promise(resolve=>{window.finishProof=resolve})},'buyer.testnet').then(()=> 'unexpected success', e=>e.message);
  });
  await page.waitForFunction(()=>!!window.finishProof);
  await other.evaluate(()=>DeviceSessions.clearDeviceSession());
  const late=await page.evaluate(async()=>{finishProof({accountId:'buyer.testnet',publicKey:'ed25519:11111111111111111111111111111111',signature:btoa(String.fromCharCode(...new Uint8Array(64).fill(7)))});return pending});
  assert.equal(late,'device_session_cancelled');
  assert.equal(await page.evaluate(()=>DeviceSessions.getDeviceSession('buyer.testnet')),null);
  const [deviceA,deviceB]=await Promise.all([
    page.evaluate(()=>DeviceSessions.preparePlaybackDevice('buyer.testnet')),
    other.evaluate(()=>DeviceSessions.preparePlaybackDevice('buyer.testnet')),
  ]);
  assert.deepEqual(deviceA,deviceB);
  assert.equal(await page.evaluate(()=>DeviceSessions.getDeviceSession('buyer.testnet')),null);
  await page.reload();
  const market=await page.evaluate(async authorization=>{
    const now=Date.now();
    window.deviceRecord={...authorization,authorized_at_ms:String(now),expires_at_ms:String(now+2592000000)};
    const session=await DeviceSessions.getDeviceSession('buyer.testnet');
    let exportRejected=false;try{await crypto.subtle.exportKey('pkcs8',session.privateKey)}catch{exportRejected=true}
    const again=await DeviceSessions.preparePlaybackDevice('buyer.testnet');
    const originalNow=Date.now;
    Date.now=()=>now+49*86400000;
    window.deviceRecord={...authorization,authorized_at_ms:String(now+20*86400000),expires_at_ms:String(now+50*86400000)};
    const day49=await DeviceSessions.getDeviceSession('buyer.testnet');
    Date.now=()=>now+50*86400000;
    const day50=await DeviceSessions.getDeviceSession('buyer.testnet');
    Date.now=originalNow;
    return {exportRejected,key:session.certificate.session_public_key,again,day49:!!day49,day50};
  },deviceA);
  assert.equal(market.exportRejected,true);assert.equal(market.key,deviceA.session_public_key);
  assert.deepEqual(market.again,deviceA);assert.equal(market.day49,true);assert.equal(market.day50,null);
  // Fresh context: payment preparation must listen for logout before any player exists.
  const raceContext=await browser.newContext();
  const raceA=await raceContext.newPage();const raceB=await raceContext.newPage();
  await raceA.goto(url);await raceB.goto(url);
  await raceA.evaluate(()=>DeviceSessions.preparePlaybackDevice('buyer.testnet'));
  await raceA.evaluate(()=>{
    window.originalVerify=crypto.subtle.verify.bind(crypto.subtle);
    crypto.subtle.verify=async(...args)=>{await new Promise(resolve=>window.releaseVerify=resolve);return originalVerify(...args)};
    window.prepareResult=DeviceSessions.preparePlaybackDevice('buyer.testnet').then(()=>({ok:true}),error=>({ok:false,error:error.message}));
  });
  await raceA.waitForFunction(()=>!!window.releaseVerify);
  await raceB.evaluate(()=>DeviceSessions.clearDeviceSession());
  const race=await raceA.evaluate(async()=>{releaseVerify();const value=await prepareResult;crypto.subtle.verify=originalVerify;return value});
  assert.deepEqual(race,{ok:false,error:'device_session_cancelled'});
  assert.equal(await raceA.evaluate(()=>DeviceSessions.getDeviceSession('buyer.testnet')),null);
  await raceA.evaluate(async()=>{
    await DeviceSessions.preparePlaybackDevice('buyer.testnet');
    window.readClearEvents=0;DeviceSessions.onDeviceSessionCleared(()=>window.readClearEvents++);
  });
  await raceB.evaluate(async()=>{
    const original=BroadcastChannel.prototype.postMessage;
    BroadcastChannel.prototype.postMessage=()=>{};
    await DeviceSessions.clearDeviceSession();
    BroadcastChannel.prototype.postMessage=original;
  });
  assert.equal(await raceA.evaluate(()=>DeviceSessions.getDeviceSession('buyer.testnet')),null);
  assert.equal(await raceA.evaluate(()=>window.readClearEvents),1);
  await raceContext.close();
  const report={browser:await browser.version(),executable:'Brave Browser',mode:'headless isolated profile',origin:'localhost only',wallet:'mock proof; no real signature',checks:{parallelSingleCall:true,reloadSameCertificate:true,nonExtractableBeforeAndAfterReload:true,pkcs8AndJwkExportRejected:true,otherAccountDenied:true,crossTabClear:true,crossTabLateReplyRejected:true,marketDeviceCrossTabSameKey:true,marketDeviceReloadWithoutWallet:true,marketRenewalDay20To50:true,marketExpiryDenied:true,paymentPrepareCrossTabLogoutDenied:true,readBeforeBroadcastStopsPlayer:true}};
  console.log(JSON.stringify(report, null, 2));
 } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
