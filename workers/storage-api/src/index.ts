export interface Env {
    ALLOWED_ORIGINS?: string;
    STORAGE_PROVIDER?: string;
    LIGHTHOUSE_API_BASE?: string;
    LIGHTHOUSE_API_KEY?: string;
}

type JsonBody = Record<string, unknown>;
type LighthouseUploadData = {
    cid?: string;
    fileSizeInBytes?: string | number;
    fileName?: string;
    mimeType?: string;
    encryption?: boolean;
    txHash?: string;
};

const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:3001,https://youtick.net,https://www.youtick.net';
const DEFAULT_STORAGE_PROVIDER = 'lighthouse';
const DEFAULT_LIGHTHOUSE_API_BASE = 'https://api.lighthouse.storage';
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

        const pinStatusMatch = url.pathname.match(/^\/pins\/([^/]+)\/status$/);
        if (request.method === 'GET' && pinStatusMatch) {
            return handlePinStatusRequest(request, env, pinStatusMatch[1]);
        }

        return jsonResponse(
            request,
            env,
            {
                error: 'not_found',
                endpoints: ['/__health', '/provider-health', '/pins', '/pins/:cid/status'],
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

async function handlePinStatusRequest(request: Request, env: Env, rawCid: string): Promise<Response> {
    const cid = decodeURIComponent(rawCid).trim();
    if (!isValidIpfsCid(cid)) {
        return jsonResponse(request, env, { error: 'invalid_cid' }, 400);
    }

    const upstream = await fetch(`${getLighthouseApiBase(env)}/api/lighthouse/file_info?cid=${encodeURIComponent(cid)}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
    });
    const upstreamBody = await readUpstreamJson(upstream);

    if (upstream.status === 404) {
        return jsonResponse(request, env, {
            provider: 'lighthouse',
            cid,
            found: false,
            upstreamStatus: 404,
        });
    }

    if (!upstream.ok) {
        return jsonResponse(request, env, {
            error: 'provider_status_failed',
            provider: 'lighthouse',
            cid,
            status: upstream.status,
            details: upstreamBody,
        }, 502);
    }

    const data = getLighthouseData(upstreamBody);
    return jsonResponse(request, env, {
        provider: 'lighthouse',
        cid,
        found: data?.cid === cid,
        fileName: data?.fileName,
        fileSizeInBytes: data?.fileSizeInBytes,
        mimeType: data?.mimeType,
        encryption: data?.encryption,
        txHash: data?.txHash,
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

async function readUpstreamJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return { text };
    }
}

function getLighthouseData(value: unknown): LighthouseUploadData | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const data = (value as { data?: unknown }).data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return null;
    }

    return data as LighthouseUploadData;
}
