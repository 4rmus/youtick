/**
 * Gift Service - Native Contract-Based Gift Link System
 * 
 * Replaces Keypom with contract's native Access Key-based gift drops.
 * Uses contract methods: create_gift_drop, claim_gift, claim_gift_and_create_account
 */

import { KeyPair, utils, connect, keyStores } from "near-api-js";
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
 * Create a sponsored trial account - NO funder key needed!
 * Contract pays from its trial pool and creates subaccount
 * 
 * @param username - Just the username prefix (e.g. "alice")
 * @returns The full account ID will be returned in the result (e.g. "alice.contract.testnet")
 */
export async function createSponsoredTrial(
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
        console.error("Sponsored trial error:", error);
        return {
            success: false,
            error: error.message || "Failed to create trial account",
        };
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

    // Calculate total deposit
    const depositPerLink = utils.format.parseNearAmount(DEPOSIT_PER_LINK)!;
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
        const keyPair = KeyPair.fromString(secretKey as any);

        // Create a key store with the gift key
        const keyStore = new keyStores.InMemoryKeyStore();
        await keyStore.setKey(NETWORK_ID, NFT_CONTRACT_ID, keyPair);

        // Connect to NEAR
        const near = await connect({
            networkId: NETWORK_ID,
            keyStore,
            nodeUrl: getRpcUrl(),
        });

        // Get account object for the contract (we'll sign as the contract using the access key)
        const account = await near.account(NFT_CONTRACT_ID);

        // Call claim_gift_and_create_account
        await account.functionCall({
            contractId: NFT_CONTRACT_ID,
            methodName: "claim_gift_and_create_account",
            args: {
                new_account_id: newAccountId,
                new_public_key: newPublicKey,
            },
            gas: BigInt("200000000000000"), // 200 TGas
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
        const keyPair = KeyPair.fromString(secretKey as any);

        const keyStore = new keyStores.InMemoryKeyStore();
        await keyStore.setKey(NETWORK_ID, NFT_CONTRACT_ID, keyPair);

        const near = await connect({
            networkId: NETWORK_ID,
            keyStore,
            nodeUrl: getRpcUrl(),
        });

        const account = await near.account(NFT_CONTRACT_ID);

        const result = await account.functionCall({
            contractId: NFT_CONTRACT_ID,
            methodName: "claim_gift",
            args: {
                receiver_id: receiverId,
            },
            gas: BigInt("100000000000000"), // 100 TGas
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
            const keyPair = KeyPair.fromString(secretKey as any);
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
