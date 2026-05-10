import { APP_CONFIG, FEATURE_FLAGS } from '@/lib/constants';

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

export function isLighthousePersistencePilotEnabled(): boolean {
    return FEATURE_FLAGS.enableLighthousePersistence && getStorageApiBaseUrl() !== null;
}

export function isLighthousePrimaryUploadEnabled(): boolean {
    return FEATURE_FLAGS.enableLighthousePrimaryUpload && getStorageApiBaseUrl() !== null;
}

export async function uploadDirectoryWithStorageApi(
    files: Array<{ path: string; file: Blob }>,
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
        xhr.send(formData);
    });
}

export async function uploadFileWithStorageApi(
    path: string,
    file: Blob,
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
        xhr.send(formData);
    });
}

export async function pinCidWithStorageApi(params: {
    cid: string;
    fileName?: string;
}): Promise<StorageApiPinOutcome> {
    if (!FEATURE_FLAGS.enableLighthousePersistence) {
        return { status: 'skipped', reason: 'disabled' };
    }

    const baseUrl = getStorageApiBaseUrl();
    if (!baseUrl) {
        return { status: 'skipped', reason: 'missing_url' };
    }

    try {
        const response = await fetch(`${baseUrl}/pins`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
    if (!FEATURE_FLAGS.enableLighthousePersistence) {
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
