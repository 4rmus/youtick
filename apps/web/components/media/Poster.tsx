import { cn } from '@/lib/utils';
import { posterTone } from './poster-tone';

type PosterProps = {
    publicationId: string;
    title: string;
    size?: 'card' | 'stage';
    className?: string;
};

/** Typographic poster used when a publication has no usable cover. */
export function Poster({ publicationId, title, size = 'card', className }: PosterProps) {
    const tone = posterTone(publicationId);
    return (
        <span
            data-tone={tone}
            aria-hidden="true"
            className={cn(
                'flex aspect-video w-full flex-col justify-between overflow-hidden',
                size === 'stage' ? 'p-6 sm:p-10' : 'p-3',
                tone === 'dark' ? 'border border-line bg-poster-dark text-light' : 'bg-light text-ink',
                className,
            )}
        >
            <span className={cn('font-logo', size === 'stage' ? 'text-xs' : 'text-[9px]', tone === 'dark' && 'text-light-3')}>YOUTICK</span>
            <span
                className={cn(
                    'font-display line-clamp-3 break-words',
                    size === 'stage' ? 'text-5xl sm:text-8xl' : 'text-3xl',
                    'leading-[0.86]',
                )}
            >
                {title}
            </span>
        </span>
    );
}
