import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, verify as cryptoVerify } from 'node:crypto';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CREDENTIALS, DENIAL_MATRIX, SCHEMA, missingOptions, planFor, runCli } from './stream-canary.mjs';

const ACCOUNT = '0123456789abcdef0123456789abcdef';
const API_TOKEN = 'test-stream-api-token-0123456789';
const CODE = 'custcode1234xyz';
const READY_UID = 'feedfacefeedfacefeedfacefeedface';
const OTHER_UID = 'c0ffeec0ffeec0ffeec0ffeec0ffee00';
const ENV = { STREAM_ACCOUNT_ID: ACCOUNT, STREAM_API_TOKEN: API_TOKEN, STREAM_CANARY_MUTATIONS: 'true' };
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream`;
const PLAYBACK = `https://customer-${CODE}.cloudflarestream.com`;
const HEALTH = 'https://youtick-livepeer-bridge-v2-testnet.example.workers.dev/__health';
const JWT_RE = /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{8,}/;
const LADDER = [[426, 240], [640, 360], [852, 480], [1280, 720], [1920, 1080]];

function json(status, result) {
    return new Response(JSON.stringify({ success: status < 400, errors: status < 400 ? [] : [{ code: 10000 + status }], messages: [], result }), {
        status, headers: { 'content-type': 'application/json' },
    });
}

function ownerKey() {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    return { id: 'a'.repeat(32), pem: Buffer.from(privateKey.export({ format: 'pem', type: 'pkcs8' })).toString('base64'), publicKey };
}

