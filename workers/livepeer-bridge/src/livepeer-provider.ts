import profiles from '../../../protocol/paid-media-livepeer-v1/profiles.json';
import type {
    CreateUploadInput,
    CreateUploadResult,
    HostAllowlist,
    MediaProfileDescription,
    MediaProvider,
    MediaProviderCapabilities,
    NormalizedWebhookEvent,
    ProviderAsset,
    ProviderCover,
    ProviderIdentityExpectation,
    ProviderPlayback,
    ProviderPlaybackSource,
    SignedPlayback,
    TusState,
    ProviderVerificationResult,
    VerifyReadyAssetInput,
    WebhookRoute,
} from './media-provider';
import { MEDIA_SOURCE_FORMATS } from './media-provider';
import { dependencyFetch } from './dependency-fetch';
import { fetchCoverImage } from './cover-image';
import {
    MAX_PROVIDER_PLAYBACK_OUTPUTS,
    firstVttThumbnailUrl,
    playbackUrlAllowed,
    verifyLivepeerReadyAsset,
} from './provider-verification';

type JsonObject = Record<string, unknown>;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const HLS_SOURCE_TYPE = 'html5/application/vnd.apple.mpegurl';
const MP4_SOURCE_TYPE = 'html5/video/mp4';
const VTT_SOURCE_TYPE = 'text/vtt';
const API_BASE = 'https://livepeer.studio/api';
const TUS_VERSION = '1.0.0';
/** Studio playback credential header; the only place the Bridge names it. */
export const LIVEPEER_JWT_HEADER = 'Livepeer-Jwt';
const LIVEPEER_SIGNATURE_HEADER = 'Livepeer-Signature';
const LIVEPEER_HOST_ALLOWLIST: HostAllowlist = {
    exact: ['playback.livepeer.studio', 'livepeercdn.com', 'livepeercdn.studio', 'asset-cdn.lp-playback.com'],
    suffixes: ['.lp-playback.studio'],
};
const LIVEPEER_LIFECYCLE_EVENTS = new Map<string, NormalizedWebhookEvent['event']>([
    ['asset.ready', 'ready'],
    ['asset.updated', 'processing'],
    ['asset.failed', 'failed'],
    ['asset.deleted', 'deleted'],
]);

export const LIVEPEER_CAPABILITIES: MediaProviderCapabilities = Object.freeze({
    storyboard: true,
    mp4: true,
    sourceHash: true,
    deleteWebhook: true,
    customLadder: true,
    sourceBytesProof: 'declared-size',
    tokenPlacement: 'header',
});

export type LivepeerJwtConfig = {
    privateKey?: string;
    issuer?: string;
    publicKey?: string;
};

export type LivepeerProviderOptions = {
    readyVerificationEnabled: boolean;
    sha256(value: string): Promise<string>;
    /** Deployment-bound Studio project the identity binding requires. */
    projectId?: string;
    jwt: LivepeerJwtConfig;
    /** Readiness probes sign with the playback key only when the full playback config is valid. */
    verificationTokensEnabled: boolean;
    verificationTokenTtlSeconds: number;
    webhookSecrets: readonly (string | undefined)[];
    webhookToleranceMs: number;
    isValidJobId(value: string): boolean;
};

export class LivepeerProvider implements MediaProvider {
    readonly id = 'studio' as const;
    readonly capabilities = LIVEPEER_CAPABILITIES;
    private readonly transport: LivepeerTransport;

