// Provider-neutral ready-asset verification core. It owns identity (through the adapter), state,
// byte proof (through the adapter's sourceBytesProof capability), the HLS invariants (through the
// adapter-declared ManifestPolicy), anonymous denial probes, the request/time budget and the
// pending/checkpoint contract. Provider hosts, credential placement and provider-only surfaces come
// from the adapter's ProviderProbeSpec and ProviderSurfaces; this module names none of them.
import { dependencyFetch, type DependencyLabel } from './dependency-fetch';
import type {
    HostAllowlist,
    MediaProfileDescription,
    MediaProviderCapabilities,
    ProviderAsset,
    ProviderIdentityExpectation,
    ProviderPlayback,
    ProviderVerificationResult,
    SourceBytesEvidence,
    TusState,
    VerifyReadyAssetInput,
} from './media-provider';

export const MAX_PROVIDER_PLAYBACK_OUTPUTS = 16;
const MAX_THUMBNAIL_PROBES_PER_STEP = 64;
// ponytail: 1024 references covers the measured 720-cue asset; larger lists require a budget review.
export const MAX_THUMBNAIL_REFERENCES = 1024;
const MAX_VERIFICATION_REQUESTS = 256;
const VERIFICATION_STEP_MS = 30_000;
const VERIFICATION_CYCLE_MS = 10 * 60_000;
export type VerificationBudget = { requests: number; deadlineAtMs: number };
const MAX_HLS_MANIFESTS = 16;
const MAX_HLS_MEDIA_REFERENCES = 64;
export const DIMENSION_TOLERANCE = 2;

export type Dimensions = { width: number; height: number };
type HlsVariant = Dimensions & { url: string };
export type HlsVerification = { variants: HlsVariant[]; required: HlsVariant[] };
export type HlsContext = {
    manifests: Map<string, string[]>;
    mediaReferences: Set<string>;
    reference?: Dimensions;
    budget?: VerificationBudget;
    // The adapter's declared capability; authorized requests must match it (header XOR path token).
    tokenPlacement?: MediaProviderCapabilities['tokenPlacement'];
};

/** HLS shape an adapter's delivery is held to. */
export type ManifestPolicy = {
    // EXT-X-MEDIA / I-frame playlists with a URI; when allowed each one is verified like a variant.
    allowAlternateMedia: boolean;
    // Query keys a playlist or segment reference may carry; empty rejects any query string.
    allowedQueryKeys: readonly string[];
    requireEndList: boolean;
    initSegment: 'optional' | 'required';
    // Statuses that count as "denied" for anonymous or forged requests, per surface.
    deniedStatuses: { manifest: readonly number[]; media: readonly number[] };
};

export type ProbeRequest = { url: string; headers: Record<string, string> };

/** How the core reaches one adapter's delivery surfaces. */
export type ProviderProbeSpec = {
    dependency: DependencyLabel;
    policy: ManifestPolicy;
    hosts: HostAllowlist;
    // Playback policy value both the asset and the playback document must report.
    signedPolicy: string;
    canonicalHlsUrl(playbackId: string): string;
    authorizedRequest(url: string, token: string): ProbeRequest;
    // Anonymous and forged-credential shapes every manifest must refuse, in probe order.
    manifestDenialRequests(url: string): ProbeRequest[];
};

export type SurfaceProbeInput = {
    asset: ProviderAsset;
    playback: ProviderPlayback;
    token: string;
    verifiedHls: HlsVerification[];
    context: HlsContext;
    budget: VerificationBudget;
};

/** Adapter-only surfaces (for example MP4 renditions, storyboards, downloads). */
export type ProviderSurfaces = {
    // Extra URLs that must pass the host allowlist before any probe runs.
    declaredUrls(asset: ProviderAsset): unknown[];
    // Runs after HLS verification; returns extra binding material and URLs whose anonymous
    // denial is proven incrementally under the checkpoint contract.
    probe(input: SurfaceProbeInput): Promise<{ bindingParts: unknown[]; deferredDenials: string[] }>;
};

export type VerificationAdapter = {
    capabilities: Pick<MediaProviderCapabilities, 'sourceBytesProof' | 'tokenPlacement'>;
    spec: ProviderProbeSpec;
    surfaces: ProviderSurfaces;
    readAsset(assetId: string): Promise<ProviderAsset>;
    readPlayback(playbackId: string): Promise<ProviderPlayback>;
    readTusOffset?(uploadUrl: string): Promise<TusState>;
    identityMatches(asset: ProviderAsset, expected: ProviderIdentityExpectation): boolean;
    describeProfile(profileConfigSha256: unknown): MediaProfileDescription;
};

