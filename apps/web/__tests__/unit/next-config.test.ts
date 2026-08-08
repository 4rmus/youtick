import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config';

describe('security headers', () => {
    it('allows the Cloudflare Web Analytics beacon', async () => {
        const routes = await nextConfig.headers?.();
        const csp = routes?.[0]?.headers.find((header) => header.key === 'Content-Security-Policy')?.value;

        expect(csp).toContain('https://static.cloudflareinsights.com/beacon.min.js');
        expect(csp).toContain("connect-src 'self'");
    });
});
