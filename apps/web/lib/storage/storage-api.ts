import { APP_CONFIG, FEATURE_FLAGS } from '@/lib/constants';
import { base64Decode } from '@/lib/crypto/codec';
import type { WalletInstance } from '@/lib/types';

export type StorageApiAuthSigner = Pick<WalletInstance, 'signMessage'>;

export type StorageApiPinOutcome =
    | { status: 'skipped'; reason: 'disabled' | 'missing_url' }
    | { status: 'pinned'; cid: string; provider: string }
    | { status: 'failed'; cid: string; reason: string; httpStatus?: number };

export type StorageApiDirectoryUploadResult = {
    cid: string;
    size: number;
    entries: Array<{ path: string; cid: string; size: number }>;
};

export type StorageApiFileUploadResult = {
    cid: string;
    path: string;
    size: number;
};

type StorageApiUploadKind = 'file' | 'directory' | 'pin';

type StorageApiUploadIntent = {
    token: string;
    idempotencyKey: string;
    expiresAt: string;
};

type StorageApiAuthChallenge = {
    challengeId: string;
    message: string;
    recipient: string;
    nonce: string;
    expiresAt: number;
};

type StorageApiAuthToken = {
    token: string;
    accountId: string;
    expiresAt: number;
};

export type StorageApiPinStatusOutcome =
    | { status: 'skipped'; reason: 'disabled' | 'missing_url' }
    | {
        status: 'found';
        cid: string;
        provider: string;
        fileName?: string;
        fileSizeInBytes?: string | number;
        upstreamCid?: string;
        upstreamStatus?: number;
        checkedAt?: string;
    }
    | { status: 'missing'; cid: string; provider: string; upstreamStatus?: number; checkedAt?: string }
    | { status: 'failed'; cid: string; reason: string; httpStatus?: number };

const STORAGE_AUTH_CACHE_PREFIX = 'youtick:storage-auth:';
const STORAGE_AUTH_CACHE_SKEW_MS = 30_000;

export function isLighthousePersistencePilotEnabled(): boolean {
    return FEATURE_FLAGS.enableLighthousePersistence && getStorageApiBaseUrl() !== null;
}

export function isLighthousePrimaryUploadEnabled(): boolean {
    return FEATURE_FLAGS.enableLighthousePrimaryUpload && getStorageApiBaseUrl() !== null;
}

export async function uploadDirectoryWithStorageApi(
    files: Array<{ path: string; file: Blob }>,
    accountId: string,
    authSigner: StorageApiAuthSigner,
    options?: {
        onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void;
        timeout?: number;
    },
): Promise<StorageApiDirectoryUploadResult> {
    if (!FEATURE_FLAGS.enableLighthousePrimaryUpload) {
        throw new Error('Lighthouse primary upload is disabled');
    }

    const baseUrl = getStorageApiBaseUrl();
    if (!baseUrl) {
        throw new Error('Storage API URL is missing');
    }

    const formData = new FormData();
    const totalSize = files.reduce((sum, entry) => sum + entry.file.size, 0);
    const intent = await createUploadIntent({
        accountId,
        authSigner,
        uploadKind: 'directory',
        fileName: 'directory',
        sizeBytes: totalSize,
        contentType: 'multipart/form-data',
    });

    for (const entry of files) {
        formData.append('file', entry.file, entry.path.replace(/^\/+/, ''));
    }

    return await new Promise<StorageApiDirectoryUploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const timer = options?.timeout
            ? setTimeout(() => {
                xhr.abort();
                reject(new Error(`Storage API upload timed out after ${options.timeout}ms`));
            }, options.timeout)
            : null;

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable && options?.onProgress) {
                options.onProgress({
                    loaded: event.loaded,
                    total: event.total,
                    percentage: Math.round((event.loaded / event.total) * 100),
                });
            }
        });

        xhr.addEventListener('load', () => {
            if (timer) {
                clearTimeout(timer);
            }

            const body = parseJsonBody(xhr.responseText);
            if (xhr.status < 200 || xhr.status >= 300) {
                reject(new Error(getErrorReason(body) || `Storage API upload returned HTTP ${xhr.status}`));
                return;
            }

            if (!body || typeof body.cid !== 'string') {
                reject(new Error('Storage API upload returned no root CID'));
                return;
            }

            const entries = Array.isArray(body.entries)
                ? body.entries
                    .map(parseUploadEntry)
                    .filter((entry): entry is { path: string; cid: string; size: number } => entry !== null)
                : [];

            resolve({
                cid: body.cid,
                size: typeof body.size === 'number' ? body.size : totalSize,
                entries,
            });
        });

        xhr.addEventListener('error', () => {
            if (timer) {
                clearTimeout(timer);
            }
            reject(new Error('Network error during Storage API upload'));
        });

        xhr.addEventListener('abort', () => {
            if (timer) {
                clearTimeout(timer);
            }
            reject(new Error('Storage API upload aborted'));
        });

        xhr.open('POST', `${baseUrl}/uploads/directory`);
        xhr.setRequestHeader('Authorization', `Bearer ${intent.token}`);
        xhr.send(formData);
    });
}

