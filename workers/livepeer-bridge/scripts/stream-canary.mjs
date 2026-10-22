// Cloudflare Stream canaries for the Stream-only V2 Bridge (gate M2-G6; run live in M4-G2, owner only).
//
// Each subcommand checks one provider behaviour the Bridge relies on, against the media account's Stream
// library, and writes a scrubbed receipt (schema youtick.stream-canary.v1). Credentials come only from
// STREAM_ACCOUNT_ID and STREAM_API_TOKEN in the process environment; every live run also needs
// STREAM_CANARY_MUTATIONS=true. The API token, account id, customer code, video and key ids, private keys
// and minted tokens never reach a file. Videos and keys a run creates are deleted before it exits.
// --dry-run prints the request plan without network. Never run from CI or an agent session.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
    REPO_ROOT,
    createOutput,
    createScrubber,
    createStreamApi,
    credentialUrl,
    encodeUploadMetadata,
    isInside,
    loadSigningKey,
    mintToken,
    parseMasterPlaylist,
    parseMediaPlaylist,
    pemFormat,
    realpathExisting,
} from './stream-probe.mjs';

export const SCHEMA = 'youtick.stream-canary.v1';
export const MUTATION_GATE = 'STREAM_CANARY_MUTATIONS';
export const DESCRIPTOR_PATH = resolve(REPO_ROOT, 'protocol/paid-media-v1/stream-profile.json');
export const UPLOAD_HOST = 'upload.cloudflarestream.com';
export const DEFAULT_TOKEN_TTL_SECONDS = 180; // the Bridge's V3 viewer token lifetime (OD4)
export const DEFAULT_RESERVATION_SECONDS = 600;
export const DEFAULT_TIMEOUT_MINUTES = 10;
const CANARY_MAX_DURATION_SECONDS = 60; // the non-reservation canaries reserve one minute at most
const NON_VIDEO_BYTES = 64 * 1024;
const UID = /^[0-9a-f]{32}$/;
const CUSTOMER_CODE = /^[a-z0-9]{8,64}$/;
const iso = (ms) => new Date(ms).toISOString();

/**
 * Expected status per surface and credential, verbatim from the 2026-10-21 sandbox spike (docs report
 * §9.3). `null` = not probed: a wrong-sub iframe answers a 200 page shell and a wrong-sub watch page 500,
 * so neither says anything about access. A valid viewer token never carries `downloadable`, so the MP4
 * download stays denied (403) even for it.
 */
export const DENIAL_MATRIX = Object.freeze({
    hls_master: Object.freeze({ path: 'manifest/video.m3u8', none: 401, forged: 401, expired: 401, wrong_sub: 404, valid: 200 }),
    dash_manifest: Object.freeze({ path: 'manifest/video.mpd', none: 401, forged: 401, expired: 401, wrong_sub: 404, valid: 200 }),
    thumbnail: Object.freeze({ path: 'thumbnails/thumbnail.jpg', none: 401, forged: 401, expired: 401, wrong_sub: 404, valid: 200 }),
    watch: Object.freeze({ path: 'watch', none: 401, forged: 401, expired: 401, wrong_sub: null, valid: 200 }),
    iframe: Object.freeze({ path: 'iframe', none: 401, forged: 401, expired: 401, wrong_sub: null, valid: 200 }),
    download: Object.freeze({ path: 'downloads/default.mp4', none: 401, forged: 401, expired: 401, wrong_sub: 404, valid: 403 }),
});
/** The first variant playlist of the valid master, probed with the same credentials. */
export const VARIANT_EXPECTED = Object.freeze({ none: 401, forged: 401, expired: 401, wrong_sub: 404, valid: 200 });
export const CREDENTIALS = Object.freeze(['none', 'forged', 'expired', 'wrong_sub', 'valid']);

const allowed = (status) => status >= 200 && status < 400;

// ---------------------------------------------------------------- receipts

function startReceipt(ctx, subcommand) {
    ctx.receipt = {
        schema: SCHEMA,
        subcommand,
        status: 'RUNNING',
        evidence_class: 'PROVIDER (Cloudflare Stream, V2 testnet media account)',
        script: 'workers/livepeer-bridge/scripts/stream-canary.mjs',
        started_at: iso(ctx.now()),
        checks: [],
    };
    return ctx.receipt;
}

function check(ctx, name, pass, detail = {}) {
    ctx.receipt.checks.push({ name, pass: Boolean(pass), ...detail });
    ctx.log(`${pass ? 'ok  ' : 'FAIL'} ${name}`);
    return Boolean(pass);
}

function verdict(receipt) {
    return receipt.checks.length > 0 && receipt.checks.every((entry) => entry.pass) ? 'PASS' : 'FAIL';
}

async function writeReceipt(ctx) {
    ctx.receipt.finished_at = iso(ctx.now());
    const stamp = ctx.receipt.started_at.replace(/[:.]/g, '-');
    const path = await ctx.out.json(`${ctx.receipt.subcommand}/receipt-${stamp}.json`, ctx.receipt);
    ctx.log(`receipt: ${path}`);
}

// ---------------------------------------------------------------- provider helpers

