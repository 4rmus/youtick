'use client';

import { useSearchParams } from 'next/navigation';
import { VideoPlayer } from '@/components/VideoPlayer';
import { useState, Suspense, useCallback, useEffect } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { useEvent } from '@/hooks/useEvent';
import { useHasTicket } from '@/hooks/useHasTicket';
import { useCreatorProfile } from '@/hooks/useCreatorStats';
import { useLanguage } from '@/components/providers/LanguageContext';
import { TicketPurchaseCard } from '@/components/TicketPurchaseCard';
import { Button } from '@/components/ui/button';
import { getProvider, viewContract } from '@/lib/near';
import { NEAR_CONFIG } from '@/lib/constants';
import type { NFTEvent } from '@/lib/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from '@/components/Web4Link';
import { IPFSThumbnail } from '@/components/IPFSThumbnail';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import { useNearPrice } from '@/hooks/useNearPrice';
import { getContentTypeLabel } from '@/lib/content-types';
import { hasRecentTicketPurchase, markRecentTicketPurchase } from '@/lib/ticket-access-cache';

import {
    Play,
    Lock,
    CheckCircle2,
    Loader2,
    ArrowLeft,
    Video,
    User,
} from 'lucide-react';

export default function WatchPage() {
    return (
        <div className="min-h-screen bg-black text-white">
            <Suspense fallback={
                <div className="flex items-center justify-center min-h-screen">
                    <Loader2 className="h-10 w-10 animate-spin text-zinc-500" />
                </div>
            }>
                <WatchContent />
            </Suspense>
        </div>
    );
}

