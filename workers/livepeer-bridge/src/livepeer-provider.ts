import type {
    CreateUploadInput,
    CreateUploadResult,
    MediaProvider,
    ProviderAsset,
    ProviderPlayback,
    ProviderPlaybackSource,
    TusState,
    VerifiedAsset,
    VerifyReadyAssetInput,
} from './media-provider';
import { MEDIA_SOURCE_FORMATS } from './media-provider';
import { dependencyFetch } from './dependency-fetch';
import { verifyLivepeerReadyAsset } from './provider-verification';

type JsonObject = Record<string, unknown>;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const HLS_SOURCE_TYPE = 'html5/application/vnd.apple.mpegurl';
const MP4_SOURCE_TYPE = 'html5/video/mp4';
const VTT_SOURCE_TYPE = 'text/vtt';
const API_BASE = 'https://livepeer.studio/api';
const TUS_VERSION = '1.0.0';

type LivepeerProviderOptions = {
    readyVerificationEnabled: boolean;
    sha256(value: string): Promise<string>;
    signPlaybackToken?: (playbackId: string) => Promise<string>;
};

export class LivepeerProvider implements MediaProvider {
    private readonly transport: LivepeerTransport;

    constructor(apiKey: string | undefined, private readonly options: LivepeerProviderOptions) {
        this.transport = new LivepeerTransport(apiKey);
    }

    createUpload(input: CreateUploadInput): Promise<CreateUploadResult> {
        return this.transport.createUpload(input);
    }

    readTusOffset(uploadUrl: string): Promise<TusState> {
        return this.transport.readTusOffset(uploadUrl);
    }

    readAsset(assetId: string): Promise<ProviderAsset> {
        return this.transport.readAsset(assetId);
    }

    readPlayback(playbackId: string): Promise<ProviderPlayback> {
        return this.transport.readPlayback(playbackId);
    }

    verifyReadyAsset(input: VerifyReadyAssetInput): Promise<VerifiedAsset> {
        if (!this.options.readyVerificationEnabled) throw new Error('runtime_not_configured');
        return verifyLivepeerReadyAsset(this, input, this.options);
    }
}

export class LivepeerTransport {
    constructor(private readonly apiKey?: string) {}

    async createUpload(input: CreateUploadInput): Promise<CreateUploadResult> {
        if (!validApiKey(this.apiKey)) throw new Error('runtime_not_configured');
        let response: Response;
        try {
            response = await dependencyFetch(
                'livepeer_api',
                'request_upload',
                `${API_BASE}/asset/request-upload`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: `youtick-${input.jobId}-g${input.generation}`,
                        playbackPolicy: { type: 'jwt' },
                        creatorId: { type: 'unverified', value: `${input.jobId}:${input.generation}` },
                        profiles: [{
                            name: '720p',
                            width: 1280,
                            height: 720,
                            bitrate: 3_000_000,
                            fps: 30,
                            fpsDen: 1,
                            gop: '2',
                            profile: 'H264Baseline',
                            encoder: 'H.264',
                        }],
                    }),
                    signal: AbortSignal.timeout(20_000),
                },
            );
        } catch {
            throw new Error('provider_unavailable');
        }
        if (response.status === 402 || response.status === 429) {
            throw new Error('provider_admission_closed');
        }
        if (response.status >= 500) throw new Error('provider_unavailable');
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            throw new Error('provider_create_ambiguous');
        }
        const value = requireObject(body, 'provider_create_ambiguous');
        const asset = requireObject(value.asset, 'provider_create_ambiguous');
        if (!response.ok
            || typeof value.tusEndpoint !== 'string'
            || !isLivepeerTusEndpoint(value.tusEndpoint)
            || typeof asset.id !== 'string'
            || typeof asset.playbackId !== 'string'
            || typeof asset.projectId !== 'string'
            || requireObject(asset.playbackPolicy, 'provider_create_ambiguous').type !== 'jwt') {
            throw new Error('provider_create_ambiguous');
        }
        const tusEndpoint = await this.createBoundTusResource(
            value.tusEndpoint,
            input.expectedSourceBytes,
            input.sourceType,
        );
        return {
            assetId: asset.id,
            playbackId: asset.playbackId,
            projectId: asset.projectId,
            tusEndpoint,
        };
    }

    async readAsset(assetId: string): Promise<ProviderAsset> {
        return normalizeLivepeerAsset(await this.readDocument('asset', assetId));
    }

    async readTusOffset(uploadUrl: string): Promise<TusState> {
        if (!isLivepeerTusEndpoint(uploadUrl)) throw new Error('provider_tus_state_invalid');
        let head: Response;
        try {
            head = await dependencyFetch('livepeer_tus', 'head_upload', uploadUrl, {
                method: 'HEAD',
                headers: { 'Tus-Resumable': TUS_VERSION },
                signal: AbortSignal.timeout(10_000),
            });
        } catch {
            throw new Error('provider_unavailable');
        }
        if (head.status === 429 || head.status >= 500) {
            throw new Error('provider_unavailable');
        }
        const lengthBytes = head.headers.get('Upload-Length') || '';
        const offsetBytes = head.headers.get('Upload-Offset') || '';
        if (![200, 204].includes(head.status)
            || !/^(0|[1-9][0-9]*)$/.test(lengthBytes)
            || !/^(0|[1-9][0-9]*)$/.test(offsetBytes)
            || BigInt(offsetBytes) > BigInt(lengthBytes)) {
            throw new Error('provider_tus_state_invalid');
        }
        return { offsetBytes, lengthBytes };
    }

    async readPlayback(playbackId: string): Promise<ProviderPlayback> {
        return normalizeLivepeerPlayback(await this.readDocument('playback', playbackId));
    }

    private async readDocument(kind: 'asset' | 'playback', id: string): Promise<JsonObject> {
        let response: Response;
        try {
            response = await dependencyFetch(
                'livepeer_api',
                kind === 'asset' ? 'asset_read' : 'playback_read',
                `${API_BASE}/${kind}/${encodeURIComponent(id)}`,
                {
                    headers: { Authorization: `Bearer ${this.apiKey}` },
                    signal: AbortSignal.timeout(5_000),
                },
            );
        } catch {
            throw new Error('provider_unavailable');
        }
        if (response.status === 404) {
            throw new Error(kind === 'asset' ? 'provider_asset_missing' : 'provider_playback_missing');
        }
        if (response.status === 429 || response.status >= 500 || !response.ok) {
            throw new Error('provider_unavailable');
        }
        try {
            return requireObject(await response.json(), 'provider_state_invalid');
        } catch {
            throw new Error('provider_state_invalid');
        }
    }

    private async createBoundTusResource(
        endpoint: string,
        expectedBytes: string,
        sourceType: CreateUploadInput['sourceType'],
    ): Promise<string> {
        const source = MEDIA_SOURCE_FORMATS[sourceType];
        let response: Response;
        try {
            response = await dependencyFetch('livepeer_tus', 'create_upload', endpoint, {
                method: 'POST',
                headers: {
                    'Tus-Resumable': TUS_VERSION,
                    'Upload-Length': expectedBytes,
                    'Upload-Metadata': `filename ${bytesToBase64(new TextEncoder().encode(source.filename))},filetype ${bytesToBase64(new TextEncoder().encode(source.mime))}`,
                },
                signal: AbortSignal.timeout(20_000),
            });
        } catch {
            throw new Error('provider_unavailable');
        }
        if (response.status === 429) throw new Error('provider_admission_closed');
        if (response.status >= 500) throw new Error('provider_unavailable');
        const location = response.headers.get('Location');
        if (response.status !== 201 || !location) throw new Error('provider_create_ambiguous');
        const uploadUrl = new URL(location, endpoint).toString();
        if (!isLivepeerTusEndpoint(uploadUrl)) throw new Error('provider_create_ambiguous');

        let tus: TusState;
        try {
            tus = await this.readTusOffset(uploadUrl);
        } catch (error) {
            if (error instanceof Error && error.message === 'provider_unavailable') throw error;
            throw new Error('provider_create_ambiguous');
        }
        if (tus.lengthBytes !== expectedBytes || tus.offsetBytes !== '0') {
            throw new Error('provider_create_ambiguous');
        }
        return uploadUrl;
    }
}

