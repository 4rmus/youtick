import { NextRequest, NextResponse } from 'next/server';
import { contentSecurityPolicy } from './lib/csp';

function requestNonce(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return btoa(String.fromCharCode(...bytes));
}

export function middleware(request: NextRequest): NextResponse {
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
            missing: [
                { type: 'header', key: 'next-router-prefetch' },
                { type: 'header', key: 'purpose', value: 'prefetch' },
            ],
        },
    ],
};
