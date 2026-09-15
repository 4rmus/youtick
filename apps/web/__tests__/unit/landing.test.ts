import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
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
        expect(landingCopy.en.hero.description).toBe('YouTick brings the screening page, digital ticket, and ticket-gated viewing into one simple flow.');
        expect(landingCopy.tr.hero.description).toBe('YouTick; gösterim sayfasını, dijital bileti ve biletle açılan izlemeyi tek sade akışta toplar.');
        expect(landingCopy.tr.audience.creator.benefits).toContain('Video içeriği yükle, işleme tamamlanınca yayınla.');
        expect(landingCopy.tr.audience.creator.benefits).toContain('Bilet fiyatını belirle.');
        expect(landingCopy.tr.roi.uploadFeeTitle).toBe('YouTick yükleme ücreti');
        expect(landingCopy.en.audience.creator.benefits).toContain('Keep 95% of each paid ticket sale.');
        expect(landingCopy.tr.audience.creator.benefits).toContain('Her ücretli bilet satışının %95’ini al.');
        expect(landingCopy.en.roi.platformFee).toBe('5% platform fee');
        expect(landingCopy.tr.roi.platformFee).toBe('%5 platform ücreti');
        expect(JSON.stringify(landingCopy)).not.toMatch(/98%|%98|2%|%2/);
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
            status: 'Publishing opens soon',
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
