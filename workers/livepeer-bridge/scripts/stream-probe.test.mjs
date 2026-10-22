import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac, generateKeyPairSync, randomBytes, verify as cryptoVerify } from 'node:crypto';
import { mkdtemp, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    CONTAINERS,
    HLS_JS_INTEGRITY,
    HLS_JS_VERSION,
    createScrubber,
    createWebhookReceiver,
    describeMediaUri,
    jpegDimensions,
    listenHttp,
    missingOptions,
    parseDash,
    parseMasterPlaylist,
    parseMediaPlaylist,
    planFor,
    renderRenewalPage,
    runCli,
    sampleCommands,
    signWebhook,
    summarizeBrowserLog,
    verifyWebhookSignature,
} from './stream-probe.mjs';

const SCRIPT = fileURLToPath(new URL('./stream-probe.mjs', import.meta.url));
const ACCOUNT = '0123456789abcdef0123456789abcdef';
const API_TOKEN = 'test-stream-api-token-0123456789';
const CODE = 'custcode1234xyz';
const ENV = { STREAM_ACCOUNT_ID: ACCOUNT, STREAM_API_TOKEN: API_TOKEN, STREAM_PROBE_MUTATIONS: 'true' };
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream`;
const PLAYBACK = `https://customer-${CODE}.cloudflarestream.com`;
const JWT_RE = /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{8,}/;
const TUS_CHUNK_MULTIPLE = 256 * 1024;
const WEBHOOK = 'https://probe.trycloudflare.com';

function json(status, result, extra = {}) {
    return new Response(JSON.stringify({ success: status < 400, errors: [], messages: [], result, ...extra }), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function jpeg(width, height) {
    const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]), sof, Buffer.from([0xff, 0xd9])]);
}

