// Livepeer Studio verification probes on top of the neutral core: the Livepeer-Jwt header
// credential, forged ES256 token shapes, the MP4 rendition cross-check (with Studio's portrait
// transpose quirk), the VTT storyboard and the download URL. Every binding below is read at call
// time because this module and livepeer-provider.ts import each other.
import type {
    MediaProvider,
    ProviderVerificationResult,
    VerifyReadyAssetInput,
} from './media-provider';
import {
    DIMENSION_TOLERANCE,
    MAX_THUMBNAIL_REFERENCES,
    providerReferenceUrl,
    readVerificationText,
    requireAnonymousPlaybackDenied,
    sameAspect,
    sameDimensions,
    validDimensions,
    verificationFetch,
    verificationFetchFailure,
    verifyAdaptiveHlsWith,
    verifyReadyProviderAsset,
    type Dimensions,
    type HlsContext,
    type HlsVerification,
    type ManifestPolicy,
    type ProviderProbeSpec,
    type ProviderSurfaces,
    type VerificationBudget,
    type VerificationDependencies,
} from './provider-verification';
import {
    LIVEPEER_CAPABILITIES,
    LIVEPEER_JWT_HEADER,
    livepeerHlsUrl,
    livepeerHostAllowlist,
    livepeerIdentityMatches,
    livepeerProfiles,
} from './livepeer-provider';

export const LIVEPEER_MANIFEST_POLICY: ManifestPolicy = Object.freeze({
    allowAlternateMedia: false,
    allowedQueryKeys: [],
    requireEndList: true,
    initSegment: 'optional',
    deniedStatuses: { manifest: [401, 403], media: [401, 403] },
});

// Anonymous, malformed, wrong-subject and expired ES256 shapes; none may open a manifest.
const FORGED_LIVEPEER_JWTS = [
    'invalid.invalid.invalid',
    'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ3cm9uZyJ9.invalid',
    'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjF9.invalid',
];

let probeSpec: ProviderProbeSpec | undefined;

export function livepeerProbeSpec(): ProviderProbeSpec {
    probeSpec ??= {
        dependency: 'livepeer_media',
        policy: LIVEPEER_MANIFEST_POLICY,
        hosts: livepeerHostAllowlist(),
        signedPolicy: 'jwt',
        canonicalHlsUrl: livepeerHlsUrl,
        authorizedRequest: (url, token) => ({ url, headers: { [LIVEPEER_JWT_HEADER]: token } }),
        manifestDenialRequests: (url) => [
            { url, headers: {} },
            ...FORGED_LIVEPEER_JWTS.map((token) => ({ url, headers: { [LIVEPEER_JWT_HEADER]: token } })),
        ],
    };
    return probeSpec;
}

const LIVEPEER_SURFACES: ProviderSurfaces = {
    declaredUrls: (asset) => [asset.downloadUrl],
    async probe({ asset, playback, token, verifiedHls, context, budget }) {
        const spec = livepeerProbeSpec();
        const mp4Sources = playback.sources.filter((source) => source.kind === 'mp4');
        const mp4Urls = [...new Set(mp4Sources.map((source) => source.url))];
        const vttUrls = [...new Set(playback.sources.filter((source) => source.kind === 'vtt').map((source) => source.url))];
        requireMp4MatchesHls(asset.sourceVideo, mp4Sources, verifiedHls);
        for (const mp4Url of mp4Urls) {
            await requireAnonymousPlaybackDenied(spec, mp4Url, context.mediaReferences, budget);
        }
        for (const vttUrl of vttUrls) {
            await requireAnonymousPlaybackDenied(spec, vttUrl, context.mediaReferences, budget);
        }
        await requireAnonymousPlaybackDenied(spec, asset.downloadUrl!, context.mediaReferences, budget);
        const vttBodies = new Map<string, string>();
        const thumbnails = await vttThumbnailUrls(vttUrls, token, budget, vttBodies);
        return { bindingParts: [[...vttBodies]], deferredDenials: thumbnails };
    },
};

