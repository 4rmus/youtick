// lib/near.ts - near-api-js v7 compatible
import { Account, JsonRpcProvider, PublicKey } from 'near-api-js';
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

// Primary RPC URL (first in list)
const RPC_URL = getPrimaryRpcUrl();

// v7: viewContract helper since Account.viewFunction doesn't exist
async function viewContract<T>(
    provider: JsonRpcProvider,
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
 * Get JSON RPC Provider for direct queries
 */
export function getProvider(): JsonRpcProvider {
    return new JsonRpcProvider({ url: RPC_URL });
}

/**
 * Result of NFT ownership verification
 */
export interface OwnershipResult {
    isOwner: boolean;
    error?: string;
}

/**
 * Server-side NFT ownership verification
 * SECURITY: Verifies ownership on-chain via NEAR RPC
 *
 * @returns Object with isOwner boolean and optional error message
 */
export async function verifyNftOwnership(
    walletAddress: string,
    tokenId: string
): Promise<OwnershipResult> {
    try {
        // v7: Use JsonRpcProvider directly for view calls
        const provider = getProvider();

        // Call view function on contract
        const isOwner = await viewContract<boolean>(
            provider,
            NFT_CONTRACT_ID,
            'verify_ownership',
            {
                account_id: walletAddress,
                token_id: tokenId,
            }
        );

        return { isOwner: Boolean(isOwner) };
    } catch (error) {
        console.error("Error verifying NFT ownership:", error);

        // Distinguish between "not owner" and "verification failed"
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return {
            isOwner: false,
            error: `Verification failed: ${errorMessage}`
        };
    }
}

/**
 * Verifies a NEAR wallet signature
 *
 * SECURITY: Real cryptographic signature verification using NEAR API
 *
 * @param walletAddress - The NEAR wallet address that allegedly signed the message
 * @param message - The original message that was signed
 * @param signature - The signature to verify (base64 encoded)
 * @param publicKey - The public key associated with the wallet
 * @returns true if signature is valid, false otherwise
 */
export async function verifySignature(
    walletAddress: string,
    message: string,
    signature: string,
    publicKey: string
): Promise<boolean> {
    try {
        // Convert message to bytes
        const messageBytes = Buffer.from(message);

        // Convert signature from base64 to bytes
        const signatureBytes = Buffer.from(signature, 'base64');

        // v7: Create PublicKey instance directly
        const pubKey = PublicKey.fromString(publicKey);

        // Verify the signature
        const isValid = pubKey.verify(messageBytes, signatureBytes);

        if (!isValid) {
            console.error('Signature verification failed: Invalid signature');
            return false;
        }

        // Additional security: verify the public key belongs to the wallet
        // by checking it's in the wallet's access keys
        const account = new Account(walletAddress, RPC_URL);
        const accessKeyList = await account.getAccessKeyList();

        const keyExists = accessKeyList.keys.some(
            (keyInfo: { public_key: string }) => keyInfo.public_key === publicKey
        );

        if (!keyExists) {
            console.error('Signature verification failed: Public key not associated with wallet');
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error verifying NEAR signature:', error);
        return false;
    }
}

// Export viewContract helper for view calls
export { viewContract };

// Export keystore instances for use in other modules
export { browserKeyStore, inMemoryKeyStore };
export { NETWORK_ID, RPC_URL, NFT_CONTRACT_ID };
// Export RPC failover utilities
export { getCurrentRpcUrl, withRpcFailover, RPC_ENDPOINTS };
