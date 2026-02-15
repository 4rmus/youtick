/**
 * Persistent Retry Queue for Nova Group Access
 *
 * When addBuyerToNovaGroup fails after a ticket purchase, the entry is
 * queued here (localStorage-backed) so background workers and the
 * self-healing player can retry with exponential backoff.
 *
 * Guarantees: max 10 attempts, 24-hour TTL, deduplication by cid+account.
 */

import { addBuyerToNovaGroup } from './post-purchase';

export interface PendingAccessEntry {
  eventCid: string;
  buyerAccountId: string;
  addedAt: number;
  attempts: number;
  lastAttempt: number;
  nextRetryAt: number;
}

export interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
}

const STORAGE_KEY = 'youtick:pending_nova_access';
const MAX_ATTEMPTS = 10;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
// Backoff schedule in seconds: 5s, 15s, 30s, 1m, 5m, 15m, 1h, 2h, 4h
const BACKOFF_SECONDS = [5, 15, 30, 60, 300, 900, 3600, 7200, 14400];

function entryKey(eventCid: string, buyerAccountId: string): string {
  return `${eventCid}::${buyerAccountId}`;
}

class PendingAccessQueue {
  private processing = false;

  /** Read all entries from localStorage */
  getAll(): PendingAccessEntry[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as PendingAccessEntry[];
    } catch {
      return [];
    }
  }

  /** Write entries to localStorage */
  private save(entries: PendingAccessEntry[]): void {
    if (typeof window === 'undefined') return;
    try {
      if (entries.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      }
    } catch {
      // localStorage full or unavailable — silently drop
    }
  }

  /** Add or update an entry in the queue */
  add(eventCid: string, buyerAccountId: string): void {
    const entries = this.getAll();
    const key = entryKey(eventCid, buyerAccountId);
    const idx = entries.findIndex(e => entryKey(e.eventCid, e.buyerAccountId) === key);

    const now = Date.now();

    if (idx >= 0) {
      // Already queued — bump attempts and set next retry
      const existing = entries[idx];
      const backoffIdx = Math.min(existing.attempts, BACKOFF_SECONDS.length - 1);
      entries[idx] = {
        ...existing,
        attempts: existing.attempts + 1,
        lastAttempt: now,
        nextRetryAt: now + BACKOFF_SECONDS[backoffIdx] * 1000,
      };
    } else {
      // New entry
      entries.push({
        eventCid,
        buyerAccountId,
        addedAt: now,
        attempts: 0,
        lastAttempt: 0,
        nextRetryAt: now + BACKOFF_SECONDS[0] * 1000,
      });
    }

    this.save(entries);
    console.log(`[Nova AccessQueue] Queued: ${buyerAccountId} → ${eventCid}`);
  }

  /** Remove a successfully synced entry */
  remove(eventCid: string, buyerAccountId: string): void {
    const entries = this.getAll();
    const key = entryKey(eventCid, buyerAccountId);
    const filtered = entries.filter(e => entryKey(e.eventCid, e.buyerAccountId) !== key);

    if (filtered.length !== entries.length) {
      this.save(filtered);
      console.log(`[Nova AccessQueue] Resolved: ${buyerAccountId} → ${eventCid}`);
    }
  }

  /** Check if an entry is pending */
  hasPending(eventCid: string, buyerAccountId: string): boolean {
    const key = entryKey(eventCid, buyerAccountId);
    return this.getAll().some(e => entryKey(e.eventCid, e.buyerAccountId) === key);
  }

  /** Get entries eligible for retry right now */
  getRetryable(): PendingAccessEntry[] {
    const now = Date.now();
    return this.getAll().filter(e =>
      e.nextRetryAt <= now &&
      e.attempts < MAX_ATTEMPTS &&
      (now - e.addedAt) < MAX_AGE_MS
    );
  }

  /**
   * Process all retryable entries: retry addBuyerToNovaGroup,
   * remove on success, update backoff on failure, prune expired.
   */
  async processQueue(): Promise<ProcessResult> {
    // Prevent concurrent processing
    if (this.processing) return { processed: 0, succeeded: 0, failed: 0 };
    this.processing = true;

    const result: ProcessResult = { processed: 0, succeeded: 0, failed: 0 };

    try {
      const retryable = this.getRetryable();
      if (retryable.length === 0) {
        // Still prune expired entries
        this.pruneExpired();
        return result;
      }

      console.log(`[Nova AccessQueue] Processing ${retryable.length} pending entries...`);

      for (const entry of retryable) {
        result.processed++;
        try {
          await addBuyerToNovaGroup(entry.eventCid, entry.buyerAccountId);
          this.remove(entry.eventCid, entry.buyerAccountId);
          result.succeeded++;
          console.log(`[Nova AccessQueue] Success: ${entry.buyerAccountId} → ${entry.eventCid}`);
        } catch (err) {
          result.failed++;
          // Update the entry with new backoff
          const entries = this.getAll();
          const key = entryKey(entry.eventCid, entry.buyerAccountId);
          const idx = entries.findIndex(e => entryKey(e.eventCid, e.buyerAccountId) === key);
          if (idx >= 0) {
            const now = Date.now();
            const newAttempts = entries[idx].attempts + 1;
            const backoffIdx = Math.min(newAttempts, BACKOFF_SECONDS.length - 1);
            entries[idx] = {
              ...entries[idx],
              attempts: newAttempts,
              lastAttempt: now,
              nextRetryAt: now + BACKOFF_SECONDS[backoffIdx] * 1000,
            };
            this.save(entries);
          }
          console.warn(`[Nova AccessQueue] Retry failed (attempt ${entry.attempts + 1}): ${entry.buyerAccountId}`, err);
        }
      }

      this.pruneExpired();
    } finally {
      this.processing = false;
    }

    return result;
  }

  /** Remove entries that have expired (> 24h) or exceeded max attempts */
  private pruneExpired(): void {
    const now = Date.now();
    const entries = this.getAll();
    const before = entries.length;
    const filtered = entries.filter(e =>
      (now - e.addedAt) < MAX_AGE_MS && e.attempts < MAX_ATTEMPTS
    );
    if (filtered.length !== before) {
      this.save(filtered);
      console.log(`[Nova AccessQueue] Pruned ${before - filtered.length} expired entries`);
    }
  }
}

/** Singleton queue instance */
export const pendingAccessQueue = new PendingAccessQueue();
