import { afterEach, expect, it, vi } from 'vitest';
import {
    newVerificationBudget,
    verifyAdaptiveHlsWith,
    verifyReadyProviderAsset,
    type HlsContext,
    type ProviderProbeSpec,
    type VerificationAdapter,
} from './provider-verification';

// A synthetic path-token adapter: these tests pin the neutral core's ManifestPolicy and byte-proof
// switches without any Studio host, header or MIME value.
const HOST = 'media.test';
const PLAYBACK = 'video';
const TOKEN = 'signed-path-token';
const MASTER = `https://${HOST}/${PLAYBACK}/manifest/video.m3u8`;

const pathTokenSpec: ProviderProbeSpec = {
    dependency: 'media_cdn',
    policy: {
        allowAlternateMedia: true,
        allowedQueryKeys: ['p', 's'],
        requireEndList: false,
        initSegment: 'required',
        deniedStatuses: { manifest: [401], media: [401, 403, 404] },
    },
    hosts: { exact: [HOST], suffixes: [] },
    signedPolicy: 'signed',
    canonicalHlsUrl: (playbackId) => `https://${HOST}/${playbackId}/manifest/video.m3u8`,
    authorizedRequest: (url, token) => ({ url: url.replace(`/${PLAYBACK}/`, `/${token}/`), headers: {} }),
    manifestDenialRequests: (url) => [
        { url, headers: {} },
        { url: url.replace(`/${PLAYBACK}/`, '/forged/'), headers: {} },
    ],
};

const master = [
    '#EXTM3U',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="original",URI="audio.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,AUDIO="audio"',
    '720.m3u8',
].join('\n');
const media = (map = true, query = 'p=a&s=b') => [
    '#EXTM3U',
    ...(map ? [`#EXT-X-MAP:URI="init.mp4?${query}"`] : []),
    '#EXTINF:2,', `seg_0.mp4?${query}`,
    '#EXTINF:2,', `seg_1.mp4?${query}`,
].join('\n');

function pathTokenBackend(childPlaylist = media()) {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (!url.pathname.startsWith(`/${TOKEN}/`)) {
            // Anonymous or forged: manifests 401, query-stripped segments 404.
            return new Response(null, { status: url.pathname.endsWith('.m3u8') ? 401 : 404 });
        }
        return new Response(url.pathname.endsWith('/video.m3u8') ? master : childPlaylist);
    });
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('keeps the neutral verification core and webhook module free of Studio hosts, headers and MIME types', async () => {
    const fs = await import(/* @vite-ignore */ ['node', 'fs/promises'].join(':')) as {
        readFile(path: URL, encoding: 'utf8'): Promise<string>;
    };
    const read = (name: string) => fs.readFile(new URL(`./${name}`, (import.meta as unknown as { url: string }).url), 'utf8');
    for (const name of ['provider-verification.ts', 'provider-webhook.ts', 'cover-image.ts']) {
        expect(await read(name), name).not.toMatch(
            /livepeer|lp-playback|origin\.livepeer|Livepeer-Jwt|Livepeer-Signature|html5\/|text\/vtt|application\/vnd\.apple/i,
        );
    }
    // index.ts keeps its deploy identities (LIVEPEER_* names, queue schema) but no Studio host, header or MIME.
    expect(await read('index.ts'), 'index.ts').not.toMatch(
        /livepeer\.studio|livepeercdn|lp-playback|origin\.livepeer\.com|Livepeer-Jwt|Livepeer-Signature|html5\/|text\/vtt|application\/vnd\.apple/i,
    );
});

it('verifies path-token manifests, alternates and query-stripped denials without replaying signed URLs', async () => {
    const fetchMock = pathTokenBackend();
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifyAdaptiveHlsWith(pathTokenSpec, MASTER, TOKEN, [{ width: 1280, height: 720 }]);

    expect(result.required.map((variant) => variant.height)).toEqual([720]);
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).toContain(`https://${HOST}/${TOKEN}/manifest/audio.m3u8`);
    expect(urls).toContain(`https://${HOST}/forged/manifest/720.m3u8`);
    expect(urls).toContain(`https://${HOST}/${PLAYBACK}/manifest/seg_0.mp4`);
    expect(urls).toContain(`https://${HOST}/${PLAYBACK}/manifest/init.mp4`);
    // A listed p/s reference is never fetched, anonymously or otherwise.
    expect(urls.filter((url) => url.includes('p=') || url.includes('s='))).toEqual([]);
});

