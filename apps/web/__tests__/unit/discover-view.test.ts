import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LivepeerPublication } from '@/lib/livepeer-publication';

const s = vi.hoisted(() => ({
    catalog: {} as Record<string, unknown>,
    flags: { enablePaidMediaLivepeerV1: true, enableCurrentCatalog: false },
}));

vi.mock('next/image', () => ({ default: (props: Record<string, unknown>) => React.createElement('img', { src: String(props.src), alt: '' }) }));
vi.mock('@/lib/constants', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/constants')>();
    const FEATURE_FLAGS = { ...actual.FEATURE_FLAGS };
    for (const key of Object.keys(s.flags) as Array<keyof typeof s.flags>) {
        Object.defineProperty(FEATURE_FLAGS, key, { get: () => s.flags[key], enumerable: true });
    }
    return { ...actual, FEATURE_FLAGS, APP_CONFIG: { ...actual.APP_CONFIG, livepeerBridgeUrl: 'https://bridge.youtick.test' } };
});
vi.mock('@/hooks/useAllVideos', () => ({ useAllVideos: () => s.catalog }));
vi.mock('@/hooks/useCurrentCatalog', () => ({ useCurrentCatalog: () => s.catalog }));

import {
    FEATURED_COUNT,
    featuredPublications,
    filterPublications,
    formatPublishedDate,
    searchKey,
    shouldRotate,
    sortPublications,
} from '@/components/discover/discover-model';
import { DiscoverView } from '@/components/discover/DiscoverView';
import { FeaturedStage } from '@/components/discover/FeaturedStage';
import { VideoCard } from '@/components/VideoCard';

function publication(id: string, overrides: Partial<LivepeerPublication> = {}): LivepeerPublication {
    return {
        publication_id: id, creator_id: `${id}.testnet`, title: `Title ${id}`, price_usdc: '2000000', generation: 1,
        playback_id: `playback_${id}`, availability: 'ACTIVE', published_at_ms: 1_000, ...overrides,
    } as LivepeerPublication;
}

const catalog = (overrides: Record<string, unknown>) => ({ publications: [], loading: false, error: null, warning: undefined,
    hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(), ...overrides });

describe('discover model', () => {
    const items = [
        publication('a', { published_at_ms: 5, price_usdc: '9000000' }),
        publication('b', { published_at_ms: 9, price_usdc: '3000000', availability: 'SALES_SUSPENDED' }),
        publication('c', { published_at_ms: 7, price_usdc: '3000000' }),
        publication('d', { published_at_ms: 1, price_usdc: '2000000' }),
        publication('e', { published_at_ms: 8, price_usdc: '12000000' }),
        publication('f', { published_at_ms: 6, price_usdc: '2000000', availability: 'TAKEDOWN' }),
        publication('g', { published_at_ms: 3 }),
    ];

    it('features the newest four screenings with open sales', () => {
        expect(featuredPublications(items).map((item) => item.publication_id)).toEqual(['e', 'c', 'a', 'g']);
        expect(featuredPublications(items)).toHaveLength(FEATURED_COUNT);
        expect(featuredPublications([])).toEqual([]);
    });

    it('sorts loaded pages by newest or ascending price without mutating the input', () => {
        const before = items.map((item) => item.publication_id);
        expect(sortPublications(items, 'newest').map((item) => item.publication_id)).toEqual(['b', 'e', 'c', 'f', 'a', 'g', 'd']);
        expect(sortPublications(items, 'price').map((item) => item.publication_id)).toEqual(['f', 'g', 'd', 'b', 'c', 'a', 'e']);
        expect(items.map((item) => item.publication_id)).toEqual(before);
    });

    it('searches titles and creators ignoring case, accents and Turkish i', () => {
        const list = [
            publication('x', { title: 'Kış Konseri', creator_id: 'kule.testnet' }),
            publication('y', { title: 'Gece Yarısı Provası', creator_id: 'İzmir-film.testnet' }),
        ];
        expect(searchKey(' İSTANBUL ')).toBe('istanbul');
        expect(filterPublications(list, 'KIS').map((item) => item.publication_id)).toEqual(['x']);
        expect(filterPublications(list, 'yarisi').map((item) => item.publication_id)).toEqual(['y']);
        expect(filterPublications(list, 'izmir').map((item) => item.publication_id)).toEqual(['y']);
        expect(filterPublications(list, 'KULE').map((item) => item.publication_id)).toEqual(['x']);
        expect(filterPublications(list, '   ')).toHaveLength(2);
        expect(filterPublications(list, 'nothing')).toEqual([]);
    });

    it.each([
        [{ count: 4, reducedMotion: false, focused: false, hidden: false }, true],
        [{ count: 4, reducedMotion: true, focused: false, hidden: false }, false],
        [{ count: 4, reducedMotion: false, focused: true, hidden: false }, false],
        [{ count: 4, reducedMotion: false, focused: false, hidden: true }, false],
        [{ count: 1, reducedMotion: false, focused: false, hidden: false }, false],
    ])('rotates only when allowed: %j', (input, expected) => {
        expect(shouldRotate(input)).toBe(expected);
    });

    it('formats the publication date in UTC for the selected language', () => {
        expect(formatPublishedDate(Date.UTC(2026, 8, 12, 23, 30), 'en')).toBe('September 12, 2026');
        expect(formatPublishedDate(Date.UTC(2026, 8, 12, 23, 30), 'tr')).toBe('12 Eylül 2026');
    });
});

