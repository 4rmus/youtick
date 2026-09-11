import { afterEach, expect, it, vi } from 'vitest';
import { verifyAdaptiveHls, verifyLivepeerReadyAsset } from './provider-verification';
import { mediaProfiles } from './media-provider';
import profiles from '../../../protocol/paid-media-livepeer-v1/profiles.json';
import { normalizeLivepeerAsset } from './livepeer-provider';

const masterUrl = 'https://playback.livepeer.studio/asset/hls/video/index.m3u8';
const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\n360/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720\n720/index.m3u8\n';
const child = '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2,\nfirst.ts\n#EXTINF:2,\nlast.ts\n#EXT-X-ENDLIST\n';
function backend(manifest = master, exposed = '') {
    return vi.fn(async (url: string, init: RequestInit) => {
        const token = new Headers(init.headers).get('Livepeer-Jwt');
        if (token !== 'authorized') return new Response(url.includes(exposed) && exposed ? child : null,
            { status: url.includes(exposed) && exposed ? 200 : 403 });
        return new Response(url === masterUrl ? manifest : child);
    });
}
afterEach(() => { vi.unstubAllGlobals(); });

it('uses the exact recorded profile and rejects unknown hashes', () => {
    expect(mediaProfiles(profiles.legacy.hash).map((profile) => profile.height)).toEqual([720]);
    expect(mediaProfiles(profiles.adaptive.hash).map((profile) => profile.height)).toEqual([360, 720]);
    expect(() => mediaProfiles('a'.repeat(64))).toThrow('unsupported_profile');
});

it('verifies both authorized renditions and denied child playlists, map and first/last segments', async () => {
    const fetchMock = backend();
    vi.stubGlobal('fetch', fetchMock);
    await verifyAdaptiveHls(masterUrl, 'authorized', profiles.adaptive.profiles);
    for (const quality of ['360', '720']) {
        for (const leaf of ['index.m3u8', 'init.mp4', 'first.ts', 'last.ts']) {
            expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith(`${quality}/${leaf}`)
                && !new Headers(init.headers).has('Livepeer-Jwt'))).toBe(true);
        }
    }
});

it.each(['360/index.m3u8', '720/last.ts', '360/init.mp4'])('rejects exposed output %s', async (exposed) => {
    vi.stubGlobal('fetch', backend(master, exposed));
    await expect(verifyAdaptiveHls(masterUrl, 'authorized', profiles.adaptive.profiles)).rejects.toThrow('provider_playback_exposed');
});

it.each([
    master.replace('640x360', '640x480'),
    master + '#EXT-X-MEDIA:TYPE=AUDIO,URI="audio/index.m3u8"\n',
    master.replace('360/index.m3u8', 'https://attacker.test/360.m3u8'),
    master.replace('360/index.m3u8', '360/index.m3u8?jwt=leaked'),
    master.replace('720/index.m3u8', '360/index.m3u8'),
])('rejects missing, wrong or unsafe renditions', async (manifest) => {
    vi.stubGlobal('fetch', backend(manifest));
    await expect(verifyAdaptiveHls(masterUrl, 'authorized', profiles.adaptive.profiles)).rejects.toThrow('provider_playback_mismatch');
});

it('bounds authorized manifest size', async () => {
    vi.stubGlobal('fetch', backend(master + '#'.repeat(512 * 1024)));
    await expect(verifyAdaptiveHls(masterUrl, 'authorized', profiles.adaptive.profiles)).rejects.toThrow('provider_playback_mismatch');
});

