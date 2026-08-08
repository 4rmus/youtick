import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import {
    canonicalJson,
    compareFingerprints,
    fingerprintUrl,
    runReleaseSmoke,
} from './release-smoke.mjs';

async function serve(handler) {
    const server = createServer(handler);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    return {
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((resolve) => {
            server.closeAllConnections?.();
            server.close(resolve);
        }),
    };
}

function json(response, status, body, headers = {}) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    response.end(JSON.stringify(body));
}

test('fingerprint follows redirects and retains only canonical stable evidence', async () => {
    const body = 'stable release body';
    const server = await serve((request, response) => {
        if (request.url === '/') {
            response.writeHead(302, { Location: '/final' });
            response.end();
            return;
        }
        response.writeHead(201, {
            'Cache-Control': 'public, max-age=60',
            'Content-Security-Policy': "default-src 'self'",
            'Content-Type': 'text/plain; charset=utf-8',
            Location: '/next',
            Server: 'fixture',
            'X-Proxy': 'web4',
            'X-Web4-Origin': 'fixture.near',
            'X-Unstable': 'ignored',
        });
        response.end(body);
    });
    try {
        const fingerprint = await fingerprintUrl(`${server.origin}/`);
        assert.deepEqual(fingerprint, {
            status: 201,
            final_url: `${server.origin}/final`,
            body_sha256: createHash('sha256').update(body).digest('hex'),
            headers: {
                'cache-control': 'public, max-age=60',
                'content-security-policy': "default-src 'self'",
                'content-type': 'text/plain; charset=utf-8',
                location: '/next',
                server: 'fixture',
                'x-proxy': 'web4',
                'x-web4-origin': 'fixture.near',
            },
        });
        assert.equal(canonicalJson(fingerprint), `${JSON.stringify({
            body_sha256: fingerprint.body_sha256,
            final_url: fingerprint.final_url,
            headers: fingerprint.headers,
            status: 201,
        }, null, 2)}\n`);
    } finally {
        await server.close();
    }
});

test('fingerprint comparison is key-order independent and rejects drift', () => {
    const base = {
        status: 200,
        final_url: 'https://youtick.net/',
        body_sha256: 'a'.repeat(64),
        headers: Object.fromEntries([
            ...['server', 'x-web4-origin', 'x-proxy', 'location'].map((name) => [name, null]),
            ['content-type', 'text/html'],
            ['content-security-policy', null],
            ['cache-control', 'public'],
        ]),
    };
    assert.deepEqual(compareFingerprints(base, JSON.parse(canonicalJson(base))), { equal: true });
    assert.throws(
        () => compareFingerprints(base, { ...base, status: 201 }),
        /release_smoke_fingerprints_differ/,
    );
});

