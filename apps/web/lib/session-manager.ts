// lib/session-manager.ts - near-api-js v7 compatible
import {
    Account,
    KeyPair,
    KeyPairSigner,
    JsonRpcProvider,
    actions,
    nearToYocto,
    yoctoToNear,
    TypedError,
    getTransactionLastResult,
    type KeyPairString,
    type Action
} from 'near-api-js';
import { BrowserKeyStore } from './keystore-v7';
import { NEAR_CONFIG, GAS_CONSTANTS, DEPOSIT_CONSTANTS } from './constants';
import { getCurrentRpcUrl, withRpcFailover } from './rpc-failover';
import type { WalletInstance } from './types';

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

    /**
     * Import existing function call key from wallet-selector's localStorage.
     *
     * Wallet-specific behavior:
     * - MyNearWallet (redirect-based): wallet-selector stores the private key in
     *   localStorage with the standard 'near-api-js:keystore:' prefix (same as our
     *   BrowserKeyStore). This means getKey() above usually finds it directly.
     *   The 'mynearwallet:functionCallKey' check is a legacy fallback.
     * - MeteorWallet (injected): Keys are managed by the browser extension and
     *   NOT accessible in page localStorage. This method returns false, so
     *   createSessionKey() is called to generate a dApp-managed key (one popup).
     */
    async importWalletFunctionCallKey(): Promise<boolean> {
        // Skip if we already have a local key (covers wallet-selector's standard keystore)
        const existing = await this.keyStore.getKey(NETWORK_ID, this.accountId);
        if (existing) return true;

        if (typeof window === 'undefined') return false;

        // Legacy MyNearWallet format (pre wallet-selector v10 integration)
        const raw = localStorage.getItem('mynearwallet:functionCallKey');
        if (!raw) return false;

        try {
            const data = JSON.parse(raw) as {
                privateKey?: string;
                contractId?: string;
                methods?: string[];
            };
            if (!data.privateKey || data.contractId !== CONTRACT_ID) return false;

            const keyPair = KeyPair.fromString(data.privateKey as KeyPairString);
            await this.keyStore.setKey(NETWORK_ID, this.accountId, keyPair);
            return true;
        } catch {
            return false;
        }
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
                    console.warn("[SessionManager] Key found locally but not on-chain. Removing.");
                    await this.keyStore.removeKey(NETWORK_ID, this.accountId);
                    return false;
                }

                // Verify the key is for the correct contract
                const permission = accessKeyInfo.access_key.permission;
                // Permission can be 'FullAccess' (string) or object with FunctionCall
                if (typeof permission === 'object' && 'FunctionCall' in permission) {
                    if (permission.FunctionCall.receiver_id !== CONTRACT_ID) {
                        console.warn(`[SessionManager] Key for wrong contract (${permission.FunctionCall.receiver_id} vs ${CONTRACT_ID}). Removing.`);
                        await this.keyStore.removeKey(NETWORK_ID, this.accountId);
                        return false;
                    }

                    // Check remaining allowance — exhausted keys fail silently at callMethod time
                    const allowance = permission.FunctionCall.allowance;
                    if (allowance !== null && allowance !== undefined) {
                        const remaining = BigInt(allowance);
                        // Conservative minimum (0.015 NEAR) to avoid runtime failures on medium-gas calls.
                        const MIN_ALLOWANCE = BigInt('15000000000000000000000');
                        if (remaining < MIN_ALLOWANCE) {
                            console.warn(`[SessionManager] Key allowance exhausted (${allowance} yocto remaining). Removing for renewal.`);
                            await this.keyStore.removeKey(NETWORK_ID, this.accountId);
                            return false;
                        }
                    }
                }
                return true;
            });
        } catch (e) {
            if (e instanceof TypedError) {
                console.warn(`[SessionManager] TypedError checking session key (${e.type}):`, e.message);
            } else {
                console.warn("[SessionManager] Error checking key on-chain (network issue?). Assuming local key is valid.", e);
            }
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
            '0.5' // Covers: NFT mint (0.1) + Event (0.1) + buffer = 0.25 NEAR + margin.
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

    async callMethod(method: string, args: Record<string, unknown>, gas: string = GAS_CONSTANTS.standardGas.toString()): Promise<unknown> {
        const keyPair = await this.keyStore.getKey(NETWORK_ID, this.accountId);
        if (!keyPair) {
            throw new Error("No session key found. Please setup account first.");
        }

        // v7: Create Account with signer
        const signer = new KeyPairSigner(keyPair);
        const account = new Account(this.accountId, getCurrentRpcUrl(), signer);

        // Retry on nonce errors (TypedError from near-api-js v7)
        const MAX_NONCE_RETRIES = 2;
        for (let attempt = 0; attempt <= MAX_NONCE_RETRIES; attempt++) {
            try {
                const outcome = await account.signAndSendTransaction({
                    receiverId: CONTRACT_ID,
                    actions: [
                        actions.functionCall(method, args, BigInt(gas), BigInt(0))
                    ]
                });
                return getTransactionLastResult(outcome);
            } catch (error) {
                const isNonceError = error instanceof TypedError &&
                    (error.type === 'InvalidNonce' || error.message.includes('nonce'));

                if (isNonceError && attempt < MAX_NONCE_RETRIES) {
                    console.warn(`[SessionManager] Nonce error on attempt ${attempt + 1}, retrying...`);
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                    continue;
                }
                throw error;
            }
        }

        throw new Error("Exhausted nonce retries");
    }

    async sendBatchTransaction(txActions: Action[]): Promise<unknown> {
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

        return getTransactionLastResult(outcome);
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
            if (e instanceof TypedError) {
                console.warn(`[SessionManager] TypedError getting balance (${e.type}):`, e.message);
            } else {
                console.warn("Error getting gas balance (maybe not registered?):", e);
            }
            return 0;
        }
    }

    async hasSufficientGas(nodeUrl: string, minAmount: number = 1.0): Promise<boolean> {
        const currentBalance = await this.getAccountBalance(nodeUrl);
        return currentBalance >= minAmount;
    }

    async ensureGas(wallet: WalletInstance, nodeUrl: string, minAmount: number = 1.0): Promise<void> {
        const sufficient = await this.hasSufficientGas(nodeUrl, minAmount);
        if (!sufficient) {
            // Deposit 1 NEAR if low
            await this.topUpGas(wallet, '1');
        }
    }

    async topUpGas(wallet: WalletInstance, amount: string) {
        // v7: Use actions.functionCall instead of transactions.functionCall
        const action = actions.functionCall(
            'deposit_funds',
            {},
            GAS_CONSTANTS.smallGas,
            BigInt(nearToYocto(parseFloat(amount))) // v7: Use nearToYocto with number
        );

        await wallet.signAndSendTransaction({
            receiverId: CONTRACT_ID,
            actions: [action]
        });
    }

    async withdrawFunds(wallet: WalletInstance, amount: string) {
        // v7: Use actions.functionCall
        const action = actions.functionCall(
            'withdraw_funds',
            { amount: nearToYocto(parseFloat(amount)) },
            GAS_CONSTANTS.smallGas,
            DEPOSIT_CONSTANTS.oneYocto
        );

        await wallet.signAndSendTransaction({
            receiverId: CONTRACT_ID,
            actions: [action]
        });
    }

    async withdrawFundsSilent() {
        // Uses Session Key -> No User Signature required!
        // Uses withdraw_funds_prepaid which doesn't require 1 yocto deposit
        return await this.callMethod(
            'withdraw_funds_prepaid',
            {},
            GAS_CONSTANTS.smallGas.toString()
        );
    }

    /**
     * Get the session key pair in a format usable by the KMS client.
     * Extracts the raw Ed25519 private key from the NEAR key pair,
     * imports it as a Web Crypto CryptoKey, and returns both parts.
     *
     * @returns Object with Web Crypto privateKey and base58 public key string
     */
    async getKeyForKMS(): Promise<{ privateKey: CryptoKey; publicKeyB58: string }> {
        const keyPair = await this.keyStore.getKey(NETWORK_ID, this.accountId);
        if (!keyPair) {
            throw new Error('No session key found. Please setup account first.');
        }

        // NEAR KeyPair stores keys as "ed25519:BASE58_ENCODED_KEY"
        const publicKeyB58 = keyPair.getPublicKey().toString(); // "ed25519:xxxx"

        // Extract raw private key bytes from the NEAR key pair
        // near-api-js v7 KeyPair.toString() returns "ed25519:BASE58_PRIVATE_KEY"
        // The private key in NEAR is stored as 64 bytes (32 bytes secret + 32 bytes public)
        const keyString = keyPair.toString() as string;
        const [, b58Key] = keyString.split(':');

        // Decode base58 to get the raw key bytes
        const rawBytes = base58DecodeLocal(b58Key);
        // NEAR stores Ed25519 as 64 bytes: first 32 = seed, last 32 = public key
        const secretKeyBytes = rawBytes.slice(0, 32);

        // Import as Web Crypto Ed25519 private key using PKCS8 format
        // Ed25519 PKCS8 wrapping: fixed 16-byte prefix + 2-byte key header + 32 raw key bytes
        const pkcs8Prefix = new Uint8Array([
            0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
            0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
        ]);
        const pkcs8Key = new Uint8Array(pkcs8Prefix.length + secretKeyBytes.length);
        pkcs8Key.set(pkcs8Prefix);
        pkcs8Key.set(secretKeyBytes, pkcs8Prefix.length);

        const privateKey = await crypto.subtle.importKey(
            'pkcs8',
            pkcs8Key,
            'Ed25519',
            false,
            ['sign']
        );

        return { privateKey, publicKeyB58 };
    }
}

// Base58 decode helper (local, no dependency)
const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58DecodeLocal(str: string): Uint8Array {
    const bytes: number[] = [0];
    for (const char of str) {
        const idx = BASE58_CHARS.indexOf(char);
        if (idx < 0) throw new Error(`Invalid base58 character: ${char}`);
        let carry = idx;
        for (let j = 0; j < bytes.length; j++) {
            carry += bytes[j] * 58;
            bytes[j] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }
    // Leading zeros
    for (const char of str) {
        if (char !== '1') break;
        bytes.push(0);
    }
    return new Uint8Array(bytes.reverse());
}

// Export utilities for other modules
export { getCurrentRpcUrl, withRpcFailover, NETWORK_ID, CONTRACT_ID };
