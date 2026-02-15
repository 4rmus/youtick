// lib/near.ts - near-api-js v7 compatible
import { Account, FailoverRpcProvider, JsonRpcProvider } from 'near-api-js';
import { browserKeyStore, inMemoryKeyStore } from './keystore-v7';
import { NEAR_CONFIG } from './constants';
import {
    getCurrentRpcUrl,
    getPrimaryRpcUrl,
    withRpcFailover,
    RPC_ENDPOINTS
} from './rpc-failover';

// Re-export from constants for backwards compatibility
const NFT_CONTRACT_ID = NEAR_CONFIG.contractId;
const NETWORK_ID = NEAR_CONFIG.networkId;

// Primary RPC URL (first in list) - used for Account instances that need a single URL
const RPC_URL = getPrimaryRpcUrl();

// Failover provider with all RPC endpoints for resilient queries
const failoverProvider = new FailoverRpcProvider(
    RPC_ENDPOINTS.map(url => new JsonRpcProvider({ url }))
);

// v7: viewContract helper since Account.viewFunction doesn't exist
async function viewContract<T>(
    provider: JsonRpcProvider | FailoverRpcProvider,
    contractId: string,
    methodName: string,
    args: Record<string, unknown> = {}
): Promise<T> {
    const result = await provider.query({
        request_type: 'call_function',
        account_id: contractId,
        method_name: methodName,
        args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
        finality: 'final',
    }) as { result: number[] };

    const resultStr = String.fromCharCode(...result.result);
    return JSON.parse(resultStr) as T;
}

/**
 * Get a NEAR Account instance (v7 pattern)
 * For read-only operations, no signer needed
 */
export async function getAccount(accountId: string): Promise<Account> {
    const signer = await browserKeyStore.getSigner(NETWORK_ID, accountId);
    return new Account(accountId, RPC_URL, signer || undefined);
}

/**
 * Get a read-only NEAR Account (no signer, for view calls)
 */
export function getReadOnlyAccount(accountId: string): Account {
    return new Account(accountId, RPC_URL);
}

/**
 * Get JSON RPC Provider with automatic failover across all RPC endpoints.
 * Uses near-api-js v7 FailoverRpcProvider for resilient queries.
 */
export function getProvider(): FailoverRpcProvider {
    return failoverProvider;
}

// Export viewContract helper for view calls
export { viewContract };

// Export keystore instances for use in other modules
export { browserKeyStore, inMemoryKeyStore };
export { NETWORK_ID, RPC_URL, NFT_CONTRACT_ID };
// Export RPC failover utilities
export { getCurrentRpcUrl, withRpcFailover, RPC_ENDPOINTS };
// Export failover provider type for consumers that need it
export { FailoverRpcProvider };
