import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/components/providers/WalletProvider';
import { getProvider, viewContract } from '@/lib/near';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import { resolvePreferredMediaUrl } from '@/lib/video-delivery';
import type { TokenWithVideo, VideoMetadata, NFTToken } from '@/lib/types';
import { NEAR_CONFIG } from '@/lib/constants';

export type { TokenWithVideo };

/**
 * Check if a media URL looks valid
 */
function isValidMediaUrl(mediaUrl: string | undefined): boolean {
    if (!mediaUrl) return false;
    return mediaUrl.startsWith('http') || mediaUrl.startsWith('data:') || mediaUrl.startsWith('ipfs://');
}

const NFT_CONTRACT_ID = NEAR_CONFIG.contractId;

async function fetchOwnedTokens(accountId: string): Promise<TokenWithVideo[]> {
    const provider = getProvider();

    const result = await viewContract<[NFTToken, VideoMetadata | null][]>(
        provider,
        NFT_CONTRACT_ID,
        'get_tokens_with_video',
        {
            account_id: accountId,
            limit: 50
        }
    );

    const mappedTokens: TokenWithVideo[] = await Promise.all(result.map(async ([token, videoMeta]) => {
        const parsed = parseTitleMetadata(
            token.metadata?.title,
            token.token_id
        );

        const originalMediaValid = token.metadata?.media
            && !token.metadata.media.includes('token.png')
            && isValidMediaUrl(token.metadata.media);

        const fallbackMedia = await resolvePreferredMediaUrl(parsed.thumbnailUrl, parsed.manifestCid);
        const displayMedia = originalMediaValid
            ? token.metadata?.media
            : (fallbackMedia ?? parsed.thumbnailUrl);

        return {
            ...token,
            metadata: {
                ...token.metadata,
                title: parsed.title,
                media: displayMedia
            },
            video_metadata: videoMeta ?? undefined
        };
    }));

    return mappedTokens.reverse();
}

export function useOwnedTokens() {
    const { accountId } = useWallet();

    const query = useQuery({
        queryKey: ['ownedTokens', accountId],
        queryFn: () => {
            if (!accountId) {
                throw new Error('Wallet not connected');
            }
            return fetchOwnedTokens(accountId);
        },
        enabled: !!accountId,
        staleTime: 60 * 1000,       // 1 minute fresh
        gcTime: 5 * 60 * 1000,      // 5 minute cache
        retry: (failureCount, error) => {
            // Don't retry contract state inconsistency errors
            if (error instanceof Error && error.message.includes('inconsistent state')) {
                return false;
            }
            return failureCount < 1;
        },
    });

    return {
        tokens: query.data ?? [],
        loading: query.isLoading,
        error: query.error?.message ?? null,
        refetch: query.refetch,
    };
}
