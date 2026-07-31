import { AwsV4Signer } from 'aws4fetch';
import { base58Decode } from '../../shared/src/base58';

export const PAID_SOURCE_MAX_BYTES = 20_000_000_000;
export const R2_UPLOAD_PART_BYTES = 64 * 1024 * 1024;
export const R2_UPLOAD_GRANT_TTL_SECONDS = 10 * 60;
export const RAW_SOURCE_RETENTION_MS = 24 * 60 * 60 * 1000;

const AUTH_MAX_SKEW_MS = 5 * 60 * 1000;
const CLEANUP_RETRY_MS = 5 * 60 * 1000;
const SESSION_KEY = 'session';
const JOB_ID_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/;
const ACCOUNT_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const PUBLIC_KEY_PATTERN = /^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/;
const R2_ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/;
const R2_BUCKET_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const ETAG_PATTERN = /^[a-f0-9]{32}$/;

export interface R2IngestEnv {
    ALLOWED_ORIGINS?: string;
    R2_INGEST_ENABLED?: string;
    R2_ACCOUNT_ID?: string;
    R2_JURISDICTION?: string;
    R2_RAW_BUCKET_NAME?: string;
    R2_ACCESS_KEY_ID?: string;
    R2_SECRET_ACCESS_KEY?: string;
    R2_INGEST_SESSIONS?: DurableObjectNamespace;
    RAW_MEDIA_BUCKET?: R2Bucket;
    NEAR_RPC_URL?: string;
    MARKET_CONTRACT_ID?: string;
}

type SessionState = 'UPLOADING' | 'SOURCE_UPLOADED' | 'ABORTED' | 'EXPIRED';

type R2IngestSessionV1 = {
    schema: 'youtick.r2-ingest-session.v1';
    jobId: string;
    generation: number;
    creator: string;
    origin: string;
    sourceBytes: number;
    partBytes: number;
    partCount: number;
    providerKey: string;
    uploadId: string;
    ingestPublicKey: string;
    state: SessionState;
    createdAtMs: number;
    retentionDeadlineMs: number;
    cleanupError?: string;
};

type ProviderPart = {
    partNumber: number;
    etag: string;
    size: number;
};

type OnChainJob = {
    job_id?: unknown;
    creator_id?: unknown;
    profile?: unknown;
    generation?: unknown;
    status?: unknown;
    source_bytes?: unknown;
    ingest_public_key?: unknown;
};

export function getR2IngestReadiness(env: R2IngestEnv): Record<string, unknown> {
    const dependencies = {
        featureEnabled: env.R2_INGEST_ENABLED === 'true',
        bucketBinding: Boolean(env.RAW_MEDIA_BUCKET),
        sessionNamespace: Boolean(env.R2_INGEST_SESSIONS),
        accountId: R2_ACCOUNT_ID_PATTERN.test(env.R2_ACCOUNT_ID?.trim() || ''),
        jurisdiction: !env.R2_JURISDICTION || env.R2_JURISDICTION === 'eu',
        bucketName: R2_BUCKET_PATTERN.test(env.R2_RAW_BUCKET_NAME?.trim() || '')
            && !env.R2_RAW_BUCKET_NAME?.startsWith('replace-with-'),
        presignCredentials: Boolean(
            readSecret(env.R2_ACCESS_KEY_ID) && readSecret(env.R2_SECRET_ACCESS_KEY),
        ),
        nearRpc: isHttpsUrl(env.NEAR_RPC_URL),
        marketContract: ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID?.trim() || ''),
    };
    const ready = Object.values(dependencies).every(Boolean);

    return {
        schema: 'youtick.r2-ingest-readiness.v1',
        ready,
        stage: ready ? 'PERSISTED_CONTROL_READY' : 'DISABLED',
        mode: 'desktop-browser-r2',
        maxSourceBytes: PAID_SOURCE_MAX_BYTES,
        partBytes: R2_UPLOAD_PART_BYTES,
        retentionMs: RAW_SOURCE_RETENTION_MS,
        dependencies,
    };
}

