import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { runPlaybackCanary } from './playback-canary.mjs';

function keys() {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    return {
        privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    };
}

function livepeerSigningKeys() {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    return {
        privateKey: Buffer.from(pair.privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64'),
        publicKey: Buffer.from(pair.publicKey.export({ type: 'spki', format: 'pem' })).toString('base64'),
    };
}

function response(status, body, headers = {}) {
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

const PLAYABLE_HLS = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000\nindex_0.m3u8\n';
const MULTI_VARIANT_HLS = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000\nprotected.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=128000\npublic.m3u8\n';
const PLAYABLE_MEDIA_HLS = '#EXTM3U\n#EXTINF:4.0,\nsegment_0.ts\n';
const HLS_ERROR = '#EXTM3U\n#EXT-X-ERROR\n#EXT-X-ENDLIST\n';
const MIXED_MASTER_HLS = '#EXTM3U\n#EXT-X-ERROR\n#EXT-X-STREAM-INF:BANDWIDTH=128000\nindex_0.m3u8\n';
const MIXED_MEDIA_HLS = '#EXTM3U\n#EXT-X-ERROR\n#EXTINF:4.0,\nsegment_0.ts\n';
const MIXED_IFRAME_HLS = '#EXTM3U\n#EXT-X-ERROR\n#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=128000,URI="iframe.m3u8"\n';
const MIXED_AUDIO_HLS = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000\nprotected.m3u8\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="public-audio.m3u8"\n';
const ERRORISH_HLS = '#EXTM3U\n#EXT-X-ERRORISH\n#EXT-X-ENDLIST\n';
const UNTRUSTED_HLS = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000\nhttps://untrusted.example/index.m3u8\n';
const USERINFO_HLS = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000\nhttps://user:password@playback.livepeer.studio/asset/hls/playback-123/index_0.m3u8\n';
const ERROR_WITH_KEY_OR_MAP_HLS = '#EXTM3U\n#EXT-X-ERROR\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\n';
const ERROR_WITH_BYTERANGE_SEGMENT_HLS = '#EXTM3U\n#EXT-X-ERROR\n#EXTINF:4.0,\n#EXT-X-BYTERANGE:1024@0\nsegment_0.ts\n';
const THUMBNAIL_VTT = 'WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nkeyframes_0.jpg\n';

function hlsResponse(status, body) {
    return new Response(body, { status, headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } });
}

function vttResponse(status, body) {
    return new Response(body, { status, headers: { 'Content-Type': 'text/vtt' } });
}

function tokenPayload(headers) {
    const token = headers.get('Livepeer-Jwt');
    if (!token) return null;
    try {
        return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    } catch {
        return null;
    }
}

function providerFetch(registeredPublicKey, {
    requestUploadResponseLost = false,
    tusCreateStatus = 201,
    tusDeleteStatus = 204,
    tusDeleteVisibleAfter = 0,
    tusVersion = '1.0.0',
    tusExtensions = 'creation,termination',
    tusLocation = '/resource-123',
    anonymousHlsStatus,
    anonymousHlsBody,
    anonymousSourceHlsStatus,
    anonymousSourceHlsBody,
    anonymousHlsChildStatus = 200,
    anonymousHlsChildBody = '',
    allowedHlsBody = PLAYABLE_HLS,
    anonymousVttStatus,
    anonymousThumbnailStatus,
    vttBody = THUMBNAIL_VTT,
    sourceHls = 'https://asset-cdn.lp-playback.studio/hls/playback-123/index.m3u8',
    mp4Source,
    extraSources = [],
} = {}) {
    const hls = 'https://playback.livepeer.studio/asset/hls/playback-123/index.m3u8';
    const mp4 = 'https://playback.livepeer.studio/asset/mp4/playback-123/video.mp4';
    const download = 'https://playback.livepeer.studio/asset/download/playback-123';
    const sources = [
        { type: 'html5/application/vnd.apple.mpegurl', url: sourceHls },
        mp4Source ?? {
            type: 'html5/video/mp4',
            url: mp4,
            width: 1280,
            height: 720,
            bitrate: 3_000_000,
        },
        ...extraSources,
    ];
    const hlsOutputs = new Set([
        hls,
        ...sources
            .filter((source) => source?.type === 'html5/application/vnd.apple.mpegurl')
            .map((source) => source?.url),
    ]);
    const directOutputs = new Set([
        download,
        ...sources
            .filter((source) => source?.type === 'html5/video/mp4')
            .map((source) => source?.url),
    ]);
    const vttOutputs = new Set(sources
        .filter((source) => source?.type === 'text/vtt')
        .map((source) => source?.url));
    const thumbnailOutputs = new Set([
        'https://asset-cdn.lp-playback.studio/hls/playback-123/thumbnails/keyframes_0.jpg',
    ]);
    const calls = [];
    let tusHeadsAfterDelete = 0;
    const fetchImpl = async (url, init = {}) => {
        const method = init.method || 'GET';
        const target = String(url);
        const headers = new Headers(init.headers);
        calls.push({ target, method, hasJwt: headers.has('Livepeer-Jwt'), redirect: init.redirect });
        if (target.endsWith('/asset/request-upload') && method === 'POST') {
            if (requestUploadResponseLost) throw new Error('simulated_request_upload_response_lost');
            return response(200, {
                tusEndpoint: 'https://origin.livepeer.com/api/asset/upload/tus',
                asset: {
                    id: 'asset-123',
                    playbackId: 'playback-123',
                    projectId: 'project-123',
                    playbackPolicy: { type: 'jwt' },
                },
            });
        }
        if (target === 'https://origin.livepeer.com/api/asset/upload/tus' && method === 'OPTIONS') {
            return response(204, undefined, {
                'Tus-Version': tusVersion,
                'Tus-Extension': tusExtensions,
            });
        }
        if (target === 'https://origin.livepeer.com/api/asset/upload/tus' && method === 'POST') {
            return response(tusCreateStatus, undefined, tusCreateStatus === 201 && tusLocation ? { Location: tusLocation } : {});
        }
        if (target === 'https://origin.livepeer.com/resource-123' && method === 'PATCH') {
            return response(204, undefined, { 'Upload-Offset': '4' });
        }
        if (target === 'https://origin.livepeer.com/resource-123' && method === 'HEAD') {
            const deleted = calls.some((call) => call.target === target && call.method === 'DELETE');
            if (deleted) {
                tusHeadsAfterDelete += 1;
                return response(tusHeadsAfterDelete > tusDeleteVisibleAfter ? 404 : 200);
            }
            return response(200, undefined, { 'Upload-Offset': '4' });
        }
        if (target === 'https://origin.livepeer.com/resource-123' && method === 'DELETE') {
            return response(tusDeleteStatus);
        }
        if (target.endsWith('/asset/asset-123') && method === 'GET') {
            const deleted = calls.some((call) => call.target.endsWith('/asset/asset-123') && call.method === 'DELETE');
            return deleted ? response(404, {}) : response(200, {
                id: 'asset-123',
                playbackId: 'playback-123',
                projectId: 'project-123',
                name: 'youtick-paid-media-canary-test-correlation',
                creatorId: { type: 'unverified', value: 'test-correlation' },
                playbackPolicy: { type: 'jwt' },
                status: { phase: 'ready' },
                size: 4,
                downloadUrl: download,
            });
        }
        if (target.endsWith('/playback/playback-123')) {
            return response(200, { type: 'vod', meta: { playbackPolicy: { type: 'jwt' }, source: sources } });
        }
        if (hlsOutputs.has(target) || directOutputs.has(target)) {
            const payload = tokenPayload(headers);
            const anonymousStatus = target === sourceHls
                ? anonymousSourceHlsStatus ?? anonymousHlsStatus
                : anonymousHlsStatus;
            const anonymousBody = target === sourceHls
                ? anonymousSourceHlsBody ?? anonymousHlsBody
                : anonymousHlsBody;
            if (hlsOutputs.has(target) && !payload && anonymousStatus) {
                return hlsResponse(anonymousStatus, anonymousBody ?? '');
            }
            const allowedHls = target === hls
                && payload?.pub === registeredPublicKey
                && payload?.sub === 'playback-123'
                && payload?.exp > 1_700_000_000;
            return target === hls && allowedHls
                ? hlsResponse(200, allowedHlsBody)
                : response(401);
        }
        if (vttOutputs.has(target)) {
            const payload = tokenPayload(headers);
            if (!payload && anonymousVttStatus) return vttResponse(anonymousVttStatus, '');
            const allowedVtt = payload?.pub === registeredPublicKey
                && payload?.sub === 'playback-123'
                && payload?.exp > 1_700_000_000;
            return allowedVtt ? vttResponse(200, vttBody) : response(401);
        }
        if (thumbnailOutputs.has(target)) {
            if (!tokenPayload(headers) && anonymousThumbnailStatus) {
                return response(anonymousThumbnailStatus);
            }
            return response(401);
        }
        if (target.includes('/hls/playback-123/')) {
            if (!tokenPayload(headers)) return hlsResponse(anonymousHlsChildStatus, anonymousHlsChildBody);
            return response(401);
        }
        if (target.endsWith('/asset/asset-123') && method === 'DELETE') return response(204);
        if (target.endsWith('/asset') && method === 'GET') {
            const deleted = calls.some((call) => call.target.endsWith('/asset/asset-123') && call.method === 'DELETE');
            return response(200, requestUploadResponseLost && !deleted ? [{
                id: 'asset-123',
                name: 'youtick-paid-media-canary-test-correlation',
                creatorId: { type: 'unverified', value: 'test-correlation' },
            }] : []);
        }
        throw new Error(`unexpected ${method} ${target}`);
    };
    return { fetchImpl, calls };
}

test('playback canary is mutation-disabled by default', async () => {
    await assert.rejects(
        runPlaybackCanary({ mutationsEnabled: false, fileBytes: new Uint8Array([1]) }),
        /playback_canary_mutations_disabled/,
    );
});

test('playback canary rejects a mismatched signing key before provider mutation', async () => {
    const expected = keys();
    const wrong = keys();
    const { fetchImpl, calls } = providerFetch(expected.publicKey);
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: expected.privateKey,
            publicKey: wrong.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
        }),
        /playback_canary_signing_key_invalid/,
    );
    assert.equal(calls.length, 0);
});

