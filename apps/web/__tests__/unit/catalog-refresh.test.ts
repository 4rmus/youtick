import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryObserver, InfiniteQueryObserver, focusManager } from '@tanstack/react-query';

vi.mock('next/image', () => ({ default: () => null }));
const state = vi.hoisted(() => ({
    flags: { enableDerivedReadModel: true, enablePaidMediaLivepeerV1: false },
    infinite: vi.fn(), query: vi.fn(), read: vi.fn(), nearCount: vi.fn(), nearRead: vi.fn(),
}));
vi.mock('@/lib/constants', () => ({ FEATURE_FLAGS: state.flags, NEAR_NETWORK: 'testnet', NEAR_CONFIG: { marketContractId: 'market.testnet' } }));
vi.mock('@/lib/market-read-model', () => ({ readMarketPublicationPage: state.read, readMarketCreatorPublicationPage: state.read }));
vi.mock('@/lib/livepeer-publication', () => ({
    readLivepeerPublications: state.nearRead, readLivepeerPublicationsCount: state.nearCount,
    livepeerPublicationCoverUrl: () => null,
    formatUsdc: () => '0', readCreatorBalance: async () => '0', withdrawCreatorBalance: vi.fn(),
}));
vi.mock('@/components/providers/WalletProvider', () => ({ useWallet: () => ({ accountId: 'creator.testnet', isReady: true }) }));
vi.mock('@tanstack/react-query', async importOriginal => ({
    ...await importOriginal<typeof import('@tanstack/react-query')>(),
    useInfiniteQuery: state.infinite, useQuery: state.query, useQueryClient: () => ({}),
}));
import { useAllVideos } from '@/hooks/useAllVideos';
import ProfilePage from '@/app/profile/page';
import { DiscoverView } from '@/components/discover/DiscoverView';

let client: QueryClient;
let unsubscribe: (() => void) | undefined;
beforeEach(() => {
    vi.useFakeTimers(); focusManager.setFocused(true);
    state.flags.enableDerivedReadModel = true;
    state.infinite.mockReturnValue({}); state.query.mockReturnValue({});
    state.read.mockResolvedValue({ items: [], nextCursor: null });
    state.nearCount.mockResolvedValue(0);
    state.nearRead.mockReset().mockResolvedValue([]);
    client = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
});
afterEach(() => { unsubscribe?.(); client.clear(); focusManager.setFocused(undefined); vi.useRealTimers(); });

it('Discover refreshes while visible, pauses while hidden and does not multiply failed retries', async () => {
    useAllVideos();
    const observer = new InfiniteQueryObserver(client, state.infinite.mock.calls[0][0]);
    unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(1);
    expect(state.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15000);
    expect(state.read).toHaveBeenCalledTimes(2);
    focusManager.setFocused(false);
    await vi.advanceTimersByTimeAsync(45000);
    expect(state.read).toHaveBeenCalledTimes(2);
    focusManager.setFocused(true);
    state.read.mockRejectedValue(new Error('D1 unavailable'));
    state.nearCount.mockRejectedValue(new Error('RPC unavailable'));
    await vi.advanceTimersByTimeAsync(15000);
    expect(state.read).toHaveBeenCalledTimes(3);
    expect(state.nearCount).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(state.read).toHaveBeenCalledTimes(3);
    expect(observer.getCurrentResult().isError).toBe(true);
});

it('the disabled derived flag keeps the canonical path free of polling', async () => {
    state.flags.enableDerivedReadModel = false;
    useAllVideos();
    const observer = new InfiniteQueryObserver(client, state.infinite.mock.calls[0][0]);
    unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(60000);
    expect(state.read).not.toHaveBeenCalled();
    expect(state.nearCount).toHaveBeenCalledOnce();
});

it('spaces multi-page polling without mixing old cursors and restores single-page freshness', async () => {
    let cursors: (string | null)[] = [null, 'old-1', 'old-2'];
    let ids = ['film-a', 'film-b', 'film-c'];
    state.read.mockImplementation(async (cursor) => {
        const index = cursors.indexOf(cursor);
        expect(index).toBeGreaterThanOrEqual(0);
        return { items: [{ publication_id: ids[index] }], nextCursor: cursors[index + 1] ?? null };
    });
    useAllVideos();
    const observer = new InfiniteQueryObserver(client, state.infinite.mock.calls[0][0]);
    unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(1);
    await observer.fetchNextPage();
    await observer.fetchNextPage();
    expect(state.read).toHaveBeenCalledTimes(3);
    state.read.mockClear();
    cursors = [null, 'new-1', 'new-2'];
    ids = ['new-film', 'film-a', 'film-b'];
    await vi.advanceTimersByTimeAsync(15000);
    expect(state.read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30000);
    expect(state.read.mock.calls.map(([cursor]) => cursor)).toEqual(cursors);
    state.infinite.mockReturnValue(observer.getCurrentResult());
    expect(useAllVideos().publications.map(item => item.publication_id)).toEqual(ids);
    await vi.advanceTimersByTimeAsync(45000);
    expect(state.read).toHaveBeenCalledTimes(6);

    state.read.mockResolvedValue({ items: [], nextCursor: null });
    await vi.advanceTimersByTimeAsync(45000);
    expect(state.read).toHaveBeenCalledTimes(7);
    await vi.advanceTimersByTimeAsync(15000);
    expect(state.read).toHaveBeenCalledTimes(8);
    state.infinite.mockReturnValue(observer.getCurrentResult());
    expect(useAllVideos().publications).toEqual([]);
});

