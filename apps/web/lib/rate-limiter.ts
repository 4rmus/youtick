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
export const pkpMintLimiter = new RateLimiter({
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: 5          // 5 PKP mints per minute per identifier
});

export const uploadLimiter = new RateLimiter({
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: 10         // 10 uploads per minute
});

export { RateLimiter };
export type { RateLimiterConfig };