test('playback canary accepts Livepeer base64-encoded PEM signing keys', async () => {
    const key = livepeerSigningKeys();
    const { fetchImpl } = providerFetch(key.publicKey);
    const receipt = await runPlaybackCanary({
        apiKey: 'test-api-key-123456',
        mutationsEnabled: true,
        privateKey: key.privateKey,
        publicKey: key.publicKey,
        fileBytes: new Uint8Array([1, 2, 3, 4]),
        fetchImpl,
        sleep: async () => {},
        now: () => 1_700_000_000_000,
        readyAttempts: 1,
        correlationId: 'test-correlation',
    });
    assert.equal(receipt.hls.correct, 200);
    assert.equal(receipt.cleanup.inventory_count, 0);
});

test('playback canary verifies JWT access, redacts identities and cleans up', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey);
    const times = [1_700_000_000_000, 1_700_000_002_000];
    const receipt = await runPlaybackCanary({
        apiKey: 'test-api-key-123456',
        mutationsEnabled: true,
        privateKey: key.privateKey,
        publicKey: key.publicKey,
        fileBytes: new Uint8Array([1, 2, 3, 4]),
        fetchImpl,
        sleep: async () => {},
        now: () => times.shift() ?? 1_700_000_002_000,
        readyAttempts: 1,
        correlationId: 'test-correlation',
    });
    assert.deepEqual(receipt.denied.anonymous, {
        hls: { top: { status: 401 } },
        source_hls: [{ top: { status: 401 } }],
        mp4: [401],
        download: 401,
    });
    for (const result of Object.values(receipt.denied).slice(1)) {
        assert.deepEqual(result, { hls: { top: { status: 401 } } });
    }
    assert.equal(receipt.hls.correct, 200);
    assert.equal(receipt.hls.refresh, 200);
    assert.equal(receipt.tus_version_source, 'tus-version');
    assert.equal(receipt.tus_termination_advertised, true);
    assert.deepEqual(receipt.cleanup, {
        tus: { delete_status: 204, post_delete_status: 404 },
        asset_delete_status: 204,
        asset_post_delete_status: 404,
        inventory_count: 0,
    });
    assert.equal(receipt.browser_matrix_proven, false);
    assert.equal(receipt.browser, null);
    assert.doesNotMatch(JSON.stringify(receipt), /asset-123|playback-123|project-123|resource-123|test-api-key/);
    assert.ok(calls.some((call) => call.target === 'https://origin.livepeer.com/resource-123' && call.method === 'DELETE'));
    assert.ok(calls.some((call) => call.target === 'https://playback.livepeer.studio/asset/hls/playback-123/index.m3u8'));
    assert.ok(calls.some((call) => call.target === 'https://asset-cdn.lp-playback.studio/hls/playback-123/index.m3u8'));
    assert.ok(calls.filter((call) => call.hasJwt).every((call) => call.redirect === 'manual'));
    assert.ok(calls.findIndex((call) => call.target === 'https://origin.livepeer.com/resource-123' && call.method === 'DELETE')
        < calls.findIndex((call) => call.target.endsWith('/asset/asset-123') && call.method === 'DELETE'));
});

