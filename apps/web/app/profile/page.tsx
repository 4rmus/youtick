'use client';

import { useWallet } from '@/components/providers/WalletProvider';
import { useOwnedTokens, TokenWithVideo } from '@/hooks/useOwnedTokens';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getProvider, viewContract } from '@/lib/near';
import { NEAR_CONFIG } from '@/lib/constants';
import { User, Wallet, Ticket, Loader2, ArrowLeft, Gift, Video, Sparkles, BarChart3, DollarSign, Edit, Globe, AtSign, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from '@/components/Web4Link';
import { useLanguage } from '@/components/providers/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { GiftLinkGenerator } from "@/components/GiftLinkGenerator";
import { TrialInviteGenerator } from "@/components/TrialInviteGenerator";
import { TrialUpgradeDialog } from "@/components/TrialUpgradeDialog";
import { IPFSThumbnail } from "@/components/IPFSThumbnail";
import { useNearPrice } from '@/hooks/useNearPrice';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import type { NFTEvent, PurchaseLog } from '@/lib/types';
import { useCreatorStats, useCreatorPurchaseLogs, useCreatorProfile } from '@/hooks/useCreatorStats';
import { CreatorProfileForm } from '@/components/CreatorProfileForm';
import { getLatestEventsQuery } from '@/lib/event-query';

interface CreatedEvent extends NFTEvent {
    cid: string;
    media: string;
    price_usd?: number | null;
}

export default function ProfilePage() {
    const { t } = useLanguage();
    const { accountId, isTrial } = useWallet();
    const { yoctoToUsd, nearToUsdStr } = useNearPrice();
    const { tokens, loading: tokensLoading } = useOwnedTokens();
    const { data: creatorStats } = useCreatorStats(accountId ?? undefined);
    const { data: purchaseLogs = [] } = useCreatorPurchaseLogs(accountId ?? undefined);
    const { data: creatorProfile } = useCreatorProfile(accountId ?? undefined);

    // Gift Modal State
    const [showGiftModal, setShowGiftModal] = useState(false);
    const [selectedEventForGift, setSelectedEventForGift] = useState<CreatedEvent | null>(null);
    const [showTrialInviteModal, setShowTrialInviteModal] = useState(false);
    const [showProfileDialog, setShowProfileDialog] = useState(false);

    // Wallet balance via React Query + FailoverRpcProvider
    const { data: walletBalance, isLoading: loadingBalances } = useQuery({
        queryKey: ['walletBalance', accountId],
        queryFn: async () => {
            const provider = getProvider();
            const state = await provider.query({
                request_type: 'view_account',
                account_id: accountId!,
                finality: 'final'
            }) as { amount: string };

            const balanceInNear = (BigInt(state.amount) / BigInt(10 ** 24)).toString();
            const decimals = (Number(BigInt(state.amount) % BigInt(10 ** 24)) / 10 ** 24).toFixed(2).substring(2);
            return `${balanceInNear}.${decimals}`;
        },
        enabled: !!accountId,
        staleTime: 30 * 1000,
        gcTime: 2 * 60 * 1000,
    });

    // Created events via React Query + FailoverRpcProvider
    const { data: createdEvents = [], isLoading: loadingCreated } = useQuery({
        queryKey: ['createdEvents', accountId],
        queryFn: async () => {
            const provider = getProvider();
            const totalCount = Number(await viewContract<number>(
                provider,
                NEAR_CONFIG.contractId,
                'get_events_count',
                {},
            ));
            const query = getLatestEventsQuery(totalCount);
            if (!query) {
                return [];
            }

            const events = await viewContract<[string, NFTEvent][]>(
                provider,
                NEAR_CONFIG.contractId,
                'get_events',
                query,
            );

            return events
                .filter(([, event]) => event.creator_id === accountId)
                .reverse()
                .map(([cid, event]) => {
                    const parsed = parseTitleMetadata(event.title);
                    return {
                        cid,
                        ...event,
                        price_usd: event.price_usd ?? null,
                        media: parsed.thumbnailUrl,
                        title: parsed.title,
                    };
                });
        },
        enabled: !!accountId,
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
    });

    const publishedWorkCount = createdEvents.length;
    const ticketCount = tokens.filter(t => {
        const tokenCid = t.video_metadata?.encrypted_cid;
        return !createdEvents.some(e => e.cid === tokenCid);
    }).length;

    if (!accountId) {
        return (
            <div className="container mx-auto px-4 py-24 min-h-screen">
                <div className="max-w-2xl mx-auto text-center">
                    <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800">
                        <User className="w-16 h-16 mx-auto mb-4 text-zinc-600" />
                        <h2 className="text-2xl font-bold mb-2">{t.profile_page.wallet_not_connected}</h2>
                        <p className="text-zinc-400 mb-6">{t.profile_page.connect_prompt}</p>
                        <Link href="/">
                            <Button variant="outline">{t.profile_page.go_home}</Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-24 min-h-screen">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/watch">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-4xl font-bold tracking-tight">{t.profile_page.title}</h1>
                            <p className="text-muted-foreground mt-1">{t.profile_page.subtitle}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {accountId === NEAR_CONFIG.contractId && (
                            <Button
                                onClick={() => setShowTrialInviteModal(true)}
                                variant="outline"
                                className="border-zinc-700 text-zinc-200 hover:bg-zinc-800 gap-2"
                            >
                                <Sparkles className="w-4 h-4" />
                                {t.trial_page?.trial_invite_title || 'Guest Invites'}
                            </Button>
                        )}

                        {createdEvents.length > 0 && (
                            <Button
                                onClick={() => setShowGiftModal(true)}
                                className="bg-near-green text-near-black hover:bg-near-green/80 font-semibold gap-2"
                            >
                                <Gift className="w-4 h-4" />
                                {t.profile_page.gift_button}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Account Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-zinc-800 rounded-lg">
                                <User className="w-5 h-5 text-zinc-400" />
                            </div>
                            <h3 className="font-semibold text-zinc-200">{t.profile_page.account}</h3>
                        </div>
                        <div className="space-y-2">
                            <p className="text-xs text-zinc-500 uppercase tracking-wider">{t.profile_page.account_id}</p>
                            <p className="text-sm font-mono text-white break-all">{accountId}</p>
                        </div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-zinc-800 rounded-lg">
                                <Wallet className="w-5 h-5 text-zinc-400" />
                            </div>
                            <h3 className="font-semibold text-zinc-200">{t.profile_page.wallet_balance}</h3>
                        </div>
                        <div className="space-y-2">
                            {loadingBalances ? (
                                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                            ) : (
                                <>
                                    <p className="text-2xl font-bold text-white">
                                        {walletBalance || '0.00'} <span className="text-sm font-normal text-zinc-400">NEAR</span>
                                    </p>
                                    <p className="text-xs text-zinc-500">{t.profile_page.available}</p>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Creator Profile Card */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-zinc-800 rounded-lg">
                                    {creatorProfile?.avatar_url ? (
                                        <img src={creatorProfile.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                                    ) : (
                                        <User className="w-5 h-5 text-zinc-400" />
                                    )}
                                </div>
                                <h3 className="font-semibold text-zinc-200">{t.profile_page.my_profile || 'Profile'}</h3>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowProfileDialog(true)}
                                className="text-zinc-400 hover:text-white"
                            >
                                <Edit className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="space-y-2">
                            {creatorProfile?.display_name ? (
                                <p className="text-lg font-bold text-white">{creatorProfile.display_name}</p>
                            ) : (
                                <p className="text-sm text-zinc-500 italic">{t.profile_page.no_profile || 'No profile yet'}</p>
                            )}
                            {creatorProfile?.bio && (
                                <p className="text-xs text-zinc-400 line-clamp-2">{creatorProfile.bio}</p>
                            )}
                            <div className="flex flex-wrap gap-2 pt-1">
                                {creatorProfile?.website && (
                                    <a href={creatorProfile.website} target="_blank" rel="noopener noreferrer" className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1">
                                        <Globe className="w-3 h-3" /> Web
                                    </a>
                                )}
                                {creatorProfile?.twitter && (
                                    <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                                        <AtSign className="w-3 h-3" /> {creatorProfile.twitter}
                                    </span>
                                )}
                                {creatorProfile?.instagram && (
                                    <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                                        <Camera className="w-3 h-3" /> {creatorProfile.instagram}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Trial Account Upgrade Banner */}
                {isTrial && accountId && (
                    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-6">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <h3 className="font-semibold text-white flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-near-green" />
                                    {t.profile_page.upgrade_trial_title}
                                </h3>
                                <p className="text-sm text-zinc-300 mt-1">
                                    {t.profile_page.upgrade_trial_desc}
                                </p>
                            </div>
                            <TrialUpgradeDialog
                                accountId={accountId}
                                onUpgradeComplete={() => window.location.reload()}
                            />
                        </div>
                    </div>
                )}

                {/* Role Summary */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
                        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{t.profile_page.my_tickets}</p>
                        <p className="mt-2 text-3xl font-bold text-white">{ticketCount}</p>
                        <p className="mt-1 text-xs text-zinc-500">{t.watch_page.library}</p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
                        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{t.profile_page.my_events}</p>
                        <p className="mt-2 text-3xl font-bold text-white">{publishedWorkCount}</p>
                        <p className="mt-1 text-xs text-zinc-500">{t.profile_page.works_published || 'Works'}</p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
                        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" /> {t.profile_page.total_sales || 'Sales'}
                        </p>
                        <p className="mt-2 text-3xl font-bold text-white">{creatorStats?.total_sales ?? 0}</p>
                        <p className="mt-1 text-xs text-zinc-500">{t.profile_page.tickets_sold || 'Tickets sold'}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                        <p className="text-xs uppercase tracking-[0.18em] text-emerald-400 flex items-center gap-1">
                            <DollarSign className="w-3 h-3" /> {t.profile_page.total_revenue || 'Revenue'}
                        </p>
                        <p className="mt-2 text-3xl font-bold text-white">
                            {creatorStats ? nearToUsdStr(Number(creatorStats.total_revenue_yocto) / 1e24) : '$0.00'}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">{t.profile_page.earned || 'Earned'}</p>
                    </div>
                    <div className="rounded-xl border border-near-green/20 bg-near-green/10 p-5">
                        <p className="text-xs uppercase tracking-[0.18em] text-near-green">{t.profile_page.gift_button}</p>
                        <p className="mt-2 text-3xl font-bold text-white">{publishedWorkCount > 0 ? (t.profile_page.gift_ready || 'Ready') : '-'}</p>
                        <p className="mt-1 text-xs text-zinc-400">{t.profile_page.gift_create_link}</p>
                    </div>
                </div>

                {/* Dual Column Layout - Tickets & Events */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-0">
                    {/* Tickets Column */}
                    <div className="lg:pr-8 lg:border-r border-zinc-800">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-zinc-800 rounded-lg">
                                    <Ticket className="w-5 h-5 text-zinc-400" />
                                </div>
                                <h2 className="font-bold text-xl text-white">{t.profile_page.my_tickets}</h2>
                            </div>
                            <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded">
                                {/* Filter out own uploads - only show purchased tickets */}
                                {ticketCount}
                            </span>
                        </div>

                        {tokensLoading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
                            </div>
                        ) : tokens.filter(t => {
                            const tokenCid = t.video_metadata?.encrypted_cid;
                            return !createdEvents.some(e => e.cid === tokenCid);
                        }).length === 0 ? (
                            <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/50">
                                <Ticket className="w-10 h-10 mx-auto text-zinc-700 mb-3" />
                                <h3 className="text-sm font-medium text-white mb-1">{t.profile_page.no_tickets}</h3>
                                <p className="text-xs text-zinc-500 mb-4">{t.profile_page.no_tickets_desc}</p>
                                <Link href="/discover">
                                    <Button variant="outline" size="sm">{t.profile_page.browse}</Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                                {tokens
                                    .filter((token: TokenWithVideo) => {
                                        // Exclude own uploads - only show purchased tickets
                                        const tokenCid = token.video_metadata?.encrypted_cid;
                                        return !createdEvents.some(e => e.cid === tokenCid);
                                    })
                                    .map((token: TokenWithVideo) => {
                                        const videoCid = token.video_metadata?.encrypted_cid;
                                        const isAccessPass = videoCid === 'ACCESS_PASS';
                                        const title = token.metadata?.title || token.token_id;
                                        const media = token.metadata?.media;

                                        return (
                                            <Link
                                                key={token.token_id}
                                                href={!isAccessPass && videoCid ? `/watch?cid=${videoCid}` : '/watch'}
                                                className="block group"
                                            >
                                                <div className="flex gap-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900 transition-all">
                                                    <div className="w-20 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
                                                        {media && !media.includes('token.png') ? (
                                                            <IPFSThumbnail
                                                                url={media}
                                                                alt={title}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <Video className="w-5 h-5 text-zinc-600" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-sm font-medium text-white truncate">{title}</h4>
                                                        <p className="text-xs text-zinc-500 mt-0.5">
                                                            {isAccessPass ? t.profile_page.access_pass : t.profile_page.nft_ticket}
                                                        </p>
                                                    </div>
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center">
                                                        <span className="text-[10px] font-bold text-near-black bg-near-green px-2 py-1 rounded">
                                                            {t.profile_page.watch_btn}
                                                        </span>
                                                    </div>
                                                </div>
                                            </Link>
                                        );
                                    })}
                            </div>
                        )}
                    </div>

                    {/* Events Column */}
                    <div className="lg:pl-8">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-zinc-800 rounded-lg">
                                    <Video className="w-5 h-5 text-zinc-400" />
                                </div>
                                <h2 className="font-bold text-xl text-white">{t.profile_page.my_events}</h2>
                            </div>
                            <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded">
                                {createdEvents.length}
                            </span>
                        </div>

                        {loadingCreated ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
                            </div>
                        ) : createdEvents.length === 0 ? (
                            <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/50">
                                <Video className="w-10 h-10 mx-auto text-zinc-700 mb-3" />
                                <h3 className="text-sm font-medium text-white mb-1">{t.profile_page.no_events}</h3>
                                <p className="text-xs text-zinc-500 mb-4">{t.profile_page.no_events_desc}</p>
                                <Link href="/upload">
                                    <Button variant="outline" size="sm">{t.profile_page.upload_video}</Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                                {createdEvents.map((event) => {
                                    const eventSales = purchaseLogs.filter(([, log]) => log.event_cid === event.cid).length;
                                    return (
                                        <div key={event.cid} className="group relative">
                                            <Link href={`/watch?cid=${event.cid}`} className="block">
                                                <div className="flex gap-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900 transition-all">
                                                    <div className="w-20 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
                                                        {event.media && !event.media.includes('token.png') ? (
                                                            <IPFSThumbnail
                                                                url={event.media}
                                                                alt={event.title}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <Video className="w-5 h-5 text-zinc-600" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-sm font-medium text-white truncate">{event.title}</h4>
                                                        <p className="text-xs text-zinc-500 mt-0.5">
                                                            {event.price === "0"
                                                                ? t.profile_page.free
                                                                : event.price_usd
                                                                    ? `$${(event.price_usd / 100).toFixed(2)}`
                                                                    : yoctoToUsd(event.price)}
                                                            {eventSales > 0 && (
                                                                <span className="ml-2 text-emerald-400">
                                                                    {eventSales} {t.profile_page.sales_count || 'sold'}
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-bold text-black bg-white px-1.5 py-0.5 rounded uppercase">
                                                            {t.profile_page.creator}
                                                        </span>
                                                    </div>
                                                </div>
                                            </Link>
                                            {/* Quick Gift Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setSelectedEventForGift(event);
                                                }}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg bg-white hover:bg-zinc-200 text-black"
                                            >
                                                <Gift className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Gift Video Selection Modal */}
            <Dialog open={showGiftModal} onOpenChange={setShowGiftModal}>
                <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Gift className="w-5 h-5 text-zinc-400" />
                            {t.profile_page.gift_button}
                        </DialogTitle>
                        <DialogDescription>
                            {t.profile_page.gift_select_desc}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 space-y-2 max-h-[400px] overflow-y-auto">
                        {createdEvents.map((event) => (
                            <button
                                key={event.cid}
                                onClick={() => {
                                    setSelectedEventForGift(event);
                                    setShowGiftModal(false);
                                }}
                                className="w-full flex gap-3 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800 transition-all text-left"
                            >
                                <div className="w-16 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-700">
                                    {event.media && !event.media.includes('token.png') ? (
                                        <IPFSThumbnail
                                            url={event.media}
                                            alt={event.title}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Video className="w-4 h-4 text-zinc-600" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-medium text-white truncate">{event.title}</h4>
                                    <p className="text-xs text-zinc-500 mt-0.5">
                                        {event.price === "0"
                                            ? t.profile_page.free
                                            : event.price_usd
                                                ? `$${(event.price_usd / 100).toFixed(2)}`
                                                : yoctoToUsd(event.price)}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Gift Link Generator Modal */}
            <Dialog open={!!selectedEventForGift} onOpenChange={(open) => !open && setSelectedEventForGift(null)}>
                <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-[550px] max-h-[85vh] overflow-y-auto flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Gift className="w-5 h-5 text-zinc-400" />
                            {t.profile_page.gift_create_link}
                        </DialogTitle>
                        <DialogDescription>
                            &ldquo;{selectedEventForGift?.title}&rdquo; {t.profile_page.gift_share_desc}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Event Preview */}
                    {selectedEventForGift && (
                        <div className="mt-4 w-full flex gap-4 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                            <div className="w-24 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-700">
                                {selectedEventForGift.media && !selectedEventForGift.media.includes('token.png') ? (
                                    <IPFSThumbnail
                                        url={selectedEventForGift.media}
                                        alt={selectedEventForGift.title}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Video className="w-5 h-5 text-zinc-600" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-white truncate">{selectedEventForGift.title}</h4>
                                <p className="text-xs text-zinc-400 mt-1">
                                    {t.profile_page.creator}: <span className="text-zinc-300">{accountId}</span>
                                </p>
                                <p className="text-xs text-zinc-500 mt-0.5">
                                    {selectedEventForGift.price === "0"
                                        ? t.profile_page.free_event
                                        : selectedEventForGift.price_usd
                                            ? `$${(selectedEventForGift.price_usd / 100).toFixed(2)}`
                                            : yoctoToUsd(selectedEventForGift.price)}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Gift Link Generator */}
                    {selectedEventForGift && (
                        <div className="mt-4 w-full">
                            <GiftLinkGenerator
                                eventCid={selectedEventForGift.cid}
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Profile Edit Dialog */}
            <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
                <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-[550px] max-h-[85vh] overflow-y-auto flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <User className="w-5 h-5 text-zinc-400" />
                            {t.profile_page?.edit_profile || 'Edit Profile'}
                        </DialogTitle>
                        <DialogDescription>
                            {t.profile_page?.edit_profile_desc || 'Update how viewers see you on your works and profile.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 w-full">
                        <CreatorProfileForm
                            onSuccess={() => setShowProfileDialog(false)}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showTrialInviteModal} onOpenChange={setShowTrialInviteModal}>
                <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-[550px] max-h-[85vh] overflow-y-auto flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-zinc-400" />
                            {t.trial_page?.trial_invite_title || 'Guest Invites'}
                        </DialogTitle>
                        <DialogDescription>
                            {t.trial_page?.trial_invite_desc || 'Create invite-only guest links for viewers.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="mt-4 w-full">
                        <TrialInviteGenerator />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
