import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
    PUBLIC_ROOT_PAGES,
    PUBLIC_ROOT_SITEMAP_PATHS,
    isPublicRootHost,
    isPublicRootRequest,
    normalizeHost,
    parsePublicRootHosts,
} from '@/lib/public-routes';
import { middleware } from '../../middleware';

const requestHost = vi.hoisted(() => ({ value: 'youtick.net' as string | null }));
vi.mock('next/headers', () => ({
    headers: async () => new Headers(requestHost.value ? { host: requestHost.value } : {}),
}));

const ROOT_HOSTS = 'youtick.net,www.youtick.net';

function request(url: string, init: { method?: string; host?: string; headers?: Record<string, string> } = {}) {
    const headers = new Headers(init.headers);
    if (init.host) headers.set('host', init.host);
    return new NextRequest(url, { method: init.method ?? 'GET', headers });
}

async function filesUnder(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? filesUnder(full) : [full];
    }));
    return nested.flat();
}

/** App Router URL for a page.tsx / route.ts file: route groups dropped. */
function routeOf(file: string): string {
    const segments = path.dirname(path.relative('app', file)).split(path.sep)
        .filter((segment) => segment !== '.' && !/^\(.*\)$/.test(segment));
    return `/${segments.join('/')}`;
}

afterEach(() => {
    vi.unstubAllEnvs();
    requestHost.value = 'youtick.net';
});

describe('root host parsing', () => {
    it('normalizes case, port and trailing dot', () => {
        expect(normalizeHost('YouTick.NET:443')).toBe('youtick.net');
        expect(normalizeHost('youtick.net.')).toBe('youtick.net');
        expect(normalizeHost('[::1]:3000')).toBe('[::1]');
        expect(normalizeHost('  ')).toBeNull();
        expect([...parsePublicRootHosts(' youtick.net , WWW.youtick.net,,')]).toEqual(['youtick.net', 'www.youtick.net']);
    });

    it('is off when the variable is empty or unset', () => {
        expect(parsePublicRootHosts(undefined).size).toBe(0);
        expect(isPublicRootHost('youtick.net', parsePublicRootHosts(''))).toBe(false);
    });

    it('matches only the configured hosts exactly', () => {
        const hosts = parsePublicRootHosts(ROOT_HOSTS);
        for (const host of ['youtick.net', 'www.youtick.net', 'youtick.net.', 'YOUTICK.net:443']) {
            expect(isPublicRootHost(host, hosts)).toBe(true);
        }
        for (const host of ['app.youtick.net', 'preview.youtick.net', 'localhost:3000', 'evil-youtick.net', null]) {
            expect(isPublicRootHost(host, hosts)).toBe(false);
        }
    });
});

