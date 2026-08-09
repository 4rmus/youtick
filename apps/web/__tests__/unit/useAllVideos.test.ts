import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    readPage: vi.fn(),
    readNear: vi.fn(),
    readNearCount: vi.fn(),
}));

vi.mock('@/lib/constants', () => ({
    FEATURE_FLAGS: { enableDerivedReadModel: true },
}));
vi.mock('@/lib/market-read-model', () => ({
    readMarketPublicationPage: mocks.readPage,
}));
vi.mock('@/lib/livepeer-publication', () => ({
    readLivepeerPublications: mocks.readNear,
    readLivepeerPublicationsCount: mocks.readNearCount,
}));

import { fetchDiscoverPage } from '@/hooks/useAllVideos';

const publication = {
    publication_id: 'pub-1', creator_id: 'creator.testnet', title: 'Release',
    price_usdc: '2000000', generation: 1, playback_id: 'playback_1',
    availability: 'ACTIVE' as const, published_at_ms: 1_785_600_000_000,
};

describe('Discover source transition', () => {
    beforeEach(() => vi.clearAllMocks());

    it('uses the derived cursor consistently after a successful first page', async () => {
        mocks.readPage.mockResolvedValue({
            items: [publication], nextCursor: 'next_cursor', watermark: {
                block_height: 100, block_hash: 'block_hash_000000000000000000000100',
            },
        });

        const page = await fetchDiscoverPage({ source: 'auto' });

        expect(page.publications).toEqual([publication]);
        expect(page.nextPageParam).toEqual({ source: 'read-model', cursor: 'next_cursor' });
        expect(mocks.readNear).not.toHaveBeenCalled();
    });

    it('falls back to canonical NEAR only when the initial derived request is unavailable', async () => {
        mocks.readPage.mockRejectedValue(new Error('market_read_model_unavailable'));
        mocks.readNearCount.mockResolvedValue(1);
        mocks.readNear.mockResolvedValue([publication]);

        const page = await fetchDiscoverPage({ source: 'auto' });

        expect(page.publications).toEqual([publication]);
        expect(page.nextPageParam).toBeNull();
        expect(mocks.readNear).toHaveBeenCalledOnce();
    });

    it('does not mix NEAR pages into a failed derived pagination sequence', async () => {
        mocks.readPage.mockRejectedValue(new Error('market_read_model_unavailable'));

        await expect(fetchDiscoverPage({ source: 'read-model', cursor: 'next_cursor' }))
            .rejects.toThrow('market_read_model_unavailable');
        expect(mocks.readNear).not.toHaveBeenCalled();
    });
});
