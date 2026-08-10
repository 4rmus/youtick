import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../../proxy';

describe('request nonce CSP', () => {
    it('limits media to Livepeer origins while retaining the nonce policy', () => {
        const response = proxy(new NextRequest('https://youtick.net/watch'));
        const csp = response.headers.get('Content-Security-Policy');

        expect(csp).toContain("script-src 'self' 'nonce-");
        expect(csp).toContain("style-src 'self' 'nonce-");
        expect(csp).toContain('https://static.cloudflareinsights.com');
        expect(csp).toContain("connect-src 'self' https:");
        expect(csp).toContain("media-src 'self' blob: https://playback.livepeer.studio");
        expect(csp).toContain('https://*.lp-playback.studio');
        expect(csp?.split('; ').find((directive) => directive.startsWith('media-src '))?.split(' '))
            .not.toContain('https:');
        expect(csp).not.toContain("'unsafe-inline'");
    });

    it('generates a fresh nonce for each request', () => {
        const first = proxy(new NextRequest('https://youtick.net/')).headers.get('Content-Security-Policy');
        const second = proxy(new NextRequest('https://youtick.net/')).headers.get('Content-Security-Policy');

        expect(first).not.toBe(second);
    });
});
