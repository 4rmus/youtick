import { createHash, randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import {
    deleteAsset,
    getAssetStatus,
    requestUpload,
} from './provider-canary.mjs';
import {
    createTusResource,
    patchTus,
    readTusOffset,
} from './tus-resume-canary.mjs';

const SOURCE_BYTES = 20 * 1024 * 1024;
const CHUNK_BYTES = 8 * 1024 * 1024;
const INTERRUPTED_WRITE_BYTES = 1024 * 1024;
const DEFAULT_IDLE_MS = 5 * 60 * 1000;

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function unknownCapability(value, correlationId) {
    const url = new URL(value);
    const segments = url.pathname.split('/');
    segments[segments.length - 1] = sha256(correlationId).slice(0, 32);
    url.pathname = segments.join('/');
    url.search = '';
    url.hash = '';
    return url.toString();
}

async function probeCors(endpoint, fetchImpl) {
    const response = await fetchImpl(endpoint, {
        method: 'OPTIONS',
        headers: {
            Origin: 'http://127.0.0.1:4174',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'tus-resumable,upload-length,upload-metadata',
        },
        signal: AbortSignal.timeout(10_000),
    });
    if (![200, 204].includes(response.status)) throw new Error(`tus_cors_failed_${response.status}`);
    return {
        status: response.status,
        allow_origin: response.headers.get('Access-Control-Allow-Origin'),
        allow_methods: response.headers.get('Access-Control-Allow-Methods'),
        allow_headers: response.headers.get('Access-Control-Allow-Headers'),
    };
}

async function probeUnknownCapability(uploadUrl, correlationId, fetchImpl) {
    const response = await fetchImpl(unknownCapability(uploadUrl, correlationId), {
        method: 'HEAD',
        headers: { 'Tus-Resumable': '1.0.0' },
        signal: AbortSignal.timeout(10_000),
    });
    if (![401, 403, 404].includes(response.status)) {
        throw new Error(`tus_unknown_capability_not_rejected_${response.status}`);
    }
    return response.status;
}

export function interruptPatch(uploadUrl, offset, declaredBytes, attemptedBytes = INTERRUPTED_WRITE_BYTES) {
    return new Promise((resolve, reject) => {
        const request = httpsRequest(uploadUrl, {
            method: 'PATCH',
            headers: {
                'Content-Length': String(declaredBytes),
                'Content-Type': 'application/offset+octet-stream',
                'Tus-Resumable': '1.0.0',
                'Upload-Offset': String(offset),
            },
        });
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        request.once('response', (response) => {
            response.resume();
            finish({ attempted_bytes: attemptedBytes, response_status: response.statusCode ?? null });
        });
        request.once('error', (error) => {
            if (error.message === 'intentional_network_drop') {
                finish({ attempted_bytes: attemptedBytes, response_status: null });
                return;
            }
            reject(error);
        });
        request.setTimeout(10_000, () => request.destroy(new Error('network_probe_timeout')));
        request.write(new Uint8Array(attemptedBytes), (error) => {
            if (error) {
                reject(error);
                return;
            }
            setTimeout(() => request.destroy(new Error('intentional_network_drop')), 250);
        });
    });
}

export async function runNetworkEndpointCanary({
    apiKey,
    mutationsEnabled,
    fileBytes,
    idleMs = DEFAULT_IDLE_MS,
    fetchImpl = fetch,
    interruptPatchImpl = interruptPatch,
    correlationId = randomUUID(),
    now = () => Date.now(),
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
    if (!mutationsEnabled) throw new Error('provider_canary_mutations_disabled');
    if (!(fileBytes instanceof Uint8Array) || fileBytes.byteLength !== SOURCE_BYTES) {
        throw new Error('network_canary_source_invalid');
    }
    if (!Number.isInteger(idleMs) || idleMs < 0 || idleMs > 15 * 60 * 1000) {
        throw new Error('network_canary_idle_invalid');
    }

    const startedAt = now();
    let assetId;
    let uploadUrl;
    let receipt;
    let deleteStatus;
    let postDeleteStatus;
    try {
        const create = await requestUpload(apiKey, correlationId, fetchImpl);
        assetId = create.body.asset.id;
        const cors = await probeCors(create.body.tusEndpoint, fetchImpl);
        uploadUrl = await createTusResource(create.body.tusEndpoint, fileBytes.byteLength, fetchImpl);
        const unknownCapabilityStatus = await probeUnknownCapability(
            uploadUrl,
            correlationId,
            fetchImpl,
        );

        const firstOffset = await patchTus(uploadUrl, 0, fileBytes.subarray(0, CHUNK_BYTES), fetchImpl);
        if (firstOffset !== CHUNK_BYTES) throw new Error('network_canary_first_offset_invalid');

        await sleep(idleMs);
        const idleOffset = await readTusOffset(uploadUrl, fetchImpl);
        if (idleOffset !== CHUNK_BYTES) throw new Error('network_canary_idle_offset_invalid');

        const interrupted = await interruptPatchImpl(uploadUrl, idleOffset, CHUNK_BYTES);
        await sleep(2_000);
        const interruptedOffset = await readTusOffset(uploadUrl, fetchImpl);
        if (interruptedOffset < CHUNK_BYTES || interruptedOffset > 2 * CHUNK_BYTES) {
            throw new Error('network_canary_interrupted_offset_invalid');
        }

        const secondOffset = await patchTus(
            uploadUrl,
            interruptedOffset,
            fileBytes.subarray(interruptedOffset, 2 * CHUNK_BYTES),
            fetchImpl,
        );
        if (secondOffset !== 2 * CHUNK_BYTES) throw new Error('network_canary_resume_offset_invalid');
        const finalOffset = await patchTus(
            uploadUrl,
            secondOffset,
            fileBytes.subarray(secondOffset),
            fetchImpl,
        );
        if (finalOffset !== SOURCE_BYTES) throw new Error('network_canary_final_offset_invalid');
        if (await readTusOffset(uploadUrl, fetchImpl) !== SOURCE_BYTES) {
            throw new Error('network_canary_final_head_invalid');
        }

        receipt = {
            schema: 'youtick.livepeer-network-endpoint-canary.v1',
            correlation_id: correlationId,
            source_bytes: SOURCE_BYTES,
            source_sha256: sha256(fileBytes),
            chunk_bytes: CHUNK_BYTES,
            endpoint_idle_ms: idleMs,
            endpoint_age_ms_at_resume: now() - startedAt,
            endpoint_survived_idle: true,
            cors,
            endpoint_authority: 'opaque_location_url',
            unknown_capability_status: unknownCapabilityStatus,
            upload_url_had_query: Boolean(new URL(uploadUrl).search),
            first_offset: firstOffset,
            interrupted_patch_declared_bytes: CHUNK_BYTES,
            interrupted_patch_attempted_bytes: interrupted.attempted_bytes,
            interrupted_patch_response_status: interrupted.response_status,
            offset_after_interruption: interruptedOffset,
            resumed_bytes: 2 * CHUNK_BYTES - interruptedOffset,
            final_offset: SOURCE_BYTES,
            upload_complete: true,
            asset_id_sha256: sha256(assetId),
            playback_id_sha256: sha256(create.body.asset.playbackId),
            project_id_sha256: sha256(create.body.asset.projectId),
            tus_upload_url_sha256: sha256(uploadUrl),
            tus_origin: new URL(uploadUrl).origin,
        };
    } finally {
        if (assetId) {
            deleteStatus = await deleteAsset(apiKey, assetId, fetchImpl);
            for (let attempt = 0; attempt < 5; attempt += 1) {
                postDeleteStatus = await getAssetStatus(apiKey, assetId, fetchImpl);
                if ([404, 410].includes(postDeleteStatus)) break;
                await sleep(1_000);
            }
            if (![404, 410].includes(postDeleteStatus)) {
                throw new Error(`livepeer_delete_not_visible_${postDeleteStatus}`);
            }
        }
    }
    return { ...receipt, delete_status: deleteStatus, post_delete_status: postDeleteStatus };
}

if (import.meta.main) {
    throw new Error('legacy_network_endpoint_canary_retired_use_canary_playback');
}