test('playback canary deletes an unuploaded asset when TUS termination is not advertised', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, { tusExtensions: 'creation' });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /tus_termination_unsupported/,
    );
    assert.equal(calls.some((call) => (
        call.target === 'https://origin.livepeer.com/api/asset/upload/tus' && call.method === 'POST'
    )), false);
    assert.ok(calls.some((call) => call.target.endsWith('/asset/asset-123') && call.method === 'DELETE'));
    assert.equal(calls.some((call) => call.target === 'https://origin.livepeer.com/resource-123'), false);
});

test('playback canary preserves the asset when TUS termination fails', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, { tusDeleteStatus: 500 });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_cleanup_failure/,
    );
    assert.ok(!calls.some((call) => call.target.endsWith('/asset/asset-123') && call.method === 'DELETE'));
});

test('playback canary preserves the asset when TUS creation is ambiguous', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, { tusCreateStatus: 503 });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        (error) => {
            assert.match(error.message, /playback_canary_failed_with_cleanup_failure/);
            assert.deepEqual(error.recovery, {
                asset_cleanup: 'tus_cleanup_unproven',
                correlation_id: 'test-correlation',
            });
            return true;
        },
    );
    assert.ok(!calls.some((call) => call.target.endsWith('/asset/asset-123') && call.method === 'DELETE'));
});

