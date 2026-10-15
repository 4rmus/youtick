import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { contentSecurityPolicy } from '@/lib/csp';
import { middleware } from '../../middleware';

describe('request nonce CSP', () => {
    it('allows injected styles without weakening the script policy', () => {
        const response = middleware(new NextRequest('https://youtick.net/watch'));
        const csp = response.headers.get('Content-Security-Policy');

        expect(csp).toContain("script-src 'self' 'nonce-");
        expect(csp).toContain("style-src 'self' 'nonce-");
        expect(csp).toContain("style-src-elem 'self' 'unsafe-inline'");
        expect(csp).toContain("style-src-attr 'unsafe-inline'");
        expect(csp).toContain('https://static.cloudflareinsights.com');
        expect(csp).toContain("connect-src 'self' https:");
        expect(csp).not.toMatch(/(?:^|; )script-src[^;]*'unsafe-inline'/);
        expect(csp).not.toMatch(/(?:^|; )style-src [^;]*'unsafe-inline'/);
    });

    it('allows Cleeng only while the card rail is on', () => {
        const off = contentSecurityPolicy('n', null);
        expect(off).not.toContain('cleeng');
        expect(off).not.toContain('frame-src');
        const on = contentSecurityPolicy('n', { script: ' https://widgets.sandbox.cleeng.com', frame: 'https://*.sandbox.cleeng.com' });
        expect(on).toMatch(/(?:^|; )script-src [^;]*https:\/\/widgets\.sandbox\.cleeng\.com/);
        expect(on).toContain('frame-src https://*.sandbox.cleeng.com');
        expect(on).not.toMatch(/(?:^|; )script-src[^;]*'unsafe-inline'/);
    });

    it('generates a fresh nonce for each request', () => {
        const first = middleware(new NextRequest('https://youtick.net/')).headers.get('Content-Security-Policy');
        const second = middleware(new NextRequest('https://youtick.net/')).headers.get('Content-Security-Policy');

        expect(first).not.toBe(second);
    });
});