export function matchR2IngestRoute(pathname: string): {
    jobId: string;
    generation: number;
} | null {
    const match = pathname.match(
        /^\/media-jobs\/([^/]+)\/generations\/([1-9]\d*)\/uploads(?:\/(?:parts(?:\/[1-9]\d*\/grant)?|complete))?$/,
    );
    if (!match || !JOB_ID_PATTERN.test(match[1])) {
        return null;
    }
    const generation = Number(match[2]);
    return Number.isSafeInteger(generation) ? { jobId: match[1], generation } : null;
}

export class R2IngestSession {
    constructor(
        private readonly state: DurableObjectState,
        private readonly env: R2IngestEnv,
    ) {}

    async fetch(request: Request): Promise<Response> {
        try {
            requireReady(this.env);
            const url = new URL(request.url);
            const route = matchR2IngestRoute(url.pathname);
            if (!route) {
                throw new Error('route_not_found');
            }

            if (request.method === 'POST' && url.pathname.endsWith('/uploads')) {
                return json(await this.create(request, route.jobId, route.generation));
            }

            const session = await this.load();
            if (!session || session.jobId !== route.jobId || session.generation !== route.generation) {
                throw new Error('session_not_found');
            }
            await this.authorize(request, session);

            if (request.method === 'GET' && url.pathname.endsWith('/parts')) {
                return json(await this.list(session));
            }

            if (request.method === 'POST' && /\/parts\/[1-9]\d*\/grant$/.test(url.pathname)) {
                const partNumber = Number(url.pathname.split('/').at(-2));
                return json(await this.grant(session, partNumber));
            }

            if (request.method === 'POST' && url.pathname.endsWith('/complete')) {
                return json(await this.complete(session));
            }

            if (request.method === 'DELETE' && url.pathname.endsWith('/uploads')) {
                return json(await this.abort(session));
            }

            throw new Error('method_not_allowed');
        } catch (error) {
            const code = error instanceof Error ? error.message : 'internal_error';
            return json({ error: code }, errorStatus(code));
        }
    }

    async alarm(): Promise<void> {
        const session = await this.load();
        if (!session || session.state === 'ABORTED' || session.state === 'EXPIRED') {
            return;
        }
        const now = Date.now();
        if (now < session.retentionDeadlineMs) {
            await this.state.storage.setAlarm(session.retentionDeadlineMs);
            return;
        }

        try {
            if (session.state === 'UPLOADING') {
                try {
                    await this.resumeUpload(session).abort();
                } catch (error) {
                    if (!isMissingMultipartError(error)) throw error;
                }
            }
            await this.env.RAW_MEDIA_BUCKET!.delete(session.providerKey);
            if (await this.env.RAW_MEDIA_BUCKET!.head(session.providerKey)) {
                throw new Error('raw_delete_not_confirmed');
            }
            session.state = 'EXPIRED';
            delete session.cleanupError;
            await this.save(session);
        } catch (error) {
            session.cleanupError = error instanceof Error ? error.message : 'cleanup_failed';
            await this.save(session);
            await this.state.storage.setAlarm(now + CLEANUP_RETRY_MS);
        }
    }