test('playback canary preserves the asset when TUS creation omits its Location', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, { tusLocation: null });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        (error) => {
            assert.match(error.message, /playback_canary_failed_with_cleanup_failure/);
            assert.deepEqual(error.recovery, {
                asset_cleanup: 'tus_cleanup_unproven',
                correlation_id: 'test-correlation',
            });
            return true;
        },
    );
    assert.ok(!calls.some((call) => call.target.endsWith('/asset/asset-123') && call.method === 'DELETE'));
});

test('playback canary reconciles a lost upload response before cleanup', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, { requestUploadResponseLost: true });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /simulated_request_upload_response_lost/,
    );
    assert.ok(calls.some((call) => call.target.endsWith('/asset/asset-123') && call.method === 'DELETE'));
    assert.ok(!calls.some((call) => call.target === 'https://origin.livepeer.com/api/asset/upload/tus' && call.method === 'POST'));
});

test('playback canary accepts an anonymous HLS error manifest as a denial', async () => {
    const key = keys();
    const { fetchImpl } = providerFetch(key.publicKey, {
        anonymousHlsStatus: 200,
        anonymousHlsBody: HLS_ERROR,
    });
    const receipt = await runPlaybackCanary({
        apiKey: 'test-api-key-123456',
        mutationsEnabled: true,
        privateKey: key.privateKey,
        publicKey: key.publicKey,
        fileBytes: new Uint8Array([1, 2, 3, 4]),
        fetchImpl,
        sleep: async () => {},
        now: () => 1_700_000_000_000,
        readyAttempts: 1,
        correlationId: 'test-correlation',
    });
    assert.deepEqual(receipt.denied.anonymous, {
        hls: { top: { status: 200, manifest: 'error' } },
        source_hls: [{ top: { status: 200, manifest: 'error' } }],
        mp4: [401],
        download: 401,
    });
});