/** Cloudflare Stream as the 2026-10-21 spike recorded it; `behaviour` switches on the drifts a canary must catch. */
function createFakeStream({ clock, owner, behaviour = {} }) {
    const videos = new Map([[READY_UID, { uid: READY_UID, ready: true, length: 1, maxDuration: 30, offset: 1 }]]);
    if (behaviour.otherVideo) videos.set(OTHER_UID, { uid: OTHER_UID, ready: true, length: 1, maxDuration: 30, offset: 1 });
    const keys = new Map([[owner.id, owner.publicKey]]);
    const calls = [];
    const health = { lastWebhookAtMs: 1000 };
    let sequence = 0;
    const baseMinutes = 3;

    const storage = () => baseMinutes + (behaviour.reservationInvisible ? 0 : [...videos.values()]
        .filter((video) => !video.ready && !video.errored).reduce((sum, video) => sum + video.maxDuration / 60, 0));

    function videoObject(video) {
        const state = video.ready ? 'ready' : video.errored ? 'error' : video.offset > 0 ? 'inprogress' : 'pendingupload';
        return {
            uid: video.uid, readyToStream: video.ready,
            status: { state, pctComplete: video.ready ? '100.000000' : '0', errorReasonCode: video.errored ? 'ERR_NON_VIDEO' : '' },
            input: { width: 1920, height: 1080 }, requireSignedURLs: true,
            playback: { hls: `${PLAYBACK}/${video.uid}/manifest/video.m3u8`, dash: `${PLAYBACK}/${video.uid}/manifest/video.mpd` },
        };
    }

    function verifyToken(token) {
        const parts = token.split('.');
        if (parts.length !== 3) return { ok: false };
        try {
            const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
            const key = keys.get(header.kid);
            if (!key || header.alg !== 'RS256') return { ok: false };
            if (!cryptoVerify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'))) return { ok: false };
            if (payload.exp < Math.floor(clock.t / 1000)) return { ok: false };
            assert.deepEqual(Object.keys(payload).sort(), ['exp', 'kid', 'nbf', 'sub']);
            return { ok: true, payload };
        } catch (error) {
            if (error instanceof assert.AssertionError) throw error;
            return { ok: false };
        }
    }

    function playback(url) {
        const [, credential, ...rest] = url.pathname.split('/');
        const path = rest.join('/');
        if (rest[0] === 'video') {
            calls.push({ segment: url.toString() });
            return new Response('nf', { status: url.search ? 200 : 404 });
        }
        if (UID_ONLY.test(credential)) return new Response('denied', { status: behaviour.iframeOpen && path === 'iframe' ? 200 : 401 });
        const verified = verifyToken(credential);
        if (!verified.ok) return new Response('denied', { status: 401 });
        if (!videos.get(verified.payload.sub)?.ready || verified.payload.sub !== READY_UID) {
            if (path === 'iframe') return new Response('<html>', { status: 200 });
            if (path === 'watch') return new Response('err', { status: 500 });
            return new Response('nf', { status: 404 });
        }
        const uid = verified.payload.sub;
        const query = `p=${Buffer.from(JSON.stringify({ videoID: uid })).toString('base64url')}&s=${'ab'.repeat(16)}`;
        if (path === 'manifest/video.m3u8') {
            const ladder = behaviour.missingRung ? LADDER.slice(1) : LADDER;
            return new Response(['#EXTM3U', '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="original",URI="stream_t0.m3u8"',
                ...ladder.flatMap(([width, height], index) => [`#EXT-X-STREAM-INF:RESOLUTION=${width}x${height},BANDWIDTH=${height * 5000},CODECS="avc1.4d40${index}f,mp4a.40.2",AUDIO="a"`, `stream_t${index + 1}.m3u8`]),
                ''].join('\n'));
        }
        if (/^manifest\/stream_t\d\.m3u8$/.test(path)) {
            return new Response(['#EXTM3U', '#EXT-X-TARGETDURATION:5', `#EXT-X-MAP:URI="../../${uid}/video/720/init.mp4?${query}"`, '#EXTINF:5.0,',
                `../../${uid}/video/720/seg_1.mp4?${query}`, ...(behaviour.openVariant ? [] : ['#EXT-X-ENDLIST']), ''].join('\n'));
        }
        if (path === 'downloads/default.mp4') return new Response('forbidden', { status: 403 });
        if (['manifest/video.mpd', 'thumbnails/thumbnail.jpg', 'watch', 'iframe'].includes(path)) return new Response('ok', { status: 200 });
        return new Response('nf', { status: 404 });
    }

    async function impl(input, init = {}) {
        const url = new URL(typeof input === 'string' ? input : input.url);
        const method = init.method ?? 'GET';
        calls.push({ method, url: url.toString(), headers: init.headers ?? {} });
        if (url.toString() === HEALTH) return new Response(JSON.stringify({ stream: { ...health } }), { status: 200 });
        if (url.hostname === `customer-${CODE}.cloudflarestream.com`) return playback(url);
        if (url.hostname === 'upload.cloudflarestream.com') {
            const video = videos.get(url.pathname.split('/').pop());
            if (!video) return new Response(null, { status: 404 });
            if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'upload-offset': String(video.offset), 'upload-length': String(video.length) } });
            if (method === 'PATCH') {
                video.offset += init.body.length;
                if (video.offset === video.length) {
                    video.errored = true;
                    if (!behaviour.webhookLost) health.lastWebhookAtMs = clock.t + 1;
                }
                return new Response(null, { status: 204, headers: { 'upload-offset': String(video.offset) } });
            }
        }
        if (init.headers?.Authorization !== `Bearer ${API_TOKEN}`) return json(403, null);
        const path = url.toString().slice(API.length);
        if (method === 'POST' && path === '?direct_user=true') {
            if (behaviour.createStatus) return json(behaviour.createStatus, null);
            const metadata = Object.fromEntries(init.headers['Upload-Metadata'].split(',').map((entry) => {
                const [key, value] = entry.split(' ');
                return [key, value === undefined ? true : Buffer.from(value, 'base64').toString()];
            }));
            assert.equal(metadata.requiresignedurls, true);
            assert.ok(metadata.expiry);
            sequence += 1;
            const uid = `${String(sequence).padStart(2, '0')}${'b'.repeat(30)}`;
            videos.set(uid, { uid, ready: false, length: Number(init.headers['Upload-Length']), maxDuration: Number(metadata.maxDurationSeconds), offset: 0 });
            return new Response(null, { status: 201, headers: {
                location: behaviour.otherUploadHost ? `https://evil.example/tus/${uid}` : `https://upload.cloudflarestream.com/tus/${uid}?tusv2=true`,
                'stream-media-id': uid,
            } });
        }
        if (path === '/storage-usage') return json(200, { totalStorageMinutes: storage(), totalStorageMinutesLimit: 1000, videoCount: videos.size });
        if (path === '/keys' && method === 'POST') {
            const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
            const id = randomBytes(16).toString('hex');
            keys.set(id, publicKey);
            return json(200, {
                id, created: '2026-10-22T00:00:00Z',
                pem: Buffer.from(privateKey.export({ format: 'pem', type: 'pkcs8' })).toString('base64'),
                jwk: Buffer.from(JSON.stringify(privateKey.export({ format: 'jwk' }))).toString('base64'),
            });
        }
        const keyMatch = path.match(/^\/keys\/([0-9a-f]{32})$/);
        if (keyMatch && method === 'DELETE') {
            if (!behaviour.keyRevocationIgnored) keys.delete(keyMatch[1]);
            return json(200, 'ok');
        }
        const videoMatch = path.match(/^\/([0-9a-f]{32})$/);
        if (videoMatch) {
            const video = videos.get(videoMatch[1]);
            if (method === 'DELETE') {
                if (!video) return json(404, null);
                videos.delete(videoMatch[1]);
                return json(200, '');
            }
            return video ? json(200, videoObject(video)) : json(404, null);
        }
        return json(404, null);
    }
    return { impl, calls, videos, keys, health };
}
const UID_ONLY = /^[0-9a-f]{32}$/;

