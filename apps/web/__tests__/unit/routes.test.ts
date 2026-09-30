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

    it('serves the Sahne addresses and removes the old Discover route', async () => {
        await expect(Promise.all([
            exists('app/s/[id]/page.tsx'),
            exists('app/studio/page.tsx'),
            exists('app/studio/new/page.tsx'),
            exists('app/creators/page.tsx'),
            exists('app/not-found.tsx'),
            exists('app/discover/page.tsx'),
            exists('app/upload/page.tsx'),
        ])).resolves.toEqual([true, true, true, true, true, false, false]);
        const screening = await readFile('app/s/[id]/page.tsx', 'utf8');
        expect(screening).toContain('/^[A-Za-z0-9._:-]{1,128}$/');
        expect(screening).toContain('if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1) return <RuntimeClosed />;');
        expect(await readFile('app/studio/new/page.tsx', 'utf8')).toContain('if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1) return <RuntimeClosed />;');
        expect(await readFile('app/profile/page.tsx', 'utf8')).toContain("export { default } from '@/app/studio/page';");
    });

    it('opens publication reads without opening paid media actions', async () => {
        const [discover, profile, card] = await Promise.all([
            readFile('app/page.tsx', 'utf8'),
            readFile('components/studio/StudioView.tsx', 'utf8'),
            readFile('components/VideoCard.tsx', 'utf8'),
        ]);

        expect(discover).toContain('!FEATURE_FLAGS.enablePaidMediaLivepeerV1 && !FEATURE_FLAGS.enableDerivedReadModel');
        expect(profile).toContain('!FEATURE_FLAGS.enablePaidMediaLivepeerV1 && !FEATURE_FLAGS.enableDerivedReadModel');
        expect(profile).toContain('enabled: Boolean(accountId && FEATURE_FLAGS.enableDerivedReadModel && !FEATURE_FLAGS.enableCurrentCatalog)');
        expect(profile).toContain('FEATURE_FLAGS.enablePaidMediaLivepeerV1 && (');
        expect(card).toContain('return FEATURE_FLAGS.enablePaidMediaLivepeerV1 ? (');
    });
});