test('playback canary verifies the first anonymous HLS child is denied', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, {
        anonymousHlsStatus: 200,
        anonymousHlsBody: PLAYABLE_HLS,
        anonymousHlsChildStatus: 403,
    });
    const receipt = await runPlaybackCanary({
        apiKey: 'test-api-key-123456',
        mutationsEnabled: true,
        privateKey: key.privateKey,
        publicKey: key.publicKey,
        fileBytes: new Uint8Array([1, 2, 3, 4]),
        fetchImpl,
        sleep: async () => {},
        now: () => 1_700_000_000_000,
        readyAttempts: 1,
        correlationId: 'test-correlation',
    });
    assert.deepEqual(receipt.denied.anonymous, {
        hls: {
            top: { status: 200, manifest: 'playable', references_checked: 1 },
            first: { kind: 'variant', status: 403 },
        },
        source_hls: [{
            top: { status: 200, manifest: 'playable', references_checked: 1 },
            first: { kind: 'variant', status: 403 },
        }],
        mp4: [401],
        download: 401,
    });
    const child = calls.find((call) => call.target.endsWith('/asset/hls/playback-123/index_0.m3u8'));
    assert.ok(child);
    assert.equal(child.hasJwt, false);
    assert.equal(child.redirect, 'manual');
});

test('playback canary verifies a direct anonymous HLS segment is denied', async () => {
    const key = keys();
    const { fetchImpl } = providerFetch(key.publicKey, {
        anonymousHlsStatus: 200,
        anonymousHlsBody: PLAYABLE_MEDIA_HLS,
        anonymousHlsChildStatus: 403,
    });
    const receipt = await runPlaybackCanary({
        apiKey: 'test-api-key-123456',
        mutationsEnabled: true,
        privateKey: key.privateKey,
        publicKey: key.publicKey,
        fileBytes: new Uint8Array([1, 2, 3, 4]),
        fetchImpl,
        sleep: async () => {},
        now: () => 1_700_000_000_000,
        readyAttempts: 1,
        correlationId: 'test-correlation',
    });
    assert.deepEqual(receipt.denied.anonymous.hls, {
        top: { status: 200, manifest: 'playable', references_checked: 1 },
        first: { kind: 'segment', status: 403 },
    });
    assert.deepEqual(receipt.denied.anonymous.source_hls, [{
        top: { status: 200, manifest: 'playable', references_checked: 1 },
        first: { kind: 'segment', status: 403 },
    }]);
});

test('playback canary accepts an HLS error manifest from the first anonymous variant', async () => {
    const key = keys();
    const { fetchImpl } = providerFetch(key.publicKey, {
        anonymousHlsStatus: 200,
        anonymousHlsBody: PLAYABLE_HLS,
        anonymousHlsChildBody: HLS_ERROR,
    });
    const receipt = await runPlaybackCanary({
        apiKey: 'test-api-key-123456',
        mutationsEnabled: true,
        privateKey: key.privateKey,
        publicKey: key.publicKey,
        fileBytes: new Uint8Array([1, 2, 3, 4]),
        fetchImpl,
        sleep: async () => {},
        now: () => 1_700_000_000_000,
        readyAttempts: 1,
        correlationId: 'test-correlation',
    });
    assert.deepEqual(receipt.denied.anonymous.hls, {
        top: { status: 200, manifest: 'playable', references_checked: 1 },
        first: { kind: 'variant', status: 200, manifest: 'error' },
    });
    assert.deepEqual(receipt.denied.anonymous.source_hls, [{
        top: { status: 200, manifest: 'playable', references_checked: 1 },
        first: { kind: 'variant', status: 200, manifest: 'error' },
    }]);
});

test('playback canary fails closed when the provider HLS source is anonymously playable', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, {
        anonymousSourceHlsStatus: 200,
        anonymousSourceHlsBody: MIXED_IFRAME_HLS,
    });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_expected_denial_anonymous_source_hls_200/,
    );
    assert.ok(calls.some((call) => call.target === 'https://asset-cdn.lp-playback.studio/hls/playback-123/index.m3u8'));
});

test('playback canary fails closed when the first anonymous HLS child is playable', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, {
        anonymousHlsStatus: 200,
        anonymousHlsBody: PLAYABLE_HLS,
        anonymousHlsChildBody: PLAYABLE_HLS,
    });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_expected_denial_anonymous_hls_200/,
    );
    assert.ok(calls.some((call) => call.target.endsWith('/asset/asset-123') && call.method === 'DELETE'));
});