function decodeSegment(part) {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

// Minimal Cloudflare Stream stand-in. `behaviour` switches on the failure
// modes the probe must survive.
function createFakeStream({ clock, deliver, behaviour = {} }) {
    const videos = new Map();
    const keys = new Map();
    const publicKeys = new Map();
    const secretsSeen = [];
    const calls = [];
    let webhook = behaviour.preWebhook ? { notificationUrl: behaviour.preWebhook, secret: 'pre-existing-secret-value' } : null;
    let sequence = 0;
    let live = 0;
    let maxLive = 0;
    let pending = [];
    let patchFailures = behaviour.failPatchOnce ? 1 : 0;

    const used = () => [...videos.values()].reduce((sum, video) => {
        if (video.uploadedAt !== null) return sum + 0.5;
        if (video.expiry && clock.t > video.expiry) return sum;
        return sum + video.maxDuration / 60;
    }, 0);

    function progress(video) {
        if (video.uploadedAt === null) return { state: 'pendingupload', pct: 0, ready: false, full: false };
        const elapsed = clock.t - video.uploadedAt;
        if (behaviour.failName && video.meta.name.endsWith(behaviour.failName) && elapsed >= 2000) {
            return { state: 'error', pct: 0, ready: false, full: false, error: 'ERR_NON_VIDEO' };
        }
        if (elapsed < 2000) return { state: 'inprogress', pct: 10, ready: false, full: false };
        return { state: 'ready', pct: elapsed >= 6000 ? 100 : 40, ready: true, full: elapsed >= 9000 };
    }

    function videoObject(video) {
        const now = progress(video);
        return {
            uid: video.uid,
            readyToStream: now.ready,
            status: { state: now.state, pctComplete: String(now.pct), errorReasonCode: now.error ?? '' },
            meta: video.meta,
            maxDurationSeconds: video.maxDuration,
            uploadExpiry: new Date(video.createdAt + 24 * 3_600_000).toISOString(),
            requireSignedURLs: true,
            input: video.portrait ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 },
            duration: now.ready ? 30 : -1,
            size: video.length,
            playback: { hls: `${PLAYBACK}/${video.uid}/manifest/video.m3u8`, dash: `${PLAYBACK}/${video.uid}/manifest/video.mpd` },
            thumbnail: `${PLAYBACK}/${video.uid}/thumbnails/thumbnail.jpg`,
            preview: `${PLAYBACK}/${video.uid}/watch`,
        };
    }

    function verifyToken(token) {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        let header;
        let payload;
        try {
            header = decodeSegment(parts[0]);
            payload = decodeSegment(parts[1]);
        } catch {
            return null;
        }
        const key = keys.get(header.kid);
        if (!key) return null;
        const valid = cryptoVerify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
        const nowSeconds = Math.floor(clock.t / 1000);
        if (!valid || typeof payload.exp !== 'number' || payload.exp < nowSeconds || payload.exp > nowSeconds + 86_400) return null;
        if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds) return null;
        return videos.get(payload.sub) ? payload : null;
    }

    function segmentQuery(uid) {
        const p = Buffer.from(JSON.stringify({ videoID: uid, ownerID: ACCOUNT, sub: uid, exp: 1 })).toString('base64url');
        return `p=${p}&s=${'ab'.repeat(16)}`;
    }

    function playback(url) {
        const [, credential, ...rest] = url.pathname.split('/');
        const path = rest.join('/');
        if (rest[0] === 'video') {
            const video = videos.get(credential);
            if (!video || !url.searchParams.get('p') || !url.searchParams.get('s')) return new Response('nf', { status: 404 });
            return new Response('x', { status: 206, headers: { 'content-range': 'bytes 0-0/1000' } });
        }
        const payload = verifyToken(credential);
        if (!payload) return new Response('denied', { status: 401 });
        const video = videos.get(payload.sub);
        const now = progress(video);
        const uid = video.uid;
        if (path === 'manifest/video.m3u8') {
            return new Response([
                '#EXTM3U',
                '#EXT-X-VERSION:6',
                '#EXT-X-INDEPENDENT-SEGMENTS',
                '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="group_audio",NAME="original",LANGUAGE="und",DEFAULT=YES,AUTOSELECT=YES,URI="stream_t1.m3u8"',
                '#EXT-X-STREAM-INF:RESOLUTION=1920x1080,BANDWIDTH=6000000,CODECS="avc1.4d4028,mp4a.40.2",FRAME-RATE=30.000,AUDIO="group_audio"',
                'stream_t2.m3u8',
                '#EXT-X-STREAM-INF:RESOLUTION=1280x720,BANDWIDTH=1600000,CODECS="avc1.4d401f,mp4a.40.2",FRAME-RATE=30.000,AUDIO="group_audio"',
                'stream_t3.m3u8',
                '',
            ].join('\n'), { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
        }
        const variant = path.match(/^manifest\/stream_t(\d)\.m3u8$/);
        if (variant) {
            const label = { 1: 'audio', 2: '1080', 3: '720' }[variant[1]];
            const complete = label !== '1080' || now.full;
            return new Response([
                '#EXTM3U',
                '#EXT-X-VERSION:6',
                '#EXT-X-TARGETDURATION:5',
                '#EXT-X-PLAYLIST-TYPE:VOD',
                `#EXT-X-MAP:URI="../../${uid}/video/${label}/init.mp4?${segmentQuery(uid)}"`,
                '#EXTINF:5.000,',
                `../../${uid}/video/${label}/seg_1.mp4?${segmentQuery(uid)}`,
                '#EXTINF:5.000,',
                `../../${uid}/video/${label}/seg_2.mp4?${segmentQuery(uid)}`,
                ...(complete ? ['#EXT-X-ENDLIST'] : []),
                '',
            ].join('\n'));
        }
        if (path === 'manifest/video.mpd') {
            return new Response(`<?xml version="1.0"?><MPD type="static" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" mediaPresentationDuration="PT30S"><Period id="0"><AdaptationSet mimeType="video/mp4" contentType="video"><SegmentTemplate media="../../${uid}/video/$RepresentationID$/seg_$Number$.mp4?${segmentQuery(uid).replace('&', '&amp;')}" initialization="init.mp4"/><Representation id="1080" width="1920" height="1080" bandwidth="6000000" codecs="avc1.4d4028"/><Representation id="720" width="1280" height="720" bandwidth="1600000" codecs="avc1.4d401f"/></AdaptationSet><AdaptationSet mimeType="audio/mp4" contentType="audio"><Representation id="audio" bandwidth="128000" codecs="mp4a.40.2"/></AdaptationSet></Period></MPD>`);
        }
        if (path === 'thumbnails/thumbnail.jpg') {
            const width = Number(url.searchParams.get('width') ?? 640);
            return new Response(jpeg(width, Math.round(width * 9 / 16)), { headers: { 'content-type': 'image/jpeg' } });
        }
        return new Response('nf', { status: 404 });
    }

    function schedule(video) {
        pending.push({ at: clock.t + 500, uid: video.uid, attempt: 0, body: null });
        pending.push({ at: clock.t + 2000, uid: video.uid, attempt: 0, body: null });
    }

    // Retries resend the same body, signed with whatever secret is current.
    async function tick() {
        const due = pending.filter((event) => event.at <= clock.t);
        pending = pending.filter((event) => event.at > clock.t);
        for (const event of due) {
            const video = videos.get(event.uid);
            if (!video || !webhook) continue;
            const body = event.body ?? JSON.stringify(videoObject(video));
            const headers = {
                'webhook-signature': signWebhook(body, webhook.secret, Math.floor(clock.t / 1000)),
                'user-agent': 'Cloudflare Stream Webhook',
            };
            const status = await deliver(body, headers);
            if (status !== 200 && event.attempt < 4) pending.push({ ...event, body, at: clock.t + 60_000, attempt: event.attempt + 1 });
        }
    }

    function tusPatch(video, headers, init) {
        assert.equal(headers['content-type'], 'application/offset+octet-stream');
        assert.equal(headers['tus-resumable'], '1.0.0');
        assert.equal(Number(headers['upload-offset']), video.offset);
        const length = init.body.byteLength;
        if (behaviour.failPatchAlways || patchFailures > 0) {
            patchFailures -= 1;
            return json(500, null, { success: false, errors: [{ code: 10000, message: 'transient' }] });
        }
        if (video.offset + length < video.length && length % TUS_CHUNK_MULTIPLE !== 0) {
            return json(400, null, { success: false, errors: [{ code: 10031, message: 'chunk size' }] });
        }
        if (video.overTier) return json(413, null, { success: false, errors: [{ code: 10011, message: 'storage capacity exceeded' }] });
        video.offset += length;
        if (video.offset >= video.length && video.uploadedAt === null) {
            video.uploadedAt = clock.t;
            schedule(video);
        }
        return new Response(null, { status: 204, headers: { 'upload-offset': String(video.offset) } });
    }

    function createVideo(url, headers) {
        assert.equal(url.search, '?direct_user=true');
        assert.equal(headers['tus-resumable'], '1.0.0');
        assert.match(headers['upload-length'], /^[1-9][0-9]*$/);
        const metadata = Object.fromEntries(headers['upload-metadata'].split(',').map((pair) => {
            const [key, value] = pair.split(' ');
            return [key, value === undefined ? null : Buffer.from(value, 'base64').toString('utf8')];
        }));
        if (behaviour.rejectCreateName && metadata.name.endsWith(behaviour.rejectCreateName)) {
            return json(400, null, { success: false, errors: [{ code: 10005, message: 'rejected' }] });
        }
        const maxDuration = Number(metadata.maxDurationSeconds);
        const overTier = used() + maxDuration / 60 > 1000;
        if (overTier && !behaviour.overTierAccept) {
            return json(413, null, { success: false, errors: [{ code: 10011, message: 'storage capacity exceeded' }] });
        }
        sequence += 1;
        const uid = sequence.toString(16).padStart(32, '0');
        const meta = {};
        for (const [key, value] of Object.entries(metadata)) {
            if (!['maxDurationSeconds', 'requiresignedurls', 'expiry'].includes(key)) meta[key] = value;
        }
        videos.set(uid, {
            uid,
            meta,
            maxDuration,
            overTier,
            expiry: metadata.expiry ? Date.parse(metadata.expiry) : null,
            length: Number(headers['upload-length']),
            offset: 0,
            uploadedAt: null,
            createdAt: clock.t,
            portrait: meta.name.includes('portrait'),
        });
        live += 1;
        maxLive = Math.max(maxLive, live);
        const location = behaviour.brokenCreate ? {} : { location: `https://upload.cloudflarestream.com/tus/${uid}?tusv2=true` };
        return new Response(null, { status: 201, headers: { ...location, 'stream-media-id': uid } });
    }

    async function fetchImpl(input, init = {}) {
        const url = new URL(input);
        const method = init.method ?? 'GET';
        const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
        calls.push({ method, url: url.toString(), authorized: headers.authorization === `Bearer ${API_TOKEN}` });
        if (url.host === `customer-${CODE}.cloudflarestream.com`) {
            assert.equal(headers.authorization, undefined, 'playback requests never carry the API token');
            return playback(url);
        }
        if (url.host === 'upload.cloudflarestream.com') {
            const video = videos.get(url.pathname.split('/').pop());
            if (!video) return new Response(null, { status: 404 });
            if (method === 'HEAD') {
                return new Response(null, { status: 200, headers: { 'upload-offset': String(video.offset), 'upload-length': String(video.length), 'tus-resumable': '1.0.0' } });
            }
            return tusPatch(video, headers, init);
        }
        assert.ok(url.toString().startsWith(API), `unexpected host ${url}`);
        assert.equal(headers.authorization, `Bearer ${API_TOKEN}`);
        const path = url.pathname.slice(new URL(API).pathname.length);
        if (path === '' && method === 'POST') return createVideo(url, headers);
        if (path === '/storage-usage') {
            return json(200, { creator: null, totalStorageMinutes: used(), totalStorageMinutesLimit: behaviour.limit ?? 1000, videoCount: videos.size });
        }
        if (path === '/webhook') {
            if (method === 'PUT') {
                webhook = { notificationUrl: JSON.parse(init.body).notificationUrl, secret: randomBytes(16).toString('hex') };
                secretsSeen.push(webhook.secret);
                const result = behaviour.webhookPutNoSecret
                    ? { notificationUrl: webhook.notificationUrl }
                    : { ...webhook, modified: new Date(clock.t).toISOString() };
                return json(200, result);
            }
            if (method === 'DELETE') {
                webhook = null;
                return json(200, null);
            }
            return webhook ? json(200, { notificationUrl: webhook.notificationUrl }) : json(404, null);
        }
        if (path === '/keys' && method === 'POST') {
            const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
            const id = randomBytes(16).toString('hex');
            keys.set(id, pair.publicKey);
            publicKeys.set(id, pair.publicKey);
            const pemText = pair.privateKey.export({ type: 'pkcs1', format: 'pem' });
            const pem = Buffer.from(pemText).toString('base64');
            const jwk = Buffer.from(JSON.stringify({ ...pair.privateKey.export({ format: 'jwk' }), kid: id, alg: 'RS256' })).toString('base64');
            secretsSeen.push(pem, pemText, jwk);
            if (behaviour.brokenKey) return json(200, { id, created: new Date(clock.t).toISOString() });
            return json(200, { id, pem, jwk, created: new Date(clock.t).toISOString() });
        }
        if (path === '/keys') return json(200, [...keys.keys()].map((id) => ({ id, created: 'x' })));
        const keyMatch = path.match(/^\/keys\/([0-9a-f]+)$/);
        if (keyMatch && method === 'DELETE') {
            keys.delete(keyMatch[1]);
            return json(200, '');
        }
        const videoMatch = path.match(/^\/([0-9a-f]{32})$/);
        if (videoMatch) {
            const video = videos.get(videoMatch[1]);
            if (!video) return json(404, null);
            if (method === 'DELETE') {
                videos.delete(video.uid);
                live -= 1;
                return new Response('', { status: 200 });
            }
            return json(200, videoObject(video));
        }
        return json(404, null);
    }

    return {
        fetchImpl,
        tick,
        calls,
        secretsSeen,
        publicKeys,
        state: () => ({ videos: videos.size, keys: keys.size, webhook, maxLive }),
    };
}

function harness(behaviour = {}, { onSleep } = {}) {
    const clock = { t: Date.parse('2026-10-22T10:00:00Z') };
    const servers = {};
    const fake = createFakeStream({
        clock,
        behaviour,
        deliver: async (body, headers) => {
            if (!servers[8788]) return 599;
            return (await servers[8788]({ method: 'POST', path: '/stream-webhook', headers, body })).status;
        },
    });
    let stdout = '';
    let stderr = '';
    const deps = {
        env: ENV,
        fetchImpl: fake.fetchImpl,
        now: () => clock.t,
        sleep: async (milliseconds) => {
            await onSleep?.(milliseconds);
            clock.t += milliseconds;
            await fake.tick();
        },
        listen: async (port, handler) => {
            servers[port] = handler;
            return { port, close: async () => {} };
        },
        stdout: { write: (text) => { stdout += text; } },
        stderr: { write: (text) => { stderr += text; } },
    };
    return { clock, fake, servers, deps, output: () => ({ stdout, stderr }) };
}

async function tempDir() {
    return mkdtemp(join(tmpdir(), 'stream-probe-test-'));
}

async function sample(dir, name, bytes = 1024 * 64) {
    const file = join(dir, name);
    await writeFile(file, randomBytes(bytes));
    return file;
}

async function readAll(dir) {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath ?? entry.path, entry.name));
    return Promise.all(files.map(async (file) => ({ file, text: await readFile(file, 'utf8') })));
}

