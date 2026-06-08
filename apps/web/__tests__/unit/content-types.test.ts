import { describe, expect, it } from 'vitest';

import { getContentTypeLabel, normalizeContentTypeKey } from '@/lib/content-types';

const labels = {
    cinema: 'Film',
    concert: 'Concert Recording',
    documentary: 'Documentary',
    short_film: 'Short Film',
    festival_selection: 'Festival Selection',
    exclusive: 'Exclusive Content',
};

describe('content type labels', () => {
    it('normalizes contract enum values to translation keys', () => {
        expect(normalizeContentTypeKey('Cinema')).toBe('cinema');
        expect(normalizeContentTypeKey('ShortFilm')).toBe('short_film');
        expect(normalizeContentTypeKey('FestivalSelection')).toBe('festival_selection');
    });

    it('returns translated labels instead of raw technical values', () => {
        expect(getContentTypeLabel(labels, 'Concert')).toBe('Concert Recording');
        expect(getContentTypeLabel(labels, 'FestivalSelection')).toBe('Festival Selection');
    });
});
