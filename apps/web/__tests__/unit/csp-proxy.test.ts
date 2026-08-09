import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../../proxy';

describe('request nonce CSP', () => {
    it('removes unsafe-inline while allowing the Cloudflare beacon origin', () => {
        const response = proxy(new NextRequest('https://youtick.net/watch'));
        const csp = response.headers.get('Content-Security-Policy');

        expect(csp).toContain("script-src 'self' 'nonce-");
        expect(csp).toContain("style-src 'self' 'nonce-");
        expect(csp).toContain('https://static.cloudflareinsights.com');
        expect(csp).toContain("connect-src 'self' https:");
        expect(csp).not.toContain("'unsafe-inline'");
    });

    it('generates a fresh nonce for each request', () => {
        const first = proxy(new NextRequest('https://youtick.net/')).headers.get('Content-Security-Policy');
        const second = proxy(new NextRequest('https://youtick.net/')).headers.get('Content-Security-Policy');

        expect(first).not.toBe(second);
    });
});
