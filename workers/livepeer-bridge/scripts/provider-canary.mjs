import { createHash, randomUUID } from 'node:crypto';

const LIVEPEER_API_BASE = 'https://livepeer.studio/api';
const DELETE_VISIBLE_RETRIES = 5;

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function requireApiKey(apiKey) {
    if (typeof apiKey !== 'string' || apiKey.length < 16 || /[\r\n]/.test(apiKey)) {
        throw new Error('livepeer_api_key_invalid');
    }
}

function requirePlaybackId(playbackId) {
    if (typeof playbackId !== 'string' || !/^[A-Za-z0-9_-]{6,128}$/.test(playbackId)) {
        throw new Error('livepeer_playback_id_invalid');
    }
}

async function readJson(response, code) {
    let body;
    try {
        body = await response.json();
    } catch {
        throw new Error(code);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(code);
    return body;
}

export async function requestUpload(apiKey, correlationId, fetchImpl = fetch) {
    requireApiKey(apiKey);
    const response = await fetchImpl(`${LIVEPEER_API_BASE}/asset/request-upload`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: `youtick-paid-media-canary-${correlationId}`,
            playbackPolicy: { type: 'jwt' },
            creatorId: { type: 'unverified', value: correlationId },
            profiles: [{
                name: '720p',
                width: 1280,
                height: 720,
                bitrate: 3_000_000,
                fps: 30,
                fpsDen: 1,
                gop: '2',
                profile: 'H264Baseline',
                encoder: 'H.264',
            }],
        }),
        signal: AbortSignal.timeout(20_000),
    });
    const body = await readJson(response, 'livepeer_create_response_invalid');
    if (!response.ok) throw new Error(`livepeer_create_failed_${response.status}`);
    if (typeof body.asset?.id !== 'string'
        || typeof body.asset?.playbackId !== 'string'
        || typeof body.asset?.projectId !== 'string'
        || body.asset?.playbackPolicy?.type !== 'jwt'
        || typeof body.tusEndpoint !== 'string') {
        throw new Error('livepeer_create_response_invalid');
    }
    return { status: response.status, body };
}

export async function getAssetStatus(apiKey, assetId, fetchImpl = fetch) {
    requireApiKey(apiKey);
    const response = await fetchImpl(`${LIVEPEER_API_BASE}/asset/${encodeURIComponent(assetId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
    });
    return response.status;
}

export async function deleteAsset(apiKey, assetId, fetchImpl = fetch) {
    requireApiKey(apiKey);
    const response = await fetchImpl(`${LIVEPEER_API_BASE}/asset/${encodeURIComponent(assetId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 204) throw new Error(`livepeer_delete_failed_${response.status}`);
    return response.status;
}

export async function runProviderReadPreflight({
    apiKey,
    playbackId,
    fetchImpl = fetch,
}) {
    requireApiKey(apiKey);
    requirePlaybackId(playbackId);
    let response;
    try {
        response = await fetchImpl(
            `${LIVEPEER_API_BASE}/playback/${encodeURIComponent(playbackId)}`,
            {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(5_000),
            },
        );
    } catch {
        throw new Error('provider_read_preflight_unavailable');
    }
    if (response.status !== 200) throw new Error(`provider_read_preflight_failed_${response.status}`);
    const playback = await readJson(response, 'provider_read_preflight_response_invalid');
    if (playback.type !== 'vod' || playback.meta?.playbackPolicy?.type !== 'jwt') {
        throw new Error('provider_read_preflight_policy_invalid');
    }
    return {
        schema: 'youtick.livepeer-provider-read-preflight.v1',
        status: response.status,
        kind: 'vod',
        policy: 'jwt',
        playback_id_sha256: sha256(playbackId),
    };
}

export async function runProviderCanary({
    apiKey,
    mutationsEnabled,
    fetchImpl = fetch,
    correlationId = randomUUID(),
    now = () => Date.now(),
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
    requireApiKey(apiKey);
    if (!mutationsEnabled) throw new Error('provider_canary_mutations_disabled');

    const startedAtMs = now();
    let assetId;
    let create;
    try {
        create = await requestUpload(apiKey, correlationId, fetchImpl);
        assetId = create.body.asset.id;
    } finally {
        if (assetId) {
            await deleteAsset(apiKey, assetId, fetchImpl);
        }
    }

    let postDeleteStatus = 200;
    for (let attempt = 0; attempt < DELETE_VISIBLE_RETRIES; attempt += 1) {
        postDeleteStatus = await getAssetStatus(apiKey, assetId, fetchImpl);
        if ([404, 410].includes(postDeleteStatus)) break;
        await sleep(1_000);
    }

    const tusOrigin = new URL(create.body.tusEndpoint).origin;
    return {
        schema: 'youtick.livepeer-provider-canary.v1',
        correlation_id: correlationId,
        started_at: new Date(startedAtMs).toISOString(),
        elapsed_ms: now() - startedAtMs,
        create_status: create.status,
        delete_status: 204,
        post_delete_status: postDeleteStatus,
        asset_id_sha256: sha256(create.body.asset.id),
        playback_id_sha256: sha256(create.body.asset.playbackId),
        project_id_sha256: sha256(create.body.asset.projectId),
        playback_policy: create.body.asset.playbackPolicy.type,
        created_by_token_name: create.body.asset.createdByTokenName ?? null,
        tus_origin: tusOrigin,
        tus_endpoint_returned: true,
        media_bytes_uploaded: 0,
    };
}

if (import.meta.main) {
    const mode = process.argv[2];
    if (mode && mode !== '--read-playback') throw new Error('provider_canary_mode_invalid');
    const receipt = mode === '--read-playback'
        ? await runProviderReadPreflight({
            apiKey: process.env.LIVEPEER_API_KEY,
            playbackId: process.argv[3],
        })
        : await runProviderCanary({
            apiKey: process.env.LIVEPEER_API_KEY,
            mutationsEnabled: process.env.LIVEPEER_PROVIDER_CANARY_MUTATIONS === 'true',
        });
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
