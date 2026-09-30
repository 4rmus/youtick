'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useCurrentCatalog } from '@/hooks/useCurrentCatalog';
import { FEATURE_FLAGS } from '@/lib/constants';
import type { LivepeerPublication } from '@/lib/livepeer-publication';
import { readMarketCreatorPublicationPage } from '@/lib/market-read-model';

export type CreatorCatalog = {
    source: 'current' | 'derived' | 'none';
    publications: LivepeerPublication[];
    loading: boolean;
    error: Error | null;
    warning?: string;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage(): unknown;
    refetch(): unknown;
};

/** The existing creator catalogue: current catalogue (v2) when enabled, otherwise the derived read model (v1). */
export function useCreatorCatalog(accountId: string): CreatorCatalog {
    const current = useCurrentCatalog(accountId);
    const derived = useInfiniteQuery({
        queryKey: ['creatorPage', accountId],
        initialPageParam: null as string | null,
        queryFn: ({ pageParam }) => readMarketCreatorPublicationPage(accountId, pageParam, 12),
        getNextPageParam: (page) => page.nextCursor,
        enabled: FEATURE_FLAGS.enableDerivedReadModel && !FEATURE_FLAGS.enableCurrentCatalog,
        staleTime: 60_000,
        retry: false,
    });
    if (FEATURE_FLAGS.enableCurrentCatalog) {
        return { source: 'current', ...current, error: current.error as Error | null };
    }
    if (FEATURE_FLAGS.enableDerivedReadModel) {
        return {
            source: 'derived',
            publications: derived.data?.pages.flatMap((page) => page.items) ?? [],
            loading: derived.isLoading,
            error: derived.error,
            hasNextPage: derived.hasNextPage,
            isFetchingNextPage: derived.isFetchingNextPage,
            fetchNextPage: derived.fetchNextPage,
            refetch: derived.refetch,
        };
    }
    return { source: 'none', publications: [], loading: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: () => undefined, refetch: () => undefined };
}
