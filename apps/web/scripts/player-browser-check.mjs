import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';

// LOCAL_TEST: real SDK, media and Brave. All provider/chain requests are intercepted locally.
const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fullHd = process.argv.includes('--full-hd');
const extended = process.argv.includes('--extended');
const output = await mkdtemp(join(tmpdir(), 'youtick-player-check-'));
for (const variant of (fullHd ? ['0','1','2'] : ['0','1'])) await mkdir(join(output, variant));
function ffmpeg(args) {
 const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{encoding:'utf8'});
 if(result.status!==0) throw Error(result.stderr || 'ffmpeg failed');
}
ffmpeg(['-f','lavfi','-i',fullHd?'testsrc2=size=1920x1080:rate=30':'testsrc2=size=1280x720:rate=24','-t',fullHd&&!extended?'30':'120','-an','-c:v','libx264','-preset','ultrafast','-crf','30','-pix_fmt','yuv420p',join(output,'source.mp4')]);
ffmpeg(['-i',join(output,'source.mp4'),'-filter_complex',fullHd?'[0:v]split=3[a][b][c];[a]scale=640:360[lo];[b]scale=1280:720[mid]':'[0:v]split=2[a][b];[a]scale=640:360[lo]',...(fullHd?['-map','[lo]','-map','[mid]','-map','[c]']:['-map','[lo]','-map','[b]']),'-c:v','libx264','-preset','ultrafast','-crf','30','-g',fullHd?'60':'48','-sc_threshold','0','-an','-f','hls','-hls_time','2','-hls_playlist_type','vod','-var_stream_map',fullHd?'v:0 v:1 v:2':'v:0 v:1','-master_pl_name','index.m3u8','-hls_segment_filename',join(output,'%v/segment%d.ts'),join(output,'%v/index.m3u8')]);
if(!fullHd||extended) ffmpeg(['-i',join(output,'source.mp4'),'-vf','fps=1/60,scale=128:72,tile=2x1','-frames:v','1',join(output,'sprite.png')]);
const previewVtt='WEBVTT\n\n00:00:00.000 --> 00:01:00.000\nsprite.png#xywh=0,0,128,72\n\n00:01:00.000 --> 00:02:00.000\nsprite.png#xywh=128,0,128,72\n';
const entry=`import React,{useRef,useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';import * as Player from '@livepeer/react/player';import {getSrc} from '@livepeer/react/external';
import {LivepeerPlayerSurface} from './components/LivepeerPlayerSurface';
import {recordVideoPlaybackEvents} from './lib/video-measurements';import {playerLanguage,subscribePlayerLanguage} from './lib/player-copy';
import {preparePlaybackDevice,clearDeviceSession} from './lib/device-session';
const input={accountId:'buyer.testnet',jobId:'fixture',generation:1,playbackId:'fixture1'};
const native=new URL(location.href).searchParams.has('native');const url='https://playback.livepeer.studio/asset/hls/fixture1/'+(native?'fixture.mp4':'index.m3u8');
window.logout=clearDeviceSession;
function App(){const [attempt,setAttempt]=useState(0);const [token,setToken]=useState('aaa.bbb.ccc');const tokenRef=useRef(token);const recoveryRef=useRef(null);const [previewUrl,setPreviewUrl]=useState(new URL(location.href).searchParams.has('full-hd')?undefined:'https://playback.livepeer.studio/asset/hls/fixture1/preview.vtt');window.disablePreview=()=>setPreviewUrl(undefined);
const language=useSyncExternalStore(subscribePlayerLanguage,playerLanguage,()=> 'en');
window.renew=()=>{const next='aaa.bbb.'+Date.now();tokenRef.current=next;setToken(next);return next};window.retry=()=>setAttempt(n=>n+1);
return <Player.Root key={attempt} src={getSrc(url).map(s=>native?{...s,type:'video'}:s)} playbackId="fixture1" jwt={token} preload="metadata" videoQuality="auto" storage={null} onPlaybackEvents={events=>{recordVideoPlaybackEvents(events);window.metricEvents=(window.metricEvents||[]).concat(events.map(event=>event.type))}}>
<LivepeerPlayerSurface input={input} title="Local player check" language={language} mode={native?'native':'hls'} token={token} tokenRef={tokenRef} recoveryRef={recoveryRef} retry={window.retry} previewVttUrl={previewUrl}/></Player.Root>}
preparePlaybackDevice(input.accountId).then(()=>createRoot(document.getElementById('root')).render(<App/>));`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:web},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',alias:{util:createRequire(import.meta.url).resolve('next/dist/compiled/util')},define:{'process.env.NODE_ENV':'"development"','process.env':'{}',global:'globalThis',__dirname:'"/"'},plugins:[{name:'local-only',setup(b){
 b.onLoad({filter:/lib\/constants\.ts$/},()=>({loader:'js',contents:`export const APP_CONFIG={publicAppUrl:'http://localhost'};export const NEAR_CONFIG={marketContractId:'market.testnet'};export const NEAR_NETWORK='testnet';export const FEATURE_FLAGS={};export const GAS_CONSTANTS={sessionKeyAllowance:"0.1"};`}));
 b.onLoad({filter:/lib\/near\.ts$/},()=>({loader:'js',contents:'export const getProvider=()=>({});export const viewContract=async()=>null;'}));
}}]});
const compiler=await compile('@import "tailwindcss"; @theme { --color-near-green: #00ec97; }',{base:web,onDependency(){}});
const css=compiler.build(new Scanner({sources:[{base:web,pattern:'components/Livepeer*.tsx',negated:false}]}).scan());
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':req.url==='/style.css'?'text/css':'text/html');res.end(req.url==='/bundle.js'?bundle.outputFiles[0].text:req.url==='/style.css'?css:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body style="margin:0;background:#09090b;color:white;font-family:system-ui"><main style="max-width:960px;margin:48px auto"><div id="root"></div></main><script src="/bundle.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;let page;
try {
 browser=await chromium.launch({executablePath:'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',headless:true});
 const context=await browser.newContext({viewport:{width:1000,height:760},locale:'en-US',hasTouch:true});page=await context.newPage();
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser exception:',e.stack)});let mediaRequests=0,telemetryRequests=0;const nativeTokens=new Set();const previewRequests=[];let denyPreviews=false;
 await context.addInitScript(()=>{window.previewBlobs=[];window.revokedPreviews=[];const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=value=>{const url=create(value);if(value instanceof Blob&&value.type.startsWith('image/'))window.previewBlobs.push(url);return url};URL.revokeObjectURL=url=>{if(window.previewBlobs.includes(url))window.revokedPreviews.push(url);revoke(url)}});
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.hostname==='localhost')return route.continue();
  if(url.hostname!=='playback.livepeer.studio'||!url.pathname.startsWith('/asset/hls/fixture1/')){telemetryRequests++;return route.abort()}
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}});
  mediaRequests++;const native=url.searchParams.has('jwt');if(native)nativeTokens.add(url.searchParams.get('jwt'));else assert.ok(req.headers()['livepeer-jwt']?.startsWith('aaa.bbb.'));
  const file=native?'source.mp4':url.pathname.split('/fixture1/')[1];
  if(file==='preview.vtt'||file==='sprite.png'){previewRequests.push({file,token:req.headers()['livepeer-jwt']});return route.fulfill({status:denyPreviews?401:200,headers:{'Access-Control-Allow-Origin':'*','Content-Type':file==='preview.vtt'?'text/vtt':'image/png'},body:denyPreviews?'denied':file==='preview.vtt'?previewVtt:await readFile(join(output,'sprite.png'))})}
  assert.match(file,/^(source\.mp4|index\.m3u8|[012]\/(index\.m3u8|segment\d+\.ts))$/);
  let body=await readFile(join(output,file));const headers={'Access-Control-Allow-Origin':'*','Content-Type':native?'video/mp4':file.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t'};let status=200;
  // Keep CDP fixture responses bounded: the 132 MiB native fixture closes Brave as one response.
  const range=req.headers().range?.match(/^bytes=(\d+)-(\d*)$/);if(range){const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):body.length-1,body.length-1,start+1024*1024-1);headers['Content-Range']='bytes '+start+'-'+end+'/'+body.length;body=body.subarray(start,end+1);status=206}
  return route.fulfill({status,headers,body});
 });
 console.log(JSON.stringify({output}));
 const url=`http://localhost:${server.address().port}`;
 await page.goto(fullHd&&!extended?url+'?full-hd':url);await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
 await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForFunction(()=>document.querySelector('video').currentTime>1);
 if(fullHd) {
  await page.locator('video').hover();await page.getByLabel('Settings',{exact:true}).first().click();
  const dimensions=[];
  for(const [height,time] of [[360,5],[720,10],[1080,15]]) {
   await page.getByRole('combobox',{name:'Quality'}).selectOption({label:height+'p'});
   await page.locator('video').evaluate((video,time)=>{video.currentTime=time},time);
   await page.waitForFunction(height=>document.querySelector('video').videoHeight===height&&document.querySelector('video').readyState>=2,height);
   dimensions.push(await page.locator('video').evaluate(v=>[v.videoWidth,v.videoHeight]));
  }
  assert.deepEqual(dimensions,[[640,360],[1280,720],[1920,1080]]);
  await page.screenshot({path:join(output,'player-full-hd.png')});
  await page.getByRole('combobox',{name:'Quality'}).selectOption({label:'Auto'});
  assert.equal(await page.locator('video').evaluate(v=>v.paused),false);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',evidence:'LOCAL_TEST',fullHd:true,dimensions,mediaRequests,realProvider:false,output}));
  if(extended) await page.getByLabel('Settings',{exact:true}).first().click();
 }
 if(!fullHd||extended) {
 assert.equal(previewRequests.length,0); // No preview work on initial playback.
 const seek=page.locator('[data-livepeer-controls-seek]');
 async function hoverSeek(ratio){if(!await seek.isVisible())await page.locator('video').hover();await seek.waitFor({state:'visible'});const box=await seek.boundingBox();await page.mouse.move(box.x+box.width*ratio,box.y+box.height/2)}
 await hoverSeek(0.25);await page.locator('[data-player-preview] img').waitFor({state:'visible'});
 assert.equal(previewRequests.filter(r=>r.file==='sprite.png').length,1);
 assert.equal(await page.locator('[data-player-preview] img').evaluate(img=>img.style.left),'0px');
 await hoverSeek(0.75);await page.waitForFunction(()=>document.querySelector('[data-player-preview] img')?.style.left==='-128px');
 // Same sprite, different crop; no second image request while scrubbing.
 assert.equal(previewRequests.filter(r=>r.file==='sprite.png').length,1);
 await page.screenshot({path:join(output,'seek-preview-desktop.png')});
 await seek.locator('[role=slider]').focus();await page.keyboard.press('ArrowRight');await page.locator('[data-player-preview]').waitFor({state:'visible'});await page.getByRole('button',{name:'Pause',exact:true}).focus();
 await page.mouse.move(5,5);await page.waitForFunction(()=>window.previewBlobs.length===window.revokedPreviews.length);
 denyPreviews=true;const deniedBefore=previewRequests.length;
 await hoverSeek(0.25);await page.waitForFunction(()=>Boolean(document.querySelector('[data-player-preview]')));
 await expect.poll(()=>previewRequests.length).toBeGreaterThan(deniedBefore);
 assert.equal(await page.locator('[data-player-preview] img').count(),0);assert.equal(await page.locator('video').evaluate(v=>v.paused),false);
 denyPreviews=false;const renewedPreviewToken=await page.evaluate(()=>window.renew());
 await page.locator('[data-player-preview] img').waitFor({state:'visible'});
 assert.equal(previewRequests.at(-1).token,renewedPreviewToken);
 await page.mouse.move(5,5);await page.setViewportSize({width:320,height:650});await page.locator('video').hover();
 await seek.waitFor({state:'visible'});const box=await seek.boundingBox();const cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/4,y:box.y+box.height/2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*3/4,y:box.y+box.height/2}]});
 await page.locator('[data-player-preview] img').waitFor({state:'visible'});await page.screenshot({path:join(output,'seek-preview-mobile.png')});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 assert.equal(await page.locator('[data-player-preview]').count(),0);
 await page.setViewportSize({width:1000,height:760});await hoverSeek(0.25);
 await page.locator('[data-player-preview] img').waitFor({state:'visible'});const countBeforeAbsent=previewRequests.length;
 await page.evaluate(()=>window.disablePreview());await page.waitForFunction(()=>Boolean(document.querySelector('[data-player-preview]'))&&!document.querySelector('[data-player-preview] img'));
 assert.equal(previewRequests.length,countBeforeAbsent);await page.mouse.move(5,5);
 await page.locator('video').hover();await page.getByLabel('Settings',{exact:true}).first().click();await page.getByRole('combobox',{name:'Speed'}).selectOption('1.5');await page.getByRole('combobox',{name:'Quality'}).selectOption({label:'360p'});
 assert.equal(await page.locator('video').evaluate(v=>v.playbackRate),1.5);assert.equal(await page.locator('video').evaluate(v=>v.paused),false);
 await page.locator('video').evaluate(v=>{v.currentTime=100});await page.waitForFunction(()=>document.querySelector('video').videoHeight===360&&document.querySelector('video').readyState>=2);await page.getByRole('combobox',{name:'Quality'}).selectOption({label:'720p'});await page.locator('video').evaluate(v=>{v.currentTime=60});await page.waitForFunction(()=>document.querySelector('video').videoHeight===720&&document.querySelector('video').readyState>=2);
 await page.getByRole('combobox',{name:'Speed'}).focus();const before=await page.locator('video').evaluate(v=>v.currentTime);await page.keyboard.press('ArrowRight');assert.ok((await page.locator('video').evaluate(v=>v.currentTime))-before<2);await page.keyboard.press('Escape');
 await page.locator('video').evaluate(v=>{v.pause();v.currentTime=20});await page.waitForFunction(()=>document.querySelector('video').readyState>=2);await page.locator('video').evaluate(v=>v.dispatchEvent(new Event('pause')));
 await page.waitForFunction(async()=>{const request=indexedDB.open('youtick:device-session:v2:testnet:market.testnet:'+location.origin,1);return new Promise(resolve=>{request.onsuccess=()=>{const tx=request.result.transaction('sessions');const q=tx.objectStore('sessions').get('watch-progress:'+JSON.stringify(['buyer.testnet','fixture',1,'fixture1']));q.onsuccess=()=>resolve(q.result?.position>=19);tx.oncomplete=()=>request.result.close()}})});
 await page.reload();await page.getByRole('button',{name:/Continue from/}).waitFor();await page.reload();await page.getByRole('button',{name:/Continue from/}).click();await page.waitForFunction(()=>document.querySelector('video').currentTime>=19);
 await page.locator('video').hover();await page.getByLabel('Settings',{exact:true}).first().click();await page.getByRole('combobox',{name:'Language'}).selectOption('tr');await page.setViewportSize({width:320,height:650});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=320));
 await page.screenshot({path:join(output,'player-mobile-settings.png')});await page.setViewportSize({width:1000,height:760});await page.screenshot({path:join(output,'player-desktop-settings.png')});
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Tam ekran',exact:true}).click();await page.waitForFunction(()=>Boolean(document.fullscreenElement));await page.getByLabel('Ayarlar',{exact:true}).first().click();await page.screenshot({path:join(output,'player-fullscreen.png')});await page.getByLabel('Ayarlar',{exact:true}).first().click();await page.evaluate(()=>document.exitFullscreen());
 await page.locator('video').evaluate(v=>{v.pause();v.currentTime=20});await page.waitForFunction(()=>document.querySelector('video').readyState>=2);await page.setViewportSize({width:320,height:650});await page.touchscreen.tap(60,70);await page.touchscreen.tap(60,70);await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-10)<1);await page.touchscreen.tap(270,70);await page.touchscreen.tap(270,70);await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-20)<1);await page.setViewportSize({width:1000,height:760});
 await page.evaluate(()=>window.logout());await page.reload();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);assert.equal(await page.getByRole('button',{name:/Devam et:/}).count(),0);
 // Local MP4 through native source handling verifies SDK renewal, not real Safari HLS support.
 const beforeTelemetry=telemetryRequests;
 await page.goto(url+'?native');await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);await page.getByRole('button',{name:'Oynat',exact:true}).click();await page.locator('video').evaluate(v=>{v.currentTime=20;v.playbackRate=1.5});await page.waitForFunction(()=>document.querySelector('video').currentTime>=20);
 for(let i=0;i<2;i++){const previous=await page.locator('video').evaluate(v=>v.currentTime);const token=await page.evaluate(()=>window.renew());await page.waitForFunction(token=>document.querySelector('video').currentSrc.includes(token)&&document.querySelector('video').readyState>=2&&!document.querySelector('video').paused,token);assert.ok((await page.locator('video').evaluate(v=>v.currentTime))>=previous-1);assert.equal(await page.locator('video').evaluate(v=>v.playbackRate),1.5)}
 const originalVideo=await page.locator('video').elementHandle();await page.locator('video').evaluate(v=>v.pause());const pausedAt=await page.locator('video').evaluate(v=>v.currentTime);const pausedToken=await page.evaluate(()=>window.renew());await page.waitForFunction(t=>document.querySelector('video').currentSrc.includes(t)&&document.querySelector('video').readyState>=2,pausedToken);assert.equal(await originalVideo.evaluate(v=>v===document.querySelector('video')),true);assert.equal(await page.locator('video').evaluate(v=>v.paused),true);assert.ok(Math.abs((await page.locator('video').evaluate(v=>v.currentTime))-pausedAt)<1);
 await page.waitForFunction(()=>window.metricEvents?.includes('heartbeat'));assert.ok(nativeTokens.size>=4);assert.equal(telemetryRequests,beforeTelemetry);assert.deepEqual(errors,[]);assert.ok(mediaRequests>3);
 console.log(JSON.stringify({result:'PASS',evidence:'LOCAL_TEST',fullHd,extended,mediaRequests,nativeTokens:nativeTokens.size,previewRequests:previewRequests.length,output}));
}
}catch(error){if(page&&!page.isClosed()&&browser?.isConnected()){console.log(await page.evaluate(()=>({text:document.body.innerText,video:[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,ready:v.readyState,paused:v.paused,error:v.error?.code}))})));await page.screenshot({path:join(output,'failure.png')})}throw error}finally{await browser?.close();await new Promise(r=>server.close(r))}
