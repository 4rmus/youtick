import { mediaProfiles } from './media-provider';
import { dependencyFetch } from './dependency-fetch';
import type { MediaProvider, ProviderAsset, VerifiedAsset, VerifyReadyAssetInput } from './media-provider';

export const MAX_PROVIDER_PLAYBACK_OUTPUTS = 16;
const MAX_THUMBNAIL_REFERENCE_PROBES = 32;
const MAX_HLS_MANIFESTS = 16;
const MAX_HLS_MEDIA_REFERENCES = 64;
const DIMENSION_TOLERANCE = 2;

type Dimensions = { width: number; height: number };
type HlsVariant = Dimensions & { url: string };
type HlsVerification = { variants: HlsVariant[]; required: HlsVariant[] };
type HlsContext = {
    manifests: Map<string, string[]>;
    mediaReferences: Set<string>;
    reference?: Dimensions;
};

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
        || hlsUrls.some((url) => !validPlaybackUrl(url))
        || mp4Urls.some((url) => !validPlaybackUrl(url))
        || vttUrls.some((url) => !validPlaybackUrl(url))
        || !validPlaybackUrl(asset.downloadUrl)) {
        throw new Error('provider_playback_mismatch');
    }
    if (!dependencies.signPlaybackToken) throw new Error('runtime_not_configured');
    const token = await dependencies.signPlaybackToken(input.playbackId);
    const context: HlsContext = { manifests: new Map(), mediaReferences: new Set() };
    const verifiedHls: HlsVerification[] = [];
    for (const hlsUrl of new Set([livepeerHlsUrl(input.playbackId), ...hlsUrls])) {
        verifiedHls.push(await verifyAdaptiveHls(hlsUrl, token, expectedProfiles, asset.sourceVideo, context));
    }
    const variants = verifiedHls.flatMap((hls) => hls.variants);
    if (mp4Sources.some((source) => !validDimensions(source)
        || typeof source.bitrate !== 'number' || !Number.isFinite(source.bitrate) || source.bitrate <= 0
        || !variants.some((variant) => sameDimensions(variant, source))
            && !(validDimensions(asset.sourceVideo) && sameDimensions(asset.sourceVideo, source)))
        || mp4Sources.length > 0 && !mp4Sources.some((source) => validDimensions(source)
            && verifiedHls.some((hls) => sameDimensions(hls.required[hls.required.length - 1], source)))) {
        throw new Error('provider_playback_mismatch');
    }
    for (const mp4Url of mp4Urls) {
        await requireAnonymousPlaybackDenied(mp4Url, context.mediaReferences);
    }
    for (const vttUrl of vttUrls) {
        await requireAnonymousPlaybackDenied(vttUrl, context.mediaReferences);
    }
    if (vttUrls.length > 0) {
        for (const thumbnailUrl of await vttThumbnailUrls(vttUrls, token)) {
            await requireAnonymousPlaybackDenied(thumbnailUrl, context.mediaReferences);
        }
    }
    await requireAnonymousPlaybackDenied(asset.downloadUrl, context.mediaReferences);

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
        throw new Error('provider_unavailable');
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

async function requireAnonymousPlaybackDenied(url: string, verified?: Set<string>): Promise<void> {
    if (verified?.has(url)) return;
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
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
    if (![401, 403].includes(response.status)) throw new Error('provider_playback_exposed');
    verified?.add(url);
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
    const body = await response.text().catch(() => { throw new Error('provider_unavailable'); });
    const references = vttReferences(body);
    if (references) return references;
    throw new Error('provider_playback_mismatch');
}

function validDimensions(value: { width: unknown; height: unknown } | null | undefined): value is Dimensions {
    return Boolean(value && Number.isSafeInteger(value.width) && Number(value.width) > 0
        && Number.isSafeInteger(value.height) && Number(value.height) > 0);
}

function sameDimensions(left: Dimensions, right: Dimensions): boolean {
    return Math.abs(left.width - right.width) <= DIMENSION_TOLERANCE
        && Math.abs(left.height - right.height) <= DIMENSION_TOLERANCE;
}

function sameAspect(reference: Dimensions, output: Dimensions): boolean {
    const orientation = (value: Dimensions) => Math.abs(value.width - value.height) <= DIMENSION_TOLERANCE
        ? 0 : Math.sign(value.width - value.height);
    if (orientation(reference) * orientation(output) < 0) return false;
    const scale = Math.min(output.width / reference.width, output.height / reference.height);
    return Math.abs(output.width - reference.width * scale) <= DIMENSION_TOLERANCE
        && Math.abs(output.height - reference.height * scale) <= DIMENSION_TOLERANCE;
}

function distinctRenditions(candidates: HlsVariant[][], selected: HlsVariant[] = []): HlsVariant[] | null {
    if (!candidates.length) return selected;
    for (const candidate of candidates[0]) {
        if (selected.some((previous) => previous.url === candidate.url
            || previous.width === candidate.width && previous.height === candidate.height)) continue;
        const match = distinctRenditions(candidates.slice(1), [...selected, candidate]);
        if (match) return match;
    }
    return null;
}