export function normalizeLivepeerAsset(value: unknown): ProviderAsset {
    const asset = requireObject(value, 'provider_state_invalid');
    const creator = requireObject(asset.creatorId, 'provider_identity_mismatch');
    const policy = requireObject(asset.playbackPolicy, 'provider_playback_mismatch');
    const status = requireObject(asset.status, 'provider_state_invalid');
    let sha256: string | null = null;
    if (asset.hash !== null && asset.hash !== undefined) {
        if (!Array.isArray(asset.hash)) throw new Error('provider_state_invalid');
        const hashes = asset.hash.map((entry) => requireObject(entry, 'provider_state_invalid'));
        const sourceHash = hashes.find((entry) => entry.algorithm === 'sha256');
        if (sourceHash) {
            if (typeof sourceHash.hash !== 'string' || !SHA256_PATTERN.test(sourceHash.hash)) {
                throw new Error('provider_state_invalid');
            }
            sha256 = sourceHash.hash;
        }
    }
    return {
        id: String(asset.id),
        playbackId: String(asset.playbackId),
        projectId: String(asset.projectId),
        creatorBindingType: String(creator.type),
        creatorBindingValue: String(creator.value),
        createdByTokenName: String(asset.createdByTokenName),
        name: String(asset.name),
        policy: String(policy.type),
        phase: String(status.phase),
        updatedAtMs: typeof status.updatedAt === 'number' ? status.updatedAt : Number.NaN,
        sizeBytes: typeof asset.size === 'number' ? asset.size : Number.NaN,
        downloadUrl: String(asset.downloadUrl),
        sha256,
    };
}

export function normalizeLivepeerPlayback(value: unknown): ProviderPlayback {
    const playback = requireObject(value, 'provider_state_invalid');
    const meta = requireObject(playback.meta, 'provider_playback_mismatch');
    const policy = requireObject(meta.playbackPolicy, 'provider_playback_mismatch');
    if (!Array.isArray(meta.source)) throw new Error('provider_playback_mismatch');
    const sources = meta.source.map((entry): ProviderPlaybackSource => {
        const source = requireObject(entry, 'provider_playback_mismatch');
        const kind = source.type === HLS_SOURCE_TYPE
            ? 'hls'
            : source.type === MP4_SOURCE_TYPE
                ? 'mp4'
                : source.type === VTT_SOURCE_TYPE ? 'vtt' : 'unknown';
        return {
            kind,
            url: String(source.url),
            width: source.width,
            height: source.height,
            bitrate: source.bitrate,
        };
    });
    return {
        kind: String(playback.type),
        policy: String(policy.type),
        sources,
    };
}

function requireObject(value: unknown, code: string): JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
    return value as JsonObject;
}

function isLivepeerTusEndpoint(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.port && url.hostname === 'origin.livepeer.com';
    } catch {
        return false;
    }
}

function validApiKey(value?: string): boolean {
    return typeof value === 'string' && value.length >= 16 && !/[\r\n]/.test(value);
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}