describe('root public set', () => {
    it('serves the public pages, metadata files and static assets', () => {
        for (const pathname of ['/', '/tr', '/tr/', '/apply', '/tr/apply', '/privacy', '/terms', '/tr/privacy', '/tr/terms',
            '/robots.txt', '/sitemap.xml', '/favicon.ico', '/manifest.webmanifest', '/hero-concert.webp',
            '/brand/youtick-logo-256.png', '/_next/static/chunks/main.js', '/_next/static/media/font.woff2']) {
            expect(isPublicRootRequest(pathname, 'GET'), pathname).toBe(true);
            expect(isPublicRootRequest(pathname, 'HEAD'), pathname).toBe(true);
        }
        expect(isPublicRootRequest('/api/creator-applications', 'POST')).toBe(true);
    });

    it('denies app routes, other API routes, other methods and path tricks', () => {
        for (const pathname of ['/discover', '/watch', '/upload', '/profile', '/tickets', '/tickets/buy', '/invite', '/studio',
            '/TR', '/tr/apply/x', '/apply.json', '/%61pply', '/brand/..%2fdiscover', '/brand/', '/_next/image', '/_next/data/x.json',
            '/discover/hero.webp', '/api/near-rpc', '/api/near-rpc/broadcast', '/api', '/claim']) {
            expect(isPublicRootRequest(pathname, 'GET'), pathname).toBe(false);
        }
        expect(isPublicRootRequest('/api/creator-applications', 'GET')).toBe(false);
        expect(isPublicRootRequest('/apply', 'POST')).toBe(false);
        expect(isPublicRootRequest('/', 'DELETE')).toBe(false);
    });

    it('admits every file under public/', async () => {
        const files = await filesUnder('public');
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const pathname = `/${path.relative('public', file).split(path.sep).join('/')}`;
            expect(isPublicRootRequest(pathname, 'GET'), pathname).toBe(true);
        }
    });

    it('admits only the public set among the app routes that exist today', async () => {
        const routes = (await filesUnder('app'))
            .filter((file) => /\/(page\.tsx|route\.ts)$/.test(file) && !file.includes('[...missing]'))
            .map(routeOf);
        const admitted = routes.filter((route) => isPublicRootRequest(route, route.startsWith('/api/') ? 'POST' : 'GET')).sort();
        expect(admitted).toEqual(['/', '/api/content-reports', '/api/creator-applications', '/api/opening-notices', '/apply', '/faq', '/notify', '/privacy', '/refund-policy', '/report', '/terms', '/tr', '/tr/apply', '/tr/faq', '/tr/notify']);
    });

    it('lists only existing public pages in the root sitemap', async () => {
        for (const page of PUBLIC_ROOT_SITEMAP_PATHS) {
            expect(PUBLIC_ROOT_PAGES).toContain(page);
            const candidates = page === '/'
                ? ['app/(site)/page.tsx']
                : [`app/(site)${page}/page.tsx`, `app/(tr)${page}/page.tsx`];
            const found = await Promise.all(candidates.map((file) => access(file, constants.F_OK).then(() => true, () => false)));
            expect(found.some(Boolean), page).toBe(true);
        }
    });
});

describe('middleware root-host gate', () => {
    it('serves a public path on the root host with the page CSP', () => {
        vi.stubEnv('PUBLIC_ROOT_HOSTS', ROOT_HOSTS);
        const response = middleware(request('https://youtick.net/apply', { host: 'youtick.net' }));
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'self' 'nonce-");
        expect(response.headers.get('X-Robots-Tag')).toBeNull();
    });

    it('answers 404 with noindex for an app path on the root hosts', async () => {
        vi.stubEnv('PUBLIC_ROOT_HOSTS', ROOT_HOSTS);
        for (const host of ['youtick.net', 'www.youtick.net']) {
            const response = middleware(request(`https://${host}/discover`, { host }));
            expect(response.status).toBe(404);
            expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
            expect(response.headers.get('Cache-Control')).toBe('no-store');
            expect(response.headers.get('Vary')).toBe('Host');
            expect(response.headers.get('Location')).toBeNull();
            expect(response.headers.get('x-middleware-next')).toBeNull();
            expect(await response.text()).toContain('Page not found');
        }
        const api = middleware(request('https://youtick.net/api/near-rpc', { method: 'POST', host: 'youtick.net' }));
        expect(api.status).toBe(404);
        const head = middleware(request('https://youtick.net/studio', { method: 'HEAD', host: 'youtick.net' }));
        expect(head.status).toBe(404);
        expect(await head.text()).toBe('');
    });

    it('decides by the Host header, not X-Forwarded-Host', () => {
        vi.stubEnv('PUBLIC_ROOT_HOSTS', ROOT_HOSTS);
        const response = middleware(request('https://app.youtick.net/discover', {
            host: 'app.youtick.net',
            headers: { 'x-forwarded-host': 'youtick.net' },
        }));
        expect(response.status).toBe(200);
    });

    it('leaves Preview, app and localhost hosts untouched', () => {
        vi.stubEnv('PUBLIC_ROOT_HOSTS', ROOT_HOSTS);
        for (const host of ['preview.youtick.net', 'app.youtick.net', 'localhost:3000']) {
            const response = middleware(request(`https://${host}/discover`, { host }));
            expect(response.status, host).toBe(200);
            expect(response.headers.get('x-middleware-next')).toBe('1');
            expect(response.headers.get('Content-Security-Policy')).toContain("'nonce-");
        }
    });

    it('is off when PUBLIC_ROOT_HOSTS is unset or empty', () => {
        for (const value of [undefined, '']) {
            if (value === undefined) delete process.env.PUBLIC_ROOT_HOSTS;
            else vi.stubEnv('PUBLIC_ROOT_HOSTS', value);
            const response = middleware(request('https://youtick.net/discover', { host: 'youtick.net' }));
            expect(response.status).toBe(200);
            expect(response.headers.get('x-middleware-next')).toBe('1');
        }
    });

    it('keeps API routes and metadata files out of the page CSP', () => {
        vi.stubEnv('PUBLIC_ROOT_HOSTS', ROOT_HOSTS);
        for (const [url, method] of [
            ['https://youtick.net/api/creator-applications', 'POST'],
            ['https://app.youtick.net/api/near-rpc', 'POST'],
            ['https://youtick.net/robots.txt', 'GET'],
        ]) {
            const response = middleware(request(url, { method, host: new URL(url).host }));
            expect(response.status, url).toBe(200);
            expect(response.headers.get('Content-Security-Policy'), url).toBeNull();
        }
    });

    it('varies robots.txt and sitemap.xml on Host for every host', () => {
        vi.stubEnv('PUBLIC_ROOT_HOSTS', ROOT_HOSTS);
        for (const url of ['https://youtick.net/robots.txt', 'https://app.youtick.net/sitemap.xml']) {
            const response = middleware(request(url, { host: new URL(url).host }));
            expect(response.status, url).toBe(200);
            expect(response.headers.get('Vary'), url).toBe('Host');
        }
    });
});

