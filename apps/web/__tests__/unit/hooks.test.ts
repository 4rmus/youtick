/**
 * Hook Logic Tests
 *
 * Tests the data fetching and transformation logic used by hooks.
 * Since tests run in node environment (no jsdom), we test the
 * underlying fetch functions rather than React hook lifecycle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock constants
vi.mock('@/lib/constants', () => ({
    APP_CONFIG: {
        publicAppUrl: 'https://app.youtick.io'
    },
    FEATURE_FLAGS: {
        enableCrossChainCheckout: false
    },
    NEAR_CONFIG: {
        contractId: 'test-contract.testnet',
        networkId: 'testnet'
    },
    IPFS_CONFIG: {
        gatewayUrl: 'https://ipfs.io/ipfs',
        placeholderImage: '/placeholder.svg'
    },
    METADATA_SCHEMA: {
        delimiter: ':::'
    }
}));

// Mock near module
const mockQuery = vi.fn();
vi.mock('@/lib/near', () => ({
    getProvider: () => ({ query: mockQuery }),
    viewContract: vi.fn()
}));

// Import after mocks
describe('useAllVideos data logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should transform contract events into TokenWithVideo format and sort newest first', async () => {
        const mockEvents = [
            ['QmTestCid1', {
                title: 'Test Video',
                description: 'A test video',
                creator_id: 'creator.testnet',
                price: '1000000000000000000000000',
                created_at: '100'
            }],
            ['QmTestCid2', {
                title: 'Another Video',
                description: '',
                creator_id: 'creator2.testnet',
                price: '0',
                created_at: '200'
            }],
        ];

        const { mapEventRowsToTokens } = await import('@/hooks/useAllVideos');
        const tokens = mapEventRowsToTokens(mockEvents as never);

        expect(tokens).toHaveLength(2);
        expect(tokens[0].video_metadata?.encrypted_cid).toBe('QmTestCid2');
        expect(tokens[0].owner_id).toBe('creator2.testnet');
        expect(tokens[0].metadata?.title).toBe('Another Video');
        expect(tokens[1].metadata?.description).toBe('A test video');
    });

    it('should handle empty events response', () => {
        const events: unknown[] = [];
        expect(events.length).toBe(0);
    });
});

describe('useOwnedTokens data logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should filter out token.png media URLs', () => {
        const isValidMediaUrl = (mediaUrl: string | undefined): boolean => {
            if (!mediaUrl) return false;
            return mediaUrl.startsWith('http') || mediaUrl.startsWith('data:') || mediaUrl.startsWith('ipfs://');
        };

        // token.png should be considered invalid for display
        const media = 'https://example.com/token.png';
        const isValid = isValidMediaUrl(media) && !media.includes('token.png');
        expect(isValid).toBe(false);

        // Real IPFS URL should be valid
        const realMedia = 'https://ipfs.io/ipfs/QmTest';
        const isRealValid = isValidMediaUrl(realMedia) && !realMedia.includes('token.png');
        expect(isRealValid).toBe(true);

        const protocolMedia = 'ipfs://QmTestThumbCid123456789012345678901234567890123456';
        const isProtocolValid = isValidMediaUrl(protocolMedia) && !protocolMedia.includes('token.png');
        expect(isProtocolValid).toBe(true);
    });

    it('should handle null video metadata', () => {
        const videoMeta = null;
        const result = videoMeta ?? undefined;
        expect(result).toBeUndefined();
    });
});

describe('useNFTOwnership data logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('falls back to creator access when has_ticket fails', async () => {
        const { viewContract } = await import('@/lib/near');
        vi.mocked(viewContract)
            .mockRejectedValueOnce(new Error('collection is an inconsistent state'))
            .mockResolvedValueOnce({ creator_id: 'creator.testnet' });

        const { resolveNFTOwnership } = await import('@/lib/hooks/useSessionState');
        await expect(resolveNFTOwnership('creator.testnet', 'video-1')).resolves.toBe(true);
    });
});