describe('discover view', () => {
    afterEach(() => { s.flags.enablePaidMediaLivepeerV1 = true; });
    const render = () => renderToStaticMarkup(React.createElement(DiscoverView));

    it('shows the featured stage, programme controls and cards linking to screenings', () => {
        s.catalog = catalog({ publications: [publication('a', { published_at_ms: 2 }), publication('b', { availability: 'SALES_SUSPENDED' })] });
        const html = render();
        expect(html).toContain('<h1 class="sr-only">Discover</h1>');
        expect(html).toContain('aria-roledescription="carousel"');
        expect(html).toContain('New screening · 01 / 01');
        expect(html).toContain('Buy ticket — 2 USDC');
        expect(html).toContain('aria-label="Search screenings or creators"');
        expect(html).toMatch(/aria-pressed="true"[^>]*>Newest<\/button>/);
        expect(html).toContain('href="/s/a"');
        expect(html).toContain('Sales paused');
        expect(html).not.toContain('Your tickets');
    });

    it('keeps cards without links while paid media is closed', () => {
        s.flags.enablePaidMediaLivepeerV1 = false;
        s.catalog = catalog({ publications: [publication('a')] });
        const html = render();
        expect(html).not.toContain('href="/s/');
        expect(html).not.toContain('Buy ticket');
        expect(html).not.toContain('href="/studio/new"');
    });

    it.each([
        ['loading', { loading: true }, ['role="status"', 'Loading releases…']],
        ['load error', { error: new Error('x') }, ['role="alert"', 'Releases could not be loaded.', '>Try again</button>']],
        ['update error', { error: new Error('x'), publications: [publication('a')] }, ['Releases could not be updated.', 'href="/s/a"']],
        ['stale warning', { warning: 'The catalogue is being updated.', publications: [publication('a')] }, ['The catalogue is being updated.']],
        ['empty', {}, ['No releases are available yet.']],
        ['empty page', { hasNextPage: true }, ['No releases on this page.', '>Show more</button>']],
        ['more', { publications: [publication('a')], hasNextPage: true, isFetchingNextPage: true }, ['>Loading…</button>']],
    ])('keeps the %s state', (_label, overrides, expected) => {
        s.catalog = catalog(overrides);
        const html = render();
        for (const text of expected) expect(html).toContain(text);
    });

    it('offers one pressed selector per featured screening', () => {
        const html = renderToStaticMarkup(React.createElement(FeaturedStage, {
            publications: ['a', 'b', 'c'].map((id) => publication(id)),
        }));
        expect(html.match(/aria-pressed=/g)).toHaveLength(3);
        expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
        expect(html).toContain('aria-label="Show Title b"');
    });

    it('shows the poster when a card has no usable cover', () => {
        const html = renderToStaticMarkup(React.createElement(VideoCard, { publication: publication('a', { availability: 'TAKEDOWN' }) }));
        expect(html).toContain('src="https://bridge.youtick.test/v1/publication-covers/a/1"');
        expect(html).toContain('Unavailable');
    });
});
