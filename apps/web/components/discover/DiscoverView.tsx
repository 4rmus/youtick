'use client';

import Link from 'next/link';
import { ProgramSection } from '@/components/discover/ProgramSection';
import { FeaturedStage } from '@/components/discover/FeaturedStage';
import { featuredPublications } from '@/components/discover/discover-model';
import { EmptyState, LoadErrorState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import { StatusLine } from '@/components/ui/status-line';
import { useAllVideos } from '@/hooks/useAllVideos';
import { useCurrentCatalog } from '@/hooks/useCurrentCatalog';
import { FEATURE_FLAGS } from '@/lib/constants';
import { useMessages } from '@/lib/i18n/I18nProvider';

export function DiscoverView() {
    return FEATURE_FLAGS.enableCurrentCatalog ? <CurrentDiscover /> : <LegacyDiscover />;
}

function LegacyDiscover() { return <DiscoverResults query={useAllVideos()} />; }
function CurrentDiscover() { return <DiscoverResults query={useCurrentCatalog()} />; }

type CatalogQuery = (ReturnType<typeof useAllVideos> | ReturnType<typeof useCurrentCatalog>) & { warning?: string };

function DiscoverResults({ query }: { query: CatalogQuery }) {
    const t = useMessages().discover;
    const hasItems = query.publications.length > 0;
    // "Your tickets" needs the account ticket list (G12/G13); until then the shelf is not rendered.

    return (
        <div className="min-h-[calc(100vh-4rem)] pb-16">
            <h1 className="sr-only">{t.title}</h1>
            {hasItems && <FeaturedStage publications={featuredPublications(query.publications)} />}

            <div className="container mx-auto flex flex-col gap-3 px-4 pt-6 empty:hidden">
                {query.warning && !query.error && <StatusLine>{query.warning}</StatusLine>}
                {query.error && hasItems && (
                    <div className="flex flex-wrap items-center gap-4">
                        <StatusLine tone="error">{t.updateFailed}</StatusLine>
                        <Button size="sm" variant="outline" onClick={() => void query.refetch()}>{t.retry}</Button>
                    </div>
                )}
            </div>

            {query.loading ? (
                <div className="container mx-auto px-4 py-16"><StatusLine tone="progress">{t.loading}</StatusLine></div>
            ) : query.error && !hasItems ? (
                <div className="container mx-auto px-4">
                    <LoadErrorState title={t.loadFailed} onRetry={() => void query.refetch()} />
                </div>
            ) : !hasItems ? (
                <div className="container mx-auto px-4">
                    <EmptyState body={query.hasNextPage ? t.emptyPage : t.empty} action={query.hasNextPage ? <MoreButton query={query} /> : undefined} />
                </div>
            ) : (
                <ProgramSection publications={query.publications}>
                    {query.hasNextPage && <div className="flex justify-center pt-4"><MoreButton query={query} /></div>}
                </ProgramSection>
            )}

            <section className="container mx-auto mt-16 flex flex-col gap-6 border-t border-line px-4 pt-12 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-3">
                    <p className="label-caps text-ice">{t.creatorsEyebrow}</p>
                    <h2 className="font-display text-5xl md:text-6xl">{t.creatorsTitle}</h2>
                    <p className="text-light-2">{t.creatorsBody}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    {FEATURE_FLAGS.enablePaidMediaLivepeerV1 && <Button asChild size="lg"><Link href="/studio/new">{t.creatorsStart}</Link></Button>}
                    <Button asChild size="lg" variant="outline"><Link href="/creators">{t.creatorsMore}</Link></Button>
                </div>
            </section>
        </div>
    );
}

function MoreButton({ query }: { query: CatalogQuery }) {
    const t = useMessages().discover;
    return (
        <Button size="lg" variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            {query.isFetchingNextPage ? t.loadingMore : t.showMore}
        </Button>
    );
}
