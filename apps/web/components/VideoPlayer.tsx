'use client';

import * as Player from '@livepeer/react/player';
import { useEffect, useState, useRef } from 'react';
import { getSessionToken } from '@/lib/supabase-client';

interface VideoPlayerProps {
    playbackId: string;
    tokenId: string; // NFT Token ID required for access
}

export function VideoPlayer({ playbackId, tokenId }: VideoPlayerProps) {
    const [jwt, setJwt] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        // Cancel previous request if component re-renders
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        const fetchAccessJwt = async () => {
            setLoading(true);
            setError(null);

            try {
                // Get Supabase session token for authentication
                const sessionToken = await getSessionToken();

                if (!sessionToken) {
                    throw new Error('Please sign in to access this content');
                }

                // Check cache first
                const cacheKey = `video_jwt:${playbackId}:${tokenId}`;
                const cached = sessionStorage.getItem(cacheKey);

                if (cached) {
                    try {
                        const { jwt: cachedJwt, exp } = JSON.parse(cached);
                        // Use cached JWT if it has more than 5 minutes remaining
                        if (Date.now() < exp - 300000) {
                            setJwt(cachedJwt);
                            setLoading(false);
                            return;
                        }
                    } catch {
                        // Invalid cache, proceed to fetch
                        sessionStorage.removeItem(cacheKey);
                    }
                }

                // Fetch new access JWT from backend
                const response = await fetch('/api/video/access', {
                    method: 'POST',
                    signal: abortControllerRef.current?.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`, // SECURITY: Real JWT authentication
                    },
                    body: JSON.stringify({
                        tokenId,
                        playbackId,
                    }),
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to get access token');
                }

                const data = await response.json();

                // Cache the JWT (expires in 1 hour = 3600 seconds)
                const expirationTime = Date.now() + 3600000; // 1 hour from now
                sessionStorage.setItem(cacheKey, JSON.stringify({
                    jwt: data.jwt,
                    exp: expirationTime
                }));

                setJwt(data.jwt);
            } catch (err) {
                // Ignore abort errors
                if (err instanceof Error && err.name === 'AbortError') {
                    return;
                }

                console.error('Error fetching video access JWT:', err);
                setError((err as Error).message);
            } finally {
                setLoading(false);
            }
        };

        fetchAccessJwt();

        // Cleanup on unmount
        return () => {
            abortControllerRef.current?.abort();
        };
    }, [playbackId, tokenId]); // Removed accountId and selector - not needed

    if (error) {
        return (
            <div className="w-full aspect-video bg-slate-900 flex items-center justify-center text-white rounded-lg">
                <div className="text-center p-6">
                    <p className="text-red-400 mb-2 font-semibold">Access Denied</p>
                    <p className="text-sm text-slate-400">{error}</p>
                </div>
            </div>
        );
    }

    if (loading || !jwt) {
        return (
            <div className="w-full aspect-video bg-slate-900 flex items-center justify-center text-white rounded-lg">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                    <p>Verifying access rights...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-lg overflow-hidden shadow-xl">
            <Player.Root
                src={[{
                    type: 'hls',
                    src: `https://livepeer.studio/api/playback/${playbackId}/index.m3u8`,
                    mime: 'application/vnd.apple.mpegurl',
                    width: null,
                    height: null
                }]}
                jwt={jwt}
                aspectRatio={16 / 9}
            >
                <Player.Container>
                    <Player.Video />
                    <Player.Controls autoHide={3000}>
                        <Player.PlayPauseTrigger />
                        <Player.Time />
                        <Player.Seek />
                        <Player.Volume />
                        <Player.FullscreenTrigger />
                    </Player.Controls>
                </Player.Container>
            </Player.Root>
        </div>
    );
}
