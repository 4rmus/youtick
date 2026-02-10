/**
 * Rate Limiter Tests
 *
 * Tests sliding window rate limiting and daily global limiter.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs and path for node environment
vi.mock('fs', () => ({
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{}'),
}));

vi.mock('path', () => ({
    join: (...parts: string[]) => parts.join('/'),
}));

// Import after mocks
import { RateLimiter, trialAccountLimiter } from '../../lib/rate-limiter';

describe('RateLimiter', () => {
    let limiter: InstanceType<typeof RateLimiter>;

    beforeEach(() => {
        vi.useFakeTimers();
        limiter = new RateLimiter({ windowMs: 60000, maxRequests: 3 });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should allow requests under the limit', () => {
        expect(limiter.checkLimit('user1')).toBe(true);
        expect(limiter.checkLimit('user1')).toBe(true);
        expect(limiter.checkLimit('user1')).toBe(true);
    });

    it('should block requests over the limit', () => {
        limiter.checkLimit('user1');
        limiter.checkLimit('user1');
        limiter.checkLimit('user1');
        expect(limiter.checkLimit('user1')).toBe(false);
    });

    it('should track different identifiers separately', () => {
        limiter.checkLimit('user1');
        limiter.checkLimit('user1');
        limiter.checkLimit('user1');

        // user2 should still be allowed
        expect(limiter.checkLimit('user2')).toBe(true);
    });

    it('should report remaining requests correctly', () => {
        expect(limiter.getRemainingRequests('user1')).toBe(3);
        limiter.checkLimit('user1');
        expect(limiter.getRemainingRequests('user1')).toBe(2);
        limiter.checkLimit('user1');
        limiter.checkLimit('user1');
        expect(limiter.getRemainingRequests('user1')).toBe(0);
    });

    it('should reset after window expires', () => {
        limiter.checkLimit('user1');
        limiter.checkLimit('user1');
        limiter.checkLimit('user1');
        expect(limiter.checkLimit('user1')).toBe(false);

        // Advance time past the window
        vi.advanceTimersByTime(61000);

        expect(limiter.checkLimit('user1')).toBe(true);
    });

    it('should return 0 reset time for unknown identifiers', () => {
        expect(limiter.getResetTime('unknown')).toBe(0);
    });
});
