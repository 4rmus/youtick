import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { config, middleware } from '../../middleware';

afterEach(() => vi.unstubAllEnvs());

describe('isolated local auth lab', () => {
    it.each(['/', '/profile', '/upload', '/watch?job=old', '/discover'])('keeps the placeholder app shell out of %s, including prefetches', (path) => {
        vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('NEAR_AUTH_LAB_ENABLED', 'true'); vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'testnet');
        const response = middleware(new NextRequest(`http://localhost:3000${path}`, {
            headers: { 'next-router-prefetch': '1', purpose: 'prefetch' },
        }));
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('http://localhost:3000/auth-lab');
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(config.matcher[0]).not.toHaveProperty('missing');
    });

    it.each(['/auth-lab?code=fixture&state=fixture', '/_next/webpack-hmr'])('preserves the callback and dev assets at %s', (path) => {
        vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('NEAR_AUTH_LAB_ENABLED', 'true'); vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'testnet');
        expect(middleware(new NextRequest(`http://localhost:3000${path}`)).headers.has('location')).toBe(false);
    });

    it.each([['production', 'true', 'testnet'], ['development', 'false', 'testnet'], ['development', 'true', 'mainnet']])('preserves normal routing for %s/%s/%s', (environment, enabled, network) => {
        vi.stubEnv('NODE_ENV', environment); vi.stubEnv('NEAR_AUTH_LAB_ENABLED', enabled); vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', network);
        const response = middleware(new NextRequest('http://localhost:3000/profile'));
        expect(response.headers.has('location')).toBe(false);
        expect(response.headers.has('Content-Security-Policy')).toBe(true);
    });
});

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

    it('generates a fresh nonce for each request', () => {
        const first = middleware(new NextRequest('https://youtick.net/')).headers.get('Content-Security-Policy');
        const second = middleware(new NextRequest('https://youtick.net/')).headers.get('Content-Security-Policy');

        expect(first).not.toBe(second);
    });
});
