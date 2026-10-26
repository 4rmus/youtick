// Cloudflare Stream probes on top of the neutral verification core: option A byte proof (tus HEAD
// at readiness, stored evidence afterwards), the path-token credential, sampled anonymous denials
// of this asset's surfaces, and the pending rule for a ready webhook that arrives before the full
// ladder exists. No authorized segment is fetched in published mode. One run, metadata reads
// included, stays at or under STREAM_MAX_VERIFICATION_REQUESTS so a Durable Object alarm fits the
// Workers Free subrequest limit. Forged, expired and wrong-subject tokens test Cloudflare's JWT
// check rather than this asset; the playback canary (scripts/stream-canary.mjs) keeps that matrix.
import type {
    ProviderVerificationCheckpoint,
    ProviderVerificationResult,
    TusState,
    VerifyReadyAssetInput,
} from './media-provider';
import {
    MAX_HLS_MANIFESTS,
    chargeVerificationRequest,
    newVerificationBudget,
    readVerificationText,
    verificationFetch,
    verificationFetchFailure,
    verifyReadyProviderAsset,
    type ManifestPolicy,
    type ProbeRequest,
    type ProviderProbeSpec,
    type ProviderSurfaces,
    type VerificationBudget,
} from './provider-verification';
import {
    STREAM_CAPABILITIES,
    STREAM_TUS_URL_LIFETIME_MS,
    streamProviderAsset,
    streamProviderPlayback,
    type CloudflareStreamProvider,
    type StreamVideo,
} from './cloudflare-stream-provider';

/** No credential: the spike saw 401 on every surface (§9.3); 403 is a refusal too. */
export const STREAM_DENIED_CREDENTIAL_STATUSES: readonly number[] = Object.freeze([401, 403]);
/** Workers Free allows 50 subrequests per invocation; the alarm's own reads and finalize need the rest. */
export const STREAM_MAX_VERIFICATION_REQUESTS = 30;

/** Every recorded variant playlist carries #EXT-X-ENDLIST (spike and dashboard 2026-10-22). */
export const STREAM_REQUIRE_END_LIST = true;
/** No authorized segment read at all: Bridge media bytes and per-segment billing stay out of bounds. */
export const STREAM_READY_SEGMENT_PROBE = false;

export function streamManifestPolicy(): ManifestPolicy {
    return {
        allowAlternateMedia: true,
        allowedQueryKeys: ['p', 's'],
        requireEndList: STREAM_REQUIRE_END_LIST,
        initSegment: 'required',
        // Manifests: per-request statuses below; a query-stripped segment returns 404 (denied).
        deniedStatuses: { manifest: STREAM_DENIED_CREDENTIAL_STATUSES, media: [401, 403, 404] },
    };
}

/**
 * Non-HLS surfaces that must refuse an anonymous request: DASH serves the same media as HLS and the
 * MP4 download would be the whole file. Both answer to the same per-video requireSignedURLs as HLS.
 */
export const STREAM_DENIAL_SURFACES: readonly string[] = Object.freeze(['manifest/video.mpd', 'downloads/default.mp4']);

const PENDING_MARKER = 'youtick.stream-ready-pending.v1';
const PENDING_RETRY_MS = 15_000;

export async function verifyStreamReadyAsset(
    provider: CloudflareStreamProvider,
    input: VerifyReadyAssetInput,
): Promise<ProviderVerificationResult> {
    const options = provider.options;
    const nowMs = Date.now();
    const budget = newVerificationBudget(STREAM_MAX_VERIFICATION_REQUESTS);
    let tus: TusState | undefined;
    if (input.mode === 'ready') {
        tus = await readyByteProof(provider, input, nowMs, budget);
    } else if (!input.storedEvidence || !input.storedEvidence.readyAtMs) {
        // A missing Bridge-side record is not provider drift: keep the job blocked, never suspend sales.
        throw new Error('verification_evidence_missing');
    }
    let video: StreamVideo | undefined;
    const readVideo = async () => {
        if (!video) {
            chargeVerificationRequest(budget);
            video = await provider.readVideo(input.assetId);
        }
        return video;
    };
    const { token } = await provider.signPlayback(
        input.playbackId, options.verificationTokenTtlSeconds, Math.floor(nowMs / 1000),
    );
    const spec = streamProbeSpec(provider, input.playbackId);
    if (input.mode === 'ready') {
        const pending = await readyPending(provider, spec, budget, input, await readVideo(), token, nowMs);
        if (pending) return pending;
    }
    const { checkpoint: _checkpoint, ...coreInput } = input;
    const verified = await verifyReadyProviderAsset({
        capabilities: STREAM_CAPABILITIES,
        spec,
        surfaces: streamSurfaces(provider, input, spec, () => video),
        readAsset: async () => streamProviderAsset(await readVideo(), options.accountId!),
        readPlayback: async () => streamProviderPlayback(await readVideo()),
        // Ready mode: the HEAD above is the proof; the core never reads the upload a second time.
        readTusOffset: async () => {
            if (!tus) throw new Error('provider_state_invalid');
            return tus;
        },
        identityMatches: (asset, expected) => provider.identityMatches(asset, expected),
        describeProfile: (hash) => provider.describeProfile(hash),
    }, coreInput, {
        sha256: options.sha256,
        signPlaybackToken: async () => token,
        budget,
    });
    if ('pending' in verified) return verified;
    if (input.mode === 'published') {
        // Same canonical publication as at readiness: the stored proof and readiness time.
        const { sourceBytesEvidence: _none, ...published } = verified;
        return { ...published, readyAtMs: input.storedEvidence!.readyAtMs! };
    }
    if (!verified.sourceBytesEvidence) throw new Error('provider_state_invalid');
    return {
        ...verified,
        sourceBytesEvidence: { ...verified.sourceBytesEvidence, readyAtMs: verified.readyAtMs },
        ...(video && Number.isFinite(video.durationSeconds) && video.durationSeconds >= 0
            ? { durationSeconds: video.durationSeconds } : {}),
    };
}

