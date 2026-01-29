/**
 * Crust Gateway Management
 *
 * Provides multi-gateway failover for IPFS content retrieval.
 * Follows the same pattern as rpc-failover.ts for consistency.
 *
 * Upload Gateway: crustipfs.xyz (only one supporting W3Auth)
 *
 * Retrieval Priority (optimized for speed):
 * 1. ipfs.io (IPFS Foundation - fast, reliable)
 * 2. dweb.link (Web3.Storage - good availability)
 * 3. crustipfs.xyz (Crust primary)
 * 4. gw.crustfiles.app (Crust secondary)
 *
 * Note: Crust gateways need pinning propagation time,
 * so we prioritize global IPFS gateways for retrieval.
 */

import type { GatewayConfig } from './types';

/**
 * Upload gateway - only crustipfs.xyz supports W3Auth
 */
export const UPLOAD_GATEWAY = 'https://crustipfs.xyz';

/**
 * Retrieval gateways in priority order
 * Prioritized by reliability and speed, not by storage provider
 */
export const RETRIEVAL_GATEWAYS: GatewayConfig[] = [
    {
        url: 'https://ipfs.io',
        priority: 1,
        supportsUpload: false
    },
    {
        url: 'https://dweb.link',
        priority: 2,
        supportsUpload: false
    },
    {
        url: 'https://w3s.link',
        priority: 3,
        supportsUpload: false
    },
    {
        url: 'https://crustipfs.xyz',
        priority: 4,
        supportsUpload: true
    },
    {
        url: 'https://gw.crustfiles.app',
        priority: 5,
        supportsUpload: false
    }
];

/**
 * @deprecated Use RETRIEVAL_GATEWAYS instead
 */
export const CRUST_GATEWAYS = RETRIEVAL_GATEWAYS;

// Module-level state for current gateway
let currentGatewayIndex = 0;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Get the current active retrieval gateway URL
 */
export function getCurrentGateway(): string {
    return RETRIEVAL_GATEWAYS[currentGatewayIndex].url;
}

/**
 * Get the upload gateway (always crustipfs.xyz for W3Auth)
 */
export function getUploadGateway(): string {
    return UPLOAD_GATEWAY;
}

/**
 * Switch to the next available gateway
 *
 * @returns true if switched to a new gateway, false if wrapped around
 */
export function switchToNextGateway(): boolean {
    const previousIndex = currentGatewayIndex;
    currentGatewayIndex = (currentGatewayIndex + 1) % RETRIEVAL_GATEWAYS.length;

    const wrapped = currentGatewayIndex === 0;
    const previousGateway = RETRIEVAL_GATEWAYS[previousIndex].url;
    const newGateway = RETRIEVAL_GATEWAYS[currentGatewayIndex].url;

    console.warn(`[Gateway Failover] ${previousGateway} -> ${newGateway}`);

    if (wrapped) {
        consecutiveFailures++;
        console.warn(`[Gateway Failover] All gateways tried. Cycle ${consecutiveFailures}`);
    }

    return !wrapped;
}

/**
 * Reset gateway to primary
 */
export function resetGateway(): void {
    currentGatewayIndex = 0;
    consecutiveFailures = 0;
    console.log('[Gateway] Reset to primary:', RETRIEVAL_GATEWAYS[0].url);
}

/**
 * Mark current gateway as successful (reset failure count)
 */
export function markGatewaySuccess(): void {
    consecutiveFailures = 0;
}

/**
 * Check if error is a gateway-related error
 */
function isGatewayError(error: Error): boolean {
    const message = error.message?.toLowerCase() || '';
    return (
        message.includes('fetch') ||
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504') ||
        message.includes('failed to fetch')
    );
}

/**
 * Build full URL for a CID
 *
 * @param cid - IPFS CID
 * @param gateway - Optional specific gateway URL
 */
export function getGatewayUrl(cid: string, gateway?: string): string {
    const baseUrl = gateway || getCurrentGateway();
    return `${baseUrl}/ipfs/${cid}`;
}

/**
 * Fetch content from IPFS with automatic gateway failover
 *
 * @param cid - IPFS CID to fetch
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Response from successful gateway
 * @throws Error if all gateways fail
 */
