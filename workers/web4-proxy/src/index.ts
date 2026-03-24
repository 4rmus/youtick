/**
 * YouTick Web4 Proxy Worker
 *
 * Reverse proxy that serves youtick.net by forwarding requests to the
 * Web4 gateway at youtick.near.page. This allows using a custom domain
 * while keeping the application fully deployed on NEAR Web4.
 *
 * Flow: youtick.net → Cloudflare Workers → youtick.near.page → web4_get() → IPFS
 */

interface Env {
    WEB4_ORIGIN: string;
    WEB4_FALLBACK_ORIGIN?: string;
    ALLOWED_DOMAINS: string;
    CACHE_TTL: string;
    CACHE_VERSION?: string;
}

/** Content types that should be cached aggressively */
const STATIC_EXTENSIONS = new Set([
    '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg',
    '.ico', '.woff', '.woff2', '.ttf', '.webp', '.wasm', '.map',
]);

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
    }

    return responseHeaders;
}
