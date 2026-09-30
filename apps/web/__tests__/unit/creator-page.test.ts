import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LivepeerPublication } from '@/lib/livepeer-publication';

const s = vi.hoisted(() => ({
    flags: { enablePaidMediaLivepeerV1: true, enableDerivedReadModel: true, enableCurrentCatalog: false },
    current: {} as Record<string, unknown>,
    derived: {} as Record<string, unknown>,
    infinite: [] as Array<{ queryKey: unknown[]; enabled?: boolean }>,
    currentCreator: [] as unknown[],
}));

vi.mock('next/image', () => ({ default: () => null }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/lib/constants', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/constants')>();
    const FEATURE_FLAGS = { ...actual.FEATURE_FLAGS };
    for (const key of Object.keys(s.flags) as Array<keyof typeof s.flags>) {
        Object.defineProperty(FEATURE_FLAGS, key, { get: () => s.flags[key], enumerable: true });
    }
    return { ...actual, FEATURE_FLAGS, APP_CONFIG: { ...actual.APP_CONFIG, livepeerBridgeUrl: '' } };
});
vi.mock('@/hooks/useCurrentCatalog', () => ({ useCurrentCatalog: (creator: unknown) => { s.currentCreator.push(creator); return s.current; } }));
vi.mock('@tanstack/react-query', () => ({
    useInfiniteQuery: (options: { queryKey: unknown[]; enabled?: boolean }) => { s.infinite.push(options); return s.derived; },
}));

import { CREATOR_ACCOUNT_PATTERN, displayAccount, isImplicitAccount } from '@/components/creator/creator-account';
import { CreatorView } from '@/components/creator/CreatorView';
import CreatorPage, { generateMetadata } from '@/app/c/[account]/page';

const IMPLICIT = 'a'.repeat(60) + 'beef';
function publication(id: string, published: number): LivepeerPublication {
    return { publication_id: id, creator_id: 'kule.testnet', title: `Title ${id}`, price_usdc: '2000000', generation: 1,
        playback_id: `playback_${id}`, availability: 'ACTIVE', published_at_ms: published } as LivepeerPublication;
}
const page = (overrides: Record<string, unknown>) => ({ publications: [], loading: false, error: null, hasNextPage: false,
    isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(), ...overrides });

describe('creator accounts', () => {
    it.each([
        ['kule.testnet', true], ['a1', true], [IMPLICIT, true], ['0x' + '1'.repeat(40), true],
        ['A.testnet', false], ['-bad', false], ['a', false], ['x'.repeat(65), false], ['../x', false],
    ])('validates %s', (account, valid) => {
        expect(CREATOR_ACCOUNT_PATTERN.test(account)).toBe(valid);
    });

    it('shortens only implicit accounts', () => {
        expect(isImplicitAccount(IMPLICIT)).toBe(true);
        expect(displayAccount(IMPLICIT)).toBe('aaaaaa…beef');
        expect(displayAccount('0x' + 'ab'.repeat(20))).toBe('0xabab…abab');
        expect(displayAccount('kule-kolektif.testnet')).toBe('kule-kolektif.testnet');
    });
});

describe('creator page', () => {
    afterEach(() => {
        Object.assign(s.flags, { enablePaidMediaLivepeerV1: true, enableDerivedReadModel: true, enableCurrentCatalog: false });
        s.infinite = []; s.currentCreator = [];
    });
    const render = (account = 'kule.testnet') => renderToStaticMarkup(React.createElement(CreatorView, { accountId: account }));

    it('uses the derived creator catalogue (v1) newest first, with a share link and no invented profile', () => {
        s.derived = { data: { pages: [{ items: [publication('old', 1), publication('new', 9)] }] }, isLoading: false, error: null, hasNextPage: true, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn() };
        const html = render();
        expect(s.infinite[0]).toMatchObject({ queryKey: ['creatorPage', 'kule.testnet'], enabled: true });
        expect(html.indexOf('href="/s/new"')).toBeLessThan(html.indexOf('href="/s/old"'));
        expect(html).toContain('2 screenings loaded');
        expect(html).toContain('>Copy link</button>');
        expect(html).toContain('>Show more</button>');
        expect(html).not.toMatch(/<img[^>]*avatar|bio|followers/i);
    });

    it('uses the current catalogue (v2) for this creator when enabled', () => {
        s.flags.enableCurrentCatalog = true;
        s.current = page({ publications: [publication('a', 1)], warning: 'The catalogue is being updated.' });
        const html = render();
        expect(s.currentCreator).toContain('kule.testnet');
        expect(s.infinite[0].enabled).toBe(false);
        expect(html).toContain('href="/s/a"');
        expect(html).toContain('The catalogue is being updated.');
    });

    it.each([
        ['loading', { isLoading: true }, 'Loading releases…'],
        ['error', { error: new Error('x') }, 'Releases could not be loaded.'],
        ['empty', { data: { pages: [{ items: [] }] } }, 'No screenings from this creator yet.'],
    ])('shows the %s state', (_label, query, text) => {
        s.derived = { data: undefined, isLoading: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(), ...query };
        expect(render()).toContain(text);
    });

    it('says the catalogue is unavailable when no creator source is enabled', () => {
        Object.assign(s.flags, { enableDerivedReadModel: false, enableCurrentCatalog: false });
        expect(render()).toContain('not available in this environment');
    });

    it('shows the implicit account shortened with the full id available', () => {
        s.derived = { data: { pages: [{ items: [] }] }, isLoading: false, error: null };
        const html = render(IMPLICIT);
        expect(html).toContain(`title="${IMPLICIT}">aaaaaa…beef</h1>`);
        expect(html).toContain(IMPLICIT);
    });

    it('rejects invalid accounts, gates the closed runtime and describes the page', async () => {
        await expect(CreatorPage({ params: Promise.resolve({ account: 'Bad Account' }) })).rejects.toThrow('NEXT_NOT_FOUND');
        await expect(CreatorPage({ params: Promise.resolve({ account: '%E0%A4%A' }) })).rejects.toThrow('NEXT_NOT_FOUND');
        Object.assign(s.flags, { enablePaidMediaLivepeerV1: false, enableDerivedReadModel: false });
        const closed = await CreatorPage({ params: Promise.resolve({ account: 'kule.testnet' }) });
        expect(((closed as React.ReactElement).type as { name: string }).name).toBe('RuntimeClosed');
        expect(await generateMetadata({ params: Promise.resolve({ account: IMPLICIT }) })).toMatchObject({
            title: 'aaaaaa…beef', alternates: { canonical: `/c/${IMPLICIT}` },
        });
    });
});
