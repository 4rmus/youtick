'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { VideoCard } from '@/components/VideoCard';
import { useLocale, useMessages } from '@/lib/i18n/I18nProvider';
import type { LivepeerPublication } from '@/lib/livepeer-publication';
import { cn } from '@/lib/utils';
import { filterPublications, formatPublishedDate, sortPublications, type DiscoverSort } from './discover-model';

/** Programme grid with client-side search and sort over the pages loaded so far. */
export function ProgramSection({ publications, children }: { publications: readonly LivepeerPublication[]; children?: React.ReactNode }) {
    const t = useMessages().discover;
    const locale = useLocale();
    const [query, setQuery] = React.useState('');
    const [sort, setSort] = React.useState<DiscoverSort>('newest');
    const searchId = React.useId();
    const visible = React.useMemo(() => sortPublications(filterPublications(publications, query), sort), [publications, query, sort]);

    return (
        <section aria-labelledby={`${searchId}-title`} className="container mx-auto flex flex-col gap-6 px-4 pt-12 md:pt-16">
            <div className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
                <h2 id={`${searchId}-title`} className="font-display text-5xl md:text-7xl">
                    {t.programme} <span className="tabular text-2xl text-light-3 md:text-3xl">{publications.length}</span>
                </h2>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="flex min-h-12 w-full items-center gap-2.5 rounded-xs border border-edge bg-panel px-3.5 text-light-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ice sm:w-80">
                        <Search aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
                        <input
                            type="search"
                            aria-label={t.searchLabel}
                            aria-describedby={`${searchId}-hint`}
                            placeholder={t.searchLabel}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-light outline-none placeholder:text-light-3"
                        />
                    </label>
                    <div role="group" aria-label={t.sortLabel} className="flex rounded-xs border border-edge">
                        {(['newest', 'price'] as const).map((option) => (
                            <button
                                key={option}
                                type="button"
                                aria-pressed={sort === option}
                                onClick={() => setSort(option)}
                                className={cn(
                                    'min-h-11 flex-1 px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ice sm:flex-none',
                                    sort === option ? 'bg-light font-bold text-ink' : 'text-light hover:bg-raised',
                                )}
                            >
                                {option === 'newest' ? t.sortNewest : t.sortPrice}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <p id={`${searchId}-hint`} className="-mt-3 text-[13px] text-light-3">{t.searchHint}</p>

            {visible.length === 0 && query.trim() ? (
                <div role="status" className="flex flex-col items-start gap-3 py-8 text-light-2">
                    <p>{t.noMatches(query.trim())}</p>
                    <button type="button" onClick={() => setQuery('')} className="min-h-11 text-light underline underline-offset-4 hover:text-ice">{t.clearSearch}</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {visible.map((publication) => (
                        <VideoCard
                            key={publication.publication_id}
                            publication={publication}
                            t={t}
                            meta={formatPublishedDate(publication.published_at_ms, locale)}
                        />
                    ))}
                </div>
            )}
            {children}
        </section>
    );
}
