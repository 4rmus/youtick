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

// Owner brief 2026-10-19: no rehearsal, beta, test or invitation phase, no payment provider name, no
// USDC or crypto, no exact opening day, and the never-used list of the claim register.
export const FORBIDDEN_IN_PUBLIC: readonly RegExp[] = [
    /cleeng/i, /payment partner/i, /merchant of record/i,
    /rehearsal/i, /\bprova/i, /\bbeta\b/i, /testnet/i, /\btest\b/i, /sandbox/i, /pilot/i, /invit/i, /davet/i, /deneme/i,
    /\bsoon\b/i, /yakında/i, /\b\d{1,2}\.? ?(February|Şubat)\b/i, /\b(February|Şubat) \d{1,2}\b/i, /\bNov(ember)?\b/i, /Kasım/,
    /USDC/i, /crypto/i, /kripto/i, /token/i, /wallet/i, /cüzdan/i, /seed phrase/i, /\bgas\b/i, /1Click/i, /\bNFT/i,
    /Apple Pay/i, /Google Pay/i,
    /revolution/i, /devrim/i, /licensed/i, /lisanslı/i, /\bFCA\b/, /MiCA/i, /invest/i, /yatırım/i,
    /audit/i, /external review/i, /dış inceleme/i, /watermark/i, /filigran/i, /founder/i, /kurucu/i,
    /cheaper/i, /ucuz/i, /screen recording is blocked/i, /ekran kaydı engellenir/i, /fan list/i, /hayran/i,
];

// K6 interim Turkish page: no payment, price, refund, card or chain wording until counsel (X4).
// `[iİ]` because a case-insensitive /i does not fold the dotted capital İ ("İade").
export const FORBIDDEN_IN_TURKISH: readonly RegExp[] = [
    /USDC/i, /kripto/i, /crypto/i, /\bNEAR\b/, /token/i, /blockchain/i, /zincir/i, /1Click/i,
    /\bkart/i, /\bcard/i, /öde/i, /ödeme/i, /banka/i, /fiyat/i, /ücret/i, /\bpara\b/i, /satın/i, /satış/i,
    /\bTL\b/, /dolar/i, /\$/, /%/, /Apple Pay/i, /Google Pay/i, /[iİ]ade/i, /vergi/i, /KDV/i,
];

// Short-copy rewrite (owner, 2026-10-20): the landing says what youtick is and how it works, nothing
// that belongs to the terms, the refund policy or the FAQ. Ticket rights, refund rules, the networks
// behind playback and the worked revenue example are not landing copy.
const NOT_ON_THE_LANDING: readonly RegExp[] = [
    /Livepeer/, /\bNEAR\b/, /\$\d/, /14 days/, /14 gün/, /statutory/, /licence/, /personal right/,
    /screen recording/i, /ekran kaydı/i, /refunds? (?:cover|go back)/i, /resold/, /devredilemez.*kopyalama/,
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
            secondary: { label: 'Apply as an artist', href: '/apply' },
        });
        expect(getLandingCtas('tr')).toEqual({
            primary: { label: 'Açılıştan haberdar ol', href: '/tr/notify' },
            secondary: { label: 'Sanatçı olarak başvur', href: '/tr/apply' },
        });
        for (const locale of LOCALES) {
            const html = renderToStaticMarkup(React.createElement(LandingPage, { locale, stage: 'prova', programme: [] }));
            const ids = Array.from(html.matchAll(/ id="([^"]+)"/g), (match) => match[1]);
            expect(ids).toEqual(['about', 'artists', 'viewers']);
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

    it('stays short: one hero sentence, three sentences on how it works, four lines for artists, three for viewers', () => {
        for (const locale of LOCALES) {
            const copy = getLandingCopy(locale);
            expect(copy.hero.title.match(/[.!?]/g)).toHaveLength(1);
            expect(copy.about.description.match(/\. /g)).toHaveLength(2);
            expect(copy.artists.items).toHaveLength(4);
            expect(copy.viewers.items).toHaveLength(3);
            expect(copy.nav.sections.map((section) => section.hash)).toEqual(['artists', 'viewers']);
            const words = copyText(copy).join(' ').split(/\s+/).length;
            expect(words, `${locale}: ${words} words`).toBeLessThan(260);
            for (const sentence of copyText({ hero: copy.hero.title, about: copy.about, artists: copy.artists.items, viewers: copy.viewers.items }).flatMap((text) => text.split(/(?<=\.)\s+/))) {
                expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(18);
            }
        }
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
        expect(english).toContain('Pay by credit or debit card.');
        expect(english).toContain('a 5% youtick fee on the pre-VAT price');
        expect(english).toContain('paid to you monthly');
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
        expect(landingNavSections(en, 'hidden').map((section) => section.hash)).toEqual(['artists', 'viewers']);
        expect(landingNavSections(en, 'programme').map((section) => section.hash)).toEqual(['opening-programme', 'artists', 'viewers']);
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
