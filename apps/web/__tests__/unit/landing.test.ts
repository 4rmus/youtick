import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TermsPage from '@/app/(site)/terms/page';
import { describe, expect, it, vi } from 'vitest';
import { LandingPage } from '@/components/landing/LandingPage';
import {
    faqHref,
    getLandingCopy,
    getLandingCtas,
    heroProgrammeLink,
    landingCopy,
    landingCopyLayers,
    landingNavSections,
    type LandingLocale,
} from '@/components/landing/landing-copy';
import { openingProgrammeMode, type OpeningProgrammeEntry } from '@/components/landing/opening-programme';
import { LAUNCH_STAGES, type LaunchStage } from '@/lib/constants';
import { FORBIDDEN_IN_PUBLIC, FORBIDDEN_IN_TURKISH } from './public-copy-rules';

vi.mock('next/image', () => ({
    default: (props: { alt: string }) => React.createElement('img', { alt: props.alt }),
}));

const LOCALES: readonly LandingLocale[] = ['en', 'tr'];

/** Type shape of the copy; arrays compare by element shape, not by length. */
function shape(value: unknown): unknown {
    if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, shape(child)]));
    }
    return typeof value;
}

/**
 * Rendered landing text plus its link targets: tags and class attributes are removed so utility
 * classes (`text-near-green`) and markup are not read as copy.
 */
