import { KeyPair, actions, type KeyPairString } from 'near-api-js';
import { APP_CONFIG, GAS_CONSTANTS, MEDIA_UPLOAD_POLICY, NEAR_CONFIG } from '@/lib/constants';
import { base64Encode, hexEncode } from '@/lib/crypto/codec';
import type { WalletInstance } from '@/lib/types';

export type R2IngestProbe = {
    schema: 'youtick.r2-ingest-readiness.v1';
    ready: boolean;
    stage: string;
    mode: 'desktop-browser-r2';
    maxSourceBytes: number;
    partBytes: number;
    retentionMs: number;
    dependencies: Record<string, boolean>;
};

export type PaidSourceValidation =
    | { ok: true }
    | { ok: false; error: 'empty_file' | 'source_limit_exceeded' | 'unsupported_video_type' };

export type PaidUploadDraft = {
    schema: 'youtick.paid-upload-draft.v1';
    id: string;
    accountId: string;
    jobId: string;
    generation: number;
    title: string;
    priceUsdc: string;
    sourceBytes: number;
    sourceName: string;
    sourceType: string;
    sourceLastModified: number;
    sourceFingerprint: string;
    ingestPublicKey: string;
    ingestSecretKey: KeyPairString;
    state: 'DRAFT' | 'AUTHORIZING' | 'UPLOADING' | 'SOURCE_UPLOADED' | 'ABORTED';
    uploadedParts: number[];
    createdAtMs: number;
    updatedAtMs: number;
};

type R2Session = {
    schema: 'youtick.r2-ingest-session.v1';
    jobId: string;
    generation: number;
    sourceBytes: number;
    partBytes: number;
    partCount: number;
    providerKey: string;
    state: string;
};

type R2PartList = R2Session & {
    parts: Array<{ partNumber: number; etag: string; size: number }>;
    missingParts: number[];
};

type R2PartGrant = {
    schema: 'youtick.r2-upload-part-grant.v1';
    jobId: string;
    generation: number;
    partNumber: number;
    expectedBytes: number;
    url: string;
    headers: Record<string, string>;
    expiresAtMs: number;
};

const DB_NAME = 'youtick-paid-media-v4';
const DB_VERSION = 1;
const STORE_NAME = 'uploads';
const SUPPORTED_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);
const DIRECT_UPLOAD_CONCURRENCY = 3;

export function validatePaidSourceFile(file: Pick<File, 'size' | 'type'>): PaidSourceValidation {
    if (!Number.isSafeInteger(file.size) || file.size < 1) {
        return { ok: false, error: 'empty_file' };
    }
    if (file.size > MEDIA_UPLOAD_POLICY.paidSourceMaxBytes) {
        return { ok: false, error: 'source_limit_exceeded' };
    }
    if (!SUPPORTED_VIDEO_TYPES.has(file.type)) {
        return { ok: false, error: 'unsupported_video_type' };
    }
    return { ok: true };
}

export function parsePriceUsdc(value: string): string {
    const match = value.trim().match(/^(\d{1,8})(?:\.(\d{1,6}))?$/);
    if (!match) throw new Error('invalid_price');
    const micro = BigInt(match[1]) * 1_000_000n
        + BigInt((match[2] || '').padEnd(6, '0'));
    if (micro < 2_000_000n || micro % 50n !== 0n) {
        throw new Error('invalid_price');
    }
    return micro.toString();
}

export async function readR2IngestProbe(signal?: AbortSignal): Promise<R2IngestProbe> {
    const response = await fetch(`${storageApiBase()}/media-jobs/ingest/probe`, {
        method: 'GET',
        cache: 'no-store',
        signal,
    });
    const body = await readJson(response) as Partial<R2IngestProbe>;
    if (!response.ok
        || body.schema !== 'youtick.r2-ingest-readiness.v1'
        || typeof body.ready !== 'boolean'
        || body.mode !== 'desktop-browser-r2'
        || body.maxSourceBytes !== MEDIA_UPLOAD_POLICY.paidSourceMaxBytes
        || body.partBytes !== MEDIA_UPLOAD_POLICY.r2PartBytes
        || body.retentionMs !== 24 * 60 * 60 * 1000
        || !body.dependencies) {
        throw new Error('invalid_r2_ingest_probe');
    }
    return body as R2IngestProbe;
}

export async function createPaidUploadDraft(input: {
    accountId: string;
    title: string;
    price: string;
    file: File;
}): Promise<PaidUploadDraft> {
    const validation = validatePaidSourceFile(input.file);
    if (!validation.ok) throw new Error(validation.error);
    const title = input.title.trim();
    if (!title || new TextEncoder().encode(title).length > 200) {
        throw new Error('invalid_title');
    }
    const keyPair = KeyPair.fromRandom('ed25519');
    const jobId = `pmv4-${crypto.randomUUID()}`;
    const now = Date.now();
    const draft: PaidUploadDraft = {
        schema: 'youtick.paid-upload-draft.v1',
        id: `${input.accountId}:${jobId}:1`,
        accountId: input.accountId,
        jobId,
        generation: 1,
        title,
        priceUsdc: parsePriceUsdc(input.price),
        sourceBytes: input.file.size,
        sourceName: input.file.name,
        sourceType: input.file.type,
        sourceLastModified: input.file.lastModified,
        sourceFingerprint: await fingerprintFile(input.file),
        ingestPublicKey: keyPair.getPublicKey().toString(),
        ingestSecretKey: keyPair.toString(),
        state: 'DRAFT',
        uploadedParts: [],
        createdAtMs: now,
        updatedAtMs: now,
    };
    await writeDraft(draft);
    return draft;
}

