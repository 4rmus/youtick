// Cloudflare Stream adapter behind the MediaProvider seam: tus direct creator upload with the
// byte proof read from the upload's HEAD ('tus-offset'), one GET per video read, the
// `Webhook-Signature` HMAC, self-signed RS256 path tokens, and the Stream ladder descriptor.
// Every value an M0 probe has not recorded is a constructor option or a fixture-driven branch.
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
    ProviderVerificationResult,
    SignedPlayback,
    StreamVideoState,
    TusState,
    VerifyReadyAssetInput,
    WebhookParseContext,
    WebhookRoute,
} from './media-provider';
import {
    MEDIA_SOURCE_FORMATS,
    STREAM_PROFILE_MAX_DURATION_SECONDS,
    streamDescribeProfile,
    streamSupportsProfile,
} from './media-provider';
import { dependencyFetch } from './dependency-fetch';
import { fetchCoverImage } from './cover-image';
import { verifyStreamReadyAsset } from './cloudflare-stream-verification';

type JsonObject = Record<string, unknown>;

const API_ORIGIN = 'https://api.cloudflare.com';
const TUS_HOST = 'upload.cloudflarestream.com';
const TUS_VERSION = '1.0.0';
const STREAM_UID_PATTERN = /^[0-9a-f]{32}$/;
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/;
const CUSTOMER_CODE_PATTERN = /^[a-z0-9]{1,64}$/;
const WEBHOOK_SIGNATURE_HEADER = 'Webhook-Signature';
const FAILURE_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/;
/** Stream keeps an unfinished tus upload URL for 24 hours after creation (spike 9.1). */
export const STREAM_TUS_URL_LIFETIME_MS = 24 * 60 * 60 * 1000;
/** Stream accepts token lifetimes up to 24 hours (docs 4). */
export const STREAM_MAX_TOKEN_TTL_SECONDS = 24 * 60 * 60;
export const STREAM_COVER_TOKEN_TTL_SECONDS = 120;
/**
 * tus `expiry` for a direct creator upload: creation + 6 h, Stream's documented maximum, never the
 * admission lease (heartbeats renew our lease, not Stream's expiry). M0-P3 (U25) may show that
 * `expiry` does not shorten the reservation at all; the field is then dropped. Abandoned uploads
 * are reclaimed by the lease lapse in the job alarm (UPLOAD_EXPIRED + DELETE).
 */
export const STREAM_UPLOAD_EXPIRY_MS = 6 * 60 * 60 * 1000;

export const STREAM_CAPABILITIES: MediaProviderCapabilities = Object.freeze({
    storyboard: false,
    mp4: false,
    sourceHash: false,
    deleteWebhook: false,
    customLadder: false,
    sourceBytesProof: 'tus-offset',
    tokenPlacement: 'path',
});

export type CloudflareStreamOptions = {
    accountId?: string;
    apiToken?: string;
    customerCode?: string;
    signingKeyId?: string;
    /** Private key: a PEM (PKCS8, or PKCS1 as `POST /stream/keys` may return it), a JWK JSON, or base64 of either. */
    signingKey?: string;
    webhookSecrets: readonly (string | undefined)[];
    webhookToleranceMs: number;
    maxDurationSeconds?: number;
    /** Pending window for a ready webhook that precedes the full ladder. */
    readyPendingWindowMs: number;
    verificationTokenTtlSeconds: number;
    sha256(value: string): Promise<string>;
    isValidJobId(value: string): boolean;
    readyVerificationEnabled: boolean;
};

/** One `GET /stream/{uid}` result in the fields the Bridge reads. `size` is never a byte proof. */
export type StreamVideo = {
    uid: string;
    meta: JsonObject;
    route: WebhookRoute | null;
    requireSignedURLs: boolean;
    state: StreamVideoState;
    pctComplete: number;
    errorReasonCode: string;
    readyToStream: boolean;
    durationSeconds: number;
    input: { width: number; height: number } | null;
    untrustedSizeBytes: number | null;
    maxDurationSeconds: number | null;
    hlsUrl: string;
    dashUrl: string;
    thumbnailUrl: string;
    readyAtMs: number;
    modifiedAtMs: number;
    createdAtMs: number;
};

