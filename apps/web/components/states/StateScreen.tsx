import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type StateScreenProps = {
    glyph: string;
    title: string;
    body?: string;
    /** What stays safe, in one sentence. */
    safe?: string;
    tone?: 'neutral' | 'alert';
    actions?: ReactNode;
    className?: string;
};

/** Full-width system state: a glyph, a condensed title, what happened and what is safe. */
export function StateScreen({ glyph, title, body, safe, tone = 'neutral', actions, className }: StateScreenProps) {
    return (
        <section
            role={tone === 'alert' ? 'alert' : 'status'}
            className={cn('mx-auto flex w-full max-w-2xl flex-col items-start gap-5 py-10 sm:py-16', className)}
        >
            <span
                aria-hidden="true"
                className={cn(
                    'tabular flex h-14 w-14 items-center justify-center border-2 text-3xl',
                    tone === 'alert' ? 'border-alert text-alert' : 'border-line-strong text-light-2',
                )}
            >
                {glyph}
            </span>
            <h1 className="font-display text-5xl text-light sm:text-7xl">{title}</h1>
            {body && <p className="max-w-xl text-base leading-relaxed text-light-2 sm:text-lg">{body}</p>}
            {safe && <p className="text-sm text-light-3">{safe}</p>}
            {actions && <div className="mt-2 flex flex-wrap gap-3">{actions}</div>}
        </section>
    );
}
