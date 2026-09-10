import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoaderCallbacks, LoaderContext } from 'hls.js';

const state = vi.hoisted(() => ({ callbacks: [] as LoaderCallbacks<LoaderContext>[], abort: vi.fn(), destroy: vi.fn() }));
vi.mock('hls.js', () => ({ default: { DefaultConfig: { loader: class {
    load(_context: unknown, _config: unknown, callbacks: LoaderCallbacks<LoaderContext>) { state.callbacks.push(callbacks); }
    abort() { state.abort(); }
    destroy() { state.destroy(); }
} } } }));

import { createObservedTimelineLoaders, observedSegmentOffsets, rebaseObservedSegment } from '@/lib/livepeer-hls-timeline';

// Exact observed provider playlist; references are numeric relative paths only.
const durations = ['12.095','9.009','9.009','11.970','9.009','9.009','12.012','9.009','8.967','12.012','9.009','9.009','11.970','9.009','9.009','12.012','8.967','9.009','12.012','9.009','8.967','12.012','9.009','9.009','8.592'];
const observed = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-TARGETDURATION:13\n'
    + durations.map((duration, sn) => `#EXTINF:${duration},\n${sn}.ts\n`).join('') + '#EXT-X-ENDLIST\n';


// Minimal PES packets, not generated video. BigInt encodes independent wire fixtures.
function packet(stream: number, pts: number, dts?: number): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(188).fill(0xff);
    bytes.set([0x47, 0x40, 0, 0x10, 0, 0, 1, stream, 0, 0, 0x80, dts === undefined ? 0x80 : 0xc0, dts === undefined ? 5 : 10]);
    const write = (pos: number, ticks: number, prefix: number) => {
        const time = BigInt(ticks);
        bytes.set([prefix | Number((time >> 29n) & 14n) | 1, Number((time >> 22n) & 255n), Number((time >> 14n) & 254n) | 1, Number((time >> 7n) & 255n), Number((time << 1n) & 254n) | 1], pos);
    };
    write(13, pts, dts === undefined ? 0x20 : 0x30);
    if (dts !== undefined) write(18, dts, 0x10);
    return bytes;
}
function segment(videoPts = 135000, audioPts = 127541): ArrayBuffer {
    const bytes = new Uint8Array(376);
    bytes.set(packet(0xe0, videoPts, videoPts - 6000));
    bytes.set(packet(0xc0, audioPts), 188);
    return bytes.buffer;
}
const playlistUrl = 'https://playback.livepeer.studio/verified/index.m3u8';
async function verifyPlaylist(loaders: ReturnType<typeof createObservedTimelineLoaders>, source = observed) {
    const onSuccess = vi.fn();
    const loader = new loaders.pLoader({} as never);
    loader.load({ url: playlistUrl } as never, {} as never, { onSuccess } as never);
    const response = { url: playlistUrl, data: source };
    state.callbacks.at(-1)!.onSuccess(response, {} as never, { url: playlistUrl } as never, null);
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(onSuccess.mock.calls[0][0]).toBe(response);
}
function deliverSegment(loaders: ReturnType<typeof createObservedTimelineLoaders>, input: ArrayBuffer, overrides = {}) {
    const context = { url: 'https://playback.livepeer.studio/verified/1.ts', frag: { sn: 1, baseurl: playlistUrl, cc: 0 }, part: null, ...overrides };
    const onSuccess = vi.fn(), onError = vi.fn(), onTimeout = vi.fn();
    new loaders.fLoader({} as never).load(context as never, {} as never, { onSuccess, onError, onTimeout });
    const callbacks = state.callbacks.at(-1)!;
    expect(callbacks.onError).toBe(onError);
    expect(callbacks.onTimeout).toBe(onTimeout);
    const stats = {}, network = {};
    callbacks.onSuccess({ url: context.url, data: input }, stats as never, context as never, network);
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0].slice(1)).toEqual([stats, context, network]);
    expect(onSuccess.mock.calls[0][0].url).toBe(context.url);
    return onSuccess.mock.calls[0][0].data as ArrayBuffer;
}
afterEach(() => { vi.restoreAllMocks(); state.callbacks = []; state.abort.mockClear(); state.destroy.mockClear(); });