function registerUid(ctx, uid, label = 'UID') {
    ctx.uidCount = (ctx.uidCount ?? 0) + 1;
    ctx.scrubber.register(uid, `<${label}_${ctx.uidCount}>`);
}

function rfc3339(ms) {
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function createVideo(ctx, { name, length, maxDuration = CANARY_MAX_DURATION_SECONDS, expiryMinutes = 30 }) {
    const metadata = [
        ['maxDurationSeconds', String(maxDuration)],
        ['requiresignedurls', null],
        ['name', name],
        ['expiry', rfc3339(ctx.now() + expiryMinutes * 60_000)],
    ];
    const response = await ctx.api.createUpload(length, encodeUploadMetadata(metadata));
    const uid = response.headers.get('stream-media-id');
    // Track the reservation before anything else can fail, so cleanup deletes it.
    if (response.status >= 200 && response.status < 300 && uid && UID.test(uid)) {
        registerUid(ctx, uid);
        ctx.created.videos.add(uid);
    }
    const location = response.headers.get('location');
    const uploadUrl = location ? new URL(location, 'https://api.cloudflare.com').toString() : null;
    if (location) {
        ctx.scrubber.register(location, '<TUS_URL>');
        ctx.scrubber.register(uploadUrl, '<TUS_URL>');
    }
    const host = uploadUrl ? new URL(uploadUrl) : null;
    return {
        status: response.status,
        uid: uid && UID.test(uid) ? uid : null,
        uploadUrl,
        uploadHostPinned: Boolean(host && host.protocol === 'https:' && host.hostname === UPLOAD_HOST && host.port === ''),
        errorCode: response.body?.errors?.[0]?.code ?? null,
    };
}

async function tusHead(ctx, uploadUrl) {
    let response = await ctx.api.tus(uploadUrl, { method: 'HEAD' });
    if (response.status === 401 || response.status === 403) response = await ctx.api.tus(uploadUrl, { method: 'HEAD', withAuth: true });
    const number = (name) => {
        const value = response.headers.get(name);
        return value !== null && /^[0-9]+$/.test(value) ? Number(value) : null;
    };
    return { status: response.status, offset: number('upload-offset'), length: number('upload-length') };
}

async function deleteVideo(ctx, uid) {
    const response = await ctx.api.deleteVideo(uid);
    if ([200, 204, 404].includes(response.status)) ctx.created.videos.delete(uid);
    return response.status;
}

async function poll(ctx, read, done, { timeoutMs, intervalMs = 5_000 }) {
    const started = ctx.now();
    for (;;) {
        const value = await read();
        if (done(value)) return { value, elapsedMs: ctx.now() - started, timedOut: false };
        if (ctx.now() - started >= timeoutMs) return { value, elapsedMs: ctx.now() - started, timedOut: true };
        await ctx.sleep(intervalMs);
    }
}

async function storageMinutes(ctx) {
    const response = await ctx.api.storageUsage();
    const result = response.body?.result;
    const used = Number(result?.totalStorageMinutes);
    return {
        status: response.status,
        minutes: response.status === 200 && Number.isFinite(used) ? used : null,
        limit: Number.isFinite(Number(result?.totalStorageMinutesLimit)) ? Number(result.totalStorageMinutesLimit) : null,
        videoCount: Number.isFinite(Number(result?.videoCount)) ? Number(result.videoCount) : null,
    };
}

async function readyVideo(ctx, uid) {
    const response = await ctx.api.getVideo(uid);
    const video = response.body?.result;
    if (response.status !== 200 || !video) throw new Error(`stream_video_unreadable_${response.status}`);
    if (video.readyToStream !== true) throw new Error('stream_video_not_ready');
    const match = String(video.playback?.hls ?? '').match(/^https:\/\/customer-([a-z0-9]+)\.cloudflarestream\.com\//);
    if (!match || !CUSTOMER_CODE.test(match[1])) throw new Error('stream_customer_code_unreadable');
    ctx.scrubber.register(match[1], '<CUSTOMER_CODE>');
    return { video, customerCode: match[1] };
}

function surfaceUrl(customerCode, credential, path) {
    return `https://customer-${customerCode}.cloudflarestream.com/${credential}/${path}`;
}

async function signingKeyFromFile(ctx) {
    const file = ctx.opts['signing-key-file'];
    if (!file) throw new Error('option_signing-key-file_required');
    const target = resolve(file);
    if (isInside(realpathExisting(target), realpathExisting(REPO_ROOT))) throw new Error('signing_key_file_must_be_outside_the_repository');
    const raw = JSON.parse(await readFile(target, 'utf8'));
    const key = loadSigningKey(raw, ctx.scrubber);
    ctx.scrubber.register(key.id, '<KEY_ID>');
    return key;
}

/** A key of the right `kid` that Stream never saw: the forged credential. */
function forgedKey(kid) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    return { id: kid, keyObject: privateKey };
}

function tokenSet(ctx, key, uid, otherUid) {
    const nowMs = ctx.now();
    const ttlSeconds = ctx.tokenTtl;
    return {
        none: uid,
        forged: mintToken(forgedKey(key.id), { uid, ttlSeconds, nowMs }).token,
        expired: mintToken(key, { uid, ttlSeconds: -60, nowMs, claims: { nbf: Math.floor(nowMs / 1000) - 600 } }).token,
        wrong_sub: mintToken(key, { uid: otherUid, ttlSeconds, nowMs }).token,
        valid: mintToken(key, { uid, ttlSeconds, nowMs }).token,
    };
}

// ---------------------------------------------------------------- subcommands

async function cmdProvider(ctx) {
    const receipt = startReceipt(ctx, 'provider');
    const created = await createVideo(ctx, { name: `youtick-canary-provider-${ctx.now()}`, length: 1_048_576 });
    receipt.create = { status: created.status, error_code: created.errorCode };
    if (!check(ctx, 'create_201_with_uid', created.status === 201 && created.uid, { status: created.status })) return;
    // Never send a HEAD (or bytes) to an upload URL off the pinned host; cleanup still deletes the video.
    if (!check(ctx, 'upload_url_host_pinned', created.uploadHostPinned)) return;
    const head = await tusHead(ctx, created.uploadUrl);
    receipt.head = head;
    check(ctx, 'head_offset_0_of_declared_length', head.status === 200 && head.offset === 0 && head.length === 1_048_576, head);
    const deleted = await deleteVideo(ctx, created.uid);
    check(ctx, 'delete_200', deleted === 200, { status: deleted });
    const gone = await poll(ctx, () => ctx.api.getVideo(created.uid), (response) => response.status === 404,
        { timeoutMs: 60_000, intervalMs: 5_000 });
    check(ctx, 'get_after_delete_404', gone.value.status === 404, { status: gone.value.status, elapsed_ms: gone.elapsedMs });
}

async function cmdReservation(ctx) {
    const receipt = startReceipt(ctx, 'reservation');
    const seconds = ctx.reservationSeconds;
    const expectedMinutes = seconds / 60;
    const before = await storageMinutes(ctx);
    receipt.storage_before = before;
    if (!check(ctx, 'storage_usage_readable', before.minutes !== null, { status: before.status })) return;
    if (!check(ctx, 'headroom_for_reservation', before.limit === null || before.limit - before.minutes >= expectedMinutes, { limit: before.limit })) return;
    const created = await createVideo(ctx, { name: `youtick-canary-reservation-${ctx.now()}`, length: 1_048_576, maxDuration: seconds });
    if (!check(ctx, 'reservation_created', created.status === 201 && created.uid, { status: created.status, error_code: created.errorCode })) return;
    const timeoutMs = ctx.timeoutMs;
    const held = await poll(ctx, () => storageMinutes(ctx), (usage) => usage.minutes !== null && usage.minutes - before.minutes >= expectedMinutes,
        { timeoutMs, intervalMs: 5_000 });
    receipt.reserved = { delta_minutes: held.value.minutes === null ? null : held.value.minutes - before.minutes, elapsed_ms: held.elapsedMs };
    check(ctx, 'reservation_counted', !held.timedOut, { expected_delta_minutes: expectedMinutes, ...receipt.reserved });
    const deleted = await deleteVideo(ctx, created.uid);
    check(ctx, 'abandoned_reservation_deleted', deleted === 200, { status: deleted });
    const released = await poll(ctx, () => storageMinutes(ctx), (usage) => usage.minutes !== null && usage.minutes <= before.minutes,
        { timeoutMs, intervalMs: 5_000 });
    receipt.released = { delta_minutes: released.value.minutes === null ? null : released.value.minutes - before.minutes, elapsed_ms: released.elapsedMs };
    check(ctx, 'reservation_released', !released.timedOut, receipt.released);
}

async function probeSurface(ctx, url) {
    const response = await ctx.api.playback(url, { binary: true });
    return response.status;
}

async function cmdPlayback(ctx) {
    const receipt = startReceipt(ctx, 'playback');
    const uid = requireUid(ctx, 'uid');
    const otherUid = ctx.opts['other-uid'] ? requireUid(ctx, 'other-uid') : randomBytes(16).toString('hex');
    if (otherUid === uid) throw new Error('option_other-uid_must_differ');
    if (!ctx.opts['other-uid']) registerUid(ctx, otherUid, 'OTHER_UID');
    receipt.wrong_sub_source = ctx.opts['other-uid'] ? 'another video of the account (--other-uid)' : 'random uid not in the account';
    const key = await signingKeyFromFile(ctx);
    const { customerCode } = await readyVideo(ctx, uid);
    const tokens = tokenSet(ctx, key, uid, otherUid);
    const matrix = {};
    const drift = [];
    let denialsHold = true;
    for (const [surface, expected] of Object.entries(DENIAL_MATRIX)) {
        matrix[surface] = {};
        for (const credential of CREDENTIALS) {
            if (expected[credential] === null) continue;
            const status = await probeSurface(ctx, surfaceUrl(customerCode, tokens[credential], expected.path));
            matrix[surface][credential] = status;
            if (status !== expected[credential]) drift.push({ surface, credential, expected: expected[credential], status });
            if (allowed(status) !== allowed(expected[credential])) denialsHold = false;
        }
    }
    // The first variant playlist (listed by the valid master) under every credential.
    const master = await ctx.api.playback(surfaceUrl(customerCode, tokens.valid, DENIAL_MATRIX.hls_master.path));
    const parsed = master.status === 200 ? parseMasterPlaylist(master.text) : null;
    const variantUri = parsed?.streams?.[0]?.uri ?? null;
    if (!check(ctx, 'master_lists_a_variant', Boolean(variantUri))) return;
    const variantPath = new URL(variantUri, `https://x/${tokens.valid}/manifest/video.m3u8`).pathname.split('/').slice(2).join('/');
    matrix.variant_playlist = {};
    for (const credential of CREDENTIALS) {
        const status = await probeSurface(ctx, surfaceUrl(customerCode, tokens[credential], variantPath));
        matrix.variant_playlist[credential] = status;
        if (status !== VARIANT_EXPECTED[credential]) drift.push({ surface: 'variant_playlist', credential, expected: VARIANT_EXPECTED[credential], status });
        if (allowed(status) !== allowed(VARIANT_EXPECTED[credential])) denialsHold = false;
    }
    // A segment as a player strips it: the query (p, s) removed. The listed p/s URL is never fetched.
    const variant = await ctx.api.playback(surfaceUrl(customerCode, tokens.valid, variantPath));
    const segment = variant.status === 200 ? parseMediaPlaylist(variant.text).segments[0] : null;
    if (check(ctx, 'variant_lists_a_segment', Boolean(segment))) {
        const stripped = new URL(segment, surfaceUrl(customerCode, tokens.valid, variantPath));
        stripped.search = '';
        const status = await probeSurface(ctx, stripped.toString());
        matrix.stripped_query_segment = { none: status };
        check(ctx, 'stripped_query_segment_denied', !allowed(status), { status, expected: 404 });
    }
    receipt.matrix = matrix;
    receipt.status_drift = drift;
    check(ctx, 'denied_surfaces_deny_and_valid_token_plays', denialsHold, { drift_count: drift.length });
}

async function cmdWebhook(ctx) {
    const receipt = startReceipt(ctx, 'webhook');
    const healthUrl = ctx.opts['bridge-health-url'] ? new URL(ctx.opts['bridge-health-url']) : null;
    if (healthUrl && (healthUrl.protocol !== 'https:' || healthUrl.pathname !== '/__health')) throw new Error('option_bridge-health-url_invalid');
    const lastWebhook = async () => {
        const response = await ctx.fetchImpl(healthUrl.toString(), { signal: AbortSignal.timeout(15_000) });
        const body = await response.json().catch(() => null);
        const value = Number(body?.stream?.lastWebhookAtMs);
        return response.status === 200 && Number.isFinite(value) ? value : null;
    };
    const before = healthUrl ? await lastWebhook() : null;
    const created = await createVideo(ctx, { name: `youtick-canary-webhook-${ctx.now()}`, length: NON_VIDEO_BYTES });
    if (!check(ctx, 'create_201_with_uid', created.status === 201 && created.uid, { status: created.status })) return;
    if (!check(ctx, 'upload_url_host_pinned', created.uploadHostPinned)) return;
    const patch = await ctx.api.tus(created.uploadUrl, {
        method: 'PATCH',
        headers: { 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' },
        body: randomBytes(NON_VIDEO_BYTES),
    });
    if (!check(ctx, 'non_video_bytes_uploaded', patch.status === 204, { status: patch.status })) return;
    const errored = await poll(ctx, () => ctx.api.getVideo(created.uid), (response) => response.body?.result?.status?.state === 'error',
        { timeoutMs: ctx.timeoutMs, intervalMs: 5_000 });
    const reason = errored.value.body?.result?.status?.errorReasonCode ?? null;
    receipt.provider_error = { reason_code: reason, elapsed_ms: errored.elapsedMs };
    check(ctx, 'provider_reports_ERR_NON_VIDEO', !errored.timedOut && reason === 'ERR_NON_VIDEO', receipt.provider_error);
    if (healthUrl) {
        const delivered = await poll(ctx, lastWebhook, (value) => value !== null && (before === null || value > before),
            { timeoutMs: ctx.timeoutMs, intervalMs: 10_000 });
        receipt.bridge = { health_read: 'stream.lastWebhookAtMs', advanced: !delivered.timedOut, elapsed_ms: delivered.elapsedMs };
        check(ctx, 'bridge_accepted_signed_delivery', !delivered.timedOut, receipt.bridge);
    } else {
        receipt.bridge = {
            operator_check: 'read the Bridge log (wrangler tail youtick-livepeer-bridge-v2-testnet): one signed Stream error delivery for this run\'s video, answered 202',
        };
    }
    const deleted = await deleteVideo(ctx, created.uid);
    check(ctx, 'video_deleted', [200, 404].includes(deleted), { status: deleted });
    if (!healthUrl && verdict(receipt) === 'PASS') receipt.status = 'OPERATOR_CHECK';
}

async function loadDescriptor(ctx) {
    const path = resolve(ctx.opts.descriptor ?? DESCRIPTOR_PATH);
    let document;
    try {
        document = JSON.parse(await readFile(path, 'utf8'));
    } catch {
        throw new Error('stream_descriptor_unreadable');
    }
    const entry = document?.stream;
    if (!entry || !Array.isArray(entry.profiles)) throw new Error('stream_descriptor_invalid');
    return entry;
}

async function cmdLadder(ctx) {
    const receipt = startReceipt(ctx, 'ladder');
    const descriptor = await loadDescriptor(ctx);
    receipt.descriptor_hash = descriptor.hash ?? null;
    const uid = requireUid(ctx, 'uid');
    const key = await signingKeyFromFile(ctx);
    const { video, customerCode } = await readyVideo(ctx, uid);
    const valid = mintToken(key, { uid, ttlSeconds: ctx.tokenTtl, nowMs: ctx.now() }).token;
    const input = { width: Number(video.input?.width), height: Number(video.input?.height) };
    const shortSide = Math.min(input.width, input.height);
    receipt.input = input;
    receipt.pct_complete = video.status?.pctComplete ?? null;
    const master = await ctx.api.playback(surfaceUrl(customerCode, valid, 'manifest/video.m3u8'));
    if (!check(ctx, 'master_200', master.status === 200, { status: master.status })) return;
    const parsed = parseMasterPlaylist(master.text);
    const renditions = parsed.streams.map((stream) => {
        const [width, height] = String(stream.attributes.RESOLUTION ?? '').split('x').map(Number);
        return { width, height, codecs: stream.attributes.CODECS ?? null, uri: stream.uri };
    });
    receipt.renditions = renditions.map(({ width, height, codecs }) => ({ width, height, codecs }));
    // Expected: every descriptor rung up to the input's short side (portrait labelling is M0-P1 evidence).
    const expected = descriptor.profiles.filter((profile) => profile.height <= shortSide);
    const missing = expected.filter((profile) => !renditions.some((rendition) => Math.min(rendition.width, rendition.height) === profile.height
        && Math.max(rendition.width, rendition.height) === profile.width));
    check(ctx, 'every_expected_rung_listed', expected.length > 0 && missing.length === 0, {
        expected: expected.map((profile) => profile.name), missing: missing.map((profile) => profile.name),
    });
    check(ctx, 'video_codec_h264', renditions.length > 0 && renditions.every((rendition) => String(rendition.codecs).startsWith('avc1')),
        { descriptor_codec: descriptor.codec });
    const playlists = [...renditions.map((rendition) => rendition.uri), ...parsed.media.map((media) => media.URI).filter(Boolean)];
    const variants = [];
    for (const uri of playlists) {
        const path = new URL(uri, `https://x/${valid}/manifest/video.m3u8`).pathname.split('/').slice(2).join('/');
        const response = await ctx.api.playback(surfaceUrl(customerCode, valid, path));
        const media = response.status === 200 ? parseMediaPlaylist(response.text) : null;
        variants.push({ status: response.status, endlist: media?.endlist ?? null, init_segment: Boolean(media?.map_uri), segments: media?.segments.length ?? null });
    }
    receipt.playlists = variants;
    check(ctx, 'every_playlist_complete', variants.length > 0 && variants.every((entry) => entry.status === 200 && entry.endlist === true));
    check(ctx, 'container_fmp4_init_segment', variants.length > 0 && variants.every((entry) => entry.init_segment), { descriptor_container: descriptor.container });
}

async function createKey(ctx, label) {
    const response = await ctx.api.createKey();
    const result = response.body?.result;
    if (typeof result?.pem === 'string') ctx.scrubber.register(result.pem, '<PRIVATE_KEY>');
    if (typeof result?.jwk === 'string') ctx.scrubber.register(result.jwk, '<JWK>');
    if (response.status >= 200 && response.status < 300 && typeof result?.id === 'string') {
        ctx.scrubber.register(result.id, `<${label}_ID>`);
        ctx.created.keys.add(result.id);
    }
    if (response.status !== 200 || typeof result?.id !== 'string' || typeof result?.pem !== 'string') throw new Error(`stream_key_create_failed_${response.status}`);
    const key = loadSigningKey(result, ctx.scrubber);
    return { key, shape: { field_names: Object.keys(result).sort(), pem_format: pemFormat(String(result.pem).includes('-----BEGIN') ? result.pem : Buffer.from(result.pem, 'base64').toString('utf8')) } };
}

async function deleteKey(ctx, id) {
    const response = await ctx.api.deleteKey(id);
    if ([200, 204, 404].includes(response.status)) ctx.created.keys.delete(id);
    return response.status;
}

async function cmdKeys(ctx) {
    const receipt = startReceipt(ctx, 'keys');
    const uid = requireUid(ctx, 'uid');
    const { customerCode } = await readyVideo(ctx, uid);
    const a = await createKey(ctx, 'KEY_A');
    const b = await createKey(ctx, 'KEY_B');
    receipt.key_shape = a.shape;
    const master = async (key) => probeSurface(ctx, surfaceUrl(customerCode, mintToken(key, { uid, ttlSeconds: ctx.tokenTtl, nowMs: ctx.now() }).token,
        'manifest/video.m3u8'));
    const overlap = { a: await master(a.key), b: await master(b.key) };
    check(ctx, 'both_keys_sign_during_overlap', overlap.a === 200 && overlap.b === 200, overlap);
    const deletedA = await deleteKey(ctx, a.key.id);
    check(ctx, 'key_a_deleted', deletedA === 200, { status: deletedA });
    const revoked = await poll(ctx, async () => ({ a: await master(a.key), b: await master(b.key) }), (state) => !allowed(state.a),
        { timeoutMs: ctx.timeoutMs, intervalMs: 10_000 });
    receipt.revocation = { ...revoked.value, elapsed_ms: revoked.elapsedMs };
    check(ctx, 'key_a_tokens_refused_after_delete', !revoked.timedOut, receipt.revocation);
    check(ctx, 'key_b_still_signs', revoked.value.b === 200, { status: revoked.value.b });
    const deletedB = await deleteKey(ctx, b.key.id);
    check(ctx, 'key_b_deleted', deletedB === 200, { status: deletedB });
}

function requireUid(ctx, name) {
    const uid = ctx.opts[name];
    if (!uid || !UID.test(uid)) throw new Error(`option_${name}_invalid`);
    registerUid(ctx, uid, name === 'uid' ? 'UID' : 'OTHER_UID');
    return uid;
}

// ---------------------------------------------------------------- cleanup

async function cleanup(ctx) {
    const report = { videos: [], keys: [], left_on_provider: { videos: 0, keys: 0 } };
    for (const uid of [...ctx.created.videos]) {
        let status = null;
        try {
            status = await deleteVideo(ctx, uid);
        } catch {
            status = null;
        }
        report.videos.push({ uid, status });
    }
    for (const id of [...ctx.created.keys]) {
        let status = null;
        try {
            status = await deleteKey(ctx, id);
        } catch {
            status = null;
        }
        report.keys.push({ id, status });
    }
    report.left_on_provider = { videos: ctx.created.videos.size, keys: ctx.created.keys.size };
    // Ids stay out of files; the terminal is the only place they are shown, so the owner can delete by hand.
    for (const uid of ctx.created.videos) ctx.printUnscrubbed(`stream-canary: video left on the provider, delete it: DELETE /stream/${uid}`);
    for (const id of ctx.created.keys) ctx.printUnscrubbed(`stream-canary: signing key left on the provider, delete it: DELETE /stream/keys/${id}`);
    return report;
}

// ---------------------------------------------------------------- CLI

const COMMANDS = {
    provider: { run: cmdProvider, summary: 'POST direct_user, tus HEAD, DELETE 200, GET 404' },
    reservation: { run: cmdReservation, summary: 'create + abandon a reservation; storage-usage delta; DELETE; delta back' },
    playback: { run: cmdPlayback, summary: 'denial matrix none/forged/expired/wrong-sub/valid + stripped-query segment (--uid, --signing-key-file)' },
    webhook: { run: cmdWebhook, summary: 'tiny non-video upload → signed ERR_NON_VIDEO delivery to the Bridge (--bridge-health-url or the Bridge log)' },
    ladder: { run: cmdLadder, summary: 'master/variant record against protocol/paid-media-v1/stream-profile.json (--uid, --signing-key-file)' },
    keys: { run: cmdKeys, summary: 'POST key A and B, overlap, DELETE A (A refused, B plays), DELETE B (--uid)' },
};

const OPTIONS = {
    out: { type: 'string' },
    'dry-run': { type: 'boolean' },
    help: { type: 'boolean' },
    uid: { type: 'string' },
    'other-uid': { type: 'string' },
    'signing-key-file': { type: 'string' },
    'reservation-seconds': { type: 'string' },
    'timeout-minutes': { type: 'string' },
    'token-ttl': { type: 'string' },
    'bridge-health-url': { type: 'string' },
    descriptor: { type: 'string' },
};

export const USAGE = `Usage: npm run canary:stream:<subcommand> -- --out <dir> [options]
       node scripts/stream-canary.mjs <subcommand> --out <dir> [options]

Owner-run Cloudflare Stream canaries for the V2 Bridge (M4-G2). Every live run
needs ${MUTATION_GATE}=true plus STREAM_ACCOUNT_ID and STREAM_API_TOKEN in this
shell's environment (never read from files). --dry-run and --help need none.

Subcommands:
${Object.entries(COMMANDS).map(([name, command]) => `  ${name.padEnd(12)} ${command.summary}`).join('\n')}

Options:
  --out <dir>                 required, outside the repository (claudedocs/ allowed); receipts go here
  --dry-run                   print the request plan, no network calls
  --uid <uid>                 a ready video of the account (playback, ladder, keys); never deleted
  --other-uid <uid>           playback: another video for the wrong-sub token (default: a random uid)
  --signing-key-file <f>      JSON {"id","pem"} outside the repository (playback, ladder)
  --reservation-seconds <n>   reservation: maxDurationSeconds of the abandoned upload (default ${DEFAULT_RESERVATION_SECONDS})
  --timeout-minutes <n>       how long to wait for provider state changes (default ${DEFAULT_TIMEOUT_MINUTES})
  --token-ttl <s>             viewer token lifetime (default ${DEFAULT_TOKEN_TTL_SECONDS})
  --bridge-health-url <url>   webhook: https://<bridge>/__health; waits for stream.lastWebhookAtMs to advance
  --descriptor <path>         ladder: descriptor file (default protocol/paid-media-v1/stream-profile.json)
`;

export function missingOptions(sub, opts) {
    const missing = [];
    if (['playback', 'ladder', 'keys'].includes(sub) && !opts.uid) missing.push('--uid');
    if (['playback', 'ladder'].includes(sub) && !opts['signing-key-file']) missing.push('--signing-key-file');
    return missing;
}

const W = 'WRITE';

export function planFor(sub, opts) {
    const api = '/client/v4/accounts/<ACCOUNT_ID>/stream';
    const playback = 'customer-<CUSTOMER_CODE>.cloudflarestream.com';
    const create = (note) => ['POST', `${api}?direct_user=true`, note, W];
    switch (sub) {
    case 'provider':
        return [create(`tus create, 1 MiB declared, maxDurationSeconds=${CANARY_MAX_DURATION_SECONDS} requiresignedurls expiry=+30m`),
            ['HEAD', `${UPLOAD_HOST}/<TUS_URL>`, 'Upload-Offset 0, Upload-Length 1 MiB'],
            ['DELETE', `${api}/<UID>`, 'expect 200', W], ['GET', `${api}/<UID>`, 'expect 404 (polled up to 60 s)']];
    case 'reservation':
        return [['GET', `${api}/storage-usage`, 'baseline'],
            create(`reservation maxDurationSeconds=${opts['reservation-seconds'] ?? DEFAULT_RESERVATION_SECONDS}, no bytes sent`),
            ['GET', `${api}/storage-usage`, 'poll until the reservation is counted'], ['DELETE', `${api}/<UID>`, 'abandon', W],
            ['GET', `${api}/storage-usage`, 'poll until back to the baseline']];
    case 'playback':
        return [['GET', `${api}/<UID>`, 'ready video, customer code'],
            ['GET', `${playback}/<CREDENTIAL>/{manifest/video.m3u8,manifest/video.mpd,thumbnails/thumbnail.jpg,watch,iframe,downloads/default.mp4}`,
                'none/forged/expired/wrong-sub/valid (wrong-sub not on watch or iframe); manifests and denials only'],
            ['GET', `${playback}/<CREDENTIAL>/manifest/<variant>.m3u8`, 'first variant under every credential'],
            ['GET', `${playback}/<UID>/video/<rendition>/seg_N.mp4`, 'the first segment with its p/s query stripped (expect 404); the listed URL is never fetched']];
    case 'webhook':
        return [...(opts['bridge-health-url'] ? [['GET', '<bridge>/__health', 'stream.lastWebhookAtMs before']] : []),
            create(`64 KiB non-video, maxDurationSeconds=${CANARY_MAX_DURATION_SECONDS}`),
            ['PATCH', `${UPLOAD_HOST}/<TUS_URL>`, 'the 64 KiB of random bytes', W], ['GET', `${api}/<UID>`, 'poll until state error ERR_NON_VIDEO'],
            opts['bridge-health-url'] ? ['GET', '<bridge>/__health', 'poll until stream.lastWebhookAtMs advances'] : ['CHECK', 'Bridge log', 'operator: one signed error delivery answered 202'],
            ['DELETE', `${api}/<UID>`, 'cleanup', W]];
    case 'ladder':
        return [['READ', opts.descriptor ?? 'protocol/paid-media-v1/stream-profile.json', 'expected rungs'], ['GET', `${api}/<UID>`, 'input size, customer code'],
            ['GET', `${playback}/<TOKEN>/manifest/video.m3u8`, 'renditions, codecs'],
            ['GET', `${playback}/<TOKEN>/manifest/<variant>.m3u8`, 'every variant and audio playlist: EXT-X-ENDLIST, EXT-X-MAP; no segments']];
    case 'keys':
        return [['GET', `${api}/<UID>`, 'ready video'], ['POST', `${api}/keys`, 'key A (private half in memory only)', W], ['POST', `${api}/keys`, 'key B', W],
            ['GET', `${playback}/<TOKEN>/manifest/video.m3u8`, 'A and B tokens during the overlap'], ['DELETE', `${api}/keys/<KEY_A>`, 'revoke A', W],
            ['GET', `${playback}/<TOKEN>/manifest/video.m3u8`, 'poll until the A token is refused; B still plays'], ['DELETE', `${api}/keys/<KEY_B>`, 'cleanup', W]];
    default:
        return [];
    }
}

function renderPlan(sub, opts) {
    const steps = planFor(sub, opts);
    const lines = steps.map(([method, target, note, write]) => `  ${write ? '[W]' : '   '} ${method.padEnd(7)} ${target}${note ? `  — ${note}` : ''}`);
    return `stream-canary ${sub} (dry run, no network)\n${lines.join('\n')}\n  ${steps.filter((step) => step[3] === W).length} provider write step(s) marked [W].\n`;
}

function intOption(value, fallback, name, { min = 1 } = {}) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min) throw new Error(`option_${name}_invalid`);
    return parsed;
}

