'use client';

import Link from 'next/link';
import { PlayCircle } from 'lucide-react';

// Mock data for discovery
const FEATURED_VIDEOS = [
    {
        id: '1',
        title: 'Decentralized Future',
        author: 'Satoshi_Vision',
        thumbnail: '/hero_shock_centralization_1764836087396.png', // Reusing generated image as thumb
        cid: 'QmTest123',
        views: '1.2k'
    },
    {
        id: '2',
        title: 'Cyberpunk Cityscapes',
        author: 'Neon_Dreamer',
        thumbnail: '/feature_encryption_shield_1764836182111.png',
        cid: 'QmTest456',
        views: '850'
    },
    // Add more mock items if needed
];

export default function DiscoverPage() {
    return (
        <div className="container mx-auto px-4 py-24 min-h-screen">
            <div className="space-y-8">
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight mb-2">Discover</h1>
                        <p className="text-muted-foreground">Explore the latest encrypted content from the community.</p>
                    </div>
                    {/* Filter/Sort buttons could go here */}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {FEATURED_VIDEOS.map((video) => (
                        <Link href={`/watch?cid=${video.cid}`} key={video.id} className="group">
                            <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-800 transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-lg group-hover:shadow-primary/10">
                                {/* Thumbnail */}
                                <img
                                    src={video.thumbnail}
                                    alt={video.title}
                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                />

                                {/* Play Overlay */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                                    <PlayCircle className="w-12 h-12 text-white drop-shadow-lg" />
                                </div>

                                {/* Duration Badge (Mock) */}
                                <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                                    12:34
                                </div>
                            </div>
                            <div className="mt-3 space-y-1">
                                <h3 className="font-semibold text-lg leading-none group-hover:text-primary transition-colors">{video.title}</h3>
                                <div className="flex justify-between text-sm text-muted-foreground">
                                    <span>{video.author}</span>
                                    <span>{video.views} views</span>
                                </div>
                            </div>
                        </Link>
                    ))}

                    {/* Empty State / Call to Action */}
                    <div className="aspect-video rounded-xl border-2 border-dashed border-slate-800 flex flex-col items-center justify-center p-6 text-center hover:bg-slate-900/50 transition-colors group cursor-pointer">
                        <Link href="/upload" className="w-full h-full flex flex-col items-center justify-center">
                            <p className="font-semibold text-muted-foreground group-hover:text-white">Upload Your Video</p>
                            <p className="text-sm text-slate-500 mt-2">Join the revolution</p>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
