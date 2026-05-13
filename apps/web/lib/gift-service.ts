/**
 * Gift Service - Native Contract-Based Gift Link System
 * near-api-js v7 compatible
 *
 * Replaces Keypom with contract's native Access Key-based gift drops.
 * Uses contract methods: create_gift_drop, claim_gift, claim_gift_with_implicit_account
 */

import { KeyPair, PublicKey, Account, KeyPairSigner, actions, type KeyPairString } from "near-api-js";
import type { WalletInstance } from "./types";

import { APP_CONFIG, NEAR_CONFIG, GAS_CONSTANTS } from './constants';
import { recordMetric } from './decentralization-metrics';
import { nearAmountToYocto } from './near-amount';
import { getCurrentRpcUrl } from './rpc-failover';
import { persistManagedKeyPair, writeManagedNearAccount } from './managed-near-account';

// Contract ID from centralized config
const NFT_CONTRACT_ID = NEAR_CONFIG.contractId;
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
    return sessionStorage.getItem(onboardingStorageKey());
}

async function getTurnstileToken(siteKey: string): Promise<string | null> {
    return new Promise((resolve) => {
        if (typeof window === "undefined") {
            resolve(null);
            return;
        }

        const w = window as unknown as {
            turnstile?: {
                render: (selector: string, opts: Record<string, unknown>) => string;
                remove: (widgetId: string) => void;
            };
        };

        function render() {
            if (!w.turnstile) {
                resolve(null);
                return;
            }

            const containerId = 'turnstile-onboarding-' + Math.random().toString(36).slice(2);
            const container = document.createElement('div');
            container.id = containerId;
            container.style.position = 'absolute';
            container.style.visibility = 'hidden';
            container.style.width = '0';
            container.style.height = '0';
            document.body.appendChild(container);

            const widgetId = w.turnstile.render(`#${containerId}`, {
                sitekey: siteKey,
                size: 'invisible',
                callback: (token: string) => {
                    w.turnstile?.remove(widgetId);
                    container.remove();
                    resolve(token);
                },
                'error-callback': () => {
                    w.turnstile?.remove(widgetId);
                    container.remove();
                    resolve(null);
                },
                'expired-callback': () => {
                    w.turnstile?.remove(widgetId);
                    container.remove();
                    resolve(null);
                },
            });
        }

        if (!w.turnstile) {
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            script.defer = true;
            script.onload = render;
            script.onerror = () => resolve(null);
            document.head.appendChild(script);
        } else {
            render();
        }
    });
}

export async function ensureOnboardingKey(): Promise<{ ok: boolean; error?: string }> {
    if (readOnboardingKey()) {
        return { ok: true };
    }

    if (typeof window === "undefined") {
        return { ok: false, error: "Onboarding key is unavailable in this context." };
    }

    let turnstileToken: string | null = null;
    if (APP_CONFIG.turnstileSiteKey) {
        turnstileToken = await getTurnstileToken(APP_CONFIG.turnstileSiteKey);
    }

    const url = turnstileToken
        ? `/api/onboarding-key?turnstileToken=${encodeURIComponent(turnstileToken)}`
        : '/api/onboarding-key';

    try {
        const response = await fetch(url);
        const data = await response.json().catch(() => null) as { key?: string; error?: string } | null;
        if (!response.ok) {
            return { ok: false, error: data?.error || "Guest account creation is temporarily unavailable." };
        }

        if (!data?.key) {
            return { ok: false, error: "Onboarding key was not returned by the server." };
        }

        sessionStorage.setItem(onboardingStorageKey(), data.key);
        return { ok: true };
    } catch (error: unknown) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : "Failed to fetch onboarding key.",
        };
    }
}

async function isOnboardingKeyAuthorized(publicKey: string): Promise<boolean> {
    try {
        const response = await fetch(getCurrentRpcUrl(), {
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
                    args_base64: btoa(JSON.stringify({ public_key: publicKey })),
                },
            }),
        });

        const data = await response.json();
        if (data.error || !data.result?.result) return false;

        const result = JSON.parse(String.fromCharCode(...data.result.result));
        return Boolean(result);
    } catch {
        return false;
    }
}

async function getValidatedOnboardingKeyPair(retryDelayMs: number = 0): Promise<KeyPair | null> {
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
                sessionStorage.removeItem(onboardingStorageKey());
            }
            return null;
        }

        return keyPair;
    } catch {
        if (typeof window !== "undefined") {
            sessionStorage.removeItem(onboardingStorageKey());
        }
        return null;
    }
}

/**
 * Check trial pool balance
 */
export async function getTrialPoolBalance(): Promise<string> {
    try {
        const response = await fetch(getCurrentRpcUrl(), {
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
                    args_base64: btoa("{}"),
                },
            }),
        });

        const data = await response.json();
        if (data.error || !data.result?.result) return "0";

        const result = JSON.parse(String.fromCharCode(...data.result.result));
        return result || "0";
    } catch {
        return "0";
    }
}

/**
 * Legacy named subaccount trial path.
 * New guest/trial onboarding uses sponsorImplicitGuestDirect or trial invites.
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

        // Legacy named-account method retained for compatibility.
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
                sessionStorage.removeItem(onboardingStorageKey());
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
 * Sponsor an implicit guest account using the onboarding key.
 * Creates a funded implicit account without needing a relayer.
 */
