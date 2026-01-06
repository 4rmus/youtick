/**
 * Keypom Integration for YouTick
 * 
 * Provides trial accounts and gift ticket (NFT drop) functionality.
 * Uses hybrid approach: trial users use Keypom, full users use existing session keys.
 */

// Use dynamic import for keypom-js to avoid build issues in server-side contexts
// import { initKeypom, createDrop, createTrialAccountDrop, claimTrialAccountDrop } from "keypom-js";
import { connect, keyStores, KeyPair, Near, Account } from "near-api-js";

// Configuration
const NETWORK_ID = process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet";
const NFT_CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || "dev-gift-1767641243.testnet";

// Keypom contract (self-hosted or official)
const KEYPOM_CONTRACT_ID = process.env.KEYPOM_CONTRACT_ID || "v2.keypom.testnet";

// Trial account configuration
const TRIAL_CONFIG = {
    // Trial duration: 7 days in nanoseconds
    trialEndFloorNS: 7 * 24 * 60 * 60 * 1_000_000_000,
    // Pre-loaded NEAR amount (0.01 NEAR = enough for free tickets + viewing)
    depositPerUseYocto: "10000000000000000000000", // 0.01 NEAR

    // Contracts and Methods
    // Index 0: NFT Contract
    // Index 1: MPC Contract
    allowedContracts: [NFT_CONTRACT_ID, "v1.signer-prod.testnet"],
    allowedMethods: [
        // NFT Contract Methods
        [
            "nft_tokens_for_owner",
            "get_video_metadata",
            "get_event",
            "get_events",
            "buy_ticket",
            "prepay_for_gas"
        ],
        // MPC Contract Methods
        ["sign"]
    ],

    // Maximum NEAR that can be attached per call (0.005 NEAR)
    maxAttachableNEARPerCall: "5000000000000000000000",
};

export interface TrialAccountConfig {
    numKeys: number;
    metadata?: string;
}

export interface NFTDropConfig {
    nftContractId: string;
    tokenIds: string[];
    metadata?: string;
}

export interface ClaimResult {
    accountId: string;
    success: boolean;
    error?: string;
}

/**
 * YouTick Keypom Manager
 * Handles trial accounts and gift ticket drops
 */
export class YouTickKeypomManager {
    private near: Near | null = null;
    private funderAccount: Account | null = null;
    private initialized = false;

    public getNear(): Near | null {
        return this.near;
    }

    /**
     * Initialize Keypom SDK with funder account
     * Must be called before any other operations
     */
    async init(funderPrivateKey?: string): Promise<void> {
        if (this.initialized) return;

        const keyStore = typeof window !== "undefined"
            ? new keyStores.BrowserLocalStorageKeyStore()
            : new keyStores.InMemoryKeyStore();

        // If funder key provided, add it to keystore
        if (funderPrivateKey) {
            const funderAccountId = process.env.KEYPOM_FUNDER_ACCOUNT_ID || "utick.testnet";
            const keyPair = KeyPair.fromString(funderPrivateKey as `ed25519:${string}`);
            await keyStore.setKey(NETWORK_ID, funderAccountId, keyPair);
        }

        this.near = await connect({
            networkId: NETWORK_ID,
            nodeUrl: NETWORK_ID === "mainnet"
                ? "https://rpc.mainnet.near.org"
                : "https://test.rpc.fastnear.com",
            keyStore,
        });

        // Initialize Keypom
        const { initKeypom } = await import("keypom-js");
        await initKeypom({
            near: this.near as any,
            network: NETWORK_ID,
        });

        this.initialized = true;
    }

