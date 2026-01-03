import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitNetwork, LitAbility } from "@lit-protocol/constants";
import { encryptFile, decryptToFile } from "@lit-protocol/encryption";
import { createSiweMessageWithRecaps, generateAuthSig, LitAccessControlConditionResource, LitPKPResource, LitActionResource } from "@lit-protocol/auth-helpers";
import { ethers } from "ethers";

export const LIT_ACTION_CID = "QmZhqF9xZAJTTRyUR4d5L1zt83MByXaXUQuaU3a7gKdsh6";

// Session cache key prefix
const SESSION_CACHE_KEY = 'lit_session_sigs';
const SESSION_CACHE_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days - minimizes gas costs for viewers

// Operation types for dual caching strategy
export type SessionOperation = 'upload' | 'view' | 'purchase';

// Session cache helpers
const CURRENT_NETWORK = "datil-test";

const client = new LitNodeClient({
    litNetwork: "datil-test",
    debug: true,
    rpcUrl: typeof window !== 'undefined' ? `${window.location.origin}/api/lit-rpc` : undefined
});

function checkNetworkAndClearCache(accountId: string) {
    if (typeof window === 'undefined') return;
    const storedNet = localStorage.getItem('lit_active_network');
    if (storedNet !== CURRENT_NETWORK) {
        localStorage.removeItem(`${SESSION_CACHE_KEY}_${accountId}`);
        localStorage.removeItem(`pkp_${accountId}`);
        localStorage.setItem('lit_active_network', CURRENT_NETWORK);
        console.log(`Network mismatch detected (${storedNet} -> ${CURRENT_NETWORK}). Lit session cache cleared.`);
    }
}

export function clearSessionCache(accountId: string) {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(`${SESSION_CACHE_KEY}_${accountId}`);
    localStorage.removeItem(`pkp_${accountId}`); // Also clear PKP session cache
    console.log(`Cleared Lit session cache for ${accountId}`);
}

/**
 * Dual Session Caching Strategy:
 * - 'upload': Always fresh signature (security - involves payment)
 * - 'view' / 'purchase': Use cached session (30 days - UX optimization)
 */
function getCachedSessionSigs(accountId: string, operation: SessionOperation = 'view'): any | null {
    // Upload operations always require fresh signature for security
    if (operation === 'upload') {
        console.log('Upload operation - requiring fresh signature for security');
        return null;
    }

    if (typeof window === 'undefined') return null;

    const cached = localStorage.getItem(`${SESSION_CACHE_KEY}_${accountId}`);
    if (!cached) return null;

    try {
        const { sigs, expiresAt } = JSON.parse(cached);
        if (Date.now() < expiresAt) {
            console.log(`Using cached session sigs for ${operation} (expires in ${Math.round((expiresAt - Date.now()) / 1000 / 60)} min)`);
            return sigs;
        }
        // Expired - remove
        localStorage.removeItem(`${SESSION_CACHE_KEY}_${accountId}`);
        console.log('Session cache expired, will create new one');
    } catch (e) {
        localStorage.removeItem(`${SESSION_CACHE_KEY}_${accountId}`);
    }
    return null;
}

function setCachedSessionSigs(accountId: string, sessionSigs: any, operation: SessionOperation = 'view'): void {
    // Don't cache upload sessions
    if (operation === 'upload') {
        console.log('Upload operation - not caching session');
        return;
    }

    if (typeof window === 'undefined') return;

    const cacheData = {
        sigs: sessionSigs,
        expiresAt: Date.now() + SESSION_CACHE_EXPIRY
    };
    localStorage.setItem(`${SESSION_CACHE_KEY}_${accountId}`, JSON.stringify(cacheData));
    console.log(`Cached session sigs for ${accountId} (30 days)`);
}

class Lit {
    private litNodeClient: LitNodeClient;

    constructor() {
        this.litNodeClient = client;
    }

    async connect() {
        if (!this.litNodeClient.ready) {
            await this.litNodeClient.connect();
        }
    }