it('ready verification binds the required renditions to the stored job profile', async () => {
    const provider = {
        readAsset: vi.fn().mockResolvedValue({ id: 'asset', playbackId: 'video', projectId: 'project',
            createdByTokenName: 'token', creatorBindingType: 'unverified', creatorBindingValue: 'job:1',
            name: 'youtick-job-g1', policy: 'jwt', phase: 'ready', updatedAtMs: 1000, sizeBytes: 10,
            downloadUrl: 'https://playback.livepeer.studio/source.mp4', sha256: null }),
        readPlayback: vi.fn().mockResolvedValue({ kind: 'vod', policy: 'jwt', sources: [{
            kind: 'hls', url: masterUrl, width: null, height: null, bitrate: null,
        }] }),
    };
    const input = { jobId: 'job', generation: 1, expectedSourceBytes: '10', assetId: 'asset',
        playbackId: 'video', projectId: 'project', expectedProjectId: 'project', apiTokenName: 'token' };
    vi.stubGlobal('fetch', backend('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720\n720/index.m3u8\n'));
    const dependencies = { sha256: async () => 'a'.repeat(64), signPlaybackToken: async () => 'authorized' };
    await expect(verifyLivepeerReadyAsset(provider, { ...input, profileConfigSha256: profiles.legacy.hash }, dependencies))
        .resolves.toMatchObject({ verifiedSourceBytes: '10' });
    await expect(verifyLivepeerReadyAsset(provider, { ...input, profileConfigSha256: profiles.adaptive.hash }, dependencies))
        .rejects.toThrow('provider_verification_incomplete');
});

function playlist(sizes: number[][]) {
    return '#EXTM3U\n' + sizes.map(([width, height], index) => (
        `#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=${width}x${height}\n${index}/index.m3u8\n`
    )).join('');
}

it.each([
    [[468, 360], [934, 720]],
    [[204, 360], [406, 720]],
    [[360, 640], [720, 1280]],
    [[360, 360], [720, 720]],
    [[640, 640], [1280, 1280]],
    [[640, 268], [1280, 536]],
    [[638, 360], [1280, 720]],
    [[640, 358], [1280, 718]],
    [[640, 360], [1280, 720], [1920, 1080]],
])('accepts actual aspect-preserving renditions %j', async (...sizes) => {
    vi.stubGlobal('fetch', backend(playlist(sizes)));
    await expect(verifyAdaptiveHls(masterUrl, 'authorized', profiles.adaptive.profiles)).resolves.toBeDefined();
});

it.each([
    ['wrong aspect', playlist([[635, 360], [1280, 720]])],
    ['mixed axes', playlist([[360, 360], [1280, 1280]])],
    ['opposite orientation', playlist([[640, 360], [720, 1280]])],
    ['zero size', playlist([[0, 360], [1280, 720]])],
    ['unsafe integer', playlist([[Number.MAX_SAFE_INTEGER + 1, 360], [1280, 720]])],
    ['missing bandwidth', master.replace('BANDWIDTH=800000,', '')],
    ['zero bandwidth', master.replace('BANDWIDTH=800000', 'BANDWIDTH=0')],
])('rejects invalid geometry or metadata: %s', async (_name, manifest) => {
    vi.stubGlobal('fetch', backend(manifest));
    await expect(verifyAdaptiveHls(masterUrl, 'authorized', profiles.adaptive.profiles, { width: 2000, height: 2000 }))
        .rejects.toThrow('provider_playback_mismatch');
});

it.each([
    { source: [854, 480], sizes: [[640, 360], [854, 480]], pass: true },
    { source: [480, 854], sizes: [[640, 360], [854, 480]], pass: true },
    { source: [854, 480], sizes: [[854, 480]], pass: false },
    { source: [600, 600], sizes: [[360, 360], [600, 600]], pass: true },
    { source: [600, 600], sizes: [[600, 600]], pass: false },
    { source: [600, 400], sizes: [[600, 400]], pass: false },
    { source: [338, 600], sizes: [[338, 600]], pass: false },
    { source: [426, 240], sizes: [[426, 240]], pass: true },
    { source: [426, 240], sizes: [[640, 360]], pass: true },
    { source: [426, 240], sizes: [[1280, 720]], pass: true },
    { source: [359, 359], sizes: [[358, 358]], pass: true },
    { source: [360, 360], sizes: [[360, 360]], pass: true },
    { source: [361, 361], sizes: [[360, 360]], pass: true },
    { source: [362, 362], sizes: [[360, 360]], pass: false },
    { source: [362, 362], sizes: [[360, 360], [360, 360]], pass: false },
    { source: [362, 362], sizes: [[360, 360], [362, 362]], pass: true },
])('uses provider source capacity without losing required levels: %j', async ({ source, sizes, pass }) => {
    vi.stubGlobal('fetch', backend(playlist(sizes)));
    const result = verifyAdaptiveHls(masterUrl, 'authorized', profiles.adaptive.profiles, { width: source[0], height: source[1] });
    if (pass) await expect(result).resolves.toBeDefined();
    else await expect(result).rejects.toThrow('provider_playback_mismatch');
});

