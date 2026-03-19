import { memo } from 'react';
import Link from '@/components/Web4Link';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useAllVideos } from '@/hooks/useAllVideos';
import { useLanguage } from '@/components/providers/LanguageContext';
import { Navigation } from '@/components/landing/Navigation';
import { useNearPrice } from '@/hooks/useNearPrice';
import { VideoCard } from '@/components/VideoCard';

interface DiscoverViewProps {
  onBackClick: () => void;
}

export const DiscoverView = memo(({ onBackClick }: DiscoverViewProps) => {
  const { t } = useLanguage();
  const { tokens, loading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useAllVideos();
  const { nearToUsdStr } = useNearPrice();

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Navigation onDiscoverClick={onBackClick} variant="discover" />
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-white">
          <Loader2 className="h-12 w-12 animate-spin mb-4 text-white" />
          <p className="text-xl">{t.landing.discover.scanning_blockchain}</p>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Navigation onDiscoverClick={onBackClick} variant="discover" />
        <div className="text-center py-24 text-white">
          <p className="text-red-500 text-xl font-bold">{t.landing.discover.failed_to_load}</p>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  // Empty State
  if (tokens.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Navigation onDiscoverClick={onBackClick} variant="discover" />
        <div className="text-center py-24 text-white">
          <p className="text-2xl font-bold mb-4">{t.landing.discover.no_videos_found}</p>
          <p className="text-gray-400">{t.landing.discover.be_first}</p>

          <Link href="/upload" className="mt-8 inline-block">
            <Button variant="outline" className="border-white text-white hover:bg-white/10">
              {t.landing.discover.upload_now}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Content State
  return (
    <div className="min-h-screen bg-black text-white">
      <Navigation onDiscoverClick={onBackClick} variant="discover" />

      <div className="container mx-auto px-4 py-8">
        <h2 className="text-3xl font-bold text-white mb-8 border-l-4 border-near-green pl-4">
          {t.landing.discover.recently_uploaded}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tokens.map((token) => (
            <VideoCard
              key={token.token_id}
              token={token}
              variant="grid"
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
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...</>
              ) : (
                'Load More'
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
});

DiscoverView.displayName = 'DiscoverView';
