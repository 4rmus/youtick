import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import {
    deleteAsset,
    getAssetStatus,
    requestUpload,
} from './provider-canary.mjs';

throw new Error('legacy_browser_canary_retired_use_canary_playback_live');

const HOST = '127.0.0.1';
const PORT = Number(process.env.LIVEPEER_BROWSER_CANARY_PORT || 4174);
const SOURCE_BYTES = 20 * 1024 * 1024;
const CHUNK_BYTES = 8 * 1024 * 1024;
const apiKey = process.env.LIVEPEER_API_KEY;
const mutationsEnabled = process.env.LIVEPEER_PROVIDER_CANARY_MUTATIONS === 'true';

if (!mutationsEnabled) throw new Error('provider_canary_mutations_disabled');

const runId = randomUUID();
const state = { assetId: null, create: null, events: [], receipt: null };
const clientSource = await readFile(new URL('./browser-canary-client.js', import.meta.url));
const bundle = await build({
    entryPoints: ['tus-js-client/lib.esm/browser/index.js'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
});
const tusSource = bundle.outputFiles[0].contents;

function json(response, statusCode, body) {
    response.writeHead(statusCode, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(body));
}

async function readJson(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (chunks.reduce((sum, chunk) => sum + chunk.length, 0) > 1024) {
        throw new Error('request_too_large');
    }
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

async function cleanup() {
    if (state.receipt) return state.receipt;
    if (!state.assetId) throw new Error('asset_not_created');
    const deleteStatus = await deleteAsset(apiKey, state.assetId);
    let postDeleteStatus;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        postDeleteStatus = await getAssetStatus(apiKey, state.assetId);
        if ([404, 410].includes(postDeleteStatus)) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (![404, 410].includes(postDeleteStatus)) throw new Error(`livepeer_delete_not_visible_${postDeleteStatus}`);
    state.receipt = {
        schema: 'youtick.livepeer-browser-canary.v1',
        browser: 'Chrome',
        client: 'tus-js-client@4.3.1',
        run_id: runId,
        source_bytes: SOURCE_BYTES,
        chunk_bytes: CHUNK_BYTES,
        checkpoint_bytes: [8 * 1024 * 1024, 16 * 1024 * 1024],
        events: state.events,
        create_status: state.create.status,
        delete_status: deleteStatus,
        post_delete_status: postDeleteStatus,
        asset_id_sha256: createHash('sha256').update(state.assetId).digest('hex'),
        media_path: 'chrome-to-livepeer',
    };
    state.assetId = null;
    process.stdout.write(`${JSON.stringify(state.receipt, null, 2)}\n`);
    return state.receipt;
}

const html = `<!doctype html>
<meta charset="utf-8">
<title>Livepeer Chrome canary</title>
<h1>Livepeer Chrome canary</h1>
<p id="status">starting</p>
<pre id="evidence"></pre>
<script type="module" src="/client.js"></script>`;

const server = createServer(async (request, response) => {
    try {
        if (request.method === 'GET' && request.url === '/') {
            response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
            response.end(html);
            return;
        }
        if (request.method === 'GET' && request.url === '/client.js') {
            response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/javascript; charset=utf-8' });
            response.end(clientSource);
            return;
        }
        if (request.method === 'GET' && request.url === '/tus-client.js') {
            response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/javascript; charset=utf-8' });
            response.end(tusSource);
            return;
        }
        if (request.method === 'POST' && request.url === '/intent') {
            if (state.receipt) throw new Error('canary_already_cleaned');
            if (!state.create) {
                state.create = await requestUpload(apiKey, runId);
                state.assetId = state.create.body.asset.id;
            }
            json(response, 200, { run_id: runId, tus_endpoint: state.create.body.tusEndpoint });
            return;
        }
        if (request.method === 'POST' && request.url === '/event') {
            const event = await readJson(request);
            if (!['client_start', 'head', 'checkpoint', 'success'].includes(event.kind)
                || !Number.isInteger(event.offset) || event.offset < 0 || event.offset > SOURCE_BYTES
                || ![0, 40, 80, 100].includes(event.stage)) {
                throw new Error('event_invalid');
            }
            state.events.push({ kind: event.kind, offset: event.offset, stage: event.stage });
            json(response, 200, { recorded: true });
            return;
        }
        if (request.method === 'POST' && request.url === '/cleanup') {
            json(response, 200, await cleanup());
            return;
        }
        json(response, 404, { error: 'not_found' });
    } catch (error) {
        json(response, 500, { error: error.message });
    }
});

server.listen(PORT, HOST, () => {
    process.stdout.write(`Livepeer browser canary ready at http://${HOST}:${PORT}\n`);
});

async function shutdown() {
    if (state.assetId) {
        try {
            await cleanup();
        } catch (error) {
            process.stderr.write(`cleanup_failed:${error.message}\n`);
        }
    }
    server.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
