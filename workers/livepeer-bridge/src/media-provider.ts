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
    projectId: string;
    creatorBindingType: string;
    creatorBindingValue: string;
    createdByTokenName: string;
    name: string;
    policy: string;
    phase: string;
    updatedAtMs: number;
    sizeBytes: number;
    downloadUrl: string;
    sha256: string | null;
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
    assetId: string;
    playbackId: string;
    projectId: string;
    expectedProjectId: string;
    apiTokenName: string;
};

export type VerifiedAsset = {
    assetIdHash: string;
    playbackId: string;
    projectIdHash: string;
    verifiedSourceBytes: string;
    sourceFingerprint: string | null;
    readyAtMs: string;
};

export interface MediaProvider {
    createUpload(input: CreateUploadInput): Promise<CreateUploadResult>;
    readTusOffset(uploadUrl: string): Promise<TusState>;
    readAsset(assetId: string): Promise<ProviderAsset>;
    readPlayback(playbackId: string): Promise<ProviderPlayback>;
    verifyReadyAsset(input: VerifyReadyAssetInput): Promise<VerifiedAsset>;
    deleteAsset(assetId: string): Promise<'deleted' | 'missing'>;
}
