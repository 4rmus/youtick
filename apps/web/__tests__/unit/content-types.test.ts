import { describe, expect, it } from 'vitest';

import { getContentTypeLabel, normalizeContentTypeKey } from '@/lib/content-types';

const labels = {
    cinema: 'Film',
    concert: 'Konser Kaydı',
    documentary: 'Belgesel',
    short_film: 'Kısa Film',
    festival_selection: 'Festival Seçkisi',
    exclusive: 'Özel İçerik',
    live_event: 'Canlı Etkinlik',
};

describe('content type labels', () => {
    it('normalizes contract enum values to translation keys', () => {
        expect(normalizeContentTypeKey('Cinema')).toBe('cinema');
        expect(normalizeContentTypeKey('ShortFilm')).toBe('short_film');
        expect(normalizeContentTypeKey('FestivalSelection')).toBe('festival_selection');
    });

    it('returns translated labels instead of raw technical values', () => {
        expect(getContentTypeLabel(labels, 'Concert')).toBe('Konser Kaydı');
        expect(getContentTypeLabel(labels, 'FestivalSelection')).toBe('Festival Seçkisi');
    });
});
