import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TermsPage from '@/app/terms/page';
import PrivacyPage from '@/app/privacy/page';
import { describe, expect, it } from 'vitest';
import { getLandingCtas, landingCopy } from '@/components/landing/landing-copy';
import { calculateTicketSplit, formatMicroUsdc } from '@/components/landing/roi';

function shape(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(shape);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, shape(child)]));
    }
    return typeof value;
}

describe('bilingual landing', () => {
    it('keeps English and Turkish copy in the same typed shape', () => {
        expect(shape(landingCopy.tr)).toEqual(shape(landingCopy.en));
        expect(JSON.stringify(landingCopy)).not.toMatch(/98%|%98|2%|%2/);
    });

    it('separates the wallet test pilot from future sign-in, payments and earnings claims', () => {
        for (const [locale, copy] of Object.entries(landingCopy)) {
            const text = JSON.stringify(copy);
            expect(copy.hero.badge).toMatch(/testnet/);
            expect(copy.hero.description).toMatch(/NEAR/);
            expect(copy.hero.description).toMatch(/Google.*passkey/);
            expect(copy.hero.description).toMatch(locale === 'en' ? /not available in V1/ : /V1’de sunulmuyor/);
            expect(copy.roi.description).toMatch(locale === 'en' ? /simulation.*illustrative pilot/ : /simülasyon.*örnek pilot paylaşımı/);
            expect(copy.roi.estimateNote).toMatch(locale === 'en' ? /no real value/ : /gerçek değeri yok/);
            expect(text).toContain('5 GB');
            expect(text).not.toMatch(/120 minutes per video|120 dakika/);
            expect(text).not.toContain('20 GB');
            expect(copy.howItWorks.steps[0].description).toContain('2 test USDC');
            expect(copy.audience.creator.benefits[2]).toMatch(/NEAR/);
        }
    });

    it('contains only current media architecture in landing copy', () => {
        const copy = JSON.stringify(landingCopy).toLowerCase();
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
            secondary: { label: 'Why YouTick', href: '#trust' },
            status: 'Pilot publishing is currently closed',
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
            readFile('app/page.tsx', 'utf8'),
            readFile('app/tr/page.tsx', 'utf8'),
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
