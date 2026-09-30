'use client';

import { EmptyState, LoadErrorState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import { StatusLine } from '@/components/ui/status-line';
import { VideoCard } from '@/components/VideoCard';
import { formatPublishedDate, sortPublications } from '@/components/discover/discover-model';
import { useLocale, useMessages } from '@/lib/i18n/I18nProvider';
import { displayAccount, isImplicitAccount } from './creator-account';
import { ShareLink } from './ShareLink';
import { useCreatorCatalog } from './useCreatorCatalog';

/** Creator page: only what the catalogue knows (account and publications); no invented bio or avatar. */
export function CreatorView({ accountId }: { accountId: string }) {
    const locale = useLocale();
    const messages = useMessages();
    const t = messages.creator;
    const catalog = useCreatorCatalog(accountId);
    const publications = sortPublications(catalog.publications, 'newest');

    return (
        <div className="container mx-auto flex min-h-[calc(100vh-4rem)] flex-col gap-10 px-4 py-12 md:py-16">
            <header className="flex flex-col gap-5 border-b border-line pb-8">
                <p className="label-caps text-ice">{t.label}</p>
                <h1 className="font-display break-all text-5xl leading-[0.9] sm:text-7xl" title={accountId}>{displayAccount(accountId)}</h1>
                {isImplicitAccount(accountId) && (
                    <p className="text-sm text-light-3"><span className="sr-only">{t.fullAccount}: </span><span className="break-all font-mono">{accountId}</span></p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    {catalog.source !== 'none' && !catalog.loading && !catalog.error && (
                        <p className="tabular text-xl text-light-2">{t.screenings(publications.length)}</p>
                    )}
                    <ShareLink path={`/c/${encodeURIComponent(accountId)}`} t={t} />
                </div>
            </header>

            {catalog.warning && !catalog.error && <StatusLine>{catalog.warning}</StatusLine>}
            {catalog.source === 'none' ? (
                <EmptyState body={t.unavailable} />
            ) : catalog.loading ? (
                <StatusLine tone="progress">{messages.discover.loading}</StatusLine>
            ) : catalog.error && publications.length === 0 ? (
                <LoadErrorState title={messages.discover.loadFailed} onRetry={() => void catalog.refetch()} />
            ) : publications.length === 0 ? (
                <EmptyState body={t.empty} />
            ) : (
                <>
                    {catalog.error && <StatusLine tone="error">{messages.discover.updateFailed}</StatusLine>}
                    <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {publications.map((publication) => (
                            <VideoCard key={publication.publication_id} publication={publication} t={messages.discover}
                                meta={formatPublishedDate(publication.published_at_ms, locale)} />
                        ))}
                    </div>
                    {catalog.hasNextPage && (
                        <div className="flex justify-center">
                            <Button size="lg" variant="outline" disabled={catalog.isFetchingNextPage} onClick={() => void catalog.fetchNextPage()}>
                                {catalog.isFetchingNextPage ? messages.discover.loadingMore : messages.discover.showMore}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
