import { useInfiniteQuery } from '@tanstack/react-query';
import { yoctoToNear } from 'near-api-js';
import { getProvider, viewContract } from '@/lib/near';
import { TokenWithVideo } from './useOwnedTokens';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import { NEAR_CONFIG } from '@/lib/constants';

const NFT_CONTRACT_ID = NEAR_CONFIG.contractId;
const PAGE_SIZE = 24;

interface EventsPage {
    tokens: TokenWithVideo[];
    nextOffset: number | null;
    total: number;
}

async function fetchEventsPage(offset: number): Promise<EventsPage> {
    const provider = getProvider();

    // Fetch one extra to detect if there's a next page
    const events = await viewContract<unknown[]>(
        provider,
        NFT_CONTRACT_ID,
        'get_events',
        { from_index: offset.toString(), limit: PAGE_SIZE + 1 }
    );

    if (!events || events.length === 0) {
        return { tokens: [], nextOffset: null, total: 0 };
    }

    const hasMore = events.length > PAGE_SIZE;
    const pageEvents = hasMore ? events.slice(0, PAGE_SIZE) : events;

    const eventTokens: TokenWithVideo[] = pageEvents.map((item, index) => {
        const [cid, event] = item as [string, { title: string; description: string; creator_id: string; price: string }];

        const parsed = parseTitleMetadata(event.title);
        const displayDescription = event.description || `NFT ticket - ${yoctoToNear(BigInt(event.price))} NEAR`;

        return {
            token_id: `event-${offset + index}`,
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
                price: event.price
            }
        };
    });

    return {
        tokens: eventTokens.reverse(),
        nextOffset: hasMore ? offset + PAGE_SIZE : null,
        total: pageEvents.length,
    };
}

export function useAllVideos() {
    const query = useInfiniteQuery({
        queryKey: ['allVideos'],
        queryFn: ({ pageParam }) => fetchEventsPage(pageParam),
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextOffset,
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
    });

    // Flatten all pages into a single token array
    const tokens = query.data?.pages.flatMap((page) => page.tokens) ?? [];

    return {
        tokens,
        loading: query.isLoading,
        error: query.error?.message ?? null,
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        fetchNextPage: query.fetchNextPage,
        refetch: query.refetch,
    };
}
