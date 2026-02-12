'use client';

import { memo, useRef } from 'react';
import Link from 'next/link';
import { Play, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAllVideos } from '@/hooks/useAllVideos';
import { Button } from '@/components/ui/button';
import { NovaThumbnail } from '@/components/NovaThumbnail';
import { useNearPrice } from '@/hooks/useNearPrice';

export const StartSlider = memo(() => {
    const { tokens, loading } = useAllVideos();
    const { nearToUsdStr } = useNearPrice();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const scrollAmount = 340;
            const newScrollLeft = scrollContainerRef.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount);
            scrollContainerRef.current.scrollTo({
                left: newScrollLeft,
                behavior: 'smooth'
            });
        }
    };

    if (loading) {
        return (
            <div className="py-20 flex justify-center items-center bg-black">
                <Loader2 className="w-8 h-8 text-[var(--near-green)] animate-spin" />
            </div>
        );
    }

    if (!tokens || tokens.length === 0) {
        return null;
    }

    return (
        <section className="py-20 bg-black relative border-b border-white/5 overflow-hidden">
            {/* Concert Gradient Background */}
            <div className="absolute inset-0">
                <div
                    className="absolute inset-0 opacity-30"
                    style={{
                        background: 'linear-gradient(135deg, rgba(255, 0, 110, 0.1) 0%, rgba(131, 56, 236, 0.1) 50%, rgba(0, 245, 212, 0.1) 100%)',
                    }}
                />
            </div>

            <div className="container mx-auto px-4 relative z-10">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        <span className="w-2 h-8 bg-gradient-to-b from-[var(--near-green)] to-[var(--near-purple)] rounded-full" />
                        <span className="text-gradient-concert">Discover</span>
                    </h2>

                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => scroll('left')}
                            className="bg-black/50 border-white/10 hover:bg-[var(--near-green)]/20 hover:border-[var(--near-green)]/50 text-white rounded-full transition-all duration-300"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => scroll('right')}
                            className="bg-black/50 border-white/10 hover:bg-[var(--near-green)]/20 hover:border-[var(--near-green)]/50 text-white rounded-full transition-all duration-300"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </Button>
                    </div>
                </div>

                <div
                    ref={scrollContainerRef}
                    className="flex overflow-x-auto gap-6 pb-6 snap-x snap-mandatory scrollbar-hide -mx-4 px-4"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {tokens.map((token) => {
                        const isVideo = !!token.video_metadata?.encrypted_cid;
                        const priceYocto = token.video_metadata?.price;
                        const priceNear = priceYocto ? parseFloat(priceYocto) / 1e24 : 0;
                        const priceUsdCents = token.video_metadata?.price_usd;
                        const isFree = priceNear === 0;

                        return (
                            <Link
                                href={isVideo ? `/watch?cid=${token.video_metadata?.encrypted_cid}` : '/watch'}
                                key={token.token_id}
                                className="group flex-none w-[380px] snap-center cursor-pointer"
                            >
                                <div className="relative overflow-hidden rounded-xl bg-zinc-900/80 border border-white/10 shadow-lg transition-all duration-500 hover:border-[var(--near-green)]/50 hover:shadow-[var(--near-green)]/20 hover:shadow-2xl hover:-translate-y-2">
                                    {/* Glow effect on hover */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--near-green)]/0 to-[var(--near-purple)]/0 group-hover:from-[var(--near-green)]/10 group-hover:to-[var(--near-purple)]/10 transition-all duration-500 z-0" />

                                    {/* Thumbnail */}
                                    <div className="aspect-video relative overflow-hidden bg-zinc-800">
                                        {token.metadata?.media ? (
                                            <NovaThumbnail
                                                url={token.metadata.media}
                                                alt={token.metadata.title || ''}
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                                                <VideoPlaceholder />
                                            </div>
                                        )}

                                        {/* Play Overlay */}
                                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/50 transition-all duration-500 flex items-center justify-center opacity-0 group-hover:opacity-100">
                                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[var(--near-green)] to-[var(--near-purple)] flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform duration-300">
                                                <Play className="w-6 h-6 text-white fill-current translate-x-0.5" />
                                            </div>
                                        </div>

                                        {/* Price Badge */}
                                        <div className="absolute top-3 right-3">
                                            <div className={`px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-md shadow-lg ${isFree
                                                ? 'bg-gradient-to-r from-[var(--near-blue)] to-[#00D4AA] text-black'
                                                : 'bg-black/60 text-white border border-white/20'
                                                }`}>
                                                {isFree ? 'FREE' : priceUsdCents ? `$${(priceUsdCents / 100).toFixed(2)}` : nearToUsdStr(priceNear)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Content */}
                                    <div className="p-4 relative z-10">
                                        <h3 className="font-bold text-white mb-2 truncate text-lg group-hover:text-[var(--near-green)] transition-colors duration-300">
                                            {token.metadata?.title || `Token #${token.token_id}`}
                                        </h3>

                                        <div className="flex items-center justify-between text-xs text-zinc-400">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--near-green)] to-[var(--near-purple)] p-[1px]">
                                                    <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-[8px] text-white font-bold">
                                                        {token.owner_id ? token.owner_id.substring(0, 1).toUpperCase() : "?"}
                                                    </div>
                                                </div>
                                                <span className="truncate max-w-[100px]">{token.owner_id}</span>
                                            </div>
                                            <span className="bg-white/5 px-2 py-1 rounded-full border border-white/10 text-[10px]">
                                                NFT Ticket
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </section>
    );
});

const VideoPlaceholder = () => (
    <svg className="w-10 h-10 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

StartSlider.displayName = 'StartSlider';

