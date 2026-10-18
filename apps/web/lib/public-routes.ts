// Public-route gate for the root hosts (launch path K10a, gate L3).
//
// When the request host is one of `PUBLIC_ROOT_HOSTS` (comma-separated, e.g. "youtick.net,www.youtick.net"),
// only the public set below is served; every other path answers 404 with noindex. The variable is read at
// request time; empty or unset means the gate is off, so Preview, app.youtick.net and localhost serve
// everything. This module is the single source of the allowlist: middleware.ts, robots.ts and sitemap.ts
// all read it.

/** Public pages served on the root hosts (GET/HEAD). Paths that do not exist yet answer Next's own 404. */
export const PUBLIC_ROOT_PAGES: readonly string[] = [
    '/',
    '/tr',
    '/apply',
    '/tr/apply',
    '/privacy',
    '/terms',
    '/tr/privacy',
    '/tr/terms',
    '/refund-policy',
    '/tr/refund-policy',
    '/report',
    '/tr/report',
];

/** Pages listed in the root-host sitemap: the public pages that exist today (a test checks each has a page file). */
export const PUBLIC_ROOT_SITEMAP_PATHS: readonly string[] = ['/', '/tr', '/apply', '/tr/apply', '/privacy', '/terms'];

/** Metadata files at the site root. */
const PUBLIC_ROOT_FILES: readonly string[] = ['/robots.txt', '/sitemap.xml', '/favicon.ico', '/manifest.webmanifest'];

/** API routes reachable on the root hosts, with the only methods they accept there. */
const PUBLIC_ROOT_API: Readonly<Record<string, readonly string[]>> = {
    '/api/creator-applications': ['POST'],
    '/api/content-reports': ['POST'],
};

/** Next build output (hashed JS/CSS, next/font files) and the brand folder under public/. */
const PUBLIC_ROOT_PREFIXES: readonly string[] = ['/_next/static/', '/brand/'];

/** Single-segment image files at the root of public/ (e.g. /hero-concert.webp). */
const PUBLIC_ROOT_IMAGE = /^\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:webp|avif|png|jpe?g|gif|svg|ico)$/;

/** Plain characters only for prefix matches: no percent-encoding, no dot segments. */
const SAFE_ASSET_PATH = /^[A-Za-z0-9._/-]+$/;

const READ_METHODS = ['GET', 'HEAD'];

export function parsePublicRootHosts(value: string | undefined): ReadonlySet<string> {
    return new Set(
        (value ?? '')
            .split(',')
            .map((host) => normalizeHost(host))
            .filter((host): host is string => Boolean(host)),
    );
}

/** Lower-case host without port or trailing dot; null when empty. */
export function normalizeHost(value: string | null | undefined): string | null {
    let host = (value ?? '').trim().toLowerCase();
    if (!host) return null;
    if (host.startsWith('[')) {
        const end = host.indexOf(']');
        host = end === -1 ? host : host.slice(0, end + 1);
    } else {
        host = host.replace(/:\d*$/, '');
    }
    host = host.replace(/\.+$/, '');
    return host || null;
}

export function isPublicRootHost(host: string | null | undefined, rootHosts: ReadonlySet<string>): boolean {
    if (rootHosts.size === 0) return false;
    const normalized = normalizeHost(host);
    return normalized !== null && rootHosts.has(normalized);
}

/** Path without trailing slashes ("/" stays "/"). */
function trimTrailingSlash(pathname: string): string {
    const trimmed = pathname.replace(/\/+$/, '');
    return trimmed || '/';
}

/** Whether a request may be served on a root host. Matching is exact and case-sensitive; anything else is denied. */
export function isPublicRootRequest(pathname: string, method: string): boolean {
    const verb = method.toUpperCase();
    if (pathname.startsWith('/api/') || pathname === '/api') {
        const methods = PUBLIC_ROOT_API[trimTrailingSlash(pathname)];
        return Boolean(methods?.includes(verb));
    }
    if (!READ_METHODS.includes(verb)) return false;

    const path = trimTrailingSlash(pathname);
    if (PUBLIC_ROOT_PAGES.includes(path) || PUBLIC_ROOT_FILES.includes(path)) return true;
    if (PUBLIC_ROOT_IMAGE.test(pathname)) return true;
    return (
        SAFE_ASSET_PATH.test(pathname) &&
        !pathname.split('/').some((segment) => segment === '.' || segment === '..') &&
        PUBLIC_ROOT_PREFIXES.some((prefix) => pathname.startsWith(prefix) && pathname.length > prefix.length)
    );
}

/** Body of the gate's 404: static HTML, no scripts, so it needs no nonce. */
export const PUBLIC_ROOT_NOT_FOUND_HTML =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found | YouTick</title></head>' +
    '<body style="font-family:system-ui,sans-serif;margin:4rem auto;max-width:32rem;padding:0 1rem">' +
    '<h1>Page not found</h1><p>This page is not available on youtick.net yet.</p><p><a href="/">Go to the home page</a></p>' +
    '</body></html>';

export const PUBLIC_ROOT_NOT_FOUND_HEADERS: Readonly<Record<string, string>> = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
    Vary: 'Host',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

/** Request-time read of the configured root hosts (Worker vars reach process.env through OpenNext). */
export function configuredPublicRootHosts(): ReadonlySet<string> {
    return parsePublicRootHosts(process.env.PUBLIC_ROOT_HOSTS);
}