    private async create(
        request: Request,
        jobId: string,
        generation: number,
    ): Promise<Record<string, unknown>> {
        const body = await readJson(request.clone());
        const creator = typeof body.creator === 'string' ? body.creator : '';
        const sourceBytes = body.sourceBytes;
        if (!ACCOUNT_ID_PATTERN.test(creator)
            || !Number.isSafeInteger(sourceBytes)
            || (sourceBytes as number) < 1
            || (sourceBytes as number) > PAID_SOURCE_MAX_BYTES) {
            throw new Error('invalid_create_request');
        }

        const existing = await this.load();
        if (existing) {
            await this.authorize(request, existing);
            if (existing.creator !== creator || existing.sourceBytes !== sourceBytes) {
                throw new Error('session_scope_mismatch');
            }
            return sessionView(existing);
        }

        const publicKey = request.headers.get('X-Youtick-Public-Key') || '';
        const chainJob = await readOnChainJob(this.env, jobId);
        if (!chainJob
            || chainJob.job_id !== jobId
            || chainJob.creator_id !== creator
            || chainJob.profile !== 'paid-media-v4'
            || chainJob.generation !== generation
            || chainJob.status !== 'Authorized'
            || chainJob.source_bytes !== String(sourceBytes)
            || chainJob.ingest_public_key !== publicKey) {
            throw new Error('on_chain_job_mismatch');
        }

        const origin = requireAllowedOrigin(request, this.env);
        await this.authorizeDeviceRequest(request, publicKey);

        const providerKey = `raw/jobs/${jobId}/${generation}/source`;
        const upload = await this.env.RAW_MEDIA_BUCKET!.createMultipartUpload(providerKey, {
            customMetadata: {
                schema: 'youtick.r2-raw-source.v1',
                jobId,
                generation: String(generation),
                creator,
            },
            httpMetadata: { contentType: 'application/octet-stream' },
        });
        const now = Date.now();
        const session: R2IngestSessionV1 = {
            schema: 'youtick.r2-ingest-session.v1',
            jobId,
            generation,
            creator,
            origin,
            sourceBytes: sourceBytes as number,
            partBytes: R2_UPLOAD_PART_BYTES,
            partCount: Math.ceil((sourceBytes as number) / R2_UPLOAD_PART_BYTES),
            providerKey,
            uploadId: upload.uploadId,
            ingestPublicKey: publicKey,
            state: 'UPLOADING',
            createdAtMs: now,
            retentionDeadlineMs: now + RAW_SOURCE_RETENTION_MS,
        };
        await this.save(session);
        await this.state.storage.setAlarm(session.retentionDeadlineMs);
        return sessionView(session);
    }

    private async authorize(request: Request, session: R2IngestSessionV1): Promise<void> {
        if (requireAllowedOrigin(request, this.env) !== session.origin) {
            throw new Error('origin_denied');
        }
        await this.authorizeDeviceRequest(request, session.ingestPublicKey);
    }

    private async authorizeDeviceRequest(request: Request, publicKey: string): Promise<void> {
        const authorization = await verifyDeviceRequest(request, publicKey);
        const nonceKey = `nonce:${authorization.nonce}`;
        await this.state.storage.transaction(async (transaction) => {
            if (await transaction.get(nonceKey)) {
                throw new Error('authorization_replay');
            }
            await transaction.put(nonceKey, authorization.timestamp);
        });
    }

    private async list(session: R2IngestSessionV1): Promise<Record<string, unknown>> {
        if (session.state !== 'UPLOADING') {
            return {
                ...sessionView(session),
                parts: [],
                missingParts: [],
            };
        }
        const parts = await listProviderParts(this.env, session);
        validateProviderParts(session, parts, false);
        const uploaded = new Set(parts.map((part) => part.partNumber));
        return {
            ...sessionView(session),
            parts,
            missingParts: Array.from(
                { length: session.partCount },
                (_, index) => index + 1,
            ).filter((partNumber) => !uploaded.has(partNumber)),
        };
    }

