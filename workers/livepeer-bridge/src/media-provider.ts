// Provider-neutral seam between the Bridge control plane and a media provider adapter.
// Adapters own every provider host, header, URL shape, signature scheme and profile catalog;
// index.ts and the neutral verification core only see the types below.
import studioProfiles from '../../../protocol/paid-media-livepeer-v1/profiles.json';
import streamProfiles from '../../../protocol/paid-media-v1/stream-profile.json';

export type MediaProviderKind = 'studio' | 'stream';

export const MEDIA_PROVIDER_KINDS: readonly MediaProviderKind[] = ['studio', 'stream'];

/** Internal header the ingress adds when it forwards a verified webhook body to a job object. */
export const MEDIA_PROVIDER_HEADER = 'X-YouTick-Provider';
/** Internal header carrying the signed webhook time (ms) when the signature holds it outside the body. */
export const MEDIA_WEBHOOK_TIME_HEADER = 'X-YouTick-Webhook-Time';

export function mediaProviderKind(value: unknown): MediaProviderKind | null {
    return MEDIA_PROVIDER_KINDS.find((kind) => kind === value) ?? null;
}

// Profile catalogs. The frozen V1 profiles.json selects the Studio adapter; the paid-media-v1
// Stream descriptor selects the Stream adapter. A hash belongs to exactly one catalog, so each
// adapter refuses the other's hashes.
export type MediaProfileFamily = 'studio' | 'stream';

const STREAM_DESCRIPTOR = streamProfiles.stream;
/** The Stream descriptor hash (protocol/paid-media-v1/stream-profile.json). */
export const STREAM_PROFILE_HASH: string = STREAM_DESCRIPTOR.hash;
/** Largest maxDurationSeconds the descriptor lets the Bridge book for one upload. */
export const STREAM_PROFILE_MAX_DURATION_SECONDS: number = STREAM_DESCRIPTOR.maxDurationSecondsCap;

export function mediaProfileFamily(profileConfigSha256: unknown): MediaProfileFamily | null {
    if (typeof profileConfigSha256 !== 'string') return null;
    if (Object.values(studioProfiles).some((entry) => entry.hash === profileConfigSha256)) return 'studio';
    if (profileConfigSha256 === STREAM_DESCRIPTOR.hash) return 'stream';
    return null;
}

export function supportsMediaProfile(profileConfigSha256: unknown): boolean {
    return mediaProfileFamily(profileConfigSha256) !== null;
}

/** Rendition dimensions the Bridge requires for a hash from either catalog. */
export function describeMediaProfile(profileConfigSha256: unknown): MediaProfileDescription {
    const family = mediaProfileFamily(profileConfigSha256);
    if (family === 'stream') {
        return { renditions: STREAM_DESCRIPTOR.profiles.map(({ width, height }) => ({ width, height })) };
    }
    if (family === 'studio') {
        const entry = Object.values(studioProfiles).find((candidate) => candidate.hash === profileConfigSha256)!;
        return { renditions: entry.profiles.map(({ width, height }) => ({ width, height })) };
    }
    throw new Error('unsupported_profile');
}

export function streamSupportsProfile(profileConfigSha256: unknown): boolean {
    return mediaProfileFamily(profileConfigSha256) === 'stream';
}

export function streamDescribeProfile(profileConfigSha256: unknown): MediaProfileDescription {
    if (!streamSupportsProfile(profileConfigSha256)) throw new Error('unsupported_profile');
    return describeMediaProfile(profileConfigSha256);
}

export type MediaSourceType = 'mp4' | 'mov' | 'avi' | 'webm' | 'wmv' | 'mkv' | 'flv';

export const MEDIA_SOURCE_FORMATS: Record<MediaSourceType, { filename: string; mime: string }> = {
    mp4: { filename: 'source.mp4', mime: 'video/mp4' },
    mov: { filename: 'source.mov', mime: 'video/quicktime' },
    avi: { filename: 'source.avi', mime: 'video/x-msvideo' },
    webm: { filename: 'source.webm', mime: 'video/webm' },
    wmv: { filename: 'source.wmv', mime: 'video/x-ms-wmv' },
    mkv: { filename: 'source.mkv', mime: 'video/x-matroska' },
    flv: { filename: 'source.flv', mime: 'video/x-flv' },
};