export type StreamStorageUsage = {
    totalStorageMinutes: number;
    totalStorageMinutesLimit: number | null;
};

export class CloudflareStreamProvider implements MediaProvider {
    readonly id = 'stream' as const;
    readonly capabilities = STREAM_CAPABILITIES;

    constructor(readonly options: CloudflareStreamOptions) {}

    async createUpload(input: CreateUploadInput): Promise<CreateUploadResult> {
        const { accountId } = this.requireApi();
        const maxDurationSeconds = this.options.maxDurationSeconds;
        if (!Number.isSafeInteger(maxDurationSeconds) || maxDurationSeconds! < 1
            || maxDurationSeconds! > STREAM_PROFILE_MAX_DURATION_SECONDS
            || !streamSupportsProfile(input.profileConfigSha256)) {
            throw new Error('runtime_not_configured');
        }
        let response: Response;
        try {
            response = await dependencyFetch('stream_api', 'create_upload', `${this.apiBase()}?direct_user=true`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.options.apiToken}`,
                    'Tus-Resumable': TUS_VERSION,
                    'Upload-Length': input.expectedSourceBytes,
                    'Upload-Metadata': streamUploadMetadata(input, maxDurationSeconds!),
                },
                redirect: 'manual',
                signal: AbortSignal.timeout(20_000),
            });
        } catch {
            throw new Error('provider_unavailable');
        }
        // Docs: 413 at upload-URL creation when storage is exhausted. TODO(M0-P3): pin the recorded
        // error code; a 429 stays transient (provider_unavailable), never an admission latch.
        if (response.status === 413) throw new Error('provider_admission_closed');
        if (response.status === 429 || response.status >= 500) throw new Error('provider_unavailable');
        const uid = response.headers.get('stream-media-id') || '';
        const location = response.headers.get('Location') || '';
        if (response.status !== 201 || !STREAM_UID_PATTERN.test(uid) || !isStreamTusEndpoint(location)) {
            // A 201 with a known UID but an unusable Location still booked a reservation.
            if (response.status === 201 && STREAM_UID_PATTERN.test(uid)) await this.deleteAsset(uid).catch(() => undefined);
            throw new Error('provider_create_ambiguous');
        }
        try {
            const tus = await this.readTusOffset(location);
            if (tus.lengthBytes !== input.expectedSourceBytes || tus.offsetBytes !== '0') {
                throw new Error('provider_create_ambiguous');
            }
            // The documented `maxDurationSeconds` spelling must come back as the booked cap (U1).
            const video = await this.readVideo(uid);
            if (video.uid !== uid
                || !video.requireSignedURLs
                || video.maxDurationSeconds !== maxDurationSeconds
                || !routeMatches(video.route, input)) {
                throw new Error('provider_create_ambiguous');
            }
        } catch (error) {
            // A booked reservation must not outlive a refused or unverifiable creation.
            await this.deleteAsset(uid).catch(() => undefined);
            const code = error instanceof Error ? error.message : '';
            throw new Error(code === 'provider_unavailable' ? 'provider_unavailable' : 'provider_create_ambiguous');
        }
        return { assetId: uid, playbackId: uid, projectId: accountId, tusEndpoint: location };
    }

    async readTusOffset(uploadUrl: string): Promise<TusState> {
        if (!isStreamTusEndpoint(uploadUrl)) throw new Error('provider_tus_state_invalid');
        let head: Response;
        try {
            head = await dependencyFetch('stream_tus', 'head_upload', uploadUrl, {
                method: 'HEAD',
                headers: { 'Tus-Resumable': TUS_VERSION },
                redirect: 'manual',
                signal: AbortSignal.timeout(10_000),
            });
        } catch {
            throw new Error('provider_unavailable');
        }
        if (head.status === 404 || head.status === 410) throw new Error('provider_tus_url_expired');
        if (head.status === 429 || head.status >= 500) throw new Error('provider_unavailable');
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

    async readVideo(uid: string): Promise<StreamVideo> {
        this.requireApi();
        if (!STREAM_UID_PATTERN.test(uid)) throw new Error('provider_asset_missing');
        let response: Response;
        try {
            response = await dependencyFetch('stream_api', 'video_read', `${this.apiBase()}/${uid}`, {
                headers: { Authorization: `Bearer ${this.options.apiToken}` },
                redirect: 'manual',
                signal: AbortSignal.timeout(5_000),
            });
        } catch {
            throw new Error('provider_unavailable');
        }
        if (response.status === 404) throw new Error('provider_asset_missing');
        if (response.status === 429 || response.status >= 500 || !response.ok) {
            throw new Error('provider_unavailable');
        }
        let body: JsonObject;
        try {
            body = requireObject(await response.json(), 'provider_state_invalid');
        } catch {
            throw new Error('provider_state_invalid');
        }
        return normalizeStreamVideo(body.result, this.options.isValidJobId);
    }

    async readAsset(assetId: string): Promise<ProviderAsset> {
        return streamProviderAsset(await this.readVideo(assetId), this.options.accountId!);
    }

    async readPlayback(playbackId: string): Promise<ProviderPlayback> {
        return streamProviderPlayback(await this.readVideo(playbackId));
    }

    async readStorageUsage(): Promise<StreamStorageUsage> {
        this.requireApi();
        let response: Response;
        try {
            response = await dependencyFetch('stream_api', 'storage_usage_read', `${this.apiBase()}/storage-usage`, {
                headers: { Authorization: `Bearer ${this.options.apiToken}` },
                redirect: 'manual',
                signal: AbortSignal.timeout(5_000),
            });
        } catch {
            throw new Error('provider_unavailable');
        }
        if (!response.ok) throw new Error('provider_unavailable');
        try {
            const result = requireObject(requireObject(await response.json(), 'x').result, 'x');
            const used = Number(result.totalStorageMinutes);
            const limit = result.totalStorageMinutesLimit === undefined || result.totalStorageMinutesLimit === null
                ? null : Number(result.totalStorageMinutesLimit);
            if (!Number.isFinite(used) || used < 0 || (limit !== null && (!Number.isFinite(limit) || limit < 0))) {
                throw new Error('x');
            }
            return { totalStorageMinutes: used, totalStorageMinutesLimit: limit };
        } catch {
            throw new Error('provider_state_invalid');
        }
    }

    verifyReadyAsset(input: VerifyReadyAssetInput): Promise<ProviderVerificationResult> {
        if (!this.options.readyVerificationEnabled) throw new Error('runtime_not_configured');
        return verifyStreamReadyAsset(this, input);
    }

    /** DELETE /stream/{uid}: 200 deleted, 404 missing; one retry on 429/5xx/network, then ambiguous. */
    async deleteAsset(assetId: string): Promise<'deleted' | 'missing'> {
        this.requireApi();
        if (!STREAM_UID_PATTERN.test(assetId)) throw new Error('provider_delete_ambiguous');
        for (let attempt = 0; attempt < 2; attempt += 1) {
            let response: Response;
            try {
                response = await dependencyFetch('stream_api', 'video_delete', `${this.apiBase()}/${assetId}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${this.options.apiToken}` },
                    redirect: 'manual',
                    signal: AbortSignal.timeout(10_000),
                });
            } catch {
                continue;
            }
            await response.body?.cancel().catch(() => undefined);
            if (response.status === 200 || response.status === 204) return 'deleted';
            if (response.status === 404) return 'missing';
            if (response.status !== 429 && response.status < 500) break;
        }
        throw new Error('provider_delete_ambiguous');
    }

    async signPlayback(
        playbackId: string,
        ttlSeconds: number,
        issuedAtSeconds = Math.floor(Date.now() / 1_000),
    ): Promise<SignedPlayback> {
        if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > STREAM_MAX_TOKEN_TTL_SECONDS) {
            throw new Error('runtime_not_configured');
        }
        const token = await this.signToken(playbackId, issuedAtSeconds + ttlSeconds, issuedAtSeconds - 60);
        return {
            token,
            hlsUrl: this.deliveryUrl(token, 'manifest/video.m3u8'),
            expiresAtSeconds: issuedAtSeconds + ttlSeconds,
        };
    }

    /** RS256 JWT with exactly {sub, kid, exp, nbf}; never `downloadable` or access rules. */
    async signToken(subject: string, expiresAtSeconds: number, notBeforeSeconds: number): Promise<string> {
        const kid = this.options.signingKeyId;
        if (!kid || !STREAM_UID_PATTERN.test(subject)) throw new Error('runtime_not_configured');
        const key = await importStreamSigningKey(this.options.signingKey);
        const signingInput = `${base64UrlJson({ alg: 'RS256', kid })}.${base64UrlJson({
            sub: subject, kid, exp: expiresAtSeconds, nbf: notBeforeSeconds,
        })}`;
        const signature = await crypto.subtle.sign(
            { name: 'RSASSA-PKCS1-v1_5' },
            key,
            new TextEncoder().encode(signingInput),
        );
        return `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
    }

    /** `https://customer-<code>.cloudflarestream.com/<credential>/<path>`; credential is a UID or a token. */
    deliveryUrl(credential: string, path: string): string {
        const code = this.options.customerCode || '';
        if (!CUSTOMER_CODE_PATTERN.test(code)) throw new Error('runtime_not_configured');
        return `https://${streamCustomerHost(code)}/${credential}/${path}`;
    }

    async verifyWebhook(rawBody: Uint8Array, headers: Headers, nowMs: number): Promise<NormalizedWebhookEvent | null> {
        const header = headers.get(WEBHOOK_SIGNATURE_HEADER) || '';
        const parts = header.split(',').map((part) => part.trim());
        const timeText = parts.find((part) => part.startsWith('time='))?.slice(5) || '';
        const signatures = parts
            .filter((part) => part.startsWith('sig1='))
            .map((part) => part.slice(5))
            .filter((value) => /^[0-9a-f]{64}$/.test(value));
        if (!/^[1-9][0-9]{8,11}$/.test(timeText) || signatures.length === 0) {
            throw new Error('invalid_webhook_signature');
        }
        const timeSeconds = Number(timeText);
        if (Math.abs(nowMs - timeSeconds * 1_000) > this.options.webhookToleranceMs) {
            throw new Error('webhook_expired');
        }
        const signed = concatBytes(new TextEncoder().encode(`${timeText}.`), rawBody);
        const secrets = this.options.webhookSecrets.filter((value): value is string => Boolean(value));
        let authentic = false;
        for (const secret of secrets) {
            const key = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(secret),
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign'],
            );
            const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, signed));
            if (signatures.some((signature) => constantTimeEqual(expected, hexDecode(signature)))) {
                authentic = true;
                break;
            }
        }
        if (!authentic) throw new Error('invalid_webhook_signature');
        // Authentic but unparsable is "not a lifecycle event" (null), never a signature failure.
        try {
            return await this.parseWebhook(rawBody, { timestampMs: timeSeconds * 1_000 });
        } catch (error) {
            if (error instanceof Error && error.message === 'invalid_webhook') return null;
            throw error;
        }
    }

    async parseWebhook(rawBody: Uint8Array, context?: WebhookParseContext): Promise<NormalizedWebhookEvent | null> {
        let value: unknown;
        try {
            value = JSON.parse(new TextDecoder().decode(rawBody));
        } catch {
            throw new Error('invalid_webhook');
        }
        let video: StreamVideo;
        try {
            video = normalizeStreamVideo(value, this.options.isValidJobId);
        } catch {
            throw new Error('invalid_webhook');
        }
        const event = streamWebhookEvent(video);
        if (!event) return null;
        const timestampMs = context?.timestampMs ?? (Number.isSafeInteger(video.modifiedAtMs) ? video.modifiedAtMs : 0);
        return {
            provider: this.id,
            event: event.event,
            providerEvent: `stream.${video.state}`,
            assetId: video.uid,
            ...(video.route ? { route: video.route } : {}),
            phase: event.phase,
            timestampMs,
            ...(event.failureCode ? { failureCode: event.failureCode } : {}),
            streamProgress: { state: video.state, pctComplete: Number.isFinite(video.pctComplete) ? video.pctComplete : 0 },
            digest: await this.options.sha256([
                'youtick.stream-webhook.v1',
                String(context?.timestampMs ?? ''),
                await sha256BytesHex(rawBody),
                video.uid,
                video.state,
            ].join('\n')),
        };
    }

    identityMatches(asset: ProviderAsset, expected: ProviderIdentityExpectation): boolean {
        const projectId = expected.expectedProjectId ?? this.options.accountId;
        return STREAM_UID_PATTERN.test(expected.assetId)
            && asset.id === expected.assetId
            && asset.playbackId === expected.assetId
            && (expected.playbackId === undefined || expected.playbackId === expected.assetId)
            && asset.projectId === expected.projectId
            && expected.projectId === projectId
            && asset.policy === 'jwt'
            && routeMatches(asset.stream?.route ?? null, expected);
    }

    // Only the account's customer host: videodelivery.net resets the connection (dashboard evidence 2026-10-22).
    hostAllowlist(): HostAllowlist {
        const code = this.options.customerCode || '';
        return { exact: CUSTOMER_CODE_PATTERN.test(code) ? [streamCustomerHost(code)] : [], suffixes: [] };
    }

    supportsProfile(profileConfigSha256: unknown): boolean {
        return streamSupportsProfile(profileConfigSha256);
    }

    describeProfile(profileConfigSha256: unknown): MediaProfileDescription {
        return streamDescribeProfile(profileConfigSha256);
    }

    async readCover(playbackId: string): Promise<ProviderCover> {
        const { token } = await this.signPlayback(playbackId, STREAM_COVER_TOKEN_TTL_SECONDS);
        // The token is the credential in the path: the fetch carries no header at all.
        return fetchCoverImage('stream_media', this.deliveryUrl(token, 'thumbnails/thumbnail.jpg'), {}, [
            token,
            this.options.apiToken || '',
            this.options.signingKey || '',
        ].filter(Boolean));
    }

    private apiBase(): string {
        return `${API_ORIGIN}/client/v4/accounts/${this.options.accountId}/stream`;
    }

    private requireApi(): { accountId: string } {
        const { accountId, apiToken } = this.options;
        if (!accountId || !ACCOUNT_ID_PATTERN.test(accountId)
            || typeof apiToken !== 'string' || apiToken.length < 16 || /[\r\n]/.test(apiToken)) {
            throw new Error('runtime_not_configured');
        }
        return { accountId };
    }
}