export async function findPaidUploadDraft(
    accountId: string,
    file: File,
): Promise<PaidUploadDraft | null> {
    const fingerprint = await fingerprintFile(file);
    const drafts = await readAllDrafts();
    return drafts
        .filter((draft) => (
            draft.accountId === accountId
            && draft.sourceBytes === file.size
            && draft.sourceFingerprint === fingerprint
            && draft.state !== 'ABORTED'
        ))
        .sort((left, right) => right.updatedAtMs - left.updatedAtMs)[0] || null;
}

export async function authorizePaidUpload(
    wallet: WalletInstance,
    draft: PaidUploadDraft,
): Promise<void> {
    await updateDraft(draft, { state: 'AUTHORIZING' });
    await wallet.signAndSendTransaction({
        receiverId: NEAR_CONFIG.marketContractId,
        actions: [
            actions.functionCall(
                'create_paid_job',
                {
                    job_id: draft.jobId,
                    title: draft.title,
                    price_usdc: draft.priceUsdc,
                    source_bytes: String(draft.sourceBytes),
                    ingest_public_key: draft.ingestPublicKey,
                },
                GAS_CONSTANTS.mediumGas,
                0n,
            ),
        ],
    });
}

export async function uploadPaidSource(
    file: File,
    draft: PaidUploadDraft,
    options?: {
        signal?: AbortSignal;
        onProgress?: (uploadedParts: number, totalParts: number) => void;
    },
): Promise<R2Session> {
    if (draft.accountId.length === 0
        || file.size !== draft.sourceBytes
        || await fingerprintFile(file) !== draft.sourceFingerprint) {
        throw new Error('source_reselection_mismatch');
    }
    await updateDraft(draft, { state: 'UPLOADING' });
    const basePath = sessionPath(draft);
    const session = await signedApi<R2Session>(draft, 'POST', basePath, {
        creator: draft.accountId,
        sourceBytes: draft.sourceBytes,
    }, options?.signal);
    if (session.sourceBytes !== file.size
        || session.partBytes !== MEDIA_UPLOAD_POLICY.r2PartBytes
        || session.providerKey !== `raw/jobs/${draft.jobId}/${draft.generation}/source`) {
        throw new Error('invalid_r2_session');
    }

    const inventory = await signedApi<R2PartList>(
        draft,
        'GET',
        `${basePath}/parts`,
        undefined,
        options?.signal,
    );
    const missing = validateMissingParts(inventory.partCount, inventory.missingParts);
    let completed = inventory.partCount - missing.length;
    options?.onProgress?.(completed, inventory.partCount);
    let cursor = 0;

    const uploadNext = async () => {
        while (cursor < missing.length) {
            const partNumber = missing[cursor];
            cursor += 1;
            const grant = await signedApi<R2PartGrant>(
                draft,
                'POST',
                `${basePath}/parts/${partNumber}/grant`,
                undefined,
                options?.signal,
            );
            const start = (partNumber - 1) * session.partBytes;
            const end = Math.min(start + session.partBytes, file.size);
            const part = file.slice(start, end);
            validateGrant(grant, session, partNumber, part.size);
            const upload = await fetch(grant.url, {
                method: 'PUT',
                headers: grant.headers,
                body: part,
                signal: options?.signal,
            });
            if (!upload.ok || !upload.headers.get('ETag')) {
                throw new Error(`r2_part_upload_failed:${partNumber}`);
            }
            draft.uploadedParts = Array.from(
                new Set([...draft.uploadedParts, partNumber]),
            ).sort((left, right) => left - right);
            completed += 1;
            await updateDraft(draft, { uploadedParts: draft.uploadedParts });
            options?.onProgress?.(completed, inventory.partCount);
        }
    };

    await Promise.all(
        Array.from(
            { length: Math.min(DIRECT_UPLOAD_CONCURRENCY, missing.length) },
            () => uploadNext(),
        ),
    );
    const finalInventory = await signedApi<R2PartList>(
        draft,
        'GET',
        `${basePath}/parts`,
        undefined,
        options?.signal,
    );
    if (finalInventory.missingParts.length !== 0) {
        throw new Error('provider_inventory_incomplete');
    }
    const completedSession = await signedApi<R2Session>(
        draft,
        'POST',
        `${basePath}/complete`,
        undefined,
        options?.signal,
    );
    if (completedSession.state !== 'SOURCE_UPLOADED') {
        throw new Error('r2_complete_failed');
    }
    await updateDraft(draft, { state: 'SOURCE_UPLOADED' });
    return completedSession;
}

