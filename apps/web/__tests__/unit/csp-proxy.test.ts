import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';

describe('request nonce CSP', () => {
    it('allows style attributes without weakening script or style element policies', () => {
        const response = middleware(new NextRequest('https://youtick.net/watch'));
        const csp = response.headers.get('Content-Security-Policy');

        expect(csp).toContain("script-src 'self' 'nonce-");
        expect(csp).toContain("style-src 'self' 'nonce-");
        expect(csp).toContain("style-src-attr 'unsafe-inline'");
        expect(csp).toContain('https://static.cloudflareinsights.com');
        expect(csp).toContain("connect-src 'self' https:");
        expect(csp).not.toMatch(/(?:^|; )script-src[^;]*'unsafe-inline'/);
        expect(csp).not.toMatch(/(?:^|; )style-src [^;]*'unsafe-inline'/);
    });

    it('generates a fresh nonce for each request', () => {
        const first = middleware(new NextRequest('https://youtick.net/')).headers.get('Content-Security-Policy');
        const second = middleware(new NextRequest('https://youtick.net/')).headers.get('Content-Security-Policy');

        expect(first).not.toBe(second);
    });
});
