'use client';

import Link from '@/components/Web4Link';
import { Play, Ticket } from 'lucide-react';
import { IPFSThumbnail } from '@/components/IPFSThumbnail';
import { CreatorAvatar } from '@/components/CreatorAvatar';
import { useLanguage } from '@/components/providers/LanguageContext';
import { Card } from '@/components/ui/card';
import { getContentTypeLabel } from '@/lib/content-types';

export interface VideoCardToken {
    token_id: string;
    owner_id: string;
    metadata?: {
        title?: string;
        description?: string;
        media?: string;
    };
    video_metadata?: {
        encrypted_cid?: string;
        price?: string;
        price_usd?: number | null;
        content_type?: string;
    };
}

export interface VideoCardProps {
    token: VideoCardToken;
    nearToUsdStr: (nearAmount: number) => string;
    accountId?: string | null;
}

/**
 * VideoPlaceholder - fallback SVG when no thumbnail is available
 */
function VideoPlaceholder() {
    return (
        <svg className="w-7 h-7 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
    );
}

/**
 * VideoCard component - reusable card for displaying video tokens in discover grids.
 */
export function VideoCard({
    token,
    nearToUsdStr,
    accountId,
}: VideoCardProps) {
    const { t } = useLanguage();
    const isVideo = !!token.video_metadata?.encrypted_cid;
    const priceYocto = token.video_metadata?.price;
    const priceNear = priceYocto ? parseFloat(priceYocto) / 1e24 : 0;
    const priceUsdCents = token.video_metadata?.price_usd;
    const isFree = priceNear === 0;
    const isCreator = accountId && token.owner_id === accountId;
    const contentTypeLabel = getContentTypeLabel(
        t.discover_page?.content_type as Record<string, string> | undefined,
        token.video_metadata?.content_type,
    );

    const defaultLink = isVideo
        ? `/watch?cid=${token.video_metadata?.encrypted_cid || ''}`
        : '/watch';

    return (
        <Link href={defaultLink} className="group">
            <Card className="relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-near-green/35">
                {/* Thumbnail */}
                <div className="aspect-video relative overflow-hidden">
                    {token.metadata?.media ? (
                        <IPFSThumbnail
                            url={token.metadata.media}
                            alt={token.metadata.title}
                            className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700 ease-out"
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800/50 to-zinc-900/50">
                            <div className="w-14 h-14 rounded-lg bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mb-2">
                                <VideoPlaceholder />
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
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                        {/* Content Type Badge */}
                        {contentTypeLabel && contentTypeLabel !== t.discover_page?.content_type?.exclusive && (
                            <div className="px-2 py-1 rounded-lg backdrop-blur-sm bg-black/60 border border-white/10">
                                <span className="text-[9px] font-bold text-white tracking-wider uppercase">
                                    {contentTypeLabel}
                                </span>
                            </div>
                        )}
                        {/* Price Badge */}
                        <div className={`px-2.5 py-1 rounded-lg backdrop-blur-sm border shadow-lg ml-auto ${isFree
                            ? 'bg-near-green/90 border-near-green/30'
                            : 'bg-black/60 border-white/10'
                            }`}>
                            {isCreator ? (
                                <span className="text-[9px] font-bold text-white tracking-wider uppercase">{t.discover_page.own}</span>
                            ) : isFree ? (
                                <span className="text-[9px] font-bold text-white tracking-wider uppercase">{t.profile_page.free}</span>
                            ) : priceUsdCents ? (
                                <span className="text-[9px] font-bold text-white tracking-wider">${(priceUsdCents / 100).toFixed(2)}</span>
                            ) : (
                                <span className="text-[9px] font-bold text-white tracking-wider">{nearToUsdStr(priceNear)}</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Content Section */}
                <div className="p-4 relative">
                    {/* Title */}
                    <h3 className="font-bold text-white text-base leading-tight line-clamp-1 mb-1 transition-colors duration-300 group-hover:text-near-green">
                        {token.metadata?.title || `Token #${token.token_id}`}
                    </h3>

                    {/* Description */}
                    <p className="text-xs text-zinc-400 line-clamp-2 mb-3 leading-relaxed min-h-[2rem]">
                        {token.metadata?.description || t.profile_page.nft_ticket + ' ' + t.watch_page.work}
                    </p>

                    {/* Divider with Gradient */}
                    <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-3" />

                    {/* Creator Row */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CreatorAvatar name={token.owner_id} />

                            <span className="text-[10px] text-zinc-400 font-medium truncate max-w-[100px]">
                                {token.owner_id}
                            </span>
                        </div>

                        {/* CTA / ticket indicator */}
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${isFree
                            ? 'bg-near-green/10 border-near-green/30 text-near-green'
                            : isCreator
                                ? 'bg-near-purple/10 border-near-purple/30 text-near-purple'
                                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400'
                            }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${isFree
                                ? 'bg-near-green'
                                : isCreator
                                    ? 'bg-near-purple'
                                    : 'bg-near-green'
                            }`} />
                            <span className="text-[9px] font-medium">
                                {isCreator
                                    ? t.video_card?.yours || 'Yours'
                                    : isFree
                                        ? t.discover_page?.watch_free || 'Get Free Ticket'
                                        : t.discover_page?.buy_ticket || 'Buy Ticket'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Bottom Shine Effect */}
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </Card>
        </Link>
    );
}
