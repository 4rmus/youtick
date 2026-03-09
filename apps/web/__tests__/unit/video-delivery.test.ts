import { describe, expect, it } from 'vitest';

import {
  buildManifestPosterUrl,
  buildSegmentedEventTitle,
  createDeliverySegment,
  isDeliveryManifestV2,
  shouldUseSegmentedPlayback,
  shouldUseSegmentedDelivery,
} from '@/lib/video-delivery';

describe('video delivery helpers', () => {
  it('recognizes supported segmented content types', () => {
    expect(shouldUseSegmentedDelivery('video/mp4')).toBe(true);
    expect(shouldUseSegmentedDelivery('video/quicktime')).toBe(true);
    expect(shouldUseSegmentedDelivery('video/webm')).toBe(false);
  });

  it('builds segmented titles with the four-part schema', () => {
    expect(buildSegmentedEventTitle('QmFlat', 'ipfs://QmThumb', 'QmManifest', 'My Title'))
      .toBe('QmFlat:::ipfs://QmThumb:::QmManifest:::My Title');
  });

  it('creates normalized grouped delivery segments', () => {
    const segment = createDeliverySegment(2, [
      { cid: 'QmVideo', trackId: 1, kind: 'video', byteLength: 10, startMs: 4000, endMs: 8000 },
      { cid: 'QmAudio', trackId: 2, kind: 'audio', byteLength: 5, startMs: 4050, endMs: 7900 },
    ]);

    expect(segment.seq).toBe(2);
    expect(segment.durationMs).toBe(4000);
    expect(segment.payloads).toHaveLength(2);
  });

  it('validates delivery manifest shape and resolves poster URLs', () => {
    const manifest = {
      version: 2 as const,
      packaging: 'cmaf' as const,
      encrypted: true,
      codec: 'avc1.64001f, mp4a.40.2',
      contentType: 'video/mp4' as const,
      durationMs: 12000,
      initSegment: { cid: 'QmInit', byteLength: 100 },
      thumbnails: { posterCid: 'QmPoster' },
      tracks: [
        { id: 1, kind: 'video' as const, codec: 'avc1.64001f', bitrate: 1000, timescale: 90000 },
      ],
      segments: [],
    };

    expect(isDeliveryManifestV2(manifest)).toBe(true);
    expect(buildManifestPosterUrl(manifest)).toBe('ipfs://QmPoster');
  });

  it('rejects pathological manifests for segmented playback', () => {
    const manifest = {
      version: 2 as const,
      packaging: 'cmaf' as const,
      encrypted: false,
      codec: 'avc1.64001f, mp4a.40.2',
      contentType: 'video/mp4' as const,
      durationMs: 60000,
      initSegment: { cid: 'QmInit', byteLength: 100 },
      tracks: [
        { id: 1, kind: 'video' as const, codec: 'avc1.64001f', bitrate: 1000, timescale: 90000 },
      ],
      segments: [
        {
          seq: 0,
          durationMs: 60000,
          payloads: [{ cid: 'QmHuge', trackId: 1, kind: 'video' as const, byteLength: 5 * 1024 * 1024, startMs: 0, endMs: 60000 }],
        },
      ],
    };

    expect(shouldUseSegmentedPlayback(manifest)).toBe(false);
  });
});