export type VerificationDependencies = {
    sha256(value: string): Promise<string>;
    signPlaybackToken?: (playbackId: string) => Promise<string>;
};

export async function verifyReadyProviderAsset(
    adapter: VerificationAdapter,
    input: VerifyReadyAssetInput,
    dependencies: VerificationDependencies,
): Promise<ProviderVerificationResult> {
    const { spec } = adapter;
    // The two provider metadata reads each retain their existing five-second timeout.
    const budget = { requests: 2, deadlineAtMs: Date.now() + VERIFICATION_STEP_MS };
    const expectedProfiles = adapter.describeProfile(input.profileConfigSha256).renditions;
    const asset = await adapter.readAsset(input.assetId);
    const playback = await adapter.readPlayback(input.playbackId);
    if (!adapter.identityMatches(asset, {
        jobId: input.jobId,
        generation: input.generation,
        assetId: input.assetId,
        playbackId: input.playbackId,
        projectId: input.projectId,
        expectedProjectId: input.expectedProjectId,
        apiTokenName: input.apiTokenName,
    })) {
        throw new Error('provider_identity_mismatch');
    }
    const declaredSize = adapter.capabilities.sourceBytesProof === 'declared-size';
    if (asset.policy !== spec.signedPolicy
        || asset.phase !== 'ready'
        || !Number.isSafeInteger(asset.updatedAtMs)
        || asset.updatedAtMs <= 0
        || declaredSize && (!Number.isSafeInteger(asset.sizeBytes)
            || BigInt(asset.sizeBytes!) !== BigInt(input.expectedSourceBytes))) {
        throw new Error('provider_state_invalid');
    }
    const sourceBytes = declaredSize
        ? { verifiedSourceBytes: input.expectedSourceBytes }
        : await tusOffsetSourceBytes(adapter, input);

    if (playback.kind !== 'vod' || playback.policy !== spec.signedPolicy) {
        throw new Error('provider_playback_mismatch');
    }
    if (playback.sources.length > MAX_PROVIDER_PLAYBACK_OUTPUTS) {
        throw new Error('provider_playback_mismatch');
    }
    const hlsUrls = [...new Set(playback.sources.filter((source) => source.kind === 'hls').map((source) => source.url))];
    const allowed = (url: unknown) => playbackUrlAllowed(url, spec.hosts);
    if (hlsUrls.length === 0
        || playback.sources.some((source) => source.kind === 'unknown')
        || playback.sources.some((source) => !allowed(source.url))
        || adapter.surfaces.declaredUrls(asset).some((url) => !allowed(url))) {
        throw new Error('provider_playback_mismatch');
    }
    if (!dependencies.signPlaybackToken) throw new Error('runtime_not_configured');
    const token = await dependencies.signPlaybackToken(input.playbackId);
    const context: HlsContext = {
        manifests: new Map(), mediaReferences: new Set(), budget, tokenPlacement: adapter.capabilities.tokenPlacement,
    };
    const verifiedHls: HlsVerification[] = [];
    for (const hlsUrl of new Set([spec.canonicalHlsUrl(input.playbackId), ...hlsUrls])) {
        verifiedHls.push(await verifyAdaptiveHlsWith(spec, hlsUrl, token, expectedProfiles, asset.sourceVideo, context));
    }
    const surfaces = await adapter.surfaces.probe({ asset, playback, token, verifiedHls, context, budget });
    const deferred = surfaces.deferredDenials;
    // Fields added for other adapters stay out of the binding so in-flight checkpoints survive a deploy.
    const {
        checkpoint: previous, tusEndpoint: _tusEndpoint, mode: _mode, storedEvidence: _storedEvidence, ...identity
    } = input;
    const bindingSha256 = await dependencies.sha256(JSON.stringify([
        identity, asset, playback, [...context.manifests], ...surfaces.bindingParts, deferred,
    ]));
    const now = Date.now();
    if (previous && (previous.bindingSha256 !== bindingSha256
        || !Number.isSafeInteger(previous.nextThumbnail)
        || previous.nextThumbnail < 0 || previous.nextThumbnail >= deferred.length
        || !Number.isSafeInteger(previous.startedAtMs) || previous.startedAtMs > now
        || now - previous.startedAtMs >= VERIFICATION_CYCLE_MS)) {
        throw new Error('provider_verification_incomplete');
    }
    const checkpoint = previous ?? { bindingSha256, nextThumbnail: 0, startedAtMs: now };
    let nextThumbnail = checkpoint.nextThumbnail;
    const end = Math.min(nextThumbnail + MAX_THUMBNAIL_PROBES_PER_STEP, deferred.length);
    while (nextThumbnail < end) {
        // Reserve a complete probe timeout; never start the N+1 or an over-deadline request.
        if (budget.requests >= MAX_VERIFICATION_REQUESTS || Date.now() + 5_000 > budget.deadlineAtMs) break;
        await requireAnonymousPlaybackDenied(spec, deferred[nextThumbnail], context.mediaReferences, budget);
        nextThumbnail += 1;
    }
    if (Date.now() >= budget.deadlineAtMs) throw new Error('provider_unavailable');
    if (Date.now() - checkpoint.startedAtMs >= VERIFICATION_CYCLE_MS) {
        throw new Error('provider_verification_incomplete');
    }
    if (nextThumbnail < deferred.length) {
        if (nextThumbnail === checkpoint.nextThumbnail) throw new Error('provider_unavailable');
        return { pending: true, checkpoint: { ...checkpoint, nextThumbnail } };
    }

    return {
        assetIdHash: await dependencies.sha256(input.assetId),
        playbackId: input.playbackId,
        projectIdHash: await dependencies.sha256(input.projectId),
        verifiedSourceBytes: sourceBytes.verifiedSourceBytes,
        sourceFingerprint: asset.sha256 ?? null,
        readyAtMs: String(asset.updatedAtMs),
        ...(sourceBytes.evidence ? { sourceBytesEvidence: sourceBytes.evidence } : {}),
    };
}