export function streamCustomerHost(customerCode: string): string {
    return `customer-${customerCode}.cloudflarestream.com`;
}

export function isStreamTusEndpoint(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.port && !url.username && !url.password
            && url.hostname === TUS_HOST && url.pathname.length > 1;
    } catch {
        return false;
    }
}

/**
 * tus Upload-Metadata: comma-separated `key base64(value)` pairs, `requiresignedurls` bare.
 * Routing goes out twice (plain `jobid`/`generation` and a JSON `meta` value) because which keys
 * land in the video's `meta` is unrecorded (M0-P4); streamWebhookRoute accepts whichever appears.
 */
export function streamUploadMetadata(input: CreateUploadInput, maxDurationSeconds: number): string {
    const source = MEDIA_SOURCE_FORMATS[input.sourceType];
    const entries: [string, string | null][] = [
        ['name', `youtick-${input.jobId}-g${input.generation}`],
        ['requiresignedurls', null],
        ['maxDurationSeconds', String(maxDurationSeconds)],
        ...(input.uploadExpiresAtMs === undefined
            ? [] : [['expiry', new Date(input.uploadExpiresAtMs).toISOString()] as [string, string]]),
        ['filename', source.filename],
        ['filetype', source.mime],
        ['jobid', input.jobId],
        ['generation', String(input.generation)],
        ['meta', JSON.stringify({ jobId: input.jobId, generation: input.generation })],
    ];
    return entries
        .map(([key, value]) => value === null ? key : `${key} ${bytesToBase64(new TextEncoder().encode(value))}`)
        .join(',');
}

