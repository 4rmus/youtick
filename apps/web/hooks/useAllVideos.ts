import { useInfiniteQuery } from '@tanstack/react-query';
import {
    readLivepeerPublications,
    readLivepeerPublicationsCount,
    type LivepeerPublication,
} from '@/lib/livepeer-publication';

const PAGE_SIZE = 24;

type Page = {
    publications: LivepeerPublication[];
    nextCursor: number | null;
};

async function fetchPage(cursor: number | null): Promise<Page> {
    const total = cursor ?? await readLivepeerPublicationsCount();
    const fromIndex = Math.max(0, total - PAGE_SIZE);
    const publications = await readLivepeerPublications(fromIndex, total - fromIndex || PAGE_SIZE);
    return {
        publications: publications
            .filter((publication) => publication.availability === 'ACTIVE')
            .sort((left, right) => right.published_at_ms - left.published_at_ms),
        nextCursor: fromIndex > 0 ? fromIndex : null,
    };
}

export function useAllVideos() {
    const query = useInfiniteQuery({
        queryKey: ['livepeerPublications'],
        initialPageParam: null as number | null,
        queryFn: ({ pageParam }) => fetchPage(pageParam),
        getNextPageParam: (page) => page.nextCursor,
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
