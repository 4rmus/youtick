// Provider-neutral seam between the Bridge control plane and a media provider adapter.
// Adapters own every provider host, header, URL shape, signature scheme and profile catalog;
// index.ts and the neutral verification core only see the types below.

export type MediaProviderKind = 'studio';

export const MEDIA_PROVIDER_KINDS: readonly MediaProviderKind[] = ['studio'];

/** Internal header the ingress adds when it forwards a verified webhook body to a job object. */
export const MEDIA_PROVIDER_HEADER = 'X-YouTick-Provider';

export function mediaProviderKind(value: unknown): MediaProviderKind | null {
    return MEDIA_PROVIDER_KINDS.find((kind) => kind === value) ?? null;
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
};

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
    // Optional until M1-G2 wires every call site; the Studio adapter ignores all three.
    tusEndpoint?: string;
    mode?: VerificationMode;
    storedEvidence?: SourceBytesEvidence;
};

export type VerificationMode = 'ready' | 'published';

/** Byte proof persisted on the job record by adapters whose capability is 'tus-offset'. */
export type SourceBytesEvidence = {
    method: 'tus-offset';
    offsetBytes: string;
    lengthBytes: string;
    observedAtMs: number;
};

export type ProviderVerificationCheckpoint = {
    bindingSha256: string;
    nextThumbnail: number;
    startedAtMs: number;
};

export type ProviderVerificationResult = VerifiedAsset | {
    pending: true;
    checkpoint: ProviderVerificationCheckpoint;
};

export type VerifiedAsset = {
    assetIdHash: string;
    playbackId: string;
    projectIdHash: string;
    verifiedSourceBytes: string;
    sourceFingerprint: string | null;
    readyAtMs: string;
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
    parseWebhook(rawBody: Uint8Array): Promise<NormalizedWebhookEvent | null>;
    identityMatches(asset: ProviderAsset, expected: ProviderIdentityExpectation): boolean;
    hostAllowlist(): HostAllowlist;
    supportsProfile(profileConfigSha256: unknown): boolean;
    describeProfile(profileConfigSha256: unknown): MediaProfileDescription;
    readCover(playbackId: string): Promise<ProviderCover>;
}
