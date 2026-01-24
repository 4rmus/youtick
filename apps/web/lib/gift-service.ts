/**
 * Gift Service - Native Contract-Based Gift Link System
 * near-api-js v7 compatible
 *
 * Replaces Keypom with contract's native Access Key-based gift drops.
 * Uses contract methods: create_gift_drop, claim_gift, claim_gift_and_create_account
 */

import { KeyPair, Account, KeyPairSigner, nearToYocto, actions, type KeyPairString } from "near-api-js";
import { InMemoryKeyStore } from "./keystore-v7";
import type { WalletSelector } from "@near-wallet-selector/core";

// Contract ID from environment
const NFT_CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || "youtick-v4.testnet";
const NETWORK_ID = process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// Cost per gift link (account creation + NFT storage + buffer)
const DEPOSIT_PER_LINK = "0.15"; // 0.15 NEAR

export interface GiftLinkResult {
    publicKey: string;
    secretKey: string;
    link: string;
}

export interface GiftInfo {
    eventCid: string;
    creatorId: string;
    remainingClaims: number;
    depositPerClaim: string;
}

export interface SponsoredTrialResult {
    success: boolean;
    accountId?: string;
    secretKey?: string;
    error?: string;
}

/**
 * Check trial pool balance
 */
export async function getTrialPoolBalance(): Promise<string> {
    try {
        const response = await fetch(`${getRpcUrl()}/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "1",
                method: "query",
                params: {
                    request_type: "call_function",
                    finality: "final",
                    account_id: NFT_CONTRACT_ID,
                    method_name: "get_trial_pool_balance",
                    args_base64: Buffer.from("{}").toString("base64"),
                },
            }),
        });

        const data = await response.json();
        if (data.error || !data.result?.result) return "0";

        const result = JSON.parse(Buffer.from(data.result.result).toString());
        return result || "0";
    } catch {
        return "0";
    }
}

/**
 * RELAYER-LESS: Create a sponsored trial account directly from client
 * Uses the onboarding Function Call Access Key stored in localStorage
 *
 * @param username - Just the username prefix (e.g. "alice")
 * @returns The full account ID will be returned in the result (e.g. "alice.contract.testnet")
 */
export async function createSponsoredTrialDirect(
    username: string
): Promise<SponsoredTrialResult> {
    try {
        // Check if we have an onboarding key
        const onboardingKeyStr = typeof window !== "undefined"
            ? localStorage.getItem(`onboarding_key:${NFT_CONTRACT_ID}`)
            : null;

        if (!onboardingKeyStr) {
            // Fall back to relayer-based method
            console.log("No onboarding key found, falling back to relayer API");
            return createSponsoredTrialRelayer(username);
        }

        // Generate keypair for the new account
        const userKeyPair = KeyPair.fromRandom("ed25519");
        const userPublicKey = userKeyPair.getPublicKey().toString();
        const userSecretKey = userKeyPair.toString();

        // Parse onboarding key
        const onboardingKeyPair = KeyPair.fromString(onboardingKeyStr as KeyPairString);

        // v7: Create Account directly with signer
        const signer = new KeyPairSigner(onboardingKeyPair);
        const account = new Account(NFT_CONTRACT_ID, getRpcUrl(), signer);

        // Call create_sponsored_trial_direct using v7 actions format
        await account.signAndSendTransaction({
            receiverId: NFT_CONTRACT_ID,
            actions: [
                actions.functionCall(
                    "create_sponsored_trial_direct",
                    { username, new_public_key: userPublicKey },
                    BigInt("200000000000000"), // 200 TGas
                    BigInt(0) // No deposit
                )
            ]
        });

        // Determine new account ID
        const accountId = `${username}.${NFT_CONTRACT_ID}`;

        // Store the user's key for future use
        if (typeof window !== "undefined") {
            localStorage.setItem(`near-api-js:keystore:${accountId}:${NETWORK_ID}`, userSecretKey);
            localStorage.setItem("trialAccountId", accountId);
        }

        return {
            success: true,
            accountId,
            secretKey: userSecretKey,
        };
    } catch (error: any) {
        console.error("Direct sponsored trial error:", error);

        // If the error is about unauthorized key, fall back to relayer
        if (error.message?.includes("Unauthorized") || error.message?.includes("onboarding key")) {
            console.log("Onboarding key rejected, falling back to relayer API");
            return createSponsoredTrialRelayer(username);
        }

        return {
            success: false,
            error: error.message || "Failed to create trial account",
        };
    }
}

/**
 * Relayer-based trial creation (fallback method)
 * Uses the backend API endpoint which calls the contract on behalf of the user
 */
export async function createSponsoredTrialRelayer(
    username: string
): Promise<SponsoredTrialResult> {
    try {
        // Generate keypair for the new account
        const keyPair = KeyPair.fromRandom("ed25519");
        const publicKey = keyPair.getPublicKey().toString();
        const secretKey = keyPair.toString();

        // Call the relayer API
        const relayerResponse = await fetch("/api/trial/sponsored", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username,
                new_public_key: publicKey,
            }),
        });

        const data = await relayerResponse.json();

        if (!relayerResponse.ok) {
            return {
                success: false,
                error: data.error || "Failed to create trial account",
            };
        }

        const accountId = data.account_id;

        // Store the key for future use
        if (typeof window !== "undefined") {
            localStorage.setItem(`near-api-js:keystore:${accountId}:${NETWORK_ID}`, secretKey);
            localStorage.setItem("trialAccountId", accountId);
        }

        return {
            success: true,
            accountId,
            secretKey,
        };
    } catch (error: any) {
        console.error("Relayer sponsored trial error:", error);
        return {
            success: false,
            error: error.message || "Failed to create trial account",
        };
    }
}

/**
 * Create a sponsored trial account - Direct-first with relayer fallback
 * Prioritizes decentralization (onboarding key) while maintaining UX (relayer fallback)
 *
 * Strategy:
 * 1. If onboarding key exists in localStorage → Direct (decentralized)
 * 2. If direct fails or no key → Relayer API (UX fallback)
 *
 * @param username - Just the username prefix (e.g. "alice")
 * @returns The full account ID and method used
 */
export async function createSponsoredTrial(
    username: string
): Promise<SponsoredTrialResult & { method?: 'direct' | 'relayer' }> {
    console.log(`[DECENTRALIZATION] Creating sponsored trial for: ${username}`);

    // Try direct method first (relayer-less, decentralized)
    const directResult = await createSponsoredTrialDirect(username);

    if (directResult.success) {
        console.log('[DECENTRALIZATION] ✅ Trial created via onboarding key (decentralized)');
        console.log(`[DECENTRALIZATION_METRIC] {"operation":"trial_create","method":"direct","username":"${username}","timestamp":${Date.now()}}`);
        return { ...directResult, method: 'direct' };
    }

    // If direct failed with a non-fallback error, return it
    if (directResult.error && !directResult.error.includes('falling back')) {
        console.log('[DECENTRALIZATION] ⚠️ Trial creation failed (no fallback):', directResult.error);
        return { ...directResult, method: 'direct' };
    }

    // Fallback: relayer-based trial creation
    console.log('[DECENTRALIZATION] Using relayer for trial creation (fallback)');
    const relayerResult = await createSponsoredTrialRelayer(username);

    if (relayerResult.success) {
        console.log('[DECENTRALIZATION] ✅ Trial created via relayer (centralized fallback)');
        console.log(`[DECENTRALIZATION_METRIC] {"operation":"trial_create","method":"relayer","username":"${username}","timestamp":${Date.now()}}`);
    }

    return { ...relayerResult, method: 'relayer' };
}

/**
 * Store an onboarding key for direct trial creation
 * This should be called by admin/setup process
 */
export function setOnboardingKey(secretKey: string): void {
    if (typeof window !== "undefined") {
        localStorage.setItem(`onboarding_key:${NFT_CONTRACT_ID}`, secretKey);
        console.log("Onboarding key stored for", NFT_CONTRACT_ID);
    }
}

/**
 * Check if an onboarding key is available
 */
export function hasOnboardingKey(): boolean {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem(`onboarding_key:${NFT_CONTRACT_ID}`);
}

/**
 * Get the onboarding key from localStorage
 */
export function getOnboardingKey(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(`onboarding_key:${NFT_CONTRACT_ID}`);
}

/**
 * Get onboarding configuration from contract
 */
export async function getOnboardingConfig(): Promise<{
    dailyLimit: number;
    enabled: boolean;
    currentDailyCount: number;
} | null> {
    try {
        // Fetch config and daily count in parallel
        const [configResponse, countResponse] = await Promise.all([
            fetch(`${getRpcUrl()}/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: "1",
                    method: "query",
                    params: {
                        request_type: "call_function",
                        finality: "final",
                        account_id: NFT_CONTRACT_ID,
                        method_name: "get_onboarding_config",
                        args_base64: Buffer.from("{}").toString("base64"),
                    },
                }),
            }),
            fetch(`${getRpcUrl()}/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: "2",
                    method: "query",
                    params: {
                        request_type: "call_function",
                        finality: "final",
                        account_id: NFT_CONTRACT_ID,
                        method_name: "get_daily_trial_count",
                        args_base64: Buffer.from("{}").toString("base64"),
                    },
                }),
            }),
        ]);

        const configData = await configResponse.json();
        const countData = await countResponse.json();

        if (configData.error || !configData.result?.result) return null;

        const config = JSON.parse(Buffer.from(configData.result.result).toString());
        const count = countData.result?.result
            ? JSON.parse(Buffer.from(countData.result.result).toString())
            : 0;

        return {
            dailyLimit: config.daily_limit,
            enabled: config.enabled,
            currentDailyCount: count,
        };
    } catch (error) {
        console.error("Error getting onboarding config:", error);
        return null;
    }
}

/**
 * Get RPC URL based on network
 */
function getRpcUrl(): string {
    return NETWORK_ID === "mainnet"
        ? "https://rpc.mainnet.near.org"
        : "https://test.rpc.fastnear.com";
}

/**
 * Generate key pairs for gift links
 */
export function generateKeyPairs(count: number): { publicKey: string; secretKey: string }[] {
    const pairs: { publicKey: string; secretKey: string }[] = [];

    for (let i = 0; i < count; i++) {
        const keyPair = KeyPair.fromRandom("ed25519");
        pairs.push({
            publicKey: keyPair.getPublicKey().toString(),
            secretKey: keyPair.toString(),
        });
    }

    return pairs;
}

/**
 * Create gift links by calling contract's create_gift_drop
 * Creator pays 0.15 NEAR per link
 */
export async function createGiftLinks(
    eventCid: string,
    numLinks: number,
    wallet: any  // Wallet from wallet selector
): Promise<GiftLinkResult[]> {
    if (numLinks < 1 || numLinks > 50) {
        throw new Error("Must create 1-50 links");
    }

    // Generate key pairs
    const keyPairs = generateKeyPairs(numLinks);
    const publicKeys = keyPairs.map(kp => kp.publicKey);

    // v7: Calculate total deposit using nearToYocto (requires number)
    const depositPerLink = nearToYocto(parseFloat(DEPOSIT_PER_LINK));
    const totalDeposit = (BigInt(depositPerLink) * BigInt(numLinks)).toString();

    // Call contract's create_gift_drop
    await wallet.signAndSendTransaction({
        receiverId: NFT_CONTRACT_ID,
        actions: [
            {
                type: "FunctionCall",
                params: {
                    methodName: "create_gift_drop",
                    args: {
                        event_cid: eventCid,
                        public_keys: publicKeys,
                    },
                    gas: "100000000000000", // 100 TGas
                    deposit: totalDeposit,
                },
            },
        ],
    });

    // Generate links
    const links: GiftLinkResult[] = keyPairs.map(kp => ({
        publicKey: kp.publicKey,
        secretKey: kp.secretKey,
        link: `${APP_URL}/claim?key=${encodeURIComponent(kp.secretKey)}&pk=${encodeURIComponent(kp.publicKey)}`,
    }));

    return links;
}

/**
 * Validate a gift link by checking if the public key is valid
 */
export async function validateGiftLink(publicKey: string): Promise<GiftInfo | null> {
    try {
        const response = await fetch(`${getRpcUrl()}/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "1",
                method: "query",
                params: {
                    request_type: "call_function",
                    finality: "final",
                    account_id: NFT_CONTRACT_ID,
                    method_name: "get_gift_info_full",
                    args_base64: Buffer.from(JSON.stringify({ public_key: publicKey })).toString("base64"),
                },
            }),
        });

        const data = await response.json();

        if (data.error || !data.result?.result) {
            return null;
        }

        const result = JSON.parse(Buffer.from(data.result.result).toString());

        if (!result) return null;

        return {
            eventCid: result.event_cid,
            creatorId: result.creator_id,
            remainingClaims: result.remaining_claims,
            depositPerClaim: result.deposit_per_claim,
        };
    } catch (error) {
        console.error("Error validating gift link:", error);
        return null;
    }
}

