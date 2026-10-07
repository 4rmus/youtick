'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Maximize, Minimize, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createLivepeerHlsConfig } from '@/lib/livepeer-playback';
import type { DeviceKey } from '@/lib/v2/device-key';
import { requestPlaybackV3Token, type PlaybackV3Token } from '@/lib/v2/playback';
import { watermarkCode, watermarkPosition, watermarkSlot, WATERMARK_MOVE_MS } from '@/lib/v2/watermark';

const REFRESH_BEFORE_EXPIRY_MS = 60_000;

const ERRORS: Record<string, string> = {
    playback_denied: 'This ticket cannot be played on this device.',
    playback_pending: 'Your ticket is still being confirmed. Please try again in a moment.',
    playback_unsupported: 'This browser cannot play the video.',
};

/**
 * Plays a V2 ticket. Nothing is requested until the viewer presses play: the first token settles
 * the ticket (`mark_watched`), after which it can no longer be refunded.
 */
export function TicketPlayer(props: {
    bridgeUrl: string; network: string; contractId: string; ticketId: string; device: DeviceKey; firstPlay: boolean;
}) {
    const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
    const [error, setError] = useState('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const frameRef = useRef<HTMLDivElement>(null);
    const [slot, setSlot] = useState(() => watermarkSlot(Date.now()));
    const [fullscreen, setFullscreen] = useState(false);
    const code = watermarkCode(props.ticketId);
    const position = watermarkPosition(props.ticketId, slot);
    const tokenRef = useRef<string | null>(null);
    const cleanup = useRef<(() => void) | null>(null);

    useEffect(() => () => cleanup.current?.(), []);
    useEffect(() => {
        if (state !== 'playing') return;
        const timer = setInterval(() => setSlot(watermarkSlot(Date.now())), WATERMARK_MOVE_MS / 6);
        return () => clearInterval(timer);
    }, [state]);
    useEffect(() => {
        const update = () => setFullscreen(document.fullscreenElement === frameRef.current);
        document.addEventListener('fullscreenchange', update);
        return () => document.removeEventListener('fullscreenchange', update);
    }, []);

    // Fullscreen is the frame, not the video, so the watermark stays on screen.
    function toggleFullscreen() {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        else void frameRef.current?.requestFullscreen().catch(() => undefined);
    }

    async function start() {
        setState('loading');
        setError('');
        const request = () => requestPlaybackV3Token({
            bridgeUrl: props.bridgeUrl, network: props.network, contractId: props.contractId, ticketId: props.ticketId,
            origin: window.location.origin, device: props.device,
        });
        try {
            let access: PlaybackV3Token = await request();
            tokenRef.current = access.token;
            const { default: Hls } = await import('hls.js');
            const video = videoRef.current!;
            // Native HLS (iOS Safari) cannot send the Livepeer-Jwt header, so the token goes in the URL.
            const native = !Hls.isSupported();
            if (native && !video.canPlayType('application/vnd.apple.mpegurl')) throw new Error('playback_unsupported');
            const nativeSource = (value: PlaybackV3Token) => `${value.hlsUrl}?jwt=${encodeURIComponent(value.token)}`;
            const hls = native ? null : new Hls(createLivepeerHlsConfig(() => tokenRef.current, access.playbackId));
            if (hls) {
                hls.loadSource(access.hlsUrl);
                hls.attachMedia(video);
            } else {
                video.src = nativeSource(access);
            }
            let timer: ReturnType<typeof setTimeout> | undefined;
            const schedule = () => {
                timer = setTimeout(async () => {
                    try {
                        access = await request();
                        tokenRef.current = access.token;
                        if (!hls) {
                            const position = video.currentTime;
                            const playing = !video.paused;
                            video.src = nativeSource(access);
                            video.addEventListener('loadedmetadata', () => {
                                video.currentTime = position;
                                if (playing) void video.play().catch(() => undefined);
                            }, { once: true });
                        }
                        schedule();
                    } catch {
                        setState('error');
                        setError('Playback stopped because the viewing pass could not be renewed.');
                    }
                }, Math.max(5_000, access.expiresAtMs - Date.now() - REFRESH_BEFORE_EXPIRY_MS));
            };
            schedule();
            cleanup.current = () => {
                if (timer) clearTimeout(timer);
                hls?.destroy();
                if (!hls) video.removeAttribute('src');
            };
            setState('playing');
            void video.play().catch(() => undefined);
        } catch (failure) {
            setState('error');
            const code = failure instanceof Error ? failure.message : '';
            setError(ERRORS[code] ?? 'Playback is not available right now. Please try again.');
        }
    }

    return <div className="space-y-3">
        <div ref={frameRef} className="relative aspect-video overflow-hidden rounded-lg bg-black">
            {/* Native fullscreen and picture-in-picture would show the video without the watermark. */}
            <video ref={videoRef} className="h-full w-full" controls={state === 'playing'} playsInline
                controlsList="nofullscreen noremoteplayback" disablePictureInPicture disableRemotePlayback />
            {state === 'playing' && <div aria-hidden="true"
                className="pointer-events-none absolute select-none font-mono text-xs tracking-widest text-white/35 transition-all duration-1000 sm:text-sm"
                style={{ top: `${position.top}%`, left: `${position.left}%` }}>
                youtick · {code}
            </div>}
            {state === 'playing' && typeof document !== 'undefined' && document.fullscreenEnabled && <Button type="button" size="icon"
                variant="ghost" className="absolute right-2 top-2 h-11 w-11 bg-black/40 text-white"
                aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize className="h-5 w-5" aria-hidden="true" /> : <Maximize className="h-5 w-5" aria-hidden="true" />}
            </Button>}
            {state !== 'playing' && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <Button className="min-h-11 gap-2" disabled={state === 'loading'} onClick={() => void start()}>
                    {state === 'loading' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
                    Play
                </Button>
                {props.firstPlay && state === 'idle' && <p className="max-w-sm text-sm text-white/70">
                    Starting playback uses your ticket. After that it can no longer be refunded.
                </p>}
                {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
            </div>}
        </div>
        <p className="text-xs text-white/50">This video shows your ticket code {code}, so a copied recording can be traced to the ticket.</p>
    </div>;
}
