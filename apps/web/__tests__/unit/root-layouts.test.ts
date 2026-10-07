import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('root layouts', () => {
    it('serves Turkish pages from their own root layout with lang="tr" and latin-ext fonts', async () => {
        const [site, tr, shell] = await Promise.all([
            readFile('app/(site)/layout.tsx', 'utf8'),
            readFile('app/(tr)/layout.tsx', 'utf8'),
            readFile('components/RootShell.tsx', 'utf8'),
        ]);
        expect(site).toContain('<RootShell lang="en"');
        expect(tr).toContain('<RootShell lang="tr"');
        expect(shell).toContain('<html lang={lang}');
        // Turkish letters (ğ, ş, ı, İ) are in latin-ext; English pages do not preload it.
        expect(tr.match(/subsets: \['latin', 'latin-ext'\]/g)).toHaveLength(2);
        expect(site).not.toContain('latin-ext');
        await expect(access('app/(tr)/tr/page.tsx')).resolves.toBeUndefined();
    });

    it('has no top-level root layout that would put every page under one language', async () => {
        await expect(access('app/layout.tsx')).rejects.toThrow();
    });
});
