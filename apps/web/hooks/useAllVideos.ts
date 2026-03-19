import { useMemo, useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { yoctoToNear } from 'near-api-js';
import { getProvider, viewContract } from '@/lib/near';
import { TokenWithVideo } from './useOwnedTokens';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import { NEAR_CONFIG } from '@/lib/constants';

const NFT_CONTRACT_ID = NEAR_CONFIG.contractId;
const PAGE_SIZE = 24;

export type EventRow = [string, {
    title: string;
    description: string;
    creator_id: string;
    price: string;
    price_usd?: number | null;
    created_at?: number | string | null;
    banned?: boolean;
}];

interface DiscoverEventsPage {
    tokens: TokenWithVideo[];
    nextCursor: string | null;
}

function toSortableTimestamp(value: number | string | null | undefined): bigint {
    if (value == null) {
        return 0n;
    }

    try {
        return BigInt(value);
    } catch {
        return 0n;
    }
}

export function mapEventRowsToTokens(events: EventRow[]): TokenWithVideo[] {
    return events
        .filter(([, event]) => !event.banned)
        .sort((a, b) => {
            const left = toSortableTimestamp(a[1].created_at);
            const right = toSortableTimestamp(b[1].created_at);
            if (left === right) {
                return 0;
            }
            return left > right ? -1 : 1;
        })
        .map(([cid, event]) => {
            const parsed = parseTitleMetadata(event.title);
            const displayDescription = event.description || `NFT ticket - ${yoctoToNear(BigInt(event.price))} NEAR`;

            return {
                token_id: `event-${cid}`,
                owner_id: event.creator_id,
                metadata: {
                    title: parsed.title,
                    description: displayDescription,
                    // Use the thumbnail embedded in event metadata immediately.
                    // Avoid blocking Discover on per-item IPFS manifest fetches.
                    media: parsed.thumbnailUrl,
                    copies: 1,
                },
                video_metadata: {
                    encrypted_cid: cid,
                    duration_seconds: 0,
                    content_type: 'Exclusive',
                    price: event.price,
                    price_usd: event.price_usd ?? null,
                },
            };
        });
}

function getPageWindow(
    totalCount: number,
    cursor: string | null,
): { fromIndex: string; limit: number; nextCursor: string | null } | null {
    const upperBoundExclusive = cursor == null
        ? totalCount
        : Number.parseInt(cursor, 10);

    if (!Number.isFinite(upperBoundExclusive) || upperBoundExclusive <= 0) {
        return null;
    }

    const lowerBoundInclusive = Math.max(0, upperBoundExclusive - PAGE_SIZE);
    const limit = upperBoundExclusive - lowerBoundInclusive;

    if (limit <= 0) {
        return null;
    }

    return {
        fromIndex: lowerBoundInclusive.toString(),
        limit,
        nextCursor: lowerBoundInclusive > 0 ? lowerBoundInclusive.toString() : null,
    };
}

async function fetchEventsPage(cursor: string | null): Promise<DiscoverEventsPage> {
    const provider = getProvider();
    const totalCount = cursor == null
        ? Number(
            await viewContract<number>(
                provider,
                NFT_CONTRACT_ID,
                'get_events_count',
                {},
            ),
        )
        : 0;

    const window = getPageWindow(totalCount, cursor);
    if (!window) {
        return {
            tokens: [],
            nextCursor: null,
        };
    }

    const events = await viewContract<EventRow[]>(
        provider,
        NFT_CONTRACT_ID,
        'get_events',
        {
            from_index: window.fromIndex,
            limit: window.limit,
        },
    );

    return {
        tokens: mapEventRowsToTokens(events),
        nextCursor: window.nextCursor,
    };
}

export function useAllVideos() {
    const query = useInfiniteQuery({
        queryKey: ['allVideos', NFT_CONTRACT_ID],
        initialPageParam: null as string | null,
        queryFn: ({ pageParam }) => fetchEventsPage(pageParam),
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
    });

    const tokens = useMemo(() => {
        const seen = new Set<string>();
        const pages = query.data?.pages ?? [];

        return pages.flatMap((page) =>
            page.tokens.filter((token) => {
                if (seen.has(token.token_id)) {
                    return false;
                }
                seen.add(token.token_id);
                return true;
            }),
        );
    }, [query.data]);

    const fetchNextPage = useCallback(() => {
        void query.fetchNextPage();
    }, [query]);

    return {
        tokens,
        loading: query.isLoading,
        error: query.error?.message ?? null,
        hasNextPage: query.hasNextPage ?? false,
        isFetchingNextPage: query.isFetchingNextPage,
        fetchNextPage,
        refetch: query.refetch,
    };
}
