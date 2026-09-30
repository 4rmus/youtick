'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Sun } from 'lucide-react';
import { StatusLine } from '@/components/ui/status-line';
import type { LivepeerPlaybackInput } from '@/lib/livepeer-playback';
import type { Locale } from '@/lib/i18n/locale';
import { messages } from '@/lib/i18n/messages';

// The player bundle (Livepeer SDK, HLS) loads only when a ticket holder enters the room.
const LivepeerPlayer = dynamic(() => import('@/components/LivepeerPlayer').then((module) => module.LivepeerPlayer), {
    ssr: false,
    loading: () => <PlayerLoading />,
});

function PlayerLoading() {
    return <div className="flex aspect-video items-center justify-center bg-black"><StatusLine tone="progress">…</StatusLine></div>;
}

type SalonViewProps = {
    open: boolean;
    locale: Locale;
    input: LivepeerPlaybackInput;
    title: string;
    poster?: string;
    onClose(): void;
};

/**
 * "Lights down": a full-screen native modal on the same address. The browser keeps the page behind
 * it inert, traps focus, closes on Escape and returns focus to the button that opened it.
 */
export function SalonView({ open, locale, input, title, poster, onClose }: SalonViewProps) {
    const ref = React.useRef<HTMLDialogElement>(null);
    const t = messages[locale].salon;
    const openRef = React.useRef(open);

    React.useEffect(() => {
        openRef.current = open;
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog
            ref={ref}
            aria-label={t.roomLabel(title)}
            onClose={() => { if (openRef.current) onClose(); }}
            className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-light opacity-0 backdrop:bg-black open:opacity-100 motion-safe:transition-opacity motion-safe:duration-[400ms]"
        >
            <div className="flex h-full flex-col">
                <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-8">
                    <p className="font-display truncate text-2xl md:text-3xl">{title}</p>
                    <button
                        type="button"
                        autoFocus
                        onClick={onClose}
                        className="flex min-h-11 shrink-0 items-center gap-2 rounded-xs border border-light/30 px-4 text-sm font-semibold hover:border-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice"
                    >
                        <Sun aria-hidden="true" className="h-4 w-4" />
                        {t.lightsOn}
                    </button>
                </div>
                <div className="flex flex-1 items-center justify-center px-0 pb-4 md:px-8">
                    {open && (
                        <div className="w-full max-w-[min(100%,calc((100dvh-7rem)*16/9))]">
                            <LivepeerPlayer {...input} title={title} poster={poster} />
                        </div>
                    )}
                </div>
            </div>
        </dialog>
    );
}