export type CreateUploadInput = {
    jobId: string;
    generation: number;
    expectedSourceBytes: string;
    profileConfigSha256: string;
    sourceType: MediaSourceType;
    // Stream: the tus `expiry` metadata, min(creation + 6 h, absolute deadline). Studio ignores it.
    uploadExpiresAtMs?: number;
};

export type CreateUploadResult = {
    assetId: string;
    playbackId: string;
    projectId: string;
    tusEndpoint: string;
};

export type TusState = {
    offsetBytes: string;
    lengthBytes: string;
};

export type ProviderAsset = {
    id: string;
    playbackId: string;
    policy: string;
    phase: string;
    updatedAtMs: number;
    sourceVideo?: { width: unknown; height: unknown } | null;
    // Studio-only fields; other adapters leave them undefined.
    projectId?: string;
    creatorBindingType?: string;
    creatorBindingValue?: string;
    createdByTokenName?: string;
    name?: string;
    sizeBytes?: number;
    downloadUrl?: string;
    sha256?: string | null;
    // Stream-only lifecycle fields read from the same video object; Studio leaves this undefined.
    stream?: {
        state: StreamVideoState;
        pctComplete: number;
        readyToStream: boolean;
        errorReasonCode: string;
        durationSeconds: number;
        route: WebhookRoute | null;
        createdAtMs: number;
    };
};

/** Cloudflare Stream `status.state` values (docs 2). */
export type StreamVideoState = 'pendingupload' | 'downloading' | 'queued' | 'inprogress' | 'ready' | 'error'
    | 'live-inprogress' | '';

export type ProviderPlaybackSource = {
    kind: 'hls' | 'mp4' | 'vtt' | 'unknown';
    url: string;
    width: unknown;
    height: unknown;
    bitrate: unknown;
};

export type ProviderPlayback = {
    kind: string;
    policy: string;
    sources: ProviderPlaybackSource[];
};

export type VerifyReadyAssetInput = {
    jobId: string;
    generation: number;
    expectedSourceBytes: string;
    profileConfigSha256: string;
    assetId: string;
    playbackId: string;
    projectId: string;
    expectedProjectId: string;
    apiTokenName?: string;
    checkpoint?: ProviderVerificationCheckpoint;
    // Byte-proof inputs for 'tus-offset' adapters; the Studio adapter ignores all three.
    tusEndpoint?: string;
    mode: VerificationMode;
    storedEvidence?: SourceBytesEvidence;
    // When the upload URL was created; 'tus-offset' adapters refuse a HEAD past the URL's life.
    uploadCreatedAtMs?: number;
};

export type VerificationMode = 'ready' | 'published';

/**
 * Canonical byte proof for adapters whose capability is 'tus-offset': taken from the resumable
 * upload at readiness (offset == length == expected bytes) and persisted on the job record.
 */
export type SourceBytesEvidence = {
    method: 'tus-offset';
    offsetBytes: string;
    lengthBytes: string;
    observedAtMs: number;
    // The ready_at_ms the publication was built with; published re-verification returns it as is.
    readyAtMs?: string;
};

export type ProviderVerificationCheckpoint = {
    bindingSha256: string;
    nextThumbnail: number;
    startedAtMs: number;
};

export type ProviderVerificationResult = VerifiedAsset | {
    pending: true;
    checkpoint: ProviderVerificationCheckpoint;
    // When to look again; absent means the core's immediate continuation (1 s).
    retryAfterMs?: number;
};

