import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nativePlaybackSource } from '@/lib/v2/playback';
import {
    createStreamHlsConfig, expectedStreamHlsUrl, isStreamAuthFailure, isStreamMediaUrl, reloadStreamSource, streamAuthRetryDelay,
    startPlaybackRenewal, streamCustomerHost, STREAM_TOKEN_PATTERN,
} from '@/lib/v2/stream-playback';
import { redactPlaybackUrl } from '@/lib/video-measurements';

// Synthetic values only: the token is base64url of fake JSON, never a signed one.
const CODE = '7v4my51gigdqb5jn';
const TOKEN = 'eyJmYWtlIjoiaGVhZGVyIn0.eyJmYWtlIjoicGF5bG9hZCJ9.ZmFrZS1zaWduYXR1cmU';
const UID = '0123456789abcdef0123456789abcdef';
const HOST = `https://customer-${CODE}.cloudflarestream.com`;
const MASTER = `${HOST}/${TOKEN}/manifest/video.m3u8`;
const FIXTURES = path.resolve(__dirname, '../../../../workers/livepeer-bridge/src/fixtures/stream');

function fixture(name: string, height = '720'): string {
    return readFileSync(path.join(FIXTURES, name), 'utf8')
        .replaceAll('<UID>', UID).replaceAll('<HEIGHT>', height).replaceAll('<P>', 'eyJ2IjoxfQ%3D%3D').replaceAll('<S>', 'c2lnbmF0dXJl');
}

/** Every URI an HLS playlist references (lines and EXT-X-MAP / EXT-X-MEDIA URI attributes), resolved. */
function references(playlist: string, base: string): string[] {
    const uris = playlist.split('\n').flatMap((line) => {
        if (line.startsWith('#')) return [...line.matchAll(/URI="([^"]+)"/g)].map((match) => match[1]);
        return line.trim() ? [line.trim()] : [];
    });
    return uris.map((uri) => new URL(uri, base).toString());
}

