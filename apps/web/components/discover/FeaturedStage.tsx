'use client';

import React from 'react';
import Link from 'next/link';
import { CoverImage } from '@/components/media/CoverImage';
import { Button } from '@/components/ui/button';
import { FEATURE_FLAGS } from '@/lib/constants';
import { useLocale, useMessages } from '@/lib/i18n/I18nProvider';
import { formatUsdc, livepeerPublicationCoverUrl, type LivepeerPublication } from '@/lib/livepeer-publication';
import { cn } from '@/lib/utils';
import { FEATURED_INTERVAL_MS, formatPublishedDate, shouldRotate } from './discover-model';

const subscribeReducedMotion = (notify: () => void) => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    query.addEventListener('change', notify);
    return () => query.removeEventListener('change', notify);
};
const subscribeVisibility = (notify: () => void) => {
    document.addEventListener('visibilitychange', notify);
    return () => document.removeEventListener('visibilitychange', notify);
};
const pad = (value: number) => String(value).padStart(2, '0');

/** Rotates through the newest screenings; stops for reduced motion, keyboard/pointer focus and hidden tabs. */
export function FeaturedStage({ publications }: { publications: readonly LivepeerPublication[] }) {
    const t = useMessages().discover;
    const locale = useLocale();
    const [index, setIndex] = React.useState(0);
    const [focused, setFocused] = React.useState(false);
    const reducedMotion = React.useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, () => true);
    const hidden = React.useSyncExternalStore(subscribeVisibility, () => document.visibilityState === 'hidden', () => true);
    const rotating = shouldRotate({ count: publications.length, reducedMotion, focused, hidden });
    const current = publications[Math.min(index, publications.length - 1)];

    React.useEffect(() => {
        if (!rotating) return;
        const timer = setInterval(() => setIndex((value) => (value + 1) % publications.length), FEATURED_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [rotating, publications.length]);

    if (!current) return null;
    const href = `/s/${encodeURIComponent(current.publication_id)}`;
    const coverUrl = livepeerPublicationCoverUrl(current);

    return (
        <section
            aria-roledescription="carousel"
            aria-label={t.featuredGroup}
            onFocusCapture={() => setFocused(true)}
            onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
            onPointerEnter={() => setFocused(true)}
            onPointerLeave={() => setFocused(false)}
            className="relative isolate flex min-h-[70vh] items-end overflow-hidden border-b border-line md:min-h-[640px]"
        >
            <div className="absolute inset-0 -z-10 bg-panel">
                {/* Without a cover the stage stays dark; the title below already carries the poster role. */}
                {coverUrl && <CoverImage
                    key={current.publication_id}
                    publicationId={current.publication_id}
                    title={current.title}
                    src={coverUrl}
                    size="stage"
                    priority
                    sizes="100vw"
                    className="h-full"
                />}
                <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/10" />
            </div>
            <div className="container mx-auto flex w-full flex-col gap-8 px-4 pb-10 pt-32 md:flex-row md:items-end md:justify-between md:pb-16">
                <div className="flex max-w-4xl flex-col gap-4 md:gap-5" aria-live="off">
                    <p className="label-caps text-ice">{t.featured} · {pad(index + 1)} / {pad(publications.length)}</p>
                    <h2 className="font-display break-words text-6xl leading-[0.86] sm:text-8xl lg:text-[150px]">{current.title}</h2>
                    <p className="text-base text-light-2 sm:text-lg">
                        <span className="font-bold text-light">{current.creator_id}</span> · {formatPublishedDate(current.published_at_ms, locale)}
                    </p>
                    {FEATURE_FLAGS.enablePaidMediaLivepeerV1 && (
                        <div className="flex flex-wrap gap-3">
                            <Button asChild size="lg"><Link href={href}>{t.buyTicket(formatUsdc(current.price_usdc))}</Link></Button>
                            <Button asChild size="lg" variant="outline"><Link href={href}>{t.details}</Link></Button>
                        </div>
                    )}
                </div>
                {publications.length > 1 && (
                    <div role="group" aria-label={t.featuredGroup} className="grid grid-cols-4 gap-2.5 md:w-[520px]">
                        {publications.map((publication, position) => (
                            <button
                                key={publication.publication_id}
                                type="button"
                                aria-label={t.showFeatured(publication.title)}
                                aria-pressed={position === index}
                                onClick={() => setIndex(position)}
                                className={cn(
                                    'flex min-h-11 flex-col gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice',
                                    position === index ? 'opacity-100' : 'opacity-60 hover:opacity-100',
                                )}
                            >
                                <span className="h-[3px] w-full bg-light/25">
                                    <span className={cn('block h-[3px] bg-light', position === index ? 'w-full' : 'w-0')} />
                                </span>
                                <span className="font-display hidden text-base leading-none md:line-clamp-2">{publication.title}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
