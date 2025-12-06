import { memo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Play, Ticket, Loader2 } from 'lucide-react';
import { useAllVideos } from '@/hooks/useAllVideos';
import { useLanguage } from '@/components/providers/LanguageContext';
import { Navigation } from '@/components/landing/Navigation';
import { COLORS, ANIMATION } from '@/lib/constants';

interface DiscoverViewProps {
  onBackClick: () => void;
}

export const DiscoverView = memo(({ onBackClick }: DiscoverViewProps) => {
  const { t } = useLanguage();
  const { tokens, loading, error, debugInfo } = useAllVideos();

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

          {/* Debug Info */}
          <div className="mt-8 p-4 bg-zinc-900 mx-auto max-w-md rounded text-left text-xs font-mono text-zinc-500 overflow-auto">
            <p className="font-bold text-zinc-300 mb-2">Debug Info:</p>
            <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
          </div>

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
        <h2 className="text-3xl font-bold text-white mb-8 border-l-4 border-white pl-4">
          {t.landing.discover.recently_uploaded}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tokens.map((token) => {
            const isVideo = !!token.video_metadata?.encrypted_cid;
            return (
              <Link
                href={`/ticket?cid=${token.video_metadata?.encrypted_cid || ''}`}
                key={token.token_id}
                className="group"
              >
                <div
                  className={`${COLORS.background.tertiary} border ${COLORS.border.default} rounded-lg overflow-hidden ${ANIMATION.transition.default} ${ANIMATION.duration.normal} ${ANIMATION.hover.scaleSubtle} group-hover:border-white/30`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-zinc-950 relative flex items-center justify-center">
                    {token.metadata?.media && token.metadata.media.startsWith('http') ? (
                      <img
                        src={token.metadata.media}
                        alt={token.metadata.title}
                        className={`w-full h-full object-cover opacity-60 group-hover:opacity-100 ${ANIMATION.transition.opacity}`}
                      />
                    ) : (
                      <div className="bg-gradient-to-br from-zinc-800 to-black w-full h-full opacity-50" />
                    )}

                    {/* Hover Overlay */}
                    <div className={`absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 ${ANIMATION.transition.opacity}`}>
                      <div className="bg-white/90 p-4 rounded-full backdrop-blur-sm">
                        {isVideo ? (
                          <Play className="w-8 h-8 text-black fill-current" />
                        ) : (
                          <Ticket className="w-8 h-8 text-black" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <h3 className={`font-bold text-lg text-white mb-1 line-clamp-1 group-hover:text-zinc-300 ${ANIMATION.transition.colors}`}>
                      {token.metadata?.title || `Token #${token.token_id}`}
                    </h3>
                    <p className="text-sm text-zinc-400 line-clamp-2 min-h-[2.5rem]">
                      {token.metadata?.description || t.landing.discover.no_description}
                    </p>
                    <div className="mt-4 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-800 pt-3">
                      <span>
                        {t.landing.discover.owner}: {token.owner_id}
                      </span>
                      <span className="px-2 py-1 rounded text-zinc-300 bg-zinc-800">
                        {token.video_metadata?.content_type || t.landing.discover.access_pass}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
});

DiscoverView.displayName = 'DiscoverView';
