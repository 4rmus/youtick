import { useInfiniteQuery } from '@tanstack/react-query';
import { FEATURE_FLAGS } from '@/lib/constants';
import {
    readLivepeerPublications,
    readLivepeerPublicationsCount,
    type LivepeerPublication,
} from '@/lib/livepeer-publication';
import { readMarketPublicationPage } from '@/lib/market-read-model';

const PAGE_SIZE = 24;

type Page = {
    publications: LivepeerPublication[];
    nextPageParam: PageParam | null;
};

export type PageParam =
    | { source: 'auto' }
    | { source: 'read-model'; cursor: string | null }
    | { source: 'near'; cursor: number | null };

async function fetchNearPage(cursor: number | null): Promise<Page> {
    const total = cursor ?? await readLivepeerPublicationsCount();
    const fromIndex = Math.max(0, total - PAGE_SIZE);
    const publications = await readLivepeerPublications(fromIndex, total - fromIndex || PAGE_SIZE);
    return {
        publications: publications
            .filter((publication) => publication.availability === 'ACTIVE')
            .sort((left, right) => right.published_at_ms - left.published_at_ms),
        nextPageParam: fromIndex > 0 ? { source: 'near', cursor: fromIndex } : null,
    };
}

export async function fetchDiscoverPage(page: PageParam): Promise<Page> {
    if (page.source === 'read-model') {
        const result = await readMarketPublicationPage(page.cursor, PAGE_SIZE);
        return {
            publications: result.items,
            nextPageParam: result.nextCursor
                ? { source: 'read-model', cursor: result.nextCursor }
                : null,
        };
    }
    if (page.source === 'near' || !FEATURE_FLAGS.enableDerivedReadModel) {
        return fetchNearPage(page.source === 'near' ? page.cursor : null);
    }
    try {
        return await fetchDiscoverPage({ source: 'read-model', cursor: null });
    } catch {
        return fetchNearPage(null);
    }
}

export function useAllVideos() {
    const query = useInfiniteQuery({
        queryKey: ['livepeerPublications', FEATURE_FLAGS.enableDerivedReadModel ? 'derived' : 'near'],
        initialPageParam: { source: 'auto' } as PageParam,
        queryFn: ({ pageParam }) => fetchDiscoverPage(pageParam),
        getNextPageParam: (page) => page.nextPageParam,
        staleTime: 30_000,
    });
    return {
        publications: query.data?.pages.flatMap((page) => page.publications) ?? [],
        loading: query.isLoading,
        error: query.error,
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        fetchNextPage: query.fetchNextPage,
        refetch: query.refetch,
    };
}
