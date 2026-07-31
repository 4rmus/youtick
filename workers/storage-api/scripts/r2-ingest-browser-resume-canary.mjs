#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AwsClient } from 'aws4fetch';
import {
    presignPart,
    providerClient,
    readConfig,
} from './r2-ingest-provider-canary.mjs';

const ACK = 'run-paid-media-v4-r2-browser-resume-canary';
const ORIGIN = 'http://localhost:4173';
const PART_BYTES = 64 * 1024 * 1024;
const PART_COUNT = 10;
const SOURCE_BYTES = PART_BYTES * PART_COUNT;
const CHECKPOINTS = [3, 7, 10];

export function readBrowserConfig(env = process.env) {
    if (env.R2_BROWSER_CANARY_ACK !== ACK) {
        throw new Error(`R2_BROWSER_CANARY_ACK must equal ${ACK}`);
    }
    return readConfig({
        ...env,
        R2_CANARY_ACK: 'run-paid-media-v4-r2-provider-canary',
        R2_CANARY_ORIGIN: ORIGIN,
    });
}

export function nextCheckpoint(uploadedPartCount) {
    if (!Number.isInteger(uploadedPartCount) || uploadedPartCount < 0 || uploadedPartCount > PART_COUNT) {
        throw new Error('invalid_uploaded_part_count');
    }
    return CHECKPOINTS.find((checkpoint) => uploadedPartCount < checkpoint) ?? null;
}

