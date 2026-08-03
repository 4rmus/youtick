import {
    createHash,
    createPublicKey,
    createSign,
    createVerify,
    generateKeyPairSync,
    randomUUID,
} from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
    createTusResource,
    inspectTusCapabilities,
    patchTus,
    readTusState,
} from './tus-resume-canary.mjs';
import {
    deleteAsset,
    getAssetStatus,
    requestUpload,
} from './provider-canary.mjs';

const LIVEPEER_API_BASE = 'https://livepeer.studio/api';
const MAX_CANARY_BYTES = 80 * 1024 * 1024;
const TUS_CHUNK_BYTES = 32 * 1024 * 1024;
const TUS_MIN_INTERMEDIATE_PATCH_BYTES = 5 * 1024 * 1024;
const READY_ATTEMPTS = 120;
const READY_DELAY_MS = 5_000;
const TUS_DELETE_VISIBLE_RETRIES = 60;
const ASSET_DELETE_VISIBLE_RETRIES = 5;
const MAX_HLS_REFERENCE_PROBES = 32;
const MAX_PROVIDER_PLAYBACK_OUTPUTS = 16;
const MAX_THUMBNAIL_REFERENCE_PROBES = 32;
const LIVEPEER_HLS_SOURCE_TYPE = 'html5/application/vnd.apple.mpegurl';
const LIVEPEER_MP4_SOURCE_TYPE = 'html5/video/mp4';
const LIVEPEER_VTT_SOURCE_TYPE = 'text/vtt';

export function requireLocalCanaryMp4(filePath, fileBytes, probe = spawnSync) {
    if (typeof filePath !== 'string' || filePath.length === 0
        || !(fileBytes instanceof Uint8Array)
        || fileBytes.byteLength !== MAX_CANARY_BYTES) {
        throw new Error('playback_canary_requires_exact_80_mib');
    }
    const result = probe('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=format_name,duration:stream=codec_type',
        '-of', 'json',
        filePath,
    ], { encoding: 'utf8' });
    if (result?.status !== 0 || typeof result.stdout !== 'string') {
        throw new Error('playback_canary_ffprobe_failed');
    }
    let metadata;
    try {
        metadata = JSON.parse(result.stdout);
    } catch {
        throw new Error('playback_canary_ffprobe_invalid');
    }
    const durationSeconds = Number(metadata?.format?.duration);
    const formats = String(metadata?.format?.format_name || '').split(',');
    if (!formats.includes('mp4')
        || !Array.isArray(metadata?.streams)
        || !metadata.streams.some((stream) => stream?.codec_type === 'video')
        || !Number.isFinite(durationSeconds)
        || durationSeconds <= 0) {
        throw new Error('playback_canary_source_not_playable_mp4');
    }
    return { duration_seconds: durationSeconds };
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function base64Url(value) {
    return Buffer.from(value).toString('base64url');
}

function requireCanarySource(fileBytes) {
    if (!(fileBytes instanceof Uint8Array)
        || fileBytes.byteLength === 0
        || fileBytes.byteLength > MAX_CANARY_BYTES) {
        throw new Error('playback_canary_source_invalid');
    }
}

export function tusChunkRanges(sourceBytes, chunkBytes = TUS_CHUNK_BYTES) {
    if (!Number.isSafeInteger(sourceBytes) || sourceBytes < 1
        || chunkBytes !== TUS_CHUNK_BYTES) {
        throw new Error('playback_canary_chunk_plan_invalid');
    }
    const ranges = [];
    for (let offset = 0; offset < sourceBytes; offset += chunkBytes) {
        const end = Math.min(offset + chunkBytes, sourceBytes);
        if (end < sourceBytes && end - offset < TUS_MIN_INTERMEDIATE_PATCH_BYTES) {
            throw new Error('playback_canary_intermediate_patch_too_small');
        }
        ranges.push({ offset, end, bytes: end - offset });
    }
    return ranges;
}

