import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { nativePlaybackSource } from '@/lib/v2/playback';
import {
    createStreamHlsConfig, expectedStreamHlsUrl, isStreamAuthFailure, isStreamMediaUrl, reloadStreamSource, streamAuthRetryDelay,
    streamCustomerHost, STREAM_TOKEN_PATTERN,
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
    private readonly handlers = new Map<string, Array<() => void>>();
    loadSource(url: string) { this.sources.push(url); }
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
        const video = { currentTime: 1_234.5, paused: false, play: vi.fn(async () => undefined) };
        reloadStreamSource(hls, video, RENEWED, 'hlsManifestParsed');
        expect(hls.sources).toEqual([RENEWED]);
        // The new manifest restarts at its own position until it is parsed.
        video.currentTime = 0;
        expect(video.play).not.toHaveBeenCalled();
        hls.emit('hlsManifestParsed');
        expect(video.currentTime).toBe(1_234.5);
        expect(video.play).toHaveBeenCalledOnce();
        // Only the first parse after the swap restores the position.
        video.currentTime = 50;
        hls.emit('hlsManifestParsed');
        expect(video.currentTime).toBe(50);
    });

    it('keeps a paused video paused', () => {
        const hls = new FakeHls();
        const video = { currentTime: 42, paused: true, play: vi.fn(async () => undefined) };
        reloadStreamSource(hls, video, RENEWED, 'hlsManifestParsed');
        video.currentTime = 0;
        hls.emit('hlsManifestParsed');
        expect(video.currentTime).toBe(42);
        expect(video.play).not.toHaveBeenCalled();
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
