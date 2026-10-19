// The opening programme on the landing. Empty until the owner confirms names and works; while it is
// empty the section and its navigation link are not rendered at all. An entry without a work lists
// only the artist ("opening artists"); once every entry has a work the section becomes the programme.

export const OPENING_WORK_TYPES = ['concert', 'film', 'documentary', 'festival', 'special'] as const;
export type OpeningWorkType = (typeof OPENING_WORK_TYPES)[number];

export type OpeningProgrammeEntry = {
    artist: string;
    work?: {
        title: string;
        type: OpeningWorkType;
        /** One line approved by the artist. */
        note?: { en: string; tr: string };
        /** The screening page, only once it is live. */
        href?: string;
    };
};

export const OPENING_PROGRAMME: readonly OpeningProgrammeEntry[] = [];

export type OpeningProgrammeMode = 'hidden' | 'artists' | 'programme';

export function openingProgrammeMode(entries: readonly OpeningProgrammeEntry[] = OPENING_PROGRAMME): OpeningProgrammeMode {
    if (entries.length === 0) return 'hidden';
    return entries.every((entry) => entry.work) ? 'programme' : 'artists';
}