    /**
     * Create trial account drop
     * Returns array of claim links
     */
    async createTrialAccountDrop(config: TrialAccountConfig, wallet?: any): Promise<string[]> {
        if (!this.initialized) {
            throw new Error("Keypom not initialized. Call init() first.");
        }

        try {
            const { createDrop } = await import("keypom-js");

            // Parse metadata to get event details
            let eventCid = "";
            let eventPrice = "0"; // Default to 0 (free)

            if (config.metadata) {
                try {
                    const meta = JSON.parse(config.metadata);
                    eventCid = meta.eventCid;
                    if (meta.price) eventPrice = meta.price;
                } catch (e) {
                    console.warn("Failed to parse metadata", e);
                }
            }

            // Calculate deposit per key: Price + Storage/Gas
            // Storage for NFT is ~0.01 NEAR. Method call needs attached deposit.
            // We attach 'eventPrice' + '0.1' NEAR buffer for storage & gas.
            const storageBuffer = "100000000000000000000000"; // 0.1 NEAR
            const priceYocto = eventPrice;
            // Native BigInt arithmetic for deposit
            const depositPerUse = (BigInt(priceYocto) + BigInt(storageBuffer)).toString();

            // The attached deposit for the function call itself must cover the price + small storage
            const fcAttachedDeposit = (BigInt(priceYocto) + BigInt("50000000000000000000000")).toString(); // Price + 0.05 NEAR

            console.log(`Creating gift drop for ${eventCid}, price: ${eventPrice}, deposit: ${depositPerUse}`);

            const result = await createDrop({
                numKeys: config.numKeys,
                // OPTIMIZED deposit per key breakdown:
                // - Account creation: ~0.25 NEAR
                // - Ticket purchase (buy_ticket): 0.05 NEAR
                // - Prepaid gas (deposit_funds_for): 0.25 NEAR (enough for 1 MPC signature)
                // - Storage & buffer: ~0.1 NEAR
                // - Keypom fee: ~0.35 NEAR
                // Total: ~1.0 NEAR per ticket
                depositPerUseNEAR: "1.0",
                fcData: {
                    methods: [
                        [
                            {
                                receiverId: NFT_CONTRACT_ID,
                                methodName: "buy_ticket",
                                args: JSON.stringify({
                                    receiver_id: "||account_id||", // Keypom placeholder
                                    encrypted_cid: eventCid
                                }),
                                attachedDeposit: fcAttachedDeposit,
                                // Tell Keypom to replace ||account_id|| in the 'receiver_id' field
                                accountIdField: "receiver_id"
                            },
                            // Fund prepaid gas for MPC signature (0.25 NEAR is enough for 1 signature)
                            {
                                receiverId: NFT_CONTRACT_ID,
                                methodName: "deposit_funds_for",
                                args: JSON.stringify({
                                    account_id: "||account_id||" // Keypom will replace with claiming account
                                }),
                                // Reduced from 0.5 to 0.25 NEAR - sufficient for 1 MPC signature
                                attachedDeposit: "250000000000000000000000",
                                accountIdField: "account_id" // Tell Keypom to replace placeholder
                            }
                        ]
                    ]
                },
                wallet,
                requiredGas: "250000000000000", // Reduced from 300 to 250 TGas
                returnTransactions: true,
            } as any);

            const { keys, dropId, transactions } = result as { keys?: { secretKeys?: string[] }, dropId?: string, transactions?: any[] };

            if (wallet && transactions) {
                const sanitizedTransactions = sanitizeTransactions(transactions);
                console.log("Signing sanitized transactions (Gift Drop):", sanitizedTransactions);

                await wallet.signAndSendTransactions({
                    transactions: sanitizedTransactions,
                    callbackUrl: window.location.href, // Ensure we come back
                });
            } else {
                throw new Error("Wallet required to sign transaction");
            }

            // Generate claim links
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined"
                ? window.location.origin
                : "https://youtick.app");

            // Check for redirect metadata
            let redirectParam = "";
            if (config.metadata) {
                try {
                    const meta = JSON.parse(config.metadata);
                    if (meta.eventCid) {
                        redirectParam = `&redirect=${encodeURIComponent(`/ticket?cid=${meta.eventCid}`)}`;
                    }
                } catch (e) {
                    console.warn("Failed to parse metadata for redirect:", e);
                }
            }

            const claimLinks = keys?.secretKeys?.map((secretKey: string) =>
                `${baseUrl}/trial?key=${secretKey}${redirectParam}`
            ) || [];

            console.log(`Created gift drop ${dropId} with ${config.numKeys} keys`);
            return claimLinks;
        } catch (error) {
            console.error("Failed to create gift drop:", error);
            throw error;
        }
    }

    /**
     * HYBRID SOLUTION: Create minimal gift drop (account creation only)
     * Cost: ~0.5 NEAR per ticket (vs 1.5 NEAR with fcData)
     * NFT minting happens separately via backend relayer during claim
     */
    async createMinimalGiftDrop(config: TrialAccountConfig, wallet?: any): Promise<string[]> {
        if (!this.initialized) {
            throw new Error("Keypom not initialized. Call init() first.");
        }

        try {
            const { createDrop } = await import("keypom-js");

            // Parse metadata to get event CID
            let eventCid = "";
            if (config.metadata) {
                try {
                    const meta = JSON.parse(config.metadata);
                    eventCid = meta.eventCid || "";
                } catch (e) {
                    console.warn("Failed to parse metadata", e);
                }
            }

            console.log(`Creating MINIMAL gift drop (account only) for event: ${eventCid}`);

            // MINIMAL: No fcData, just account creation
            const result = await createDrop({
                numKeys: config.numKeys,
                // MINIMAL deposit: Account creation + Keypom fee only
                // - Account creation: ~0.1 NEAR
                // - Keypom base fee: ~0.25 NEAR
                // - Buffer: ~0.15 NEAR
                // Total: ~0.5 NEAR per ticket
                depositPerUseNEAR: "0.5",
                // NO fcData - account creation only!
                wallet,
                requiredGas: "100000000000000", // 100 TGas (minimal)
                returnTransactions: true,
            } as any);

            const { keys, dropId, transactions } = result as { keys?: { secretKeys?: string[] }, dropId?: string, transactions?: any[] };

            if (wallet && transactions) {
                const sanitizedTransactions = sanitizeTransactions(transactions);
                console.log("Signing minimal gift drop transaction:", sanitizedTransactions);

                await wallet.signAndSendTransactions({
                    transactions: sanitizedTransactions,
                    callbackUrl: window.location.href,
                });
            } else {
                throw new Error("Wallet required to sign transaction");
            }

            // Generate claim links with hybrid flag and eventCid
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
            const claimLinks = keys?.secretKeys?.map((secretKey: string) =>
                `${baseUrl}/trial?key=${secretKey}&hybrid=true&eventCid=${encodeURIComponent(eventCid)}`
            ) || [];

            console.log(`Created MINIMAL gift drop ${dropId} with ${config.numKeys} keys (~0.5 NEAR each)`);
            return claimLinks;
        } catch (error) {
            console.error("Failed to create minimal gift drop:", error);
            throw error;
        }
    }

    /**
     * Activate a trial account from a claim link
     * Returns the new account ID
     */
    async activateTrialAccount(
        secretKey: string,
        desiredAccountId: string
    ): Promise<ClaimResult> {
        try {
            // Validate account ID format
            if (!this.isValidAccountId(desiredAccountId)) {
                return {
                    accountId: desiredAccountId,
                    success: false,
                    error: "Invalid account ID format",
                };
            }

            console.log("Activating trial account for:", desiredAccountId);

            // 1. Create a new keypair for the user's permanent wallet
            // This key will be added to the new account
            const newKeyPair = KeyPair.fromRandom("ed25519");
            const newPublicKey = newKeyPair.getPublicKey().toString();

            // 2. Set up the connection using the DROP's secret key
            // The signerId for the transaction must be the Keypom contract itself
            // because the drop key is a FunctionCall key on the Keypom contract.
            const formattedSecretKey = secretKey.includes(":") ? secretKey : `ed25519:${secretKey}`;
            const dropKeyPair = KeyPair.fromString(formattedSecretKey as any);
            const keyStore = new keyStores.InMemoryKeyStore();
            await keyStore.setKey(NETWORK_ID, KEYPOM_CONTRACT_ID, dropKeyPair);

            const connection = await connect({
                networkId: NETWORK_ID,
                nodeUrl: NETWORK_ID === "mainnet"
                    ? "https://rpc.mainnet.near.org"
                    : "https://test.rpc.fastnear.com",
                keyStore,
            });

            // 3. Create account object for Keypom Contract (as signer)
            const keypomAccount = await connection.account(KEYPOM_CONTRACT_ID);

            // 4. Call create_account_and_claim
            // We use keypomAccount to sign the transaction, but authorized by the drop key we just set
            const result = await keypomAccount.functionCall({
                contractId: KEYPOM_CONTRACT_ID,
                methodName: "create_account_and_claim",
                args: {
                    new_account_id: desiredAccountId,
                    new_public_key: newPublicKey,
                },
                gas: "300000000000000" as any, // 300 Tgas
                attachedDeposit: "0" as any
            });

            // Check return value (boolean)
            // contract returns true if success, false if failed (e.g. invalid claim)
            const successValue = (result.status as any).SuccessValue;
            if (successValue) {
                const value = Buffer.from(successValue, 'base64').toString();
                // "true" is expected. If "false", it failed.
                if (value === "false") {
                    throw new Error("Activation failed (Invalid claim). Account may already exist or link is invalid.");
                }
            }

            // 5. CRITICAL: Verify the account was actually created on chain
            // Keypom can return success even when claim fails internally
            console.log("Verifying account creation on chain...");
            try {
                await connection.connection.provider.query({
                    request_type: "view_account",
                    finality: "final",
                    account_id: desiredAccountId,
                });
                console.log("✅ Account verified on chain:", desiredAccountId);
            } catch (verifyError: any) {
                // Account doesn't exist - claim actually failed!
                console.error("❌ Account verification failed - claim did not create account");
                throw new Error("Account creation failed. The gift link may be invalid or already used.");
            }

            // 6. If successful, save the NEW key to the user's local storage
            // so they are logged in as the new account
            if (typeof window !== "undefined") {
                const userKeyStore = new keyStores.BrowserLocalStorageKeyStore();
                await userKeyStore.setKey(NETWORK_ID, desiredAccountId, newKeyPair);
            }

            console.log("Trial account activated successfully!");

            return {
                accountId: desiredAccountId,
                success: true,
            };
        } catch (error: any) {
            console.error("Failed to activate trial account:", error);
            return {
                accountId: desiredAccountId,
                success: false,
                error: error.message || "Unknown error",
            };
        }
    }

    /**
     * Create NFT drop for gift tickets
     * Creator pays the cost
     */
    async createNFTDrop(config: NFTDropConfig, wallet?: any): Promise<string[]> {
        if (!this.initialized) {
            throw new Error("Keypom not initialized. Call init() first.");
        }

        try {
            const { createDrop } = await import("keypom-js");
            const result = await createDrop({
                numKeys: config.tokenIds.length,
                depositPerUseYocto: "0", // NFT drops don't need NEAR deposit
                fcData: {
                    methods: [
                        [
                            {
                                receiverId: config.nftContractId,
                                methodName: "nft_transfer",
                                args: "", // Will be filled per claim
                                attachedDeposit: "1", // 1 yoctoNEAR for ownership transfer
                            },
                        ],
                    ],
                },
                nftData: {
                    contractId: config.nftContractId,
                    tokenIds: config.tokenIds,
                },
                wallet,
                returnTransactions: true,
            } as any);
            // Result structure varies by version, normalize it
            const { keys, dropId, transactions } = result as any;

            // Check if we got transactions (Function Call Drop for NFT requires transfer)
            if (wallet && transactions) {
                const sanitizedTransactions = sanitizeTransactions(transactions);

                console.log("Signing sanitized transactions (NFT Drop):", sanitizedTransactions);

                await wallet.signAndSendTransactions({
                    transactions: sanitizedTransactions,
                    callbackUrl: window.location.href,
                });
            } else {
                throw new Error("Wallet required to sign transaction");
            }

            // Generate claim links
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined"
                ? window.location.origin
                : "https://youtick.app");

            const claimLinks = keys?.secretKeys?.map((secretKey: string) =>
                `${baseUrl}/claim?key=${secretKey}`
            ) || [];

            console.log(`Created NFT drop ${dropId} for ${config.tokenIds.length} tickets`);
            return claimLinks;
        } catch (error) {
            console.error("Failed to create NFT drop:", error);
            throw error;
        }
    }

    /**
     * Claim an NFT gift ticket
     */
    async claimNFTDrop(secretKey: string, receiverAccountId: string): Promise<ClaimResult> {
        try {
            // Import claim function dynamically to avoid bundling issues
            const { claim } = await import("keypom-js");

            await claim({
                secretKey,
                accountId: receiverAccountId,
            });

            return {
                accountId: receiverAccountId,
                success: true,
            };
        } catch (error: any) {
            console.error("Failed to claim NFT drop:", error);
            return {
                accountId: receiverAccountId,
                success: false,
                error: error.message || "Unknown error",
            };
        }
    }

    /**
     * Check if an account is a trial account
     */
    async isTrialAccount(accountId: string): Promise<boolean> {
        if (!this.near) return false;

        try {
            const account = await this.near.account(accountId);
            const state = await account.state();

            // Check if account has code deployed (trial accounts usually have the Keypom trial contract)
            // And check if the code hash matches known trial contract hashes or if specific keys exist
            // For Keypom trial accounts, we can also check if it was created via our drop
            // But a simple heuristic for now is: has code + specific allowance

            // Allow checking against empty code hash for safety
            if (state.code_hash === "11111111111111111111111111111111") return false;

            // TODO: In a real prod environment, we should verify the exact contract hash
            // For now, we assume if it has code and we are in trial mode context, it's a trial
            return true;
        } catch (e) {
            console.error("Error checking trial status:", e);
            return false;
        }
    }

    /**
     * Get trial account expiry time
     */
    async getTrialExpiry(accountId: string): Promise<Date | null> {
        // For trial accounts, we can try to call 'get_trial_info' or similar if exposed
        // Or we can trust the creation time if we store it. 
        // Since we don't store it, we'll return a default 7 days from now for UI purposes
        // if we can confirm it is a trial account.

        const isTrial = await this.isTrialAccount(accountId);
        if (!isTrial) return null;

        // Default to "User has access" without specific date if we can't query contract
        // But to be helpful, let's return a date 7 days from now as a placeholder
        // TODO: Implement actual contract call verify_trial_status
        const now = new Date();
        now.setDate(now.getDate() + 7);
        return now;
    }

    /**
     * Upgrade trial account to full wallet
     * Generates a new Full Access Key with 12-word seed phrase
     * Adds FAK to the account and optionally deletes trial key
     */
    async upgradeTrialAccount(accountId: string, deleteTrialKey: boolean = true): Promise<{
        seedPhrase: string;
        publicKey: string;
        success: boolean;
        error?: string;
    }> {
        try {
            const { Near, keyStores, KeyPair, transactions, utils } = await import('near-api-js');
            const { generateSeedPhrase, parseSeedPhrase } = await import('near-seed-phrase');

            // 1. Generate 12-word seed phrase using near-seed-phrase (MyNearWallet compatible)
            const { seedPhrase, publicKey, secretKey } = generateSeedPhrase();
            console.log("Generated seed phrase for upgrade");

            // 2. Create key pair from the generated secret key
            const newKeyPair = KeyPair.fromString(secretKey as any);
            const newPublicKey = newKeyPair.getPublicKey();

            console.log("New public key:", newPublicKey.toString());

            // 3. Get the trial account's current key from localStorage
            // Trial accounts can store keys in different locations:
            // - BrowserLocalStorageKeyStore: near-api-js:keystore:<accountId>:<networkId>
            // - Custom format: keypom-account-credentials
            const networkId = process.env.NEXT_PUBLIC_NEAR_NETWORK || 'testnet';

            let trialSecretKey: string | null = null;

            // Try BrowserLocalStorageKeyStore format first (most common for trial accounts)
            const browserKeyStoreKey = `near-api-js:keystore:${accountId}:${networkId}`;
            const browserStoredKey = localStorage.getItem(browserKeyStoreKey);
            if (browserStoredKey) {
                trialSecretKey = browserStoredKey;
                console.log("Found trial key in BrowserLocalStorageKeyStore");
            }

            // Try custom keypom format
            if (!trialSecretKey) {
                const storedCredentials = localStorage.getItem('keypom-account-credentials');
                if (storedCredentials) {
                    try {
                        const credentials = JSON.parse(storedCredentials);
                        trialSecretKey = credentials[accountId]?.secretKey;
                        if (trialSecretKey) {
                            console.log("Found trial key in keypom-account-credentials");
                        }
                    } catch (e) {
                        console.warn("Failed to parse keypom-account-credentials");
                    }
                }
            }

            if (!trialSecretKey) {
                throw new Error("No trial credentials found in localStorage. Make sure you're logged in with a trial account.");
            }

            const trialKeyPair = KeyPair.fromString(trialSecretKey as any);
            const trialPublicKey = trialKeyPair.getPublicKey();

            // 4. Setup NEAR connection with trial key
            const keyStore = new keyStores.InMemoryKeyStore();
            await keyStore.setKey(networkId, accountId, trialKeyPair);

            const near = await new Near({
                networkId,
                keyStore,
                nodeUrl: networkId === 'mainnet'
                    ? 'https://rpc.mainnet.near.org'
                    : 'https://test.rpc.fastnear.com',
            });

            const account = await near.account(accountId);

            // 5. Add Full Access Key directly from trial account
            // Trial accounts now have ~0.1 NEAR from gift claim for gas
            const addKeyAction = transactions.addKey(
                newPublicKey,
                transactions.fullAccessKey()
            );

            const result = await account.signAndSendTransaction({
                receiverId: accountId,
                actions: [addKeyAction]
            });

            console.log("AddKey transaction result:", result);

            // 6. Optionally delete the trial key
            if (deleteTrialKey) {
                try {
                    // Switch to new key for deletion
                    await keyStore.setKey(networkId, accountId, newKeyPair);
                    const accountWithNewKey = await near.account(accountId);

                    const deleteKeyAction = transactions.deleteKey(trialPublicKey);
                    await accountWithNewKey.signAndSendTransaction({
                        receiverId: accountId,
                        actions: [deleteKeyAction]
                    });

                    console.log("Trial key deleted successfully");

                    // Clear trial credentials from localStorage
                    localStorage.removeItem('trialAccountId');
                    localStorage.removeItem('keypom-account-credentials');

                    // Clear Lit Protocol session data (will be re-created with new wallet)
                    localStorage.removeItem('lit-session-key');
                    localStorage.removeItem('lit-wallet-sig');
                    localStorage.removeItem('lit-web3-provider');
                    localStorage.removeItem('lit-comms-keypair');

                    // Clear session key from contract-stored session
                    const sessionStorageKeys = Object.keys(localStorage).filter(
                        key => key.startsWith('session-key-') || key.startsWith('lit-')
                    );
                    sessionStorageKeys.forEach(key => localStorage.removeItem(key));
                } catch (deleteError) {
                    console.warn("Could not delete trial key:", deleteError);
                    // Non-fatal: user still has full access key
                }
            }

            // 7. Store new credentials (optional, for continued app usage)
            const newCredentials = {
                [accountId]: {
                    secretKey: secretKey,
                    publicKey: newPublicKey.toString()
                }
            };
            localStorage.setItem('near-account-credentials', JSON.stringify(newCredentials));

            return {
                seedPhrase: seedPhrase,
                publicKey: newPublicKey.toString(),
                success: true
            };

        } catch (error: any) {
            console.error("Failed to upgrade trial account:", error);
            return {
                seedPhrase: '',
                publicKey: '',
                success: false,
                error: error.message || 'Unknown error'
            };
        }
    }

    // Helper: Validate NEAR account ID format
    private isValidAccountId(accountId: string): boolean {
        // NEAR account ID rules:
        // - 2-64 characters
        // - lowercase alphanumeric, underscores, hyphens
        // - not start with hyphen
        const pattern = /^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$/;
        return pattern.test(accountId) || accountId.endsWith(".testnet") || accountId.endsWith(".near");
    }
}

