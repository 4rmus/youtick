export interface Env {
    ALLOWED_ORIGINS?: string;
    STORAGE_PROVIDER?: string;
    LIGHTHOUSE_API_BASE?: string;
    LIGHTHOUSE_UPLOAD_BASE?: string;
    LIGHTHOUSE_API_KEY?: string;
    ENABLE_LIGHTHOUSE_UPLOADS?: string;
    MAX_UPLOAD_BYTES?: string;
}

type JsonBody = Record<string, unknown>;
type UploadEntry = {
    cid?: string;
    Name?: string;
    Hash?: string;
    Size?: string | number;
};
type UploadIntentRequest = {
    fileName?: string;
    sizeBytes?: number;
    contentType?: string;
};
type UploadableFile = Blob & { name: string; size: number };
type LighthouseUploadData = {
    cid?: string;
    Hash?: string;
    fileSizeInBytes?: string | number;
    Size?: string | number;
    fileName?: string;
    Name?: string;
    mimeType?: string;
    encryption?: boolean;
    txHash?: string;
};

const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:3001,https://youtick.net,https://www.youtick.net';
const DEFAULT_STORAGE_PROVIDER = 'lighthouse';
const DEFAULT_LIGHTHOUSE_API_BASE = 'https://api.lighthouse.storage';
const DEFAULT_LIGHTHOUSE_UPLOAD_BASE = 'https://upload.lighthouse.storage';
const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const RECOMMENDED_PROXY_PART_BYTES = 4 * 1024 * 1024;
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|ba[a-z2-7]{57,})/;

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return handleOptions(request, env);
        }

        if (request.method === 'GET' && url.pathname === '/__health') {
            return jsonResponse(request, env, {
                status: 'ok',
                service: 'storage-api',
                provider: getStorageProvider(env),
                timestamp: new Date().toISOString(),
            });
        }

        if (request.method === 'GET' && url.pathname === '/provider-health') {
            return jsonResponse(request, env, getProviderHealth(env));
        }

        if (request.method === 'POST' && url.pathname === '/pins') {
            return handlePinRequest(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/uploads/intent') {
            return handleUploadIntentRequest(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/uploads/directory') {
            return handleDirectoryUploadRequest(request, env);
        }

        if (request.method === 'POST' && url.pathname === '/uploads/file') {
            return handleFileUploadRequest(request, env);
        }

        const pinStatusMatch = url.pathname.match(/^\/pins\/([^/]+)\/status$/);
        if (request.method === 'GET' && pinStatusMatch) {
            return handlePinStatusRequest(request, env, pinStatusMatch[1]);
        }

        return jsonResponse(
            request,
            env,
            {
                error: 'not_found',
                endpoints: ['/__health', '/provider-health', '/pins', '/pins/:cid/status', '/uploads/intent', '/uploads/file', '/uploads/directory'],
            },
            404,
        );
    },
};

function getStorageProvider(env: Env): string {
    return env.STORAGE_PROVIDER?.trim() || DEFAULT_STORAGE_PROVIDER;
}

function getLighthouseApiBase(env: Env): string {
    return env.LIGHTHOUSE_API_BASE?.trim() || DEFAULT_LIGHTHOUSE_API_BASE;
}

function getLighthouseUploadBase(env: Env): string {
    return env.LIGHTHOUSE_UPLOAD_BASE?.trim() || DEFAULT_LIGHTHOUSE_UPLOAD_BASE;
}

function getProviderHealth(env: Env): JsonBody {
    const provider = getStorageProvider(env);

    if (provider !== 'lighthouse') {
        return {
            provider,
            ready: false,
            reason: 'unsupported_provider',
        };
    }

    if (!env.LIGHTHOUSE_API_KEY?.trim()) {
        return {
            provider,
            ready: false,
            reason: 'lighthouse_api_key_missing',
            apiBase: getLighthouseApiBase(env),
        };
    }

    return {
        provider,
        ready: true,
        apiBase: getLighthouseApiBase(env),
        uploadsEnabled: areLighthouseUploadsEnabled(env),
        uploadBase: getLighthouseUploadBase(env),
        maxUploadBytes: getMaxUploadBytes(env),
    };
}

