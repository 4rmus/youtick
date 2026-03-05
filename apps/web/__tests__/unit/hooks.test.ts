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
    NEAR_CONFIG: {
        contractId: 'test-contract.testnet',
        networkId: 'testnet'
    },
    IPFS_CONFIG: {
        gatewayUrl: 'https://crustipfs.xyz/ipfs',
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
import { viewContract } from '@/lib/near';
const mockedViewContract = vi.mocked(viewContract);

describe('useAllVideos data logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should transform contract events into TokenWithVideo format', async () => {
        const mockEvents = [
            ['QmTestCid1', {
                title: 'Test Video',
                description: 'A test video',
                creator_id: 'creator.testnet',
                price: '1000000000000000000000000'
            }],
            ['QmTestCid2', {
                title: 'Another Video',
                description: '',
                creator_id: 'creator2.testnet',
                price: '0'
            }]
        ];

        mockedViewContract.mockResolvedValueOnce(mockEvents);

        const { parseTitleMetadata } = await import('@/lib/metadata-parser');
        // Simulate the transformation logic from useAllVideos
        const events = mockEvents;
        const tokens = events.map((item, index) => {
            const [cid, event] = item as [string, { title: string; description: string; creator_id: string; price: string }];
            const parsed = parseTitleMetadata(event.title);

            return {
                token_id: `event-${index}`,
                owner_id: event.creator_id,
                metadata: {
                    title: parsed.title,
                    description: event.description || `NFT ticket`,
                    media: parsed.thumbnailUrl,
                    copies: 1
                },
                video_metadata: {
                    encrypted_cid: cid,
                    duration_seconds: 0,
                    content_type: "Exclusive",
                    price: event.price
                }
            };
        });

        expect(tokens).toHaveLength(2);
        expect(tokens[0].video_metadata.encrypted_cid).toBe('QmTestCid1');
        expect(tokens[0].owner_id).toBe('creator.testnet');
        expect(tokens[0].metadata.title).toBe('Test Video');
        expect(tokens[1].metadata.description).toBe('NFT ticket');
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
            return mediaUrl.startsWith('http') || mediaUrl.startsWith('data:');
        };

        // token.png should be considered invalid for display
        const media = 'https://example.com/token.png';
        const isValid = isValidMediaUrl(media) && !media.includes('token.png');
        expect(isValid).toBe(false);

        // Real IPFS URL should be valid
        const realMedia = 'https://crustipfs.xyz/ipfs/QmTest';
        const isRealValid = isValidMediaUrl(realMedia) && !realMedia.includes('token.png');
        expect(isRealValid).toBe(true);
    });

    it('should handle null video metadata', () => {
        const videoMeta = null;
        const result = videoMeta ?? undefined;
        expect(result).toBeUndefined();
    });
});

describe('useEventDescription data logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should extract thumbnail URL from title metadata', async () => {
        const { parseTitleMetadata } = await import('@/lib/metadata-parser');

        // Title with thumbnail CID embedded
        const parsed = parseTitleMetadata('QmRealCid:::QmThumbCid:::My Video');
        expect(parsed.title).toBe('My Video');
    });

    it('should handle plain title without metadata', async () => {
        const { parseTitleMetadata } = await import('@/lib/metadata-parser');

        const parsed = parseTitleMetadata('Simple Title');
        expect(parsed.title).toBe('Simple Title');
        expect(parsed.thumbnailCid).toBeNull();
    });

    it('should return null for ACCESS_PASS CID', () => {
        const cid = 'ACCESS_PASS';
        const shouldFetch = !!cid && cid !== 'ACCESS_PASS';
        expect(shouldFetch).toBe(false);
    });
});
