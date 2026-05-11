export interface Env {
    ALLOWED_ORIGINS?: string;
    CRUST_READ_ENDPOINT?: string;
    IPFS_GATEWAY_BASES?: string;
    CACHE_TTL_SECONDS?: string;
    CACHE_VERSION?: string;
    UPSTREAM_TIMEOUT_MS?: string;
}

type JsonBody = Record<string, unknown>;

const DEFAULT_ALLOWED_ORIGINS = 'https://youtick.net,https://www.youtick.net';
const DEFAULT_CRUST_READ_ENDPOINT = '';
const DEFAULT_IPFS_GATEWAY_BASES = [
    'https://gateway.lighthouse.storage/ipfs',
    'https://ipfs.io/ipfs',
    'https://4everland.io/ipfs',
    'https://w3s.link/ipfs',
    'https://dweb.link/ipfs',
].join(',');
const DEFAULT_CACHE_TTL_SECONDS = 300;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 4_000;
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|ba[a-z2-7]{57,})$/;

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return handleOptions(request, env);
        }

        if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/__health') {
            return jsonResponse(request, env, {
                status: 'ok',
                service: 'media-delivery',
                gateways: getGatewayBases(env).length,
                timestamp: new Date().toISOString(),
            });
        }

        if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/ipfs/')) {
            return handleIpfsRequest(request, env, ctx);
        }

        return jsonResponse(
            request,
            env,
            {
                error: 'not_found',
                endpoints: ['/__health', '/ipfs/:cid/:path*'],
            },
            404,
        );
    },
};

async function handleIpfsRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const parsedPath = parseIpfsPath(url.pathname);
    if (!parsedPath.ok) {
        return jsonResponse(request, env, { error: parsedPath.error }, 400);
    }

    const rangeHeader = request.headers.get('Range');
    const canUseCache = request.method === 'GET' && !rangeHeader;
    const cacheKey = canUseCache ? buildCacheKey(request, env) : null;

    if (cacheKey) {
        const cached = await caches.default.match(cacheKey);
        if (cached) {
            return withDeliveryHeaders(request, env, cached, {
                cacheState: 'HIT',
            });
        }
    }

    const upstream = await fetchFromGateways(parsedPath.path, request, env);
    if (!upstream.ok) {
        return jsonResponse(request, env, {
            error: 'gateway_fetch_failed',
            status: upstream.status,
            upstream: upstream.upstreamBase,
        }, upstream.status === 404 ? 404 : 502);
    }

    const response = withDeliveryHeaders(request, env, upstream.response, {
        cacheState: cacheKey ? 'MISS' : 'BYPASS',
        upstreamBase: upstream.upstreamBase,
        cacheTtlSeconds: getCacheTtlSeconds(env),
    });

    if (cacheKey && response.ok && response.status === 200) {
        ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    }

    return response;
}

async function fetchFromGateways(
    assetPath: string,
    request: Request,
    env: Env,
): Promise<{ ok: true; response: Response; upstreamBase: string } | { ok: false; status: number; upstreamBase?: string }> {
    let lastStatus = 502;
    const crustReadEndpoint = getCrustReadEndpoint(env);

    if (crustReadEndpoint && request.method === 'GET' && !request.headers.get('Range')) {
        const abortable = createAbortableController(getUpstreamTimeoutMs(env));
        try {
            const response = await fetch(`${crustReadEndpoint}?arg=${encodeURIComponent(assetPath)}`, {
                method: 'POST',
                signal: abortable.controller.signal,
            });

            if (response.ok) {
                abortable.cleanup();
                return { ok: true, response, upstreamBase: crustReadEndpoint };
            }

            lastStatus = response.status;
        } catch {
            lastStatus = 502;
        } finally {
            abortable.cleanup();
        }
    }

    for (const gatewayBase of getGatewayBases(env)) {
        const upstreamUrl = `${gatewayBase}/${assetPath}`;
        const headers = new Headers();
        const rangeHeader = request.headers.get('Range');
        const acceptHeader = request.headers.get('Accept');
        const abortable = createAbortableController(getUpstreamTimeoutMs(env));

        if (rangeHeader) {
            headers.set('Range', rangeHeader);
        }
        if (acceptHeader) {
            headers.set('Accept', acceptHeader);
        }

        try {
            const response = await fetch(upstreamUrl, {
                method: request.method,
                headers,
                signal: abortable.controller.signal,
            });

            if (response.ok || response.status === 206) {
                abortable.cleanup();
                return { ok: true, response, upstreamBase: gatewayBase };
            }

            lastStatus = response.status;
        } catch {
            lastStatus = 502;
        } finally {
            abortable.cleanup();
        }
    }

    return { ok: false, status: lastStatus };
}