it.each([
    ['a missing init segment', media(false)],
    ['an unlisted query key', media(true, 'p=a&x=b')],
])('rejects %s under the adapter policy', async (_name, childPlaylist) => {
    vi.stubGlobal('fetch', pathTokenBackend(childPlaylist));
    await expect(verifyAdaptiveHlsWith(pathTokenSpec, MASTER, TOKEN, [{ width: 1280, height: 720 }]))
        .rejects.toThrow('provider_playback_mismatch');
});

it('fails closed when an anonymous segment is served under the adapter denial statuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/seg_1.mp4')) return new Response('bytes', { status: 206 });
        return pathTokenBackend()(input);
    }));
    await expect(verifyAdaptiveHlsWith(pathTokenSpec, MASTER, TOKEN, [{ width: 1280, height: 720 }]))
        .rejects.toThrow('provider_playback_exposed');
});

function tusOffsetAdapter(tus = { offsetBytes: '10', lengthBytes: '10' }, spec = pathTokenSpec) {
    const readTusOffset = vi.fn(async (_uploadUrl: string) => tus);
    const adapter: VerificationAdapter = {
        capabilities: { sourceBytesProof: 'tus-offset', tokenPlacement: 'path' },
        spec,
        surfaces: { declaredUrls: () => [], probe: async () => ({ bindingParts: [], deferredDenials: [] }) },
        readAsset: async (id) => ({ id, playbackId: PLAYBACK, policy: 'signed', phase: 'ready', updatedAtMs: 1_000 }),
        readPlayback: async () => ({ kind: 'vod', policy: 'signed', sources: [{
            kind: 'hls', url: MASTER, width: null, height: null, bitrate: null,
        }] }),
        readTusOffset,
        identityMatches: () => true,
        describeProfile: () => ({ renditions: [{ width: 1280, height: 720 }] }),
    };
    return { adapter, readTusOffset };
}

const tusInput = {
    jobId: 'job', generation: 1, expectedSourceBytes: '10', profileConfigSha256: 'f'.repeat(64),
    assetId: 'asset', playbackId: PLAYBACK, projectId: 'account', expectedProjectId: 'account',
};
const dependencies = { sha256: async () => 'a'.repeat(64), signPlaybackToken: async () => TOKEN };

it('proves source bytes from the resumable upload offset at readiness and returns the evidence', async () => {
    vi.stubGlobal('fetch', pathTokenBackend());
    const { adapter, readTusOffset } = tusOffsetAdapter();

    const result = await verifyReadyProviderAsset(adapter, {
        ...tusInput, mode: 'ready', tusEndpoint: 'https://upload.test/tus/1',
    }, dependencies);

    expect(readTusOffset).toHaveBeenCalledWith('https://upload.test/tus/1');
    expect(result).toMatchObject({
        verifiedSourceBytes: '10',
        sourceBytesEvidence: { method: 'tus-offset', offsetBytes: '10', lengthBytes: '10' },
    });
});

it.each([
    ['a short upload', { offsetBytes: '9', lengthBytes: '10' }, 'https://upload.test/tus/1'],
    ['a different declared length', { offsetBytes: '11', lengthBytes: '11' }, 'https://upload.test/tus/1'],
    ['a missing upload URL', { offsetBytes: '10', lengthBytes: '10' }, undefined],
])('fails closed on %s', async (_name, tus, tusEndpoint) => {
    vi.stubGlobal('fetch', pathTokenBackend());
    const { adapter } = tusOffsetAdapter(tus);
    await expect(verifyReadyProviderAsset(adapter, { ...tusInput, mode: 'ready', tusEndpoint }, dependencies))
        .rejects.toThrow('provider_state_invalid');
});