    async getSessionSigs(
        wallet: any,
        accountId: string,
        ethAddress: string,
        signWithMPC: (wallet: any, accountId: string, path: string, message: string) => Promise<any>,
        accessControlConditions?: any[],
        dataToEncryptHash?: string,
        derivationPath: string = "lit/pkp-minting"
    ) {
        await this.connect();
        console.log("getSessionSigs called with accountId:", accountId, "Path:", derivationPath);

        // Security: Clear stale cache if network changed
        checkNetworkAndClearCache(accountId);

        // Check cache first - avoid repeated signatures!
        const cachedSigs = getCachedSessionSigs(accountId);
        if (cachedSigs) {
            return cachedSigs;
        }

        // Revert to wildcard for simplicity and add Signing ability
        const resource = new LitAccessControlConditionResource('*');

        const sessionSigs = await this.litNodeClient.getSessionSigs({
            chain: 'ethereum',
            expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
            resourceAbilityRequests: [
                {
                    resource: resource,
                    ability: LitAbility.AccessControlConditionDecryption,
                },
                {
                    resource: resource,
                    ability: LitAbility.AccessControlConditionSigning,
                },
            ],
            authNeededCallback: async ({ resourceAbilityRequests, expiration, uri }) => {
                console.log("authNeededCallback resourceAbilityRequests:", JSON.stringify(resourceAbilityRequests, null, 2));
                if (!uri || !expiration || !resourceAbilityRequests) {
                    throw new Error("Missing required fields in authNeededCallback");
                }

                // Use mathematical derivation directly (verified to work correctly)
                // This saves one MPC call per video playback
                if (!ethAddress) {
                    throw new Error("ethAddress is required - mathematical derivation should have provided it");
                }
                const derivedAddress = ethAddress;
                console.log("Using derived MPC Address:", derivedAddress);

                // Create SIWE Message with the Derived Address
                const toSign = await createSiweMessageWithRecaps({
                    uri,
                    expiration,
                    resources: resourceAbilityRequests,
                    walletAddress: derivedAddress,
                    nonce: await this.litNodeClient.getLatestBlockhash(),
                    litNodeClient: this.litNodeClient,
                });

                console.log("Signing SIWE with MPC:", toSign);

                // 3. Sign the Real SIWE Message
                const mpcSignature = await signWithMPC(wallet, accountId, derivationPath, toSign);

                const r_val = '0x' + mpcSignature.big_r.affine_point.substring(2, 66);
                const s_val = '0x' + mpcSignature.s.scalar;
                let v_val = 27;
                if (typeof mpcSignature.recovery_id === 'number') {
                    v_val = mpcSignature.recovery_id + 27;
                }
                const signature = ethers.Signature.from({ r: r_val, s: s_val, v: v_val }).serialized;

                // Verify
                let recoveredAddr = ethers.verifyMessage(toSign, signature);
                console.log("Final Session Sig Address:", recoveredAddr);

                let validSignature = signature;

                if (recoveredAddr.toLowerCase() !== derivedAddress.toLowerCase()) {
                    console.warn("Address mismatch! Retrying with v-flip...");
                    const flippedV = v_val === 27 ? 28 : 27;
                    const flippedSignature = ethers.Signature.from({ r: r_val, s: s_val, v: flippedV }).serialized;
                    const recoveredFlipped = ethers.verifyMessage(toSign, flippedSignature);

                    if (recoveredFlipped.toLowerCase() === derivedAddress.toLowerCase()) {
                        console.log("v-flip successful! Correct address recovered:", recoveredFlipped);
                        recoveredAddr = recoveredFlipped;
                        validSignature = flippedSignature;
                    } else {
                        console.error("Critical: Address mismatch even after v-flip!", {
                            expected: derivedAddress,
                            got: recoveredFlipped
                        });
                    }
                }

                return {
                    sig: validSignature,
                    derivedVia: "web3.eth.personal.sign",
                    signedMessage: toSign,
                    address: derivedAddress,
                };
            },
        });

        // Cache the session signatures for future use
        setCachedSessionSigs(accountId, sessionSigs);
        return sessionSigs;
    }

    async encryptFile(
        file: File,
        accessControlConditions: any[],
        authSig: any,
        chain: string,
        sessionSigs?: any
    ) {
        await this.connect();

        const params: any = {
            file,
            chain,
            unifiedAccessControlConditions: accessControlConditions
        };

        if (sessionSigs) {
            params.sessionSigs = sessionSigs;
        } else {
            params.authSig = authSig;
        }

        const { ciphertext, dataToEncryptHash } = await encryptFile(
            params,
            client
        );

        return { ciphertext, dataToEncryptHash };
    }

