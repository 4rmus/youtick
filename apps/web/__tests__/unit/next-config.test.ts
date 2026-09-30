import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config';

describe('security headers', () => {
    it('does not install a static CSP that would override request nonces', () => {
        expect(nextConfig.headers).toBeUndefined();
    });
});

describe('Sahne redirects', () => {
    it('moves the old addresses permanently', async () => {
        const redirects = await nextConfig.redirects!();
        expect(redirects.map(({ source, destination, permanent }) => [source, destination, permanent])).toEqual([
            ['/watch', '/s/:job', true],
            ['/discover', '/', true],
            ['/upload', '/studio/new', true],
            ['/profile', '/studio', true],
        ]);
    });

    it('maps /watch only when the job query is a valid publication id', async () => {
        const [watch] = await nextConfig.redirects!();
        expect(watch.has).toEqual([{ type: 'query', key: 'job', value: '(?<job>[A-Za-z0-9._:-]{1,128})' }]);
        const pattern = new RegExp(`^${(watch.has![0] as { value: string }).value}$`);
        expect(pattern.exec('job-001.v1:abc')?.groups?.job).toBe('job-001.v1:abc');
        for (const invalid of ['', '../x', 'a b', 'a/b', 'x'.repeat(129)]) expect(pattern.test(invalid)).toBe(false);
    });
});
