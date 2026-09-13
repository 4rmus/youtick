'use client';

import { useEffect, useRef, useState } from 'react';
import { loadPreviewImage, loadPreviewVtt, type PreviewCue } from '@/lib/livepeer-previews';
import { playerTime } from '@/lib/player-copy';

type PreviewImage = { url: string; objectUrl: string; width: number; height: number };

export function LivepeerSeekPreview({ time, ratio, vttUrl, token }: { time: number; ratio: number; vttUrl?: string; token: string }) {
    const [cues, setCues] = useState<PreviewCue[]>([]);
    const [image, setImage] = useState<PreviewImage | null>(null);
    const cueCache = useRef<PreviewCue[] | null>(null);
    const imageCache = useRef<PreviewImage | null>(null);
    const cue = cues.find(item => time >= item.start && time < item.end)
        ?? (time === cues.at(-1)?.end ? cues.at(-1) : undefined);

    useEffect(() => {
        if (!vttUrl || cueCache.current) return;
        const controller = new AbortController();
        void loadPreviewVtt(vttUrl, token, controller.signal).then(result => {
            if (controller.signal.aborted) return;
            cueCache.current = result;
            setCues(result);
        }).catch(() => {}); // Optional previews never change playback/error state.
        return () => controller.abort();
    }, [vttUrl, token]);

    useEffect(() => {
        const url = cue?.url;
        if (!url || imageCache.current?.url === url) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            void loadPreviewImage(url, token, controller.signal).then(result => {
                if (controller.signal.aborted) return;
                const next = { url, objectUrl: URL.createObjectURL(result.blob), width: result.width, height: result.height };
                if (imageCache.current) URL.revokeObjectURL(imageCache.current.objectUrl);
                imageCache.current = next;
                setImage(next);
            }).catch(() => {});
        }, 120);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [cue?.url, token]);

    useEffect(() => () => {
        if (imageCache.current) URL.revokeObjectURL(imageCache.current.objectUrl);
        imageCache.current = null;
    }, []);

    const crop = cue?.crop ?? (image ? { x: 0, y: 0, width: image.width, height: image.height } : null);
    const visible = image && cue?.url === image.url && crop && crop.x + crop.width <= image.width && crop.y + crop.height <= image.height;
    const scale = crop ? Math.min(128 / crop.width, 72 / crop.height) : 1;
    return <div data-player-preview="" data-state="open" aria-hidden="true" className="pointer-events-none absolute bottom-full z-30 mb-1 -translate-x-1/2 overflow-hidden rounded-md border border-white/25 bg-black text-center text-xs text-white shadow-lg"
        style={{ left: `clamp(64px, ${Math.max(0, Math.min(1, ratio)) * 100}%, calc(100% - 64px))` }}>
        {visible && <div className="relative h-[72px] w-32 overflow-hidden">
            {/* Blob from a bounded, authenticated raster fetch; Next Image must not proxy protected media. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.objectUrl} alt="" draggable={false} className="absolute max-w-none" style={{ width: image.width * scale, height: image.height * scale,
                left: (128 - crop.width * scale) / 2 - crop.x * scale, top: (72 - crop.height * scale) / 2 - crop.y * scale }} />
        </div>}
        <div className="px-2 py-1 tabular-nums">{playerTime(time)}</div>
    </div>;
}