export async function abortPaidUpload(draft: PaidUploadDraft): Promise<void> {
    await signedApi(draft, 'DELETE', sessionPath(draft));
    await updateDraft(draft, { state: 'ABORTED' });
}

export function validateMissingParts(partCount: number, values: number[]): number[] {
    if (!Number.isSafeInteger(partCount) || partCount < 1 || partCount > 10_000) {
        throw new Error('invalid_part_count');
    }
    const unique = Array.from(new Set(values)).sort((left, right) => left - right);
    if (unique.some((part) => !Number.isInteger(part) || part < 1 || part > partCount)) {
        throw new Error('invalid_missing_parts');
    }
    return unique;
}

async function signedApi<T = Record<string, unknown>>(
    draft: PaidUploadDraft,
    method: string,
    path: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
): Promise<T> {
    const serialized = body ? JSON.stringify(body) : '';
    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const bodyHash = hexEncode(new Uint8Array(await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(serialized),
    )));
    const canonical = [method, path, String(timestamp), nonce, bodyHash].join('\n');
    const keyPair = KeyPair.fromString(draft.ingestSecretKey);
    const signature = keyPair.sign(new TextEncoder().encode(canonical)).signature;
    const response = await fetch(`${storageApiBase()}${path}`, {
        method,
        headers: {
            ...(serialized ? { 'Content-Type': 'application/json' } : {}),
            'X-Youtick-Public-Key': draft.ingestPublicKey,
            'X-Youtick-Timestamp': String(timestamp),
            'X-Youtick-Nonce': nonce,
            'X-Youtick-Signature': base64Encode(signature),
        },
        ...(serialized ? { body: serialized } : {}),
        signal,
        cache: 'no-store',
    });
    const responseBody = await readJson(response);
    if (!response.ok) {
        throw new Error(
            typeof responseBody.error === 'string'
                ? responseBody.error
                : `r2_control_http_${response.status}`,
        );
    }
    return responseBody as T;
}

function validateGrant(
    grant: R2PartGrant,
    session: R2Session,
    partNumber: number,
    actualBytes: number,
): void {
    const url = new URL(grant.url);
    if (grant.schema !== 'youtick.r2-upload-part-grant.v1'
        || grant.jobId !== session.jobId
        || grant.generation !== session.generation
        || grant.partNumber !== partNumber
        || grant.expectedBytes !== actualBytes
        || grant.expiresAtMs <= Date.now()
        || url.protocol !== 'https:'
        || !url.hostname.endsWith('.r2.cloudflarestorage.com')
        || !url.pathname.endsWith(`/${session.providerKey}`)
        || url.searchParams.get('partNumber') !== String(partNumber)) {
        throw new Error('invalid_r2_part_grant');
    }
}

async function fingerprintFile(file: File): Promise<string> {
    const sampleBytes = 64 * 1024;
    const head = new Uint8Array(await file.slice(0, sampleBytes).arrayBuffer());
    const tail = new Uint8Array(
        await file.slice(Math.max(0, file.size - sampleBytes), file.size).arrayBuffer(),
    );
    const metadata = new TextEncoder().encode(
        `${file.name}\n${file.size}\n${file.type}\n${file.lastModified}\n`,
    );
    const value = new Uint8Array(metadata.length + head.length + tail.length);
    value.set(metadata);
    value.set(head, metadata.length);
    value.set(tail, metadata.length + head.length);
    return hexEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', value)));
}

async function updateDraft(
    draft: PaidUploadDraft,
    patch: Partial<Pick<PaidUploadDraft, 'state' | 'uploadedParts'>>,
): Promise<void> {
    Object.assign(draft, patch, { updatedAtMs: Date.now() });
    await writeDraft(draft);
}

function sessionPath(draft: PaidUploadDraft): string {
    return `/media-jobs/${draft.jobId}/generations/${draft.generation}/uploads`;
}

function storageApiBase(): string {
    const value = APP_CONFIG.storageApiUrl.trim().replace(/\/+$/, '');
    if (!value) throw new Error('storage_api_url_missing');
    return value;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
    try {
        const value = await response.json();
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('invalid_json');
        }
        return value as Record<string, unknown>;
    } catch {
        throw new Error('invalid_json');
    }
}

function openDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
        throw new Error('indexeddb_unavailable');
    }
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('indexeddb_open_failed'));
    });
}

async function writeDraft(draft: PaidUploadDraft): Promise<void> {
    const database = await openDatabase();
    try {
        await idbRequest(
            database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(draft),
        );
    } finally {
        database.close();
    }
}

async function readAllDrafts(): Promise<PaidUploadDraft[]> {
    const database = await openDatabase();
    try {
        return await idbRequest<PaidUploadDraft[]>(
            database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll(),
        );
    } finally {
        database.close();
    }
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('indexeddb_request_failed'));
    });
}