// Option A: at readiness the upload must report offset == length == expected bytes. Overflow
// (offset > length) and any other mismatch are terminal (provider_tus_state_invalid); a URL past
// its 24 h life is provider_tus_url_expired without a request.
async function readyByteProof(
    provider: CloudflareStreamProvider,
    input: VerifyReadyAssetInput,
    nowMs: number,
    budget: VerificationBudget,
): Promise<TusState> {
    if (!input.tusEndpoint) throw new Error('provider_state_invalid');
    if (input.uploadCreatedAtMs !== undefined
        && (!Number.isSafeInteger(input.uploadCreatedAtMs) || nowMs >= input.uploadCreatedAtMs + STREAM_TUS_URL_LIFETIME_MS)) {
        throw new Error('provider_tus_url_expired');
    }
    chargeVerificationRequest(budget);
    const tus = await provider.readTusOffset(input.tusEndpoint);
    if (tus.lengthBytes !== input.expectedSourceBytes || tus.offsetBytes !== tus.lengthBytes) {
        throw new Error('provider_tus_state_invalid');
    }
    return tus;
}

/** Replaces the credential (first path segment) of a delivery URL. */
export function withStreamCredential(url: string, credential: string): string {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/');
    if (segments.length < 3 || !segments[1]) throw new Error('provider_playback_mismatch');
    segments[1] = credential;
    parsed.pathname = segments.join('/');
    return parsed.toString();
}

function streamProbeSpec(provider: CloudflareStreamProvider, playbackId: string): ProviderProbeSpec {
    return {
        dependency: 'stream_media',
        policy: streamManifestPolicy(),
        hosts: provider.hostAllowlist(),
        signedPolicy: 'jwt',
        canonicalHlsUrl: (uid) => provider.deliveryUrl(uid, 'manifest/video.m3u8'),
        authorizedRequest: (url, token) => ({ url: withStreamCredential(url, token), headers: {} }),
        // The unsigned URL form (the UID as credential) is what anyone holding a playback link has.
        manifestDenialRequests: (url): ProbeRequest[] => [{ url: withStreamCredential(url, playbackId), headers: {} }],
        coverage: 'sampled',
    };
}

function streamSurfaces(
    provider: CloudflareStreamProvider,
    input: VerifyReadyAssetInput,
    spec: ProviderProbeSpec,
    currentVideo: () => StreamVideo | undefined,
): ProviderSurfaces {
    return {
        declaredUrls: () => {
            const video = currentVideo();
            return video ? [video.thumbnailUrl, video.dashUrl].filter(Boolean) : [];
        },
        async probe({ budget }) {
            for (const path of STREAM_DENIAL_SURFACES) {
                await requireSurfaceStatus(spec, budget, provider.deliveryUrl(input.playbackId, path), STREAM_DENIED_CREDENTIAL_STATUSES);
            }
            return { bindingParts: [], deferredDenials: [] };
        },
    };
}

async function requireSurfaceStatus(
    spec: ProviderProbeSpec,
    budget: VerificationBudget,
    url: string,
    expected: readonly number[],
): Promise<void> {
    let response: Response;
    try {
        response = await verificationFetch(spec, budget, 'surface_denial_probe', url, {
            method: 'GET',
            headers: { Range: 'bytes=0-0' },
            redirect: 'manual',
        });
    } catch (error) {
        throw verificationFetchFailure(error);
    }
    await response.body?.cancel().catch(() => undefined);
    if (expected.includes(response.status)) return;
    if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
    // A success or redirect on a surface that must refuse is exposure; another refusal is drift.
    if (response.status < 400) throw new Error('provider_playback_exposed');
    throw new Error('provider_playback_mismatch');
}

