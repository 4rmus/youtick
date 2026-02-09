/**
 * RPC Failover Module
 * Centralized RPC endpoint management with automatic failover
 *
 * USAGE:
 * import { getCurrentRpcUrl, withRpcFailover, RPC_ENDPOINTS } from '@/lib/rpc-failover';
 */

import { NEAR_CONFIG } from './constants';

// RPC Endpoints - ordered by priority
export const MAINNET_RPC_ENDPOINTS = [
    'https://free.rpc.fastnear.com',
    'https://near-mainnet.lava.build',
    'https://rpc.mainnet.near.org',
    'https://rpc.mainnet.pagoda.co',
];

export const TESTNET_RPC_ENDPOINTS = [
    'https://test.rpc.fastnear.com',
    'https://rpc.testnet.near.org',
    'https://near-testnet.lava.build',
];

// Select endpoints based on network
export const RPC_ENDPOINTS = NEAR_CONFIG.networkId === 'mainnet'
    ? MAINNET_RPC_ENDPOINTS
    : TESTNET_RPC_ENDPOINTS;

// Track current working endpoint index (module-level state)
let currentRpcIndex = 0;

/**
 * Get the current best RPC URL
 */
export function getCurrentRpcUrl(): string {
    return RPC_ENDPOINTS[currentRpcIndex];
}

/**
 * Get the primary RPC URL (first in list)
 */
export function getPrimaryRpcUrl(): string {
    return RPC_ENDPOINTS[0];
}

/**
 * Try next RPC endpoint on failure
 * @returns false when cycled back to start (all endpoints tried)
 */
export function switchToNextRpc(): boolean {
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

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn(getCurrentRpcUrl());
        } catch (e: unknown) {
            const error = e instanceof Error ? e : new Error(String(e));
            lastError = error;

            console.warn(`[RPC Failover] Attempt ${attempt + 1} failed:`, error.message);

            // Only switch RPC if it looks like a network/RPC error
            if (isRpcError(error)) {
                switchToNextRpc();
                // Exponential backoff
                await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            } else {
                // Not an RPC error, don't retry
                throw error;
            }
        }
    }

    throw lastError || new Error('All RPC endpoints failed');
}

/**
 * Execute with RPC failover (no callback, simpler API)
 * Returns the current RPC URL for manual usage
 *
 * @example
 * const rpcUrl = getRpcUrlWithFallback();
 * const provider = new JsonRpcProvider({ url: rpcUrl });
 */
export function getRpcUrlWithFallback(): string {
    return getCurrentRpcUrl();
}
