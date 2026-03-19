import { describe, expect, it } from 'vitest';

import {
  CARD_THUMBNAIL_HEIGHT,
  CARD_THUMBNAIL_WIDTH,
  POSTER_THUMBNAIL_HEIGHT,
  POSTER_THUMBNAIL_WIDTH,
  getThumbnailDimensions,
} from '@/lib/video-utils';

describe('video-utils thumbnail sizing', () => {
  it('downscales large frames to card thumbnail bounds by default', () => {
    expect(getThumbnailDimensions(3840, 2160)).toEqual({
      width: CARD_THUMBNAIL_WIDTH,
      height: CARD_THUMBNAIL_HEIGHT,
    });
  });

  it('preserves aspect ratio for portrait videos', () => {
    expect(getThumbnailDimensions(1080, 1920)).toEqual({ width: 152, height: 270 });
  });

  it('keeps already-small card thumbnails at their original size', () => {
    expect(getThumbnailDimensions(320, 180)).toEqual({ width: 320, height: 180 });
  });

  it('supports explicit poster thumbnail bounds', () => {
    expect(getThumbnailDimensions(640, 360, POSTER_THUMBNAIL_WIDTH, POSTER_THUMBNAIL_HEIGHT)).toEqual({
      width: 640,
      height: 360,
    });
    expect(getThumbnailDimensions(3840, 2160, POSTER_THUMBNAIL_WIDTH, POSTER_THUMBNAIL_HEIGHT)).toEqual({
      width: POSTER_THUMBNAIL_WIDTH,
      height: POSTER_THUMBNAIL_HEIGHT,
    });
  });
});
