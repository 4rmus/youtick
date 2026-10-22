import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac, generateKeyPairSync, randomBytes, verify as cryptoVerify } from 'node:crypto';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    CONTAINERS,
    HLS_JS_VERSION,
    createScrubber,
    createWebhookReceiver,
    describeMediaUri,
    listenHttp,
    jpegDimensions,
    parseDash,
    parseMasterPlaylist,
    parseMediaPlaylist,
    planFor,
    renderRenewalPage,
    runCli,
    sampleCommands,
    signWebhook,
    verifyWebhookSignature,
} from './stream-probe.mjs';

const SCRIPT = fileURLToPath(new URL('./stream-probe.mjs', import.meta.url));
const ACCOUNT = '0123456789abcdef0123456789abcdef';
const API_TOKEN = 'test-stream-api-token-0123456789';
const CODE = 'custcode1234xyz';
const ENV = { STREAM_ACCOUNT_ID: ACCOUNT, STREAM_API_TOKEN: API_TOKEN };
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream`;
const PLAYBACK = `https://customer-${CODE}.cloudflarestream.com`;
const JWT_RE = /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{8,}/;

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

function createFakeStream({ clock, deliver, failName = null }) {
    const videos = new Map();
    const keys = new Map();
    const publicKeys = new Map();
    const secretsSeen = [];
    const calls = [];
    let webhook = null;
    let sequence = 0;
    let live = 0;
    let maxLive = 0;
    let pending = [];

    const used = () => [...videos.values()].reduce((sum, video) => {
        if (video.uploadedAt !== null) return sum + 0.5;
        if (video.expiry && clock.t > video.expiry) return sum;
        return sum + video.maxDuration / 60;
    }, 0);

    function progress(video) {
        if (video.uploadedAt === null) return { state: 'pendingupload', pct: 0, ready: false, full: false };
        const elapsed = clock.t - video.uploadedAt;
        if (failName && video.meta.name.endsWith(failName) && elapsed >= 2000) {
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
        pending.push({ at: clock.t + 500, uid: video.uid, attempt: 0 });
        pending.push({ at: clock.t + 2000, uid: video.uid, attempt: 0 });
    }

    async function tick() {
        const due = pending.filter((event) => event.at <= clock.t);
        pending = pending.filter((event) => event.at > clock.t);
        for (const event of due) {
            const video = videos.get(event.uid);
            if (!video || !webhook) continue;
            const body = JSON.stringify(videoObject(video));
            const headers = {
                'webhook-signature': signWebhook(body, webhook.secret, Math.floor(clock.t / 1000)),
                'user-agent': 'Cloudflare Stream Webhook',
            };
            const status = await deliver(body, headers);
            if (status !== 200 && event.attempt < 4) pending.push({ ...event, at: clock.t + 60_000, attempt: event.attempt + 1 });
        }
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
            assert.equal(Number(headers['upload-offset']), video.offset);
            video.offset += init.body.byteLength;
            if (video.offset >= video.length && video.uploadedAt === null) {
                video.uploadedAt = clock.t;
                schedule(video);
            }
            return new Response(null, { status: 204, headers: { 'upload-offset': String(video.offset) } });
        }
        assert.ok(url.toString().startsWith(API), `unexpected host ${url}`);
        assert.equal(headers.authorization, `Bearer ${API_TOKEN}`);
        const path = url.pathname.slice(new URL(API).pathname.length);
        if (path === '' && method === 'POST') {
            const metadata = Object.fromEntries(headers['upload-metadata'].split(',').map((pair) => {
                const [key, value] = pair.split(' ');
                return [key, value === undefined ? null : Buffer.from(value, 'base64').toString('utf8')];
            }));
            const maxDuration = Number(metadata.maxDurationSeconds);
            if (used() + maxDuration / 60 > 1000) {
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
                expiry: metadata.expiry ? Date.parse(metadata.expiry) : null,
                length: Number(headers['upload-length']),
                offset: 0,
                uploadedAt: null,
                createdAt: clock.t,
                portrait: meta.name.includes('portrait'),
            });
            live += 1;
            maxLive = Math.max(maxLive, live);
            return new Response(null, {
                status: 201,
                headers: { location: `https://upload.cloudflarestream.com/tus/${uid}?tusv2=true`, 'stream-media-id': uid },
            });
        }
        if (path === '/storage-usage') {
            return json(200, { creator: null, totalStorageMinutes: used(), totalStorageMinutesLimit: 1000, videoCount: videos.size });
        }
        if (path === '/webhook') {
            if (method === 'PUT') {
                webhook = { notificationUrl: JSON.parse(init.body).notificationUrl, secret: randomBytes(16).toString('hex') };
                secretsSeen.push(webhook.secret);
                return json(200, { ...webhook, modified: new Date(clock.t).toISOString() });
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

function harness(options = {}) {
    const clock = { t: Date.parse('2026-10-22T10:00:00Z') };
    const servers = {};
    const fake = createFakeStream({
        clock,
        failName: options.failName,
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
        if (file.endsWith('.mp4') || file.endsWith('.bin')) continue;
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

test('local listener binds 127.0.0.1 and verifies signed deliveries end to end', async () => {
    const receiver = createWebhookReceiver({ now: Date.now, sleep: async () => {} });
    receiver.addSecret('A', 'listener-secret');
    const server = await listenHttp(0, receiver.handle);
    try {
        const body = JSON.stringify({ uid: 'u', readyToStream: true, status: { state: 'ready' } });
        const good = await fetch(`http://127.0.0.1:${server.port}/stream-webhook`, {
            method: 'POST',
            headers: { 'webhook-signature': signWebhook(body, 'listener-secret', Math.floor(Date.now() / 1000)) },
            body,
        });
        const bad = await fetch(`http://127.0.0.1:${server.port}/stream-webhook`, {
            method: 'POST',
            headers: { 'webhook-signature': signWebhook(body, 'other', Math.floor(Date.now() / 1000)) },
            body,
        });
        assert.deepEqual([good.status, bad.status], [200, 401]);
        assert.deepEqual(receiver.deliveries.map((delivery) => delivery.verified_with), [['A'], []]);
    } finally {
        await server.close();
    }
});

test('missing credentials fail closed with a clear message (real process)', async () => {
    const dir = await tempDir();
    const result = spawnSync(process.execPath, [SCRIPT, 'manifests', '--out', dir], {
        env: { PATH: process.env.PATH },
        encoding: 'utf8',
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /STREAM_ACCOUNT_ID and STREAM_API_TOKEN must be set/);
});

test('--out is required and must sit outside the repository', async () => {
    const { deps } = harness();
    assert.equal(await runCli(['manifests'], deps), 2);
    const inside = fileURLToPath(new URL('../tmp-probe-out', import.meta.url));
    assert.equal(await runCli(['manifests', '--out', inside, '--dry-run'], deps), 2);
});

test('dry run prints the plan with placeholders and makes no network call', async () => {
    const dir = await tempDir();
    for (const sub of ['manifests', 'head-lifetime', 'storage', 'webhooks', 'renewal-page', 'containers', 'ready-timing', 'keys', 'thumbnails', 'cleanup', 'samples']) {
        let printed = '';
        const code = await runCli([sub, '--out', dir, '--dry-run'], {
            env: ENV,
            fetchImpl: () => assert.fail('dry run must not fetch'),
            stdout: { write: (text) => { printed += text; } },
            stderr: { write: () => {} },
        });
        assert.equal(code, 0, sub);
        assert.ok(!printed.includes(ACCOUNT) && !printed.includes(API_TOKEN), sub);
        assert.match(printed, /dry run, no network/);
        assert.ok(planFor(sub, {}).length > 0, sub);
    }
    const storagePlan = planFor('storage', {}).map((step) => step.join(' ')).join('\n');
    assert.match(storagePlan, /--allow-quota-fill/);
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

test('manifests (P1) records ready-time shape, scrubs every file and cleans up', async () => {
    const dir = await tempDir();
    const media = await tempDir();
    const landscape = await sample(media, 'landscape.mp4');
    const portrait = await sample(media, 'portrait.mp4');
    const { deps, fake, output } = harness();
    const code = await runCli([
        'manifests', '--out', dir, '--landscape', landscape, '--portrait', portrait,
        '--webhook-url', 'https://probe.trycloudflare.com',
    ], deps);
    assert.equal(code, 0, output().stderr);
    const receipt = await readJson(dir, 'p1/receipt.json');
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
    assert.deepEqual(port.rendition_set.source, { width: 1080, height: 1920 });
    assert.ok(receipt.hosts.includes('customer-<CUSTOMER_CODE>.cloudflarestream.com'));
    const master = await readFile(join(dir, 'p1/landscape/at-ready-webhook/master.m3u8'), 'utf8');
    assert.match(master, /#EXT-X-STREAM-INF/);
    const variant = await readFile(join(dir, 'p1/landscape/at-ready-webhook/variant-1-video-1920x1080.m3u8'), 'utf8');
    assert.match(variant, /seg_1\.mp4\?p=<P>&s=<S>/);
    assert.deepEqual(fake.state().maxLive, 1);
    assert.equal(fake.state().videos, 0);
    assert.equal(fake.state().keys, 0);
    assert.equal(fake.state().webhook, null);
    const ledger = await readJson(dir, 'ledger.json');
    assert.deepEqual([ledger.videos, ledger.keys, ledger.webhook], [[], [], false]);
    await assertNoLeaks(dir, fake, { output: output() });
});

test('--keep leaves the key and webhook in place and in the ledger', async () => {
    const dir = await tempDir();
    const media = await tempDir();
    const file = await sample(media, 'long.mp4');
    const { deps, fake } = harness();
    assert.equal(await runCli(['ready-timing', '--out', dir, '--sample', file, '--webhook-url', 'https://probe.trycloudflare.com', '--keep'], deps), 0);
    assert.equal(fake.state().videos, 1);
    assert.equal(fake.state().keys, 1);
    assert.notEqual(fake.state().webhook, null);
    const receipt = await readJson(dir, 'p7/receipt.json');
    assert.equal(receipt.exceeds_verification_cycle_10_min, false);
    assert.ok(receipt.inprogress_webhooks.length >= 1);
    const ledger = await readJson(dir, 'ledger.json');
    assert.equal(ledger.videos.length, 1);
    assert.equal(await runCli(['cleanup', '--out', dir], deps), 0);
    assert.deepEqual([fake.state().videos, fake.state().keys, fake.state().webhook], [0, 0, null]);
    await assertNoLeaks(dir, fake);
});

test('storage (P3) refuses without --allow-quota-fill', async () => {
    const dir = await tempDir();
    const { deps, fake, output } = harness();
    assert.equal(await runCli(['storage', '--out', dir], deps), 1);
    assert.match(output().stderr, /allow_quota_fill/);
    assert.equal(fake.calls.length, 0);
});

test('storage (P3) records release, expiry drop and exhaustion, then deletes every reservation', async () => {
    const dir = await tempDir();
    const media = await tempDir();
    const file = await sample(media, 'big.mp4', 6 * 1024 * 1024);
    const { deps, fake, output } = harness();
    const code = await runCli(['storage', '--out', dir, '--allow-quota-fill', '--sample', file], deps);
    assert.equal(code, 0, output().stderr);
    const receipt = await readJson(dir, 'p3/receipt.json');
    assert.deepEqual(receipt.baseline.field_names, ['creator', 'totalStorageMinutes', 'totalStorageMinutesLimit', 'videoCount']);
    assert.equal(receipt.delete_release.minutes_after_create, 10);
    assert.equal(receipt.delete_release.release.reached, true);
    assert.equal(receipt.mid_upload_delete.sent_bytes, 5 * 1024 * 1024);
    assert.equal(receipt.expiry_without_delete.dropped_without_delete, true);
    assert.equal(receipt.exhaustion.observed, true);
    assert.equal(receipt.exhaustion.response.status, 413);
    assert.equal(receipt.exhaustion.response.body.errors[0].code, 10011);
    assert.ok(receipt.exhaustion.attempts.every((attempt) => attempt.requested_seconds <= 36000));
    assert.equal(fake.state().videos, 0);
    await assertNoLeaks(dir, fake, { output: output() });
});

test('webhooks (P4) records secret readback, rotation, retries, skew and meta routing', async () => {
    const dir = await tempDir();
    const media = await tempDir();
    const file = await sample(media, 'clip.mp4');
    const { deps, fake, output } = harness();
    const code = await runCli(['webhooks', '--out', dir, '--sample', file, '--webhook-url', 'https://probe.trycloudflare.com/hook'], deps);
    assert.equal(code, 0, output().stderr);
    const receipt = await readJson(dir, 'p4/receipt.json');
    assert.equal(receipt.get_after_put.secret_present, false);
    assert.equal(receipt.rotation.same_url_put_rotates_secret, true);
    assert.equal(receipt.retry.outcome, 'retried_until_200');
    assert.deepEqual(receipt.retry.ready_deliveries.map((delivery) => delivery.answered), [503, 503, 200]);
    assert.deepEqual(receipt.retry.intervals_s, [60, 60]);
    assert.equal(receipt.signature.verified_with_second_secret_only, receipt.signature.deliveries);
    assert.equal(receipt.signature.old_secret_still_verifies_after_rotation, false);
    assert.equal(receipt.skew_s.max, 0);
    assert.equal(receipt.inprogress.count, 1);
    assert.equal(receipt.upload.echoed_max_duration_seconds, 7200);
    assert.equal(receipt.meta_routing.landed.jobId.in_get_meta_as, 'jobId');
    assert.equal(receipt.meta_routing.landed['meta.jobId'].in_webhook_meta_as, 'meta.jobId');
    assert.ok(receipt.upload.sent_metadata_keys.includes('expiry'));
    assert.equal(fake.state().webhook, null);
    await assertNoLeaks(dir, fake, { output: output() });
});

test('containers (P6) uploads one at a time and records ready versus error', async () => {
    const dir = await tempDir();
    const media = await tempDir();
    for (const container of CONTAINERS.filter((name) => name !== 'wmv')) await sample(media, `container-10s.${container}`);
    const { deps, fake, output } = harness({ failName: '-flv' });
    assert.equal(await runCli(['containers', '--out', dir, '--samples-dir', media], deps), 0, output().stderr);
    const receipt = await readJson(dir, 'p6/receipt.json');
    const outcome = Object.fromEntries(receipt.results.map((entry) => [entry.container, entry.outcome]));
    assert.deepEqual(outcome, { mp4: 'ready', mov: 'ready', avi: 'ready', webm: 'ready', wmv: 'sample_missing', mkv: 'ready', flv: 'error' });
    assert.equal(receipt.results.find((entry) => entry.container === 'flv').video.error_reason_code, 'ERR_NON_VIDEO');
    assert.equal(fake.state().maxLive, 1);
    assert.equal(fake.state().videos, 0);
});

test('keys (P8) records PEM format, overlap, claim variants and revocation of key A', async () => {
    const dir = await tempDir();
    const media = await tempDir();
    const file = await sample(media, 'clip.mp4');
    const { deps, fake, output } = harness();
    assert.equal(await runCli(['keys', '--out', dir, '--sample', file], deps), 0, output().stderr);
    const receipt = await readJson(dir, 'p8/receipt.json');
    assert.equal(receipt.create_response_shape.pem_format, 'pkcs1');
    assert.equal(receipt.create_response_shape.pem_encoding, 'base64-of-pem');
    assert.equal(receipt.create_response_shape.jwk.kid_matches_id, true);
    assert.deepEqual(receipt.overlap, { key_a_master: 200, key_b_master: 200 });
    assert.equal(receipt.claims_with_key_b.nbf_in_future, 401);
    assert.equal(receipt.claims_with_key_b.without_exp, 401);
    assert.equal(receipt.claims_with_key_b.without_payload_kid, 200);
    assert.equal(receipt.revocation.final_key_a_status, 401);
    assert.equal(receipt.revocation.key_b_stayed_200, true);
    assert.equal(receipt.list_after.private_material_in_list, false);
    assert.deepEqual([fake.state().videos, fake.state().keys], [0, 0]);
    await assertNoLeaks(dir, fake, { output: output() });
});

test('thumbnails (P9) records time/width under a path token and a billing window', async () => {
    const dir = await tempDir();
    const media = await tempDir();
    const file = await sample(media, 'clip.mp4');
    const { deps, fake, output } = harness();
    assert.equal(await runCli(['thumbnails', '--out', dir, '--sample', file, '--billing-phase', 'range', '--repeats', '5'], deps), 0, output().stderr);
    const receipt = await readJson(dir, 'p9/receipt.json');
    const width = receipt.matrix.find((entry) => entry.name === 'width');
    assert.deepEqual([width.status, width.content_type, width.jpeg_dimensions.width], [200, 'image/jpeg', 320]);
    assert.equal(receipt.unsigned_with_query.status, 401);
    assert.deepEqual(receipt.billing.statuses, { 206: 5 });
    assert.equal(receipt.range_first_response.content_range, 'bytes 0-0/1000');
    assert.deepEqual([fake.state().videos, fake.state().keys], [0, 0]);
    await assertNoLeaks(dir, fake, { output: output() });
});

test('head-lifetime (P2) keeps the video, refuses an early checkpoint, deletes at 25 h', async () => {
    const dir = await tempDir();
    const media = await tempDir();
    const file = await sample(media, 'clip.mp4');
    const first = harness();
    assert.equal(await runCli(['head-lifetime', '--out', dir, '--sample', file], first.deps), 0, first.output().stderr);
    assert.equal(first.fake.state().videos, 1);
    const state = await readFile(join(dir, 'p2/state.json'), 'utf8');
    assert.match(state, /"upload_url": "https:\/\/upload\.cloudflarestream\.com\/tus\/[0-9a-f]{32}\?tusv2=true"/);
    let receipt = await readJson(dir, 'p2/receipt.json');
    assert.equal(receipt.checkpoints['at-ready'].head.status, 200);
    assert.equal(receipt.upload_url, undefined);
    assert.equal(await runCli(['head-lifetime', '--out', dir, '--resume-at', '2h'], first.deps), 1);
    assert.match(first.output().stderr, /not_due_until/);
    first.clock.t += 25 * 3_600_000 + 60_000;
    assert.equal(await runCli(['head-lifetime', '--out', dir, '--resume-at', '25h'], first.deps), 0, first.output().stderr);
    receipt = await readJson(dir, 'p2/receipt.json');
    assert.equal(receipt.checkpoints['25h'].after_upload_expiry, true);
    assert.equal(receipt.checkpoints['25h'].delete_status, 200);
    assert.equal(first.fake.state().videos, 0);
    await assertNoLeaks(dir, first.fake);
});

test('a live video in the ledger blocks a second upload (one video at a time)', async () => {
    const dir = await tempDir();
    const media = await tempDir();
    const file = await sample(media, 'clip.mp4');
    const { deps, output } = harness();
    assert.equal(await runCli(['head-lifetime', '--out', dir, '--sample', file], deps), 0);
    assert.equal(await runCli(['keys', '--out', dir, '--sample', file], deps), 1);
    assert.match(output().stderr, /ledger_has_live_video/);
});

test('renewal page (P5) loads hls.js 1.6.16, holds no token and mints path tokens on /token', async () => {
    const html = renderRenewalPage({ ttlSeconds: 180, renewBeforeSeconds: 30 });
    assert.match(html, new RegExp(`hls\\.js@${HLS_JS_VERSION.replace(/\./g, '\\.')}/dist/hls\\.min\\.js`));
    assert.match(html, /hls\.loadSource\(current\.url\)/);
    assert.match(html, /video\.currentTime = position/);
    assert.doesNotMatch(html, JWT_RE);

    const dir = await tempDir();
    const media = await tempDir();
    const file = await sample(media, 'clip.mp4');
    const { deps, fake, servers, output } = harness();
    assert.equal(await runCli(['renewal-page', '--out', dir, '--sample', file, '--duration-minutes', '1'], deps), 0, output().stderr);
    const page = servers[8790];
    const served = await page({ method: 'GET', path: '/', headers: {}, body: '' });
    assert.match(served.body, /Stream renewal probe/);
    const minted = JSON.parse((await page({ method: 'GET', path: '/token', headers: {}, body: '' })).body);
    assert.match(minted.url, /\/manifest\/video\.m3u8$/);
    const token = new URL(minted.url).pathname.split('/')[1];
    const [header, payload, signature] = token.split('.');
    const kid = JSON.parse(Buffer.from(header, 'base64url').toString()).kid;
    assert.ok(cryptoVerify('sha256', Buffer.from(`${header}.${payload}`), fake.publicKeys.get(kid), Buffer.from(signature, 'base64url')));
    assert.equal(JSON.parse(Buffer.from(payload, 'base64url').toString()).exp - Math.floor(deps.now() / 1000), 180);
    assert.equal((await page({ method: 'POST', path: '/log', headers: {}, body: JSON.stringify({ type: 'stall_end', stall_ms: 420, url: minted.url }) })).status, 204);
    const log = await readFile(join(dir, 'p5/browser-log.jsonl'), 'utf8');
    assert.match(log, /stall_end/);
    assert.doesNotMatch(log, JWT_RE);
    assert.deepEqual([fake.state().videos, fake.state().keys], [0, 0]);
    await assertNoLeaks(dir, fake, { output: output() });
});

test('signing-key refuses a key file inside the repository', async () => {
    const dir = await tempDir();
    const { deps, fake, output } = harness();
    const inside = fileURLToPath(new URL('./owner-key.json', import.meta.url));
    assert.equal(await runCli(['signing-key', '--out', dir, '--signing-key-file', inside], deps), 1);
    assert.match(output().stderr, /outside_the_repository/);
    assert.equal(fake.calls.length, 0);
    const keyDir = await tempDir();
    const target = join(keyDir, 'key.json');
    assert.equal(await runCli(['signing-key', '--out', dir, '--signing-key-file', target], deps), 0);
    assert.equal(fake.state().keys, 1, 'the owner key stays until --delete');
    const saved = JSON.parse(await readFile(target, 'utf8'));
    assert.equal(typeof saved.pem, 'string');
    assert.equal(await runCli(['signing-key', '--out', dir, '--signing-key-file', target, '--delete'], deps), 0);
    assert.equal(fake.state().keys, 0);
    await assertNoLeaks(dir, fake, { output: output() });
});

test('package.json exposes probe:stream and the provider-canary glob picks up this test', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(pkg.scripts['probe:stream'], 'node scripts/stream-probe.mjs');
    assert.equal(pkg.scripts['test:provider-canary'], 'node --test scripts/*.test.mjs');
});
