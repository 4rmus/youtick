import Hls, { type FragmentLoaderContext, type LoaderCallbacks, type LoaderConfiguration, type LoaderContext, type PlaylistLoaderContext } from 'hls.js';

export const OBSERVED_RESET_PLAYBACK_ID = 'ef819lp2r3anecgq';
const OBSERVED_PLAYLIST_SHA256 = 'daa629f3156f8fe09843b69de756785d2cd823da0a0a0f7d202c41df541c0720';
const PTS_WRAP = 2 ** 33;

export async function observedSegmentOffsets(source: string): Promise<number[] | null> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== OBSERVED_PLAYLIST_SHA256) return null;
    let seconds = 0;
    return [...source.matchAll(/^#EXTINF:([0-9.]+),/gm)].map((match) => {
        const offset = Math.round(seconds * 90_000);
        seconds += Number(match[1]);
        return offset;
    });
}

// Only for hls.js demuxing of this measured MPEG-TS asset, not for exporting TS.
// Add one common offset to audio/video PTS and DTS; leave payload and A/V delta intact.
export function rebaseObservedSegment(buffer: ArrayBuffer, offset: number): ArrayBuffer {
    const bytes = new Uint8Array(buffer);
    if (!offset || bytes.length % 188) return buffer;
    const fields: number[] = [];
    let videoFirst: number | undefined;
    let audioFirst: number | undefined;
    const read = (p: number) => (bytes[p] & 0x0e) * 536870912 + bytes[p + 1] * 4194304
        + (bytes[p + 2] & 0xfe) * 16384 + bytes[p + 3] * 128 + (bytes[p + 4] & 0xfe) / 2;
    for (let packet = 0; packet < bytes.length; packet += 188) {
        if (bytes[packet] !== 0x47) return buffer;
        if (!(bytes[packet + 1] & 0x40)) continue;
        const mode = (bytes[packet + 3] >> 4) & 3;
        if (mode === 0 || mode === 2) continue;
        let pes = packet + 4;
        if (mode === 3) pes += 1 + bytes[pes];
        if (pes + 9 > packet + 188 || bytes[pes] || bytes[pes + 1] || bytes[pes + 2] !== 1) continue;
        const stream = bytes[pes + 3];
        const video = stream >= 0xe0 && stream <= 0xef;
        const audio = stream >= 0xc0 && stream <= 0xdf;
        if ((!video && !audio) || !(bytes[pes + 7] & 0x80)) continue;
        const length = bytes[pes + 7] & 0x40 ? 10 : 5;
        if (bytes[pes + 8] < length || pes + 9 + length > packet + 188) return buffer;
        for (let p = pes + 9; p < pes + 9 + length; p += 5) {
            if (!(bytes[p] & bytes[p + 2] & bytes[p + 4] & 1)) return buffer;
            fields.push(p);
        }
        if (video) videoFirst ??= read(pes + 9);
        if (audio) audioFirst ??= read(pes + 9);
    }
    // All 50 measured segments restart at these clocks. Already-corrected data passes through.
    if (videoFirst !== 135_000 || audioFirst === undefined || audioFirst < 126_000 || audioFirst > 132_000) return buffer;
    const result = bytes.slice();
    for (const p of fields) {
        const time = (read(p) + offset) % PTS_WRAP;
        result[p] = (bytes[p] & 0xf1) | ((Math.floor(time / 1073741824) & 7) << 1);
        result[p + 1] = Math.floor(time / 4194304) & 255;
        result[p + 2] = ((Math.floor(time / 32768) & 127) << 1) | 1;
        result[p + 3] = Math.floor(time / 128) & 255;
        result[p + 4] = ((time & 127) << 1) | 1;
    }
    return result.buffer;
}

// ponytail: one diagnosed playback ID + exact playlist hash, remove after provider repair.
// Two native loader extensions share only the verified playlist offsets for this player.
export function createObservedTimelineLoaders() {
    const timelines = new Map<string, number[]>();
    return {
        pLoader: class extends Hls.DefaultConfig.loader {
            declare context: PlaylistLoaderContext | null;
            private revision = 0;

            override load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>): void {
                const revision = ++this.revision;
                super.load(context, config, {
                    ...callbacks,
                    onSuccess: (response, stats, loadedContext, networkDetails) => {
                        const deliver = (offsets: number[] | null) => {
                            if (revision !== this.revision) return;
                            for (const url of [response.url, loadedContext.url]) {
                                if (offsets) timelines.set(url, offsets);
                                else timelines.delete(url);
                            }
                            callbacks.onSuccess(response, stats, loadedContext, networkDetails);
                        };
                        if (typeof response.data !== 'string') return deliver(null);
                        void observedSegmentOffsets(response.data).then(deliver, () => deliver(null));
                    },
                });
            }
            override abort(): void { this.revision += 1; super.abort(); }
            override destroy(): void { this.revision += 1; super.destroy(); }
        },
        fLoader: class extends Hls.DefaultConfig.loader {
            declare context: FragmentLoaderContext | null;
            override load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>): void {
                super.load(context, config, {
                    ...callbacks,
                    onSuccess: (response, stats, loadedContext, networkDetails) => {
                        const { frag, part } = loadedContext as FragmentLoaderContext;
                        const offsets = frag && timelines.get(frag.baseurl);
                        const offset = offsets && typeof frag.sn === 'number' && Number.isSafeInteger(frag.sn)
                            ? offsets[frag.sn] : undefined;
                        const data = response.data instanceof ArrayBuffer && offset !== undefined && !part && frag.cc === 0
                            ? rebaseObservedSegment(response.data, offset) : response.data;
                        callbacks.onSuccess({ ...response, data }, stats, loadedContext, networkDetails);
                    },
                });
            }
        },
    };
}
