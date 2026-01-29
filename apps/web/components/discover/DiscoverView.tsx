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
        <h2 className="text-3xl font-bold text-white mb-8 border-l-4 border-near-green pl-4">
          {t.landing.discover.recently_uploaded}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tokens.map((token) => {
            const isVideo = !!token.video_metadata?.encrypted_cid;
            // Get price from video_metadata if available
            const priceYocto = token.video_metadata?.price;
            const priceNear = priceYocto ? parseFloat(priceYocto) / 1e24 : 0;
            const isFree = priceNear === 0;

            return (
              <Link
                href={`/ticket?cid=${token.video_metadata?.encrypted_cid || ''}`}
                key={token.token_id}
                className="group"
              >
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-white/10 shadow-2xl shadow-black/50 transition-all duration-300 hover:border-white/20 hover:shadow-purple-500/10">
                  {/* Decorative Corner Glow - NEAR Colors */}
                  <div className="absolute -top-20 -right-20 w-40 h-40 bg-near-green/20 rounded-full blur-3xl opacity-0 group-hover:opacity-60 transition-opacity duration-700" />
                  <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-near-purple/20 rounded-full blur-3xl opacity-0 group-hover:opacity-60 transition-opacity duration-700" />

                  {/* Thumbnail */}
                  <div className="aspect-video relative overflow-hidden">
                    {token.metadata?.media && (token.metadata.media.startsWith('http') || token.metadata.media.startsWith('data:')) ? (
                      <img
                        src={token.metadata.media}
                        alt={token.metadata.title}
                        className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700 ease-out"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.parentElement?.classList.add('bg-zinc-800');
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800/50 to-zinc-900/50">
                        <div className="w-14 h-14 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mb-2">
                          <svg className="w-7 h-7 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/20 to-transparent" />

                    {/* Play Button */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100 transition-all duration-300">
                        <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl">
                          {isVideo ? (
                            <Play className="w-5 h-5 text-white fill-current ml-0.5" />
                          ) : (
                            <Ticket className="w-5 h-5 text-white" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Top Badges Row */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-end">
                      {/* Price Badge */}
                      <div className={`px-2.5 py-1 rounded-lg backdrop-blur-sm border shadow-lg ${isFree
                        ? 'bg-emerald-500/90 border-emerald-400/30'
                        : 'bg-black/60 border-white/10'
                        }`}>
                        {isFree ? (
                          <span className="text-[9px] font-bold text-white tracking-wider uppercase">✨ Free</span>
                        ) : (
                          <span className="text-[9px] font-bold text-white tracking-wider">{priceNear.toFixed(2)} NEAR</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Content Section */}
                  <div className="p-4 relative">
                    {/* Title */}
                    <h3 className="font-bold text-white text-base leading-tight line-clamp-1 mb-1 group-hover:text-near-green transition-all duration-300">
                      {token.metadata?.title || `Token #${token.token_id}`}
                    </h3>
                    {/* Description */}
                    <p className="text-xs text-zinc-400 line-clamp-2 mb-3 leading-relaxed min-h-[2rem]">
                      {token.metadata?.description || 'NFT ticket for exclusive video access'}
                    </p>
                    {/* Divider with Gradient */}
                    <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-3" />

                    {/* Creator Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* Avatar with Ring */}
                        <div className="relative">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-near-green via-near-purple to-near-blue p-0.5">
                            <div className="w-full h-full rounded-[6px] bg-zinc-900 flex items-center justify-center">
                              <span className="text-[9px] font-bold text-white">
                                {token.owner_id ? token.owner_id.substring(0, 2).toUpperCase() : "??"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <span className="text-[10px] text-zinc-400 font-medium truncate max-w-[100px]">
                          {token.owner_id}
                        </span>
                      </div>

                      {/* NFT Ticket Indicator */}
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-800/50 border border-zinc-700/50">
                        <div className="w-1.5 h-1.5 rounded-full bg-near-green animate-pulse" />
                        <span className="text-[9px] text-zinc-400 font-medium">NFT</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Shine Effect */}
                  <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
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
