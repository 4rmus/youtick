// lib/session-manager.ts - near-api-js v7 compatible
import {
    Account,
    KeyPair,
    KeyPairSigner,
    JsonRpcProvider,
    actions,
    nearToYocto,
    yoctoToNear,
    type KeyPairString,
    type Action
} from 'near-api-js';
import { BrowserKeyStore } from './keystore-v7';
import { NEAR_CONFIG } from './constants';
import { getCurrentRpcUrl, withRpcFailover } from './rpc-failover';
import type { WalletInstance } from './types';

/**
 * Raw transaction outcome shape from near-api-js v7.
 * Used internally for parsing transaction results.
 */
interface TransactionOutcomeRaw {
    status?: {
        SuccessValue?: string;
    };
    receipts_outcome?: Array<{
        outcome?: {
            status?: {
                SuccessValue?: string;
            };
        };
    }>;
}

// Re-export from constants for backwards compatibility
const NETWORK_ID = NEAR_CONFIG.networkId;
const CONTRACT_ID = NEAR_CONFIG.contractId;

export class SessionManager {
    private keyStore: BrowserKeyStore;
    private accountId: string;

    constructor(accountId: string) {
        this.accountId = accountId;
        this.keyStore = new BrowserKeyStore();
    }

    async hasSessionKey(): Promise<boolean> {
        const keyPair = await this.keyStore.getKey(NETWORK_ID, this.accountId);
        if (!keyPair) return false;

        // Verify key exists on-chain to avoid stale keys
        try {
            return await withRpcFailover(async (rpcUrl) => {
                // v7: Create Account directly with RPC URL
                const account = new Account(this.accountId, rpcUrl);
                const accessKeyList = await account.getAccessKeyList();
                const publicKey = keyPair.getPublicKey().toString();
                const accessKeyInfo = accessKeyList.keys.find(
                    (k: { public_key: string }) => k.public_key === publicKey
                );

                if (!accessKeyInfo) {
                    console.warn("Session key found locally but not on-chain. Removing.");
                    await this.keyStore.removeKey(NETWORK_ID, this.accountId);
                    return false;
                }

                // Verify the key is for the correct contract
                const permission = accessKeyInfo.access_key.permission;
                // Permission can be 'FullAccess' (string) or object with FunctionCall
                if (typeof permission === 'object' && 'FunctionCall' in permission) {
                    if (permission.FunctionCall.receiver_id !== CONTRACT_ID) {
                        console.warn(`Session key found but for wrong contract (${permission.FunctionCall.receiver_id} vs ${CONTRACT_ID}). Removing.`);
                        await this.keyStore.removeKey(NETWORK_ID, this.accountId);
                        return false;
                    }
                }
                return true;
            });
        } catch (e) {
            console.warn("Error checking session key on-chain (network issue?). Assuming local key is valid.", e);
            // Fallback: if we have a local key but can't check chain, assume it's valid to allow progress.
            // If it's actually invalid, the subsequent transaction will fail, which is handled.
            return true;
        }
    }

    async createSessionKey(wallet: WalletInstance, gasAmount: string = '1'): Promise<void> {
        // Generate new key pair
        const keyPair = KeyPair.fromRandom('ed25519');
        const publicKey = keyPair.getPublicKey().toString();

        // Store in local storage
        await this.keyStore.setKey(NETWORK_ID, this.accountId, keyPair);

        // Use batch transaction to add key AND deposit gas in one signature
        const { batchInitialSetup } = await import('./batch-transactions');

        await batchInitialSetup(
            wallet,
            this.accountId,
            CONTRACT_ID,
            publicKey,
            gasAmount
        );
    }

    /**
     * Create session key with minimal deposit
     * For users who already have sufficient balance for operations
     */
    async createSessionKeyMinimal(wallet: WalletInstance): Promise<void> {
        // Generate new key pair
        const keyPair = KeyPair.fromRandom('ed25519');
        const publicKey = keyPair.getPublicKey().toString();

        // Store in local storage
        await this.keyStore.setKey(NETWORK_ID, this.accountId, keyPair);

        // Use batch transaction with minimal deposit
        const { batchInitialSetup } = await import('./batch-transactions');

        await batchInitialSetup(
            wallet,
            this.accountId,
            CONTRACT_ID,
            publicKey,
            '0.5' // Covers: NFT mint (0.1) + Event (0.1) + buffer = 0.25 NEAR + margin. Nova group reg is funded separately for paid videos.
        );
    }

    /**
     * Generate a new session key pair, store it locally, and return the public key string.
     * Used when the caller handles the wallet batch transaction externally.
     */
    async generateSessionKeyPair(): Promise<string> {
        const keyPair = KeyPair.fromRandom('ed25519');
        const publicKey = keyPair.getPublicKey().toString();
        await this.keyStore.setKey(NETWORK_ID, this.accountId, keyPair);
        return publicKey;
    }

    async saveSessionKey(keyPair: KeyPair): Promise<void> {
        await this.keyStore.setKey(NETWORK_ID, this.accountId, keyPair);
    }

