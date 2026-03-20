import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchFromGatewaysMock = vi.fn();

vi.mock('@/lib/crust', () => ({
  fetchFromGateways: fetchFromGatewaysMock,
}));

describe('video delivery display media resolution', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('caches resolved poster URLs for repeated manifest lookups', async () => {
    fetchFromGatewaysMock.mockResolvedValue(
      new Response(JSON.stringify({
        version: 2,
        packaging: 'cmaf',
        encrypted: false,
        codec: 'avc1.64001f, mp4a.40.2',
        contentType: 'video/mp4',
        durationMs: 12_000,
        initSegment: { cid: 'QmInit', byteLength: 100 },
        thumbnails: { posterCid: 'QmPosterCid123456789012345678901234567890123456' },
        tracks: [
          { id: 1, kind: 'video', codec: 'avc1.64001f', bitrate: 1000, timescale: 90000 },
        ],
        segments: [],
      })),
    );

    const {
      DISPLAY_MEDIA_MANIFEST_TIMEOUT_MS,
      resolvePreferredMediaUrl,
    } = await import('@/lib/video-delivery');

    const thumbnailUrl = 'ipfs://QmThumbCid123456789012345678901234567890123456';
    const manifestCid = 'QmManifestCid12345678901234567890123456789012345';

    const first = await resolvePreferredMediaUrl(thumbnailUrl, manifestCid);
    const second = await resolvePreferredMediaUrl(thumbnailUrl, manifestCid);

    expect(first).toBe('ipfs://QmPosterCid123456789012345678901234567890123456');
    expect(second).toBe(first);
    expect(fetchFromGatewaysMock).toHaveBeenCalledTimes(1);
    expect(fetchFromGatewaysMock).toHaveBeenCalledWith(manifestCid, {
      purpose: 'manifest',
      timeout: DISPLAY_MEDIA_MANIFEST_TIMEOUT_MS,
    });
  });

  it('falls back to the title thumbnail when manifest fetch fails', async () => {
    fetchFromGatewaysMock.mockRejectedValue(new Error('gateway timeout'));

    const { resolvePreferredMediaUrl } = await import('@/lib/video-delivery');

    const thumbnailUrl = 'ipfs://QmThumbCid123456789012345678901234567890123456';
    const manifestCid = 'QmManifestCid12345678901234567890123456789012345';

    await expect(resolvePreferredMediaUrl(thumbnailUrl, manifestCid)).resolves.toBe(thumbnailUrl);
  });
});