export function normalizeStreamVideo(value: unknown, isValidJobId: (value: string) => boolean): StreamVideo {
    const video = requireObject(value, 'provider_state_invalid');
    if (typeof video.uid !== 'string' || !STREAM_UID_PATTERN.test(video.uid)) throw new Error('provider_state_invalid');
    const status = requireObject(video.status, 'provider_state_invalid');
    const meta = video.meta && typeof video.meta === 'object' && !Array.isArray(video.meta)
        ? video.meta as JsonObject : {};
    const input = video.input && typeof video.input === 'object' && !Array.isArray(video.input)
        ? video.input as JsonObject : {};
    const playback = video.playback && typeof video.playback === 'object' && !Array.isArray(video.playback)
        ? video.playback as JsonObject : {};
    const width = Number(input.width);
    const height = Number(input.height);
    const state = typeof status.state === 'string' ? status.state : '';
    const errorReasonCode = typeof status.errorReasonCode === 'string' ? status.errorReasonCode : '';
    const readyAtMs = timestampMs(video.readyToStreamAt);
    const modifiedAtMs = timestampMs(video.modified);
    return {
        uid: video.uid,
        meta,
        route: streamWebhookRoute(meta, isValidJobId),
        requireSignedURLs: video.requireSignedURLs === true,
        state: state as StreamVideoState,
        // The API reports a decimal string ("33.000000"); a number is accepted too.
        pctComplete: typeof status.pctComplete === 'number' || typeof status.pctComplete === 'string'
            ? Number(status.pctComplete) : Number.NaN,
        errorReasonCode,
        readyToStream: video.readyToStream === true,
        durationSeconds: typeof video.duration === 'number' ? video.duration : Number.NaN,
        input: Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0
            ? { width, height } : null,
        untrustedSizeBytes: typeof video.size === 'number' ? video.size : null,
        maxDurationSeconds: typeof video.maxDurationSeconds === 'number' ? video.maxDurationSeconds : null,
        hlsUrl: typeof playback.hls === 'string' ? playback.hls : '',
        dashUrl: typeof playback.dash === 'string' ? playback.dash : '',
        thumbnailUrl: typeof video.thumbnail === 'string' ? video.thumbnail : '',
        // readyToStreamAt when present (it does not move after ready), else the last modification.
        readyAtMs: Number.isSafeInteger(readyAtMs) ? readyAtMs : modifiedAtMs,
        modifiedAtMs,
        createdAtMs: timestampMs(video.created),
    };
}