it('re-verifies a published asset from the evidence persisted at readiness without reading the upload again', async () => {
    vi.stubGlobal('fetch', pathTokenBackend());
    const { adapter, readTusOffset } = tusOffsetAdapter();
    const ready = await verifyReadyProviderAsset(adapter, {
        ...tusInput, mode: 'ready', tusEndpoint: 'https://upload.test/tus/1',
    }, dependencies);
    if ('pending' in ready || !ready.sourceBytesEvidence) throw new Error('expected readiness evidence');
    readTusOffset.mockClear();

    const published = await verifyReadyProviderAsset(adapter, {
        ...tusInput, mode: 'published', storedEvidence: ready.sourceBytesEvidence,
    }, dependencies);

    expect(readTusOffset).not.toHaveBeenCalled();
    expect(published).toMatchObject({ verifiedSourceBytes: '10' });
    expect(published).not.toHaveProperty('sourceBytesEvidence');
    const { sourceBytesEvidence: _evidence, ...readyPublication } = ready;
    expect(published).toEqual(readyPublication);
});

it('reports missing published evidence as a non-drift code and tampered evidence as invalid state', async () => {
    vi.stubGlobal('fetch', pathTokenBackend());
    const { adapter, readTusOffset } = tusOffsetAdapter();

    await expect(verifyReadyProviderAsset(adapter, { ...tusInput, mode: 'published' }, dependencies))
        .rejects.toThrow('verification_evidence_missing');
    await expect(verifyReadyProviderAsset(adapter, { ...tusInput, mode: 'published', storedEvidence: {
        method: 'tus-offset', offsetBytes: '9', lengthBytes: '10', observedAtMs: 1,
    } }, dependencies)).rejects.toThrow('provider_state_invalid');
    expect(readTusOffset).not.toHaveBeenCalled();
});

it('refuses a path-token adapter whose authorized request also carries a credential header', async () => {
    vi.stubGlobal('fetch', pathTokenBackend());
    const { adapter } = tusOffsetAdapter(undefined, {
        ...pathTokenSpec,
        authorizedRequest: (url, token) => ({ ...pathTokenSpec.authorizedRequest(url, token), headers: { 'X-Token': token } }),
    });
    await expect(verifyReadyProviderAsset(adapter, {
        ...tusInput, mode: 'ready', tusEndpoint: 'https://upload.test/tus/1',
    }, dependencies)).rejects.toThrow('runtime_not_configured');
});

// Sampled coverage: two video renditions and an audio group, of which the profile requires 720p only.
const sampledSpec: ProviderProbeSpec = { ...pathTokenSpec, coverage: 'sampled' };
const ladderMaster = (lowUri = '360.m3u8') => [
    '#EXTM3U',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="original",URI="audio.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,AUDIO="audio"',
    '720.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=640x360,AUDIO="audio"',
    lowUri,
].join('\n');

function ladderBackend(options: { master?: string; childPlaylist?: string; anonymous?: (url: URL) => Response | null } = {}) {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (!url.pathname.startsWith(`/${TOKEN}/`)) {
            const forced = options.anonymous?.(url);
            if (forced) return forced;
            return new Response(null, { status: url.pathname.endsWith('.m3u8') ? 401 : 404 });
        }
        return new Response(url.pathname.endsWith('/video.m3u8') ? options.master ?? ladderMaster() : options.childPlaylist ?? media());
    });
}

const freshContext = (maxRequests?: number): HlsContext => ({
    manifests: new Map(), mediaReferences: new Set(), budget: newVerificationBudget(maxRequests),
});

