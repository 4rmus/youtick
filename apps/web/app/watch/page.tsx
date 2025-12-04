'use client';

import { useSearchParams } from 'next/navigation';
import { IpfsPlayer } from '@/components/IpfsPlayer';
import { MintButton } from '@/components/MintButton';
import { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

export default function WatchPage() {
    const searchParams = useSearchParams();
    const initialCid = searchParams.get('cid') || '';
    const [cid, setCid] = useState(initialCid);
    const [playCid, setPlayCid] = useState(initialCid);
    const [uploadedVideos, setUploadedVideos] = useState<any[]>([]);

    useEffect(() => {
        if (initialCid) {
            setCid(initialCid);
            setPlayCid(initialCid);
        }
        // Load uploaded videos from localStorage
        const videos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
        setUploadedVideos(videos);
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

                {/* Uploaded Videos List */}
                {uploadedVideos.length > 0 && (
                    <div className="max-w-xl mx-auto space-y-2">
                        <h3 className="font-semibold">Your Uploads</h3>
                        <div className="grid gap-2">
                            {uploadedVideos.map((video: any, index: number) => (
                                <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80" onClick={() => {
                                    setCid(video.cid);
                                    setPlayCid(video.cid);
                                }}>
                                    <div>
                                        <p className="font-medium">{video.name}</p>
                                        <p className="text-xs text-muted-foreground">{new Date(video.timestamp).toLocaleString()}</p>
                                    </div>
                                    <p className="text-xs font-mono bg-background px-2 py-1 rounded">{video.cid.substring(0, 8)}...</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {playCid ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <IpfsPlayer cid={playCid} />
                        <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg border">
                            <div>
                                <p className="font-semibold">Access Restricted?</p>
                                <p className="text-sm text-muted-foreground">You need a YouTick Pass NFT to decrypt this video.</p>
                            </div>
                            <MintButton />
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-12 border-2 border-dashed rounded-xl">
                        <p className="text-muted-foreground">Enter a CID above to start watching</p>
                    </div>
                )}
            </div>
        </div>
    );
}