async function handlePinRequest(request: Request, env: Env): Promise<Response> {
    const apiKey = getLighthouseApiKey(env);
    if (!apiKey) {
        return jsonResponse(request, env, {
            error: 'provider_not_configured',
            reason: 'lighthouse_api_key_missing',
        }, 503);
    }

    const body = await readJsonBody(request);
    if (!body.ok) {
        return jsonResponse(request, env, { error: 'invalid_json' }, 400);
    }

    const cid = typeof body.value.cid === 'string' ? body.value.cid.trim() : '';
    const fileName = typeof body.value.fileName === 'string' ? body.value.fileName.trim() : undefined;
    if (!isValidIpfsCid(cid)) {
        return jsonResponse(request, env, { error: 'invalid_cid' }, 400);
    }

    const upstream = await fetch(`${getLighthouseApiBase(env)}/api/lighthouse/pin`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            cid,
            ...(fileName ? { fileName } : {}),
        }),
    });

    const upstreamBody = await readUpstreamJson(upstream);
    if (!upstream.ok) {
        return jsonResponse(request, env, {
            error: 'provider_pin_failed',
            provider: 'lighthouse',
            status: upstream.status,
            details: upstreamBody,
        }, 502);
    }

    return jsonResponse(request, env, {
        provider: 'lighthouse',
        cid,
        pinned: true,
        upstream: upstreamBody,
    });
}

async function handleUploadIntentRequest(request: Request, env: Env): Promise<Response> {
    const body = await readJsonBody(request);
    if (!body.ok) {
        return jsonResponse(request, env, { error: 'invalid_json' }, 400);
    }

    const parsed = parseUploadIntentRequest(body.value);
    if (!parsed.ok) {
        return jsonResponse(request, env, { error: parsed.error }, 400);
    }

    const maxUploadBytes = getMaxUploadBytes(env);
    const recommendedPartBytes = Math.min(maxUploadBytes, RECOMMENDED_PROXY_PART_BYTES);
    const uploadsEnabled = areLighthouseUploadsEnabled(env);
    const providerReady = getStorageProvider(env) === 'lighthouse' && Boolean(getLighthouseApiKey(env));

    return jsonResponse(request, env, {
        provider: 'lighthouse',
        fileName: parsed.value.fileName,
        sizeBytes: parsed.value.sizeBytes,
        contentType: parsed.value.contentType,
        uploadsEnabled,
        providerReady,
        directUpload: {
            available: false,
            reason: 'scoped_direct_upload_token_unavailable',
        },
        workerProxy: {
            available: uploadsEnabled && providerReady,
            uploadUrl: '/uploads/file',
            maxPartBytes: maxUploadBytes,
            recommendedPartBytes,
            requiresChunking: parsed.value.sizeBytes > maxUploadBytes,
        },
    });
}

async function handleFileUploadRequest(request: Request, env: Env): Promise<Response> {
    if (!areLighthouseUploadsEnabled(env)) {
        return jsonResponse(request, env, {
            error: 'uploads_disabled',
            reason: 'enable_lighthouse_uploads_required',
        }, 403);
    }

    const apiKey = getLighthouseApiKey(env);
    if (!apiKey) {
        return jsonResponse(request, env, {
            error: 'provider_not_configured',
            reason: 'lighthouse_api_key_missing',
        }, 503);
    }

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
        return jsonResponse(request, env, { error: 'invalid_content_type' }, 400);
    }

    const incoming = await request.formData();
    const value = incoming.get('file');
    if (!isUploadableFile(value)) {
        return jsonResponse(request, env, { error: 'missing_file' }, 400);
    }

    if (value.size > getMaxUploadBytes(env)) {
        return jsonResponse(request, env, {
            error: 'upload_too_large',
            maxUploadBytes: getMaxUploadBytes(env),
        }, 413);
    }

    const path = sanitizeUploadPath(value.name);
    if (!path) {
        return jsonResponse(request, env, { error: 'invalid_upload_path' }, 400);
    }

    const upstreamForm = new FormData();
    upstreamForm.append('file', value, getUploadFileName(path));

    const upstream = await fetch(`${getLighthouseUploadBase(env)}/api/v0/add?cid-version=1`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
        },
        body: upstreamForm,
    });
    const upstreamBody = await readUpstreamJson(upstream);

    if (!upstream.ok) {
        return jsonResponse(request, env, {
            error: 'provider_upload_failed',
            provider: 'lighthouse',
            status: upstream.status,
            details: upstreamBody,
        }, 502);
    }

    const uploadEntry = parseUploadEntries(upstreamBody)[0] || getUploadData(upstreamBody);
    const cid = uploadEntry?.Hash || uploadEntry?.cid;
    if (!cid || !isValidIpfsCid(cid)) {
        return jsonResponse(request, env, {
            error: 'provider_upload_missing_cid',
            provider: 'lighthouse',
            details: upstreamBody,
        }, 502);
    }

    return jsonResponse(request, env, {
        provider: 'lighthouse',
        cid,
        path,
        size: value.size,
        upstream: upstreamBody,
    });
}