async function assertNoLeaks(dir, fake, { output } = {}) {
    const secrets = [ACCOUNT, API_TOKEN, CODE, ...fake.secretsSeen];
    const items = await readAll(dir);
    if (output) items.push({ file: 'stdout+stderr', text: `${output.stdout}${output.stderr}` });
    for (const { file, text } of items) {
        if (file.endsWith('.bin')) continue;
        for (const secret of secrets) assert.ok(!text.includes(secret), `${file} leaks a secret`);
        assert.doesNotMatch(text, JWT_RE, `${file} leaks a JWT`);
        assert.doesNotMatch(text, /-----BEGIN/, `${file} leaks a PEM`);
        if (!file.endsWith(join('p2', 'state.json'))) assert.ok(!text.includes('upload.cloudflarestream.com/tus/'), `${file} leaks a tus URL`);
    }
    return items;
}

async function readJson(dir, path) {
    return JSON.parse(await readFile(join(dir, path), 'utf8'));
}

async function setup(names, bytes) {
    const dir = await tempDir();
    const media = await tempDir();
    const files = {};
    for (const name of names) files[name] = await sample(media, name, bytes);
    return { dir, media, files };
}

// ---------------------------------------------------------------- units

test('scrubber removes credentials, codes, tokens, keys and segment signatures', () => {
    const scrubber = createScrubber();
    scrubber.register(ACCOUNT, '<ACCOUNT_ID>');
    scrubber.register(API_TOKEN, '<API_TOKEN>');
    scrubber.register('whsec-value-123', '<WEBHOOK_SECRET_A>');
    const input = [
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream Bearer ${API_TOKEN}`,
        `${PLAYBACK}/eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJlLXZhbHVl/manifest/video.m3u8`,
        '../../uid/video/720/seg_1.mp4?p=eyJ2aWRlb0lEIjoiMSJ9&s=abcdef',
        '-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----',
        'secret whsec-value-123',
    ].join('\n');
    const output = scrubber.scrubString(input);
    assert.doesNotMatch(output, new RegExp(`${ACCOUNT}|${API_TOKEN}|${CODE}|whsec-value-123|BEGIN|abcdef`));
    assert.match(output, /customer-<CUSTOMER_CODE>\.cloudflarestream\.com\/<JWT>\/manifest/);
    assert.match(output, /seg_1\.mp4\?p=<P>&s=<S>/);
    assert.deepEqual(scrubber.leaks(output), []);
    assert.deepEqual(scrubber.leaks(input).sort(), ['<ACCOUNT_ID>', '<API_TOKEN>', '<JWT>', '<PEM>', '<WEBHOOK_SECRET_A>'].sort());
});

test('webhook signature verification follows time.body HMAC-SHA256', () => {
    const body = '{"uid":"x"}';
    const header = signWebhook(body, 'secret-one', 1_790_000_000);
    assert.equal(verifyWebhookSignature(body, header, 'secret-one'), true);
    assert.equal(verifyWebhookSignature(body, header, 'secret-two'), false);
    assert.equal(verifyWebhookSignature(`${body} `, header, 'secret-one'), false);
    assert.equal(verifyWebhookSignature(body, 'time=1,sig1=zz', 'secret-one'), false);
    const expected = createHmac('sha256', 'secret-one').update(`1790000000.${body}`).digest('hex');
    assert.equal(header, `time=1790000000,sig1=${expected}`);
});

test('playlist, DASH, segment URI and JPEG parsers record the shape', () => {
    const master = parseMasterPlaylist('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="original",URI="stream_t1.m3u8"\n#EXT-X-STREAM-INF:RESOLUTION=1080x1920,BANDWIDTH=5,CODECS="avc1.64001f,mp4a.40.2",AUDIO="a"\nstream_t2.m3u8\n');
    assert.equal(master.media[0].URI, 'stream_t1.m3u8');
    assert.equal(master.streams[0].attributes.RESOLUTION, '1080x1920');
    assert.equal(master.streams[0].attributes.CODECS, 'avc1.64001f,mp4a.40.2');
    assert.equal(master.streams[0].uri, 'stream_t2.m3u8');
    const media = parseMediaPlaylist('#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:5,\nseg_1.mp4\n');
    assert.equal(media.endlist, false);
    assert.equal(media.map_uri, 'init.mp4');
    assert.equal(media.segment_count, 1);
    const uid = 'f'.repeat(32);
    const p = Buffer.from(JSON.stringify({ sub: uid, kid: 'k' })).toString('base64url');
    const described = describeMediaUri(`../../${uid}/video/1920/seg_3.mp4?p=${p}&s=aa`, `${PLAYBACK}/tok/manifest/stream_t2.m3u8`, uid);
    assert.deepEqual(described.query_params, ['p', 's']);
    assert.equal(described.path_label, '1920');
    assert.equal(described.path_shape, '/<UID>/video/1920/seg_N.mp4');
    assert.equal(described.p_sub_matches_uid, true);
    const dash = parseDash('<MPD type="static"><Period><AdaptationSet mimeType="video/mp4"><Representation id="1" width="1280" height="720" bandwidth="9"/></AdaptationSet></Period></MPD>');
    assert.equal(dash.period_count, 1);
    assert.equal(dash.adaptation_sets[0].representations[0].height, 720);
    assert.deepEqual(jpegDimensions(jpeg(320, 180)), { width: 320, height: 180 });
    assert.equal(jpegDimensions(Buffer.from('not a jpeg')), null);
});

test('browser log summary reports stall ms per renewal and hls.js error codes', () => {
    const summary = summarizeBrowserLog([
        { type: 'renewal_start', renewal: 1, mode: 'hlsjs', reason: 'scheduled', position_before: 150 },
        { type: 'renewal_manifest_parsed', renewal: 1, since_renewal_ms: 120 },
        { type: 'renewal_playing', renewal: 1, since_renewal_ms: 480 },
        { type: 'stall_end', stall_ms: 360 },
        { type: 'hls_error', error_type: 'networkError', details: 'fragLoadError', fatal: false, response_code: 401 },
        { type: 'hls_error', error_type: 'networkError', details: 'fragLoadError', fatal: false, response_code: 401 },
        { type: 'old_segment_after_old_exp', status: 401 },
        { type: 'segment_query_stripped', status: 404 },
    ]);
    assert.deepEqual(summary.renewals, [{ renewal: 1, mode: 'hlsjs', reason: 'scheduled', position_before: 150, manifest_or_metadata_ms: 120, playing_after_ms: 480 }]);
    assert.deepEqual(summary.stall_ms, { count: 1, max: 360, values: [360] });
    assert.deepEqual(summary.hls_errors, { 'networkError/fragLoadError/fatal=false/http=401': 2 });
    assert.deepEqual([summary.old_segment_after_old_exp, summary.segment_query_stripped], [[401], [404]]);
});

test('local listener binds 127.0.0.1 and records only signed POST deliveries', async () => {
    const receiver = createWebhookReceiver({ now: Date.now, sleep: async () => {} });
    receiver.addSecret('A', 'listener-secret');
    const server = await listenHttp(0, receiver.handle);
    try {
        const body = JSON.stringify({ uid: 'u', readyToStream: true, status: { state: 'ready' } });
        const url = `http://127.0.0.1:${server.port}/stream-webhook`;
        const stray = await fetch(url);
        const bad = await fetch(url, { method: 'POST', headers: { 'webhook-signature': signWebhook(body, 'other', Math.floor(Date.now() / 1000)) }, body });
        const good = await fetch(url, { method: 'POST', headers: { 'webhook-signature': signWebhook(body, 'listener-secret', Math.floor(Date.now() / 1000)) }, body });
        assert.deepEqual([stray.status, bad.status, good.status], [405, 401, 200]);
        assert.deepEqual(receiver.deliveries.map((delivery) => [delivery.n, delivery.verified_with]), [[1, ['A']]]);
        assert.equal(receiver.body(1).uid, 'u');
        assert.deepEqual(receiver.rejected, { non_post: 1, unsigned: 1 });
    } finally {
        await server.close();
    }
});

