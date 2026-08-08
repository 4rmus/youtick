'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import * as Player from '@livepeer/react/player';
import { getSrc } from '@livepeer/react/external';
import {
    Loader2,
    Maximize,
    Minimize,
    Pause,
    PictureInPicture2,
    Play,
    Volume2,
    VolumeX,
} from 'lucide-react';
import { ensureSessionGrant } from '@/lib/access-grants';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from '@/components/ui/button';
import {
    createLivepeerHlsConfig,
    startLivepeerPlaybackSession,
    type LivepeerPlaybackInput,
} from '@/lib/livepeer-playback';

type LivepeerPlayerProps = LivepeerPlaybackInput & {
    title: string;
    poster?: string;
};

export function LivepeerPlayer({
    title,
    poster,
    accountId,
    jobId,
    generation,
    playbackId,
}: LivepeerPlayerProps) {
    const { getWallet } = useWallet();
    const tokenRef = useRef<string | null>(null);
    const [src, setSrc] = useState<ReturnType<typeof getSrc>>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    // xhrSetup invokes this getter only for HLS network requests, never during render.
    // eslint-disable-next-line react-hooks/refs
    const [hlsConfig] = useState(() => createLivepeerHlsConfig(() => tokenRef.current));

    useEffect(() => {
        let disposed = false;
        let destroy: (() => void) | undefined;
        tokenRef.current = null;
        setSrc(null);
        setAccessToken(null);
        setError(null);

        const ensurePlayGrant = async () => {
            const grant = await ensureSessionGrant({
                accountId,
                scope: 'Play',
                resourceId: jobId,
                wallet: await getWallet(),
            });
            if (!grant) throw new Error('livepeer_play_grant_missing');
        };

        void ensurePlaybackSupport()
            .then(ensurePlayGrant)
            .then(() => {
                if (disposed) throw new Error('livepeer_playback_cancelled');
                return startLivepeerPlaybackSession({
                    accountId,
                    jobId,
                    generation,
                    playbackId,
                }, {
                    renewGrant: ensurePlayGrant,
                    onAccess: (access) => {
                        if (disposed) return;
                        const nextSrc = getSrc(access.hlsUrl);
                        if (!nextSrc) throw new Error('invalid_livepeer_playback_source');
                        tokenRef.current = access.token;
                        setAccessToken(access.token);
                        setSrc((current) => current ?? nextSrc);
                    },
                    onError: (nextError) => {
                        if (disposed) return;
                        tokenRef.current = null;
                        setAccessToken(null);
                        setSrc(null);
                        setError(playbackErrorMessage(nextError));
                    },
                });
            })
            .then((session) => {
                if (disposed) session.destroy();
                else destroy = session.destroy;
            })
            .catch((nextError) => {
                if (disposed) return;
                tokenRef.current = null;
                setAccessToken(null);
                setSrc(null);
                setError(playbackErrorMessage(
                    nextError instanceof Error ? nextError : new Error('livepeer_playback_failed'),
                ));
            });

        return () => {
            disposed = true;
            tokenRef.current = null;
            destroy?.();
        };
    }, [accountId, attempt, generation, getWallet, jobId, playbackId]);

    const retry = () => {
        setError(null);
        setAttempt((current) => current + 1);
    };

    if (!src || !accessToken) {
        return (
            <div className="relative flex aspect-video items-center justify-center bg-black p-6 text-center">
                {poster && (
                    <Image
                        fill
                        priority
                        unoptimized
                        src={poster}
                        alt=""
                        sizes="(min-width: 1024px) 1024px, 100vw"
                        className="object-cover"
                        onError={(event) => { event.currentTarget.hidden = true; }}
                    />
                )}
                <div aria-hidden="true" className="absolute inset-0 bg-black/65" />
                {error ? (
                    <div role="alert" className="relative max-w-sm text-white">
                        <p className="text-sm">{error}</p>
                        <Button className="mt-4" size="sm" variant="outline" onClick={retry}>
                            Try again
                        </Button>
                    </div>
                ) : (
                    <div role="status" className="relative flex items-center gap-3 text-sm text-zinc-300">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Confirming ticket access
                    </div>
                )}
            </div>
        );
    }

    return (
        <Player.Root
            key={`${jobId}:${generation}:${playbackId}:${attempt}`}
            src={src}
            playbackId={playbackId}
            jwt={accessToken}
            preload="metadata"
            storage={null}
        >
            <Player.Container className="relative overflow-hidden bg-black">
                <Player.Video
                    className="h-full w-full"
                    hlsConfig={hlsConfig}
                    poster={poster ?? null}
                    title={title}
                />
                <Player.LoadingIndicator className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 text-sm text-white">
                    <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                    Loading video
                </Player.LoadingIndicator>
                <Player.Controls className="absolute inset-x-0 bottom-0 z-10 flex flex-col-reverse gap-1 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 text-white">
                    <div className="flex items-center gap-3">
                        <Player.PlayPauseTrigger className="h-8 w-8 rounded p-1 hover:bg-white/10">
                            <Player.PlayingIndicator asChild matcher={false}>
                                <Play aria-hidden="true" />
                            </Player.PlayingIndicator>
                            <Player.PlayingIndicator asChild>
                                <Pause aria-hidden="true" />
                            </Player.PlayingIndicator>
                        </Player.PlayPauseTrigger>
                        <Player.Time className="min-w-24 text-xs tabular-nums" />
                        <Player.MuteTrigger className="h-8 w-8 rounded p-1 hover:bg-white/10">
                            <Player.VolumeIndicator asChild matcher={false}>
                                <VolumeX aria-hidden="true" />
                            </Player.VolumeIndicator>
                            <Player.VolumeIndicator asChild matcher={true}>
                                <Volume2 aria-hidden="true" />
                            </Player.VolumeIndicator>
                        </Player.MuteTrigger>
                        <Player.Volume className="relative hidden h-5 w-24 touch-none select-none items-center sm:flex">
                            <Player.Track className="relative h-1 grow rounded-full bg-white/30">
                                <Player.Range className="absolute h-full rounded-full bg-white" />
                            </Player.Track>
                            <Player.Thumb className="block h-3 w-3 rounded-full bg-white" />
                        </Player.Volume>
                        <div className="ml-auto flex items-center gap-2">
                            <Player.PictureInPictureTrigger className="h-8 w-8 rounded p-1 hover:bg-white/10">
                                <PictureInPicture2 aria-hidden="true" />
                            </Player.PictureInPictureTrigger>
                            <Player.FullscreenTrigger className="h-8 w-8 rounded p-1 hover:bg-white/10">
                                <Player.FullscreenIndicator asChild matcher={false}>
                                    <Maximize aria-hidden="true" />
                                </Player.FullscreenIndicator>
                                <Player.FullscreenIndicator asChild>
                                    <Minimize aria-hidden="true" />
                                </Player.FullscreenIndicator>
                            </Player.FullscreenTrigger>
                        </div>
                    </div>
                    <Player.Seek className="relative flex h-5 w-full touch-none select-none items-center">
                        <Player.Track className="relative h-1 grow rounded-full bg-white/30">
                            <Player.SeekBuffer className="absolute h-full rounded-full bg-white/20" />
                            <Player.Range className="absolute h-full rounded-full bg-white" />
                        </Player.Track>
                        <Player.Thumb className="block h-3 w-3 rounded-full bg-white" />
                    </Player.Seek>
                </Player.Controls>
                <Player.ErrorIndicator
                    matcher="all"
                    role="alert"
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 p-6 text-center text-white"
                >
                    <p className="text-sm">Playback was interrupted.</p>
                    <Button className="mt-4" size="sm" variant="outline" onClick={retry}>
                        Try again
                    </Button>
                </Player.ErrorIndicator>
            </Player.Container>
        </Player.Root>
    );
}

function playbackErrorMessage(error: Error): string {
    if (error.message === 'livepeer_playback_unsupported') {
        return 'This browser cannot play this video.';
    }
    if (['livepeer_play_grant_missing', 'livepeer_play_grant_pending', 'livepeer_play_grant_mismatch', 'playback_denied']
        .includes(error.message)) {
        return 'Playback access could not be confirmed.';
    }
    return 'Playback is temporarily unavailable. Please try again.';
}

async function ensurePlaybackSupport(): Promise<void> {
    if (document.createElement('video').canPlayType('application/vnd.apple.mpegurl')) return;
    const { default: Hls } = await import('hls.js');
    if (!Hls.isSupported()) throw new Error('livepeer_playback_unsupported');
}
