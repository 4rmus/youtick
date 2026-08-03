import { createHash, randomUUID } from 'node:crypto';
import {
    deleteAsset,
    getAssetStatus,
    requestUpload,
} from './provider-canary.mjs';

const TUS_VERSION = '1.0.0';
const OFFSET_RETRIES = 8;

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function requireStatus(response, expected, code) {
    if (!expected.includes(response.status)) throw new Error(`${code}_${response.status}`);
}

function readOffset(response) {
    const value = response.headers.get('Upload-Offset');
    if (!value || !/^[0-9]+$/.test(value)) throw new Error('tus_offset_missing');
    return Number(value);
}

function isLivepeerTusUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && !url.port
            && !url.username
            && !url.password
            && url.hostname === 'origin.livepeer.com';
    } catch {
        return false;
    }
}

function headerValues(response, name) {
    return (response.headers.get(name) || '').split(',').map((value) => value.trim()).filter(Boolean);
}

export async function inspectTusCapabilities(endpoint, fetchImpl = fetch) {
    if (!isLivepeerTusUrl(endpoint)) throw new Error('tus_endpoint_invalid');
    const response = await fetchImpl(endpoint, {
        method: 'OPTIONS',
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
    });
    requireStatus(response, [200, 204], 'tus_options_failed');
    const versions = headerValues(response, 'Tus-Version');
    const resumable = headerValues(response, 'Tus-Resumable');
    const extensions = headerValues(response, 'Tus-Extension');
    const standardVersion = versions.includes(TUS_VERSION);
    const livepeerLegacyVersion = response.status === 204
        && versions.length === 0
        && resumable.length === 1
        && resumable[0] === TUS_VERSION;
    const notAdvertised = response.status === 204
        && versions.length === 0
        && resumable.length === 0
        && extensions.length === 0;
    if (!standardVersion && !livepeerLegacyVersion && !notAdvertised) {
        throw new Error('tus_version_unsupported');
    }
    if (!notAdvertised && !extensions.includes('termination')) {
        throw new Error('tus_termination_unsupported');
    }
    const maxSize = response.headers.get('Tus-Max-Size');
    if (maxSize !== null && !/^[1-9][0-9]*$/.test(maxSize)) {
        throw new Error('tus_max_size_invalid');
    }
    return {
        versionSource: standardVersion
            ? 'tus-version'
            : livepeerLegacyVersion ? 'livepeer-legacy-tus-resumable' : 'not-advertised',
        extensions,
        terminationAdvertised: extensions.includes('termination'),
        concatenationAdvertised: extensions.includes('concatenation'),
        maxSize,
    };
}

export async function createTusResource(endpoint, size, fetchImpl = fetch) {
    if (!isLivepeerTusUrl(endpoint)) throw new Error('tus_endpoint_invalid');
    const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
            'Tus-Resumable': TUS_VERSION,
            'Upload-Length': String(size),
            'Upload-Metadata': `filename ${Buffer.from('canary.mp4').toString('base64')},filetype ${Buffer.from('video/mp4').toString('base64')}`,
        },
        signal: AbortSignal.timeout(20_000),
    });
    requireStatus(response, [201], 'tus_create_failed');
    const location = response.headers.get('Location');
    if (!location) throw new Error('tus_location_missing');
    let uploadUrl;
    try {
        uploadUrl = new URL(location, endpoint).toString();
    } catch {
        throw new Error('tus_location_invalid');
    }
    if (!isLivepeerTusUrl(uploadUrl)) throw new Error('tus_location_invalid');
    return uploadUrl;
}

export async function readTusOffset(uploadUrl, fetchImpl = fetch) {
    const response = await fetchImpl(uploadUrl, {
        method: 'HEAD',
        headers: { 'Tus-Resumable': TUS_VERSION },
        signal: AbortSignal.timeout(10_000),
    });
    requireStatus(response, [200, 204], 'tus_head_failed');
    return readOffset(response);
}

export async function readTusState(uploadUrl, fetchImpl = fetch) {
    const response = await fetchImpl(uploadUrl, {
        method: 'HEAD',
        headers: { 'Tus-Resumable': TUS_VERSION },
        signal: AbortSignal.timeout(10_000),
    });
    requireStatus(response, [200, 204], 'tus_head_failed');
    const length = response.headers.get('Upload-Length');
    if (!length || !/^[1-9][0-9]*$/.test(length)) throw new Error('tus_length_missing');
    return { offset: readOffset(response), length: Number(length) };
}

