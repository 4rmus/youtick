import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TermsPage from '@/app/(site)/terms/page';
import PrivacyPage from '@/app/(site)/privacy/page';
import { describe, expect, it, vi } from 'vitest';
import { LandingPage } from '@/components/landing/LandingPage';
import {
    getLandingCopy,
    getLandingCtas,
    landingCopy,
    landingCopyLayers,
    type LandingLocale,
} from '@/components/landing/landing-copy';
import { calculateTicketSplit, formatMicroUsdc } from '@/components/landing/roi';
import type { LaunchStage } from '@/lib/constants';

vi.mock('next/image', () => ({
    default: (props: { alt: string }) => React.createElement('img', { alt: props.alt }),
}));

const LOCALES: readonly LandingLocale[] = ['en', 'tr'];

/** Type shape of the copy; arrays compare by element shape, not by length (the Turkish footer names fewer projects). */
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
function renderLandingText(locale: LandingLocale, stage: LaunchStage, enabled = false): string {
    const html = renderToStaticMarkup(React.createElement(LandingPage, { locale, enabled, stage }));
    const hrefs = Array.from(html.matchAll(/ href="[^"]*"/g), (match) => match[0].trim());
    return `${html.replace(/ class="[^"]*"/g, '').replace(/<[^>]+>/g, ' ')}\n${hrefs.join(' ')}`;
}

/** Prova output (copy and rendered page, both locales). */
function provaOutput(locale: LandingLocale): string {
    return `${JSON.stringify(getLandingCopy(locale, 'prova'))}\n${renderLandingText(locale, 'prova')}\n${renderLandingText(locale, 'prova', true)}`;
}

// Claim register 2–16 (design-language plan §4.4), the "never used" list, dates and "soon".
const FORBIDDEN_IN_PROVA: readonly RegExp[] = [
    /Apple Pay/i, /Google Pay/i, /pay (by|with) card/i, /kartla (öde|ödeme)/i, // 2
    /pay (in|with) USDC/i, /USDC ile öde/i, // 3
    /no second password/i, /ikinci şifre/i, // 4
    /wallet/i, /cüzdan/i, /seed phrase/i, /gas fee/i, // 5 and the removed V1 instructions
    /the moment (they are|it is) played/i, /oynatıldığı anda/i, // 6
    /bank account/i, /banka hesab/i, /every month/i, /her ay/i, // 7
    /refund/i, /iade/i, // 8
    /\b(3|three) devices/i, /3 cihaz/i, // 9
    /never expires?/i, /does not expire/i, /süresi dolmaz/i, // 10
    /VAT included/i, /KDV dahil/i, /\$ ?5\b/, /\b5 ?\$/, // 11
    /3[.,]9 ?%/, /%3[.,]9/, /0[.,]39/, // 12
    /fan list/i, /hayran listesi/i, /tell your fans/i, /hayranlarına haber/i, // 13
    /watermark/i, /filigran/i, // 14
    /takedown/i, /freeze/i, /dondur/i, // 15
    /audit/i, /external review/i, /dış inceleme/i, // 16
    /35\+/, /chain/i, /zincir/i, /(any|every) token/i, /her token/i,
    /licen[sc]ed/i, /lisanslı/i, /\bFCA\b/, /MiCA/i,
    /invest/i, /yatırım/i,
    /screen recording/i, /ekran kaydı/i,
    /instant card/i, /kartla anında/i,
    /founder/i, /kurucu/i,
    /cheaper/i, /daha ucuz/i,
    /\bsoon\b/i, /yakında/i, /\b20\d\d\b/,
    /\b(January|February|March|April|June|July|August|September|October|November|December)\b/i,
    /\b(Ocak|Şubat|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\b/,
    // the V1 wallet pilot (the 95/5 split stays only in the simulator section, never in the hero)
    /test USDC from your/i, /testnet cüzdan/i, /V1\b/, /pilot/i,
];

// K6: the Turkish layer carries no payment, card, USDC or crypto wording and names no chain.
const FORBIDDEN_IN_TURKISH: readonly RegExp[] = [
    /USDC/i, /kripto/i, /crypto/i, /\bNEAR\b/, /token/i, /blockchain/i, /zincir/i, /1Click/i,
    /\bkart/i, /\bcard/i, /öde/i, /ödeme/i, /banka/i, /fiyat/i, /ücret/i, /\bpara\b/i, /satın/i, /satış/i,
    /\bTL\b/, /dolar/i, /\$/, /%/, /Apple Pay/i, /Google Pay/i, /iade/i, /vergi/i, /KDV/i,
];

describe('bilingual landing', () => {
    it('keeps English and Turkish copy in the same typed shape, with the simulator only in English', () => {
        const { roi: englishRoi, ...english } = landingCopy.en;
        const { roi: turkishRoi, ...turkish } = landingCopy.tr;
        expect(shape(turkish)).toEqual(shape(english));
        expect(englishRoi).not.toBeNull();
        expect(turkishRoi).toBeNull();
        expect(JSON.stringify(landingCopy)).not.toMatch(/98%|%98|2%|%2/);
    });

    it('describes the V2 testnet rehearsal in Prova and nothing beyond it', () => {
        const en = getLandingCopy('en', 'prova');
        expect(en.hero.badge).toMatch(/Invite-only rehearsal on the NEAR testnet/);
        expect(en.hero.title).toMatch(/Ticketed screenings for independent film and music/);
        expect(en.hero.description).toMatch(/Google or a passkey/);
        expect(en.hero.description).toMatch(/invite credit/);
        expect(en.hero.description).toMatch(/Card checkout exists in a sandbox and is not public/);
        expect(en.hero.description).toMatch(/apply for an invite/);
        expect(JSON.stringify(en.hero)).not.toMatch(/95|simulat/i);
        expect(en.howItWorks.steps.map((step) => step.title)).toEqual([
            'Sign in', 'Upload with an invite credit', 'Publish after processing', 'Test ticket and playback',
        ]);
        expect(en.howItWorks.steps[3].description).toMatch(/buy a test ticket/);
        expect(en.howItWorks.steps[3].description).toMatch(/sandbox and is not public/);
        expect(en.roi?.description).toMatch(/simulation.*illustrative rehearsal split/);
        expect(en.roi?.estimateNote).toMatch(/no real value/);
        expect(en.trust.technologyLabel).toBe('Built with Livepeer and NEAR');

        const tr = getLandingCopy('tr', 'prova');
        expect(tr.hero.badge).toBe('Davetli prova dönemi');
        expect(tr.hero.description).toMatch(/davet için başvurabilir/);
        expect(tr.howItWorks.eyebrow).toBe('Nasıl başvurulur');
        expect(tr.creators.action).toBe('Davet için başvur');

        for (const locale of LOCALES) {
            const text = JSON.stringify(getLandingCopy(locale, 'prova'));
            expect(text).toContain('5 GB');
            expect(text).not.toMatch(/120 minutes per video|120 dakika/);
            expect(text).not.toContain('20 GB');
            expect(text).not.toMatch(/pilot/i);
        }
    });

    it('renders no claim-register or never-used wording in Prova output', () => {
        for (const locale of LOCALES) {
            const output = provaOutput(locale);
            for (const pattern of FORBIDDEN_IN_PROVA) expect(output, `${locale}: ${pattern}`).not.toMatch(pattern);
            // Later-stage text stays out of Prova.
            for (const stage of ['gala', 'vizyon'] as const) {
                const later: { hero?: Record<string, string> } = landingCopyLayers[stage][locale];
                for (const line of Object.values(later.hero ?? {})) expect(output).not.toContain(line);
            }
        }
    });

    it('keeps the Turkish Prova output free of payment, card, USDC and crypto wording', () => {
        const output = provaOutput('tr');
        for (const pattern of FORBIDDEN_IN_TURKISH) expect(output, String(pattern)).not.toMatch(pattern);
        expect(output).not.toContain('roi-calculator');
        expect(output).toContain('Davet için başvur');
        expect(output).toContain('href="/tr/apply"');
        expect(getLandingCopy('tr', 'prova').footer.links.map((link) => link.label)).toEqual(['Livepeer']);
    });

    it('renders the English Prova page with the rehearsal sections and the apply link', () => {
        const output = provaOutput('en');
        expect(output).toContain('Invite-only rehearsal on the NEAR testnet');
        expect(output).toContain('roi-calculator');
        expect(output).toContain('href="/apply"');
        expect(output).toContain('Publishing is open to invited creators only');
    });

    it('layers Gala and Vizyon over the shared copy and reaches them only by explicit stage', () => {
        for (const locale of LOCALES) {
            const prova = getLandingCopy(locale, 'prova');
            const gala = getLandingCopy(locale, 'gala');
            const vizyon = getLandingCopy(locale, 'vizyon');
            expect(getLandingCopy(locale)).toBe(prova);
            expect(landingCopy[locale]).toBe(prova);
            expect(gala.hero.subtitle).not.toBe(prova.hero.subtitle);
            expect(vizyon.hero.title).not.toBe(gala.hero.title);
            // inherited, not overridden
            expect(gala.nav).toEqual(prova.nav);
            expect(gala.footer).toEqual(prova.footer);
            expect(gala.howItWorks).toEqual(prova.howItWorks);
            expect(vizyon.creators).toEqual(prova.creators);
            expect(shape(gala)).toEqual(shape(prova));
        }
        expect(getLandingCopy('en', 'gala').hero.subtitle).toBe(
            'Sell your video to the world with one link. Ticket, payment and playback on the same page; tax, collection and refunds are on us.',
        );
        expect(getLandingCopy('tr', 'gala').hero.title).toBe('Sahnen bir link.');
        expect(getLandingCopy('en', 'vizyon').hero.title).toBe('When the curtain rises, the artist gets paid.');
        // The page without an explicit stage renders the configured stage, which is Prova in this environment.
        const defaultHtml = renderToStaticMarkup(React.createElement(LandingPage, { locale: 'en', enabled: false }));
        expect(defaultHtml).toContain('Invite-only rehearsal on the NEAR testnet');
        expect(defaultHtml).not.toContain('Your stage is a link.');
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
        expect(copy).not.toContain('video livepeer ile; biletler ve ödemeler near üzerinde kaydedilir.');
    });

    it('keeps disabled calls to action on the landing and opens product routes only when enabled', () => {
        expect(getLandingCtas('en', false)).toEqual({
            primary: { label: 'See how it works', href: '#how-it-works' },
            secondary: { label: 'Why youtick', href: '#trust' },
            status: 'Publishing is open to invited creators only',
        });
        expect(getLandingCtas('tr', false)).toEqual({
            primary: { label: 'Nasıl başvurulur', href: '#how-it-works' },
            secondary: { label: 'Neden youtick', href: '#trust' },
            status: 'Yayın şu anda yalnız davetli üreticilere açık',
        });
        expect(getLandingCtas('tr', true)).toEqual({
            primary: { label: 'Gösterim aç', href: '/upload' },
            secondary: { label: 'Gösterimleri keşfet', href: '/discover' },
        });
    });

    it('matches the contract per-ticket split with exact micro-USDC arithmetic', () => {
        expect(calculateTicketSplit('2', 1n)).toEqual({
            grossMicroUsdc: 2_000_000n,
            platformMicroUsdc: 100_000n,
            creatorMicroUsdc: 1_900_000n,
        });
        expect(calculateTicketSplit('12', 800n)).toEqual({
            grossMicroUsdc: 9_600_000_000n,
            platformMicroUsdc: 480_000_000n,
            creatorMicroUsdc: 9_120_000_000n,
        });
        expect(calculateTicketSplit('2.000049', 2n)).toEqual({
            grossMicroUsdc: 4_000_098n,
            platformMicroUsdc: 200_004n,
            creatorMicroUsdc: 3_800_094n,
        });
        expect(calculateTicketSplit('100.000001', 100_000n)).toEqual({
            grossMicroUsdc: 10_000_000_100_000n,
            platformMicroUsdc: 500_000_000_000n,
            creatorMicroUsdc: 9_500_000_100_000n,
        });
        expect(() => calculateTicketSplit('1.999999', 1n)).toThrow('invalid_ticket_price');
        expect(formatMicroUsdc(9_120_000_000n, 'en')).toBe('9,120 USDC');
        expect(formatMicroUsdc(9_120_000_000n, 'tr')).toBe('9.120 USDC');
    });

    it('shows pilot, responsibility and local-data notices without blanket refund or storage claims', () => {
        const terms = renderToStaticMarkup(React.createElement(TermsPage));
        const privacy = renderToStaticMarkup(React.createElement(PrivacyPage));
        expect(terms).toContain('controlled testnet pilot');
        expect(terms).toContain('statutory consumer rights');
        expect(terms).toContain('remain to be confirmed');
        expect(terms).not.toMatch(/non-refundable|14-day beta/);
        expect(privacy).toContain('IndexedDB');
        expect(privacy).toContain('localStorage');
        expect(privacy).toContain('sessionStorage');
        expect(privacy).toContain('before collecting personal data');
        expect(privacy).toContain('does not delete public blockchain');
        for (const html of [terms, privacy]) expect(html).toContain('mailto:contact@youtick.net');
    });

    it('ships the Turkish static route, locale alternates, and both optimized images', async () => {
        const [englishPage, turkishPage, sitemap] = await Promise.all([
            readFile('app/(site)/page.tsx', 'utf8'),
            readFile('app/(tr)/tr/page.tsx', 'utf8'),
            readFile('app/sitemap.ts', 'utf8'),
        ]);

        expect(englishPage).toContain("languages: { en: '/', tr: '/tr', 'x-default': '/' }");
        expect(turkishPage).toContain('locale="tr"');
        expect(sitemap).toContain("'/tr'");
        await expect(Promise.all([
            access('public/hero-concert.webp', constants.F_OK),
            access('public/concert-crowd.webp', constants.F_OK),
        ])).resolves.toEqual([undefined, undefined]);
    });
});
