import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDeliveryPlaybackSession } from '@/lib/video-delivery-player';
import type { DeliveryManifestV2 } from '@/lib/types';

const { fetchFromGateways } = vi.hoisted(() => ({
  fetchFromGateways: vi.fn(),
}));

vi.mock('@/lib/crust', () => ({
  fetchFromGateways,
}));

vi.mock('@/lib/kms', () => ({
  decodeCounter: vi.fn(),
  importAESKey: vi.fn(),
}));

class FakeSourceBuffer extends EventTarget {
  mode = 'segments';
  updating = false;
  operations: Array<{ type: 'append' | 'remove'; buffer?: ArrayBuffer; start?: number; end?: number }> = [];

  buffered = {
    length: 0,
    start: (index: number) => {
      void index;
      return 0;
    },
    end: (index: number) => {
      void index;
      return 0;
    },
  };

  appendBuffer(buffer: ArrayBuffer) {
    this.updating = true;
    this.operations.push({ type: 'append', buffer });
  }

  remove(start: number, end: number) {
    this.updating = true;
    this.operations.push({ type: 'remove', start, end });
  }

  abort() {
    this.updating = false;
  }

  flushNext() {
    if (this.operations.length === 0) {
      return;
    }

    this.operations.shift();
    this.updating = false;
    this.dispatchEvent(new Event('updateend'));
  }
}

class FakeMediaSource extends EventTarget {
  static latest: FakeMediaSource | null = null;

  readyState: 'closed' | 'open' | 'ended' = 'closed';
  duration = Number.NaN;
  sourceBuffer = new FakeSourceBuffer();

  constructor() {
    super();
    FakeMediaSource.latest = this;
  }

  addSourceBuffer(mimeType: string) {
    void mimeType;
    return this.sourceBuffer as unknown as SourceBuffer;
  }

  endOfStream() {
    this.readyState = 'ended';
  }

  open() {
    this.readyState = 'open';
    this.dispatchEvent(new Event('sourceopen'));
  }
}

class FakeVideoElement extends EventTarget {
  src = '';
  currentTime = 0;
  buffered = {
    length: 0,
    start: (index: number) => {
      void index;
      return 0;
    },
    end: (index: number) => {
      void index;
      return 0;
    },
  };
}

const manifest: DeliveryManifestV2 = {
  version: 2,
  packaging: 'cmaf',
  encrypted: false,
  codec: 'avc1.64001f, mp4a.40.2',
  contentType: 'video/mp4',
  durationMs: 8_000,
  initSegment: {
    cid: 'QmInit',
    byteLength: 4,
  },
  tracks: [
    { id: 1, kind: 'video', codec: 'avc1.64001f', bitrate: 1000, timescale: 90_000 },
  ],
  segments: [
    {
      seq: 0,
      durationMs: 4_000,
      payloads: [
        { cid: 'QmSeg0', trackId: 1, kind: 'video', byteLength: 4, startMs: 0, endMs: 4_000 },
      ],
    },
    {
      seq: 1,
      durationMs: 4_000,
      payloads: [
        { cid: 'QmSeg1', trackId: 1, kind: 'video', byteLength: 4, startMs: 4_000, endMs: 8_000 },
      ],
    },
  ],
};

const manifestWithAudioOnlyGap: DeliveryManifestV2 = {
  version: 2,
  packaging: 'cmaf',
  encrypted: false,
  codec: 'avc1.64001f, mp4a.40.2',
  contentType: 'video/mp4',
  durationMs: 12_000,
  initSegment: {
    cid: 'QmInitGap',
    byteLength: 4,
  },
  tracks: [
    { id: 1, kind: 'video', codec: 'avc1.64001f', bitrate: 1000, timescale: 90_000 },
    { id: 2, kind: 'audio', codec: 'mp4a.40.2', bitrate: 128_000, timescale: 48_000 },
  ],
  segments: [
    {
      seq: 0,
      durationMs: 4_000,
      payloads: [
        { cid: 'QmVideo0', trackId: 1, kind: 'video', byteLength: 4, startMs: 0, endMs: 4_000 },
        { cid: 'QmAudio0', trackId: 2, kind: 'audio', byteLength: 4, startMs: 0, endMs: 4_000 },
      ],
    },
    {
      seq: 1,
      durationMs: 4_000,
      payloads: [
        { cid: 'QmAudio1', trackId: 2, kind: 'audio', byteLength: 4, startMs: 4_000, endMs: 8_000 },
      ],
    },
    {
      seq: 2,
      durationMs: 4_000,
      payloads: [
        { cid: 'QmVideo1', trackId: 1, kind: 'video', byteLength: 4, startMs: 8_000, endMs: 12_000 },
        { cid: 'QmAudio2', trackId: 2, kind: 'audio', byteLength: 4, startMs: 8_000, endMs: 12_000 },
      ],
    },
  ],
};