export async function fetchWithFailover(
    cid: string,
    maxRetries: number = 3
): Promise<Response> {
    let lastError: Error | null = null;
    const totalAttempts = maxRetries * CRUST_GATEWAYS.length;

    for (let attempt = 0; attempt < totalAttempts; attempt++) {
        const url = getGatewayUrl(cid);

        try {
            console.log(`[Gateway] Fetching ${cid} from ${getCurrentGateway()} (attempt ${attempt + 1})`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

            const response = await fetch(url, {
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                markGatewaySuccess();
                return response;
            }

            // Non-OK response - treat as gateway error
            throw new Error(`Gateway returned ${response.status}: ${response.statusText}`);

        } catch (e: unknown) {
            const error = e instanceof Error ? e : new Error(String(e));
            lastError = error;

            console.warn(`[Gateway Failover] Attempt ${attempt + 1} failed:`, error.message);

            if (isGatewayError(error) || error.name === 'AbortError') {
                switchToNextGateway();
                // Exponential backoff
                const delay = Math.min(500 * Math.pow(2, attempt % CRUST_GATEWAYS.length), 5000);
                await new Promise(r => setTimeout(r, delay));
            } else {
                // Non-gateway error, throw immediately
                throw error;
            }
        }
    }

    // All attempts exhausted
    throw lastError || new Error(`Failed to fetch ${cid} from all gateways`);
}

/**
 * Prefetch content to check availability without downloading
 *
 * @param cid - IPFS CID to check
 * @returns true if content is available
 */
export async function checkAvailability(cid: string): Promise<boolean> {
    try {
        const url = getGatewayUrl(cid);
        const response = await fetch(url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(10000)
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Get gateway health status
 */
export function getGatewayStatus(): {
    current: string;
    index: number;
    consecutiveFailures: number;
    healthy: boolean;
} {
    return {
        current: getCurrentGateway(),
        index: currentGatewayIndex,
        consecutiveFailures,
        healthy: consecutiveFailures < MAX_CONSECUTIVE_FAILURES
    };
}

/**
 * Race multiple gateways and return fastest response
 *
 * Fires parallel requests to top N gateways, first successful response wins.
 * Other pending requests are automatically cancelled after the winner's body is consumed.
 * Falls back to sequential fetchWithFailover if all race attempts fail.
 *
 * @param cid - IPFS CID to fetch
 * @param options - Race options (timeout per gateway, max gateways to race)
 * @returns Response from fastest successful gateway
 */
export async function fetchWithRace(
    cid: string,
    options: { timeout?: number; maxGateways?: number } = {}
): Promise<Response> {
    const { timeout = 10000, maxGateways = 3 } = options;

    // Use top N fastest gateways based on priority
    const gateways = RETRIEVAL_GATEWAYS.slice(0, maxGateways);
    const controllers: AbortController[] = [];
    const startTime = Date.now();

    console.log(`[Gateway Race] Racing ${gateways.length} gateways for ${cid.slice(0, 12)}...`);

    const racePromises = gateways.map((gw, index) => {
        const controller = new AbortController();
        controllers.push(controller);

        return new Promise<{ response: Response; gateway: string; winnerIndex: number }>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                controller.abort();
                reject(new Error(`Timeout: ${gw.url}`));
            }, timeout);

            fetch(`${gw.url}/ipfs/${cid}`, { signal: controller.signal })
                .then(response => {
                    clearTimeout(timeoutId);
                    if (response.ok) {
                        resolve({ response, gateway: gw.url, winnerIndex: index });
                    } else {
                        reject(new Error(`HTTP ${response.status}: ${gw.url}`));
                    }
                })
                .catch(err => {
                    clearTimeout(timeoutId);
                    reject(err);
                });
        });
    });

    try {
        // Race all promises - first success wins
        const { response, gateway, winnerIndex } = await Promise.race(racePromises);

        // Cancel OTHER pending requests (not the winner!)
        controllers.forEach((c, i) => {
            if (i !== winnerIndex) {
                try { c.abort(); } catch { /* ignore */ }
            }
        });

        const elapsed = Date.now() - startTime;
        console.log(`[Gateway Race] Winner: ${gateway} (${elapsed}ms)`);
        markGatewaySuccess();

        return response;
    } catch {
        // All raced gateways failed - fallback to sequential with full retry logic
        console.warn('[Gateway Race] All gateways failed, falling back to sequential');
        return fetchWithFailover(cid);
    }
}
