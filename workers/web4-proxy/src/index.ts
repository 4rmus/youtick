/**
 * YouTick Web4 Proxy Worker
 *
 * Reverse proxy that serves youtick.net by forwarding requests to the
 * Web4 gateway at youtick.near.page. This allows using a custom domain
 * while keeping the application fully deployed on NEAR Web4.
 *
 * Flow: youtick.net → Cloudflare Workers → youtick.near.page → web4_get() → IPFS
 */

export interface Env {
    WEB4_ORIGIN: string;
    WEB4_FALLBACK_ORIGIN?: string;
    ALLOWED_DOMAINS: string;
    CACHE_TTL: string;
    CACHE_VERSION?: string;
    ONBOARDING_KEYS?: string;
    TURNSTILE_SECRET_KEY?: string;
}

/** Content types that should be cached aggressively */
const STATIC_EXTENSIONS = new Set([
    '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg',
    '.ico', '.woff', '.woff2', '.ttf', '.webp', '.wasm', '.map',
]);

const NEAR_RPC_UPSTREAMS = [
    'https://free.rpc.fastnear.com/',
    'https://rpc.mainnet.near.org/',
    'https://near.drpc.org/',
];
const NEAR_RPC_CACHE_TTL_SECONDS = 5;
const NEAR_RPC_CACHEABLE_VIEW_METHODS = new Set([
    'get_event',
    'get_events',
    'get_events_count',
    'get_all_events',
    'get_trial_pool_balance',
    'get_daily_trial_count',
    'get_onboarding_config',
    'get_gift_info_full',
    'get_trial_invite_info',
    'is_onboarding_key',
    'list_decryption_operators',
    'get_threshold_config',
]);
const pendingNearRpcRequests = new Map<string, Promise<Response>>();
const STRIPPED_UPSTREAM_BODY_HEADERS = [
    'content-encoding',
    'content-length',
    'transfer-encoding',
] as const;

const WEB4_CSP_VALUE = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://challenges.cloudflare.com https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https:",
    "media-src 'self' blob: https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
].join('; ');

/** Check if a path points to a static asset */
function isStaticAsset(pathname: string): boolean {
    const lastDot = pathname.lastIndexOf('.');
    if (lastDot === -1) return false;
    return STATIC_EXTENSIONS.has(pathname.slice(lastDot).toLowerCase());
}