/**
 * Claim a gift and create a new account
 * Uses the Access Key from the gift link to sign the transaction
 */
export async function claimGiftAndCreateAccount(
    secretKey: string,
    newAccountId: string,
    newPublicKey: string
): Promise<{ success: boolean; accountId?: string; error?: string }> {
    try {
        // Parse the secret key
        const keyPair = KeyPair.fromString(secretKey as KeyPairString);

        // v7: Create Account with signer
        const signer = new KeyPairSigner(keyPair);
        const account = new Account(NFT_CONTRACT_ID, getRpcUrl(), signer);

        // Call claim_gift_and_create_account using v7 actions format
        await account.signAndSendTransaction({
            receiverId: NFT_CONTRACT_ID,
            actions: [
                actions.functionCall(
                    "claim_gift_and_create_account",
                    { new_account_id: newAccountId, new_public_key: newPublicKey },
                    BigInt("200000000000000"), // 200 TGas
                    BigInt(0) // No deposit
                )
            ]
        });

        return {
            success: true,
            accountId: newAccountId,
        };
    } catch (error: any) {
        console.error("Error claiming gift:", error);
        return {
            success: false,
            error: error.message || "Failed to claim gift",
        };
    }
}

/**
 * Claim a gift to an existing account
 */
export async function claimGiftToExisting(
    secretKey: string,
    receiverId: string
): Promise<{ success: boolean; tokenId?: string; error?: string }> {
    try {
        const keyPair = KeyPair.fromString(secretKey as KeyPairString);

        // v7: Create Account with signer
        const signer = new KeyPairSigner(keyPair);
        const account = new Account(NFT_CONTRACT_ID, getRpcUrl(), signer);

        // v7 actions format for Account.signAndSendTransaction
        await account.signAndSendTransaction({
            receiverId: NFT_CONTRACT_ID,
            actions: [
                actions.functionCall(
                    "claim_gift",
                    { receiver_id: receiverId },
                    BigInt("100000000000000"), // 100 TGas
                    BigInt(0) // No deposit
                )
            ]
        });

        return {
            success: true,
        };
    } catch (error: any) {
        console.error("Error claiming gift:", error);
        return {
            success: false,
            error: error.message || "Failed to claim gift",
        };
    }
}

