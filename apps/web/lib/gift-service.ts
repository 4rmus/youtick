/**
 * Gift Service - Native Contract-Based Gift Link System
 * near-api-js v7 compatible
 *
 * Replaces Keypom with contract's native Access Key-based gift drops.
 * Uses contract methods: create_gift_drop, claim_gift, claim_gift_and_create_account
 */

import { KeyPair, Account, KeyPairSigner, actions, type KeyPairString } from "near-api-js";
import type { WalletInstance } from "./types";

import { APP_CONFIG, NEAR_CONFIG, GAS_CONSTANTS } from './constants';
import { recordMetric } from './decentralization-metrics';
import { nearAmountToYocto } from './near-amount';
import { getCurrentRpcUrl } from './rpc-failover';
import { persistManagedKeyPair, writeManagedNearAccount } from './managed-near-account';

// Contract ID from centralized config
const NFT_CONTRACT_ID = NEAR_CONFIG.contractId;
const NETWORK_ID = NEAR_CONFIG.networkId;
const APP_URL = APP_CONFIG.publicAppUrl;

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

export interface TrialInviteInfo {
    sponsorId: string;
    remainingClaims: number;
    createdAtMs: number;
    expiresAtMs?: number | null;
}

function onboardingStorageKey(): string {
    return `onboarding_key:${NFT_CONTRACT_ID}`;
}

function readOnboardingKey(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(onboardingStorageKey());
}