async function setup(behaviour = {}) {
    const clock = { t: Date.parse('2026-10-22T18:00:00Z') };
    const owner = ownerKey();
    const stream = createFakeStream({ clock, owner, behaviour });
    const dir = await mkdtemp(join(tmpdir(), 'stream-canary-'));
    const keyFile = join(dir, 'owner-key.json');
    await writeFile(keyFile, JSON.stringify({ id: owner.id, pem: owner.pem }), { mode: 0o600 });
    const out = join(dir, 'out');
    const output = { stdout: '', stderr: '' };
    const run = (argv, extra = {}) => runCli(argv, {
        env: ENV, fetchImpl: stream.impl, now: () => clock.t, sleep: async (ms) => {
            clock.t += ms;
        },
        stdout: { write: (text) => { output.stdout += text; } }, stderr: { write: (text) => { output.stderr += text; } }, ...extra,
    });
    return { clock, owner, stream, dir, keyFile, out, output, run };
}

async function receiptOf(out, sub) {
    const files = await readdir(join(out, sub));
    const receipts = files.filter((name) => name.startsWith('receipt-'));
    assert.equal(receipts.length, 1, `${sub}: ${files}`);
    const text = await readFile(join(out, sub, receipts[0]), 'utf8');
    return { receipt: JSON.parse(text), text };
}

function assertScrubbed(text, extra = []) {
    for (const secret of [ACCOUNT, API_TOKEN, CODE, READY_UID, ...extra]) assert.ok(!text.includes(secret), `leak ${secret.slice(0, 8)}`);
    assert.doesNotMatch(text, JWT_RE);
    assert.doesNotMatch(text, /-----BEGIN/);
}