function renderLandingText(locale: LandingLocale, stage: LaunchStage, programme: readonly OpeningProgrammeEntry[] = []): string {
    const html = renderToStaticMarkup(React.createElement(LandingPage, { locale, stage, programme }));
    const hrefs = Array.from(html.matchAll(/ href="[^"]*"/g), (match) => match[0].trim());
    return `${html.replace(/ class="[^"]*"/g, '').replace(/<[^>]+>/g, ' ')}\n${hrefs.join(' ')}`;
}

/** Every string value in the copy (keys such as `items` are not copy). */
function copyText(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(copyText);
    if (value && typeof value === 'object') return Object.values(value).flatMap(copyText);
    return [];
}

/** Everything a stage can publish: the copy values and the rendered page. */
function publicOutput(locale: LandingLocale, stage: LaunchStage = 'prova'): string {
    return `${copyText(getLandingCopy(locale, stage)).join('\n')}\n${renderLandingText(locale, stage)}`;
}

// Two-audience rewrite (owner, 2026-10-20): the landing speaks to the viewer who comes back to the root
// page and to the artist who checks the site before applying, one block each, in decisions rather than
// mechanism. Ticket rights beyond the cancellation window, the refund rules, the networks behind playback,
// the worked revenue example and the application process are not landing copy.
const NOT_ON_THE_LANDING: readonly RegExp[] = [
    /Livepeer/, /\bNEAR\b/, /\$\d/, /statutory/, /licence/, /personal right/,
    /screen recording/i, /ekran kaydı/i, /refunds? (?:cover|go back)/i, /resold/, /devredilemez.*kopyalama/,
    /own screening page/i, /kendi gösterim sayfası/i, /reads every application/i, /başvuruyu bir kişi okur/i,
];

const ARTISTS: readonly OpeningProgrammeEntry[] = [{ artist: 'Example Artist' }];
const PROGRAMME: readonly OpeningProgrammeEntry[] = [
    { artist: 'Example Artist', work: { title: 'Example Concert', type: 'concert', note: { en: 'A live set.', tr: 'Canlı bir set.' }, href: '/s/example' } },
];

describe('bilingual landing', () => {
    it('keeps English and Turkish copy in the same typed shape; the refund links only in English', () => {
        const strip = (copy: (typeof landingCopy)['en']) => {
            const { rules: { refund: rulesRefund, ...rules }, footer: { refund, ...footer }, ...rest } = copy;
            return { parts: { rulesRefund, refund }, rest: { ...rest, rules, footer } };
        };
        const english = strip(landingCopy.en);
        const turkish = strip(landingCopy.tr);
        expect(shape(turkish.rest)).toEqual(shape(english.rest));
        expect(english.parts).toEqual({ rulesRefund: 'Refund policy', refund: 'Refund policy' });
        expect(turkish.parts).toEqual({ rulesRefund: null, refund: null });
    });

    it('announces the February 2027 opening with a viewer and an artist path', () => {
        expect(getLandingCopy('en').hero.badge).toBe('Opening February 2027');
        expect(getLandingCopy('tr').hero.badge).toBe('Şubat 2027’de açılıyor');
        expect(getLandingCtas('en')).toEqual({
            primary: { label: 'Notify me when it opens', href: '/notify' },
            secondary: { label: 'Show your work on youtick', href: '/apply' },
        });
        expect(getLandingCtas('tr')).toEqual({
            primary: { label: 'Açılıştan haberdar ol', href: '/tr/notify' },
            secondary: { label: 'Eserini youtick’te göster', href: '/tr/apply' },
        });
        for (const locale of LOCALES) {
            const html = renderToStaticMarkup(React.createElement(LandingPage, { locale, stage: 'prova', programme: [] }));
            const ids = Array.from(html.matchAll(/ id="([^"]+)"/g), (match) => match[1]);
            expect(ids).toEqual(['ticket', 'artists']);
            // The artist block ends in the application button; the hero carries the artist's own words.
            expect(html).toContain(getLandingCopy(locale).ctas.apply);
            expect(html).toContain(`href="${locale === 'tr' ? '/tr/notify' : '/notify'}"`);
            expect(html).toContain(`href="${locale === 'tr' ? '/tr/apply' : '/apply'}"`);
            expect(html).toContain(`href="${faqHref(locale)}"`);
            expect(html).toContain('href="/terms"');
            expect(html).not.toContain('roi-calculator');
            expect(html).not.toContain('github.com');
        }
        expect(renderToStaticMarkup(React.createElement(LandingPage, { locale: 'en', stage: 'prova', programme: [] }))).toContain('href="/refund-policy"');
        expect(renderToStaticMarkup(React.createElement(LandingPage, { locale: 'tr', stage: 'prova', programme: [] }))).not.toContain('refund-policy');
    });

    it('stays short: one hero sentence and one hero line, three ticket lines, an artist lead with at most four lines', () => {
        for (const locale of LOCALES) {
            const copy = getLandingCopy(locale);
            expect(copy.hero.title.match(/[.!?]/g)).toHaveLength(1);
            expect(copy.hero.subtitle.match(/[.!?]/g)).toHaveLength(3);
            expect(copy.ticket.items).toHaveLength(3);
            expect(copy.artists.lead.match(/[.!?]/g)).toHaveLength(3);
            expect(copy.artists.items.length).toBeLessThanOrEqual(4);
            expect(copy.nav.sections.map((section) => section.hash)).toEqual(['ticket', 'artists']);
            const words = copyText(copy).join(' ').split(/\s+/).length;
            expect(words, `${locale}: ${words} words`).toBeLessThan(260);
            const prose = copyText({ hero: [copy.hero.title, copy.hero.subtitle], ticket: copy.ticket.items, artists: [copy.artists.lead, ...copy.artists.items] });
            for (const sentence of prose.flatMap((text) => text.split(/(?<=[.?])\s+/))) {
                expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(18);
            }
        }
        // The English artist block carries the fee; the interim Turkish block carries no payment line at all.
        expect(getLandingCopy('en').artists.items).toHaveLength(4);
        expect(getLandingCopy('tr').artists.items).toHaveLength(2);
    });

    it('publishes no rehearsal, provider, crypto or never-used wording at any stage', () => {
        for (const locale of LOCALES) {
            for (const stage of LAUNCH_STAGES) {
                const output = `${publicOutput(locale, stage)}\n${renderLandingText(locale, stage, PROGRAMME)}`;
                for (const pattern of FORBIDDEN_IN_PUBLIC) expect(output, `${locale}/${stage}: ${pattern}`).not.toMatch(pattern);
                for (const pattern of NOT_ON_THE_LANDING) expect(output, `${locale}/${stage}: ${pattern}`).not.toMatch(pattern);
            }
        }
    });

    it('keeps the interim Turkish page free of payment, price, refund, card and chain wording', () => {
        const output = `${publicOutput('tr')}\n${renderLandingText('tr', 'prova', PROGRAMME)}`;
        for (const pattern of FORBIDDEN_IN_TURKISH) expect(output, String(pattern)).not.toMatch(pattern);
        expect('İade politikası').toMatch(FORBIDDEN_IN_TURKISH.find((pattern) => pattern.source === '[iİ]ade')!);
    });

    it('states the card payment and the fee on the English page only', () => {
        const english = renderLandingText('en', 'prova');
        expect(english).toContain('Pay by credit or debit card on the work’s screening page.');
        expect(english).toContain('a 5% youtick fee on the pre-VAT price');
        expect(english).toContain('Your share is paid monthly.');
        expect(english).toContain('Cancel within 14 days if you have not pressed play.');
        expect(english).not.toMatch(/card payment provider/);
        expect(renderLandingText('tr', 'prova')).not.toMatch(/%|VAT|KDV/);
    });

    it('renders the opening programme only once entries exist, and follows its state in the links', () => {
        expect(openingProgrammeMode([])).toBe('hidden');
        expect(openingProgrammeMode(ARTISTS)).toBe('artists');
        expect(openingProgrammeMode(PROGRAMME)).toBe('programme');
        expect(renderLandingText('en', 'prova', [])).not.toContain('Opening programme');

        const artists = renderToStaticMarkup(React.createElement(LandingPage, { locale: 'en', stage: 'prova', programme: ARTISTS }));
        expect(artists).toContain('id="opening-programme"');
        expect(artists).toContain('Opening artists');
        expect(artists).toContain('Example Artist');
        expect(artists).toContain('See the opening artists');

        const programme = renderToStaticMarkup(React.createElement(LandingPage, { locale: 'tr', stage: 'prova', programme: PROGRAMME }));
        expect(programme).toContain('Açılış programı');
        expect(programme).toContain('Example Concert');
        expect(programme).toContain('Konser kaydı');
        expect(programme).toContain('Canlı bir set.');
        expect(programme).toContain('href="/s/example"');
        expect(programme).toContain('Açılış programına göz at');

        const en = getLandingCopy('en');
        expect(landingNavSections(en, 'hidden').map((section) => section.hash)).toEqual(['ticket', 'artists']);
        expect(landingNavSections(en, 'programme').map((section) => section.hash)).toEqual(['opening-programme', 'ticket', 'artists']);
        expect(landingNavSections(en, 'programme')[0]).toEqual({ hash: 'opening-programme', label: 'Opening programme' });
        expect(landingNavSections(en, 'artists')[0]).toEqual({ hash: 'opening-programme', label: 'Opening artists' });
        expect(heroProgrammeLink(en, 'hidden')).toBeNull();
        expect(heroProgrammeLink(en, 'programme')).toEqual({ label: 'See the opening programme', hash: 'opening-programme' });
    });

    it('keeps the launch-stage mechanism with empty stage overrides', () => {
        for (const locale of LOCALES) {
            const shared = getLandingCopy(locale, 'prova');
            expect(getLandingCopy(locale)).toBe(shared);
            expect(landingCopy[locale]).toBe(shared);
            expect(landingCopyLayers.gala[locale]).toEqual({});
            expect(landingCopyLayers.vizyon[locale]).toEqual({});
            expect(getLandingCopy(locale, 'gala')).toEqual(shared);
            expect(getLandingCopy(locale, 'vizyon')).toEqual(shared);
        }
    });

    it('contains only current media architecture in landing copy', () => {
        const copy = JSON.stringify(landingCopyLayers).toLowerCase();
        const retiredTerms = [
            ['light', 'house'],
            ['k', 'ms'],
            ['i', 'pfs'],
            ['d', 'rm'],
            ['/tri', 'al'],
            ['gift', ' ticket'],
            ['guest', ' access'],
        ].map((parts) => parts.join(''));

        for (const term of retiredTerms) expect(copy).not.toContain(term);
    });

    it('keeps the terms free of the provider name, USDC and the pilot', () => {
        const terms = renderToStaticMarkup(React.createElement(TermsPage));
        expect(terms).toContain('your statutory rights as a consumer');
        expect(terms).toContain('pending review by our legal counsel');
        expect(terms).toContain('our card payment provider processes the payment as reseller (merchant of record)');
        expect(terms).not.toMatch(/cleeng|USDC|pilot|testnet|test tokens|non-refundable|14-day beta/i);
        expect(terms).toContain('mailto:contact@youtick.net');
    });

    it('ships the Turkish static routes, locale alternates, and the hero image', async () => {
        const [englishPage, turkishPage, turkishNotify, sitemap] = await Promise.all([
            readFile('app/(site)/page.tsx', 'utf8'),
            readFile('app/(tr)/tr/page.tsx', 'utf8'),
            readFile('app/(tr)/tr/notify/page.tsx', 'utf8'),
            readFile('app/sitemap.ts', 'utf8'),
        ]);

        expect(englishPage).toContain("languages: { en: '/', tr: '/tr', 'x-default': '/' }");
        expect(turkishPage).toContain('locale="tr"');
        expect(turkishNotify).toContain('locale="tr"');
        expect(sitemap).toContain("'/tr'");
        expect(sitemap).toContain("'/tr/notify'");
        await expect(access('public/hero-concert.webp', constants.F_OK)).resolves.toBeUndefined();
    });
});
