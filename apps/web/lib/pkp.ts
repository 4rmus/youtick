import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { AuthMethod } from "@lit-protocol/types";
import { AuthMethodType, LitAbility } from "@lit-protocol/constants";
import { LitPKPResource } from "@lit-protocol/auth-helpers";

import { NEAR_AUTH_LIT_ACTION_CODE } from './near-auth-lit-action';
export const VERIFY_NEAR_LIT_ACTION_CODE = NEAR_AUTH_LIT_ACTION_CODE; // Alias for backward compatibility

// Error types for PKP operations
export type PKPErrorCode = 'INSUFFICIENT_FUNDS' | 'CONTRACT_ERROR' | 'NETWORK_ERROR' | 'AUTH_ERROR';

export class PKPMintError extends Error {
    constructor(
        message: string,
        public readonly code: PKPErrorCode,
        public readonly retryable: boolean
    ) {
        super(message);
        this.name = 'PKPMintError';
    }
}

/**
 * Classify an error into a PKPMintError
 */
function classifyPKPError(e: any): PKPMintError {
    const message = e.message || e.toString();

    if (message.includes('insufficient funds') || message.includes('balance')) {
        return new PKPMintError(message, 'INSUFFICIENT_FUNDS', false);
    }
    if (message.includes('network') || message.includes('timeout') || message.includes('fetch') || message.includes('502')) {
        return new PKPMintError(message, 'NETWORK_ERROR', true);
    }
    if (message.includes('auth') || message.includes('signature') || message.includes('permission')) {
        return new PKPMintError(message, 'AUTH_ERROR', false);
    }
    return new PKPMintError(message, 'CONTRACT_ERROR', false);
}