test('live runs refuse without the mutation gate, credentials or an outside --out; --dry-run needs no network', async () => {
    const { run, out, output, stream, keyFile } = await setup();
    assert.equal(await run(['provider', '--out', out], { env: { ...ENV, STREAM_CANARY_MUTATIONS: undefined } }), 2);
    assert.match(output.stderr, /STREAM_CANARY_MUTATIONS=true/);
    assert.equal(await run(['provider', '--out', out], { env: { STREAM_CANARY_MUTATIONS: 'true' } }), 2);
    assert.equal(await run(['provider', '--out', out], { env: { ...ENV, STREAM_ACCOUNT_ID: 'acct' } }), 2);
    assert.equal(await run(['provider', '--out', new URL('../out', import.meta.url).pathname]), 2);
    assert.match(output.stderr, /outside the repository/);
    assert.equal(await run(['playback', '--out', out, '--uid', READY_UID]), 2);
    assert.match(output.stderr, /--signing-key-file/);
    assert.equal(await run(['nope', '--out', out]), 2);
    for (const sub of ['provider', 'reservation', 'playback', 'webhook', 'ladder', 'keys']) {
        assert.equal(await run([sub, '--out', out, '--dry-run', '--uid', READY_UID, '--signing-key-file', keyFile], { env: {} }), 0, sub);
        assert.ok(planFor(sub, {}).length > 0, sub);
    }
    assert.equal(stream.calls.length, 0);
    assert.deepEqual(missingOptions('keys', {}), ['--uid']);
    // The planned playback probes never include an anonymous fetch of a listed p/s segment URL.
    assert.ok(planFor('playback', {}).some(([, , note]) => /listed URL is never fetched/.test(note)));
});

test('provider: create, HEAD, DELETE 200, GET 404 and a scrubbed PASS receipt', async () => {
    const { run, out, stream } = await setup();
    assert.equal(await run(['provider', '--out', out]), 0);
    const { receipt, text } = await receiptOf(out, 'provider');
    assert.equal(receipt.schema, SCHEMA);
    assert.equal(receipt.status, 'PASS');
    assert.deepEqual(receipt.checks.map((entry) => entry.name), [
        'create_201_with_uid', 'upload_url_host_pinned', 'head_offset_0_of_declared_length', 'delete_200', 'get_after_delete_404']);
    assert.deepEqual(receipt.cleanup.left_on_provider, { videos: 0, keys: 0 });
    assert.equal(stream.videos.size, 1);
    assertScrubbed(text, ['b'.repeat(30)]);
    assert.doesNotMatch(text, /upload\.cloudflarestream\.com\/tus/);
});

test('provider: an upload URL off the pinned host fails, and a refused create leaves nothing behind', async () => {
    const off = await setup({ otherUploadHost: true });
    assert.equal(await off.run(['provider', '--out', off.out]), 1);
    const { receipt } = await receiptOf(off.out, 'provider');
    assert.equal(receipt.status, 'FAIL');
    assert.equal(receipt.checks.find((entry) => entry.name === 'upload_url_host_pinned').pass, false);
    assert.equal(off.stream.videos.size, 1);
    const refused = await setup({ createStatus: 413 });
    assert.equal(await refused.run(['provider', '--out', refused.out]), 1);
    const second = await receiptOf(refused.out, 'provider');
    assert.equal(second.receipt.status, 'FAIL');
    assert.equal(second.receipt.create.status, 413);
});

test('reservation: the abandoned upload is counted against storage and released by DELETE', async () => {
    const { run, out } = await setup();
    assert.equal(await run(['reservation', '--out', out, '--reservation-seconds', '600']), 0);
    const { receipt } = await receiptOf(out, 'reservation');
    assert.equal(receipt.status, 'PASS');
    assert.equal(receipt.reserved.delta_minutes, 10);
    assert.equal(receipt.released.delta_minutes, 0);
    const invisible = await setup({ reservationInvisible: true });
    assert.equal(await invisible.run(['reservation', '--out', invisible.out, '--timeout-minutes', '1']), 1);
    const failed = await receiptOf(invisible.out, 'reservation');
    assert.equal(failed.receipt.checks.find((entry) => entry.name === 'reservation_counted').pass, false);
    // The reservation was still deleted.
    assert.deepEqual(failed.receipt.cleanup.left_on_provider, { videos: 0, keys: 0 });
    assert.equal(invisible.stream.videos.size, 1);
});