export async function runCli(argv, deps = {}) {
    const env = deps.env ?? process.env;
    const stdout = deps.stdout ?? process.stdout;
    const stderr = deps.stderr ?? process.stderr;
    const fail = (message) => {
        stderr.write(`stream-canary: ${message}\n`);
        return 2;
    };
    let parsed;
    try {
        parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
    } catch (error) {
        return fail(`${error.message}\n\n${USAGE}`);
    }
    const opts = { ...parsed.values };
    const [sub, ...rest] = parsed.positionals;
    if (opts.help) {
        stdout.write(USAGE);
        return 0;
    }
    const command = COMMANDS[sub];
    if (!command || rest.length) return fail(`unknown or missing subcommand\n\n${USAGE}`);
    if (!opts.out) return fail('--out <dir> is required (use a directory outside the repository)');
    const outDir = resolve(opts.out);
    const realOut = realpathExisting(outDir);
    const realRepo = realpathExisting(REPO_ROOT);
    if (isInside(realOut, realRepo) && !isInside(realOut, join(realRepo, 'claudedocs'))) {
        return fail('--out must be outside the repository (claudedocs/ is allowed)');
    }
    const missing = missingOptions(sub, opts);
    if (missing.length) return fail(`${sub} needs ${missing.join(', ')}`);
    let numbers;
    try {
        numbers = {
            reservationSeconds: intOption(opts['reservation-seconds'], DEFAULT_RESERVATION_SECONDS, 'reservation-seconds'),
            timeoutMs: intOption(opts['timeout-minutes'], DEFAULT_TIMEOUT_MINUTES, 'timeout-minutes') * 60_000,
            tokenTtl: intOption(opts['token-ttl'], DEFAULT_TOKEN_TTL_SECONDS, 'token-ttl'),
        };
        if (numbers.reservationSeconds > 36000) throw new Error('option_reservation-seconds_invalid');
        if (numbers.tokenTtl > 86_400) throw new Error('option_token-ttl_invalid');
    } catch (error) {
        return fail(error.message);
    }
    if (opts['dry-run']) {
        stdout.write(renderPlan(sub, opts));
        return 0;
    }
    const accountId = env.STREAM_ACCOUNT_ID;
    const apiToken = env.STREAM_API_TOKEN;
    if (env[MUTATION_GATE] !== 'true') {
        return fail(`${sub} calls Cloudflare Stream; set ${MUTATION_GATE}=true in this shell after the per-gate approval (or use --dry-run)`);
    }
    if (!accountId || !apiToken) return fail('STREAM_ACCOUNT_ID and STREAM_API_TOKEN must be set in this shell\'s environment (never read from files)');
    if (!/^[0-9a-f]{32}$/.test(accountId)) return fail('STREAM_ACCOUNT_ID must be the 32-hex Cloudflare account id');
    if (apiToken.length < 20 || /\s/.test(apiToken)) return fail('STREAM_API_TOKEN looks malformed');
    const scrubber = createScrubber();
    scrubber.register(accountId, '<ACCOUNT_ID>');
    scrubber.register(apiToken, '<API_TOKEN>');
    await mkdir(outDir, { recursive: true, mode: 0o700 });
    const fetchImpl = deps.fetchImpl ?? fetch;
    const ctx = {
        opts,
        ...numbers,
        out: createOutput(outDir, scrubber),
        scrubber,
        fetchImpl,
        now: deps.now ?? Date.now,
        sleep: deps.sleep ?? ((milliseconds) => new Promise((done) => setTimeout(done, milliseconds))),
        log: (line) => stdout.write(`${scrubber.scrubString(line)}\n`),
        printUnscrubbed: (line) => stderr.write(`${line}\n`),
        created: { videos: new Set(), keys: new Set() },
        api: createStreamApi({ accountId, apiToken, fetchImpl, scrubber }),
    };
    let code = 0;
    try {
        await command.run(ctx);
        if (ctx.receipt.status === 'RUNNING') ctx.receipt.status = verdict(ctx.receipt);
    } catch (error) {
        if (!ctx.receipt) startReceipt(ctx, sub);
        ctx.receipt.status = 'ABORTED';
        ctx.receipt.error = scrubber.scrubString(error?.message ?? String(error));
        stderr.write(`stream-canary: ${ctx.receipt.error}\n`);
    } finally {
        ctx.receipt ??= startReceipt(ctx, sub);
        try {
            ctx.receipt.cleanup = await cleanup(ctx);
        } catch (error) {
            ctx.receipt.cleanup = { error: scrubber.scrubString(error?.message ?? String(error)) };
        }
        const left = ctx.receipt.cleanup.left_on_provider;
        if (!left || left.videos > 0 || left.keys > 0) ctx.receipt.status = ctx.receipt.status === 'ABORTED' ? 'ABORTED' : 'FAIL';
        try {
            await writeReceipt(ctx);
        } catch (error) {
            stderr.write(`stream-canary: receipt_failed ${scrubber.scrubString(error?.message ?? String(error))}\n`);
            code = 1;
        }
    }
    ctx.log(`stream-canary ${sub}: ${ctx.receipt.status}`);
    if (!['PASS', 'OPERATOR_CHECK'].includes(ctx.receipt.status)) code = 1;
    return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = await runCli(process.argv.slice(2));
}
