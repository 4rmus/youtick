'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import * as Player from '@livepeer/react/player';
import { Maximize, Minimize, Pause, PictureInPicture2, Play, Settings, Volume2, VolumeX } from 'lucide-react';
import { playerCopy, playerTime, setPlayerLanguage, type PlayerLanguage } from '@/lib/player-copy';
import type { PlayerQuality } from '@/lib/livepeer-player-media';
import { LivepeerSeekPreview } from './LivepeerSeekPreview';

const control = 'inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-white hover:bg-white/15 active:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-near-green disabled:cursor-not-allowed disabled:opacity-50';
const select = 'h-11 min-w-0 rounded-md border border-white/25 bg-zinc-900 px-2 text-white focus-visible:outline-2 focus-visible:outline-near-green disabled:cursor-not-allowed disabled:opacity-50';

export function LivepeerPlayerControls({ language, qualities, quality, onQuality, token, previewVttUrl }: {
    language: PlayerLanguage; qualities: PlayerQuality[]; quality: number; onQuality: (index: number) => void;
    token: string; previewVttUrl?: string;
}) {
    const { store } = Player.useMediaContext('YouTickControls', undefined);
    const playing = Player.useStore(store, state => state.playing);
    const muted = Player.useStore(store, state => state.__controls.muted);
    const fullscreen = Player.useStore(store, state => state.fullscreen);
    const progress = Player.useStore(store, state => state.progress);
    const duration = Player.useStore(store, state => state.duration);
    const rate = Player.useStore(store, state => state.playbackRate);
    const [open, setOpen] = useState(false);
    const [pointerPreview, setPointerPreview] = useState<{ time: number; ratio: number } | null>(null);
    const [keyboardPreview, setKeyboardPreview] = useState(false);
    const dragging = useRef(false);
    const menu = useRef<HTMLDetailsElement>(null);
    const copy = playerCopy[language];
    const preview = keyboardPreview && Number.isFinite(duration) && duration > 0
        ? { time: progress, ratio: progress / duration } : pointerPreview;
    const hover = (event: ReactPointerEvent<HTMLDivElement>) => {
        if ((!dragging.current && event.pointerType !== 'mouse') || !Number.isFinite(duration) || duration <= 0) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (!box.width) return;
        const ratio = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
        setKeyboardPreview(false);
        setPointerPreview({ time: duration * ratio, ratio });
    };
    useEffect(() => {
        if (!open) return;
        const close = (event: PointerEvent) => {
            if (!menu.current?.contains(event.target as Node)) menu.current?.removeAttribute('open');
        };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, [open]);

    return (
        <Player.Controls
            forceMount={open || preview !== null || undefined}
            className="pointer-events-none z-20 flex flex-col justify-end text-white"
        >
            <div data-player-interactive="" className="pointer-events-auto bg-gradient-to-t from-black/95 via-black/80 to-transparent px-2 pb-1 pt-5 sm:px-3 sm:pb-2"
                onClick={event => event.stopPropagation()} onKeyUpCapture={event => event.stopPropagation()}>
            <div className="relative" onPointerMove={hover}
                onPointerDown={event => { dragging.current = true; hover(event); }}
                onPointerUp={event => { dragging.current = false; if (event.pointerType !== 'mouse') setPointerPreview(null); }}
                onPointerCancel={() => { dragging.current = false; setPointerPreview(null); }}
                onPointerLeave={() => { if (!dragging.current) setPointerPreview(null); }}
                onKeyDownCapture={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) { setPointerPreview(null); setKeyboardPreview(true); } }}
                onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setKeyboardPreview(false); }}>
            {preview && <LivepeerSeekPreview key={previewVttUrl ?? 'time'} time={preview.time} ratio={preview.ratio} token={token} vttUrl={previewVttUrl} />}
            <Player.Seek aria-label={copy.seek} className="relative flex h-8 w-full touch-none select-none items-center focus-visible:outline-2 focus-visible:outline-near-green">
                <Player.Track className="relative h-1 grow rounded-full bg-white/30">
                    <Player.SeekBuffer className="absolute h-full rounded-full bg-white/35" />
                    <Player.Range className="absolute h-full rounded-full bg-near-green" />
                </Player.Track>
                <Player.Thumb className="block h-3 w-3 rounded-full bg-near-green" />
            </Player.Seek>
            </div>
            <div className="flex min-w-0 items-center gap-1">
                <Player.PlayPauseTrigger className={control} aria-label={playing ? copy.pause : copy.play} title={playing ? copy.pause : copy.play}>
                    {playing ? <Pause aria-hidden="true" size={20} /> : <Play aria-hidden="true" size={20} />}
                </Player.PlayPauseTrigger>
                <div className="hidden items-center sm:flex">
                    <Player.MuteTrigger className={control} aria-label={muted ? copy.unmute : copy.mute} title={muted ? copy.unmute : copy.mute}>
                        {muted ? <VolumeX aria-hidden="true" size={20} /> : <Volume2 aria-hidden="true" size={20} />}
                    </Player.MuteTrigger>
                    <Player.Volume aria-label={copy.volume} className="relative flex h-11 w-16 touch-none items-center focus-visible:outline-2 focus-visible:outline-near-green">
                        <Player.Track className="relative h-1 grow rounded-full bg-white/30"><Player.Range className="absolute h-full rounded-full bg-white" /></Player.Track>
                        <Player.Thumb className="block h-3 w-3 rounded-full bg-white" />
                    </Player.Volume>
                </div>
                <span className="min-w-0 flex-1 whitespace-nowrap px-1 text-[11px] tabular-nums sm:text-xs">{playerTime(progress)} / {playerTime(duration)}</span>
                <details ref={menu} data-state={open ? 'open' : 'closed'} onToggle={event => setOpen(event.currentTarget.open)}
                    onKeyDown={event => {
                        if (event.key === 'Escape') {
                            event.currentTarget.removeAttribute('open');
                            event.currentTarget.querySelector('summary')?.focus();
                            event.stopPropagation();
                        }
                    }}>
                    <summary className={`${control} cursor-pointer list-none [&::-webkit-details-marker]:hidden`} aria-label={copy.settings} title={copy.settings}>
                        <Settings aria-hidden="true" size={20} />
                    </summary>
                    <div role="group" aria-label={copy.settings} style={{ maxHeight: 'calc(100% - 64px)' }} className="absolute bottom-14 right-2 grid w-60 max-w-[calc(100%-1rem)] gap-2 overflow-y-auto rounded-lg border border-white/20 bg-zinc-950 p-3 text-sm shadow-xl">
                        <label className="grid grid-cols-[1fr_8rem] items-center gap-2">{copy.speed}
                            <select aria-label={copy.speed} className={select} value={rate} onChange={event => store.getState().__controlsFunctions.setPlaybackRate(Number(event.target.value))}>
                                {[0.75, 1, 1.25, 1.5, 2].map(value => <option key={value} value={value}>{value.toLocaleString(language)}×</option>)}
                            </select>
                        </label>
                        <label className="grid grid-cols-[1fr_8rem] items-center gap-2">{copy.quality}
                            <select aria-label={copy.quality} className={select} value={quality} disabled={!qualities.length} onChange={event => onQuality(Number(event.target.value))}>
                                <option value={-1}>{copy.auto}</option>
                                {qualities.map(item => <option key={item.index} value={item.index}>{item.label}</option>)}
                            </select>
                        </label>
                        <label className="grid grid-cols-[1fr_8rem] items-center gap-2">{copy.language}
                            <select aria-label={copy.language} className={select} value={language} onChange={event => setPlayerLanguage(event.target.value as PlayerLanguage)}>
                                <option value="tr">Türkçe</option><option value="en">English</option>
                            </select>
                        </label>
                        <div className="flex items-center gap-2 border-t border-white/15 pt-2">
                            <Player.MuteTrigger className={control} aria-label={muted ? copy.unmute : copy.mute} title={muted ? copy.unmute : copy.mute}>
                                {muted ? <VolumeX aria-hidden="true" size={20} /> : <Volume2 aria-hidden="true" size={20} />}
                            </Player.MuteTrigger>
                            <Player.Volume aria-label={copy.volume} className="relative flex h-11 flex-1 touch-none items-center">
                                <Player.Track className="relative h-1 grow rounded-full bg-white/30"><Player.Range className="absolute h-full rounded-full bg-white" /></Player.Track>
                                <Player.Thumb className="block h-3 w-3 rounded-full bg-white" />
                            </Player.Volume>
                            <Player.PictureInPictureTrigger className={control} aria-label={copy.pip} title={copy.pip}><PictureInPicture2 aria-hidden="true" size={20} /></Player.PictureInPictureTrigger>
                        </div>
                    </div>
                </details>
                <Player.FullscreenTrigger className={control} aria-label={fullscreen ? copy.exitFullscreen : copy.fullscreen} title={fullscreen ? copy.exitFullscreen : copy.fullscreen}>
                    {fullscreen ? <Minimize aria-hidden="true" size={20} /> : <Maximize aria-hidden="true" size={20} />}
                </Player.FullscreenTrigger>
            </div>
            </div>
        </Player.Controls>
    );
}