describe('Stream delivery URLs', () => {
    it('expects exactly the host, token path and manifest the Bridge builds', () => {
        expect(streamCustomerHost(CODE)).toBe(`customer-${CODE}.cloudflarestream.com`);
        expect(expectedStreamHlsUrl(CODE, TOKEN)).toBe(MASTER);
        expect(STREAM_TOKEN_PATTERN.test(TOKEN)).toBe(true);
        for (const bad of ['', 'abc', `${TOKEN}/x`, `${TOKEN}?a=1`, 'a.b.c', `eyJ.${'a'.repeat(4)}`]) {
            expect(STREAM_TOKEN_PATTERN.test(bad), bad).toBe(false);
        }
    });

    it('allows every playlist and segment of the recorded manifests and sends no token header', () => {
        const config = createStreamHlsConfig(CODE);
        expect(Object.keys(config).sort()).toEqual(['capLevelToPlayerSize', 'xhrSetup']);
        expect(config.capLevelToPlayerSize).toBe(true);
        const xhr = { setRequestHeader: vi.fn() } as unknown as XMLHttpRequest;
        const urls = [MASTER];
        for (const master of ['master-dashboard.m3u8', 'master.m3u8']) {
            for (const variant of references(fixture(master), MASTER)) {
                urls.push(variant);
                for (const name of ['variant-dashboard.m3u8', 'variant.m3u8']) urls.push(...references(fixture(name), variant));
                urls.push(...references(fixture('audio.m3u8'), variant));
            }
        }
        expect(urls.some((url) => url.endsWith('/manifest/stream_t5_r1963391697.m3u8'))).toBe(true);
        expect(urls.some((url) => url.includes(`/${UID}/video/720/init.mp4?p=`))).toBe(true);
        expect(urls.some((url) => url.includes(`/${UID}/video/audio/seg_1.mp4?p=`))).toBe(true);
        for (const url of urls) {
            expect(isStreamMediaUrl(url, CODE), url).toBe(true);
            config.xhrSetup(xhr, url);
        }
        expect(xhr.setRequestHeader).not.toHaveBeenCalled();
    });

    it.each([
        ['another host', `https://customer-otherotherother1.cloudflarestream.com/${TOKEN}/manifest/video.m3u8`],
        ['a lookalike host', `https://customer-${CODE}.cloudflarestream.com.example.test/${TOKEN}/manifest/video.m3u8`],
        ['the upload host', `https://upload.cloudflarestream.com/${TOKEN}/manifest/video.m3u8`],
        ['plain http', `http://customer-${CODE}.cloudflarestream.com/${TOKEN}/manifest/video.m3u8`],
        ['a port', `${HOST}:8443/${TOKEN}/manifest/video.m3u8`],
        ['credentials', `https://user:pass@customer-${CODE}.cloudflarestream.com/${TOKEN}/manifest/video.m3u8`],
        ['a playlist query', `${MASTER}?jwt=${TOKEN}`],
        ['an empty playlist query', `${MASTER}?`],
        ['a fragment', `${MASTER}#t=1`],
        ['a playlist off the token path', `${HOST}/${UID}/manifest/video.m3u8`],
        ['a segment with an extra key', `${HOST}/${UID}/video/720/seg_1.mp4?p=a&s=b&jwt=c`],
        ['a segment without s', `${HOST}/${UID}/video/720/seg_1.mp4?p=a`],
        ['a segment with a repeated key', `${HOST}/${UID}/video/720/seg_1.mp4?p=a&p=b`],
        ['a segment with an empty s', `${HOST}/${UID}/video/720/seg_1.mp4?p=a&s=`],
        ['a segment without query', `${HOST}/${UID}/video/720/seg_1.mp4`],
        ['a transport-stream segment', `${HOST}/${UID}/video/720/seg_1.ts?p=a&s=b`],
        ['a segment off the UID path', `${HOST}/${TOKEN}/video/720/seg_1.mp4?p=a&s=b`],
        ['a downloads path', `${HOST}/${UID}/downloads/default.mp4?p=a&s=b`],
        ['not a URL', 'video.m3u8'],
    ])('refuses %s before the request is sent', (_name, url) => {
        expect(isStreamMediaUrl(url, CODE)).toBe(false);
        const xhr = { setRequestHeader: vi.fn() } as unknown as XMLHttpRequest;
        expect(() => createStreamHlsConfig(CODE).xhrSetup(xhr, url)).toThrow('stream_playback_url_invalid');
    });
});

class FakeHls {
    readonly sources: string[] = [];
    /** `config.startPosition` at the moment of each `loadSource`. */
    readonly startPositions: number[] = [];
    readonly config = { startPosition: -1 };
    private readonly handlers = new Map<string, Array<() => void>>();
    loadSource(url: string) { this.sources.push(url); this.startPositions.push(this.config.startPosition); }
    once(event: string, handler: () => void) { this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]); }
    emit(event: string) {
        const handlers = this.handlers.get(event) ?? [];
        this.handlers.delete(event);
        for (const handler of handlers) handler();
    }
}