    private async grant(
        session: R2IngestSessionV1,
        partNumber: number,
    ): Promise<Record<string, unknown>> {
        requireUploading(session);
        const expectedBytes = expectedPartBytes(session, partNumber);
        const existing = await listProviderParts(this.env, session);
        if (existing.some((part) => part.partNumber === partNumber)) {
            throw new Error('part_already_uploaded');
        }

        const now = new Date();
        const url = r2ObjectUrl(this.env, session);
        url.searchParams.set('partNumber', String(partNumber));
        url.searchParams.set('uploadId', session.uploadId);
        url.searchParams.set('X-Amz-Expires', String(R2_UPLOAD_GRANT_TTL_SECONDS));
        const signedHeaders = {
            'content-length': String(expectedBytes),
            'content-type': 'application/octet-stream',
            origin: session.origin,
        };
        const signer = new AwsV4Signer({
            method: 'PUT',
            url: url.toString(),
            headers: signedHeaders,
            accessKeyId: readSecret(this.env.R2_ACCESS_KEY_ID)!,
            secretAccessKey: readSecret(this.env.R2_SECRET_ACCESS_KEY)!,
            service: 's3',
            region: 'auto',
            datetime: now.toISOString().replace(/[:-]|\.\d{3}/g, ''),
            signQuery: true,
            allHeaders: true,
        });
        const signed = await signer.sign();

        return {
            schema: 'youtick.r2-upload-part-grant.v1',
            jobId: session.jobId,
            generation: session.generation,
            partNumber,
            expectedBytes,
            url: signed.url.toString(),
            headers: { 'Content-Type': 'application/octet-stream' },
            expiresAtMs: now.getTime() + R2_UPLOAD_GRANT_TTL_SECONDS * 1000,
        };
    }

    private async complete(session: R2IngestSessionV1): Promise<Record<string, unknown>> {
        if (session.state === 'SOURCE_UPLOADED') {
            return sessionView(session);
        }
        requireUploading(session);
        const parts = await listProviderParts(this.env, session);
        validateProviderParts(session, parts, true);
        await this.resumeUpload(session).complete(
            parts.map(({ partNumber, etag }) => ({ partNumber, etag })),
        );
        const object = await this.env.RAW_MEDIA_BUCKET!.head(session.providerKey);
        if (!object || object.size !== session.sourceBytes) {
            throw new Error('completed_object_size_mismatch');
        }
        session.state = 'SOURCE_UPLOADED';
        await this.save(session);
        return sessionView(session);
    }

    private async abort(session: R2IngestSessionV1): Promise<Record<string, unknown>> {
        if (session.state === 'ABORTED' || session.state === 'EXPIRED') {
            return sessionView(session);
        }
        if (session.state === 'UPLOADING') {
            try {
                await this.resumeUpload(session).abort();
            } catch (error) {
                if (!isMissingMultipartError(error)) throw error;
            }
        }
        await this.env.RAW_MEDIA_BUCKET!.delete(session.providerKey);
        if (await this.env.RAW_MEDIA_BUCKET!.head(session.providerKey)) {
            throw new Error('raw_delete_not_confirmed');
        }
        session.state = 'ABORTED';
        await this.save(session);
        await this.state.storage.deleteAlarm();
        return sessionView(session);
    }

    private resumeUpload(session: R2IngestSessionV1): R2MultipartUpload {
        return this.env.RAW_MEDIA_BUCKET!.resumeMultipartUpload(
            session.providerKey,
            session.uploadId,
        );
    }

    private load(): Promise<R2IngestSessionV1 | undefined> {
        return this.state.storage.get<R2IngestSessionV1>(SESSION_KEY);
    }

    private save(session: R2IngestSessionV1): Promise<void> {
        return this.state.storage.put(SESSION_KEY, session);
    }
}

export function expectedPartBytes(
    session: Pick<R2IngestSessionV1, 'sourceBytes' | 'partBytes' | 'partCount'>,
    partNumber: number,
): number {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > session.partCount) {
        throw new Error('invalid_part_number');
    }
    return partNumber === session.partCount
        ? session.sourceBytes - session.partBytes * (session.partCount - 1)
        : session.partBytes;
}

export function validateProviderParts(
    session: Pick<R2IngestSessionV1, 'sourceBytes' | 'partBytes' | 'partCount'>,
    parts: ProviderPart[],
    requireComplete: boolean,
): void {
    const seen = new Set<number>();
    let total = 0;
    for (const part of parts) {
        if (seen.has(part.partNumber)
            || normalizeEtag(part.etag) !== part.etag
            || part.size !== expectedPartBytes(session, part.partNumber)) {
            throw new Error('provider_inventory_mismatch');
        }
        seen.add(part.partNumber);
        total += part.size;
    }
    if (requireComplete && (parts.length !== session.partCount || total !== session.sourceBytes)) {
        throw new Error('provider_inventory_incomplete');
    }
}