export type VerifiedAsset = {
    assetIdHash: string;
    playbackId: string;
    projectIdHash: string;
    verifiedSourceBytes: string;
    sourceFingerprint: string | null;
    readyAtMs: string;
    // Present only for 'tus-offset' adapters at readiness; the job record persists it (M2).
    sourceBytesEvidence?: SourceBytesEvidence;
    // Media duration in seconds when the adapter reports one (Stream storage accounting).
    durationSeconds?: number;
};

export type MediaProviderCapabilities = {
    storyboard: boolean;
    mp4: boolean;
    sourceHash: boolean;
    deleteWebhook: boolean;
    customLadder: boolean;
    sourceBytesProof: 'declared-size' | 'tus-offset';
    tokenPlacement: 'header' | 'path';
};

export type SignedPlayback = {
    token: string;
    hlsUrl: string;
    expiresAtSeconds: number;
    previewVttUrl?: string;
};

export type WebhookRoute = { jobId: string; generation: number };

/** What the ingress learned while authenticating a body (for example the signed time). */
export type WebhookParseContext = { timestampMs?: number };

/**
 * One provider webhook (or a synthesized reconcile observation) in provider-neutral form.
 * 'processing' is any non-terminal progress update; `phase` carries the provider-reported phase,
 * and a 'processing' event whose phase is 'ready' counts as readiness only while the job is still
 * uploading or processing. `providerEvent` is the provider's own event name, kept for the dedup record.
 */
export type NormalizedWebhookEvent = {
    provider: MediaProviderKind;
    event: 'ready' | 'processing' | 'failed' | 'deleted';
    providerEvent: string;
    assetId: string;
    route?: WebhookRoute;
    phase: string;
    timestampMs: number;
    failureCode?: string;
    // Stream: the reported state and pctComplete, so the job can tell progress from a stall.
    streamProgress?: { state: string; pctComplete: number };
    digest: string;
};

/** What a job record says the provider asset must be bound to. */
export type ProviderIdentityExpectation = {
    jobId: string;
    generation: number;
    assetId: string;
    playbackId?: string;
    projectId?: string;
    // Deployment-bound project; the Studio adapter fills it from its own configuration when omitted.
    expectedProjectId?: string;
    // null: this check does not bind the creating API token (the token may have rotated since).
    apiTokenName?: string | null;
};

export type HostAllowlist = {
    exact: readonly string[];
    suffixes: readonly string[];
};

export type MediaProfileDescription = {
    renditions: { width: number; height: number }[];
};

export type ProviderCover = {
    bytes: Uint8Array;
    contentType: 'image/jpeg' | 'image/png';
};

export interface MediaProvider {
    readonly id: MediaProviderKind;
    readonly capabilities: MediaProviderCapabilities;
    createUpload(input: CreateUploadInput): Promise<CreateUploadResult>;
    readTusOffset(uploadUrl: string): Promise<TusState>;
    readAsset(assetId: string): Promise<ProviderAsset>;
    readPlayback(playbackId: string): Promise<ProviderPlayback>;
    verifyReadyAsset(input: VerifyReadyAssetInput): Promise<ProviderVerificationResult>;
    deleteAsset(assetId: string): Promise<'deleted' | 'missing'>;
    signPlayback(playbackId: string, ttlSeconds: number, issuedAtSeconds?: number): Promise<SignedPlayback>;
    /** Authenticates an ingress webhook; null means authentic but not a media lifecycle event. */
    verifyWebhook(rawBody: Uint8Array, headers: Headers, nowMs: number): Promise<NormalizedWebhookEvent | null>;
    /** Normalizes a body the ingress already authenticated (job object and Queue paths). */
    parseWebhook(rawBody: Uint8Array, context?: WebhookParseContext): Promise<NormalizedWebhookEvent | null>;
    identityMatches(asset: ProviderAsset, expected: ProviderIdentityExpectation): boolean;
    hostAllowlist(): HostAllowlist;
    supportsProfile(profileConfigSha256: unknown): boolean;
    describeProfile(profileConfigSha256: unknown): MediaProfileDescription;
    readCover(playbackId: string): Promise<ProviderCover>;
}