    async callMethod(method: string, args: Record<string, unknown>, gas: string = '300000000000000'): Promise<unknown> {
        const keyPair = await this.keyStore.getKey(NETWORK_ID, this.accountId);
        if (!keyPair) {
            throw new Error("No session key found. Please setup account first.");
        }

        // v7: Create Account with signer
        const signer = new KeyPairSigner(keyPair);
        const account = new Account(this.accountId, getCurrentRpcUrl(), signer);

        // Call contract method using the session key
        // Note: We cannot attach deposit with a FunctionCallKey!
        // This is why we use the Prepaid Proxy pattern.
        const outcome = await account.signAndSendTransaction({
            receiverId: CONTRACT_ID,
            actions: [
                actions.functionCall(method, args, BigInt(gas), BigInt(0))
            ]
        });

        // v7: Parse result from transaction
        return this.getTransactionResult(outcome as unknown as TransactionOutcomeRaw);
    }

    async sendBatchTransaction(txActions: Action[], gas: string = '300000000000000'): Promise<unknown> {
        const keyPair = await this.keyStore.getKey(NETWORK_ID, this.accountId);
        if (!keyPair) {
            throw new Error("No session key found. Please setup account first.");
        }

        // v7: Create Account with signer
        const signer = new KeyPairSigner(keyPair);
        const account = new Account(this.accountId, getCurrentRpcUrl(), signer);

        const outcome = await account.signAndSendTransaction({
            receiverId: CONTRACT_ID,
            actions: txActions
        });

        return this.getTransactionResult(outcome as unknown as TransactionOutcomeRaw);
    }

    /**
     * Extract result from transaction outcome (v7 pattern)
     */
    private getTransactionResult(outcome: TransactionOutcomeRaw): unknown {
        // v7: Transaction result is in outcome.transaction_outcome or final_execution_outcome
        if (outcome?.status?.SuccessValue) {
            const value = outcome.status.SuccessValue;
            if (value === '') return null;
            try {
                return JSON.parse(Buffer.from(value, 'base64').toString());
            } catch {
                return value;
            }
        }

        // Try to get from receipts
        if (outcome?.receipts_outcome) {
            for (const receipt of outcome.receipts_outcome) {
                if (receipt?.outcome?.status?.SuccessValue) {
                    const value = receipt.outcome.status.SuccessValue;
                    if (value === '') continue;
                    try {
                        return JSON.parse(Buffer.from(value, 'base64').toString());
                    } catch {
                        return value;
                    }
                }
            }
        }

        return null;
    }

    async getAccountBalance(nodeUrl: string): Promise<number> {
        try {
            const provider = new JsonRpcProvider({ url: nodeUrl });
            const res = await provider.query({
                request_type: 'call_function',
                account_id: CONTRACT_ID,
                method_name: 'get_user_balance',
                args_base64: Buffer.from(JSON.stringify({ account_id: this.accountId })).toString('base64'),
                finality: 'final',
            }) as { result: number[] };
            const balString = JSON.parse(Buffer.from(res.result).toString());
            // v7: Use yoctoToNear instead of utils.format.formatNearAmount
            return parseFloat(yoctoToNear(balString));
        } catch (e) {
            console.warn("Error getting gas balance (maybe not registered?):", e);
            return 0;
        }
    }

    async hasSufficientGas(nodeUrl: string, minAmount: number = 1.0): Promise<boolean> {
        const currentBalance = await this.getAccountBalance(nodeUrl);
        console.log(`Current Prepaid Gas Balance: ${currentBalance} NEAR, Required: ${minAmount}`);
        return currentBalance >= minAmount;
    }

    async ensureGas(wallet: WalletInstance, nodeUrl: string, minAmount: number = 1.0): Promise<void> {
        const sufficient = await this.hasSufficientGas(nodeUrl, minAmount);
        if (!sufficient) {
            console.log(`Low gas, triggering Top Up...`);
            // Deposit 1 NEAR if low
            await this.topUpGas(wallet, '1');
        }
    }

    async topUpGas(wallet: WalletInstance, amount: string) {
        console.log(`Topping up gas: ${amount} NEAR`);
        // v7: Use actions.functionCall instead of transactions.functionCall
        const action = actions.functionCall(
            'deposit_funds',
            {},
            BigInt('30000000000000'), // 30 TGas
            BigInt(nearToYocto(parseFloat(amount))) // v7: Use nearToYocto with number
        );

        await wallet.signAndSendTransaction({
            receiverId: CONTRACT_ID,
            actions: [action]
        });
    }

    async withdrawFunds(wallet: WalletInstance, amount: string) {
        console.log(`Withdrawing funds: ${amount} NEAR`);
        // v7: Use actions.functionCall
        const action = actions.functionCall(
            'withdraw_funds',
            { amount: nearToYocto(parseFloat(amount)) },
            BigInt('30000000000000'), // 30 TGas
            BigInt('1') // Attach 1 yocto for security
        );

        await wallet.signAndSendTransaction({
            receiverId: CONTRACT_ID,
            actions: [action]
        });
    }

    async withdrawFundsSilent(amount: string) {
        console.log(`Withdrawing funds silently (Session Key): ${amount} NEAR`);
        // Uses Session Key -> No User Signature required!
        // Uses withdraw_funds_prepaid which doesn't require 1 yocto deposit
        return await this.callMethod(
            'withdraw_funds_prepaid',
            {},
            '30000000000000'
        );
    }
}

// Export utilities for other modules
export { getCurrentRpcUrl, withRpcFailover, NETWORK_ID, CONTRACT_ID };