function getAllowedDomains(env: Env): Set<string> {
    return new Set(
        env.ALLOWED_DOMAINS
            .split(',')
            .map((domain) => domain.trim().toLowerCase())
            .filter(Boolean),
    );
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const hostname = url.hostname.toLowerCase();
        const allowedDomains = getAllowedDomains(env);

        if (!allowedDomains.has(hostname)) {
            return new Response('Host is not allowed for this proxy.', { status: 421 });
        }

        if (hostname === 'www.youtick.net') {
            const redirectUrl = new URL(request.url);
            redirectUrl.hostname = 'youtick.net';
            return Response.redirect(redirectUrl.toString(), 308);
        }

        // --- Health check endpoint ---
        if (url.pathname === '/__health') {
            return new Response(JSON.stringify({
                status: 'ok',
                proxy: 'web4-proxy',
                origin: env.WEB4_ORIGIN,
                canonicalHost: 'youtick.net',
                timestamp: new Date().toISOString(),
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // --- Onboarding key endpoint (replaces Next.js API route in static export) ---
        if (url.pathname === '/api/onboarding-key' && request.method === 'GET') {
            return handleOnboardingKey(request, env, ctx);
        }

        // --- NEAR RPC proxy (same-origin CORS workaround for wallet/RPC calls) ---
        if (url.pathname === '/api/near-rpc' || url.pathname === '/api/near-rpc/') {
            return handleNearRpc(request, ctx);
        }

        // --- Crust IPFS proxy (CORS workaround for PSA/API calls) ---
        if (url.pathname.startsWith('/api/crust/')) {
            const targetPath = url.pathname.replace('/api/crust', '');
            const isPsa = targetPath.startsWith('/psa/');
            const upstreamOrigin = isPsa
                ? 'https://pin.crustcode.com'
                : 'https://crustipfs.xyz';
            const targetUrl = `${upstreamOrigin}${targetPath}${url.search}`;

            // Forward relevant headers
            const fwdHeaders = new Headers();
            const forwardNames = ['authorization', 'content-type', 'accept', 'content-length'];
            for (const name of forwardNames) {
                const value = request.headers.get(name);
                if (value) fwdHeaders.set(name, value);
            }

            // Read body as text (Works because this handler runs before body is consumed)
            const textBody = request.body
                ? await request.text()
                : undefined;

            const resp = await fetch(targetUrl, {
                method: request.method,
                headers: fwdHeaders,
                body: textBody,
            });

            // Return with CORS headers so browser can read the response
            const respHeaders = new Headers(resp.headers);
            respHeaders.set('Access-Control-Allow-Origin', '*');
            respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            respHeaders.set('Access-Control-Allow-Headers', '*');

            return new Response(resp.body, {
                status: resp.status,
                statusText: resp.statusText,
                headers: respHeaders,
            });
        }

        // --- Build origin chain for failover ---
        const origins = [env.WEB4_ORIGIN];
        if (env.WEB4_FALLBACK_ORIGIN) {
            origins.push(env.WEB4_FALLBACK_ORIGIN);
        }

        const canUseCache = request.method === 'GET' && url.pathname !== '/__health';
        const cacheUrl = new URL(request.url);
        if (env.CACHE_VERSION) {
            cacheUrl.searchParams.set('__cv', env.CACHE_VERSION);
        }
        const cacheKey = canUseCache ? new Request(cacheUrl.toString(), { method: 'GET' }) : null;
        const cache = canUseCache ? caches.default : null;

        if (cache && cacheKey) {
            const cached = await cache.match(cacheKey);
            if (cached) {
                const cachedHeaders = applyProxyHeaders(
                    cached.headers,
                    url.pathname,
                    env.WEB4_ORIGIN,
                    'HIT',
                    parseInt(env.CACHE_TTL || '300', 10),
                );
                return new Response(cached.body, {
                    status: cached.status,
                    statusText: cached.statusText,
                    headers: cachedHeaders,
                });
            }
        }

        let lastError: unknown;
        for (const origin of origins) {
            try {
                const targetUrl = `${origin}${url.pathname}${url.search}`;
                const originResponse = await fetch(targetUrl, {
                    method: request.method,
                    headers: buildOriginHeaders(request, env, origin),
                    redirect: 'follow',
                });

                if (!originResponse.ok && origin !== origins[origins.length - 1]) {
                    lastError = new Error(`Origin ${origin} returned ${originResponse.status}`);
                    continue;
                }

                const cacheTtl = parseInt(env.CACHE_TTL || '300', 10);
                const responseHeaders = applyProxyHeaders(
                    originResponse.headers,
                    url.pathname,
                    origin,
                    'MISS',
                    cacheTtl,
                );

                const proxiedResponse = new Response(originResponse.body, {
                    status: originResponse.status,
                    statusText: originResponse.statusText,
                    headers: responseHeaders,
                });

                if (cache && cacheKey && originResponse.ok) {
                    ctx.waitUntil(cache.put(cacheKey, proxiedResponse.clone()));
                }

                return proxiedResponse;
            } catch (error) {
                lastError = error;
                console.warn(`Web4 proxy: origin ${origin} failed, trying next...`, error);
            }
        }

        console.error('Web4 proxy: all origins failed', lastError);
        return new Response(
            `<!DOCTYPE html>
<html>
<head><title>YouTick — Temporarily Unavailable</title></head>
<body style="font-family:system-ui;text-align:center;padding:4rem">
  <h1>YouTick</h1>
  <p>The Web4 gateway is temporarily unavailable. Please try again shortly.</p>
  <p style="color:#888">You can also visit <a href="${env.WEB4_ORIGIN}">${env.WEB4_ORIGIN}</a> directly.</p>
</body>
</html>`,
            {
                status: 502,
                headers: {
                    'Content-Security-Policy': WEB4_CSP_VALUE,
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'no-store',
                },
            },
        );
    },
} satisfies ExportedHandler<Env>;

function jsonResponse(body: Record<string, unknown>, status: number, headers?: HeadersInit): Response {
    const responseHeaders = new Headers(headers);
    responseHeaders.set('Content-Type', 'application/json');

    return new Response(JSON.stringify(body), {
        status,
        headers: responseHeaders,
    });
}

function nearRpcCorsHeaders(): HeadersInit {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
        'Cache-Control': 'no-store',
    };
}

type NearRpcPayload = {
    method?: string;
    params?: {
        request_type?: string;
        finality?: string;
        method_name?: string;
    };
};

function withNearRpcHeaders(response: Response, cacheState: 'BYPASS' | 'HIT' | 'MISS', upstream?: string): Response {
    const headers = new Headers(response.headers);
    for (const header of STRIPPED_UPSTREAM_BODY_HEADERS) {
        headers.delete(header);
    }
    for (const [key, value] of Object.entries(nearRpcCorsHeaders())) {
        headers.set(key, value);
    }
    headers.set('X-Near-Rpc-Cache', cacheState);
    if (upstream) {
        headers.set('X-Near-Rpc-Upstream', new URL(upstream).hostname);
    }
    headers.delete('set-cookie');

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function getCacheableRpcScope(payload: unknown): string | null {
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
        return null;
    }

    const rpcPayload = payload as NearRpcPayload;
    if (rpcPayload.method === 'status') {
        return 'status';
    }

    if (rpcPayload.method !== 'query') {
        return null;
    }

    const params = rpcPayload.params;
    if (!params || params.request_type !== 'call_function') {
        return null;
    }

    if (params.finality && params.finality !== 'final') {
        return null;
    }

    return params.method_name && NEAR_RPC_CACHEABLE_VIEW_METHODS.has(params.method_name)
        ? params.method_name
        : null;
}

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

async function buildNearRpcCacheKey(request: Request, body: string, scope: string): Promise<Request> {
    const url = new URL(request.url);
    url.pathname = `/__near-rpc-cache/${scope}/${await sha256Hex(body)}`;
    url.search = '';
    return new Request(url.toString(), { method: 'GET' });
}

async function fetchNearRpcFromUpstream(body: string, contentType: string): Promise<Response> {
    let lastResponse: Response | null = null;
    let lastError: unknown;

    for (const upstreamUrl of NEAR_RPC_UPSTREAMS) {
        try {
            const response = await fetch(upstreamUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body,
            });

            if ((response.status === 429 || response.status >= 500) && upstreamUrl !== NEAR_RPC_UPSTREAMS[NEAR_RPC_UPSTREAMS.length - 1]) {
                lastResponse = response;
                continue;
            }

            return withNearRpcHeaders(response, 'BYPASS', upstreamUrl);
        } catch (error) {
            lastError = error;
        }
    }

    if (lastResponse) {
        return withNearRpcHeaders(lastResponse, 'BYPASS');
    }

    console.warn('NEAR RPC proxy: all upstreams failed', lastError);
    return jsonResponse({ error: 'NEAR RPC unavailable' }, 502, nearRpcCorsHeaders());
}

async function handleNearRpc(request: Request, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = nearRpcCorsHeaders();

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    const body = await request.text();
    let payload: unknown;
    try {
        payload = JSON.parse(body);
    } catch {
        return jsonResponse({ error: 'Invalid JSON-RPC payload' }, 400, corsHeaders);
    }

    const cacheScope = getCacheableRpcScope(payload);
    const contentType = request.headers.get('content-type') || 'application/json';
    const cacheKey = cacheScope
        ? await buildNearRpcCacheKey(request, body, cacheScope)
        : null;

    if (cacheKey) {
        const cached = await caches.default.match(cacheKey);
        if (cached) {
            return withNearRpcHeaders(cached, 'HIT');
        }

        const pending = pendingNearRpcRequests.get(cacheKey.url);
        if (pending) {
            return (await pending).clone();
        }

        const fetchPromise = fetchNearRpcFromUpstream(body, contentType)
            .then((response) => {
                const responseWithCacheHeader = withNearRpcHeaders(response, 'MISS');
                if (responseWithCacheHeader.status === 200) {
                    const cachedHeaders = new Headers(responseWithCacheHeader.headers);
                    cachedHeaders.set('Cache-Control', `public, max-age=${NEAR_RPC_CACHE_TTL_SECONDS}`);
                    ctx.waitUntil(caches.default.put(
                        cacheKey,
                        new Response(responseWithCacheHeader.clone().body, {
                            status: responseWithCacheHeader.status,
                            statusText: responseWithCacheHeader.statusText,
                            headers: cachedHeaders,
                        }),
                    ));
                }
                return responseWithCacheHeader;
            })
            .finally(() => {
                pendingNearRpcRequests.delete(cacheKey.url);
            });

        pendingNearRpcRequests.set(cacheKey.url, fetchPromise);
        return (await fetchPromise).clone();
    }

    return fetchNearRpcFromUpstream(body, contentType);
}

/**
 * Build headers to send to the Web4 origin.
 * Preserves important client headers while setting the correct Host.
 */
function buildOriginHeaders(request: Request, env: Env, origin?: string): Headers {
    const headers = new Headers();

    const originUrl = new URL(origin || env.WEB4_ORIGIN);
    headers.set('Host', originUrl.hostname);

    // Forward client IP for logging
    const clientIp = request.headers.get('CF-Connecting-IP');
    if (clientIp) {
        headers.set('X-Forwarded-For', clientIp);
    }

    // Forward relevant headers
    const forwardHeaders = [
        'Accept', 'Accept-Language', 'Accept-Encoding',
        'User-Agent', 'If-None-Match', 'If-Modified-Since',
    ];
    for (const name of forwardHeaders) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
    }

    return headers;
}

