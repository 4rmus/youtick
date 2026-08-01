import assert from 'node:assert/strict';
import test from 'node:test';
import {
    requestUpload,
    runProviderCanary,
} from './provider-canary.mjs';

const API_KEY = 'test-api-key-that-is-long-enough';

function createResponse() {
    return {
        tusEndpoint: 'https://origin.livepeer.com/api/asset/upload/tus?token=secret',
        asset: {
            id: 'asset-123',
            playbackId: 'playback-123',
            projectId: 'project-123',
            playbackPolicy: { type: 'jwt' },
            createdByTokenName: 'canary-backend',
        },
    };
}

test('provider canary is fail-closed unless mutations are explicitly enabled', async () => {
    await assert.rejects(
        runProviderCanary({ apiKey: API_KEY, mutationsEnabled: false }),
        /provider_canary_mutations_disabled/,
    );
});

test('upload request binds JWT policy, correlation metadata and a fixed profile', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        return Response.json(createResponse(), { status: 200 });
    };

    await requestUpload(API_KEY, 'correlation-123', fetchImpl);
    assert.equal(calls.length, 1);
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(body.playbackPolicy, { type: 'jwt' });
    assert.deepEqual(body.creatorId, { type: 'unverified', value: 'correlation-123' });
    assert.equal(body.profiles[0].name, '720p');
    assert.match(calls[0].init.headers.Authorization, /^Bearer /);
});

test('successful canary deletes the asset and returns only redacted identity evidence', async () => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
        calls.push({ url, method: init.method ?? 'GET' });
        if (init.method === 'POST') return Response.json(createResponse(), { status: 200 });
        if (init.method === 'DELETE') return new Response(null, { status: 204 });
        return Response.json({ errors: ['not found'] }, { status: 404 });
    };

    const receipt = await runProviderCanary({
        apiKey: API_KEY,
        mutationsEnabled: true,
        fetchImpl,
        correlationId: 'correlation-123',
        now: () => 1_785_580_000_000,
        sleep: async () => {},
    });

    assert.deepEqual(calls.map(({ method }) => method), ['POST', 'DELETE', 'GET']);
    assert.equal(receipt.post_delete_status, 404);
    assert.equal(receipt.playback_policy, 'jwt');
    assert.equal(receipt.tus_origin, 'https://origin.livepeer.com');
    assert.equal(receipt.media_bytes_uploaded, 0);
    const serialized = JSON.stringify(receipt);
    assert.doesNotMatch(serialized, /asset-123|playback-123|project-123|token=secret|test-api-key/);
});
