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
    ALLOWED_DOMAINS: string;
    CACHE_TTL: string;
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
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const hostname = url.hostname.toLowerCase();
        const allowedDomains = getAllowedDomains(env);

        // --- Logging ---
        console.log(`[Proxy] Handling request for: ${url.hostname}${url.pathname}`);

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

        // --- Build target URL: youtick.net/path → youtick.near.page/path ---
        const targetUrl = `${env.WEB4_ORIGIN}${url.pathname}${url.search}`;

        try {
            // Forward request to Web4 gateway
            const originResponse = await fetch(targetUrl, {
                method: request.method,
                headers: buildOriginHeaders(request, env),
                redirect: 'follow',
            });

            // Build proxied response
            const responseHeaders = new Headers(originResponse.headers);

            // Remove headers that shouldn't be forwarded
            responseHeaders.delete('server');
            responseHeaders.delete('x-powered-by');

            // Set proxy identification
            responseHeaders.set('X-Proxy', 'youtick-web4');
            responseHeaders.set('X-Web4-Origin', env.WEB4_ORIGIN);

            // Security headers
            responseHeaders.set('X-Content-Type-Options', 'nosniff');
            responseHeaders.set('X-Frame-Options', 'DENY');
            responseHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

            // Cache control
            const cacheTtl = parseInt(env.CACHE_TTL || '300', 10);
            if (isStaticAsset(url.pathname)) {
                // Static assets: cache aggressively (1 year for hashed files)
                const isHashed = url.pathname.includes('/_next/static/');
                const maxAge = isHashed ? 31536000 : cacheTtl;
                responseHeaders.set('Cache-Control', `public, max-age=${maxAge}, immutable`);
            } else {
                // HTML pages: short cache with revalidation
                responseHeaders.set('Cache-Control', `public, max-age=60, s-maxage=${cacheTtl}, stale-while-revalidate=86400`);
            }

            return new Response(originResponse.body, {
                status: originResponse.status,
                statusText: originResponse.statusText,
                headers: responseHeaders,
            });
        } catch (error) {
            // Origin unreachable — return friendly error
            console.error('Web4 proxy error:', error);
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
        }
    },
} satisfies ExportedHandler<Env>;

/**
 * Build headers to send to the Web4 origin.
 * Preserves important client headers while setting the correct Host.
 */
function buildOriginHeaders(request: Request, env: Env): Headers {
    const headers = new Headers();

    // Set correct Host for the Web4 gateway
    const originUrl = new URL(env.WEB4_ORIGIN);
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
