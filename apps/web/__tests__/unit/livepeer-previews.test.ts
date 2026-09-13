import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPreviewImage, loadPreviewVtt, parsePreviewVtt } from '@/lib/livepeer-previews';

const source = 'https://livepeercdn.com/asset/fixture/thumbnails.vtt';
const vtt = 'WEBVTT\n\nfirst\n00:00.000 --> 00:10.000\nsprite.png#xywh=0,0,128,72\n\n00:00:10.000 --> 00:00:20.000\nsprite.png#xywh=128,0,128,72\n';
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('protected seek previews', () => {
    it('parses relative sprite crops, cue IDs, BOM and CRLF without executing VTT content', () => {
        expect(parsePreviewVtt('\uFEFF' + vtt.replaceAll('\n', '\r\n'), source)).toEqual([
            { start: 0, end: 10, url: 'https://livepeercdn.com/asset/fixture/sprite.png', crop: { x: 0, y: 0, width: 128, height: 72 } },
            { start: 10, end: 20, url: 'https://livepeercdn.com/asset/fixture/sprite.png', crop: { x: 128, y: 0, width: 128, height: 72 } },
        ]);
    });
    it.each([
        'https://evil.test/image.jpg', '//evil.test/image.jpg', 'javascript:alert(1)',
        'https://user:pass@livepeercdn.com/image.jpg', 'https://livepeercdn.com/image.jpg?jwt=secret',
        'sprite.png#xywh=0,0,0,72', 'sprite.png#xywh=0,0,99999999,72', 'sprite.png#anything',
    ])('rejects untrusted or malformed image references: %s', reference => {
        expect(parsePreviewVtt(`WEBVTT\n\n00:00.000 --> 00:10.000\n${reference}\n`, source)).toEqual([]);
    });
    it.each(['00:70.000', '00:10.000', 'NaN'])('rejects invalid/empty time ranges: %s', start => {
        expect(parsePreviewVtt(`WEBVTT\n\n${start} --> 00:10.000\nsprite.png\n`, source)).toEqual([]);
    });
    it('rejects overlaps, excessive cue counts and multi-line payloads', () => {
        expect(parsePreviewVtt(vtt.replace('00:00:10.000', '00:00:09.000'), source)).toEqual([]);
        expect(parsePreviewVtt(vtt.replace('sprite.png#xywh=0,0,128,72', 'sprite.png\n<script>'), source)).toEqual([]);
        const many = Array.from({ length: 10_001 }, (_, index) => `${new Date(index * 1000).toISOString().slice(11, 23)} --> ${new Date((index + 1) * 1000).toISOString().slice(11, 23)}\nsprite.png`).join('\n\n');
        expect(parsePreviewVtt(`WEBVTT\n\n${many}`, source)).toEqual([]);
        expect(parsePreviewVtt('WEBVTT\n\n' + 'x'.repeat(1_048_576), source)).toEqual([]);
    });
    it('uses the current JWT header, omits credentials and refuses redirects', async () => {
        const fetcher = vi.fn().mockImplementation(async () => new Response(vtt));
        vi.stubGlobal('fetch', fetcher);
        expect(await loadPreviewVtt(source, 'first-token', new AbortController().signal)).toHaveLength(2);
        await loadPreviewVtt(source, 'renewed-token', new AbortController().signal);
        expect(fetcher.mock.calls[1]).toEqual([source, expect.objectContaining({
            headers: { 'Livepeer-Jwt': 'renewed-token' }, redirect: 'error', credentials: 'omit', cache: 'no-store',
        })]);
        await expect(loadPreviewVtt('https://evil.test/map.vtt', 'token', new AbortController().signal)).rejects.toThrow();
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('cancels an oversized streamed file without consuming the remaining body', async () => {
        let cancelled = false;
        const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1_048_577)); }, cancel() { cancelled = true; } });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
        await expect(loadPreviewVtt(source, 'token', new AbortController().signal)).rejects.toThrow('preview_unavailable');
        expect(cancelled).toBe(true);
    });
    it.each([401, 403, 302, 500])('does not use a %i response', async status => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(vtt, { status })));
        await expect(loadPreviewVtt(source, 'token', new AbortController().signal)).rejects.toThrow('preview_unavailable');
    });
    it('does not fetch after cancellation and does not decode SVG or overlarge images', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }));
        vi.stubGlobal('fetch', fetcher);
        const decode = vi.fn(); vi.stubGlobal('createImageBitmap', decode);
        const controller = new AbortController(); controller.abort();
        await expect(loadPreviewVtt(source, 'token', controller.signal)).rejects.toThrow();
        expect(fetcher).not.toHaveBeenCalled();
        await expect(loadPreviewImage(source, 'token', new AbortController().signal)).rejects.toThrow('preview_unavailable');
        expect(decode).not.toHaveBeenCalled();
        const close = vi.fn();
        fetcher.mockResolvedValue(new Response(png, { headers: { 'Content-Type': 'image/png' } }));
        decode.mockResolvedValue({ width: 9000, height: 100, close });
        await expect(loadPreviewImage(source, 'token', new AbortController().signal)).rejects.toThrow('preview_unavailable');
        expect(close).toHaveBeenCalledOnce();
    });
});
