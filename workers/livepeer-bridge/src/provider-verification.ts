import { mediaProfiles } from './media-provider';
import { dependencyFetch } from './dependency-fetch';
import type { MediaProvider, VerifiedAsset, VerifyReadyAssetInput } from './media-provider';

export const MAX_PROVIDER_PLAYBACK_OUTPUTS = 16;
const MAX_THUMBNAIL_REFERENCE_PROBES = 32;

type VerificationDependencies = {
    sha256(value: string): Promise<string>;
    signPlaybackToken?: (playbackId: string) => Promise<string>;
};

export async function verifyLivepeerReadyAsset(
    provider: Pick<MediaProvider, 'readAsset' | 'readPlayback'>,
    input: VerifyReadyAssetInput,
    dependencies: VerificationDependencies,
): Promise<VerifiedAsset> {
    const expectedProfiles = mediaProfiles(input.profileConfigSha256);
    const asset = await provider.readAsset(input.assetId);
    const playback = await provider.readPlayback(input.playbackId);
    if (asset.id !== input.assetId
        || asset.playbackId !== input.playbackId
        || asset.projectId !== input.projectId
        || asset.projectId !== input.expectedProjectId
        || asset.createdByTokenName !== input.apiTokenName
        || asset.creatorBindingType !== 'unverified'
        || asset.creatorBindingValue !== `${input.jobId}:${input.generation}`
        || asset.name !== `youtick-${input.jobId}-g${input.generation}`) {
        throw new Error('provider_identity_mismatch');
    }
    if (asset.policy !== 'jwt'
        || asset.phase !== 'ready'
        || !Number.isSafeInteger(asset.updatedAtMs)
        || asset.updatedAtMs <= 0
        || !Number.isSafeInteger(asset.sizeBytes)
        || BigInt(asset.sizeBytes) !== BigInt(input.expectedSourceBytes)) {
        throw new Error('provider_state_invalid');
    }

    if (playback.kind !== 'vod' || playback.policy !== 'jwt') {
        throw new Error('provider_playback_mismatch');
    }
    if (playback.sources.length > MAX_PROVIDER_PLAYBACK_OUTPUTS) {
        throw new Error('provider_playback_mismatch');
    }
    const hlsSources = playback.sources.filter((source) => source.kind === 'hls');
    const mp4Sources = playback.sources.filter((source) => source.kind === 'mp4');
    const vttSources = playback.sources.filter((source) => source.kind === 'vtt');
    const hlsUrls = [...new Set(hlsSources.map((source) => source.url))];
    const mp4Urls = [...new Set(mp4Sources.map((source) => source.url))];
    const vttUrls = [...new Set(vttSources.map((source) => source.url))];
    if (hlsUrls.length === 0
        || playback.sources.some((source) => source.kind === 'unknown')
        || (mp4Sources.length > 0 && !mp4Sources.some((source) => (
            source.width === 1280
            && source.height === 720
            && typeof source.bitrate === 'number'
            && source.bitrate > 0
        )))
        || hlsUrls.some((url) => !validPlaybackUrl(url))
        || mp4Urls.some((url) => !validPlaybackUrl(url))
        || vttUrls.some((url) => !validPlaybackUrl(url))
        || !validPlaybackUrl(asset.downloadUrl)) {
        throw new Error('provider_playback_mismatch');
    }
    for (const hlsUrl of new Set([livepeerHlsUrl(input.playbackId), ...hlsUrls])) {
        await requireHlsPlaybackDenied(hlsUrl);
    }
    if (expectedProfiles.length > 1) {
        if (!dependencies.signPlaybackToken) throw new Error('runtime_not_configured');
        const token = await dependencies.signPlaybackToken(input.playbackId);
        for (const hlsUrl of new Set([livepeerHlsUrl(input.playbackId), ...hlsUrls])) {
            await verifyAdaptiveHls(hlsUrl, token, expectedProfiles);
        }
    }
    for (const mp4Url of mp4Urls) {
        await requireAnonymousPlaybackDenied(mp4Url);
    }
    for (const vttUrl of vttUrls) {
        await requireAnonymousPlaybackDenied(vttUrl);
    }
    if (vttUrls.length > 0) {
        if (!dependencies.signPlaybackToken) throw new Error('runtime_not_configured');
        const token = await dependencies.signPlaybackToken(input.playbackId);
        for (const thumbnailUrl of await vttThumbnailUrls(vttUrls, token)) {
            await requireAnonymousPlaybackDenied(thumbnailUrl);
        }
    }
    await requireAnonymousPlaybackDenied(asset.downloadUrl);

    return {
        assetIdHash: await dependencies.sha256(input.assetId),
        playbackId: input.playbackId,
        projectIdHash: await dependencies.sha256(input.projectId),
        verifiedSourceBytes: input.expectedSourceBytes,
        sourceFingerprint: asset.sha256,
        readyAtMs: String(asset.updatedAtMs),
    };
}