describe('root-host robots and sitemap', () => {
    it('allows only the public set in robots on the root host', async () => {
        vi.stubEnv('PUBLIC_ROOT_HOSTS', ROOT_HOSTS);
        const { default: robots } = await import('@/app/robots');
        const result = await robots();
        const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
        expect(rules).toHaveLength(1);
        expect(rules[0].disallow).toBe('/');
        expect(rules[0].allow).toEqual(expect.arrayContaining(['/$', '/tr$', '/apply$', '/tr/apply$', '/privacy$', '/terms$']));
        expect(String(rules[0].allow)).not.toMatch(/discover|upload|profile|watch|tickets|studio|invite|api/);
        expect(result.sitemap).toBe('https://youtick.net/sitemap.xml');
    });

    it('keeps the earlier robots rules on other hosts', async () => {
        vi.stubEnv('PUBLIC_ROOT_HOSTS', ROOT_HOSTS);
        requestHost.value = 'preview.youtick.net';
        const { default: robots } = await import('@/app/robots');
        const rules = (await robots()).rules;
        expect(JSON.stringify(rules)).not.toContain('/apply$');
    });

    it('lists only the public pages in the root sitemap and the full list elsewhere', async () => {
        vi.stubEnv('PUBLIC_ROOT_HOSTS', ROOT_HOSTS);
        const { default: sitemap } = await import('@/app/sitemap');
        const root = (await sitemap()).map((entry) => entry.url);
        expect(root).toEqual(['https://youtick.net', 'https://youtick.net/tr', 'https://youtick.net/apply',
            'https://youtick.net/tr/apply', 'https://youtick.net/notify', 'https://youtick.net/tr/notify',
            'https://youtick.net/privacy', 'https://youtick.net/terms',
            'https://youtick.net/refund-policy', 'https://youtick.net/report',
            'https://youtick.net/faq', 'https://youtick.net/tr/faq']);

        requestHost.value = 'app.youtick.net';
        expect((await sitemap()).map((entry) => entry.url)).toContain('https://youtick.net/discover');

        requestHost.value = 'youtick.net';
        vi.stubEnv('PUBLIC_ROOT_HOSTS', '');
        expect((await sitemap()).map((entry) => entry.url)).toContain('https://youtick.net/discover');
    });
});
