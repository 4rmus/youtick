'use client';

import { useSearchParams } from 'next/navigation';
import { VideoPlayer } from '@/components/VideoPlayer';
import { useState, Suspense } from 'react';
import { useOwnedTokens, TokenWithVideo } from '@/hooks/useOwnedTokens';
import { useEventDescription } from '@/hooks/useEventDescription';
import { useLanguage } from '@/components/providers/LanguageContext';

import { Button } from "@/components/ui/button";
import { Search, Ticket, Loader2 } from "lucide-react";
import { IPFSThumbnail } from "@/components/IPFSThumbnail";

export default function WatchPage() {
    return (
        <div className="container mx-auto px-4 py-8 min-h-screen">
            <Suspense fallback={<div className="flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
                <WatchContent />
            </Suspense>
        </div>
    );
}

function WatchContent() {
    const { t } = useLanguage();
    const searchParams = useSearchParams();
    const initialCid = searchParams.get('cid') || '';
    const [selectedCid, setSelectedCid] = useState('');
    const playCid = selectedCid || initialCid;
    const { tokens, loading, error } = useOwnedTokens();
    const {
        title: eventTitle,
        description: eventDescription,
        thumbnailUrl: eventThumbnail,
        creatorId,
        loading: descLoading,
    } = useEventDescription(playCid);

    // Get thumbnail from tokens first, fallback to event data
    const getActiveThumbnail = () => {
        const tokenThumbnail = tokens.find(t => t.video_metadata?.encrypted_cid === playCid)?.metadata?.media;
        // Use token thumbnail if available and not placeholder, otherwise use event thumbnail
        if (tokenThumbnail && !tokenThumbnail.includes('token.png')) {
            return tokenThumbnail;
        }
        return eventThumbnail || tokenThumbnail;
    };
    const getActiveDurationSeconds = () => {
        const activeToken = tokens.find(t => t.video_metadata?.encrypted_cid === playCid);
        const duration = activeToken?.video_metadata?.duration_seconds;
        return duration && duration > 0 ? duration : undefined;
    };



    return (
        <div className="max-w-4xl mx-auto space-y-8">
            {!playCid && (
                <div className="text-center space-y-4">
                    <h1 className="text-4xl font-bold tracking-tight">{t.watch_page.title}</h1>
                    <p className="text-muted-foreground">
                        {t.watch_page.description}
                    </p>
                </div>
            )}

            {playCid ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-12">
                    {/* Video Title & Uploader - Above Player */}
                    {(() => {
                        const activeToken = tokens.find(t => t.video_metadata?.encrypted_cid === playCid);
                        if (!activeToken && !eventTitle) return null;

                        return (
                            <div className="space-y-2">
                                <h2 className="text-2xl font-bold text-white leading-tight">
                                    {activeToken?.metadata?.title || eventTitle || t.watch_page.untitled}
                                </h2>
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-white">
                                        {(creatorId || activeToken?.owner_id || '??').substring(0, 2).toUpperCase()}
                                    </div>
                                    <p className="text-sm text-zinc-400">
                                        Uploaded by <span className="text-zinc-200 font-medium">{creatorId || activeToken?.owner_id || 'unknown'}</span>
                                    </p>
                                </div>
                            </div>
                        );
                    })()}

                    {/* The Player */}
                    <VideoPlayer
                        key={playCid}
                        cid={playCid}
                        thumbnailUrl={getActiveThumbnail()}
                        initialDurationSeconds={getActiveDurationSeconds()}
                    />

                    {/* Description - Below Player */}
                    {(() => {
                        const activeToken = tokens.find(t => t.video_metadata?.encrypted_cid === playCid);
                        if (!activeToken && !eventDescription) return null;

                        return (
                            <div className="p-6 bg-zinc-900/50 rounded-xl border border-white/5">
                                <h3 className="text-sm font-semibold text-zinc-300 mb-2">{t.watch_page.desc_label}</h3>
                                {descLoading ? (
                                    <p className="text-sm text-zinc-500 italic">{t.watch_page.loading_desc}</p>
                                ) : (
                                    <p className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed">
                                        {eventDescription || activeToken?.metadata?.description || t.watch_page.no_desc}
                                    </p>
                                )}
                            </div>
                        );
                    })()}
                </div>
            ) : (
                <div className="text-center py-16 border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/50 mb-12">
                    <div className="flex justify-center mb-4">
                        <div className="p-4 bg-zinc-900 rounded-full">
                            <Search className="w-8 h-8 text-zinc-500" />
                        </div>
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">{t.watch_page.select_video}</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto">
                        {t.watch_page.select_video_desc}
                    </p>
                    <div className="mt-6">
                        <Button variant="outline" onClick={() => window.location.href = '/discover'}>
                            {t.watch_page.browse_new}
                        </Button>
                    </div>
                </div>
            )}

            {/* On-Chain Tickets/Videos Library */}
            <div className="space-y-6 pt-8 border-t border-zinc-900">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-xl text-white">{t.watch_page.library}</h3>
                    <span className="text-xs text-zinc-500 uppercase tracking-widest">{tokens.length} Assets</span>
                </div>

                {loading && <p className="text-sm text-muted-foreground animate-pulse">Loading library...</p>}
                {error && <p className="text-sm text-red-500">Error loading library: {error}</p>}

                {!loading && tokens.length === 0 && (
                    <div className="text-center py-12 bg-zinc-900/30 rounded-xl">
                        <p className="text-sm text-muted-foreground italic mb-4">Your library is empty.</p>
                        <Button variant="outline" onClick={() => window.location.href = '/discover'}>
                            Browse Discover
                        </Button>
                    </div>
                )}

                <div className="relative">
                    {/* Slider Container */}
                    <div className="overflow-x-auto scrollbar-hide pb-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        <div className="flex gap-4 min-w-max">
                            {tokens.map((token: TokenWithVideo) => {
                                const isVideo = !!token.video_metadata;
                                const videoCid = token.video_metadata?.encrypted_cid;
                                const isAccessPass = videoCid === 'ACCESS_PASS';

                                const title = token.metadata?.title || token.token_id;
                                const subtitle = isAccessPass ? "Global Pass" : (isVideo ? "Video NFT" : "Asset");
                                const media = token.metadata?.media;

                                // Check if this card is currently active/playing
                                const isActive = playCid === videoCid;

                                return (
                                    <div
                                        key={token.token_id}
                                        onClick={() => !isAccessPass && isVideo && videoCid && setSelectedCid(videoCid)}
                                        className={`
                                            group relative overflow-hidden rounded-xl border transition-all duration-300 flex-shrink-0
                                            ${isActive ? 'ring-2 ring-primary border-transparent' : 'border-zinc-800 hover:border-zinc-600'}
                                            ${isAccessPass ? 'bg-green-950/10 cursor-default' : 'bg-zinc-900 cursor-pointer hover:shadow-xl hover:shadow-black/50 hover:-translate-y-1'}
                                        `}
                                        style={{ width: '320px' }}
                                    >
                                        {/* Thumbnail Area */}
                                        <div className="aspect-video bg-zinc-950 relative overflow-hidden">
                                            {media && !media.includes('token.png') && (
                                                <IPFSThumbnail url={media} alt={title} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                            )}
                                            {isActive && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                                                    <span className="text-xs font-bold text-near-black bg-near-green px-2 py-1 rounded-full animate-pulse">Now Playing</span>
                                                </div>
                                            )}
                                            {isAccessPass && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-green-900/20">
                                                    <Ticket className="w-12 h-12 text-green-500/50" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Content Area */}
                                        <div className="p-4">
                                            <div className="flex justify-between items-start gap-2 mb-2">
                                                <h4 className={`font-medium text-sm line-clamp-1 ${isActive ? 'text-primary' : 'text-zinc-200'}`}>
                                                    {title}
                                                </h4>
                                                {isAccessPass && <span className="text-[10px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded border border-green-500/20">PASS</span>}
                                            </div>

                                            <div className="flex justify-between items-end">
                                                <p className="text-xs text-zinc-500">{subtitle}</p>
                                                {isVideo && !isAccessPass && (
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-near-black bg-near-green px-2 py-1 rounded">
                                                        PLAY
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Custom CSS for hiding scrollbar */}
                    <style jsx>{`
                        .scrollbar-hide::-webkit-scrollbar {
                            display: none;
                        }
                    `}</style>
                </div>
            </div>
        </div>
    );
}
