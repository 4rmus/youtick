import { NextRequest, NextResponse } from 'next/server';
import { NEAR_AUTH_LAB_PATH, nearAuthLabEnabled } from './lib/near-auth-lab';

function requestNonce(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return btoa(String.fromCharCode(...bytes));
}

function contentSecurityPolicy(nonce: string): string {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    return [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' https://static.cloudflareinsights.com${isDevelopment ? " 'unsafe-eval'" : ''}`,
        `style-src 'self' 'nonce-${nonce}'`,
        "style-src-elem 'self' 'unsafe-inline'",
        "style-src-attr 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https:",
        "media-src 'self' blob: https:",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; ');
}

export function middleware(request: NextRequest): NextResponse {
    if (nearAuthLabEnabled(process.env.NODE_ENV, process.env.NEAR_AUTH_LAB_ENABLED, process.env.NEXT_PUBLIC_NEAR_NETWORK)
        && request.nextUrl.pathname !== NEAR_AUTH_LAB_PATH && !request.nextUrl.pathname.startsWith('/_next/')) {
        const response = NextResponse.redirect(new URL(NEAR_AUTH_LAB_PATH, request.url));
        response.headers.set('Cache-Control', 'no-store');
        return response;
    }
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
    matcher: [
        {
            source: '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
        },
    ],
};