    constructor(private readonly apiKey: string | undefined, private readonly options: LivepeerProviderOptions) {
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

    verifyReadyAsset(input: VerifyReadyAssetInput): Promise<ProviderVerificationResult> {
        if (!this.options.readyVerificationEnabled) throw new Error('runtime_not_configured');
        return verifyLivepeerReadyAsset(this, input, {
            sha256: this.options.sha256,
            signPlaybackToken: this.options.verificationTokensEnabled
                ? async (playbackId) => (await this.signPlayback(
                    playbackId,
                    this.options.verificationTokenTtlSeconds,
                )).token
                : undefined,
        });
    }

    deleteAsset(assetId: string): Promise<'deleted' | 'missing'> {
        return this.transport.deleteAsset(assetId);
    }

    async signPlayback(
        playbackId: string,
        ttlSeconds: number,
        issuedAtSeconds = Math.floor(Date.now() / 1_000),
    ): Promise<SignedPlayback> {
        return {
            token: await signLivepeerJwt(this.options.jwt, playbackId, issuedAtSeconds, ttlSeconds),
            hlsUrl: livepeerHlsUrl(playbackId),
            expiresAtSeconds: issuedAtSeconds + ttlSeconds,
        };
    }

    async verifyWebhook(rawBody: Uint8Array, headers: Headers, nowMs: number): Promise<NormalizedWebhookEvent | null> {
        const signatureHeader = headers.get(LIVEPEER_SIGNATURE_HEADER) || '';
        const secrets = this.options.webhookSecrets.filter((value): value is string => Boolean(value));
        for (const secret of secrets) {
            try {
                const webhook = await verifyLivepeerWebhook(
                    rawBody,
                    signatureHeader,
                    secret,
                    nowMs,
                    this.options.webhookToleranceMs,
                );
                return await this.normalizeWebhook(webhook, rawBody);
            } catch (error) {
                if (!(error instanceof Error) || error.message !== 'invalid_webhook_signature') throw error;
            }
        }
        throw new Error('invalid_webhook_signature');
    }

    parseWebhook(rawBody: Uint8Array): Promise<NormalizedWebhookEvent | null> {
        let value: unknown;
        try {
            value = JSON.parse(new TextDecoder().decode(rawBody));
        } catch {
            throw new Error('invalid_webhook');
        }
        return this.normalizeWebhook(parseLivepeerWebhook(requireObject(value, 'invalid_webhook')), rawBody);
    }

    identityMatches(asset: ProviderAsset, expected: ProviderIdentityExpectation): boolean {
        return livepeerIdentityMatches(asset, { expectedProjectId: this.options.projectId, ...expected });
    }

    hostAllowlist(): HostAllowlist {
        return LIVEPEER_HOST_ALLOWLIST;
    }

    supportsProfile(profileConfigSha256: unknown): boolean {
        return livepeerSupportsProfile(profileConfigSha256);
    }

    describeProfile(profileConfigSha256: unknown): MediaProfileDescription {
        return { renditions: livepeerProfiles(profileConfigSha256) };
    }

    async readCover(playbackId: string): Promise<ProviderCover> {
        const playback = await this.readPlayback(playbackId);
        if (playback.kind !== 'vod'
            || playback.policy !== 'jwt'
            || playback.sources.length > MAX_PROVIDER_PLAYBACK_OUTPUTS) {
            throw new Error('provider_playback_mismatch');
        }
        const vttUrls = [...new Set(playback.sources
            .filter((source) => source.kind === 'vtt')
            .map((source) => source.url))];
        if (vttUrls.length === 0 || vttUrls.some((url) => !playbackUrlAllowed(url, LIVEPEER_HOST_ALLOWLIST))) {
            throw new Error('provider_playback_mismatch');
        }
        const { token } = await this.signPlayback(playbackId, this.options.verificationTokenTtlSeconds);
        const thumbnailUrl = await firstVttThumbnailUrl(vttUrls, token);
        if (!thumbnailUrl) throw new Error('provider_playback_mismatch');
        return fetchCoverImage('livepeer_media', thumbnailUrl, { [LIVEPEER_JWT_HEADER]: token }, [
            token,
            this.apiKey!,
            ...vttUrls,
            thumbnailUrl,
        ]);
    }

    private async normalizeWebhook(webhook: LivepeerWebhook, rawBody: Uint8Array): Promise<NormalizedWebhookEvent | null> {
        const asset = livepeerWebhookAsset(webhook);
        const event = LIVEPEER_LIFECYCLE_EVENTS.get(webhook.event);
        if (!asset || !event) return null;
        const route = livepeerWebhookRoute(webhook, this.options.isValidJobId);
        return {
            provider: this.id,
            event,
            providerEvent: webhook.event,
            assetId: typeof asset.id === 'string' ? asset.id : '',
            ...(route ? { route } : {}),
            phase: livepeerProviderPhase(asset),
            timestampMs: webhook.timestamp,
            digest: await livepeerWebhookDigest(webhook, asset, await sha256BytesHex(rawBody), this.options.sha256),
        };
    }
}

export class LivepeerTransport {
    constructor(private readonly apiKey?: string) {}