test('playback canary fails closed when a later anonymous HLS variant is playable', async () => {
    const key = keys();
    const { fetchImpl: baseFetch, calls } = providerFetch(key.publicKey, {
        anonymousHlsStatus: 200,
        anonymousHlsBody: MULTI_VARIANT_HLS,
        anonymousHlsChildStatus: 403,
    });
    const fetchImpl = async (url, init) => {
        const response = await baseFetch(url, init);
        return String(url).endsWith('/public.m3u8')
            ? hlsResponse(200, PLAYABLE_HLS)
            : response;
    };
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_expected_denial_anonymous_hls_200/,
    );
    assert.ok(calls.some((call) => call.target.endsWith('/protected.m3u8')));
    assert.ok(calls.some((call) => call.target.endsWith('/public.m3u8')));
});

test('playback canary rejects an untrusted anonymous HLS child URL', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, {
        anonymousHlsStatus: 200,
        anonymousHlsBody: UNTRUSTED_HLS,
    });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_hls_reference_invalid/,
    );
    assert.ok(!calls.some((call) => call.target === 'https://untrusted.example/index.m3u8'));
});

test('playback canary rejects a credentialed anonymous HLS child URL', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, {
        anonymousHlsStatus: 200,
        anonymousHlsBody: USERINFO_HLS,
    });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_hls_reference_invalid/,
    );
    assert.ok(!calls.some((call) => call.target.includes('user:password@')));
});

test('playback canary fails closed on an HLS error manifest with key or map URLs', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, {
        anonymousHlsStatus: 200,
        anonymousHlsBody: ERROR_WITH_KEY_OR_MAP_HLS,
    });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_expected_denial_anonymous_hls_200/,
    );
    assert.ok(!calls.some((call) => call.target.endsWith('/key.bin') || call.target.endsWith('/init.mp4')));
});

test('playback canary fails closed on an HLS error manifest with a byterange segment', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, {
        anonymousHlsStatus: 200,
        anonymousHlsBody: ERROR_WITH_BYTERANGE_SEGMENT_HLS,
    });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_expected_denial_anonymous_hls_200/,
    );
    assert.ok(!calls.some((call) => call.target.endsWith('/segment_0.ts')));
});

test('playback canary fails closed on an anonymous HLS manifest with an unrecognized URI attribute', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, {
        anonymousHlsStatus: 200,
        anonymousHlsBody: MIXED_AUDIO_HLS,
        anonymousHlsChildStatus: 403,
    });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_expected_denial_anonymous_hls_200/,
    );
    assert.equal(calls.some((call) => call.target.endsWith('/protected.m3u8')), false);
});

for (const [name, anonymousHlsBody] of [
    ['playable master', PLAYABLE_HLS],
    ['mixed error master', MIXED_MASTER_HLS],
    ['mixed error media', MIXED_MEDIA_HLS],
    ['mixed error I-frame', MIXED_IFRAME_HLS],
    ['unknown errorish', ERRORISH_HLS],
]) {
    test(`playback canary fails closed on an anonymous ${name} HLS response`, async () => {
        const key = keys();
        const { fetchImpl, calls } = providerFetch(key.publicKey, {
            anonymousHlsStatus: 200,
            anonymousHlsBody,
        });
        await assert.rejects(
            runPlaybackCanary({
                apiKey: 'test-api-key-123456',
                mutationsEnabled: true,
                privateKey: key.privateKey,
                publicKey: key.publicKey,
                fileBytes: new Uint8Array([1, 2, 3, 4]),
                fetchImpl,
                sleep: async () => {},
                now: () => 1_700_000_000_000,
                readyAttempts: 1,
                correlationId: 'test-correlation',
            }),
            /playback_canary_expected_denial_anonymous_hls_200/,
        );
        assert.ok(calls.some((call) => call.target.endsWith('/asset/asset-123') && call.method === 'DELETE'));
    });
}

test('playback canary rejects a JWT HLS error manifest', async () => {
    const key = keys();
    const { fetchImpl } = providerFetch(key.publicKey, { allowedHlsBody: HLS_ERROR });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_correct_hls_200_error/,
    );
});

test('playback canary rejects an invalid metadata HLS output before access probes', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, {
        sourceHls: 'https://asset-cdn.lp-playback.studio:8443/hls/playback-123/index.m3u8',
    });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_outputs_missing/,
    );
    assert.ok(!calls.some((call) => call.target.includes('/asset/hls/playback-123/index.m3u8')));
});