const longManifest: DeliveryManifestV2 = {
  version: 2,
  packaging: 'cmaf',
  encrypted: false,
  codec: 'avc1.64001f, mp4a.40.2',
  contentType: 'video/mp4',
  durationMs: 20_000,
  initSegment: {
    cid: 'QmInitLong',
    byteLength: 4,
  },
  tracks: [
    { id: 1, kind: 'video', codec: 'avc1.64001f', bitrate: 1000, timescale: 90_000 },
  ],
  segments: Array.from({ length: 5 }, (_, index) => ({
    seq: index,
    durationMs: 4_000,
    payloads: [
      {
        cid: `QmLongSeg${index}`,
        trackId: 1,
        kind: 'video' as const,
        byteLength: 4,
        startMs: index * 4_000,
        endMs: (index + 1) * 4_000,
      },
    ],
  })),
};

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function getFirstOperationByte(sourceBuffer: FakeSourceBuffer): number | undefined {
  const operation = sourceBuffer.operations[0];
  if (!operation?.buffer) {
    return undefined;
  }

  return new Uint8Array(operation.buffer)[0];
}

describe('video delivery playback session', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    fetchFromGateways.mockImplementation(async (cid: string) => (
      new Response(Uint8Array.from([cid.length, 1, 2, 3]), { status: 200 })
    ));

    Object.defineProperty(globalThis, 'MediaSource', {
      configurable: true,
      writable: true,
      value: FakeMediaSource,
    });

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:delivery-session'),
    });

    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  it('refetches queued segments after seek clears pending appends', async () => {
    const session = createDeliveryPlaybackSession(manifest);
    const video = new FakeVideoElement();

    session.start(video as unknown as HTMLVideoElement);

    const mediaSource = FakeMediaSource.latest;
    expect(mediaSource).not.toBeNull();

    mediaSource?.open();
    await flushAsyncWork();

    expect(fetchFromGateways.mock.calls.map(([cid]) => cid)).toEqual([
      'QmInit',
      'QmSeg0',
      'QmSeg1',
    ]);

    mediaSource?.sourceBuffer.flushNext();
    await flushAsyncWork();

    expect(mediaSource?.sourceBuffer.updating).toBe(true);

    video.currentTime = 4;
    video.dispatchEvent(new Event('seeking'));
    await flushAsyncWork();

    const segmentOneFetches = fetchFromGateways.mock.calls.filter(([cid]) => cid === 'QmSeg1');
    expect(segmentOneFetches).toHaveLength(2);

    session.destroy();
  });

  it('appends fetched segments in timeline order even when IPFS returns later segments first', async () => {
    let resolveSeg0: (response: Response) => void = () => {};
    let resolveSeg1: (response: Response) => void = () => {};

    fetchFromGateways.mockImplementation((cid: string) => {
      if (cid === 'QmInit') {
        return Promise.resolve(new Response(Uint8Array.from([1]), { status: 200 }));
      }

      if (cid === 'QmSeg0') {
        return new Promise<Response>((resolve) => {
          resolveSeg0 = resolve;
        });
      }

      if (cid === 'QmSeg1') {
        return new Promise<Response>((resolve) => {
          resolveSeg1 = resolve;
        });
      }

      throw new Error(`Unexpected CID ${cid}`);
    });

    const session = createDeliveryPlaybackSession(manifest);
    const video = new FakeVideoElement();

    session.start(video as unknown as HTMLVideoElement);
    const mediaSource = FakeMediaSource.latest;

    mediaSource?.open();
    await flushAsyncWork();

    mediaSource?.sourceBuffer.flushNext();
    await flushAsyncWork();

    resolveSeg1(new Response(Uint8Array.from([101]), { status: 200 }));
    await flushAsyncWork();

    expect(mediaSource?.sourceBuffer.operations).toHaveLength(0);

    resolveSeg0(new Response(Uint8Array.from([100]), { status: 200 }));
    await flushAsyncWork();

    expect(getFirstOperationByte(mediaSource?.sourceBuffer as FakeSourceBuffer)).toBe(100);

    mediaSource?.sourceBuffer.flushNext();
    await flushAsyncWork();

    expect(getFirstOperationByte(mediaSource?.sourceBuffer as FakeSourceBuffer)).toBe(101);

    session.destroy();
  });

  it('keeps startup downloads focused on the immediate playable window', async () => {
    const session = createDeliveryPlaybackSession(longManifest);
    const video = new FakeVideoElement();

    session.start(video as unknown as HTMLVideoElement);
    const mediaSource = FakeMediaSource.latest;

    mediaSource?.open();
    await flushAsyncWork();

    expect(fetchFromGateways.mock.calls.map(([cid]) => cid)).toEqual([
      'QmInitLong',
      'QmLongSeg0',
      'QmLongSeg1',
    ]);

    session.destroy();
  });

  it('snaps seeks to the next real video segment when a manifest has an audio-only gap', () => {
    const session = createDeliveryPlaybackSession(manifestWithAudioOnlyGap);

    expect(session.getPreferredSeekTime(5.5)).toBe(8);
    expect(session.getPreferredSeekTime(2)).toBe(0);

    session.destroy();
  });
});