describe('Stream renewal', () => {
    const RENEWED = `${HOST}/eyJmYWtlIjoibmV3In0.eyJmYWtlIjoicmVuZXdlZCJ9.bmV3LXNpZ25hdHVyZQ/manifest/video.m3u8`;

    it('loads the renewed URL and seeks back to the saved position, resuming a playing video', async () => {
        const hls = new FakeHls();
        const video = { currentTime: 1_234.5, paused: false, play: vi.fn(async () => undefined), pause: vi.fn() };
        reloadStreamSource(hls, video, RENEWED, 'hlsManifestParsed');
        expect(hls.sources).toEqual([RENEWED]);
        // The first fetch of the new manifest already starts at the saved position.
        expect(hls.startPositions).toEqual([1_234.5]);
        // The new manifest restarts at its own position until it is parsed.
        video.currentTime = 0;
        expect(video.play).not.toHaveBeenCalled();
        hls.emit('hlsManifestParsed');
        expect(video.currentTime).toBe(1_234.5);
        expect(video.play).toHaveBeenCalledOnce();
        expect(video.pause).not.toHaveBeenCalled();
        // Only the first parse after the swap restores the position.
        video.currentTime = 50;
        hls.emit('hlsManifestParsed');
        expect(video.currentTime).toBe(50);
    });

    it('keeps a paused video paused', () => {
        const hls = new FakeHls();
        const video = { currentTime: 42, paused: true, play: vi.fn(async () => undefined), pause: vi.fn() };
        reloadStreamSource(hls, video, RENEWED, 'hlsManifestParsed');
        expect(hls.startPositions).toEqual([42]);
        video.currentTime = 0;
        hls.emit('hlsManifestParsed');
        expect(video.currentTime).toBe(42);
        expect(video.play).not.toHaveBeenCalled();
        expect(video.pause).toHaveBeenCalledOnce();
    });

    it('renews once at once on a 401 or 403, then backs off, then stops', () => {
        expect(isStreamAuthFailure({ response: { code: 401 } })).toBe(true);
        expect(isStreamAuthFailure({ response: { code: 403 } })).toBe(true);
        for (const data of [{ response: { code: 404 } }, { response: { code: 500 } }, { response: {} }, {}, undefined]) {
            expect(isStreamAuthFailure(data)).toBe(false);
        }
        expect(streamAuthRetryDelay(0)).toBe(0);
        const later = [1, 2, 3].map((failures) => streamAuthRetryDelay(failures)!);
        expect(later.every((delay, index) => delay > (index === 0 ? 0 : later[index - 1]))).toBe(true);
        expect(streamAuthRetryDelay(4)).toBeNull();
    });

    it('gives native HLS the Stream URL as it is and keeps the Studio jwt query', () => {
        expect(nativePlaybackSource({ playbackId: UID, token: TOKEN, hlsUrl: MASTER, expiresAtMs: 1, provider: 'cloudflare-stream' }))
            .toBe(MASTER);
        expect(new URL(nativePlaybackSource({ playbackId: UID, token: TOKEN, hlsUrl: MASTER, expiresAtMs: 1, provider: 'cloudflare-stream' })).search)
            .toBe('');
        expect(nativePlaybackSource({ playbackId: 'pb', token: 'a.b+c', hlsUrl: 'https://livepeercdn.studio/hls/pb/index.m3u8', expiresAtMs: 1 }))
            .toBe('https://livepeercdn.studio/hls/pb/index.m3u8?jwt=a.b%2Bc');
    });

    it('never logs a playback URL with its token', () => {
        expect(redactPlaybackUrl(MASTER)).toBe(`${HOST}/<redacted>/manifest/video.m3u8`);
        expect(redactPlaybackUrl(`${MASTER} then ${RENEWED}`)).not.toMatch(/eyJ/);
        expect(redactPlaybackUrl('v2-market-261007.youtick-dev-v3.testnet')).toBe('v2-market-261007.youtick-dev-v3.testnet');
    });
});