export function streamProviderAsset(video: StreamVideo, accountId: string): ProviderAsset {
    return {
        id: video.uid,
        playbackId: video.uid,
        projectId: accountId,
        policy: video.requireSignedURLs ? 'jwt' : 'public',
        phase: streamPhase(video),
        updatedAtMs: video.readyAtMs,
        sourceVideo: video.input,
        name: typeof video.meta.name === 'string' ? video.meta.name : undefined,
        stream: {
            state: video.state,
            pctComplete: video.pctComplete,
            readyToStream: video.readyToStream,
            errorReasonCode: video.errorReasonCode,
            durationSeconds: video.durationSeconds,
            route: video.route,
            createdAtMs: video.createdAtMs,
        },
    };
}

export function streamProviderPlayback(video: StreamVideo): ProviderPlayback {
    return {
        kind: video.state === 'ready' && video.readyToStream ? 'vod' : `stream:${video.state || 'unknown'}`,
        policy: video.requireSignedURLs ? 'jwt' : 'public',
        sources: video.hlsUrl ? [{ kind: 'hls', url: video.hlsUrl, width: undefined, height: undefined, bitrate: undefined }] : [],
    };
}

function streamPhase(video: StreamVideo): string {
    if (video.state === 'ready') return video.readyToStream ? 'ready' : 'processing';
    if (video.state === 'error') return 'failed';
    if (video.state === 'pendingupload') return 'waiting';
    return ['queued', 'inprogress', 'downloading'].includes(video.state) ? 'processing' : 'unknown';
}

