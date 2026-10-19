import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TermsPage from '@/app/(site)/terms/page';
import { describe, expect, it, vi } from 'vitest';
import { LandingPage } from '@/components/landing/LandingPage';
import {
    getLandingCopy,
    getLandingCtas,
    heroProgrammeLink,
    landingCopy,
    landingCopyLayers,
    landingNavSections,
    type LandingLocale,
} from '@/components/landing/landing-copy';
import { openingProgrammeMode, type OpeningProgrammeEntry } from '@/components/landing/opening-programme';
import { formatDollars, revenueSplit } from '@/components/landing/revenue';
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

/** Every string value in the copy (keys such as `cards` are not copy). */
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
const FORBIDDEN_IN_PUBLIC: readonly RegExp[] = [
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
const FORBIDDEN_IN_TURKISH: readonly RegExp[] = [
    /USDC/i, /kripto/i, /crypto/i, /\bNEAR\b/, /token/i, /blockchain/i, /zincir/i, /1Click/i,
    /\bkart/i, /\bcard/i, /öde/i, /ödeme/i, /banka/i, /fiyat/i, /ücret/i, /\bpara\b/i, /satın/i, /satış/i,
    /\bTL\b/, /dolar/i, /\$/, /%/, /Apple Pay/i, /Google Pay/i, /[iİ]ade/i, /vergi/i, /KDV/i,
];

const ARTISTS: readonly OpeningProgrammeEntry[] = [{ artist: 'Example Artist' }];
const PROGRAMME: readonly OpeningProgrammeEntry[] = [
    { artist: 'Example Artist', work: { title: 'Example Concert', type: 'concert', note: { en: 'A live set.', tr: 'Canlı bir set.' }, href: '/s/example' } },
];

describe('bilingual landing', () => {
    it('keeps English and Turkish copy in the same typed shape; figures, refund and legal links only in English', () => {
        const strip = (copy: (typeof landingCopy)['en']) => {
            const { artists: { example, ...artists }, ticket: { links, ...ticket }, footer: { refund, ...footer }, ...rest } = copy;
            return { parts: { example, links, refund }, rest: { ...rest, artists, ticket, footer } };
        };
        const english = strip(landingCopy.en);
        const turkish = strip(landingCopy.tr);
        expect(shape(turkish.rest)).toEqual(shape(english.rest));
        expect(english.parts.example).not.toBeNull();
        expect(english.parts.links).not.toBeNull();
        expect(english.parts.refund).not.toBeNull();
        expect(turkish.parts).toEqual({ example: null, links: null, refund: null });
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
            expect(ids).toEqual(['programme', 'box-office', 'ticket', 'artists', 'apply', 'how-it-works']);
            expect(html).toContain(`href="${locale === 'tr' ? '/tr/notify' : '/notify'}"`);
            expect(html).toContain(`href="${locale === 'tr' ? '/tr/apply' : '/apply'}"`);
            expect(html).not.toContain('roi-calculator');
            expect(html).not.toContain('github.com');
        }
    });

    it('publishes no rehearsal, provider, crypto or never-used wording at any stage', () => {
        for (const locale of LOCALES) {
            for (const stage of LAUNCH_STAGES) {
                const output = `${publicOutput(locale, stage)}\n${renderLandingText(locale, stage, PROGRAMME)}`;
                for (const pattern of FORBIDDEN_IN_PUBLIC) expect(output, `${locale}/${stage}: ${pattern}`).not.toMatch(pattern);
            }
        }
    });

    it('keeps the interim Turkish page free of payment, price, refund, card and chain wording', () => {
        const output = `${publicOutput('tr')}\n${renderLandingText('tr', 'prova', PROGRAMME)}`;
        for (const pattern of FORBIDDEN_IN_TURKISH) expect(output, String(pattern)).not.toMatch(pattern);
        expect('İade politikası').toMatch(FORBIDDEN_IN_TURKISH.find((pattern) => pattern.source === '[iİ]ade')!);
    });

    it('names Livepeer and NEAR only in the How it works section of the English page', () => {
        const html = renderToStaticMarkup(React.createElement(LandingPage, { locale: 'en', stage: 'prova', programme: [] }));
        const howItWorks = html.slice(html.indexOf('id="how-it-works"'), html.indexOf('</section>', html.indexOf('id="how-it-works"')));
        const rest = html.replace(howItWorks, '');
        expect(howItWorks).toContain('Built with Livepeer and NEAR');
        expect(rest).not.toMatch(/Livepeer|\bNEAR\b/);
        expect(renderToStaticMarkup(React.createElement(LandingPage, { locale: 'tr', stage: 'prova', programme: [] }))).toContain('Livepeer ile geliştirildi');
    });

    it('shows the worked revenue example on the English page only', () => {
        const english = renderLandingText('en', 'prova');
        for (const value of ['$10.00', '−$2.00', '−$0.80', '−$0.40', '$6.80', 'VAT (25%)', 'Card payment cost (4% + $0.40)', 'youtick fee (5% of the price before VAT)']) {
            expect(english).toContain(value);
        }
        expect(renderLandingText('tr', 'prova')).not.toContain('6.80');
    });

    it('splits a VAT-inclusive ticket into VAT, card cost, youtick fee and the artist share', () => {
        expect(revenueSplit(1000)).toEqual({ priceCents: 1000, vatCents: 200, cardCents: 80, youtickCents: 40, artistCents: 680 });
        expect(revenueSplit(1500)).toEqual({ priceCents: 1500, vatCents: 300, cardCents: 100, youtickCents: 60, artistCents: 1040 });
        expect(revenueSplit(999)).toEqual({ priceCents: 999, vatCents: 200, cardCents: 80, youtickCents: 40, artistCents: 679 });
        for (const price of [0, -100, 10.5]) expect(() => revenueSplit(price)).toThrow();
        expect(formatDollars(680)).toBe('$6.80');
        expect(formatDollars(-200)).toBe('−$2.00');
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
        expect(landingNavSections(en, 'hidden').map((section) => section.hash)).toEqual(['programme', 'box-office', 'artists', 'how-it-works']);
        expect(landingNavSections(en, 'programme')[0]).toEqual({ hash: 'opening-programme', label: 'Opening programme' });
        expect(landingNavSections(en, 'artists')[0]).toEqual({ hash: 'opening-programme', label: 'Opening artists' });
        expect(heroProgrammeLink(en, 'hidden')).toEqual({ label: 'What you will be able to watch', hash: 'programme' });
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
        expect(copy).toContain('livepeer');
    });

    it('keeps the terms free of the provider name, USDC and the pilot', () => {
        const terms = renderToStaticMarkup(React.createElement(TermsPage));
        expect(terms).toContain('your statutory rights as a consumer');
        expect(terms).toContain('pending review by our legal counsel');
        expect(terms).toContain('our card payment provider processes the payment as reseller (merchant of record)');
        expect(terms).not.toMatch(/cleeng|USDC|pilot|testnet|test tokens|non-refundable|14-day beta/i);
        expect(terms).toContain('mailto:contact@youtick.net');
    });

    it('ships the Turkish static routes, locale alternates, and both optimized images', async () => {
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
        await expect(Promise.all([
            access('public/hero-concert.webp', constants.F_OK),
            access('public/concert-crowd.webp', constants.F_OK),
        ])).resolves.toEqual([undefined, undefined]);
    });
});