it('sampled coverage denies the master, reads only required renditions and probes one segment', async () => {
    const fetchMock = ladderBackend();
    vi.stubGlobal('fetch', fetchMock);
    const context = freshContext();

    const result = await verifyAdaptiveHlsWith(sampledSpec, MASTER, TOKEN, [{ width: 1280, height: 720 }], undefined, context);

    expect(result.required.map((variant) => variant.height)).toEqual([720]);
    expect(result.variants.map((variant) => variant.height)).toEqual([720, 360]);
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).toEqual([
        MASTER,
        `https://${HOST}/forged/manifest/video.m3u8`,
        `https://${HOST}/${TOKEN}/manifest/video.m3u8`,
        `https://${HOST}/${TOKEN}/manifest/720.m3u8`,
        `https://${HOST}/${PLAYBACK}/manifest/seg_0.mp4`,
    ]);
    expect(context.budget!.requests).toBe(urls.length);
});

it.each([
    ['the master', (url: URL) => url.pathname.endsWith('/video.m3u8')
        ? new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1280x720\n720.m3u8\n') : null],
    ['the sampled segment', (url: URL) => url.pathname.endsWith('/seg_0.mp4') ? new Response('bytes', { status: 206 }) : null],
])('sampled coverage fails closed when %s is served anonymously', async (_name, anonymous) => {
    vi.stubGlobal('fetch', ladderBackend({ anonymous }));
    await expect(verifyAdaptiveHlsWith(sampledSpec, MASTER, TOKEN, [{ width: 1280, height: 720 }], undefined, freshContext()))
        .rejects.toThrow('provider_playback_exposed');
});

it.each([
    ['an unread rendition on a foreign host', { master: ladderMaster('https://evil.test/video/manifest/360.m3u8') }],
    ['an unprobed segment with an unlisted query key', { childPlaylist: [
        '#EXTM3U', '#EXT-X-MAP:URI="init.mp4?p=a&s=b"', '#EXTINF:2,', 'seg_0.mp4?p=a&s=b', '#EXTINF:2,', 'seg_1.mp4?p=a&x=b',
    ].join('\n') }],
])('sampled coverage still validates %s without requesting it', async (_name, options) => {
    vi.stubGlobal('fetch', ladderBackend(options));
    await expect(verifyAdaptiveHlsWith(sampledSpec, MASTER, TOKEN, [{ width: 1280, height: 720 }], undefined, freshContext()))
        .rejects.toThrow('provider_playback_mismatch');
});

it('stops at the run cap with provider_verification_budget_exceeded and never starts the next request', async () => {
    const fetchMock = ladderBackend();
    vi.stubGlobal('fetch', fetchMock);
    const context = freshContext(3);
    await expect(verifyAdaptiveHlsWith(sampledSpec, MASTER, TOKEN, [{ width: 1280, height: 720 }], undefined, context))
        .rejects.toThrow('provider_verification_budget_exceeded');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(context.budget!.requests).toBe(3);
});

it('charges an adapter-supplied run budget instead of the two default metadata reads', async () => {
    const fetchMock = pathTokenBackend();
    vi.stubGlobal('fetch', fetchMock);
    const { adapter } = tusOffsetAdapter();
    const budget = newVerificationBudget(30);
    await verifyReadyProviderAsset(adapter, {
        ...tusInput, mode: 'ready', tusEndpoint: 'https://upload.test/tus/1',
    }, { ...dependencies, budget });
    expect(budget.requests).toBe(fetchMock.mock.calls.length);
});

it('sampled coverage denies every master the playback lists and still probes one segment per run', async () => {
    const second = `https://${HOST}/${PLAYBACK}/alt/video.m3u8`;
    const fetchMock = ladderBackend();
    vi.stubGlobal('fetch', fetchMock);
    const { adapter } = tusOffsetAdapter(undefined, sampledSpec);
    adapter.readPlayback = async () => ({ kind: 'vod', policy: 'signed', sources: [
        { kind: 'hls', url: MASTER, width: null, height: null, bitrate: null },
        { kind: 'hls', url: second, width: null, height: null, bitrate: null },
    ] });
    await verifyReadyProviderAsset(adapter, { ...tusInput, mode: 'ready', tusEndpoint: 'https://upload.test/tus/1' }, dependencies);
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).toContain(MASTER);
    expect(urls).toContain(second);
    expect(urls.filter((url) => url.endsWith('.mp4'))).toEqual([`https://${HOST}/${PLAYBACK}/manifest/seg_0.mp4`]);
});
