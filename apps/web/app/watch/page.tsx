'use client';

import { useSearchParams } from 'next/navigation';
import { IpfsPlayer } from '@/components/IpfsPlayer';
import { MintButton } from '@/components/MintButton';
import { useState, useEffect } from 'react';
import { useOwnedTokens, TokenWithVideo } from '@/hooks/useOwnedTokens';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

export default function WatchPage() {
    const searchParams = useSearchParams();
    const initialCid = searchParams.get('cid') || '';
    const [cid, setCid] = useState(initialCid);
    const [playCid, setPlayCid] = useState(initialCid);
    const { tokens, loading, error } = useOwnedTokens();

    useEffect(() => {
        if (initialCid) {
            setCid(initialCid);
            setPlayCid(initialCid);
        }
    }, [initialCid]);

    const handleVideoSelect = (videoCid: string) => {
        setCid(videoCid);
        setPlayCid(videoCid);
    };

    return (
        <div className="container mx-auto px-4 py-24 min-h-screen">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="text-center space-y-4">
                    <h1 className="text-4xl font-bold tracking-tight">Watch Secure Content</h1>
                    <p className="text-muted-foreground">
                        Decentralized, encrypted streaming. Only NFT holders can watch.
                    </p>
                </div>

                <div className="flex gap-4 max-w-xl mx-auto">
                    <Input
                        placeholder="Enter IPFS CID..."
                        value={cid}
                        onChange={(e) => setCid(e.target.value)}
                        className="flex-1"
                    />
                    <Button onClick={() => setPlayCid(cid)}>
                        <Search className="mr-2 h-4 w-4" />
                        Load Video
                    </Button>
                </div>

                {/* On-Chain Tickets/Videos List */}
                <div className="max-w-xl mx-auto space-y-4">
                    <h3 className="font-bold text-lg border-b pb-2">Your On-Chain Assets</h3>

                    {loading && <p className="text-sm text-muted-foreground animate-pulse">Loading blockchain data...</p>}
                    {error && <p className="text-sm text-red-500">Error loading assets: {error}</p>}

                    {!loading && tokens.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">No tickets or videos found. Mint one below!</p>
                    )}

                    <div className="grid gap-2 max-h-[400px] overflow-y-auto">
                        {tokens.map((token: TokenWithVideo) => {
                            const isVideo = !!token.video_metadata;
                            const videoCid = token.video_metadata?.encrypted_cid;
                            const isAccessPass = videoCid === 'ACCESS_PASS';

                            const title = token.metadata?.title || token.token_id;
                            const subtitle = isAccessPass ? "Access Pass" : (isVideo ? "Video NFT" : "Unknown");

                            return (
                                <div
                                    key={token.token_id}
                                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${isAccessPass
                                        ? 'bg-green-950/30 border-green-900 cursor-default'
                                        : isVideo
                                            ? 'bg-zinc-900 border-zinc-800 cursor-pointer hover:bg-zinc-800'
                                            : 'bg-zinc-950 border-zinc-900 opacity-75'
                                        }`}
                                    onClick={() => !isAccessPass && isVideo && videoCid && handleVideoSelect(videoCid)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${isAccessPass ? 'bg-green-500' : 'bg-blue-500'}`} />
                                        <div>
                                            <p className="font-medium text-sm text-zinc-200">{title}</p>
                                            <p className="text-xs text-zinc-500">{subtitle}</p>
                                        </div>
                                    </div>
                                    {isAccessPass ? (
                                        <div className="text-xs font-mono bg-green-900/50 text-green-400 px-2 py-1 rounded">
                                            Active Pass
                                        </div>
                                    ) : isVideo && (
                                        <div className="text-xs font-mono bg-black px-2 py-1 rounded text-zinc-400">
                                            Click to Watch
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {playCid ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <IpfsPlayer cid={playCid} />
                        <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg border">
                            <div>
                                <p className="font-semibold">Access Restricted?</p>
                                <p className="text-sm text-muted-foreground">You need a YouTick Pass NFT to decrypt this video.</p>
                            </div>
                            <MintButton cid={playCid} />
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-12 border-2 border-dashed rounded-xl">
                        <p className="text-muted-foreground">Enter a CID above or select a video to start watching</p>
                    </div>
                )}
            </div>
        </div>
    );
}
