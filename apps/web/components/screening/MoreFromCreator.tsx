'use client';

import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { VideoCard } from '@/components/VideoCard';
import { currentCatalogQueryOptions } from '@/hooks/useCurrentCatalog';
import { FEATURE_FLAGS } from '@/lib/constants';
import { currentCatalogFreshness } from '@/lib/current-catalog';
import type { Messages } from '@/lib/i18n/messages';
import type { LivepeerPublication } from '@/lib/livepeer-publication';
import { readMarketCreatorPublicationPage } from '@/lib/market-read-model';

const SHOWN = 3;

/**
 * Other screenings by the same creator from the existing creator catalogue (current catalogue or
 * derived read model, as on the profile screen). One read per visit, no polling; hidden when neither
 * source is enabled or the read fails.
 */
export function MoreFromCreator({ creatorId, currentId, t }: { creatorId: string; currentId: string; t: Messages['watch'] & Pick<Messages['discover'], 'salesPaused' | 'unavailable'> }) {
    // Freshness is judged against the visit time; the shelf is not re-validated while open.
    const [visitedAt] = useState(Date.now);
    const current = useInfiniteQuery({ ...currentCatalogQueryOptions(creatorId), refetchOnWindowFocus: false });
    const derived = useQuery({
        queryKey: ['creatorScreenings', creatorId],
        queryFn: async () => (await readMarketCreatorPublicationPage(creatorId, null, SHOWN + 1)).items,
        enabled: FEATURE_FLAGS.enableDerivedReadModel && !FEATURE_FLAGS.enableCurrentCatalog,
        staleTime: 60_000,
        retry: false,
    });
    const items: LivepeerPublication[] = FEATURE_FLAGS.enableCurrentCatalog
        ? currentCatalogFreshness(current.data?.pages, visitedAt) === 'unavailable' ? [] : current.data?.pages[0]?.items ?? []
        : derived.data ?? [];
    const others = items.filter((item) => item.publication_id !== currentId).slice(0, SHOWN);
    if (others.length === 0) return null;

    return (
        <section aria-labelledby="more-title" className="flex flex-col gap-5">
            <h2 id="more-title" className="label-caps">{t.moreFrom(creatorId)}</h2>
            <div className="grid grid-cols-1 gap-x-6 gap-y-8 border-t border-line pt-6 sm:grid-cols-2 lg:grid-cols-3">
                {others.map((publication) => <VideoCard key={publication.publication_id} publication={publication} t={t} />)}
            </div>
        </section>
    );
}