it.each([undefined, null, { width: '600', height: 600 }, { width: 0, height: 600 }, { width: 1000, height: 600 }])(
    'does not infer low source capacity from absent, malformed or incompatible source %j', async (source) => {
        vi.stubGlobal('fetch', backend(playlist([[600, 600]])));
        await expect(verifyAdaptiveHls(masterUrl, 'authorized', profiles.adaptive.profiles, source))
            .rejects.toThrow('provider_verification_incomplete');
    },
);

it.each([15, 16])('bounds the total master and child count for %i children', async (count) => {
    vi.stubGlobal('fetch', backend(playlist(Array.from({ length: count }, () => [1280, 720]))));
    const result = verifyAdaptiveHls(masterUrl, 'authorized', profiles.legacy.profiles);
    if (count === 15) await expect(result).resolves.toBeDefined();
    else await expect(result).rejects.toThrow('provider_playback_mismatch');
});

it.each([64, 65])('bounds all media references across children at %i', async (count) => {
    const mock = backend(playlist(Array.from({ length: 5 }, () => [1280, 720])));
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
        if (url !== masterUrl && new Headers(init.headers).get('Livepeer-Jwt') === 'authorized') {
            const last = url.includes('/4/');
            const maps = Array.from({ length: last ? count - 54 : 11 }, (_, index) => `#EXT-X-MAP:URI="${index}.mp4"`).join('\n');
            return new Response(`#EXTM3U\n${maps}\n#EXTINF:2,\nfirst.ts\n#EXTINF:2,\nlast.ts\n#EXT-X-ENDLIST\n`);
        }
        return mock(url, init);
    }));
    const result = verifyAdaptiveHls(masterUrl, 'authorized', profiles.legacy.profiles);
    if (count === 64) await expect(result).resolves.toBeDefined();
    else await expect(result).rejects.toThrow('provider_playback_mismatch');
});

it.each(['network', 'syntax'])('distinguishes a body read failure from malformed content: %s', async (failure) => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
        if (new Headers(init.headers).get('Livepeer-Jwt') !== 'authorized') return new Response(null, { status: 403 });
        return new Response(failure === 'syntax' ? 'not a playlist' : new ReadableStream({
            start(controller) { controller.error(new Error('connection reset')); },
        }));
    }));
    await expect(verifyAdaptiveHls(masterUrl, 'authorized', profiles.adaptive.profiles))
        .rejects.toThrow(failure === 'network' ? 'provider_unavailable' : 'provider_playback_mismatch');
});

const readyInput = { jobId: 'job', generation: 1, expectedSourceBytes: '10', assetId: 'asset',
    playbackId: 'video', projectId: 'project', expectedProjectId: 'project', apiTokenName: 'token',
    profileConfigSha256: profiles.adaptive.hash };
const dependencies = { sha256: async () => 'a'.repeat(64), signPlaybackToken: async () => 'authorized' };
function readyProvider(mp4: number[][] = [], additionalHls: string[] = []) {
    return {
        readAsset: vi.fn().mockResolvedValue({ id: 'asset', playbackId: 'video', projectId: 'project',
            createdByTokenName: 'token', creatorBindingType: 'unverified', creatorBindingValue: 'job:1',
            name: 'youtick-job-g1', policy: 'jwt', phase: 'ready', updatedAtMs: 1000, sizeBytes: 10,
            downloadUrl: 'https://playback.livepeer.studio/source.mp4', sha256: null,
            sourceVideo: { width: 1920, height: 1080 } }),
        readPlayback: vi.fn().mockResolvedValue({ kind: 'vod', policy: 'jwt', sources: [
            ...[masterUrl, ...additionalHls].map((url) => ({ kind: 'hls', url })),
            ...mp4.map(([width, height], index) => ({ kind: 'mp4', width, height, bitrate: 1000000,
                url: `https://playback.livepeer.studio/${index}.mp4` })),
        ] }),
    };
}