async function uploadTusSequential(uploadUrl, fileBytes, fetchImpl, sleep) {
    const initial = await readTusState(uploadUrl, fetchImpl);
    if (initial.offset !== 0 || initial.length !== fileBytes.byteLength) {
        throw new Error('playback_canary_initial_tus_state_invalid');
    }
    const chunks = [];
    let pauseResumeOffset = null;
    let nextOffset = initial.offset;
    for (const range of tusChunkRanges(fileBytes.byteLength)) {
        if (range.offset !== nextOffset) throw new Error('playback_canary_resume_offset_invalid');
        const patchOffset = await patchTus(
            uploadUrl,
            nextOffset,
            fileBytes.subarray(range.offset, range.end),
            fetchImpl,
        );
        if (patchOffset !== range.end) throw new Error('playback_canary_patch_offset_invalid');
        const observed = await readTusState(uploadUrl, fetchImpl);
        if (observed.offset !== range.end || observed.length !== fileBytes.byteLength) {
            throw new Error('playback_canary_upload_offset_invalid');
        }
        chunks.push({
            bytes: range.bytes,
            start_offset: range.offset,
            patch_offset: patchOffset,
            head_offset: observed.offset,
        });
        nextOffset = observed.offset;
        if (chunks.length === 1 && range.end < fileBytes.byteLength) {
            await sleep(1_000);
            const resumed = await readTusState(uploadUrl, fetchImpl);
            if (resumed.offset !== observed.offset || resumed.length !== fileBytes.byteLength) {
                throw new Error('playback_canary_resume_offset_invalid');
            }
            pauseResumeOffset = resumed.offset;
            nextOffset = resumed.offset;
        }
    }
    return { initial, chunks, pauseResumeOffset };
}

function privateKeyInput(value) {
    if (typeof value !== 'string' || value.length < 64) {
        throw new Error('playback_canary_signing_key_missing');
    }
    if (value.startsWith('-----BEGIN PRIVATE KEY-----')) return value;
    try {
        const key = decodeBase64Key(value);
        const pem = key.toString('utf8');
        return pem.startsWith('-----BEGIN PRIVATE KEY-----')
            ? pem
            : { key, format: 'der', type: 'pkcs8' };
    } catch {
        throw new Error('playback_canary_signing_key_invalid');
    }
}

function decodeBase64Key(value) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
        throw new Error('playback_canary_signing_key_invalid');
    }
    const key = Buffer.from(value, 'base64');
    if (key.byteLength === 0
        || key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) {
        throw new Error('playback_canary_signing_key_invalid');
    }
    return key;
}

function publicKeyInput(value) {
    if (typeof value !== 'string' || value.length < 32) {
        throw new Error('playback_canary_signing_key_missing');
    }
    try {
        const input = value.startsWith('-----BEGIN PUBLIC KEY-----')
            ? value
            : (() => {
                const key = decodeBase64Key(value);
                const pem = key.toString('utf8');
                return pem.startsWith('-----BEGIN PUBLIC KEY-----')
                    ? pem
                    : { key, format: 'der', type: 'spki' };
            })();
        createPublicKey(input);
        return input;
    } catch {
        throw new Error('playback_canary_signing_key_invalid');
    }
}

function requireIssuer(value) {
    if (typeof value !== 'string') throw new Error('playback_canary_issuer_invalid');
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.origin !== value) {
            throw new Error('playback_canary_issuer_invalid');
        }
    } catch {
        throw new Error('playback_canary_issuer_invalid');
    }
}

function signJwt({ privateKey, publicKey, issuer, playbackId, issuedAt, expiresAt }) {
    publicKeyInput(publicKey);
    const header = base64Url(JSON.stringify({ alg: 'ES256', typ: 'JWT' }));
    const payload = base64Url(JSON.stringify({
        action: 'pull',
        iss: issuer,
        pub: publicKey,
        sub: playbackId,
        video: 'none',
        iat: issuedAt,
        exp: expiresAt,
    }));
    const input = `${header}.${payload}`;
    try {
        const signer = createSign('SHA256');
        signer.update(input);
        signer.end();
        return `${input}.${signer.sign({
            key: privateKeyInput(privateKey),
            dsaEncoding: 'ieee-p1363',
        }).toString('base64url')}`;
    } catch {
        throw new Error('playback_canary_signing_key_invalid');
    }
}

function verifySigningKeyPair(privateKey, publicKey, issuer) {
    const token = signJwt({
        privateKey,
        publicKey,
        issuer,
        playbackId: 'preflight',
        issuedAt: 1,
        expiresAt: 2,
    });
    const [header, payload, signature] = token.split('.');
    try {
        const verifier = createVerify('SHA256');
        verifier.update(`${header}.${payload}`);
        verifier.end();
        const key = publicKeyInput(publicKey);
        const input = typeof key === 'string'
            ? { key, dsaEncoding: 'ieee-p1363' }
            : { ...key, dsaEncoding: 'ieee-p1363' };
        if (!verifier.verify(input, Buffer.from(signature, 'base64url'))) {
            throw new Error('playback_canary_signing_key_invalid');
        }
    } catch {
        throw new Error('playback_canary_signing_key_invalid');
    }
}

function temporaryWrongKey() {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    return {
        privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        publicKey: Buffer.from(pair.publicKey.export({ type: 'spki', format: 'pem' })).toString('base64'),
    };
}