export async function firstVttThumbnailUrl(vttUrls: string[], token: string): Promise<string | null> {
    for (const vttUrl of vttUrls) {
        const [reference] = await fetchVttReferences(vttUrl, token);
        if (reference) return vttReferenceUrl(vttUrl, reference);
    }
    return null;
}

export function validPlaybackUrl(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && !url.port
            && !url.username
            && !url.password
            && url.pathname.length > 1
            && (url.hostname === 'playback.livepeer.studio'
                || url.hostname === 'livepeercdn.com'
                || url.hostname === 'livepeercdn.studio'
                || url.hostname === 'asset-cdn.lp-playback.com'
                || url.hostname.endsWith('.lp-playback.studio'));
    } catch {
        return false;
    }
}

function livepeerHlsUrl(playbackId: string): string {
    return `https://playback.livepeer.studio/asset/hls/${playbackId}/index.m3u8`;
}

function hlsManifestKind(body: string): 'error' | 'playable' | 'unknown' {
    const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines[0] !== '#EXTM3U') return 'unknown';
    const playable = lines.some((line) => /(?:^|,)URI="[^"]+"/.test(line))
        || lines.some((line, index) => (
            (line.startsWith('#EXT-X-STREAM-INF:') || line.startsWith('#EXTINF:'))
            && index + 1 < lines.length
            && !lines[index + 1].startsWith('#')
        ));
    const error = lines.some((line) => line === '#EXT-X-ERROR' || line.startsWith('#EXT-X-ERROR:'));
    if (error && !playable) return 'error';
    return playable ? 'playable' : 'unknown';
}

async function hlsPlaybackDenied(response: Response): Promise<boolean> {
    if ([401, 403].includes(response.status)) return true;
    if (response.status !== 200) return false;
    try {
        return hlsManifestKind(await response.text()) === 'error';
    } catch {
        return false;
    }
}

async function requireHlsPlaybackDenied(url: string): Promise<void> {
    const invalidTokens = [
        null,
        'invalid.invalid.invalid',
        'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ3cm9uZyJ9.invalid',
        'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjF9.invalid',
    ];
    for (const token of invalidTokens) {
        const headers = new Headers();
        if (token) headers.set('Livepeer-Jwt', token);
        let response: Response;
        try {
            response = await dependencyFetch('livepeer_media', 'hls_anonymous_probe', url, {
                method: 'GET',
                headers,
                redirect: 'manual',
                signal: AbortSignal.timeout(5_000),
            });
        } catch {
            throw new Error('provider_unavailable');
        }
        if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
        if (!await hlsPlaybackDenied(response)) throw new Error('provider_playback_exposed');
    }
}

async function requireAnonymousPlaybackDenied(url: string): Promise<void> {
    let response: Response;
    try {
        response = await dependencyFetch('livepeer_media', 'asset_anonymous_probe', url, {
            method: 'GET',
            headers: { Range: 'bytes=0-0' },
            redirect: 'manual',
            signal: AbortSignal.timeout(5_000),
        });
    } catch {
        throw new Error('provider_unavailable');
    }
    await response.body?.cancel();
    if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
    if (![401, 403].includes(response.status)) throw new Error('provider_playback_exposed');
}