async function isOnboardingKeyAuthorized(publicKey: string): Promise<boolean> {
    try {
        const response = await fetch(`${getCurrentRpcUrl()}/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "onboarding-auth-check",
                method: "query",
                params: {
                    request_type: "call_function",
                    finality: "final",
                    account_id: NFT_CONTRACT_ID,
                    method_name: "is_onboarding_key",
                    args_base64: Buffer.from(JSON.stringify({ public_key: publicKey })).toString("base64"),
                },
            }),
        });

        const data = await response.json();
        if (data.error || !data.result?.result) return false;

        const result = JSON.parse(Buffer.from(data.result.result).toString());
        return Boolean(result);
    } catch {
        return false;
    }
}

async function getValidatedOnboardingKeyPair(retryDelayMs: number = 1500): Promise<KeyPair | null> {
    let onboardingKeyStr = readOnboardingKey();

    if (!onboardingKeyStr && retryDelayMs > 0) {
        // Key may still be loading from OnboardingKeyInit on first app load
        await new Promise(r => setTimeout(r, retryDelayMs));
        onboardingKeyStr = readOnboardingKey();
    }

    if (!onboardingKeyStr) return null;

    try {
        const keyPair = KeyPair.fromString(onboardingKeyStr as KeyPairString);
        const isAuthorized = await isOnboardingKeyAuthorized(keyPair.getPublicKey().toString());

        if (!isAuthorized) {
            if (typeof window !== "undefined") {
                localStorage.removeItem(onboardingStorageKey());
            }
            return null;
        }

        return keyPair;
    } catch {
        if (typeof window !== "undefined") {
            localStorage.removeItem(onboardingStorageKey());
        }
        return null;
    }
}

/**
 * Check trial pool balance
 */
export async function getTrialPoolBalance(): Promise<string> {
    try {
        const response = await fetch(`${getCurrentRpcUrl()}/`, {
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
 * @returns The full account ID will be returned in the result (e.g. "alice.youtick.near")
 */
export async function createSponsoredTrialDirect(
    username: string
): Promise<SponsoredTrialResult> {
    try {
        // Onboarding key is required for anti-abuse controls (authorized key + on-chain daily limit)
        const onboardingKeyPair = await getValidatedOnboardingKeyPair();
        if (!onboardingKeyPair) {
            return {
                success: false,
                error: "Onboarding key unavailable or unauthorized. Trial account creation is temporarily disabled.",
            };
        }

        // Generate keypair for the new account
        const userKeyPair = KeyPair.fromRandom("ed25519");
        const userPublicKey = userKeyPair.getPublicKey().toString();
        const userSecretKey = userKeyPair.toString();

        // v7: Create Account directly with signer
        const signer = new KeyPairSigner(onboardingKeyPair);
        const account = new Account(NFT_CONTRACT_ID, getCurrentRpcUrl(), signer);

        // Call create_sponsored_trial_direct using v7 actions format
        await account.signAndSendTransaction({
            receiverId: NFT_CONTRACT_ID,
            actions: [
                actions.functionCall(
                    "create_sponsored_trial_direct",
                    { username, new_public_key: userPublicKey },
                    GAS_CONSTANTS.highGas,
                    BigInt(0) // No deposit
                )
            ]
        });

        // Determine new account ID
        const accountId = `${username}.${NFT_CONTRACT_ID}`;

        await persistManagedKeyPair(accountId, userSecretKey);
        writeManagedNearAccount(accountId, 'trial');

        return {
            success: true,
            accountId,
            secretKey: userSecretKey,
        };
    } catch (error: unknown) {
        console.error("Direct sponsored trial error:", error);
        const errMsg = error instanceof Error ? error.message : '';

        // Remove invalid key from cache so next flow can load a fresh one
        if (errMsg.includes("Unauthorized") || errMsg.includes("onboarding key")) {
            if (typeof window !== "undefined") {
                localStorage.removeItem(onboardingStorageKey());
            }
            return {
                success: false,
                error: "Unauthorized onboarding key. Please rotate onboarding key and try again.",
            };
        }

        return {
            success: false,
            error: errMsg || "Failed to create trial account",
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

        await persistManagedKeyPair(accountId, secretKey);
        writeManagedNearAccount(accountId, 'trial');

        return {
            success: true,
            accountId,
            secretKey,
        };
    } catch (error: unknown) {
        console.error("Relayer sponsored trial error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create trial account",
        };
    }
}

/**
 * Create a sponsored trial account.
 * Prefer the server relayer so onboarding keys do not need to be exposed to the browser.
 * A locally provisioned onboarding key is kept only as a manual fallback.
 *
 * @param username - Just the username prefix (e.g. "alice")
 * @returns The full account ID and method used
 */
export async function createSponsoredTrial(
    username: string
): Promise<SponsoredTrialResult & { method?: 'direct' | 'relayer' }> {
    const relayerResult = await createSponsoredTrialRelayer(username);
    if (relayerResult.success) {
        recordMetric('trial_relayer_fallback');
        console.log(`[DECENTRALIZATION_METRIC] {"operation":"trial_create","method":"relayer","username":"${username}","timestamp":${Date.now()}}`);
        return { ...relayerResult, method: 'relayer' };
    }

    if (hasOnboardingKey()) {
        const directResult = await createSponsoredTrialDirect(username);
        if (directResult.success) {
            recordMetric('trial_direct_success');
            console.log(`[DECENTRALIZATION_METRIC] {"operation":"trial_create","method":"direct","username":"${username}","timestamp":${Date.now()}}`);
            return { ...directResult, method: 'direct' };
        }

        return {
            success: false,
            method: 'direct',
            error: directResult.error || relayerResult.error || "Failed to create trial account",
        };
    }

    return {
        success: false,
        method: 'relayer',
        error: relayerResult.error || "Failed to create trial account",
    };
}

/**
 * Claim a free ticket via onboarding key (sponsored storage + on-chain daily limit).
 */
export async function claimFreeTicketDirect(
    receiverId: string,
    encryptedCid: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const onboardingKeyPair = await getValidatedOnboardingKeyPair(0);
        if (!onboardingKeyPair) {
            return {
                success: false,
                error: "Onboarding key unavailable or unauthorized. Free ticket claim is temporarily disabled.",
            };
        }

        const signer = new KeyPairSigner(onboardingKeyPair);
        const account = new Account(NFT_CONTRACT_ID, getCurrentRpcUrl(), signer);

        await account.signAndSendTransaction({
            receiverId: NFT_CONTRACT_ID,
            actions: [
                actions.functionCall(
                    "claim_free_ticket_direct",
                    { receiver_id: receiverId, encrypted_cid: encryptedCid },
                    GAS_CONSTANTS.mediumGas,
                    BigInt(0)
                )
            ]
        });

        return { success: true };
    } catch (error: unknown) {
        console.error("Direct free ticket claim error:", error);
        const errMsg = error instanceof Error ? error.message : "Failed to claim free ticket";

        if (errMsg.includes("Unauthorized") || errMsg.includes("onboarding key")) {
            if (typeof window !== "undefined") {
                localStorage.removeItem(onboardingStorageKey());
            }
            return {
                success: false,
                error: "Unauthorized onboarding key. Please rotate onboarding key and try again.",
            };
        }

        return { success: false, error: errMsg };
    }
}

/**
 * Store an onboarding key for manual recovery or controlled local testing.
 */
export function setOnboardingKey(secretKey: string): void {
    if (typeof window !== "undefined") {
        localStorage.setItem(onboardingStorageKey(), secretKey);
    }
}

/**
 * Check if a locally provisioned onboarding key is available
 */
export function hasOnboardingKey(): boolean {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem(onboardingStorageKey());
}

/**
 * Get the onboarding key from localStorage
 */
export function getOnboardingKey(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(onboardingStorageKey());
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
            fetch(`${getCurrentRpcUrl()}/`, {
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
            fetch(`${getCurrentRpcUrl()}/`, {
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

function implicitAccountIdFromPublicKeyBytes(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

export function generateImplicitTrialAccount(): {
    accountId: string;
    publicKey: string;
    secretKey: string;
} {
    const keyPair = KeyPair.fromRandom("ed25519");
    return {
        accountId: implicitAccountIdFromPublicKeyBytes(keyPair.getPublicKey().data),
        publicKey: keyPair.getPublicKey().toString(),
        secretKey: keyPair.toString(),
    };
}

export async function createTrialInviteLinks(
    numLinks: number,
    wallet: WalletInstance,
    ttlMs?: number,
): Promise<GiftLinkResult[]> {
    if (numLinks < 1 || numLinks > 50) {
        throw new Error("Must create 1-50 trial invites");
    }

    const keyPairs = generateKeyPairs(numLinks);
    const publicKeys = keyPairs.map((kp) => kp.publicKey);
    const depositPerInvite = nearAmountToYocto('0.01');
    const totalDeposit = (depositPerInvite * BigInt(numLinks)).toString();

    await wallet.signAndSendTransaction({
        receiverId: NFT_CONTRACT_ID,
        actions: [
            {
                type: "FunctionCall",
                params: {
                    methodName: "create_trial_invite_drop",
                    args: {
                        public_keys: publicKeys,
                        ttl_ms: ttlMs ?? null,
                    },
                    gas: GAS_CONSTANTS.mediumGas.toString(),
                    deposit: totalDeposit,
                },
            },
        ],
    });

    return keyPairs.map((kp) => ({
        publicKey: kp.publicKey,
        secretKey: kp.secretKey,
        link: `${APP_URL}/trial?key=${encodeURIComponent(kp.secretKey)}`,
    }));
}

/**
 * Create gift links by calling contract's create_gift_drop
 * Creator pays 0.15 NEAR per link
 */
export async function createGiftLinks(
    eventCid: string,
    numLinks: number,
    wallet: WalletInstance
): Promise<GiftLinkResult[]> {
    if (numLinks < 1 || numLinks > 50) {
        throw new Error("Must create 1-50 links");
    }

    // Generate key pairs
    const keyPairs = generateKeyPairs(numLinks);
    const publicKeys = keyPairs.map(kp => kp.publicKey);

    const depositPerLink = nearAmountToYocto(DEPOSIT_PER_LINK);
    const totalDeposit = (depositPerLink * BigInt(numLinks)).toString();

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
                    gas: GAS_CONSTANTS.mediumGas.toString(),
                    deposit: totalDeposit,
                },
            },
        ],
    });

    // Generate links
    const links: GiftLinkResult[] = keyPairs.map(kp => ({
        publicKey: kp.publicKey,
        secretKey: kp.secretKey,
        link: `${APP_URL}/claim#key=${encodeURIComponent(kp.secretKey)}`,
    }));

    return links;
}