function parseIpfsPath(pathname: string): { ok: true; path: string } | { ok: false; error: string } {
    const rawPath = pathname.slice('/ipfs/'.length);
    if (!rawPath) {
        return { ok: false, error: 'missing_cid' };
    }

    const decodedSegments: string[] = [];
    for (const segment of rawPath.split('/')) {
        if (!segment) {
            return { ok: false, error: 'invalid_ipfs_path' };
        }

        let decoded: string;
        try {
            decoded = decodeURIComponent(segment);
        } catch {
            return { ok: false, error: 'invalid_ipfs_path' };
        }

        if (decoded === '.' || decoded === '..' || decoded.includes('\\')) {
            return { ok: false, error: 'invalid_ipfs_path' };
        }

        decodedSegments.push(decoded);
    }

    const cid = decodedSegments[0];
    if (!CID_PATTERN.test(cid)) {
        return { ok: false, error: 'invalid_cid' };
    }

    return {
        ok: true,
        path: decodedSegments.map((segment) => encodeURIComponent(segment)).join('/'),
    };
}

function buildCacheKey(request: Request, env: Env): Request {
    const cacheUrl = new URL(request.url);
    if (env.CACHE_VERSION?.trim()) {
        cacheUrl.searchParams.set('__cv', env.CACHE_VERSION.trim());
    }

    return new Request(cacheUrl.toString(), { method: 'GET' });
}

function withDeliveryHeaders(
    request: Request,
    env: Env,
    response: Response,
    options: {
        cacheState: 'HIT' | 'MISS' | 'BYPASS';
        upstreamBase?: string;
        cacheTtlSeconds?: number;
    },
): Response {
    const headers = new Headers(response.headers);
    headers.set('X-Media-Delivery', 'youtick-media-delivery');
    headers.set('X-Media-Delivery-Cache', options.cacheState);
    headers.set('Access-Control-Expose-Headers', [
        'Accept-Ranges',
        'Content-Length',
        'Content-Range',
        'X-Media-Delivery',
        'X-Media-Delivery-Cache',
        'X-Media-Delivery-Upstream',
    ].join(', '));

    if (options.upstreamBase) {
        headers.set('X-Media-Delivery-Upstream', options.upstreamBase);
    }

    if (options.cacheState === 'MISS' && options.cacheTtlSeconds) {
        headers.set('Cache-Control', `public, max-age=0, s-maxage=${options.cacheTtlSeconds}`);
    } else if (options.cacheState === 'BYPASS') {
        headers.set('Cache-Control', 'no-store');
    }

    for (const [name, value] of Object.entries(corsHeaders(request, env))) {
        headers.set(name, value);
    }

    return new Response(request.method === 'HEAD' ? null : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
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
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
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

function getGatewayBases(env: Env): string[] {
    return (env.IPFS_GATEWAY_BASES || DEFAULT_IPFS_GATEWAY_BASES)
        .split(',')
        .map((value) => value.trim().replace(/\/+$/, ''))
        .filter(Boolean);
}

function getCrustReadEndpoint(env: Env): string | null {
    if (env.CRUST_READ_ENDPOINT === '') {
        return null;
    }

    return (env.CRUST_READ_ENDPOINT || DEFAULT_CRUST_READ_ENDPOINT).trim().replace(/\/+$/, '') || null;
}

function getCacheTtlSeconds(env: Env): number {
    const parsed = Number.parseInt(env.CACHE_TTL_SECONDS || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CACHE_TTL_SECONDS;
}

function getUpstreamTimeoutMs(env: Env): number {
    const parsed = Number.parseInt(env.UPSTREAM_TIMEOUT_MS || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_UPSTREAM_TIMEOUT_MS;
}

function createAbortableController(timeoutMs: number): {
    controller: AbortController;
    cleanup: () => void;
} {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    return {
        controller,
        cleanup: () => clearTimeout(timer),
    };
}