export async function uploadFileWithStorageApi(
    path: string,
    file: Blob,
    accountId: string,
    authSigner: StorageApiAuthSigner,
    options?: {
        onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void;
        timeout?: number;
    },
): Promise<StorageApiFileUploadResult> {
    if (!FEATURE_FLAGS.enableLighthousePrimaryUpload) {
        throw new Error('Lighthouse primary upload is disabled');
    }

    const baseUrl = getStorageApiBaseUrl();
    if (!baseUrl) {
        throw new Error('Storage API URL is missing');
    }

    const normalizedPath = path.replace(/^\/+/, '');
    const intent = await createUploadIntent({
        accountId,
        authSigner,
        uploadKind: 'file',
        fileName: normalizedPath,
        sizeBytes: file.size,
        contentType: file.type || 'application/octet-stream',
    });
    const formData = new FormData();
    formData.append('file', file, normalizedPath);

    return await new Promise<StorageApiFileUploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const timer = options?.timeout
            ? setTimeout(() => {
                xhr.abort();
                reject(new Error(`Storage API file upload timed out after ${options.timeout}ms`));
            }, options.timeout)
            : null;

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable && options?.onProgress) {
                options.onProgress({
                    loaded: event.loaded,
                    total: event.total,
                    percentage: Math.round((event.loaded / event.total) * 100),
                });
            }
        });

        xhr.addEventListener('load', () => {
            if (timer) {
                clearTimeout(timer);
            }

            const body = parseJsonBody(xhr.responseText);
            if (xhr.status < 200 || xhr.status >= 300) {
                reject(new Error(getErrorReason(body) || `Storage API file upload returned HTTP ${xhr.status}`));
                return;
            }

            if (!body || typeof body.cid !== 'string') {
                reject(new Error('Storage API file upload returned no CID'));
                return;
            }

            resolve({
                cid: body.cid,
                path: typeof body.path === 'string' ? body.path : normalizedPath,
                size: typeof body.size === 'number' ? body.size : file.size,
            });
        });

        xhr.addEventListener('error', () => {
            if (timer) {
                clearTimeout(timer);
            }
            reject(new Error('Network error during Storage API file upload'));
        });

        xhr.addEventListener('abort', () => {
            if (timer) {
                clearTimeout(timer);
            }
            reject(new Error('Storage API file upload aborted'));
        });

        xhr.open('POST', `${baseUrl}/uploads/file`);
        xhr.setRequestHeader('Authorization', `Bearer ${intent.token}`);
        xhr.send(formData);
    });
}

