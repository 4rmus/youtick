import { APP_CONFIG, FEATURE_FLAGS } from '@/lib/constants';

export type StorageApiPinOutcome =
    | { status: 'skipped'; reason: 'disabled' | 'missing_url' }
    | { status: 'pinned'; cid: string; provider: string }
    | { status: 'failed'; cid: string; reason: string; httpStatus?: number };

export function isLighthousePersistencePilotEnabled(): boolean {
    return FEATURE_FLAGS.enableLighthousePersistence && getStorageApiBaseUrl() !== null;
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