async function verifyDeviceRequest(
    request: Request,
    expectedPublicKey: string,
): Promise<{ nonce: string; timestamp: number }> {
    if (!PUBLIC_KEY_PATTERN.test(expectedPublicKey)
        || request.headers.get('X-Youtick-Public-Key') !== expectedPublicKey) {
        throw new Error('device_key_mismatch');
    }
    const timestamp = Number(request.headers.get('X-Youtick-Timestamp'));
    const nonce = request.headers.get('X-Youtick-Nonce') || '';
    const signature = request.headers.get('X-Youtick-Signature') || '';
    const now = Date.now();
    if (!Number.isSafeInteger(timestamp)
        || Math.abs(now - timestamp) > AUTH_MAX_SKEW_MS
        || nonce.length < 16
        || nonce.length > 128
        || !/^[a-zA-Z0-9-]+$/.test(nonce)
        || !signature) {
        throw new Error('invalid_device_authorization');
    }
    const body = new Uint8Array(await request.clone().arrayBuffer());
    const bodyHash = await sha256Hex(body);
    const canonical = [
        request.method,
        new URL(request.url).pathname,
        String(timestamp),
        nonce,
        bodyHash,
    ].join('\n');
    const rawKey = base58Decode(expectedPublicKey);
    if (rawKey.length !== 32) {
        throw new Error('invalid_device_key');
    }
    const key = await crypto.subtle.importKey('raw', rawKey, 'Ed25519', false, ['verify']);
    let signatureBytes: Uint8Array;
    try {
        signatureBytes = base64Decode(signature);
    } catch {
        throw new Error('invalid_device_authorization');
    }
    const valid = await crypto.subtle.verify(
        'Ed25519',
        key,
        signatureBytes as BufferSource,
        new TextEncoder().encode(canonical),
    );
    if (!valid) {
        throw new Error('invalid_device_authorization');
    }
    return { nonce, timestamp };
}

async function readOnChainJob(
    env: R2IngestEnv,
    jobId: string,
): Promise<OnChainJob | null> {
    const response = await fetch(env.NEAR_RPC_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'paid-media-v4-ingest',
            method: 'query',
            params: {
                request_type: 'call_function',
                finality: 'final',
                account_id: env.MARKET_CONTRACT_ID,
                method_name: 'get_media_job',
                args_base64: base64Encode(
                    new TextEncoder().encode(JSON.stringify({ job_id: jobId })),
                ),
            },
        }),
    });
    const body = await response.json() as {
        result?: { result?: number[] };
        error?: unknown;
    };
    if (!response.ok || body.error || !Array.isArray(body.result?.result)) {
        throw new Error('near_job_query_failed');
    }
    const raw = new TextDecoder().decode(new Uint8Array(body.result!.result));
    return raw ? JSON.parse(raw) as OnChainJob : null;
}

async function listProviderParts(
    env: R2IngestEnv,
    session: R2IngestSessionV1,
): Promise<ProviderPart[]> {
    const url = r2ObjectUrl(env, session);
    url.searchParams.set('uploadId', session.uploadId);
    const signed = await new AwsV4Signer({
        method: 'GET',
        url: url.toString(),
        accessKeyId: readSecret(env.R2_ACCESS_KEY_ID)!,
        secretAccessKey: readSecret(env.R2_SECRET_ACCESS_KEY)!,
        service: 's3',
        region: 'auto',
    }).sign();
    const response = await fetch(signed.url, signed);
    const xml = await response.text();
    if (!response.ok) {
        throw new Error('r2_list_parts_failed');
    }
    const parts = Array.from(xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g), (match) => {
        const partNumber = Number(readXmlTag(match[1], 'PartNumber'));
        const etag = normalizeEtag(readXmlTag(match[1], 'ETag'));
        const size = Number(readXmlTag(match[1], 'Size'));
        if (!Number.isSafeInteger(partNumber) || !Number.isSafeInteger(size)) {
            throw new Error('invalid_r2_list_parts');
        }
        return { partNumber, etag, size };
    });
    parts.sort((left, right) => left.partNumber - right.partNumber);
    return parts;
}

