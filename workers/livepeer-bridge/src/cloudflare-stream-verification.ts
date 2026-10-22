// Cloudflare Stream probes on top of the neutral verification core: option A byte proof (tus HEAD
// at readiness, stored evidence afterwards), the path-token credential, the per-surface denial
// matrix recorded in the spike (docs report §9.3), and the pending rule for a ready webhook that
// arrives before the full ladder exists. No authorized segment is fetched in published mode.
import type {
    ProviderVerificationCheckpoint,
    ProviderVerificationResult,
    TusState,
    VerifyReadyAssetInput,
} from './media-provider';
import { dependencyFetch } from './dependency-fetch';
import {
    readVerificationText,
    verificationFetch,
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

/** none, forged and expired credentials: 401 on every surface (spike §9.3). */
export const STREAM_DENIED_CREDENTIAL_STATUSES: readonly number[] = Object.freeze([401]);
/** A valid signature for another UID: 404 on manifests, variants, thumbnails and the MP4 download. */
export const STREAM_WRONG_SUBJECT_STATUSES: readonly number[] = Object.freeze([404]);

export function streamManifestPolicy(requireEndList: boolean): ManifestPolicy {
    return {
        allowAlternateMedia: true,
        allowedQueryKeys: ['p', 's'],
        requireEndList,
        initSegment: 'required',
        // Manifests: per-request statuses below; a query-stripped segment returns 404 (denied).
        deniedStatuses: { manifest: STREAM_DENIED_CREDENTIAL_STATUSES, media: [401, 403, 404] },
    };
}

type SurfaceRule = {
    path: string;
    // Expected status for a valid signature on another UID; absent: not probed (iframe 200 shell, watch 500).
    wrongSubject?: number;
    // Expected statuses for this video's valid viewer token (never `downloadable`): the spike saw
    // 403; a video without a generated MP4 may answer 404 (dashboard 2026-10-22). Both are refusals.
    valid?: readonly number[];
};

/** Non-HLS surfaces, verbatim from the spike table. HLS master and variants go through the core. */
export const STREAM_SURFACE_MATRIX: readonly SurfaceRule[] = Object.freeze([
    { path: 'manifest/video.mpd', wrongSubject: 404 },
    { path: 'thumbnails/thumbnail.jpg', wrongSubject: 404 },
    { path: 'thumbnails/thumbnail.gif', wrongSubject: 404 },
    { path: 'iframe' },
    { path: 'watch' },
    { path: 'downloads/default.mp4', wrongSubject: 404, valid: [403, 404] },
]);

const PENDING_MARKER = 'youtick.stream-ready-pending.v1';
const PENDING_RETRY_MS = 15_000;

type Credentials = { valid: string; forged: string; expired: string; wrongSubject: string };

export async function verifyStreamReadyAsset(
    provider: CloudflareStreamProvider,
    input: VerifyReadyAssetInput,
): Promise<ProviderVerificationResult> {
    const options = provider.options;
    const nowMs = Date.now();
    let tus: TusState | undefined;
    if (input.mode === 'ready') {
        tus = await readyByteProof(provider, input, nowMs);
    } else if (!input.storedEvidence || !input.storedEvidence.readyAtMs) {
        // A missing Bridge-side record is not provider drift: keep the job blocked, never suspend sales.
        throw new Error('verification_evidence_missing');
    }
    let video: StreamVideo | undefined;
    const readVideo = async () => {
        video ??= await provider.readVideo(input.assetId);
        return video;
    };
    const credentials = await streamCredentials(provider, input.playbackId, nowMs);
    if (input.mode === 'ready') {
        const pending = await readyPending(provider, input, await readVideo(), credentials.valid, nowMs);
        if (pending) return pending;
    }
    const spec = streamProbeSpec(provider, input.playbackId, credentials);
    const { checkpoint: _checkpoint, ...coreInput } = input;
    const verified = await verifyReadyProviderAsset({
        capabilities: STREAM_CAPABILITIES,
        spec,
        surfaces: streamSurfaces(provider, input, credentials, spec, () => video),
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
        signPlaybackToken: async () => credentials.valid,
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
): Promise<TusState> {
    if (!input.tusEndpoint) throw new Error('provider_state_invalid');
    if (input.uploadCreatedAtMs !== undefined
        && (!Number.isSafeInteger(input.uploadCreatedAtMs) || nowMs >= input.uploadCreatedAtMs + STREAM_TUS_URL_LIFETIME_MS)) {
        throw new Error('provider_tus_url_expired');
    }
    const tus = await provider.readTusOffset(input.tusEndpoint);
    if (tus.lengthBytes !== input.expectedSourceBytes || tus.offsetBytes !== tus.lengthBytes) {
        throw new Error('provider_tus_state_invalid');
    }
    return tus;
}

async function streamCredentials(
    provider: CloudflareStreamProvider,
    playbackId: string,
    nowMs: number,
): Promise<Credentials> {
    const nowSeconds = Math.floor(nowMs / 1000);
    const { token: valid } = await provider.signPlayback(
        playbackId, provider.options.verificationTokenTtlSeconds, nowSeconds,
    );
    const [header, payload] = valid.split('.');
    const forgedSignature = new Uint8Array(256);
    crypto.getRandomValues(forgedSignature);
    const randomUid = new Uint8Array(16);
    crypto.getRandomValues(randomUid);
    return {
        valid,
        // Right kid and claims, a signature no key of ours produced.
        forged: `${header}.${payload}.${base64Url(forgedSignature)}`,
        expired: await provider.signToken(playbackId, nowSeconds - 600, nowSeconds - 1200),
        wrongSubject: await provider.signToken(
            Array.from(randomUid, (byte) => byte.toString(16).padStart(2, '0')).join(''),
            nowSeconds + provider.options.verificationTokenTtlSeconds,
            nowSeconds - 60,
        ),
    };
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

function streamProbeSpec(
    provider: CloudflareStreamProvider,
    playbackId: string,
    credentials: Credentials,
): ProviderProbeSpec {
    return {
        dependency: 'stream_media',
        policy: streamManifestPolicy(provider.options.requireEndList),
        hosts: provider.hostAllowlist(),
        signedPolicy: 'jwt',
        canonicalHlsUrl: (uid) => provider.deliveryUrl(uid, 'manifest/video.m3u8'),
        authorizedRequest: (url, token) => ({ url: withStreamCredential(url, token), headers: {} }),
        manifestDenialRequests: (url): ProbeRequest[] => [
            { url: withStreamCredential(url, playbackId), headers: {} },
            { url: withStreamCredential(url, credentials.forged), headers: {} },
            { url: withStreamCredential(url, credentials.expired), headers: {} },
            {
                url: withStreamCredential(url, credentials.wrongSubject),
                headers: {},
                deniedStatuses: STREAM_WRONG_SUBJECT_STATUSES,
            },
        ],
    };
}

function streamSurfaces(
    provider: CloudflareStreamProvider,
    input: VerifyReadyAssetInput,
    credentials: Credentials,
    spec: ProviderProbeSpec,
    currentVideo: () => StreamVideo | undefined,
): ProviderSurfaces {
    return {
        declaredUrls: () => {
            const video = currentVideo();
            return video ? [video.thumbnailUrl, video.dashUrl].filter(Boolean) : [];
        },
        async probe({ context, budget }) {
            for (const rule of STREAM_SURFACE_MATRIX) {
                const url = (credential: string) => provider.deliveryUrl(credential, rule.path);
                for (const credential of [input.playbackId, credentials.forged, credentials.expired]) {
                    await requireSurfaceStatus(spec, budget, url(credential), STREAM_DENIED_CREDENTIAL_STATUSES);
                }
                if (rule.wrongSubject !== undefined) {
                    await requireSurfaceStatus(spec, budget, url(credentials.wrongSubject), [rule.wrongSubject]);
                }
                if (rule.valid !== undefined) {
                    await requireSurfaceStatus(spec, budget, url(credentials.valid), rule.valid);
                }
            }
            // At most one authorized byte at readiness, behind a default-off switch; never published.
            if (input.mode === 'ready' && provider.options.readySegmentProbe) {
                const signed = [...context.mediaReferences].find((reference) => {
                    const query = new URL(reference).searchParams;
                    return query.has('p') && query.has('s');
                });
                if (!signed) throw new Error('provider_playback_mismatch');
                await requireSignedSegmentReadable(spec, budget, signed);
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
    } catch {
        throw new Error('provider_unavailable');
    }
    await response.body?.cancel().catch(() => undefined);
    if (expected.includes(response.status)) return;
    if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
    // A success or redirect on a surface that must refuse is exposure; another refusal is drift.
    if (response.status < 400) throw new Error('provider_playback_exposed');
    throw new Error('provider_playback_mismatch');
}

async function requireSignedSegmentReadable(
    spec: ProviderProbeSpec,
    budget: VerificationBudget,
    url: string,
): Promise<void> {
    let response: Response;
    try {
        response = await verificationFetch(spec, budget, 'segment_range_probe', url, {
            method: 'GET',
            headers: { Range: 'bytes=0-0' },
            redirect: 'manual',
        });
    } catch {
        throw new Error('provider_unavailable');
    }
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
    if (![200, 206].includes(response.status)) throw new Error('provider_playback_mismatch');
}

// The ready webhook can precede the full ladder (spike: pctComplete 33-64). While pctComplete <
// 100, a missing rendition, a variant that is not yet served or (with requireEndList) an open
// variant playlist is "pending", never a drift code. Only authorized reads decide this.
async function readyPending(
    provider: CloudflareStreamProvider,
    input: VerifyReadyAssetInput,
    video: StreamVideo,
    token: string,
    nowMs: number,
): Promise<ProviderVerificationResult | null> {
    if (!Number.isFinite(video.pctComplete) || video.pctComplete >= 100) return null;
    if (video.state !== 'ready' || !video.readyToStream) return null;
    // Pending is only granted to this job's own signed, ready video.
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
    const complete = await ladderComplete(provider, input, video, token);
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
    input: VerifyReadyAssetInput,
    video: StreamVideo,
    token: string,
): Promise<boolean> {
    const masterUrl = provider.deliveryUrl(token, 'manifest/video.m3u8');
    const master = await authorizedPlaylist(masterUrl);
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
    for (const reference of [...variants.map((variant) => variant.uri), ...alternates]) {
        let url: string;
        try {
            url = new URL(reference, masterUrl).toString();
        } catch {
            return true;
        }
        if (!provider.hostAllowlist().exact.includes(new URL(url).hostname)) return true;
        const playlist = await authorizedPlaylist(url);
        if (!playlist) return false;
        if (provider.options.requireEndList && !playlist.includes('#EXT-X-ENDLIST')) return false;
    }
    return true;
}

// The token travels in the URL path; nothing here logs or returns the URL.
async function authorizedPlaylist(url: string): Promise<string[] | null> {
    let response: Response;
    try {
        response = await dependencyFetch('stream_media', 'hls_pending_probe', url, {
            redirect: 'manual',
            signal: AbortSignal.timeout(5_000),
        });
    } catch {
        throw new Error('provider_unavailable');
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

function base64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