it.each(['refetch', 'fetchNextPage'] as const)('keeps Discover cards after a failed %s and replaces them after recovery', async (action) => {
    state.read.mockResolvedValue({ items: [{
        publication_id: 'pub-1', creator_id: 'creator.testnet', title: 'Previously loaded film',
        generation: 1, price_usdc: '2000000', playback_id: 'playback_1',
        availability: 'ACTIVE', published_at_ms: 1_785_600_000_000,
    }], nextCursor: 'next_cursor' });
    useAllVideos();
    const observer = new InfiniteQueryObserver(client, state.infinite.mock.calls[0][0]);
    unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(1);
    state.read.mockRejectedValue(new Error('D1 unavailable'));
    state.nearCount.mockRejectedValue(new Error('RPC unavailable'));
    await observer[action]();
    state.infinite.mockReturnValue(observer.getCurrentResult());
    const failed = renderToStaticMarkup(createElement(DiscoverView));
    expect(failed).toContain('Previously loaded film');
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('Showing previously loaded releases.');
    expect(failed).toContain('Try again');
    expect(failed).toContain('Show more');
    expect(failed).not.toContain('No releases are available yet.');

    state.read.mockResolvedValue({ items: [], nextCursor: null });
    await observer.refetch();
    state.infinite.mockReturnValue(observer.getCurrentResult());
    const recovered = renderToStaticMarkup(createElement(DiscoverView));
    expect(recovered).not.toContain('Previously loaded film');
    expect(recovered).not.toContain('role="alert"');
    expect(recovered).toContain('No releases are available yet.');
});

it('shows an initial Discover failure without claiming the catalogue is empty', async () => {
    state.read.mockRejectedValue(new Error('D1 unavailable'));
    state.nearCount.mockRejectedValue(new Error('RPC unavailable'));
    useAllVideos();
    const observer = new InfiniteQueryObserver(client, state.infinite.mock.calls[0][0]);
    unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(1);
    state.infinite.mockReturnValue(observer.getCurrentResult());
    const html = renderToStaticMarkup(createElement(DiscoverView));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Releases could not be loaded.');
    expect(html).toContain('Try again');
    expect(html).not.toContain('Showing previously loaded releases.');
    expect(html).not.toContain('No releases are available yet.');
});

it.each([true, false])('can continue from an inactive NEAR page to an older page (active release: %s)', async (hasActive) => {
    const publication = {
        publication_id: 'older-film', creator_id: 'creator.testnet', title: 'Older active film',
        generation: 1, price_usdc: '2000000', playback_id: 'playback_1',
        availability: 'ACTIVE', published_at_ms: 1_785_600_000_000,
    };
    let completePage!: (items: typeof publication[]) => void;
    state.read.mockRejectedValue(new Error('D1 unavailable'));
    state.nearCount.mockResolvedValue(48);
    state.nearRead.mockResolvedValueOnce(Array.from({ length: 24 }, (_, i) => ({
        ...publication, publication_id: `inactive-${i}`, availability: 'SALES_SUSPENDED',
    }))).mockImplementationOnce(() => new Promise<typeof publication[]>(resolve => { completePage = resolve; }));
    useAllVideos();
    const observer = new InfiniteQueryObserver(client, state.infinite.mock.calls[0][0]);
    unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(1);
    state.infinite.mockReturnValue(observer.getCurrentResult());
    const first = renderToStaticMarkup(createElement(DiscoverView));
    expect(first).toContain('Show more');
    expect(first).not.toContain('No releases are available yet.');
    expect(state.nearRead).toHaveBeenCalledExactlyOnceWith(24, 24);

    const pending = observer.fetchNextPage();
    await vi.advanceTimersByTimeAsync(1);
    state.infinite.mockReturnValue(observer.getCurrentResult());
    const loading = renderToStaticMarkup(createElement(DiscoverView));
    expect(loading).toMatch(/<button[^>]*disabled=""/);
    expect(loading).toContain('Loading…');
    completePage(hasActive ? [publication] : []);
    await pending;
    state.infinite.mockReturnValue(observer.getCurrentResult());
    const last = renderToStaticMarkup(createElement(DiscoverView));
    expect(last).toContain(hasActive ? 'Older active film' : 'No releases are available yet.');
    expect(last).not.toContain('Show more');
    expect(last).not.toContain('Loading…');
    expect(state.nearRead).toHaveBeenNthCalledWith(2, 0, 24);
    expect(state.nearCount).toHaveBeenCalledOnce();
    expect(state.read).toHaveBeenCalledOnce();
});

it('Profile activity uses the same visible-only refresh behavior', async () => {
    renderToStaticMarkup(createElement(ProfilePage));
    const options = state.query.mock.calls.find(([options]) => options.queryKey[0] === 'creatorReadModel')![0];
    const observer = new QueryObserver(client, options);
    unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(1);
    expect(state.read).toHaveBeenCalledTimes(1);
    expect(state.read).toHaveBeenNthCalledWith(1, 'creator.testnet', null, 5);
    await vi.advanceTimersByTimeAsync(15000);
    expect(state.read).toHaveBeenCalledTimes(2);
    expect(state.read).toHaveBeenNthCalledWith(2, 'creator.testnet', null, 5);
    focusManager.setFocused(false);
    await vi.advanceTimersByTimeAsync(45000);
    expect(state.read).toHaveBeenCalledTimes(2);
});