export async function patchTus(uploadUrl, offset, bytes, fetchImpl = fetch) {
    const response = await fetchImpl(uploadUrl, {
        method: 'PATCH',
        headers: {
            'Tus-Resumable': TUS_VERSION,
            'Upload-Offset': String(offset),
            'Content-Type': 'application/offset+octet-stream',
        },
        body: bytes,
        signal: AbortSignal.timeout(300_000),
    });
    requireStatus(response, [204], 'tus_patch_failed');
    return readOffset(response);
}

async function waitForTusOffset(uploadUrl, expectedOffset, fetchImpl, sleep) {
    let actualOffset = -1;
    for (let attempt = 1; attempt <= OFFSET_RETRIES; attempt += 1) {
        actualOffset = await readTusOffset(uploadUrl, fetchImpl);
        if (actualOffset === expectedOffset) return { actualOffset, attempts: attempt };
        if (attempt < OFFSET_RETRIES) await sleep(250);
    }
    throw new Error(`tus_resume_offset_mismatch_expected_${expectedOffset}_actual_${actualOffset}`);
}

export async function runTusResumeCanary({
    apiKey,
    mutationsEnabled,
    fileBytes,
    resumePercents,
    fetchImpl = fetch,
    correlationId = randomUUID(),
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
    if (!mutationsEnabled) throw new Error('provider_canary_mutations_disabled');
    if (!(fileBytes instanceof Uint8Array) || fileBytes.byteLength === 0) {
        throw new Error('canary_file_invalid');
    }
    const checkpoints = Array.isArray(resumePercents) ? resumePercents : [resumePercents];
    if (checkpoints.length === 0
        || checkpoints.some((percent) => ![30, 70].includes(percent))
        || checkpoints.some((percent, index) => index > 0 && percent <= checkpoints[index - 1])) {
        throw new Error('resume_percent_invalid');
    }

    let assetId;
    let create;
    let uploadUrl;
    let receipt;
    let deleteStatus;
    let postDeleteStatus;
    try {
        create = await requestUpload(apiKey, correlationId, fetchImpl);
        assetId = create.body.asset.id;
        uploadUrl = await createTusResource(create.body.tusEndpoint, fileBytes.byteLength, fetchImpl);
        let currentOffset = 0;
        const resumeEvidence = [];
        for (const resumePercent of checkpoints) {
            const targetOffset = Math.floor(fileBytes.byteLength * resumePercent / 100);
            const patchOffset = await patchTus(
                uploadUrl,
                currentOffset,
                fileBytes.subarray(currentOffset, targetOffset),
                fetchImpl,
            );
            if (patchOffset !== targetOffset) throw new Error('tus_checkpoint_offset_mismatch');
            const observed = await waitForTusOffset(uploadUrl, targetOffset, fetchImpl, sleep);
            resumeEvidence.push({
                resume_percent: resumePercent,
                bytes_sent: targetOffset - currentOffset,
                resumed_offset: observed.actualOffset,
                head_attempts: observed.attempts,
            });
            currentOffset = targetOffset;
        }

        const finalOffset = await patchTus(uploadUrl, currentOffset, fileBytes.subarray(currentOffset), fetchImpl);
        if (finalOffset !== fileBytes.byteLength) throw new Error('tus_final_offset_mismatch');

        const finalObserved = await waitForTusOffset(
            uploadUrl,
            fileBytes.byteLength,
            fetchImpl,
            sleep,
        );

        receipt = {
            schema: 'youtick.livepeer-tus-resume-canary.v1',
            correlation_id: correlationId,
            checkpoints: resumeEvidence,
            source_bytes: fileBytes.byteLength,
            source_sha256: sha256(fileBytes),
            final_patch_bytes: fileBytes.byteLength - currentOffset,
            final_offset: finalObserved.actualOffset,
            final_head_attempts: finalObserved.attempts,
            upload_complete: true,
            asset_id_sha256: sha256(assetId),
            playback_id_sha256: sha256(create.body.asset.playbackId),
            project_id_sha256: sha256(create.body.asset.projectId),
            tus_upload_url_sha256: sha256(uploadUrl),
            tus_origin: new URL(uploadUrl).origin,
            playback_policy: create.body.asset.playbackPolicy.type,
            media_path: 'developer-machine-to-livepeer',
            browser_matrix_proven: false,
        };
    } finally {
        if (assetId) {
            deleteStatus = await deleteAsset(apiKey, assetId, fetchImpl);
            postDeleteStatus = await getAssetStatus(apiKey, assetId, fetchImpl);
            if (![404, 410].includes(postDeleteStatus)) {
                throw new Error(`livepeer_delete_not_visible_${postDeleteStatus}`);
            }
        }
    }
    return { ...receipt, delete_status: deleteStatus, post_delete_status: postDeleteStatus };
}

if (import.meta.main) {
    throw new Error('legacy_tus_resume_canary_retired_use_canary_playback');
}
