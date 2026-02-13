'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAllVideos } from '@/hooks/useAllVideos';
import { useWallet } from '@/components/providers/WalletProvider';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useNearPrice } from '@/hooks/useNearPrice';
import { VideoCard } from '@/components/VideoCard';

export default function DiscoverPage() {
    const { tokens, loading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useAllVideos();
    const { accountId } = useWallet();
    const { t } = useLanguage();
    const { nearToUsdStr } = useNearPrice();

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-white">
                <Loader2 className="h-12 w-12 animate-spin mb-4 text-red-600" />
                <p className="text-xl">{t.discover_page.scanning}</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-24 text-white">
                <p className="text-red-500 text-xl font-bold">{t.discover_page.failed}</p>
                <p className="text-gray-400">{error}</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-24 min-h-screen">
            <div className="space-y-8">
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight mb-2">{t.discover_page.title}</h1>
                        <p className="text-muted-foreground">{t.discover_page.subtitle}</p>
                    </div>
                </div>

                {tokens.length === 0 ? (
                    <div className="text-center py-24 text-white">
                        <p className="text-2xl font-bold mb-4">{t.discover_page.no_videos}</p>
                        <p className="text-gray-400">{t.discover_page.be_first}</p>

                        <Link href="/upload" className="mt-8 inline-block">
                            <Button variant="outline" className="border-red-600 text-red-100 hover:bg-red-900/50">
                                {t.discover_page.upload_now}
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {tokens.map((token) => (
                            <VideoCard
                                key={token.token_id}
                                token={token}
                                variant="grid"
                                nearToUsdStr={nearToUsdStr}
                                accountId={accountId}
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
                )}
            </div>
        </div>
    );
}