async function providerJson(apiKey, path, fetchImpl) {
    const response = await fetchImpl(`${LIVEPEER_API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
    });
    let body;
    try {
        body = await response.json();
    } catch {
        throw new Error(`playback_canary_provider_json_${response.status}`);
    }
    if (!response.ok || !body || typeof body !== 'object') {
        throw new Error(`playback_canary_provider_read_${response.status}`);
    }
    return body;
}

function requireReadyAsset(asset, expected) {
    const creator = asset?.creatorId;
    if (asset?.id !== expected.assetId
        || asset?.playbackId !== expected.playbackId
        || asset?.projectId !== expected.projectId
        || asset?.name !== `youtick-paid-media-canary-${expected.correlationId}`
        || creator?.type !== 'unverified'
        || creator?.value !== expected.correlationId) {
        throw new Error('playback_canary_asset_identity_mismatch');
    }
    if (asset?.playbackPolicy?.type !== 'jwt'
        || asset?.status?.phase !== 'ready'
        || !Number.isSafeInteger(asset?.size)
        || asset.size !== expected.sourceBytes
        || typeof asset?.videoSpec?.duration !== 'number'
        || !Number.isFinite(asset.videoSpec.duration)
        || asset.videoSpec.duration <= 0) {
        throw new Error('playback_canary_asset_state_mismatch');
    }
}

function validPlaybackUrl(value) {
    if (typeof value !== 'string') return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && !url.port
            && !url.username
            && !url.password
            && url.pathname.length > 1
            && (url.hostname === 'playback.livepeer.studio'
                || url.hostname === 'livepeercdn.com'
                || url.hostname === 'livepeercdn.studio'
                || url.hostname === 'asset-cdn.lp-playback.com'
                || url.hostname.endsWith('.lp-playback.studio'));
    } catch {
        return false;
    }
}

function canonicalHlsUrl(playbackId) {
    return `https://playback.livepeer.studio/asset/hls/${encodeURIComponent(playbackId)}/index.m3u8`;
}

function playbackUrls(asset, playback, playbackId) {
    const sources = Array.isArray(playback?.meta?.source) ? playback.meta.source : [];
    const sourceHls = [...new Set(sources
        .filter((source) => source?.type === LIVEPEER_HLS_SOURCE_TYPE)
        .map((source) => source?.url))];
    const mp4Sources = sources.filter((source) => source?.type === LIVEPEER_MP4_SOURCE_TYPE);
    const mp4 = [...new Set(mp4Sources
        .map((source) => source?.url))];
    const vtt = [...new Set(sources
        .filter((source) => source?.type === LIVEPEER_VTT_SOURCE_TYPE)
        .map((source) => source?.url))];
    if (playback?.type !== 'vod'
        || playback?.meta?.playbackPolicy?.type !== 'jwt'
        || sources.length > MAX_PROVIDER_PLAYBACK_OUTPUTS
        || sourceHls.length === 0
        || mp4.length === 0
        || !mp4Sources.some((source) => (
            source?.width === 1280
            && source?.height === 720
            && typeof source?.bitrate === 'number'
            && source.bitrate > 0
        ))
        || sources.some((source) => (
            source?.type !== LIVEPEER_HLS_SOURCE_TYPE
            && source?.type !== LIVEPEER_MP4_SOURCE_TYPE
            && source?.type !== LIVEPEER_VTT_SOURCE_TYPE
        ))
        || sourceHls.some((url) => !validPlaybackUrl(url))
        || mp4.some((url) => !validPlaybackUrl(url))
        || vtt.some((url) => !validPlaybackUrl(url))
        || !validPlaybackUrl(asset?.downloadUrl)) {
        throw new Error('playback_canary_outputs_missing');
    }
    return {
        hls: canonicalHlsUrl(playbackId),
        source_hls: sourceHls,
        mp4,
        vtt,
        download: asset.downloadUrl,
    };
}

async function waitForReady(apiKey, expected, fetchImpl, sleep, attempts, delayMs) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const asset = await providerJson(apiKey, `/asset/${encodeURIComponent(expected.assetId)}`, fetchImpl);
        if (asset.status?.phase === 'ready') {
            requireReadyAsset(asset, expected);
            try {
                const playback = await providerJson(
                    apiKey,
                    `/playback/${encodeURIComponent(expected.playbackId)}`,
                    fetchImpl,
                );
                return {
                    asset,
                    playback,
                    urls: playbackUrls(asset, playback, expected.playbackId),
                    attempts: attempt,
                };
            } catch (error) {
                if (attempt === attempts || error.message !== 'playback_canary_provider_read_404') throw error;
            }
        }
        if (attempt < attempts) await sleep(delayMs);
    }
    throw new Error('playback_canary_ready_timeout');
}