export async function runBrowserResumeCanary(config) {
    const tempDir = await mkdtemp(join(tmpdir(), 'youtick-r2-browser-resume-'));
    const fixturePath = join(tempDir, 'source-640m.mp4');
    const fixture = await open(fixturePath, 'w', 0o600);
    let server;
    let uploadId;
    let completed = false;
    const key = `raw/jobs/browser-resume-${randomUUID()}/1/source`;
    const prefix = key.slice(0, key.lastIndexOf('/') + 1);
    const aws = new AwsClient({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        service: 's3',
        region: 'auto',
    });
    const provider = providerClient(config, aws, fetch);
    const grantCounts = new Map();
    const acceptedCounts = new Map();
    const stateSnapshots = [];
    const checkpoints = [];
    const fingerprints = [];
    const emptyInputs = [];
    let resolveResult;
    let rejectResult;
    const result = new Promise((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
    });
    try {
        await fixture.truncate(SOURCE_BYTES);
        for (let partNumber = 1; partNumber <= PART_COUNT; partNumber += 1) {
            const marker = Buffer.alloc(4096, partNumber);
            const start = (partNumber - 1) * PART_BYTES;
            await fixture.write(marker, 0, marker.length, start);
            await fixture.write(marker, 0, marker.length, start + PART_BYTES - marker.length);
        }
        await fixture.close();
        const sourceSha256 = await hashStream(createReadStream(fixturePath));
        uploadId = await provider.createMultipart(key);

        server = createServer(async (request, response) => {
            try {
                if (request.method === 'GET' && request.url === '/') {
                    response.writeHead(200, {
                        'content-type': 'text/html; charset=utf-8',
                        'cache-control': 'no-store',
                        'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self' https://*.r2.cloudflarestorage.com",
                        'referrer-policy': 'no-referrer',
                        'x-content-type-options': 'nosniff',
                    });
                    response.end(pageHtml());
                    return;
                }
                if (request.method === 'POST' && request.url === '/state') {
                    const body = await readJson(request);
                    if (!/^[0-9a-f]{64}$/.test(body.fingerprint)) throw new Error('invalid_source_fingerprint');
                    if (body.inputEmptyBeforeSelection !== true) throw new Error('source_input_not_empty_at_load');
                    if (fingerprints[0] && fingerprints[0] !== body.fingerprint) throw new Error('source_reselection_mismatch');
                    fingerprints.push(body.fingerprint);
                    emptyInputs.push(body.inputEmptyBeforeSelection);
                    const parts = await provider.listParts(key, uploadId);
                    stateSnapshots.push(parts.map((part) => part.partNumber));
                    json(response, 200, { parts: parts.map((part) => part.partNumber) });
                    return;
                }
                if (request.method === 'POST' && request.url === '/grant') {
                    const { partNumber } = await readJson(request);
                    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > PART_COUNT) {
                        throw new Error('invalid_part_number');
                    }
                    grantCounts.set(partNumber, (grantCounts.get(partNumber) ?? 0) + 1);
                    json(response, 200, await presignPart(config, {
                        expectedBytes: PART_BYTES,
                        key,
                        partNumber,
                        uploadId,
                    }));
                    return;
                }
                if (request.method === 'POST' && request.url === '/accepted') {
                    const { etag, partNumber } = await readJson(request);
                    const parts = await provider.listParts(key, uploadId);
                    const providerPart = parts.find((part) => part.partNumber === partNumber);
                    if (!providerPart || providerPart.etag !== etag || providerPart.size !== PART_BYTES) {
                        throw new Error('provider_part_mismatch');
                    }
                    acceptedCounts.set(partNumber, (acceptedCounts.get(partNumber) ?? 0) + 1);
                    response.writeHead(204);
                    response.end();
                    return;
                }
                if (request.method === 'POST' && request.url === '/checkpoint') {
                    const { target } = await readJson(request);
                    const parts = await provider.listParts(key, uploadId);
                    const numbers = parts.map((part) => part.partNumber);
                    if (![3, 7].includes(target)
                        || numbers.join(',') !== Array.from({ length: target }, (_, index) => index + 1).join(',')) {
                        throw new Error('invalid_checkpoint_inventory');
                    }
                    checkpoints.push(target);
                    response.writeHead(204);
                    response.end();
                    return;
                }
                if (request.method === 'POST' && request.url === '/complete') {
                    const parts = await provider.listParts(key, uploadId);
                    const exactParts = parts.length === PART_COUNT
                        && parts.every((part, index) => (
                            part.partNumber === index + 1 && part.size === PART_BYTES
                        ));
                    const exactSnapshots = JSON.stringify(stateSnapshots) === JSON.stringify([
                        [],
                        [1, 2, 3],
                        [1, 2, 3, 4, 5, 6, 7],
                    ]);
                    const issuedOnce = Array.from({ length: PART_COUNT }, (_, index) => index + 1)
                        .every((partNumber) => grantCounts.get(partNumber) === 1);
                    const acceptedOnce = Array.from({ length: PART_COUNT }, (_, index) => index + 1)
                        .every((partNumber) => acceptedCounts.get(partNumber) === 1);
                    if (!exactParts
                        || !exactSnapshots
                        || checkpoints.join(',') !== '3,7'
                        || !issuedOnce
                        || !acceptedOnce
                        || fingerprints.length !== 3
                        || !emptyInputs.every(Boolean)) {
                        throw new Error('browser_resume_contract_failed');
                    }
                    await provider.completeMultipart(key, uploadId, parts);
                    completed = true;
                    const head = await provider.headObject(key);
                    const readback = await provider.getObject(key);
                    const readbackSha256 = readback.status === 200
                        ? await hashStream(readback.body)
                        : null;
                    await provider.deleteObject(key);
                    const [deleted, objects, uploads] = await Promise.all([
                        provider.headObject(key),
                        provider.listObjects(prefix),
                        provider.listMultipartUploads(prefix),
                    ]);
                    const receipt = {
                        schema: 'youtick.r2-browser-resume-canary.v1',
                        verdict: head.exists
                            && head.byteLength === SOURCE_BYTES
                            && readbackSha256 === sourceSha256
                            && !deleted.exists
                            && objects.count === 0
                            && uploads.count === 0
                            ? 'PASS'
                            : 'FAIL',
                        scope: 'BROWSER_R2_30_70_RESUME_ONLY',
                        sourceBytes: SOURCE_BYTES,
                        partBytes: PART_BYTES,
                        partCount: PART_COUNT,
                        checkpoints,
                        providerPartsOnResume: stateSnapshots.slice(1),
                        grantCounts: Object.fromEntries(grantCounts),
                        acceptedCounts: Object.fromEntries(acceptedCounts),
                        sameFileReselections: fingerprints.length,
                        inputEmptyBeforeEachSelection: emptyInputs.every(Boolean),
                        completedLengthExact: head.byteLength === SOURCE_BYTES,
                        fullReadbackSha256: readbackSha256 === sourceSha256,
                        deleteNotFound: !deleted.exists,
                        zeroInventory: objects.count === 0 && uploads.count === 0,
                        accountSha256: sha256(config.accountId),
                        bucketSha256: sha256(config.bucket),
                        caveats: [
                            'Not the exact 20 GB release gate.',
                            'Deterministic 640 MiB fixture, not a decodable media sample.',
                        ],
                    };
                    json(response, receipt.verdict === 'PASS' ? 200 : 500, receipt);
                    if (receipt.verdict === 'PASS') resolveResult(receipt);
                    else rejectResult(new Error('browser_resume_canary_failed'));
                    return;
                }
                response.writeHead(404);
                response.end();
            } catch (error) {
                json(response, 400, { error: error instanceof Error ? error.message : 'canary_failed' });
                rejectResult(error);
            }
        });
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(4173, 'localhost', resolve);
        });
        process.stdout.write(`${JSON.stringify({
            event: 'READY',
            fixturePath,
            sourceBytes: SOURCE_BYTES,
            url: ORIGIN,
        })}\n`);
        return await result;
    } finally {
        try { if (server) await new Promise((resolve) => server.close(resolve)); } catch {}
        try { if (uploadId && !completed) await provider.abortMultipart(key, uploadId); } catch {}
        try { await provider.deleteObject(key); } catch {}
        await rm(tempDir, { recursive: true, force: true });
    }
}

