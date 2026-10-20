import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FaqPage } from '@/components/faq/FaqPage';
import { faqCopy } from '@/components/faq/faq-copy';
import { formatDollars, revenueSplit } from '@/components/faq/revenue';
import { FORBIDDEN_IN_PUBLIC, FORBIDDEN_IN_TURKISH } from './public-copy-rules';

/** Rendered text plus link targets, without tags and class attributes. */
function render(locale: 'en' | 'tr'): string {
    const html = renderToStaticMarkup(React.createElement(FaqPage, { locale }));
    const hrefs = Array.from(html.matchAll(/ href="[^"]*"/g), (match) => match[0].trim());
    return `${html.replace(/ class="[^"]*"/g, '').replace(/<[^>]+>/g, ' ')}\n${hrefs.join(' ')}`;
}

describe('FAQ', () => {
    it('carries the ticket, refund, playback and artist detail that left the landing (English)', () => {
        const english = render('en');
        for (const value of [
            'up to three devices at a time', 'cannot be resold, lent or transferred',
            'cancel within 14 days of purchase', 'refunds cover technical problems', 'your statutory rights are not affected',
            'Livepeer processes, stores and delivers', 'recorded on the NEAR blockchain', 'Screen recording cannot be blocked',
            'a 5% youtick fee on the price before VAT', 'paid out monthly', 'our card payment provider',
            'href="/terms"', 'href="/refund-policy"', 'href="/apply"', 'href="/report"', 'href="/"',
        ]) expect(english).toContain(value);
        expect(faqCopy.en.entries.map((entry) => entry.id)).toEqual(['programme', 'buying', 'ticket', 'refunds', 'playback', 'artist-share', 'rights', 'applying', 'contact']);
    });

    it('shows the worked revenue example on the English page only', () => {
        const english = render('en');
        for (const value of ['$10.00', '−$2.00', '−$0.80', '−$0.40', '$6.80', 'VAT (25%)', 'Card payment cost (4% + $0.40)', 'youtick fee (5% of the price before VAT)']) {
            expect(english).toContain(value);
        }
        expect(faqCopy.tr.revenue).toBeNull();
        expect(render('tr')).not.toContain('6.80');
    });

    it('splits a VAT-inclusive ticket into VAT, card cost, youtick fee and the artist share', () => {
        expect(revenueSplit(1000)).toEqual({ priceCents: 1000, vatCents: 200, cardCents: 80, youtickCents: 40, artistCents: 680 });
        expect(revenueSplit(1500)).toEqual({ priceCents: 1500, vatCents: 300, cardCents: 100, youtickCents: 60, artistCents: 1040 });
        expect(revenueSplit(999)).toEqual({ priceCents: 999, vatCents: 200, cardCents: 80, youtickCents: 40, artistCents: 679 });
        for (const price of [0, -100, 10.5]) expect(() => revenueSplit(price)).toThrow();
        expect(formatDollars(680)).toBe('$6.80');
        expect(formatDollars(-200)).toBe('−$2.00');
    });

    it('publishes no rehearsal, provider, crypto or never-used wording in either language', () => {
        for (const locale of ['en', 'tr'] as const) {
            const output = render(locale);
            for (const pattern of FORBIDDEN_IN_PUBLIC) expect(output, `${locale}: ${pattern}`).not.toMatch(pattern);
        }
    });

    it('keeps the interim Turkish page free of payment, price, refund, card and chain wording', () => {
        const turkish = render('tr');
        for (const pattern of FORBIDDEN_IN_TURKISH) expect(turkish, String(pattern)).not.toMatch(pattern);
        expect(faqCopy.tr.entries.map((entry) => entry.id)).toEqual(['programme', 'watching', 'ticket', 'playback', 'rights', 'applying', 'contact']);
        expect(turkish).toContain('Ekran kaydı engellenemez');
        expect(turkish).toContain('href="/tr/apply"');
        expect(turkish).toContain('href="/tr"');
        expect(turkish).not.toContain('refund-policy');
    });
});
