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
