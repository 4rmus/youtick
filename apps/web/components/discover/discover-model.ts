import type { LivepeerPublication } from '@/lib/livepeer-publication';

export type DiscoverSort = 'newest' | 'price';

export const FEATURED_COUNT = 4;
export const FEATURED_INTERVAL_MS = 7_000;

function newestFirst(a: LivepeerPublication, b: LivepeerPublication): number {
    return b.published_at_ms - a.published_at_ms || a.publication_id.localeCompare(b.publication_id);
}

/** The newest screenings with open sales among what is already loaded. */
export function featuredPublications(publications: readonly LivepeerPublication[]): LivepeerPublication[] {
    return publications.filter((publication) => publication.availability === 'ACTIVE').sort(newestFirst).slice(0, FEATURED_COUNT);
}

/** Client-side sort of the loaded pages; price is ascending, ties fall back to newest. */
export function sortPublications(publications: readonly LivepeerPublication[], sort: DiscoverSort): LivepeerPublication[] {
    const sorted = [...publications];
    if (sort === 'newest') return sorted.sort(newestFirst);
    return sorted.sort((a, b) => {
        const difference = BigInt(a.price_usdc) - BigInt(b.price_usdc);
        return difference < 0n ? -1 : difference > 0n ? 1 : newestFirst(a, b);
    });
}

/** Case- and accent-insensitive, including the Turkish dotted and dotless i. */
export function searchKey(value: string): string {
    return value.replace(/[İIı]/g, 'i').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export function filterPublications(publications: readonly LivepeerPublication[], query: string): LivepeerPublication[] {
    const needle = searchKey(query);
    if (!needle) return [...publications];
    return publications.filter((publication) => searchKey(publication.title).includes(needle)
        || searchKey(publication.creator_id).includes(needle));
}

export function shouldRotate(input: { count: number; reducedMotion: boolean; focused: boolean; hidden: boolean }): boolean {
    return input.count > 1 && !input.reducedMotion && !input.focused && !input.hidden;
}

export function formatPublishedDate(publishedAtMs: number, locale: string): string {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(publishedAtMs);
}