test('renewal page loads pinned hls.js with SRI, loops, replays after renewal and holds no token', () => {
    const html = renderRenewalPage({ ttlSeconds: 180, renewBeforeSeconds: 30 });
    assert.match(html, new RegExp(`hls\\.js@${HLS_JS_VERSION.replace(/\./g, '\\.')}/dist/hls\\.min\\.js`));
    assert.ok(html.includes(`integrity="${HLS_JS_INTEGRITY}"`));
    assert.match(html, /<video [^>]*\bloop\b/);
    assert.match(html, /video\.loop = true/);
    assert.match(html, /video\.currentTime = position;\n\s+video\.play\(\)/);
    assert.match(html, /hls\.loadSource\(current\.url\)/);
    assert.doesNotMatch(html, JWT_RE);
});

// ---------------------------------------------------------------- CLI gates

test('live subcommands need STREAM_PROBE_MUTATIONS=true, then both credentials (real process)', async () => {
    const dir = await tempDir();
    const args = [SCRIPT, 'manifests', '--out', dir, '--landscape', 'a', '--portrait', 'b', '--webhook-url', WEBHOOK];
    const ungated = spawnSync(process.execPath, args, { env: { PATH: process.env.PATH, ...ENV, STREAM_PROBE_MUTATIONS: '' }, encoding: 'utf8' });
    assert.equal(ungated.status, 2);
    assert.match(ungated.stderr, /STREAM_PROBE_MUTATIONS=true/);
    const noCredentials = spawnSync(process.execPath, args, { env: { PATH: process.env.PATH, STREAM_PROBE_MUTATIONS: 'true' }, encoding: 'utf8' });
    assert.equal(noCredentials.status, 2);
    assert.match(noCredentials.stderr, /STREAM_ACCOUNT_ID and STREAM_API_TOKEN must be set/);
    const dry = spawnSync(process.execPath, [...args, '--dry-run'], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
    assert.equal(dry.status, 0, dry.stderr);
});

test('--out is required and must sit outside the repository, symlinks included', async () => {
    const { deps } = harness();
    assert.equal(await runCli(['cleanup'], deps), 2);
    const inside = fileURLToPath(new URL('../tmp-probe-out', import.meta.url));
    assert.equal(await runCli(['cleanup', '--out', inside, '--dry-run'], deps), 2);
    const linkDir = await tempDir();
    const link = join(linkDir, 'repo-link');
    await symlink(fileURLToPath(new URL('.', import.meta.url)), link);
    assert.equal(await runCli(['cleanup', '--out', join(link, 'probe-out'), '--dry-run'], deps), 2);
});

test('a corrupt ledger fails closed instead of being treated as empty', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'ledger.json'), '{not json');
    const { deps, fake } = harness();
    assert.equal(await runCli(['cleanup', '--out', dir], deps), 2);
    assert.equal(fake.calls.length, 0);
});