/**
 * Parse gift link URL parameters
 */
export function parseGiftLink(url: string): { secretKey: string; publicKey: string } | null {
    try {
        const urlObj = new URL(url);
        const secretKey = urlObj.searchParams.get("key");
        const publicKey = urlObj.searchParams.get("pk");

        if (!secretKey) return null;

        // If publicKey not provided, derive it from secretKey
        if (!publicKey) {
            const keyPair = KeyPair.fromString(secretKey as KeyPairString);
            return {
                secretKey,
                publicKey: keyPair.getPublicKey().toString(),
            };
        }

        return { secretKey, publicKey };
    } catch {
        return null;
    }
}

/**
 * Get event info for a gift link
 */
export async function getGiftEventInfo(publicKey: string): Promise<{
    title: string;
    description: string;
    creatorId: string;
} | null> {
    const giftInfo = await validateGiftLink(publicKey);
    if (!giftInfo) return null;

    try {
        const response = await fetch(`${getRpcUrl()}/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "1",
                method: "query",
                params: {
                    request_type: "call_function",
                    finality: "final",
                    account_id: NFT_CONTRACT_ID,
                    method_name: "get_event",
                    args_base64: Buffer.from(JSON.stringify({ encrypted_cid: giftInfo.eventCid })).toString("base64"),
                },
            }),
        });

        const data = await response.json();

        if (data.error || !data.result?.result) {
            return null;
        }

        const event = JSON.parse(Buffer.from(data.result.result).toString());

        return {
            title: event.title,
            description: event.description,
            creatorId: event.creator_id,
        };
    } catch (error) {
        console.error("Error getting event info:", error);
        return null;
    }
}
