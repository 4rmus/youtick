'use client';

import React from 'react';
import { IpfsPlayer } from './IpfsPlayer';

interface VideoPlayerProps {
    // IPFS data
    cid?: string;
    thumbnailUrl?: string;

    // Player settings
    className?: string;
}

/**
 * VideoPlayer component - Uses IPFS via IpfsPlayer for decentralized playback
 */
export function VideoPlayer({
    cid,
    thumbnailUrl,
    className = '',
}: VideoPlayerProps) {
    if (cid) {
        return (
            <div className={`video-player-container ${className}`}>
                <IpfsPlayer
                    cid={cid}
                    thumbnailUrl={thumbnailUrl}
                />
                <p className="text-xs text-zinc-500 mt-2 text-center">
                    🌐 Decentralized playback via IPFS
                </p>
            </div>
        );
    }

    // No video source available
    return (
        <div className={`video-player-container ${className} flex items-center justify-center bg-zinc-900 rounded-xl p-12`}>
            <div className="text-center">
                <p className="text-zinc-400 mb-2">❌ No video source available</p>
                <p className="text-xs text-zinc-600">IPFS CID not provided</p>
            </div>
        </div>
    );
}
