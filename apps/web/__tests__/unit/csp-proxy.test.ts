import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { config, middleware } from '../../middleware';

afterEach(() => vi.unstubAllEnvs());

describe('product root callback handoff', () => {
    beforeEach(() => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('NEAR_AUTH_V1_ENABLED', 'true');
        vi.stubEnv('NEAR_AUTH_LAB_ENABLED', 'false');
        vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'testnet');
        vi.stubEnv('NEXT_PUBLIC_VIDEO_ENVIRONMENT', 'public-testnet');
        vi.stubEnv('NEAR_AUTH_V1_CLIENT_ID', 'synthetic-client');
        vi.stubEnv('NEAR_AUTH_V1_SESSION_SECRET', '11'.repeat(32));
        vi.stubEnv('NEAR_AUTH_V1_ORIGIN', 'http://localhost:3000');
    });

    it.each(['?code=synthetic%2Bcode&state=synthetic%2Fstate', '?error=access_denied&state=synthetic',
        '?code=partial', '?state=partial', '?error_description=denied',
        '?code=synthetic&state=synthetic&returnTo=https%3A%2F%2Fevil.invalid',
    ])('hands the unchanged query to the fixed callback without setting a session: %s', search => {
        const response = middleware(new NextRequest(`http://localhost:3000/${search}`, { headers: { host: 'localhost:3000' } }));
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(`http://localhost:3000/auth/callback${search}`);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('referrer-policy')).toBe('no-referrer');
        expect(response.headers.has('set-cookie')).toBe(false);
    });

    it.each(['/', '/?campaign=video', '/auth/callback?code=synthetic&state=synthetic', '/watch?job=existing'])('preserves normal routes and avoids callback loops: %s', path => {
        const response = middleware(new NextRequest(`http://localhost:3000${path}`, { headers: { host: 'localhost:3000' } }));
        expect(response.headers.has('location')).toBe(false);
        expect(response.headers.has('content-security-policy')).toBe(true);
    });

    it.each([
        ['NEAR_AUTH_V1_ENABLED', 'false'], ['NEXT_PUBLIC_NEAR_NETWORK', 'mainnet'],
        ['NEXT_PUBLIC_VIDEO_ENVIRONMENT', 'production'], ['NEAR_AUTH_V1_ORIGIN', 'http://127.0.0.1:3000'],
        ['NEAR_AUTH_V1_CLIENT_ID', ''], ['NEAR_AUTH_V1_SESSION_SECRET', 'invalid'],
        ['NODE_ENV', 'production'],
    ])('does not enable a callback for invalid product settings: %s', (key, value) => {
        vi.stubEnv(key, value);
        expect(middleware(new NextRequest('http://localhost:3000/?code=synthetic&state=synthetic', { headers: { host: 'localhost:3000' } })).headers.has('location')).toBe(false);
    });

    it('preserves lab isolation when product and lab are both configured', () => {
        vi.stubEnv('NEAR_AUTH_LAB_ENABLED', 'true');
        expect(middleware(new NextRequest('http://localhost:3000/?code=synthetic&state=synthetic', { headers: { host: 'localhost:3000' } })).headers.get('location'))
            .toBe('http://localhost:3000/auth-lab');
    });

    it('does not redirect a POST body through the OAuth callback', () => {
        expect(middleware(new NextRequest('http://localhost:3000/?code=synthetic&state=synthetic', { method: 'POST', headers: { host: 'localhost:3000' } })).headers.has('location')).toBe(false);
    });

    it.each(['127.0.0.1:3000', '[::1]:3000', 'localhost:3001', 'evil.invalid:3000'])('does not move a callback across origins: %s', host => {
        expect(middleware(new NextRequest(`http://${host}/?code=synthetic&state=synthetic`, { headers: { host } })).headers.has('location')).toBe(false);
    });

    it('fails closed when the original request host is unavailable', () => {
        expect(middleware(new NextRequest('http://localhost:3000/?code=synthetic&state=synthetic')).headers.has('location')).toBe(false);
    });

    it('keeps an explicitly configured HTTPS public-testnet callback on its own origin', () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEAR_AUTH_V1_ORIGIN', 'https://public-testnet.example');
        const response = middleware(new NextRequest('https://public-testnet.example/?code=synthetic&state=synthetic', { headers: { host: 'public-testnet.example' } }));
        expect(response.headers.get('location')).toBe('https://public-testnet.example/auth/callback?code=synthetic&state=synthetic');
    });
});

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
