'use client';

import { memo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAllVideos } from '@/hooks/useAllVideos';
import { Button } from '@/components/ui/button';
import { useNearPrice } from '@/hooks/useNearPrice';
import { VideoCard } from '@/components/VideoCard';

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
                    {tokens.map((token) => (
                        <VideoCard
                            key={token.token_id}
                            token={token}
                            variant="slider"
                            nearToUsdStr={nearToUsdStr}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
});

StartSlider.displayName = 'StartSlider';