it.each([
    { sizes: [[468, 360], [934, 720]], mp4: [[468, 360], [934, 720]], pass: true },
    { sizes: [[468, 360], [934, 720]], mp4: [[1280, 720]], pass: false },
    { sizes: [[640, 360], [1280, 720], [1920, 1080]], mp4: [[1280, 720]], pass: true },
    { sizes: [[640, 360], [1280, 720]], mp4: [[1280, 720], [1920, 1080]], pass: true },
    { sizes: [[640, 360], [1280, 720]], mp4: [[640, 360]], pass: false },
    { sizes: [[640, 360], [1280, 720]], mp4: [[0, 720]], pass: false },
    { sizes: [[640, 360], [1280, 720]], mp4: [], pass: true },
])('binds MP4s to actual HLS/source dimensions and the required upper level: %j', async ({ sizes, mp4, pass }) => {
    vi.stubGlobal('fetch', backend(playlist(sizes)));
    const result = verifyLivepeerReadyAsset(readyProvider(mp4), readyInput, dependencies);
    if (pass) await expect(result).resolves.toMatchObject({ verifiedSourceBytes: '10' });
    else await expect(result).rejects.toThrow('provider_playback_mismatch');
});

it('shares one manifest/reference budget and probe cache across all provider masters', async () => {
    const alias = 'https://playback.livepeer.studio/alias.m3u8';
    const aliases = playlist([[640, 360], [1280, 720]]).replaceAll(/\d\/index\.m3u8/g, (path) => new URL(path, masterUrl).toString());
    const mock = backend(aliases);
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => url === alias
        && new Headers(init.headers).get('Livepeer-Jwt') === 'authorized' ? new Response(aliases) : mock(url, init));
    vi.stubGlobal('fetch', fetchMock);
    await verifyLivepeerReadyAsset(readyProvider([], [alias, masterUrl]), readyInput, dependencies);
    expect(fetchMock.mock.calls.filter(([url]) => url === new URL('0/index.m3u8', masterUrl).toString())).toHaveLength(5);
    expect(fetchMock.mock.calls.filter(([url]) => url === new URL('0/first.ts', masterUrl).toString())).toHaveLength(1);
});

it.each([16, 17])('counts %i HLS URLs across multiple masters, not per master', async (total) => {
    const alias = 'https://playback.livepeer.studio/alternate/index.m3u8';
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
        if (new Headers(init.headers).get('Livepeer-Jwt') !== 'authorized') return new Response(null, { status: 403 });
        if (url === masterUrl || url === alias) return new Response(playlist(Array.from(
            { length: url === masterUrl ? 7 : total - 9 }, () => [1280, 720],
        )));
        return new Response(child);
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = verifyLivepeerReadyAsset(readyProvider([], [alias]), {
        ...readyInput, profileConfigSha256: profiles.legacy.hash,
    }, dependencies);
    if (total === 16) await expect(result).resolves.toBeDefined();
    else await expect(result).rejects.toThrow('provider_playback_mismatch');
    expect(fetchMock.mock.calls.filter(([, init]) => new Headers(init.headers).get('Livepeer-Jwt') === 'authorized')).toHaveLength(16);
});

it.each([429, 503])('keeps provider HTTP %i retryable', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status })));
    await expect(verifyAdaptiveHls(masterUrl, 'authorized', profiles.adaptive.profiles)).rejects.toThrow('provider_unavailable');
});

