import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { FEATURE_FLAGS, NEAR_CONFIG, NEAR_NETWORK } from '@/lib/constants';
import { currentCatalogFreshness, readCurrentCatalogPage } from '@/lib/current-catalog';
import { useMessages } from '@/lib/i18n/I18nProvider';

export function currentCatalogQueryOptions(creator?: string) {
    return {
        queryKey: ['currentCatalog', NEAR_NETWORK, NEAR_CONFIG.marketContractId, creator ?? null],
        initialPageParam: null as string | null,
        queryFn: ({ pageParam }: { pageParam: string | null }) => readCurrentCatalogPage(pageParam, creator ? 5 : 24, creator),
        getNextPageParam: (last: Awaited<ReturnType<typeof readCurrentCatalogPage>>) => last.nextCursor,
        enabled: FEATURE_FLAGS.enableCurrentCatalog,
        staleTime: 15000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        retry: false as const,
    };
}

export function useCurrentCatalog(creator?: string) {
    const client = useQueryClient();
    const t = useMessages().discover;
    const options = currentCatalogQueryOptions(creator);
    const query = useInfiniteQuery({ ...options,
        refetchInterval: query => 15000 * Math.max(1, query.state.data?.pages.length ?? 0),
    });
    const [now, setNow] = useState(Date.now);
    const pages = query.data?.pages;
    const staleAt = pages?.length ? Math.min(...pages.map(page => page.staleAt)) : 0;
    const expiresAt = pages?.length ? Math.min(...pages.map(page => page.expiresAt)) : 0;
    useEffect(() => {
        if (query.error?.message === 'catalog_changed') {
            void client.resetQueries({ queryKey: options.queryKey, exact: true });
        }
    }, [query.error, client, options.queryKey]);
    useEffect(() => {
        if (!expiresAt) return;
        let timer: ReturnType<typeof setTimeout>;
        const tick = () => {
            clearTimeout(timer);
            const time = Date.now();
            setNow(time);
            if (document.visibilityState !== 'hidden' && time <= expiresAt) {
                timer = setTimeout(tick, Math.max(1, (time <= staleAt ? staleAt : expiresAt) - time + 1));
            }
        };
        tick();
        document.addEventListener('visibilitychange', tick);
        return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', tick); };
    }, [staleAt, expiresAt]);
    const freshness = currentCatalogFreshness(pages, now);
    const unavailable = freshness === 'unavailable' && !query.isLoading;
    return {
        publications: freshness === 'unavailable' ? [] : pages?.flatMap(page => page.items) ?? [],
        loading: query.isLoading,
        error: query.error ?? (unavailable ? new Error('catalog_unavailable') : null),
        warning: freshness === 'stale' ? t.stale : undefined,
        hasNextPage: freshness !== 'unavailable' && query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        fetchNextPage: query.fetchNextPage,
        refetch: query.refetch,
    };
}
