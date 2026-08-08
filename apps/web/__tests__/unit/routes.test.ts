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
});
