import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config';

describe('security headers', () => {
    it('does not install a static CSP that would override request nonces', async () => {
        const rules = await nextConfig.headers!();
        for (const rule of rules) {
            expect(rule.headers.map(({ key }) => key.toLowerCase())).not.toContain('content-security-policy');
        }
    });

    it('applies HSTS, nosniff, Referrer-Policy and Permissions-Policy to every route, including /api', async () => {
        const rules = await nextConfig.headers!();
        expect(rules).toHaveLength(1);
        expect(rules[0].source).toBe('/:path*');
        const headers = Object.fromEntries(rules[0].headers.map(({ key, value }) => [key, value]));
        expect(headers['Strict-Transport-Security']).toMatch(/^max-age=\d{8,}/);
        expect(headers['X-Content-Type-Options']).toBe('nosniff');
        expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
        expect(headers['Permissions-Policy']).toContain('camera=()');
        expect(headers['Permissions-Policy']).not.toMatch(/fullscreen|picture-in-picture|clipboard-write/);
    });
});