// Singleton instance
let keypomManager: YouTickKeypomManager | null = null;

/**
 * Get or create Keypom manager instance
 */
export function getKeypomManager(): YouTickKeypomManager {
    if (!keypomManager) {
        keypomManager = new YouTickKeypomManager();
    }
    return keypomManager;
}

/**
 * Helper: Generate claim URL from secret key
 */
export function generateClaimUrl(secretKey: string, type: "trial" | "gift"): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined"
        ? window.location.origin
        : "https://youtick.app");

    const path = type === "trial" ? "/trial" : "/claim";
    return `${baseUrl}${path}?key=${secretKey}`;
}

/**
 * Helper: Extract secret key from claim URL
 */
export function extractKeyFromUrl(url: string): string | null {
    try {
        const urlObj = new URL(url);
        return urlObj.searchParams.get("key");
    } catch {
        return null;
    }
}

/**
 * Helper: Sanitize transactions for Wallet Selector
 * Converting to format that works with the current wallet implementation.
 * It seems MyNearWallet might be trying to serialize these directly using Borsh, 
 * so we provide objects that match the near-api-js schema (Enum keys) rather than WS Action spec.
 */
function sanitizeTransactions(transactions: any[]) {
    return transactions.map((t: any) => {
        return {
            receiverId: t.receiverId,
            signerId: t.signerId,
            actions: t.actions.map((a: any) => {
                // Return explicitly compatible object for Borsh serialization

                // FUNCTION CALL
                if (a.functionCall || (a.type === 'FunctionCall' && a.params)) {
                    const params = a.functionCall || a.params;
                    let args = params.args;

                    // Sanitize args: ensure it's Uint8Array (Borsh requirement for 'args')
                    // If it is a plain object, we assume it needs to be JSON serialized e.g. { account_id: ... }
                    if (typeof args === 'object' && args !== null && !Array.isArray(args) && !(args instanceof Uint8Array) && !Object.keys(args).every(k => !isNaN(Number(k)))) {
                        try {
                            const jsonString = JSON.stringify(args);
                            args = new TextEncoder().encode(jsonString);
                        } catch (e) {
                            console.warn("Failed to serialize args", e);
                            // fallback or leave as is to fail efficiently
                        }
                    } else if (typeof args === 'object' && !Array.isArray(args) && !(args instanceof Uint8Array)) {
                        // It might be an array-like object {0: 12, 1: 55...} which Borsh might actually accept or we convert to array
                        if (Object.values(args).every((v: any) => typeof v === 'number')) {
                            args = Uint8Array.from(Object.values(args) as number[]);
                        }
                    }

                    return {
                        functionCall: {
                            methodName: params.methodName,
                            args: args,
                            gas: params.gas.toString(),
                            deposit: params.deposit.toString(),
                        }
                    };
                }

                // TRANSFER
                if (a.transfer || (a.type === 'Transfer' && a.params)) {
                    const params = a.transfer || a.params;
                    return {
                        transfer: {
                            deposit: params.deposit.toString(),
                        }
                    };
                }

                // ADD KEY
                if (a.addKey || (a.type === 'AddKey' && a.params)) {
                    const params = a.addKey || a.params;
                    // Handle access key permission structure
                    let permission = params.accessKey.permission;

                    // If simple string "FullAccess"
                    if (permission === 'FullAccess') {
                        permission = { fullAccess: {} };
                    }
                    // If object with permission type
                    else if (typeof permission === 'object') {
                        if (permission.receiverId) {
                            // It's a FunctionCall permission
                            permission = {
                                functionCall: {
                                    receiverId: permission.receiverId,
                                    methodNames: permission.methodNames,
                                    allowance: permission.allowance ? permission.allowance.toString() : undefined
                                }
                            };
                        }
                        // If it is already in the { functionCall: ... } format, leave it?
                        // Usually keypom returns near-api-js structures.
                    }

                    return {
                        addKey: {
                            publicKey: params.publicKey, // Pass original object/instance if possible
                            accessKey: {
                                nonce: params.accessKey.nonce?.toString() || "0",
                                permission: permission
                            }
                        }
                    };
                    // NOTE: PublicKey is tricky. If we pass a string, Borsh won't like it if it expects an Enum.
                    // But `near-api-js` usually converts string to PublicKey class. 
                    // We might be safest returning the original `publicKey` object if it exists.
                }

                // Fallback: if we don't recognize it, return as is (risky if it has 'type')
                // But try to strip 'type' if present
                const { type, ...rest } = a;
                return rest;
            }),
        };
    });
}