export async function pinCidWithStorageApi(params: {
    cid: string;
    fileName?: string;
    accountId?: string;
    authSigner?: StorageApiAuthSigner;
}): Promise<StorageApiPinOutcome> {
    if (!FEATURE_FLAGS.enableLighthousePersistence) {
        return { status: 'skipped', reason: 'disabled' };
    }

    const baseUrl = getStorageApiBaseUrl();
    if (!baseUrl) {
        return { status: 'skipped', reason: 'missing_url' };
    }

    if (!params.accountId) {
        return { status: 'failed', cid: params.cid, reason: 'account_id_required' };
    }
    if (!params.authSigner) {
        return { status: 'failed', cid: params.cid, reason: 'auth_signer_required' };
    }

    try {
        const intent = await createUploadIntent({
            accountId: params.accountId,
            authSigner: params.authSigner,
            uploadKind: 'pin',
            fileName: params.fileName || params.cid,
            sizeBytes: 1,
            contentType: 'application/ipfs-cid',
            cid: params.cid,
        });
        const response = await fetch(`${baseUrl}/pins`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${intent.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                cid: params.cid,
                ...(params.fileName ? { fileName: params.fileName } : {}),
            }),
        });
        const body = await readJson(response);

        if (!response.ok) {
            return {
                status: 'failed',
                cid: params.cid,
                reason: getErrorReason(body) || `HTTP ${response.status}`,
                httpStatus: response.status,
            };
        }

        const provider = typeof body?.provider === 'string' ? body.provider : 'storage-api';
        return {
            status: 'pinned',
            cid: params.cid,
            provider,
        };
    } catch (error) {
        return {
            status: 'failed',
            cid: params.cid,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
}

export async function getCidPinStatusFromStorageApi(cid: string): Promise<StorageApiPinStatusOutcome> {
    if (!FEATURE_FLAGS.enableLighthousePersistence && !FEATURE_FLAGS.enableLighthousePrimaryUpload) {
        return { status: 'skipped', reason: 'disabled' };
    }

    const baseUrl = getStorageApiBaseUrl();
    if (!baseUrl) {
        return { status: 'skipped', reason: 'missing_url' };
    }

    try {
        const response = await fetch(`${baseUrl}/pins/${encodeURIComponent(cid)}/status`);
        const body = await readJson(response);

        if (!response.ok) {
            return {
                status: 'failed',
                cid,
                reason: getErrorReason(body) || `HTTP ${response.status}`,
                httpStatus: response.status,
            };
        }

        const provider = typeof body?.provider === 'string' ? body.provider : 'storage-api';
        if (body?.found === true) {
            const fileName = typeof body.fileName === 'string' ? body.fileName : undefined;
            const fileSizeInBytes =
                typeof body.fileSizeInBytes === 'string' || typeof body.fileSizeInBytes === 'number'
                    ? body.fileSizeInBytes
                    : undefined;
            const upstreamCid = typeof body.upstreamCid === 'string' ? body.upstreamCid : undefined;
            const upstreamStatus = typeof body.upstreamStatus === 'number' ? body.upstreamStatus : undefined;
            const checkedAt = typeof body.checkedAt === 'string' ? body.checkedAt : undefined;

            return {
                status: 'found',
                cid,
                provider,
                ...(fileName ? { fileName } : {}),
                ...(fileSizeInBytes !== undefined ? { fileSizeInBytes } : {}),
                ...(upstreamCid ? { upstreamCid } : {}),
                ...(upstreamStatus !== undefined ? { upstreamStatus } : {}),
                ...(checkedAt ? { checkedAt } : {}),
            };
        }

        const upstreamStatus = typeof body?.upstreamStatus === 'number' ? body.upstreamStatus : undefined;
        const checkedAt = typeof body?.checkedAt === 'string' ? body.checkedAt : undefined;

        return {
            status: 'missing',
            cid,
            provider,
            ...(upstreamStatus !== undefined ? { upstreamStatus } : {}),
            ...(checkedAt ? { checkedAt } : {}),
        };
    } catch (error) {
        return {
            status: 'failed',
            cid,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
}

function getStorageApiBaseUrl(): string | null {
    const value = APP_CONFIG.storageApiUrl.trim().replace(/\/+$/, '');
    return value || null;
}

async function createUploadIntent(params: {
    accountId: string;
    authSigner: StorageApiAuthSigner;
    uploadKind: StorageApiUploadKind;
    fileName: string;
    sizeBytes: number;
    contentType: string;
    cid?: string;
}): Promise<StorageApiUploadIntent> {
    const baseUrl = getStorageApiBaseUrl();
    if (!baseUrl) {
        throw new Error('Storage API URL is missing');
    }

    const uploadAuth = await requestStorageUploadAuthToken(baseUrl, params.accountId, params.authSigner);
    const response = await fetch(`${baseUrl}/uploads/intent`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${uploadAuth.token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            uploadKind: params.uploadKind,
            fileName: params.fileName,
            sizeBytes: params.sizeBytes,
            contentType: params.contentType,
            ...(params.cid ? { cid: params.cid } : {}),
        }),
    });
    const body = await readJson(response);

    if (!response.ok) {
        throw new Error(getErrorReason(body) || `Storage API upload intent returned HTTP ${response.status}`);
    }

    const proxy = body?.workerProxy;
    if (!proxy || typeof proxy !== 'object' || Array.isArray(proxy)) {
        throw new Error('Storage API upload intent returned no worker proxy details');
    }

    const intentToken = (proxy as Record<string, unknown>).intentToken;
    const idempotencyKey = (proxy as Record<string, unknown>).idempotencyKey;
    const expiresAt = (proxy as Record<string, unknown>).expiresAt;
    if (
        typeof intentToken !== 'string'
        || typeof idempotencyKey !== 'string'
        || typeof expiresAt !== 'string'
    ) {
        throw new Error('Storage API upload intent returned no upload token');
    }

    return {
        token: intentToken,
        idempotencyKey,
        expiresAt,
    };
}

async function requestStorageUploadAuthToken(
    baseUrl: string,
    accountId: string,
    authSigner: StorageApiAuthSigner,
): Promise<StorageApiAuthToken> {
    const cached = readCachedStorageAuthToken(baseUrl, accountId);
    if (cached) {
        return cached;
    }

    const challengeResponse = await fetch(`${baseUrl}/uploads/auth/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
    });
    const challengeBody = await readJson(challengeResponse);
    if (!challengeResponse.ok) {
        throw new Error(getErrorReason(challengeBody) || `Storage API auth challenge returned HTTP ${challengeResponse.status}`);
    }

    const challenge = parseStorageAuthChallenge(challengeBody);
    if (!challenge) {
        throw new Error('Storage API auth challenge returned an invalid response');
    }

    const signedMessage = await authSigner.signMessage({
        message: challenge.message,
        recipient: challenge.recipient,
        nonce: base64Decode(challenge.nonce),
    });
    if (!signedMessage) {
        throw new Error('Wallet did not return a signed storage auth message');
    }

    const verifyResponse = await fetch(`${baseUrl}/uploads/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            challengeId: challenge.challengeId,
            accountId: signedMessage.accountId,
            publicKey: signedMessage.publicKey,
            signature: signedMessage.signature,
        }),
    });
    const verifyBody = await readJson(verifyResponse);
    if (!verifyResponse.ok) {
        throw new Error(getErrorReason(verifyBody) || `Storage API auth verify returned HTTP ${verifyResponse.status}`);
    }

    const authToken = parseStorageAuthToken(verifyBody);
    if (!authToken) {
        throw new Error('Storage API auth verify returned no token');
    }

    persistStorageAuthToken(baseUrl, authToken);
    return authToken;
}

