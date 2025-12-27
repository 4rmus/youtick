import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { AuthMethod } from "@lit-protocol/types";
import { AuthMethodType, LitAbility } from "@lit-protocol/constants";
import { LitPKPResource } from "@lit-protocol/auth-helpers";

import { NEAR_AUTH_LIT_ACTION_CODE } from './near-auth-lit-action';
export const VERIFY_NEAR_LIT_ACTION_CODE = NEAR_AUTH_LIT_ACTION_CODE; // Alias for backward compatibility


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
     * @returns PKP info { tokenId, publicKey, ethAddress }
     */
    async mintPKPDirect(signer: any) {
        try {
            const { LitContracts } = await import('@lit-protocol/contracts-sdk');
            const { LitNetwork } = await import('@lit-protocol/constants');
            const ethers5 = await import('ethers5');

            const rpcUrl = typeof window !== 'undefined'
                ? `${window.location.origin}/api/lit-rpc`
                : (process.env.CHRONICLE_YELLOWSTONE_RPC || 'https://yellowstone-rpc.litprotocol.com');

            console.log("Initializing LitContracts for Datil-Test (Yellowstone)...");
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
            // authMethodType: 2 = LitAction (IPFS CID auth)
            const authMethodType = 2;

            // authMethodId: Use LitContracts utility for proper IPFS CID to bytes conversion
            const authMethodId = litContracts.utils.getBytesFromMultihash(litActionIpfsCid);
            console.log("authMethodId (multihash bytes):", authMethodId);

            const authMethodPubkey = "0x"; // Not needed for Lit Action auth

            console.log("Minting PKP with Lit Action auth method...");

            // Try using pkpHelperContract for auth method registration
            // Scopes: 1 = SignAnything, 2 = PersonalSign, 17 = GrantDecrypt
            const tx = await litContracts.pkpHelperContract.write.mintNextAndAddAuthMethods(
                2, // keyType: ECDSA
                [authMethodType], // permittedAuthMethodTypes
                [authMethodId], // permittedAuthMethodIds (bytes[])
                [authMethodPubkey], // permittedAuthMethodPubkeys
                [[1, 2, 17]], // permittedAuthMethodScopes - SignAnything + PersonalSign + GrantDecrypt
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

            console.log(`Analyzing ${receipt.logs.length} logs for PKP Transfer...`);
            for (const log of receipt.logs) {
                try {
                    const parsed = nftInterface.parseLog(log as any);
                    if (parsed && parsed.name === 'Transfer' && parsed.args.from === ethers5.constants.AddressZero) {
                        tokenId = parsed.args.tokenId.toString();
                        console.log("Found TokenId from logs:", tokenId);
                    }
                } catch (e) { /* ignore other logs */ }
            }

            if (!tokenId) {
                throw new Error("Could not find PKP TokenId in transaction logs");
            }

            // Get the full PKP info from the registry
            console.log("Fetching public key for TokenID:", tokenId);
            publicKey = await litContracts.pubkeyRouterContract.read.getPubkey(tokenId);
            ethAddress = ethers5.utils.computeAddress(publicKey);

            console.log("✅ PKP Minted with Auth Method:", { tokenId, ethAddress, litActionIpfsCid });

            return {
                tokenId,
                publicKey,
                ethAddress,
                txHash: receipt.transactionHash
            };
        } catch (e: any) {
            console.error("Minting with auth method failed:", e);
            throw e;
        }
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
