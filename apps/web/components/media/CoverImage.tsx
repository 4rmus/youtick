'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Poster } from './Poster';

type CoverImageProps = {
    publicationId: string;
    title: string;
    src: string | null;
    size?: 'card' | 'stage';
    priority?: boolean;
    sizes?: string;
    className?: string;
};

/** Cover in a 16:9 frame; falls back to the typographic poster when there is no cover or it fails to load. */
export function CoverImage({ publicationId, title, src, size = 'card', priority = false, sizes = '(min-width: 768px) 33vw, 100vw', className }: CoverImageProps) {
    const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
    const usable = src && failedSrc !== src;
    return (
        <span className={cn('relative block aspect-video w-full overflow-hidden bg-raised', className)}>
            {usable ? (
                <Image
                    fill
                    unoptimized
                    priority={priority}
                    src={src}
                    alt=""
                    sizes={sizes}
                    className="object-cover"
                    onError={() => setFailedSrc(src)}
                />
            ) : (
                <Poster publicationId={publicationId} title={title} size={size} />
            )}
        </span>
    );
}
