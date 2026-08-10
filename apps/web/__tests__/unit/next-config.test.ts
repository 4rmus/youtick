import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config';

describe('security headers', () => {
    it('sets the release headers without overriding request nonce CSP', async () => {
        expect(nextConfig.headers).toBeTypeOf('function');

        const rules = await nextConfig.headers?.();

        expect(rules).toEqual([{
            source: '/(.*)',
            headers: [
                { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
            ],
        }]);
        expect(rules?.flatMap((rule) => rule.headers).map((header) => header.key))
            .not.toContain('Content-Security-Policy');
    });
});
