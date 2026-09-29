import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InfiniteQueryObserver, QueryClient, QueryClientProvider } from '@tanstack/react-query';

beforeEach(() => {
    process.env.NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL = 'true';
    process.env.NEXT_PUBLIC_ENABLE_CURRENT_CATALOG = 'true';
    process.env.NEXT_PUBLIC_VIDEO_ENVIRONMENT = 'public-testnet';
    process.env.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = 'true';
    process.env.NEXT_PUBLIC_MARKET_READ_MODEL_URL = 'https://read.test';
    vi.useFakeTimers(); vi.setSystemTime(1790690400000); vi.resetModules();
});
afterEach(() => {
    for (const key of ['NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL', 'NEXT_PUBLIC_ENABLE_CURRENT_CATALOG',
        'NEXT_PUBLIC_VIDEO_ENVIRONMENT', 'NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1', 'NEXT_PUBLIC_MARKET_READ_MODEL_URL']) delete process.env[key];
    vi.unstubAllGlobals(); vi.useRealTimers();
});
const publication = { publication_id: 'pub-a', creator_id: 'creator.testnet', title: 'Current release',
    generation: 1, price_usdc: '2000000', playback_id: 'playback_a', availability: 'ACTIVE', published_at_ms: 1790690300000 };
function payload(age = 0) {
    return { schema: 'youtick.current-catalog.v1', source: 'current-state', network: 'testnet', contract_id: 'market.testnet',
        catalog: { network: 'testnet', contract_id: 'market.testnet', verified_block_height: 123,
            verified_block_hash: 'B6oE1UWkynBdztjt3CDPHv5er7q9PVqtYNUWBcC57SPX',
            source_block_timestamp_ms: Date.now() - age, checked_at_ms: Date.now(), publication_count: 1, content_revision: 'a'.repeat(64) },
        served_at_ms: Date.now(), freshness: age > 90000 ? 'stale' : 'fresh', items: [publication], next_cursor: null };
}

describe('current catalogue client', () => {
    it('uses only v2 with a closed default and validates source identity and bounded staleness', async () => {
        const fetch = vi.fn().mockImplementation(async () => Response.json(payload()));
        vi.stubGlobal('fetch', fetch);
        const { readCurrentCatalogPage, currentCatalogFreshness } = await import('@/lib/current-catalog');
        const page = await readCurrentCatalogPage(null, 24);
        expect(String(fetch.mock.calls[0][0])).toBe('https://read.test/v2/publications?limit=24');
        expect(fetch.mock.calls[0][1].cache).toBe('no-store');
        expect(currentCatalogFreshness([page], Date.now() + 90001)).toBe('stale');
        expect(currentCatalogFreshness([page], Date.now() + 180001)).toBe('unavailable');
        const wrong = payload(); wrong.contract_id = 'other.testnet';
        fetch.mockResolvedValue(Response.json(wrong));
        await expect(readCurrentCatalogPage(null, 24)).rejects.toThrow('invalid_current_catalog');
        fetch.mockResolvedValue(Response.json(payload(180001)));
        await expect(readCurrentCatalogPage(null, 24)).rejects.toThrow('catalog_unavailable');
        process.env.NEXT_PUBLIC_ENABLE_CURRENT_CATALOG = 'false'; vi.resetModules();
        const disabled = await import('@/lib/current-catalog');
        await expect(disabled.readCurrentCatalogPage(null, 24)).rejects.toThrow('current_catalog_disabled');
    });

    it('a changed snapshot fails the whole page sequence, then restarts from the first page', async () => {
        let changed = false;
        const fetch = vi.fn().mockImplementation(async (url: URL) => {
            if (url.searchParams.has('cursor')) return Response.json({ error: 'catalog_changed' }, { status: 409 });
            return Response.json({ ...payload(), items: [{ ...publication, title: changed ? 'New snapshot' : publication.title }], next_cursor: changed ? null : 'next' });
        });
        vi.stubGlobal('fetch', fetch);
        const { currentCatalogQueryOptions } = await import('@/hooks/useCurrentCatalog');
        const client = new QueryClient();
        const options = currentCatalogQueryOptions();
        const observer = new InfiniteQueryObserver(client, options);
        const unsubscribe = observer.subscribe(() => {});
        await vi.advanceTimersByTimeAsync(1);
        await observer.fetchNextPage();
        expect(observer.getCurrentResult().error?.message).toBe('catalog_changed');
        changed = true;
        await client.resetQueries({ queryKey: options.queryKey, exact: true });
        expect(observer.getCurrentResult().data?.pages.flatMap(page => page.items.map(item => item.title))).toEqual(['New snapshot']);
        expect(fetch.mock.calls.map(([url]) => (url as URL).pathname)).toEqual(['/v2/publications', '/v2/publications', '/v2/publications']);
        unsubscribe(); client.clear();
    });

    it.each([0, 90001, 180001])('the current hook hides expired cards and warns on stale cards at age %i', async age => {
        const { useCurrentCatalog, currentCatalogQueryOptions } = await import('@/hooks/useCurrentCatalog');
        const client = new QueryClient();
        const options = currentCatalogQueryOptions();
        client.setQueryData(options.queryKey, { pages: [{ items: [publication], nextCursor: null, revision: 'a'.repeat(64),
            staleAt: Date.now() + 90000 - age, expiresAt: Date.now() + 180000 - age }], pageParams: [null] });
        function View() {
            const value = useCurrentCatalog();
            return createElement('div', null, value.publications.map(p => p.title).join(''), value.warning, value.error?.message);
        }
        const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(View)));
        expect(html.includes('Current release')).toBe(age <= 180000);
        expect(html.includes('last verified earlier')).toBe(age > 90000 && age <= 180000);
        expect(html.includes('catalog_unavailable')).toBe(age > 180000);
        client.clear();
    });
});