test('release smoke proves web, disabled bridge, CORS, and version override contracts', async () => {
    const override = 'bridge-worker="version-123"';
    const mutationCors = new Map([
        ['/v1/livepeer-webhooks', false],
        ['/v1/operations/admission-reopen', false],
        ['/v1/upload-intents', true],
        ['/v1/playback-tokens', true],
        ['/v1/creator-fee-quotes/near', true],
    ]);
    const seen = [];
    const web = await serve(async (request, response) => {
        seen.push(`web:${request.method}:${request.url}`);
        assert.equal(request.headers['cloudflare-workers-version-overrides'], override);
        if (request.method === 'POST' && request.url === '/api/near-rpc') {
            let body = '';
            for await (const chunk of request) body += chunk;
            assert.deepEqual(JSON.parse(body), {
                jsonrpc: '2.0', id: 'release-smoke', method: 'status', params: [],
            });
            json(response, 200, { jsonrpc: '2.0', result: { chain_id: 'testnet' } });
            return;
        }
        if (request.method === 'GET' && ['/', '/tr'].includes(request.url)) {
            response.writeHead(200, { 'Content-Type': 'text/html' });
            response.end('<!doctype html><main>ok</main>');
            return;
        }
        json(response, 404, { error: 'not_found' });
    });
    const allowedOrigin = 'https://preview.youtick.net';
    const deniedOrigin = 'https://denied.example';
    const bridge = await serve((request, response) => {
        seen.push(`bridge:${request.method}:${request.url}`);
        assert.equal(request.headers['cloudflare-workers-version-overrides'], override);
        if (request.method === 'GET' && request.url === '/__health') {
            json(response, 200, {
                stage: 'DISABLED',
                providerMutationEnabled: false,
                versionId: 'version-123',
            });
            return;
        }
        if (request.method === 'POST' && mutationCors.has(request.url)) {
            assert.equal(request.headers.origin, allowedOrigin);
            json(response, 503, { error: 'control_plane_disabled' }, mutationCors.get(request.url)
                ? { 'Access-Control-Allow-Origin': allowedOrigin }
                : {});
            return;
        }
        if (request.method === 'OPTIONS' && request.url === '/v1/upload-intents') {
            assert.equal(request.headers['access-control-request-method'], 'POST');
            if (request.headers.origin === allowedOrigin) {
                response.writeHead(204, { 'Access-Control-Allow-Origin': allowedOrigin });
                response.end();
                return;
            }
            assert.equal(request.headers.origin, deniedOrigin);
            json(response, 403, { error: 'origin_denied' });
            return;
        }
        json(response, 404, { error: 'not_found' });
    });
    let browserInput;
    try {
        const result = await runReleaseSmoke({
            webUrl: web.origin,
            bridgeUrl: bridge.origin,
            allowedOrigin,
            deniedOrigin,
            overrideWorker: 'bridge-worker',
            overrideVersion: 'version-123',
            browserRunner: async (input) => {
                browserInput = input;
                return { channel: 'fixture', routes: ['/', '/tr'] };
            },
        });
        assert.deepEqual(browserInput, {
            webUrl: web.origin,
            headers: { 'Cloudflare-Workers-Version-Overrides': override },
        });
        assert.deepEqual(result, {
            schema: 'youtick.release-smoke.v1',
            web: {
                root_status: 200,
                tr_status: 200,
                near_rpc_status: 200,
                browser: { channel: 'fixture', routes: ['/', '/tr'] },
            },
            bridge: {
                health_status: 200,
                stage: 'DISABLED',
                version_id: 'version-123',
                mutation_statuses: Object.fromEntries(
                    [...mutationCors.keys()].map((path) => [path, 503]),
                ),
                allowed_preflight_status: 204,
                denied_preflight_status: 403,
            },
        });
        assert.deepEqual(seen, [
            'web:GET:/',
            'web:GET:/tr',
            'web:POST:/api/near-rpc',
            'bridge:GET:/__health',
            'bridge:POST:/v1/livepeer-webhooks',
            'bridge:POST:/v1/operations/admission-reopen',
            'bridge:POST:/v1/upload-intents',
            'bridge:POST:/v1/playback-tokens',
            'bridge:POST:/v1/creator-fee-quotes/near',
            'bridge:OPTIONS:/v1/upload-intents',
            'bridge:OPTIONS:/v1/upload-intents',
        ]);
    } finally {
        await Promise.all([web.close(), bridge.close()]);
    }
});

test('release smoke rejects an override that still serves the old Bridge version', async () => {
    const delays = [];
    let healthRequests = 0;
    const fetchImpl = async (value) => {
        const url = new URL(value);
        if (url.hostname === 'web.test') {
            if (url.pathname === '/api/near-rpc') {
                return Response.json({ jsonrpc: '2.0', result: { chain_id: 'testnet' } });
            }
            return new Response('<!doctype html><main>ok</main>', {
                headers: { 'Content-Type': 'text/html' },
            });
        }
        if (url.hostname === 'bridge.test' && url.pathname === '/__health') {
            healthRequests += 1;
            return Response.json({
                stage: 'DISABLED',
                providerMutationEnabled: false,
                versionId: 'bridge-old',
            });
        }
        throw new Error('unexpected fixture request');
    };
    await assert.rejects(runReleaseSmoke({
        webUrl: 'https://web.test',
        bridgeUrl: 'https://bridge.test',
        allowedOrigin: 'https://allowed.test',
        deniedOrigin: 'https://denied.test',
        overrideWorker: 'bridge-worker',
        overrideVersion: 'bridge-candidate',
        fetchImpl,
        browserRunner: async () => ({ channel: 'fixture', routes: ['/', '/tr'] }),
        sleepFn: async (milliseconds) => delays.push(milliseconds),
    }), /release_smoke_bridge_version_mismatch/);
    assert.equal(healthRequests, 3);
    assert.deepEqual(delays, [1_000, 2_000]);
});
