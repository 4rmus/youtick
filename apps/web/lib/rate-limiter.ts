/**
 * Rate limiter with file-based persistence
 *
 * Persists state to /tmp/youtick-rate-limits/ so limits survive hot restarts.
 * On cold start, DailyGlobalLimiter syncs from the NEAR contract's
 * get_daily_trial_count() view method.
 *
 * All file I/O is wrapped in try/catch for graceful degradation — if
 * persistence fails, the limiter falls back to in-memory only.
 *
 * Limitation: /tmp/ is ephemeral on serverless platforms (Vercel, AWS Lambda).
 * For production at scale, consider migrating to Upstash Redis or similar.
 * Current mitigations:
 * - File-based persistence survives Next.js hot restarts
 * - Contract sync on cold start restores global trial count
 * - Per-IP limits are best-effort (acceptable for anti-spam)
 */

import * as fs from 'fs';
import * as path from 'path';

const isServer = typeof window === 'undefined';

const PERSIST_DIR = '/tmp/youtick-rate-limits';
const SAVE_INTERVAL_MS = 60_000; // 60s

interface RateLimitEntry {
    timestamps: number[];
}

interface RateLimiterConfig {
    windowMs: number;      // Time window in milliseconds
    maxRequests: number;   // Max requests per window
}

/** Ensure persistence directory exists (server only) */
function ensureDir(): void {
    if (!isServer) return;
    try {
        if (!fs.existsSync(PERSIST_DIR)) {
            fs.mkdirSync(PERSIST_DIR, { recursive: true });
        }
    } catch {
        // Graceful degradation — directory creation failed
    }
}

class RateLimiter {
    private cache: Map<string, RateLimitEntry> = new Map();
    private config: RateLimiterConfig;
    private persistenceKey: string | undefined;

    constructor(config: RateLimiterConfig, persistenceKey?: string) {
        this.config = config;
        this.persistenceKey = persistenceKey;

        if (isServer && persistenceKey) {
            ensureDir();
            this.loadState();
            // Periodic save
            if (typeof setInterval !== 'undefined') {
                setInterval(() => this.saveState(), SAVE_INTERVAL_MS);
            }
        }

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

    /** Persist state to file */
    private saveState(): void {
        if (!isServer || !this.persistenceKey) return;
        try {
            const filePath = path.join(PERSIST_DIR, `${this.persistenceKey}.json`);
            const data: Record<string, number[]> = {};
            for (const [id, entry] of this.cache.entries()) {
                data[id] = entry.timestamps;
            }
            fs.writeFileSync(filePath, JSON.stringify({ savedAt: Date.now(), data }));
        } catch {
            // Graceful degradation
        }
    }

    /** Load state from file */
    private loadState(): void {
        if (!isServer || !this.persistenceKey) return;
        try {
            const filePath = path.join(PERSIST_DIR, `${this.persistenceKey}.json`);
            if (!fs.existsSync(filePath)) return;

            const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const savedAt = raw.savedAt as number;

            // Ignore stale state (older than 2x window)
            if (Date.now() - savedAt > this.config.windowMs * 2) return;

            const data = raw.data as Record<string, number[]>;
            const now = Date.now();
            const windowStart = now - this.config.windowMs;

            for (const [id, timestamps] of Object.entries(data)) {
                const valid = timestamps.filter(ts => ts > windowStart);
                if (valid.length > 0) {
                    this.cache.set(id, { timestamps: valid });
                }
            }
        } catch {
            // Graceful degradation — start fresh
        }
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

// Daily global trial account limit tracking with file persistence + contract sync
class DailyGlobalLimiter {
    private count: number = 0;
    private lastReset: number = Date.now();
    private lastSync: number = 0;
    private maxDaily: number;
    private syncing: boolean = false;

    private static readonly SYNC_INTERVAL_MS = 5 * 60 * 1000; // Re-sync every 5 minutes

    constructor(maxDaily: number) {
        this.maxDaily = maxDaily;

        if (isServer) {
            ensureDir();
            this.loadState();
            // Non-blocking contract sync on startup
            this.syncFromContract().catch(() => {});
            // Periodic save
            if (typeof setInterval !== 'undefined') {
                setInterval(() => this.saveState(), SAVE_INTERVAL_MS);
            }
        }
    }

    checkAndIncrement(): boolean {
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        // Reset counter if a day has passed
        if (now - this.lastReset > oneDayMs) {
            this.count = 0;
            this.lastReset = now;
        }

        // Periodic re-sync from contract (non-blocking)
        if (isServer && !this.syncing && now - this.lastSync > DailyGlobalLimiter.SYNC_INTERVAL_MS) {
            this.syncing = true;
            this.syncFromContract()
                .catch(() => {})
                .finally(() => { this.syncing = false; });
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

    /** Persist state to file */
    private saveState(): void {
        if (!isServer) return;
        try {
            const filePath = path.join(PERSIST_DIR, 'daily-global.json');
            fs.writeFileSync(filePath, JSON.stringify({
                savedAt: Date.now(),
                count: this.count,
                lastReset: this.lastReset,
            }));
        } catch {
            // Graceful degradation
        }
    }

    /** Load state from file */
    private loadState(): void {
        if (!isServer) return;
        try {
            const filePath = path.join(PERSIST_DIR, 'daily-global.json');
            if (!fs.existsSync(filePath)) return;

            const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const oneDayMs = 24 * 60 * 60 * 1000;

            // Ignore stale state (older than 2 days)
            if (Date.now() - (raw.savedAt as number) > oneDayMs * 2) return;

            // Only restore if same day
            if (Date.now() - (raw.lastReset as number) < oneDayMs) {
                this.count = raw.count as number;
                this.lastReset = raw.lastReset as number;
            }
        } catch {
            // Graceful degradation — start fresh
        }
    }

    /** Sync count from NEAR contract (on cold start and periodically) */
    private async syncFromContract(): Promise<void> {
        if (!isServer) return;
        try {
            this.lastSync = Date.now();
            const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'youtick.near';
            const networkId = process.env.NEXT_PUBLIC_NEAR_NETWORK || 'mainnet';

            const rpcUrl = networkId === 'mainnet'
                ? 'https://rpc.mainnet.near.org'
                : 'https://rpc.testnet.near.org';

            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'rate-limiter-sync',
                    method: 'query',
                    params: {
                        request_type: 'call_function',
                        finality: 'final',
                        account_id: contractId,
                        method_name: 'get_daily_trial_count',
                        args_base64: btoa('{}'),
                    },
                }),
            });

            const data = await response.json();
            if (data.result?.result) {
                const decoded = JSON.parse(
                    Buffer.from(data.result.result).toString('utf-8'),
                );
                const contractCount = typeof decoded === 'number' ? decoded : 0;

                // Use the higher of file count vs contract count
                if (contractCount > this.count) {
                    this.count = contractCount;
                }
            }
        } catch {
            // Non-critical — continue with file/memory state
        }
    }
}

// Pre-configured rate limiters for different endpoints

// Trial account creation limiter (per IP)
// Prevents spam account creation
export const trialAccountLimiter = new RateLimiter({
    windowMs: 24 * 60 * 60 * 1000,  // 24 hours (1 day)
    maxRequests: 3                   // Max 3 trial accounts per IP per day
}, 'trial-per-ip');

// Global daily limit for trial accounts (platform-wide)
export const trialDailyGlobalLimiter = new DailyGlobalLimiter(100); // Max 100 trials per day

export { RateLimiter };
export type { RateLimiterConfig };
