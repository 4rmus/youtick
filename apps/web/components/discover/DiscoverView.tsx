'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VideoCard } from '@/components/VideoCard';
import { useAllVideos } from '@/hooks/useAllVideos';
import { useCurrentCatalog } from '@/hooks/useCurrentCatalog';
import { FEATURE_FLAGS } from '@/lib/constants';
import { useMessages } from '@/lib/i18n/I18nProvider';

export function DiscoverView() {
    return FEATURE_FLAGS.enableCurrentCatalog ? <CurrentDiscover /> : <LegacyDiscover />;
}

function LegacyDiscover() { return <DiscoverResults query={useAllVideos()} />; }
function CurrentDiscover() { return <DiscoverResults query={useCurrentCatalog()} />; }

function DiscoverResults({ query }: { query: (ReturnType<typeof useAllVideos> | ReturnType<typeof useCurrentCatalog>) & { warning?: string } }) {
    const t = useMessages().discover;
    return (
        <div className="container mx-auto min-h-[calc(100vh-4rem)] px-4 py-10">
            <div className="mb-8">
                <p className="text-sm uppercase tracking-[0.24em] text-emerald-300">{t.eyebrow}</p>
                <h1 className="mt-3 text-3xl font-bold">{t.title}</h1>
                <p className="mt-3 text-sm text-zinc-400">{t.description}</p>
            </div>

            {query.warning && !query.error && <p role="status" className="mb-6 text-amber-300">{query.warning}</p>}
            {query.error && (
                <div role="alert" className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-6">
                    <p>{query.publications.length > 0
                        ? t.updateFailed
                        : t.loadFailed}</p>
                    <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>{t.retry}</Button>
                </div>
            )}
            {query.loading ? (
                <div role="status" className="flex items-center gap-3 text-zinc-300"><Loader2 className="h-5 w-5 animate-spin" /> {t.loading}</div>
            ) : query.publications.length === 0 ? (
                !query.error && <p className="rounded-lg border border-zinc-800 p-10 text-center text-zinc-400">
                    {query.hasNextPage ? t.emptyPage : t.empty}
                </p>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {query.publications.map((publication) => <VideoCard key={publication.publication_id} publication={publication} />)}
                </div>
            )}
            {!query.loading && query.hasNextPage && (
                <div className="mt-8 text-center">
                    <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                        {query.isFetchingNextPage ? t.loadingMore : t.showMore}
                    </Button>
                </div>
            )}
        </div>
    );
}