export async function sponsorImplicitGuestDirect(
    newPublicKey: string
): Promise<{ success: boolean; accountId?: string; error?: string }> {
    try {
        const onboardingKeyPair = await getValidatedOnboardingKeyPair();
        if (!onboardingKeyPair) {
            return {
                success: false,
                error: "Onboarding key unavailable or unauthorized. Guest account creation is temporarily disabled.",
            };
        }

        const signer = new KeyPairSigner(onboardingKeyPair);
        const account = new Account(NFT_CONTRACT_ID, getCurrentRpcUrl(), signer);

        await account.signAndSendTransaction({
            receiverId: NFT_CONTRACT_ID,
            actions: [
                actions.functionCall(
                    "sponsor_implicit_guest_direct",
                    { new_public_key: newPublicKey },
                    GAS_CONSTANTS.mediumGas,
                    BigInt(0)
                )
            ]
        });

        // Derive implicit account ID from the public key (same logic as publicKeyToImplicitAccountId)
        const normalized = newPublicKey.startsWith('ed25519:') ? newPublicKey : `ed25519:${newPublicKey}`;
        const parsedPublicKey = PublicKey.fromString(normalized);
        const implicitAccountId = Array.from(parsedPublicKey.data)
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');

        return {
            success: true,
            accountId: implicitAccountId,
        };
    } catch (error: unknown) {
        console.error("Sponsor implicit guest direct error:", error);
        const errMsg = error instanceof Error ? error.message : '';

        if (errMsg.includes("Unauthorized") || errMsg.includes("onboarding key")) {
            if (typeof window !== "undefined") {
                sessionStorage.removeItem(onboardingStorageKey());
            }
            return {
                success: false,
                error: "Unauthorized onboarding key. Please rotate onboarding key and try again.",
            };
        }

        return {
            success: false,
            error: errMsg || "Failed to sponsor guest account",
        };
    }
}

/**
 * Legacy named subaccount trial helper.
 * Use implicit guest onboarding for new product flows.
 *
 * @param username - Just the username prefix (e.g. "alice")
 * @returns The full account ID and result
 */
export async function createSponsoredTrial(
    username: string
): Promise<SponsoredTrialResult> {
    const result = await createSponsoredTrialDirect(username);
    if (result.success) {
        recordMetric('trial_direct_success');
    }
    return result;
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
                sessionStorage.removeItem(onboardingStorageKey());
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
        sessionStorage.setItem(onboardingStorageKey(), secretKey);
    }
}

/**
 * Check if a locally provisioned onboarding key is available
 */
export function hasOnboardingKey(): boolean {
    if (typeof window === "undefined") return false;
    return !!sessionStorage.getItem(onboardingStorageKey());
}

/**
 * Get the onboarding key from sessionStorage
 */
export function getOnboardingKey(): string | null {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(onboardingStorageKey());
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
            fetch(getCurrentRpcUrl(), {
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
                        args_base64: btoa("{}"),
                    },
                }),
            }),
            fetch(getCurrentRpcUrl(), {
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
                        args_base64: btoa("{}"),
                    },
                }),
            }),
        ]);

        const configData = await configResponse.json();
        const countData = await countResponse.json();

        if (configData.error || !configData.result?.result) return null;

        const config = JSON.parse(String.fromCharCode(...configData.result.result));
        const count = countData.result?.result
            ? JSON.parse(String.fromCharCode(...countData.result.result))
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
        link: `${APP_URL}/trial#key=${encodeURIComponent(kp.secretKey)}`,
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
        const response = await fetch(getCurrentRpcUrl(), {
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
                    args_base64: btoa(JSON.stringify({ public_key: publicKey })),
                },
            }),
        });

        const data = await response.json();

        if (data.error || !data.result?.result) {
            return null;
        }

        const result = JSON.parse(String.fromCharCode(...data.result.result));

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
        const response = await fetch(getCurrentRpcUrl(), {
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
                    args_base64: btoa(JSON.stringify({ public_key: publicKey })),
                },
            }),
        });

        const data = await response.json();
        if (data.error || !data.result?.result) {
            return null;
        }

        const result = JSON.parse(String.fromCharCode(...data.result.result));
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

export async function claimGiftWithImplicitAccount(
    secretKey: string,
): Promise<SponsoredTrialResult & { txHash?: string }> {
    try {
        const giftKeyPair = KeyPair.fromString(secretKey as KeyPairString);
        const implicitAccount = generateImplicitTrialAccount();

        const signer = new KeyPairSigner(giftKeyPair);
        const account = new Account(NFT_CONTRACT_ID, getCurrentRpcUrl(), signer);

        const result = await account.signAndSendTransaction({
            receiverId: NFT_CONTRACT_ID,
            actions: [
                actions.functionCall(
                    "claim_gift_with_implicit_account",
                    { new_public_key: implicitAccount.publicKey },
                    GAS_CONSTANTS.highGas,
                    BigInt(0),
                ),
            ],
        }) as { transaction?: { hash?: string } };

        await persistManagedKeyPair(implicitAccount.accountId, implicitAccount.secretKey);
        writeManagedNearAccount(implicitAccount.accountId, 'guest');

        return {
            success: true,
            accountId: implicitAccount.accountId,
            secretKey: implicitAccount.secretKey,
            txHash: result.transaction?.hash,
        };
    } catch (error: unknown) {
        console.error("Error claiming gift with implicit account:", error);
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
        const response = await fetch(getCurrentRpcUrl(), {
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
                    args_base64: btoa(JSON.stringify({ encrypted_cid: giftInfo.eventCid })),
                },
            }),
        });

        const data = await response.json();

        if (data.error || !data.result?.result) {
            return null;
        }

        const event = JSON.parse(String.fromCharCode(...data.result.result));

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
