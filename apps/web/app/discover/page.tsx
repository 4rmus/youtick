'use client';

import Link from 'next/link';
import { Play, Ticket, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAllVideos } from '@/hooks/useAllVideos';

export default function DiscoverPage() {
    const { tokens, loading, error, debugInfo } = useAllVideos();

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-white">
                <Loader2 className="h-12 w-12 animate-spin mb-4 text-red-600" />
                <p className="text-xl">Scanning Blockchain...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-24 text-white">
                <p className="text-red-500 text-xl font-bold">Failed to load videos</p>
                <p className="text-gray-400">{error}</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-24 min-h-screen">
            <div className="space-y-8">
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight mb-2">Discover</h1>
                        <p className="text-muted-foreground">Explore the latest encrypted content from the community.</p>
                    </div>
                </div>

                {tokens.length === 0 ? (
                    <div className="text-center py-24 text-white">
                        <p className="text-2xl font-bold mb-4">No Videos Found</p>
                        <p className="text-gray-400">Be the first to upload content!</p>

                        {/* Debug Info */}
                        <div className="mt-8 p-4 bg-zinc-900 mx-auto max-w-md rounded text-left text-xs font-mono text-zinc-500 overflow-auto">
                            <p className="font-bold text-zinc-300 mb-2">Debug Info:</p>
                            <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
                        </div>

                        <Link href="/upload" className="mt-8 inline-block">
                            <Button variant="outline" className="border-red-600 text-red-100 hover:bg-red-900/50">
                                Upload Now
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {tokens.map((token) => {
                            const isVideo = !!token.video_metadata?.encrypted_cid;
                            return (
                                <Link
                                    href={isVideo ? `/watch?cid=${token.video_metadata?.encrypted_cid}` : '/watch'}
                                    key={token.token_id}
                                    className="group"
                                >
                                    <div className={`bg-zinc-900 border ${isVideo ? 'border-zinc-800' : 'border-blue-900/50'} rounded-lg overflow-hidden transition-transform group-hover:scale-105 group-hover:border-red-600/50`}>
                                        {/* Thumbnail Placeholder */}
                                        <div className="aspect-video bg-zinc-950 relative flex items-center justify-center">
                                            {/* If we had a real thumbnail, we'd use Image */}
                                            {token.metadata?.media && token.metadata.media.startsWith("http") ? (
                                                <img
                                                    src={token.metadata.media}
                                                    alt={token.metadata.title}
                                                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                                                />
                                            ) : (
                                                <div className={`bg-gradient-to-br ${isVideo ? 'from-zinc-800 to-black' : 'from-blue-900/20 to-black'} w-full h-full opacity-50`} />
                                            )}

                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div className={`${isVideo ? 'bg-red-600/90' : 'bg-blue-600/90'} p-4 rounded-full backdrop-blur-sm`}>
                                                    {isVideo ? <Play className="w-8 h-8 text-white fill-current" /> : <Ticket className="w-8 h-8 text-white" />}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            <h3 className="font-bold text-lg text-white mb-1 line-clamp-1 group-hover:text-red-500 transition-colors">
                                                {token.metadata?.title || `Token #${token.token_id}`}
                                            </h3>
                                            <p className="text-sm text-zinc-400 line-clamp-2 min-h-[2.5rem]">
                                                {token.metadata?.description || "No description provided."}
                                            </p>
                                            <div className="mt-4 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-800 pt-3">
                                                <span>OWN: {token.owner_id}</span>
                                                <span className={`px-2 py-1 rounded text-zinc-300 ${isVideo ? 'bg-zinc-800' : 'bg-blue-900/30 text-blue-200'}`}>
                                                    {token.video_metadata?.content_type || "Access Pass"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
