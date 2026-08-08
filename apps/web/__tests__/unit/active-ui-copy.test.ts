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
});