describe('observed HLS timestamp repair', () => {
    it('uses the exact observed playlist to freeze the 25 nominal segment offsets', async () => {
        expect(createHash('sha256').update(observed).digest('hex')).toBe('daa629f3156f8fe09843b69de756785d2cd823da0a0a0f7d202c41df541c0720');
        const offsets = await observedSegmentOffsets(observed);
        expect(offsets).toHaveLength(25);
        expect(offsets?.slice(0, 3)).toEqual([0, 1088550, 1899360]);
        expect(offsets?.[24]).toBe(21610170);
    });
    it.each([observed.replace('12.095', '12.096'), observed.replace('0.ts', 'other.ts'), observed.replace('#EXT-X-ENDLIST\n', ''), '#EXTM3U\n#EXT-X-ERROR:denied\n', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvariant.m3u8\n'])(
        'does not authorize a different, changed, live or error playlist', async source => {
            expect(await observedSegmentOffsets(source)).toBeNull();
        },
    );
    it('rebases PTS and DTS equally and preserves every non-clock byte and the input buffer', () => {
        const input = segment();
        const saved = input.slice(0);
        const output = rebaseObservedSegment(input, 1088550);
        expect(output).toEqual(segment(1223550, 1216091));
        expect(input).toEqual(saved);
        expect(rebaseObservedSegment(input, 0)).toBe(input);
        expect(rebaseObservedSegment(output, 1088550)).toBe(output);
    });
    it('leaves malformed and unsupported media untouched', () => {
        const invalidSync = segment(); new Uint8Array(invalidSync)[188] = 0;
        const invalidMarker = segment(); new Uint8Array(invalidMarker)[13] &= 0xfe;
        for (const bytes of [invalidSync, invalidMarker, new ArrayBuffer(3), packet(0xe0, 135000).buffer, segment(200000, 192541)]) {
            expect(rebaseObservedSegment(bytes, 1088550)).toBe(bytes);
        }
    });
    it('repairs only fragments of this player’s verified playlist and keeps the playlist unchanged', async () => {
        const loaders = createObservedTimelineLoaders();
        const input = segment();
        expect(deliverSegment(loaders, input)).toBe(input);
        await verifyPlaylist(loaders);
        expect(deliverSegment(loaders, input)).toEqual(segment(1223550, 1216091));
        expect(deliverSegment(createObservedTimelineLoaders(), input)).toBe(input);
        expect(deliverSegment(loaders, input, { frag: { sn: 1, baseurl: 'other', cc: 0 } })).toBe(input);
        expect(deliverSegment(loaders, input, { frag: { sn: 1, baseurl: playlistUrl, cc: 1 } })).toBe(input);
        expect(deliverSegment(loaders, input, { frag: { sn: 25, baseurl: playlistUrl, cc: 0 } })).toBe(input);
        expect(deliverSegment(loaders, input, { part: {} })).toBe(input);
        await verifyPlaylist(loaders, observed.replace('0.ts', 'changed.ts'));
        expect(deliverSegment(loaders, input)).toBe(input);
    });
    it.each(['abort', 'destroy', 'next load'] as const)('does not authorize or deliver a late hashed playlist after %s', async cancel => {
        let finish!: (value: ArrayBuffer) => void;
        vi.spyOn(crypto.subtle, 'digest').mockReturnValue(new Promise(resolve => { finish = resolve; }));
        const loaders = createObservedTimelineLoaders(), onSuccess = vi.fn();
        const loader = new loaders.pLoader({} as never);
        loader.load({ url: playlistUrl } as never, {} as never, { onSuccess } as never);
        state.callbacks[0].onSuccess({ url: playlistUrl, data: observed }, {} as never, { url: playlistUrl } as never, null);
        if (cancel === 'next load') loader.load({ url: playlistUrl } as never, {} as never, { onSuccess } as never);
        else loader[cancel]();
        finish(new Uint8Array(createHash('sha256').update(observed).digest()).buffer);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(onSuccess).not.toHaveBeenCalled();
        const input = segment(); expect(deliverSegment(loaders, input)).toBe(input);
        if (cancel !== 'next load') expect(state[cancel]).toHaveBeenCalledOnce();
    });
    it('falls back unchanged when hashing is unavailable', async () => {
        const loaders = createObservedTimelineLoaders();
        vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('unavailable'));
        await verifyPlaylist(loaders);
        const input = segment(); expect(deliverSegment(loaders, input)).toBe(input);
    });
});
