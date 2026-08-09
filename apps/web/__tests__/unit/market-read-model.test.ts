import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    delete process.env.NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL;
    delete process.env.NEXT_PUBLIC_MARKET_READ_MODEL_URL;
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('derived Market read client', () => {
    it('parses one versioned publication page from the exact configured origin', async () => {
        process.env.NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL = 'true';
        process.env.NEXT_PUBLIC_MARKET_READ_MODEL_URL = 'https://read.test';
        const fetchMock = vi.fn().mockResolvedValue(Response.json({
            schema: 'youtick.publications.v1',
            watermark: { block_height: 103, block_hash: 'block_hash_000000000000000000000103' },
            items: [{
                publication_id: 'pub-c', creator_id: 'creator.testnet', title: 'Release C',
                generation: 1, price_usdc: '2000000', playback_id: 'playback_c',
                availability: 'ACTIVE', published_at_ms: 1_785_600_000_103,
                source_block_height: 103,
            }],
            next_cursor: 'next_cursor',
        }));
        vi.stubGlobal('fetch', fetchMock);
        const { readMarketPublicationPage } = await import('@/lib/market-read-model');

        const page = await readMarketPublicationPage(null, 24);

        expect(page.items[0].title).toBe('Release C');
        expect(page.nextCursor).toBe('next_cursor');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://read.test/v1/publications?limit=24',
            { headers: { Accept: 'application/json' } },
        );
    });

    it('rejects a wrong schema before returning publications', async () => {
        process.env.NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL = 'true';
        process.env.NEXT_PUBLIC_MARKET_READ_MODEL_URL = 'https://read.test';
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
            schema: 'youtick.publications.v2',
            watermark: { block_height: 103, block_hash: 'block_hash_000000000000000000000103' },
            items: [],
            next_cursor: null,
        })));
        const { readMarketPublicationPage } = await import('@/lib/market-read-model');

        await expect(readMarketPublicationPage(null, 24)).rejects.toThrow(
            'invalid_market_read_model_page',
        );
    });

    it('parses creator publications and aggregate sales without treating them as balance', async () => {
        process.env.NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL = 'true';
        process.env.NEXT_PUBLIC_MARKET_READ_MODEL_URL = 'https://read.test';
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(Response.json({
                schema: 'youtick.creator-publications.v1',
                watermark: { block_height: 103, block_hash: 'block_hash_000000000000000000000103' },
                creator_id: 'creator.testnet',
                items: [{
                    publication_id: 'pub-a', creator_id: 'creator.testnet', title: 'Release A',
                    generation: 1, price_usdc: '2000000', playback_id: 'playback_a',
                    availability: 'SALES_SUSPENDED', published_at_ms: 1_785_600_000_101,
                    source_block_height: 101,
                }],
                next_cursor: null,
            }))
            .mockResolvedValueOnce(Response.json({
                schema: 'youtick.creator-sales-summary.v1',
                watermark: { block_height: 103, block_hash: 'block_hash_000000000000000000000103' },
                creator_id: 'creator.testnet', sale_count: 2,
                gross_usdc: '4000000', creator_usdc: '3920000',
            }));
        vi.stubGlobal('fetch', fetchMock);
        const {
            readMarketCreatorPublicationPage,
            readMarketCreatorSalesSummary,
        } = await import('@/lib/market-read-model');

        const publications = await readMarketCreatorPublicationPage('creator.testnet', null, 50);
        const sales = await readMarketCreatorSalesSummary('creator.testnet');

        expect(publications.items[0].availability).toBe('SALES_SUSPENDED');
        expect(sales).toMatchObject({ saleCount: 2, grossUsdc: '4000000', creatorUsdc: '3920000' });
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            'https://read.test/v1/creators/creator.testnet/publications?limit=50',
            'https://read.test/v1/creators/creator.testnet/sales-summary',
        ]);
    });
});
