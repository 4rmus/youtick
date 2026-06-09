'use client';

import { memo, useState } from 'react';
import Link from '@/components/Web4Link';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useAllVideos } from '@/hooks/useAllVideos';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useNearPrice } from '@/hooks/useNearPrice';
import { VideoCard } from '@/components/VideoCard';

const FILTER_OPTIONS: { key: string | null; labelKey: string }[] = [
  { key: null, labelKey: 'filter_all' },
  { key: 'Cinema', labelKey: 'filter_cinema' },
  { key: 'Concert', labelKey: 'filter_concert' },
  { key: 'Documentary', labelKey: 'filter_documentary' },
  { key: 'ShortFilm', labelKey: 'filter_shortfilm' },
  { key: 'FestivalSelection', labelKey: 'filter_festival' },
];

export const DiscoverView = memo(() => {
  const { t } = useLanguage();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const { tokens, loading, error, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = useAllVideos(activeFilter);
  const { nearToUsdStr } = useNearPrice();

  const Header = (
    <div className="mb-8">
      <p className="mb-3 text-sm uppercase tracking-[0.24em] text-near-green">{t.landing.discover.published_works_label}</p>
      <h1 className="text-3xl font-bold text-white">
        {t.landing.discover.recently_uploaded}
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-zinc-400">
        {t.landing.discover.description}
      </p>
    </div>
  );

  const Filters = (
    <div className="flex flex-wrap gap-2 mb-6">
      {FILTER_OPTIONS.map((opt) => {
        const isActive = activeFilter === opt.key;
        return (
          <button
            key={opt.labelKey}
            type="button"
            aria-pressed={isActive}
            onClick={() => setActiveFilter(opt.key)}
            className={`min-h-11 px-4 py-2 rounded-full text-sm font-medium border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green ${
              isActive
                ? 'bg-near-green/20 border-near-green text-near-green'
                : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
            }`}
          >
            {/* @ts-expect-error dynamic key access */}
            {t.discover_page?.[opt.labelKey] || opt.labelKey}
          </button>
        );
      })}
    </div>
  );

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="container mx-auto px-4 py-8">
          {Header}
          {Filters}
          <div role="status" aria-live="polite" className="mb-5 flex items-center gap-3 text-zinc-300">
            <Loader2 className="h-5 w-5 animate-spin text-near-green" />
            <span>{t.landing.discover.scanning_blockchain}</span>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="overflow-hidden rounded-lg border border-white/10 bg-zinc-950">
                <div className="aspect-video animate-pulse bg-zinc-900" />
                <div className="space-y-3 p-4">
                  <div className="h-4 w-3/4 rounded bg-zinc-800" />
                  <div className="h-3 w-1/2 rounded bg-zinc-900" />
                  <div className="h-8 rounded bg-zinc-900" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="container mx-auto px-4 py-8">
          {Header}
          {Filters}
          <div className="rounded-lg border border-near-red/30 bg-near-red/10 p-6 text-center text-white" role="status" aria-live="polite">
            <p className="text-xl font-bold text-near-red">{t.landing.discover.failed_to_load}</p>
            <p className="mt-2 text-sm text-zinc-400">{t.landing.discover.try_again_later}</p>
            <Button
              type="button"
              variant="outline"
              className="mt-5 border-near-red/40 text-near-red hover:bg-near-red/10"
              onClick={() => void refetch()}
            >
              {t.system_messages.try_again}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Empty State
  if (tokens.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="container mx-auto px-4 py-8">
          {Header}
          {Filters}
          <div className="text-center py-24 text-white">
            <p className="text-2xl font-bold mb-4">{t.landing.discover.no_videos_found}</p>
            <p className="text-zinc-400">{t.landing.discover.be_first}</p>
            <Link href="/upload" className="mt-8 inline-block">
              <Button variant="outline" className="border-white text-white hover:bg-white/10">
                {t.landing.discover.upload_now}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Content State
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-8">
        {Header}

        {Filters}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tokens.map((token) => (
            <VideoCard
              key={token.token_id}
              token={token}
              nearToUsdStr={nearToUsdStr}
            />
          ))}
        </div>

        {hasNextPage && (
          <div className="flex justify-center pt-4">
            <Button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              variant="outline"
              className="border-white/20 text-zinc-300 hover:bg-white/5"
            >
              {isFetchingNextPage ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t.landing.discover.loading}</>
              ) : (
                t.landing.discover.show_more
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
});

DiscoverView.displayName = 'DiscoverView';
