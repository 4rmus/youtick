'use client';

import Link from 'next/link';
import { Play, Ticket } from 'lucide-react';
import { NovaThumbnail } from '@/components/NovaThumbnail';

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
    };
}

export interface VideoCardProps {
    token: VideoCardToken;
    variant?: 'grid' | 'slider';
    nearToUsdStr: (nearAmount: number) => string;
    accountId?: string | null;
    linkPrefix?: string;
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
 * VideoCard component - reusable card for displaying video tokens.
 *
 * Two variants:
 * - `grid`: Used in discover pages with purple/blue glow, full content section
 * - `slider`: Used in StartSlider with near-green/near-purple glow, compact layout
 */
export function VideoCard({
    token,
    variant = 'grid',
    nearToUsdStr,
    accountId,
    linkPrefix,
}: VideoCardProps) {
    const isVideo = !!token.video_metadata?.encrypted_cid;
    const priceYocto = token.video_metadata?.price;
    const priceNear = priceYocto ? parseFloat(priceYocto) / 1e24 : 0;
    const priceUsdCents = token.video_metadata?.price_usd;
    const isFree = priceNear === 0;
    const isCreator = accountId && token.owner_id === accountId;

    const defaultLink = isVideo
        ? `/watch?cid=${token.video_metadata?.encrypted_cid || ''}`
        : '/watch';

    if (variant === 'slider') {
        return (
            <Link
                href={isVideo ? `/watch?cid=${token.video_metadata?.encrypted_cid}` : '/watch'}
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
    }

    // Grid variant (default)
    return (
        <Link
            href={defaultLink}
            className="group"
        >
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-white/10 shadow-2xl shadow-black/50 transition-all duration-300 hover:border-white/20 hover:shadow-purple-500/10">
                {/* Decorative Corner Glow */}
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl opacity-0 group-hover:opacity-60 transition-opacity duration-700" />
                <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl opacity-0 group-hover:opacity-60 transition-opacity duration-700" />

                {/* Thumbnail */}
                <div className="aspect-video relative overflow-hidden">
                    {token.metadata?.media && (token.metadata.media.startsWith("http") || token.metadata.media.startsWith("nova://")) ? (
                        <NovaThumbnail
                            url={token.metadata.media}
                            alt={token.metadata.title}
                            className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700 ease-out"
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800/50 to-zinc-900/50">
                            <div className="w-14 h-14 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mb-2">
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
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-end">
                        {/* Price Badge */}
                        <div className={`px-2.5 py-1 rounded-lg backdrop-blur-sm border shadow-lg ${isFree
                            ? 'bg-emerald-500/90 border-emerald-400/30'
                            : 'bg-black/60 border-white/10'
                            }`}>
                            {isCreator ? (
                                <span className="text-[9px] font-bold text-white tracking-wider uppercase">&#10024; Owner</span>
                            ) : isFree ? (
                                <span className="text-[9px] font-bold text-white tracking-wider uppercase">&#10024; Free</span>
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
                    <h3 className="font-bold text-white text-base leading-tight line-clamp-1 mb-1 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-purple-200 transition-all duration-300">
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
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 p-0.5">
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
                            <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-pulse" />
                            <span className="text-[9px] text-zinc-400 font-medium">NFT</span>
                        </div>
                    </div>
                </div>

                {/* Bottom Shine Effect */}
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </div>
        </Link>
    );
}