it.each(['network', 'syntax'])('distinguishes VTT body failure from malformed VTT: %s', async (failure) => {
    const provider = readyProvider();
    const playback = await provider.readPlayback();
    const vtt = 'https://playback.livepeer.studio/thumbnails.vtt';
    provider.readPlayback.mockResolvedValue({ ...playback, sources: [...playback.sources, { kind: 'vtt', url: vtt }] });
    const mock = backend();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
        if (url === vtt && new Headers(init.headers).get('Livepeer-Jwt') === 'authorized') {
            return new Response(failure === 'syntax' ? 'not WEBVTT' : new ReadableStream({
                start(controller) { controller.error(new Error('connection reset')); },
            }));
        }
        return mock(url, init);
    }));
    await expect(verifyLivepeerReadyAsset(provider, readyInput, dependencies))
        .rejects.toThrow(failure === 'network' ? 'provider_unavailable' : 'provider_playback_mismatch');
});

it.each([
    { count: 60, status: 403, unsafe: false, error: null },
    { count: 64, status: 403, unsafe: false, error: null },
    { count: 65, status: 403, unsafe: false, error: 'provider_playback_mismatch' },
    { count: 60, status: 200, unsafe: false, error: 'provider_playback_exposed' },
    { count: 60, status: 302, unsafe: false, error: 'provider_playback_exposed' },
    { count: 60, status: 503, unsafe: false, error: 'provider_unavailable' },
    { count: 60, status: 403, unsafe: true, error: 'provider_playback_mismatch' },
])('verifies every M-shaped VTT resource with a bounded total: %j', async ({ count, status, unsafe, error }) => {
    const provider = readyProvider();
    const playback = await provider.readPlayback();
    const vtt = 'https://playback.livepeer.studio/thumbnails.vtt';
    provider.readPlayback.mockResolvedValue({ ...playback, sources: [...playback.sources, { kind: 'vtt', url: vtt }] });
    const urls = Array.from({ length: count }, (_, index) => `https://playback.livepeer.studio/thumbs/${index}.jpg`);
    if (unsafe) urls[count - 1] = 'https://attacker.test/thumbnail.jpg';
    const time = (index: number) => new Date(index * 10_000).toISOString().slice(11, 23);
    const body = 'WEBVTT\n\n' + urls.map((url, index) => `${time(index)} --> ${time(index + 1)}\n${url}\n`).join('\n');
    const mock = backend();
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
        if (url === vtt && new Headers(init.headers).get('Livepeer-Jwt') === 'authorized') return new Response(body);
        if (url === urls[count - 1]) return new Response(null, { status });
        return mock(url, init);
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = verifyLivepeerReadyAsset(provider, readyInput, dependencies);
    if (error) await expect(result).rejects.toThrow(error);
    else await expect(result).resolves.toMatchObject({ verifiedSourceBytes: '10' });
    const probes = fetchMock.mock.calls.filter(([url]) => urls.includes(url));
    if (count > 64 || unsafe) expect(probes).toHaveLength(0);
    else {
        expect(probes.map(([url]) => url)).toEqual(urls);
        for (const [, init] of probes) {
            expect(new Headers(init.headers).has('Livepeer-Jwt')).toBe(false);
            expect(new Headers(init.headers).get('Range')).toBe('bytes=0-0');
            expect(init.redirect).toBe('manual');
        }
    }
});

it.each([0, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid MP4 bitrate %j', async (bitrate) => {
    const provider = readyProvider([[1280, 720]]);
    const playback = await provider.readPlayback();
    playback.sources.find((source: { kind: string }) => source.kind === 'mp4').bitrate = bitrate;
    vi.stubGlobal('fetch', backend());
    await expect(verifyLivepeerReadyAsset(provider, readyInput, dependencies)).rejects.toThrow('provider_playback_mismatch');
});

it('retains optional source video measurements without confusing missing and malformed tracks', () => {
    const asset = { id: 'asset', creatorId: {}, playbackPolicy: {}, status: {} };
    expect(normalizeLivepeerAsset(asset).sourceVideo).toBeUndefined();
    expect(normalizeLivepeerAsset({ ...asset, videoSpec: { tracks: [{ type: 'audio' }] } }).sourceVideo).toBeNull();
    expect(normalizeLivepeerAsset({ ...asset, videoSpec: { tracks: [{ type: 'video', width: 934, height: 720 }] } }).sourceVideo)
        .toEqual({ width: 934, height: 720 });
});