function applyProxyHeaders(
    headers: Headers,
    pathname: string,
    web4Origin: string,
    cacheState: 'HIT' | 'MISS',
    cacheTtl: number,
): Headers {
    const responseHeaders = new Headers(headers);

    responseHeaders.delete('server');
    responseHeaders.delete('x-powered-by');

    responseHeaders.set('X-Proxy', 'youtick-web4');
    responseHeaders.set('X-Web4-Origin', web4Origin);
    responseHeaders.set('X-Proxy-Cache', cacheState);
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('X-Frame-Options', 'DENY');
    responseHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    if (isStaticAsset(pathname)) {
        const isHashed = pathname.includes('/_next/static/');
        const maxAge = isHashed ? 31536000 : cacheTtl;
        responseHeaders.set('Cache-Control', `public, max-age=${maxAge}, immutable`);
    } else {
        // Keep browser HTML cache near-zero so old pages do not point at missing chunk hashes.
        responseHeaders.set('Cache-Control', `public, max-age=0, must-revalidate, s-maxage=${cacheTtl}, stale-while-revalidate=30`);
        responseHeaders.set('Content-Security-Policy', WEB4_CSP_VALUE);
    }

    return responseHeaders;
}

// ============================================================================
// Onboarding Key Endpoint
// ============================================================================