export function pageHtml() {
    return `<!doctype html><meta charset="utf-8"><title>YouTick R2 30/70 Resume Canary</title>
<input id="source" type="file" accept="video/mp4"><button id="upload">Upload</button><pre id="status">READY</pre>
<script>
const PART_BYTES=${PART_BYTES},PART_COUNT=${PART_COUNT},SOURCE_BYTES=${SOURCE_BYTES};
const source=document.getElementById('source');
const upload=document.getElementById('upload');
const status=document.getElementById('status');
source.value='';
const inputEmptyBeforeSelection=source.files.length===0;
let running=false;
const runUpload=async()=>{
  if(running)return;
  running=true;
  try{
    status.textContent='STARTING';
    const file=source.files[0];
    if(!file||file.size!==SOURCE_BYTES)throw new Error('wrong_file_size');
    const fingerprint=await fileFingerprint(file);
    const stateResponse=await fetch('/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fingerprint,inputEmptyBeforeSelection})});
    if(!stateResponse.ok)throw new Error('state_failed');
    const existing=new Set((await stateResponse.json()).parts);
    status.textContent='STATE_READY';
    const target=existing.size<3?3:existing.size<7?7:10;
    for(let partNumber=1;partNumber<=target;partNumber++){
      if(existing.has(partNumber))continue;
      const grantResponse=await fetch('/grant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({partNumber})});
      if(!grantResponse.ok)throw new Error('grant_failed_'+partNumber);
      const grant=await grantResponse.json();
      const start=(partNumber-1)*PART_BYTES;
      status.textContent='UPLOADING_PART_'+partNumber;
      const uploaded=await fetch(grant.url,{method:'PUT',headers:grant.headers,body:file.slice(start,start+PART_BYTES)});
      const etag=uploaded.headers.get('etag');
      if(!uploaded.ok||!etag)throw new Error('part_upload_failed_'+partNumber);
      const accepted=await fetch('/accepted',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({partNumber,etag})});
      if(!accepted.ok)throw new Error('accept_failed_'+partNumber);
      status.textContent='PART '+partNumber+'/'+PART_COUNT;
    }
    if(target<10){
      const checkpoint=await fetch('/checkpoint',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({target})});
      if(!checkpoint.ok)throw new Error('checkpoint_failed_'+target);
      status.textContent=target===3?'CHECKPOINT_30':'CHECKPOINT_70';
      return;
    }
    status.textContent='VERIFYING';
    const complete=await fetch('/complete',{method:'POST'});
    if(!complete.ok)throw new Error('complete_failed');
    status.textContent='COMPLETE';
  }catch(error){status.textContent='ERROR '+error.message;throw error}
  finally{running=false}
};
upload.onclick=runUpload;
status.textContent='READY_BOUND';
async function fileFingerprint(file){
  const sample=64*1024;
  const head=new Uint8Array(await file.slice(0,sample).arrayBuffer());
  const tail=new Uint8Array(await file.slice(Math.max(0,file.size-sample),file.size).arrayBuffer());
  const metadata=new TextEncoder().encode(file.name+'\\n'+file.size+'\\n'+file.type+'\\n'+file.lastModified+'\\n');
  const value=new Uint8Array(metadata.length+head.length+tail.length);
  value.set(metadata);value.set(head,metadata.length);value.set(tail,metadata.length+head.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',value))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
</script>`;
}

async function readJson(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > 8192) throw new Error('request_too_large');
        chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function json(response, status, body) {
    response.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
    });
    response.end(JSON.stringify(body));
}

async function hashStream(stream) {
    const hash = createHash('sha256');
    for await (const chunk of stream) hash.update(chunk);
    return hash.digest('hex');
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const receipt = await runBrowserResumeCanary(readBrowserConfig());
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
