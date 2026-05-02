import { describe, expect, it } from 'vitest';

import {
  buildManifestPosterUrl,
  buildSegmentedEventTitle,
  combinePackagedSegmentPayloads,
  createDeliverySegment,
  isDeliveryManifestV2,
  pickPreferredPosterUrl,
  resolveDeliveryManifestRefs,
  shouldUseSegmentedPlayback,
  shouldUseSegmentedDelivery,
} from '@/lib/video-delivery';

describe('video delivery helpers', () => {
  it('recognizes supported segmented content types', () => {
    expect(shouldUseSegmentedDelivery('video/mp4')).toBe(true);
    expect(shouldUseSegmentedDelivery('video/quicktime')).toBe(true);
    expect(shouldUseSegmentedDelivery('video/webm')).toBe(false);
  });

  it('builds segmented titles with the manifest-first schema', () => {
    expect(buildSegmentedEventTitle('ipfs://QmThumb', 'QmManifest', 'My Title'))
      .toBe('QmManifest:::ipfs://QmThumb:::My Title');
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

  it('combines same-window payloads into one uploadable buffer', () => {
    const combined = combinePackagedSegmentPayloads([
      {
        trackId: 2,
        kind: 'audio',
        codec: 'mp4a.40.2',
        byteLength: 3,
        startMs: 4050,
        endMs: 7900,
        buffer: new Uint8Array([4, 5, 6]).buffer,
      },
      {
        trackId: 1,
        kind: 'video',
        codec: 'avc1.64001f',
        byteLength: 4,
        startMs: 4000,
        endMs: 8000,
        buffer: new Uint8Array([0, 1, 2, 3]).buffer,
      },
    ]);

    expect(combined.trackId).toBe(1);
    expect(combined.kind).toBe('video');
    expect(combined.byteLength).toBe(7);
    expect(combined.startMs).toBe(4000);
    expect(combined.endMs).toBe(8000);
    expect(Array.from(new Uint8Array(combined.buffer))).toEqual([0, 1, 2, 3, 4, 5, 6]);
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
    expect(pickPreferredPosterUrl('ipfs://QmThumb', manifest)).toBe('ipfs://QmPoster');
    expect(pickPreferredPosterUrl('ipfs://QmThumb', undefined)).toBe('ipfs://QmThumb');
  });

  it('resolves relative manifest asset paths against the manifest directory', () => {
    const manifest = {
      version: 2 as const,
      packaging: 'cmaf' as const,
      encrypted: true,
      codec: 'avc1.64001f, mp4a.40.2',
      contentType: 'video/mp4' as const,
      durationMs: 12000,
      initSegment: { cid: 'init.mp4', byteLength: 100 },
      thumbnails: { posterCid: 'posters/main poster.webp' },
      tracks: [
        { id: 1, kind: 'video' as const, codec: 'avc1.64001f', bitrate: 1000, timescale: 90000 },
      ],
      segments: [
        {
          seq: 0,
          durationMs: 4000,
          payloads: [
            { cid: 'segments/000000.m4s', trackId: 1, kind: 'video' as const, byteLength: 100, startMs: 0, endMs: 4000 },
            { cid: 'QmAbsoluteSegmentCid123456789012345678901234567890', trackId: 2, kind: 'audio' as const, byteLength: 50, startMs: 0, endMs: 4000 },
          ],
        },
      ],
    };

    const resolved = resolveDeliveryManifestRefs(
      manifest,
      'bafyrootcid1234567890123456789012345678901234567890/manifest.json',
    );

    expect(resolved.initSegment.cid).toBe(
      'bafyrootcid1234567890123456789012345678901234567890/init.mp4',
    );
    expect(resolved.thumbnails?.posterCid).toBe(
      'bafyrootcid1234567890123456789012345678901234567890/posters/main poster.webp',
    );
    expect(resolved.segments[0].payloads[0].cid).toBe(
      'bafyrootcid1234567890123456789012345678901234567890/segments/000000.m4s',
    );
    expect(resolved.segments[0].payloads[1].cid).toBe(
      'QmAbsoluteSegmentCid123456789012345678901234567890',
    );
    expect(buildManifestPosterUrl(resolved)).toBe(
      'ipfs://bafyrootcid1234567890123456789012345678901234567890/posters/main poster.webp',
    );
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