// The TicketPlayer's renewal chain, driven with fake timers: the player wires the hls.js ERROR
// (401/403) and FRAG_LOADED events to authFailure/fragmentLoaded, its cleanup to stop(), and
// apply to reloadStreamSource, as here.
describe('playback renewal chain', () => {
    type Access = { expiresAtMs: number; hlsUrl: string };
    const TTL_MS = 180_000;

    function harness() {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        const hls = new FakeHls();
        const video = { currentTime: 30, paused: false, play: vi.fn(async () => undefined), pause: vi.fn() };
        const pending: Array<{ resolve: (value: Access) => void; reject: (error: Error) => void }> = [];
        let issued = 0;
        const request = vi.fn(() => new Promise<Access>((resolve, reject) => { pending.push({ resolve, reject }); }));
        const answer = () => {
            issued += 1;
            pending.shift()!.resolve({ expiresAtMs: Date.now() + TTL_MS, hlsUrl: `${HOST}/token-${issued}/manifest/video.m3u8` });
        };
        const onFailed = vi.fn();
        const renewal = startPlaybackRenewal<Access>({
            initial: { expiresAtMs: Date.now() + TTL_MS, hlsUrl: MASTER },
            request,
            apply: (next) => reloadStreamSource(hls, video, next.hlsUrl, 'hlsManifestParsed'),
            onFailed,
            refreshBeforeExpiryMs: 60_000,
        });
        return { hls, request, answer, pending, onFailed, renewal };
    }

    afterEach(() => vi.useRealTimers());

    it('renews 60 s before expiry and then on each new expiry', async () => {
        const h = harness();
        await vi.advanceTimersByTimeAsync(119_999);
        expect(h.request).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(h.request).toHaveBeenCalledOnce();
        h.answer();
        await vi.advanceTimersByTimeAsync(0);
        expect(h.hls.sources).toEqual([`${HOST}/token-1/manifest/video.m3u8`]);
        await vi.advanceTimersByTimeAsync(120_000);
        expect(h.request).toHaveBeenCalledTimes(2);
    });

    it('ignores a 401 while a scheduled renewal is in flight: exactly one loadSource', async () => {
        const h = harness();
        await vi.advanceTimersByTimeAsync(120_000);
        expect(h.request).toHaveBeenCalledOnce();
        h.renewal.authFailure();
        h.renewal.authFailure();
        await vi.advanceTimersByTimeAsync(0);
        expect(h.request).toHaveBeenCalledOnce();
        h.answer();
        await vi.advanceTimersByTimeAsync(0);
        expect(h.hls.sources).toHaveLength(1);
        // One chain remains: the next renewal comes once, at the new expiry.
        await vi.advanceTimersByTimeAsync(119_999);
        expect(h.request).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1);
        expect(h.request).toHaveBeenCalledTimes(2);
    });

    it('does nothing after stop, even when a renewal was in flight', async () => {
        const h = harness();
        await vi.advanceTimersByTimeAsync(120_000);
        h.renewal.stop();
        h.answer();
        await vi.advanceTimersByTimeAsync(10 * TTL_MS);
        expect(h.hls.sources).toEqual([]);
        expect(h.request).toHaveBeenCalledOnce();
        h.renewal.authFailure();
        await vi.advanceTimersByTimeAsync(TTL_MS);
        expect(h.request).toHaveBeenCalledOnce();

        // A request that fails after stop reports nothing.
        const failing = harness();
        await vi.advanceTimersByTimeAsync(120_000);
        failing.renewal.stop();
        failing.pending.shift()!.reject(new Error('playback_unavailable'));
        await vi.advanceTimersByTimeAsync(0);
        expect(failing.onFailed).not.toHaveBeenCalled();
    });

    it('retries 401/403 at 0, 5, 15 and 30 s, then fails; a loaded fragment resets the count', async () => {
        const h = harness();
        const renewAfter = async (delay: number) => {
            h.renewal.authFailure();
            // Repeated failures while the retry waits do not add requests or move the timer.
            h.renewal.authFailure();
            if (delay > 0) {
                await vi.advanceTimersByTimeAsync(delay - 1);
                expect(h.request).toHaveBeenCalledTimes(calls);
            }
            await vi.advanceTimersByTimeAsync(delay > 0 ? 1 : 0);
            calls += 1;
            expect(h.request).toHaveBeenCalledTimes(calls);
            h.answer();
            await vi.advanceTimersByTimeAsync(0);
        };
        let calls = 0;
        for (const delay of [0, 5_000, 15_000, 30_000]) await renewAfter(delay);
        expect(h.hls.sources).toHaveLength(4);
        h.renewal.authFailure();
        expect(h.onFailed).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(10 * TTL_MS);
        expect(h.request).toHaveBeenCalledTimes(4);

        const reset = harness();
        reset.renewal.authFailure();
        await vi.advanceTimersByTimeAsync(0);
        reset.answer();
        await vi.advanceTimersByTimeAsync(0);
        reset.renewal.fragmentLoaded();
        reset.renewal.authFailure();
        await vi.advanceTimersByTimeAsync(0);
        expect(reset.request).toHaveBeenCalledTimes(2);
    });

    it('reports a failed renewal once and stops', async () => {
        const h = harness();
        await vi.advanceTimersByTimeAsync(120_000);
        h.pending.shift()!.reject(new Error('playback_denied'));
        await vi.advanceTimersByTimeAsync(0);
        expect(h.onFailed).toHaveBeenCalledOnce();
        h.renewal.authFailure();
        await vi.advanceTimersByTimeAsync(10 * TTL_MS);
        expect(h.request).toHaveBeenCalledOnce();
        expect(h.onFailed).toHaveBeenCalledOnce();
    });
});