test('dry run validates required options, prints placeholders and makes no network call', async () => {
    const dir = await tempDir();
    const options = {
        manifests: ['--landscape', 'l.mp4', '--portrait', 'p.mp4', '--webhook-url', WEBHOOK],
        'head-lifetime': ['--sample', 's.mp4'],
        storage: ['--allow-quota-fill'],
        webhooks: ['--sample', 's.mp4', '--webhook-url', WEBHOOK],
        'renewal-page': ['--sample', 's.mp4'],
        containers: ['--samples-dir', 'd'],
        'ready-timing': ['--sample', 's.mp4', '--webhook-url', WEBHOOK],
        keys: ['--sample', 's.mp4'],
        thumbnails: ['--uid', 'f'.repeat(32), '--billing-phase', 'range', '--skip-matrix'],
        'signing-key': ['--signing-key-file', '/tmp/k.json'],
        cleanup: [],
        samples: [],
    };
    for (const [sub, extra] of Object.entries(options)) {
        let printed = '';
        let errors = '';
        const run = (args) => runCli([sub, '--out', dir, '--dry-run', ...args], {
            env: {},
            fetchImpl: () => assert.fail('dry run must not fetch'),
            stdout: { write: (text) => { printed += text; } },
            stderr: { write: (text) => { errors += text; } },
        });
        assert.equal(await run(extra), 0, `${sub}: ${errors}`);
        assert.ok(!printed.includes(ACCOUNT) && !printed.includes(API_TOKEN), sub);
        assert.match(printed, /dry run, no network/);
        if (extra.length) assert.equal(await run([]), 2, `${sub} without its options`);
    }
    assert.deepEqual(missingOptions('storage', {}), ['--allow-quota-fill']);
    assert.deepEqual(missingOptions('head-lifetime', { 'resume-at': '3h' }), ['--resume-at 2h|12h|expiry|25h']);
    assert.match(planFor('webhooks', {}).map((step) => step.join(' ')).join('\n'), /while the retry is pending/);
});

test('samples prints exact ffmpeg commands for every container and the long source', async () => {
    const dir = await tempDir();
    const { deps, output } = harness();
    assert.equal(await runCli(['samples', '--out', dir], deps), 0);
    const { stdout } = output();
    for (const container of CONTAINERS) assert.match(stdout, new RegExp(`container-10s\\.${container}`));
    assert.match(stdout, /testsrc2=size=1080x1920/);
    assert.match(stdout, /long-1080p-600s\.mp4/);
    assert.equal(sampleCommands().length, CONTAINERS.length + 3);
});

test('samples --generate gives ffmpeg a minimal environment without credentials', async () => {
    const dir = await tempDir();
    const { deps } = harness();
    const spawned = [];
    deps.spawn = (command, args, options) => {
        spawned.push({ command, env: options.env });
        return { on: (event, handler) => event === 'exit' && setImmediate(() => handler(0)) };
    };
    assert.equal(await runCli(['samples', '--out', dir, '--generate'], deps), 0);
    assert.equal(spawned.length, sampleCommands().length);
    assert.deepEqual(Object.keys(spawned[0].env).sort(), ['HOME', 'PATH']);
});

// ---------------------------------------------------------------- proofs

