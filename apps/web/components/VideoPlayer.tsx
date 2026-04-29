'use client';

import React from 'react';
import { IpfsPlayer } from './IpfsPlayer';
import { useLanguage } from '@/components/providers/LanguageContext';

interface VideoPlayerProps {
    // IPFS data
    cid?: string;
    thumbnailUrl?: string;
    initialDurationSeconds?: number;

    // Player settings
    className?: string;
}

/**
 * VideoPlayer component - Uses IPFS via IpfsPlayer for decentralized playback
 */
export function VideoPlayer({
    cid,
    thumbnailUrl,
    initialDurationSeconds,
    className = '',
}: VideoPlayerProps) {
    const { t } = useLanguage();

    if (cid) {
        return (
            <div className={`video-player-container ${className}`}>
                <IpfsPlayer
                    cid={cid}
                    thumbnailUrl={thumbnailUrl}
                    initialDurationSeconds={initialDurationSeconds}
                />
                <p className="text-xs text-zinc-500 mt-2 text-center">
                    {t.video_player.secure_delivery_note}
                </p>
            </div>
        );
    }

    // No video source available
    return (
        <div className={`video-player-container ${className} flex items-center justify-center bg-zinc-900 rounded-xl p-12`}>
            <div className="text-center">
                <p className="text-zinc-400 mb-2">{t.video_player.no_source}</p>
                <p className="text-xs text-zinc-600">{t.video_player.no_source_desc}</p>
            </div>
        </div>
    );
}