function vttReferences(body: string): string[] | null {
    const lines = body.split(/\r?\n/).map((line) => line.trim());
    if (lines[0] !== 'WEBVTT') return null;
    const references: string[] = [];
    for (let index = 1; index < lines.length; index += 1) {
        if (!/^(?:(?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+(?:(?:\d{2}:)?\d{2}:\d{2}\.\d{3})(?:\s+.*)?$/.test(lines[index])) {
            continue;
        }
        const cue: string[] = [];
        while (index + 1 < lines.length && lines[index + 1]) {
            index += 1;
            cue.push(lines[index]);
        }
        if (cue.length !== 1) return null;
        references.push(cue[0]);
    }
    return references;
}

function vttReferenceUrl(parentUrl: string, reference: string): string {
    try {
        const url = new URL(reference, parentUrl);
        if (!validPlaybackUrl(url.toString())) throw new Error('invalid');
        return url.toString();
    } catch {
        throw new Error('provider_playback_mismatch');
    }
}

async function vttThumbnailUrls(vttUrls: string[], token: string): Promise<string[]> {
    const thumbnails = new Set<string>();
    for (const vttUrl of vttUrls) {
        for (const reference of await fetchVttReferences(vttUrl, token)) {
            thumbnails.add(vttReferenceUrl(vttUrl, reference));
            if (thumbnails.size > MAX_THUMBNAIL_REFERENCE_PROBES) {
                throw new Error('provider_playback_mismatch');
            }
        }
    }
    return [...thumbnails];
}

async function fetchVttReferences(vttUrl: string, token: string): Promise<string[]> {
    let response: Response;
    try {
        response = await dependencyFetch('livepeer_media', 'vtt_read', vttUrl, {
            method: 'GET',
            headers: { 'Livepeer-Jwt': token },
            redirect: 'manual',
            signal: AbortSignal.timeout(5_000),
        });
    } catch {
        throw new Error('provider_unavailable');
    }
    if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
    if (response.status !== 200) throw new Error('provider_playback_mismatch');
    try {
        const references = vttReferences(await response.text());
        if (references) return references;
    } catch {
        // Fall through to the stable provider mismatch below.
    }
    throw new Error('provider_playback_mismatch');
}

// Probe both renditions and bounded media samples; this is not a whole-video playback test.
export async function verifyAdaptiveHls(
    masterUrl: string, token: string, profiles: { width: number; height: number }[],
): Promise<void> {
    const master = await authorizedHls(masterUrl, token);
    // This profile has two muxed variants; unverified alternate audio/I-frame playlists stay closed.
    if (master.some((line) => /(?:^|[:,])URI=/.test(line))) throw new Error('provider_playback_mismatch');
    const variants = master.flatMap((line, index) => {
        if (!line.startsWith('#EXT-X-STREAM-INF:')) return [];
        const resolution = /(?:^|,)RESOLUTION=(\d+)x(\d+)(?:,|$)/.exec(line.slice(18));
        if (!resolution || !master[index + 1] || master[index + 1].startsWith('#')) {
            throw new Error('provider_playback_mismatch');
        }
        return [{ width: Number(resolution[1]), height: Number(resolution[2]), url: hlsReference(masterUrl, master[index + 1]) }];
    });
    if (variants.length !== profiles.length || new Set(variants.map((variant) => variant.url)).size !== profiles.length
        || profiles.some((profile) => !variants.some((variant) => variant.width === profile.width && variant.height === profile.height))) {
        throw new Error('provider_playback_mismatch');
    }
    for (const variant of variants) {
        await requireHlsPlaybackDenied(variant.url);
        const media = await authorizedHls(variant.url, token);
        if (media.some((line) => line.startsWith('#EXT-X-STREAM-INF:')) || !media.includes('#EXT-X-ENDLIST')) {
            throw new Error('provider_playback_mismatch');
        }
        const segments = media.filter((line) => !line.startsWith('#'));
        if (!segments.length) throw new Error('provider_playback_mismatch');
        // ponytail: first/last segments plus keys/maps; full 120-minute delivery belongs to the approved browser canary.
        const references = new Set([segments[0], segments[segments.length - 1],
            ...media.flatMap((line) => [...line.matchAll(/(?:^|[:,])URI="([^"]+)"/g)].map((match) => match[1])),
        ]);
        if (references.size > 16) throw new Error('provider_playback_mismatch');
        for (const reference of references) await requireAnonymousPlaybackDenied(hlsReference(variant.url, reference));
    }
}

function hlsReference(parent: string, reference: string): string {
    const url = vttReferenceUrl(parent, reference);
    if (new URL(url).search || new URL(url).hash) throw new Error('provider_playback_mismatch');
    return url;
}

async function authorizedHls(url: string, token: string): Promise<string[]> {
    if (!validPlaybackUrl(url)) throw new Error('provider_playback_mismatch');
    let response: Response;
    try {
        response = await dependencyFetch('livepeer_media', 'hls_authorized_probe', url, {
            headers: { 'Livepeer-Jwt': token }, redirect: 'manual', signal: AbortSignal.timeout(5_000),
        });
    } catch { throw new Error('provider_unavailable'); }
    if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
    if (response.status !== 200 || !response.body) throw new Error('provider_playback_mismatch');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let body = '';
    let bytes = 0;
    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 512 * 1024) throw new Error('provider_playback_mismatch');
            body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
    } finally { await reader.cancel(); }
    if (hlsManifestKind(body) !== 'playable') throw new Error('provider_playback_mismatch');
    return body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}