test('playback canary requires one canonical 720p MP4 output before access probes', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, {
        mp4Source: {
            type: 'html5/video/mp4',
            url: 'https://playback.livepeer.studio/asset/mp4/playback-123/video.mp4',
            width: 640,
            height: 360,
            bitrate: 500_000,
        },
    });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_outputs_missing/,
    );
    assert.equal(calls.some((call) => call.target.includes('/asset/hls/playback-123/index.m3u8')), false);
});

test('playback canary probes every provider HLS and MP4 output', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, {
        extraSources: [
            {
                type: 'html5/application/vnd.apple.mpegurl',
                url: 'https://livepeercdn.studio/recordings/recording-001/index.m3u8',
            },
            {
                type: 'html5/video/mp4',
                url: 'https://asset-cdn.lp-playback.com/hls/recording-001/static360p0.mp4',
            },
        ],
    });
    const receipt = await runPlaybackCanary({
        apiKey: 'test-api-key-123456',
        mutationsEnabled: true,
        privateKey: key.privateKey,
        publicKey: key.publicKey,
        fileBytes: new Uint8Array([1, 2, 3, 4]),
        fetchImpl,
        sleep: async () => {},
        now: () => 1_700_000_000_000,
        readyAttempts: 1,
        correlationId: 'test-correlation',
    });
    assert.deepEqual(receipt.denied.anonymous.source_hls, [
        { top: { status: 401 } },
        { top: { status: 401 } },
    ]);
    assert.deepEqual(receipt.denied.anonymous.mp4, [401, 401]);
    for (const target of [
        'https://asset-cdn.lp-playback.studio/hls/playback-123/index.m3u8',
        'https://livepeercdn.studio/recordings/recording-001/index.m3u8',
        'https://asset-cdn.lp-playback.com/hls/recording-001/static360p0.mp4',
    ]) {
        assert.ok(calls.some((call) => call.target === target && !call.hasJwt && call.redirect === 'manual'));
    }
});

test('playback canary fails closed when an additional provider MP4 output is public', async () => {
    const key = keys();
    const alternateMp4 = 'https://asset-cdn.lp-playback.com/hls/recording-001/static360p0.mp4';
    const { fetchImpl: baseFetch, calls } = providerFetch(key.publicKey, {
        extraSources: [{ type: 'html5/video/mp4', url: alternateMp4 }],
    });
    const fetchImpl = async (url, init) => {
        const response = await baseFetch(url, init);
        if (String(url) === alternateMp4 && !new Headers(init?.headers).has('Livepeer-Jwt')) {
            return new Response(null, { status: 200 });
        }
        return response;
    };
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_expected_denial_anonymous_mp4_200/,
    );
    assert.ok(calls.some((call) => call.target === alternateMp4 && !call.hasJwt));
});

test('playback canary rejects an unsupported provider output before access probes', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, {
        extraSources: [{
            type: 'html5/video/h264',
            url: 'https://asset-cdn.lp-playback.studio/hls/playback-123/video.h264',
        }],
    });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_outputs_missing/,
    );
    assert.equal(calls.some((call) => call.target.includes('/asset/hls/playback-123/index.m3u8')), false);
});

test('playback canary caps provider output records before access probes', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, {
        extraSources: Array.from({ length: 15 }, (_, index) => ({
            type: 'html5/video/mp4',
            url: `https://asset-cdn.lp-playback.com/hls/recording-${index}/static360p0.mp4`,
        })),
    });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_outputs_missing/,
    );
    assert.equal(calls.some((call) => call.target.includes('/asset/hls/playback-123/index.m3u8')), false);
});

test('playback canary proves thumbnail VTT and images are private', async () => {
    const key = keys();
    const vtt = 'https://asset-cdn.lp-playback.studio/hls/playback-123/thumbnails/thumbnails.vtt';
    const thumbnail = 'https://asset-cdn.lp-playback.studio/hls/playback-123/thumbnails/keyframes_0.jpg';
    const { fetchImpl, calls } = providerFetch(key.publicKey, {
        extraSources: [{ type: 'text/vtt', url: vtt }],
    });
    const receipt = await runPlaybackCanary({
        apiKey: 'test-api-key-123456',
        mutationsEnabled: true,
        privateKey: key.privateKey,
        publicKey: key.publicKey,
        fileBytes: new Uint8Array([1, 2, 3, 4]),
        fetchImpl,
        sleep: async () => {},
        now: () => 1_700_000_000_000,
        readyAttempts: 1,
        correlationId: 'test-correlation',
    });
    assert.deepEqual(receipt.denied.thumbnails, {
        vtt: [401],
        vtt_sources_checked: 1,
        references_checked: 1,
        images: [401],
    });
    assert.ok(calls.some((call) => call.target === vtt && !call.hasJwt && call.redirect === 'manual'));
    assert.ok(calls.some((call) => call.target === vtt && call.hasJwt && call.redirect === 'manual'));
    assert.ok(calls.some((call) => call.target === thumbnail && !call.hasJwt && call.redirect === 'manual'));
});