test('playback: the §9.3 matrix holds, the stripped-query segment is denied and no listed segment URL is fetched', async () => {
    const { run, out, keyFile, stream, owner } = await setup();
    assert.equal(await run(['playback', '--out', out, '--uid', READY_UID, '--signing-key-file', keyFile]), 0);
    const { receipt, text } = await receiptOf(out, 'playback');
    assert.equal(receipt.status, 'PASS');
    for (const [surface, expected] of Object.entries(DENIAL_MATRIX)) {
        for (const credential of CREDENTIALS) {
            if (expected[credential] !== null) assert.equal(receipt.matrix[surface][credential], expected[credential], `${surface} ${credential}`);
            else assert.equal(receipt.matrix[surface][credential], undefined, `${surface} ${credential} not probed`);
        }
    }
    assert.deepEqual(receipt.matrix.variant_playlist, { none: 401, forged: 401, expired: 401, wrong_sub: 404, valid: 200 });
    assert.deepEqual(receipt.matrix.stripped_query_segment, { none: 404 });
    assert.deepEqual(receipt.status_drift, []);
    const segments = stream.calls.filter((call) => call.segment);
    assert.equal(segments.length, 1);
    assert.equal(new URL(segments[0].segment).search, '');
    assertScrubbed(text, [owner.id]);
    // An anonymous iframe that plays is an exposed surface.
    const open = await setup({ iframeOpen: true });
    assert.equal(await open.run(['playback', '--out', open.out, '--uid', READY_UID, '--signing-key-file', open.keyFile]), 1);
    const failed = await receiptOf(open.out, 'playback');
    assert.equal(failed.receipt.status, 'FAIL');
    assert.deepEqual(failed.receipt.status_drift, [{ surface: 'iframe', credential: 'none', expected: 401, status: 200 }]);
});

test('playback: the signing key file must live outside the repository', async () => {
    const { run, out } = await setup();
    assert.equal(await run(['playback', '--out', out, '--uid', READY_UID, '--signing-key-file', new URL('./stream-canary.mjs', import.meta.url).pathname]), 1);
    const { receipt } = await receiptOf(out, 'playback');
    assert.equal(receipt.status, 'ABORTED');
    assert.match(receipt.error, /signing_key_file_must_be_outside_the_repository/);
});

test('webhook: ERR_NON_VIDEO from the provider; PASS only when the Bridge health shows the delivery, OPERATOR_CHECK otherwise', async () => {
    const withHealth = await setup();
    assert.equal(await withHealth.run(['webhook', '--out', withHealth.out, '--bridge-health-url', HEALTH]), 0);
    const passed = await receiptOf(withHealth.out, 'webhook');
    assert.equal(passed.receipt.status, 'PASS');
    assert.equal(passed.receipt.provider_error.reason_code, 'ERR_NON_VIDEO');
    assert.equal(passed.receipt.bridge.advanced, true);
    assert.equal(withHealth.stream.videos.size, 1);
    const manual = await setup();
    assert.equal(await manual.run(['webhook', '--out', manual.out]), 0);
    const pending = await receiptOf(manual.out, 'webhook');
    assert.equal(pending.receipt.status, 'OPERATOR_CHECK');
    assert.match(pending.receipt.bridge.operator_check, /Bridge log/);
    const lost = await setup({ webhookLost: true });
    assert.equal(await lost.run(['webhook', '--out', lost.out, '--bridge-health-url', HEALTH, '--timeout-minutes', '1']), 1);
    assert.equal((await receiptOf(lost.out, 'webhook')).receipt.status, 'FAIL');
    assert.equal(await lost.run(['webhook', '--out', lost.out, '--bridge-health-url', 'http://bridge.example/__health']), 1);
});