async function probe(url, token, fetchImpl) {
    return fetchImpl(url, {
        headers: token ? { 'Livepeer-Jwt': token } : {},
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
    });
}

function hlsUri(line) {
    return /(?:^|[:,])URI="([^"]+)"/.exec(line)?.[1] ?? null;
}

function hlsReferences(lines) {
    const references = [];
    let unrecognizedUri = false;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.startsWith('#EXT-X-STREAM-INF:') || line.startsWith('#EXTINF:')) {
            const next = lines[index + 1];
            if (next && !next.startsWith('#')) {
                references.push({
                    kind: line.startsWith('#EXT-X-STREAM-INF:') ? 'variant' : 'segment',
                    value: next,
                });
            }
        }
        if (line.startsWith('#EXT-X-I-FRAME-STREAM-INF:') || line.startsWith('#EXT-X-PART:')) {
            const uri = hlsUri(line);
            if (uri) {
                references.push({
                    kind: line.startsWith('#EXT-X-I-FRAME-STREAM-INF:') ? 'variant' : 'segment',
                    value: uri,
                });
            }
        } else if (hlsUri(line)) {
            unrecognizedUri = true;
        }
    }
    return { references, unrecognizedUri };
}

function hlsManifest(body) {
    const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines[0] !== '#EXTM3U') return { kind: 'unknown', references: [] };
    const { references, unrecognizedUri } = hlsReferences(lines);
    const hasUri = lines.some((line) => !line.startsWith('#') || hlsUri(line));
    const error = lines.some((line) => line === '#EXT-X-ERROR' || line.startsWith('#EXT-X-ERROR:'));
    if (error && references.length === 0 && !hasUri) return { kind: 'error', references: [] };
    if (unrecognizedUri) return { kind: 'unknown', references };
    return { kind: references.length > 0 ? 'playable' : 'unknown', references };
}

function hlsReferenceUrl(parentUrl, reference) {
    try {
        const url = new URL(reference, parentUrl);
        if (!validPlaybackUrl(url.toString())) throw new Error('invalid');
        return url.toString();
    } catch {
        throw new Error('playback_canary_hls_reference_invalid');
    }
}

