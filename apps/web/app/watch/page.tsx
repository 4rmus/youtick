'use client';

import { useSearchParams } from 'next/navigation';
import { IpfsPlayer } from '@/components/IpfsPlayer';
import { MintButton } from '@/components/MintButton';
import { useState, useEffect } from 'react';
import { useOwnedTokens, TokenWithVideo } from '@/hooks/useOwnedTokens';

import { Button } from "@/components/ui/button";
import { Search, Ticket } from "lucide-react";

export default function WatchPage() {
    const searchParams = useSearchParams();
    const initialCid = searchParams.get('cid') || '';
    const [playCid, setPlayCid] = useState(initialCid);
    const { tokens, loading, error } = useOwnedTokens();

    useEffect(() => {
        if (initialCid) {
            setPlayCid(initialCid);
        }
    }, [initialCid]);

    return (
        <div className="container mx-auto px-4 py-24 min-h-screen">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="text-center space-y-4">
                    <h1 className="text-4xl font-bold tracking-tight">Watch Secure Content</h1>
                    <p className="text-muted-foreground">
                        Decentralized, encrypted streaming. Only NFT holders can watch.
                    </p>
                </div>

                {playCid ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-12">
                        {/* 1. The Player */}
                        <IpfsPlayer
                            cid={playCid}
                            thumbnailUrl={tokens.find(t => t.video_metadata?.encrypted_cid === playCid)?.metadata?.media}
                        />

                        {/* 2. Video Details */}
                        {(() => {
                            const activeToken = tokens.find(t => t.video_metadata?.encrypted_cid === playCid);
                            if (!activeToken) return null;

                            return (
                                <div className="space-y-4">
                                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                        <div>
                                            <h2 className="text-2xl font-bold text-white leading-tight">
                                                {activeToken.metadata?.title || "Untitled Video"}
                                            </h2>
                                            <div className="flex items-center gap-2 mt-2">
                                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-[10px] font-bold text-white">
                                                    {activeToken.owner_id.substring(0, 2).toUpperCase()}
                                                </div>
                                                <p className="text-sm text-zinc-400">
                                                    Uploaded by <span className="text-zinc-200 font-medium">{activeToken.owner_id}</span>
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-6 bg-zinc-900/50 rounded-xl border border-white/5">
                                        <h3 className="text-sm font-semibold text-zinc-300 mb-2">Description</h3>
                                        <p className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed">
                                            {activeToken.metadata?.description || "No description provided."}
                                        </p>
                                    </div>
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
                        <h3 className="text-lg font-medium text-white mb-2">Select a Video</h3>
                        <p className="text-muted-foreground max-w-sm mx-auto">
                            Choose a video from your library below to start watching securely.
                        </p>
                        <div className="mt-6">
                            <Button variant="outline" onClick={() => window.location.href = '/discover'}>
                                Browse New Content
                            </Button>
                        </div>
                    </div>
                )}

                {/* On-Chain Tickets/Videos Library */}
                <div className="space-y-6 pt-8 border-t border-zinc-900">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-xl text-white">Your Library</h3>
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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
                                    onClick={() => !isAccessPass && isVideo && videoCid && setPlayCid(videoCid)}
                                    className={`
                                        group relative overflow-hidden rounded-xl border transition-all duration-300
                                        ${isActive ? 'ring-2 ring-primary border-transparent' : 'border-zinc-800 hover:border-zinc-600'}
                                        ${isAccessPass ? 'bg-green-950/10 cursor-default' : 'bg-zinc-900 cursor-pointer hover:shadow-xl hover:shadow-black/50 hover:-translate-y-1'}
                                    `}
                                >
                                    {/* Thumbnail Area */}
                                    <div className="aspect-video bg-zinc-950 relative overflow-hidden">
                                        {media && !media.includes('token.png') && (
                                            <img src={media} alt={title} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                        )}
                                        {isActive && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                                                <span className="text-xs font-bold text-white bg-primary px-2 py-1 rounded-full animate-pulse">Now Playing</span>
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
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-white bg-white/10 px-2 py-1 rounded">
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
            </div>
        </div>
    );
}
