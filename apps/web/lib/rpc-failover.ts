/**
 * RPC Failover Module
 * Centralized RPC endpoint management with automatic failover
 *
 * USAGE:
 * import { getCurrentRpcUrl, withRpcFailover, RPC_ENDPOINTS } from '@/lib/rpc-failover';
 */

import { APP_CONFIG, NEAR_CONFIG } from './constants';

export const NEAR_RPC_PROXY_PATH = '/api/near-rpc';

// RPC Endpoints - ordered by priority
export const MAINNET_RPC_ENDPOINTS = [
    NEAR_RPC_PROXY_PATH,
    // Browser RPC calls go through the same-origin proxy to avoid third-party
    // RPC CORS drift before wallet flows open.
];

export const TESTNET_RPC_ENDPOINTS = [
    NEAR_RPC_PROXY_PATH,
    // Browser RPC calls go through the same-origin proxy to avoid third-party
    // RPC CORS drift before wallet flows open.
];

// Select endpoints based on network
export const RPC_ENDPOINTS = NEAR_CONFIG.networkId === 'mainnet'
    ? MAINNET_RPC_ENDPOINTS
    : TESTNET_RPC_ENDPOINTS;

// Track current working endpoint index (module-level state)
let currentRpcIndex = 0;

function resolveRpcUrl(url: string): string {
    if (/^https?:\/\//.test(url)) return url;

    const origin = typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : APP_CONFIG.publicAppUrl;
    const normalizedOrigin = origin.replace(/\/$/, '');
    const normalizedPath = url.startsWith('/') ? url : `/${url}`;
    return `${normalizedOrigin}${normalizedPath}`;
}

export function getRpcEndpoints(): string[] {
    return RPC_ENDPOINTS.map(resolveRpcUrl);
}

/**
 * Get the current best RPC URL
 */
export function getCurrentRpcUrl(): string {
    return resolveRpcUrl(RPC_ENDPOINTS[currentRpcIndex]);
}

/**
 * Get the primary RPC URL (first in list)
 */
export function getPrimaryRpcUrl(): string {
    return resolveRpcUrl(RPC_ENDPOINTS[0]);
}

/**
 * Try next RPC endpoint on failure
 * @returns false when cycled back to start (all endpoints tried)
 */
export function switchToNextRpc(): boolean {
    if (RPC_ENDPOINTS.length < 2) {
        return false;
    }

    const previousIndex = currentRpcIndex;
    currentRpcIndex = (currentRpcIndex + 1) % RPC_ENDPOINTS.length;
    console.warn(`[RPC Failover] ${RPC_ENDPOINTS[previousIndex]} -> ${RPC_ENDPOINTS[currentRpcIndex]}`);
    return currentRpcIndex !== 0;
}

/**
 * Reset RPC to primary endpoint
 */
export function resetRpc(): void {
    currentRpcIndex = 0;
}

/**
 * Check if error is RPC-related (network/timeout)
 */
function isRpcError(error: Error): boolean {
    const message = error.message?.toLowerCase() || '';
    return (
        message.includes('fetch') ||
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('429') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504') ||
        message.includes('econnrefused') ||
        message.includes('enotfound')
    );
}

/**
 * Execute a function with RPC failover
 * Automatically switches to next RPC endpoint on network failures
 *
 * @param fn - Function that receives rpcUrl and returns a Promise
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Promise resolving to function result
 *
 * @example
 * const result = await withRpcFailover(async (rpcUrl) => {
 *     const account = new Account(accountId, rpcUrl);
 *     return account.getAccessKeyList();
 * });
 */
export async function withRpcFailover<T>(
    fn: (rpcUrl: string) => Promise<T>,
    maxRetries: number = 3
): Promise<T> {
    let lastError: Error | null = null;
    const attempts = Math.max(1, Math.min(maxRetries, RPC_ENDPOINTS.length));

    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            return await fn(getCurrentRpcUrl());
        } catch (e: unknown) {
            const error = e instanceof Error ? e : new Error(String(e));
            lastError = error;

            // Only switch RPC if it looks like a network/RPC error
            if (isRpcError(error)) {
                console.warn(`[RPC Failover] Attempt ${attempt + 1} failed:`, error.message);
                const canTryNextRpc = attempt < attempts - 1 && switchToNextRpc();
                if (canTryNextRpc) {
                    // Exponential backoff
                    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                } else {
                    break;
                }
            } else {
                // Not an RPC error, don't retry and don't log noise
                throw error;
            }
        }
    }

    throw lastError || new Error('All RPC endpoints failed');
}
