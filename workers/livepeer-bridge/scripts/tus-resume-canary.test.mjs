import assert from 'node:assert/strict';
import test from 'node:test';
import { runTusResumeCanary } from './tus-resume-canary.mjs';

const API_KEY = 'test-api-key-that-is-long-enough';

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