/**
 * Validate a gift link by checking if the public key is valid
 */
export async function validateGiftLink(publicKey: string): Promise<GiftInfo | null> {
    try {
        const response = await fetch(`${getCurrentRpcUrl()}/`, {
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

export async function validateTrialInviteLink(publicKey: string): Promise<TrialInviteInfo | null> {
    try {
        const response = await fetch(`${getCurrentRpcUrl()}/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "trial-invite-info",
                method: "query",
                params: {
                    request_type: "call_function",
                    finality: "final",
                    account_id: NFT_CONTRACT_ID,
                    method_name: "get_trial_invite_info",
                    args_base64: Buffer.from(JSON.stringify({ public_key: publicKey })).toString("base64"),
                },
            }),
        });

        const data = await response.json();
        if (data.error || !data.result?.result) {
            return null;
        }

        const result = JSON.parse(Buffer.from(data.result.result).toString());
        if (!result || result.remaining_claims <= 0) {
            return null;
        }

        if (result.expires_at_ms && Date.now() > result.expires_at_ms) {
            return null;
        }

        return {
            sponsorId: result.sponsor_id,
            remainingClaims: result.remaining_claims,
            createdAtMs: result.created_at_ms,
            expiresAtMs: result.expires_at_ms ?? null,
        };
    } catch (error) {
        console.error("Error validating trial invite:", error);
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
        const account = new Account(NFT_CONTRACT_ID, getCurrentRpcUrl(), signer);

        // Call claim_gift_and_create_account using v7 actions format
        await account.signAndSendTransaction({
            receiverId: NFT_CONTRACT_ID,
            actions: [
                actions.functionCall(
                    "claim_gift_and_create_account",
                    { new_account_id: newAccountId, new_public_key: newPublicKey },
                    GAS_CONSTANTS.highGas,
                    BigInt(0) // No deposit
                )
            ]
        });

        return {
            success: true,
            accountId: newAccountId,
        };
    } catch (error: unknown) {
        console.error("Error claiming gift:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to claim gift",
        };
    }
}

export async function claimTrialInviteWithImplicitAccount(
    secretKey: string,
): Promise<SponsoredTrialResult> {
    try {
        const inviteKeyPair = KeyPair.fromString(secretKey as KeyPairString);
        const implicitAccount = generateImplicitTrialAccount();

        const signer = new KeyPairSigner(inviteKeyPair);
        const account = new Account(NFT_CONTRACT_ID, getCurrentRpcUrl(), signer);

        await account.signAndSendTransaction({
            receiverId: NFT_CONTRACT_ID,
            actions: [
                actions.functionCall(
                    "claim_trial_invite_with_implicit_account",
                    { new_public_key: implicitAccount.publicKey },
                    GAS_CONSTANTS.mediumGas,
                    BigInt(0),
                ),
            ],
        });

        await persistManagedKeyPair(implicitAccount.accountId, implicitAccount.secretKey);
        writeManagedNearAccount(implicitAccount.accountId, 'trial');

        return {
            success: true,
            accountId: implicitAccount.accountId,
            secretKey: implicitAccount.secretKey,
        };
    } catch (error: unknown) {
        console.error("Error claiming trial invite:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to claim trial invite",
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
        const account = new Account(NFT_CONTRACT_ID, getCurrentRpcUrl(), signer);

        // v7 actions format for Account.signAndSendTransaction
        await account.signAndSendTransaction({
            receiverId: NFT_CONTRACT_ID,
            actions: [
                actions.functionCall(
                    "claim_gift",
                    { receiver_id: receiverId },
                    GAS_CONSTANTS.mediumGas,
                    BigInt(0) // No deposit
                )
            ]
        });

        return {
            success: true,
        };
    } catch (error: unknown) {
        console.error("Error claiming gift:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to claim gift",
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
        const response = await fetch(`${getCurrentRpcUrl()}/`, {
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