/**
 * Delay helper for retry logic
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class PKPManager {
    private litNodeClient: LitNodeClient;

    constructor(litNodeClient: LitNodeClient) {
        this.litNodeClient = litNodeClient;
    }

    /**
     * Mint a new PKP for the user using their NEAR account + MPC-derived ETH wallet as Auth Method.
     * Uses Lit Relay Server for gas-free minting.
     * 
     * @param nearAccountId - NEAR account ID
     * @param signer - ethers.Signer from MPC (e.g., via signWithMPC converted to signer)
     * @param useMock - If true, returns mock data (for testing without relay key)
     */
    async mintPKPWithNear(
        nearAccountId: string,
        nearPublicKey: string,
        signature: string,
        message: string,
        signer?: any, // Optional ethers.Signer for real minting
        useMock: boolean = true
    ) {
        console.log(`Minting PKP for NEAR Account: ${nearAccountId}`);

        // If no signer or useMock, return mock data
        if (useMock || !signer) {
            console.log("Using mock minting (no relay key or signer provided)");
            await new Promise(resolve => setTimeout(resolve, 2000));
            return {
                tokenId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                publicKey: "0x0430591451f28b3687eec82601962383842d05713437299a4e216db8a2b5368a5c4cc31d87ee96c5685718df2894b5f884a44b937080b0bb183e2da025686008ab",
                ethAddress: "0x7bd19343d242253818e6922261a861611029c7d4",
                nearImplicitAccount: "30591451f28b3687eec82601962383842d05713437299a4e216db8a2b5368a5c"
            };
        }

        // Real minting with EthWalletProvider + LitRelay
        try {
            const { EthWalletProvider, LitRelay } = await import('@lit-protocol/lit-auth-client');
            const { LitNetwork } = await import('@lit-protocol/constants');

            // 1. Create auth method using the MPC-derived signer
            const authMethod = await EthWalletProvider.authenticate({
                signer,
                litNodeClient: this.litNodeClient,
            });

            console.log("Auth method created:", authMethod.authMethodType);

            // 2. Initialize Relay
            const relayApiKey = process.env.NEXT_PUBLIC_LIT_RELAY_API_KEY;
            if (!relayApiKey) {
                throw new Error("NEXT_PUBLIC_LIT_RELAY_API_KEY is not set. Get one from Lit Dashboard.");
            }

            const relay = new LitRelay({
                relayApiKey,
                relayUrl: LitRelay.getRelayUrl(LitNetwork.DatilTest),
            });

            // 3. Mint PKP with auth method via Relay
            console.log("Minting PKP via Relay...");
            const pkpResult = await relay.mintPKPWithAuthMethods([authMethod], {
                addPkpEthAddressAsPermittedAddress: true,
                sendPkpToitself: true,
            });

            console.log("PKP Minted Successfully:", pkpResult);

            return {
                tokenId: pkpResult.pkpTokenId || "",
                publicKey: pkpResult.pkpPublicKey || "",
                ethAddress: pkpResult.pkpEthAddress || "",
                nearImplicitAccount: nearAccountId
            };
        } catch (e) {
            console.error("Real minting failed:", e);
            throw e;
        }
    }

    /**
     * Mint a PKP directly via contracts with Lit Action auth method.
     * Registers an IPFS CID as permitted auth method for signless PKP usage.
     * 
     * @param signer - ethers.Signer with tstLPX balance on Chronicle Yellowstone
     * @param maxRetries - Maximum number of retries for network errors (default: 3)
     * @returns PKP info { tokenId, publicKey, ethAddress }
     */
    async mintPKPDirect(signer: any, maxRetries: number = 3) {
        let lastError: PKPMintError | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const { LitContracts } = await import('@lit-protocol/contracts-sdk');
                const { LitNetwork } = await import('@lit-protocol/constants');
                const ethers5 = await import('ethers5');

                const rpcUrl = typeof window !== 'undefined'
                    ? `${window.location.origin}/api/lit-rpc`
                    : (process.env.CHRONICLE_YELLOWSTONE_RPC || 'https://yellowstone-rpc.litprotocol.com');

                console.log(`[Attempt ${attempt}/${maxRetries}] Initializing LitContracts for Datil-Test (Yellowstone)...`);
                const litContracts = new LitContracts({
                    signer,
                    network: LitNetwork.DatilTest,
                    rpc: rpcUrl,
                    debug: true
                }) as any;

                console.log("Connecting to Lit Contracts...");
                await litContracts.connect();
                console.log("✅ Lit Contracts Connected.");

                // Get mint cost
                const mintCost = await litContracts.pkpNftContract.read.mintCost();
                console.log("Mint cost:", ethers5.utils.formatEther(mintCost), "tstLPX");

                // Lit Action IPFS CID for simple PKP authorization
                const litActionIpfsCid = process.env.NEXT_PUBLIC_LIT_ACTION_IPFS_CID ||
                    "Qmc6cLer2fmtuzNFhdtBoZvM1gCzX9s8gbc8wzWdizeuJe";

                console.log("Using Lit Action IPFS CID:", litActionIpfsCid);

                // Auth method configuration for Lit Action (IPFS CID)
                const authMethodType = 2;
                const authMethodId = litContracts.utils.getBytesFromMultihash(litActionIpfsCid);
                const authMethodPubkey = "0x";

                console.log("Minting PKP with Lit Action auth method...");

                const tx = await litContracts.pkpHelperContract.write.mintNextAndAddAuthMethods(
                    2, // keyType: ECDSA
                    [authMethodType],
                    [authMethodId],
                    [authMethodPubkey],
                    [[1, 2, 17]], // Scopes: SignAnything + PersonalSign + GrantDecrypt
                    true, // addPkpEthAddressAsPermittedAddress
                    true, // sendPkpToItself
                    { value: mintCost }
                );

                console.log("Mint transaction sent:", tx.hash);
                const receipt = await tx.wait();
                console.log("✅ Mint with auth method confirmed! Status:", receipt.status);

                // Parse logs to find PKP info
                let tokenId = "";
                let publicKey = "";
                let ethAddress = "";

                const nftInterface = new ethers5.utils.Interface([
                    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
                ]);

                for (const log of receipt.logs) {
                    try {
                        const parsed = nftInterface.parseLog(log as any);
                        if (parsed?.name === 'Transfer' && parsed.args.from === ethers5.constants.AddressZero) {
                            tokenId = parsed.args.tokenId.toString();
                            break;
                        }
                    } catch (e) { /* ignore */ }
                }

                if (!tokenId) {
                    throw new Error("Could not find PKP TokenId in transaction logs");
                }

                publicKey = await litContracts.pubkeyRouterContract.read.getPubkey(tokenId);
                ethAddress = ethers5.utils.computeAddress(publicKey);

                console.log("✅ PKP Minted with Auth Method:", { tokenId, ethAddress });

                return {
                    tokenId,
                    publicKey,
                    ethAddress,
                    txHash: receipt.transactionHash
                };
            } catch (e: any) {
                lastError = classifyPKPError(e);
                console.error(`[Attempt ${attempt}/${maxRetries}] PKP minting failed:`, lastError.message, `(${lastError.code})`);

                // Only retry if error is retryable and we have attempts left
                if (!lastError.retryable || attempt === maxRetries) {
                    throw lastError;
                }

                // Exponential backoff
                const waitTime = 1000 * Math.pow(2, attempt - 1);
                console.log(`Retrying in ${waitTime}ms...`);
                await delay(waitTime);
            }
        }

        throw lastError || new PKPMintError('Unknown error during PKP minting', 'CONTRACT_ERROR', false);
    }



    /**
     * Get session signatures for the PKP using the NEAR Auth Method.
     */
    async getPKPSessionSigs(pkpPublicKey: string, nearSignCallback: () => Promise<{ sig: string, msg: string, pk: string }>) {
        // This involves:
        // 1. Triggering the Lit Action to verify the NEAR signature
        // 2. Generating Session Sigs for the PKP Resource

        const { sig, msg, pk } = await nearSignCallback();

        return this.litNodeClient.getPkpSessionSigs({
            pkpPublicKey,
            authMethods: [
                {
                    authMethodType: 99999, // Custom Auth Type ID (hypothetical)
                    accessToken: JSON.stringify({ sig, msg, pk }), // Passing data via token field
                }
            ],
            resourceAbilityRequests: [
                {
                    resource: new LitPKPResource('*'),
                    ability: LitAbility.PKPSigning
                }
            ],
            litActionCode: VERIFY_NEAR_LIT_ACTION_CODE,
            jsParams: {
                publicKey: pk,
                sig: sig,
                message: msg
            }
        });
    }
}