/** ready → readiness; error → failed (terminal, even while GET still says inprogress); queued/inprogress → processing. */
export function streamWebhookEvent(video: StreamVideo): {
    event: NormalizedWebhookEvent['event'];
    phase: string;
    failureCode?: string;
} | null {
    if (video.state === 'ready') {
        return video.readyToStream ? { event: 'ready', phase: 'ready' } : { event: 'processing', phase: 'processing' };
    }
    if (video.state === 'error') {
        return {
            event: 'failed',
            phase: 'failed',
            failureCode: FAILURE_CODE_PATTERN.test(video.errorReasonCode) ? video.errorReasonCode : 'ERR_UNKNOWN',
        };
    }
    if (['queued', 'inprogress', 'downloading'].includes(video.state)) return { event: 'processing', phase: 'processing' };
    return null;
}

/**
 * Routing key from `meta`, by whichever of the shapes we send appears (M0-P4 switch): plain
 * `jobid`/`jobId`/`job_id` + `generation`, a JSON `meta` value (string or object), or the
 * `youtick-<job>-g<generation>` name. Every shape present must agree, otherwise there is no route.
 */
export function streamWebhookRoute(meta: JsonObject, isValidJobId: (value: string) => boolean): WebhookRoute | null {
    const candidates: { jobId: unknown; generation: unknown }[] = [];
    const plainJob = meta.jobid ?? meta.jobId ?? meta.job_id;
    if (plainJob !== undefined || meta.generation !== undefined) {
        candidates.push({ jobId: plainJob, generation: meta.generation });
    }
    let nested: unknown = meta.meta;
    if (typeof nested === 'string') {
        try { nested = JSON.parse(nested); } catch { nested = null; }
    }
    if (nested !== undefined) {
        const object = nested && typeof nested === 'object' && !Array.isArray(nested) ? nested as JsonObject : {};
        candidates.push({ jobId: object.jobId, generation: object.generation });
    }
    if (typeof meta.name === 'string') {
        const match = /^youtick-(.+)-g([1-9][0-9]{0,15})$/.exec(meta.name);
        candidates.push(match ? { jobId: match[1], generation: match[2] } : { jobId: null, generation: null });
    }
    if (candidates.length === 0) return null;
    let route: WebhookRoute | null = null;
    for (const candidate of candidates) {
        const generation = typeof candidate.generation === 'number' ? candidate.generation
            : typeof candidate.generation === 'string' && /^[1-9][0-9]{0,15}$/.test(candidate.generation)
                ? Number(candidate.generation) : Number.NaN;
        if (typeof candidate.jobId !== 'string' || !isValidJobId(candidate.jobId)
            || !Number.isSafeInteger(generation) || generation < 1) return null;
        if (route && (route.jobId !== candidate.jobId || route.generation !== generation)) return null;
        route = { jobId: candidate.jobId, generation };
    }
    return route;
}