async function handleDirectoryUploadRequest(request: Request, env: Env): Promise<Response> {
    if (!areLighthouseUploadsEnabled(env)) {
        return jsonResponse(request, env, {
            error: 'uploads_disabled',
            reason: 'enable_lighthouse_uploads_required',
        }, 403);
    }

    const apiKey = getLighthouseApiKey(env);
    if (!apiKey) {
        return jsonResponse(request, env, {
            error: 'provider_not_configured',
            reason: 'lighthouse_api_key_missing',
        }, 503);
    }

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
        return jsonResponse(request, env, { error: 'invalid_content_type' }, 400);
    }

    const incoming = await request.formData();
    const upstreamForm = new FormData();
    const entries: Array<{ path: string; size: number }> = [];
    let totalSize = 0;

    for (const [fieldName, value] of incoming.entries()) {
        if (fieldName !== 'file' || !isUploadableFile(value)) {
            continue;
        }

        const path = sanitizeUploadPath(value.name);
        if (!path) {
            return jsonResponse(request, env, { error: 'invalid_upload_path' }, 400);
        }

        totalSize += value.size;
        if (totalSize > getMaxUploadBytes(env)) {
            return jsonResponse(request, env, {
                error: 'upload_too_large',
                maxUploadBytes: getMaxUploadBytes(env),
            }, 413);
        }

        entries.push({ path, size: value.size });
        upstreamForm.append('file', value, path);
    }

    if (entries.length === 0) {
        return jsonResponse(request, env, { error: 'missing_files' }, 400);
    }

    const upstream = await fetch(`${getLighthouseUploadBase(env)}/api/v0/add?wrap-with-directory=true&cid-version=1`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
        },
        body: upstreamForm,
    });
    const upstreamBody = await readUpstreamJson(upstream);

    if (!upstream.ok) {
        return jsonResponse(request, env, {
            error: 'provider_upload_failed',
            provider: 'lighthouse',
            status: upstream.status,
            details: upstreamBody,
        }, 502);
    }

    const uploadEntries = parseUploadEntries(upstreamBody);
    const rootEntry = findRootEntry(uploadEntries);
    const uploadData = getUploadData(upstreamBody);
    const rootCid = rootEntry?.Hash || uploadData?.Hash || uploadData?.cid;

    if (!rootCid || !isValidIpfsCid(rootCid)) {
        return jsonResponse(request, env, {
            error: 'provider_upload_missing_root_cid',
            provider: 'lighthouse',
            details: upstreamBody,
        }, 502);
    }

    return jsonResponse(request, env, {
        provider: 'lighthouse',
        cid: rootCid,
        size: totalSize,
        entries: uploadEntries.map((entry) => ({
            path: entry.Name || '',
            cid: entry.Hash,
            size: Number(entry.Size) || 0,
        })),
        upstream: upstreamBody,
    });
}

async function handlePinStatusRequest(request: Request, env: Env, rawCid: string): Promise<Response> {
    const cid = decodeURIComponent(rawCid).trim();
    if (!isValidIpfsCid(cid)) {
        return jsonResponse(request, env, { error: 'invalid_cid' }, 400);
    }

    const headers = new Headers({ 'Accept': 'application/json' });
    const apiKey = getLighthouseApiKey(env);
    if (apiKey) {
        headers.set('Authorization', `Bearer ${apiKey}`);
    }

    const upstream = await fetch(`${getLighthouseApiBase(env)}/api/lighthouse/file_info?cid=${encodeURIComponent(cid)}`, {
        method: 'GET',
        headers,
    });
    const upstreamBody = await readUpstreamJson(upstream);
    const checkedAt = new Date().toISOString();

    if (upstream.status === 404) {
        return jsonResponse(request, env, {
            provider: 'lighthouse',
            cid,
            found: false,
            upstreamStatus: 404,
            checkedAt,
        });
    }

    if (!upstream.ok) {
        return jsonResponse(request, env, {
            error: 'provider_status_failed',
            provider: 'lighthouse',
            cid,
            status: upstream.status,
            details: upstreamBody,
            checkedAt,
        }, 502);
    }

    const data = getLighthouseData(upstreamBody);
    const upstreamCid = data ? getLighthouseCid(data) : undefined;
    return jsonResponse(request, env, {
        provider: 'lighthouse',
        cid,
        found: upstreamCid === cid,
        upstreamCid,
        fileName: data ? getLighthouseFileName(data) : undefined,
        fileSizeInBytes: data ? getLighthouseFileSize(data) : undefined,
        mimeType: data?.mimeType,
        encryption: data?.encryption,
        txHash: data?.txHash,
        upstreamStatus: upstream.status,
        checkedAt,
    });
}

function handleOptions(request: Request, env: Env): Response {
    return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
    });
}

function jsonResponse(
    request: Request,
    env: Env,
    body: JsonBody,
    status = 200,
): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            ...corsHeaders(request, env),
        },
    });
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
    const requestOrigin = request.headers.get('Origin');
    const allowedOrigins = getAllowedOrigins(env);
    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Vary': 'Origin',
    };

    if (requestOrigin && allowedOrigins.has(requestOrigin)) {
        headers['Access-Control-Allow-Origin'] = requestOrigin;
    }

    return headers;
}