function parseStorageAuthChallenge(body: Record<string, unknown> | null): StorageApiAuthChallenge | null {
    if (!body
        || typeof body.challengeId !== 'string'
        || typeof body.message !== 'string'
        || typeof body.recipient !== 'string'
        || typeof body.nonce !== 'string'
        || typeof body.expiresAt !== 'number') {
        return null;
    }

    return {
        challengeId: body.challengeId,
        message: body.message,
        recipient: body.recipient,
        nonce: body.nonce,
        expiresAt: body.expiresAt,
    };
}

function parseStorageAuthToken(body: Record<string, unknown> | null): StorageApiAuthToken | null {
    if (!body
        || typeof body.token !== 'string'
        || typeof body.accountId !== 'string'
        || typeof body.expiresAt !== 'number') {
        return null;
    }

    return {
        token: body.token,
        accountId: body.accountId,
        expiresAt: body.expiresAt,
    };
}

function readCachedStorageAuthToken(baseUrl: string, accountId: string): StorageApiAuthToken | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const cacheKey = getStorageAuthCacheKey(baseUrl, accountId);
        const raw = window.sessionStorage.getItem(cacheKey);
        const token = raw ? parseStorageAuthToken(JSON.parse(raw) as Record<string, unknown>) : null;
        if (!token || Date.now() + STORAGE_AUTH_CACHE_SKEW_MS >= token.expiresAt) {
            if (raw) {
                window.sessionStorage.removeItem(cacheKey);
            }
            return null;
        }

        return token;
    } catch {
        return null;
    }
}

function persistStorageAuthToken(baseUrl: string, token: StorageApiAuthToken): void {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.sessionStorage.setItem(getStorageAuthCacheKey(baseUrl, token.accountId), JSON.stringify(token));
    } catch {
        // Best effort cache only.
    }
}

function getStorageAuthCacheKey(baseUrl: string, accountId: string): string {
    return `${STORAGE_AUTH_CACHE_PREFIX}${baseUrl}:${accountId}`;
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
    try {
        const value = await response.json();
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value as Record<string, unknown>
            : null;
    } catch {
        return null;
    }
}

function parseJsonBody(text: string): Record<string, unknown> | null {
    try {
        const value = JSON.parse(text);
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value as Record<string, unknown>
            : null;
    } catch {
        return null;
    }
}

function getErrorReason(body: Record<string, unknown> | null): string | null {
    if (!body) {
        return null;
    }

    if (typeof body.error === 'string') {
        return body.error;
    }

    if (typeof body.reason === 'string') {
        return body.reason;
    }

    return null;
}

function parseUploadEntry(value: unknown): { path: string; cid: string; size: number } | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const entry = value as Record<string, unknown>;
    if (typeof entry.path !== 'string' || typeof entry.cid !== 'string') {
        return null;
    }

    return {
        path: entry.path,
        cid: entry.cid,
        size: typeof entry.size === 'number' ? entry.size : 0,
    };
}