// The ready webhook can precede the full ladder (spike: pctComplete 33-64). While pctComplete <
// 100, a missing rendition, a variant that is not yet served or (with requireEndList) an open
// variant playlist is "pending", never a drift code. Only authorized reads decide this, and they
// count against the same run budget as the verification that follows.
async function readyPending(
    provider: CloudflareStreamProvider,
    spec: ProviderProbeSpec,
    budget: VerificationBudget,
    input: VerifyReadyAssetInput,
    video: StreamVideo,
    token: string,
    nowMs: number,
): Promise<ProviderVerificationResult | null> {
    if (!Number.isFinite(video.pctComplete) || video.pctComplete >= 100) return null;
    if (video.state !== 'ready' || !video.readyToStream) return null;
    // Pending is only granted to this job's own signed, ready video (identityMatches requires
    // requireSignedURLs === true through the asset policy).
    if (!provider.identityMatches(streamProviderAsset(video, provider.options.accountId!), {
        jobId: input.jobId,
        generation: input.generation,
        assetId: input.assetId,
        playbackId: input.playbackId,
        projectId: input.projectId,
        expectedProjectId: input.expectedProjectId,
    })) {
        throw new Error('provider_identity_mismatch');
    }
    const complete = await ladderComplete(provider, spec, budget, input, video, token);
    if (complete) return null;
    const bindingSha256 = await provider.options.sha256(`${PENDING_MARKER}\n${input.assetId}\n${input.jobId}\n${input.generation}`);
    const previous = input.checkpoint;
    const startedAtMs = previous && previous.bindingSha256 === bindingSha256
        && Number.isSafeInteger(previous.startedAtMs) && previous.startedAtMs <= nowMs
        ? previous.startedAtMs : nowMs;
    if (nowMs - startedAtMs >= provider.options.readyPendingWindowMs) {
        throw new Error('provider_verification_incomplete');
    }
    const checkpoint: ProviderVerificationCheckpoint = { bindingSha256, nextThumbnail: 0, startedAtMs };
    return { pending: true, checkpoint, retryAfterMs: PENDING_RETRY_MS };
}

async function ladderComplete(
    provider: CloudflareStreamProvider,
    spec: ProviderProbeSpec,
    budget: VerificationBudget,
    input: VerifyReadyAssetInput,
    video: StreamVideo,
    token: string,
): Promise<boolean> {
    const masterUrl = provider.deliveryUrl(token, 'manifest/video.m3u8');
    const master = await authorizedPlaylist(spec, budget, masterUrl);
    if (!master) return false;
    const variants: { short: number; uri: string }[] = [];
    const alternates: string[] = [];
    for (const [index, line] of master.entries()) {
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            const resolution = /(?:^|,)RESOLUTION=(\d+)x(\d+)(?:,|$)/.exec(line.slice(18));
            const uri = master[index + 1];
            if (!resolution || !uri || uri.startsWith('#')) return true; // malformed: let the core decide
            variants.push({ short: Math.min(Number(resolution[1]), Number(resolution[2])), uri });
        }
        for (const match of line.matchAll(/(?:^|[:,])URI="([^"]+)"/g)) alternates.push(match[1]);
    }
    const sourceShort = video.input ? Math.min(video.input.width, video.input.height) : Number.POSITIVE_INFINITY;
    const targets = [...new Set(provider.describeProfile(input.profileConfigSha256).renditions
        .map((size) => Math.min(Math.min(size.width, size.height), sourceShort)))];
    if (targets.some((target) => !variants.some((variant) => Math.abs(variant.short - target) <= 2))) return false;
    // More playlists than the core accepts: let the core decide instead of spending the run budget
    // (a budget error here would also clear the pending checkpoint and restart its window).
    if (variants.length + alternates.length > MAX_HLS_MANIFESTS) return true;
    for (const reference of [...variants.map((variant) => variant.uri), ...alternates]) {
        let url: string;
        try {
            url = new URL(reference, masterUrl).toString();
        } catch {
            return true;
        }
        if (!provider.hostAllowlist().exact.includes(new URL(url).hostname)) return true;
        const playlist = await authorizedPlaylist(spec, budget, url);
        if (!playlist) return false;
        if (STREAM_REQUIRE_END_LIST && !playlist.includes('#EXT-X-ENDLIST')) return false;
    }
    return true;
}

// The token travels in the URL path; nothing here logs or returns the URL.
async function authorizedPlaylist(spec: ProviderProbeSpec, budget: VerificationBudget, url: string): Promise<string[] | null> {
    let response: Response;
    try {
        response = await verificationFetch(spec, budget, 'hls_pending_probe', url, {
            redirect: 'manual',
            signal: AbortSignal.timeout(5_000),
        });
    } catch (error) {
        throw verificationFetchFailure(error);
    }
    if (response.status === 429 || response.status >= 500) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error('provider_unavailable');
    }
    if (response.status !== 200 || !response.body) {
        await response.body?.cancel().catch(() => undefined);
        return null;
    }
    const body = await readVerificationText(response);
    const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines[0] === '#EXTM3U' ? lines : null;
}