test('ladder: every descriptor rung, H.264 and complete fMP4 playlists; a missing rung fails', async () => {
    const descriptor = async (dir) => {
        const path = join(dir, 'stream-profile.json');
        const profiles = LADDER.map(([width, height]) => ({ name: `${height}p`, width, height }));
        await writeFile(path, JSON.stringify({ stream: { hash: 'f'.repeat(64), provider: 'cloudflare-stream', container: 'fmp4', codec: 'h264', profiles } }));
        return path;
    };
    const good = await setup();
    assert.equal(await good.run(['ladder', '--out', good.out, '--uid', READY_UID, '--signing-key-file', good.keyFile, '--descriptor', await descriptor(good.dir)]), 0);
    const { receipt } = await receiptOf(good.out, 'ladder');
    assert.equal(receipt.status, 'PASS');
    assert.equal(receipt.renditions.length, 5);
    assert.equal(receipt.playlists.length, 6);
    const missing = await setup({ missingRung: true });
    assert.equal(await missing.run(['ladder', '--out', missing.out, '--uid', READY_UID, '--signing-key-file', missing.keyFile, '--descriptor', await descriptor(missing.dir)]), 1);
    const failed = await receiptOf(missing.out, 'ladder');
    assert.deepEqual(failed.receipt.checks.find((entry) => entry.name === 'every_expected_rung_listed').missing, ['240p']);
    const open = await setup({ openVariant: true });
    assert.equal(await open.run(['ladder', '--out', open.out, '--uid', READY_UID, '--signing-key-file', open.keyFile, '--descriptor', await descriptor(open.dir)]), 1);
    const none = await setup();
    assert.equal(await none.run(['ladder', '--out', none.out, '--uid', READY_UID, '--signing-key-file', none.keyFile, '--descriptor', join(none.dir, 'absent.json')]), 1);
    assert.match((await receiptOf(none.out, 'ladder')).receipt.error, /stream_descriptor_unreadable/);
});

test('keys: two keys overlap, the deleted key is refused while the other plays, both are deleted', async () => {
    const { run, out, stream, owner } = await setup();
    assert.equal(await run(['keys', '--out', out, '--uid', READY_UID]), 0);
    const { receipt, text } = await receiptOf(out, 'keys');
    assert.equal(receipt.status, 'PASS');
    assert.deepEqual(receipt.key_shape.field_names, ['created', 'id', 'jwk', 'pem']);
    assert.equal(receipt.key_shape.pem_format, 'pkcs8');
    assert.deepEqual([...stream.keys.keys()], [owner.id]);
    assertScrubbed(text);
    for (const id of [...stream.keys.keys()]) assert.ok(!text.includes(id) || id === owner.id);
    const ignored = await setup({ keyRevocationIgnored: true });
    assert.equal(await ignored.run(['keys', '--out', ignored.out, '--uid', READY_UID, '--timeout-minutes', '1']), 1);
    assert.equal((await receiptOf(ignored.out, 'keys')).receipt.checks.find((entry) => entry.name === 'key_a_tokens_refused_after_delete').pass, false);
});

test('an aborted run still deletes what it created and writes an ABORTED receipt', async () => {
    const { run, out, stream } = await setup();
    const failing = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.startsWith('https://upload.cloudflarestream.com/') && (init?.method ?? 'GET') === 'HEAD') throw new TypeError('fetch failed');
        return stream.impl(input, init);
    };
    assert.equal(await run(['provider', '--out', out], { fetchImpl: failing }), 1);
    const { receipt } = await receiptOf(out, 'provider');
    assert.equal(receipt.status, 'ABORTED');
    assert.deepEqual(receipt.cleanup.left_on_provider, { videos: 0, keys: 0 });
    assert.equal(stream.videos.size, 1);
});

