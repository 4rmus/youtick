import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config';

describe('security headers', () => {
    it('does not install a static CSP that would override request nonces', () => {
        expect(nextConfig.headers).toBeUndefined();
    });
});
