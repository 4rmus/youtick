// V2 playback from the Stream media profile (Studio to Stream migration, M3-G2). The Bridge's
// `/v3/playback-tokens` answer carries `provider: 'cloudflare-stream'` and an HLS URL with the
// signed token in its PATH (`https://customer-<code>.cloudflarestream.com/<token>/manifest/video.m3u8`),
// so no request header carries the token. The master and variant playlists are relative and carry
// no query; init and media segments are `../../<uid>/video/<rendition>/<name>.mp4?p=…&s=…` with a
// provider-signed `p`/`s` query (manifest shape: PROVIDER, 2026-10-22). Renewal swaps the source.

/** Exact delivery host of a customer code; the Bridge builds its URLs the same way. */
export function streamCustomerHost(customerCode: string): string {
    return `customer-${customerCode}.cloudflarestream.com`;
}

/** An RS256 JWT as the Bridge signs it: three base64url parts, the header starting `{"`. */
export const STREAM_TOKEN_PATTERN = /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const PLAYLIST_PATH = /^\/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/manifest\/[A-Za-z0-9_-]+\.m3u8$/;
const MEDIA_PATH = /^\/[0-9a-f]{32}\/video\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.mp4$/;

/** The HLS URL the Bridge must answer for this token: exact string, so no query, fragment or port. */
export function expectedStreamHlsUrl(customerCode: string, token: string): string {
    return `https://${streamCustomerHost(customerCode)}/${token}/manifest/video.m3u8`;
}

/**
 * Whether hls.js may request `value`: the customer host only; playlists under a token path with no
 * query; init and media segments under a video UID with exactly the `p` and `s` query keys.
 */
export function isStreamMediaUrl(value: string, customerCode: string): boolean {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || value.includes('#')
        || url.hostname !== streamCustomerHost(customerCode)) {
        return false;
    }
    if (PLAYLIST_PATH.test(url.pathname)) return !value.includes('?');
    if (!MEDIA_PATH.test(url.pathname)) return false;
    // `p` is provider-encoded (base64 JSON) and `s` its signature; only their presence is checked.
    const keys = [...url.searchParams.keys()];
    return keys.length === 2 && keys.includes('p') && keys.includes('s')
        && Boolean(url.searchParams.get('p')) && Boolean(url.searchParams.get('s'));
}

/**
 * hls.js settings for a Stream ticket: no token header (the token is in the URL path) and no
 * observed-timeline loaders; every request outside the allowlist is refused before it is sent.
 */
export function createStreamHlsConfig(customerCode: string) {
    return {
        capLevelToPlayerSize: true,
        xhrSetup(_xhr: XMLHttpRequest, url: string) {
            if (!isStreamMediaUrl(url, customerCode)) throw new Error('stream_playback_url_invalid');
        },
    };
}

/** The parts of hls.js and the video element a source swap uses. */
export interface StreamHlsLike {
    loadSource(url: string): void;
    once(event: string, handler: () => void): void;
}

export interface StreamVideoLike {
    currentTime: number;
    paused: boolean;
    play(): Promise<void>;
}

/**
 * Loads a renewed path-token URL and puts the viewer back where they were: the position and the
 * play state are saved first and restored once the new manifest is parsed.
 */
export function reloadStreamSource(
    hls: StreamHlsLike,
    video: StreamVideoLike,
    hlsUrl: string,
    manifestParsedEvent: string,
): void {
    const position = video.currentTime;
    const playing = !video.paused;
    hls.once(manifestParsedEvent, () => {
        video.currentTime = position;
        if (playing) void video.play().catch(() => undefined);
    });
    hls.loadSource(hlsUrl);
}

/** An expired or refused token on a playlist or segment load (HTTP 401 or 403). */
export function isStreamAuthFailure(data: { response?: { code?: number } } | undefined): boolean {
    const code = data?.response?.code;
    return code === 401 || code === 403;
}

/**
 * Wait before the n-th consecutive renewal after an auth failure: the first renewal is immediate,
 * later ones back off; `null` ends playback with an error. A fragment that loads resets the count.
 */
export const STREAM_AUTH_RETRY_DELAYS_MS: readonly number[] = [0, 5_000, 15_000, 30_000];

export function streamAuthRetryDelay(consecutiveFailures: number): number | null {
    return STREAM_AUTH_RETRY_DELAYS_MS[consecutiveFailures] ?? null;
}
