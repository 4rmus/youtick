import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider, useLanguage } from '@/components/providers/LanguageContext';

function LanguageProbe() {
    return React.createElement('span', null, useLanguage().language);
}

describe('LanguageProvider', () => {
    beforeEach(() => localStorage.clear());

    it('keeps the initial client render aligned with the English server snapshot', () => {
        localStorage.setItem('language', 'tr');

        const markup = renderToString(
            React.createElement(LanguageProvider, null, React.createElement(LanguageProbe)),
        );

        expect(markup).toContain('>en<');
    });
});