    async decryptFile(
        ciphertext: string,
        dataToEncryptHash: string,
        accessControlConditions: any[],
        authSig: any,
        chain: string,
        sessionSigs?: any
    ): Promise<Uint8Array> {
        await this.connect();

        const params: any = {
            ciphertext,
            dataToEncryptHash,
            chain,
            unifiedAccessControlConditions: accessControlConditions
        };

        if (sessionSigs) {
            params.sessionSigs = sessionSigs;
        } else {
            params.authSig = authSig;
        }

        console.log("Calling decryptToFile with params:", JSON.stringify(params, null, 2));

        const decryptedFile = await decryptToFile(
            params,
            client
        );

        return decryptedFile;
    }

    async getLatestBlockhash() {
        await this.connect();
        return this.litNodeClient.getLatestBlockhash();
    }

    /**
     * Get session signatures using a PKP (signless experience).
     * Uses Lit Action to verify NEAR signature and authorize the PKP.
     * 
     * @param pkpPublicKey - PKP's public key (from minting)
     * @param pkpEthAddress - PKP's ETH address
     * @param nearAccountId - Original NEAR account ID for cache key
     * @param nearSignature - NEAR wallet signature (stored during PKP linking)
     * @param nearMessage - Message that was signed
     * @param nearPublicKey - NEAR public key that signed
     * @param capacityDelegationAuthSig - Optional capacity delegation auth sig for testnet
     */
    async getSessionSigsWithPKP(
        pkpPublicKey: string,
        pkpEthAddress: string,
        nearAccountId: string,
        nearSignature?: string,
        nearMessage?: string,
        nearPublicKey?: string,
        capacityDelegationAuthSig?: any
    ) {
        await this.connect();
        console.log("getSessionSigsWithPKP called for:", nearAccountId, "PKP:", pkpEthAddress);

        // Security: Clear stale cache if network changed
        checkNetworkAndClearCache(nearAccountId);

        // Check cache with PKP-specific key
        const cacheKey = `pkp_${nearAccountId}`;
        const cachedSigs = getCachedSessionSigs(cacheKey);
        if (cachedSigs) {
            console.log("Using cached PKP session sigs");
            return cachedSigs;
        }

        // Import capacity delegation helper
        const { createCapacityDelegationAuthSig, isCapacityDelegationAvailable } = await import('./capacity');

        // Create capacity delegation auth sig if available and not provided
        let effectiveCapacityDelegationAuthSig = capacityDelegationAuthSig;
        if (!effectiveCapacityDelegationAuthSig && isCapacityDelegationAvailable()) {
            console.log("Creating capacity delegation auth sig...");
            effectiveCapacityDelegationAuthSig = await createCapacityDelegationAuthSig(
                this.litNodeClient,
                pkpEthAddress,
                10, // 10 uses
                60  // 1 hour expiry
            );
        }

        // Use IPFS CID of Lit Action - MUST match the CID registered as auth method during PKP minting
        const litActionIpfsCid = process.env.NEXT_PUBLIC_LIT_ACTION_IPFS_CID ||
            "Qmc6cLer2fmtuzNFhdtBoZvM1gCzX9s8gbc8wzWdizeuJe";

        console.log("Using Lit Action IPFS CID for PKP session sigs:", litActionIpfsCid);

        // Build session sig params
        const sessionParams: any = {
            pkpPublicKey,
            litActionIpfsId: litActionIpfsCid,
            jsParams: {
                pkpPublicKey: pkpPublicKey  // Pass to Lit Action context
            },
            resourceAbilityRequests: [
                {
                    resource: new LitAccessControlConditionResource('*'),
                    ability: LitAbility.AccessControlConditionDecryption
                },
                {
                    resource: new LitPKPResource('*'),
                    ability: LitAbility.PKPSigning
                },
                {
                    resource: new LitActionResource('*'),
                    ability: LitAbility.LitActionExecution
                }
            ],
            expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
        };

        // Add capacity delegation if available (required for datil-test)
        if (effectiveCapacityDelegationAuthSig) {
            sessionParams.capabilityAuthSigs = [effectiveCapacityDelegationAuthSig];
            console.log("Using capacity delegation auth sig for testnet");
        }

        const sessionSigs = await this.litNodeClient.getLitActionSessionSigs(sessionParams);

        console.log("✅ PKP Session Sigs created with IPFS CID!");
        setCachedSessionSigs(cacheKey, sessionSigs);
        return sessionSigs;
    }
}

export const lit = new Lit();