// 'tus-offset' byte proof: at readiness the resumable upload must report offset == length ==
// expected; published re-verification never reads the upload again and reuses the stored proof.
async function tusOffsetSourceBytes(
    adapter: VerificationAdapter,
    input: VerifyReadyAssetInput,
): Promise<{ verifiedSourceBytes: string; evidence?: SourceBytesEvidence }> {
    const exact = (state: { offsetBytes: string; lengthBytes: string } | undefined) => Boolean(state
        && state.offsetBytes === input.expectedSourceBytes
        && state.lengthBytes === input.expectedSourceBytes);
    if (input.mode === 'published') {
        // A missing Bridge-side record is not provider drift: keep the job blocked, never suspend sales.
        if (!input.storedEvidence) throw new Error('verification_evidence_missing');
        if (input.storedEvidence.method !== 'tus-offset' || !exact(input.storedEvidence)) {
            throw new Error('provider_state_invalid');
        }
        return { verifiedSourceBytes: input.storedEvidence.offsetBytes };
    }
    if (!input.tusEndpoint || !adapter.readTusOffset) throw new Error('provider_state_invalid');
    const tus = await adapter.readTusOffset(input.tusEndpoint);
    if (!exact(tus)) throw new Error('provider_state_invalid');
    return {
        verifiedSourceBytes: tus.offsetBytes,
        evidence: {
            method: 'tus-offset',
            offsetBytes: tus.offsetBytes,
            lengthBytes: tus.lengthBytes,
            observedAtMs: Date.now(),
        },
    };
}

/** HTTPS, default port, no credentials, a real path, and a host the adapter allows. */
export function playbackUrlAllowed(value: unknown, allowlist: HostAllowlist): boolean {
    if (typeof value !== 'string') return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && !url.port
            && !url.username
            && !url.password
            && url.pathname.length > 1
            && (allowlist.exact.includes(url.hostname)
                || allowlist.suffixes.some((suffix) => url.hostname.endsWith(suffix)));
    } catch {
        return false;
    }
}

