import { useMemo, useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { yoctoToNear } from 'near-api-js';
import { getProvider, viewContract } from '@/lib/near';
import { TokenWithVideo } from './useOwnedTokens';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import { FEATURE_FLAGS, NEAR_CONFIG } from '@/lib/constants';
import type { LivepeerPublication } from '@/lib/livepeer-publication';

const NFT_CONTRACT_ID = NEAR_CONFIG.contractId;
const PAGE_SIZE = 24;

export type EventRow = [string, {
    title: string;
    description: string;
    creator_id: string;
    price: string;
    price_usd?: number | null;
    access_mode?: 'paid' | 'free_collectible';
    created_at?: number | string | null;
    content_type?: string;
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
                    content_type: event.content_type ?? 'Exclusive',
                    price: event.price,
                    price_usd: event.price_usd ?? null,
                    access_mode: event.access_mode ?? (event.price === '0' ? 'free_collectible' : 'paid'),
                },
            };
        });
}

export function mapLivepeerPublicationsToTokens(
    publications: LivepeerPublication[],
): TokenWithVideo[] {
    return publications
        .filter((publication) => publication.availability === 'ACTIVE')
        .sort((left, right) => right.published_at_ms - left.published_at_ms)
        .map((publication) => ({
            token_id: `livepeer-${publication.publication_id}`,
            owner_id: publication.creator_id,
            metadata: {
                title: publication.title,
                copies: 1,
            },
            video_metadata: {
                livepeer_job_id: publication.publication_id,
                duration_seconds: 0,
                content_type: 'Exclusive',
                price_usdc: publication.price_usdc,
                access_mode: 'paid',
            },
        }));
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

async function fetchEventsPage(cursor: string | null, contentType: string | null): Promise<DiscoverEventsPage> {
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
            content_type: contentType,
        },
    );

    return {
        tokens: mapEventRowsToTokens(events),
        nextCursor: window.nextCursor,
    };
}

async function fetchLivepeerPublicationsPage(
    cursor: string | null,
    contentType: string | null,
): Promise<DiscoverEventsPage> {
    if (contentType !== null) return { tokens: [], nextCursor: null };
    const totalCount = cursor == null
        ? Number(await viewContract<number>(
            getProvider(),
            NFT_CONTRACT_ID,
            'get_publications_count',
            {},
        ))
        : 0;
    const window = getPageWindow(totalCount, cursor);
    if (!window) return { tokens: [], nextCursor: null };
    const publications = await viewContract<LivepeerPublication[]>(
        getProvider(),
        NFT_CONTRACT_ID,
        'get_publications',
        { from_index: window.fromIndex, limit: window.limit },
    );
    return {
        tokens: mapLivepeerPublicationsToTokens(publications),
        nextCursor: window.nextCursor,
    };
}

export function useAllVideos(contentType?: string | null) {
    const query = useInfiniteQuery({
        queryKey: [
            'allVideos',
            NFT_CONTRACT_ID,
            FEATURE_FLAGS.enablePaidMediaLivepeerV1 ? 'livepeer' : 'legacy',
            contentType ?? 'all',
        ],
        initialPageParam: null as string | null,
        queryFn: ({ pageParam }) => FEATURE_FLAGS.enablePaidMediaLivepeerV1
            ? fetchLivepeerPublicationsPage(pageParam, contentType ?? null)
            : fetchEventsPage(pageParam, contentType ?? null),
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