function requiredRenditions(
    variants: HlsVariant[], profiles: Dimensions[], source: ProviderAsset['sourceVideo'],
): HlsVariant[] {
    for (const measure of [(size: Dimensions) => size.height, (size: Dimensions) => Math.max(size.width, size.height)]) {
        const required = distinctRenditions(profiles.map((profile) => variants.filter((variant) => (
            Math.abs(measure(variant) - measure(profile)) <= DIMENSION_TOLERANCE
        ))));
        if (required) return required;
    }
    if (!validDimensions(source)) throw new Error('provider_verification_incomplete');
    const reference = variants.reduce((largest, variant) => variant.height > largest.height ? variant : largest);
    const short = Math.min(source.width, source.height);
    const long = Math.max(source.width, source.height);
    // Playback determines display orientation; this permits 90-degree equivalence, not arbitrary stretching.
    const oriented = reference.width >= reference.height ? { width: long, height: short } : { width: short, height: long };
    if (!sameAspect(oriented, reference)) throw new Error('provider_verification_incomplete');
    const height = 2 * Math.floor(oriented.height / 2);
    if (height <= 0) throw new Error('provider_verification_incomplete');
    const targets = [...new Set(profiles.map((profile) => Math.min(profile.height, height)))];
    const required = distinctRenditions(targets.map((target) => variants.filter((variant) => (
        Math.abs(variant.height - target) <= DIMENSION_TOLERANCE
        || target === height && profiles.some((profile) => profile.height > height
            && Math.abs(variant.height - profile.height) <= DIMENSION_TOLERANCE)
    ))));
    if (!required) throw new Error('provider_playback_mismatch');
    return required;
}

// Probe both renditions and bounded media samples; this is not a whole-video playback test.
export async function verifyAdaptiveHls(
    masterUrl: string, token: string, profiles: { width: number; height: number }[],
    source?: ProviderAsset['sourceVideo'],
    context: HlsContext = { manifests: new Map(), mediaReferences: new Set() },
): Promise<HlsVerification> {
    const master = await verifiedHlsManifest(masterUrl, token, context);
    // Unverified alternate audio/I-frame playlists stay closed.
    if (master.some((line) => /(?:^|[:,])URI=/.test(line))) throw new Error('provider_playback_mismatch');
    const variants = master.flatMap((line, index) => {
        if (!line.startsWith('#EXT-X-STREAM-INF:')) return [];
        const resolution = /(?:^|,)RESOLUTION=(\d+)x(\d+)(?:,|$)/.exec(line.slice(18));
        const bandwidth = /(?:^|,)BANDWIDTH=(\d+)(?:,|$)/.exec(line.slice(18));
        if (!resolution || !bandwidth || !Number.isSafeInteger(Number(bandwidth[1])) || Number(bandwidth[1]) <= 0
            || !master[index + 1] || master[index + 1].startsWith('#')) {
            throw new Error('provider_playback_mismatch');
        }
        return [{ width: Number(resolution[1]), height: Number(resolution[2]), url: hlsReference(masterUrl, master[index + 1]) }];
    });
    if (!variants.length || variants.length > MAX_HLS_MANIFESTS
        || new Set(variants.map((variant) => variant.url)).size !== variants.length
        || variants.some((variant) => !validDimensions(variant))) {
        throw new Error('provider_playback_mismatch');
    }
    const reference = variants.reduce((largest, variant) => variant.height > largest.height ? variant : largest);
    if (variants.some((variant) => !sameAspect(reference, variant))
        || context.reference && !sameAspect(context.reference, reference)) throw new Error('provider_playback_mismatch');
    context.reference ??= reference;
    const required = requiredRenditions(variants, profiles, source);
    for (const variant of variants) {
        const media = await verifiedHlsManifest(variant.url, token, context);
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
        for (const reference of references) {
            const url = hlsReference(variant.url, reference);
            if (context.mediaReferences.has(url)) continue;
            if (context.mediaReferences.size >= MAX_HLS_MEDIA_REFERENCES) throw new Error('provider_playback_mismatch');
            await requireAnonymousPlaybackDenied(url);
            context.mediaReferences.add(url);
        }
    }
    return { variants, required };
}

async function verifiedHlsManifest(url: string, token: string, context: HlsContext): Promise<string[]> {
    if (!validPlaybackUrl(url)) throw new Error('provider_playback_mismatch');
    const previous = context.manifests.get(url);
    if (previous) return previous;
    if (context.manifests.size >= MAX_HLS_MANIFESTS) throw new Error('provider_playback_mismatch');
    await requireHlsPlaybackDenied(url);
    const lines = await authorizedHls(url, token);
    context.manifests.set(url, lines);
    return lines;
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
            const chunk = await reader.read().catch(() => { throw new Error('provider_unavailable'); });
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 512 * 1024) throw new Error('provider_playback_mismatch');
            body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
    } finally { await reader.cancel().catch(() => undefined); }
    if (hlsManifestKind(body) !== 'playable') throw new Error('provider_playback_mismatch');
    return body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}
