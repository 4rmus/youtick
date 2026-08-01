import assert from 'node:assert/strict';
import test from 'node:test';
import { runNetworkEndpointCanary } from './network-endpoint-canary.mjs';

const API_KEY = 'test-api-key-that-is-long-enough';
const MIB = 1024 * 1024;

test('network endpoint canary resumes from the provider offset and redacts capabilities', async () => {
    let offset = 0;
    const patches = [];
    const fetchImpl = async (url, init = {}) => {
        const method = init.method ?? 'GET';
        if (method === 'POST' && String(url).includes('/asset/request-upload')) {
            return Response.json({
                tusEndpoint: 'https://origin.livepeer.com/tus?token=secret',
                asset: {
                    id: 'asset-123',
                    playbackId: 'playback-123',
                    projectId: 'project-123',
                    playbackPolicy: { type: 'jwt' },
                },
            });
        }
        if (method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST,PATCH,HEAD',
                    'Access-Control-Allow-Headers': 'Tus-Resumable,Upload-Length,Upload-Metadata',
                },
            });
        }
        if (method === 'POST') {
            return new Response(null, { status: 201, headers: { Location: '/upload/one?token=secret' } });
        }
        if (method === 'HEAD' && !String(url).includes('/upload/one')) {
            return new Response(null, { status: 401 });
        }
        if (method === 'HEAD') {
            return new Response(null, { status: 200, headers: { 'Upload-Offset': String(offset) } });
        }
        if (method === 'PATCH') {
            const bytes = new Uint8Array(init.body).byteLength;
            patches.push({ offset: Number(init.headers['Upload-Offset']), bytes });
            offset += bytes;
            return new Response(null, { status: 204, headers: { 'Upload-Offset': String(offset) } });
        }
        if (method === 'DELETE') return new Response(null, { status: 204 });
        return Response.json({ errors: ['not found'] }, { status: 404 });
    };

    let now = 1_000;
    const receipt = await runNetworkEndpointCanary({
        apiKey: API_KEY,
        mutationsEnabled: true,
        fileBytes: new Uint8Array(20 * MIB),
        idleMs: 300_000,
        fetchImpl,
        interruptPatchImpl: async () => {
            offset += 3 * MIB;
            return { attempted_bytes: MIB, response_status: null };
        },
        correlationId: 'correlation-123',
        now: () => now,
        sleep: async (milliseconds) => { now += milliseconds; },
    });

    assert.deepEqual(patches, [
        { offset: 0, bytes: 8 * MIB },
        { offset: 11 * MIB, bytes: 5 * MIB },
        { offset: 16 * MIB, bytes: 4 * MIB },
    ]);
    assert.equal(receipt.endpoint_idle_ms, 300_000);
    assert.equal(receipt.offset_after_interruption, 11 * MIB);
    assert.equal(receipt.resumed_bytes, 5 * MIB);
    assert.equal(receipt.final_offset, 20 * MIB);
    assert.equal(receipt.unknown_capability_status, 401);
    assert.equal(receipt.endpoint_authority, 'opaque_location_url');
    assert.equal(receipt.delete_status, 204);
    assert.equal(receipt.post_delete_status, 404);
    assert.doesNotMatch(
        JSON.stringify(receipt),
        /asset-123|playback-123|project-123|token=secret|test-api-key/,
    );
});

test('network endpoint canary remains mutation-disabled by default', async () => {
    await assert.rejects(
        runNetworkEndpointCanary({
            apiKey: API_KEY,
            mutationsEnabled: false,
            fileBytes: new Uint8Array(20 * MIB),
        }),
        /provider_canary_mutations_disabled/,
    );
});
