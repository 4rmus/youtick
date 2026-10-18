import { NextRequest, NextResponse } from 'next/server';
import { contentSecurityPolicy } from './lib/csp';
import {
    PUBLIC_ROOT_NOT_FOUND_HEADERS,
    PUBLIC_ROOT_NOT_FOUND_HTML,
    configuredPublicRootHosts,
    isPublicRootHost,
    isPublicRootRequest,
} from './lib/public-routes';

function requestNonce(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return btoa(String.fromCharCode(...bytes));
}

// Paths that never get the page CSP (API routes, image optimizer, metadata files). This was the matcher's
// exclusion list before the root-host gate needed to see these requests too.
const NO_PAGE_CSP = /^\/(?:api|_next\/static|_next\/image|favicon\.ico|robots\.txt|sitemap\.xml)/;

const HOST_DEPENDENT = new Set(['/robots.txt', '/sitemap.xml']);

export function middleware(request: NextRequest): NextResponse {
    const { pathname } = request.nextUrl;

    // Root-host gate (L3): on PUBLIC_ROOT_HOSTS only the public set is served. The Host header decides,
    // not X-Forwarded-Host. Unset variable = gate off.
    if (isPublicRootHost(request.headers.get('host') ?? request.nextUrl.host, configuredPublicRootHosts())
        && !isPublicRootRequest(pathname, request.method)) {
        return new NextResponse(request.method === 'HEAD' ? null : PUBLIC_ROOT_NOT_FOUND_HTML, {
            status: 404,
            headers: PUBLIC_ROOT_NOT_FOUND_HEADERS,
        });
    }

    if (HOST_DEPENDENT.has(pathname)) {
        // robots.txt and sitemap.xml differ between root and other hosts.
        const response = NextResponse.next();
        response.headers.set('Vary', 'Host');
        return response;
    }
    if (NO_PAGE_CSP.test(pathname)) return NextResponse.next();

    const nonce = requestNonce();
    const csp = contentSecurityPolicy(nonce);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', csp);
    return response;
}

export const config = {
    // Every request except hashed build assets, so the root-host gate also covers API routes, metadata
    // files and router prefetches (Next strips prefetch headers from the request, so they get the CSP too).
    matcher: ['/((?!_next/static).*)'],
};