/** Resolves a playlist or storyboard reference and keeps it inside the adapter's hosts. */
export function providerReferenceUrl(parentUrl: string, reference: string, hosts: HostAllowlist): string {
    try {
        const url = new URL(reference, parentUrl);
        if (!playbackUrlAllowed(url.toString(), hosts)) throw new Error('invalid');
        return url.toString();
    } catch {
        throw new Error('provider_playback_mismatch');
    }
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

async function hlsPlaybackDenied(response: Response, denied: readonly number[]): Promise<boolean> {
    if (denied.includes(response.status)) return true;
    if (response.status !== 200) return false;
    try {
        return hlsManifestKind(await response.text()) === 'error';
    } catch {
        throw new Error('provider_unavailable');
    }
}

async function requireHlsPlaybackDenied(spec: ProviderProbeSpec, url: string, budget?: VerificationBudget): Promise<void> {
    for (const probe of spec.manifestDenialRequests(url)) {
        let response: Response;
        try {
            response = await verificationFetch(spec, budget, 'hls_anonymous_probe', probe.url, {
                method: 'GET',
                headers: probe.headers,
                redirect: 'manual',
                signal: AbortSignal.timeout(5_000),
            });
        } catch {
            throw new Error('provider_unavailable');
        }
        if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
        if (!await hlsPlaybackDenied(response, spec.policy.deniedStatuses.manifest)) {
            throw new Error('provider_playback_exposed');
        }
    }
}

/**
 * One anonymous byte-range GET that must be refused. A reference that carries allowed credential
 * query keys is probed without its query, so a listed signed URL is never replayed anonymously.
 */
export async function requireAnonymousPlaybackDenied(
    spec: ProviderProbeSpec,
    url: string,
    verified?: Set<string>,
    budget?: VerificationBudget,
): Promise<void> {
    if (verified?.has(url)) return;
    let probeUrl = url;
    if (spec.policy.allowedQueryKeys.length > 0) {
        const stripped = new URL(url);
        stripped.search = '';
        probeUrl = stripped.toString();
    }
    let response: Response;
    try {
        response = await verificationFetch(spec, budget, 'asset_anonymous_probe', probeUrl, {
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
    if (!spec.policy.deniedStatuses.media.includes(response.status)) throw new Error('provider_playback_exposed');
    verified?.add(url);
}

export function validDimensions(value: { width: unknown; height: unknown } | null | undefined): value is Dimensions {
    return Boolean(value && Number.isSafeInteger(value.width) && Number(value.width) > 0
        && Number.isSafeInteger(value.height) && Number(value.height) > 0);
}

export function sameDimensions(left: Dimensions, right: Dimensions): boolean {
    return Math.abs(left.width - right.width) <= DIMENSION_TOLERANCE
        && Math.abs(left.height - right.height) <= DIMENSION_TOLERANCE;
}

export function sameAspect(reference: Dimensions, output: Dimensions): boolean {
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
    if (profiles.some(profile => profile.height >= 1080)) {
        if (!validDimensions(source)) throw new Error('provider_verification_incomplete');
        const short = Math.min(source.width, source.height), long = Math.max(source.width, source.height);
        if (variants.some(variant => Math.min(variant.width, variant.height) > short + DIMENSION_TOLERANCE
            || Math.max(variant.width, variant.height) > long + DIMENSION_TOLERANCE)) {
            throw new Error('provider_playback_mismatch');
        }
    }
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
export async function verifyAdaptiveHlsWith(
    spec: ProviderProbeSpec,
    masterUrl: string, token: string, profiles: { width: number; height: number }[],
    source?: ProviderAsset['sourceVideo'],
    context: HlsContext = { manifests: new Map(), mediaReferences: new Set() },
): Promise<HlsVerification> {
    context.budget ??= { requests: 0, deadlineAtMs: Date.now() + VERIFICATION_STEP_MS };
    const master = await verifiedHlsManifest(spec, masterUrl, token, context);
    const alternates = master.flatMap((line) => /(?:^|[:,])URI=/.test(line)
        ? [...line.matchAll(/(?:^|[:,])URI="([^"]+)"/g)].map((match) => match[1]) : []);
    // Unverified alternate audio/I-frame playlists stay closed unless the adapter policy verifies them.
    if (master.some((line) => /(?:^|[:,])URI=/.test(line)) && !spec.policy.allowAlternateMedia) {
        throw new Error('provider_playback_mismatch');
    }
    const variants = master.flatMap((line, index) => {
        if (!line.startsWith('#EXT-X-STREAM-INF:')) return [];
        const resolution = /(?:^|,)RESOLUTION=(\d+)x(\d+)(?:,|$)/.exec(line.slice(18));
        const bandwidth = /(?:^|,)BANDWIDTH=(\d+)(?:,|$)/.exec(line.slice(18));
        if (!resolution || !bandwidth || !Number.isSafeInteger(Number(bandwidth[1])) || Number(bandwidth[1]) <= 0
            || !master[index + 1] || master[index + 1].startsWith('#')) {
            throw new Error('provider_playback_mismatch');
        }
        return [{ width: Number(resolution[1]), height: Number(resolution[2]), url: hlsReference(spec, masterUrl, master[index + 1]) }];
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
        await verifyMediaPlaylist(spec, variant.url, token, context);
    }
    for (const alternate of alternates) {
        await verifyMediaPlaylist(spec, hlsReference(spec, masterUrl, alternate), token, context);
    }
    return { variants, required };
}

async function verifyMediaPlaylist(spec: ProviderProbeSpec, url: string, token: string, context: HlsContext): Promise<void> {
    const media = await verifiedHlsManifest(spec, url, token, context);
    if (media.some((line) => line.startsWith('#EXT-X-STREAM-INF:'))
        || spec.policy.requireEndList && !media.includes('#EXT-X-ENDLIST')
        || spec.policy.initSegment === 'required' && !media.some((line) => line.startsWith('#EXT-X-MAP:'))) {
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
        const referenceUrl = hlsReference(spec, url, reference);
        if (context.mediaReferences.has(referenceUrl)) continue;
        if (context.mediaReferences.size >= MAX_HLS_MEDIA_REFERENCES) throw new Error('provider_playback_mismatch');
        await requireAnonymousPlaybackDenied(spec, referenceUrl, undefined, context.budget);
        context.mediaReferences.add(referenceUrl);
    }
}

async function verifiedHlsManifest(spec: ProviderProbeSpec, url: string, token: string, context: HlsContext): Promise<string[]> {
    if (!playbackUrlAllowed(url, spec.hosts)) throw new Error('provider_playback_mismatch');
    const previous = context.manifests.get(url);
    if (previous) return previous;
    if (context.manifests.size >= MAX_HLS_MANIFESTS) throw new Error('provider_playback_mismatch');
    await requireHlsPlaybackDenied(spec, url, context.budget);
    const lines = await authorizedHls(spec, url, token, context);
    context.manifests.set(url, lines);
    return lines;
}

function hlsReference(spec: ProviderProbeSpec, parent: string, reference: string): string {
    const url = new URL(providerReferenceUrl(parent, reference, spec.hosts));
    const allowedKeys = spec.policy.allowedQueryKeys;
    if (url.hash || url.search && (allowedKeys.length === 0
        || [...url.searchParams.keys()].some((key) => !allowedKeys.includes(key)))) {
        throw new Error('provider_playback_mismatch');
    }
    return url.toString();
}

async function authorizedHls(spec: ProviderProbeSpec, url: string, token: string, context: HlsContext): Promise<string[]> {
    if (!playbackUrlAllowed(url, spec.hosts)) throw new Error('provider_playback_mismatch');
    const authorized = spec.authorizedRequest(url, token);
    // A path-token adapter never sends a credential header; a header adapter never rewrites the URL.
    if (context.tokenPlacement === 'path' && Object.keys(authorized.headers).length > 0
        || context.tokenPlacement === 'header' && authorized.url !== url) {
        throw new Error('runtime_not_configured');
    }
    let response: Response;
    try {
        response = await verificationFetch(spec, context.budget, 'hls_authorized_probe', authorized.url, {
            headers: authorized.headers, redirect: 'manual', signal: AbortSignal.timeout(5_000),
        });
    } catch { throw new Error('provider_unavailable'); }
    if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
    if (response.status !== 200 || !response.body) throw new Error('provider_playback_mismatch');
    const body = await readVerificationText(response);
    if (hlsManifestKind(body) !== 'playable') throw new Error('provider_playback_mismatch');
    return body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export async function readVerificationText(response: Response): Promise<string> {
    if (!response.body) throw new Error('provider_playback_mismatch');
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
    return body;
}

export function verificationFetch(
    spec: ProviderProbeSpec,
    budget: VerificationBudget | undefined,
    operation: string,
    url: string,
    init: RequestInit,
): Promise<Response> {
    const remainingMs = budget ? budget.deadlineAtMs - Date.now() : 5_000;
    if (remainingMs <= 0 || budget && budget.requests >= MAX_VERIFICATION_REQUESTS) {
        throw new Error('provider_unavailable');
    }
    if (budget) budget.requests += 1;
    return dependencyFetch(spec.dependency, operation, url, {
        ...init, signal: AbortSignal.timeout(Math.min(5_000, remainingMs)),
    });
}
