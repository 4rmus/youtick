import Link from 'next/link';
import { CoverImage } from '@/components/media/CoverImage';
import { Chip } from '@/components/ui/chip';
import {
    formatUsdc,
    livepeerPublicationCoverUrl,
    type LivepeerPublication,
} from '@/lib/livepeer-publication';
import { FEATURE_FLAGS } from '@/lib/constants';
import type { Messages } from '@/lib/i18n/messages';

type VideoCardProps = {
    publication: LivepeerPublication;
    /** Card copy; the English dictionary keeps server and legacy callers working. */
    t?: Pick<Messages['discover'], 'salesPaused' | 'unavailable'>;
    meta?: string;
};

export function VideoCard({ publication, t = { salesPaused: 'Sales paused', unavailable: 'Unavailable' }, meta }: VideoCardProps) {
    const coverUrl = livepeerPublicationCoverUrl(publication);
    const open = publication.availability === 'ACTIVE';
    const card = (
        <>
            <span className="relative block border border-line">
                <CoverImage
                    publicationId={publication.publication_id}
                    title={publication.title}
                    src={coverUrl}
                    sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                />
                {!open && (
                    <Chip tone={publication.availability === 'TAKEDOWN' ? 'neutral' : 'paused'} className="absolute right-2.5 top-2.5">
                        {publication.availability === 'TAKEDOWN' ? t.unavailable : t.salesPaused}
                    </Chip>
                )}
            </span>
            <span className="flex items-baseline justify-between gap-3">
                <span className="font-display text-2xl leading-none group-hover:text-ice">{publication.title}</span>
                <span className={`tabular shrink-0 text-xl ${open ? 'text-light' : 'text-light-3'}`}>{formatUsdc(publication.price_usdc)} USDC</span>
            </span>
            <span className="truncate text-[13px] text-light-3">{meta ? `${publication.creator_id} · ${meta}` : publication.creator_id}</span>
        </>
    );
    const className = 'group flex min-w-0 flex-col gap-2.5 rounded-xs';
    return FEATURE_FLAGS.enablePaidMediaLivepeerV1 ? (
        <Link href={`/s/${encodeURIComponent(publication.publication_id)}`} className={`${className} focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ice`}>
            {card}
        </Link>
    ) : (
        <div className={className}>{card}</div>
    );
}
