import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { yoctoToNear } from 'near-api-js';
import { getProvider, viewContract } from '@/lib/near';
import { TokenWithVideo } from './useOwnedTokens';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import { NEAR_CONFIG } from '@/lib/constants';

const NFT_CONTRACT_ID = NEAR_CONFIG.contractId;
const PAGE_SIZE = 24;
const FETCH_LIMIT = 10000;

async function fetchAllEvents(): Promise<TokenWithVideo[]> {
    const provider = getProvider();

    const events = await viewContract<unknown[]>(
        provider,
        NFT_CONTRACT_ID,
        'get_events',
        { from_index: "0", limit: FETCH_LIMIT }
    );

    if (!events || events.length === 0) {
        return [];
    }

    const eventTokens: TokenWithVideo[] = events.map((item, index) => {
        const [cid, event] = item as [string, { title: string; description: string; creator_id: string; price: string; price_usd?: number | null }];

        const parsed = parseTitleMetadata(event.title);
        const displayDescription = event.description || `NFT ticket - ${yoctoToNear(BigInt(event.price))} NEAR`;

        return {
            token_id: `event-${index}`,
            owner_id: event.creator_id,
            metadata: {
                title: parsed.title,
                description: displayDescription,
                media: parsed.thumbnailUrl,
                copies: 1
            },
            video_metadata: {
                encrypted_cid: cid,
                duration_seconds: 0,
                content_type: "Exclusive",
                price: event.price,
                price_usd: event.price_usd ?? null,
            }
        };
    });

    // Reverse globally so newest events appear first
    return eventTokens.reverse();
}

export function useAllVideos() {
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const query = useQuery({
        queryKey: ['allVideos'],
        queryFn: fetchAllEvents,
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
    });

    const allTokens = query.data ?? [];
    const tokens = useMemo(() => allTokens.slice(0, visibleCount), [allTokens, visibleCount]);
    const hasNextPage = visibleCount < allTokens.length;

    const fetchNextPage = useCallback(() => {
        setVisibleCount(prev => prev + PAGE_SIZE);
    }, []);

    return {
        tokens,
        loading: query.isLoading,
        error: query.error?.message ?? null,
        hasNextPage,
        isFetchingNextPage: false,
        fetchNextPage,
        refetch: query.refetch,
    };
}
