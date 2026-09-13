'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as Player from '@livepeer/react/player';
import type Hls from 'hls.js';
import { Loader2 } from 'lucide-react';
import { LivepeerPlayerControls } from './LivepeerPlayerControls';
import { createLivepeerHlsConfig, type LivepeerPlaybackInput } from '@/lib/livepeer-playback';
import { qualityController, type PlayerQuality } from '@/lib/livepeer-player-media';
import { playerCopy, playerTime, type PlayerLanguage } from '@/lib/player-copy';
import { openWatchProgress, type WatchPosition } from '@/lib/watch-progress';
import { onDeviceSessionCleared } from '@/lib/device-session';

export type PlaybackRecovery = { position: number; rate: number; playing: boolean };

export function LivepeerPlayerSurface({ input, title, poster, language, mode, token, tokenRef, recoveryRef, retry, previewVttUrl }: {
    input: LivepeerPlaybackInput; title: string; poster?: string; language: PlayerLanguage;
    mode: 'hls' | 'native'; token: string; tokenRef: RefObject<string | null>;
    recoveryRef: RefObject<PlaybackRecovery | null>; retry: () => void;
    previewVttUrl?: string;
}) {
    const { store } = Player.useMediaContext('YouTickVideo', undefined);
    const durationReady = Player.useStore(store, state => Number.isFinite(state.duration) && state.duration > 0);
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const mounted = useRef(false);
    const renewing = useRef(false);
    const nativeToken = useRef(token);
    const [qualities, setQualities] = useState<PlayerQuality[]>([]);
    const [quality, setQuality] = useState(-1);
    const [resume, setResume] = useState<WatchPosition | null>(null);
    const [jump, setJump] = useState<number | null>(null);
    const tap = useRef<{ time: number; side: number } | null>(null);
    const pointerType = useRef('mouse');
    const recorder = useRef<Awaited<ReturnType<typeof openWatchProgress>>>(null);
    const copy = playerCopy[language];
    /* eslint-disable react-hooks/refs -- These factories retain callbacks for network/media events; none execute during render. */
    const config = useMemo(() => ({
        ...createLivepeerHlsConfig(() => tokenRef.current, input.playbackId),
        abrController: qualityController((instance, options) => {
            // Let the SDK and HLS finish their own level-list update before selecting Auto.
            queueMicrotask(() => {
                if (!mounted.current || instance.media !== videoRef.current) return;
                hlsRef.current = instance;
                setQualities(options);
                instance.loadLevel = -1;
                setQuality(-1);
            });
        }, instance => {
            if (hlsRef.current === instance) {
                hlsRef.current = null;
                if (mounted.current) { setQualities([]); setQuality(-1); }
            }
        }),
    }), [input.playbackId, tokenRef]);
    /* eslint-enable react-hooks/refs */

    useLayoutEffect(() => {
        mounted.current = true;
        if (mode !== 'native') return () => { mounted.current = false; };
        // Native HLS needs a JWT URL. Keep local SDK metrics, but never report that URL externally.
        const functions = store.getState().__controlsFunctions;
        store.setState({ currentUrl: null, metricsReportingUrl: null, __controlsFunctions: {
            ...functions, onFinalUrl: () => {}, setMetricsReportingUrl: () => {},
        } });
        return () => {
            mounted.current = false;
            store.setState({ __controlsFunctions: functions });
        };
    }, [mode, store]);

    useEffect(() => {
        const video = videoRef.current!;
        const controller = new AbortController();
        const savedRecovery = recoveryRef.current;
        let restoring = Boolean(savedRecovery);
        let invalidated = false;
        const stop = onDeviceSessionCleared(() => {
            invalidated = true;
            recoveryRef.current = null;
            controller.abort();
        });
        void openWatchProgress(input, controller.signal).then(progress => {
            if (controller.signal.aborted) { progress?.destroy(); return; }
            recorder.current = progress;
            if (!savedRecovery && video.played.length === 0 && video.paused && video.currentTime === 0) setResume(progress?.position ?? null);
        });
        const snapshot = (force = false) => {
            if (invalidated || restoring || renewing.current || video.readyState < 2 || !Number.isFinite(video.duration)) return;
            if (video.played.length === 0 && video.currentTime === 0) return;
            recoveryRef.current = { position: video.currentTime, rate: video.playbackRate, playing: !video.paused };
            void recorder.current?.save(video.currentTime, video.duration, force);
        };
        const update = () => snapshot();
        const flush = () => snapshot(true);
        const restore = () => {
            const saved = savedRecovery;
            if (invalidated) return;
            if (!saved) { video.removeEventListener('canplay', restore); return; }
            video.playbackRate = saved.rate;
            store.getState().__controlsFunctions.setPlaybackRate(saved.rate);
            store.getState().__controlsFunctions.requestSeek(Math.min(saved.position, Math.max(0, video.duration - 0.1)));
            restoring = false;
            if (saved.playing) void video.play().catch(() => {});
            video.removeEventListener('canplay', restore);
        };
        video.addEventListener('canplay', restore);
        video.addEventListener('timeupdate', update);
        video.addEventListener('pause', flush);
        video.addEventListener('ended', flush);
        window.addEventListener('pagehide', flush);
        return () => {
            if (!invalidated && !restoring && !renewing.current && video.readyState >= 2 && (video.played.length > 0 || video.currentTime > 0)) recoveryRef.current = { position: video.currentTime, rate: video.playbackRate, playing: !video.paused };
            controller.abort();
            stop();
            recorder.current?.destroy();
            recorder.current = null;
            video.removeEventListener('canplay', restore);
            video.removeEventListener('timeupdate', update);
            video.removeEventListener('pause', flush);
            video.removeEventListener('ended', flush);
            window.removeEventListener('pagehide', flush);
        };
    }, [input, recoveryRef, store]);

    useEffect(() => {
        if (mode !== 'native' || nativeToken.current === token) return;
        nativeToken.current = token;
        const video = videoRef.current!;
        const saved = renewing.current && recoveryRef.current ? recoveryRef.current
            : { position: video.currentTime, rate: video.playbackRate, playing: !video.paused };
        recoveryRef.current = saved;
        renewing.current = true;
        let active = true;
        const restore = () => {
            if (!active || !video.currentSrc.includes(`jwt=${encodeURIComponent(token)}`)) return;
            renewing.current = false;
            video.playbackRate = saved.rate;
            store.getState().__controlsFunctions.setPlaybackRate(saved.rate);
            if (saved.playing) void video.play().catch(() => {});
            video.removeEventListener('canplay', restore);
        };
        video.addEventListener('canplay', restore);
        store.setState(state => ({ progress: saved.position, __initialProps: { ...state.__initialProps, jwt: token } }));
        // Reparse the original clean source using the new JWT; SDK restores progress on the same video.
        store.getState().__controlsFunctions.setVideoQuality('auto');
        return () => { active = false; video.removeEventListener('canplay', restore); };
    }, [mode, recoveryRef, store, token]);

    useEffect(() => {
        if (jump === null) return;
        const timeout = setTimeout(() => setJump(null), 650);
        return () => clearTimeout(timeout);
    }, [jump]);

    const chooseResume = (position: number) => {
        const video = videoRef.current!;
        setResume(null);
        store.getState().__controlsFunctions.requestSeek(Math.min(position, Math.max(0, video.duration - 0.1)));
        void recorder.current?.save(position, video.duration, true);
        void video.play().catch(() => {});
    };

    return <Player.Container lang={language} className="relative overflow-hidden rounded-lg bg-black text-white">
        <Player.Video ref={videoRef} title={title} poster={poster ?? null} hlsConfig={config} className="h-full w-full"
            onPlay={() => setResume(null)}
            onPointerDown={event => { pointerType.current = event.pointerType; }}
            onClick={() => { if (pointerType.current === 'mouse') store.getState().__controlsFunctions.togglePlay(); }}
            onPointerUp={event => {
                store.getState().__controlsFunctions.updateLastInteraction();
                if (event.pointerType === 'mouse') return;
                const rect = event.currentTarget.getBoundingClientRect();
                const side = event.clientX - rect.left < rect.width / 2 ? -1 : 1;
                const now = performance.now();
                if (tap.current?.side === side && now - tap.current.time < 300) {
                    const controls = store.getState().__controlsFunctions;
                    if (side < 0) controls.requestSeekBack(10_000); else controls.requestSeekForward(10_000);
                    setJump(side); tap.current = null;
                } else tap.current = { time: now, side };
            }} />
        <Player.LoadingIndicator role="status" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 bg-black/50 text-sm">
            <Loader2 className="motion-safe:animate-spin" aria-hidden="true" size={20} />{copy.loading}
        </Player.LoadingIndicator>
        {jump !== null && <div role="status" className={`pointer-events-none absolute top-1/3 rounded-full bg-black/75 px-4 py-3 text-sm ${jump < 0 ? 'left-4' : 'right-4'}`}>{jump < 0 ? copy.back : copy.forward}</div>}
        {resume && <div data-state="open" className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80 p-4">
            <button disabled={!durationReady} className="min-h-11 rounded-md bg-near-green px-4 text-sm font-medium text-black hover:bg-near-green/90 active:bg-near-green/80 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => chooseResume(resume.position)}>{copy.resume} {playerTime(resume.position)}</button>
            <button disabled={!durationReady} className="min-h-11 rounded-md px-4 text-sm text-white hover:bg-white/15 active:bg-white/25 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-near-green" onClick={() => chooseResume(0)}>{copy.restart}</button>
        </div>}
        <LivepeerPlayerControls language={language} qualities={qualities} quality={quality} token={token} previewVttUrl={previewVttUrl} onQuality={index => {
            const hls = hlsRef.current;
            if (!hls || (index !== -1 && !qualities.some(item => item.index === index))) return;
            if (index === -1) hls.loadLevel = -1;
            else hls.nextLevel = index;
            setQuality(index);
        }} />
        <Player.ErrorIndicator matcher="all" role="alert" className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/85 p-5 text-center">
            <p className="text-sm">{copy.unavailable}</p>
            <button className="min-h-11 rounded-md border border-white/30 px-4 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-near-green" onClick={retry}>{copy.retry}</button>
        </Player.ErrorIndicator>
    </Player.Container>;
}
