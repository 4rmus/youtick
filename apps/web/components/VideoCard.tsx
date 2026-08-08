import Link from 'next/link';
import Image from 'next/image';
import { Play } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
    formatUsdc,
    livepeerPublicationCoverUrl,
    type LivepeerPublication,
} from '@/lib/livepeer-publication';

export function VideoCard({ publication }: { publication: LivepeerPublication }) {
    const coverUrl = livepeerPublicationCoverUrl(publication);
    return (
        <Link href={`/watch?job=${encodeURIComponent(publication.publication_id)}`} className="group rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
            <Card className="overflow-hidden transition hover:-translate-y-1 hover:border-emerald-400/40">
                <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br from-zinc-800 to-zinc-950">
                    {coverUrl && (
                        <Image
                            fill
                            unoptimized
                            src={coverUrl}
                            alt=""
                            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                            className="object-cover"
                            onError={(event) => { event.currentTarget.hidden = true; }}
                        />
                    )}
                    <span aria-hidden="true" className="absolute inset-0 bg-black/20" />
                    <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/50">
                        <Play className="h-6 w-6 fill-current" />
                    </span>
                </div>
                <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                        <h2 className="font-semibold group-hover:text-emerald-300">{publication.title}</h2>
                        <span className="shrink-0 text-xs font-bold">{formatUsdc(publication.price_usdc)} USDC</span>
                    </div>
                    <p className="mt-3 truncate text-xs text-zinc-400">{publication.creator_id}</p>
                </div>
            </Card>
        </Link>
    );
}