test('playback canary fails closed when a thumbnail image is public', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, {
        extraSources: [{
            type: 'text/vtt',
            url: 'https://asset-cdn.lp-playback.studio/hls/playback-123/thumbnails/thumbnails.vtt',
        }],
        anonymousThumbnailStatus: 200,
    });
    await assert.rejects(
        runPlaybackCanary({
            apiKey: 'test-api-key-123456',
            mutationsEnabled: true,
            privateKey: key.privateKey,
            publicKey: key.publicKey,
            fileBytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
            sleep: async () => {},
            now: () => 1_700_000_000_000,
            readyAttempts: 1,
            correlationId: 'test-correlation',
        }),
        /playback_canary_expected_denial_anonymous_thumbnail_200/,
    );
    assert.ok(calls.some((call) => call.target.endsWith('/thumbnails/keyframes_0.jpg')));
});

test('playback canary retries TUS visibility after a successful delete', async () => {
    const key = keys();
    const { fetchImpl, calls } = providerFetch(key.publicKey, { tusDeleteVisibleAfter: 1 });
    const receipt = await runPlaybackCanary({
        apiKey: 'test-api-key-123456',
        mutationsEnabled: true,
        privateKey: key.privateKey,
        publicKey: key.publicKey,
        fileBytes: new Uint8Array([1, 2, 3, 4]),
        fetchImpl,
        sleep: async () => {},
        now: () => 1_700_000_000_000,
        readyAttempts: 1,
        correlationId: 'test-correlation',
    });
    assert.deepEqual(receipt.cleanup.tus, { delete_status: 204, post_delete_status: 404 });
    assert.equal(calls.filter((call) => call.target === 'https://origin.livepeer.com/resource-123' && call.method === 'HEAD').length, 3);
});

test('playback canary keeps only compact Chrome and Edge evidence', async () => {
    const key = keys();
    const { fetchImpl } = providerFetch(key.publicKey);
    const receipt = await runPlaybackCanary({
        apiKey: 'test-api-key-123456',
        mutationsEnabled: true,
        privateKey: key.privateKey,
        publicKey: key.publicKey,
        fileBytes: new Uint8Array([1, 2, 3, 4]),
        fetchImpl,
        sleep: async () => {},
        now: () => 1_700_000_000_000,
        readyAttempts: 1,
        correlationId: 'test-correlation',
        browserProbe: async (input) => {
            assert.equal(input.hlsUrl, 'https://playback.livepeer.studio/asset/hls/playback-123/index.m3u8');
            assert.equal(new URL(input.hlsUrl).search, '');
            assert.match(input.issueToken(), /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
            return {
                matrix_proven: true,
                chrome: {
                    initial_played: true,
                    refreshed_played: true,
                    initial_hls_header_requests: 1,
                    refreshed_hls_header_requests: 1,
                    persistent_storage_empty: true,
                    ignored: 'not-in-receipt',
                },
                edge: {
                    initial_played: true,
                    refreshed_played: true,
                    initial_hls_header_requests: 1,
                    refreshed_hls_header_requests: 2,
                    persistent_storage_empty: true,
                },
            };
        },
    });
    assert.equal(receipt.browser_matrix_proven, true);
    assert.deepEqual(receipt.browser, {
        chrome: {
            initial_played: true,
            refreshed_played: true,
            initial_hls_header_requests: 1,
            refreshed_hls_header_requests: 1,
            persistent_storage_empty: true,
        },
        edge: {
            initial_played: true,
            refreshed_played: true,
            initial_hls_header_requests: 1,
            refreshed_hls_header_requests: 2,
            persistent_storage_empty: true,
        },
    });
});
