'use client';

import { useEffect, useRef, useState } from 'react';
import { ensureSessionGrant } from '@/lib/access-grants';
import { useWallet } from '@/components/providers/WalletProvider';
import {
    startLivepeerPlayback,
    type LivepeerPlaybackInput,
} from '@/lib/livepeer-playback';

type LivepeerPlayerProps = LivepeerPlaybackInput & {
    poster?: string;
};

export function LivepeerPlayer({
    poster,
    accountId,
    jobId,
    generation,
    playbackId,
}: LivepeerPlayerProps) {
    const { getWallet } = useWallet();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        let disposed = false;
        let destroy: (() => void) | undefined;
        void getWallet()
            .then((wallet) => ensureSessionGrant({
                accountId,
                scope: 'Play',
                resourceId: jobId,
                wallet,
            }))
            .then((grant) => {
                if (disposed) throw new Error('livepeer_playback_cancelled');
                if (!grant) throw new Error('livepeer_play_grant_missing');
                return startLivepeerPlayback(video, {
                    accountId,
                    jobId,
                    generation,
                    playbackId,
                }, (nextError) => setError(nextError.message));
            })
            .then((session) => {
                if (disposed) session.destroy();
                else destroy = session.destroy;
            })
            .catch((nextError) => {
                if (disposed) return;
                setError(nextError instanceof Error ? nextError.message : 'livepeer_playback_failed');
            });
        return () => {
            disposed = true;
            destroy?.();
        };
    }, [accountId, generation, getWallet, jobId, playbackId]);

    return (
        <div className="relative aspect-video bg-black">
            <video
                ref={videoRef}
                className="h-full w-full"
                controls
                playsInline
                preload="metadata"
                poster={poster}
                aria-label="Protected video playback"
            />
            {error && (
                <p role="alert" className="absolute inset-x-4 bottom-4 rounded bg-black/80 p-3 text-sm text-white">
                    Playback could not be authorized. Please refresh and try again.
                </p>
            )}
        </div>
    );
}
