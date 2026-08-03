import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createTusResource,
    inspectTusCapabilities,
    runTusResumeCanary,
} from './tus-resume-canary.mjs';

const API_KEY = 'test-api-key-that-is-long-enough';

test('TUS resource rejects an untrusted endpoint before a request', async () => {
    let calls = 0;
    await assert.rejects(
        createTusResource('https://origin.livepeer.com:8443/tus', 1, async () => {
            calls += 1;
            return new Response(null, { status: 201 });
        }),
        /tus_endpoint_invalid/,
    );
    assert.equal(calls, 0);
});

test('TUS termination rejects a credentialed endpoint before a request', async () => {
    let calls = 0;
    await assert.rejects(
        inspectTusCapabilities('https://user:password@origin.livepeer.com/tus', async () => {
            calls += 1;
            return new Response(null, { status: 204 });
        }),
        /tus_endpoint_invalid/,
    );
    assert.equal(calls, 0);
});

test('TUS termination is advertised without a TUS header on OPTIONS', async () => {
    const calls = [];
    const source = await inspectTusCapabilities('https://origin.livepeer.com/tus', async (url, init = {}) => {
        calls.push({
            url: String(url),
            method: init.method,
            redirect: init.redirect,
            hasTusResumable: new Headers(init.headers).has('Tus-Resumable'),
        });
        return new Response(null, {
            status: 204,
            headers: {
                'Tus-Version': '1.0.0,0.2.2',
                'Tus-Extension': 'creation,termination',
            },
        });
    });
    assert.deepEqual(source, {
        versionSource: 'tus-version',
        extensions: ['creation', 'termination'],
        terminationAdvertised: true,
        concatenationAdvertised: false,
        maxSize: null,
    });
    assert.deepEqual(calls, [{
        url: 'https://origin.livepeer.com/tus',
        method: 'OPTIONS',
        redirect: 'manual',
        hasTusResumable: false,
    }]);
});

test('TUS capabilities accept only the known Livepeer legacy version signature', async () => {
    const source = await inspectTusCapabilities('https://origin.livepeer.com/tus', async () => (
        new Response(null, {
            status: 204,
            headers: {
                'Tus-Resumable': '1.0.0',
                'Tus-Extension': 'creation,termination',
            },
        })
    ));
    assert.equal(source.versionSource, 'livepeer-legacy-tus-resumable');

    await assert.rejects(
        inspectTusCapabilities('https://origin.livepeer.com/tus', async () => (
            new Response(null, {
                status: 200,
                headers: {
                    'Tus-Resumable': '1.0.0',
                    'Tus-Extension': 'termination',
                },
            })
        )),
        /tus_version_unsupported/,
    );
});

test('TUS capabilities record Livepeer bare 204 without treating it as protocol denial', async () => {
    const source = await inspectTusCapabilities('https://origin.livepeer.com/tus', async () => (
        new Response(null, { status: 204 })
    ));
    assert.deepEqual(source, {
        versionSource: 'not-advertised',
        extensions: [],
        terminationAdvertised: false,
        concatenationAdvertised: false,
        maxSize: null,
    });
});

test('TUS capabilities reject inconsistent version or extension advertisements', async () => {
    for (const [headers, code] of [
        [{ 'Tus-Extension': 'termination' }, 'tus_version_unsupported'],
        [{ 'Tus-Version': '1.0.0', 'Tus-Extension': 'creation' }, 'tus_termination_unsupported'],
    ]) {
        await assert.rejects(
            inspectTusCapabilities('https://origin.livepeer.com/tus', async () => (
                new Response(null, { status: 204, headers })
            )),
            new RegExp(code),
        );
    }
});

test('TUS resource rejects an untrusted Location before PATCH bytes', async () => {
    const calls = [];
    await assert.rejects(
        createTusResource('https://origin.livepeer.com/tus', 1, async (url, init = {}) => {
            calls.push({ url: String(url), method: init.method });
            return new Response(null, {
                status: 201,
                headers: { Location: 'https://example.test/upload' },
            });
        }),
        /tus_location_invalid/,
    );
    assert.deepEqual(calls, [{ url: 'https://origin.livepeer.com/tus', method: 'POST' }]);
});

test('TUS canary resumes at 30 and 70 percent and uploads only missing bytes', async () => {
    const fileBytes = new Uint8Array(100).fill(7);
    const patches = [];
    let offset = 0;
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
        if (method === 'POST') {
            return new Response(null, {
                status: 201,
                headers: { Location: '/uploads/one?token=secret' },
            });
        }
        if (method === 'PATCH') {
            const bytes = new Uint8Array(init.body);
            patches.push({ offset: Number(init.headers['Upload-Offset']), bytes: bytes.byteLength });
            offset += bytes.byteLength;
            return new Response(null, { status: 204, headers: { 'Upload-Offset': String(offset) } });
        }
        if (method === 'HEAD') {
            return new Response(null, { status: 200, headers: { 'Upload-Offset': String(offset) } });
        }
        if (method === 'DELETE') return new Response(null, { status: 204 });
        return Response.json({ errors: ['not found'] }, { status: 404 });
    };

    const receipt = await runTusResumeCanary({
        apiKey: API_KEY,
        mutationsEnabled: true,
        fileBytes,
        resumePercents: [30, 70],
        fetchImpl,
        correlationId: 'correlation-123',
        sleep: async () => {},
    });

    assert.deepEqual(patches, [
        { offset: 0, bytes: 30 },
        { offset: 30, bytes: 40 },
        { offset: 70, bytes: 30 },
    ]);
    assert.deepEqual(receipt.checkpoints.map(({ resume_percent, resumed_offset }) => ({
        resume_percent,
        resumed_offset,
    })), [
        { resume_percent: 30, resumed_offset: 30 },
        { resume_percent: 70, resumed_offset: 70 },
    ]);
    assert.equal(receipt.final_offset, 100);
    assert.equal(receipt.delete_status, 204);
    assert.equal(receipt.post_delete_status, 404);
    assert.equal(receipt.browser_matrix_proven, false);
    assert.doesNotMatch(JSON.stringify(receipt), /asset-123|playback-123|project-123|token=secret/);
});

test('TUS canary rejects unsupported resume percentages before provider mutation', async () => {
    await assert.rejects(
        runTusResumeCanary({
            apiKey: API_KEY,
            mutationsEnabled: true,
            fileBytes: new Uint8Array([1]),
            resumePercents: [50],
        }),
        /resume_percent_invalid/,
    );
});

test('TUS canary deletes the asset when the provider HEAD offset does not advance', async () => {
    let deleted = false;
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
        if (method === 'POST') {
            return new Response(null, {
                status: 201,
                headers: { Location: '/uploads/one?token=secret' },
            });
        }
        if (method === 'PATCH') {
            return new Response(null, { status: 204, headers: { 'Upload-Offset': '30' } });
        }
        if (method === 'HEAD') {
            return new Response(null, { status: 200, headers: { 'Upload-Offset': '0' } });
        }
        if (method === 'DELETE') {
            deleted = true;
            return new Response(null, { status: 204 });
        }
        return Response.json({ errors: ['not found'] }, { status: 404 });
    };

    await assert.rejects(
        runTusResumeCanary({
            apiKey: API_KEY,
            mutationsEnabled: true,
            fileBytes: new Uint8Array(100),
            resumePercents: [30, 70],
            fetchImpl,
            correlationId: 'correlation-123',
            sleep: async () => {},
        }),
        /tus_resume_offset_mismatch_expected_30_actual_0/,
    );
    assert.equal(deleted, true);
});