function getAllowedOrigins(env: Env): Set<string> {
    return new Set(
        (env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean),
    );
}

function getLighthouseApiKey(env: Env): string | null {
    const raw = env.LIGHTHOUSE_API_KEY?.trim();
    if (!raw) {
        return null;
    }

    return raw.replace(/^(['"])(.*)\1$/, '$2');
}

function areLighthouseUploadsEnabled(env: Env): boolean {
    return env.ENABLE_LIGHTHOUSE_UPLOADS === 'true';
}

function getMaxUploadBytes(env: Env): number {
    const parsed = Number.parseInt(env.MAX_UPLOAD_BYTES || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_BYTES;
}

function isValidIpfsCid(value: string): boolean {
    return CID_PATTERN.test(value);
}

async function readJsonBody(request: Request): Promise<{ ok: true; value: JsonBody } | { ok: false }> {
    try {
        const value = await request.json();
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return { ok: false };
        }
        return { ok: true, value: value as JsonBody };
    } catch {
        return { ok: false };
    }
}

function parseUploadIntentRequest(value: JsonBody): { ok: true; value: Required<UploadIntentRequest> } | { ok: false; error: string } {
    const fileName = typeof value.fileName === 'string' ? sanitizeUploadPath(value.fileName) : '';
    if (!fileName) {
        return { ok: false, error: 'invalid_file_name' };
    }

    const sizeBytes = typeof value.sizeBytes === 'number' ? value.sizeBytes : Number.NaN;
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
        return { ok: false, error: 'invalid_size_bytes' };
    }

    const contentType = typeof value.contentType === 'string' && value.contentType.trim()
        ? value.contentType.trim()
        : 'application/octet-stream';

    return {
        ok: true,
        value: {
            fileName,
            sizeBytes,
            contentType,
        },
    };
}

async function readUpstreamJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        const entries = text
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter((entry): entry is unknown => entry !== null);
        if (entries.length > 0) {
            return entries;
        }

        return { text };
    }
}

function getLighthouseData(value: unknown): LighthouseUploadData | null {
    const data = getUploadData(value);
    if (!data) {
        return null;
    }

    return data as LighthouseUploadData;
}

function getUploadData(value: unknown): UploadEntry | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const data = (value as { data?: unknown }).data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data as UploadEntry;
    }

    const entry = value as UploadEntry;
    if (typeof entry.cid === 'string' || typeof entry.Hash === 'string') {
        return entry;
    }

    return null;
}

function getLighthouseCid(data: LighthouseUploadData): string | undefined {
    return typeof data.cid === 'string' ? data.cid : data.Hash;
}

function getLighthouseFileName(data: LighthouseUploadData): string | undefined {
    return typeof data.fileName === 'string' ? data.fileName : data.Name;
}

function getLighthouseFileSize(data: LighthouseUploadData): string | number | undefined {
    if (typeof data.fileSizeInBytes === 'string' || typeof data.fileSizeInBytes === 'number') {
        return data.fileSizeInBytes;
    }

    return data.Size;
}

function parseUploadEntries(value: unknown): UploadEntry[] {
    if (Array.isArray(value)) {
        return value
            .map((entry) => parseUploadEntry(entry))
            .filter((entry): entry is UploadEntry => entry !== null);
    }

    const data = value && typeof value === 'object' ? (value as { data?: unknown }).data : undefined;
    if (Array.isArray(data)) {
        return data
            .map((entry) => parseUploadEntry(entry))
            .filter((entry): entry is UploadEntry => entry !== null);
    }

    const entry = parseUploadEntry(data || value);
    return entry ? [entry] : [];
}

function parseUploadEntry(value: unknown): UploadEntry | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const entry = value as UploadEntry;
    if (typeof entry.Hash !== 'string') {
        return null;
    }

    return entry;
}

function findRootEntry(entries: UploadEntry[]): UploadEntry | undefined {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        if ((entries[index].Name || '') === '') {
            return entries[index];
        }
    }

    return undefined;
}

function isUploadableFile(value: unknown): value is UploadableFile {
    return typeof value === 'object'
        && value !== null
        && typeof (value as { name?: unknown }).name === 'string'
        && typeof (value as { size?: unknown }).size === 'number'
        && typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function';
}

function sanitizeUploadPath(value: string): string | null {
    const path = value.trim().replace(/^\/+/, '');
    if (!path) {
        return null;
    }

    const segments = path.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) {
        return null;
    }

    return segments.join('/');
}

function getUploadFileName(path: string): string {
    return path.split('/').pop() || path;
}