    async createUpload(input: CreateUploadInput): Promise<CreateUploadResult> {
        if (!validApiKey(this.apiKey)) throw new Error('runtime_not_configured');
        const profiles = livepeerProfiles(input.profileConfigSha256);
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
                        profiles,
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

    async deleteAsset(assetId: string): Promise<'deleted' | 'missing'> {
        if (!validApiKey(this.apiKey)) throw new Error('runtime_not_configured');
        let response: Response;
        try {
            response = await dependencyFetch(
                'livepeer_api',
                'asset_delete',
                `${API_BASE}/asset/${encodeURIComponent(assetId)}`,
                {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${this.apiKey}` },
                    signal: AbortSignal.timeout(10_000),
                },
            );
        } catch {
            throw new Error('provider_delete_ambiguous');
        }
        if (response.status === 204) return 'deleted';
        if (response.status === 404) return 'missing';
        throw new Error('provider_delete_ambiguous');
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
                `${API_BASE}/${kind}/${encodeURIComponent(id)}${kind === 'asset' ? '?details=true' : ''}`,
                {
                    headers: { Authorization: `Bearer ${this.apiKey}` },
                    redirect: 'manual',
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
    const videoSpec = asset.videoSpec && typeof asset.videoSpec === 'object'
        ? asset.videoSpec as JsonObject : null;
    const videoTracks = Array.isArray(videoSpec?.tracks)
        ? videoSpec.tracks.filter((track): track is JsonObject => (
            track && typeof track === 'object' && track.type === 'video'
        )) : [];
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
        sourceVideo: asset.videoSpec === undefined ? undefined : videoTracks.length === 1
            ? { width: videoTracks[0].width, height: videoTracks[0].height } : null,
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

// Studio profile catalog: the frozen protocol profiles.json, read only by this adapter.
export function livepeerProfiles(hash: unknown) {
    const profile = Object.values(profiles).find((entry) => entry.hash === hash);
    if (!profile) throw new Error('unsupported_profile');
    return profile.profiles;
}

export function livepeerSupportsProfile(hash: unknown): hash is string {
    return Object.values(profiles).some((entry) => entry.hash === hash);
}

/** Studio identity binding: project, creating token, creatorId routing value and asset name. */
export function livepeerIdentityMatches(asset: ProviderAsset, expected: ProviderIdentityExpectation): boolean {
    return asset.id === expected.assetId
        && asset.playbackId === expected.playbackId
        && asset.projectId === expected.projectId
        && asset.projectId === expected.expectedProjectId
        && (expected.apiTokenName === null || asset.createdByTokenName === expected.apiTokenName)
        && asset.creatorBindingType === 'unverified'
        && asset.creatorBindingValue === `${expected.jobId}:${expected.generation}`
        && asset.name === `youtick-${expected.jobId}-g${expected.generation}`;
}

export function livepeerHostAllowlist(): HostAllowlist {
    return LIVEPEER_HOST_ALLOWLIST;
}

export function livepeerHlsUrl(playbackId: string): string {
    return `https://playback.livepeer.studio/asset/hls/${playbackId}/index.m3u8`;
}

export async function signLivepeerJwt(
    config: LivepeerJwtConfig,
    playbackId: string,
    issuedAtSeconds: number,
    ttlSeconds: number,
): Promise<string> {
    let privateKey: CryptoKey;
    try {
        privateKey = await crypto.subtle.importKey(
            'pkcs8',
            decodePkcs8(config.privateKey!),
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['sign'],
        );
    } catch {
        throw new Error('runtime_not_configured');
    }
    const header = base64UrlJson({ alg: 'ES256', typ: 'JWT' });
    const payload = base64UrlJson({
        action: 'pull',
        iss: config.issuer,
        pub: config.publicKey,
        sub: playbackId,
        video: 'none',
        exp: issuedAtSeconds + ttlSeconds,
        iat: issuedAtSeconds,
    });
    const signingInput = `${header}.${payload}`;
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
}

function decodePkcs8(value: string): Uint8Array {
    const decoded = value.startsWith('-----BEGIN PRIVATE KEY-----') ? value : atob(value);
    const body = decoded.replace(/(?:-----(?:BEGIN|END) PRIVATE KEY-----|\s)/g, '');
    return base64Decode(body);
}

export type LivepeerWebhook = {
    event: string;
    timestamp: number;
    payload: JsonObject;
};

export function parseLivepeerWebhook(value: JsonObject): LivepeerWebhook {
    if (typeof value.event !== 'string'
        || value.event.length < 1
        || value.event.length > 64
        || !Number.isSafeInteger(value.timestamp)
        || !value.payload
        || typeof value.payload !== 'object'
        || Array.isArray(value.payload)) {
        throw new Error('invalid_webhook');
    }
    return {
        event: value.event,
        timestamp: value.timestamp as number,
        payload: value.payload as JsonObject,
    };
}

/** Studio `t=<ms>,v1=<hex>` HMAC-SHA256 over the exact raw body, bound to the body timestamp. */
export async function verifyLivepeerWebhook(
    rawBody: Uint8Array,
    signatureHeader: string,
    secret: string,
    nowMs: number,
    toleranceMs: number,
): Promise<LivepeerWebhook> {
    const parts = signatureHeader.split(',').map((part) => part.trim());
    const timestampText = parts.find((part) => part.startsWith('t='))?.slice(2) || '';
    const signatures = parts
        .filter((part) => part.startsWith('v1='))
        .map((part) => part.slice(3))
        .filter((value) => /^[0-9a-f]{64}$/.test(value));
    if (!/^[1-9][0-9]{9,15}$/.test(timestampText) || signatures.length === 0) {
        throw new Error('invalid_webhook_signature');
    }
    const timestamp = Number(timestampText);
    if (!Number.isSafeInteger(timestamp) || Math.abs(nowMs - timestamp) > toleranceMs) {
        throw new Error('webhook_expired');
    }
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, rawBody));
    const valid = signatures.some((signature) => constantTimeEqual(expected, hexDecode(signature)));
    if (!valid) throw new Error('invalid_webhook_signature');

    let parsed: unknown;
    try {
        parsed = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
        throw new Error('invalid_webhook');
    }
    const webhook = parseLivepeerWebhook(requireObject(parsed, 'invalid_webhook'));
    if (webhook.timestamp !== timestamp) throw new Error('invalid_webhook_signature');
    return webhook;
}

export function livepeerWebhookAsset(webhook: LivepeerWebhook): JsonObject | null {
    const asset = webhook.payload.asset;
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) return null;
    const snapshot = (asset as JsonObject).snapshot;
    return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
        ? snapshot as JsonObject
        : asset as JsonObject;
}

/** Routes by the unverified creatorId `<jobId>:<generation>` the Bridge set at request-upload. */
export function livepeerWebhookRoute(
    webhook: LivepeerWebhook,
    isValidJobId: (value: string) => boolean,
): WebhookRoute | null {
    const asset = livepeerWebhookAsset(webhook);
    if (!asset || !['asset.ready', 'asset.updated', 'asset.failed', 'asset.deleted'].includes(webhook.event)) {
        return null;
    }
    const creator = asset.creatorId;
    if (!creator || typeof creator !== 'object' || Array.isArray(creator)) return null;
    const value = (creator as JsonObject).value;
    if ((creator as JsonObject).type !== 'unverified' || typeof value !== 'string') return null;
    const separator = value.lastIndexOf(':');
    if (separator < 1) return null;
    const jobId = value.slice(0, separator);
    const generation = Number(value.slice(separator + 1));
    return isValidJobId(jobId) && Number.isSafeInteger(generation) && generation > 0
        ? { jobId, generation }
        : null;
}

/** Dedup key input; must stay sha256(timestamp, rawBodyHash, asset.id, status.phase). */
export async function livepeerWebhookDigest(
    webhook: LivepeerWebhook,
    asset: JsonObject,
    rawBodyHash: string,
    sha256: (value: string) => Promise<string>,
): Promise<string> {
    return sha256([
        String(webhook.timestamp),
        rawBodyHash,
        String(asset.id || ''),
        livepeerProviderPhase(asset),
    ].join('\n'));
}

export function livepeerProviderPhase(asset: JsonObject): string {
    const status = asset.status;
    return status && typeof status === 'object' && !Array.isArray(status)
        ? String((status as JsonObject).phase || '')
        : '';
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    return difference === 0;
}

function hexDecode(value: string): Uint8Array {
    if (value.length % 2 !== 0) return new Uint8Array();
    return Uint8Array.from(value.match(/.{2}/g) || [], (byte) => Number.parseInt(byte, 16));
}

async function sha256BytesHex(value: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', value);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64Decode(value: string): Uint8Array {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlJson(value: JsonObject): string {
    return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(value: Uint8Array): string {
    return bytesToBase64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