/**
 * Rate limiter using the Cache API (per-IP, 5 requests per hour).
 */
async function checkOnboardingRateLimit(ip: string, ctx: ExecutionContext): Promise<boolean> {
    const cache = caches.default;
    const key = `https://ratelimit/onboarding-key/${ip}`;
    const cacheReq = new Request(key);
    const cached = await cache.match(cacheReq);
    const now = Date.now();

    if (!cached) {
        const res = new Response(JSON.stringify({ count: 1, window: now }), {
            headers: { 'Cache-Control': 'max-age=3600' },
        });
        ctx.waitUntil(cache.put(cacheReq, res));
        return true; // allowed
    }

    const data = await cached.json<{ count: number; window: number }>();
    if (now - data.window > 3_600_000) {
        // New window
        const res = new Response(JSON.stringify({ count: 1, window: now }), {
            headers: { 'Cache-Control': 'max-age=3600' },
        });
        ctx.waitUntil(cache.put(cacheReq, res));
        return true;
    }

    if (data.count >= 5) return false; // rate limited

    const res = new Response(JSON.stringify({ count: data.count + 1, window: data.window }), {
        headers: { 'Cache-Control': 'max-age=3600' },
    });
    ctx.waitUntil(cache.put(cacheReq, res));
    return true;
}

async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
    try {
        const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret, response: token }),
        });
        const data = await resp.json<{ success: boolean }>();
        return data.success === true;
    } catch {
        return false;
    }
}

function getClientIp(request: Request): string {
    return request.headers.get('CF-Connecting-IP') || 'unknown';
}

async function handleOnboardingKey(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const keysEnv = env.ONBOARDING_KEYS;
    if (!keysEnv || keysEnv.trim().length === 0) {
        return new Response(JSON.stringify({ error: 'Onboarding key not configured' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }

    const ip = getClientIp(request);

    // Rate limit: 5 req/hour per IP
    if (!(await checkOnboardingRateLimit(ip, ctx))) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }

    // Turnstile verification (when configured)
    const url = new URL(request.url);
    const turnstileToken = url.searchParams.get('turnstileToken');
    if (env.TURNSTILE_SECRET_KEY) {
        if (!turnstileToken) {
            return new Response(JSON.stringify({ error: 'Challenge token required.' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            });
        }
        if (!(await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY))) {
            return new Response(JSON.stringify({ error: 'Challenge verification failed.' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            });
        }
    }

    const keys = keysEnv
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && k.startsWith('ed25519:'));

    if (keys.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid onboarding key format' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }

    const key = keys[Math.floor(Math.random() * keys.length)];

    return new Response(JSON.stringify({ key }), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        },
    });
}
