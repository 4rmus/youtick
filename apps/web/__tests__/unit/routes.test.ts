import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { describe, expect, it } from 'vitest';

async function exists(path: string): Promise<boolean> {
    try { await access(path, constants.F_OK); return true; } catch { return false; }
}

describe('Livepeer-only routes', () => {
    it('keeps the Turkish dark-release smoke route available', async () => {
        await expect(exists('app/tr/page.tsx')).resolves.toBe(true);
    });

    it('removes claim, trial and onboarding endpoints so Next returns 404', async () => {
        await expect(Promise.all([
            exists('app/claim/page.tsx'),
            exists('app/trial/page.tsx'),
            exists('app/api/onboarding-key/route.ts'),
            exists('app/api/trial/sponsored/route.ts'),
        ])).resolves.toEqual([false, false, false, false]);
    });

    it('accepts only the job query on the watch route', async () => {
        const source = await readFile('app/watch/page.tsx', 'utf8');
        expect(source).toContain("get('job')");
        expect(source).not.toContain("get('cid')");
    });

    it('opens publication reads without opening paid media actions', async () => {
        const [discover, profile, card] = await Promise.all([
            readFile('app/discover/page.tsx', 'utf8'),
            readFile('app/profile/page.tsx', 'utf8'),
            readFile('components/VideoCard.tsx', 'utf8'),
        ]);

        expect(discover).toContain('!FEATURE_FLAGS.enablePaidMediaLivepeerV1 && !FEATURE_FLAGS.enableDerivedReadModel');
        expect(profile).toContain('!FEATURE_FLAGS.enablePaidMediaLivepeerV1 && !FEATURE_FLAGS.enableDerivedReadModel');
        expect(profile).toContain('enabled: Boolean(accountId && FEATURE_FLAGS.enableDerivedReadModel)');
        expect(profile).toContain('FEATURE_FLAGS.enablePaidMediaLivepeerV1 && (');
        expect(card).toContain('return FEATURE_FLAGS.enablePaidMediaLivepeerV1 ? (');
    });
});
