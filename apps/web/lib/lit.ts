import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitNetwork, LitAbility } from "@lit-protocol/constants";
import { encryptFile, decryptToFile } from "@lit-protocol/encryption";
import { createSiweMessageWithRecaps, generateAuthSig, LitAccessControlConditionResource, LitPKPResource, LitActionResource } from "@lit-protocol/auth-helpers";
import { ethers } from "ethers";

export const LIT_ACTION_CID = "QmZhqF9xZAJTTRyUR4d5L1zt83MByXaXUQuaU3a7gKdsh6";

// P1 Fix: Lit Error Handling Wrapper with exponential backoff
async function withLitErrorHandling<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    fallback?: T
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            console.warn(`Lit operation attempt ${attempt + 1}/${maxRetries} failed:`, error.message);

            // Check for rate limiting or transient errors
            if (
                error.message?.includes('rate limit') ||
                error.message?.includes('timeout') ||
                error.message?.includes('handshake') ||
                error.message?.includes('network')
            ) {
                // Exponential backoff: 1s, 2s, 4s
                const delay = 1000 * Math.pow(2, attempt);
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            // Non-transient error, don't retry
            break;
        }
    }

    if (fallback !== undefined) {
        console.warn('Lit operation failed, using fallback');
        return fallback;
    }

    throw lastError || new Error('Lit operation failed after retries');
}

// Session cache key prefix
const SESSION_CACHE_KEY = 'lit_session_sigs';
// P0 Security Fix: Reduced from 7 days to 24 hours for mainnet security
// Shorter expiry minimizes XSS token theft window while maintaining UX
const SESSION_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Operation types for dual caching strategy
export type SessionOperation = 'upload' | 'view' | 'purchase';

// Session cache helpers
// P0 Fix: Environment-based network configuration for mainnet readiness
const CURRENT_NETWORK = process.env.NEXT_PUBLIC_LIT_NETWORK || "datil-test";

