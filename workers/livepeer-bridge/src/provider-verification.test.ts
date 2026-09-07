import { afterEach, expect, it, vi } from 'vitest';
import { verifyAdaptiveHls, verifyLivepeerReadyAsset } from './provider-verification';
import { mediaProfiles } from './media-provider';
import profiles from '../../../protocol/paid-media-livepeer-v1/profiles.json';

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
    '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720\n720/index.m3u8\n',
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
        .rejects.toThrow('provider_playback_mismatch');
});
