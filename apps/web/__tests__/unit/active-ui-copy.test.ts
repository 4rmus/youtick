import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const ACTIVE_UI_FILES = [
    'app/layout.tsx',
    'app/page.tsx',
    'app/profile/page.tsx',
    'app/tr/page.tsx',
    'app/watch/page.tsx',
    'components/Navbar.tsx',
    'components/RuntimeClosed.tsx',
    'components/LivepeerPlayer.tsx',
    'components/LivepeerWatch.tsx',
    'components/PublicTestnetBetaBanner.tsx',
    'components/discover/DiscoverView.tsx',
    'components/landing/LandingPage.tsx',
    'components/landing/landing-copy.ts',
];

describe('active UI copy', () => {
    it('does not restore retired providers, routes, or playback claims', async () => {
        const source = (await Promise.all(ACTIVE_UI_FILES.map((file) => readFile(file, 'utf8'))))
            .join('\n')
            .toLowerCase();
        const retiredTerms = [
            ['light', 'house'],
            ['k', 'ms'],
            ['i', 'pfs'],
            ['web', '4'],
            ['d', 'rm'],
            ['/tri', 'al'],
            ['gift', ' ticket'],
            ['guest', ' access'],
            ['protected', ' playback'],
            ['release', ' gates'],
            ['playback', ' entitlement'],
        ].map((parts) => parts.join(''));

        for (const term of retiredTerms) expect(source).not.toContain(term);
    });

    it('keeps the public testnet warning, limits, noindex and abuse route visible', async () => {
        const [banner, terms, layout, robots] = await Promise.all([
            readFile('components/PublicTestnetBetaBanner.tsx', 'utf8'),
            readFile('app/terms/page.tsx', 'utf8'),
            readFile('app/layout.tsx', 'utf8'),
            readFile('app/robots.ts', 'utf8'),
        ]);
        for (const value of ['Testnet Beta', 'no real value', '1 GB/file', '1 upload/UTC day',
            '10 uploads total', '0.10 test USDC', '24-hour']) expect(banner).toContain(value);
        expect(terms).toContain('abuse@youtick.net');
        expect(terms).toContain('non-refundable');
        expect(layout).toContain('index: false');
        expect(robots).toContain("disallow: '/'");
    });
});