const client = new LitNodeClient({
    litNetwork: CURRENT_NETWORK as any,
    debug: process.env.NODE_ENV !== 'production',
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
 * - 'view' / 'purchase': Use cached session (24 hours - security + UX balance)
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
    console.log(`Cached session sigs for ${accountId} (24 hours)`);
}

class Lit {
    private litNodeClient: LitNodeClient;

    constructor() {
        this.litNodeClient = client;
    }

    /**
     * Get the underlying LitNodeClient instance
     * Used by PKPManager for smart minting
     */
    getLitNodeClient(): LitNodeClient {
        return this.litNodeClient;
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

    /**
     * Get session signatures using NEAR account verification (no MPC/PKP required).
     * Uses a Lit Action that verifies NFT ownership directly via NEAR RPC.
     * This is GAS-FREE and works for trial accounts without prepaid balance.
     * 
     * @param nearAccountId - NEAR account ID
     * @param targetCid - Video UUID/CID to verify access for
     * @param contractId - NFT contract ID
     */
    async getSessionSigsWithNEARVerification(
        nearAccountId: string,
        targetCid: string,
        contractId: string
    ) {
        await this.connect();
        console.log("getSessionSigsWithNEARVerification for:", nearAccountId, "video:", targetCid);

        // Security: Clear stale cache if network changed
        checkNetworkAndClearCache(nearAccountId);

        // Check cache first - avoid repeated queries
        const cacheKey = `near_verify_${nearAccountId}`;
        const cachedSigs = getCachedSessionSigs(cacheKey);
        if (cachedSigs) {
            console.log("Using cached NEAR verification session sigs");
            return cachedSigs;
        }

        // Lit Action code that verifies NEAR NFT ownership directly
        const litActionCode = `
        (async () => {
            try {
                const nearAccountId = jsParams.nearAccountId;
                const targetCid = jsParams.targetCid;
                const contractId = jsParams.contractId;
                
                console.log("Verifying NEAR NFT ownership for:", nearAccountId, "video:", targetCid);
                
                const rpcUrl = "https://rpc.testnet.near.org";
                
                const response = await fetch(rpcUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        id: "verify-nft",
                        method: "query",
                        params: {
                            request_type: "call_function",
                            finality: "final",
                            account_id: contractId,
                            method_name: "get_tokens_with_video",
                            args_base64: btoa(JSON.stringify({ 
                                account_id: nearAccountId, 
                                limit: 100 
                            }))
                        }
                    })
                });
                
                const data = await response.json();
                
                if (data.error) {
                    console.error("NEAR RPC Error:", data.error);
                    LitActions.setResponse({ response: JSON.stringify({ verified: false, error: data.error.message }) });
                    return;
                }
                
                const resultBytes = data?.result?.result;
                if (!resultBytes || !Array.isArray(resultBytes)) {
                    console.log("No tokens found");
                    LitActions.setResponse({ response: JSON.stringify({ verified: false, reason: "No tokens" }) });
                    return;
                }
                
                const resultString = String.fromCharCode(...resultBytes);
                const tokens = JSON.parse(resultString);
                
                const hasAccess = tokens.some(([token, metadata]) => {
                    if (!metadata) return false;
                    return metadata.encrypted_cid === targetCid || metadata.encrypted_cid === 'ACCESS_PASS';
                });
                
                console.log("NFT Ownership verified:", hasAccess);
                
                if (hasAccess) {
                    // Sign the session to prove verification
                    const toSign = new TextEncoder().encode(\`verified:\${nearAccountId}:\${targetCid}:\${Date.now()}\`);
                    const signature = await LitActions.signEcdsa({ 
                        toSign, 
                        publicKey: pkpPublicKey,
                        sigName: "sig1"
                    });
                    LitActions.setResponse({ response: JSON.stringify({ verified: true, nearAccountId }) });
                } else {
                    LitActions.setResponse({ response: JSON.stringify({ verified: false, reason: "No matching NFT" }) });
                }
                
            } catch (e) {
                console.error("Lit Action Error:", e.toString());
                LitActions.setResponse({ response: JSON.stringify({ verified: false, error: e.toString() }) });
            }
        })();
        `;

        // Import capacity delegation helper
        const { createCapacityDelegationAuthSig, isCapacityDelegationAvailable } = await import('./capacity');

        // Create a dummy ETH address for session (we're not using MPC)
        const dummyEthAddress = "0x" + "1".repeat(40);

        // Create capacity delegation if available
        let capacityDelegationAuthSig = null;
        if (isCapacityDelegationAvailable()) {
            capacityDelegationAuthSig = await createCapacityDelegationAuthSig(
                this.litNodeClient,
                dummyEthAddress,
                10,
                60
            );
        }

        // Use the existing IPFS CID Lit Action for verification
        const litActionIpfsCid = process.env.NEXT_PUBLIC_LIT_ACTION_IPFS_CID ||
            "Qmc6cLer2fmtuzNFhdtBoZvM1gCzX9s8gbc8wzWdizeuJe";

        // Build session params using Lit Action code inline
        const sessionParams: any = {
            litActionCode: litActionCode,
            jsParams: {
                nearAccountId,
                targetCid,
                contractId
            },
            resourceAbilityRequests: [
                {
                    resource: new LitAccessControlConditionResource('*'),
                    ability: LitAbility.AccessControlConditionDecryption
                },
                {
                    resource: new LitActionResource('*'),
                    ability: LitAbility.LitActionExecution
                }
            ],
            expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        };

        if (capacityDelegationAuthSig) {
            sessionParams.capabilityAuthSigs = [capacityDelegationAuthSig];
        }

        try {
            const sessionSigs = await this.litNodeClient.getLitActionSessionSigs(sessionParams);
            console.log("✅ NEAR Verification Session Sigs created!");
            setCachedSessionSigs(cacheKey, sessionSigs);
            return sessionSigs;
        } catch (e: any) {
            console.error("NEAR Verification session failed:", e.message);
            throw e;
        }
    }

    /**
     * Sign an arbitrary message using PKP (signless, no MPC cost!)
     * This enables gas-free Lighthouse auth signing.
     * 
     * @param pkpPublicKey - PKP's public key
     * @param pkpEthAddress - PKP's ETH address
     * @param message - Message to sign
     * @param nearAccountId - NEAR account ID (for caching)
     * @returns Ethereum signature compatible with ethers
     */
    async signWithPKP(
        pkpPublicKey: string,
        pkpEthAddress: string,
        message: string,
        nearAccountId: string
    ): Promise<{ signature: string; address: string }> {
        await this.connect();
        console.log("🔐 Signing with PKP for:", nearAccountId);

        // Get PKP session sigs first
        const sessionSigs = await this.getSessionSigsWithPKP(
            pkpPublicKey,
            pkpEthAddress,
            nearAccountId
        );

        if (!sessionSigs) {
            throw new Error("Failed to get PKP session sigs for signing");
        }

        // Encode message for safe embedding in Lit Action code
        const encodedMessage = Buffer.from(message).toString('base64');

        // Lit Action code to sign with PKP  
        // Note: We embed the message and pkpPublicKey directly since jsParams access can be unreliable
        const signLitActionCode = `
        (async () => {
            try {
                // Decode the base64 message
                const messageBase64 = "${encodedMessage}";
                const messageBytes = Uint8Array.from(atob(messageBase64), c => c.charCodeAt(0));
                const message = new TextDecoder().decode(messageBytes);
                
                // PKP public key from parameter
                const publicKey = "${pkpPublicKey}";
                
                // Hash the message (EIP-191 personal sign format)
                const prefix = "\\x19Ethereum Signed Message:\\n" + message.length;
                const prefixedMessage = prefix + message;
                const encoder = new TextEncoder();
                const msgBytes = encoder.encode(prefixedMessage);
                
                // Use Lit's built-in ethers for hashing
                const messageHash = ethers.utils.keccak256(msgBytes);
                const toSign = ethers.utils.arrayify(messageHash);
                
                const sigShare = await LitActions.signEcdsa({
                    toSign,
                    publicKey,
                    sigName: "pkp_sig"
                });
                
                LitActions.setResponse({ 
                    response: JSON.stringify({ 
                        success: true 
                    }) 
                });
            } catch (e) {
                LitActions.setResponse({ 
                    response: JSON.stringify({ 
                        success: false,
                        error: e.toString()
                    }) 
                });
            }
        })();
        `;

        try {
            // Wrap executeJs with retry logic for transient failures
            const result = await withLitErrorHandling(async () => {
                return await this.litNodeClient.executeJs({
                    sessionSigs,
                    code: signLitActionCode,
                    jsParams: {} // Keep empty, params embedded in code
                });
            }, 3); // 3 retries with exponential backoff

            console.log("PKP signing result:", result);

            // Extract signature from result
            if (result.signatures && result.signatures.pkp_sig) {
                const sig = result.signatures.pkp_sig;
                const signature = ethers.Signature.from({
                    r: "0x" + sig.r,
                    s: "0x" + sig.s,
                    v: sig.recid + 27
                }).serialized;

                console.log("✅ PKP signature created:", signature.substring(0, 20) + "...");
                return { signature, address: pkpEthAddress };
            }

            throw new Error("No signature in PKP result");
        } catch (e: any) {
            // Provide specific error message for timeout
            if (e.message?.includes('timeout') || e.message?.includes('30000ms')) {
                console.error("PKP signing timed out. Lit nodes may be overloaded.");
                throw new Error("PKP signing timed out. Falling back to MPC.");
            }
            console.error("PKP signing failed:", e.message);
            throw e;
        }
    }
}

export const lit = new Lit();
