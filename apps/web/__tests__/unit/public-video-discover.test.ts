import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({ default: () => null }));

const near = vi.hoisted(() => ({ view: vi.fn() }));
vi.mock('@/lib/near', () => ({ getProvider: () => ({}), viewContract: near.view }));
const publication = { publication_id: 'new-video', creator_id: 'creator.testnet', title: 'My video',
    generation: 1, price_usdc: '2000000', playback_id: 'playback_new', availability: 'ACTIVE',
    published_at_ms: 1_785_600_000_103, source_block_height: 103 };
const page = { schema: 'youtick.publications.v1', network: 'testnet', contract_id: 'public-video.testnet',
    watermark: { block_height: 103, block_hash: 'block_hash_000000000000000000000103' }, items: [publication], next_cursor: null };

beforeEach(() => {
    vi.resetModules();
    for (const [key, value] of Object.entries({
        NEXT_PUBLIC_NEAR_NETWORK: 'testnet', NEXT_PUBLIC_VIDEO_ENVIRONMENT: 'public-testnet',
        NEXT_PUBLIC_MARKET_CONTRACT_ID: 'public-video.testnet', NEXT_PUBLIC_ACCESS_CONTRACT_ID: 'public-access.testnet',
        NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL: 'true', NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1: 'true',
        NEXT_PUBLIC_MARKET_READ_MODEL_URL: 'https://read-public.test',
    })) vi.stubEnv(key, value);
    near.view.mockReset().mockImplementation(async (_provider, _contract, method) => method === 'get_publications_count' ? 1 : [publication]);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('takes a normal public Discover result to its Watch link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(page)));
    const { fetchDiscoverPage } = await import('@/hooks/useAllVideos');
    const { VideoCard } = await import('@/components/VideoCard');
    const result = await fetchDiscoverPage({ source: 'auto' });
    expect(result.publications[0].title).toBe('My video');
    const html = renderToStaticMarkup(React.createElement(VideoCard, { publication: result.publications[0] }));
    expect(html).toContain('href="/watch?job=new-video"');
    expect(near.view).not.toHaveBeenCalled();
});

it('discards an old Market response and falls back to canonical publications', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...page, contract_id: 'old-beta.testnet' })));
    const { fetchDiscoverPage } = await import('@/hooks/useAllVideos');
    expect((await fetchDiscoverPage({ source: 'auto' })).publications[0].publication_id).toBe('new-video');
    expect(near.view.mock.calls.every((call) => call[1] === 'public-video.testnet')).toBe(true);
    expect(near.view).toHaveBeenCalledTimes(2);
});

it('aborts a stalled initial request after 2500 ms and uses the same NEAR fallback', async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
        expect(ms).toBe(2500);
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
    });
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError')));
    })));
    const { fetchDiscoverPage } = await import('@/hooks/useAllVideos');
    const result = fetchDiscoverPage({ source: 'auto' });
    await vi.advanceTimersByTimeAsync(2500);
    expect((await result).publications[0].publication_id).toBe('new-video');
    expect(near.view).toHaveBeenCalledTimes(2);
});

it('shows public limits and self-service token guidance without the legacy campaign', async () => {
    const { PublicTestnetBetaBanner } = await import('@/components/PublicTestnetBetaBanner');
    const { default: Terms } = await import('@/app/terms/page');
    const client = new QueryClient();
    const banner = renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, React.createElement(PublicTestnetBetaBanner)));
    const terms = renderToStaticMarkup(React.createElement(Terms));
    expect(banner).toContain('5 GB/file');
    expect(banner).toContain('2 uploads/UTC day');
    expect(banner + terms).not.toMatch(/14-day|10 uploads total|day 13/);
    expect(terms).toContain('https://faucet.circle.com/');
    expect(terms).toContain('Near Testnet');
    expect(near.view).not.toHaveBeenCalled();
    client.clear();
});
