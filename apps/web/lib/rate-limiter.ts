/**
 * Simple in-memory rate limiter for API endpoints
 * Uses sliding window algorithm for accurate rate limiting
 */

interface RateLimitEntry {
    timestamps: number[];
}

interface RateLimiterConfig {
    windowMs: number;      // Time window in milliseconds
    maxRequests: number;   // Max requests per window
}

class RateLimiter {
    private cache: Map<string, RateLimitEntry> = new Map();
    private config: RateLimiterConfig;

    constructor(config: RateLimiterConfig) {
        this.config = config;

        // Clean up old entries periodically
        if (typeof setInterval !== 'undefined') {
            setInterval(() => this.cleanup(), this.config.windowMs);
        }
    }

    /**
     * Check if a request should be allowed
     * @param identifier - Unique identifier (IP, account ID, etc.)
     * @returns true if allowed, false if rate limited
     */
    checkLimit(identifier: string): boolean {
        const now = Date.now();
        const windowStart = now - this.config.windowMs;

        let entry = this.cache.get(identifier);
        if (!entry) {
            entry = { timestamps: [] };
            this.cache.set(identifier, entry);
        }

        // Remove timestamps outside the window
        entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);

        // Check if under limit
        if (entry.timestamps.length >= this.config.maxRequests) {
            return false;
        }

        // Add current timestamp
        entry.timestamps.push(now);
        return true;
    }

    /**
     * Get remaining requests for an identifier
     */
    getRemainingRequests(identifier: string): number {
        const now = Date.now();
        const windowStart = now - this.config.windowMs;
        const entry = this.cache.get(identifier);

        if (!entry) {
            return this.config.maxRequests;
        }

        const validTimestamps = entry.timestamps.filter(ts => ts > windowStart);
        return Math.max(0, this.config.maxRequests - validTimestamps.length);
    }

    /**
     * Get time until rate limit resets (in ms)
     */
    getResetTime(identifier: string): number {
        const entry = this.cache.get(identifier);
        if (!entry || entry.timestamps.length === 0) {
            return 0;
        }

        const oldestTimestamp = Math.min(...entry.timestamps);
        const resetTime = oldestTimestamp + this.config.windowMs - Date.now();
        return Math.max(0, resetTime);
    }

    /**
     * Clean up expired entries
     */
    private cleanup(): void {
        const now = Date.now();
        const windowStart = now - this.config.windowMs;

        for (const [identifier, entry] of this.cache.entries()) {
            entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);
            if (entry.timestamps.length === 0) {
                this.cache.delete(identifier);
            }
        }
    }
}

// Pre-configured rate limiters for different endpoints

/**
 * PKP Minting Rate Limiter
 *
 * SECURITY: PKP minting costs real ETH gas on Chronicle Yellowstone
 *
 * Limit: 5 PKP per day per account
 *
 * Why 5/day:
 * - PKP is stored in localStorage
 * - If user clears localStorage, they can recover quickly
 * - Prevents major abuse while allowing reasonable usage
 * - Max cost: 5 × ~0.005 ETH = ~0.025 ETH/day per account
 */
export const pkpMintLimiter = new RateLimiter({
    windowMs: 24 * 60 * 60 * 1000,  // 24 hours (1 day)
    maxRequests: 5                   // 5 PKP per day per account
});

/**
 * Video Upload Rate Limiter
 *
 * Crust W3Auth storage is free, but we rate limit to prevent abuse
 * and ensure fair usage across all creators.
 *
 * Limit: 10 uploads per hour
 */
export const uploadLimiter = new RateLimiter({
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 10            // 10 uploads per hour
});

// Trial account creation limiter (per IP)
// Prevents spam account creation
export const trialAccountLimiter = new RateLimiter({
    windowMs: 24 * 60 * 60 * 1000,  // 24 hours (1 day)
    maxRequests: 3                   // Max 3 trial accounts per IP per day
});

// Daily global trial account limit tracking
// This is a simple counter, not a per-identifier limiter
class DailyGlobalLimiter {
    private count: number = 0;
    private lastReset: number = Date.now();
    private maxDaily: number;

    constructor(maxDaily: number) {
        this.maxDaily = maxDaily;
    }

    checkAndIncrement(): boolean {
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        // Reset counter if a day has passed
        if (now - this.lastReset > oneDayMs) {
            this.count = 0;
            this.lastReset = now;
        }

        if (this.count >= this.maxDaily) {
            return false;
        }

        this.count++;
        return true;
    }

    getRemaining(): number {
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        if (now - this.lastReset > oneDayMs) {
            return this.maxDaily;
        }

        return Math.max(0, this.maxDaily - this.count);
    }

    getCount(): number {
        return this.count;
    }
}

// Global daily limit for trial accounts (platform-wide)
export const trialDailyGlobalLimiter = new DailyGlobalLimiter(100); // Max 100 trials per day

export { RateLimiter };
export type { RateLimiterConfig };
