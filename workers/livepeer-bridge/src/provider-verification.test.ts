import { afterEach, expect, it, vi } from 'vitest';
import {
    verifyAdaptiveHlsWith,
    verifyReadyProviderAsset,
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
        tokenPlacement: 'path',
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
    for (const name of ['provider-verification.ts', 'provider-webhook.ts', 'cover-image.ts']) {
        const source = await fs.readFile(new URL(`./${name}`, (import.meta as unknown as { url: string }).url), 'utf8');
        expect(source, name).not.toMatch(
            /livepeer|lp-playback|origin\.livepeer|Livepeer-Jwt|Livepeer-Signature|html5\/|text\/vtt|application\/vnd\.apple/i,
        );
    }
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

function tusOffsetAdapter(tus = { offsetBytes: '10', lengthBytes: '10' }) {
    const readTusOffset = vi.fn(async (_uploadUrl: string) => tus);
    const adapter: VerificationAdapter = {
        capabilities: { sourceBytesProof: 'tus-offset' },
        spec: pathTokenSpec,
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

it('reuses stored evidence in published mode and never reads the upload again', async () => {
    vi.stubGlobal('fetch', pathTokenBackend());
    const { adapter, readTusOffset } = tusOffsetAdapter();
    const storedEvidence = { method: 'tus-offset' as const, offsetBytes: '10', lengthBytes: '10', observedAtMs: 1 };

    const result = await verifyReadyProviderAsset(adapter, { ...tusInput, mode: 'published', storedEvidence }, dependencies);

    expect(readTusOffset).not.toHaveBeenCalled();
    expect(result).toMatchObject({ verifiedSourceBytes: '10' });
    expect(result).not.toHaveProperty('sourceBytesEvidence');
    await expect(verifyReadyProviderAsset(adapter, { ...tusInput, mode: 'published' }, dependencies))
        .rejects.toThrow('provider_state_invalid');
});