function WatchContent() {
    const { t } = useLanguage();
    const { accountId } = useWallet();
    const { nearToUsdStr } = useNearPrice();
    const searchParams = useSearchParams();
    const cid = searchParams.get('cid') || '';
    const queryClient = useQueryClient();

    const { data: event, isLoading: eventLoading } = useEvent(cid);
    const { data: hasTicket } = useHasTicket(accountId ?? undefined, cid);
    const { data: creatorProfile } = useCreatorProfile(event?.creator_id ?? undefined);

    const [purchaseCompleted, setPurchaseCompleted] = useState(false);

    const isCreator = accountId && event?.creator_id === accountId;
    const isFreeCollectible = event?.price === '0' && !event?.price_usdc;
    const canWatch = hasTicket || isCreator || purchaseCompleted;

    // Fetch other works by the same creator
    const { data: creatorEvents = [] } = useQuery({
        queryKey: ['creatorEvents', event?.creator_id, cid],
        queryFn: async () => {
            if (!event?.creator_id) return [] as Array<{ cid: string; event: NFTEvent; title: string; media?: string }>;
            const provider = getProvider();
            const allEvents = await viewContract<[string, NFTEvent][]>(
                provider,
                NEAR_CONFIG.contractId,
                'get_events',
                { limit: 100 },
            );
            return allEvents
                .filter(([evtCid, evt]) => evt.creator_id === event.creator_id && evtCid !== cid)
                .slice(0, 6)
                .map(([evtCid, evt]) => {
                    const parsed = parseTitleMetadata(evt.title);
                    return { cid: evtCid, event: evt, title: parsed.title, media: parsed.thumbnailUrl };
                });
        },
        enabled: !!event?.creator_id,
        staleTime: 60 * 1000,
    });

    useEffect(() => {
        setPurchaseCompleted(hasRecentTicketPurchase(accountId, cid));
    }, [accountId, cid]);

    const handlePurchaseSuccess = useCallback(() => {
        markRecentTicketPurchase(accountId, cid);
        setPurchaseCompleted(true);

        if (!accountId || !cid) {
            return;
        }

        queryClient.setQueryData(['hasTicket', accountId, cid], true);
        queryClient.setQueryData(['nftOwnership', accountId, cid], true);
        void queryClient.invalidateQueries({ queryKey: ['hasTicket', accountId, cid] });
        void queryClient.invalidateQueries({ queryKey: ['nftOwnership', accountId, cid] });
        void queryClient.invalidateQueries({ queryKey: ['ownedTokens', accountId] });
    }, [accountId, cid, queryClient]);

    // Content type badge helper
    const contentTypeLabel = (type?: string | null) => {
        const label = getContentTypeLabel(t.discover_page?.content_type as Record<string, string> | undefined, type);
        if (!label || label === t.discover_page?.content_type?.exclusive) return null;
        return label;
    };

    if (!cid) {
        return (
            <div className="container mx-auto px-4 py-24">
                <div className="max-w-xl mx-auto text-center">
                    <Video className="w-16 h-16 mx-auto mb-6 text-zinc-700" />
                    <h1 className="text-3xl font-bold mb-3">{t.watch_page.title}</h1>
                    <p className="text-zinc-400 mb-8">{t.watch_page.description}</p>
                    <Link href="/discover">
                        <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                            {t.watch_page.browse_new}
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    if (eventLoading) {
        return (
            <div className="container mx-auto px-4 py-24">
                <div className="flex flex-col items-center justify-center">
                    <Loader2 className="h-10 w-10 animate-spin text-zinc-500 mb-4" />
                    <p className="text-zinc-400">{t.watch_page.loading}</p>
                </div>
            </div>
        );
    }

    if (!event) {
        return (
            <div className="container mx-auto px-4 py-24">
                <div className="max-w-xl mx-auto text-center">
                    <Video className="w-16 h-16 mx-auto mb-6 text-zinc-700" />
                    <h1 className="text-2xl font-bold mb-3">{t.discover_page?.no_videos || 'No Releases Found'}</h1>
                    <p className="text-zinc-400 mb-8">{t.watch_page.select_video_desc}</p>
                    <Link href="/discover">
                        <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                            {t.watch_page.browse_new}
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    const parsedTitle = parseTitleMetadata(event.title);
    const displayTitle = parsedTitle.title || t.watch_page.untitled;
    const displayCreator = creatorProfile?.display_name || event.creator_id;
    const ctLabel = contentTypeLabel(event.content_type);

    return (
        <div className="container mx-auto px-4 py-6 max-w-5xl">
            {/* Back button */}
            <div className="mb-4">
                <Link href="/discover" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    {t.discover_page?.title || 'Discover'}
                </Link>
            </div>

            {/* Work Info Header */}
            <div className="mb-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">{displayTitle}</h1>
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                            {/* Creator */}
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-[10px] font-bold text-white">
                                    {displayCreator.substring(0, 1).toUpperCase()}
                                </div>
                                <span className="text-sm text-zinc-300">{displayCreator}</span>
                            </div>
                            {/* Content Type */}
                            {ctLabel && (
                                <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-[11px] font-medium text-zinc-300">
                                    {ctLabel}
                                </span>
                            )}
                            {/* Access Status */}
                            {canWatch ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-400">
                                    <CheckCircle2 className="w-3 h-3" />
                                    {t.watch_page.ticket_verified}
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] font-medium text-amber-400">
                                    <Lock className="w-3 h-3" />
                                    {t.watch_page.ticket_required_secure}
                                </span>
                            )}
                        </div>
                    </div>
                    {/* Price */}
                    {!isFreeCollectible && (
                        <div className="text-right">
                            <p className="text-xs text-zinc-500 uppercase tracking-wider">{t.watch_page.price}</p>
                            <p className="text-xl font-bold text-white">
                                {event.price_usd ? `$${(event.price_usd / 100).toFixed(2)}` : nearToUsdStr(Number(event.price) / 1e24)}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Player or Purchase Card */}
            <div className="mb-8">
                {canWatch ? (
                    <div className="rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-2xl">
                        <VideoPlayer
                            cid={cid}
                            thumbnailUrl={undefined}
                        />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                        {/* Preview thumbnail */}
                        <div className="lg:col-span-3 relative rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 aspect-video flex items-center justify-center">
                            {parsedTitle.thumbnailUrl ? (
                                <IPFSThumbnail
                                    url={parsedTitle.thumbnailUrl}
                                    alt={displayTitle}
                                    className="absolute inset-0 h-full w-full object-cover opacity-70"
                                />
                            ) : (
                                <Video className="w-16 h-16 text-zinc-700" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/10" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                                <Lock className="w-10 h-10 text-zinc-400 mb-3" />
                                <p className="text-lg font-semibold text-white mb-1">{t.watch_page.locked_preview_title}</p>
                                <p className="text-sm text-zinc-400">{t.watch_page.locked_preview_desc}</p>
                                <p className="mt-2 text-sm text-zinc-300">{event.price_usd ? `$${(event.price_usd / 100).toFixed(2)}` : nearToUsdStr(Number(event.price) / 1e24)}</p>
                            </div>
                        </div>
                        {/* Purchase Card */}
                        <div className="lg:col-span-2">
                            <TicketPurchaseCard
                                cid={cid}
                                onPurchaseSuccess={handlePurchaseSuccess}
                                className="h-full"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Description */}
            {event.description && (
                <div className="mb-10 p-5 rounded-xl bg-zinc-900/50 border border-white/5">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-2">{t.watch_page.desc_label}</h3>
                    <p className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed">{event.description}</p>
                </div>
            )}

            {/* More from this creator */}
            {creatorEvents.length > 0 && (
                <div className="mb-10">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <User className="w-5 h-5 text-near-green" />
                        {t.watch_page.creator_works}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {creatorEvents.map((item) => (
                            <Link
                                key={item.cid}
                                href={`/watch?cid=${item.cid}`}
                                className="group block"
                            >
                                <div className="relative overflow-hidden rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-all">
                                    <div className="aspect-video bg-zinc-800 relative">
                                        {item.media ? (
                                            <IPFSThumbnail
                                                url={item.media}
                                                alt={item.title}
                                                className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Video className="w-6 h-6 text-zinc-600" />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                                            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                                <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-3">
                                        <h4 className="text-sm font-medium text-white truncate">{item.title}</h4>
                                        <p className="text-xs text-zinc-500 mt-0.5">
                                            {item.event.price === '0'
                                                ? t.profile_page.free
                                                : item.event.price_usd
                                                    ? `$${(item.event.price_usd / 100).toFixed(2)}`
                                                    : nearToUsdStr(Number(item.event.price) / 1e24)}
                                        </p>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