test('manifests (P1) records ready-time shape, scrubs every file and cleans up', async () => {
    const { dir, files } = await setup(['landscape.mp4', 'portrait.mp4']);
    const { deps, fake, output } = harness();
    const code = await runCli(['manifests', '--out', dir, '--landscape', files['landscape.mp4'], '--portrait', files['portrait.mp4'], '--webhook-url', WEBHOOK], deps);
    assert.equal(code, 0, output().stderr);
    const receipt = await readJson(dir, 'p1/receipt.json');
    assert.equal(receipt.status, 'completed');
    assert.equal(receipt.samples.length, 2);
    const [land, port] = receipt.samples;
    assert.equal(land.outcome, 'ready');
    assert.equal(land.timeline.ready_snapshot_source, 'webhook body');
    assert.equal(land.comparison.classification_at_ready['video:1920x1080'], 'listed-without-endlist');
    assert.equal(land.comparison.classification_at_ready['video:1280x720'], 'listed-with-endlist');
    assert.equal(land.comparison.classification_later['video:1920x1080'], 'listed-without-endlist');
    assert.equal(land.manifests.all_renditions_complete.all_variants_complete, true);
    assert.deepEqual(land.comparison.absent_at_ready, []);
    assert.ok(land.timeline.all_renditions_complete_after_last_patch_ms >= land.timeline.pct100_after_last_patch_ms);
    assert.deepEqual(land.manifests.at_ready_webhook.variants[1].first_segment.query_params, ['p', 's']);
    assert.equal(land.manifests.at_ready_webhook.dash.adaptation_sets.length, 2);
    assert.deepEqual(land.video_at_ready_webhook.meta, { name: 'youtick-m0-p1-landscape', filename: 'landscape.mp4', filetype: 'video/mp4' });
    assert.deepEqual(port.rendition_set.source, { width: 1080, height: 1920 });
    assert.ok(receipt.hosts.includes('customer-<CUSTOMER_CODE>.cloudflarestream.com'));
    const master = await readFile(join(dir, 'p1/landscape/at-ready-webhook/master.m3u8'), 'utf8');
    assert.match(master, /#EXT-X-STREAM-INF/);
    const variant = await readFile(join(dir, 'p1/landscape/at-ready-webhook/variant-1-video-1920x1080.m3u8'), 'utf8');
    assert.match(variant, /seg_1\.mp4\?p=<P>&s=<S>/);
    assert.deepEqual(fake.state().maxLive, 1);
    assert.deepEqual([fake.state().videos, fake.state().keys, fake.state().webhook], [0, 0, null]);
    const ledger = await readJson(dir, 'ledger.json');
    assert.deepEqual([ledger.videos, ledger.keys, ledger.webhook], [[], [], false]);
    await assertNoLeaks(dir, fake, { output: output() });
});

test('manifests refuses a webhook slot that holds another URL and leaves it alone', async () => {
    const { dir, files } = await setup(['l.mp4', 'p.mp4']);
    const { deps, fake, output } = harness({ preWebhook: 'https://someone-else.example/hook' });
    assert.equal(await runCli(['manifests', '--out', dir, '--landscape', files['l.mp4'], '--portrait', files['p.mp4'], '--webhook-url', WEBHOOK], deps), 1);
    assert.match(output().stderr, /webhook_slot_in_use_pass_replace_webhook/);
    assert.equal(fake.state().webhook.notificationUrl, 'https://someone-else.example/hook');
    assert.equal((await readJson(dir, 'p1/receipt.json')).status, 'aborted');
});

test('a webhook PUT without a secret is still tracked and deleted', async () => {
    const { dir, files } = await setup(['l.mp4', 'p.mp4']);
    const { deps, fake, output } = harness({ webhookPutNoSecret: true });
    assert.equal(await runCli(['manifests', '--out', dir, '--landscape', files['l.mp4'], '--portrait', files['p.mp4'], '--webhook-url', WEBHOOK], deps), 1);
    assert.match(output().stderr, /stream_webhook_put_failed_200/);
    assert.equal(fake.state().webhook, null);
});

test('--keep leaves the key, webhook and video in place; cleanup removes them', async () => {
    const { dir, files } = await setup(['long.mp4']);
    const { deps, fake } = harness();
    assert.equal(await runCli(['ready-timing', '--out', dir, '--sample', files['long.mp4'], '--webhook-url', WEBHOOK, '--keep'], deps), 0);
    assert.deepEqual([fake.state().videos, fake.state().keys, fake.state().webhook !== null], [1, 1, true]);
    const receipt = await readJson(dir, 'p7/receipt.json');
    assert.equal(receipt.exceeds_verification_cycle_10_min, false);
    assert.ok(receipt.inprogress_webhooks.length >= 1);
    assert.equal((await readJson(dir, 'ledger.json')).videos.length, 1);
    assert.equal(await runCli(['cleanup', '--out', dir], deps), 0);
    assert.deepEqual([fake.state().videos, fake.state().keys, fake.state().webhook], [0, 0, null]);
    await assertNoLeaks(dir, fake);
});

test('a 201 without Location still deletes the reservation and writes an aborted receipt', async () => {
    const { dir, files } = await setup(['clip.mp4']);
    const { deps, fake, output } = harness({ brokenCreate: true });
    assert.equal(await runCli(['keys', '--out', dir, '--sample', files['clip.mp4']], deps), 1);
    assert.match(output().stderr, /stream_upload_create_without_location/);
    assert.equal(fake.state().videos, 0);
    const receipt = await readJson(dir, 'p8/receipt.json');
    assert.deepEqual([receipt.status, receipt.error], ['aborted', 'stream_upload_create_without_location']);
    assert.equal((await readJson(dir, 'p8/cleanup.json')).videos[0].status, 200);
});

test('a key response without pem is still tracked and deleted', async () => {
    const { dir, files } = await setup(['clip.mp4']);
    const { deps, fake, output } = harness({ brokenKey: true });
    assert.equal(await runCli(['keys', '--out', dir, '--sample', files['clip.mp4']], deps), 1);
    assert.match(output().stderr, /stream_key_create_failed_200/);
    assert.deepEqual([fake.state().videos, fake.state().keys], [0, 0]);
});

test('a transient PATCH failure resumes from HEAD; a persistent one aborts and cleans up', async () => {
    const once = await setup(['clip.mp4']);
    const flaky = harness({ failPatchOnce: true });
    assert.equal(await runCli(['keys', '--out', once.dir, '--sample', once.files['clip.mp4']], flaky.deps), 0, flaky.output().stderr);
    assert.match(flaky.output().stdout, /1 HEAD resume/);
    const always = await setup(['clip.mp4']);
    const broken = harness({ failPatchAlways: true });
    assert.equal(await runCli(['keys', '--out', always.dir, '--sample', always.files['clip.mp4']], broken.deps), 1);
    assert.match(broken.output().stderr, /tus_patch_failed_500_after_resume/);
    assert.equal(broken.fake.state().videos, 0);
});

test('storage (P3) refuses without --allow-quota-fill', async () => {
    const dir = await tempDir();
    const { deps, fake, output } = harness();
    assert.equal(await runCli(['storage', '--out', dir], deps), 2);
    assert.match(output().stderr, /--allow-quota-fill/);
    assert.equal(fake.calls.length, 0);
});

test('storage (P3) confirms visibility, records release, expiry drop and exhaustion, then deletes every reservation', async () => {
    const { dir, files } = await setup(['big.mp4'], 6 * 1024 * 1024);
    const { deps, fake, output } = harness();
    assert.equal(await runCli(['storage', '--out', dir, '--allow-quota-fill', '--sample', files['big.mp4']], deps), 0, output().stderr);
    const receipt = await readJson(dir, 'p3/receipt.json');
    assert.deepEqual(receipt.baseline.field_names, ['creator', 'totalStorageMinutes', 'totalStorageMinutesLimit', 'videoCount']);
    assert.equal(receipt.delete_release.reservation_visible, true);
    assert.equal(receipt.delete_release.release.reached, true);
    assert.equal(receipt.mid_upload_delete.sent_bytes, 5 * 1024 * 1024);
    assert.equal(receipt.expiry_without_delete.reservation_visible, true);
    assert.equal(receipt.expiry_without_delete.dropped_without_delete, true);
    assert.ok(receipt.expiry_without_delete.drop_relative_to_expiry_ms >= 0);
    assert.deepEqual([receipt.exhaustion.observed, receipt.exhaustion.refused_at, receipt.exhaustion.response.status], [true, 'create', 413]);
    assert.equal(receipt.exhaustion.response.body.errors[0].code, 10011);
    assert.ok(receipt.exhaustion.attempts.every((attempt) => attempt.requested_seconds <= 36000));
    assert.equal(fake.state().videos, 0);
    await assertNoLeaks(dir, fake, { output: output() });
});

test('storage (P3) records an over-tier reservation that the API accepts but the upload refuses', async () => {
    const dir = await tempDir();
    const { deps, fake, output } = harness({ overTierAccept: true });
    assert.equal(await runCli(['storage', '--out', dir, '--allow-quota-fill'], deps), 0, output().stderr);
    const receipt = await readJson(dir, 'p3/receipt.json');
    assert.equal(receipt.exhaustion.over_tier_reservation_accepted_at_creation, true);
    assert.equal(receipt.exhaustion.refused_at, 'patch');
    assert.equal(receipt.exhaustion.response.status, 413);
    assert.equal(fake.state().videos, 0);
});

test('storage (P3) refuses to fill a limit above the Starter tier', async () => {
    const dir = await tempDir();
    const { deps, fake } = harness({ limit: 10_000 });
    assert.equal(await runCli(['storage', '--out', dir, '--allow-quota-fill'], deps), 0);
    const receipt = await readJson(dir, 'p3/receipt.json');
    assert.match(receipt.exhaustion.skipped, /fill refused/);
    assert.equal(fake.calls.filter((call) => call.method === 'POST').length, 2);
});

test('webhooks (P4) rotates during a pending retry and records retries, skew and meta routing', async () => {
    const { dir, files } = await setup(['clip.mp4']);
    const { deps, fake, output } = harness({ failName: '-rotation' });
    assert.equal(await runCli(['webhooks', '--out', dir, '--sample', files['clip.mp4'], '--webhook-url', `${WEBHOOK}/hook`], deps), 0, output().stderr);
    const receipt = await readJson(dir, 'p4/receipt.json');
    assert.equal(receipt.get_after_put.secret_present, false);
    assert.equal(receipt.rotation.first_delivery.answered, 503);
    assert.equal(receipt.rotation.same_url_put_rotates_secret, true);
    assert.equal(receipt.rotation.retry_same_body, true);
    assert.equal(receipt.rotation.retry_after_s, 60);
    assert.deepEqual([receipt.rotation.old_secret_verifies_retry, receipt.rotation.new_secret_verifies_retry], [false, true]);
    assert.deepEqual(receipt.retry.ready_deliveries.map((delivery) => delivery.answered), [503, 503, 200]);
    assert.ok(receipt.retry.ready_deliveries.every((delivery) => delivery.same_body_as_first && delivery.body_sha256 && delivery.header_time));
    assert.deepEqual(receipt.retry.intervals_s, [60, 60]);
    assert.equal(receipt.skew_s.max, 0);
    assert.equal(receipt.inprogress.count, 1);
    assert.equal(receipt.upload.echoed_max_duration_seconds, 7200);
    assert.equal(receipt.meta_routing.landed.jobId.in_get_meta_as, 'jobId');
    assert.equal(receipt.meta_routing.landed['meta.jobId'].in_webhook_meta_as, 'meta.jobId');
    assert.ok(receipt.upload.sent_metadata_keys.includes('expiry'));
    const expiryOffset = Date.parse(receipt.upload.sent_expiry) - Date.parse(receipt.started_at);
    assert.ok(expiryOffset >= (5 * 60 + 55) * 60_000 && expiryOffset < 6 * 3_600_000, `expiry offset ${expiryOffset}`);
    assert.deepEqual([fake.state().videos, fake.state().webhook], [0, null]);
    await assertNoLeaks(dir, fake, { output: output() });
});

test('containers (P6) survives a rejected create, uses the error webhook, one video at a time', async () => {
    const dir = await tempDir();
    const media = await tempDir();
    for (const container of CONTAINERS.filter((name) => name !== 'wmv')) await sample(media, `container-10s.${container}`);
    const { deps, fake, output } = harness({ failName: '-flv', rejectCreateName: '-avi' });
    assert.equal(await runCli(['containers', '--out', dir, '--samples-dir', media, '--webhook-url', WEBHOOK], deps), 0, output().stderr);
    const receipt = await readJson(dir, 'p6/receipt.json');
    const outcome = Object.fromEntries(receipt.results.map((entry) => [entry.container, entry.outcome]));
    assert.deepEqual(outcome, { mp4: 'ready', mov: 'ready', avi: 'upload_failed', webm: 'ready', wmv: 'sample_missing', mkv: 'ready', flv: 'error' });
    const flv = receipt.results.find((entry) => entry.container === 'flv');
    assert.deepEqual([flv.outcome_source, flv.video.error_reason_code], ['webhook', 'ERR_NON_VIDEO']);
    assert.equal(receipt.results.find((entry) => entry.container === 'avi').error, 'stream_upload_create_failed_400');
    assert.equal(receipt.results.find((entry) => entry.container === 'webm').video.meta.filetype, 'video/webm');
    assert.deepEqual([fake.state().maxLive, fake.state().videos, fake.state().webhook], [1, 0, null]);
});

test('keys (P8) records PEM format, overlap, claim variants including nbf, and revocation of key A', async () => {
    const { dir, files } = await setup(['clip.mp4']);
    const { deps, fake, output } = harness();
    assert.equal(await runCli(['keys', '--out', dir, '--sample', files['clip.mp4']], deps), 0, output().stderr);
    const receipt = await readJson(dir, 'p8/receipt.json');
    assert.equal(receipt.create_response_shape.pem_format, 'pkcs1');
    assert.equal(receipt.create_response_shape.pem_encoding, 'base64-of-pem');
    assert.equal(receipt.create_response_shape.jwk.kid_matches_id, true);
    assert.deepEqual(receipt.overlap, { key_a_master: 200, key_b_master: 200 });
    assert.equal(receipt.claims_with_key_b.default_sub_kid_exp_nbf_minus_60, 200);
    assert.equal(receipt.claims_with_key_b.without_nbf, 200);
    assert.equal(receipt.claims_with_key_b.nbf_in_future, 401);
    assert.equal(receipt.claims_with_key_b.without_exp, 401);
    assert.equal(receipt.claims_with_key_b.without_payload_kid, 200);
    assert.equal(receipt.revocation.final_key_a_status, 401);
    assert.equal(receipt.revocation.key_b_stayed_200, true);
    assert.equal(receipt.list_after.private_material_in_list, false);
    assert.deepEqual([fake.state().videos, fake.state().keys], [0, 0]);
    await assertNoLeaks(dir, fake, { output: output() });
});

test('thumbnails (P9) records time/width under a path token; --skip-matrix runs only the billing phase', async () => {
    const { dir, files } = await setup(['clip.mp4']);
    const { deps, fake, output } = harness();
    assert.equal(await runCli(['thumbnails', '--out', dir, '--sample', files['clip.mp4'], '--billing-phase', 'range', '--repeats', '5'], deps), 0, output().stderr);
    const receipt = await readJson(dir, 'p9/receipt.json');
    const width = receipt.matrix.find((entry) => entry.name === 'width');
    assert.deepEqual([width.status, width.content_type, width.jpeg_dimensions.width], [200, 'image/jpeg', 320]);
    assert.equal(receipt.unsigned_with_query.status, 401);
    assert.deepEqual(receipt.billing.statuses, { 206: 5 });
    assert.equal(receipt.range_first_response.content_range, 'bytes 0-0/1000');
    assert.deepEqual([fake.state().videos, fake.state().keys], [0, 0]);
    await assertNoLeaks(dir, fake, { output: output() });

    const second = await setup(['clip.mp4']);
    const run = harness();
    assert.equal(await runCli(['thumbnails', '--out', second.dir, '--sample', second.files['clip.mp4'], '--billing-phase', 'thumbnails', '--repeats', '3', '--skip-matrix'], run.deps), 0);
    const billingOnly = await readJson(second.dir, 'p9/receipt.json');
    assert.equal(billingOnly.matrix, 'skipped (--skip-matrix)');
    assert.deepEqual(billingOnly.billing.statuses, { 200: 3 });
    assert.equal(run.fake.calls.filter((call) => call.url.includes('/thumbnails/')).length, 3);
});

test('head-lifetime (P2) keeps the video, validates --resume-at, refuses early checkpoints, deletes at 25 h', async () => {
    const { dir, files } = await setup(['clip.mp4']);
    const first = harness();
    assert.equal(await runCli(['head-lifetime', '--out', dir, '--sample', files['clip.mp4']], first.deps), 0, first.output().stderr);
    assert.equal(first.fake.state().videos, 1);
    const state = await readFile(join(dir, 'p2/state.json'), 'utf8');
    assert.match(state, /"upload_url": "https:\/\/upload\.cloudflarestream\.com\/tus\/[0-9a-f]{32}\?tusv2=true"/);
    let receipt = await readJson(dir, 'p2/receipt.json');
    assert.equal(receipt.checkpoints['at-ready'].head.status, 200);
    assert.equal(receipt.upload_url, undefined);
    assert.equal(await runCli(['head-lifetime', '--out', dir, '--resume-at', '3h'], first.deps), 2);
    assert.equal(await runCli(['head-lifetime', '--out', dir, '--resume-at', '2h'], first.deps), 1);
    assert.match(first.output().stderr, /not_due_until/);
    first.clock.t += 2 * 3_600_000 + 60_000;
    assert.equal(await runCli(['head-lifetime', '--out', dir, '--resume-at', '2h'], first.deps), 0);
    first.clock.t += 23 * 3_600_000;
    assert.equal(await runCli(['head-lifetime', '--out', dir, '--resume-at', '25h'], first.deps), 0, first.output().stderr);
    receipt = await readJson(dir, 'p2/receipt.json');
    assert.equal(receipt.checkpoints['2h'].head.status, 200);
    assert.equal(receipt.checkpoints['25h'].after_upload_expiry, true);
    assert.equal(receipt.checkpoints['25h'].delete_status, 200);
    assert.equal(first.fake.state().videos, 0);
    await assertNoLeaks(dir, first.fake);
});

test('a live video in the ledger blocks a second upload (one video at a time)', async () => {
    const { dir, files } = await setup(['clip.mp4']);
    const { deps, output } = harness();
    assert.equal(await runCli(['head-lifetime', '--out', dir, '--sample', files['clip.mp4']], deps), 0);
    assert.equal(await runCli(['keys', '--out', dir, '--sample', files['clip.mp4']], deps), 1);
    assert.match(output().stderr, /ledger_has_live_video/);
});

test('renewal page (P5) checks Host, mints path tokens with nbf, and writes a renewal summary', async () => {
    const { dir, files } = await setup(['clip.mp4']);
    let page = null;
    const local = { host: '127.0.0.1:8790' };
    const bound = harness({}, {
        onSleep: async (milliseconds) => {
            if (milliseconds !== 60_000 || !page) return;
            const post = (entry) => page({ method: 'POST', path: '/log', headers: local, body: JSON.stringify(entry) });
            await post({ type: 'renewal_start', renewal: 1, mode: 'hlsjs', reason: 'scheduled', position_before: 12 });
            await post({ type: 'renewal_playing', renewal: 1, since_renewal_ms: 300 });
            await post({ type: 'stall_end', stall_ms: 250 });
            await post({ type: 'hls_error', error_type: 'networkError', details: 'fragLoadError', fatal: false, response_code: 401 });
        },
    });
    const { deps, fake, servers, output } = bound;
    const originalListen = deps.listen;
    deps.listen = async (port, handler) => {
        if (port === 8790) page = handler;
        return originalListen(port, handler);
    };
    assert.equal(await runCli(['renewal-page', '--out', dir, '--sample', files['clip.mp4'], '--duration-minutes', '1', '--token-ttl', '20', '--renew-before', '5'], deps), 0, output().stderr);
    const handler = servers[8790];
    assert.equal((await handler({ method: 'GET', path: '/token', headers: { host: 'evil.example' }, body: '' })).status, 403);
    const served = await handler({ method: 'GET', path: '/', headers: local, body: '' });
    assert.match(served.body, /Stream renewal probe/);
    const minted = JSON.parse((await handler({ method: 'GET', path: '/token', headers: { host: 'localhost:8790' }, body: '' })).body);
    const token = new URL(minted.url).pathname.split('/')[1];
    const [header, payload, signature] = token.split('.');
    const kid = JSON.parse(Buffer.from(header, 'base64url').toString()).kid;
    assert.ok(cryptoVerify('sha256', Buffer.from(`${header}.${payload}`), fake.publicKeys.get(kid), Buffer.from(signature, 'base64url')));
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const nowSeconds = Math.floor(deps.now() / 1000);
    assert.deepEqual([claims.exp - nowSeconds, nowSeconds - claims.nbf], [20, 60]);
    const receipt = await readJson(dir, 'p5/receipt.json');
    assert.deepEqual(receipt.summary.renewals[0], { renewal: 1, mode: 'hlsjs', reason: 'scheduled', position_before: 12, manifest_or_metadata_ms: null, playing_after_ms: 300 });
    assert.deepEqual(receipt.summary.stall_ms.values, [250]);
    assert.deepEqual(receipt.summary.hls_errors, { 'networkError/fragLoadError/fatal=false/http=401': 1 });
    assert.equal(receipt.renew_before_seconds, 5);
    assert.deepEqual([fake.state().videos, fake.state().keys], [0, 0]);
    await assertNoLeaks(dir, fake, { output: output() });

    const tooLate = harness();
    assert.equal(await runCli(['renewal-page', '--out', await tempDir(), '--sample', files['clip.mp4'], '--token-ttl', '20', '--renew-before', '20'], tooLate.deps), 1);
    assert.equal(tooLate.fake.calls.length, 0);
});

test('signing-key checks the path first, keeps the owner key out of cleanup, deletes on --delete', async () => {
    const dir = await tempDir();
    const { deps, fake, output } = harness();
    const inside = fileURLToPath(new URL('./owner-key.json', import.meta.url));
    assert.equal(await runCli(['signing-key', '--out', dir, '--signing-key-file', inside], deps), 1);
    assert.match(output().stderr, /outside_the_repository/);
    const keyDir = await tempDir();
    const existing = join(keyDir, 'existing.json');
    await writeFile(existing, '{}');
    assert.equal(await runCli(['signing-key', '--out', dir, '--signing-key-file', existing], deps), 1);
    assert.match(output().stderr, /signing_key_file_exists/);
    assert.equal(fake.calls.length, 0, 'no provider write before the path checks pass');
    const target = join(keyDir, 'key.json');
    assert.equal(await runCli(['signing-key', '--out', dir, '--signing-key-file', target], deps), 0);
    assert.equal(fake.state().keys, 1);
    assert.equal(await runCli(['cleanup', '--out', dir], deps), 0);
    assert.equal(fake.state().keys, 1, 'cleanup leaves the owner key');
    assert.equal(typeof JSON.parse(await readFile(target, 'utf8')).pem, 'string');
    assert.equal(await runCli(['signing-key', '--out', dir, '--signing-key-file', target, '--delete'], deps), 0);
    assert.equal(fake.state().keys, 0);
    assert.deepEqual((await readJson(dir, 'ledger.json')).owner_keys, []);
    await assertNoLeaks(dir, fake, { output: output() });
});

test('package.json exposes probe:stream and the provider-canary glob picks up this test', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(pkg.scripts['probe:stream'], 'node scripts/stream-probe.mjs');
    assert.equal(pkg.scripts['test:provider-canary'], 'node --test scripts/*.test.mjs');
});
