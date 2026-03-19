import { describe, expect, it } from 'vitest';

import {
  estimateSharedSegmentSampleCount,
  estimateTrackSegmentSampleCount,
  groupPayloadsByVideoAnchor,
} from '@/lib/video-delivery-segmentation';

describe('video delivery segmentation helpers', () => {
  it('uses the smallest shared sample count so no track stretches far past target duration', () => {
    const videoSamples = Array.from({ length: 96 }, () => ({
      duration: 3750,
      timescale: 90000,
    }));
    const audioSamples = Array.from({ length: 188 }, () => ({
      duration: 1024,
      timescale: 48000,
    }));

    expect(estimateTrackSegmentSampleCount(videoSamples, 4000)).toBe(96);
    expect(estimateTrackSegmentSampleCount(audioSamples, 4000)).toBe(188);
    expect(estimateSharedSegmentSampleCount([videoSamples, audioSamples], 4000)).toBe(96);
  });

  it('ignores empty tracks when deriving the shared sample count', () => {
    const videoSamples = Array.from({ length: 96 }, () => ({
      duration: 3750,
      timescale: 90000,
    }));

    expect(estimateSharedSegmentSampleCount([videoSamples, []], 4000)).toBe(96);
  });

  it('falls back to at least one sample for empty tracks', () => {
    expect(estimateTrackSegmentSampleCount([], 4000)).toBe(1);
    expect(estimateSharedSegmentSampleCount([[]], 4000)).toBe(1);
  });

  it('anchors mixed payload groups on video segments so seek does not hit audio-only gaps', () => {
    const groups = groupPayloadsByVideoAnchor([
      { kind: 'video' as const, startMs: 0, endMs: 8000 },
      { kind: 'audio' as const, startMs: 0, endMs: 2560 },
      { kind: 'audio' as const, startMs: 2560, endMs: 5120 },
      { kind: 'audio' as const, startMs: 5120, endMs: 7680 },
      { kind: 'video' as const, startMs: 8000, endMs: 16000 },
      { kind: 'audio' as const, startMs: 7680, endMs: 10240 },
    ], 4000);

    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.some((payload) => payload.kind === 'video'))).toBe(true);
    expect(groups[0].map((payload) => payload.startMs)).toEqual([0, 0, 2560, 5120]);
    expect(groups[1].map((payload) => payload.startMs)).toEqual([7680, 8000]);
  });
});