export function verifyLivepeerReadyAsset(
    provider: Pick<MediaProvider, 'readAsset' | 'readPlayback'>,
    input: VerifyReadyAssetInput,
    dependencies: VerificationDependencies,
): Promise<ProviderVerificationResult> {
    // Studio proves source bytes by the declared asset size ('declared-size'); it never reads the
    // upload again, so tusEndpoint, mode and stored evidence in the input are ignored.
    return verifyReadyProviderAsset({
        capabilities: LIVEPEER_CAPABILITIES,
        spec: livepeerProbeSpec(),
        surfaces: LIVEPEER_SURFACES,
        readAsset: (assetId) => provider.readAsset(assetId),
        readPlayback: (playbackId) => provider.readPlayback(playbackId),
        identityMatches: livepeerIdentityMatches,
        describeProfile: (hash) => ({ renditions: livepeerProfiles(hash) }),
    }, input, dependencies);
}

export function verifyAdaptiveHls(
    masterUrl: string, token: string, profiles: { width: number; height: number }[],
    source?: { width: unknown; height: unknown } | null,
    context?: HlsContext,
): Promise<HlsVerification> {
    return verifyAdaptiveHlsWith(livepeerProbeSpec(), masterUrl, token, profiles, source, context);
}

function requireMp4MatchesHls(
    sourceVideo: { width: unknown; height: unknown } | null | undefined,
    mp4Sources: { width: unknown; height: unknown; bitrate: unknown }[],
    verifiedHls: HlsVerification[],
): void {
    // Livepeer can retain landscape profile labels for portrait HLS media.
    // Only a uniform transpose corroborated by the source and every MP4 is eligible.
    const transposeHls = validDimensions(sourceVideo)
        && sourceVideo.height > sourceVideo.width + DIMENSION_TOLERANCE
        && mp4Sources.length > 0
        && mp4Sources.every((output) => validDimensions(output) && sameAspect(sourceVideo, output))
        && verifiedHls.every((hls) => hls.variants.every((variant) => (
            variant.width > variant.height + DIMENSION_TOLERANCE
            && sameAspect(sourceVideo, { width: variant.height, height: variant.width })
        )));
    const outputDimensions = (variant: Dimensions) => transposeHls
        ? { width: variant.height, height: variant.width } : variant;
    const variants = verifiedHls.flatMap((hls) => hls.variants.map(outputDimensions));
    if (mp4Sources.some((source) => !validDimensions(source)
        || typeof source.bitrate !== 'number' || !Number.isFinite(source.bitrate) || source.bitrate <= 0
        || !variants.some((variant) => sameDimensions(variant, source))
            && !(validDimensions(sourceVideo) && sameDimensions(sourceVideo, source)))
        || mp4Sources.length > 0 && !mp4Sources.some((source) => validDimensions(source)
            && verifiedHls.some((hls) => sameDimensions(outputDimensions(hls.required[hls.required.length - 1]), source)))) {
        throw new Error('provider_playback_mismatch');
    }
}

export async function firstVttThumbnailUrl(vttUrls: string[], token: string): Promise<string | null> {
    for (const vttUrl of vttUrls) {
        const [reference] = await fetchVttReferences(vttUrl, token);
        if (reference) return providerReferenceUrl(vttUrl, reference, livepeerHostAllowlist());
    }
    return null;
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

async function vttThumbnailUrls(vttUrls: string[], token: string, budget?: VerificationBudget, bodies?: Map<string, string>): Promise<string[]> {
    const thumbnails = new Set<string>();
    for (const vttUrl of vttUrls) {
        for (const reference of await fetchVttReferences(vttUrl, token, budget, bodies)) {
            thumbnails.add(providerReferenceUrl(vttUrl, reference, livepeerHostAllowlist()));
            if (thumbnails.size > MAX_THUMBNAIL_REFERENCES) {
                throw new Error('provider_playback_mismatch');
            }
        }
    }
    return [...thumbnails];
}

async function fetchVttReferences(vttUrl: string, token: string, budget?: VerificationBudget, bodies?: Map<string, string>): Promise<string[]> {
    let response: Response;
    try {
        response = await verificationFetch(livepeerProbeSpec(), budget, 'vtt_read', vttUrl, {
            method: 'GET',
            headers: { [LIVEPEER_JWT_HEADER]: token },
            redirect: 'manual',
            signal: AbortSignal.timeout(5_000),
        });
    } catch (error) {
        throw verificationFetchFailure(error);
    }
    if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
    if (response.status !== 200) throw new Error('provider_playback_mismatch');
    const body = await readVerificationText(response);
    bodies?.set(vttUrl, body);
    const references = vttReferences(body);
    if (references) return references;
    throw new Error('provider_playback_mismatch');
}
