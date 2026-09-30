import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
    default: (props: Record<string, unknown>) => React.createElement('img', { src: String(props.src), alt: String(props.alt) }),
}));

import { posterTone } from '@/components/media/poster-tone';
import { Poster } from '@/components/media/Poster';
import { CoverImage } from '@/components/media/CoverImage';

describe('poster tone', () => {
    it('is deterministic for a publication id', () => {
        for (const id of ['job-001', 'pub_7f3a', '', 'çğıöşü']) {
            expect(posterTone(id)).toBe(posterTone(id));
        }
    });

    it('is pinned to FNV-1a so every runtime picks the same poster', () => {
        expect(posterTone('')).toBe('light');
        expect(posterTone('a')).toBe('dark');
        expect(posterTone('job-001')).toBe('dark');
    });

    it('uses both tones across publications', () => {
        const tones = new Set(Array.from({ length: 32 }, (_, index) => posterTone(`job-${index}`)));
        expect(tones).toEqual(new Set(['dark', 'light']));
    });
});

describe('poster and cover rendering', () => {
    it('renders the typographic poster with the derived tone', () => {
        const markup = renderToStaticMarkup(React.createElement(Poster, { publicationId: 'job-001', title: 'Winter Concert' }));
        expect(markup).toContain(`data-tone="${posterTone('job-001')}"`);
        expect(markup).toContain('Winter Concert');
        expect(markup).toContain('YOUTICK');
    });

    it('shows the cover when there is one and the poster when there is none', () => {
        const withCover = renderToStaticMarkup(React.createElement(CoverImage, { publicationId: 'job-001', title: 'T', src: 'https://bridge.test/c.jpg' }));
        expect(withCover).toContain('src="https://bridge.test/c.jpg"');
        expect(withCover).not.toContain('data-tone');
        const withoutCover = renderToStaticMarkup(React.createElement(CoverImage, { publicationId: 'job-001', title: 'T', src: null }));
        expect(withoutCover).toContain('data-tone');
        expect(withoutCover).not.toContain('<img');
    });
});