function vttReferences(body) {
    const lines = body.split(/\r?\n/).map((line) => line.trim());
    if (lines[0] !== 'WEBVTT') return null;
    const references = [];
    for (let index = 1; index < lines.length; index += 1) {
        if (!/^(?:(?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+(?:(?:\d{2}:)?\d{2}:\d{2}\.\d{3})(?:\s+.*)?$/.test(lines[index])) {
            continue;
        }
        const cue = [];
        while (index + 1 < lines.length && lines[index + 1]) {
            index += 1;
            cue.push(lines[index]);
        }
        if (cue.length !== 1) return null;
        references.push(cue[0]);
    }
    return references;
}

function vttReferenceUrl(parentUrl, reference) {
    try {
        const url = new URL(reference, parentUrl);
        if (!validPlaybackUrl(url.toString())) throw new Error('invalid');
        return url.toString();
    } catch {
        throw new Error('playback_canary_vtt_reference_invalid');
    }
}

async function requireHlsDenied(scenario, url, token, fetchImpl) {
    const response = await probe(url, token, fetchImpl);
    if ([401, 403].includes(response.status)) return { top: { status: response.status } };
    if (response.status !== 200) {
        throw new Error(`playback_canary_expected_denial_${scenario}_hls_${response.status}`);
    }
    const manifest = hlsManifest(await response.text());
    const top = { status: 200, manifest: manifest.kind };
    if (manifest.kind === 'error') {
        return { top };
    }
    if (manifest.kind !== 'playable' || manifest.references.length === 0) {
        throw new Error(`playback_canary_expected_denial_${scenario}_hls_${response.status}`);
    }
    if (manifest.references.length > MAX_HLS_REFERENCE_PROBES) {
        throw new Error('playback_canary_hls_reference_limit');
    }
    let first;
    for (const reference of manifest.references) {
        const childUrl = hlsReferenceUrl(url, reference.value);
        const child = await probe(childUrl, token, fetchImpl);
        let result = { kind: reference.kind, status: child.status };
        if ([401, 403].includes(child.status)) {
            first ??= result;
            continue;
        }
        if (child.status === 200 && reference.kind === 'variant') {
            const childManifest = hlsManifest(await child.text());
            if (childManifest.kind === 'error') {
                result = { ...result, manifest: 'error' };
                first ??= result;
                continue;
            }
        }
        throw new Error(`playback_canary_expected_denial_${scenario}_hls_${child.status}`);
    }
    return { top: { ...top, references_checked: manifest.references.length }, first };
}

async function requireDenied(scenario, output, url, token, fetchImpl) {
    if (output === 'hls') return requireHlsDenied(scenario, url, token, fetchImpl);
    const response = await probe(url, token, fetchImpl);
    if ([401, 403].includes(response.status)) return response.status;
    throw new Error(`playback_canary_expected_denial_${scenario}_${output}_${response.status}`);
}

async function requirePlayableHls(scenario, url, token, fetchImpl) {
    const response = await probe(url, token, fetchImpl);
    const kind = response.status === 200 ? hlsManifest(await response.text()).kind : 'invalid';
    if (response.status !== 200 || kind !== 'playable') {
        throw new Error(`playback_canary_${scenario}_hls_${response.status}_${kind}`);
    }
    return response.status;
}

async function requireAnonymousOutputsDenied(urls, fetchImpl) {
    const hls = await requireDenied('anonymous', 'hls', urls.hls, '', fetchImpl);
    const sourceHls = await Promise.all(urls.source_hls.map((url) => (
        url === urls.hls
            ? hls
            : requireDenied('anonymous_source', 'hls', url, '', fetchImpl)
    )));
    return {
        hls,
        source_hls: sourceHls,
        mp4: await Promise.all(urls.mp4.map((url) => (
            requireDenied('anonymous', 'mp4', url, '', fetchImpl)
        ))),
        download: await requireDenied('anonymous', 'download', urls.download, '', fetchImpl),
    };
}

async function requireVttThumbnailsDenied(vttUrls, token, fetchImpl) {
    if (vttUrls.length === 0) return null;
    const vtt = [];
    const thumbnails = new Set();
    for (const vttUrl of vttUrls) {
        vtt.push(await requireDenied('anonymous', 'vtt', vttUrl, '', fetchImpl));
        const response = await probe(vttUrl, token, fetchImpl);
        if (response.status !== 200) {
            throw new Error(`playback_canary_correct_vtt_${response.status}`);
        }
        const references = vttReferences(await response.text());
        if (!references) throw new Error('playback_canary_vtt_invalid');
        for (const reference of references) {
            thumbnails.add(vttReferenceUrl(vttUrl, reference));
            if (thumbnails.size > MAX_THUMBNAIL_REFERENCE_PROBES) {
                throw new Error('playback_canary_vtt_reference_limit');
            }
        }
    }
    return {
        vtt,
        vtt_sources_checked: vttUrls.length,
        references_checked: thumbnails.size,
        images: await Promise.all([...thumbnails].map((url) => (
            requireDenied('anonymous', 'thumbnail', url, '', fetchImpl)
        ))),
    };
}

async function terminateTusResource(uploadUrl, fetchImpl, sleep) {
    const deleted = await fetchImpl(uploadUrl, {
        method: 'DELETE',
        headers: { 'Tus-Resumable': '1.0.0' },
        signal: AbortSignal.timeout(15_000),
    });
    if (deleted.status !== 204) throw new Error(`playback_canary_tus_delete_${deleted.status}`);
    let head;
    for (let attempt = 0; attempt < TUS_DELETE_VISIBLE_RETRIES; attempt += 1) {
        head = await fetchImpl(uploadUrl, {
            method: 'HEAD',
            headers: { 'Tus-Resumable': '1.0.0' },
            signal: AbortSignal.timeout(15_000),
        });
        if ([404, 410].includes(head.status)) {
            return { delete_status: deleted.status, post_delete_status: head.status };
        }
        if (attempt < TUS_DELETE_VISIBLE_RETRIES - 1) await sleep(1_000);
    }
    throw new Error(`playback_canary_tus_still_live_${head.status}`);
}

async function listAssets(apiKey, fetchImpl) {
    const response = await fetchImpl(`${LIVEPEER_API_BASE}/asset`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
    });
    let body;
    try {
        body = await response.json();
    } catch {
        throw new Error(`playback_canary_inventory_json_${response.status}`);
    }
    const assets = Array.isArray(body) ? body : body?.assets;
    if (!response.ok || !Array.isArray(assets)) {
        throw new Error(`playback_canary_inventory_read_${response.status}`);
    }
    return assets;
}

async function findCanaryAsset(apiKey, correlationId, fetchImpl) {
    const matches = (await listAssets(apiKey, fetchImpl)).filter((asset) => (
        asset?.name === `youtick-paid-media-canary-${correlationId}`
        && asset?.creatorId?.type === 'unverified'
        && asset.creatorId.value === correlationId
        && typeof asset.id === 'string'
    ));
    if (matches.length > 1) throw new Error('playback_canary_create_ambiguous');
    return matches[0]?.id;
}

function inventoryReceipt(assets) {
    const hashes = assets.map((asset) => {
        if (typeof asset?.id !== 'string') throw new Error('playback_canary_inventory_invalid');
        return sha256(asset.id);
    }).sort();
    return { count: hashes.length, id_sha256: hashes };
}

async function cleanupCanary({
    apiKey,
    assetId,
    inventoryBefore,
    tusCreateAttempted,
    uploadUrl,
    fetchImpl,
    sleep,
}) {
    const cleanup = { inventory_before: inventoryReceipt(inventoryBefore) };
    const errors = [];
    let tusCleanupProven = !tusCreateAttempted;
    if (tusCreateAttempted && !uploadUrl) {
        errors.push(new Error('playback_canary_tus_cleanup_unknown'));
    } else if (uploadUrl) {
        try {
            cleanup.tus = await terminateTusResource(uploadUrl, fetchImpl, sleep);
            tusCleanupProven = true;
        } catch (error) {
            errors.push(error);
        }
    }
    if (assetId && !tusCleanupProven) {
        cleanup.asset_delete_skipped = 'tus_cleanup_unproven';
        try {
            cleanup.inventory_after = inventoryReceipt(await listAssets(apiKey, fetchImpl));
            cleanup.inventory_restored = false;
        } catch (error) {
            errors.push(error);
        }
        return { cleanup, errors };
    }
    if (assetId) {
        try {
            cleanup.asset_delete_status = await deleteAsset(apiKey, assetId, fetchImpl);
        } catch (error) {
            errors.push(error);
        }

        for (let attempt = 0; attempt < ASSET_DELETE_VISIBLE_RETRIES; attempt += 1) {
            try {
                cleanup.asset_post_delete_status = await getAssetStatus(apiKey, assetId, fetchImpl);
            } catch (error) {
                errors.push(error);
                break;
            }
            if ([404, 410].includes(cleanup.asset_post_delete_status)) break;
            if (attempt < ASSET_DELETE_VISIBLE_RETRIES - 1) await sleep(1_000);
        }
        if (![404, 410].includes(cleanup.asset_post_delete_status)) {
            errors.push(new Error(`playback_canary_asset_still_live_${cleanup.asset_post_delete_status}`));
        }

    }
    try {
        cleanup.inventory_after = inventoryReceipt(await listAssets(apiKey, fetchImpl));
        cleanup.inventory_restored = JSON.stringify(cleanup.inventory_after.id_sha256)
            === JSON.stringify(cleanup.inventory_before.id_sha256);
        if (!cleanup.inventory_restored) errors.push(new Error('playback_canary_inventory_not_restored'));
    } catch (error) {
        errors.push(error);
    }
    return { cleanup, errors };
}

function browserEvidence(value) {
    if (!value || typeof value !== 'object' || value.matrix_proven !== true) {
        throw new Error('playback_canary_browser_matrix_failed');
    }
    const evidence = {};
    for (const browser of ['chrome', 'edge']) {
        const result = value[browser];
        if (!result || typeof result !== 'object'
            || result.initial_played !== true
            || result.refreshed_played !== true
            || !Number.isSafeInteger(result.initial_hls_header_requests)
            || result.initial_hls_header_requests < 1
            || !Number.isSafeInteger(result.refreshed_hls_header_requests)
            || result.refreshed_hls_header_requests < 1
            || result.anonymous_denied !== true
            || result.anonymous_hls_header_requests !== 0
            || result.malformed_denied !== true
            || !Number.isSafeInteger(result.malformed_hls_header_requests)
            || result.malformed_hls_header_requests < 1
            || result.wrong_key_denied !== true
            || !Number.isSafeInteger(result.wrong_key_hls_header_requests)
            || result.wrong_key_hls_header_requests < 1
            || result.wrong_subject_denied !== true
            || !Number.isSafeInteger(result.wrong_subject_hls_header_requests)
            || result.wrong_subject_hls_header_requests < 1
            || result.expired_denied !== true
            || !Number.isSafeInteger(result.expired_hls_header_requests)
            || result.expired_hls_header_requests < 1
            || result.persistent_storage_empty !== true) {
            throw new Error('playback_canary_browser_matrix_failed');
        }
        evidence[browser] = {
            initial_played: true,
            refreshed_played: true,
            initial_hls_header_requests: result.initial_hls_header_requests,
            refreshed_hls_header_requests: result.refreshed_hls_header_requests,
            anonymous_denied: true,
            anonymous_hls_header_requests: 0,
            malformed_denied: true,
            malformed_hls_header_requests: result.malformed_hls_header_requests,
            wrong_key_denied: true,
            wrong_key_hls_header_requests: result.wrong_key_hls_header_requests,
            wrong_subject_denied: true,
            wrong_subject_hls_header_requests: result.wrong_subject_hls_header_requests,
            expired_denied: true,
            expired_hls_header_requests: result.expired_hls_header_requests,
            persistent_storage_empty: true,
        };
    }
    return evidence;
}

function withRecovery(error, recovery) {
    if (!recovery) return error;
    const failure = new AggregateError([error], error instanceof Error ? error.message : 'playback_canary_failed');
    failure.recovery = recovery;
    return failure;
}

export async function runPlaybackCanary({
    apiKey,
    mutationsEnabled,
    privateKey,
    publicKey,
    issuer = 'https://youtick.net',
    fileBytes,
    fetchImpl = fetch,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now = () => Date.now(),
    readyAttempts = READY_ATTEMPTS,
    readyDelayMs = READY_DELAY_MS,
    correlationId = randomUUID(),
    browserProbe,
}) {
    if (!mutationsEnabled) throw new Error('playback_canary_mutations_disabled');
    requireCanarySource(fileBytes);
    requireIssuer(issuer);
    verifySigningKeyPair(privateKey, publicKey, issuer);

    let assetId;
    let uploadUrl;
    let tusCreateAttempted = false;
    let tusVersionSource;
    let receipt;
    let runError;
    let inventoryBefore = [];
    try {
        inventoryBefore = await listAssets(apiKey, fetchImpl);
        let create;
        try {
            create = await requestUpload(apiKey, correlationId, fetchImpl);
        } catch (error) {
            try {
                assetId = await findCanaryAsset(apiKey, correlationId, fetchImpl);
            } catch (reconciliationError) {
                throw new AggregateError([error, reconciliationError], 'playback_canary_create_reconciliation_failed');
            }
            throw error;
        }
        assetId = create.body.asset.id;
        const tusCapabilities = await inspectTusCapabilities(create.body.tusEndpoint, fetchImpl);
        tusVersionSource = tusCapabilities.versionSource;
        tusCreateAttempted = true;
        uploadUrl = await createTusResource(create.body.tusEndpoint, fileBytes.byteLength, fetchImpl);
        const upload = await uploadTusSequential(uploadUrl, fileBytes, fetchImpl, sleep);

        const ready = await waitForReady(apiKey, {
            assetId,
            playbackId: create.body.asset.playbackId,
            projectId: create.body.asset.projectId,
            correlationId,
            sourceBytes: fileBytes.byteLength,
        }, fetchImpl, sleep, readyAttempts, readyDelayMs);
        const urls = ready.urls;
        const issuedAt = Math.floor(now() / 1_000);
        const correctToken = signJwt({
            privateKey,
            publicKey,
            issuer,
            playbackId: create.body.asset.playbackId,
            issuedAt,
            expiresAt: issuedAt + 120,
        });
        const wrongKey = temporaryWrongKey();
        const wrongKeyToken = signJwt({
            privateKey: wrongKey.privateKey,
            publicKey: wrongKey.publicKey,
            issuer,
            playbackId: create.body.asset.playbackId,
            issuedAt,
            expiresAt: issuedAt + 120,
        });
        const wrongSubjectToken = signJwt({
            privateKey,
            publicKey,
            issuer,
            playbackId: 'wrong-playback-id',
            issuedAt,
            expiresAt: issuedAt + 120,
        });
        const expiredToken = signJwt({
            privateKey,
            publicKey,
            issuer,
            playbackId: create.body.asset.playbackId,
            issuedAt: issuedAt - 121,
            expiresAt: issuedAt - 1,
        });

        const thumbnails = await requireVttThumbnailsDenied(urls.vtt, correctToken, fetchImpl);
        const denied = {
            anonymous: await requireAnonymousOutputsDenied(urls, fetchImpl),
            malformed: { hls: await requireDenied('malformed', 'hls', urls.hls, 'malformed.jwt', fetchImpl) },
            wrong_key: { hls: await requireDenied('wrong_key', 'hls', urls.hls, wrongKeyToken, fetchImpl) },
            wrong_subject: { hls: await requireDenied('wrong_subject', 'hls', urls.hls, wrongSubjectToken, fetchImpl) },
            expired: { hls: await requireDenied('expired', 'hls', urls.hls, expiredToken, fetchImpl) },
        };
        if (thumbnails) denied.thumbnails = thumbnails;
        const hls = { correct: await requirePlayableHls('correct', urls.hls, correctToken, fetchImpl) };
        await sleep(1_100);
        const refreshedAt = Math.floor(now() / 1_000);
        const refreshedToken = signJwt({
            privateKey,
            publicKey,
            issuer,
            playbackId: create.body.asset.playbackId,
            issuedAt: refreshedAt,
            expiresAt: refreshedAt + 120,
        });
        hls.refresh = await requirePlayableHls('refresh', urls.hls, refreshedToken, fetchImpl);

        const browser = browserProbe
            ? browserEvidence(await browserProbe({
                hlsUrl: urls.hls,
                issueToken: (kind = 'correct') => {
                    if (kind === 'malformed') return 'malformed.jwt';
                    if (kind === 'wrong_key') return wrongKeyToken;
                    if (kind === 'wrong_subject') return wrongSubjectToken;
                    if (kind === 'expired') return expiredToken;
                    if (kind !== 'correct') throw new Error('playback_canary_browser_token_kind_invalid');
                    const browserIssuedAt = Math.floor(now() / 1_000);
                    return signJwt({
                        privateKey,
                        publicKey,
                        issuer,
                        playbackId: create.body.asset.playbackId,
                        issuedAt: browserIssuedAt,
                        expiresAt: browserIssuedAt + 120,
                    });
                },
            }))
            : null;

        receipt = {
            schema: 'youtick.livepeer-playback-canary.v1',
            correlation_id: correlationId,
            source_bytes: fileBytes.byteLength,
            source_sha256: sha256(fileBytes),
            duration_seconds: ready.asset.videoSpec.duration,
            create_status: create.status,
            ready_attempts: ready.attempts,
            playback_policy: create.body.asset.playbackPolicy.type,
            tus_version_source: tusVersionSource,
            tus_termination_advertised: tusCapabilities.terminationAdvertised,
            tus_concatenation_advertised: tusCapabilities.concatenationAdvertised,
            tus_max_size: tusCapabilities.maxSize,
            chunk_bytes: TUS_CHUNK_BYTES,
            parallel_uploads: 1,
            upload: {
                initial_offset: upload.initial.offset,
                upload_length: upload.initial.length,
                chunks: upload.chunks,
                pause_resume_offset: upload.pauseResumeOffset,
                final_offset: upload.chunks.at(-1)?.head_offset,
            },
            outputs: {
                hls_count: ready.urls.source_hls.length,
                mp4_count: ready.urls.mp4.length,
                vtt_count: ready.urls.vtt.length,
                canonical_720p_mp4: true,
            },
            hls,
            denied,
            asset_id_sha256: sha256(assetId),
            playback_id_sha256: sha256(create.body.asset.playbackId),
            project_id_sha256: sha256(create.body.asset.projectId),
            browser_matrix_proven: browser !== null,
            browser,
        };
    } catch (error) {
        runError = error;
    }

    const { cleanup, errors } = await cleanupCanary({
        apiKey,
        assetId,
        inventoryBefore,
        tusCreateAttempted,
        uploadUrl,
        fetchImpl,
        sleep,
    });
    const recovery = cleanup.asset_delete_skipped ? {
        asset_cleanup: cleanup.asset_delete_skipped,
        correlation_id: correlationId,
    } : null;
    if (runError && errors.length > 0) {
        throw withRecovery(
            new AggregateError([runError, ...errors], 'playback_canary_failed_with_cleanup_failure'),
            recovery,
        );
    }
    if (errors.length > 0) {
        throw withRecovery(new AggregateError(errors, 'playback_canary_cleanup_failure'), recovery);
    }
    if (runError) throw withRecovery(runError, recovery);
    return { ...receipt, cleanup };
}

if (import.meta.main) {
    try {
        const filePath = process.argv[2];
        if (!filePath) {
            throw new Error('usage: npm run canary:playback -- /path/to/exact-80mib-valid.mp4');
        }
        const fileBytes = new Uint8Array(await readFile(filePath));
        const localSource = requireLocalCanaryMp4(filePath, fileBytes);
        const receipt = await runPlaybackCanary({
            apiKey: process.env.LIVEPEER_API_KEY,
            mutationsEnabled: process.env.LIVEPEER_PLAYBACK_CANARY_MUTATIONS === 'true',
            privateKey: process.env.LIVEPEER_PLAYBACK_CANARY_PRIVATE_KEY,
            publicKey: process.env.LIVEPEER_PLAYBACK_CANARY_PUBLIC_KEY,
            issuer: process.env.LIVEPEER_PLAYBACK_CANARY_ISSUER || 'https://youtick.net',
            fileBytes,
        });
        process.stdout.write(`${JSON.stringify({ ...receipt, local_source: localSource }, null, 2)}\n`);
    } catch (error) {
        const recovery = error && typeof error === 'object' ? error.recovery : undefined;
        if (recovery) process.stderr.write(`${JSON.stringify({ recovery })}\n`);
        throw error;
    }
}