function routeMatches(route: WebhookRoute | null, expected: { jobId: string; generation: number }): boolean {
    return Boolean(route && route.jobId === expected.jobId && route.generation === expected.generation);
}

function timestampMs(value: unknown): number {
    if (typeof value !== 'string' || value.length > 64) return Number.NaN;
    const parsed = Date.parse(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

const importedKeys = new Map<string, Promise<CryptoKey>>();

/**
 * Imports the RS256 signing key once per isolate, detected by prefix after trimming: a JWK JSON
 * (`{`), a PEM (`-----BEGIN`), or base64 of either (the `POST /stream/keys` `pem` and `jwk` fields).
 * A PKCS1 `RSA PRIVATE KEY` is wrapped into PKCS8 because Web Crypto imports only PKCS8 (the
 * returned encoding is unrecorded until M0-P8).
 */
export function importStreamSigningKey(value: string | undefined): Promise<CryptoKey> {
    if (typeof value !== 'string' || value.trim().length < 64) return Promise.reject(new Error('runtime_not_configured'));
    const cacheKey = value;
    let key = importedKeys.get(cacheKey);
    if (!key) {
        key = importKey(value.trim()).catch(() => {
            importedKeys.delete(cacheKey);
            throw new Error('runtime_not_configured');
        });
        if (importedKeys.size >= 8) importedKeys.clear();
        importedKeys.set(cacheKey, key);
    }
    return key;
}

export function decodeStreamKeyText(value: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('-----BEGIN')) return trimmed;
    return new TextDecoder().decode(base64Decode(trimmed.replace(/\s/g, ''))).trim();
}

async function importKey(value: string): Promise<CryptoKey> {
    const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    const text = decodeStreamKeyText(value);
    if (text.startsWith('{')) {
        const { kid: _kid, ...jwk } = JSON.parse(text) as JsonWebKey & { kid?: unknown };
        return crypto.subtle.importKey('jwk', { ...jwk, alg: 'RS256' }, algorithm, false, ['sign']);
    }
    const pem = text;
    const pkcs1 = /-----BEGIN RSA PRIVATE KEY-----/.test(pem);
    if (!pkcs1 && !/-----BEGIN PRIVATE KEY-----/.test(pem)) throw new Error('invalid_key');
    const der = base64Decode(pem.replace(/-----(?:BEGIN|END) (?:RSA )?PRIVATE KEY-----|\s/g, ''));
    return crypto.subtle.importKey('pkcs8', pkcs1 ? pkcs1ToPkcs8(der) : der, algorithm, false, ['sign']);
}

// PrivateKeyInfo ::= SEQUENCE { INTEGER 0, AlgorithmIdentifier rsaEncryption NULL, OCTET STRING pkcs1 }
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
    const version = Uint8Array.from([0x02, 0x01, 0x00]);
    const algorithm = Uint8Array.from([
        0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
    ]);
    const octets = concatBytes(Uint8Array.from([0x04, ...derLength(pkcs1.length)]), pkcs1);
    const body = concatBytes(version, algorithm, octets);
    return concatBytes(Uint8Array.from([0x30, ...derLength(body.length)]), body);
}

function derLength(length: number): number[] {
    if (length < 0x80) return [length];
    const bytes: number[] = [];
    for (let remaining = length; remaining > 0; remaining = Math.floor(remaining / 256)) bytes.unshift(remaining % 256);
    return [0x80 | bytes.length, ...bytes];
}

function requireObject(value: unknown, code: string): JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
    return value as JsonObject;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.byteLength;
    }
    return out;
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

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlJson(value: JsonObject): string {
    return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(value: Uint8Array): string {
    return bytesToBase64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