function r2ObjectUrl(env: R2IngestEnv, session: R2IngestSessionV1): URL {
    const jurisdiction = env.R2_JURISDICTION === 'eu' ? '.eu' : '';
    return new URL(
        `https://${env.R2_ACCOUNT_ID}${jurisdiction}.r2.cloudflarestorage.com/`
        + `${env.R2_RAW_BUCKET_NAME}/${session.providerKey}`,
    );
}

function requireReady(env: R2IngestEnv): void {
    if (getR2IngestReadiness(env).ready !== true) {
        throw new Error('r2_ingest_disabled');
    }
}

function requireAllowedOrigin(request: Request, env: R2IngestEnv): string {
    const origin = request.headers.get('Origin') || '';
    const allowed = new Set(
        (env.ALLOWED_ORIGINS || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
    );
    if (!origin || !allowed.has(origin) || allowed.has('*')) {
        throw new Error('origin_denied');
    }
    return origin;
}

function requireUploading(session: R2IngestSessionV1): void {
    if (session.state !== 'UPLOADING') {
        throw new Error('upload_not_active');
    }
    if (Date.now() >= session.retentionDeadlineMs) {
        throw new Error('source_retention_expired');
    }
}

function sessionView(session: R2IngestSessionV1): Record<string, unknown> {
    return {
        schema: session.schema,
        jobId: session.jobId,
        generation: session.generation,
        creator: session.creator,
        sourceBytes: session.sourceBytes,
        partBytes: session.partBytes,
        partCount: session.partCount,
        providerKey: session.providerKey,
        state: session.state,
        retentionDeadlineMs: session.retentionDeadlineMs,
    };
}

function normalizeEtag(value: string): string {
    const etag = value.trim().replace(/^"|"$/g, '').toLowerCase();
    if (!ETAG_PATTERN.test(etag)) {
        throw new Error('invalid_part_etag');
    }
    return etag;
}

function isMissingMultipartError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('NoSuchUpload') || message.includes('does not exist');
}

function readXmlTag(xml: string, name: string): string {
    const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
    if (!match) {
        throw new Error('invalid_r2_list_parts');
    }
    return match[1];
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
    try {
        const value = await request.json();
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('invalid_json');
        }
        return value as Record<string, unknown>;
    } catch {
        throw new Error('invalid_json');
    }
}

async function sha256Hex(value: Uint8Array): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', value));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64Encode(value: Uint8Array): string {
    let binary = '';
    for (const byte of value) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function readSecret(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed.replace(/^(['"])(.*)\1$/, '$2') : null;
}

function isHttpsUrl(value: string | undefined): boolean {
    try {
        return new URL(value || '').protocol === 'https:';
    } catch {
        return false;
    }
}

function json(body: Record<string, unknown>, status = 200): Response {
    return Response.json(body, {
        status,
        headers: { 'Cache-Control': 'no-store' },
    });
}

function errorStatus(code: string): number {
    if (code === 'route_not_found' || code === 'session_not_found') return 404;
    if (code === 'method_not_allowed') return 405;
    if (code === 'r2_ingest_disabled') return 503;
    if (code === 'origin_denied' || code === 'on_chain_job_mismatch') return 403;
    if (code.includes('replay')) return 409;
    if (code.includes('authorization') || code.includes('device_key')) return 401;
    if (code.includes('mismatch')
        || code.includes('already')
        || code.includes('incomplete')
        || code.includes('not_active')
        || code.includes('expired')) return 409;
    if (code.startsWith('invalid_')) return 400;
    return 502;
}
