import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryObserver, InfiniteQueryObserver, focusManager } from '@tanstack/react-query';

const state = vi.hoisted(() => ({
    flags: { enableDerivedReadModel: true, enablePaidMediaLivepeerV1: false },
    infinite: vi.fn(), query: vi.fn(), read: vi.fn(), nearCount: vi.fn(),
}));
vi.mock('@/lib/constants', () => ({ FEATURE_FLAGS: state.flags, NEAR_NETWORK: 'testnet', NEAR_CONFIG: { marketContractId: 'market.testnet' } }));
vi.mock('@/lib/market-read-model', () => ({ readMarketPublicationPage: state.read, readMarketCreatorPublicationPage: state.read }));
vi.mock('@/lib/livepeer-publication', () => ({
    readLivepeerPublications: async () => [], readLivepeerPublicationsCount: state.nearCount,
    formatUsdc: () => '0', readCreatorBalance: async () => '0', withdrawCreatorBalance: vi.fn(),
}));
vi.mock('@/components/providers/WalletProvider', () => ({ useWallet: () => ({ accountId: 'creator.testnet', isReady: true }) }));
vi.mock('@tanstack/react-query', async importOriginal => ({
    ...await importOriginal<typeof import('@tanstack/react-query')>(),
    useInfiniteQuery: state.infinite, useQuery: state.query, useQueryClient: () => ({}),
}));
import { useAllVideos } from '@/hooks/useAllVideos';
import ProfilePage from '@/app/profile/page';

let client: QueryClient;
let unsubscribe: (() => void) | undefined;
beforeEach(() => {
    vi.useFakeTimers(); focusManager.setFocused(true);
    state.flags.enableDerivedReadModel = true;
    state.infinite.mockReturnValue({}); state.query.mockReturnValue({});
    state.read.mockResolvedValue({ items: [], nextCursor: null });
    state.nearCount.mockResolvedValue(0);
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

it('Profile activity uses the same visible-only refresh behavior', async () => {
    renderToStaticMarkup(createElement(ProfilePage));
    const options = state.query.mock.calls.find(([options]) => options.queryKey[0] === 'creatorReadModel')![0];
    const observer = new QueryObserver(client, options);
    unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(1);
    expect(state.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15000);
    expect(state.read).toHaveBeenCalledTimes(2);
    focusManager.setFocused(false);
    await vi.advanceTimersByTimeAsync(45000);
    expect(state.read).toHaveBeenCalledTimes(2);
});
